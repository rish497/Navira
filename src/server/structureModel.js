import { createHash, randomUUID } from 'node:crypto';

const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';
const evidenceCache = new Map();
const modelCache = new Map();

const allowedCategories = new Set(['buildings', 'hospitals', 'bridges', 'schools', 'airports', 'other']);
const allowedMassing = new Set(['single-volume', 'podium-tower', 'stepped', 'multi-wing', 'courtyard', 'linear', 'terminal', 'bridge']);
const allowedRoofs = new Set(['flat', 'gable', 'hip', 'dome', 'vaulted', 'sawtooth', 'complex', 'unknown']);
const allowedPatterns = new Set(['grid', 'horizontal-bands', 'vertical-bays', 'irregular', 'limited', 'none', 'unknown']);
const allowedMaterials = new Set(['concrete', 'glass', 'brick', 'stone', 'metal', 'timber', 'stucco', 'mixed', 'unknown']);
const hex = /^#[0-9a-f]{6}$/i;

function finite(value, min, max, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

function text(value, limit = 400) {
  return typeof value === 'string' ? value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, limit) : '';
}

function safeAsset(input) {
  const center = Array.isArray(input?.center) ? input.center.slice(0, 2).map(Number) : [];
  if (center.length !== 2 || !center.every(Number.isFinite)) throw new Error('The selected infrastructure location is unavailable');
  return {
    id: text(input.id, 120),
    osmId: finite(input.osmId, 1, Number.MAX_SAFE_INTEGER),
    osmType: ['node', 'way', 'relation'].includes(input.osmType) ? input.osmType : null,
    name: text(input.name, 180) || 'Mapped infrastructure',
    category: allowedCategories.has(input.category) ? input.category : 'buildings',
    center,
    geometry: Array.isArray(input.geometry) ? input.geometry.slice(0, 2000).map((point) => Array.isArray(point) ? point.slice(0, 2).map(Number) : []).filter((point) => point.length === 2 && point.every(Number.isFinite)) : [],
    geometryType: text(input.geometryType, 40),
    geometryMatch: text(input.geometryMatch, 60) || null,
    siteFeatures: Array.isArray(input.siteFeatures) ? input.siteFeatures.slice(0, 250).map((feature) => ({
      id: text(feature.id, 100), type: text(feature.type, 40), name: text(feature.name, 160),
      geometry: Array.isArray(feature.geometry) ? feature.geometry.slice(0, 3000).map((point) => Array.isArray(point) ? point.slice(0, 2).map(Number) : []).filter((point) => point.length === 2 && point.every(Number.isFinite)) : [],
      tags: Object.fromEntries(Object.entries(feature.tags || {}).slice(0, 40).map(([key, value]) => [text(key, 80), text(value, 160)])),
    })).filter((feature) => feature.geometry.length >= 1) : [],
    imported: {
      heightMeters: finite(input.imported?.heightMeters, 1, 1000),
      levels: finite(input.imported?.levels, 1, 200),
      material: text(input.imported?.material, 80) || null,
      roofShape: text(input.imported?.roofShape, 80) || null,
      address: text(input.imported?.address, 300) || null,
    },
    tags: Object.fromEntries(Object.entries(input.tags || {}).slice(0, 80).map(([key, value]) => [text(key, 80), text(value, 240)])),
    sourceUrl: text(input.source?.url, 400),
  };
}

async function overpass(query, timeout = 32000) {
  const endpoints = ['https://overpass.kumi.systems/api/interpreter', 'https://overpass-api.de/api/interpreter'];
  for (const endpoint of endpoints) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.min(timeout, 70000));
    try {
      const response = await fetch(endpoint, {
        method: 'POST', signal: controller.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 NAVIRA-Infrastructure-Lab/1.0 (+http://localhost:5180/)', From: 'navira-infrastructure-lab@localhost.invalid', 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: new URLSearchParams({ data: query }),
      });
      if (!response.ok) continue;
      const payload = await response.json();
      if (Array.isArray(payload.elements)) return payload.elements;
    } catch {
      // Try the next public Overpass endpoint. An empty result remains honest.
    } finally {
      clearTimeout(timer);
    }
  }
  return [];
}

function overpassGeometry(element) {
  if (Number.isFinite(Number(element.lon)) && Number.isFinite(Number(element.lat))) return [[Number(element.lon), Number(element.lat)]];
  return (element.geometry || []).map((point) => [Number(point.lon), Number(point.lat)]).filter((point) => point.every(Number.isFinite));
}

async function osmJson(url, timeout = 60000) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(timeout),
    headers: { 'User-Agent': 'NAVIRA-Infrastructure-Lab/1.0', Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`OpenStreetMap returned ${response.status}`);
  return response.json();
}

