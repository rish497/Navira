import countries from 'world-countries';

const NOMINATIM_ENDPOINT = 'https://nominatim.openstreetmap.org/search';
const resultCache = new Map();
const originCache = new Map();
const inflight = new Map();
let nominatimQueue = Promise.resolve();
let lastNominatimRequestAt = 0;

const categorySearch = {
  buildings: { term: 'building', radiusKm: 22, accept: (item) => item.category === 'building' || Boolean(item.extratags?.building) },
  hospitals: { term: 'hospital', radiusKm: 28, accept: (item) => item.category === 'amenity' && ['hospital', 'clinic'].includes(item.type) },
  bridges: { term: 'bridge', radiusKm: 30, accept: (item) => item.type === 'bridge' || Boolean(item.extratags?.bridge) },
  schools: { term: 'school', radiusKm: 24, accept: (item) => item.category === 'amenity' && ['school', 'college', 'university'].includes(item.type) },
  roads: { term: 'road', radiusKm: 18, accept: (item) => item.category === 'highway' && ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'residential', 'unclassified', 'service'].includes(item.type) },
  airports: { term: 'airport', radiusKm: 80, accept: (item) => item.category === 'aeroway' && ['aerodrome', 'terminal'].includes(item.type) },
  other: { term: 'substation', radiusKm: 35, accept: (item) => (item.category === 'power' && ['plant', 'substation', 'generator'].includes(item.type)) || (/substation/i.test(item.displayName) && ['building', 'landuse'].includes(item.category)) },
};

function textQuery(value) {
  return typeof value === 'string' ? value.replace(/[\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160) : '';
}

function parseNumericTag(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const match = String(value).replace(',', '.').match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function geometryCoordinates(geometry) {
  if (!geometry || !Array.isArray(geometry.coordinates)) return [];
  if (geometry.type === 'Point') return [];
  if (geometry.type === 'LineString') return geometry.coordinates;
  if (geometry.type === 'MultiLineString') return geometry.coordinates[0] || [];
  if (geometry.type === 'Polygon') return geometry.coordinates[0] || [];
  if (geometry.type === 'MultiPolygon') {
    const rings = geometry.coordinates.flatMap((polygon) => polygon.slice(0, 1));
    return rings.sort((a, b) => b.length - a.length)[0] || [];
  }
  return [];
}

function featureCenter(feature, geometry) {
  if (feature.geometry?.type === 'Point') return feature.geometry.coordinates;
  if (Array.isArray(feature.bbox) && feature.bbox.length === 4) {
    return [(feature.bbox[0] + feature.bbox[2]) / 2, (feature.bbox[1] + feature.bbox[3]) / 2];
  }
  if (!geometry.length) return null;
  const total = geometry.reduce((sum, point) => [sum[0] + point[0], sum[1] + point[1]], [0, 0]);
  return [total[0] / geometry.length, total[1] / geometry.length];
}

function normalizeFeature(feature, category) {
  const properties = feature.properties || {};
  const extra = properties.extratags || {};
  const geometry = geometryCoordinates(feature.geometry);
  const center = featureCenter(feature, geometry);
  const osmType = properties.osm_type === 'N' ? 'node' : properties.osm_type === 'W' ? 'way' : properties.osm_type === 'R' ? 'relation' : properties.osm_type;
  const height = parseNumericTag(extra.height);
  const levels = parseNumericTag(extra['building:levels']);
  const linear = ['LineString', 'MultiLineString'].includes(feature.geometry?.type) || category === 'roads';
  const sourceName = properties.name || properties.namedetails?.name || properties.display_name?.split(',')[0] || 'Unnamed mapped feature';
  const genericName = /^(building|hospital|bridge|school|road|airport|substation)$/i.test(sourceName.trim());
  const displayName = genericName
    ? properties.display_name?.split(',').slice(0, 2).join(' · ') || sourceName
    : sourceName;
  return {
    id: `osm-${osmType}-${properties.osm_id}`,
    osmId: properties.osm_id,
    osmType,
    name: displayName,
    category,
    center,
    geometry,
    geometryType: linear
      ? geometry.length >= 2 ? 'line' : center ? 'point' : 'unavailable'
      : geometry.length >= 3 ? 'footprint' : center ? 'point' : 'unavailable',
    imported: {
      heightMeters: Number.isFinite(height) ? height : null,
      levels: Number.isFinite(levels) ? levels : null,
      material: extra['building:material'] || null,
      roofShape: extra['roof:shape'] || null,
      operator: extra.operator || null,
      address: properties.display_name || null,
    },
    tags: {
      category: properties.category || null,
      type: properties.type || null,
      ...extra,
    },
    source: {
      provider: 'OpenStreetMap contributors',
      dataset: 'OpenStreetMap',
      license: 'ODbL 1.0',
      url: `https://www.openstreetmap.org/${osmType}/${properties.osm_id}`,
    },
  };
}

async function fetchJson(url, timeout = 18000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'NAVIRA-Infrastructure-Simulation-Lab/1.0 (local prototype)',
        Referer: 'http://localhost:5180',
        Accept: 'application/geo+json, application/json',
      },
    });
    if (!response.ok) throw new Error(`OpenStreetMap search returned ${response.status}`);
    return await response.json();
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('OpenStreetMap infrastructure search timed out. Try again in a moment.');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function queueNominatim(request) {
  const queued = nominatimQueue.then(async () => {
    const wait = Math.max(0, 1050 - (Date.now() - lastNominatimRequestAt));
    if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
    lastNominatimRequestAt = Date.now();
    return request();
  });
  nominatimQueue = queued.catch(() => undefined);
  return queued;
}

