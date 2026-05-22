import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { seedDemoData } from '@/lib/storage/seed';

// Boot sequence:
//   1. Seed localStorage with demo data on first visit (state empty).
//   2. Mount React.

if (!localStorage.getItem('mtym_app_state')) {
  seedDemoData();
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
