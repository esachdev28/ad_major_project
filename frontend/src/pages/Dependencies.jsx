import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Header from '../components/Header';
import {
  getDependencyGraph,
  createService,
  deleteService,
  createIntegration,
  deleteIntegration,
  analyzeDependencyImpact,
  getEndpoints,
  getContracts,
  checkHealth,
} from '../services/api';

export default function Dependencies() {
  const [services, setServices] = useState([]);
  const [integrations, setIntegrations] = useState([]);
  const [endpoints, setEndpoints] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [backendStatus, setBackendStatus] = useState('checking');
  const [alert, setAlert] = useState(null);

  // Impact Analysis State
  const [selectedServiceId, setSelectedServiceId] = useState('');
  const [baselineVersionId, setBaselineVersionId] = useState('');
  const [targetVersionId, setTargetVersionId] = useState('');
  const [impactReport, setImpactReport] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Register Service Modal
  const [isServiceModalOpen, setIsServiceModalOpen] = useState(false);
  const [svcForm, setSvcForm] = useState({
    name: '',
    criticality: 'HIGH',
    ownerTeam: '',
    endpointId: '',
    description: '',
  });

  // Link Dependency Modal
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  const [linkForm, setLinkForm] = useState({
    providerId: '',
    consumerId: '',
    contractVersion: '1.0.0',
    notes: '',
  });

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [healthRes, graphRes, epRes, contractsRes] = await Promise.allSettled([
        checkHealth(),
        getDependencyGraph(),
        getEndpoints(),
        getContracts(),
      ]);

      if (healthRes.status === 'fulfilled' && healthRes.value.success) {
        setBackendStatus('online');
      } else {
        setBackendStatus('offline');
      }

      if (graphRes.status === 'fulfilled' && graphRes.value.success) {
        const svcs = graphRes.value.data.services || [];
        const edges = graphRes.value.data.integrations || [];
        setServices(svcs);
        setIntegrations(edges);
        if (svcs.length > 0 && !selectedServiceId) {
          setSelectedServiceId(svcs[0].id);
        }
        if (svcs.length >= 2 && !linkForm.providerId) {
          setLinkForm((prev) => ({
            ...prev,
            providerId: svcs[0].id,
            consumerId: svcs[1].id,
          }));
        }
      }

      if (epRes.status === 'fulfilled' && epRes.value.success) {
        setEndpoints(epRes.value.data || []);
      }

      if (contractsRes.status === 'fulfilled' && contractsRes.value.success) {
        setContracts(contractsRes.value.data || []);
      }
    } catch (err) {
      setAlert({ type: 'error', message: err.message });
    } finally {
      setIsLoading(false);
    }
  }, [selectedServiceId, linkForm.providerId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Compute topological columns for crisp SVG directed graph rendering
  const graphLayout = useMemo(() => {
    if (services.length === 0) return { nodes: [], edges: [], width: 760, height: 260 };

    const inDegree = new Map(services.map((s) => [s.id, 0]));
    const adj = new Map(services.map((s) => [s.id, []]));

    for (const edge of integrations) {
      if (adj.has(edge.providerId) && inDegree.has(edge.consumerId)) {
        adj.get(edge.providerId).push(edge.consumerId);
        inDegree.set(edge.consumerId, inDegree.get(edge.consumerId) + 1);
      }
    }

    // Layer assignment via BFS
    const layerMap = new Map();
    const queue = [];
    for (const s of services) {
      if (inDegree.get(s.id) === 0) {
        layerMap.set(s.id, 0);
        queue.push(s.id);
      }
    }
    if (queue.length === 0 && services.length > 0) {
      layerMap.set(services[0].id, 0);
      queue.push(services[0].id);
    }

    while (queue.length > 0) {
      const curr = queue.shift();
      const currLayer = layerMap.get(curr) || 0;
      for (const nextId of adj.get(curr) || []) {
        if (!layerMap.has(nextId)) {
          layerMap.set(nextId, currLayer + 1);
          queue.push(nextId);
        }
      }
    }

    for (const s of services) {
      if (!layerMap.has(s.id)) layerMap.set(s.id, 0);
    }

    const columns = new Map();
    for (const s of services) {
      const col = layerMap.get(s.id);
      if (!columns.has(col)) columns.set(col, []);
      columns.get(col).push(s);
    }

    const maxCols = Math.max(...Array.from(columns.keys()), 0) + 1;
    const maxRows = Math.max(...Array.from(columns.values()).map((c) => c.length), 1);
    const colWidth = 260;
    const rowHeight = 100;
    const nodeW = 190;
    const nodeH = 62;
    const width = Math.max(760, maxCols * colWidth + 60);
    const height = Math.max(260, maxRows * rowHeight + 40);

    const posMap = new Map();
    const nodes = [];

    for (const [colIdx, colServices] of columns.entries()) {
      const totalColH = colServices.length * rowHeight;
      const startY = (height - totalColH) / 2 + 18;
      colServices.forEach((svc, rowIdx) => {
        const x = 40 + colIdx * colWidth;
        const y = startY + rowIdx * rowHeight;
        posMap.set(svc.id, { x, y, cx: x + nodeW / 2, cy: y + nodeH / 2 });
        nodes.push({ ...svc, x, y, w: nodeW, h: nodeH });
      });
    }

    const edges = integrations
      .map((edge) => {
        const from = posMap.get(edge.providerId);
        const to = posMap.get(edge.consumerId);
        if (!from || !to) return null;
        return {
          ...edge,
          x1: from.x + nodeW,
          y1: from.cy,
          x2: to.x,
          y2: to.cy,
        };
      })
      .filter(Boolean);

    return { nodes, edges, width, height };
  }, [services, integrations]);

  // Linked endpoint versions for the selected service (optional diff input for impact analysis)
  const selectedService = services.find((s) => s.id === selectedServiceId);
  const linkedEndpointContract = contracts.find((c) => c.id === selectedService?.endpointId);
  const availableVersions = linkedEndpointContract?.versions || [];

  const handleAnalyzeImpact = async () => {
    if (!selectedServiceId) return;
    setIsAnalyzing(true);
    setAlert(null);
    try {
      const res = await analyzeDependencyImpact({
        serviceId: selectedServiceId,
        baselineVersionId: baselineVersionId || undefined,
        targetVersionId: targetVersionId || undefined,
      });
      if (res.success) {
        setImpactReport(res.data);
      }
    } catch (err) {
      setAlert({ type: 'error', message: err.message });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleCreateService = async (e) => {
    e.preventDefault();
    try {
      const res = await createService(svcForm);
      if (res.success) {
        setIsServiceModalOpen(false);
        setSvcForm({ name: '', criticality: 'HIGH', ownerTeam: '', endpointId: '', description: '' });
        setAlert({ type: 'success', message: res.message });
        loadData();
      }
    } catch (err) {
      setAlert({ type: 'error', message: err.message });
    }
  };

  const handleCreateIntegration = async (e) => {
    e.preventDefault();
    try {
      const res = await createIntegration(linkForm);
      if (res.success) {
        setIsLinkModalOpen(false);
        setAlert({ type: 'success', message: res.message });
        loadData();
      }
    } catch (err) {
      setAlert({ type: 'error', message: err.message });
    }
  };

  const handleDeleteService = async (id, name) => {
    if (!window.confirm(`Delete service "${name}" and all its dependency edges?`)) return;
    try {
      const res = await deleteService(id);
      if (res.success) {
        setAlert({ type: 'success', message: res.message });
        if (selectedServiceId === id) {
          setSelectedServiceId('');
          setImpactReport(null);
        }
        loadData();
      }
    } catch (err) {
      setAlert({ type: 'error', message: err.message });
    }
  };

  const handleDeleteEdge = async (id) => {
    try {
      const res = await deleteIntegration(id);
      if (res.success) {
        setAlert({ type: 'success', message: res.message });
        loadData();
      }
    } catch (err) {
      setAlert({ type: 'error', message: err.message });
    }
  };

  const directIds = new Set(impactReport?.blastRadius?.directConsumers?.map((c) => c.id) || []);
  const transitiveIds = new Set(impactReport?.blastRadius?.transitiveConsumers?.map((c) => c.id) || []);

  const getCritColor = (crit) => {
    if (crit === 'CRITICAL') return '#ef4444';
    if (crit === 'HIGH') return '#f97316';
    if (crit === 'MEDIUM') return '#eab308';
    return '#38bdf8';
  };

  const getRiskColor = (level) => {
    if (level === 'CRITICAL') return '#ef4444';
    if (level === 'HIGH') return '#f97316';
    if (level === 'MEDIUM') return '#f59e0b';
    return '#10b981';
  };

  return (
    <div className="main-wrapper">
      <Header
        backendStatus={backendStatus}
        onRefresh={loadData}
        isRefreshing={isLoading}
        title="Dependency Intelligence"
        subtitle="Directed service dependency graph, consumer blast radius, and explainable risk scoring."
      />

      <div className="dashboard-content">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h2 style={{ fontSize: '1.35rem', fontWeight: 600, color: '#f8fafc', margin: 0 }}>
              Service Dependency & Blast Radius Map
            </h2>
            <p style={{ color: '#94a3b8', fontSize: '0.875rem', marginTop: '0.25rem' }}>
              Visualize provider-consumer integrations and calculate deterministic release risk scores.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button
              onClick={() => setIsLinkModalOpen(true)}
              disabled={services.length < 2}
              style={{
                backgroundColor: '#1e293b',
                border: '1px solid #334155',
                color: '#38bdf8',
                padding: '0.55rem 1rem',
                borderRadius: '8px',
                fontWeight: 500,
                fontSize: '0.85rem',
                cursor: services.length < 2 ? 'not-allowed' : 'pointer',
              }}
            >
              🔗 Link Dependency
            </button>
            <button
              onClick={() => setIsServiceModalOpen(true)}
              style={{
                backgroundColor: '#3b82f6',
                color: '#ffffff',
                border: 'none',
                padding: '0.55rem 1.15rem',
                borderRadius: '8px',
                fontWeight: 500,
                fontSize: '0.85rem',
                cursor: 'pointer',
              }}
            >
              + Register Service
            </button>
          </div>
        </div>

        {alert && (
          <div
            style={{
              padding: '0.75rem 1rem',
              borderRadius: '8px',
              marginBottom: '1rem',
              backgroundColor: alert.type === 'success' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
              border: `1px solid ${alert.type === 'success' ? '#10b981' : '#ef4444'}`,
              color: alert.type === 'success' ? '#34d399' : '#f87171',
              fontSize: '0.875rem',
              display: 'flex',
              justifyContent: 'space-between',
            }}
          >
            <span>{alert.message}</span>
            <button onClick={() => setAlert(null)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}>
              ✕
            </button>
          </div>
        )}

        {/* Interactive Directed Dependency Graph SVG */}
        <div className="panel-card" style={{ marginBottom: '1.5rem', overflowX: 'auto' }}>
          <div className="panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 className="panel-title" style={{ margin: 0 }}>
              <span>🕸️</span> Directed Service Topology ({services.length} Services, {integrations.length} Edges)
            </h3>
            <div style={{ display: 'flex', gap: '1rem', fontSize: '0.75rem', color: '#94a3b8' }}>
              <span><strong style={{ color: '#3b82f6' }}>●</strong> Selected Target</span>
              <span><strong style={{ color: '#ef4444' }}>●</strong> Direct Impact (Depth 1)</span>
              <span><strong style={{ color: '#f59e0b' }}>●</strong> Transitive Impact (Depth 2+)</span>
            </div>
          </div>

          {services.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>
              No services registered yet. Click &quot;+ Register Service&quot; to begin mapping dependencies.
            </div>
          ) : (
            <svg width={graphLayout.width} height={graphLayout.height} style={{ display: 'block', minWidth: '100%' }}>
              <defs>
                <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                  <path d="M 0 1 L 10 5 L 0 9 z" fill="#64748b" />
                </marker>
                <marker id="arrow-impact" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                  <path d="M 0 1 L 10 5 L 0 9 z" fill="#ef4444" />
                </marker>
              </defs>

              {graphLayout.edges.map((edge) => {
                const isImpactedEdge =
                  (edge.providerId === impactReport?.targetService?.id || directIds.has(edge.providerId)) &&
                  (directIds.has(edge.consumerId) || transitiveIds.has(edge.consumerId));
                const midX = (edge.x1 + edge.x2) / 2;
                const d = `M ${edge.x1} ${edge.y1} C ${midX} ${edge.y1}, ${midX} ${edge.y2}, ${edge.x2} ${edge.y2}`;
                return (
                  <g key={edge.id}>
                    <path
                      d={d}
                      fill="none"
                      stroke={isImpactedEdge ? '#ef4444' : '#475569'}
                      strokeWidth={isImpactedEdge ? 2.5 : 1.75}
                      markerEnd={isImpactedEdge ? 'url(#arrow-impact)' : 'url(#arrow)'}
                    />
                    {edge.contractVersion && (
                      <text x={midX} y={(edge.y1 + edge.y2) / 2 - 6} fill="#94a3b8" fontSize="10" textAnchor="middle">
                        v{edge.contractVersion}
                      </text>
                    )}
                  </g>
                );
              })}

              {graphLayout.nodes.map((node) => {
                const isTarget = impactReport?.targetService?.id === node.id || selectedServiceId === node.id;
                const isDirect = directIds.has(node.id);
                const isTransitive = transitiveIds.has(node.id);

                const borderColor = isDirect
                  ? '#ef4444'
                  : isTransitive
                  ? '#f59e0b'
                  : isTarget
                  ? '#3b82f6'
                  : '#334155';

                return (
                  <g
                    key={node.id}
                    onClick={() => {
                      setSelectedServiceId(node.id);
                      setBaselineVersionId('');
                      setTargetVersionId('');
                    }}
                    style={{ cursor: 'pointer' }}
                  >
                    <rect
                      x={node.x}
                      y={node.y}
                      width={node.w}
                      height={node.h}
                      rx="8"
                      fill={isTarget ? '#1e3a8a55' : '#0f172a'}
                      stroke={borderColor}
                      strokeWidth={isTarget || isDirect || isTransitive ? 2.5 : 1.2}
                    />
                    <circle cx={node.x + 14} cy={node.y + 20} r="4" fill={getCritColor(node.criticality)} />
                    <text x={node.x + 24} y={node.y + 24} fill="#f8fafc" fontSize="12" fontWeight="600">
                      {node.name.length > 21 ? `${node.name.slice(0, 20)}…` : node.name}
                    </text>
                    <text x={node.x + 14} y={node.y + 44} fill="#94a3b8" fontSize="10">
                      {node.criticality} {isDirect ? '· DIRECT IMPACT' : isTransitive ? '· TRANSITIVE' : node.ownerTeam ? `· ${node.ownerTeam}` : ''}
                    </text>
                  </g>
                );
              })}
            </svg>
          )}
        </div>

        {/* Impact Analysis & Risk Score Simulator */}
        <div className="panel-card" style={{ marginBottom: '1.5rem' }}>
          <div className="panel-header">
            <h3 className="panel-title" style={{ margin: 0 }}>
              <span>⚡</span> Blast Radius & Deterministic Risk Analyzer
            </h3>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', alignItems: 'flex-end', marginBottom: '1.25rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.35rem' }}>
                Target Provider Service
              </label>
              <select
                value={selectedServiceId}
                onChange={(e) => {
                  setSelectedServiceId(e.target.value);
                  setBaselineVersionId('');
                  setTargetVersionId('');
                }}
                style={{
                  width: '100%',
                  backgroundColor: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  padding: '0.55rem',
                  color: '#f8fafc',
                }}
              >
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.criticality})
                  </option>
                ))}
              </select>
            </div>

            {availableVersions.length >= 2 && (
              <>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.35rem' }}>
                    Contract Baseline (Optional)
                  </label>
                  <select
                    value={baselineVersionId}
                    onChange={(e) => setBaselineVersionId(e.target.value)}
                    style={{
                      width: '100%',
                      backgroundColor: '#1e293b',
                      border: '1px solid #334155',
                      borderRadius: '6px',
                      padding: '0.55rem',
                      color: '#f8fafc',
                    }}
                  >
                    <option value="">None (Topology Only)</option>
                    {availableVersions.map((v) => (
                      <option key={v.id} value={v.id}>
                        v{v.version}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.35rem' }}>
                    Contract Target (Optional)
                  </label>
                  <select
                    value={targetVersionId}
                    onChange={(e) => setTargetVersionId(e.target.value)}
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
                    {availableVersions.map((v) => (
                      <option key={v.id} value={v.id}>
                        v{v.version}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}

            <button
              onClick={handleAnalyzeImpact}
              disabled={isAnalyzing || !selectedServiceId}
              style={{
                backgroundColor: '#3b82f6',
                color: '#ffffff',
                border: 'none',
                padding: '0.6rem 1.25rem',
                borderRadius: '6px',
                fontWeight: 600,
                cursor: isAnalyzing ? 'not-allowed' : 'pointer',
              }}
            >
              {isAnalyzing ? 'Computing Graph...' : '🔍 Analyze Blast Radius'}
            </button>
          </div>

          {impactReport && (
            <div style={{ borderTop: '1px solid #334155', paddingTop: '1.25rem' }}>
              {/* Risk Score Header */}
              <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: '1.5rem', marginBottom: '1.25rem' }}>
                <div
                  style={{
                    backgroundColor: '#0f172a',
                    border: `2px solid ${getRiskColor(impactReport.riskLevel)}`,
                    borderRadius: '10px',
                    padding: '1.25rem',
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase' }}>
                    Deterministic Risk Score
                  </div>
                  <div style={{ fontSize: '2.5rem', fontWeight: 800, color: getRiskColor(impactReport.riskLevel), margin: '0.25rem 0' }}>
                    {impactReport.riskScore} <span style={{ fontSize: '1rem', color: '#64748b' }}>/ 100</span>
                  </div>
                  <span
                    style={{
                      padding: '0.25rem 0.75rem',
                      borderRadius: '9999px',
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      backgroundColor: `${getRiskColor(impactReport.riskLevel)}22`,
                      color: getRiskColor(impactReport.riskLevel),
                    }}
                  >
                    {impactReport.riskLevel} RISK
                  </span>
                </div>

                {/* Factor Breakdown */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  {impactReport.factors.map((f, idx) => (
                    <div key={idx} style={{ backgroundColor: '#1e293b', padding: '0.75rem', borderRadius: '8px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', fontWeight: 600, color: '#f8fafc' }}>
                        <span>{f.name}</span>
                        <span style={{ color: '#38bdf8' }}>{f.points} / {f.maxPoints} pts</span>
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.25rem' }}>
                        {f.rationale}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Direct & Transitive Consumers */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div style={{ backgroundColor: '#0f172a', padding: '1rem', borderRadius: '8px', border: '1px solid #334155' }}>
                  <h4 style={{ margin: '0 0 0.65rem', color: '#f87171', fontSize: '0.9rem' }}>
                    Direct Consumers ({impactReport.blastRadius.directCount})
                  </h4>
                  {impactReport.blastRadius.directConsumers.length === 0 ? (
                    <div style={{ fontSize: '0.8rem', color: '#64748b' }}>No direct downstream consumers.</div>
                  ) : (
                    impactReport.blastRadius.directConsumers.map((c) => (
                      <div key={c.id} style={{ padding: '0.45rem 0', borderBottom: '1px solid #1e293b', fontSize: '0.82rem' }}>
                        <strong style={{ color: '#f8fafc' }}>{c.name}</strong>{' '}
                        <span style={{ color: getCritColor(c.criticality), fontSize: '0.72rem' }}>[{c.criticality}]</span>
                        <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                          Path: {c.dependencyPath.join(' ➔ ')}
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div style={{ backgroundColor: '#0f172a', padding: '1rem', borderRadius: '8px', border: '1px solid #334155' }}>
                  <h4 style={{ margin: '0 0 0.65rem', color: '#fbbf24', fontSize: '0.9rem' }}>
                    Transitive Consumers ({impactReport.blastRadius.transitiveCount})
                  </h4>
                  {impactReport.blastRadius.transitiveConsumers.length === 0 ? (
                    <div style={{ fontSize: '0.8rem', color: '#64748b' }}>No transitive downstream consumers.</div>
                  ) : (
                    impactReport.blastRadius.transitiveConsumers.map((c) => (
                      <div key={c.id} style={{ padding: '0.45rem 0', borderBottom: '1px solid #1e293b', fontSize: '0.82rem' }}>
                        <strong style={{ color: '#f8fafc' }}>{c.name}</strong>{' '}
                        <span style={{ color: '#fbbf24', fontSize: '0.72rem' }}>[Depth {c.depth}]</span>
                        <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                          Path: {c.dependencyPath.join(' ➔ ')}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Recommendations */}
              <div style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)', border: '1px solid #3b82f655', borderRadius: '8px', padding: '0.85rem' }}>
                <div style={{ fontWeight: 600, color: '#93c5fd', fontSize: '0.85rem', marginBottom: '0.4rem' }}>
                  💡 Migration & Mitigation Recommendations
                </div>
                <ul style={{ margin: 0, paddingLeft: '1.25rem', color: '#cbd5e1', fontSize: '0.82rem' }}>
                  {impactReport.migrationRecommendations.map((rec, i) => (
                    <li key={i}>{rec}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>

        {/* Registered Services & Integration Edges Tables */}
        <section className="dashboard-sections-grid">
          <div className="panel-card">
            <div className="panel-header">
              <h3 className="panel-title">Services ({services.length})</h3>
            </div>
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Service Name</th>
                    <th>Criticality</th>
                    <th>Team</th>
                    <th style={{ textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {services.map((s) => (
                    <tr key={s.id}>
                      <td style={{ fontWeight: 600, color: '#f8fafc' }}>{s.name}</td>
                      <td>
                        <span style={{ color: getCritColor(s.criticality), fontWeight: 700, fontSize: '0.75rem' }}>
                          {s.criticality}
                        </span>
                      </td>
                      <td>{s.ownerTeam || '—'}</td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          onClick={() => handleDeleteService(s.id, s.name)}
                          style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: '0.78rem' }}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="panel-card">
            <div className="panel-header">
              <h3 className="panel-title">Integrations ({integrations.length})</h3>
            </div>
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Provider ➔ Consumer</th>
                    <th>Contract</th>
                    <th style={{ textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {integrations.map((edge) => (
                    <tr key={edge.id}>
                      <td>
                        <strong style={{ color: '#38bdf8' }}>{edge.provider?.name}</strong> ➔{' '}
                        <strong style={{ color: '#f8fafc' }}>{edge.consumer?.name}</strong>
                      </td>
                      <td>{edge.contractVersion ? `v${edge.contractVersion}` : '—'}</td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          onClick={() => handleDeleteEdge(edge.id)}
                          style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: '0.78rem' }}
                        >
                          Unlink
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>

      {/* Register Service Modal */}
      {isServiceModalOpen && (
        <div className="endpoint-modal-backdrop" role="presentation">
          <section className="endpoint-modal" role="dialog" aria-modal="true">
            <div className="panel-header">
              <h2>Register Service</h2>
              <button type="button" className="endpoint-close" onClick={() => setIsServiceModalOpen(false)}>×</button>
            </div>
            <form onSubmit={handleCreateService} className="endpoint-form">
              <label>
                Service Name
                <input required value={svcForm.name} onChange={(e) => setSvcForm({ ...svcForm, name: e.target.value })} placeholder="e.g. Billing Service" />
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <label>
                  Criticality
                  <select value={svcForm.criticality} onChange={(e) => setSvcForm({ ...svcForm, criticality: e.target.value })}>
                    <option value="CRITICAL">CRITICAL</option>
                    <option value="HIGH">HIGH</option>
                    <option value="MEDIUM">MEDIUM</option>
                    <option value="LOW">LOW</option>
                  </select>
                </label>
                <label>
                  Owner Team
                  <input value={svcForm.ownerTeam} onChange={(e) => setSvcForm({ ...svcForm, ownerTeam: e.target.value })} placeholder="e.g. Payments Core" />
                </label>
              </div>
              <label>
                Linked API Endpoint (Optional)
                <select value={svcForm.endpointId} onChange={(e) => setSvcForm({ ...svcForm, endpointId: e.target.value })}>
                  <option value="">None (Consumer Only)</option>
                  {endpoints.map((ep) => (
                    <option key={ep.id} value={ep.id}>{ep.name}</option>
                  ))}
                </select>
              </label>
              <label>
                Description
                <textarea rows="2" value={svcForm.description} onChange={(e) => setSvcForm({ ...svcForm, description: e.target.value })} />
              </label>
              <div className="endpoint-form-actions">
                <button type="button" className="endpoint-secondary" onClick={() => setIsServiceModalOpen(false)}>Cancel</button>
                <button type="submit" className="endpoint-primary">Register Service</button>
              </div>
            </form>
          </section>
        </div>
      )}

      {/* Link Dependency Modal */}
      {isLinkModalOpen && (
        <div className="endpoint-modal-backdrop" role="presentation">
          <section className="endpoint-modal" role="dialog" aria-modal="true">
            <div className="panel-header">
              <h2>Link Service Dependency</h2>
              <button type="button" className="endpoint-close" onClick={() => setIsLinkModalOpen(false)}>×</button>
            </div>
            <form onSubmit={handleCreateIntegration} className="endpoint-form">
              <label>
                Upstream Provider Service
                <select required value={linkForm.providerId} onChange={(e) => setLinkForm({ ...linkForm, providerId: e.target.value })}>
                  {services.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </label>
              <label>
                Downstream Consumer Service
                <select required value={linkForm.consumerId} onChange={(e) => setLinkForm({ ...linkForm, consumerId: e.target.value })}>
                  {services.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </label>
              <label>
                Contract Version Consumed
                <input value={linkForm.contractVersion} onChange={(e) => setLinkForm({ ...linkForm, contractVersion: e.target.value })} placeholder="1.0.0" />
              </label>
              <label>
                Integration Notes
                <input value={linkForm.notes} onChange={(e) => setLinkForm({ ...linkForm, notes: e.target.value })} placeholder="e.g. Calls /payments/charge" />
              </label>
              <div className="endpoint-form-actions">
                <button type="button" className="endpoint-secondary" onClick={() => setIsLinkModalOpen(false)}>Cancel</button>
                <button type="submit" className="endpoint-primary">Link Integration</button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
