/**
 * Dashboard.jsx
 * 
 * 1. Why this file exists:
 *    The central page component for API Sentinel Day 1. It orchestrates data fetching,
 *    manages local state (loading, error, statistics, connection status), and arranges
 *    the visual sections of the dashboard.
 * 
 * 2. What its responsibilities are:
 *    - Fetch backend health via `checkHealth()`, database health via `checkDbHealth()`,
 *      and statistics via `getDashboardStats()` on component mount using React's `useEffect` hook.
 *    - Maintain React state for:
 *      * `stats`: The 4 core metrics (Total APIs, Healthy APIs, Failed APIs, Average Latency).
 *      * `backendStatus`: 'checking' | 'online' | 'offline'.
 *      * `dbStatus`: 'checking' | 'online' | 'offline'.
 *      * `dataSource`: Tag confirming data source (e.g. 'database').
 *      * `isLoading`: Boolean indicator for network requests.
 *      * `error`: Error message string if backend or database communication fails.
 *    - Render the dashboard header, demo notice, 4 StatCards, API Health Overview table,
 *      and Recent Activity feed.
 *    - Ensure the UI NEVER crashes if the Express backend is offline.
 * 
 * 3. Which functions/components it contains:
 *    - `Dashboard()`: Main React page component.
 *    - `loadDashboardData()`: Asynchronous coordinator that fetches data from `api.js`.
 * 
 * 4. How it communicates with other files:
 *    - Calls API functions from `../services/api.js`.
 *    - Imports and renders `Header`, `StatCard`, and layout components.
 *    - Exported and rendered inside `App.jsx`.
 * 
 * 5. Why this chosen approach is appropriate:
 *    - Standard React idioms (`useState`, `useEffect`) without third-party state managers (Redux).
 *    - Graceful error boundary behavior: displays clear actionable alerts instead of white-screens.
 *    - Beginner-friendly, perfectly suitable for viva examination explanation.
 */

import React, { useState, useEffect, useCallback } from 'react';
import Header from '../components/Header';
import StatCard from '../components/StatCard';
import { checkHealth, checkDbHealth, getDashboardStats } from '../services/api';

