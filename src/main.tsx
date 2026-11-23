import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/b612/latin-400.css';
import '@fontsource/b612/latin-700.css';
import App from './App.tsx';
import LiveViewer from './live/LiveViewer.tsx';
import { setupLeaflet } from './utils/leaflet-setup';
import './index.css';

const container = document.getElementById('root')!;
const root = createRoot(container);

// Someone else's live trip (/live/<token>): a page of its own, no account needed.
const live = window.location.pathname.match(/^\/live\/([^/]*)\/?$/);
if (live) setupLeaflet();

root.render(
  <StrictMode>
    {live ? <LiveViewer token={live[1]} /> : <App />}
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