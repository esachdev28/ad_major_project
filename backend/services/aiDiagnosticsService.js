/**
 * services/aiDiagnosticsService.js
 *
 * AI-Assisted Incident Investigation & Evidence Integrity Engine.
 *
 * Capabilities:
 * - Gathers live, sanitized observability evidence (health checks, P50/P95/P99 latencies,
 *   incidents, OpenAPI contract diffs, and dependency blast radius).
 * - Redacts credentials/headers before any context leaves the backend.
 * - Integrates with NVIDIA NIM (OpenAI-compatible API) with configurable endpoint, model, and timeout.
 * - Keeps AI strictly optional: automatically falls back to deterministic evidence synthesis
 *   when no API key is configured or if the external AI provider is unreachable.
 * - Strictly separates Verified Facts from Diagnostic Hypotheses.
 */

const prisma = require('../lib/prisma');
const { compareOpenApiSpecs } = require('./contractDiffService');
const { analyzeImpact } = require('./dependencyService');

/**
 * Computes P50, P95, P99 percentiles from numeric latencies.
 */
function computePercentiles(latencies) {
  if (!latencies || latencies.length === 0) return { p50: 0, p95: 0, p99: 0 };
  const sorted = [...latencies].sort((a, b) => a - b);
  const getP = (p) => sorted[Math.max(0, Math.min(Math.ceil((p / 100) * sorted.length) - 1, sorted.length - 1))];
  return { p50: getP(50), p95: getP(95), p99: getP(99) };
}

/**
 * Redacts potential secrets or sensitive tokens from free-text error strings.
 */
function redactSecrets(text) {
  if (!text || typeof text !== 'string') return text;
  return text
    .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer [REDACTED]')
    .replace(/nvapi-[A-Za-z0-9\-_]+/gi, '[REDACTED_KEY]')
    .replace(/(password|secret|token|apikey|api_key)=[^&\s]+/gi, '$1=[REDACTED]');
}

/**
 * Collects sanitized platform evidence for a given investigation query, endpointId, or incidentId.
 */
