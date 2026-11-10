/**
 * main.jsx
 * 
 * 1. Why this file exists:
 *    The JavaScript entry point for the Vite-powered React frontend. It mounts the React
 *    application tree into the real HTML DOM element `<div id="root"></div>`.
 * 
 * 2. What its responsibilities are:
 *    - Initialize the React root using `createRoot` (React 18+ standard).
 *    - Mount the top-level `<App />` component wrapped in `<React.StrictMode>`.
 *    - Import global styles (`index.css`) so they apply across the application.
 * 
 * 3. Which functions/calls it contains:
 *    - `ReactDOM.createRoot(document.getElementById('root')).render(...)`
 * 
 * 4. How it communicates with other files:
 *    - Referenced by `index.html` via `<script type="module" src="/src/main.jsx"></script>`.
 *    - Imports `App` from `./App.jsx`.
 *    - Imports `index.css`.
 * 
 * 5. Why this chosen approach is appropriate:
 *    - Standard Vite + React convention.
 *    - `React.StrictMode` highlights potential problems, side-effects, and deprecated usages in development.
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
