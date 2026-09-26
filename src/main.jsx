import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import '@fontsource-variable/urbanist';
import App from './App';
import './styles.css';
import './signal-foundry.css';
import { LiveDataProvider } from './liveData';
import { AuthProvider } from './auth';
import { OperationsProvider } from './operationsData';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <LiveDataProvider>
          <OperationsProvider>
            <App />
          </OperationsProvider>
        </LiveDataProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
