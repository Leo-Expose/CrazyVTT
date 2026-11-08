import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import AppRouter from './AppRouter.tsx';
import './assets/fonts/fonts.css';
import './index.css';

// A tab can keep an old entry bundle open across a deployment. Its next lazy
// import may request a hashed chunk that the new release no longer contains.
// Recover once by reloading into the currently served entry bundle.
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();
  const retryKey = 'crazyvtt:chunk-reload-at';
  try {
    const lastReload = Number(sessionStorage.getItem(retryKey) ?? 0);
    if (Date.now() - lastReload > 15_000) {
      sessionStorage.setItem(retryKey, String(Date.now()));
      window.location.reload();
    }
  } catch {
    window.location.reload();
  }
});

// Note: React.StrictMode is intentionally omitted here.
// StrictMode's double-invocation of effects causes WebSocket connections to be
// established and immediately torn down, making the campaign page unusable in dev.
// The WebSocketContext and socketClient are designed to handle connection lifecycle
// correctly without it.
ReactDOM.createRoot(document.getElementById('root')!).render(
  <AppRouter>
    <App />
  </AppRouter>
);
