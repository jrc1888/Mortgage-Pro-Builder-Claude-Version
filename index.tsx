import './index.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Error Trap: Display crash logs on screen instead of white screen
const showError = (title: string, message: any, source?: string) => {
  const root = document.getElementById('root');
  // Prevent overwriting if app is already running
  if (root && (root.innerHTML === '' || root.innerHTML.includes('Application Error'))) {
    root.innerHTML = `
      <div style="padding: 2rem; font-family: system-ui, sans-serif; max-width: 600px; margin: 0 auto; background: white;">
        <h2 style="color: #ef4444; margin-bottom: 1rem; font-size: 1.5rem; font-weight: bold;">${title}</h2>
        <p style="color: #374151; line-height: 1.5; margin-bottom: 1rem;">The application failed to start properly.</p>
        <div style="background: #f3f4f6; padding: 1rem; border-radius: 0.5rem; overflow-x: auto; border: 1px solid #e5e7eb;">
          <code style="color: #dc2626; font-size: 0.875rem; font-family: monospace;">${message}</code>
        </div>
        ${source ? `<p style="color: #6b7280; font-size: 0.75rem; margin-top: 1rem;">Source: ${source}</p>` : ''}
        <button onclick="window.location.reload()" style="margin-top: 1.5rem; background: #2563eb; color: white; border: none; padding: 0.5rem 1rem; border-radius: 0.375rem; cursor: pointer; font-weight: bold;">Reload Application</button>
      </div>
    `;
  }
};

window.addEventListener('error', (event) => {
  showError('Application Crash', event.message, `${event.filename}:${event.lineno}`);
});

window.addEventListener('unhandledrejection', (event) => {
  showError('Unhandled Promise Rejection', event.reason);
});

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
