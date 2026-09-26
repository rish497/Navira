import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import {
  explainRouteComparison,
  getGdacsGeometry,
  getGdacsNews,
  getLiveData,
  getRoadRoutes,
  searchDestinations,
} from './src/server/liveData.js';
import {
  actorFromRequest, createAllocation, createDispatch, createEvacuation, createHelpRequest,
  createIncidentReport, createInfrastructure, createResource, createSimulation, getCommunityEvent,
  getOperations, markNotificationRead, reviewIncidentReport, updateDispatch, updateHelpRequest,
  updateInfrastructure, updateLocation, verifyHelpLocation,
} from './src/server/operations.js';
import { getSimulationCountries, getSimulationInfrastructure } from './src/server/simulationData.js';
import { generateStructureModel, getStructureEvidence } from './src/server/structureModel.js';

function sendJson(response, status, body) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify(body));
}

function readJsonBody(request, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > limit) reject(new Error('Request body is too large'));
    });
    request.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); } catch { reject(new Error('Request body must be valid JSON')); }
    });
    request.on('error', reject);
  });
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
        if (url.pathname === '/geocode' && request.method === 'GET') {
          return sendJson(response, 200, await searchDestinations(url.searchParams.get('q')));
        }
        if (url.pathname === '/routes' && request.method === 'GET') {
          return sendJson(response, 200, await getRoadRoutes(Object.fromEntries(url.searchParams)));
        }
        if (url.pathname === '/route-explanation' && request.method === 'POST') {
          return sendJson(response, 200, await explainRouteComparison(await readJsonBody(request)));
        }
        if (url.pathname === '/simulation/countries' && request.method === 'GET') {
          return sendJson(response, 200, getSimulationCountries());
        }
        if (url.pathname === '/simulation/infrastructure' && request.method === 'GET') {
          return sendJson(response, 200, await getSimulationInfrastructure(Object.fromEntries(url.searchParams)));
        }
        if (url.pathname === '/simulation/model-evidence' && request.method === 'POST') {
          return sendJson(response, 200, await getStructureEvidence(await readJsonBody(request, 128 * 1024)));
        }
        if (url.pathname === '/simulation/model-generate' && request.method === 'POST') {
          return sendJson(response, 200, await generateStructureModel(await readJsonBody(request, 24 * 1024 * 1024)));
        }
        if (url.pathname === '/operations' && request.method === 'GET') {
          return sendJson(response, 200, await getOperations(actorFromRequest(request)));
        }
        if (url.pathname.startsWith('/operations/') && request.method === 'POST') {
          const actor = actorFromRequest(request);
          const action = url.pathname.slice('/operations/'.length);
          const body = await readJsonBody(request, action === 'incident-report' ? 5 * 1024 * 1024 : 64 * 1024);
          if (action === 'location') return sendJson(response, 200, await updateLocation(actor, body));
          if (action === 'help') {
            const live = await getLiveData();
            const event = live.events.find((item) => item.id === body.eventId) || await getCommunityEvent(body.eventId);
            if (!event) throw new Error('The selected live event is no longer available');
            const boundary = event.gdacsKey ? await getGdacsGeometry(event.gdacsKey).catch(() => null) : null;
            if (!verifyHelpLocation(body, event, boundary?.data)) throw new Error(event.operatorDefinedArea
              ? 'Help requests unlock only when the shared location intersects the operator-defined notification area'
              : 'Help requests unlock only when the shared location intersects verified source geometry');
            return sendJson(response, 200, await createHelpRequest(actor, body, event));
          }
          if (action === 'incident-report') return sendJson(response, 200, await createIncidentReport(actor, body));
          if (action === 'incident-review') return sendJson(response, 200, await reviewIncidentReport(actor, body));
          if (action === 'notification-read') return sendJson(response, 200, await markNotificationRead(actor, body));
          if (action === 'help-status') return sendJson(response, 200, await updateHelpRequest(actor, body));
          if (action === 'dispatch') return sendJson(response, 200, await createDispatch(actor, body));
          if (action === 'dispatch-status') return sendJson(response, 200, await updateDispatch(actor, body));
          if (action === 'resource') return sendJson(response, 200, await createResource(actor, body));
          if (action === 'allocation') return sendJson(response, 200, await createAllocation(actor, body));
          if (action === 'infrastructure') return sendJson(response, 200, await createInfrastructure(actor, body));
          if (action === 'infrastructure-status') return sendJson(response, 200, await updateInfrastructure(actor, body));
          if (action === 'simulation') return sendJson(response, 200, await createSimulation(actor, body));
          if (action === 'evacuation') return sendJson(response, 200, await createEvacuation(actor, body));
        }
        if (url.pathname === '/ai-summary' && request.method === 'GET') {
          const aiAvailable = Boolean(process.env.YOLO_AUTO_API_KEY || process.env.OPENAI_API_KEY);
          return sendJson(response, 200, {
            status: aiAvailable ? 'available' : 'unavailable',
            model: process.env.YOLO_AUTO_MODEL || 'qwen3.8-flash',
            summary: null,
            message: aiAvailable
              ? 'AI enrichment is configured server-side but no generated summary has been requested.'
              : 'Data unavailable — no server-side Yolo-Auto API key is configured.',
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
