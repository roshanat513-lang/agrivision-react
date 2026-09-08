import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';

// Leaflet's own stylesheet — required for the map tiles/markers to look right.
import 'leaflet/dist/leaflet.css';

import './App.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
