import {
  booleanPointInPolygon,
  distance,
  flattenEach,
  length,
  lineIntersect,
  lineString,
  midpoint,
  point,
  pointToLineDistance,
  polygonToLine,
} from '@turf/turf';

function featureFromGeometry(geometry, properties = {}) {
  return geometry ? { type: 'Feature', properties, geometry } : null;
}

function validCoordinate(value) {
  return Array.isArray(value) && value.length >= 2 && value.every((part) => Number.isFinite(Number(part)));
}

function pointFeature(location) {
  return point([Number(location.longitude), Number(location.latitude)]);
}

function lineFeatures(feature) {
  const lines = [];
  flattenEach(feature, (item) => {
    if (item.geometry?.type === 'LineString') lines.push(item);
  });
  return lines;
}

function polygonFeatures(collection) {
  if (!collection) return [];
  const input = collection.type === 'FeatureCollection' ? collection.features : [collection];
  return input.filter((item) => ['Polygon', 'MultiPolygon'].includes(item?.geometry?.type));
}

export function distanceToGeometryKm(location, geometry) {
  if (!location || !geometry) return null;
  const origin = pointFeature(location);
  try {
    if (geometry.type === 'Point' && validCoordinate(geometry.coordinates)) {
      return distance(origin, point(geometry.coordinates), { units: 'kilometers' });
    }
    if (geometry.type === 'MultiPoint') {
      const values = geometry.coordinates.filter(validCoordinate).map((coordinate) => distance(origin, point(coordinate), { units: 'kilometers' }));
      return values.length ? Math.min(...values) : null;
    }
    if (['LineString', 'MultiLineString'].includes(geometry.type)) {
      const values = lineFeatures(featureFromGeometry(geometry)).map((line) => pointToLineDistance(origin, line, { units: 'kilometers' }));
      return values.length ? Math.min(...values) : null;
    }
    if (['Polygon', 'MultiPolygon'].includes(geometry.type)) {
      const polygon = featureFromGeometry(geometry);
      if (booleanPointInPolygon(origin, polygon)) return 0;
      const values = lineFeatures(polygonToLine(polygon)).map((line) => pointToLineDistance(origin, line, { units: 'kilometers' }));
      return values.length ? Math.min(...values) : null;
    }
  } catch {
    return null;
  }
  return null;
}

export function eventDistanceKm(location, event) {
  return distanceToGeometryKm(location, event?.geometry);
}

export function assessVerifiedArea(location, event, boundaryCollection) {
  if (!location || !event) return { state: 'pending', routeAllowed: false, message: 'Choose a nearby hazard to assess your location.' };
  const suppliedBoundary = polygonFeatures(boundaryCollection);
  const eventBoundary = ['Polygon', 'MultiPolygon'].includes(event.geometry?.type)
    ? [featureFromGeometry(event.geometry, { eventId: event.id, title: event.title })]
    : [];
  const boundaries = suppliedBoundary.length ? suppliedBoundary : eventBoundary;

  if (!boundaries.length) {
    return {
      state: 'undetermined',
      routeAllowed: false,
      distanceKm: eventDistanceKm(location, event),
      message: 'This source provides an event location but no verified warning area. Your risk area cannot be determined from this record.',
      boundaries: null,
    };
  }

  const userPoint = pointFeature(location);
  const inside = boundaries.some((boundary) => booleanPointInPolygon(userPoint, boundary));
  const distances = boundaries.map((boundary) => distanceToGeometryKm(location, boundary.geometry)).filter(Number.isFinite);
  const distanceKm = distances.length ? Math.min(...distances) : null;
  return {
    state: inside ? 'inside' : 'outside',
    routeAllowed: inside,
    distanceKm,
    message: inside
      ? 'Your location intersects this source-supplied warning area. Escape-route comparison is available.'
      : `Your location is outside the source-supplied warning area${Number.isFinite(distanceKm) ? ` by ${formatDistance(distanceKm)}` : ''}.`,
    boundaries: { type: 'FeatureCollection', features: boundaries },
  };
}

