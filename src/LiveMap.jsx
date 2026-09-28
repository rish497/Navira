import { useEffect, useMemo, useRef, useState } from 'react';
import { AttributionControl, LngLatBounds, Map, Marker, NavigationControl, ScaleControl, setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Crosshair, Eye, EyeSlash, SpinnerGap } from '@phosphor-icons/react';
import { useRoadData } from './roadData';
import { useAlertData } from './alertData';

setWorkerUrl(workerUrl);

const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';
const SOURCE_COLORS = { eonet: '#74a7b9', gdacs: '#ff5537', usgs: '#f0c457', cap: '#f4b800', community: '#ff3b1f' };
const motionDuration = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : 850;
const BASE_FILTERS = {
  'event-polygons': ['in', ['geometry-type'], ['literal', ['Polygon', 'MultiPolygon']]],
  'event-polygon-outline': ['in', ['geometry-type'], ['literal', ['Polygon', 'MultiPolygon']]],
  'event-lines': ['in', ['geometry-type'], ['literal', ['LineString', 'MultiLineString']]],
  'event-points-halo': ['in', ['geometry-type'], ['literal', ['Point', 'MultiPoint']]],
  'event-points': ['in', ['geometry-type'], ['literal', ['Point', 'MultiPoint']]],
};

function eventCollection(events) {
  return {
    type: 'FeatureCollection',
    features: events.map((event) => ({
      type: 'Feature',
      id: event.id,
      geometry: event.geometry,
      properties: {
        eventId: event.id,
        sourceId: event.source.id,
        title: event.title,
        type: event.type,
        severity: event.severity,
        status: event.status,
        color: SOURCE_COLORS[event.source.id] || '#d7dcde',
      },
    })),
  };
}

function coordinatesOf(geometry) {
  if (!geometry) return [];
  const result = [];
  const walk = (value) => {
    if (Array.isArray(value) && value.length >= 2 && typeof value[0] === 'number' && typeof value[1] === 'number') {
      result.push([value[0], value[1]]);
      return;
    }
    if (Array.isArray(value)) value.forEach(walk);
  };
  if (geometry.type === 'FeatureCollection') geometry.features?.forEach((feature) => walk(feature.geometry?.coordinates));
  else if (geometry.type === 'Feature') walk(geometry.geometry?.coordinates);
  else walk(geometry.coordinates);
  return result.filter(([lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat) && Math.abs(lng) <= 180 && Math.abs(lat) <= 90);
}

function fitGeometry(map, geometry, options = {}) {
  const coordinates = coordinatesOf(geometry);
  if (!coordinates.length) return;
  if (coordinates.length === 1) {
    map.easeTo({ center: coordinates[0], zoom: options.zoom || 6, duration: motionDuration() });
    return;
  }
  const bounds = coordinates.reduce((box, coordinate) => box.extend(coordinate), new LngLatBounds(coordinates[0], coordinates[0]));
  map.fitBounds(bounds, { padding: options.padding || 90, maxZoom: options.maxZoom || 8, duration: motionDuration() });
}

async function fetchBoundary(event) {
  if (!event?.gdacsKey?.episodeid) return null;
  const params = new URLSearchParams(event.gdacsKey);
  const response = await fetch(`/api/gdacs-geometry?${params}`, { cache: 'no-store' });
  if (!response.ok) return null;
  const payload = await response.json();
  const data = payload.data;
  if (data?.type === 'FeatureCollection') return { collection: data, fetchedAt: payload.fetchedAt };
  if (data?.type === 'Feature') return { collection: { type: 'FeatureCollection', features: [data] }, fetchedAt: payload.fetchedAt };
  if (data?.type && data?.coordinates) return { collection: { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: data }] }, fetchedAt: payload.fetchedAt };
  return null;
}

