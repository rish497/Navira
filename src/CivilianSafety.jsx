import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Broadcast,
  CheckCircle,
  Crosshair,
  Database,
  MapPin,
  MapTrifold,
  NavigationArrow,
  Path,
  Robot,
  SpinnerGap,
  Warning,
} from '@phosphor-icons/react';
import BrandMark from './BrandMark';
import LiveMap from './LiveMap';
import { useLiveData } from './liveData';
import { useAuth } from './auth';
import { useOperations } from './operationsData';
import {
  analyzeRoutes,
  assessVerifiedArea,
  eventDistanceKm,
  formatDistance,
  formatDuration,
  formatRouteDistance,
} from './geo';

const EMPTY_BOUNDARY = { state: 'idle', eventId: null, collection: null, fetchedAt: null };

function sourceBadge(source) {
  return <span className={`source-badge source-badge--${source?.id || 'unknown'}`}>{source?.name || 'Data unavailable'}</span>;
}

function eventTone(event) {
  if (event?.severityLevel === 'red') return 'critical';
  if (event?.severityLevel === 'orange') return 'watch';
  if (event?.severityLevel === 'green') return 'stable';
  return 'neutral';
}

function locationErrorMessage(error) {
  if (error?.code === 1) return 'Location permission was denied. Enable location access in your browser settings and try again.';
  if (error?.code === 2) return 'Your device could not determine a location. Check location services and try again.';
  if (error?.code === 3) return 'Location lookup timed out. Move to an area with a clearer signal and try again.';
  return 'Your browser could not provide a location.';
}

function locationStatusCopy(status) {
  if (status === 'requesting') return 'Waiting for browser location permission';
  if (status === 'granted') return 'Location available on this device';
  if (status === 'denied') return 'Location permission blocked';
  if (status === 'unavailable') return 'Location unavailable';
  return 'Your location has not been requested';
}

function HazardRow({ item, selected, onSelect }) {
  return (
    <button type="button" className={selected ? 'is-selected' : ''} onClick={() => onSelect(item.event)}>
      <i className={`event-signal event-signal--${eventTone(item.event)}`} />
      <span><strong>{item.event.title}</strong><small>{item.event.type} · {sourceBadge(item.event.source)}</small></span>
      <b>{formatDistance(item.distanceKm)}</b>
      <ArrowRight aria-hidden="true" />
    </button>
  );
}

function Assessment({ event, boundary, assessment, onPlan }) {
  if (!event) return <section className="safety-assessment safety-assessment--empty"><Crosshair /><h2>Select a hazard</h2><p>Choose a source record to compare your location with its published geometry.</p></section>;
  const loading = boundary.state === 'loading';
  const state = loading ? 'loading' : assessment.state;
  return (
    <section className={`safety-assessment safety-assessment--${state}`} aria-live="polite">
      <div className="safety-assessment__source">{sourceBadge(event.source)}<span>{event.status}</span></div>
      <h2>{event.title}</h2>
      <p className="safety-assessment__type">{event.type} · {event.severity}</p>
      <div className="safety-assessment__result">
        {loading ? <SpinnerGap className="spin" /> : assessment.state === 'inside' ? <Warning /> : assessment.state === 'outside' ? <CheckCircle /> : <Database />}
        <div>
          <strong>{loading ? 'Checking verified area' : assessment.state === 'inside' ? 'Inside verified warning area' : assessment.state === 'outside' ? 'Outside verified warning area' : 'Risk area cannot be determined'}</strong>
          <p>{loading ? 'Retrieving source geometry from GDACS.' : assessment.message}</p>
        </div>
      </div>
      <dl>
        <div><dt>Source geometry</dt><dd>{boundary.state === 'available' ? 'Verified area available' : event.geometryKind || 'Data unavailable'}</dd></div>
        <div><dt>Distance</dt><dd>{assessment.state === 'inside' ? 'Inside verified area' : Number.isFinite(assessment.distanceKm) ? formatDistance(assessment.distanceKm) : 'Data unavailable'}</dd></div>
        <div><dt>Source record</dt><dd><a href={event.sourceUrl} target="_blank" rel="noreferrer">Open original record</a></dd></div>
      </dl>
      {assessment.routeAllowed && <button type="button" className="safety-primary-action" onClick={onPlan}><NavigationArrow /> Plan escape route</button>}
      {!assessment.routeAllowed && !loading && <p className="safety-assessment__limit">NAVIRA does not create a hazard radius from a point or unlock escape routing outside a verified area.</p>}
    </section>
  );
}

