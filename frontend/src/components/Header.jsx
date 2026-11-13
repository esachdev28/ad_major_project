/**
 * Header.jsx
 * 
 * 1. Why this file exists:
 *    Renders the top application header for API Sentinel. It gives users immediate
 *    situational awareness about the current view, greeting context, and real-time backend
 *    connectivity status.
 * 
 * 2. What its responsibilities are:
 *    - Display the dashboard heading and a welcoming subtitle.
 *    - Display the real-time Express backend connectivity indicator (Online, Offline, or Checking).
 *    - Provide a manual "Refresh" button that triggers a re-fetch of stats and health.
 * 
 * 3. Which functions/components it contains:
 *    - `Header({ backendStatus, onRefresh, isRefreshing })`: Functional component receiving props.
 * 
 * 4. How it communicates with other files:
 *    - Rendered inside `Dashboard.jsx`.
 *    - Receives `backendStatus` ('online' | 'offline' | 'checking'), `isRefreshing` (boolean),
 *      and the `onRefresh` callback from parent state in `Dashboard.jsx`.
 * 
 * 5. Why this chosen approach is appropriate:
 *    - Pure presentational (controlled) component: does not manage its own async state,
 *      making it testable, predictable, and simple to reason about.
 */

import React from 'react';

export default function Header({ backendStatus = 'checking', onRefresh, isRefreshing = false, title = 'Sentinel Dashboard', subtitle = 'Real-time API monitoring, health metrics, and contract observability' }) {
  // Determine badge text and CSS class based on backend connectivity
  const statusLabel =
    backendStatus === 'online'
      ? 'Backend Connected'
      : backendStatus === 'offline'
      ? 'Backend Offline'
      : 'Checking Connection...';

  return (
    <header className="header-container">
      {/* Title & Welcome */}
      <div className="header-left">
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>

      {/* Connectivity Indicator and Refresh Action */}
      <div className="header-right">
        {/* Backend Connection Status Pill */}
        <div className={`connection-pill ${backendStatus}`} title={`Backend status: ${backendStatus}`}>
          <span className={`status-dot ${backendStatus}`}></span>
          <span>{statusLabel}</span>
        </div>

        {/* Manual Refresh Button */}
        {onRefresh && (
          <button
            className="btn-refresh"
            onClick={onRefresh}
            disabled={isRefreshing}
            title="Re-fetch backend data"
          >
            <span>{isRefreshing ? '🔄' : '⚡'}</span>
            <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
          </button>
        )}
      </div>
    </header>
  );
}
