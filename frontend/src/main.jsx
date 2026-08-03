import React from 'react';
import ReactDOM from 'react-dom/client';
import { TonConnectUIProvider } from '@tonconnect/ui-react';
import App from './App.jsx';
import ErrorBoundary from './ErrorBoundary.jsx';
import './index.css';

// Манифест должен быть доступен по этому же публичному домену после деплоя
const MANIFEST_URL = `${window.location.origin}/tonconnect-manifest.json`;

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <TonConnectUIProvider manifestUrl={MANIFEST_URL}>
        <App />
      </TonConnectUIProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
