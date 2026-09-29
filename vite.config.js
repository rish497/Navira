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
  activateIncident, actorFromRequest, createAllocation, createDispatch, createEvacuation, createHelpRequest,
  createIncident,
  createIncidentReport, createInfrastructure, createResource, createSimulation, getCommunityEvent,
  getOperations, linkIncidentRecord, markNotificationRead, reviewIncidentReport, saveComparisonScenario,
  recordNavigationEvent, updateDispatch, updateHelpRequest, updateIncident, updateInfrastructure, updateLocation, verifyHelpLocation,
} from './src/server/operations.js';
import { getRoadRestrictions } from './src/server/roadRestrictions.js';
import { getOfficialAlerts } from './src/server/officialAlerts.js';
import { getSimulationCountries, getSimulationInfrastructure } from './src/server/simulationData.js';
import { generateStructureModel, getStructureEvidence } from './src/server/structureModel.js';
import {
  authenticateRequest, loginAccount, logoutAccount, registerAccount, requireRequestActor,
} from './src/server/auth.js';

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

const requestWindows = new Map();
function enforceRateLimit(request, bucket, limit, windowMs) {
  const address = request.socket?.remoteAddress || 'unknown';
  const key = `${bucket}:${address}`;
  const now = Date.now();
  const current = requestWindows.get(key);
  if (!current || now - current.startedAt >= windowMs) {
    requestWindows.set(key, { startedAt: now, count: 1 });
    return;
  }
  current.count += 1;
  if (current.count > limit) {
    const error = new Error('Too many requests. Wait briefly and try again.');
    error.statusCode = 429;
    throw error;
  }
}

