/**
 * components/AuthModal.jsx
 *
 * Full-featured Authentication & Organization workspace modal for API Sentinel:
 * - Login & Register tabs with validation
 * - Active Organization switching & new organization creation
 * - Seamless session management with JWT tokens
 */

import React, { useState } from 'react';
import {
  loginUser,
  registerUser,
  createOrganization,
  switchOrganization,
  logoutUser,
} from '../services/api';

export default function AuthModal({ isOpen, onClose, currentUser, onAuthSuccess }) {
  const [tab, setTab] = useState(currentUser ? 'profile' : 'login'); // 'login' | 'register' | 'profile'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Form states
  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [registerForm, setRegisterForm] = useState({
    name: '',
    email: '',
    password: '',
    organizationName: '',
  });
  const [newOrgName, setNewOrgName] = useState('');

  if (!isOpen) return null;

  async function handleLogin(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const res = await loginUser(loginForm);
      setSuccess('Signed in successfully.');
      onAuthSuccess?.(res);
      setTimeout(onClose, 600);
    } catch (err) {
      setError(err.message || 'Login failed.');
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const res = await registerUser(registerForm);
      setSuccess('Account and organization created.');
      onAuthSuccess?.(res);
      setTimeout(onClose, 600);
    } catch (err) {
      setError(err.message || 'Registration failed.');
    } finally {
      setLoading(false);
    }
  }

  async function handleSwitchOrg(orgId) {
    setLoading(true);
    setError('');
    try {
      const res = await switchOrganization(orgId);
      onAuthSuccess?.(res);
    } catch (err) {
      setError(err.message || 'Failed to switch organization.');
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateOrg(e) {
    e.preventDefault();
    if (!newOrgName.trim()) return;
    setLoading(true);
    setError('');
    try {
      await createOrganization(newOrgName.trim());
      setNewOrgName('');
      setSuccess('Organization created! Switch to it below.');
      onAuthSuccess?.();
    } catch (err) {
      setError(err.message || 'Failed to create organization.');
    } finally {
      setLoading(false);
    }
  }

  function handleLogout() {
    logoutUser();
    onAuthSuccess?.(null);
    onClose();
  }

  return (
    <div className="endpoint-modal-backdrop" role="presentation">
      <section
        className="endpoint-modal"
        role="dialog"
        aria-modal="true"
        style={{ width: 'min(100%, 480px)' }}
      >
        <div className="panel-header" style={{ marginBottom: '1.25rem' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', color: '#f8fafc' }}>
              {currentUser ? 'Organization & Profile' : 'API Sentinel Authentication'}
            </h2>
            <p style={{ color: '#94a3b8', fontSize: '0.8rem', marginTop: '0.2rem' }}>
              {currentUser
                ? `Logged in as ${currentUser.user?.email || currentUser.email}`
                : 'Sign in to access your organization workspace & scoped APIs'}
            </p>
          </div>
          <button type="button" className="endpoint-close" onClick={onClose}>
            ×
          </button>
        </div>

        {/* Tab Selector */}
        {!currentUser && (
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', borderBottom: '1px solid #1e293b', paddingBottom: '0.5rem' }}>
            <button
              type="button"
              onClick={() => { setTab('login'); setError(''); }}
              style={{
                flex: 1,
                padding: '0.5rem',
                borderRadius: '6px',
                border: 'none',
                background: tab === 'login' ? 'rgba(59, 130, 246, 0.2)' : 'transparent',
                color: tab === 'login' ? '#60a5fa' : '#94a3b8',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => { setTab('register'); setError(''); }}
              style={{
                flex: 1,
                padding: '0.5rem',
                borderRadius: '6px',
                border: 'none',
                background: tab === 'register' ? 'rgba(59, 130, 246, 0.2)' : 'transparent',
                color: tab === 'register' ? '#60a5fa' : '#94a3b8',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Create Account
            </button>
          </div>
        )}

        {error && (
          <div className="endpoint-error" style={{ marginBottom: '1rem', fontSize: '0.85rem' }}>
            {error}
          </div>
        )}
        {success && (
          <div className="endpoint-success" style={{ marginBottom: '1rem', fontSize: '0.85rem' }}>
            {success}
          </div>
        )}

        {/* Tab 1: Sign In */}
        {!currentUser && tab === 'login' && (
          <form onSubmit={handleLogin} className="endpoint-form">
            <label>
              Email Address
              <input
                required
                type="email"
                placeholder="developer@company.com"
                value={loginForm.email}
                onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })}
              />
            </label>
            <label>
              Password
              <input
                required
                type="password"
                placeholder="••••••••"
                value={loginForm.password}
                onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
              />
            </label>
            <div className="endpoint-form-actions" style={{ marginTop: '0.75rem' }}>
              <button type="button" className="endpoint-secondary" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="endpoint-primary" disabled={loading}>
                {loading ? 'Authenticating...' : 'Sign In'}
              </button>
            </div>
          </form>
        )}

        {/* Tab 2: Register */}
        {!currentUser && tab === 'register' && (
          <form onSubmit={handleRegister} className="endpoint-form">
            <label>
              Your Full Name
              <input
                required
                type="text"
                placeholder="Alex Developer"
                value={registerForm.name}
                onChange={(e) => setRegisterForm({ ...registerForm, name: e.target.value })}
              />
            </label>
            <label>
              Email Address
              <input
                required
                type="email"
                placeholder="alex@acme-corp.com"
                value={registerForm.email}
                onChange={(e) => setRegisterForm({ ...registerForm, email: e.target.value })}
              />
            </label>
            <label>
              Password <span className="optional-label">(min. 6 characters)</span>
              <input
                required
                type="password"
                minLength="6"
                placeholder="••••••••"
                value={registerForm.password}
                onChange={(e) => setRegisterForm({ ...registerForm, password: e.target.value })}
              />
            </label>
            <label>
              Organization / Workspace Name
              <input
                type="text"
                placeholder="e.g. Acme Platform Engineering"
                value={registerForm.organizationName}
                onChange={(e) => setRegisterForm({ ...registerForm, organizationName: e.target.value })}
              />
            </label>
            <div className="endpoint-form-actions" style={{ marginTop: '0.75rem' }}>
              <button type="button" className="endpoint-secondary" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="endpoint-primary" disabled={loading}>
                {loading ? 'Creating Account...' : 'Register Organization'}
              </button>
            </div>
          </form>
        )}

        {/* Tab 3: Logged In Profile & Organization Management */}
        {currentUser && (
          <div>
            <div style={{ backgroundColor: '#0d121c', padding: '1rem', borderRadius: '8px', border: '1px solid #1e293b', marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h4 style={{ color: '#f8fafc', fontSize: '0.95rem' }}>{currentUser.user?.name || currentUser.name}</h4>
                  <p style={{ color: '#94a3b8', fontSize: '0.8rem' }}>{currentUser.user?.email || currentUser.email}</p>
                </div>
                <span
                  style={{
                    backgroundColor: 'rgba(59, 130, 246, 0.15)',
                    color: '#60a5fa',
                    border: '1px solid #3b82f6',
                    padding: '0.2rem 0.6rem',
                    borderRadius: '9999px',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                  }}
                >
                  {currentUser.role || 'MEMBER'}
                </span>
              </div>
            </div>

            <h4 style={{ fontSize: '0.9rem', color: '#f8fafc', marginBottom: '0.5rem' }}>
              Your Organizations
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.25rem' }}>
              {(currentUser.organizations || []).map((org) => {
                const isActive = (currentUser.activeOrganization?.id || currentUser.organization?.id) === org.id;
                return (
                  <div
                    key={org.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '0.65rem 0.85rem',
                      borderRadius: '6px',
                      backgroundColor: isActive ? 'rgba(16, 185, 129, 0.12)' : '#101623',
                      border: `1px solid ${isActive ? '#10b981' : '#1e293b'}`,
                    }}
                  >
                    <div>
                      <div style={{ color: '#f8fafc', fontWeight: 600, fontSize: '0.85rem' }}>
                        {org.name}
                      </div>
                      <div style={{ color: '#64748b', fontSize: '0.75rem' }}>
                        Slug: {org.slug} · Role: {org.role}
                      </div>
                    </div>
                    {isActive ? (
                      <span style={{ color: '#34d399', fontSize: '0.75rem', fontWeight: 600 }}>
                        ● Active
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleSwitchOrg(org.id)}
                        disabled={loading}
                        className="endpoint-secondary"
                        style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
                      >
                        Switch
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Create New Org */}
            <form onSubmit={handleCreateOrg} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
              <input
                type="text"
                placeholder="New Organization Name"
                value={newOrgName}
                onChange={(e) => setNewOrgName(e.target.value)}
                style={{
                  flex: 1,
                  backgroundColor: '#0a0d14',
                  border: '1px solid #1e293b',
                  borderRadius: '6px',
                  padding: '0.5rem 0.75rem',
                  color: '#f8fafc',
                  fontSize: '0.85rem',
                }}
              />
              <button type="submit" className="endpoint-secondary" disabled={loading || !newOrgName.trim()}>
                ＋ Create
              </button>
            </form>

            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #1e293b', paddingTop: '1rem' }}>
              <button type="button" className="endpoint-danger" onClick={handleLogout}>
                Sign Out
              </button>
              <button type="button" className="endpoint-secondary" onClick={onClose}>
                Close
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