async function resolveSearchOrigin(country, locationQuery = '') {
  const requestedLocation = String(locationQuery || '').trim().slice(0, 160);
  const originKey = `${country.cca2}:${requestedLocation.toLowerCase()}`;
  const cached = originCache.get(originKey);
  if (cached) return cached;
  const referencePlace = requestedLocation || country.capital?.[0] || country.name.common;
  const parameters = new URLSearchParams({ format: 'jsonv2', limit: '1', countrycodes: country.cca2.toLowerCase() });
  if (requestedLocation) parameters.set('q', `${requestedLocation}, ${country.name.common}`);
  else parameters.set('city', referencePlace);
  let origin;
  try {
    const results = await queueNominatim(() => fetchJson(`${NOMINATIM_ENDPOINT}?${parameters}`));
    const result = results?.[0];
    if (result && Number.isFinite(Number(result.lat)) && Number.isFinite(Number(result.lon))) {
      origin = { latitude: Number(result.lat), longitude: Number(result.lon), referencePlace };
    }
  } catch {
    origin = null;
  }
  if (!origin && Array.isArray(country.latlng) && country.latlng.length === 2) {
    origin = { latitude: Number(country.latlng[0]), longitude: Number(country.latlng[1]), referencePlace: `${country.name.common} reference coordinate` };
  }
  if (!origin) throw new Error('Country search origin is unavailable');
  originCache.set(originKey, origin);
  return origin;
}

