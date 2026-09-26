import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight, Buildings, Camera, CheckCircle, Crosshair, Flask, ImageSquare, MapPin, Package,
  Path, SpinnerGap, UploadSimple, UserFocus, UsersThree, WarningCircle, X,
} from '@phosphor-icons/react';
import LiveMap from './LiveMap';
import { useLiveData } from './liveData';
import { useOperations } from './operationsData';
import { useAuth } from './auth';
import { eventDistanceKm, formatDistance, formatDuration, formatRouteDistance } from './geo';

const InfrastructureLab = lazy(() => import('./simulation/InfrastructureLab'));

const emptyStatus = { busy: false, error: null, success: null };
const time = (value) => value ? new Date(value).toLocaleString() : 'Not recorded';
const REPORT_TYPES = ['Earthquake', 'Flood', 'Wildfire', 'Landslide', 'Severe storm', 'Extreme wind', 'Tsunami', 'Volcanic activity', 'Other natural hazard'];

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

function OperationalReadiness({ stage, title, copy, facts = [], integration, action }) {
  return <div className="operation-readiness"><div className="operation-readiness__head"><span>{stage}</span><strong>{title}</strong></div><p>{copy}</p>{facts.length > 0 && <dl>{facts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>}{integration && <div className="operation-readiness__integration"><b>Authoritative integration</b><span>{integration}</span></div>}{action && <Link className="operation-readiness__action" to={action.to}>{action.label} <ArrowRight /></Link>}</div>;
}

function compressReportImage(file) {
  return new Promise((resolve, reject) => {
    if (!file?.type?.startsWith('image/')) { reject(new Error('Choose an image from your camera or computer.')); return; }
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve({ imageData: canvas.toDataURL('image/jpeg', .82), fileName: file.name || 'camera-report.jpg' });
    };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('The selected image could not be read.')); };
    image.src = url;
  });
}

function browserLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error('This browser does not provide geolocation.')); return; }
    navigator.geolocation.getCurrentPosition((position) => resolve({
      longitude: position.coords.longitude,
      latitude: position.coords.latitude,
      accuracy: position.coords.accuracy,
    }), (error) => reject(new Error(error.code === 1 ? 'Location permission is required to submit an image report.' : error.message || 'Your location could not be determined.')), { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 });
  });
}

function IncidentReportDialog({ open, onClose }) {
  const dialog = useRef(null);
  const { mutate } = useOperations();
  const [image, setImage] = useState(null);
  const [status, setStatus] = useState(emptyStatus);

  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    if (open && !node.open) node.showModal();
    if (!open && node.open) node.close();
  }, [open]);

  const chooseImage = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setStatus(emptyStatus);
    try { setImage(await compressReportImage(file)); }
    catch (reason) { setStatus({ ...emptyStatus, error: reason.message }); }
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!image) { setStatus({ ...emptyStatus, error: 'Take or upload an image before submitting.' }); return; }
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    setStatus({ busy: true, error: null, success: null });
    try {
      const location = await browserLocation();
      await mutate('location', location);
      await mutate('incident-report', { ...values, ...image, longitude: location.longitude, latitude: location.latitude, accuracy: location.accuracy });
      setStatus({ busy: false, error: null, success: 'Image and device location sent to the operator review queue.' });
      setImage(null);
      form.reset();
    } catch (reason) { setStatus({ busy: false, error: reason.message, success: null }); }
  };

  return <dialog ref={dialog} className="incident-report-dialog" onCancel={onClose} onClose={onClose} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="incident-report-dialog__panel"><header><div><span>CIVILIAN EVIDENCE REPORT</span><h2>Show operators what you can see.</h2></div><button type="button" onClick={onClose} aria-label="Close image report"><X /></button></header><div className="incident-report-dialog__notice"><WarningCircle /><p>This image starts as a community report. It does not become a disaster event until an operator reviews it.</p></div><form onSubmit={submit}><label className={`report-image-input ${image ? 'has-image' : ''}`}><input type="file" name="image" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={chooseImage} /><span>{image ? <img src={image.imageData} alt="Selected incident report preview" /> : <><Camera /><strong>Take a photo or upload an image</strong><small>Camera on phone · file picker on computer</small></>}</span></label><div className="report-form-row"><label>What type of disaster?<select name="disasterType" required defaultValue=""><option value="" disabled>Select type</option>{REPORT_TYPES.map((type) => <option key={type}>{type}</option>)}</select></label><label>What can you see?<textarea name="details" rows="3" placeholder="Optional details visible from your location" /></label></div><p className="report-location-note"><MapPin /> Your device location is attached automatically. NAVIRA asks for permission if you have not shared it yet.</p><button className="report-submit" type="submit" disabled={status.busy}>{status.busy ? <SpinnerGap className="spin" /> : <UploadSimple />} Submit image</button><Status state={status} /></form><Link className="report-safety-link" to="/safety" onClick={onClose}>Check verified hazards and routes <ArrowRight /></Link></div></dialog>;
}

