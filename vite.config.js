import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { getGdacsGeometry, getGdacsNews, getLiveData } from './src/server/liveData.js';

function sendJson(response, status, body) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify(body));
}

function liveDataPlugin() {
  const handler = (middleware) => {
    middleware.use('/api', async (request, response, next) => {
      const url = new URL(request.url, 'http://navira.local');
      try {
        if (url.pathname === '/live-events' && request.method === 'GET') {
          return sendJson(response, 200, await getLiveData({ force: url.searchParams.get('refresh') === '1' }));
        }
        if (url.pathname === '/gdacs-geometry' && request.method === 'GET') {
          return sendJson(response, 200, await getGdacsGeometry(Object.fromEntries(url.searchParams)));
        }
        if (url.pathname === '/gdacs-news' && request.method === 'GET') {
          return sendJson(response, 200, await getGdacsNews(Object.fromEntries(url.searchParams)));
        }
        if (url.pathname === '/ai-summary' && request.method === 'GET') {
          return sendJson(response, 200, {
            status: process.env.OPENAI_API_KEY ? 'available' : 'unavailable',
            summary: null,
            message: process.env.OPENAI_API_KEY
              ? 'AI enrichment is configured server-side but no generated summary has been requested.'
              : 'Data unavailable — no server-side AI API key is configured.',
          });
        }
        return next();
      } catch (error) {
        return sendJson(response, 502, { error: error.message || 'Upstream data unavailable' });
      }
    });
  };
  return {
    name: 'navira-live-data',
    configureServer(server) { handler(server.middlewares); },
    configurePreviewServer(server) { handler(server.middlewares); },
  };
}

export default defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, process.cwd(), ''));
  return { plugins: [react(), liveDataPlugin()] };
});
