import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { booleanPointInPolygon, circle, distance, point } from '@turf/turf';

const storeLocation = () => {
  const directory = path.resolve(process.env.NAVIRA_OPERATIONS_DATA_DIR || '.navira-data');
  return { directory, file: path.join(directory, 'operations.json') };
};
const EMPTY_STORE = {
  helpRequests: [], locations: [], dispatches: [], resources: [], allocations: [],
  infrastructure: [], simulations: [], evacuations: [], incidentReports: [],
  communityEvents: [], notifications: [], incidents: [], activeIncidentByUser: {},
  auditEvents: [], comparisonScenarios: [], navigationSessions: [], updatedAt: null,
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
  const actor = request.naviraActor;
  if (!actor?.id || !['civilian', 'operator'].includes(actor.role)) throw new Error('A valid NAVIRA session is required');
  return { id: actor.id, role: actor.role, name: actor.name || 'NAVIRA user', organization: actor.organization || null };
}

async function loadStore() {
  if (!storePromise) storePromise = readFile(storeLocation().file, 'utf8')
    .then((value) => ({ ...EMPTY_STORE, ...JSON.parse(value) }))
    .catch((error) => {
      if (error.code === 'ENOENT') return { ...EMPTY_STORE };
      throw error;
    });
  return storePromise;
}