export function LocalOperationsMap() {
  const { profile } = useAuth();
  const { events, selectedEvent, selectEvent } = useLiveData();
  const { data, mutate } = useOperations();
  const [location, setLocation] = useState(data.locations.find((item) => item.userId === profile.id) || null);
  const [locationState, setLocationState] = useState(emptyStatus);
  const [selectedPerson, setSelectedPerson] = useState(null);
  const [selectedReport, setSelectedReport] = useState(null);
  const [reviewState, setReviewState] = useState(emptyStatus);
  const operator = profile.role === 'operator';
  const helpByUser = new Map(data.helpRequests.filter((item) => item.status !== 'resolved').map((item) => [item.userId, item]));
  const people = operator ? [
    ...data.helpRequests.filter((item) => item.status !== 'resolved'),
    ...data.locations.filter((item) => !helpByUser.has(item.userId)).map((item) => ({ ...item, id: item.userId, status: 'location' })),
  ] : [];
  const nearby = useMemo(() => location ? events.map((event) => ({ event, distance: eventDistanceKm(location, event) })).filter((item) => Number.isFinite(item.distance)).sort((a, b) => a.distance - b.distance).slice(0, 8) : [], [events, location]);
  const focused = people.find((item) => (item.id || item.userId) === selectedPerson);
  const pendingReports = data.incidentReports.filter((item) => item.status === 'pending-review');
  const focusedReport = data.incidentReports.find((item) => item.id === selectedReport);
  const communityEvent = data.communityEvents.find((item) => item.reportId === selectedReport);
  const mapEvents = operator ? [...events, ...data.communityEvents] : events;
  const mapSelectedEvent = communityEvent || selectedEvent;

  useEffect(() => { setReviewState(emptyStatus); }, [selectedReport]);

  const selectMapEvent = (value) => {
    const id = value?.id || value;
    const operational = data.communityEvents.find((item) => item.id === id);
    if (operational) {
      setSelectedReport(operational.reportId);
      setSelectedPerson(null);
      return;
    }
    setSelectedReport(null);
    selectEvent(value);
  };

  const reviewReport = async (event) => {
    event.preventDefault();
    const decision = event.nativeEvent.submitter?.value;
    setReviewState({ busy: true, error: null, success: null });
    try {
      const result = await mutate('incident-review', { ...Object.fromEntries(new FormData(event.currentTarget)), id: focusedReport.id, decision });
      setReviewState({ busy: false, error: null, success: decision === 'natural-disaster' ? `Report added to the map. ${result.notified} consented location${result.notified === 1 ? '' : 's'} notified.` : 'Report dismissed and retained in the audit record.' });
    } catch (reason) { setReviewState({ busy: false, error: reason.message, success: null }); }
  };

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
      <div className="local-operations__map"><LiveMap events={mapEvents} selectedEvent={mapSelectedEvent} onSelect={selectMapEvent} variant="full" userLocation={operator ? null : location} viewMode={location ? 'near' : 'world'} people={people} onPersonSelect={(id) => { setSelectedPerson(id); setSelectedReport(null); }} reports={operator ? pendingReports : []} onReportSelect={(id) => { setSelectedReport(id); setSelectedPerson(null); }} /></div>
      <aside className="local-operations__rail">
        {operator ? <>
          <div className="operation-rail-head"><span>People + evidence</span><strong>{data.locations.length}</strong><small>{data.helpRequests.filter((item) => item.status !== 'resolved').length} active help requests · {pendingReports.length} image reports awaiting review</small></div>
          {focusedReport ? <article className="report-inspector"><div className="report-inspector__image"><img src={focusedReport.imageData} alt={`Civilian-submitted ${focusedReport.disasterType} evidence`} /><span>{focusedReport.status.replaceAll('-', ' ')}</span></div><div className="report-inspector__body"><span>COMMUNITY IMAGE / {time(focusedReport.createdAt)}</span><h2>{focusedReport.disasterType}</h2><p>{focusedReport.details || 'No description was supplied.'}</p><dl><div><dt>Submitted by</dt><dd>{focusedReport.userName}</dd></div><div><dt>Device location</dt><dd>{focusedReport.latitude.toFixed(5)}°, {focusedReport.longitude.toFixed(5)}°</dd></div><div><dt>Accuracy</dt><dd>{Number.isFinite(focusedReport.accuracy) ? `±${Math.round(focusedReport.accuracy)} m` : 'Not supplied'}</dd></div></dl>{focusedReport.status === 'pending-review' ? <form onSubmit={reviewReport}><label>Confirmed type<select name="confirmedType" defaultValue={focusedReport.disasterType}>{REPORT_TYPES.map((type) => <option key={type}>{type}</option>)}</select></label><label>Notification area<input name="notificationRadiusKm" type="number" min="0.1" max="100" step="0.1" defaultValue="5" required /><small>Operator-defined radius in kilometres. This is not an official hazard boundary.</small></label><label>Review note<textarea name="reviewNotes" rows="2" /></label><div><button type="submit" name="decision" value="natural-disaster" disabled={reviewState.busy}><CheckCircle /> Natural disaster</button><button type="submit" name="decision" value="dismissed" disabled={reviewState.busy}><X /> Dismiss</button></div></form> : <p className="report-inspector__decision"><CheckCircle /> Reviewed by {focusedReport.reviewedBy} · {focusedReport.status.replaceAll('-', ' ')}</p>}<Status state={reviewState} /></div></article> : focused ? <article className="person-inspector"><span>{focused.status === 'location' ? 'LOCATION SHARED' : `REQUEST / ${focused.status.toUpperCase()}`}</span><h2>{focused.userName || focused.name}</h2>{focused.need && <strong>{focused.need} · {focused.people} people</strong>}<p>{focused.details || 'No additional details supplied.'}</p><dl><div><dt>Coordinates</dt><dd>{focused.latitude.toFixed(5)}°, {focused.longitude.toFixed(5)}°</dd></div><div><dt>Updated</dt><dd>{time(focused.updatedAt || focused.consentedAt)}</dd></div></dl></article> : <Empty title="Select a map marker" copy="Bone markers show shared locations, signal markers show help requests, and blinking green markers show unreviewed images." />}
          {pendingReports.length > 0 && <div className="report-queue"><span>IMAGE REVIEW QUEUE</span>{pendingReports.map((report) => <button key={report.id} type="button" className={selectedReport === report.id ? 'is-selected' : ''} onClick={() => { setSelectedReport(report.id); setSelectedPerson(null); }}><i /><span><strong>{report.disasterType}</strong><small>{report.userName} · {time(report.createdAt)}</small></span><ArrowRight /></button>)}</div>}
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
  const { events } = useLiveData();
  const { data, mutate } = useOperations();
  const [status, setStatus] = useState(emptyStatus);
  const [reportOpen, setReportOpen] = useState(false);
  const operator = profile.role === 'operator';
  const update = async (id, next) => {
    setStatus({ busy: true, error: null, success: null });
    try { await mutate('help-status', { id, status: next }); setStatus({ busy: false, error: null, success: 'Request status updated.' }); }
    catch (reason) { setStatus({ busy: false, error: reason.message, success: null }); }
  };
  return <>
    <Head code="REQUESTS" title={operator ? 'Civilian help request queue' : 'Ask for help from a verified hazard area'} copy={operator ? 'Each request includes a consented location and an independently rechecked intersection with source-supplied hazard geometry.' : 'A request becomes available only after NAVIRA verifies that your shared location intersects published hazard geometry.'} />
    {!operator && <><button className="operation-callout" type="button" onClick={() => setReportOpen(true)}><UserFocus /><span><strong>Check your location first</strong><small>Open the report panel to share an image, or continue to the verified hazard and route check.</small></span><ArrowRight /></button><IncidentReportDialog open={reportOpen} onClose={() => setReportOpen(false)} /></>}
    <Status state={status} />
    <section className="operation-ledger">
      {data.helpRequests.length ? data.helpRequests.map((request) => <article key={request.id}>
        <div className="operation-ledger__signal"><i className={`status-dot status-dot--${request.status}`} /><span>{request.status}</span></div>
        <div><strong>{operator ? request.userName : request.need}</strong><small>{request.eventTitle} · {request.sourceName}</small><p>{request.details || 'No additional details supplied.'}</p></div>
        <dl><div><dt>People</dt><dd>{request.people}</dd></div><div><dt>Submitted</dt><dd>{time(request.createdAt)}</dd></div><div><dt>Verification</dt><dd>{request.verification}</dd></div></dl>
        {operator && <select aria-label={`Status for ${request.userName}`} value={request.status} onChange={(event) => update(request.id, event.target.value)} disabled={status.busy}><option value="new">New</option><option value="acknowledged">Acknowledged</option><option value="assigned">Assigned</option><option value="resolved">Resolved</option></select>}
      </article>) : <OperationalReadiness stage="PROTECT / REQUEST GATE" title="No qualifying request has been submitted" copy={operator ? 'The request channel is active. A record appears only after a civilian shares a location, selects a source event, and NAVIRA rechecks the point against verified hazard geometry.' : 'Your request channel is ready. First use Near You to share a location and select a source event with enough geometry for a deterministic risk check.'} facts={[["Current source records", events.length], ["Requests recorded", 0]]} action={{ to: operator ? '/app/local-map' : '/safety', label: operator ? 'Open people + hazards' : 'Check my location' }} />}
    </section>
    {!operator && data.incidentReports.length > 0 && <section className="incident-report-history"><h2>Your image reports</h2>{data.incidentReports.map((report) => <article key={report.id}><img src={report.imageData} alt={`Submitted ${report.disasterType} report`} /><div><span>{report.status.replaceAll('-', ' ')}</span><strong>{report.disasterType}</strong><small>{time(report.createdAt)}</small></div></article>)}</section>}
  </>;
}

export function EvacuationView() {
  const { profile } = useAuth();
  const { events } = useLiveData();
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
      </article>) : <OperationalReadiness stage="PROTECT / ROUTE GATE" title="No road route has been shared" copy={operator ? 'The routing flow is active. A route appears here after a civilian passes a verified-area assessment, chooses a destination, receives OSRM alternatives, and explicitly shares one.' : 'Open civilian safety to check a verified hazard area, choose your own destination, and compare real OpenStreetMap road alternatives.'} facts={[["Current source records", events.length], ["Shared routes", 0]]} integration="Official evacuation orders, authority-designated destinations, and closed-road restrictions require a local emergency-management CAP or GIS feed. NAVIRA road alternatives are never labelled official without it." action={{ to: operator ? '/app/local-map' : '/safety', label: operator ? 'Open people + hazards' : 'Plan from my location' }} />}
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
  const openRequests = data.helpRequests.filter((item) => item.status !== 'resolved').length;
  return <OperatorGate><Head code="DISPATCH" title="Assign responders to verified requests" copy="Record the responsible team and capability, then update the assignment as field status changes." /><div className="operation-tool-grid"><form className="operation-form" onSubmit={submit}><h2>New assignment</h2><p className="record-origin">OPERATOR-ENTERED RECORD</p><label>Help request<select name="requestId" required defaultValue=""><option value="" disabled>Select request</option>{data.helpRequests.filter((item) => item.status !== 'resolved').map((item) => <option key={item.id} value={item.id}>{item.userName} · {item.need}</option>)}</select></label><label>Responder or team<input name="team" required /></label><label>Capability<input name="capability" required placeholder="Medical, rescue, transport" /></label><button type="submit" disabled={status.busy || openRequests === 0}>{status.busy ? <SpinnerGap className="spin" /> : <UsersThree />} Assign team</button><Status state={status} /></form><section className="operation-records"><h2>Active assignments</h2>{data.dispatches.length ? data.dispatches.map((item) => <article key={item.id}><div><strong>{item.team}</strong><span>{item.capability}</span><small>For {item.userName} · {time(item.createdAt)}</small></div><select value={item.status} onChange={(event) => change(item.id, event.target.value)}><option value="assigned">Assigned</option><option value="en-route">En route</option><option value="on-scene">On scene</option><option value="complete">Complete</option></select></article>) : <OperationalReadiness stage="PROTECT / DISPATCH GATE" title={openRequests ? 'Requests are ready for assignment' : 'No verified request is waiting'} copy={openRequests ? 'Choose a verified request and record the responsible team. NAVIRA will preserve the assignment and its field status.' : 'Dispatch starts from a verified civilian help request. The assignment form remains locked until one exists.'} facts={[["Open help requests", openRequests], ["Assignments recorded", 0]]} integration="A live responder roster, availability, vehicle position, and unit status require connection to the authority’s CAD, RMS, or AVL system. Until connected, team identity is explicitly operator-entered." action={{ to: '/app/requests', label: 'Open help requests' }} />}</section></div></OperatorGate>;
}

