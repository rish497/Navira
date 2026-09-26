import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { booleanPointInPolygon, circle, distance, point } from '@turf/turf';

const STORE_DIR = path.resolve('.navira-data');
const STORE_PATH = path.join(STORE_DIR, 'operations.json');
const EMPTY_STORE = {
  helpRequests: [], locations: [], dispatches: [], resources: [], allocations: [],
  infrastructure: [], simulations: [], evacuations: [], incidentReports: [],
  communityEvents: [], notifications: [], updatedAt: null,
};
let storePromise;
let writeQueue = Promise.resolve();

const cleanText = (value, max = 300) => String(value || '').trim().slice(0, max);
const finite = (value, minimum = -Infinity, maximum = Infinity) => {
  const number = Number(value);
  return Number.isFinite(number) && number >= minimum && number <= maximum ? number : null;
};
function requireValue(value, label) {
  const next = cleanText(value);
  if (!next) throw new Error(`${label} is required`);
  return next;
}

export function actorFromRequest(request) {
  const id = cleanText(request.headers['x-navira-user'], 80);
  const role = cleanText(request.headers['x-navira-role'], 20);
  const name = decodeURIComponent(cleanText(request.headers['x-navira-name'], 180));
  const organization = decodeURIComponent(cleanText(request.headers['x-navira-organization'], 180));
  if (!id || !['civilian', 'operator'].includes(role)) throw new Error('A valid NAVIRA session is required');
  return { id, role, name: name || 'NAVIRA user', organization: organization || null };
}

async function loadStore() {
  if (!storePromise) storePromise = readFile(STORE_PATH, 'utf8').then((value) => ({ ...EMPTY_STORE, ...JSON.parse(value) })).catch(() => ({ ...EMPTY_STORE }));
  return storePromise;
}