async function persist(store) {
  store.updatedAt = new Date().toISOString();
  writeQueue = writeQueue.then(async () => {
    const { directory, file } = storeLocation();
    await mkdir(directory, { recursive: true });
    const temporaryPath = `${file}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temporaryPath, JSON.stringify(store, null, 2), { encoding: 'utf8', mode: 0o600 });
    await rename(temporaryPath, file);
  });
  await writeQueue;
}

const ownRecords = (records, actor, key = 'userId') => actor.role === 'operator' ? records : records.filter((record) => record[key] === actor.id);
const actorOrganization = (actor) => cleanText(actor.organization || 'Unassigned organization', 180);
const visibleToOperator = (record, actor) => !record.organization || record.organization === actorOrganization(actor);
const activeIncidentFor = (store, actor) => store.incidents.find((item) => item.id === store.activeIncidentByUser?.[actor.id] && visibleToOperator(item, actor)) || null;
const auditKind = (actor, override) => override || (actor.role === 'civilian' ? 'CIVILIAN_ACTION' : 'OPERATOR_ACTION');

function appendAudit(store, actor, {
  action, recordType, recordId, incidentId = null, previousState = null, resultingState = null,
  reason = null, metadata = null, source = 'NAVIRA server-authoritative operation', kind = null,
}) {
  const event = {
    id: randomUUID(), timestamp: new Date().toISOString(), actorId: actor.id, actorName: actor.name,
    actorRole: actor.role, actorOrganization: actor.organization || null, kind: auditKind(actor, kind),
    action: cleanText(action, 120), recordType: cleanText(recordType, 80), recordId: cleanText(recordId, 180),
    incidentId: incidentId || null, previousState, resultingState, reason: cleanText(reason, 500) || null,
    metadata: metadata && typeof metadata === 'object' ? metadata : null, source: cleanText(source, 240),
  };
  store.auditEvents.unshift(event);
  return event;
}

export async function getOperations(actor) {
  const store = await loadStore();
  const operatorRecords = (records) => actor.role === 'operator' ? records.filter((item) => visibleToOperator(item, actor)) : [];
  const ownRecordIds = new Set([
    ...store.helpRequests.filter((item) => item.userId === actor.id).map((item) => item.id),
    ...store.evacuations.filter((item) => item.userId === actor.id).map((item) => item.id),
    ...store.incidentReports.filter((item) => item.userId === actor.id).map((item) => item.id),
  ]);
  return {
    helpRequests: actor.role === 'operator' ? store.helpRequests.filter((item) => visibleToOperator(item, actor)) : ownRecords(store.helpRequests, actor),
    locations: actor.role === 'operator' ? store.locations : store.locations.filter((item) => item.userId === actor.id),
    dispatches: actor.role === 'operator' ? operatorRecords(store.dispatches) : store.dispatches.filter((item) => item.userId === actor.id),
    resources: operatorRecords(store.resources),
    allocations: actor.role === 'operator' ? operatorRecords(store.allocations) : store.allocations.filter((item) => item.userId === actor.id),
    infrastructure: operatorRecords(store.infrastructure),
    simulations: operatorRecords(store.simulations),
    evacuations: ownRecords(store.evacuations, actor),
    incidentReports: actor.role === 'operator' ? store.incidentReports.filter((item) => visibleToOperator(item, actor)) : store.incidentReports.filter((item) => item.userId === actor.id),
    communityEvents: actor.role === 'operator' ? store.communityEvents : store.communityEvents.filter((item) => item.status === 'operator-verified'),
    notifications: actor.role === 'operator' ? [] : store.notifications.filter((item) => item.userId === actor.id),
    incidents: operatorRecords(store.incidents),
    activeIncidentId: actor.role === 'operator' ? activeIncidentFor(store, actor)?.id || null : null,
    auditEvents: actor.role === 'operator'
      ? store.auditEvents.filter((item) => !item.actorOrganization || item.actorOrganization === actorOrganization(actor))
      : store.auditEvents.filter((item) => item.actorId === actor.id || ownRecordIds.has(item.recordId)),
    comparisonScenarios: operatorRecords(store.comparisonScenarios),
    navigationSessions: actor.role === 'operator'
      ? store.navigationSessions
      : store.navigationSessions.filter((item) => item.userId === actor.id),
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
  appendAudit(store, actor, { action: 'LOCATION_SHARED', recordType: 'location', recordId: actor.id, resultingState: 'CONSENTED', source: 'Browser geolocation permission and device coordinates' });
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
    people: finite(payload.people, 1, 500) || 1, status: 'verified', createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(), verification: event.operatorDefinedArea
      ? 'Location intersects an operator-defined notification area for a reviewed community report'
      : 'Location intersects source-supplied hazard geometry',
  };
  store.helpRequests.unshift(record);
  appendAudit(store, actor, { action: 'HELP_REQUEST', recordType: 'helpRequest', recordId: record.id, resultingState: 'HELP_REQUEST', source: record.verification, metadata: { eventId: record.eventId, people: record.people } });
  appendAudit(store, { id: 'navira-system', name: 'NAVIRA verification service', role: 'operator', organization: null }, { action: 'LOCATION_VERIFIED', recordType: 'helpRequest', recordId: record.id, resultingState: 'VERIFIED', source: record.verification, kind: 'SYSTEM_EVENT', metadata: { eventId: record.eventId } });
  await persist(store);
  return record;
}

export async function updateHelpRequest(actor, payload) {
  if (actor.role !== 'operator') throw new Error('Operator access is required');
  const store = await loadStore();
  const record = store.helpRequests.find((item) => item.id === payload.id);
  if (!record) throw new Error('Help request was not found');
  if (!visibleToOperator(record, actor)) throw new Error('This request belongs to another organization');
  const status = cleanText(payload.status, 30);
  if (!['verified', 'assigned', 'acknowledged', 'dispatched', 'en-route', 'on-scene', 'resolved'].includes(status)) throw new Error('Invalid request status');
  const previous = record.status;
  record.status = status; record.updatedAt = new Date().toISOString();
  record.organization ||= actorOrganization(actor);
  record.incidentId ||= activeIncidentFor(store, actor)?.id || null;
  const incident = record.incidentId ? store.incidents.find((item) => item.id === record.incidentId) : null;
  if (incident) { incident.linkedHelpRequests = [...new Set([...(incident.linkedHelpRequests || []), record.id])]; incident.updatedAt = record.updatedAt; }
  appendAudit(store, actor, { action: 'HELP_REQUEST_STATUS_CHANGED', recordType: 'helpRequest', recordId: record.id, incidentId: record.incidentId, previousState: previous, resultingState: status, reason: payload.reason });
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
  appendAudit(store, actor, { action: 'EVIDENCE_REPORT_SUBMITTED', recordType: 'evidenceReport', recordId: record.id, resultingState: 'PENDING_REVIEW', source: record.source, metadata: { disasterType: record.disasterType } });
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
  report.organization = actorOrganization(actor);
  report.incidentId ||= activeIncidentFor(store, actor)?.id || null;

  if (decision === 'dismissed') {
    appendAudit(store, actor, { action: 'EVIDENCE_REPORT_REVIEWED', recordType: 'evidenceReport', recordId: report.id, incidentId: report.incidentId, previousState: 'PENDING_REVIEW', resultingState: 'DISMISSED', reason: report.reviewNotes, source: report.source });
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
  const activeIncident = activeIncidentFor(store, actor);
  if (activeIncident) {
    activeIncident.linkedEvidenceReports = [...new Set([...(activeIncident.linkedEvidenceReports || []), report.id])];
    activeIncident.linkedHazards = [...new Set([...(activeIncident.linkedHazards || []), event.id])];
    activeIncident.updatedAt = createdAt;
  }
  appendAudit(store, actor, { action: 'EVIDENCE_REPORT_VERIFIED', recordType: 'evidenceReport', recordId: report.id, incidentId: report.incidentId, previousState: 'PENDING_REVIEW', resultingState: 'OPERATOR_VERIFIED', reason: report.reviewNotes, source: report.source, metadata: { eventId: event.id, notificationRadiusKm } });

  const origin = point([report.longitude, report.latitude]);
  const nearby = store.locations.map((location) => ({
    location,
    distanceKm: distance(origin, point([location.longitude, location.latitude]), { units: 'kilometers' }),
  })).filter((item) => item.distanceKm <= notificationRadiusKm);
  const existing = new Set(store.notifications.filter((item) => item.eventId === event.id).map((item) => item.userId));
  nearby.forEach(({ location, distanceKm }) => {
    if (existing.has(location.userId)) return;
    const notification = {
      id: randomUUID(), userId: location.userId, eventId: event.id, reportId: report.id,
      title: `${confirmedType} report verified near your shared location`,
      message: `An operator reviewed a community image report ${distanceKm < 1 ? `${Math.max(1, Math.round(distanceKm * 1000))} m` : `${distanceKm.toFixed(1)} km`} from your last shared location. Open civilian safety, review the evidence, and choose a destination before road routing begins.`,
      distanceKm, notificationRadiusKm, status: 'unread', createdAt,
      provenance: 'Operator-reviewed community report; notification area defined by operator',
    };
    store.notifications.unshift(notification);
    appendAudit(store, { id: 'navira-system', name: 'NAVIRA notification service', role: 'operator', organization: null }, { action: 'CIVILIAN_ALERT_ISSUED', recordType: 'notification', recordId: notification.id, incidentId: report.incidentId, resultingState: 'UNREAD', source: notification.provenance, kind: 'SYSTEM_EVENT', metadata: { userId: location.userId, eventId: event.id, distanceKm } });
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
  appendAudit(store, actor, { action: 'ALERT_ACKNOWLEDGED', recordType: 'notification', recordId: record.id, resultingState: 'READ', source: record.provenance });
  await persist(store);
  return record;
}

export async function createDispatch(actor, payload) {
  if (actor.role !== 'operator') throw new Error('Operator access is required');
  const store = await loadStore();
  const request = store.helpRequests.find((item) => item.id === payload.requestId);
  if (!request) throw new Error('Select an existing help request');
  if (!visibleToOperator(request, actor)) throw new Error('This request belongs to another organization');
  const record = {
    id: randomUUID(), requestId: request.id, userId: request.userId, userName: request.userName,
    team: requireValue(payload.team, 'Responder or team'), capability: requireValue(payload.capability, 'Capability'),
    status: 'assigned', assignedBy: actor.name, organization: actorOrganization(actor),
    incidentId: request.incidentId || activeIncidentFor(store, actor)?.id || null,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
  store.dispatches.unshift(record); request.status = 'assigned'; request.updatedAt = record.updatedAt; request.organization ||= record.organization; request.incidentId ||= record.incidentId;
  const incident = record.incidentId ? store.incidents.find((item) => item.id === record.incidentId) : null;
  if (incident) {
    incident.linkedHelpRequests = [...new Set([...(incident.linkedHelpRequests || []), request.id])];
    incident.linkedResponderAssignments = [...new Set([...(incident.linkedResponderAssignments || []), record.id])];
    incident.updatedAt = record.updatedAt;
  }
  appendAudit(store, actor, { action: 'RESPONDER_ASSIGNED', recordType: 'dispatch', recordId: record.id, incidentId: record.incidentId, previousState: null, resultingState: 'ASSIGNED', metadata: { requestId: request.id, team: record.team, capability: record.capability } });
  appendAudit(store, actor, { action: 'HELP_REQUEST_ASSIGNED', recordType: 'helpRequest', recordId: request.id, incidentId: record.incidentId, previousState: 'VERIFIED', resultingState: 'ASSIGNED', metadata: { dispatchId: record.id } });
  await persist(store);
  return record;
}

export async function updateDispatch(actor, payload) {
  if (actor.role !== 'operator') throw new Error('Operator access is required');
  const store = await loadStore();
  const record = store.dispatches.find((item) => item.id === payload.id);
  if (!record) throw new Error('Dispatch assignment was not found');
  const status = cleanText(payload.status, 30);
  if (!visibleToOperator(record, actor)) throw new Error('This assignment belongs to another organization');
  if (!['assigned', 'acknowledged', 'dispatched', 'en-route', 'on-scene', 'resolved'].includes(status)) throw new Error('Invalid dispatch status');
  const previous = record.status;
  record.status = status; record.updatedAt = new Date().toISOString();
  const request = store.helpRequests.find((item) => item.id === record.requestId);
  if (request) { request.status = status; request.updatedAt = record.updatedAt; request.organization ||= record.organization; request.incidentId ||= record.incidentId; }
  appendAudit(store, actor, { action: 'DISPATCH_STATUS_CHANGED', recordType: 'dispatch', recordId: record.id, incidentId: record.incidentId, previousState: previous, resultingState: status, reason: payload.reason, metadata: { requestId: record.requestId } });
  if (request) appendAudit(store, actor, { action: 'HELP_REQUEST_STATUS_CHANGED', recordType: 'helpRequest', recordId: request.id, incidentId: record.incidentId, previousState: previous, resultingState: status, reason: payload.reason, metadata: { dispatchId: record.id } });
  await persist(store);
  return record;
}

export async function createResource(actor, payload) {
  if (actor.role !== 'operator') throw new Error('Operator access is required');
  const store = await loadStore();
  const record = {
    id: randomUUID(), name: requireValue(payload.name, 'Resource name'), category: requireValue(payload.category, 'Category'),
    quantity: finite(payload.quantity, 1, 100000000), unit: requireValue(payload.unit, 'Unit'), base: requireValue(payload.base, 'Storage location'),
    createdBy: actor.name, organization: actorOrganization(actor), createdAt: new Date().toISOString(),
  };
  if (record.quantity === null) throw new Error('Enter a valid available quantity');
  store.resources.unshift(record);
  appendAudit(store, actor, { action: 'RESOURCE_RECORDED', recordType: 'resource', recordId: record.id, incidentId: activeIncidentFor(store, actor)?.id || null, resultingState: 'AVAILABLE', source: 'Operator-confirmed inventory', metadata: { quantity: record.quantity, unit: record.unit } });
  await persist(store); return record;
}

export async function createAllocation(actor, payload) {
  if (actor.role !== 'operator') throw new Error('Operator access is required');
  const store = await loadStore();
  const resource = store.resources.find((item) => item.id === payload.resourceId);
  const request = store.helpRequests.find((item) => item.id === payload.requestId);
  if (!resource || !request) throw new Error('Select a resource and help request');
  if (!visibleToOperator(resource, actor) || !visibleToOperator(request, actor)) throw new Error('The selected records belong to another organization');
  const quantity = finite(payload.quantity, 1, 100000000);
  const alreadyAllocated = store.allocations.filter((item) => item.resourceId === resource.id).reduce((sum, item) => sum + item.quantity, 0);
  if (quantity === null || quantity > resource.quantity - alreadyAllocated) throw new Error('Allocation exceeds the remaining recorded quantity');
  const record = {
    id: randomUUID(), resourceId: resource.id, resourceName: resource.name, quantity, unit: resource.unit,
    requestId: request.id, userId: request.userId, destination: request.userName, allocatedBy: actor.name,
    organization: actorOrganization(actor), incidentId: request.incidentId || activeIncidentFor(store, actor)?.id || null, createdAt: new Date().toISOString(),
  };
  store.allocations.unshift(record);
  const incident = record.incidentId ? store.incidents.find((item) => item.id === record.incidentId) : null;
  if (incident) {
    incident.linkedHelpRequests = [...new Set([...(incident.linkedHelpRequests || []), request.id])];
    incident.linkedResources = [...new Set([...(incident.linkedResources || []), resource.id])];
    incident.updatedAt = record.createdAt;
  }
  appendAudit(store, actor, { action: 'RESOURCE_ALLOCATED', recordType: 'allocation', recordId: record.id, incidentId: record.incidentId, resultingState: 'ALLOCATED', metadata: { requestId: request.id, resourceId: resource.id, quantity, unit: resource.unit } });
  await persist(store); return record;
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
    source: 'Operator-entered record', organization: actorOrganization(actor), updatedBy: actor.name, updatedAt: new Date().toISOString(),
  };
  store.infrastructure.unshift(record);
  appendAudit(store, actor, { action: 'INFRASTRUCTURE_RECORDED', recordType: 'infrastructure', recordId: record.id, incidentId: activeIncidentFor(store, actor)?.id || null, resultingState: record.status, source: record.source });
  await persist(store); return record;
}

export async function updateInfrastructure(actor, payload) {
  if (actor.role !== 'operator') throw new Error('Operator access is required');
  const store = await loadStore();
  const record = store.infrastructure.find((item) => item.id === payload.id);
  if (!record) throw new Error('Infrastructure asset was not found');
  if (!visibleToOperator(record, actor)) throw new Error('This asset belongs to another organization');
  const status = cleanText(payload.status, 30);
  if (!['operational', 'degraded', 'offline'].includes(status)) throw new Error('Invalid infrastructure state');
  const previous = record.status;
  record.status = status; record.updatedBy = actor.name; record.updatedAt = new Date().toISOString();
  appendAudit(store, actor, { action: 'INFRASTRUCTURE_STATUS_CHANGED', recordType: 'infrastructure', recordId: record.id, incidentId: activeIncidentFor(store, actor)?.id || null, previousState: previous, resultingState: status, reason: payload.reason, source: record.source });
  await persist(store); return record;
}

export async function createSimulation(actor, payload) {
  if (actor.role !== 'operator') throw new Error('Operator access is required');
  const store = await loadStore();
  const asset = store.infrastructure.find((item) => item.id === payload.assetId);
  if (!asset) throw new Error('Select a recorded infrastructure asset');
  if (!visibleToOperator(asset, actor)) throw new Error('This asset belongs to another organization');
  const scenarioLoad = finite(payload.scenarioLoad, 0, 1000000000);
  if (scenarioLoad === null) throw new Error('Enter a valid scenario load');
  const utilization = asset.capacity > 0 ? scenarioLoad / asset.capacity : null;
  const record = {
    id: randomUUID(), assetId: asset.id, assetName: asset.name, scenario: requireValue(payload.scenario, 'Scenario name'),
    capacity: asset.capacity, scenarioLoad, unit: asset.unit, utilization,
    outcome: utilization === null ? 'Capacity comparison unavailable' : utilization > 1 ? 'Entered load exceeds recorded capacity' : 'Entered load is within recorded capacity',
    status: 'Scenario output — not a forecast', notes: cleanText(payload.notes, 800), runBy: actor.name,
    organization: actorOrganization(actor), incidentId: activeIncidentFor(store, actor)?.id || null, createdAt: new Date().toISOString(),
  };
  store.simulations.unshift(record);
  appendAudit(store, actor, { action: 'SIMULATION_RECORDED', recordType: 'simulation', recordId: record.id, incidentId: record.incidentId, resultingState: 'VISUAL_HEURISTIC_OUTPUT', source: 'NAVIRA simulation lab' });
  await persist(store); return record;
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
  const store = await loadStore();
  store.evacuations.unshift(record);
  appendAudit(store, actor, { action: 'EVACUATION_ROUTE_SHARED', recordType: 'evacuation', recordId: record.id, resultingState: 'SHARED', source: 'OSRM route selected by civilian', metadata: { eventId: record.eventId, routeRole: record.routeRole } });
  await persist(store); return record;
}

const NAVIGATION_STATES = new Set(['STARTED', 'REROUTED', 'STOPPED']);

export async function recordNavigationEvent(actor, payload) {
  if (actor.role !== 'civilian') throw new Error('Only civilian accounts can record navigation state');
  const status = cleanText(payload.status, 24).toUpperCase();
  if (!NAVIGATION_STATES.has(status)) throw new Error('Invalid navigation state');
  const destination = payload.destination || {};
  const route = payload.route || {};
  const longitude = finite(destination.longitude, -180, 180);
  const latitude = finite(destination.latitude, -90, 90);
  if (longitude === null || latitude === null) throw new Error('A valid navigation destination is required');
  const record = {
    id: randomUUID(), sessionId: cleanText(payload.sessionId, 180) || randomUUID(),
    userId: actor.id, userName: actor.name, status,
    eventId: requireValue(payload.eventId, 'Event'), eventTitle: requireValue(payload.eventTitle, 'Event title'),
    destination: { label: requireValue(destination.label, 'Destination'), longitude, latitude },
    routeId: cleanText(route.id, 180) || null, previousRouteId: cleanText(payload.previousRouteId, 180) || null,
    durationSeconds: finite(route.durationSeconds, 0), distanceMeters: finite(route.distanceMeters, 0),
    exposureMeters: finite(route.exposureMeters, 0),
    roadRestrictionStatus: cleanText(route.roadRestrictionStatus, 60) || 'STALE_UNKNOWN',
    reason: cleanText(payload.reason, 500) || null,
    source: 'NAVIRA civilian navigation using OSRM, verified hazard geometry, CAP alerts, and connected Open511 restrictions',
    createdAt: new Date().toISOString(),
  };
  const store = await loadStore();
  store.navigationSessions.unshift(record);
  store.navigationSessions = store.navigationSessions.slice(0, 5000);
  appendAudit(store, actor, {
    action: `NAVIGATION_${status}`, recordType: 'navigationSession', recordId: record.id,
    resultingState: status, reason: record.reason, source: record.source,
    metadata: { sessionId: record.sessionId, eventId: record.eventId, routeId: record.routeId, previousRouteId: record.previousRouteId },
  });
  await persist(store);
  return record;
}

const INCIDENT_STATES = new Set(['ACTIVE', 'MONITORING', 'CONTAINED', 'RESOLVED', 'ARCHIVED']);
const INCIDENT_PHASES = new Set(['READINESS', 'RESPONSE', 'STABILIZATION', 'RECOVERY']);
const INCIDENT_SEVERITIES = new Set(['LOW', 'MODERATE', 'HIGH', 'CRITICAL', 'UNASSESSED']);
const LINK_FIELDS = {
  hazard: 'linkedHazards', alert: 'linkedAlerts', helpRequest: 'linkedHelpRequests',
  dispatch: 'linkedResponderAssignments', resource: 'linkedResources',
  roadRestriction: 'linkedRoadRestrictions', evidenceReport: 'linkedEvidenceReports',
};

function requireIncident(store, actor, id) {
  const incident = store.incidents.find((item) => item.id === id);
  if (!incident) throw new Error('Incident was not found');
  if (!visibleToOperator(incident, actor)) throw new Error('This incident belongs to another organization');
  return incident;
}

export async function createIncident(actor, payload) {
  if (actor.role !== 'operator') throw new Error('Operator access is required');
  const store = await loadStore();
  const now = new Date().toISOString();
  const incident = {
    id: randomUUID(), name: requireValue(payload.name, 'Incident name'), type: requireValue(payload.type, 'Incident type'),
    geographicArea: requireValue(payload.geographicArea, 'Geographic area'),
    severity: INCIDENT_SEVERITIES.has(payload.severity) ? payload.severity : 'UNASSESSED',
    operationalPhase: INCIDENT_PHASES.has(payload.operationalPhase) ? payload.operationalPhase : 'RESPONSE',
    status: 'ACTIVE', responsibleOrganization: actorOrganization(actor), organization: actorOrganization(actor),
    commandLead: cleanText(payload.commandLead, 180) || actor.name, createdBy: actor.name,
    createdAt: now, updatedAt: now, operationalNotes: cleanText(payload.operationalNotes, 2000),
    linkedHazards: [...new Set((Array.isArray(payload.linkedHazards) ? payload.linkedHazards : [payload.linkedHazards]).map((item) => cleanText(item, 180)).filter(Boolean))],
    linkedAlerts: [], linkedHelpRequests: [], linkedResponderAssignments: [], linkedResources: [], linkedRoadRestrictions: [], linkedEvidenceReports: [],
  };
  store.incidents.unshift(incident);
  store.activeIncidentByUser ||= {};
  store.activeIncidentByUser[actor.id] = incident.id;
  appendAudit(store, actor, { action: 'INCIDENT_CREATED', recordType: 'incident', recordId: incident.id, incidentId: incident.id, resultingState: incident.status, reason: incident.operationalNotes, metadata: { severity: incident.severity, phase: incident.operationalPhase, area: incident.geographicArea } });
  await persist(store);
  return incident;
}

export async function updateIncident(actor, payload) {
  if (actor.role !== 'operator') throw new Error('Operator access is required');
  const store = await loadStore();
  const incident = requireIncident(store, actor, payload.id);
  const previous = { status: incident.status, severity: incident.severity, operationalPhase: incident.operationalPhase, commandLead: incident.commandLead };
  if (payload.status && !INCIDENT_STATES.has(payload.status)) throw new Error('Invalid incident status');
  if (payload.severity && !INCIDENT_SEVERITIES.has(payload.severity)) throw new Error('Invalid incident severity');
  if (payload.operationalPhase && !INCIDENT_PHASES.has(payload.operationalPhase)) throw new Error('Invalid operational phase');
  if (payload.status) incident.status = payload.status;
  if (payload.severity) incident.severity = payload.severity;
  if (payload.operationalPhase) incident.operationalPhase = payload.operationalPhase;
  if (payload.commandLead !== undefined) incident.commandLead = requireValue(payload.commandLead, 'Command lead');
  if (payload.operationalNotes !== undefined) incident.operationalNotes = cleanText(payload.operationalNotes, 2000);
  incident.updatedAt = new Date().toISOString();
  appendAudit(store, actor, { action: 'INCIDENT_UPDATED', recordType: 'incident', recordId: incident.id, incidentId: incident.id, previousState: previous, resultingState: { status: incident.status, severity: incident.severity, operationalPhase: incident.operationalPhase, commandLead: incident.commandLead }, reason: payload.reason || incident.operationalNotes });
  await persist(store);
  return incident;
}

export async function activateIncident(actor, payload) {
  if (actor.role !== 'operator') throw new Error('Operator access is required');
  const store = await loadStore();
  const previous = activeIncidentFor(store, actor)?.id || null;
  const incident = payload.id ? requireIncident(store, actor, payload.id) : null;
  store.activeIncidentByUser ||= {};
  if (incident) store.activeIncidentByUser[actor.id] = incident.id;
  else delete store.activeIncidentByUser[actor.id];
  appendAudit(store, actor, { action: 'ACTIVE_INCIDENT_CHANGED', recordType: 'incident', recordId: incident?.id || previous || 'none', incidentId: incident?.id || null, previousState: previous, resultingState: incident?.id || null });
  await persist(store);
  return { activeIncidentId: incident?.id || null };
}

export async function linkIncidentRecord(actor, payload) {
  if (actor.role !== 'operator') throw new Error('Operator access is required');
  const store = await loadStore();
  const incident = requireIncident(store, actor, payload.incidentId);
  const recordType = cleanText(payload.recordType, 80);
  const field = LINK_FIELDS[recordType];
  const recordId = requireValue(payload.recordId, 'Record');
  if (!field) throw new Error('Unsupported incident record type');
  incident[field] = [...new Set([...(incident[field] || []), recordId])];
  incident.updatedAt = new Date().toISOString();
  const collections = { helpRequest: store.helpRequests, dispatch: store.dispatches, resource: store.resources, evidenceReport: store.incidentReports };
  const linkedRecord = collections[recordType]?.find((item) => item.id === recordId);
  if (linkedRecord && !visibleToOperator(linkedRecord, actor)) throw new Error('This record belongs to another organization');
  if (linkedRecord) { linkedRecord.incidentId = incident.id; linkedRecord.organization ||= actorOrganization(actor); }
  appendAudit(store, actor, { action: 'RECORD_LINKED_TO_INCIDENT', recordType, recordId, incidentId: incident.id, resultingState: 'LINKED', metadata: { incidentName: incident.name } });
  await persist(store);
  return incident;
}

export async function saveComparisonScenario(actor, payload) {
  if (actor.role !== 'operator') throw new Error('Operator access is required');
  const store = await loadStore();
  if (!payload.designA || !payload.designB || !payload.disaster) throw new Error('Both designs and one shared disaster scenario are required');
  const now = new Date().toISOString();
  const design = (value) => ({
    name: cleanText(value?.name, 180), kind: cleanText(value?.kind, 40), category: cleanText(value?.category, 80),
    height: finite(value?.height, 0, 1000), floors: finite(value?.floors, 0, 400), roof: cleanText(value?.roof, 80), material: cleanText(value?.material, 120),
    footprint: Array.isArray(value?.footprint) ? value.footprint.slice(0, 64).map((point) => ({ x: finite(point?.x, -180, 180), y: finite(point?.y, -90, 90) })).filter((point) => point.x !== null && point.y !== null) : [],
    visualAssumptions: Array.isArray(value?.visualAssumptions) ? value.visualAssumptions.slice(0, 30).map((item) => cleanText(item, 240)).filter(Boolean) : [],
  });
  const disaster = {
    type: cleanText(payload.disaster.type, 40), magnitude: finite(payload.disaster.magnitude, 0, 10), intensity: cleanText(payload.disaster.intensity, 20),
    groundMotion: finite(payload.disaster.groundMotion, 0, 5), windSpeed: finite(payload.disaster.windSpeed, 0, 1000), waterLevel: finite(payload.disaster.waterLevel, 0, 1000),
    flowVelocity: finite(payload.disaster.flowVelocity, 0, 100), duration: finite(payload.disaster.duration, 0, 86400), direction: finite(payload.disaster.direction, 0, 359),
  };
  const record = {
    id: randomUUID(), name: requireValue(payload.name, 'Comparison name'), organization: actorOrganization(actor),
    incidentId: activeIncidentFor(store, actor)?.id || null, buildingId: cleanText(payload.buildingId, 180) || null,
    disaster, designA: design(payload.designA), designB: design(payload.designB),
    disclaimer: 'Saved visual and heuristic comparison. It is not an engineering safety or compliance determination.',
    createdBy: actor.name, createdAt: now, updatedAt: now,
  };
  store.comparisonScenarios.unshift(record);
  appendAudit(store, actor, { action: 'SIMULATION_COMPARISON_SAVED', recordType: 'comparisonScenario', recordId: record.id, incidentId: record.incidentId, resultingState: 'SAVED', source: 'NAVIRA Infrastructure Simulation Lab' });
  await persist(store);
  return record;
}
