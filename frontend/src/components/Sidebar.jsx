/**
 * Sidebar.jsx
 * 
 * 1. Why this file exists:
 *    Renders the persistent left navigation sidebar for API Sentinel. It gives the
 *    user easy access to the main sections of the platform and establishes the
 *    product branding.
 * 
 * 2. What its responsibilities are:
 *    - Display the API Sentinel logo and brand identity.
 *    - Render the platform navigation list:
 *      * Dashboard (active, implemented)
 *      * API Endpoints (placeholder for future day)
 *      * Incidents (placeholder for future day)
 *      * Contract Analysis (placeholder for future day)
 *      * Dependencies (placeholder for future day)
 *      * Settings (placeholder for future day)
 *    - Indicate active vs placeholder routes visually so users and viva examiners understand
 *      the current Day 1 scope without confusion.
 * 
 * 3. Which functions/components it contains:
 *    - `Sidebar({ activeItem = 'Dashboard' })`: Functional component rendering the sidebar UI.
 * 
 * 4. How it communicates with other files:
 *    - Imported by `App.jsx` as part of the primary dashboard layout.
 * 
 * 5. Why this chosen approach is appropriate:
 *    - Pure React component with no heavy routing dependencies (like react-router-dom)
 *      because Day 1 strictly requires only the Dashboard page.
 *    - Keeps code concise, fast, and easy for a first-year student to understand and defend.
 */

import React from 'react';

export default function Sidebar({ activeItem = 'Dashboard', onNavigate, currentUser, onOpenAuth }) {
  // Navigation menu items required by Part 4
  const navItems = [
    { name: 'Dashboard', icon: '📊', isImplemented: true },
    { name: 'API Endpoints', icon: '🔗', isImplemented: true },
    { name: 'Incidents', icon: '🚨', isImplemented: true },
    { name: 'Contract Analysis', icon: '📄', isImplemented: true },
    { name: 'Dependencies', icon: '🕸️', isImplemented: true },
    { name: 'AI Diagnostics', icon: '🧠', isImplemented: true },
    { name: 'Settings', icon: '⚙️', isImplemented: false },
  ];

  const activeOrgName = currentUser?.activeOrganization?.name || currentUser?.organization?.name || 'Default Workspace';

  return (
    <aside className="sidebar">
      {/* Brand Header */}
      <div className="sidebar-brand">
        <div className="brand-icon">🛡️</div>
        <div>
          <div className="brand-title">API Sentinel</div>
          <div className="brand-subtitle">Observability Suite</div>
        </div>
      </div>

      {/* Organization Workspace Card */}
      <div
        onClick={onOpenAuth}
        style={{
          cursor: 'pointer',
          padding: '0.6rem 0.75rem',
          backgroundColor: '#101623',
          border: '1px solid #1e293b',
          borderRadius: '8px',
          marginBottom: '1.25rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          transition: 'all 0.15s ease',
        }}
        title="Manage Organization & Account"
      >
        <div style={{ overflow: 'hidden' }}>
          <div style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>
            {currentUser ? 'Organization' : 'Workspace'}
          </div>
          <div style={{ fontSize: '0.825rem', color: '#f8fafc', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {activeOrgName}
          </div>
        </div>
        <span style={{ fontSize: '0.75rem', color: '#60a5fa', fontWeight: 500 }}>
          {currentUser ? '⚙️' : 'Sign In'}
        </span>
      </div>

      {/* Navigation List */}
      <nav className="sidebar-nav">
        {navItems.map((item) => {
          const isActive = activeItem === item.name;

          return (
            <button
              key={item.name}
              className={`nav-item ${isActive ? 'active' : ''}`}
              title={item.isImplemented ? item.name : `${item.name} (Upcoming in later commits)`}
              onClick={() => item.isImplemented && onNavigate?.(item.name)}
              disabled={!item.isImplemented}
            >
              <div className="nav-item-content">
                <span className="nav-icon">{item.icon}</span>
                <span>{item.name}</span>
              </div>
              {!item.isImplemented && (
                <span className="nav-badge-soon">Soon</span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Sidebar Footer */}
      <div className="sidebar-footer">
        <span>Sentinel Platform</span>
        <span>v1.0.0</span>
      </div>
    </aside>
  );
}
