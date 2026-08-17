import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/** Load VITE_* from monorepo root `.env` (same as `.env.example`). */
export default defineConfig({
  envDir: '../..',
  plugins: [react()],
});
