import { lazy, Suspense, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight, Buildings, CheckCircle, Crosshair, Flask, MapPin, Package,
  Path, SpinnerGap, UserFocus, UsersThree, WarningCircle,
} from '@phosphor-icons/react';
import LiveMap from './LiveMap';
import { useLiveData } from './liveData';
import { useOperations } from './operationsData';
import { useAuth } from './auth';
import { eventDistanceKm, formatDistance, formatDuration, formatRouteDistance } from './geo';

const InfrastructureLab = lazy(() => import('./simulation/InfrastructureLab'));

const emptyStatus = { busy: false, error: null, success: null };
const time = (value) => value ? new Date(value).toLocaleString() : 'Not recorded';

function Head({ code, title, copy }) {
  return <div className="page-intro"><div><span className="module-code">NAVIRA / {code}</span><h1>{title}</h1></div><p>{copy}</p></div>;
}

function Status({ state }) {
  if (!state.error && !state.success) return null;
  return <p className={`operation-feedback ${state.error ? 'is-error' : 'is-success'}`} role="status">{state.error ? <WarningCircle /> : <CheckCircle />}{state.error || state.success}</p>;
}

function Empty({ title, copy }) {
  return <div className="operation-empty"><Crosshair /><strong>{title}</strong><p>{copy}</p></div>;
}

