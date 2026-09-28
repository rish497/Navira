import { bbox as geometryBbox, booleanIntersects, buffer, feature, lineString } from '@turf/turf';

const CACHE_MS = 60_000;
const DEFAULT_SOURCES = [{
  id: 'drivebc-open511',
  name: 'DriveBC Open511',
  href: 'https://api.open511.gov.bc.ca/help',
  endpoint: 'https://api.open511.gov.bc.ca/events?status=ACTIVE',
  jurisdiction: 'British Columbia, Canada',
  coverageBbox: [-139.06, 48.3, -114.03, 60],
  authority: 'Government of British Columbia',
}];

let cache = { at: 0, value: null };

const clean = (value, max = 500) => String(value || '').trim().slice(0, max);
const validGeometry = (geometry) => {
  if (!geometry || !['Point', 'LineString', 'MultiLineString', 'Polygon', 'MultiPolygon'].includes(geometry.type)) return null;
  return Array.isArray(geometry.coordinates) ? geometry : null;
};

function configuredSources() {
  const configured = clean(process.env.NAVIRA_OPEN511_FEEDS, 4000);
  if (!configured) return DEFAULT_SOURCES;
  return configured.split(',').map((endpoint, index) => endpoint.trim()).filter((endpoint) => /^https:\/\//i.test(endpoint)).map((endpoint, index) => ({
    id: `configured-open511-${index + 1}`,
    name: `Configured Open511 source ${index + 1}`,
    href: endpoint,
    endpoint,
    jurisdiction: 'Configured jurisdiction',
    coverageBbox: null,
    authority: 'Configured source owner',
  }));
}

function restrictionStatus(event, retrievedAt) {
  const text = [event.headline, event.event_type, ...(event.event_subtypes || []), event.description].join(' ').toUpperCase();
  const updated = Date.parse(event.updated || event.created || '');
  if (!Number.isFinite(updated) || Date.parse(retrievedAt) - updated > 36 * 60 * 60 * 1000) return 'STALE_UNKNOWN';
  if (/\b(ROAD[_ ]?CLOSED|FULL CLOSURE|CLOSED TO (ALL )?TRAFFIC|ROAD IS CLOSED|HIGHWAY IS CLOSED)\b/.test(text)) return 'CONFIRMED_CLOSED';
  if (/\b(OBSTRUCTION|HAZARD|INCIDENT|BLOCKED|DEBRIS|WASHOUT|COLLISION)\b/.test(text)) return 'REPORTED_OBSTRUCTION';
  return null;
}

function normalizeEvent(event, source, retrievedAt) {
  const geometry = validGeometry(event.geography);
  const status = restrictionStatus(event, retrievedAt);
  if (!geometry || !status || !event.id) return null;
  return {
    id: `${source.id}:${clean(event.id, 180)}`,
    sourceEventId: clean(event.id, 180),
    title: clean(event.description || event.headline || 'Road restriction', 240),
    description: clean(event.description, 1000) || null,
    status,
    sourceStatus: clean(event.status, 40) || 'UNKNOWN',
    severity: clean(event.severity, 40) || 'UNKNOWN',
    eventType: clean(event.event_type, 80) || 'UNKNOWN',
    eventSubtypes: Array.isArray(event.event_subtypes) ? event.event_subtypes.map((item) => clean(item, 80)).filter(Boolean) : [],
    geometry,
    createdAt: event.created || null,
    updatedAt: event.updated || event.created || null,
    retrievedAt,
    schedule: event.schedule || null,
    source: { id: source.id, name: source.name, href: event.url || source.href, authority: source.authority },
    freshness: status === 'STALE_UNKNOWN' ? 'stale-or-unknown' : 'current-at-retrieval',
  };
}

