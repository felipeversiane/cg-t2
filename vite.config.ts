import basicSsl from '@vitejs/plugin-basic-ssl';
import { defineConfig } from 'vite';

const useLocalSsl = process.env.VITE_NO_SSL !== '1' && process.env.GITHUB_ACTIONS !== 'true';

export default defineConfig({
  base: './',
  plugins: useLocalSsl ? [basicSsl()] : [],
  server: {
    host: true,
    port: 5173,
    allowedHosts: true,
    ...(useLocalSsl ? { https: {} } : {}),
  },
  preview: {
    host: true,
    port: 4173,
    allowedHosts: true,
    ...(useLocalSsl ? { https: {} } : {}),
  },
});
