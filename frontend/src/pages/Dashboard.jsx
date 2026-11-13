/**
 * Dashboard.jsx — API Sentinel Central Observability & Diagnostics Dashboard
 * 
 * 1. Why this file exists:
 *    The central UI controller for API Sentinel. It orchestrates real-time telemetry,
 *    live HTTP failure probing, incident tracking, contract breaking-change analysis,
 *    and Model Context Protocol (MCP) diagnostic tools within a unified single-origin UI.
 * 
 * 2. What its responsibilities are:
 *    - Monitor and display server, database, and fleet telemetry (total APIs, uptime %, latency).
 *    - Execute on-demand active HTTP health probes against registered endpoints.
 *    - Display and resolve operational incidents in real-time.
 *    - Provide an interactive Breaking-Change Diff analyzer between OpenAPI specifications.
 *    - Provide an MCP Diagnostic Tool runner for AI-assisted troubleshooting.
 * 
 * 3. Which functions/components it contains:
 *    - `Dashboard()` : Main React page component.
 *    - `loadDashboardData()` : Concurrently loads health, stats, endpoints, and incidents.
 *    - `handleProbe(endpointId)` : Triggers active failure detection probe and updates UI.
 *    - `handleResolveIncident(id)` : Marks an incident as RESOLVED in PostgreSQL.
 *    - `handleRunContractDiff()` : Compares sample v1 vs v2 contracts to demonstrate breaking changes.
 *    - `handleRunMcpDiagnostic(toolName)` : Executes structured MCP diagnostic tools.
 * 
 * 4. How it communicates with other files:
 *    - Consumes unified API functions from `../services/api.js`.
 *    - Renders `Header`, `StatCard`, and pure CSS components.
 * 
 * 5. Why this chosen approach is appropriate:
 *    - Uses only standard React hooks (`useState`, `useEffect`, `useCallback`) without external state managers.
 *    - Completely resilient: graceful fallbacks ensure the UI never crashes if backend/database is offline.
 * 
 * 6. Telemetry & Diagnostic Flow:
 *    React UI -> api.js -> Express Routes (endpoints/incidents/versions/mcp) -> Prisma Client
 *    -> PostgreSQL -> Express Response -> React State Update.
 */

import React, { useState, useEffect, useCallback } from 'react';
import Header from '../components/Header';
import StatCard from '../components/StatCard';
import {
  checkHealth,
  checkDbHealth,
  getDashboardStats,
  getEndpoints,
  createEndpoint,
  probeEndpoint,
  getIncidents,
  updateIncidentStatus,
  diffSpecifications,
  callMcpTool
} from '../services/api';

