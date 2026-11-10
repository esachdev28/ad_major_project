/**
 * StatCard.jsx
 * 
 * 1. Why this file exists:
 *    A reusable card component designed to display key quantitative metrics on the
 *    API Sentinel dashboard (e.g. Total APIs, Healthy APIs, Failed APIs, and Latency).
 * 
 * 2. What its responsibilities are:
 *    - Render an individual metric title, icon, value, and explanatory subtext.
 *    - Support color variants (blue, green, red, amber) to communicate semantic meaning
 *      (e.g., green for healthy APIs, red for failed APIs).
 *    - Gracefully display a loading skeleton while asynchronous backend requests resolve.
 * 
 * 3. Which functions/components it contains:
 *    - `StatCard({ title, value, icon, colorVariant, subtitle, isLoading })`: Functional React component.
 * 
 * 4. How it communicates with other files:
 *    - Imported and rendered multiple times inside `pages/Dashboard.jsx`.
 *    - Receives metric values dynamically fetched from Express backend.
 * 
 * 5. Why this chosen approach is appropriate:
 *    - Eliminates code duplication by encapsulating the card UI in one reusable component.
 *    - Keeps JSX clean and demonstrates standard component-based React principles for viva.
 */

import React from 'react';

export default function StatCard({
  title,
  value,
  icon,
  colorVariant = 'blue',
  subtitle,
  isLoading = false,
}) {
  return (
    <div className="stat-card">
      <div className="stat-header">
        <span className="stat-title">{title}</span>
        <div className={`stat-icon ${colorVariant}`}>
          {icon}
        </div>
      </div>

      {isLoading ? (
        <div className="skeleton-text" />
      ) : (
        <div className="stat-value">{value !== undefined && value !== null ? value : '—'}</div>
      )}

      {subtitle && <div className="stat-footer">{subtitle}</div>}
    </div>
  );
}
