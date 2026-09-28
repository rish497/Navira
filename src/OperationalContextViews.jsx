import { useMemo, useState } from 'react';
import { ArrowRight, CheckCircle, ClockCounterClockwise, LinkSimple, SpinnerGap, Warning } from '@phosphor-icons/react';
import { Link } from 'react-router-dom';
import { useAuth } from './auth';
import { useLiveData } from './liveData';
import { useOperations } from './operationsData';
import { useRoadData } from './roadData';
import { useAlertData } from './alertData';

const INITIAL = { busy: false, error: null, success: null };
const time = (value) => value ? new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(new Date(value)) : 'Data unavailable';
const readable = (value) => String(value || '').replaceAll('_', ' ').replaceAll('-', ' ');

function Status({ state }) {
  if (!state.error && !state.success) return null;
  return <p className={`operation-feedback ${state.error ? 'is-error' : 'is-success'}`} role={state.error ? 'alert' : 'status'}>{state.error ? <Warning /> : <CheckCircle />}{state.error || state.success}</p>;
}

export function IncidentRibbon() {
  const { profile } = useAuth();
  const { data, mutate } = useOperations();
  const active = data.incidents.find((item) => item.id === data.activeIncidentId) || null;
  const [busy, setBusy] = useState(false);
  if (profile.role !== 'operator') return null;
  const select = async (event) => {
    setBusy(true);
    try { await mutate('incident-activate', { id: event.target.value || null }); } finally { setBusy(false); }
  };
  return <aside className={`incident-ribbon ${active ? 'has-incident' : ''}`} aria-label="Active incident context">
    <div><span>ACTIVE INCIDENT</span>{active ? <><strong>{active.name}</strong><small>{active.type} · {active.geographicArea}</small></> : <><strong>No incident selected</strong><small>Operational records remain unlinked until an incident is chosen.</small></>}</div>
    {active && <dl><div><dt>State</dt><dd>{active.status}</dd></div><div><dt>Phase</dt><dd>{active.operationalPhase}</dd></div><div><dt>Severity</dt><dd>{active.severity}</dd></div><div><dt>Updated</dt><dd>{time(active.updatedAt)}</dd></div></dl>}
    <label><span className="sr-only">Select active incident</span><select value={active?.id || ''} onChange={select} disabled={busy}><option value="">No active incident</option>{data.incidents.filter((item) => item.status !== 'ARCHIVED').map((item) => <option key={item.id} value={item.id}>{item.name} · {item.status}</option>)}</select></label>
    <Link to="/app/incidents">Command context <ArrowRight /></Link>
  </aside>;
}

function RecordLinker({ incident, onLink }) {
  const { data } = useOperations();
  const { events } = useLiveData();
  const roadData = useRoadData();
  const alertData = useAlertData();
  const candidates = [
    ...events.map((item) => ({ type: 'hazard', id: item.id, label: `Hazard · ${item.title} · ${item.source.name}` })),
    ...alertData.alerts.map((item) => ({ type: 'alert', id: item.id, label: `Official alert · ${item.headline} · ${item.source.name}` })),
    ...roadData.restrictions.map((item) => ({ type: 'roadRestriction', id: item.id, label: `Road · ${readable(item.status)} · ${item.source.name}` })),
    ...data.helpRequests.map((item) => ({ type: 'helpRequest', id: item.id, label: `Help · ${item.userName} · ${item.need}` })),
    ...data.dispatches.map((item) => ({ type: 'dispatch', id: item.id, label: `Dispatch · ${item.team} · ${item.status}` })),
    ...data.resources.map((item) => ({ type: 'resource', id: item.id, label: `Resource · ${item.name} · ${item.quantity} ${item.unit}` })),
    ...data.incidentReports.map((item) => ({ type: 'evidenceReport', id: item.id, label: `Evidence · ${item.disasterType} · ${item.status}` })),
  ];
  const [selected, setSelected] = useState('');
  const submit = (event) => {
    event.preventDefault();
    const [recordType, recordId] = selected.split(':');
    if (recordType && recordId) onLink({ incidentId: incident.id, recordType, recordId });
  };
  return <form className="incident-linker" onSubmit={submit}><label>Link operational record<select value={selected} onChange={(event) => setSelected(event.target.value)} required><option value="">Select an unlinked record</option>{candidates.filter((item) => !item.id || !Object.values(incident).some((value) => Array.isArray(value) && value.includes(item.id))).map((item) => <option key={`${item.type}:${item.id}`} value={`${item.type}:${item.id}`}>{item.label}</option>)}</select></label><button type="submit" disabled={!selected}><LinkSimple /> Link</button></form>;
}

