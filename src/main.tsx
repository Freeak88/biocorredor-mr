import * as React from 'react';
import {StrictMode, type ReactNode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { installGlobalErrorLogging, logError } from './lib/logger';

// ── Offline app shell ──
const APP_VERSION = 'v8';

if ('serviceWorker' in navigator) {
  // Keep the shell and already visited assets available for the local fallback.
  const swUrl = `/sw.js?v=${APP_VERSION}`;
  navigator.serviceWorker.register(swUrl, { updateViaCache: 'none' })
    .then((reg) => {
      console.log('[SW] Registered:', reg.scope);
      reg.update(); // Force check for updates
      return navigator.serviceWorker.ready;
    })
    .then(async () => {
      const warmShellCache = async () => {
        const loadedResources = performance.getEntriesByType('resource').map((entry) => entry.name);
        const assets = [location.origin + '/', ...Array.from(document.querySelectorAll<HTMLScriptElement>('script[src]')).map((item) => item.src), ...Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')).map((item) => item.href), ...loadedResources]
          .filter((asset) => asset.startsWith(location.origin) && !asset.includes('/api/'))
          .filter((asset, index, list) => list.indexOf(asset) === index);
        const cache = await caches.open(`biocorredor-shell-${APP_VERSION}`);
        await Promise.allSettled(assets.map((asset) => cache.add(asset)));
      };
      await warmShellCache();
      // Vendor chunks can finish loading after main.tsx; capture them once the app is idle.
      window.setTimeout(() => void warmShellCache(), 1000);
    })
    .catch((err) => {
      console.warn('[SW] Registration failed:', err);
    });
}

installGlobalErrorLogging();

class ErrorBoundary extends React.Component<{children: ReactNode}, {error: string | null}> {
  state = {error: null as string | null};
  static getDerivedStateFromError(e: Error) {
    return {error: e.message + '\n' + e.stack};
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    logError('react-boundary', 'React render tree crashed', error, {
      componentStack: info.componentStack,
    });
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{padding: 20, fontFamily: 'monospace', whiteSpace: 'pre-wrap', fontSize: 12, color: '#c00'}}>
          <h2>Runtime Error</h2>
          <p>{this.state.error}</p>
          <button onClick={() => { this.setState({error: null}); location.reload(); }}>Reload</button>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
