import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/b612/latin-400.css';
import '@fontsource/b612/latin-700.css';
import App from './App.tsx';
import LiveViewer from './live/LiveViewer.tsx';
import TripViewer from './live/TripViewer.tsx';
import { setupLeaflet } from './utils/leaflet-setup';
import './index.css';
import './theme';

const container = document.getElementById('root')!;
const root = createRoot(container);

// Someone else's live trip (/live/<token>): a page of its own, no account needed.
const live = window.location.pathname.match(/^\/live\/([^/]*)\/?$/);
// A shared finished trip (/t/<id>).
const shared = window.location.pathname.match(/^\/t\/([^/]*)\/?$/);
if (live || shared) setupLeaflet();

root.render(
  <StrictMode>
    {live ? <LiveViewer token={live[1]} /> : shared ? <TripViewer id={shared[1]} /> : <App />}
  </StrictMode>
);

// Register service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(error => {
      console.error('Service worker registration failed:', error);
    });
  });
}