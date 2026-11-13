import React, { useState, useEffect, useCallback } from 'react';
import Header from '../components/Header';
import {
  getDiagnosticsStatus,
  getDiagnosticsHistory,
  runDiagnosticInvestigation,
  getEndpoints,
  getIncidents,
  getMcpTools,
  checkHealth,
} from '../services/api';

export default function Diagnostics() {
  const [aiStatus, setAiStatus] = useState(null);
  const [mcpTools, setMcpTools] = useState([]);
  const [endpoints, setEndpoints] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [history, setHistory] = useState([]);
  const [activeReport, setActiveReport] = useState(null);

  const [query, setQuery] = useState(
    'Why is the Payment Processing Gateway failing, and which integrations could be affected?'
  );
  const [selectedEndpointId, setSelectedEndpointId] = useState('');
  const [selectedIncidentId, setSelectedIncidentId] = useState('');

  const [isLoading, setIsLoading] = useState(true);
  const [isInvestigating, setIsInvestigating] = useState(false);
  const [backendStatus, setBackendStatus] = useState('checking');
  const [error, setError] = useState(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [healthRes, statusRes, histRes, epRes, incRes, mcpRes] = await Promise.allSettled([
        checkHealth(),
        getDiagnosticsStatus(),
        getDiagnosticsHistory(),
        getEndpoints(),
        getIncidents({ status: 'OPEN' }),
        getMcpTools(),
      ]);

      setBackendStatus(
        healthRes.status === 'fulfilled' && healthRes.value.success ? 'online' : 'offline'
      );

      if (statusRes.status === 'fulfilled' && statusRes.value.success) {
        setAiStatus(statusRes.value.data);
      }
      if (histRes.status === 'fulfilled' && histRes.value.success) {
        const list = histRes.value.data || [];
        setHistory(list);
        if (list.length > 0 && !activeReport) {
          setActiveReport(list[0]);
        }
      }
      if (epRes.status === 'fulfilled' && epRes.value.success) {
        setEndpoints(epRes.value.data || []);
      }
      if (incRes.status === 'fulfilled' && incRes.value.success) {
        setIncidents(incRes.value.data || []);
      }
      if (mcpRes.status === 'fulfilled' && mcpRes.value.success) {
        setMcpTools(mcpRes.value.data || []);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [activeReport]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRunInvestigation = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;
    setIsInvestigating(true);
    setError(null);
    try {
      const res = await runDiagnosticInvestigation({
        query: query.trim(),
        endpointId: selectedEndpointId || undefined,
        incidentId: selectedIncidentId || undefined,
      });
      if (res.success) {
        setActiveReport(res.data);
        setHistory((prev) => [res.data, ...prev]);
      }
    } catch (err) {
      setError(err.message || 'Investigation failed.');
    } finally {
      setIsInvestigating(false);
    }
  };

  return (
    <div className="main-wrapper">
      <Header
        backendStatus={backendStatus}
        onRefresh={loadData}
        isRefreshing={isLoading}
        title="AI Diagnostics & MCP"
        subtitle="Evidence-grounded incident investigation powered by NVIDIA NIM and read-only MCP tools."
      />

      <div className="dashboard-content">
        {/* Provider & MCP Capabilities Banner */}
        <div
          className="demo-banner"
          style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}
        >
          <div className="demo-banner-content">
            <span
              className="demo-tag"
              style={{ backgroundColor: aiStatus?.aiConfigured ? '#10b981' : '#f59e0b' }}
            >
              {aiStatus?.aiConfigured ? 'NVIDIA NIM CONNECTED' : 'DETERMINISTIC FALLBACK'}
            </span>
            <p>
              Model: <strong>{aiStatus?.model || 'Loading...'}</strong> · Strict Evidence Integrity Mode
            </p>
          </div>
          <span
            style={{
              padding: '0.25rem 0.65rem',
              borderRadius: '9999px',
              fontSize: '0.75rem',
              fontWeight: 600,
              backgroundColor: 'rgba(59, 130, 246, 0.15)',
              color: '#60a5fa',
              border: '1px solid #3b82f6',
            }}
          >
            🔌 MCP Server: {mcpTools.length} Read-Only Tools
          </span>
        </div>

        {error && (
          <div className="backend-alert" style={{ marginBottom: '1rem' }}>
            <span>⚠️</span>
            <div>
              <h4>Investigation Error</h4>
              <p>{error}</p>
            </div>
          </div>
        )}

        {/* Investigation Query Form */}
        <div className="panel-card" style={{ marginBottom: '1.5rem' }}>
          <div className="panel-header">
            <h3 className="panel-title">
              <span>🧠</span> Run Incident Investigation
            </h3>
          </div>

          <form onSubmit={handleRunInvestigation}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.35rem' }}>
                  Target Endpoint (Optional — auto-detected from query)
                </label>
                <select
                  value={selectedEndpointId}
                  onChange={(e) => setSelectedEndpointId(e.target.value)}
                  style={{
                    width: '100%',
                    backgroundColor: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    padding: '0.55rem',
                    color: '#f8fafc',
                  }}
                >
                  <option value="">Auto-detect or Fleet-wide Scope</option>
                  {endpoints.map((ep) => (
                    <option key={ep.id} value={ep.id}>
                      {ep.name} ({ep.method})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.35rem' }}>
                  Link Active Incident (Optional)
                </label>
                <select
                  value={selectedIncidentId}
                  onChange={(e) => setSelectedIncidentId(e.target.value)}
                  style={{
                    width: '100%',
                    backgroundColor: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    padding: '0.55rem',
                    color: '#f8fafc',
                  }}
                >
                  <option value="">None</option>
                  {incidents.map((inc) => (
                    <option key={inc.id} value={inc.id}>
                      [{inc.severity}] {inc.title}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ marginBottom: '0.75rem' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.35rem' }}>
                Diagnostic Question
              </label>
              <textarea
                rows="2"
                required
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Ask about endpoint failures, latency spikes, contract regressions, or downstream blast radius..."
                style={{
                  width: '100%',
                  backgroundColor: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  padding: '0.75rem',
                  color: '#f8fafc',
                  fontSize: '0.9rem',
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() =>
                    setQuery('Why is the Payment Processing Gateway failing, and which integrations could be affected?')
                  }
                  className="endpoint-secondary"
                  style={{ fontSize: '0.75rem', padding: '0.35rem 0.65rem' }}
                >
                  Preset: Payment Outage
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setQuery('Summarize overall API fleet health, active incidents, and latency risks.')
                  }
                  className="endpoint-secondary"
                  style={{ fontSize: '0.75rem', padding: '0.35rem 0.65rem' }}
                >
                  Preset: Fleet Health Brief
                </button>
              </div>

              <button
                type="submit"
                disabled={isInvestigating}
                className="endpoint-primary"
                style={{ padding: '0.6rem 1.35rem', fontWeight: 600 }}
              >
                {isInvestigating ? 'Analyzing Telemetry & Running AI...' : '🧠 Investigate with Evidence'}
              </button>
            </div>
          </form>
        </div>

        {/* Main Split: Active Diagnostic Report + Investigation History */}
        <div style={{ display: 'grid', gridTemplateColumns: history.length > 0 ? '1.6fr 0.8fr' : '1fr', gap: '1.5rem' }}>
          {/* Active Report */}
          <div className="panel-card">
            <div className="panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 className="panel-title">
                <span>📋</span> Diagnostic Report
              </h3>
              {activeReport && (
                <span style={{ fontSize: '0.75rem', color: '#38bdf8', fontFamily: 'monospace' }}>
                  {activeReport.provider} · {activeReport.model}
                </span>
              )}
            </div>

            {!activeReport ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>
                Submit a diagnostic query above to generate an evidence-grounded report.
              </div>
            ) : (
              <div>
                <div style={{ backgroundColor: '#1e293b', padding: '1rem', borderRadius: '8px', marginBottom: '1.25rem' }}>
                  <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.25rem' }}>
                    QUERY: &quot;{activeReport.query}&quot;
                  </div>
                  <div style={{ color: '#f8fafc', fontSize: '0.92rem', lineHeight: 1.5 }}>
                    {activeReport.summary}
                  </div>
                </div>

                {/* Verified Facts vs Hypotheses (Evidence Integrity) */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem' }}>
                  <div
                    style={{
                      backgroundColor: 'rgba(16, 185, 129, 0.08)',
                      border: '1px solid rgba(16, 185, 129, 0.35)',
                      borderRadius: '8px',
                      padding: '1rem',
                    }}
                  >
                    <h4 style={{ margin: '0 0 0.65rem', color: '#34d399', fontSize: '0.88rem' }}>
                      ✅ Verified Facts (Platform Evidence)
                    </h4>
                    <ul style={{ margin: 0, paddingLeft: '1.15rem', color: '#cbd5e1', fontSize: '0.82rem', display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                      {activeReport.verifiedFacts.map((fact, idx) => (
                        <li key={idx}>{fact}</li>
                      ))}
                    </ul>
                  </div>

                  <div
                    style={{
                      backgroundColor: 'rgba(245, 158, 11, 0.08)',
                      border: '1px solid rgba(245, 158, 11, 0.35)',
                      borderRadius: '8px',
                      padding: '1rem',
                    }}
                  >
                    <h4 style={{ margin: '0 0 0.65rem', color: '#fbbf24', fontSize: '0.88rem' }}>
                      🔍 Diagnostic Hypotheses (Inferred)
                    </h4>
                    <ul style={{ margin: 0, paddingLeft: '1.15rem', color: '#cbd5e1', fontSize: '0.82rem', display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                      {activeReport.hypotheses.map((hyp, idx) => (
                        <li key={idx}>{hyp}</li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Recommended Actions */}
                <div
                  style={{
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    border: '1px solid rgba(59, 130, 246, 0.35)',
                    borderRadius: '8px',
                    padding: '1rem',
                    marginBottom: '1rem',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <h4 style={{ margin: 0, color: '#93c5fd', fontSize: '0.88rem' }}>
                      💡 Recommended Next Steps
                    </h4>
                    <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                      Human approval required for consequential actions
                    </span>
                  </div>
                  <ul style={{ margin: 0, paddingLeft: '1.15rem', color: '#cbd5e1', fontSize: '0.82rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    {activeReport.recommendations.map((rec, idx) => (
                      <li key={idx}>{rec}</li>
                    ))}
                  </ul>
                </div>

                {/* Sanitized Evidence Audit Snapshot */}
                <details style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
                  <summary style={{ cursor: 'pointer', color: '#60a5fa', fontWeight: 500 }}>
                    Inspect Sanitized Evidence Context (Secrets Redacted)
                  </summary>
                  <pre
                    style={{
                      backgroundColor: '#020617',
                      border: '1px solid #334155',
                      borderRadius: '6px',
                      padding: '0.75rem',
                      marginTop: '0.5rem',
                      maxHeight: '220px',
                      overflowY: 'auto',
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {JSON.stringify(activeReport.evidenceContext, null, 2)}
                  </pre>
                </details>
              </div>
            )}
          </div>

          {/* Past Investigation History */}
          {history.length > 0 && (
            <div className="panel-card">
              <div className="panel-header">
                <h3 className="panel-title">
                  <span>🕒</span> History ({history.length})
                </h3>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                {history.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => setActiveReport(item)}
                    style={{
                      padding: '0.7rem',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      backgroundColor: activeReport?.id === item.id ? '#1d4ed833' : '#1e293b',
                      border: activeReport?.id === item.id ? '1px solid #3b82f6' : '1px solid #334155',
                    }}
                  >
                    <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#f8fafc', marginBottom: '0.2rem' }}>
                      {item.query.length > 75 ? `${item.query.slice(0, 72)}...` : item.query}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: '#94a3b8' }}>
                      <span>{item.provider}</span>
                      <span>{new Date(item.createdAt).toLocaleTimeString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

