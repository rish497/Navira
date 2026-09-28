import { XMLParser } from 'fast-xml-parser';
import { circle as turfCircle } from '@turf/turf';

const CACHE_MS = 60_000;
let cache = { at: 0, value: null };
const parser = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true, parseTagValue: false, trimValues: true });
const clean = (value, max = 1000) => String(value || '').trim().slice(0, max);
const array = (value) => value == null ? [] : Array.isArray(value) ? value : [value];

function feeds() {
  return clean(process.env.NAVIRA_CAP_FEEDS, 8000).split(',').map((url, index) => url.trim()).filter((url) => /^https:\/\//i.test(url)).map((url, index) => ({
    id: `cap-${index + 1}`, name: `Configured CAP authority ${index + 1}`, url,
  }));
}

function polygonGeometry(value) {
  const coordinates = clean(value, 50_000).split(/\s+/).map((pair) => pair.split(',').map(Number)).filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng)).map(([lat, lng]) => [lng, lat]);
  if (coordinates.length < 3) return null;
  const first = coordinates[0]; const last = coordinates.at(-1);
  if (first[0] !== last[0] || first[1] !== last[1]) coordinates.push(first);
  return { type: 'Polygon', coordinates: [coordinates] };
}

function circleGeometry(value) {
  const [coordinateText, radiusText] = clean(value, 200).split(/\s+/);
  const [lat, lng] = coordinateText?.split(',').map(Number) || [];
  const radiusKm = Number(radiusText);
  if (![lat, lng, radiusKm].every(Number.isFinite) || radiusKm <= 0) return null;
  return turfCircle([lng, lat], radiusKm, { steps: 64, units: 'kilometers' }).geometry;
}

function normalizeAlert(alert, source, retrievedAt) {
  const info = array(alert.info)[0] || alert;
  const area = array(info.area)[0] || {};
  const geometry = polygonGeometry(array(area.polygon)[0]) || circleGeometry(array(area.circle)[0]);
  const identifier = clean(alert.identifier || info.identifier || alert.id, 240);
  if (!identifier) return null;
  return {
    id: `${source.id}:${identifier}`, sourceAlertId: identifier, sender: clean(alert.sender, 240) || null,
    sentAt: clean(alert.sent, 80) || null, status: clean(alert.status, 40) || 'Unknown', messageType: clean(alert.msgType, 40) || 'Unknown',
    event: clean(info.event, 180) || 'Official alert', headline: clean(info.headline, 300) || clean(info.event, 180) || 'Official alert',
    description: clean(info.description, 2400) || null, instruction: clean(info.instruction, 2400) || null,
    urgency: clean(info.urgency, 40) || 'Unknown', severity: clean(info.severity, 40) || 'Unknown', certainty: clean(info.certainty, 40) || 'Unknown',
    effectiveAt: clean(info.effective, 80) || null, expiresAt: clean(info.expires, 80) || null,
    areaDescription: clean(area.areaDesc, 500) || null, geometry, retrievedAt,
    source: { id: source.id, name: source.name, href: source.url, standard: 'OASIS CAP' },
  };
}

function alertsFromDocument(document, source, retrievedAt) {
  if (document.alert) return [normalizeAlert(document.alert, source, retrievedAt)].filter(Boolean);
  const entries = array(document.feed?.entry || document.rss?.channel?.item || document.alerts?.alert);
  return entries.map((entry) => normalizeAlert(entry.alert || entry, source, retrievedAt)).filter(Boolean);
}

async function fetchFeed(source) {
  const retrievedAt = new Date().toISOString();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(source.url, { signal: controller.signal, headers: { Accept: 'application/xml, application/atom+xml, application/json', 'User-Agent': 'NAVIRA/1.0 CAP-monitor' } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const text = await response.text();
    const document = text.trim().startsWith('{') ? JSON.parse(text) : parser.parse(text);
    const alerts = alertsFromDocument(document, source, retrievedAt).filter((alert) => !alert.expiresAt || Date.parse(alert.expiresAt) >= Date.now());
    return { alerts, source: { ...source, url: undefined, href: source.url, status: 'available', retrievedAt, recordCount: alerts.length, error: null } };
  } catch (error) {
    return { alerts: [], source: { ...source, url: undefined, href: source.url, status: 'unavailable', retrievedAt, recordCount: 0, error: error.name === 'AbortError' ? 'Source request timed out' : clean(error.message, 180) } };
  } finally { clearTimeout(timer); }
}

export async function getOfficialAlerts({ force = false } = {}) {
  if (!force && cache.value && Date.now() - cache.at < CACHE_MS) return cache.value;
  const configured = feeds();
  if (!configured.length) return {
    generatedAt: new Date().toISOString(), alerts: [], sources: [], fingerprint: '',
    coverage: { status: 'degraded', message: 'No jurisdiction CAP feed is configured. Official alert monitoring is unavailable for this deployment.' },
  };
  const results = await Promise.all(configured.map(fetchFeed));
  const alerts = results.flatMap((result) => result.alerts);
  const value = {
    generatedAt: new Date().toISOString(), alerts, sources: results.map((result) => result.source),
    fingerprint: alerts.map((item) => `${item.id}:${item.sentAt || item.effectiveAt || ''}:${item.status}`).sort().join('|'),
    coverage: results.some((result) => result.source.status === 'available')
      ? { status: 'available', message: 'Configured OASIS CAP sources are being monitored.' }
      : { status: 'degraded', message: 'Configured OASIS CAP sources did not return usable alerts.' },
  };
  cache = { at: Date.now(), value };
  return value;
}
