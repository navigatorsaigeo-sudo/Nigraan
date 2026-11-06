import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import 'leaflet/dist/leaflet.css';
import './start/seal.css';
import './analyst/analyst.css';
import './analyst/overview.css';
import './analyst/workspace.css';
import './analyst/operations.css';
import './analyst/forecast.css';
import './analyst/clientrisk.css';
import './analyst/scenario.css';
import './analyst/methods.css';
import './customize/customize.css';
import './styles.css';
import './gate.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