export function IncidentsView() {
  const { events } = useLiveData();
  const { data, mutate } = useOperations();
  const [state, setState] = useState(INITIAL);
  const active = data.incidents.find((item) => item.id === data.activeIncidentId) || data.incidents[0] || null;
  const act = async (action, payload, success) => {
    setState({ busy: true, error: null, success: null });
    try { await mutate(action, payload); setState({ busy: false, error: null, success }); }
    catch (error) { setState({ busy: false, error: error.message, success: null }); }
  };
  const create = (event) => { event.preventDefault(); const form = event.currentTarget; act('incident-create', Object.fromEntries(new FormData(form)), 'Incident created and selected.').then(() => form.reset()); };
  const update = (event) => { event.preventDefault(); act('incident-update', Object.fromEntries(new FormData(event.currentTarget)), 'Incident state updated.'); };
  return <>
    <div className="page-intro"><div><span className="module-code">NAVIRA / INCIDENTS</span><h1>One command context across every action.</h1></div><p>Create a server-authoritative incident, select it as the active context, and link the hazards, requests, assignments, resources, restrictions, alerts, and evidence that belong to it.</p></div>
    <Status state={state} />
    <div className="incident-command-grid">
      <form className="operation-form incident-create" onSubmit={create}><h2>Create incident</h2><p className="record-origin">SERVER-AUTHORITATIVE COMMAND RECORD</p><label>Incident name<input name="name" required maxLength="180" /></label><div className="form-pair"><label>Type<input name="type" required maxLength="100" placeholder="Flood, earthquake, wildfire" /></label><label>Severity<select name="severity" defaultValue="UNASSESSED"><option>UNASSESSED</option><option>LOW</option><option>MODERATE</option><option>HIGH</option><option>CRITICAL</option></select></label></div><label>Geographic area<input name="geographicArea" required maxLength="240" placeholder="Authority-defined operational area" /></label><div className="form-pair"><label>Phase<select name="operationalPhase" defaultValue="RESPONSE"><option>READINESS</option><option>RESPONSE</option><option>STABILIZATION</option><option>RECOVERY</option></select></label><label>Command lead<input name="commandLead" maxLength="180" /></label></div><label>Initial linked hazard<select name="linkedHazards" defaultValue=""><option value="">None yet</option>{events.map((item) => <option key={item.id} value={item.id}>{item.title} · {item.source.name}</option>)}</select></label><label>Operational notes<textarea name="operationalNotes" rows="3" maxLength="2000" /></label><button type="submit" disabled={state.busy}>{state.busy ? <SpinnerGap className="spin" /> : <CheckCircle />} Create and activate</button></form>
      <section className="incident-roster"><div className="incident-roster__head"><span>AUTHORIZED INCIDENTS</span><strong>{data.incidents.length}</strong></div>{data.incidents.length ? data.incidents.map((item) => <button key={item.id} className={item.id === data.activeIncidentId ? 'is-active' : ''} type="button" onClick={() => act('incident-activate', { id: item.id }, `${item.name} is now active.`)}><i /><span><strong>{item.name}</strong><small>{item.type} · {item.geographicArea}</small></span><b>{item.status}</b></button>) : <div className="operation-empty"><strong>No command incident exists</strong><p>Create one when records need a shared operational context. Historical records remain independent until linked.</p></div>}</section>
    </div>
    {active && <section className="incident-detail"><header><div><span>CURRENT COMMAND CONTEXT</span><h2>{active.name}</h2><p>{active.responsibleOrganization} · lead {active.commandLead}</p></div><b className={`incident-severity incident-severity--${active.severity.toLowerCase()}`}>{active.severity}</b></header><div className="incident-detail__body"><form onSubmit={update}><input type="hidden" name="id" value={active.id} /><div className="form-pair"><label>Status<select name="status" defaultValue={active.status}><option>ACTIVE</option><option>MONITORING</option><option>CONTAINED</option><option>RESOLVED</option><option>ARCHIVED</option></select></label><label>Phase<select name="operationalPhase" defaultValue={active.operationalPhase}><option>READINESS</option><option>RESPONSE</option><option>STABILIZATION</option><option>RECOVERY</option></select></label></div><div className="form-pair"><label>Severity<select name="severity" defaultValue={active.severity}><option>UNASSESSED</option><option>LOW</option><option>MODERATE</option><option>HIGH</option><option>CRITICAL</option></select></label><label>Command lead<input name="commandLead" defaultValue={active.commandLead} /></label></div><label>Operational notes<textarea name="operationalNotes" rows="4" defaultValue={active.operationalNotes} /></label><label>Reason for this change<input name="reason" required placeholder="Required for the audit trail" /></label><button type="submit">Record state change</button></form><div className="incident-links"><h3>Linked operating picture</h3>{[['Hazards', active.linkedHazards], ['Alerts', active.linkedAlerts], ['Help requests', active.linkedHelpRequests], ['Assignments', active.linkedResponderAssignments], ['Resources', active.linkedResources], ['Road restrictions', active.linkedRoadRestrictions], ['Evidence reports', active.linkedEvidenceReports]].map(([label, items]) => <div key={label}><span>{label}</span><strong>{items?.length || 0}</strong></div>)}<RecordLinker incident={active} onLink={(payload) => act('incident-link', payload, 'Record linked to the active incident.')} /></div></div></section>}
  </>;
}