function liveDataPlugin() {
  const handler = (middleware) => {
    middleware.use('/api', async (request, response, next) => {
      const url = new URL(request.url, 'http://navira.local');
      try {
        if (url.pathname === '/auth/session' && request.method === 'GET') {
          return sendJson(response, 200, { profile: await authenticateRequest(request) });
        }
        if (url.pathname === '/auth/register' && request.method === 'POST') {
          const result = await registerAccount(request, await readJsonBody(request));
          response.setHeader('Set-Cookie', result.cookie);
          return sendJson(response, 201, { profile: result.profile });
        }
        if (url.pathname === '/auth/login' && request.method === 'POST') {
          const result = await loginAccount(request, await readJsonBody(request));
          response.setHeader('Set-Cookie', result.cookie);
          return sendJson(response, 200, { profile: result.profile });
        }
        if (url.pathname === '/auth/logout' && request.method === 'POST') {
          const result = await logoutAccount(request);
          response.setHeader('Set-Cookie', result.cookie);
          return sendJson(response, 200, { signedOut: true });
        }
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
          await requireRequestActor(request);
          enforceRateLimit(request, 'geocode', 45, 60_000);
          return sendJson(response, 200, await searchDestinations(url.searchParams.get('q')));
        }
        if (url.pathname === '/routes' && request.method === 'GET') {
          await requireRequestActor(request);
          enforceRateLimit(request, 'routes', 30, 60_000);
          return sendJson(response, 200, await getRoadRoutes(Object.fromEntries(url.searchParams)));
        }
        if (url.pathname === '/road-restrictions' && request.method === 'GET') {
          await requireRequestActor(request);
          enforceRateLimit(request, 'road-restrictions', 60, 60_000);
          const bounds = url.searchParams.get('bbox')?.split(',').map(Number);
          return sendJson(response, 200, await getRoadRestrictions({ bounds: bounds?.length === 4 && bounds.every(Number.isFinite) ? bounds : null, force: url.searchParams.get('refresh') === '1' }));
        }
        if (url.pathname === '/official-alerts' && request.method === 'GET') {
          await requireRequestActor(request);
          enforceRateLimit(request, 'official-alerts', 60, 60_000);
          return sendJson(response, 200, await getOfficialAlerts({ force: url.searchParams.get('refresh') === '1' }));
        }
        if (url.pathname === '/route-explanation' && request.method === 'POST') {
          await requireRequestActor(request);
          return sendJson(response, 200, await explainRouteComparison(await readJsonBody(request)));
        }
        if (url.pathname === '/simulation/countries' && request.method === 'GET') {
          await requireRequestActor(request, 'operator');
          return sendJson(response, 200, getSimulationCountries());
        }
        if (url.pathname === '/simulation/infrastructure' && request.method === 'GET') {
          await requireRequestActor(request, 'operator');
          return sendJson(response, 200, await getSimulationInfrastructure(Object.fromEntries(url.searchParams)));
        }
        if (url.pathname === '/simulation/model-evidence' && request.method === 'POST') {
          await requireRequestActor(request, 'operator');
          return sendJson(response, 200, await getStructureEvidence(await readJsonBody(request, 128 * 1024)));
        }
        if (url.pathname === '/simulation/model-generate' && request.method === 'POST') {
          await requireRequestActor(request, 'operator');
          return sendJson(response, 200, await generateStructureModel(await readJsonBody(request, 24 * 1024 * 1024)));
        }
        if (url.pathname === '/operations' && request.method === 'GET') {
          await requireRequestActor(request);
          return sendJson(response, 200, await getOperations(actorFromRequest(request)));
        }
        if (url.pathname.startsWith('/operations/') && request.method === 'POST') {
          await requireRequestActor(request);
          enforceRateLimit(request, 'operations-mutation', 120, 60_000);
          const actor = actorFromRequest(request);
          const action = url.pathname.slice('/operations/'.length);
          const body = await readJsonBody(request, action === 'incident-report' ? 5 * 1024 * 1024 : 64 * 1024);
          if (action === 'location') return sendJson(response, 200, await updateLocation(actor, body));
          if (action === 'help') {
            const live = await getLiveData();
            const official = await getOfficialAlerts().catch(() => ({ alerts: [] }));
            const capEvent = official.alerts.find((item) => item.id === body.eventId);
            const event = live.events.find((item) => item.id === body.eventId) || await getCommunityEvent(body.eventId) || (capEvent ? {
              ...capEvent, title: capEvent.headline, type: capEvent.event, timestamp: capEvent.sentAt || capEvent.effectiveAt,
              updatedAt: capEvent.sentAt || capEvent.effectiveAt, sourceUrl: capEvent.source?.href,
              geometryKind: capEvent.geometry?.type, severityLevel: String(capEvent.severity || '').toLowerCase(),
            } : null);
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
          if (action === 'navigation-event') return sendJson(response, 200, await recordNavigationEvent(actor, body));
          if (action === 'incident-create') return sendJson(response, 200, await createIncident(actor, body));
          if (action === 'incident-update') return sendJson(response, 200, await updateIncident(actor, body));
          if (action === 'incident-activate') return sendJson(response, 200, await activateIncident(actor, body));
          if (action === 'incident-link') {
            if (body.recordType === 'hazard') {
              const live = await getLiveData();
              if (!live.events.some((item) => item.id === body.recordId) && !await getCommunityEvent(body.recordId)) throw new Error('The hazard record is no longer available');
            }
            if (body.recordType === 'alert') {
              const alerts = await getOfficialAlerts();
              if (!alerts.alerts.some((item) => item.id === body.recordId)) throw new Error('The official alert is no longer available');
            }
            if (body.recordType === 'roadRestriction') {
              const roads = await getRoadRestrictions();
              if (!roads.restrictions.some((item) => item.id === body.recordId)) throw new Error('The road restriction is no longer available');
            }
            return sendJson(response, 200, await linkIncidentRecord(actor, body));
          }
          if (action === 'comparison-save') return sendJson(response, 200, await saveComparisonScenario(actor, body));
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
        return sendJson(response, error.statusCode || 502, { error: error.message || 'Upstream data unavailable' });
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
  const renderHostname = String(process.env.RENDER_EXTERNAL_HOSTNAME || '').trim();
  const allowedHosts = [...new Set([
    'navira-rlzu.onrender.com',
    renderHostname,
  ].filter(Boolean))];

  return {
    plugins: [react(), liveDataPlugin()],
    preview: { allowedHosts },
  };
});
