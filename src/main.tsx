import * as React from 'react';
import {StrictMode, type ReactNode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { installGlobalErrorLogging, logError } from './lib/logger';

// ── Emergency SW unregister + version check ──
const APP_VERSION = 'v5';

if ('serviceWorker' in navigator) {
  // Unregister any old SWs
  navigator.serviceWorker.getRegistrations().then((regs) => {
    regs.forEach((reg) => {
      reg.unregister().then(() => {
        console.log('[SW] Unregistered:', reg.scope);
      });
    });
  });

  // Clear all caches
  if (window.caches) {
    caches.keys().then((names) => {
      names.forEach((n) => caches.delete(n));
    });
  }

  // Register new SW with versioned URL (forces browser to treat as new)
  const swUrl = `/service-worker.js?v=${APP_VERSION}`;
  navigator.serviceWorker.register(swUrl, { updateViaCache: 'none' })
    .then((reg) => {
      console.log('[SW] Registered:', reg.scope);
      reg.update(); // Force check for updates
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
