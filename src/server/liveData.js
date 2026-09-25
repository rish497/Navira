import https from 'node:https';

const SOURCE_ENDPOINTS = {
  eonet: 'https://eonet.gsfc.nasa.gov/api/v3/events?status=open&days=30&limit=100',
  gdacs: 'https://www.gdacs.org/gdacsapi/api/events/geteventlist/events4app',
  usgs: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_week.geojson',
};

const SOURCE_META = {
  eonet: {
    id: 'eonet',
    name: 'NASA EONET',
    authority: 'NASA Earth Observatory Natural Event Tracker',
    href: 'https://eonet.gsfc.nasa.gov/',
  },
  gdacs: {
    id: 'gdacs',
    name: 'GDACS',
    authority: 'Global Disaster Alert and Coordination System',
    href: 'https://www.gdacs.org/',
  },
  usgs: {
    id: 'usgs',
    name: 'USGS',
    authority: 'U.S. Geological Survey Earthquake Hazards Program',
    href: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php',
  },
};

const CACHE_TTL = 5 * 60 * 1000;
let liveCache = null;
let liveCacheTime = 0;
const newsCache = new Map();
let eonetCache = null;
let eonetCacheTime = 0;
let eonetInflight = null;

function asDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? null : date.toISOString();
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function sanitizeGeometry(geometry) {
  if (!geometry || typeof geometry !== 'object') return null;
  const allowed = new Set(['Point', 'MultiPoint', 'LineString', 'MultiLineString', 'Polygon', 'MultiPolygon']);
  if (!allowed.has(geometry.type) || !Array.isArray(geometry.coordinates)) return null;
  return { type: geometry.type, coordinates: geometry.coordinates };
}

function pointCoordinates(geometry) {
  if (geometry?.type !== 'Point' || !Array.isArray(geometry.coordinates)) return null;
  const [longitude, latitude] = geometry.coordinates.map(Number);
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null;
  return [longitude, latitude];
}

async function getJson(url, timeout = 30000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json, application/geo+json;q=0.9' },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Upstream returned HTTP ${response.status}`);
    return JSON.parse(await response.text());
  } finally {
    clearTimeout(timer);
  }
}

function getJsonOverIpv4(url, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, {
      family: 4,
      headers: { Accept: 'application/json, application/geo+json;q=0.9', 'User-Agent': 'NAVIRA/1.0 live-data gateway' },
    }, (response) => {
      if (response.statusCode < 200 || response.statusCode >= 300) {
        response.resume();
        reject(new Error(`Upstream returned HTTP ${response.statusCode}`));
        return;
      }
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => {
        try { resolve(JSON.parse(body)); } catch { reject(new Error('Upstream returned invalid JSON')); }
      });
    });
    request.setTimeout(timeout, () => request.destroy(new Error('Upstream request timed out')));
    request.on('error', reject);
  });
}

function normalizeEonet(payload) {
  return (payload.events || []).flatMap((item) => {
    const latest = [...(item.geometry || [])].sort((a, b) => Date.parse(b.date || 0) - Date.parse(a.date || 0))[0];
    const geometry = sanitizeGeometry(latest ? { type: latest.type, coordinates: latest.coordinates } : null);
    if (!geometry || !item.id || !item.title) return [];
    const category = item.categories?.[0]?.title || 'Data unavailable';
    const magnitude = finiteNumber(latest?.magnitudeValue);
    const magnitudeUnit = latest?.magnitudeUnit || '';
    return [{
      id: `eonet:${item.id}`,
      sourceEventId: String(item.id),
      title: String(item.title),
      type: category,
      severity: magnitude === null ? 'Data unavailable' : `${magnitude}${magnitudeUnit ? ` ${magnitudeUnit}` : ''}`,
      severityLevel: 'unknown',
      timestamp: asDate(latest?.date),
      updatedAt: asDate(latest?.date),
      status: item.closed ? 'Closed' : 'Open',
      description: item.description || null,
      source: SOURCE_META.eonet,
      sourceUrl: item.link || SOURCE_META.eonet.href,
      sourceLinks: (item.sources || []).map((source) => ({ name: source.id || 'Source', href: source.url })).filter((source) => source.href),
      geometry,
      coordinates: pointCoordinates(geometry),
      geometryKind: geometry.type,
      country: null,
      gdacsKey: null,
    }];
  });
}

