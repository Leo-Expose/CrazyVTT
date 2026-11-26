/* @__PURE__ */ (function() {
  // IIFE to preserve side effects
})();

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import AppRouter from './AppRouter.tsx';
import './assets/fonts/fonts.css';
import './index.css';

// A tab can keep an old entry bundle open across a deployment. Its next lazy
// import may request a hashed chunk that the new release no longer contains.
// Recover once by reloading into the currently served entry bundle.
window.addEventListener('vite:preloadError', function(event) {
  event.preventDefault();
  const retryKey = 'crazyvtt:chunk-reload-at';
  try {
    const lastReload = Number(sessionStorage.getItem(retryKey) || 0);
    if (Date.now() - lastReload > 15000) {
      sessionStorage.setItem(retryKey, String(Date.now()));
      window.location.reload();
    }
  } catch {
    window.location.reload();
  }
});

// Error Boundary to catch React rendering errors
const ErrorBoundary = function(_ref: { children?: React.ReactNode }) {
  const children = _ref.children;
  const _React$useState = React.useState(false),
      hasError = _React$useState[0],
      setHasError = _React$useState[1];
  const _React$useState2 = React.useState<Error | null>(null),
      error = _React$useState2[0],
      setError = _React$useState2[1];

  React.useEffect(function() {
    function handleError(event: ErrorEvent) {
      setError(event.error);
      setHasError(true);
      console.error('CRAZYVTT REACT ERROR:', event.error);
    }
    window.addEventListener('error', handleError);
    return function() { return window.removeEventListener('error', handleError); };
  }, [setError, setHasError]);

  if (hasError) {
    return React.createElement('div', {
      style: {
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        background: '#1a1a2e', color: '#e8e8e8', zIndex: 99999,
        padding: '2rem', fontFamily: 'monospace',
        overflow: 'auto', whiteSpace: 'pre-wrap', display: 'flex',
        flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
      }
    }, React.createElement('h1', {
      key: 'title',
      style: { color: '#e85c5c', marginBottom: '1rem' }
    }, '\u26a0 React Rendering Error'), React.createElement('pre', {
      key: 'error',
      style: { textAlign: 'left', maxWidth: '800px' }
    }, (error?.message || '') + '\n\n' + (error?.stack || '')), React.createElement('button', {
      key: 'reload',
      onClick: function() { window.location.reload(); },
      style: { marginTop: '2rem', padding: '0.5rem 1rem', background: '#4a5c3c', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }
    }, 'Reload Page'));
  }
  return children;
};

// Global error handlers to catch and display any uncaught errors
const errorDiv = document.createElement('div');
errorDiv.id = 'crazyvtt-error-display';
errorDiv.style.cssText = '\
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;\
  background: #1a1a2e; color: #e8e8e8; z-index: 99999;\
  padding: 2rem; font-family: monospace;\
  overflow: auto; white-space: pre-wrap; display: none;\
';
document.body.appendChild(errorDiv);

function showError(message: string, error: Error | null | undefined) {
  errorDiv.style.display = 'block';
  const stack = error?.stack || '';
  errorDiv.textContent = 'CRAZYVTT ERROR:\n' + message + '\n\n' + stack;
  console.error('CRAZYVTT UNCAUGHT ERROR:', message, error);
}

window.addEventListener('error', function(event) {
  showError(event.message, event.error);
  return false;
});

window.addEventListener('unhandledrejection', function(event) {
  showError('Unhandled Promise Rejection', event.reason instanceof Error ? event.reason : new Error(String(event.reason)));
  return false;
});

// Note: React.StrictMode is intentionally omitted here.
// StrictMode's double-invocation of effects causes WebSocket connections to be
// established and immediately torn down, making the campaign page unusable in dev.
// The WebSocketContext and socketClient are designed to handle connection lifecycle
// correctly without it.
const rootEl = document.getElementById('root');
if (rootEl) {
  ReactDOM.createRoot(rootEl).render(
    React.createElement(ErrorBoundary, null,
      React.createElement(AppRouter, null, React.createElement(App))
    )
  );
}
