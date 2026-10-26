import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import '@fontsource-variable/schibsted-grotesk';
import '@fontsource/jetbrains-mono/400.css';
import App from './App.tsx';
import LegalPage from './LegalPage.tsx';
import { initAnalytics } from './lib/analytics';
import './index.css';

// Capture UTM / referrer on every entry and load GA4 when configured.
initAnalytics();

// Two static routes; everything else is the app. The server already returns
// index.html for unknown paths, so /privacy and /terms work on refresh too.
const path = window.location.pathname.replace(/\/+$/, '');
const page =
  path === '/privacy' ? <LegalPage doc="privacy" /> :
  path === '/terms' ? <LegalPage doc="terms" /> :
  <App />;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {page}
  </StrictMode>,
);