function DestinationSearch({ destination, query, onQuery, state, onSearch, onSelect }) {
  return (
    <section className="destination-step">
      <div className="safety-step-heading"><span>Destination</span><h2>Where are you going?</h2><p>Search real OpenStreetMap places. NAVIRA routes from your browser location to the destination you choose.</p></div>
      <form onSubmit={onSearch} className="destination-form">
        <label htmlFor="destination-search">Destination name or address</label>
        <div><input id="destination-search" value={query} onChange={(event) => onQuery(event.target.value)} minLength={3} required autoComplete="off" enterKeyHint="search" placeholder="Search a place or address" /><button type="submit" disabled={state.loading}>{state.loading ? <SpinnerGap className="spin" /> : <MapPin />}<span>Search</span></button></div>
      </form>
      {state.error && <p className="safety-inline-error" role="alert">{state.error}</p>}
      {state.items.length > 0 && !destination && <div className="destination-results" aria-label="Destination results">{state.items.map((item) => <button type="button" key={item.id} onClick={() => onSelect(item)}><MapPin /><span><strong>{item.label}</strong><small>Photon · OpenStreetMap</small></span><ArrowRight /></button>)}</div>}
      {destination && <div className="destination-selected"><MapPin /><div><span>Selected destination</span><strong>{destination.label}</strong><small>Photon · OpenStreetMap contributors</small></div><button type="button" onClick={() => onSelect(null)}>Change</button></div>}
    </section>
  );
}

function HelpRequestForm({ onSubmit, state }) {
  return <section className="help-request-form"><div className="safety-step-heading"><span>Request help</span><h2>Tell operators what you need.</h2><p>Your location qualifies because it intersects source-supplied hazard geometry. NAVIRA rechecks that intersection on the server before accepting the request.</p></div><form onSubmit={onSubmit}><label>Type of help<select name="need" required><option value="Medical assistance">Medical assistance</option><option value="Rescue or extraction">Rescue or extraction</option><option value="Transport">Transport</option><option value="Food or water">Food or water</option><option value="Shelter">Shelter</option><option value="Accessibility support">Accessibility support</option></select></label><label>People needing help<input name="people" type="number" min="1" max="500" defaultValue="1" required /></label><label>Details<textarea name="details" rows="3" placeholder="Describe immediate needs without adding sensitive information you do not want operators to see." /></label><button type="submit" className="safety-primary-action" disabled={state.loading}>{state.loading ? <SpinnerGap className="spin" /> : <Warning />} Send verified help request</button>{state.error && <p className="safety-inline-error" role="alert">{state.error}</p>}{state.success && <p className="safety-inline-success" role="status">{state.success}</p>}</form></section>;
}