async function fetchSource(source) {
  const retrievedAt = new Date().toISOString();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const endpoints = source.id === 'drivebc-open511'
      ? ['', '&event_type=INCIDENT', '&event_type=CONSTRUCTION', '&event_type=WEATHER_CONDITION'].map((suffix) => `${source.endpoint}${suffix}`)
      : [source.endpoint];
    const payloads = await Promise.all(endpoints.map(async (endpoint) => {
      const response = await fetch(endpoint, { signal: controller.signal, headers: { Accept: 'application/json', 'User-Agent': 'NAVIRA/1.0 road-awareness' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    }));
    const events = [...new Map(payloads.flatMap((payload) => payload.events || []).map((event) => [event.id, event])).values()];
    const restrictions = events.map((event) => normalizeEvent(event, source, retrievedAt)).filter(Boolean);
    return {
      restrictions,
      source: { ...source, endpoint: undefined, status: 'available', retrievedAt, recordCount: restrictions.length, error: null },
    };
  } catch (error) {
    return {
      restrictions: [],
      source: { ...source, endpoint: undefined, status: 'unavailable', retrievedAt, recordCount: 0, error: error.name === 'AbortError' ? 'Source request timed out' : clean(error.message, 180) },
    };
  } finally {
    clearTimeout(timer);
  }
}

function intersectsBbox(geometry, bounds) {
  if (!bounds || bounds.length !== 4) return true;
  try {
    const [minX, minY, maxX, maxY] = geometryBbox(feature(geometry));
    return minX <= bounds[2] && maxX >= bounds[0] && minY <= bounds[3] && maxY >= bounds[1];
  } catch { return false; }
}

function sourceCovers(source, bounds) {
  if (!bounds || !source.coverageBbox) return source.coverageBbox ? null : true;
  const [minX, minY, maxX, maxY] = source.coverageBbox;
  return bounds[0] <= maxX && bounds[2] >= minX && bounds[1] <= maxY && bounds[3] >= minY;
}

export async function getRoadRestrictions({ bounds = null, force = false } = {}) {
  if (!force && cache.value && Date.now() - cache.at < CACHE_MS) return filterResult(cache.value, bounds);
  const results = await Promise.all(configuredSources().map(fetchSource));
  const value = {
    generatedAt: new Date().toISOString(),
    restrictions: results.flatMap((result) => result.restrictions),
    sources: results.map((result) => result.source),
  };
  value.fingerprint = value.restrictions.map((item) => `${item.id}:${item.status}:${item.updatedAt || ''}`).sort().join('|');
  cache = { at: Date.now(), value };
  return filterResult(value, bounds);
}

function filterResult(value, bounds) {
  const restrictions = bounds ? value.restrictions.filter((item) => intersectsBbox(item.geometry, bounds)) : value.restrictions;
  const sources = value.sources.map((source) => ({ ...source, coversRequestedArea: sourceCovers(source, bounds) }));
  const availableCoverage = sources.some((source) => source.status === 'available' && source.coversRequestedArea !== false);
  return {
    ...value,
    restrictions,
    fingerprint: restrictions.map((item) => `${item.id}:${item.status}:${item.updatedAt || ''}`).sort().join('|'),
    sources,
    coverage: {
      status: availableCoverage ? 'available' : 'degraded',
      message: availableCoverage
        ? 'Connected Open511 sources cover at least part of the requested area. Absence of a restriction is not proof that a road is open.'
        : 'No connected road-restriction source covers this area. Routing continues with degraded road awareness.',
      noDataIsOpen: false,
    },
  };
}

export function routeRestrictionAnalysis(routeGeometry, restrictions) {
  const route = feature(routeGeometry);
  const hits = [];
  for (const restriction of restrictions || []) {
    try {
      const restrictionFeature = feature(restriction.geometry);
      const comparison = ['LineString', 'MultiLineString', 'Point'].includes(restriction.geometry.type)
        ? buffer(restrictionFeature, restriction.status === 'CONFIRMED_CLOSED' ? 0.035 : 0.02, { units: 'kilometers' })
        : restrictionFeature;
      if (comparison && booleanIntersects(route, comparison)) hits.push(restriction);
    } catch { /* Invalid upstream geometry is ignored rather than inferred. */ }
  }
  return {
    blocked: hits.some((item) => item.status === 'CONFIRMED_CLOSED'),
    restrictions: hits.map((item) => ({
      id: item.id, title: item.title, status: item.status, source: item.source,
      updatedAt: item.updatedAt, retrievedAt: item.retrievedAt, freshness: item.freshness,
    })),
  };
}

export function routeBounds(start, end) {
  const pad = 0.15;
  const extent = geometryBbox(lineString([start, end]));
  return [extent[0] - pad, extent[1] - pad, extent[2] + pad, extent[3] + pad];
}
