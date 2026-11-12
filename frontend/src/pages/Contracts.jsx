import React, { useState, useEffect, useCallback } from 'react';
import Header from '../components/Header';
import {
  getContracts,
  getContractVersion,
  uploadContract,
  deleteContractVersion,
  compareContracts,
  checkHealth,
} from '../services/api';

export default function Contracts() {
  const [endpoints, setEndpoints] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [backendStatus, setBackendStatus] = useState('checking');
  const [activeTab, setActiveTab] = useState('registry'); // 'registry' | 'compare'
  const [selectedVersion, setSelectedVersion] = useState(null);
  const [alert, setAlert] = useState(null);

  // Upload Modal State
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [uploadEndpointId, setUploadEndpointId] = useState('');
  const [uploadVersion, setUploadVersion] = useState('');
  const [uploadSpecText, setUploadSpecText] = useState('');
  const [uploadError, setUploadError] = useState(null);
  const [isUploading, setIsUploading] = useState(false);

  // Comparison Engine State
  const [compareEndpointId, setCompareEndpointId] = useState('');
  const [baselineId, setBaselineId] = useState('');
  const [targetId, setTargetId] = useState('');
  const [diffReport, setDiffReport] = useState(null);
  const [diffFilter, setDiffFilter] = useState('ALL');
  const [isComparing, setIsComparing] = useState(false);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [healthRes, contractsRes] = await Promise.allSettled([
        checkHealth(),
        getContracts(),
      ]);

      if (healthRes.status === 'fulfilled' && healthRes.value.success) {
        setBackendStatus('online');
      } else {
        setBackendStatus('offline');
      }

      if (contractsRes.status === 'fulfilled' && contractsRes.value.success) {
        const list = contractsRes.value.data || [];
        setEndpoints(list);
        if (list.length > 0) {
          if (!uploadEndpointId) setUploadEndpointId(list[0].id);
          const withVersions = list.find((ep) => ep.versions.length >= 2) || list.find((ep) => ep.versions.length > 0) || list[0];
          if (!compareEndpointId && withVersions) {
            setCompareEndpointId(withVersions.id);
            if (withVersions.versions.length >= 2) {
              setBaselineId(withVersions.versions[1].id);
              setTargetId(withVersions.versions[0].id);
            } else if (withVersions.versions.length === 1) {
              setBaselineId(withVersions.versions[0].id);
              setTargetId(withVersions.versions[0].id);
            }
          }
        }
      }
    } catch (err) {
      setBackendStatus('offline');
      setAlert({ type: 'error', message: err.message });
    } finally {
      setIsLoading(false);
    }
  }, [uploadEndpointId, compareEndpointId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleInspectVersion = async (versionId) => {
    try {
      const res = await getContractVersion(versionId);
      if (res.success) {
        setSelectedVersion(res.data);
      }
    } catch (err) {
      setAlert({ type: 'error', message: err.message });
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      setUploadSpecText(evt.target.result);
    };
    reader.readAsText(file);
  };

  const handleSubmitUpload = async (e) => {
    e.preventDefault();
    setUploadError(null);
    setIsUploading(true);
    try {
      const res = await uploadContract({
        endpointId: uploadEndpointId,
        version: uploadVersion,
        specification: uploadSpecText,
      });
      if (res.success) {
        setIsUploadOpen(false);
        setUploadVersion('');
        setUploadSpecText('');
        setAlert({ type: 'success', message: res.message });
        loadData();
        setSelectedVersion(res.data);
      }
    } catch (err) {
      setUploadError(err.message);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteVersion = async (versionId, verName) => {
    if (!window.confirm(`Delete contract version ${verName}?`)) return;
    try {
      const res = await deleteContractVersion(versionId);
      if (res.success) {
        setAlert({ type: 'success', message: res.message });
        if (selectedVersion?.id === versionId) setSelectedVersion(null);
        loadData();
      }
    } catch (err) {
      setAlert({ type: 'error', message: err.message });
    }
  };

  const handleSelectCompareEndpoint = (epId) => {
    setCompareEndpointId(epId);
    const ep = endpoints.find((x) => x.id === epId);
    if (ep && ep.versions.length >= 2) {
      setBaselineId(ep.versions[1].id);
      setTargetId(ep.versions[0].id);
    } else if (ep && ep.versions.length === 1) {
      setBaselineId(ep.versions[0].id);
      setTargetId(ep.versions[0].id);
    } else {
      setBaselineId('');
      setTargetId('');
    }
    setDiffReport(null);
  };

  const handleRunCompare = async () => {
    if (!baselineId || !targetId) {
      setAlert({ type: 'error', message: 'Please select both baseline and target contract versions.' });
      return;
    }
    setIsComparing(true);
    setAlert(null);
    try {
      const res = await compareContracts(baselineId, targetId);
      if (res.success) {
        setDiffReport(res.data);
      }
    } catch (err) {
      setAlert({ type: 'error', message: err.message });
    } finally {
      setIsComparing(false);
    }
  };

  const loadSampleYaml = () => {
    setUploadVersion('2.0.0');
    setUploadSpecText(`openapi: "3.0.3"
info:
  title: Order Processing API
  version: "2.0.0"
paths:
  /orders:
    get:
      summary: List customer orders (v2)
      parameters:
        - name: limit
          in: query
          required: false
          schema:
            type: integer
        - name: tenant_id
          in: header
          required: true
          schema:
            type: string
      responses:
        "200":
          description: Order list
          content:
            application/json:
              schema:
                type: array
                items:
                  type: object
                  properties:
                    id:
                      type: string
                    total_amount:
                      type: string
                  required:
                    - id
                    - total_amount
`);
  };

  const selectedEndpointForCompare = endpoints.find((x) => x.id === compareEndpointId);
  const compareVersions = selectedEndpointForCompare?.versions || [];

  const filteredChanges = (diffReport?.changes || []).filter((c) =>
    diffFilter === 'ALL' ? true : c.classification === diffFilter
  );

  const getClassificationStyle = (cls) => {
    if (cls === 'BREAKING') return { bg: 'rgba(239, 68, 68, 0.2)', color: '#f87171', border: '#ef4444' };
    if (cls === 'POTENTIALLY_BREAKING') return { bg: 'rgba(245, 158, 11, 0.2)', color: '#fbbf24', border: '#f59e0b' };
    return { bg: 'rgba(16, 185, 129, 0.2)', color: '#34d399', border: '#10b981' };
  };

  return (
    <div className="main-wrapper">
      <Header
        backendStatus={backendStatus}
        onRefresh={loadData}
        isRefreshing={isLoading}
        title="Contract Analysis"
        subtitle="Manage OpenAPI 3.x versions and detect breaking schema regressions."
      />

      <div className="dashboard-content">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h2 style={{ fontSize: '1.35rem', fontWeight: 600, color: '#f8fafc', margin: 0 }}>
              Contract Management & Breaking-Change Analyzer
            </h2>
            <p style={{ color: '#94a3b8', fontSize: '0.875rem', marginTop: '0.25rem' }}>
              Manage OpenAPI 3.0/3.1 JSON & YAML contracts and detect breaking schema regressions before release.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button
              onClick={() => setActiveTab('registry')}
              style={{
                padding: '0.55rem 1rem',
                borderRadius: '8px',
                fontSize: '0.85rem',
                fontWeight: 500,
                cursor: 'pointer',
                border: activeTab === 'registry' ? '1px solid #3b82f6' : '1px solid #334155',
                backgroundColor: activeTab === 'registry' ? '#1d4ed8' : '#1e293b',
                color: activeTab === 'registry' ? '#ffffff' : '#94a3b8',
              }}
            >
              📄 Version Registry
            </button>
            <button
              onClick={() => setActiveTab('compare')}
              style={{
                padding: '0.55rem 1rem',
                borderRadius: '8px',
                fontSize: '0.85rem',
                fontWeight: 500,
                cursor: 'pointer',
                border: activeTab === 'compare' ? '1px solid #3b82f6' : '1px solid #334155',
                backgroundColor: activeTab === 'compare' ? '#1d4ed8' : '#1e293b',
                color: activeTab === 'compare' ? '#ffffff' : '#94a3b8',
              }}
            >
              🔍 Diff Analyzer
            </button>
            <button
              onClick={() => setIsUploadOpen(true)}
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
              + Upload Spec
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

        {activeTab === 'registry' ? (
          <div style={{ display: 'grid', gridTemplateColumns: selectedVersion ? '1fr 1.2fr' : '1fr', gap: '1.5rem' }}>
            <div className="table-card">
              <div className="table-header">
                <h3>Endpoints & Contract Versions</h3>
                <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Select version to inspect</span>
              </div>

              {isLoading ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>Loading contracts...</div>
              ) : endpoints.length === 0 ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>No endpoints registered.</div>
              ) : (
                <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {endpoints.map((ep) => (
                    <div
                      key={ep.id}
                      style={{
                        backgroundColor: '#1e293b',
                        border: '1px solid #334155',
                        borderRadius: '8px',
                        padding: '1rem',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                        <div>
                          <div style={{ fontWeight: 600, color: '#f8fafc' }}>{ep.name}</div>
                          <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{ep.url}</div>
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          {ep.versions.length >= 2 && (
                            <button
                              onClick={() => {
                                handleSelectCompareEndpoint(ep.id);
                                setActiveTab('compare');
                              }}
                              style={{
                                backgroundColor: '#1d4ed833',
                                border: '1px solid #3b82f6',
                                color: '#60a5fa',
                                padding: '0.3rem 0.65rem',
                                borderRadius: '6px',
                                fontSize: '0.75rem',
                                cursor: 'pointer',
                              }}
                            >
                              Compare Versions
                            </button>
                          )}
                          <button
                            onClick={() => {
                              setUploadEndpointId(ep.id);
                              setIsUploadOpen(true);
                            }}
                            style={{
                              backgroundColor: '#0f172a',
                              border: '1px solid #334155',
                              color: '#60a5fa',
                              padding: '0.3rem 0.65rem',
                              borderRadius: '6px',
                              fontSize: '0.75rem',
                              cursor: 'pointer',
                            }}
                          >
                            + Add Version
                          </button>
                        </div>
                      </div>

                      {ep.versions.length === 0 ? (
                        <div style={{ fontSize: '0.8rem', color: '#64748b', fontStyle: 'italic' }}>
                          No OpenAPI contract versions uploaded yet.
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          {ep.versions.map((ver) => (
                            <div
                              key={ver.id}
                              onClick={() => handleInspectVersion(ver.id)}
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                padding: '0.55rem 0.75rem',
                                backgroundColor: selectedVersion?.id === ver.id ? '#1d4ed833' : '#0f172a',
                                border: selectedVersion?.id === ver.id ? '1px solid #3b82f6' : '1px solid #334155',
                                borderRadius: '6px',
                                cursor: 'pointer',
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                <span style={{ fontWeight: 700, color: '#38bdf8', fontSize: '0.85rem' }}>
                                  v{ver.version}
                                </span>
                                <span
                                  style={{
                                    fontSize: '0.68rem',
                                    padding: '0.15rem 0.4rem',
                                    borderRadius: '4px',
                                    backgroundColor: '#334155',
                                    color: '#e2e8f0',
                                  }}
                                >
                                  {ver.format || 'JSON'}
                                </span>
                                <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                                  {ver.title || 'OpenAPI Spec'}
                                </span>
                              </div>

                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                                  {new Date(ver.createdAt).toLocaleDateString()}
                                </span>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteVersion(ver.id, ver.version);
                                  }}
                                  style={{
                                    background: 'none',
                                    border: 'none',
                                    color: '#f87171',
                                    fontSize: '0.75rem',
                                    cursor: 'pointer',
                                  }}
                                >
                                  Delete
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {selectedVersion && (
              <div className="table-card" style={{ padding: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <div>
                    <span style={{ fontSize: '0.72rem', color: '#38bdf8', fontWeight: 700 }}>
                      OPENAPI {selectedVersion.format} CONTRACT
                    </span>
                    <h3 style={{ margin: '0.2rem 0 0', color: '#f8fafc' }}>
                      {selectedVersion.title || selectedVersion.endpoint?.name} — v{selectedVersion.version}
                    </h3>
                  </div>
                  <button
                    onClick={() => setSelectedVersion(null)}
                    style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '1.1rem' }}
                  >
                    ✕
                  </button>
                </div>

                {selectedVersion.specHash && (
                  <div style={{ fontSize: '0.72rem', color: '#64748b', marginBottom: '1rem', fontFamily: 'monospace' }}>
                    SHA-256: {selectedVersion.specHash}
                  </div>
                )}

                <h4 style={{ fontSize: '0.875rem', color: '#e2e8f0', marginBottom: '0.5rem' }}>
                  Extracted Operations ({selectedVersion.operations?.length || 0})
                </h4>

                {selectedVersion.operations && selectedVersion.operations.length > 0 && (
                  <table className="endpoints-table" style={{ fontSize: '0.8rem', marginBottom: '1.25rem' }}>
                    <thead>
                      <tr>
                        <th>Method</th>
                        <th>Path</th>
                        <th>Params</th>
                        <th>Responses</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedVersion.operations.map((op, i) => (
                        <tr key={i}>
                          <td style={{ fontWeight: 700, color: '#38bdf8' }}>{op.method}</td>
                          <td style={{ fontFamily: 'monospace', color: '#f8fafc' }}>{op.path}</td>
                          <td>{op.parametersCount}</td>
                          <td>{op.responseCodes.join(', ')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                <h4 style={{ fontSize: '0.875rem', color: '#e2e8f0', marginBottom: '0.5rem' }}>
                  Raw Specification
                </h4>
                <pre
                  style={{
                    backgroundColor: '#020617',
                    border: '1px solid #334155',
                    borderRadius: '8px',
                    padding: '1rem',
                    color: '#94a3b8',
                    fontSize: '0.75rem',
                    maxHeight: '300px',
                    overflowY: 'auto',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {selectedVersion.specification}
                </pre>
              </div>
            )}
          </div>
        ) : (
          /* Breaking-Change Diff Analyzer Tab */
          <div>
            <div className="panel-card" style={{ marginBottom: '1.5rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', alignItems: 'flex-end' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.35rem' }}>
                    Select API Endpoint
                  </label>
                  <select
                    value={compareEndpointId}
                    onChange={(e) => handleSelectCompareEndpoint(e.target.value)}
                    style={{
                      width: '100%',
                      backgroundColor: '#1e293b',
                      border: '1px solid #334155',
                      borderRadius: '6px',
                      padding: '0.55rem',
                      color: '#f8fafc',
                    }}
                  >
                    {endpoints.map((ep) => (
                      <option key={ep.id} value={ep.id}>
                        {ep.name} ({ep.versions.length} versions)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.35rem' }}>
                    Baseline Version (v1)
                  </label>
                  <select
                    value={baselineId}
                    onChange={(e) => setBaselineId(e.target.value)}
                    style={{
                      width: '100%',
                      backgroundColor: '#1e293b',
                      border: '1px solid #334155',
                      borderRadius: '6px',
                      padding: '0.55rem',
                      color: '#f8fafc',
                    }}
                  >
                    {compareVersions.map((v) => (
                      <option key={v.id} value={v.id}>
                        v{v.version} ({v.format})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.35rem' }}>
                    Target Version (v2)
                  </label>
                  <select
                    value={targetId}
                    onChange={(e) => setTargetId(e.target.value)}
                    style={{
                      width: '100%',
                      backgroundColor: '#1e293b',
                      border: '1px solid #334155',
                      borderRadius: '6px',
                      padding: '0.55rem',
                      color: '#f8fafc',
                    }}
                  >
                    {compareVersions.map((v) => (
                      <option key={v.id} value={v.id}>
                        v{v.version} ({v.format})
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  onClick={handleRunCompare}
                  disabled={isComparing || compareVersions.length < 1}
                  style={{
                    backgroundColor: '#3b82f6',
                    color: '#ffffff',
                    border: 'none',
                    padding: '0.6rem 1.25rem',
                    borderRadius: '6px',
                    fontWeight: 600,
                    cursor: isComparing ? 'not-allowed' : 'pointer',
                  }}
                >
                  {isComparing ? 'Analyzing Contracts...' : '⚡ Run Diff Analysis'}
                </button>
              </div>
            </div>

            {diffReport && (
              <div>
                {/* Compatibility Summary Banner */}
                <div
                  style={{
                    padding: '1rem 1.25rem',
                    borderRadius: '10px',
                    marginBottom: '1.25rem',
                    backgroundColor: diffReport.isCompatible ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.15)',
                    border: `1px solid ${diffReport.isCompatible ? '#10b981' : '#ef4444'}`,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '1rem',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '1.05rem', color: diffReport.isCompatible ? '#34d399' : '#f87171' }}>
                      {diffReport.isCompatible
                        ? '✅ BACKWARD COMPATIBLE — No Breaking Changes Detected'
                        : `🚨 INCOMPATIBLE — ${diffReport.breakingCount} Breaking Change(s) Detected`}
                    </div>
                    <div style={{ fontSize: '0.85rem', color: '#cbd5e1', marginTop: '0.2rem' }}>
                      Comparing {diffReport.endpointName}: v{diffReport.baselineVersion} ➔ v{diffReport.targetVersion}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '1rem', fontSize: '0.85rem' }}>
                    <span style={{ color: '#f87171', fontWeight: 600 }}>Breaking: {diffReport.breakingCount}</span>
                    <span style={{ color: '#fbbf24', fontWeight: 600 }}>Potentially: {diffReport.potentiallyBreakingCount}</span>
                    <span style={{ color: '#34d399', fontWeight: 600 }}>Non-Breaking: {diffReport.nonBreakingCount}</span>
                  </div>
                </div>

                {/* Classification Filter Pills */}
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                  {['ALL', 'BREAKING', 'POTENTIALLY_BREAKING', 'NON_BREAKING'].map((cls) => (
                    <button
                      key={cls}
                      onClick={() => setDiffFilter(cls)}
                      style={{
                        padding: '0.4rem 0.85rem',
                        borderRadius: '6px',
                        fontSize: '0.78rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        border: diffFilter === cls ? '1px solid #3b82f6' : '1px solid #334155',
                        backgroundColor: diffFilter === cls ? '#1d4ed8' : '#1e293b',
                        color: diffFilter === cls ? '#ffffff' : '#94a3b8',
                      }}
                    >
                      {cls.replace('_', ' ')}
                    </button>
                  ))}
                </div>

                {/* Change Cards */}
                {filteredChanges.length === 0 ? (
                  <div className="panel-card" style={{ textAlign: 'center', color: '#94a3b8', padding: '2rem' }}>
                    No changes match the selected filter.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {filteredChanges.map((change) => {
                      const clsStyle = getClassificationStyle(change.classification);
                      return (
                        <div
                          key={change.id}
                          style={{
                            backgroundColor: '#1e293b',
                            border: `1px solid ${clsStyle.border}55`,
                            borderLeft: `4px solid ${clsStyle.border}`,
                            borderRadius: '8px',
                            padding: '1.1rem',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                              <span
                                style={{
                                  padding: '0.2rem 0.55rem',
                                  borderRadius: '4px',
                                  fontSize: '0.7rem',
                                  fontWeight: 700,
                                  backgroundColor: clsStyle.bg,
                                  color: clsStyle.color,
                                }}
                              >
                                {change.classification}
                              </span>
                              <span style={{ fontWeight: 700, color: '#38bdf8', fontSize: '0.85rem' }}>
                                {change.method}
                              </span>
                              <span style={{ fontFamily: 'monospace', color: '#f8fafc', fontSize: '0.85rem' }}>
                                {change.path}
                              </span>
                            </div>
                            <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontFamily: 'monospace' }}>
                              Rule: {change.rule}
                            </span>
                          </div>

                          <h4 style={{ margin: '0 0 0.35rem', color: '#f8fafc', fontSize: '1rem' }}>
                            {change.title}
                          </h4>
                          <p style={{ margin: '0 0 0.75rem', color: '#cbd5e1', fontSize: '0.85rem' }}>
                            {change.explanation}
                          </p>

                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                            <div style={{ backgroundColor: '#020617', padding: '0.6rem', borderRadius: '6px', fontSize: '0.75rem' }}>
                              <div style={{ color: '#94a3b8', marginBottom: '0.2rem' }}>Previous (v1)</div>
                              <code style={{ color: '#f87171' }}>{JSON.stringify(change.evidence?.previous)}</code>
                            </div>
                            <div style={{ backgroundColor: '#020617', padding: '0.6rem', borderRadius: '6px', fontSize: '0.75rem' }}>
                              <div style={{ color: '#94a3b8', marginBottom: '0.2rem' }}>Current (v2)</div>
                              <code style={{ color: '#34d399' }}>{JSON.stringify(change.evidence?.current)}</code>
                            </div>
                          </div>

                          <div style={{ fontSize: '0.8rem', color: '#93c5fd', backgroundColor: 'rgba(59, 130, 246, 0.1)', padding: '0.5rem 0.75rem', borderRadius: '6px' }}>
                            💡 <strong>Recommendation:</strong> {change.recommendation}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Upload OpenAPI Modal */}
      {isUploadOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            style={{
              backgroundColor: '#0f172a',
              border: '1px solid #334155',
              borderRadius: '12px',
              width: '90%',
              maxWidth: '640px',
              padding: '1.75rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0, color: '#f8fafc' }}>Upload OpenAPI 3.x Specification</h3>
              <button
                onClick={() => setIsUploadOpen(false)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '1.2rem', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            {uploadError && (
              <div
                style={{
                  backgroundColor: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid #ef4444',
                  color: '#f87171',
                  padding: '0.65rem',
                  borderRadius: '6px',
                  fontSize: '0.85rem',
                  marginBottom: '1rem',
                }}
              >
                {uploadError}
              </div>
            )}

            <form onSubmit={handleSubmitUpload}>
              <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div>
                  <label style={{ display: 'block', color: '#94a3b8', fontSize: '0.8rem', marginBottom: '0.3rem' }}>
                    Target API Endpoint *
                  </label>
                  <select
                    value={uploadEndpointId}
                    onChange={(e) => setUploadEndpointId(e.target.value)}
                    required
                    style={{
                      width: '100%',
                      backgroundColor: '#1e293b',
                      border: '1px solid #334155',
                      borderRadius: '6px',
                      padding: '0.55rem',
                      color: '#f8fafc',
                      fontSize: '0.85rem',
                    }}
                  >
                    {endpoints.map((ep) => (
                      <option key={ep.id} value={ep.id}>
                        {ep.name} ({ep.method})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', color: '#94a3b8', fontSize: '0.8rem', marginBottom: '0.3rem' }}>
                    Version Tag (Optional override)
                  </label>
                  <input
                    type="text"
                    placeholder="Auto from spec info.version"
                    value={uploadVersion}
                    onChange={(e) => setUploadVersion(e.target.value)}
                    style={{
                      width: '100%',
                      backgroundColor: '#1e293b',
                      border: '1px solid #334155',
                      borderRadius: '6px',
                      padding: '0.55rem',
                      color: '#f8fafc',
                      fontSize: '0.85rem',
                    }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <input
                  type="file"
                  accept=".json,.yaml,.yml"
                  onChange={handleFileUpload}
                  style={{ fontSize: '0.8rem', color: '#94a3b8' }}
                />
                <button
                  type="button"
                  onClick={loadSampleYaml}
                  style={{
                    backgroundColor: '#1e293b',
                    border: '1px solid #334155',
                    color: '#38bdf8',
                    padding: '0.35rem 0.7rem',
                    borderRadius: '6px',
                    fontSize: '0.75rem',
                    cursor: 'pointer',
                  }}
                >
                  Load Sample YAML v2
                </button>
              </div>

              <div style={{ marginBottom: '1.25rem' }}>
                <textarea
                  rows="10"
                  required
                  placeholder="Paste OpenAPI 3.0/3.1 JSON or YAML specification here..."
                  value={uploadSpecText}
                  onChange={(e) => setUploadSpecText(e.target.value)}
                  style={{
                    width: '100%',
                    backgroundColor: '#020617',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    padding: '0.75rem',
                    color: '#e2e8f0',
                    fontFamily: 'monospace',
                    fontSize: '0.78rem',
                    resize: 'vertical',
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button
                  type="button"
                  onClick={() => setIsUploadOpen(false)}
                  style={{
                    backgroundColor: '#1e293b',
                    border: '1px solid #334155',
                    color: '#94a3b8',
                    padding: '0.55rem 1rem',
                    borderRadius: '6px',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUploading}
                  style={{
                    backgroundColor: '#3b82f6',
                    color: '#ffffff',
                    border: 'none',
                    padding: '0.55rem 1.25rem',
                    borderRadius: '6px',
                    fontWeight: 500,
                    cursor: isUploading ? 'not-allowed' : 'pointer',
                  }}
                >
                  {isUploading ? 'Validating & Saving...' : 'Validate & Upload'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