export function ResourcesView() {
  const { data, mutate } = useOperations();
  const [status, setStatus] = useState(emptyStatus);
  const submit = (action) => async (event) => { event.preventDefault(); const form = event.currentTarget; setStatus({ busy: true, error: null, success: null }); try { await mutate(action, Object.fromEntries(new FormData(form))); form.reset(); setStatus({ busy: false, error: null, success: action === 'resource' ? 'Resource stock recorded.' : 'Allocation recorded.' }); } catch (reason) { setStatus({ busy: false, error: reason.message, success: null }); } };
  const remaining = (resource) => resource.quantity - data.allocations.filter((item) => item.resourceId === resource.id).reduce((sum, item) => sum + item.quantity, 0);
  const openRequests = data.helpRequests.filter((item) => item.status !== 'resolved').length;
  const allocatable = data.resources.filter((item) => remaining(item) > 0).length;
  return <OperatorGate><Head code="RESOURCES" title="Move recorded stock toward verified need" copy="Inventory exists only when an operator records it. Allocation cannot exceed the remaining quantity." /><Status state={status} /><div className="operation-tool-grid operation-tool-grid--resources"><div><form className="operation-form" onSubmit={submit('resource')}><h2>Add available stock</h2><p className="record-origin">OPERATOR-CONFIRMED INVENTORY</p><label>Resource<input name="name" required /></label><label>Category<select name="category"><option>Medical</option><option>Water</option><option>Food</option><option>Shelter</option><option>Transport</option><option>Communications</option></select></label><div className="form-pair"><label>Quantity<input name="quantity" type="number" min="1" required /></label><label>Unit<input name="unit" required placeholder="kits, litres, beds" /></label></div><label>Storage location<input name="base" required /></label><button type="submit"><Package /> Record stock</button></form><form className="operation-form" onSubmit={submit('allocation')}><h2>Allocate stock</h2><label>Resource<select name="resourceId" required defaultValue=""><option value="" disabled>Select resource</option>{data.resources.filter((item) => remaining(item) > 0).map((item) => <option key={item.id} value={item.id}>{item.name} · {remaining(item)} {item.unit} remaining</option>)}</select></label><label>Help request<select name="requestId" required defaultValue=""><option value="" disabled>Select request</option>{data.helpRequests.filter((item) => item.status !== 'resolved').map((item) => <option key={item.id} value={item.id}>{item.userName} · {item.need}</option>)}</select></label><label>Quantity<input name="quantity" type="number" min="1" required /></label><button type="submit" disabled={!allocatable || !openRequests}><MapPin /> Allocate</button></form></div><section className="resource-board"><h2>Recorded inventory</h2>{data.resources.length ? data.resources.map((item) => <article key={item.id}><div><span>{item.category}</span><strong>{item.name}</strong><small>{item.base}</small></div><b>{remaining(item)} <small>{item.unit} available</small></b></article>) : <OperationalReadiness stage="PROTECT / INVENTORY GATE" title="No confirmed stock is recorded" copy="The inventory tool is ready. Add only quantities confirmed by the responsible logistics team; NAVIRA will prevent allocations above the remaining stock." facts={[["Open help requests", openRequests], ["Inventory records", 0]]} integration="Automatic stock, depot, expiry, vehicle, and replenishment status require a logistics, warehouse-management, or ERP connector. Until connected, every quantity is labelled operator-confirmed." />}<h2>Allocation ledger</h2>{data.allocations.length ? data.allocations.map((item) => <article key={item.id}><div><span>ALLOCATED</span><strong>{item.resourceName}</strong><small>To {item.destination}</small></div><b>{item.quantity} <small>{item.unit}</small></b></article>) : <OperationalReadiness stage="PROTECT / ALLOCATION GATE" title="No allocation has been recorded" copy={allocatable && openRequests ? 'Confirmed stock and a verified request are available. Use the allocation form to record what is being moved and to whom.' : 'An allocation requires both confirmed remaining stock and an unresolved verified help request.'} facts={[["Allocatable stock records", allocatable], ["Open help requests", openRequests]]} />}</section></div></OperatorGate>;
}

export function InfrastructureView() {
  return <OperatorGate><Suspense fallback={<Empty title="Opening simulation lab" copy="Loading the three-dimensional test environment." />}><InfrastructureLab entry="infrastructure" /></Suspense></OperatorGate>;
}

export function SimulationView() {
  return <OperatorGate><Suspense fallback={<Empty title="Opening simulation lab" copy="Loading the three-dimensional test environment." />}><InfrastructureLab entry="simulation" /></Suspense></OperatorGate>;
}