async function airportSiteFeaturesFromOsmMap(asset) {
  if (asset.osmType !== 'relation' || !asset.osmId) return [];
  try {
    const relation = await osmJson(`https://api.openstreetmap.org/api/0.6/relation/${asset.osmId}/full.json`, 30000);
    const boundaryNodes = (relation.elements || []).filter((element) => element.type === 'node' && Number.isFinite(element.lon) && Number.isFinite(element.lat));
    if (boundaryNodes.length < 3) return [];
    const bounds = {
      minLon: Math.min(...boundaryNodes.map((node) => node.lon)), minLat: Math.min(...boundaryNodes.map((node) => node.lat)),
      maxLon: Math.max(...boundaryNodes.map((node) => node.lon)), maxLat: Math.max(...boundaryNodes.map((node) => node.lat)),
    };
    const width = bounds.maxLon - bounds.minLon;
    const height = bounds.maxLat - bounds.minLat;
    if (width <= 0 || height <= 0 || width > .25 || height > .25 || width * height > .03) return [];
    const bbox = [bounds.minLon, bounds.minLat, bounds.maxLon, bounds.maxLat].join(',');
    const extract = await osmJson(`https://api.openstreetmap.org/api/0.6/map.json?bbox=${bbox}`, 90000);
    const elements = extract.elements || [];
    const nodes = new Map(elements.filter((element) => element.type === 'node').map((node) => [node.id, [node.lon, node.lat]]));
    const wanted = new Set(['runway', 'taxiway', 'apron', 'terminal', 'jet_bridge']);
    const features = elements.filter((element) => element.type === 'way' && (wanted.has(element.tags?.aeroway) || element.tags?.building === 'terminal')).map((element) => ({
      id: `osm-way-${element.id}`,
      type: element.tags?.aeroway === 'terminal' || element.tags?.building === 'terminal' ? 'terminal' : element.tags.aeroway,
      name: text(element.tags?.name, 160),
      geometry: (element.nodes || []).map((id) => nodes.get(id)).filter(Boolean),
      tags: element.tags || {},
    })).filter((feature) => feature.geometry.length >= 2);
    const terminalPoints = features.filter((feature) => feature.type === 'terminal').flatMap((feature) => feature.geometry);
    const pointFeatures = elements.filter((element) => element.type === 'node' && (element.tags?.aeroway === 'gate' || element.tags?.entrance)).flatMap((element) => {
      const geometry = [[element.lon, element.lat]];
      const type = element.tags?.aeroway === 'gate' ? 'gate' : 'entrance';
      if (type === 'entrance' && terminalPoints.length && Math.min(...terminalPoints.map((point) => haversineMeters(geometry[0], point))) > 100) return [];
      return [{ id: `osm-node-${element.id}`, type, name: text(element.tags?.name || element.tags?.ref, 160), geometry, tags: element.tags || {} }];
    });
    const quotas = { runway: 12, terminal: 24, apron: 36, jet_bridge: 60, taxiway: 110, gate: 60, entrance: 60 };
    return Object.entries(quotas).flatMap(([type, limit]) => [...features, ...pointFeatures].filter((feature) => feature.type === type).slice(0, limit));
  } catch {
    return [];
  }
}

async function airportSiteFeatures(asset) {
  if (asset.category !== 'airports') return [];
  const mapped = await airportSiteFeaturesFromOsmMap(asset);
  if (mapped.length) return mapped;
  const [longitude, latitude] = asset.center;
  const coreQuery = `[out:json][timeout:28];(way(around:6500,${latitude},${longitude})["aeroway"="runway"];way(around:6500,${latitude},${longitude})["aeroway"="taxiway"];way(around:6500,${latitude},${longitude})["aeroway"="apron"];way(around:6500,${latitude},${longitude})["aeroway"="terminal"];way(around:6500,${latitude},${longitude})["aeroway"="jet_bridge"];way(around:6500,${latitude},${longitude})["building"]["aeroway"="terminal"];);out tags geom 250;`;
  const pointQuery = `[out:json][timeout:18];(node(around:4500,${latitude},${longitude})["aeroway"="gate"];node(around:4500,${latitude},${longitude})["entrance"];);out tags 120;`;
  const core = await overpass(coreQuery, 70000);
  const points = core.length ? await overpass(pointQuery, 40000) : [];
  const elements = [...core, ...points];
  return elements.map((element) => {
    const geometry = overpassGeometry(element);
    const type = element.tags?.aeroway === 'terminal' || element.tags?.building === 'terminal' ? 'terminal' : element.tags?.aeroway === 'gate' ? 'gate' : element.tags?.entrance ? 'entrance' : element.tags?.aeroway || 'airport-feature';
    return { id: `osm-way-${element.id}`, type, name: text(element.tags?.name, 160), geometry, tags: element.tags || {} };
  }).filter((feature) => feature.geometry.length >= 1);
}

async function nearbyBridgeGeometry(asset) {
  if (asset.category !== 'bridges') return null;
  const [longitude, latitude] = asset.center;
  const elements = await overpass(`[out:json][timeout:20];way(around:900,${latitude},${longitude})["bridge"];out tags geom 50;`, 26000);
  const words = asset.name.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 3 && word !== 'bridge');
  const candidates = elements.map((element) => {
    const geometry = overpassGeometry(element);
    if (geometry.length < 2) return null;
    const name = `${element.tags?.name || ''} ${element.tags?.official_name || ''}`.toLowerCase();
    const nameMatches = words.filter((word) => name.includes(word)).length;
    const distanceMeters = haversineMeters(asset.center, footprintCenter(geometry));
    return { geometry, nameMatches, distanceMeters, score: nameMatches * 200 + Math.max(0, 900 - distanceMeters), id: element.id };
  }).filter(Boolean).sort((a, b) => b.score - a.score);
  const best = candidates[0];
  if (!best || (!best.nameMatches && best.distanceMeters > 180)) return null;
  return { geometry: best.geometry, geometryType: 'line', geometryMatch: best.nameMatches ? 'name-and-proximity' : 'proximity-only', geometrySourceUrl: `https://www.openstreetmap.org/way/${best.id}` };
}

