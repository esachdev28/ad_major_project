import React, { useEffect, useState } from 'react';
import Header from '../components/Header';
import {
  checkEndpointNow,
  checkHealth,
  createEndpoint,
  deleteEndpoint,
  getEndpoints,
  updateEndpoint,
} from '../services/api';

const emptyForm = {
  name: '',
  url: '',
  method: 'GET',
  description: '',
  expectedStatus: 200,
  interval: 60,
  timeout: 5000,
  headers: '',
};
const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'];

function EndpointForm({ endpoint, onClose, onSaved }) {
  const [form, setForm] = useState(
    endpoint
      ? {
          name: endpoint.name,
          url: endpoint.url,
          method: endpoint.method,
          description: endpoint.description || '',
          expectedStatus: endpoint.expectedStatus || 200,
          interval: endpoint.interval || 60,
          timeout: endpoint.timeout || 5000,
          headers: endpoint.headers ? (typeof endpoint.headers === 'string' ? endpoint.headers : JSON.stringify(endpoint.headers, null, 2)) : '',
        }
      : emptyForm
  );
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(event) {
    event.preventDefault();

    const name = form.name.trim();
    const url = form.url.trim();
    if (!name) {
      setError('API name is required.');
      return;
    }

    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch {
      setError('Enter a valid API URL.');
      return;
    }
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      setError('API URL must use HTTP or HTTPS.');
      return;
    }

    if (form.headers.trim()) {
      try {
        const headers = JSON.parse(form.headers);
        if (!headers || typeof headers !== 'object' || Array.isArray(headers)) {
          setError('Custom headers must be a JSON object.');
          return;
        }
      } catch {
        setError('Custom headers must be valid JSON.');
        return;
      }
    }

    const expectedStatus = Number(form.expectedStatus);
    const interval = Number(form.interval);
    const timeout = Number(form.timeout);
    if (!Number.isInteger(expectedStatus) || expectedStatus < 100 || expectedStatus > 599) {
      setError('Expected status code must be a whole number from 100 to 599.');
      return;
    }
    if (!Number.isInteger(interval) || interval < 5) {
      setError('Monitoring interval must be a whole number of at least 5 seconds.');
      return;
    }
    if (!Number.isInteger(timeout) || timeout < 100 || timeout > 30000) {
      setError('Timeout must be a whole number from 100 to 30000 milliseconds.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const endpointData = {
        ...form,
        name,
        url,
        description: form.description.trim(),
        expectedStatus,
        interval,
        timeout,
        headers: form.headers.trim(),
      };
      if (endpoint) await updateEndpoint(endpoint.id, endpointData);
      else await createEndpoint(endpointData);
      onSaved(
        endpoint
          ? 'API endpoint updated.'
          : 'API endpoint registered and initially probed.'
      );
    } catch (requestError) {
      setError(requestError.message || 'Unable to save API endpoint.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="endpoint-modal-backdrop" role="presentation">
      <section className="endpoint-modal" role="dialog" aria-modal="true" aria-labelledby="endpoint-form-title">
        <div className="panel-header">
          <h2 id="endpoint-form-title">{endpoint ? 'Edit API' : 'Register API'}</h2>
          <button type="button" className="endpoint-close" onClick={onClose} aria-label="Close form">
            ×
          </button>
        </div>
        <form onSubmit={submit} className="endpoint-form">
          <label>
            API Name
            <input
              required
              maxLength="120"
              placeholder="e.g. Payment Gateway"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
          </label>
          <label>
            API URL <span className="optional-label">(Protected by SSRF Guard)</span>
            <input
              required
              type="url"
              placeholder="https://example.com/api"
              value={form.url}
              onChange={(event) => setForm({ ...form, url: event.target.value })}
            />
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <label>
              HTTP Method
              <select
                required
                value={form.method}
                onChange={(event) => setForm({ ...form, method: event.target.value })}
              >
                {methods.map((method) => (
                  <option key={method}>{method}</option>
                ))}
              </select>
            </label>
            <label>
              Expected Status Code
              <input
                type="number"
                required
                min="100"
                max="599"
                step="1"
                value={form.expectedStatus}
                onChange={(event) => setForm({ ...form, expectedStatus: Number(event.target.value) })}
              />
            </label>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <label>
              Interval (seconds)
              <input
                type="number"
                required
                min="5"
                step="1"
                value={form.interval}
                onChange={(event) => setForm({ ...form, interval: Number(event.target.value) })}
              />
            </label>
            <label>
              Timeout (ms)
              <input
                type="number"
                required
                min="100"
                max="30000"
                step="1"
                value={form.timeout}
                onChange={(event) => setForm({ ...form, timeout: Number(event.target.value) })}
              />
            </label>
          </div>
          <label>
            Custom Headers <span className="optional-label">(optional JSON, encrypted at rest)</span>
            <textarea
              rows="2"
              placeholder='{"Authorization": "Bearer token", "X-Api-Key": "secret"}'
              value={form.headers}
              onChange={(event) => setForm({ ...form, headers: event.target.value })}
              style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}
            />
          </label>
          <label>
            Description <span className="optional-label">(optional)</span>
            <textarea
              rows="2"
              maxLength="1000"
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
            />
          </label>
          {error && (
            <p className="endpoint-error" role="alert">
              {error}
            </p>
          )}
          <div className="endpoint-form-actions">
            <button type="button" className="endpoint-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="endpoint-primary" disabled={saving}>
              {saving ? 'Validating & Saving...' : endpoint ? 'Save changes' : 'Register & Probe'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

export default function Endpoints({ onEndpointsChanged }) {
  const [endpoints, setEndpoints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [formEndpoint, setFormEndpoint] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [backendStatus, setBackendStatus] = useState('checking');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'healthy' | 'failing'
  const [probingId, setProbingId] = useState(null);

  async function loadEndpoints() {
    setLoading(true);
    setError('');
    try {
      const result = await getEndpoints();
      setEndpoints(result.data || []);
    } catch (requestError) {
      setEndpoints([]);
      setError(requestError.message || 'Unable to load API endpoints. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadEndpoints();
    checkHealth()
      .then((result) => setBackendStatus(result.success ? 'online' : 'offline'))
      .catch(() => setBackendStatus('offline'));
  }, []);

  async function saveSucceeded(successMessage) {
    setShowForm(false);
    setFormEndpoint(null);
    setMessage(successMessage);
    await loadEndpoints();
    onEndpointsChanged?.();
  }

  async function probeEndpoint(endpoint) {
    setProbingId(endpoint.id);
    setMessage('');
    setError('');
    try {
      const result = await checkEndpointNow(endpoint.id);
      if (result.data?.isHealthy) {
        setMessage(`${endpoint.name}: ${result.message}`);
      } else {
        setError(`${endpoint.name}: ${result.message}`);
      }
      await loadEndpoints();
      onEndpointsChanged?.();
    } catch (requestError) {
      setError(requestError.message || 'Unable to probe API endpoint.');
    } finally {
      setProbingId(null);
    }
  }

  async function removeEndpoint(endpoint) {
    const confirmed = window.confirm(
      `Delete "${endpoint.name}"? Associated health checks, incidents, and API versions may also be deleted.`
    );
    if (!confirmed) return;
    setMessage('');
    try {
      await deleteEndpoint(endpoint.id);
      setMessage('API endpoint deleted.');
      await loadEndpoints();
      onEndpointsChanged?.();
    } catch (requestError) {
      setError(requestError.message || 'Unable to delete API endpoint.');
    }
  }

  function openEdit(endpoint) {
    setFormEndpoint(endpoint);
    setShowForm(true);
  }
  function closeForm() {
    setShowForm(false);
    setFormEndpoint(null);
  }

  const filtered = endpoints.filter((ep) => {
    const matchesSearch =
      ep.name.toLowerCase().includes(search.toLowerCase()) ||
      ep.url.toLowerCase().includes(search.toLowerCase());
    if (!matchesSearch) return false;
    if (statusFilter === 'healthy') return ep.latestCheck?.isHealthy === true;
    if (statusFilter === 'failing') return ep.latestCheck?.isHealthy === false;
    return true;
  });

  return (
    <div className="main-wrapper">
      <Header
        backendStatus={backendStatus}
        onRefresh={loadEndpoints}
        isRefreshing={loading}
        title="API Endpoints"
        subtitle="Register, secure, and manually probe API endpoints."
      />
      <main className="dashboard-content endpoints-content">
        <div className="endpoints-heading">
          <div>
            <h2>API Endpoints ({filtered.length})</h2>
            <p>Register and manage endpoints with SSRF protection and manual health probes.</p>
          </div>
          <button
            className="endpoint-primary"
            onClick={() => {
              setFormEndpoint(null);
              setShowForm(true);
            }}
          >
            ＋ Add API
          </button>
        </div>

        {/* Search & Status Filters */}
        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            type="text"
            placeholder="Search endpoints by name or URL..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              flex: 1,
              minWidth: '220px',
              backgroundColor: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '8px',
              padding: '0.55rem 0.85rem',
              color: '#f8fafc',
              fontSize: '0.875rem',
            }}
          />
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            {['all', 'healthy', 'failing'].map((f) => (
              <button
                key={f}
                onClick={() => setStatusFilter(f)}
                className={statusFilter === f ? 'endpoint-primary' : 'endpoint-secondary'}
                style={{ textTransform: 'capitalize', padding: '0.45rem 0.85rem', fontSize: '0.8rem' }}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {message && (
          <p className="endpoint-success" role="status">
            {message}
          </p>
        )}
        {error && (
          <div className="endpoint-error endpoint-list-error" role="alert">
            {error}
            <button onClick={loadEndpoints}>Retry</button>
          </div>
        )}
        <section className="panel-card">
          {loading ? (
            <p className="endpoint-state">Loading API endpoints...</p>
          ) : error ? null : filtered.length === 0 && endpoints.length > 0 ? (
            <p className="endpoint-state">No endpoints match your search or status filter.</p>
          ) : endpoints.length === 0 ? (
            <p className="endpoint-state">No API endpoints registered yet. Add your first endpoint.</p>
          ) : (
            <div className="endpoint-list">
              {filtered.map((endpoint) => {
                const check = endpoint.latestCheck;
                return (
                  <article className="endpoint-row" key={endpoint.id}>
                    <div className="endpoint-details">
                      <div className="endpoint-title-line">
                        <h3>{endpoint.name}</h3>
                        <span className={`api-method method-${endpoint.method.toLowerCase()}`}>
                          {endpoint.method}
                        </span>
                        {check ? (
                          <span className={`pill-status ${check.isHealthy ? 'healthy' : 'failed'}`}>
                            ● {check.isHealthy ? `Healthy (${check.statusCode})` : `Failing (${check.statusCode || 'ERR'})`}
                          </span>
                        ) : (
                          <span className="monitoring-unknown">NOT MONITORED</span>
                        )}
                        {check?.latency && (
                          <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
                            ⚡ {check.latency} ms
                          </span>
                        )}
                      </div>
                      <a className="endpoint-url" href={endpoint.url} target="_blank" rel="noreferrer">
                        {endpoint.url}
                      </a>
                      {endpoint.description && (
                        <p className="endpoint-description">{endpoint.description}</p>
                      )}
                      <p className="endpoint-date">
                        Uptime: {endpoint.uptime ?? '—'}{endpoint.uptime != null ? '%' : ''} · Expected HTTP {endpoint.expectedStatus || 200} · Interval {endpoint.interval || 60}s
                      </p>
                    </div>
                    <div className="endpoint-actions">
                      <button
                        className="endpoint-primary"
                        disabled={probingId === endpoint.id}
                        onClick={() => probeEndpoint(endpoint)}
                      >
                        {probingId === endpoint.id ? 'Probing...' : '⚡ Probe Now'}
                      </button>
                      <button className="endpoint-secondary" onClick={() => openEdit(endpoint)}>
                        Edit
                      </button>
                      <button className="endpoint-danger" onClick={() => removeEndpoint(endpoint)}>
                        Delete
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </main>
      {showForm && (
        <EndpointForm endpoint={formEndpoint} onClose={closeForm} onSaved={saveSucceeded} />
      )}
    </div>
  );
}
