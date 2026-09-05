import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';

import './admin.css';
import { App } from './App.js';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Admin root element is missing.');
}

createRoot(rootElement).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