export function LocalOperationsMap() {
  const { profile } = useAuth();
  const { events, selectedEvent, selectEvent } = useLiveData();
  const { data, mutate } = useOperations();
  const [location, setLocation] = useState(data.locations.find((item) => item.userId === profile.id) || null);
  const [locationState, setLocationState] = useState(emptyStatus);
  const [selectedPerson, setSelectedPerson] = useState(null);
  const operator = profile.role === 'operator';
  const helpByUser = new Map(data.helpRequests.filter((item) => item.status !== 'resolved').map((item) => [item.userId, item]));
  const people = operator ? [
    ...data.helpRequests.filter((item) => item.status !== 'resolved'),
    ...data.locations.filter((item) => !helpByUser.has(item.userId)).map((item) => ({ ...item, id: item.userId, status: 'location' })),
  ] : [];
  const nearby = useMemo(() => location ? events.map((event) => ({ event, distance: eventDistanceKm(location, event) })).filter((item) => Number.isFinite(item.distance)).sort((a, b) => a.distance - b.distance).slice(0, 8) : [], [events, location]);
  const focused = people.find((item) => (item.id || item.userId) === selectedPerson);

  const locate = () => {
    if (!navigator.geolocation) { setLocationState({ ...emptyStatus, error: 'This browser does not provide geolocation.' }); return; }
    setLocationState({ busy: true, error: null, success: null });
    navigator.geolocation.getCurrentPosition(async (position) => {
      const next = { longitude: position.coords.longitude, latitude: position.coords.latitude, accuracy: position.coords.accuracy };
      try {
        await mutate('location', next);
        setLocation(next);
        setLocationState({ busy: false, error: null, success: 'Location shared with the operations view.' });
      } catch (reason) { setLocationState({ busy: false, error: reason.message, success: null }); }
    }, (error) => setLocationState({ busy: false, error: error.message || 'Location permission was not granted.', success: null }), { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
  };

  return <>
    <Head code="LOCAL MAP" title={operator ? 'People and hazards in one local picture' : 'Your local safety picture'} copy={operator ? 'Consented civilian locations and verified help requests appear over the existing live disaster map.' : 'Share your browser location to center the live map and measure source records around you.'} />
    <section className="local-operations">
      <div className="local-operations__map"><LiveMap events={events} selectedEvent={selectedEvent} onSelect={selectEvent} variant="full" userLocation={operator ? null : location} viewMode={location ? 'near' : 'world'} people={people} onPersonSelect={setSelectedPerson} /></div>
      <aside className="local-operations__rail">
        {operator ? <>
          <div className="operation-rail-head"><span>Consented locations</span><strong>{data.locations.length}</strong><small>{data.helpRequests.filter((item) => item.status !== 'resolved').length} active help requests</small></div>
          {focused ? <article className="person-inspector"><span>{focused.status === 'location' ? 'LOCATION SHARED' : `REQUEST / ${focused.status.toUpperCase()}`}</span><h2>{focused.userName || focused.name}</h2>{focused.need && <strong>{focused.need} · {focused.people} people</strong>}<p>{focused.details || 'No additional details supplied.'}</p><dl><div><dt>Coordinates</dt><dd>{focused.latitude.toFixed(5)}°, {focused.longitude.toFixed(5)}°</dd></div><div><dt>Updated</dt><dd>{time(focused.updatedAt || focused.consentedAt)}</dd></div></dl></article> : <Empty title="Select a person marker" copy="Bone markers show shared locations. Signal markers show active help requests." />}
          <Link className="operation-link" to="/app/requests">Open request queue <ArrowRight /></Link>
        </> : <>
          <button className="locate-action" type="button" onClick={locate} disabled={locationState.busy}>{locationState.busy ? <SpinnerGap className="spin" /> : <Crosshair />}{location ? 'Update my location' : 'Use my location'}</button>
          <Status state={locationState} />
          {location ? <div className="nearby-ledger"><span>Closest published geometry</span>{nearby.map(({ event, distance }) => <button type="button" key={event.id} onClick={() => selectEvent(event)}><i /><span><strong>{event.title}</strong><small>{event.type}</small></span><b>{formatDistance(distance)}</b></button>)}</div> : <Empty title="Location not shared" copy="NAVIRA does not track your position until you choose to share it." />}
          <Link className="operation-link" to="/safety">Assess verified danger and routes <ArrowRight /></Link>
        </>}
      </aside>
    </section>
  </>;
}

export function RequestsView() {
  const { profile } = useAuth();
  const { data, mutate } = useOperations();
  const [status, setStatus] = useState(emptyStatus);
  const operator = profile.role === 'operator';
  const update = async (id, next) => {
    setStatus({ busy: true, error: null, success: null });
    try { await mutate('help-status', { id, status: next }); setStatus({ busy: false, error: null, success: 'Request status updated.' }); }
    catch (reason) { setStatus({ busy: false, error: reason.message, success: null }); }
  };
  return <>
    <Head code="REQUESTS" title={operator ? 'Civilian help request queue' : 'Ask for help from a verified hazard area'} copy={operator ? 'Each request includes a consented location and an independently rechecked intersection with source-supplied hazard geometry.' : 'A request becomes available only after NAVIRA verifies that your shared location intersects published hazard geometry.'} />
    {!operator && <Link className="operation-callout" to="/safety"><UserFocus /><span><strong>Check your location first</strong><small>Open the safety flow, select a verified hazard, and submit a request if your location qualifies.</small></span><ArrowRight /></Link>}
    <Status state={status} />
    <section className="operation-ledger">
      {data.helpRequests.length ? data.helpRequests.map((request) => <article key={request.id}>
        <div className="operation-ledger__signal"><i className={`status-dot status-dot--${request.status}`} /><span>{request.status}</span></div>
        <div><strong>{operator ? request.userName : request.need}</strong><small>{request.eventTitle} · {request.sourceName}</small><p>{request.details || 'No additional details supplied.'}</p></div>
        <dl><div><dt>People</dt><dd>{request.people}</dd></div><div><dt>Submitted</dt><dd>{time(request.createdAt)}</dd></div><div><dt>Verification</dt><dd>{request.verification}</dd></div></dl>
        {operator && <select aria-label={`Status for ${request.userName}`} value={request.status} onChange={(event) => update(request.id, event.target.value)} disabled={status.busy}><option value="new">New</option><option value="acknowledged">Acknowledged</option><option value="assigned">Assigned</option><option value="resolved">Resolved</option></select>}
      </article>) : <Empty title="No help requests recorded" copy={operator ? 'Verified civilian requests will appear here when submitted.' : 'You have not submitted a help request.'} />}
    </section>
  </>;
}

export function EvacuationView() {
  const { profile } = useAuth();
  const { data } = useOperations();
  const operator = profile.role === 'operator';
  return <>
    <Head code="EVACUATION" title={operator ? 'Shared civilian evacuation routes' : 'Your verified evacuation routes'} copy={operator ? 'Routes shared by civilians are OSRM road routes compared against connected hazard polygons.' : 'Build a route from your browser location only after a verified boundary assessment.'} />
    {!operator && <Link className="operation-callout" to="/safety"><Path /><span><strong>Plan an escape route</strong><small>Compare fastest and lower-exposure alternatives using real road data.</small></span><ArrowRight /></Link>}
    <section className="operation-ledger">
      {data.evacuations.length ? data.evacuations.map((route) => <article key={route.id}>
        <div className="operation-ledger__signal"><i className="status-dot status-dot--assigned" /><span>{route.routeRole || 'route'}</span></div>
        <div><strong>{operator ? route.userName : route.destination}</strong><small>{route.eventTitle}</small><p>Destination: {route.destination}</p></div>
        <dl><div><dt>ETA</dt><dd>{formatDuration(route.durationSeconds)}</dd></div><div><dt>Distance</dt><dd>{formatRouteDistance(route.distanceMeters)}</dd></div><div><dt>Verified exposure</dt><dd>{formatRouteDistance(route.exposureMeters)}</dd></div></dl>
      </article>) : <Empty title="No evacuation routes shared" copy={operator ? 'Routes appear here after civilians explicitly share a computed route.' : 'Your shared routes will appear here.'} />}
    </section>
  </>;
}

function OperatorGate({ children }) {
  const { profile } = useAuth();
  return profile.role === 'operator' ? children : <Empty title="Operator access required" copy="This tool changes operational records and is available only in the operator workspace." />;
}

export function DispatchView() {
  const { data, mutate } = useOperations();
  const [status, setStatus] = useState(emptyStatus);
  const submit = async (event) => {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    setStatus({ busy: true, error: null, success: null });
    try { await mutate('dispatch', Object.fromEntries(form)); event.currentTarget.reset(); setStatus({ busy: false, error: null, success: 'Responder assignment recorded.' }); }
    catch (reason) { setStatus({ busy: false, error: reason.message, success: null }); }
  };
  const change = async (id, next) => { try { await mutate('dispatch-status', { id, status: next }); } catch (reason) { setStatus({ busy: false, error: reason.message, success: null }); } };
  return <OperatorGate><Head code="DISPATCH" title="Assign responders to verified requests" copy="Record the responsible team and capability, then update the assignment as field status changes." /><div className="operation-tool-grid"><form className="operation-form" onSubmit={submit}><h2>New assignment</h2><label>Help request<select name="requestId" required defaultValue=""><option value="" disabled>Select request</option>{data.helpRequests.filter((item) => item.status !== 'resolved').map((item) => <option key={item.id} value={item.id}>{item.userName} · {item.need}</option>)}</select></label><label>Responder or team<input name="team" required /></label><label>Capability<input name="capability" required placeholder="Medical, rescue, transport" /></label><button type="submit" disabled={status.busy}>{status.busy ? <SpinnerGap className="spin" /> : <UsersThree />} Assign team</button><Status state={status} /></form><section className="operation-records"><h2>Active assignments</h2>{data.dispatches.length ? data.dispatches.map((item) => <article key={item.id}><div><strong>{item.team}</strong><span>{item.capability}</span><small>For {item.userName} · {time(item.createdAt)}</small></div><select value={item.status} onChange={(event) => change(item.id, event.target.value)}><option value="assigned">Assigned</option><option value="en-route">En route</option><option value="on-scene">On scene</option><option value="complete">Complete</option></select></article>) : <Empty title="No assignments recorded" copy="Assign a team to a verified help request." />}</section></div></OperatorGate>;
}

export function ResourcesView() {
  const { data, mutate } = useOperations();
  const [status, setStatus] = useState(emptyStatus);
  const submit = (action) => async (event) => { event.preventDefault(); const form = event.currentTarget; setStatus({ busy: true, error: null, success: null }); try { await mutate(action, Object.fromEntries(new FormData(form))); form.reset(); setStatus({ busy: false, error: null, success: action === 'resource' ? 'Resource stock recorded.' : 'Allocation recorded.' }); } catch (reason) { setStatus({ busy: false, error: reason.message, success: null }); } };
  const remaining = (resource) => resource.quantity - data.allocations.filter((item) => item.resourceId === resource.id).reduce((sum, item) => sum + item.quantity, 0);
  return <OperatorGate><Head code="RESOURCES" title="Move recorded stock toward verified need" copy="Inventory exists only when an operator records it. Allocation cannot exceed the remaining quantity." /><Status state={status} /><div className="operation-tool-grid operation-tool-grid--resources"><div><form className="operation-form" onSubmit={submit('resource')}><h2>Add available stock</h2><label>Resource<input name="name" required /></label><label>Category<select name="category"><option>Medical</option><option>Water</option><option>Food</option><option>Shelter</option><option>Transport</option><option>Communications</option></select></label><div className="form-pair"><label>Quantity<input name="quantity" type="number" min="1" required /></label><label>Unit<input name="unit" required placeholder="kits, litres, beds" /></label></div><label>Storage location<input name="base" required /></label><button type="submit"><Package /> Record stock</button></form><form className="operation-form" onSubmit={submit('allocation')}><h2>Allocate stock</h2><label>Resource<select name="resourceId" required defaultValue=""><option value="" disabled>Select resource</option>{data.resources.filter((item) => remaining(item) > 0).map((item) => <option key={item.id} value={item.id}>{item.name} · {remaining(item)} {item.unit} remaining</option>)}</select></label><label>Help request<select name="requestId" required defaultValue=""><option value="" disabled>Select request</option>{data.helpRequests.filter((item) => item.status !== 'resolved').map((item) => <option key={item.id} value={item.id}>{item.userName} · {item.need}</option>)}</select></label><label>Quantity<input name="quantity" type="number" min="1" required /></label><button type="submit"><MapPin /> Allocate</button></form></div><section className="resource-board"><h2>Recorded inventory</h2>{data.resources.length ? data.resources.map((item) => <article key={item.id}><div><span>{item.category}</span><strong>{item.name}</strong><small>{item.base}</small></div><b>{remaining(item)} <small>{item.unit} available</small></b></article>) : <Empty title="No inventory recorded" copy="Add only stock confirmed by the responsible logistics team." />}<h2>Allocation ledger</h2>{data.allocations.map((item) => <article key={item.id}><div><span>ALLOCATED</span><strong>{item.resourceName}</strong><small>To {item.destination}</small></div><b>{item.quantity} <small>{item.unit}</small></b></article>)}</section></div></OperatorGate>;
}

export function InfrastructureView() {
  return <OperatorGate><Suspense fallback={<Empty title="Opening simulation lab" copy="Loading the three-dimensional test environment." />}><InfrastructureLab entry="infrastructure" /></Suspense></OperatorGate>;
}

export function SimulationView() {
  return <OperatorGate><Suspense fallback={<Empty title="Opening simulation lab" copy="Loading the three-dimensional test environment." />}><InfrastructureLab entry="simulation" /></Suspense></OperatorGate>;
}