export default function Dashboard() {
  // State: API statistics received from Express backend
  const [stats, setStats] = useState(null);

  // State: registered endpoints and incidents from PostgreSQL
  const [endpoints, setEndpoints] = useState([]);
  const [incidents, setIncidents] = useState([]);

  // State: connection indicators ('checking' | 'online' | 'offline')
  const [backendStatus, setBackendStatus] = useState('checking');
  const [dbStatus, setDbStatus] = useState('checking');
  const [dataSource, setDataSource] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // State: active row operation spinners
  const [probingId, setProbingId] = useState(null);
  const [actionNotice, setActionNotice] = useState(null);

  // State: active diagnostic panel ('overview' | 'diff' | 'mcp')
  const [activeTab, setActiveTab] = useState('overview');
  const [diffReport, setDiffReport] = useState(null);
  const [mcpReport, setMcpReport] = useState(null);
  const [isDiagnosticRunning, setIsDiagnosticRunning] = useState(false);

  /**
   * Concurrently loads server health, database health, dashboard stats,
   * live registered endpoints, and incident logs.
   */
  const loadDashboardData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setBackendStatus('checking');
    setDbStatus('checking');

    try {
      const [healthResult, dbResult, statsResult, endpointsResult, incidentsResult] =
        await Promise.allSettled([
          checkHealth(),
          checkDbHealth(),
          getDashboardStats(),
          getEndpoints(),
          getIncidents()
        ]);

      // 1. Process server health
      if (healthResult.status === 'fulfilled' && healthResult.value.success) {
        setBackendStatus('online');
      } else {
        setBackendStatus('offline');
        const reason = healthResult.reason?.message || 'Express server did not respond.';
        setError(reason);
      }

      // 2. Process database health
      if (dbResult.status === 'fulfilled' && dbResult.value.success) {
        setDbStatus('online');
      } else {
        setDbStatus('offline');
      }

      // 3. Process statistics
      if (statsResult.status === 'fulfilled' && statsResult.value.success) {
        setStats(statsResult.value.data);
        setDataSource(statsResult.value.dataSource || 'database');
      } else {
        setStats(null);
        if (healthResult.status === 'fulfilled') {
          const reason =
            statsResult.reason?.message ||
            dbResult.reason?.message ||
            'PostgreSQL database is currently unreachable.';
          setError(reason);
        }
      }

      // 4. Process live endpoints from database
      if (endpointsResult.status === 'fulfilled' && endpointsResult.value.success) {
        setEndpoints(endpointsResult.value.data || []);
      }

      // 5. Process live incidents from database
      if (incidentsResult.status === 'fulfilled' && incidentsResult.value.success) {
        setIncidents(incidentsResult.value.data || []);
      }
    } catch (err) {
      setBackendStatus('offline');
      setDbStatus('offline');
      setError(err.message || 'An unexpected error occurred while connecting to the backend.');
      setStats(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  /**
   * Executes active HTTP failure detection probe against an endpoint.
   */
  const handleProbe = async (id, name) => {
    setProbingId(id);
    setActionNotice(null);
    try {
      const res = await probeEndpoint(id);
      if (res.success) {
        setActionNotice({
          type: res.data.isHealthy ? 'success' : 'error',
          text: `Probe for '${name}': ${res.data.isHealthy ? 'HEALTHY' : 'FAILED'} (${res.data.statusCode || 'Timeout'}) in ${res.data.latency}`
        });
        // Refresh metrics and incident list
        loadDashboardData();
      }
    } catch (err) {
      setActionNotice({
        type: 'error',
        text: `Probe error for '${name}': ${err.message}`
      });
    } finally {
      setProbingId(null);
    }
  };

  /**
   * Seeds an initial demo endpoint in the database for instant testing.
   */
  const handleSeedDemoEndpoint = async () => {
    try {
      setIsLoading(true);
      await createEndpoint({
        name: 'User Service API',
        url: 'https://jsonplaceholder.typicode.com/users',
        method: 'GET',
        description: 'Core microservice managing user identities and profiles'
      });
      await createEndpoint({
        name: 'Payment Gateway (Simulated Failure)',
        url: 'https://httpstat.us/504',
        method: 'POST',
        description: 'External payment processing gateway'
      });
      loadDashboardData();
      setActionNotice({
        type: 'success',
        text: 'Registered demo endpoints into PostgreSQL successfully!'
      });
    } catch (err) {
      setActionNotice({
        type: 'error',
        text: `Failed to register demo endpoints: ${err.message}`
      });
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Resolves an open operational incident.
   */
  const handleResolveIncident = async (id) => {
    try {
      await updateIncidentStatus(id, 'RESOLVED');
      loadDashboardData();
      setActionNotice({
        type: 'success',
        text: 'Incident marked as RESOLVED in PostgreSQL.'
      });
    } catch (err) {
      setActionNotice({
        type: 'error',
        text: `Failed to resolve incident: ${err.message}`
      });
    }
  };

  /**
   * Demonstrates the Breaking-Change Analysis Engine between two OpenAPI contract versions.
   */
  const handleRunContractDiff = async () => {
    setIsDiagnosticRunning(true);
    setDiffReport(null);

    // Sample v1: Initial stable specification
    const v1Spec = {
      openapi: '3.0.0',
      info: { title: 'Order API', version: '1.0.0' },
      paths: {
        '/api/v1/orders': {
          get: {
            parameters: [
              { name: 'customerId', in: 'query', required: true, schema: { type: 'string' } }
            ],
            responses: {
              '200': {
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        orderId: { type: 'string' },
                        amount: { type: 'number' },
                        status: { type: 'string' }
                      }
                    }
                  }
                }
              }
            }
          },
          delete: {
            parameters: [{ name: 'orderId', in: 'path', required: true }]
          }
        }
      }
    };

    // Sample v2: Evolution containing 3 breaking changes:
    // 1. DELETE operation removed
    // 2. amount changed from number to string (incompatible type)
    // 3. Newly required query parameter 'merchantToken'
    const v2Spec = {
      openapi: '3.0.0',
      info: { title: 'Order API', version: '2.0.0' },
      paths: {
        '/api/v1/orders': {
          get: {
            parameters: [
              { name: 'customerId', in: 'query', required: true, schema: { type: 'string' } },
              { name: 'merchantToken', in: 'query', required: true, schema: { type: 'string' } }
            ],
            responses: {
              '200': {
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        orderId: { type: 'string' },
                        amount: { type: 'string' }, // Incompatible type modification
                        status: { type: 'string' }
                      }
                    }
                  }
                }
              }
            }
          }
          // DELETE /api/v1/orders removed
        }
      }
    };

    try {
      const res = await diffSpecifications({ oldSpec: v1Spec, newSpec: v2Spec });
      setDiffReport(res.data);
    } catch (err) {
      setDiffReport({ error: err.message });
    } finally {
      setIsDiagnosticRunning(false);
    }
  };

  /**
   * Demonstrates the MCP Diagnostic Server invoking AI-assisted tools.
   */
  const handleRunMcpDiagnostic = async (toolName) => {
    setIsDiagnosticRunning(true);
    setMcpReport(null);

    try {
      let args = {};
      if (toolName === 'inspect_incidents') {
        args = { status: 'ALL' };
      } else if (toolName === 'investigate_impact' || toolName === 'get_endpoint_health') {
        const targetEp = endpoints[0];
        if (targetEp) {
          args = { endpointId: targetEp.id };
        } else {
          throw new Error('Please register or seed an endpoint first to run this diagnostic.');
        }
      }

      const res = await callMcpTool(toolName, args);
      setMcpReport(res.data);
    } catch (err) {
      setMcpReport({ error: err.message });
    } finally {
      setIsDiagnosticRunning(false);
    }
  };

  // Total checked calculation for accurate uptime %
  const totalChecked = (stats?.healthyApis || 0) + (stats?.failedApis || 0);

  // Fallback sample items for initial zero-database preview
  const displayEndpoints = endpoints.length > 0 ? endpoints : [
    { id: 'mock-1', method: 'GET', url: 'https://api.sentinel.dev/v1/users', name: 'User Service', isMock: true, healthChecks: [{ isHealthy: true, latency: 42 }] },
    { id: 'mock-2', method: 'POST', url: 'https://api.sentinel.dev/v1/auth', name: 'Auth Gateway', isMock: true, healthChecks: [{ isHealthy: true, latency: 118 }] },
    { id: 'mock-3', method: 'GET', url: 'https://api.sentinel.dev/v1/orders', name: 'Order Service', isMock: true, healthChecks: [{ isHealthy: true, latency: 85 }] },
    { id: 'mock-4', method: 'POST', url: 'https://api.sentinel.dev/v1/payments', name: 'Payment Core', isMock: true, healthChecks: [{ isHealthy: false, latency: 1420 }] }
  ];

  const displayIncidents = incidents.length > 0 ? incidents : [
    { id: 'inc-1', title: 'HTTP 504 Gateway Timeout', status: 'OPEN', createdAt: new Date().toISOString(), endpoint: { name: 'Payment Core' }, isMock: true },
    { id: 'inc-2', title: 'Latency anomaly detected (>1200ms)', status: 'RESOLVED', createdAt: new Date(Date.now() - 3600000).toISOString(), endpoint: { name: 'Warehouse API' }, isMock: true }
  ];

  return (
    <div className="main-wrapper">
      {/* Top Header */}
      <Header
        backendStatus={backendStatus}
        onRefresh={loadDashboardData}
        isRefreshing={isLoading}
      />

      {/* Main Content Area */}
      <div className="dashboard-content">

        {/* Backend Offline Alert */}
        {backendStatus === 'offline' && (
          <div className="backend-alert">
            <span style={{ fontSize: '1.5rem' }}>⚠️</span>
            <div>
              <h4>Express Backend is Unreachable</h4>
              <p>
                {error || 'Could not reach backend at http://localhost:5001.'}
                {' '}To start the backend server, open a terminal and run:
              </p>
              <p style={{ marginTop: '0.4rem' }}>
                <code>cd backend && npm start</code>
              </p>
            </div>
          </div>
        )}

        {/* Database Notice */}
        {backendStatus === 'online' && (dbStatus === 'offline' || error) && (
          <div className="backend-alert" style={{ borderColor: '#f59e0b', backgroundColor: 'rgba(245, 158, 11, 0.1)' }}>
            <span style={{ fontSize: '1.5rem' }}>⚠️</span>
            <div>
              <h4 style={{ color: '#f59e0b' }}>Database Notice</h4>
              <p>
                {error || 'Could not connect to PostgreSQL database via Prisma.'}
                {' '}Ensure PostgreSQL is running on port 5432:
              </p>
              <p style={{ marginTop: '0.4rem' }}>
                <code>cd backend && npx prisma migrate dev</code>
              </p>
            </div>
          </div>
        )}

        {/* Dynamic Action Notification Toast */}
        {actionNotice && (
          <div
            className="backend-alert"
            style={{
              borderColor: actionNotice.type === 'success' ? '#10b981' : '#ef4444',
              backgroundColor: actionNotice.type === 'success' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
              marginBottom: '1rem'
            }}
          >
            <span style={{ fontSize: '1.2rem' }}>{actionNotice.type === 'success' ? '✅' : '❌'}</span>
            <div style={{ flex: 1 }}>
              <p style={{ color: actionNotice.type === 'success' ? '#10b981' : '#ef4444', fontWeight: 600 }}>
                {actionNotice.text}
              </p>
            </div>
            <button
              className="btn-action"
              onClick={() => setActionNotice(null)}
              style={{ padding: '2px 8px' }}
            >
              ✕
            </button>
          </div>
        )}

        {/* Data Source Notice */}
        <div className="demo-banner">
          <div className="demo-banner-content">
            <span className="demo-tag" style={dataSource === 'database' ? { backgroundColor: '#10b981' } : {}}>
              {dataSource ? `${dataSource.toUpperCase()} MODE` : 'DATABASE MODE'}
            </span>
            <p>
              {dataSource === 'database' ? (
                <>Metrics computed live from <strong>PostgreSQL</strong> via Prisma ORM (<code>GET /api/dashboard/stats</code>).</>
              ) : (
                <>All metrics below are delivered by Express (<code>GET /api/dashboard/stats</code>) for Day 1 foundation.</>
              )}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            {endpoints.length === 0 && backendStatus === 'online' && (
              <button
                className="btn-action"
                onClick={handleSeedDemoEndpoint}
                title="Populate PostgreSQL with live sample endpoints to test probing"
              >
                + Seed Demo Endpoints
              </button>
            )}
            <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>API Sentinel v1.0</span>
          </div>
        </div>

        {/* 4 Core Quantitative Statistics Cards */}
        <section className="stats-grid">
          <StatCard
            title="Total APIs"
            value={stats?.totalApis}
            icon="🌐"
            colorVariant="blue"
            subtitle="Registered endpoints"
            isLoading={isLoading}
          />
          <StatCard
            title="Healthy APIs"
            value={stats?.healthyApis}
            icon="✅"
            colorVariant="green"
            subtitle={
              totalChecked > 0
                ? `${Math.round(((stats.healthyApis || 0) / totalChecked) * 100)}% uptime`
                : 'No checks yet'
            }
            isLoading={isLoading}
          />
          <StatCard
            title="Failed APIs"
            value={stats?.failedApis}
            icon="❌"
            colorVariant="red"
            subtitle={
              stats?.failedApis > 0
                ? 'Incidents flagged'
                : totalChecked > 0
                ? 'All clear'
                : 'No checks yet'
            }
            isLoading={isLoading}
          />
          <StatCard
            title="Average Latency"
            value={stats?.averageLatency}
            icon="⚡"
            colorVariant="amber"
            subtitle="Fleet response time"
            isLoading={isLoading}
          />
        </section>

        {/* Navigation Tabs for Diagnostics */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
          <button
            className={`btn-action ${activeTab === 'overview' ? 'btn-probe' : ''}`}
            onClick={() => setActiveTab('overview')}
            style={{ fontWeight: activeTab === 'overview' ? 700 : 500 }}
          >
            🛡️ Observability Overview
          </button>
          <button
            className={`btn-action ${activeTab === 'diff' ? 'btn-probe' : ''}`}
            onClick={() => setActiveTab('diff')}
            style={{ fontWeight: activeTab === 'diff' ? 700 : 500 }}
          >
            📐 Breaking-Change Diff Engine
          </button>
          <button
            className={`btn-action ${activeTab === 'mcp' ? 'btn-probe' : ''}`}
            onClick={() => setActiveTab('mcp')}
            style={{ fontWeight: activeTab === 'mcp' ? 700 : 500 }}
          >
            🤖 MCP Diagnostic Tools
          </button>
        </div>

        {/* TAB 1: Core Observability Overview */}
        {activeTab === 'overview' && (
          <section className="dashboard-sections-grid">
            
            {/* Section 1: API Health Overview & Live Probing */}
            <div className="panel-card">
              <div className="panel-header">
                <h2 className="panel-title">
                  <span>🛡️</span> Monitored API Endpoints
                </h2>
                <span className="panel-badge">
                  {endpoints.length > 0 ? `${endpoints.length} Live in PostgreSQL` : 'Illustrative Preview'}
                </span>
              </div>

              <div className="table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Method</th>
                      <th>Service & Path</th>
                      <th>Latency</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayEndpoints.map((ep) => {
                      const latestCheck = ep.healthChecks && ep.healthChecks[0];
                      const isHealthy = latestCheck ? latestCheck.isHealthy : null;
                      const latencyStr = latestCheck ? `${latestCheck.latency} ms` : '—';

                      return (
                        <tr key={ep.id}>
                          <td>
                            <span className={`api-method method-${(ep.method || 'GET').toLowerCase()}`}>
                              {ep.method || 'GET'}
                            </span>
                          </td>
                          <td>
                            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{ep.name}</div>
                            <span className="api-path">{ep.url}</span>
                          </td>
                          <td>{latencyStr}</td>
                          <td>
                            <span className={`pill-status ${isHealthy === true ? 'healthy' : isHealthy === false ? 'failed' : ''}`}>
                              ● {isHealthy === true ? 'Healthy' : isHealthy === false ? 'Failed' : 'Pending'}
                            </span>
                          </td>
                          <td>
                            <button
                              className="btn-action btn-probe"
                              onClick={() => handleProbe(ep.id, ep.name)}
                              disabled={probingId === ep.id || ep.isMock}
                              title={ep.isMock ? 'Seed database to probe live endpoints' : 'Execute active health probe'}
                            >
                              {probingId === ep.id ? 'Pinging...' : '⚡ Probe'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Section 2: Recent Incident Audit Trail */}
            <div className="panel-card">
              <div className="panel-header">
                <h2 className="panel-title">
                  <span>🚨</span> Operational Incidents
                </h2>
                <span className="panel-badge">Failure Log</span>
              </div>

              <div className="activity-list">
                {displayIncidents.map((act) => (
                  <div key={act.id} className="activity-item">
                    <div className={`activity-icon-bullet ${act.status === 'OPEN' ? 'bullet-red' : 'bullet-green'}`} />
                    <div style={{ flex: 1 }}>
                      <div className="activity-text">
                        <strong>{act.title}</strong>
                        <div>{act.endpoint?.name || 'External API'} — Status: <code>{act.status}</code></div>
                      </div>
                      <div className="activity-time">{new Date(act.createdAt).toLocaleString()}</div>
                    </div>
                    {act.status === 'OPEN' && !act.isMock && (
                      <button
                        className="btn-action btn-resolve"
                        onClick={() => handleResolveIncident(act.id)}
                        title="Mark incident as resolved in database"
                      >
                        ✓ Resolve
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

          </section>
        )}

        {/* TAB 2: Breaking-Change Analysis Engine */}
        {activeTab === 'diff' && (
          <div className="panel-card">
            <div className="panel-header">
              <h2 className="panel-title">
                <span>📐</span> Breaking-Change Contract Analyzer
              </h2>
              <span className="panel-badge">OpenAPI / Swagger Semantic Diff</span>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
              Compares API contract specifications to detect removed endpoints, removed fields,
              newly required query/body parameters, and incompatible data-type changes before deployment.
            </p>

            <button
              className="btn-action btn-probe"
              onClick={handleRunContractDiff}
              disabled={isDiagnosticRunning}
            >
              {isDiagnosticRunning ? 'Analyzing...' : '▶ Run Sample Contract Diff (Order API v1 vs v2)'}
            </button>

            {diffReport && (
              <div className="diagnostic-box">
                {diffReport.error ? (
                  <div style={{ color: 'var(--status-error)' }}>Error: {diffReport.error}</div>
                ) : (
                  <div>
                    <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.75rem', alignItems: 'center' }}>
                      <span className={diffReport.isBreaking ? 'tag-breaking' : 'tag-safe'}>
                        {diffReport.isBreaking ? '⚠️ BREAKING CHANGES DETECTED' : '✅ CONTRACT COMPATIBLE'}
                      </span>
                      <span>Risk Level: <strong>{diffReport.riskLevel}</strong></span>
                      <span>Breaking: {diffReport.breakingCount}</span>
                      <span>Non-Breaking: {diffReport.nonBreakingCount}</span>
                    </div>
                    <div>
                      {diffReport.changes?.map((ch, idx) => (
                        <div key={idx} style={{ padding: '0.3rem 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                          <span className={ch.isBreaking ? 'tag-breaking' : 'tag-safe'} style={{ marginRight: '0.5rem' }}>
                            {ch.isBreaking ? 'BREAKING' : 'SAFE'}
                          </span>
                          <span>{ch.message}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: Model Context Protocol (MCP) Diagnostic Server */}
        {activeTab === 'mcp' && (
          <div className="panel-card">
            <div className="panel-header">
              <h2 className="panel-title">
                <span>🤖</span> Model Context Protocol (MCP) Diagnostics
              </h2>
              <span className="panel-badge">RFC / AI Tool Execution</span>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
              API Sentinel exposes structured diagnostic capabilities over Model Context Protocol (MCP).
              Compatible AI agents can query real-time health, inspect active incidents, and assess downstream consumer impact.
            </p>

            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
              <button
                className="btn-action"
                onClick={() => handleRunMcpDiagnostic('inspect_incidents')}
                disabled={isDiagnosticRunning}
              >
                🛠️ Run MCP: inspect_incidents
              </button>
              <button
                className="btn-action"
                onClick={() => handleRunMcpDiagnostic('investigate_impact')}
                disabled={isDiagnosticRunning}
              >
                🛠️ Run MCP: investigate_impact
              </button>
              <button
                className="btn-action"
                onClick={() => handleRunMcpDiagnostic('get_endpoint_health')}
                disabled={isDiagnosticRunning}
              >
                🛠️ Run MCP: get_endpoint_health
              </button>
            </div>

            {mcpReport && (
              <div className="diagnostic-box">
                {mcpReport.error ? (
                  <div style={{ color: 'var(--status-error)' }}>Error: {mcpReport.error}</div>
                ) : (
                  <div>
                    <div style={{ color: 'var(--accent-blue)', fontWeight: 600, marginBottom: '0.5rem' }}>
                      MCP Tool Response Envelope:
                    </div>
                    {mcpReport.content?.map((item, idx) => (
                      <div key={idx}>{item.text}</div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
