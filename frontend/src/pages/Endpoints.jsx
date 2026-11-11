import React, { useEffect, useState } from 'react';
import Header from '../components/Header';
import { checkHealth, createEndpoint, deleteEndpoint, getEndpoints, updateEndpoint } from '../services/api';

const emptyForm = { name: '', url: '', method: 'GET', description: '' };
const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

function EndpointForm({ endpoint, onClose, onSaved }) {
  const [form, setForm] = useState(endpoint
    ? {
        name: endpoint.name,
        url: endpoint.url,
        method: endpoint.method,
        description: endpoint.description || '',
      }
    : emptyForm);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (endpoint) await updateEndpoint(endpoint.id, form);
      else await createEndpoint(form);
      onSaved(endpoint ? 'API endpoint updated.' : 'API endpoint created.');
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
          <h2 id="endpoint-form-title">{endpoint ? 'Edit API' : 'Add API'}</h2>
          <button type="button" className="endpoint-close" onClick={onClose} aria-label="Close form">×</button>
        </div>
        <form onSubmit={submit} className="endpoint-form">
          <label>
            API Name
            <input required maxLength="120" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          </label>
          <label>
            API URL
            <input required type="url" placeholder="https://example.com/api" value={form.url} onChange={(event) => setForm({ ...form, url: event.target.value })} />
          </label>
          <label>
            HTTP Method
            <select required value={form.method} onChange={(event) => setForm({ ...form, method: event.target.value })}>
              {methods.map((method) => <option key={method}>{method}</option>)}
            </select>
          </label>
          <label>
            Description <span className="optional-label">(optional)</span>
            <textarea rows="3" maxLength="1000" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
          </label>
          {error && <p className="endpoint-error" role="alert">{error}</p>}
          <div className="endpoint-form-actions">
            <button type="button" className="endpoint-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="endpoint-primary" disabled={saving}>
              {saving ? 'Saving...' : endpoint ? 'Save changes' : 'Register API'}
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

  async function loadEndpoints() {
    setLoading(true);
    setError('');
    try {
      const result = await getEndpoints();
      setEndpoints(result.data);
    } catch (requestError) {
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
    onEndpointsChanged();
  }

  async function removeEndpoint(endpoint) {
    const confirmed = window.confirm(`Delete "${endpoint.name}"? Associated health checks, incidents, and API versions may also be deleted.`);
    if (!confirmed) return;
    setMessage('');
    try {
      await deleteEndpoint(endpoint.id);
      setMessage('API endpoint deleted.');
      await loadEndpoints();
      onEndpointsChanged();
    } catch (requestError) {
      setError(requestError.message || 'Unable to delete API endpoint.');
    }
  }

  function openEdit(endpoint) { setFormEndpoint(endpoint); setShowForm(true); }
  function closeForm() { setShowForm(false); setFormEndpoint(null); }

  return (
    <div className="main-layout">
      <Header backendStatus={backendStatus} title="API Endpoints" subtitle="Register and manage API endpoint records." />
      <main className="dashboard-content endpoints-content">
        <div className="endpoints-heading">
          <div>
            <h2>API Endpoints</h2>
            <p>Register and manage the APIs you want to keep track of.</p>
          </div>
          <button className="endpoint-primary" onClick={() => { setFormEndpoint(null); setShowForm(true); }}>
            ＋ Add API
          </button>
        </div>
        {message && <p className="endpoint-success" role="status">{message}</p>}
        {error && (
          <div className="endpoint-error endpoint-list-error" role="alert">
            {error}
            <button onClick={loadEndpoints}>Retry</button>
          </div>
        )}
        <section className="panel-card">
          {loading ? (
            <p className="endpoint-state">Loading API endpoints...</p>
          ) : endpoints.length === 0 ? (
            <p className="endpoint-state">No APIs registered yet. Add your first API endpoint.</p>
          ) : (
            <div className="endpoint-list">
              {endpoints.map((endpoint) => (
                <article className="endpoint-row" key={endpoint.id}>
                  <div className="endpoint-details">
                    <div className="endpoint-title-line">
                      <h3>{endpoint.name}</h3>
                      <span className={`api-method method-${endpoint.method.toLowerCase()}`}>{endpoint.method}</span>
                      <span className="monitoring-unknown">NOT MONITORED</span>
                    </div>
                    <a className="endpoint-url" href={endpoint.url} target="_blank" rel="noreferrer">{endpoint.url}</a>
                    {endpoint.description && <p className="endpoint-description">{endpoint.description}</p>}
                    <p className="endpoint-date">Created {new Date(endpoint.createdAt).toLocaleDateString()}</p>
                  </div>
                  <div className="endpoint-actions">
                    <button className="endpoint-secondary" onClick={() => openEdit(endpoint)}>Edit</button>
                    <button className="endpoint-danger" onClick={() => removeEndpoint(endpoint)}>Delete</button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>
      {showForm && <EndpointForm endpoint={formEndpoint} onClose={closeForm} onSaved={saveSucceeded} />}
    </div>
  );
}