function gdacsType(code) {
  const types = { EQ: 'Earthquake', FL: 'Flood', TC: 'Tropical cyclone', VO: 'Volcano', WF: 'Wildfire', DR: 'Drought' };
  return types[code] || code || 'Data unavailable';
}

function normalizeGdacs(payload) {
  return (payload.features || []).flatMap((feature) => {
    const props = feature.properties || {};
    const geometry = sanitizeGeometry(feature.geometry);
    if (!geometry || !props.eventtype || props.eventid == null || !props.name) return [];
    const alert = props.alertlevel ? String(props.alertlevel) : 'Data unavailable';
    const severityText = props.severitydata?.severitytext?.trim();
    const modified = asDate(props.datemodified);
    return [{
      id: `gdacs:${props.eventtype}:${props.eventid}:${props.episodeid ?? ''}`,
      sourceEventId: String(props.eventid),
      title: String(props.name),
      type: gdacsType(String(props.eventtype)),
      severity: severityText || (alert === 'Data unavailable' ? alert : `${alert} alert`),
      severityLevel: alert.toLowerCase(),
      timestamp: asDate(props.fromdate),
      updatedAt: modified || asDate(props.todate),
      status: String(props.iscurrent).toLowerCase() === 'true' ? 'Current' : 'Past',
      description: props.description || null,
      source: SOURCE_META.gdacs,
      sourceUrl: props.url?.report || props.url?.details || SOURCE_META.gdacs.href,
      sourceLinks: [{ name: 'GDACS report', href: props.url?.report }, { name: 'GDACS details', href: props.url?.details }].filter((item) => item.href),
      geometry,
      coordinates: pointCoordinates(geometry),
      geometryKind: geometry.type,
      country: props.country || null,
      gdacsKey: {
        eventtype: String(props.eventtype),
        eventid: String(props.eventid),
        episodeid: String(props.episodeid ?? ''),
      },
    }];
  });
}

function normalizeUsgs(payload) {
  return (payload.features || []).flatMap((feature) => {
    const props = feature.properties || {};
    const geometry = sanitizeGeometry(feature.geometry);
    if (!geometry || !feature.id || !props.place) return [];
    const magnitude = finiteNumber(props.mag);
    return [{
      id: `usgs:${feature.id}`,
      sourceEventId: String(feature.id),
      title: String(props.title || props.place),
      type: String(props.type || 'Earthquake'),
      severity: magnitude === null ? 'Data unavailable' : `Magnitude ${magnitude}`,
      severityLevel: props.alert ? String(props.alert).toLowerCase() : 'unknown',
      timestamp: asDate(props.time),
      updatedAt: asDate(props.updated),
      status: props.status ? String(props.status) : 'Data unavailable',
      description: null,
      source: SOURCE_META.usgs,
      sourceUrl: props.url || props.detail || SOURCE_META.usgs.href,
      sourceLinks: [{ name: 'USGS event page', href: props.url }].filter((item) => item.href),
      geometry,
      coordinates: pointCoordinates(geometry),
      geometryKind: geometry.type,
      country: null,
      gdacsKey: null,
    }];
  });
}

function newestTimestamp(events) {
  const times = events.map((event) => Date.parse(event.updatedAt || event.timestamp)).filter(Number.isFinite);
  return times.length ? new Date(Math.max(...times)).toISOString() : null;
}

async function fetchSource(id, normalize) {
  const fetchedAt = new Date().toISOString();
  try {
    const payload = id === 'eonet' ? await getJsonOverIpv4(SOURCE_ENDPOINTS[id]) : await getJson(SOURCE_ENDPOINTS[id]);
    const events = normalize(payload);
    const sourceUpdatedAt = id === 'usgs' ? asDate(payload.metadata?.generated) : newestTimestamp(events);
    return {
      source: { ...SOURCE_META[id], status: 'available', fetchedAt, sourceUpdatedAt, count: events.length, error: null },
      events,
    };
  } catch (error) {
    return {
      source: { ...SOURCE_META[id], status: 'unavailable', fetchedAt, sourceUpdatedAt: null, count: null, error: error.message || 'Data unavailable' },
      events: [],
    };
  }
}

function assembleLiveData(results) {
  const events = results.flatMap((result) => result.events).sort((a, b) => Date.parse(b.timestamp || 0) - Date.parse(a.timestamp || 0));
  return {
    generatedAt: new Date().toISOString(),
    events,
    sources: results.map((result) => result.source),
    notices: {
      routes: 'Data unavailable',
      dispatch: 'Data unavailable',
      resources: 'Data unavailable',
      infrastructure: 'Data unavailable',
      simulation: 'Data unavailable',
      aiSummary: process.env.OPENAI_API_KEY ? 'Available server-side' : 'Data unavailable — no server-side AI API key configured',
    },
  };
}

