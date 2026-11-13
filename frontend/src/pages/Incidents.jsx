import React, { useState, useEffect, useCallback } from 'react';
import Header from '../components/Header';
import {
  getIncidents,
  getIncidentById,
  acknowledgeIncident,
  resolveIncident,
  checkHealth,
} from '../services/api';

export default function Incidents() {
  const [incidents, setIncidents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [backendStatus, setBackendStatus] = useState('checking');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [severityFilter, setSeverityFilter] = useState('ALL');
  const [selectedIncident, setSelectedIncident] = useState(null);
  const [alert, setAlert] = useState(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [healthRes, incRes] = await Promise.allSettled([
        checkHealth(),
        getIncidents({ status: statusFilter, severity: severityFilter }),
      ]);

      if (healthRes.status === 'fulfilled' && healthRes.value.success) {
        setBackendStatus('online');
      } else {
        setBackendStatus('offline');
      }

      if (incRes.status === 'fulfilled' && incRes.value.success) {
        setIncidents(incRes.value.data || []);
      }
    } catch (err) {
      setBackendStatus('offline');
      setAlert({ type: 'error', message: err.message || 'Failed to load incidents' });
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter, severityFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleAcknowledge = async (id, e) => {
    e.stopPropagation();
    try {
      const res = await acknowledgeIncident(id);
      if (res.success) {
        setAlert({ type: 'success', message: res.message });
        loadData();
        if (selectedIncident?.id === id) {
          const updated = await getIncidentById(id);
          if (updated.success) setSelectedIncident(updated.data);
        }
      }
    } catch (err) {
      setAlert({ type: 'error', message: err.message });
    }
  };

  const handleResolve = async (id, e) => {
    e.stopPropagation();
    try {
      const res = await resolveIncident(id);
      if (res.success) {
        setAlert({ type: 'success', message: res.message });
        loadData();
        if (selectedIncident?.id === id) {
          const updated = await getIncidentById(id);
          if (updated.success) setSelectedIncident(updated.data);
        }
      }
    } catch (err) {
      setAlert({ type: 'error', message: err.message });
    }
  };

  const handleInspectIncident = async (id) => {
    try {
      const res = await getIncidentById(id);
      if (res.success) {
        setSelectedIncident(res.data);
      }
    } catch (err) {
      setAlert({ type: 'error', message: err.message });
    }
  };

  const getSeverityBadgeStyle = (sev) => {
    if (sev === 'CRITICAL') return { bg: 'rgba(239, 68, 68, 0.2)', color: '#f87171', border: '#ef4444' };
    if (sev === 'HIGH') return { bg: 'rgba(249, 115, 22, 0.2)', color: '#fb923c', border: '#f97316' };
    return { bg: 'rgba(234, 179, 8, 0.2)', color: '#facc15', border: '#eab308' };
  };

  const getStatusBadgeStyle = (st) => {
    if (st === 'OPEN') return { bg: 'rgba(239, 68, 68, 0.15)', color: '#f87171' };
    if (st === 'ACKNOWLEDGED') return { bg: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24' };
    return { bg: 'rgba(16, 185, 129, 0.15)', color: '#34d399' };
  };

  return (
    <div className="main-wrapper">
      <Header
        backendStatus={backendStatus}
        onRefresh={loadData}
        isRefreshing={isLoading}
        title="Incidents"
        subtitle="Automated threshold alerting, deduplication, and recovery tracking."
      />

      <div className="dashboard-content">
        <div style={{ marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: '1.35rem', fontWeight: 600, color: '#f8fafc', margin: 0 }}>
            Incident Detection & Response
          </h2>
          <p style={{ color: '#94a3b8', fontSize: '0.875rem', marginTop: '0.25rem' }}>
            Automated threshold alerting, incident deduplication, and recovery lifecycle tracking.
          </p>
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
            <button
              onClick={() => setAlert(null)}
              style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}
            >
              ✕
            </button>
          </div>
        )}

        {/* Filter Controls */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {['ALL', 'OPEN', 'ACKNOWLEDGED', 'RESOLVED'].map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                style={{
                  padding: '0.45rem 0.85rem',
                  borderRadius: '6px',
                  fontSize: '0.8rem',
                  fontWeight: 500,
                  cursor: 'pointer',
                  border: statusFilter === st ? '1px solid #3b82f6' : '1px solid #334155',
                  backgroundColor: statusFilter === st ? '#1d4ed8' : '#1e293b',
                  color: statusFilter === st ? '#ffffff' : '#94a3b8',
                }}
              >
                {st}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Severity:</span>
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              style={{
                backgroundColor: '#1e293b',
                border: '1px solid #334155',
                color: '#f8fafc',
                padding: '0.4rem 0.75rem',
                borderRadius: '6px',
                fontSize: '0.8rem',
              }}
            >
              <option value="ALL">All Severities</option>
              <option value="CRITICAL">CRITICAL</option>
              <option value="HIGH">HIGH</option>
              <option value="MEDIUM">MEDIUM</option>
            </select>
          </div>
        </div>

        {/* Incidents Table */}
        <div className="table-card">
          <div className="table-header">
            <h3>Tracked Incidents ({incidents.length})</h3>
            <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
              Click any row to inspect timeline
            </span>
          </div>

          {isLoading ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>
              Loading incidents...
            </div>
          ) : incidents.length === 0 ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
              <p style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>No incidents match your filter</p>
              <p style={{ fontSize: '0.85rem' }}>All monitored endpoints are currently operating within healthy thresholds.</p>
            </div>
          ) : (
            <table className="endpoints-table">
              <thead>
                <tr>
                  <th>Severity</th>
                  <th>Incident Title & Target</th>
                  <th>Status</th>
                  <th>Occurrences</th>
                  <th>Last Failure</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {incidents.map((inc) => {
                  const sevStyle = getSeverityBadgeStyle(inc.severity);
                  const stStyle = getStatusBadgeStyle(inc.status);

                  return (
                    <tr
                      key={inc.id}
                      onClick={() => handleInspectIncident(inc.id)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td>
                        <span
                          style={{
                            padding: '0.2rem 0.55rem',
                            borderRadius: '4px',
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            backgroundColor: sevStyle.bg,
                            color: sevStyle.color,
                            border: `1px solid ${sevStyle.border}`,
                          }}
                        >
                          {inc.severity}
                        </span>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600, color: '#f8fafc' }}>{inc.title}</div>
                        <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                          {inc.endpoint?.name} ({inc.endpoint?.method} {inc.endpoint?.url})
                        </div>
                      </td>
                      <td>
                        <span
                          style={{
                            padding: '0.25rem 0.65rem',
                            borderRadius: '9999px',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            backgroundColor: stStyle.bg,
                            color: stStyle.color,
                          }}
                        >
                          {inc.status}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontWeight: 600, color: '#e2e8f0' }}>
                          {inc.occurrenceCount || 1}x
                        </span>
                      </td>
                      <td>
                        <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                          {new Date(inc.lastFailureAt || inc.createdAt).toLocaleString()}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                          {inc.status === 'OPEN' && (
                            <button
                              onClick={(e) => handleAcknowledge(inc.id, e)}
                              style={{
                                backgroundColor: '#1e293b',
                                border: '1px solid #f59e0b',
                                color: '#fbbf24',
                                padding: '0.35rem 0.65rem',
                                borderRadius: '6px',
                                fontSize: '0.75rem',
                                cursor: 'pointer',
                              }}
                            >
                              Acknowledge
                            </button>
                          )}
                          {inc.status !== 'RESOLVED' && (
                            <button
                              onClick={(e) => handleResolve(inc.id, e)}
                              style={{
                                backgroundColor: '#1e293b',
                                border: '1px solid #10b981',
                                color: '#34d399',
                                padding: '0.35rem 0.65rem',
                                borderRadius: '6px',
                                fontSize: '0.75rem',
                                cursor: 'pointer',
                              }}
                            >
                              Resolve
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Incident Timeline Detail Modal */}
      {selectedIncident && (
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
          onClick={() => setSelectedIncident(null)}
        >
          <div
            style={{
              backgroundColor: '#0f172a',
              border: '1px solid #334155',
              borderRadius: '12px',
              width: '90%',
              maxWidth: '680px',
              maxHeight: '85vh',
              overflowY: 'auto',
              padding: '1.75rem',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
              <div>
                <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>INCIDENT DETAIL</span>
                <h3 style={{ margin: '0.25rem 0 0', color: '#f8fafc', fontSize: '1.25rem' }}>
                  {selectedIncident.title}
                </h3>
              </div>
              <button
                onClick={() => setSelectedIncident(null)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '1.2rem', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <div style={{ backgroundColor: '#1e293b', padding: '1rem', borderRadius: '8px', marginBottom: '1.25rem', fontSize: '0.875rem', color: '#cbd5e1', whiteSpace: 'pre-line' }}>
              {selectedIncident.description || 'No description provided.'}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem', fontSize: '0.8rem' }}>
              <div style={{ backgroundColor: '#1e293b', padding: '0.65rem', borderRadius: '6px' }}>
                <div style={{ color: '#94a3b8' }}>Status</div>
                <div style={{ color: '#f8fafc', fontWeight: 600, marginTop: '0.2rem' }}>{selectedIncident.status}</div>
              </div>
              <div style={{ backgroundColor: '#1e293b', padding: '0.65rem', borderRadius: '6px' }}>
                <div style={{ color: '#94a3b8' }}>Occurrences</div>
                <div style={{ color: '#f8fafc', fontWeight: 600, marginTop: '0.2rem' }}>{selectedIncident.occurrenceCount} failures</div>
              </div>
              <div style={{ backgroundColor: '#1e293b', padding: '0.65rem', borderRadius: '6px' }}>
                <div style={{ color: '#94a3b8' }}>Opened At</div>
                <div style={{ color: '#f8fafc', fontWeight: 600, marginTop: '0.2rem' }}>{new Date(selectedIncident.createdAt).toLocaleTimeString()}</div>
              </div>
              {selectedIncident.resolvedAt && (
                <div style={{ backgroundColor: '#1e293b', padding: '0.65rem', borderRadius: '6px' }}>
                  <div style={{ color: '#94a3b8' }}>Resolved At</div>
                  <div style={{ color: '#34d399', fontWeight: 600, marginTop: '0.2rem' }}>{new Date(selectedIncident.resolvedAt).toLocaleTimeString()}</div>
                </div>
              )}
            </div>

            <h4 style={{ color: '#f8fafc', fontSize: '0.95rem', marginBottom: '0.75rem' }}>
              Recent Health Probes ({selectedIncident.endpoint?.healthChecks?.length || 0})
            </h4>
            <div style={{ maxHeight: '220px', overflowY: 'auto', border: '1px solid #334155', borderRadius: '8px' }}>
              <table className="endpoints-table" style={{ fontSize: '0.8rem' }}>
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Status</th>
                    <th>Latency</th>
                    <th>Outcome / Error</th>
                  </tr>
                </thead>
                <tbody>
                  {(selectedIncident.endpoint?.healthChecks || []).map((c) => (
                    <tr key={c.id}>
                      <td>{new Date(c.checkedAt).toLocaleTimeString()}</td>
                      <td>
                        <span style={{ color: c.isHealthy ? '#34d399' : '#f87171', fontWeight: 600 }}>
                          {c.statusCode || 'ERR'}
                        </span>
                      </td>
                      <td>{c.latency} ms</td>
                      <td style={{ color: '#94a3b8' }}>
                        {c.isHealthy ? 'Healthy' : c.errorMessage || 'Failed'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
