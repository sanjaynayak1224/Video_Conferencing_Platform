import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [react()],
    server: {
        // Expose dev server on LAN so other devices can test video calls
        host: true
    }
});
