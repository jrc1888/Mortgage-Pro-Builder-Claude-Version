import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    const buildTimestamp = Date.now();
    const buildVersion = process.env.npm_package_version || '1.0.7';
    
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [
        react(),
        // Inject build info into HTML
        {
          name: 'inject-build-info',
          transformIndexHtml(html) {
            // Remove any existing BUILD_TIMESTAMP
            let result = html.replace(/window\.BUILD_TIMESTAMP = [^;]+;/g, '');
            // Add BUILD_TIMESTAMP after APP_VERSION
            result = result.replace(
              /(window\.APP_VERSION = ['"][^'"]+['"];)/,
              `$1\n      window.BUILD_TIMESTAMP = ${buildTimestamp};`
            );
            return result;
          }
        }
      ],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        '__BUILD_VERSION__': JSON.stringify(buildVersion),
        '__BUILD_TIMESTAMP__': JSON.stringify(buildTimestamp)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      build: {
        rollupOptions: {
          output: {
            // Force new file names on every build
            entryFileNames: `assets/[name]-[hash].js`,
            chunkFileNames: `assets/[name]-[hash].js`,
            assetFileNames: `assets/[name]-[hash].[ext]`
          }
        }
      }
    };
});
