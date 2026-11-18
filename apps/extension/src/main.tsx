import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import { bootstrapTheme } from './hooks/useTheme';
import './styles/globals.css';

// Apply the cached theme before the first paint.
bootstrapTheme();

const container = document.getElementById('root');
if (!container) throw new Error('Popup root element is missing');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