function RouteLedger({ routing, selectedRouteId, onSelect, onExplain, onShare, aiState, shareState }) {
  if (routing.loading) return <section className="route-loading" aria-live="polite"><SpinnerGap className="spin" /><div><strong>Comparing road routes</strong><span>OSRM is calculating alternatives from OpenStreetMap road data.</span></div></section>;
  if (routing.error) return <p className="safety-inline-error" role="alert">{routing.error}</p>;
  if (!routing.routes.length) return null;
  const fastest = routing.routes.find((route) => route.id === routing.fastestId);
  const reason = (route) => {
    if (route.role === 'fastest') return 'Lowest travel time among the alternatives returned by OSRM.';
    if (route.role === 'safer' && fastest) {
      const exposureDifference = Math.max(0, fastest.exposureMeters - route.exposureMeters);
      const timeDifference = Math.round((route.durationSeconds - fastest.durationSeconds) / 60);
      return `${formatRouteDistance(exposureDifference)} less overlap with verified hazard areas${timeDifference > 0 ? ` for ${timeDifference} additional min` : ''}.`;
    }
    return 'This alternative does not reduce verified hazard exposure below the fastest route.';
  };
  return (
    <section className="route-comparison">
      <div className="safety-step-heading"><span>Routes</span><h2>Compare time with verified exposure.</h2><p>“Safer” appears only when an OSRM alternative has less overlap with source-supplied hazard geometry than the fastest route.</p></div>
      <div className="route-ledger">
        {routing.routes.map((route) => <button type="button" key={route.id} onClick={() => onSelect(route.id)} className={selectedRouteId === route.id ? 'is-selected' : ''}>
          <span className={`route-role route-role--${route.role}`}>{route.role === 'safer' ? 'Safer · lower exposure' : route.role}</span>
          <strong>{formatDuration(route.durationSeconds)}</strong>
          <dl><div><dt>Distance</dt><dd>{formatRouteDistance(route.distanceMeters)}</dd></div><div><dt>Verified exposure</dt><dd>{formatRouteDistance(route.exposureMeters)}</dd></div><div><dt>Hazards encountered</dt><dd>{route.hazardsEncountered.length ? route.hazardsEncountered.map((item) => item.title).join(', ') : 'None in connected polygon data'}</dd></div><div><dt>Hazards avoided</dt><dd>{route.hazardsAvoided.length ? route.hazardsAvoided.map((item) => item.title).join(', ') : 'No verified difference'}</dd></div><div className="route-reason"><dt>Why it differs</dt><dd>{reason(route)}</dd></div></dl>
        </button>)}
      </div>
      {!routing.saferId && <p className="route-comparison__notice">OSRM did not return an alternative with lower verified hazard exposure. NAVIRA will not label an alternative “safer.”</p>}
      <div className="route-provenance"><span>Road routing: OSRM · OpenStreetMap</span><span>Retrieved {new Date(routing.fetchedAt).toLocaleString()}</span></div>
      <button className="ai-explain-button" type="button" onClick={onExplain} disabled={aiState.loading}>{aiState.loading ? <SpinnerGap className="spin" /> : <Robot />}<span>{aiState.loading ? 'Explaining verified differences' : 'Explain why the routes differ'}</span></button>
      <button className="share-route-button" type="button" onClick={onShare} disabled={shareState.loading}>{shareState.loading ? <SpinnerGap className="spin" /> : <Broadcast />}<span>Share selected route with operations</span></button>
      {shareState.error && <p className="safety-inline-error" role="alert">{shareState.error}</p>}
      {shareState.success && <p className="safety-inline-success" role="status">{shareState.success}</p>}
      {aiState.error && <p className="safety-inline-error" role="alert">{aiState.error}</p>}
      {aiState.explanation && <div className="ai-explanation" aria-live="polite"><div><Robot /><strong>Grounded explanation</strong><span>{aiState.model}</span></div><p>{aiState.explanation}</p><small>AI explains the supplied route facts. It does not determine hazards, boundaries, road conditions, routes, or evacuation decisions.</small></div>}
    </section>
  );
}