async function searchNominatim(country, category, locationQuery = '') {
  const search = categorySearch[category];
  const origin = await resolveSearchOrigin(country, locationQuery);
  const latitudeSpan = search.radiusKm / 111;
  const longitudeSpan = Math.min(1.5, search.radiusKm / Math.max(20, 111 * Math.cos(origin.latitude * Math.PI / 180)));
  const viewbox = [
    origin.longitude - longitudeSpan,
    origin.latitude + latitudeSpan,
    origin.longitude + longitudeSpan,
    origin.latitude - latitudeSpan,
  ].join(',');
  const parameters = new URLSearchParams({
    format: 'geojson',
    polygon_geojson: '0',
    addressdetails: '1',
    extratags: '1',
    namedetails: '1',
    dedupe: '1',
    limit: '30',
    polygon_threshold: '0.001',
    countrycodes: country.cca2.toLowerCase(),
    bounded: '1',
    viewbox,
    q: search.term,
  });
  const raw = await queueNominatim(() => fetchJson(`${NOMINATIM_ENDPOINT}?${parameters}`));
  let directFeatures = [];
  if (locationQuery) {
    const directParameters = new URLSearchParams({
      format: 'geojson', polygon_geojson: '1', polygon_threshold: '0.00002', addressdetails: '1', extratags: '1', namedetails: '1',
      dedupe: '1', limit: '5', countrycodes: country.cca2.toLowerCase(), q: `${locationQuery}, ${country.name.common}`,
    });
    const direct = await queueNominatim(() => fetchJson(`${NOMINATIM_ENDPOINT}?${directParameters}`));
    directFeatures = direct.features || [];
  }
  const unique = new Map([...directFeatures, ...(raw.features || [])].map((feature) => [`${feature.properties?.osm_type}-${feature.properties?.osm_id}`, feature]));
  const assets = [...unique.values()]
    .filter((feature) => search.accept({
      category: feature.properties?.category,
      type: feature.properties?.type,
      displayName: feature.properties?.display_name || '',
      extratags: feature.properties?.extratags || {},
    }))
    .map((feature) => normalizeFeature(feature, category))
    .filter((asset) => asset.center)
    .slice(0, 30);
  return { assets, referencePlace: origin.referencePlace, radiusKm: search.radiusKm };
}

export function getSimulationCountries() {
  const listed = countries
    .filter((country) => country.cca2?.length === 2 && country.status === 'officially-assigned')
    .map((country) => ({ code: country.cca2, name: country.name.common }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return {
    countries: listed,
    source: {
      provider: 'ISO 3166-1 via world-countries',
      retrievedAt: new Date().toISOString(),
    },
  };
}

export async function getSimulationInfrastructure({ country, category, query }) {
  const countryCode = String(country || '').toUpperCase();
  const selectedCategory = String(category || '').toLowerCase();
  if (!/^[A-Z]{2}$/.test(countryCode)) throw new Error('Choose a valid ISO 3166-1 country code');
  if (!categorySearch[selectedCategory]) throw new Error('Choose a supported infrastructure category');
  const countryRecord = countries.find((item) => item.cca2 === countryCode);
  if (!countryRecord) throw new Error('Country reference data is unavailable');
  const locationQuery = textQuery(query);

  const cacheKey = `${countryCode}:${selectedCategory}:${locationQuery.toLowerCase()}`;
  const cached = resultCache.get(cacheKey);
  if (cached && Date.now() - cached.savedAt < 60 * 60 * 1000) return cached.payload;
  if (inflight.has(cacheKey)) return inflight.get(cacheKey);

  const task = searchNominatim(countryRecord, selectedCategory, locationQuery)
    .then(({ assets, referencePlace, radiusKm }) => {
      const retrievedAt = new Date().toISOString();
      const payload = {
        assets,
        category: selectedCategory,
        country: countryCode,
        retrievedAt,
        datasetUpdatedAt: null,
        source: {
          provider: 'OpenStreetMap contributors',
          dataset: 'OpenStreetMap search index via Nominatim',
          license: 'ODbL 1.0',
          attributionUrl: 'https://www.openstreetmap.org/copyright',
          queryScope: `Up to 30 indexed results matching “${categorySearch[selectedCategory].term}” within approximately ${radiusKm} km of ${referencePlace}, ${countryRecord.name.common}. This is a bounded local search, not a complete national infrastructure inventory.`,
        },
      };
      resultCache.set(cacheKey, { savedAt: Date.now(), payload });
      return payload;
    })
    .catch((error) => {
      const message = error.message?.startsWith('OpenStreetMap')
        ? error.message
        : 'OpenStreetMap infrastructure search is temporarily unavailable. Try again in a moment.';
      throw new Error(message);
    })
    .finally(() => inflight.delete(cacheKey));
  inflight.set(cacheKey, task);
  return task;
}