export function RecordAudit({ recordId }) {
  const { data } = useOperations();
  const events = data.auditEvents.filter((item) => item.recordId === recordId).sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  if (!events.length) return null;
  return <details className="record-audit"><summary><ClockCounterClockwise /> Complete operational history <span>{events.length}</span></summary><ol>{events.map((item) => <li key={item.id}><i /><div><span>{item.kind}</span><strong>{readable(item.resultingState || item.action)}</strong><small>{item.actorName} · {time(item.timestamp)}</small>{item.reason && <p>{item.reason}</p>}</div></li>)}</ol></details>;
}

export function AuditTrailView() {
  const { data } = useOperations();
  const [kind, setKind] = useState('ALL');
  const [incident, setIncident] = useState('ALL');
  const visible = useMemo(() => data.auditEvents.filter((item) => (kind === 'ALL' || item.kind === kind) && (incident === 'ALL' || item.incidentId === incident)), [data.auditEvents, kind, incident]);
  return <><div className="page-intro"><div><span className="module-code">NAVIRA / AUDIT</span><h1>Every operational transition, in order.</h1></div><p>The application exposes this server-created history as read-only. Actions retain actor, role, record, incident, previous state, resulting state, reason, source, and server time.</p></div><section className="audit-controls"><label>Action origin<select value={kind} onChange={(event) => setKind(event.target.value)}><option>ALL</option><option>SYSTEM_EVENT</option><option>CIVILIAN_ACTION</option><option>RESPONDER_ACTION</option><option>OPERATOR_ACTION</option></select></label><label>Incident<select value={incident} onChange={(event) => setIncident(event.target.value)}><option>ALL</option>{data.incidents.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><strong>{visible.length} immutable events</strong></section><section className="audit-ledger">{visible.length ? visible.map((item) => <article key={item.id} className={`audit-event audit-event--${item.kind.toLowerCase()}`}><time>{time(item.timestamp)}</time><i /><div><span>{item.kind} / {readable(item.recordType)}</span><h2>{readable(item.action)}</h2><p>{item.actorName} · {readable(item.resultingState || 'recorded')}</p>{item.reason && <blockquote>{item.reason}</blockquote>}<small>Record {item.recordId}{item.incidentId ? ` · Incident ${item.incidentId}` : ''} · {item.source}</small></div></article>) : <div className="operation-empty"><strong>No matching audit events</strong><p>Events appear when authenticated users and NAVIRA services change operational state.</p></div>}</section></>;
}
