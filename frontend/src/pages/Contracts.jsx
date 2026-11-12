import React, { useState, useEffect, useCallback } from 'react';
import Header from '../components/Header';
import {
  getContracts,
  getContractVersion,
  uploadContract,
  deleteContractVersion,
  checkHealth,
} from '../services/api';

export default function Contracts() {
  const [endpoints, setEndpoints] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [backendStatus, setBackendStatus] = useState('checking');
  const [selectedVersion, setSelectedVersion] = useState(null);
  const [alert, setAlert] = useState(null);

  // Upload Modal State
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [uploadEndpointId, setUploadEndpointId] = useState('');
  const [uploadVersion, setUploadVersion] = useState('');
  const [uploadSpecText, setUploadSpecText] = useState('');
  const [uploadError, setUploadError] = useState(null);
  const [isUploading, setIsUploading] = useState(false);

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
        if (list.length > 0 && !uploadEndpointId) {
          setUploadEndpointId(list[0].id);
        }
      }
    } catch (err) {
      setBackendStatus('offline');
      setAlert({ type: 'error', message: err.message });
    } finally {
      setIsLoading(false);
    }
  }, [uploadEndpointId]);

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

  return (
    <div className="main-wrapper">
      <Header
        backendStatus={backendStatus}
        onRefresh={loadData}
        isRefreshing={isLoading}
        title="Contract Registry"
        subtitle="Upload, validate, and version OpenAPI 3.0/3.1 JSON & YAML contracts."
      />

      <div className="dashboard-content">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h2 style={{ fontSize: '1.35rem', fontWeight: 600, color: '#f8fafc', margin: 0 }}>
              API Contract Registry
            </h2>
            <p style={{ color: '#94a3b8', fontSize: '0.875rem', marginTop: '0.25rem' }}>
              Upload, validate, and version OpenAPI 3.0/3.1 JSON & YAML contracts with SHA-256 deduplication.
            </p>
          </div>

          <button
            onClick={() => setIsUploadOpen(true)}
            style={{
              backgroundColor: '#3b82f6',
              color: '#ffffff',
              border: 'none',
              padding: '0.6rem 1.25rem',
              borderRadius: '8px',
              fontWeight: 500,
              fontSize: '0.875rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <span>+</span> Upload OpenAPI Spec
          </button>
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

        <div style={{ display: 'grid', gridTemplateColumns: selectedVersion ? '1fr 1.2fr' : '1fr', gap: '1.5rem' }}>
          {/* Left Panel: Endpoints & Contract Versions */}
          <div className="table-card">
            <div className="table-header">
              <h3>Endpoints & Contract Versions</h3>
              <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Select version to inspect</span>
            </div>

            {isLoading ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>Loading contracts...</div>
            ) : endpoints.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>
                No endpoints registered. Register an endpoint first before uploading OpenAPI contracts.
              </div>
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

          {/* Right Panel: Selected Contract Inspector */}
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