function uniqueCoordinates(coordinates) {
  return coordinates.filter((coordinate, index) => index === 0 || coordinate[0] !== coordinates[index - 1][0] || coordinate[1] !== coordinates[index - 1][1]);
}

function exposureToBoundaryMeters(routeGeometry, boundary) {
  if (routeGeometry?.type !== 'LineString') return 0;
  let exposureKm = 0;
  const coordinates = routeGeometry.coordinates;

  for (let index = 0; index < coordinates.length - 1; index += 1) {
    const start = coordinates[index];
    const end = coordinates[index + 1];
    const segment = lineString([start, end]);
    const intersections = lineIntersect(segment, boundary).features.map((item) => item.geometry.coordinates);
    const ordered = uniqueCoordinates([start, ...intersections, end].sort((a, b) => (
      distance(point(start), point(a), { units: 'kilometers' }) - distance(point(start), point(b), { units: 'kilometers' })
    )));

    for (let part = 0; part < ordered.length - 1; part += 1) {
      const section = lineString([ordered[part], ordered[part + 1]]);
      const center = midpoint(point(ordered[part]), point(ordered[part + 1]));
      if (booleanPointInPolygon(center, boundary)) exposureKm += length(section, { units: 'kilometers' });
    }
  }
  return exposureKm * 1000;
}

export function analyzeRoutes(routes, hazards) {
  const usableHazards = hazards.filter((hazard) => ['Polygon', 'MultiPolygon'].includes(hazard.geometry?.type));
  const analyzed = routes.map((route) => {
    const exposure = usableHazards.map((hazard) => ({
      id: hazard.id,
      title: hazard.title,
      meters: exposureToBoundaryMeters(route.geometry, featureFromGeometry(hazard.geometry)),
    }));
    const encountered = exposure.filter((item) => item.meters > 1);
    return {
      ...route,
      exposureMeters: encountered.reduce((sum, item) => sum + item.meters, 0),
      hazardsEncountered: encountered,
      hazardsAvoided: [],
      role: 'alternative',
    };
  });
  if (!analyzed.length) return { routes: [], fastestId: null, saferId: null };

  const fastest = [...analyzed].sort((a, b) => a.durationSeconds - b.durationSeconds)[0];
  const lowerExposure = analyzed
    .filter((route) => route.id !== fastest.id && route.exposureMeters + 1 < fastest.exposureMeters)
    .sort((a, b) => a.exposureMeters - b.exposureMeters || a.durationSeconds - b.durationSeconds)[0] || null;
  const encounteredAcrossRoutes = new Map(analyzed.flatMap((route) => route.hazardsEncountered.map((hazard) => [hazard.id, hazard])));

  const resolved = analyzed.map((route) => {
    const encounteredIds = new Set(route.hazardsEncountered.map((hazard) => hazard.id));
    return {
      ...route,
      role: route.id === fastest.id ? 'fastest' : route.id === lowerExposure?.id ? 'safer' : 'alternative',
      hazardsAvoided: [...encounteredAcrossRoutes.values()].filter((hazard) => !encounteredIds.has(hazard.id)),
    };
  });
  return { routes: resolved, fastestId: fastest.id, saferId: lowerExposure?.id || null };
}

export function formatDistance(kilometers) {
  if (!Number.isFinite(kilometers)) return 'Data unavailable';
  if (kilometers < 1) return `${Math.max(1, Math.round(kilometers * 1000))} m`;
  return `${kilometers < 10 ? kilometers.toFixed(1) : Math.round(kilometers)} km`;
}

export function formatRouteDistance(meters) {
  return Number.isFinite(meters) ? formatDistance(meters / 1000) : 'Data unavailable';
}

export function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return 'Data unavailable';
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return `${hours} hr${remainder ? ` ${remainder} min` : ''}`;
}