function requestEonet(force = false) {
  if (!force && eonetCache && Date.now() - eonetCacheTime < CACHE_TTL) return Promise.resolve(eonetCache);
  if (eonetInflight) return eonetInflight;
  eonetInflight = fetchSource('eonet', normalizeEonet).then((result) => {
    if (result.source.status === 'available') {
      eonetCache = result;
      eonetCacheTime = Date.now();
    }
    return result;
  }).finally(() => { eonetInflight = null; });
  return eonetInflight;
}

function pendingEonetSource() {
  return {
    source: { ...SOURCE_META.eonet, status: 'unavailable', fetchedAt: new Date().toISOString(), sourceUpdatedAt: null, count: null, error: 'Source response is still pending' },
    events: [],
  };
}

function refreshCachedEonet(result) {
  if (result.source.status !== 'available' || !liveCache) return;
  const otherResults = liveCache.sources.filter((source) => source.id !== 'eonet').map((source) => ({
    source,
    events: liveCache.events.filter((event) => event.source.id === source.id),
  }));
  liveCache = assembleLiveData([result, ...otherResults]);
  liveCacheTime = Date.now();
}

export async function getLiveData({ force = false } = {}) {
  if (!force && liveCache && Date.now() - liveCacheTime < CACHE_TTL) {
    if (liveCache.sources.some((source) => source.id === 'eonet' && source.status !== 'available')) requestEonet(false).then(refreshCachedEonet);
    return liveCache;
  }
  const eonetRequest = requestEonet(force);
  const eonetWithinInitialWindow = Promise.race([
    eonetRequest,
    new Promise((resolve) => setTimeout(() => resolve(pendingEonetSource()), 6500)),
  ]);
  const results = await Promise.all([
    eonetWithinInitialWindow,
    fetchSource('gdacs', normalizeGdacs),
    fetchSource('usgs', normalizeUsgs),
  ]);
  liveCache = assembleLiveData(results);
  liveCacheTime = Date.now();
  eonetRequest.then(refreshCachedEonet);
  return liveCache;
}

function validGdacsPart(value, pattern) {
  return typeof value === 'string' && pattern.test(value);
}

export async function getGdacsGeometry({ eventtype, eventid, episodeid }) {
  if (!validGdacsPart(eventtype, /^[A-Z]{2}$/) || !validGdacsPart(eventid, /^\d+$/) || !validGdacsPart(episodeid, /^\d+$/)) {
    throw new Error('Invalid GDACS event key');
  }
  const params = new URLSearchParams({ eventtype, eventid, episodeid });
  const payload = await getJson(`https://www.gdacs.org/gdacsapi/api/polygons/getgeometry?${params}`);
  return { fetchedAt: new Date().toISOString(), source: SOURCE_META.gdacs, data: payload };
}

export async function getGdacsNews({ eventtype, eventid }) {
  if (!validGdacsPart(eventtype, /^[A-Z]{2}$/) || !validGdacsPart(eventid, /^\d+$/)) {
    throw new Error('Invalid GDACS event key');
  }
  const cacheKey = `${eventtype}:${eventid}`;
  const cached = newsCache.get(cacheKey);
  if (cached && Date.now() - cached.time < CACHE_TTL) return cached.data;
  const params = new URLSearchParams({ eventtype, eventid, limit: '20' });
  const payload = await getJson(`https://www.gdacs.org/gdacsapi/api/Emm/getemmnewsbykey?${params}`);
  const items = (Array.isArray(payload) ? payload : []).flatMap((item, index) => {
    if (!item?.title) return [];
    return [{
      id: item.emmid || `${cacheKey}:${index}`,
      title: String(item.title),
      description: item.description || null,
      publishedAt: asDate(item.pubdate),
      publisher: item.source || 'Data unavailable',
      href: item.link || null,
      classification: 'News reporting',
    }];
  });
  const data = {
    fetchedAt: new Date().toISOString(),
    source: { name: 'GDACS / Europe Media Monitor', href: 'https://www.gdacs.org/' },
    classification: 'News reporting — not an agency-verified incident record',
    items,
  };
  newsCache.set(cacheKey, { time: Date.now(), data });
  return data;
}
