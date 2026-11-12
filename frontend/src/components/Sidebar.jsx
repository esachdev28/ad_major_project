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

export default function Sidebar({ activeItem = 'Dashboard', onNavigate }) {
  // Navigation menu items required by Part 4
  const navItems = [
    { name: 'Dashboard', icon: '📊', isImplemented: true },
    { name: 'API Endpoints', icon: '🔗', isImplemented: true },
    { name: 'Incidents', icon: '🚨', isImplemented: true },
    { name: 'Contract Analysis', icon: '📄', isImplemented: true },
    { name: 'Dependencies', icon: '🕸️', isImplemented: true },
    { name: 'Settings', icon: '⚙️', isImplemented: false },
  ];

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
        <span>Day 1 — Foundation</span>
        <span>v0.1.0</span>
      </div>
    </aside>
  );
}