export default function CivilianSafety() {
  const { profile } = useAuth();
  const { mutate } = useOperations();
  const { data, events, sources, loading, error, selectedEvent, selectEvent, refresh } = useLiveData();
  const [mode, setMode] = useState('world');
  const [locationState, setLocationState] = useState({ status: 'idle', error: null });
  const [location, setLocation] = useState(null);
  const [boundary, setBoundary] = useState(EMPTY_BOUNDARY);
  const [planOpen, setPlanOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [destination, setDestination] = useState(null);
  const [searchState, setSearchState] = useState({ loading: false, items: [], error: null });
  const [routing, setRouting] = useState({ loading: false, routes: [], fastestId: null, saferId: null, fetchedAt: null, error: null });
  const [selectedRouteId, setSelectedRouteId] = useState(null);
  const [aiState, setAiState] = useState({ loading: false, explanation: null, model: null, error: null });
  const [helpState, setHelpState] = useState({ loading: false, error: null, success: null });
  const [shareState, setShareState] = useState({ loading: false, error: null, success: null });
  const initializedNear = useRef(false);

  useEffect(() => {
    document.body.classList.add('civilian-mode');
    return () => document.body.classList.remove('civilian-mode');
  }, []);

  const nearbyEvents = useMemo(() => location ? events.map((event) => ({ event, distanceKm: eventDistanceKm(location, event) })).filter((item) => Number.isFinite(item.distanceKm)).sort((a, b) => a.distanceKm - b.distanceKm) : [], [events, location]);
  const boundaryCollection = boundary.eventId === selectedEvent?.id ? boundary.collection : null;
  const assessment = useMemo(() => assessVerifiedArea(location, selectedEvent, boundaryCollection), [location, selectedEvent, boundaryCollection]);
  const routeHazards = useMemo(() => {
    const hazards = new Map();
    events.forEach((event) => {
      if (['Polygon', 'MultiPolygon'].includes(event.geometry?.type)) hazards.set(event.id, { id: event.id, title: event.title, geometry: event.geometry });
    });
    assessment.boundaries?.features.forEach((feature, index) => hazards.set(`${selectedEvent?.id}:verified:${index}`, { id: `${selectedEvent?.id}:verified:${index}`, title: selectedEvent?.title || 'Selected verified area', geometry: feature.geometry }));
    return [...hazards.values()];
  }, [events, assessment.boundaries, selectedEvent]);

  useEffect(() => {
    if (mode !== 'near' || !location || !nearbyEvents.length || initializedNear.current) return;
    initializedNear.current = true;
    selectEvent(nearbyEvents[0].event);
  }, [mode, location, nearbyEvents, selectEvent]);

  useEffect(() => {
    setPlanOpen(false);
    setDestination(null);
    setQuery('');
    setSearchState({ loading: false, items: [], error: null });
    setRouting({ loading: false, routes: [], fastestId: null, saferId: null, fetchedAt: null, error: null });
    setSelectedRouteId(null);
    setAiState({ loading: false, explanation: null, model: null, error: null });
    setHelpState({ loading: false, error: null, success: null });
    setShareState({ loading: false, error: null, success: null });
  }, [selectedEvent?.id]);

  const requestLocation = () => {
    setMode('near');
    if (location) {
      setLocation({ ...location });
      return;
    }
    if (!navigator.geolocation) {
      setLocationState({ status: 'unavailable', error: 'This browser does not provide geolocation.' });
      return;
    }
    setLocationState({ status: 'requesting', error: null });
    navigator.geolocation.getCurrentPosition(async (position) => {
      initializedNear.current = false;
      const next = { longitude: position.coords.longitude, latitude: position.coords.latitude, accuracy: position.coords.accuracy, timestamp: position.timestamp };
      setLocation(next);
      try {
        await mutate('location', next);
        setLocationState({ status: 'granted', error: null });
      } catch (reason) {
        setLocationState({ status: 'unavailable', error: reason.message || 'The location could not be shared with NAVIRA operations.' });
      }
    }, (reason) => setLocationState({ status: reason.code === 1 ? 'denied' : 'unavailable', error: locationErrorMessage(reason) }), { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
  };

  const searchDestination = async (event) => {
    event.preventDefault();
    const normalized = query.trim();
    if (normalized.length < 3) return;
    setDestination(null);
    setSearchState({ loading: true, items: [], error: null });
    try {
      const response = await fetch(`/api/geocode?q=${encodeURIComponent(normalized)}`, { cache: 'no-store' });
      if (!response.ok) throw new Error('Destination search is unavailable. Try again.');
      const result = await response.json();
      setSearchState({ loading: false, items: result.items || [], error: result.items?.length ? null : 'No matching destinations were returned.' });
    } catch (reason) {
      setSearchState({ loading: false, items: [], error: reason.message });
    }
  };

  const chooseDestination = (item) => {
    setDestination(item);
    setQuery(item?.label || '');
    setSearchState((current) => ({ ...current, items: [], error: null }));
    setRouting({ loading: false, routes: [], fastestId: null, saferId: null, fetchedAt: null, error: null });
    setSelectedRouteId(null);
    setAiState({ loading: false, explanation: null, model: null, error: null });
  };

  const compareRoutes = async () => {
    if (!location || !destination || !assessment.routeAllowed) return;
    setRouting({ loading: true, routes: [], fastestId: null, saferId: null, fetchedAt: null, error: null });
    setAiState({ loading: false, explanation: null, model: null, error: null });
    const params = new URLSearchParams({ startLng: location.longitude, startLat: location.latitude, endLng: destination.longitude, endLat: destination.latitude });
    try {
      const response = await fetch(`/api/routes?${params}`, { cache: 'no-store' });
      if (!response.ok) throw new Error('Road routing is unavailable for this destination.');
      const result = await response.json();
      const analysis = analyzeRoutes(result.routes || [], routeHazards);
      if (!analysis.routes.length) throw new Error('The routing engine returned no usable driving route.');
      setRouting({ loading: false, ...analysis, fetchedAt: result.fetchedAt, error: null });
      setSelectedRouteId(analysis.fastestId);
    } catch (reason) {
      setRouting({ loading: false, routes: [], fastestId: null, saferId: null, fetchedAt: null, error: reason.message });
    }
  };

  const explainRoutes = async () => {
    setAiState({ loading: true, explanation: null, model: null, error: null });
    const payload = {
      event: { title: selectedEvent.title, source: selectedEvent.source.name, type: selectedEvent.type, status: selectedEvent.status },
      destination: destination.label,
      routes: routing.routes.map((route) => ({
        role: route.role,
        etaMinutes: Math.round(route.durationSeconds / 60),
        distanceKilometers: Number((route.distanceMeters / 1000).toFixed(2)),
        verifiedExposureKilometers: Number((route.exposureMeters / 1000).toFixed(2)),
        hazardsEncountered: route.hazardsEncountered.map((hazard) => hazard.title),
        hazardsAvoided: route.hazardsAvoided.map((hazard) => hazard.title),
      })),
    };
    try {
      const response = await fetch('/api/route-explanation', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!response.ok) throw new Error('The grounded explanation service is unavailable.');
      const result = await response.json();
      if (!result.explanation) throw new Error(result.message || 'The grounded explanation service returned no text.');
      setAiState({ loading: false, explanation: result.explanation, model: result.model, error: null });
    } catch (reason) {
      setAiState({ loading: false, explanation: null, model: null, error: reason.message });
    }
  };

  const sendHelpRequest = async (event) => {
    event.preventDefault();
    if (!location || !selectedEvent || !assessment.routeAllowed) return;
    setHelpState({ loading: true, error: null, success: null });
    try {
      const values = Object.fromEntries(new FormData(event.currentTarget));
      await mutate('help', { ...values, eventId: selectedEvent.id, longitude: location.longitude, latitude: location.latitude });
      event.currentTarget.reset();
      setHelpState({ loading: false, error: null, success: 'Your request was verified and added to the operator queue.' });
    } catch (reason) {
      setHelpState({ loading: false, error: reason.message, success: null });
    }
  };

  const shareRoute = async () => {
    const route = routing.routes.find((item) => item.id === selectedRouteId);
    if (!route || !selectedEvent || !destination) return;
    setShareState({ loading: true, error: null, success: null });
    try {
      await mutate('evacuation', {
        eventId: selectedEvent.id,
        eventTitle: selectedEvent.title,
        destination: destination.label,
        route: { ...route, hazardsEncountered: route.hazardsEncountered.map((item) => item.title) },
      });
      setShareState({ loading: false, error: null, success: 'The selected route is now visible to operators.' });
    } catch (reason) {
      setShareState({ loading: false, error: reason.message, success: null });
    }
  };

  const mapRoutes = routing.routes;
  const liveSourceCount = sources.filter((source) => source.status === 'available').length;

  return (
    <main className="civilian-safety-shell">
      <header className="safety-header">
        <Link to="/app/command" aria-label="NAVIRA dashboard"><BrandMark /></Link>
        <div className="safety-header__context"><span>Civilian safety</span><strong>Verified geography before guidance</strong></div>
        <div className="safety-mode-switch" aria-label="Map mode"><button type="button" className={mode === 'world' ? 'is-active' : ''} aria-pressed={mode === 'world'} onClick={() => setMode('world')}><MapTrifold /> World</button><button type="button" className={mode === 'near' ? 'is-active' : ''} aria-pressed={mode === 'near'} onClick={requestLocation}><NavigationArrow /> Near you</button></div>
      </header>
      <ol className="safety-progress" aria-label="Civilian safety flow"><li className="is-complete">World</li><li className={mode === 'near' ? 'is-active' : ''}>Near you</li><li className={mode === 'near' && selectedEvent ? 'is-active' : ''}>Hazard</li><li className={planOpen ? 'is-active' : ''}>Destination</li><li className={routing.routes.length ? 'is-active' : ''}>Routes</li><li className={selectedRouteId ? 'is-active' : ''}>Escape</li></ol>

      <div className="safety-workspace">
        <aside className="safety-rail">
          <section className="safety-intro"><Link to="/app/command"><ArrowLeft /> Back to dashboard</Link><h1>Find a verified way out.</h1><p>{profile.name}, start with your location. NAVIRA measures it against real event geometry, then compares road routes without inventing a danger area.</p></section>

          {mode === 'world' ? <section className="world-state">
            <div className="safety-step-heading"><span>World</span><h2>Current agency records</h2><p>The global map remains available until you choose to share your browser location.</p></div>
            <div className="world-state__status"><Broadcast /><div><strong>{loading ? 'Connecting to sources' : `${events.length} current records`}</strong><span>{liveSourceCount} of {sources.length || 3} sources available · retrieved {data?.generatedAt ? new Date(data.generatedAt).toLocaleString() : 'Data unavailable'}</span></div></div>
            {error && <button type="button" className="safety-inline-retry" onClick={refresh}>Reconnect live sources <ArrowRight /></button>}
            <button type="button" className="safety-primary-action" onClick={requestLocation}><NavigationArrow /> Use my location</button>
            <p className="privacy-note">Your coordinate stays in this browser. It is sent only to the routing request after you choose a destination.</p>
          </section> : <>
            <section className="location-state" aria-live="polite">
              <div><span>Near you</span><strong>{locationStatusCopy(locationState.status)}</strong></div>
              {location && <p>{location.latitude.toFixed(5)}°, {location.longitude.toFixed(5)}° · device accuracy ±{Math.round(location.accuracy)} m</p>}
              {locationState.error && <p className="safety-inline-error" role="alert">{locationState.error}</p>}
              <button type="button" onClick={requestLocation} disabled={locationState.status === 'requesting'}>{locationState.status === 'requesting' ? <SpinnerGap className="spin" /> : <Crosshair />}{location ? 'Recenter' : 'Try location again'}</button>
            </section>

            {location && <section className="nearby-hazards"><div className="safety-step-heading"><span>Hazard</span><h2>Closest source records</h2><p>Distances are measured from your coordinate to each event’s published geometry. Distance alone does not define risk.</p></div><div className="nearby-hazards__list">{nearbyEvents.slice(0, 8).map((item) => <HazardRow key={item.event.id} item={item} selected={selectedEvent?.id === item.event.id} onSelect={selectEvent} />)}</div></section>}

            {location && <Assessment event={selectedEvent} boundary={boundary} assessment={boundary.state === 'loading' ? { ...assessment, state: 'loading' } : assessment} onPlan={() => setPlanOpen(true)} />}
            {location && assessment.routeAllowed && <HelpRequestForm onSubmit={sendHelpRequest} state={helpState} />}
            {planOpen && assessment.routeAllowed && <DestinationSearch destination={destination} query={query} onQuery={setQuery} state={searchState} onSearch={searchDestination} onSelect={chooseDestination} />}
            {planOpen && destination && assessment.routeAllowed && <button type="button" className="compare-routes-button" onClick={compareRoutes} disabled={routing.loading}><Path /> Compare real road routes <ArrowRight /></button>}
            <RouteLedger routing={routing} selectedRouteId={selectedRouteId} onSelect={setSelectedRouteId} onExplain={explainRoutes} onShare={shareRoute} aiState={aiState} shareState={shareState} />
          </>}
        </aside>

        <section className="safety-map-stage" aria-label="Civilian safety map">
          <LiveMap events={events} selectedEvent={selectedEvent} onSelect={selectEvent} variant="civilian" userLocation={location} viewMode={mode} routes={mapRoutes} destination={destination} selectedRouteId={selectedRouteId} onBoundaryChange={setBoundary} showLayerPanel={mode === 'world'} />
          <div className="safety-map-caption"><span><i /> {mode === 'near' ? 'LOCATION MODE' : 'WORLD MODE'}</span><b>MapLibre · OpenFreeMap · live agency records</b></div>
        </section>
      </div>
    </main>
  );
}