function haversineMeters(a, b) {
  const radius = 6371000;
  const lat1 = a[1] * Math.PI / 180;
  const lat2 = b[1] * Math.PI / 180;
  const deltaLat = (b[1] - a[1]) * Math.PI / 180;
  const deltaLon = (b[0] - a[0]) * Math.PI / 180;
  const value = Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return 2 * radius * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function footprintCenter(geometry) {
  const total = geometry.reduce((sum, point) => [sum[0] + point[0], sum[1] + point[1]], [0, 0]);
  return [total[0] / geometry.length, total[1] / geometry.length];
}

async function nearbyBuildingFootprint(asset) {
  if (!['buildings', 'hospitals', 'schools', 'airports', 'other'].includes(asset.category)) return null;
  const [longitude, latitude] = asset.center;
  const query = `[out:json][timeout:20];way(around:140,${latitude},${longitude})["building"];out tags geom 30;`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 24000);
  try {
    const response = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST', signal: controller.signal,
      headers: { 'User-Agent': 'NAVIRA-Infrastructure-Lab/1.0', 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({ data: query }),
    });
    if (!response.ok) return null;
    const payload = await response.json();
    const targetWords = asset.name.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 3 && !['hospital', 'school', 'college', 'building', 'medical'].includes(word));
    const candidates = (payload.elements || []).map((element) => {
      const geometry = (element.geometry || []).map((point) => [Number(point.lon), Number(point.lat)]).filter((point) => point.every(Number.isFinite));
      if (geometry.length < 3) return null;
      const candidateName = `${element.tags?.name || ''} ${element.tags?.official_name || ''} ${element.tags?.operator || ''}`.toLowerCase();
      const nameMatches = targetWords.filter((word) => candidateName.includes(word)).length;
      const distanceMeters = haversineMeters(asset.center, footprintCenter(geometry));
      const categoryMatch = asset.category === 'hospitals' ? element.tags?.amenity === 'hospital' || /hospital|clinic/.test(candidateName)
        : asset.category === 'schools' ? ['school', 'college', 'university'].includes(element.tags?.amenity) || /school|college|university/.test(candidateName)
          : true;
      return { geometry, element, nameMatches, categoryMatch, distanceMeters, score: nameMatches * 100 + (categoryMatch ? 20 : 0) + Math.max(0, 140 - distanceMeters) };
    }).filter(Boolean).sort((a, b) => b.score - a.score);
    const best = candidates[0];
    if (!best || (!best.nameMatches && !best.categoryMatch && best.distanceMeters > 35) || (!best.nameMatches && best.distanceMeters > 60)) return null;
    return {
      geometry: best.geometry,
      geometryMatch: best.nameMatches ? 'name-and-proximity' : 'proximity-only',
      geometrySourceUrl: `https://www.openstreetmap.org/way/${best.element.id}`,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function detailedGeometry(feature) {
  const geometry = feature?.geometry;
  if (!geometry?.coordinates) return [];
  if (geometry.type === 'Polygon') return geometry.coordinates[0] || [];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates.flatMap((polygon) => polygon.slice(0, 1)).sort((a, b) => b.length - a.length)[0] || [];
  if (geometry.type === 'LineString') return geometry.coordinates;
  if (geometry.type === 'MultiLineString') return geometry.coordinates.sort((a, b) => b.length - a.length)[0] || [];
  return [];
}

async function enrichMappedAsset(asset) {
  if (!asset.osmId || !asset.osmType) return asset;
  const prefix = asset.osmType === 'node' ? 'N' : asset.osmType === 'way' ? 'W' : 'R';
  const parameters = new URLSearchParams({ format: 'geojson', osm_ids: `${prefix}${asset.osmId}`, polygon_geojson: '1', polygon_threshold: '0.00002', extratags: '1', addressdetails: '1' });
  try {
    const payload = await getJson(`https://nominatim.openstreetmap.org/lookup?${parameters}`, 22000);
    const feature = payload.features?.[0];
    const geometry = detailedGeometry(feature);
    if (!geometry.length) {
      const nearby = asset.category === 'bridges' ? await nearbyBridgeGeometry(asset) : await nearbyBuildingFootprint(asset);
      const enriched = nearby ? { ...asset, ...nearby, geometryType: nearby.geometryType || 'footprint' } : asset;
      return asset.category === 'airports' ? { ...enriched, siteFeatures: await airportSiteFeatures(enriched) } : enriched;
    }
    const extra = feature.properties?.extratags || {};
    const enriched = {
      ...asset,
      geometry,
      geometryType: ['LineString', 'MultiLineString'].includes(feature.geometry?.type) ? 'line' : 'footprint',
      imported: {
        ...asset.imported,
        heightMeters: asset.imported.heightMeters ?? finite(extra.height, 1, 1000),
        levels: asset.imported.levels ?? finite(extra['building:levels'], 1, 200),
        material: asset.imported.material || text(extra['building:material'], 80) || null,
        roofShape: asset.imported.roofShape || text(extra['roof:shape'], 80) || null,
      },
      tags: { ...asset.tags, ...Object.fromEntries(Object.entries(extra).slice(0, 80).map(([key, value]) => [text(key, 80), text(value, 240)])) },
    };
    return asset.category === 'airports' ? { ...enriched, siteFeatures: await airportSiteFeatures(enriched) } : enriched;
  } catch {
    const nearby = asset.category === 'bridges' ? await nearbyBridgeGeometry(asset) : await nearbyBuildingFootprint(asset);
    const enriched = nearby ? { ...asset, ...nearby, geometryType: nearby.geometryType || 'footprint' } : asset;
    return asset.category === 'airports' ? { ...enriched, siteFeatures: await airportSiteFeatures(enriched) } : enriched;
  }
}

async function getJson(url, timeout = 18000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'NAVIRA-Infrastructure-Lab/1.0 (local research prototype)', Accept: 'application/json' } });
    if (!response.ok) throw new Error(`Imagery service returned ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function commonsImage(page) {
  const info = page.imageinfo?.[0];
  if (!info?.thumburl || !info?.descriptionurl) return null;
  const metadata = info.extmetadata || {};
  const license = text(metadata.LicenseShortName?.value, 80) || 'License unavailable';
  return {
    id: String(page.pageid),
    title: text(page.title?.replace(/^File:/, ''), 180),
    thumbnailUrl: info.thumburl,
    sourceUrl: info.descriptionurl,
    description: text(metadata.ImageDescription?.value || metadata.ObjectName?.value, 500),
    creator: text(metadata.Artist?.value || metadata.Credit?.value, 180) || 'Creator unavailable',
    license,
    latitude: finite(page.coordinates?.[0]?.lat, -90, 90),
    longitude: finite(page.coordinates?.[0]?.lon, -180, 180),
    provider: 'Wikimedia Commons',
  };
}

async function commonsGeoSearch(asset) {
  const [longitude, latitude] = asset.center;
  const parameters = new URLSearchParams({
    action: 'query', format: 'json', formatversion: '2', origin: '*',
    generator: 'geosearch', ggsprimary: 'all', ggsnamespace: '6',
    ggscoord: `${latitude}|${longitude}`, ggsradius: '1800', ggslimit: '40',
    prop: 'imageinfo|coordinates', iiprop: 'url|extmetadata', iiurlwidth: '640',
  });
  const payload = await getJson(`${COMMONS_API}?${parameters}`);
  return (payload.query?.pages || []).map(commonsImage).filter(Boolean);
}

async function commonsNameSearch(asset) {
  if (!asset.name || /unnamed mapped feature/i.test(asset.name)) return [];
  const parameters = new URLSearchParams({
    action: 'query', format: 'json', formatversion: '2', origin: '*', generator: 'search',
    gsrnamespace: '6', gsrsearch: `"${asset.name}"`, gsrlimit: '32',
    prop: 'imageinfo|coordinates', iiprop: 'url|extmetadata', iiurlwidth: '640',
  });
  const payload = await getJson(`${COMMONS_API}?${parameters}`);
  return (payload.query?.pages || []).map(commonsImage).filter(Boolean);
}

function rankImages(images, asset) {
  const words = asset.name.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 3);
  const ranked = [...new Map(images.map((image) => [image.id, image])).values()]
    .map((image) => {
      const haystack = `${image.title} ${image.description}`.toLowerCase();
      const nameScore = words.reduce((score, word) => score + (haystack.includes(word) ? 3 : 0), 0);
      const coordinatesScore = Number.isFinite(image.latitude) && Number.isFinite(image.longitude) ? 2 : 0;
      const [assetLongitude, assetLatitude] = asset.center;
      let bearing = null;
      if (Number.isFinite(image.latitude) && Number.isFinite(image.longitude)) {
        const deltaLongitude = (image.longitude - assetLongitude) * Math.PI / 180;
        const latitude1 = assetLatitude * Math.PI / 180;
        const latitude2 = image.latitude * Math.PI / 180;
        const angle = Math.atan2(Math.sin(deltaLongitude) * Math.cos(latitude2), Math.cos(latitude1) * Math.sin(latitude2) - Math.sin(latitude1) * Math.cos(latitude2) * Math.cos(deltaLongitude));
        bearing = (angle * 180 / Math.PI + 360) % 360;
      }
      return { ...image, relevance: nameScore + coordinatesScore, bearing, bearingBucket: bearing === null ? null : Math.round(bearing / 45) % 8 };
    })
    .sort((a, b) => b.relevance - a.relevance);
  const selected = [];
  const used = new Set();
  for (let bucket = 0; bucket < 8; bucket += 1) {
    const candidate = ranked.find((image) => image.bearingBucket === bucket && !used.has(image.id));
    if (candidate) { selected.push(candidate); used.add(candidate.id); }
  }
  for (const image of ranked) {
    if (selected.length >= 20) break;
    if (!used.has(image.id)) { selected.push(image); used.add(image.id); }
  }
  return selected;
}

export async function getStructureEvidence(input) {
  const requestedAsset = safeAsset(input);
  const asset = await enrichMappedAsset(requestedAsset);
  const key = createHash('sha256').update(`${asset.id}:${asset.center.join(',')}:${asset.name}`).digest('hex').slice(0, 20);
  const cached = evidenceCache.get(key);
  if (cached && Date.now() - cached.savedAt < 6 * 60 * 60 * 1000) return cached.payload;
  let images = [];
  let message = null;
  try {
    const results = await Promise.allSettled([commonsGeoSearch(asset), commonsNameSearch(asset)]);
    images = rankImages(results.flatMap((result) => result.status === 'fulfilled' ? result.value : []), asset);
    if (!images.length) message = 'No reusable Wikimedia Commons images were found near or by name for this mapped feature.';
  } catch (error) {
    message = error.name === 'AbortError' ? 'The imagery search timed out.' : 'Location imagery is temporarily unavailable.';
  }
  const token = randomUUID();
  const payload = {
    token,
    asset: { id: asset.id, name: asset.name, center: asset.center },
    mappedAsset: { geometry: asset.geometry, geometryType: asset.geometryType, geometryMatch: asset.geometryMatch, geometrySourceUrl: asset.geometrySourceUrl, siteFeatures: asset.siteFeatures, imported: asset.imported, tags: asset.tags },
    images,
    targetImageCount: 15,
    coverageStatus: images.length >= 15 ? 'candidate-target-met' : 'limited-open-coverage',
    status: images.length ? 'available' : 'unavailable',
    message,
    source: {
      provider: 'Wikimedia Commons',
      retrievedAt: new Date().toISOString(),
      query: `Up to 20 candidate images within 1.8 km of ${asset.center[1].toFixed(5)}, ${asset.center[0].toFixed(5)} plus a full-text search for “${asset.name}”. Geotagged results are distributed across viewing bearings where coverage permits.`,
      limitation: 'The target is 15 verified exterior views. Candidates remain hidden until the vision step rejects interiors, details, unrelated places, people, and images where the asset exterior is not identifiable.',
    },
  };
  evidenceCache.set(token, { savedAt: Date.now(), asset, payload });
  evidenceCache.set(key, { savedAt: Date.now(), asset, payload });
  return payload;
}

async function imageAsDataUrl(url) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || !/\.wikimedia\.org$/i.test(parsed.hostname)) throw new Error('Unsupported evidence host');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'NAVIRA-Infrastructure-Lab/1.0' } });
    if (!response.ok) throw new Error(`Evidence image returned ${response.status}`);
    const type = response.headers.get('content-type') || '';
    if (!/^image\/(jpeg|png|webp)/i.test(type)) throw new Error('Evidence is not a supported image');
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > 3 * 1024 * 1024) throw new Error('Evidence image is too large');
    return `data:${type.split(';')[0]};base64,${bytes.toString('base64')}`;
  } finally {
    clearTimeout(timer);
  }
}

function escapeStringControlCharacters(value) {
  let result = '';
  let insideString = false;
  let escaped = false;
  for (const character of value) {
    if (insideString && !escaped && character === '\n') { result += '\\n'; continue; }
    if (insideString && !escaped && character === '\r') { result += '\\r'; continue; }
    if (insideString && !escaped && character === '\t') { result += '\\t'; continue; }
    result += character;
    if (character === '"' && !escaped) insideString = !insideString;
    escaped = character === '\\' && !escaped;
    if (character !== '\\') escaped = false;
  }
  return result;
}

export function parseJsonResponse(value) {
  const raw = text(value, 20000).replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('Vision service returned no model specification');
  const candidate = raw.slice(start, end + 1);
  const repaired = escapeStringControlCharacters(candidate)
    .replace(/[“”]/g, '"')
    .replace(/("(?:[^"\\]|\\.)*")\s+("[^"\r\n]+"\s*:)/g, '$1,$2')
    .replace(/([}\]0-9]|true|false|null)\s+("[^"\r\n]+"\s*:)/g, '$1,$2')
    .replace(/,\s*([}\]])/g, '$1');
  const attempts = candidate === repaired ? [candidate] : [candidate, repaired];
  let parseError;
  for (const attempt of attempts) {
    try { return JSON.parse(attempt); } catch (error) { parseError = error; }
  }
  const error = new Error('The vision service returned an invalid model specification. NAVIRA will retry once.');
  error.code = 'INVALID_MODEL_JSON';
  error.cause = parseError;
  error.raw = candidate;
  throw error;
}

async function repairDescriptorWithModel({ apiKey, model, malformed }) {
  const response = await fetch('https://yolo-auto.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model, temperature: 0, max_tokens: 1800,
      messages: [
        { role: 'system', content: 'Repair malformed JSON for a procedural building descriptor. Return one valid JSON object only. Preserve existing facts. Do not add architectural details. For missing or truncated values use null, false, unknown, or an empty array as appropriate.' },
        { role: 'user', content: malformed.slice(0, 18000) },
      ],
    }),
    signal: AbortSignal.timeout(45000),
  });
  if (!response.ok) throw new Error(`Vision format repair returned ${response.status}`);
  const payload = await response.json();
  return parseJsonResponse(payload.choices?.[0]?.message?.content);
}

function sanitizeDescriptor(raw) {
  const visibility = ['confirmed', 'possible', 'not-visible'].includes(raw?.targetVisibility) ? raw.targetVisibility : 'possible';
  const facade = raw?.facade || {};
  const roof = raw?.roof || {};
  const wings = Array.isArray(raw?.wings) ? raw.wings.slice(0, 8).map((wing) => ({
    offsetX: finite(wing.offsetX, -1.5, 1.5, 0), offsetZ: finite(wing.offsetZ, -1.5, 1.5, 0),
    widthRatio: finite(wing.widthRatio, .12, 1.5, .4), depthRatio: finite(wing.depthRatio, .12, 1.5, .4),
    heightRatio: finite(wing.heightRatio, .08, 1.3, .5), rotationDeg: finite(wing.rotationDeg, -180, 180, 0),
  })) : [];
  return {
    targetVisibility: visibility,
    confidence: ['low', 'medium', 'high'].includes(raw?.confidence) ? raw.confidence : 'low',
    summary: text(raw?.summary, 500) || 'No visual description returned.',
    evidenceNotes: Array.isArray(raw?.evidenceNotes) ? raw.evidenceNotes.slice(0, 8).map((item) => text(item, 260)).filter(Boolean) : [],
    floors: finite(raw?.floors, 1, 200),
    heightMeters: finite(raw?.heightMeters, 2, 1000),
    massing: allowedMassing.has(raw?.massing) ? raw.massing : 'single-volume',
    wings: visibility === 'not-visible' ? [] : wings,
    setbacks: visibility === 'not-visible' || !Array.isArray(raw?.setbacks) ? [] : raw.setbacks.slice(0, 6).map((item) => ({
      startRatio: finite(item.startRatio, .1, .95, .65), scale: finite(item.scale, .35, 1, .8),
    })).sort((a, b) => a.startRatio - b.startRatio),
    roof: {
      type: allowedRoofs.has(roof.type) ? roof.type : 'unknown',
      color: hex.test(roof.color || '') ? roof.color : '#555b5e',
    },
    facade: {
      material: allowedMaterials.has(facade.material) ? facade.material : 'unknown',
      primaryColor: hex.test(facade.primaryColor || '') ? facade.primaryColor : '#c7c3bb',
      secondaryColor: hex.test(facade.secondaryColor || '') ? facade.secondaryColor : '#646c70',
      windowPattern: allowedPatterns.has(facade.windowPattern) ? facade.windowPattern : 'unknown',
      baysX: Math.round(finite(facade.baysX, 2, 24, 5)), baysZ: Math.round(finite(facade.baysZ, 2, 24, 4)),
      glazingRatio: finite(facade.glazingRatio, 0, .95, .3),
      horizontalBands: Boolean(facade.horizontalBands), verticalFins: Boolean(facade.verticalFins),
      entrance: ['central', 'corner', 'multiple', 'unknown'].includes(facade.entrance) ? facade.entrance : 'unknown',
    },
    distinctiveElements: visibility === 'not-visible' || !Array.isArray(raw?.distinctiveElements) ? [] : raw.distinctiveElements.slice(0, 6).map((item) => text(item, 120)).filter(Boolean),
    imageAssessments: Array.isArray(raw?.imageAssessments) ? raw.imageAssessments.slice(0, 20).map((item) => ({
      index: Math.round(finite(item?.index, 0, 19, -1)), exteriorMatch: Boolean(item?.exteriorMatch),
      targetMatch: Boolean(item?.targetMatch),
      role: ['exterior-elevation', 'aerial-site', 'site-plan', 'structural-form', 'unusable'].includes(item?.role) ? item.role : 'unusable',
      reason: text(item?.reason, 180),
    })).filter((item) => item.index >= 0) : [],
  };
}

function sourceOnlyDescriptor(asset, summary) {
  return {
    targetVisibility: 'not-visible', confidence: 'low', summary, evidenceNotes: [],
    floors: asset.imported.levels, heightMeters: asset.imported.heightMeters,
    massing: asset.category === 'bridges' ? 'bridge' : asset.category === 'airports' ? 'terminal' : 'single-volume',
    wings: [], setbacks: [],
    roof: { type: allowedRoofs.has(asset.imported.roofShape) ? asset.imported.roofShape : 'unknown', color: '#555b5e' },
    facade: { material: allowedMaterials.has(asset.imported.material) ? asset.imported.material : 'unknown', primaryColor: '#c7c3bb', secondaryColor: '#646c70', windowPattern: 'unknown', baysX: 5, baysZ: 4, glazingRatio: .2, horizontalBands: false, verticalFins: false, entrance: 'unknown' },
    distinctiveElements: [],
    imageAssessments: [],
  };
}

function safeHumanImages(input) {
  if (!Array.isArray(input)) return [];
  return input.slice(0, 15).flatMap((image, index) => {
    const dataUrl = typeof image?.dataUrl === 'string' ? image.dataUrl : '';
    if (!/^data:image\/(jpeg|png|webp);base64,/i.test(dataUrl) || dataUrl.length > 2_800_000) return [];
    return [{ image: { id: `human-${index}`, title: text(image.name, 120) || `Human exterior view ${index + 1}`, description: 'Human-supplied exterior evidence', provider: 'Human-supplied evidence', sourceUrl: null, bearing: null }, dataUrl }];
  });
}

export async function generateStructureModel(input) {
  const requestedAsset = safeAsset(input?.asset);
  const evidenceEntry = evidenceCache.get(String(input?.evidenceToken || ''));
  const evidence = evidenceEntry?.payload?.asset?.id === requestedAsset.id ? evidenceEntry.payload : null;
  const asset = evidenceEntry?.asset?.id === requestedAsset.id ? evidenceEntry.asset : requestedAsset;
  const humanPrepared = safeHumanImages(input?.humanImages);
  const humanEvidenceSignature = humanPrepared.length
    ? createHash('sha256').update(humanPrepared.map(({ dataUrl }) => dataUrl).join('|')).digest('hex')
    : 'none';
  const approvedIds = Array.isArray(input?.approvedImageIds)
    ? input.approvedImageIds.map(String).slice(0, 15)
    : Array.isArray(input?.acceptedImageIds) ? input.acceptedImageIds.map(String).slice(0, 15) : [];
  const approvedIdSignature = approvedIds.slice().sort().join(',') || 'none';
  const cacheKey = createHash('sha256').update(`${asset.id}:${evidence?.images?.map((image) => image.id).join(',') || 'none'}:${humanEvidenceSignature}:${approvedIdSignature}`).digest('hex');
  const cached = modelCache.get(cacheKey);
  if (cached && Date.now() - cached.savedAt < 24 * 60 * 60 * 1000) return cached.payload;
  const apiKey = process.env.YOLO_AUTO_API_KEY || process.env.OPENAI_API_KEY;
  const model = process.env.YOLO_AUTO_VISION_MODEL || process.env.YOLO_AUTO_MODEL || 'qwen3.8-flash';
  if (!evidence?.images?.length && !humanPrepared.length) {
    return { status: 'source-only', model: null, descriptor: sourceOnlyDescriptor(asset, 'No matching open imagery was available. The model uses mapped geometry and tags only.'), generatedAt: new Date().toISOString(), message: evidence?.message || 'No open imagery was available.' };
  }
  if (!apiKey) {
    return { status: 'source-only', model: null, descriptor: sourceOnlyDescriptor(asset, 'Open imagery was found, but no server-side vision API key is configured. The model uses mapped geometry and tags only.'), generatedAt: new Date().toISOString(), message: 'Set YOLO_AUTO_API_KEY to enable visual analysis.' };
  }
  const approvedIdSet = new Set(approvedIds);
  const evidenceSelection = (evidence?.images || [])
    .filter((image) => approvedIdSet.has(String(image.id)))
    .slice(0, Math.max(0, 15 - humanPrepared.length));
  const imageResults = await Promise.allSettled(evidenceSelection.map(async (image) => ({ image, dataUrl: await imageAsDataUrl(image.thumbnailUrl) })));
  const approvedPrepared = imageResults.filter((result) => result.status === 'fulfilled').map((result) => result.value);
  const preparedImages = [...approvedPrepared, ...humanPrepared].slice(0, 15);
  if (preparedImages.length === 0) {
    const retainedImages = preparedImages.map(({ image }) => image);
    return {
      status: 'source-only', model, generatedAt: new Date().toISOString(),
      acceptedImages: retainedImages, acceptedImageIds: retainedImages.map((image) => image.id), rejectedCount: Math.max(0, approvedIds.length + humanPrepared.length - preparedImages.length),
      descriptor: sourceOnlyDescriptor(asset, 'None of the human-approved views could be prepared for visual analysis. The model uses mapped geometry and tags only.'),
      message: 'The approved image files could not be prepared for AI analysis. Mapped geometry remains available.',
    };
  }
  const siteFeatureCounts = Object.fromEntries([...new Set((asset.siteFeatures || []).map((feature) => feature.type))].map((type) => [type, asset.siteFeatures.filter((feature) => feature.type === type).length]));
  const facts = {
    selectedAsset: {
      id: asset.id, name: asset.name, category: asset.category, center: asset.center, geometryType: asset.geometryType,
      geometryPointCount: asset.geometry.length, siteFeatureCounts, imported: asset.imported, tags: asset.tags,
    },
    viewCoverage: { requestedExteriorViews: 15, preparedCandidates: preparedImages.length, availableCandidates: evidence?.images?.length || humanPrepared.length, humanSupplied: humanPrepared.length > 0, humanApproved: true },
    evidence: preparedImages.map(({ image }) => {
      const { title, description, sourceUrl, latitude, longitude, bearing } = image;
      return { title, description, sourceUrl, latitude, longitude, bearing };
    }),
  };
  const prompt = `A human reviewed and approved every numbered image before this request. Independently classify each approved image by role. Use exterior-elevation for visible façades and entrances, aerial-site for identifiable overhead or oblique site views, site-plan for clearly identified diagrams or maps of this exact asset, structural-form for bridges, runways, taxiways, terminal piers, roofs, decks, towers, or other useful exterior form, and unusable for anything unrelated or too ambiguous. exteriorMatch is true for the first four useful roles and false for unusable. targetMatch is true only when the selected asset is identifiable by visible context, labels, or strong image metadata. A human-approved site plan or aerial image may guide site topology and massing, but never façade appearance, exact height, or engineering properties. Reject interiors, rooms, decorations, close-up objects, people, foliage-only views, generic maps, and nearby scenes that do not identify the selected asset. Describe the structure using ONLY images where exteriorMatch and targetMatch are both true. The OpenStreetMap footprint, site features, and tags are authoritative and take precedence over every image. For airports, mapped terminal polygons, runways, taxiways, aprons, gates, entrances, and jet bridges define the campus layout; use imagery only to interpret visible terminal massing and façade character. If fewer than six useful views remain, set confidence low. Never infer structural safety, hidden structure, damage, or exact dimensions. Return one compact, single-line valid JSON object. Use this shape: {"imageAssessments":[{"index":0,"exteriorMatch":true,"targetMatch":true,"role":"exterior-elevation|aerial-site|site-plan|structural-form|unusable","reason":"short reason"}],"targetVisibility":"confirmed|possible|not-visible","confidence":"low|medium|high","summary":"...","evidenceNotes":["..."],"floors":number|null,"heightMeters":number|null,"massing":"single-volume|podium-tower|stepped|multi-wing|courtyard|linear|terminal|bridge","wings":[{"offsetX":number,"offsetZ":number,"widthRatio":number,"depthRatio":number,"heightRatio":number,"rotationDeg":number}],"setbacks":[{"startRatio":number,"scale":number}],"roof":{"type":"flat|gable|hip|dome|vaulted|sawtooth|complex|unknown","color":"#RRGGBB"},"facade":{"material":"concrete|glass|brick|stone|metal|timber|stucco|mixed|unknown","primaryColor":"#RRGGBB","secondaryColor":"#RRGGBB","windowPattern":"grid|horizontal-bands|vertical-bays|irregular|limited|none|unknown","baysX":number,"baysZ":number,"glazingRatio":number,"horizontalBands":boolean,"verticalFins":boolean,"entrance":"central|corner|multiple|unknown"},"distinctiveElements":["..."]}. Facts: ${JSON.stringify(facts)}`;
  const response = await fetch('https://yolo-auto.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model, temperature: 0, max_tokens: 2200,
      messages: [{ role: 'system', content: 'You are a visual architecture analyst producing grounded procedural-model parameters. Follow the supplied evidence limits and return JSON only.' }, {
        role: 'user',
        content: [{ type: 'text', text: prompt }, ...preparedImages.flatMap(({ dataUrl }, index) => [{ type: 'text', text: `IMAGE INDEX ${index}` }, { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } }])],
      }],
    }),
    signal: AbortSignal.timeout(90000),
  });
  if (!response.ok) throw new Error(`Vision analysis returned ${response.status}`);
  const result = await response.json();
  const rawDescriptor = result.choices?.[0]?.message?.content;
  let parsedDescriptor;
  try {
    parsedDescriptor = parseJsonResponse(rawDescriptor);
  } catch (error) {
    if (error.code !== 'INVALID_MODEL_JSON') throw error;
    try {
      parsedDescriptor = await repairDescriptorWithModel({ apiKey, model, malformed: error.raw || rawDescriptor || '' });
    } catch {
      return {
        status: 'source-only', model, generatedAt: new Date().toISOString(),
        descriptor: sourceOnlyDescriptor(asset, 'The vision response could not be validated after an automatic format retry. The model uses mapped geometry and tags only.'),
        message: 'Visual analysis returned an invalid structure specification. Select the asset again to retry; mapped geometry remains available.',
      };
    }
  }
  const descriptor = sanitizeDescriptor(parsedDescriptor);
  const acceptedIndices = new Set(descriptor.imageAssessments.filter((item) => item.exteriorMatch && item.targetMatch).map((item) => item.index));
  const acceptedImages = preparedImages.filter((_, index) => acceptedIndices.has(index)).map(({ image }) => image);
  if (acceptedImages.length < 6) descriptor.confidence = 'low';
  const usesMappedFallback = descriptor.targetVisibility === 'not-visible' || acceptedImages.length === 0;
  const payload = {
    status: usesMappedFallback ? 'source-only' : 'generated',
    model,
    descriptor: usesMappedFallback
      ? sourceOnlyDescriptor(asset, 'The vision model did not retain reliable visual identification of the selected structure. Mapped geometry remains the model basis.')
      : descriptor,
    acceptedImages,
    acceptedImageIds: acceptedImages.map((image) => image.id),
    viewCountUsed: acceptedImages.length,
    candidateCount: preparedImages.length,
    generatedAt: new Date().toISOString(),
    message: usesMappedFallback
      ? 'The approved imagery did not reliably identify the selected structure. Mapped geometry remains available.'
      : acceptedImages.length < 6
        ? `Generated at low confidence from ${acceptedImages.length} AI-retained view${acceptedImages.length === 1 ? '' : 's'} after the completed human review.`
        : acceptedImages.length < 15
          ? `Generated from ${acceptedImages.length} verified exterior views; the 15-view target was not fully available.`
          : null,
  };
  modelCache.set(cacheKey, { savedAt: Date.now(), payload });
  return payload;
}
