/**
 * App.jsx
 * 
 * 1. Why this file exists:
 *    Root application component for the API Sentinel React client. It sets up the primary
 *    two-column layout (Sidebar navigation on the left, Dashboard main view on the right).
 * 
 * 2. What its responsibilities are:
 *    - Assemble top-level visual shell and layout containers.
 *    - Render `Sidebar` and `Dashboard`.
 *    - Provide a single coherent structure for future multi-page expansion.
 * 
 * 3. Which functions/components it contains:
 *    - `App()`: Root functional component.
 * 
 * 4. How it communicates with other files:
 *    - Imports `Sidebar` from `./components/Sidebar`.
 *    - Imports `Dashboard` from `./pages/Dashboard`.
 *    - Rendered into the DOM by `main.jsx`.
 * 
 * 5. Why this chosen approach is appropriate:
 *    - Clean composition pattern: separates navigation from main page content.
 *    - Direct and lightweight without unnecessary routing libraries on Day 1.
 */

import React, { useCallback, useState } from 'react';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import Endpoints from './pages/Endpoints';
import Incidents from './pages/Incidents';
import Contracts from './pages/Contracts';
import Dependencies from './pages/Dependencies';

export default function App() {
  const [activeItem, setActiveItem] = useState('Dashboard');
  const [dashboardRefreshKey, setDashboardRefreshKey] = useState(0);
  const refreshDashboard = useCallback(() => setDashboardRefreshKey((key) => key + 1), []);
  return (
    <div className="app-container">
      {/* Persistent Left Navigation */}
      <Sidebar activeItem={activeItem} onNavigate={setActiveItem} />

      {activeItem === 'API Endpoints' ? (
        <Endpoints onEndpointsChanged={refreshDashboard} />
      ) : activeItem === 'Incidents' ? (
        <Incidents />
      ) : activeItem === 'Contract Analysis' ? (
        <Contracts />
      ) : activeItem === 'Dependencies' ? (
        <Dependencies />
      ) : (
        <Dashboard refreshKey={dashboardRefreshKey} onNavigateToEndpoints={() => setActiveItem('API Endpoints')} />
      )}
    </div>
  );
}