async function persist(store) {
  store.updatedAt = new Date().toISOString();
  writeQueue = writeQueue.then(async () => {
    await mkdir(STORE_DIR, { recursive: true });
    await writeFile(STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
  });
  await writeQueue;
}

const ownRecords = (records, actor, key = 'userId') => actor.role === 'operator' ? records : records.filter((record) => record[key] === actor.id);

export async function getOperations(actor) {
  const store = await loadStore();
  return {
    helpRequests: ownRecords(store.helpRequests, actor),
    locations: actor.role === 'operator' ? store.locations : store.locations.filter((item) => item.userId === actor.id),
    dispatches: actor.role === 'operator' ? store.dispatches : store.dispatches.filter((item) => item.userId === actor.id),
    resources: actor.role === 'operator' ? store.resources : [],
    allocations: actor.role === 'operator' ? store.allocations : store.allocations.filter((item) => item.userId === actor.id),
    infrastructure: actor.role === 'operator' ? store.infrastructure : [],
    simulations: actor.role === 'operator' ? store.simulations : [],
    evacuations: ownRecords(store.evacuations, actor),
    incidentReports: actor.role === 'operator' ? store.incidentReports : store.incidentReports.filter((item) => item.userId === actor.id),
    communityEvents: actor.role === 'operator' ? store.communityEvents : store.communityEvents.filter((item) => item.status === 'operator-verified'),
    notifications: actor.role === 'operator' ? [] : store.notifications.filter((item) => item.userId === actor.id),
    updatedAt: store.updatedAt,
  };
}

export async function getCommunityEvent(id) {
  const store = await loadStore();
  return store.communityEvents.find((item) => item.id === id && item.status === 'operator-verified') || null;
}

export async function updateLocation(actor, payload) {
  const longitude = finite(payload.longitude, -180, 180);
  const latitude = finite(payload.latitude, -90, 90);
  if (longitude === null || latitude === null) throw new Error('Valid location coordinates are required');
  const store = await loadStore();
  const next = { userId: actor.id, name: actor.name, longitude, latitude, accuracy: finite(payload.accuracy, 0, 100000), consentedAt: new Date().toISOString() };
  store.locations = [next, ...store.locations.filter((item) => item.userId !== actor.id)];
  await persist(store);
  return next;
}

function polygonFeatures(collection, event) {
  const supplied = collection?.type === 'FeatureCollection' ? collection.features : [];
  const polygons = supplied.filter((feature) => ['Polygon', 'MultiPolygon'].includes(feature?.geometry?.type));
  if (polygons.length) return polygons;
  if (['Polygon', 'MultiPolygon'].includes(event?.geometry?.type)) return [{ type: 'Feature', properties: {}, geometry: event.geometry }];
  return [];
}

export function verifyHelpLocation(payload, event, boundaryCollection) {
  const longitude = finite(payload.longitude, -180, 180);
  const latitude = finite(payload.latitude, -90, 90);
  if (longitude === null || latitude === null) return false;
  return polygonFeatures(boundaryCollection, event).some((feature) => booleanPointInPolygon(point([longitude, latitude]), feature));
}

export async function createHelpRequest(actor, payload, event) {
  if (actor.role !== 'civilian') throw new Error('Only civilian accounts can create help requests');
  const store = await loadStore();
  const location = store.locations.find((item) => item.userId === actor.id);
  if (!location) throw new Error('Share your location before requesting help');
  const record = {
    id: randomUUID(), userId: actor.id, userName: actor.name, eventId: event.id, eventTitle: event.title,
    eventType: event.type, sourceName: event.source?.name || null, sourceUrl: event.sourceUrl || null,
    longitude: location.longitude, latitude: location.latitude, accuracy: location.accuracy,
    need: requireValue(payload.need, 'Type of help'), details: cleanText(payload.details, 800),
    people: finite(payload.people, 1, 500) || 1, status: 'new', createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(), verification: event.operatorDefinedArea
      ? 'Location intersects an operator-defined notification area for a reviewed community report'
      : 'Location intersects source-supplied hazard geometry',
  };
  store.helpRequests.unshift(record);
  await persist(store);
  return record;
}

export async function updateHelpRequest(actor, payload) {
  if (actor.role !== 'operator') throw new Error('Operator access is required');
  const store = await loadStore();
  const record = store.helpRequests.find((item) => item.id === payload.id);
  if (!record) throw new Error('Help request was not found');
  const status = cleanText(payload.status, 30);
  if (!['new', 'acknowledged', 'assigned', 'resolved'].includes(status)) throw new Error('Invalid request status');
  record.status = status; record.updatedAt = new Date().toISOString();
  await persist(store);
  return record;
}

function validImageData(value) {
  if (typeof value !== 'string' || value.length > 4_500_000) return false;
  return /^data:image\/(jpeg|png|webp);base64,[a-z0-9+/=]+$/i.test(value);
}

const REPORT_TYPES = new Set(['Earthquake', 'Flood', 'Wildfire', 'Landslide', 'Severe storm', 'Extreme wind', 'Tsunami', 'Volcanic activity', 'Other natural hazard']);

export async function createIncidentReport(actor, payload) {
  if (actor.role !== 'civilian') throw new Error('Only civilian accounts can submit image reports');
  const longitude = finite(payload.longitude, -180, 180);
  const latitude = finite(payload.latitude, -90, 90);
  if (longitude === null || latitude === null) throw new Error('Location permission is required with an image report');
  if (!validImageData(payload.imageData)) throw new Error('Upload a JPEG, PNG, or WebP image under 3 MB');
  const disasterType = requireValue(payload.disasterType, 'Disaster type');
  if (!REPORT_TYPES.has(disasterType)) throw new Error('Select a supported disaster type');
  const store = await loadStore();
  const record = {
    id: randomUUID(), userId: actor.id, userName: actor.name,
    disasterType, details: cleanText(payload.details, 800), imageData: payload.imageData,
    fileName: cleanText(payload.fileName, 180), longitude, latitude,
    accuracy: finite(payload.accuracy, 0, 100000), status: 'pending-review',
    source: 'Civilian-submitted image and device location', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
  store.incidentReports.unshift(record);
  await persist(store);
  return { ...record, imageData: undefined };
}

export async function reviewIncidentReport(actor, payload) {
  if (actor.role !== 'operator') throw new Error('Operator access is required');
  const store = await loadStore();
  const report = store.incidentReports.find((item) => item.id === payload.id);
  if (!report) throw new Error('Image report was not found');
  if (report.status !== 'pending-review') throw new Error('This report has already been reviewed');
  const decision = cleanText(payload.decision, 30);
  if (!['natural-disaster', 'dismissed'].includes(decision)) throw new Error('Choose a review decision');
  report.status = decision === 'natural-disaster' ? 'operator-verified' : 'dismissed';
  report.reviewedBy = actor.name;
  report.reviewedAt = new Date().toISOString();
  report.reviewNotes = cleanText(payload.reviewNotes, 800);

  if (decision === 'dismissed') {
    await persist(store);
    return { report, event: null, notified: 0 };
  }

  const notificationRadiusKm = finite(payload.notificationRadiusKm, 0.1, 100);
  if (notificationRadiusKm === null) throw new Error('Enter an operator-defined notification radius between 0.1 and 100 km');
  const confirmedType = REPORT_TYPES.has(cleanText(payload.confirmedType, 80)) ? cleanText(payload.confirmedType, 80) : report.disasterType;
  const alertArea = circle([report.longitude, report.latitude], notificationRadiusKm, { steps: 64, units: 'kilometers' });
  const createdAt = new Date().toISOString();
  const event = {
    id: `community:${report.id}`,
    reportId: report.id,
    title: `${confirmedType} — operator-reviewed community report`,
    description: report.details || 'No description was supplied with the image.',
    type: confirmedType,
    severity: 'Not assessed from the image',
    severityLevel: null,
    status: 'operator-verified',
    timestamp: report.createdAt,
    updatedAt: createdAt,
    coordinates: [report.longitude, report.latitude],
    geometry: alertArea.geometry,
    geometryKind: 'Operator-defined notification area',
    country: null,
    sourceEventId: report.id,
    sourceUrl: null,
    sourceLinks: [],
    source: { id: 'community', name: 'Operator-reviewed community report' },
    operatorDefinedArea: true,
    notificationRadiusKm,
    reviewedBy: actor.name,
  };
  store.communityEvents.unshift(event);
  report.confirmedType = confirmedType;
  report.notificationRadiusKm = notificationRadiusKm;
  report.eventId = event.id;

  const origin = point([report.longitude, report.latitude]);
  const nearby = store.locations.map((location) => ({
    location,
    distanceKm: distance(origin, point([location.longitude, location.latitude]), { units: 'kilometers' }),
  })).filter((item) => item.distanceKm <= notificationRadiusKm);
  const existing = new Set(store.notifications.filter((item) => item.eventId === event.id).map((item) => item.userId));
  nearby.forEach(({ location, distanceKm }) => {
    if (existing.has(location.userId)) return;
    store.notifications.unshift({
      id: randomUUID(), userId: location.userId, eventId: event.id, reportId: report.id,
      title: `${confirmedType} report verified near your shared location`,
      message: `An operator reviewed a community image report ${distanceKm < 1 ? `${Math.max(1, Math.round(distanceKm * 1000))} m` : `${distanceKm.toFixed(1)} km`} from your last shared location. Open civilian safety, review the evidence, and choose a destination before road routing begins.`,
      distanceKm, notificationRadiusKm, status: 'unread', createdAt,
      provenance: 'Operator-reviewed community report; notification area defined by operator',
    });
  });
  await persist(store);
  return { report, event, notified: nearby.length };
}

export async function markNotificationRead(actor, payload) {
  if (actor.role !== 'civilian') throw new Error('Only civilian accounts have personal notifications');
  const store = await loadStore();
  const record = store.notifications.find((item) => item.id === payload.id && item.userId === actor.id);
  if (!record) throw new Error('Notification was not found');
  record.status = 'read';
  record.readAt = new Date().toISOString();
  await persist(store);
  return record;
}

export async function createDispatch(actor, payload) {
  if (actor.role !== 'operator') throw new Error('Operator access is required');
  const store = await loadStore();
  const request = store.helpRequests.find((item) => item.id === payload.requestId);
  if (!request) throw new Error('Select an existing help request');
  const record = {
    id: randomUUID(), requestId: request.id, userId: request.userId, userName: request.userName,
    team: requireValue(payload.team, 'Responder or team'), capability: requireValue(payload.capability, 'Capability'),
    status: 'assigned', assignedBy: actor.name, organization: actor.organization,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
  store.dispatches.unshift(record); request.status = 'assigned'; request.updatedAt = record.updatedAt;
  await persist(store);
  return record;
}

export async function updateDispatch(actor, payload) {
  if (actor.role !== 'operator') throw new Error('Operator access is required');
  const store = await loadStore();
  const record = store.dispatches.find((item) => item.id === payload.id);
  if (!record) throw new Error('Dispatch assignment was not found');
  const status = cleanText(payload.status, 30);
  if (!['assigned', 'en-route', 'on-scene', 'complete'].includes(status)) throw new Error('Invalid dispatch status');
  record.status = status; record.updatedAt = new Date().toISOString();
  await persist(store);
  return record;
}

export async function createResource(actor, payload) {
  if (actor.role !== 'operator') throw new Error('Operator access is required');
  const store = await loadStore();
  const record = {
    id: randomUUID(), name: requireValue(payload.name, 'Resource name'), category: requireValue(payload.category, 'Category'),
    quantity: finite(payload.quantity, 1, 100000000), unit: requireValue(payload.unit, 'Unit'), base: requireValue(payload.base, 'Storage location'),
    createdBy: actor.name, createdAt: new Date().toISOString(),
  };
  if (record.quantity === null) throw new Error('Enter a valid available quantity');
  store.resources.unshift(record); await persist(store); return record;
}

export async function createAllocation(actor, payload) {
  if (actor.role !== 'operator') throw new Error('Operator access is required');
  const store = await loadStore();
  const resource = store.resources.find((item) => item.id === payload.resourceId);
  const request = store.helpRequests.find((item) => item.id === payload.requestId);
  if (!resource || !request) throw new Error('Select a resource and help request');
  const quantity = finite(payload.quantity, 1, 100000000);
  const alreadyAllocated = store.allocations.filter((item) => item.resourceId === resource.id).reduce((sum, item) => sum + item.quantity, 0);
  if (quantity === null || quantity > resource.quantity - alreadyAllocated) throw new Error('Allocation exceeds the remaining recorded quantity');
  const record = {
    id: randomUUID(), resourceId: resource.id, resourceName: resource.name, quantity, unit: resource.unit,
    requestId: request.id, userId: request.userId, destination: request.userName, allocatedBy: actor.name, createdAt: new Date().toISOString(),
  };
  store.allocations.unshift(record); await persist(store); return record;
}

export async function createInfrastructure(actor, payload) {
  if (actor.role !== 'operator') throw new Error('Operator access is required');
  const store = await loadStore();
  const capacity = finite(payload.capacity, 0, 1000000000);
  if (capacity === null) throw new Error('Enter a valid capacity');
  const record = {
    id: randomUUID(), name: requireValue(payload.name, 'Asset name'), type: requireValue(payload.type, 'Asset type'),
    location: requireValue(payload.location, 'Location'), capacity, unit: requireValue(payload.unit, 'Capacity unit'),
    status: ['operational', 'degraded', 'offline'].includes(payload.status) ? payload.status : 'operational',
    source: 'Operator-entered record', updatedBy: actor.name, updatedAt: new Date().toISOString(),
  };
  store.infrastructure.unshift(record); await persist(store); return record;
}

export async function updateInfrastructure(actor, payload) {
  if (actor.role !== 'operator') throw new Error('Operator access is required');
  const store = await loadStore();
  const record = store.infrastructure.find((item) => item.id === payload.id);
  if (!record) throw new Error('Infrastructure asset was not found');
  const status = cleanText(payload.status, 30);
  if (!['operational', 'degraded', 'offline'].includes(status)) throw new Error('Invalid infrastructure state');
  record.status = status; record.updatedBy = actor.name; record.updatedAt = new Date().toISOString();
  await persist(store); return record;
}

export async function createSimulation(actor, payload) {
  if (actor.role !== 'operator') throw new Error('Operator access is required');
  const store = await loadStore();
  const asset = store.infrastructure.find((item) => item.id === payload.assetId);
  if (!asset) throw new Error('Select a recorded infrastructure asset');
  const scenarioLoad = finite(payload.scenarioLoad, 0, 1000000000);
  if (scenarioLoad === null) throw new Error('Enter a valid scenario load');
  const utilization = asset.capacity > 0 ? scenarioLoad / asset.capacity : null;
  const record = {
    id: randomUUID(), assetId: asset.id, assetName: asset.name, scenario: requireValue(payload.scenario, 'Scenario name'),
    capacity: asset.capacity, scenarioLoad, unit: asset.unit, utilization,
    outcome: utilization === null ? 'Capacity comparison unavailable' : utilization > 1 ? 'Entered load exceeds recorded capacity' : 'Entered load is within recorded capacity',
    status: 'Scenario output — not a forecast', notes: cleanText(payload.notes, 800), runBy: actor.name, createdAt: new Date().toISOString(),
  };
  store.simulations.unshift(record); await persist(store); return record;
}

export async function createEvacuation(actor, payload) {
  if (actor.role !== 'civilian') throw new Error('Only civilian accounts can share an evacuation route');
  const route = payload.route || {};
  const record = {
    id: randomUUID(), userId: actor.id, userName: actor.name, eventId: requireValue(payload.eventId, 'Event'),
    eventTitle: requireValue(payload.eventTitle, 'Event title'), destination: requireValue(payload.destination, 'Destination'),
    routeRole: cleanText(route.role, 30), durationSeconds: finite(route.durationSeconds, 0), distanceMeters: finite(route.distanceMeters, 0),
    exposureMeters: finite(route.exposureMeters, 0), hazardsEncountered: Array.isArray(route.hazardsEncountered) ? route.hazardsEncountered.map((item) => cleanText(item, 180)).filter(Boolean) : [],
    status: 'shared by civilian', createdAt: new Date().toISOString(),
  };
  const store = await loadStore(); store.evacuations.unshift(record); await persist(store); return record;
}