async function gatherSanitizedEvidence({ query, endpointId, incidentId }) {
  let targetEndpointId = endpointId || null;
  let targetIncident = null;

  if (incidentId) {
    targetIncident = await prisma.incident.findUnique({
      where: { id: incidentId },
      include: { endpoint: { select: { id: true, name: true } } },
    });
    if (targetIncident && !targetEndpointId) {
      targetEndpointId = targetIncident.endpointId;
    }
  }

  // If no endpointId specified, try matching endpoint name mentioned in query
  if (!targetEndpointId && query) {
    const allEndpoints = await prisma.aPIEndpoint.findMany({
      select: { id: true, name: true },
    });
    const qLower = query.toLowerCase();
    const matched = allEndpoints.find((ep) => {
      const words = ep.name.toLowerCase().split(/\s+/).filter((w) => w.length >= 4);
      return words.some((w) => qLower.includes(w));
    });
    if (matched) targetEndpointId = matched.id;
  }

  const evidence = {
    collectedAt: new Date().toISOString(),
    scope: targetEndpointId ? 'ENDPOINT_FOCUSED' : 'FLEET_WIDE',
    endpoint: null,
    latencyMetrics: null,
    recentChecks: [],
    incidents: [],
    contractComparison: null,
    dependencyImpact: null,
    missingDataNotes: [],
  };

  if (targetEndpointId) {
    const ep = await prisma.aPIEndpoint.findUnique({
      where: { id: targetEndpointId },
      select: {
        id: true,
        name: true,
        url: true,
        method: true,
        expectedStatus: true,
        isActive: true,
        // Explicitly omit `headers` to protect credentials
        healthChecks: {
          orderBy: { checkedAt: 'desc' },
          take: 25,
          select: {
            statusCode: true,
            latency: true,
            isHealthy: true,
            errorMessage: true,
            checkedAt: true,
          },
        },
        incidents: {
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
        versions: {
          orderBy: { createdAt: 'desc' },
          take: 2,
        },
        services: {
          take: 1,
        },
      },
    });

    if (ep) {
      evidence.endpoint = {
        id: ep.id,
        name: ep.name,
        url: ep.url,
        method: ep.method,
        expectedStatus: ep.expectedStatus,
        isActive: ep.isActive,
      };

      const checks = ep.healthChecks || [];
      const healthyCount = checks.filter((c) => c.isHealthy).length;
      const latencies = checks.map((c) => c.latency).filter((l) => typeof l === 'number');
      evidence.latencyMetrics = {
        sampleCount: checks.length,
        uptimePercent: checks.length > 0 ? Number(((healthyCount / checks.length) * 100).toFixed(2)) : 100,
        percentiles: computePercentiles(latencies),
      };

      evidence.recentChecks = checks.slice(0, 8).map((c) => ({
        statusCode: c.statusCode,
        latencyMs: c.latency,
        isHealthy: c.isHealthy,
        errorMessage: redactSecrets(c.errorMessage),
        checkedAt: c.checkedAt,
      }));

      evidence.incidents = (ep.incidents || []).map((inc) => ({
        id: inc.id,
        title: inc.title,
        status: inc.status,
        severity: inc.severity,
        occurrenceCount: inc.occurrenceCount,
        description: redactSecrets(inc.description),
        createdAt: inc.createdAt,
        resolvedAt: inc.resolvedAt,
      }));

      if (ep.versions && ep.versions.length >= 2) {
        try {
          const diff = compareOpenApiSpecs(ep.versions[1].specification, ep.versions[0].specification);
          evidence.contractComparison = {
            baselineVersion: diff.baselineVersion,
            targetVersion: diff.targetVersion,
            isCompatible: diff.isCompatible,
            breakingCount: diff.breakingCount,
            changes: diff.changes.slice(0, 10).map((c) => ({
              classification: c.classification,
              method: c.method,
              path: c.path,
              title: c.title,
            })),
          };
        } catch (diffErr) {
          evidence.missingDataNotes.push(`Contract diff skipped: ${diffErr.message}`);
        }
      } else {
        evidence.missingDataNotes.push('Fewer than 2 OpenAPI contract versions exist for this endpoint.');
      }

      if (ep.services && ep.services.length > 0) {
        try {
          const impact = await analyzeImpact({
            serviceId: ep.services[0].id,
            baselineVersionId: ep.versions?.[1]?.id,
            targetVersionId: ep.versions?.[0]?.id,
          });
          evidence.dependencyImpact = {
            serviceName: impact.targetService.name,
            criticality: impact.targetService.criticality,
            riskScore: impact.riskScore,
            riskLevel: impact.riskLevel,
            directConsumers: impact.blastRadius.directConsumers.map((c) => `${c.name} (${c.criticality})`),
            transitiveConsumers: impact.blastRadius.transitiveConsumers.map((c) => `${c.name} (Depth ${c.depth})`),
          };
        } catch (impErr) {
          evidence.missingDataNotes.push(`Dependency impact unavailable: ${impErr.message}`);
        }
      } else {
        evidence.missingDataNotes.push('No Service dependency node is linked to this endpoint.');
      }
    }
  } else {
    // Fleet-wide evidence summary
    const [endpoints, openIncidents] = await Promise.all([
      prisma.aPIEndpoint.findMany({
        take: 15,
        select: {
          id: true,
          name: true,
          method: true,
          healthChecks: { orderBy: { checkedAt: 'desc' }, take: 1, select: { isHealthy: true, statusCode: true, latency: true } },
        },
      }),
      prisma.incident.findMany({
        where: { status: { in: ['OPEN', 'ACKNOWLEDGED'] } },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: { endpoint: { select: { name: true } } },
      }),
    ]);

    evidence.fleetSummary = endpoints.map((e) => ({
      name: e.name,
      method: e.method,
      latestCheck: e.healthChecks[0] || null,
    }));

    evidence.incidents = openIncidents.map((inc) => ({
      id: inc.id,
      endpointName: inc.endpoint?.name,
      title: inc.title,
      status: inc.status,
      severity: inc.severity,
      occurrenceCount: inc.occurrenceCount,
    }));
  }

  return { targetEndpointId, evidence };
}

/**
 * Deterministic fallback analyzer when AI provider is unconfigured or unavailable.
 */
function synthesizeDeterministicDiagnostics(query, evidence) {
  const verifiedFacts = [];
  const hypotheses = [];
  const recommendations = [];

  if (evidence.endpoint) {
    verifiedFacts.push(
      `Inspected endpoint "${evidence.endpoint.name}" (${evidence.endpoint.method} ${evidence.endpoint.url}), expected HTTP ${evidence.endpoint.expectedStatus}.`
    );
  }

  if (evidence.latencyMetrics) {
    verifiedFacts.push(
      `Last ${evidence.latencyMetrics.sampleCount} probe(s): Uptime ${evidence.latencyMetrics.uptimePercent}%, P50 latency ${evidence.latencyMetrics.percentiles.p50}ms, P95 latency ${evidence.latencyMetrics.percentiles.p95}ms.`
    );
  }

  const failingChecks = (evidence.recentChecks || []).filter((c) => !c.isHealthy);
  if (failingChecks.length > 0) {
    const latestFail = failingChecks[0];
    verifiedFacts.push(
      `Observed ${failingChecks.length} recent failed probe(s). Latest failure: HTTP ${latestFail.statusCode || 'ERR'} (${latestFail.errorMessage || 'Network error'}).`
    );
    hypotheses.push(
      latestFail.statusCode >= 500
        ? `Upstream service "${evidence.endpoint?.name || 'target'}" may be experiencing server-side errors or downstream dependency saturation (HTTP ${latestFail.statusCode}).`
        : 'Failures may be caused by transient DNS/network issues, timeout constraints, or misconfigured expected status codes.'
    );
    recommendations.push('Inspect upstream application server logs and verify database/dependency connectivity before restarting services.');
  } else if (evidence.recentChecks.length > 0) {
    verifiedFacts.push('All recent probe checks succeeded within configured expectations.');
  }

  if (evidence.incidents.length > 0) {
    const active = evidence.incidents.filter((i) => i.status !== 'RESOLVED');
    if (active.length > 0) {
      verifiedFacts.push(
        `${active.length} active incident(s) recorded: "${active[0].title}" (Severity: ${active[0].severity}, Occurrences: ${active[0].occurrenceCount}).`
      );
    }
  } else {
    verifiedFacts.push('No active operational incidents found for the inspected scope.');
  }

  if (evidence.contractComparison) {
    verifiedFacts.push(
      `OpenAPI comparison (v${evidence.contractComparison.baselineVersion} -> v${evidence.contractComparison.targetVersion}) found ${evidence.contractComparison.breakingCount} breaking change(s).`
    );
    if (evidence.contractComparison.breakingCount > 0) {
      hypotheses.push('Recent OpenAPI breaking schema changes may cause integration failures for unmigrated consumers.');
      recommendations.push('Coordinate schema migration with affected consumers or restore backward-compatible fields.');
    }
  }

  if (evidence.dependencyImpact) {
    const imp = evidence.dependencyImpact;
    verifiedFacts.push(
      `Dependency Risk Score: ${imp.riskScore}/100 (${imp.riskLevel}). Direct consumers: [${imp.directConsumers.join(', ') || 'None'}]. Transitive consumers: [${imp.transitiveConsumers.join(', ') || 'None'}].`
    );
    if (imp.directConsumers.length > 0) {
      recommendations.push(`Notify owners of ${imp.directConsumers.join(', ')} regarding potential service impact (human approval required for traffic shifts).`);
    }
  }

  if (evidence.missingDataNotes.length > 0) {
    verifiedFacts.push(`Missing telemetry notes: ${evidence.missingDataNotes.join(' ')}`);
  }

  if (hypotheses.length === 0) {
    hypotheses.push('No active anomalies detected in the collected evidence window.');
  }
  if (recommendations.length === 0) {
    recommendations.push('Continue passive automated monitoring via the Docker worker.');
  }

  return {
    provider: 'deterministic-fallback',
    model: 'rule-engine-v1',
    summary: `Evidence-grounded diagnostic report for "${query}". Analyzed ${evidence.recentChecks.length} probe checks and ${evidence.incidents.length} incident(s).`,
    verifiedFacts,
    hypotheses,
    recommendations,
  };
}

/**
 * Calls NVIDIA NIM OpenAI-compatible Chat Completions endpoint when configured.
 */
async function callNvidiaProvider(query, evidence) {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey || apiKey === 'your-nvidia-api-key-here') {
    return null;
  }

  const baseUrl = (process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1').replace(/\/$/, '');
  const model = process.env.NVIDIA_MODEL || 'nvidia/nemotron-3.5-lightning-30b-a3b';
  const timeoutMs = parseInt(process.env.AI_TIMEOUT_MS, 10) || 15000;

  const systemPrompt = `You are API Sentinel's senior SRE diagnostic engine.
Analyze ONLY the sanitized JSON evidence provided below and answer the developer's query.
STRICT EVIDENCE INTEGRITY RULES:
1. "verifiedFacts": ONLY include facts explicitly present in the provided JSON (exact status codes, latencies, counts, consumers, contract changes). NEVER invent numbers or incidents.
2. "hypotheses": Clearly state plausible root-cause theories and mark uncertainties honestly. If evidence is missing, note it.
3. "recommendations": Suggest safe, actionable engineering steps (any destructive/remediation step must note human approval required).
4. Respond ONLY with valid raw JSON matching this schema:
{
  "summary": "concise 2-sentence executive summary",
  "verifiedFacts": ["fact 1", "fact 2"],
  "hypotheses": ["hypothesis 1", "hypothesis 2"],
  "recommendations": ["recommendation 1", "recommendation 2"]
}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: 2048,
        chat_template_kwargs: { enable_thinking: false },
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: `Developer Query: "${query}"\n\nSanitized Evidence Context:\n${JSON.stringify(evidence, null, 2)}`,
          },
        ],
      }),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!response.ok) {
      console.warn(`[AI Diagnostics] NVIDIA NIM returned HTTP ${response.status}; using deterministic fallback.`);
      return null;
    }

    const payload = await response.json();
    const rawContent = payload.choices?.[0]?.message?.content || '';

    // Extract JSON block cleanly even if wrapped in ```json fences
    const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn('[AI Diagnostics] Could not extract JSON from AI response; using fallback.');
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed.verifiedFacts) || !Array.isArray(parsed.hypotheses)) {
      return null;
    }

    return {
      provider: 'nvidia-nim',
      model,
      summary: String(parsed.summary || 'AI investigation completed.'),
      verifiedFacts: parsed.verifiedFacts.map(String),
      hypotheses: parsed.hypotheses.map(String),
      recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations.map(String) : [],
    };
  } catch (err) {
    clearTimeout(timer);
    console.warn(`[AI Diagnostics] Provider call error (${err.name}): using deterministic fallback.`);
    return null;
  }
}

