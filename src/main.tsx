import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/b612/latin-400.css';
import '@fontsource/b612/latin-700.css';
import App from './App.tsx';
import LiveViewer from './live/LiveViewer.tsx';
import TripViewer from './live/TripViewer.tsx';
import ProfileViewer from './live/ProfileViewer.tsx';
import { setupLeaflet } from './utils/leaflet-setup';
import './index.css';
import './theme';
import { registerServiceWorker } from './swUpdate';
import { UpdateBanner } from './components/UpdateBanner';

const container = document.getElementById('root')!;
const root = createRoot(container);

// Someone else's live trip (/live/<token>): a page of its own, no account needed.
const live = window.location.pathname.match(/^\/live\/([^/]*)\/?$/);
// A shared finished trip (/t/<id>).
const shared = window.location.pathname.match(/^\/t\/([^/]*)\/?$/);
// Someone's profile (/u/<id>).
const person = window.location.pathname.match(/^\/u\/([^/]*)\/?$/);
if (live || shared) setupLeaflet();

root.render(
  <StrictMode>
    {live ? <LiveViewer token={live[1]} /> : shared ? <TripViewer id={shared[1]} /> : person ? <ProfileViewer userId={person[1]} /> : <App />}
    <UpdateBanner />
  </StrictMode>
);

registerServiceWorker();