export default function Dashboard() {
  // State: API statistics received from Express backend
  const [stats, setStats] = useState(null);

  // State: backend health and connectivity ('checking' | 'online' | 'offline')
  const [backendStatus, setBackendStatus] = useState('checking');

  // State: database connectivity ('checking' | 'online' | 'offline')
  const [dbStatus, setDbStatus] = useState('checking');

  // State: meta information about data source (from Express)
  const [dataSource, setDataSource] = useState('');

  // State: loading indicator
  const [isLoading, setIsLoading] = useState(true);

  // State: friendly error message if backend or database is unreachable
  const [error, setError] = useState(null);

  /**
   * Fetches health and dashboard metrics from the Express backend.
   * Uses Promise.allSettled to ensure that even if one endpoint fails,
   * we capture partial availability without throwing unhandled exceptions.
   */
  const loadDashboardData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setBackendStatus('checking');
    setDbStatus('checking');

    try {
      // Execute health check, db check, and stats fetch concurrently
      const [healthResult, dbResult, statsResult] = await Promise.allSettled([
        checkHealth(),
        checkDbHealth(),
        getDashboardStats(),
      ]);

      // 1. Process server health check result
      if (healthResult.status === 'fulfilled' && healthResult.value.success) {
        setBackendStatus('online');
      } else {
        setBackendStatus('offline');
        const reason = healthResult.reason?.message || 'Express server did not respond.';
        setError(reason);
      }

      // 2. Process database health check result
      if (dbResult.status === 'fulfilled' && dbResult.value.success) {
        setDbStatus('online');
      } else {
        setDbStatus('offline');
      }

      // 3. Process statistics result
      if (statsResult.status === 'fulfilled' && statsResult.value.success) {
        setStats(statsResult.value.data);
        setDataSource(statsResult.value.dataSource || 'database');
      } else {
        setStats(null);
        if (healthResult.status === 'fulfilled') {
          // Express server is online, but database query or connectivity failed
          const reason =
            statsResult.reason?.message ||
            dbResult.reason?.message ||
            'PostgreSQL database is currently unreachable.';
          setError(reason);
        }
      }
    } catch (err) {
      setBackendStatus('offline');
      setDbStatus('offline');
      setError(err.message || 'An unexpected error occurred while connecting to the backend.');
      setStats(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch data on initial mount
  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  // Illustrative API overview items for Day 1 visual foundation
  const sampleEndpoints = [
    { method: 'GET', path: '/api/v1/users', service: 'User Service', status: 'Healthy', latency: '42 ms' },
    { method: 'POST', path: '/api/v1/auth/login', service: 'Auth Gateway', status: 'Healthy', latency: '118 ms' },
    { method: 'GET', path: '/api/v1/orders', service: 'Order Service', status: 'Healthy', latency: '85 ms' },
    { method: 'POST', path: '/api/v1/payments/charge', service: 'Payment Core', status: 'Failed', latency: '1,420 ms' },
    { method: 'GET', path: '/api/v1/inventory/items', service: 'Warehouse API', status: 'Healthy', latency: '64 ms' },
  ];

  // Illustrative recent activity items for Day 1 visual foundation
  const sampleActivities = [
    { id: 1, type: 'bullet-blue', title: 'Health check completed', time: 'Just now', desc: 'Sentinel pinged 12 registered endpoints.' },
    { id: 2, type: 'bullet-red', title: 'HTTP 504 Gateway Timeout', time: '12 mins ago', desc: 'Failure detected on Payment Core endpoint.' },
    { id: 3, type: 'bullet-green', title: 'Contract verified', time: '1 hour ago', desc: 'User Service v1.4 OpenAPI matches production schema.' },
    { id: 4, type: 'bullet-blue', title: 'Daily baseline latency recorded', time: '3 hours ago', desc: 'Fleet average computed at 245 ms.' },
  ];

  // Total number of endpoints that have been checked at least once
  const totalChecked = (stats?.healthyApis || 0) + (stats?.failedApis || 0);

  return (
    <div className="main-wrapper">
      {/* Top Header */}
      <Header
        backendStatus={backendStatus}
        onRefresh={loadDashboardData}
        isRefreshing={isLoading}
      />

      {/* Main Content Area */}
      <div className="dashboard-content">

        {/* Backend Unavailability Alert (Displays if Express is not running) */}
        {backendStatus === 'offline' && (
          <div className="backend-alert">
            <span style={{ fontSize: '1.5rem' }}>⚠️</span>
            <div>
              <h4>Express Backend is Unreachable</h4>
              <p>
                {error || 'Could not reach backend at http://localhost:5001.'}
                {' '}To start the backend server, open a terminal and run:
              </p>
              <p style={{ marginTop: '0.4rem' }}>
                <code>cd backend && npm start</code>
              </p>
            </div>
          </div>
        )}

        {/* Database Unavailability Alert (Displays if Express is running but PostgreSQL failed) */}
        {backendStatus === 'online' && (dbStatus === 'offline' || error) && (
          <div className="backend-alert" style={{ borderColor: '#f59e0b', backgroundColor: 'rgba(245, 158, 11, 0.1)' }}>
            <span style={{ fontSize: '1.5rem' }}>⚠️</span>
            <div>
              <h4 style={{ color: '#f59e0b' }}>Database Connection Notice</h4>
              <p>
                {error || 'Could not connect to PostgreSQL database via Prisma.'}
                {' '}Make sure PostgreSQL is running on port 5432 and migrations have been executed:
              </p>
              <p style={{ marginTop: '0.4rem' }}>
                <code>cd backend && npx prisma migrate dev</code>
              </p>
            </div>
          </div>
        )}

        {/* Data Source Notice */}
        <div className="demo-banner">
          <div className="demo-banner-content">
            <span className="demo-tag" style={dataSource === 'database' ? { backgroundColor: '#10b981' } : {}}>
              {dataSource ? `${dataSource.toUpperCase()} MODE` : 'DATABASE MODE'}
            </span>
            <p>
              {dataSource === 'database' ? (
                <>Metrics computed live from <strong>PostgreSQL</strong> via Prisma ORM (<code>GET /api/dashboard/stats</code>).</>
              ) : (
                <>All metrics below are delivered by Express (<code>GET /api/dashboard/stats</code>) for Day 1 foundation.</>
              )}
            </p>
          </div>
          <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Day 1 Commit 2</span>
        </div>

        {/* 4 Core Quantitative Statistics Cards */}
        <section className="stats-grid">
          <StatCard
            title="Total APIs"
            value={stats?.totalApis}
            icon="🌐"
            colorVariant="blue"
            subtitle="Registered endpoints"
            isLoading={isLoading}
          />
          <StatCard
            title="Healthy APIs"
            value={stats?.healthyApis}
            icon="✅"
            colorVariant="green"
            subtitle={
              totalChecked > 0
                ? `${Math.round(((stats.healthyApis || 0) / totalChecked) * 100)}% uptime`
                : 'No checks yet'
            }
            isLoading={isLoading}
          />
          <StatCard
            title="Failed APIs"
            value={stats?.failedApis}
            icon="❌"
            colorVariant="red"
            subtitle={
              stats?.failedApis > 0
                ? 'Incidents flagged'
                : totalChecked > 0
                ? 'All clear'
                : 'No checks yet'
            }
            isLoading={isLoading}
          />
          <StatCard
            title="Average Latency"
            value={stats?.averageLatency}
            icon="⚡"
            colorVariant="amber"
            subtitle="Fleet response time"
            isLoading={isLoading}
          />
        </section>

        {/* Detailed Sections: API Health Overview & Recent Activity */}
        <section className="dashboard-sections-grid">
          
          {/* Section 1: API Health Overview */}
          <div className="panel-card">
            <div className="panel-header">
              <h2 className="panel-title">
                <span>🛡️</span> API Health Overview
              </h2>
              <span className="panel-badge">Illustrative UI Preview</span>
            </div>

            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Method</th>
                    <th>Path</th>
                    <th>Service</th>
                    <th>Latency</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {sampleEndpoints.map((ep, idx) => (
                    <tr key={idx}>
                      <td>
                        <span className={`api-method method-${ep.method.toLowerCase()}`}>
                          {ep.method}
                        </span>
                      </td>
                      <td>
                        <span className="api-path">{ep.path}</span>
                      </td>
                      <td>{ep.service}</td>
                      <td>{ep.latency}</td>
                      <td>
                        <span className={`pill-status ${ep.status.toLowerCase()}`}>
                          ● {ep.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Section 2: Recent Activity */}
          <div className="panel-card">
            <div className="panel-header">
              <h2 className="panel-title">
                <span>📋</span> Recent Activity
              </h2>
              <span className="panel-badge">Audit Trail</span>
            </div>

            <div className="activity-list">
              {sampleActivities.map((act) => (
                <div key={act.id} className="activity-item">
                  <div className={`activity-icon-bullet ${act.type}`} />
                  <div>
                    <div className="activity-text">
                      <strong>{act.title}</strong>
                      <div>{act.desc}</div>
                    </div>
                    <div className="activity-time">{act.time}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </section>

      </div>
    </div>
  );
}