/**
 * Main Diagnostic Investigation Orchestrator.
 */
async function runDiagnosticInvestigation({ query, endpointId, incidentId, forceFallback = false }) {
  if (!query || typeof query !== 'string' || !query.trim()) {
    throw new Error('An investigation query is required.');
  }

  const cleanQuery = query.trim();
  const { targetEndpointId, evidence } = await gatherSanitizedEvidence({
    query: cleanQuery,
    endpointId,
    incidentId,
  });

  let synthesis = null;
  if (!forceFallback) {
    synthesis = await callNvidiaProvider(cleanQuery, evidence);
  }
  if (!synthesis) {
    synthesis = synthesizeDeterministicDiagnostics(cleanQuery, evidence);
  }

  const saved = await prisma.diagnosticReport.create({
    data: {
      endpointId: targetEndpointId,
      incidentId: incidentId || null,
      query: cleanQuery,
      provider: synthesis.provider,
      model: synthesis.model,
      summary: synthesis.summary,
      verifiedFacts: JSON.stringify(synthesis.verifiedFacts),
      hypotheses: JSON.stringify(synthesis.hypotheses),
      recommendations: JSON.stringify(synthesis.recommendations),
      evidenceContext: JSON.stringify(evidence),
    },
    include: {
      endpoint: { select: { id: true, name: true, url: true } },
    },
  });

  return {
    id: saved.id,
    query: saved.query,
    provider: saved.provider,
    model: saved.model,
    summary: saved.summary,
    verifiedFacts: synthesis.verifiedFacts,
    hypotheses: synthesis.hypotheses,
    recommendations: synthesis.recommendations,
    evidenceContext: evidence,
    endpoint: saved.endpoint,
    createdAt: saved.createdAt,
  };
}

module.exports = {
  runDiagnosticInvestigation,
  gatherSanitizedEvidence,
  redactSecrets,
};