function freshnessLabel(value) {
  if (!value) return null;
  return new Intl.DateTimeFormat('en', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC', timeZoneName: 'short' }).format(new Date(value));
}

export default function LiveMap({
  events,
  selectedEvent,
  onSelect,
  variant = 'workspace',
  userLocation = null,
  viewMode = 'world',
  routes = [],
  destination = null,
  selectedRouteId = null,
  onBoundaryChange,
  showLayerPanel = true,
  people = [],
  onPersonSelect,
  reports = [],
  onReportSelect,
}) {
  const roadData = useRoadData();
  const alertData = useAlertData();
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const destinationMarkerRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [showHeroLoader, setShowHeroLoader] = useState(true);
  const [visibility, setVisibility] = useState({ eonet: true, gdacs: true, usgs: true, cap: true, community: true, roads: true });
  const [boundaryState, setBoundaryState] = useState('idle');
  const [boundaryFetchedAt, setBoundaryFetchedAt] = useState(null);
  const collection = useMemo(() => eventCollection(events), [events]);
  const routeCollection = useMemo(() => ({
    type: 'FeatureCollection',
    features: routes.map((route) => ({
      type: 'Feature',
      id: route.id,
      geometry: route.geometry,
      properties: {
        routeId: route.id,
        role: route.role,
        selected: route.id === selectedRouteId,
      },
    })),
  }), [routes, selectedRouteId]);
  const peopleCollection = useMemo(() => ({
    type: 'FeatureCollection',
    features: people.filter((item) => Number.isFinite(item.longitude) && Number.isFinite(item.latitude)).map((item) => ({
      type: 'Feature',
      id: item.id || item.userId,
      geometry: { type: 'Point', coordinates: [item.longitude, item.latitude] },
      properties: { personId: item.id || item.userId, status: item.status || 'location', name: item.userName || item.name || 'Shared location' },
    })),
  }), [people]);
  const reportCollection = useMemo(() => ({
    type: 'FeatureCollection',
    features: reports.filter((item) => Number.isFinite(item.longitude) && Number.isFinite(item.latitude)).map((item) => ({
      type: 'Feature',
      id: item.id,
      geometry: { type: 'Point', coordinates: [item.longitude, item.latitude] },
      properties: { reportId: item.id, status: item.status, disasterType: item.disasterType },
    })),
  }), [reports]);
  const restrictionCollection = useMemo(() => ({
    type: 'FeatureCollection',
    features: roadData.restrictions.map((item) => ({
      type: 'Feature', id: item.id, geometry: item.geometry,
      properties: { restrictionId: item.id, status: item.status, title: item.title, source: item.source?.name || 'Road source', updatedAt: item.updatedAt || item.retrievedAt },
    })),
  }), [roadData.restrictions]);
  const capCollection = useMemo(() => ({
    type: 'FeatureCollection',
    features: alertData.alerts.filter((item) => item.geometry && !events.some((event) => event.id === item.id)).map((item) => ({
      type: 'Feature', id: item.id, geometry: item.geometry,
      properties: { alertId: item.id, title: item.headline, severity: item.severity, source: item.source?.name || 'OASIS CAP authority', sentAt: item.sentAt || item.effectiveAt },
    })),
  }), [alertData.alerts, events]);
  const collectionRef = useRef(collection);
  const onSelectRef = useRef(onSelect);
  const onBoundaryChangeRef = useRef(null);
  const onPersonSelectRef = useRef(onPersonSelect);
  const onReportSelectRef = useRef(onReportSelect);
  const hasFocusedRef = useRef(false);

  useEffect(() => { collectionRef.current = collection; }, [collection]);
  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);
  useEffect(() => { onBoundaryChangeRef.current = onBoundaryChange; }, [onBoundaryChange]);
  useEffect(() => { onPersonSelectRef.current = onPersonSelect; }, [onPersonSelect]);
  useEffect(() => { onReportSelectRef.current = onReportSelect; }, [onReportSelect]);

  useEffect(() => {
    if (variant !== 'hero') return undefined;
    if (!ready) {
      setShowHeroLoader(true);
      return undefined;
    }
    const timer = window.setTimeout(() => setShowHeroLoader(false), 160);
    return () => window.clearTimeout(timer);
  }, [ready, variant]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return undefined;
    const map = new Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: [12, 18],
      zoom: 1.55,
      minZoom: 1,
      maxZoom: 16,
      attributionControl: false,
      cooperativeGestures: true,
    });
    mapRef.current = map;
    map.addControl(new NavigationControl({ visualizePitch: true }), 'top-right');
    map.addControl(new ScaleControl({ maxWidth: 110, unit: 'metric' }), 'bottom-left');
    map.addControl(new AttributionControl({ compact: true, customAttribution: 'Live event data: NASA EONET · GDACS · USGS' }));

    map.once('style.load', () => {
      map.addSource('navira-events', { type: 'geojson', data: collectionRef.current, promoteId: 'eventId' });
      map.addSource('gdacs-boundary', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addSource('verified-routes', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addSource('navira-user', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addSource('navira-destination', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addSource('navira-people', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addSource('navira-reports', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addSource('navira-road-restrictions', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addSource('navira-cap-alerts', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });

      map.addLayer({
        id: 'event-polygons', type: 'fill', source: 'navira-events',
        filter: BASE_FILTERS['event-polygons'],
        paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.18 },
      });
      map.addLayer({
        id: 'event-polygon-outline', type: 'line', source: 'navira-events',
        filter: BASE_FILTERS['event-polygon-outline'],
        paint: { 'line-color': ['get', 'color'], 'line-width': 2, 'line-opacity': 0.9 },
      });
      map.addLayer({
        id: 'event-lines', type: 'line', source: 'navira-events',
        filter: BASE_FILTERS['event-lines'],
        paint: { 'line-color': ['get', 'color'], 'line-width': 3, 'line-opacity': 0.82 },
      });
      map.addLayer({
        id: 'event-points-halo', type: 'circle', source: 'navira-events',
        filter: BASE_FILTERS['event-points-halo'],
        paint: { 'circle-radius': 11, 'circle-color': ['get', 'color'], 'circle-opacity': 0.18 },
      });
      map.addLayer({
        id: 'event-points', type: 'circle', source: 'navira-events',
        filter: BASE_FILTERS['event-points'],
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, 4, 7, 8],
          'circle-color': ['get', 'color'],
          'circle-stroke-color': '#101315', 'circle-stroke-width': 2,
        },
      });
      map.addLayer({
        id: 'gdacs-boundary-fill', type: 'fill', source: 'gdacs-boundary',
        paint: { 'fill-color': '#ff5537', 'fill-opacity': 0.12 },
      });
      map.addLayer({
        id: 'gdacs-boundary-line', type: 'line', source: 'gdacs-boundary',
        paint: { 'line-color': '#ff5537', 'line-width': 2.5, 'line-dasharray': [2, 1] },
      });
      map.addLayer({
        id: 'cap-alert-fill', type: 'fill', source: 'navira-cap-alerts',
        filter: ['in', ['geometry-type'], ['literal', ['Polygon', 'MultiPolygon']]],
        paint: { 'fill-color': '#f4b800', 'fill-opacity': .14 },
      });
      map.addLayer({
        id: 'cap-alert-line', type: 'line', source: 'navira-cap-alerts',
        paint: { 'line-color': '#f4b800', 'line-width': 2.5, 'line-dasharray': [2, 1] },
      });
      map.addLayer({
        id: 'road-restriction-halo', type: 'line', source: 'navira-road-restrictions',
        paint: { 'line-color': '#0f1113', 'line-width': 8, 'line-opacity': .72 },
      });
      map.addLayer({
        id: 'road-restriction-line', type: 'line', source: 'navira-road-restrictions',
        paint: { 'line-color': ['match', ['get', 'status'], 'CONFIRMED_CLOSED', '#ff3b1f', 'REPORTED_OBSTRUCTION', '#f4b800', '#68737a'], 'line-width': 4, 'line-dasharray': [1.4, .8] },
      });
      map.addLayer({
        id: 'road-restriction-points', type: 'circle', source: 'navira-road-restrictions',
        filter: ['in', ['geometry-type'], ['literal', ['Point', 'MultiPoint']]],
        paint: { 'circle-radius': 7, 'circle-color': ['match', ['get', 'status'], 'CONFIRMED_CLOSED', '#ff3b1f', 'REPORTED_OBSTRUCTION', '#f4b800', '#68737a'], 'circle-stroke-color': '#0f1113', 'circle-stroke-width': 2 },
      });
      map.addLayer({
        id: 'verified-routes-casing', type: 'line', source: 'verified-routes',
        paint: { 'line-color': '#0f1113', 'line-width': ['case', ['get', 'selected'], 9, 7], 'line-opacity': .82 },
      });
      map.addLayer({
        id: 'verified-routes-line', type: 'line', source: 'verified-routes',
        paint: {
          'line-color': ['match', ['get', 'role'], 'fastest', '#ff3b1f', 'safer', '#f1eee9', '#74a7b9'],
          'line-width': ['case', ['get', 'selected'], 6, 4],
          'line-opacity': ['case', ['get', 'selected'], 1, .6],
        },
      });
      map.addLayer({
        id: 'navira-user-halo', type: 'circle', source: 'navira-user',
        paint: { 'circle-radius': 14, 'circle-color': '#f1eee9', 'circle-opacity': .24 },
      });
      map.addLayer({
        id: 'navira-user-point', type: 'circle', source: 'navira-user',
        paint: { 'circle-radius': 6, 'circle-color': '#0f1113', 'circle-stroke-color': '#f1eee9', 'circle-stroke-width': 3 },
      });
      map.addLayer({
        id: 'navira-destination-point', type: 'circle', source: 'navira-destination',
        paint: { 'circle-radius': 7, 'circle-color': '#ff3b1f', 'circle-stroke-color': '#0f1113', 'circle-stroke-width': 3 },
      });
      map.addLayer({
        id: 'navira-people-halo', type: 'circle', source: 'navira-people',
        paint: { 'circle-radius': 15, 'circle-color': ['case', ['==', ['get', 'status'], 'location'], '#f1eee9', '#ff5537'], 'circle-opacity': .2 },
      });
      map.addLayer({
        id: 'navira-people-point', type: 'circle', source: 'navira-people',
        paint: { 'circle-radius': 7, 'circle-color': ['case', ['==', ['get', 'status'], 'location'], '#f1eee9', '#ff5537'], 'circle-stroke-color': '#0f1113', 'circle-stroke-width': 2 },
      });
      map.addLayer({
        id: 'navira-report-pulse', type: 'circle', source: 'navira-reports',
        paint: { 'circle-radius': 18, 'circle-color': '#41d98d', 'circle-opacity': .22, 'circle-stroke-width': 0 },
      });
      map.setPaintProperty('navira-report-pulse', 'circle-radius-transition', { duration: 650, delay: 0 });
      map.setPaintProperty('navira-report-pulse', 'circle-opacity-transition', { duration: 650, delay: 0 });
      map.addLayer({
        id: 'navira-report-point', type: 'circle', source: 'navira-reports',
        paint: { 'circle-radius': 7, 'circle-color': '#41d98d', 'circle-stroke-color': '#0f1113', 'circle-stroke-width': 3 },
      });

      ['event-points', 'event-lines', 'event-polygons'].forEach((layer) => {
        map.on('click', layer, (event) => {
          const id = event.features?.[0]?.properties?.eventId;
          const selected = collectionRef.current.features.find((feature) => feature.properties.eventId === id);
          if (selected) onSelectRef.current?.(id);
        });
        map.on('mouseenter', layer, () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', layer, () => { map.getCanvas().style.cursor = ''; });
      });
      map.on('click', 'navira-people-point', (event) => onPersonSelectRef.current?.(event.features?.[0]?.properties?.personId));
      map.on('mouseenter', 'navira-people-point', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'navira-people-point', () => { map.getCanvas().style.cursor = ''; });
      map.on('click', 'navira-report-point', (event) => onReportSelectRef.current?.(event.features?.[0]?.properties?.reportId));
      map.on('mouseenter', 'navira-report-point', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'navira-report-point', () => { map.getCanvas().style.cursor = ''; });
      setReady(true);
    });

    const resizeObserver = new ResizeObserver(() => map.resize());
    resizeObserver.observe(containerRef.current);
    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map?.getSource('navira-events')) return;
    map.getSource('navira-events').setData(collection);
  }, [collection, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const visible = Object.entries(visibility).filter(([, enabled]) => enabled).map(([id]) => id);
    const filter = ['in', ['get', 'sourceId'], ['literal', visible]];
    Object.keys(BASE_FILTERS).forEach((id) => {
      if (map.getLayer(id)) map.setFilter(id, ['all', BASE_FILTERS[id], filter]);
    });
  }, [visibility, ready, collection]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const source = map.getSource('navira-user');
    source?.setData(userLocation ? {
      type: 'FeatureCollection',
      features: [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [userLocation.longitude, userLocation.latitude] } }],
    } : { type: 'FeatureCollection', features: [] });
    if (viewMode === 'near' && userLocation) map.easeTo({ center: [userLocation.longitude, userLocation.latitude], zoom: 7.5, duration: motionDuration() });
    if (viewMode === 'world') map.easeTo({ center: [12, 18], zoom: 1.55, duration: motionDuration() });
  }, [userLocation, viewMode, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    map.getSource('navira-destination')?.setData(destination ? {
      type: 'FeatureCollection',
      features: [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [destination.longitude, destination.latitude] } }],
    } : { type: 'FeatureCollection', features: [] });
    destinationMarkerRef.current?.remove();
    destinationMarkerRef.current = null;
    if (destination) {
      const element = document.createElement('div');
      element.className = 'navira-destination-marker';
      element.setAttribute('aria-label', `Destination: ${destination.label || 'selected destination'}`);
      element.innerHTML = '<svg viewBox="0 0 120 110" aria-hidden="true"><path fill="#f1eee9" d="M0 0 30 28v54L0 110V0Z"/><path fill="#f1eee9" d="M120 0v110L90 82V28L120 0Z"/><path fill="#ff3b1f" d="M0 0h36l39 35v27L44 35 0 0Z"/><path fill="#ff3b1f" d="m44 35 76 75H82L44 75V35Z"/></svg>';
      destinationMarkerRef.current = new Marker({ element, anchor: 'bottom' }).setLngLat([destination.longitude, destination.latitude]).addTo(map);
    }
    return () => {
      destinationMarkerRef.current?.remove();
      destinationMarkerRef.current = null;
    };
  }, [destination, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    map.getSource('navira-people')?.setData(peopleCollection);
  }, [peopleCollection, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    map.getSource('navira-reports')?.setData(reportCollection);
  }, [reportCollection, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    map.getSource('navira-road-restrictions')?.setData(restrictionCollection);
    ['road-restriction-halo', 'road-restriction-line', 'road-restriction-points'].forEach((id) => {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visibility.roads ? 'visible' : 'none');
    });
  }, [restrictionCollection, visibility.roads, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    map.getSource('navira-cap-alerts')?.setData(capCollection);
    ['cap-alert-fill', 'cap-alert-line'].forEach((id) => { if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visibility.cap ? 'visible' : 'none'); });
  }, [capCollection, visibility.cap, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map?.getLayer('navira-report-pulse') || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    let expanded = false;
    const timer = window.setInterval(() => {
      expanded = !expanded;
      map.setPaintProperty('navira-report-pulse', 'circle-radius', expanded ? 23 : 14);
      map.setPaintProperty('navira-report-pulse', 'circle-opacity', expanded ? .06 : .28);
    }, 720);
    return () => window.clearInterval(timer);
  }, [ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    map.getSource('verified-routes')?.setData(routeCollection);
    if (routeCollection.features.length) fitGeometry(map, routeCollection, { padding: variant === 'civilian' ? 70 : 90, maxZoom: 13 });
  }, [routeCollection, ready, variant]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const boundarySource = map.getSource('gdacs-boundary');
    boundarySource?.setData({ type: 'FeatureCollection', features: [] });
    setBoundaryFetchedAt(null);
    if (!selectedEvent) {
      setBoundaryState('idle');
      onBoundaryChangeRef.current?.({ state: 'idle', eventId: null, collection: null, fetchedAt: null });
      return;
    }
    if (viewMode === 'near') hasFocusedRef.current = true;
    else if (variant === 'civilian' && viewMode === 'world') hasFocusedRef.current = true;
    else if (hasFocusedRef.current) fitGeometry(map, selectedEvent.geometry);
    else hasFocusedRef.current = true;
    if (!selectedEvent.gdacsKey) {
      if (['Polygon', 'MultiPolygon'].includes(selectedEvent.geometry?.type)) {
        const collection = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { eventId: selectedEvent.id }, geometry: selectedEvent.geometry }] };
        boundarySource?.setData(collection);
        setBoundaryState('available');
        setBoundaryFetchedAt(selectedEvent.updatedAt || selectedEvent.timestamp);
        onBoundaryChangeRef.current?.({ state: 'available', eventId: selectedEvent.id, collection, fetchedAt: selectedEvent.updatedAt || selectedEvent.timestamp });
      } else {
        setBoundaryState('unavailable');
        onBoundaryChangeRef.current?.({ state: 'unavailable', eventId: selectedEvent.id, collection: null, fetchedAt: null });
      }
      return;
    }
    let active = true;
    setBoundaryState('loading');
    onBoundaryChangeRef.current?.({ state: 'loading', eventId: selectedEvent.id, collection: null, fetchedAt: null });
    fetchBoundary(selectedEvent).then((boundary) => {
      if (!active) return;
      if (boundary?.collection?.features?.length) {
        boundarySource?.setData(boundary.collection);
        setBoundaryFetchedAt(boundary.fetchedAt);
        setBoundaryState('available');
        onBoundaryChangeRef.current?.({ state: 'available', eventId: selectedEvent.id, collection: boundary.collection, fetchedAt: boundary.fetchedAt });
      } else {
        setBoundaryState('unavailable');
        onBoundaryChangeRef.current?.({ state: 'unavailable', eventId: selectedEvent.id, collection: null, fetchedAt: null });
      }
    }).catch(() => {
      if (!active) return;
      setBoundaryState('unavailable');
      onBoundaryChangeRef.current?.({ state: 'unavailable', eventId: selectedEvent.id, collection: null, fetchedAt: null });
    });
    return () => { active = false; };
  }, [selectedEvent, ready, variant, viewMode]);

  const toggle = (id) => setVisibility((current) => ({ ...current, [id]: !current[id] }));

  return (
    <section className={`live-map live-map--${variant} ${ready ? 'is-ready' : ''}`} aria-label="Interactive live disaster map">
      <div ref={containerRef} className="live-map__canvas" />
      {(!ready || (variant === 'hero' && showHeroLoader)) && <div className={`map-loading ${ready ? 'map-loading--leaving' : ''}`}><SpinnerGap size={20} className="spin" /> Loading geographic data</div>}
      {showLayerPanel && <div className="map-layer-panel" aria-label="Map layers">
        <div className="map-layer-panel__head"><Crosshair size={16} /> Live layers</div>
        {Object.entries(SOURCE_COLORS).filter(([id]) => id !== 'cap' || alertData.generatedAt).map(([id, color]) => (
          <button key={id} type="button" onClick={() => toggle(id)} className={visibility[id] ? 'is-on' : ''}>
            <i style={{ background: color }} />
            <span>{id === 'eonet' ? 'NASA EONET' : id === 'cap' ? 'OFFICIAL CAP ALERTS' : id.toUpperCase()}</span>
            {visibility[id] ? <Eye size={15} /> : <EyeSlash size={15} />}
          </button>
        ))}
        {roadData.generatedAt && <button type="button" onClick={() => toggle('roads')} className={visibility.roads ? 'is-on' : ''}><i style={{ background: '#f4b800' }} /><span>ROAD RESTRICTIONS</span>{visibility.roads ? <Eye size={15} /> : <EyeSlash size={15} />}</button>}
        <div className="map-layer-panel__status">
          <span>GDACS boundary</span>
          <b>{boundaryState === 'loading' ? 'Loading source geometry' : boundaryState === 'available' ? `Source geometry · ${freshnessLabel(boundaryFetchedAt)}` : selectedEvent ? 'No boundary supplied for this record' : 'Select an event to inspect geometry'}</b>
        </div>
        <div className="map-layer-panel__status">
          <span>Road route analysis</span>
          <b>{routes.length ? `${routes.length} verified road alternative${routes.length === 1 ? '' : 's'}` : variant === 'civilian' ? 'Available after destination selection' : 'Built in civilian safety after risk assessment'}</b>
        </div>
        {roadData.generatedAt && <div className={`map-layer-panel__status ${roadData.coverage.status === 'degraded' ? 'is-degraded' : ''}`}>
          <span>Road restriction coverage</span>
          <b>{roadData.loading ? 'Checking connected Open511 sources' : roadData.coverage.message}</b>
          {roadData.generatedAt && <small>Retrieved {freshnessLabel(roadData.generatedAt)} · {roadData.restrictions.length} relevant records</small>}
        </div>}
        {alertData.generatedAt && <div className={`map-layer-panel__status ${alertData.coverage.status === 'degraded' ? 'is-degraded' : ''}`}><span>Official alert coverage</span><b>{alertData.coverage.message}</b><small>{alertData.alerts.length} current CAP record{alertData.alerts.length === 1 ? '' : 's'} · retrieved {freshnessLabel(alertData.generatedAt)}</small></div>}
      </div>}
      <div className="map-source-note">OpenFreeMap · OpenMapTiles · © OpenStreetMap contributors</div>
    </section>
  );
}
