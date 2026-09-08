import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Standard Vite + React setup — no special config needed for this project.
export default defineConfig({
  plugins: [react()],
});
