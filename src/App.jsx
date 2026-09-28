import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, Navigate, Route, Routes, useParams } from 'react-router-dom';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { DotGlobe } from 'dot-globe';
import {
  ArrowRight, ArrowSquareOut, BellRinging, Broadcast, CaretRight, ChartBar,
  ClockCounterClockwise, Database, Flask, ListBullets,
  MapTrifold, NewspaperClipping, Package, Path as RouteIcon, ShieldCheck,
  SignOut, Siren, SpinnerGap, Scroll, UserFocus, UsersThree, WarningCircle, X,
} from '@phosphor-icons/react';
import LiveMap from './LiveMap';
import { useLiveData } from './liveData';
import BrandMark from './BrandMark';
import CivilianSafety from './CivilianSafety';
import LoginPage from './LoginPage';
import { useAuth } from './auth';
import { useOperations } from './operationsData';
import LocationFilter from './LocationFilter';
import { eventDistanceKm } from './geo';
import {
  DispatchView, EvacuationView, InfrastructureView, LocalOperationsMap,
  RequestsView, ResourcesView, SimulationView,
} from './OperationsViews';
import { AuditTrailView, IncidentRibbon, IncidentsView } from './OperationalContextViews';

gsap.registerPlugin(ScrollTrigger);

function navigationFor(role) {
  const understand = role === 'operator'
    ? [['command', 'Response chain', Broadcast], ['incidents', 'Command incidents', Siren], ['events', 'Verified events', ListBullets], ['timeline', 'Source timeline', ClockCounterClockwise], ['audit', 'Audit trail', Scroll], ['analytics', 'Location analysis', ChartBar], ['news', 'News context', NewspaperClipping]]
    : [['command', 'Response chain', Broadcast], ['map', 'Live disaster map', MapTrifold], ['events', 'Verified events', ListBullets], ['timeline', 'Source timeline', ClockCounterClockwise], ['analytics', 'Location analysis', ChartBar], ['news', 'News context', NewspaperClipping]];
  const protect = role === 'operator'
    ? [['local-map', 'People + hazards', MapTrifold], ['requests', 'Help requests', UserFocus], ['evacuation', 'Escape routes', RouteIcon], ['dispatch', 'Responder dispatch', UsersThree], ['resources', 'Resource coordination', Package]]
    : [['local-map', 'Near you', MapTrifold], ['requests', 'Request help', UserFocus], ['evacuation', 'Escape routes', RouteIcon]];
  return [
    { label: '01 / Understand', items: understand },
    { label: '02 / Protect', items: protect },
    ...(role === 'operator' ? [{ label: '03 / Test', items: [['simulation', 'Simulation lab', Flask]] }] : []),
  ];
}

const PAGE_COPY = {
  command: ['One disaster record. One response chain.', 'Understand the published event, identify people at risk, coordinate action, and carry the same evidence into infrastructure testing.'],
  map: ['Live geographic picture', 'Source-native geometry on a navigable, correctly proportioned world map.'],
  events: ['Event ledger', 'Every row comes directly from NASA EONET, GDACS, or USGS.'],
  timeline: ['Source chronology', 'A time-ordered record built only from timestamps published by the upstream sources.'],
  analytics: ['Observed event analysis', 'Counts describe the records currently returned by the connected sources.'],
  news: ['Reporting context', 'Official event bulletins and event-linked reporting stay clearly separated by source and verification status.'],
};

function formatTime(value, { short = false } = {}) {
  if (!value) return 'Data unavailable';
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return 'Data unavailable';
  return new Intl.DateTimeFormat('en', short
    ? { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC', timeZoneName: 'short' }
    : { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(date);
}

function coordinateText(event) {
  if (!event?.coordinates) return event?.geometryKind ? `${event.geometryKind} geometry · single coordinate unavailable` : 'Data unavailable';
  return `${event.coordinates[1].toFixed(4)}°, ${event.coordinates[0].toFixed(4)}°`;
}

function eventTone(event) {
  if (event?.severityLevel === 'red') return 'critical';
  if (event?.severityLevel === 'orange') return 'watch';
  if (event?.severityLevel === 'green') return 'stable';
  return 'neutral';
}

function SourceBadge({ source }) {
  return <span className={`source-badge source-badge--${source?.id || 'unknown'}`}>{source?.name || 'Data unavailable'}</span>;
}

function LoadingState({ label = 'Connecting to live sources' }) {
  return <div className="state-panel"><SpinnerGap className="spin" size={24} /><strong>{label}</strong></div>;
}

function FailureState({ title = 'Live data unavailable', message, onRetry }) {
  return <div className="state-panel state-panel--error"><WarningCircle size={26} /><div><strong>{title}</strong><p>{message || 'The source request did not return usable data.'}</p></div>{onRetry && <button className="text-button" onClick={onRetry}>Retry connection <ArrowRight /></button>}</div>;
}

function SourceRail({ sources, generatedAt, compact = false, reveal = false }) {
  return (
    <section className={`source-rail ${compact ? 'source-rail--compact' : ''} ${reveal ? 'source-rail--reveal' : ''}`} aria-label="Live source freshness">
      <div className="source-rail__intro"><Database size={19} /><div><strong>Source condition</strong><span>Retrieved {formatTime(generatedAt, { short: true })}</span></div></div>
      {sources.map((source, index) => <a href={source.href} target="_blank" rel="noreferrer" key={source.id} className="source-rail__source" style={reveal ? { '--source-index': index } : undefined}><i className={source.status === 'available' ? 'is-live' : 'is-down'} /><div><strong>{source.name}</strong><span>{source.status === 'available' ? `${source.count} records · fetched ${formatTime(source.fetchedAt, { short: true })}` : `Upstream feed did not respond · checked ${formatTime(source.fetchedAt, { short: true })}`}</span></div><ArrowSquareOut size={15} /></a>)}
    </section>
  );
}

function EventList({ events, selectedEvent, onSelect, limit }) {
  const visible = limit ? events.slice(0, limit) : events;
  if (!visible.length) return <div className="empty-data"><strong>No current source records returned</strong><span>Check Source condition for the retrieval status of NASA EONET, GDACS, and USGS.</span></div>;
  return <div className="event-list">{visible.map((event) => <button type="button" key={event.id} className={selectedEvent?.id === event.id ? 'is-selected' : ''} onClick={() => onSelect(event)}><i className={`event-signal event-signal--${eventTone(event)}`} /><span className="event-list__main"><strong>{event.title}</strong><small>{event.type} · {formatTime(event.timestamp, { short: true })}</small></span><SourceBadge source={event.source} /><CaretRight size={17} /></button>)}</div>;
}

function EventDetail({ event, onClose, className = '' }) {
  const { notices } = useLiveData();
  if (!event) return <div className={`event-detail event-detail--empty ${className}`}><CrosshairGlyph /><strong>Select a source record</strong><p>Choose a point, line, boundary, or ledger row to inspect published facts.</p></div>;
  return (
    <aside className={`event-detail ${className}`} aria-label="Selected event details">
      {onClose && <button className="event-detail__close" onClick={onClose} aria-label="Close details"><X /></button>}
      <div className="event-detail__head"><SourceBadge source={event.source} /><span className={`record-status record-status--${eventTone(event)}`}>{event.status}</span></div>
      <h3>{event.title}</h3><p className="event-detail__description">{event.description || 'Data unavailable'}</p>
      <dl><div><dt>Type</dt><dd>{event.type}</dd></div><div><dt>Severity</dt><dd>{event.severity}</dd></div><div><dt>Published</dt><dd>{formatTime(event.timestamp)}</dd></div><div><dt>Updated</dt><dd>{formatTime(event.updatedAt)}</dd></div><div><dt>Coordinates</dt><dd>{coordinateText(event)}</dd></div><div><dt>Geometry</dt><dd>{event.geometryKind || 'Data unavailable'}</dd></div><div><dt>Country</dt><dd>{event.country || 'Data unavailable'}</dd></div><div><dt>AI summary</dt><dd>{notices.aiSummary || 'Data unavailable'}</dd></div><div><dt>Source record</dt><dd>{event.sourceEventId}</dd></div></dl>
      <div className="event-detail__links"><a href={event.sourceUrl} target="_blank" rel="noreferrer">Open agency record <ArrowSquareOut /></a>{event.sourceLinks.slice(0, 2).map((link) => <a key={link.href} href={link.href} target="_blank" rel="noreferrer">{link.name} <ArrowSquareOut /></a>)}</div>
      <p className="event-detail__notice"><ShieldCheck /> Values are displayed as published. Missing fields are not inferred.</p>
    </aside>
  );
}

function CrosshairGlyph() {
  return <span className="crosshair-glyph" aria-hidden="true"><i /><b /></span>;
}

function ResponseGlobe() {
  const globe = useRef(null);
  useEffect(() => {
    const node = globe.current;
    const section = node?.closest('.response-system');
    if (!node || !section || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;

    gsap.set(node, { transformPerspective: 1000, transformOrigin: '60% 50%' });
    const tiltX = gsap.quickTo(node, 'rotationX', { duration: .9, ease: 'power3.out' });
    const tiltY = gsap.quickTo(node, 'rotationY', { duration: .9, ease: 'power3.out' });
    const handlePointerMove = (event) => {
      const bounds = section.getBoundingClientRect();
      const x = ((event.clientX - bounds.left) / bounds.width) - .5;
      const y = ((event.clientY - bounds.top) / bounds.height) - .5;
      tiltX(y * -5);
      tiltY(x * 7);
    };
    const resetTilt = () => { tiltX(0); tiltY(0); };

    section.addEventListener('pointermove', handlePointerMove, { passive: true });
    section.addEventListener('pointerleave', resetTilt);
    return () => {
      section.removeEventListener('pointermove', handlePointerMove);
      section.removeEventListener('pointerleave', resetTilt);
    };
  }, []);

  return <div ref={globe} className="response-globe" aria-hidden="true"><DotGlobe className="response-globe__canvas" backgroundOpacity={0} rotationSpeed={0.0002} tilt={[15, -10]} width="100%" height="100%" /></div>;
}

function HeroEventPanel({ event }) {
  const [displayedEvent, setDisplayedEvent] = useState(event);
  const [motionState, setMotionState] = useState('');
  const displayedRef = useRef(event);
  const latestRef = useRef(event);

  useEffect(() => {
    latestRef.current = event;
    const current = displayedRef.current;

    if (!event) {
      displayedRef.current = null;
      setDisplayedEvent(null);
      setMotionState('');
      return undefined;
    }

    if (!current) {
      displayedRef.current = event;
      setDisplayedEvent(event);
      setMotionState('is-entering');
      let settleFrame;
      const enterFrame = window.requestAnimationFrame(() => {
        settleFrame = window.requestAnimationFrame(() => setMotionState(''));
      });
      return () => {
        window.cancelAnimationFrame(enterFrame);
        window.cancelAnimationFrame(settleFrame);
      };
    }

    if (current.id === event.id) return undefined;

    setMotionState('is-exiting');
    let enterFrame;
    let settleFrame;
    const switchDelay = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 100 : 130;
    const timer = window.setTimeout(() => {
      const next = latestRef.current;
      displayedRef.current = next;
      setDisplayedEvent(next);
      setMotionState('is-entering');
      enterFrame = window.requestAnimationFrame(() => {
        settleFrame = window.requestAnimationFrame(() => setMotionState(''));
      });
    }, switchDelay);
    return () => {
      window.clearTimeout(timer);
      window.cancelAnimationFrame(enterFrame);
      window.cancelAnimationFrame(settleFrame);
    };
  }, [event?.id]);

  if (!displayedEvent) return null;
  return <div className={`hero-event ${motionState}`}><SourceBadge source={displayedEvent.source} /><strong>{displayedEvent.title}</strong><span>{displayedEvent.type} · {formatTime(displayedEvent.timestamp, { short: true })}</span><Link to="/login">Sign in to inspect <ArrowRight /></Link></div>;
}

function Landing() {
  const root = useRef(null);
  const { data, events, sources, loading, error, selectedEvent, selectEvent, refresh } = useLiveData();
  useGSAP(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) {
      ['.response-flow__track', '.trust-rules'].forEach((selector) => {
        gsap.from(`${selector} article`, {
          opacity: .7,
          duration: .1,
          ease: 'none',
          scrollTrigger: { trigger: selector, start: 'top 75%', once: true },
        });
      });
      return;
    }
    const enter = gsap.timeline({ defaults: { ease: 'power3.out' } });
    enter.from('.hero-signal', { opacity: 0, y: 14, duration: .5 })
      .from('.hero-primary h1 span', { opacity: 0, yPercent: 28, duration: .68, stagger: .06 }, .1)
      .from('.hero-primary__body, .hero-actions', { opacity: 0, y: 16, duration: .44, stagger: .06 }, .32)
      .from('.decision-cell', { opacity: 0, y: 12, duration: .36, stagger: .05 }, .48)
      .from('.hero-map-shell', { opacity: .2, x: 18, duration: .66 }, .16);

    gsap.utils.toArray('.section-reveal').forEach((section) => gsap.from(section, {
      opacity: 0,
      y: 34,
      duration: .7,
      ease: 'power3.out',
      scrollTrigger: { trigger: section, start: 'top 84%', once: true },
    }));

    ScrollTrigger.matchMedia({
      '(min-width: 981px)': () => {
        const steps = gsap.utils.toArray('.response-step');
        steps.forEach((step, index) => gsap.from(step, {
          x: index % 2 ? 24 : -24,
          scrollTrigger: { trigger: step, start: 'top 78%', end: 'top 48%', scrub: true },
        }));
      },
    });

    gsap.from('.response-flow__track article', {
      opacity: 0,
      y: 10,
      duration: .26,
      stagger: .07,
      ease: 'power3.out',
      scrollTrigger: { trigger: '.response-flow__track', start: 'top 75%', once: true },
    });

    gsap.from('.trust-rules article', {
      opacity: 0,
      y: 12,
      duration: .26,
      stagger: .055,
      ease: 'power3.out',
      scrollTrigger: { trigger: '.trust-rules', start: 'top 75%', once: true },
    });
  }, { scope: root });
  return (
    <main ref={root} className="landing-shell">
      <header className="landing-nav">
        <Link to="/" aria-label="NAVIRA home"><BrandMark /></Link>
        <nav aria-label="Public navigation"><a href="#understand">Understand</a><a href="#protect">Protect</a><a href="#test">Test</a></nav>
        <div><span className="live-word"><i /> LIVE DATA</span><Link className="landing-signin" to="/login">Sign in</Link><Link className="button button--dark" to="/login?role=civilian">Open NAVIRA <ArrowRight /></Link></div>
      </header>

      <section className="hero-civic" id="understand" aria-labelledby="hero-title">
        <div className="hero-primary">
          <div className="hero-primary__copy">
            <p className="hero-signal"><i /> {events.length ? `${events.length} current source records` : 'Connecting to disaster sources'}</p>
            <h1 id="hero-title"><span>Understand the disaster.</span><span>Protect what matters.</span></h1>
            <p className="hero-primary__body">NAVIRA carries a verified disaster record from detection to civilian escape, operator response, and infrastructure testing—without inventing what the sources do not know.</p>
            <div className="hero-actions"><Link className="button button--signal" to="/login?role=civilian">Enter civilian safety <ArrowRight /></Link><Link className="button button--ghost" to="/login?role=operator">Government operator access</Link></div>
          </div>
          <div className="decision-strip">
            <div className="decision-cell"><b>01 / UNDERSTAND</b><strong>What is happening?</strong><span>Read live source geography, severity, time, and status.</span></div>
            <div className="decision-cell"><b>02 / PROTECT</b><strong>Who is at risk?</strong><span>Check verified danger areas, escape routes, and requests for help.</span></div>
            <div className="decision-cell"><b>03 / TEST</b><strong>What can withstand it?</strong><span>Run honest infrastructure scenarios against the same hazard context.</span></div>
          </div>
        </div>
        <div className="hero-map-shell">
          {loading ? <LoadingState /> : error ? <FailureState message={error} onRetry={refresh} /> : <LiveMap events={events} selectedEvent={selectedEvent} onSelect={selectEvent} variant="hero" />}
          <div className="hero-map__label"><span><i /> LIVE GEOGRAPHY</span><b>MapLibre · OpenStreetMap</b></div>
          <HeroEventPanel event={selectedEvent} />
        </div>
      </section>
      <SourceRail sources={sources} generatedAt={data?.generatedAt} reveal />

      <section className="civilian-brief section-reveal" id="protect" aria-labelledby="civilian-title">
        <div><span className="section-index">RESPONSE / CONTINUITY</span><h2 id="civilian-title">One verified event should move all the way to action.</h2></div>
        <div className="civilian-brief__body"><p>NAVIRA starts with NASA EONET, GDACS, and USGS records, preserves their geography and source time, then checks whether a person’s shared location intersects an available warning area.</p><p>When the evidence qualifies, the same record can open escape routing, a help request, operator dispatch, resource allocation, and an infrastructure scenario. Missing facts remain explicit.</p></div>
      </section>

      <section className="response-system" id="test" aria-labelledby="response-title">
        <ResponseGlobe />
        <div className="response-system__lead section-reveal"><span className="section-index">SYSTEM / THREE PILLARS</span><h2 id="response-title">Three connected pillars. One disaster record.</h2></div>
        <div className="response-steps">
          <article className="response-step response-step--understand"><b>01 / UNDERSTAND</b><h3>Detect and read the disaster.</h3><p>NASA EONET, GDACS, and USGS records retain their real geometry, timestamps, severity, source links, timeline, and reporting context.</p><Link to="/login">Open disaster intelligence <ArrowRight /></Link></article>
          <article className="response-step response-step--protect"><b>02 / PROTECT</b><h3>Find risk and move people.</h3><p>Near You checks consented coordinates against verified geometry, then connects escape routing and help requests to dispatch and resources.</p><Link to="/login?role=civilian">Enter civilian safety <ArrowRight /></Link></article>
          <article className="response-step response-step--test"><b>03 / TEST</b><h3>Stress infrastructure before the next event.</h3><p>Import mapped infrastructure or build a structure, apply controlled hazard scenarios, and compare simulated response without claiming an engineering verdict.</p><Link to="/login?role=operator">Open infrastructure lab <ArrowRight /></Link></article>
        </div>
      </section>

      <section className="response-flow section-reveal" aria-labelledby="flow-title">
        <div className="response-flow__title"><span className="section-index">RESPONSE / CHAIN</span><h2 id="flow-title">Disaster happens. Evidence moves. Action follows.</h2></div>
        <div className="response-flow__track">
          <article><b>01</b><h3>Detect</h3><p>Authoritative feeds publish the event and its available geography.</p></article>
          <article><b>02</b><h3>Understand</h3><p>NAVIRA preserves source identity, time, severity, geometry, and status.</p></article>
          <article><b>03</b><h3>Identify risk</h3><p>Consented locations are checked against source-supplied warning areas.</p></article>
          <article><b>04</b><h3>Protect</h3><p>Qualified civilians can route, request help, and connect to operators.</p></article>
          <article><b>05</b><h3>Test</h3><p>The hazard can inform transparent infrastructure simulation scenarios.</p></article>
        </div>
      </section>

      <section className="live-ledger section-reveal"><div className="live-ledger__title"><span className="section-index">04 / CURRENT RECORDS</span><h2>Each marker has a source behind it.</h2><p>Select a current record to carry it into the live map. NAVIRA does not rewrite missing facts.</p></div><div className="live-ledger__content"><EventList events={events} selectedEvent={selectedEvent} onSelect={selectEvent} limit={6} /><Link to="/login" className="ledger-link">Sign in to inspect every record <ArrowRight /></Link></div></section>

      <section className="trust-system" id="sources" aria-labelledby="trust-title">
        <div className="trust-system__lead"><span className="section-index">05 / DATA TRUST</span><h2 id="trust-title">Know what is live. Know what is missing.</h2></div>
        <div className="trust-rules"><article><ShieldCheck /><h3>Agency records stay separate from reporting.</h3><p>GDACS news adds context, but it is never presented as verified incident fact.</p></article><article><MapTrifold /><h3>Geography keeps its real proportions.</h3><p>MapLibre renders OpenStreetMap-based geography with real zooming, panning, labels, and source-native geometry.</p></article><article><Database /><h3>Operational records identify their origin.</h3><p>Locations require consent. Stock and assignments identify operator input. Official orders require an authority feed. Simulation outputs remain simulation.</p></article></div>
      </section>

      <section className="landing-action section-reveal"><div><span className="section-index">LIVE RESPONSE MAP</span><h2>Choose the workspace that matches your responsibility.</h2></div><Link className="button button--paper" to="/login">Sign in to NAVIRA <ArrowRight /></Link></section>
      <footer className="landing-footer"><BrandMark /><span>Disaster data: NASA EONET · GDACS · USGS</span><span>Geography: OpenFreeMap · OpenStreetMap</span><Link to="/login">Workspace access <ArrowRight /></Link></footer>
    </main>
  );
}

function SideNavigation({ open, onClose }) {
  const { profile, signOut } = useAuth(); const groups = navigationFor(profile.role);
  return <><button className={`nav-backdrop ${open ? 'is-visible' : ''}`} onClick={onClose} aria-label="Close navigation" /><aside className={`side-navigation ${open ? 'is-open' : ''}`} aria-label="Mobile workspace navigation"><div className="side-navigation__brand"><Link to="/"><BrandMark /></Link><button onClick={onClose} aria-label="Close navigation"><X /></button></div><div className="navigation-identity"><span>{profile.role}</span><strong>{profile.name}</strong><small>{profile.organization || profile.email}</small></div><nav>{groups.map((group) => <div className="nav-cluster" key={group.label}><span>{group.label}</span>{group.items.map(([id, label, Icon]) => <NavLink key={id} to={`/app/${id}`} onClick={onClose}><Icon /><b>{label}</b></NavLink>)}</div>)}</nav><button className="navigation-signout" type="button" onClick={signOut}><SignOut /> Sign out</button><div className="side-navigation__foot"><i /><span><strong>LIVE SOURCES</strong><small>NASA · GDACS · USGS</small></span></div></aside></>;
}

function ModuleNavigation() {
  const { profile, signOut } = useAuth(); const groups = navigationFor(profile.role);
  return <aside className="module-navigation"><Link className="module-navigation__brand" to="/" aria-label="NAVIRA home"><BrandMark /></Link><div className="navigation-identity"><span>{profile.role}</span><strong>{profile.name}</strong><small>{profile.organization || profile.email}</small></div><nav aria-label="Workspace modules">{groups.map((group) => <div className="module-group" key={group.label}><span>{group.label}</span>{group.items.map(([id, label, Icon]) => <NavLink key={id} to={`/app/${id}`}><Icon /><b>{label}</b></NavLink>)}</div>)}</nav><button className="navigation-signout" type="button" onClick={signOut}><SignOut /> Sign out</button><div className="module-navigation__foot"><i /><span><strong>LIVE SOURCES</strong><small>NASA · GDACS · USGS</small></span></div></aside>;
}

function WorkspaceHeader({ onMenu }) {
  const { data, loading, refresh } = useLiveData();
  const { profile } = useAuth();
  return <><header className="workspace-header"><div className="workspace-header__brand"><button className="menu-button" onClick={onMenu} aria-label="Open navigation"><span /><span /></button><Link to="/" aria-label="NAVIRA home"><BrandMark /></Link></div><p>{profile.role === 'operator' ? `${profile.organization || 'Government'} response workspace` : 'Civilian safety workspace'}</p><button className="refresh-button" disabled={loading} onClick={refresh}>{loading ? <SpinnerGap className="spin" /> : <Broadcast />}<span>Refresh sources</span></button></header><div className="freshness-bar"><span key={data?.generatedAt || 'pending'} className="freshness-live"><i /> LIVE DATA</span><b>Last NAVIRA retrieval</b><time>{formatTime(data?.generatedAt, { short: true })}</time><small>Every record retains its source time</small><button className="freshness-refresh" disabled={loading} onClick={refresh}>{loading ? <SpinnerGap className="spin" /> : <Broadcast />}<span>Refresh</span></button></div></>;
}

function CivilianAlertBar() {
  const { profile } = useAuth();
  const { data, mutate } = useOperations();
  const unread = data.notifications.filter((item) => item.status === 'unread');
  if (profile.role !== 'civilian' || !unread.length) return null;
  const alert = unread[0];
  const markRead = () => mutate('notification-read', { id: alert.id }).catch(() => {});
  return <aside className="civilian-alert-bar" role="status"><BellRinging /><div><span>OPERATOR-REVIEWED REPORT NEAR YOUR LOCATION</span><strong>{alert.title}</strong><p>{alert.message}</p><small>{alert.provenance}</small></div><div><Link to={`/safety?event=${encodeURIComponent(alert.eventId)}`} onClick={markRead}>Check safety routes <ArrowRight /></Link><button type="button" onClick={markRead}>Mark read</button>{unread.length > 1 && <small>+{unread.length - 1} more</small>}</div></aside>;
}

function PageIntro({ view }) {
  const copy = PAGE_COPY[view] || ['Operational module', 'Authoritative data is required before this module can be used.'];
  return <div className="page-intro"><div><span className="module-code">NAVIRA / {view.toUpperCase()}</span><h1>{copy[0]}</h1></div><p>{copy[1]}</p></div>;
}

function CommandView() {
  const { events, selectedEvent, selectEvent } = useLiveData();
  const { profile } = useAuth();
  const { data } = useOperations();
  const activeRequests = data.helpRequests.filter((item) => item.status !== 'resolved').length;
  const activeDispatches = data.dispatches.filter((item) => !['complete', 'resolved'].includes(item.status)).length;
  const testRecords = data.infrastructure.length + data.simulations.length;
  return <><PageIntro view="command" /><section className="command-chain" aria-label="NAVIRA response chain"><article><span>01 / UNDERSTAND</span><strong>{events.length}</strong><p>current verified source records</p><Link to="/app/map">Open live picture <ArrowRight /></Link></article><article><span>02 / PROTECT</span><strong>{activeRequests + data.evacuations.length + activeDispatches}</strong><p>{activeRequests} active requests · {data.evacuations.length} shared routes · {activeDispatches} active dispatches</p><Link to="/app/local-map">Open protection flow <ArrowRight /></Link></article><article><span>03 / TEST</span><strong>{testRecords}</strong><p>{data.infrastructure.length} recorded assets · {data.simulations.length} saved simulations</p>{profile.role === 'operator' ? <Link to="/app/simulation">Open simulation lab <ArrowRight /></Link> : <small>Operator workspace</small>}</article></section><div className="command-layout"><div className="command-layout__map"><LiveMap events={events} selectedEvent={selectedEvent} onSelect={selectEvent} variant="command" /></div><div className="command-layout__rail"><div className="rail-title"><span>LIVE QUEUE</span><b>{events.length} source records</b></div><EventList events={events} selectedEvent={selectedEvent} onSelect={selectEvent} limit={12} /></div><EventDetail key={selectedEvent?.id || 'empty'} event={selectedEvent} /></div></>;
}

function MapView() {
  const { events, selectedEvent, selectEvent } = useLiveData();
  const [detail, setDetail] = useState(true);
  const [detailClosing, setDetailClosing] = useState(false);
  const closeTimer = useRef(null);
  useEffect(() => () => window.clearTimeout(closeTimer.current), []);
  const openDetail = (event) => {
    window.clearTimeout(closeTimer.current);
    setDetailClosing(false);
    setDetail(true);
    selectEvent(event);
  };
  const closeDetail = () => {
    setDetailClosing(true);
    closeTimer.current = window.setTimeout(() => {
      setDetail(false);
      setDetailClosing(false);
    }, 220);
  };
  return <><PageIntro view="map" /><div className="map-workspace"><LiveMap events={events} selectedEvent={selectedEvent} onSelect={openDetail} variant="full" />{detail && <EventDetail key={selectedEvent?.id || 'empty'} event={selectedEvent} className={detailClosing ? 'event-detail--closing' : ''} onClose={closeDetail} />}</div></>;
}

function LedgerView() {
  const { events, selectedEvent, selectEvent } = useLiveData();
  return <><PageIntro view="events" /><div className="ledger-layout"><EventList events={events} selectedEvent={selectedEvent} onSelect={selectEvent} /><EventDetail key={selectedEvent?.id || 'empty'} event={selectedEvent} /></div></>;
}

function TimelineView() {
  const { events, selectEvent } = useLiveData();
  return <><PageIntro view="timeline" /><div className="timeline-records">{events.length ? events.map((event) => <button key={event.id} onClick={() => selectEvent(event)}><time>{formatTime(event.timestamp)}</time><i className={`event-signal event-signal--${eventTone(event)}`} /><div><SourceBadge source={event.source} /><strong>{event.title}</strong><span>{event.type} · {event.status}</span></div><ArrowRight /></button>) : <div className="empty-data"><strong>No source chronology was returned</strong><span>The timeline is built directly from NASA EONET, GDACS, and USGS timestamps. Refresh the feeds or inspect Source condition to see which upstream service did not respond.</span></div>}</div></>;
}

function AnalyticsView() {
  const { events, sources } = useLiveData();
  const [location, setLocation] = useState(null); const [radiusKm, setRadiusKm] = useState(500);
  const visibleEvents = useMemo(() => location ? events.filter((event) => {
    const distance = eventDistanceKm(location, event); return Number.isFinite(distance) && distance <= radiusKm;
  }) : events, [events, location, radiusKm]);
  const byType = useMemo(() => Object.entries(visibleEvents.reduce((acc, event) => ({ ...acc, [event.type]: (acc[event.type] || 0) + 1 }), {})).sort((a, b) => b[1] - a[1]), [visibleEvents]);
  const max = Math.max(1, ...byType.map(([, count]) => count));
  const sourceCount = (id) => visibleEvents.filter((event) => event.source.id === id).length;
  return <><PageIntro view="analytics" /><LocationFilter value={location} radiusKm={radiusKm} onChange={setLocation} onRadiusChange={setRadiusKm} /><div className="analytics-scope"><strong>{visibleEvents.length}</strong><span>published records {location ? `within ${radiusKm.toLocaleString()} km of ${location.label}` : 'worldwide'}</span></div><section className="analytics-sheet"><div className="analytics-sheet__sources"><h2>Records by source</h2>{sources.map((source) => <div key={source.id}><SourceBadge source={source} /><strong>{source.status === 'available' ? sourceCount(source.id) : 'Feed unavailable'}</strong><span>{source.status === 'available' ? 'Fetched' : 'Last checked'} {formatTime(source.fetchedAt)}</span></div>)}</div><div className="analytics-sheet__types"><h2>Published event types</h2>{byType.length ? byType.map(([type, count]) => <div className="type-bar" key={type}><span>{type}</span><i><b style={{ width: `${(count / max) * 100}%` }} /></i><strong>{count}</strong></div>) : <div className="empty-data"><strong>No records in this area</strong><span>Try a wider analysis radius.</span></div>}<p>Location filtering measures each record’s published geometry against the selected place. Counts do not estimate impact, people affected, or risk.</p></div></section></>;
}

function NewsView() {
  const { events, selectedEvent, selectEvent } = useLiveData();
  const [location, setLocation] = useState(null); const [radiusKm, setRadiusKm] = useState(500);
  const gdacsEvents = useMemo(() => events.filter((event) => event.gdacsKey).filter((event) => {
    if (!location) return true; const distance = eventDistanceKm(location, event); return Number.isFinite(distance) && distance <= radiusKm;
  }), [events, location, radiusKm]);
  const active = selectedEvent?.gdacsKey && gdacsEvents.some((event) => event.id === selectedEvent.id) ? selectedEvent : gdacsEvents[0];
  const [state, setState] = useState({ loading: false, data: null, error: null }); const [reloadToken, setReloadToken] = useState(0);
  useEffect(() => {
    if (!active?.gdacsKey) { setState({ loading: false, data: null, error: null }); return; }
    const params = new URLSearchParams({ eventtype: active.gdacsKey.eventtype, eventid: active.gdacsKey.eventid });
    let current = true;
    setState({ loading: true, data: null, error: null });
    fetch(`/api/gdacs-news?${params}`, { cache: 'no-store' }).then(async (response) => { if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.error || `Reporting request failed (${response.status})`); } return response.json(); }).then((data) => current && setState({ loading: false, data, error: null })).catch((error) => current && setState({ loading: false, data: null, error: error.message }));
    return () => { current = false; };
  }, [active?.id, reloadToken]);
  const sourceSummary = state.data?.sources?.map((source) => `${source.name}: ${source.status === 'available' ? `${source.count} reports` : 'temporarily unavailable'}`).join(' · ');
  return <><PageIntro view="news" /><LocationFilter value={location} radiusKm={radiusKm} onChange={setLocation} onRadiusChange={setRadiusKm} label="Filter reporting by location" /><div className="news-layout"><aside><span>GDACS EVENTS · {gdacsEvents.length}</span>{gdacsEvents.map((event) => <button className={active?.id === event.id ? 'is-selected' : ''} key={event.id} onClick={() => selectEvent(event)}><strong>{event.title}</strong><small>{event.country || event.type} · {formatTime(event.timestamp, { short: true })}</small></button>)}</aside><section className="news-feed"><div className="news-feed__warning"><NewspaperClipping /><div><strong>Reporting context for {active?.title || 'the selected area'}</strong><span>Verified GDACS records and indexed media reporting are labeled separately. Media articles are context, not agency-verified incident facts.</span></div></div>{!active ? <div className="empty-data"><strong>No GDACS event in this area</strong><span>Clear the location or widen the radius to inspect other reporting.</span></div> : state.loading ? <LoadingState label="Loading event-linked reporting" /> : state.error ? <FailureState title="Reporting feed unavailable" message={state.error} onRetry={() => setReloadToken((value) => value + 1)} /> : state.data?.items?.length ? <>{state.data.items.map((item) => <article key={item.id}><div><span>{item.classification} · {item.publisher} · {item.indexSource}</span><time>{formatTime(item.publishedAt, { short: true })}</time></div><h2>{item.title}</h2><p>{item.description || 'No description was supplied by the indexed report.'}</p>{item.href && <a href={item.href} target="_blank" rel="noreferrer">{item.classification === 'Verified agency event record' ? 'Open official event record' : 'Read at original publisher'} <ArrowSquareOut /></a>}</article>)}<small className="feed-freshness">{state.data?.notice} {sourceSummary} · retrieved {formatTime(state.data.fetchedAt)}</small></> : <><div className="empty-data"><strong>No indexed reporting returned</strong><span>{state.data?.notice || 'The verified event remains available in the event ledger.'}</span></div>{sourceSummary && <small className="feed-freshness">{sourceSummary} · checked {formatTime(state.data?.fetchedAt)}</small>}</>}</section></div></>;
}

function WorkspacePage() {
  const { view = 'command' } = useParams();
  const { profile } = useAuth();
  const { data, sources, loading, error, refresh } = useLiveData();
  if (loading && !data) return <div className="workspace-state"><BrandMark /><LoadingState /></div>;
  if (error && !data) return <div className="workspace-state"><BrandMark /><FailureState message={error} onRetry={refresh} /></div>;
  if (profile.role !== 'operator' && ['incidents', 'audit', 'dispatch', 'resources', 'infrastructure', 'simulation'].includes(view)) return <Navigate to="/app/local-map" replace />;
  let content;
  if (view === 'command') content = <CommandView />; else if (view === 'incidents') content = <IncidentsView />; else if (view === 'audit') content = <AuditTrailView />; else if (view === 'map') content = <MapView />; else if (view === 'events') content = <LedgerView />; else if (view === 'timeline') content = <TimelineView />; else if (view === 'analytics') content = <AnalyticsView />; else if (view === 'news') content = <NewsView />; else if (view === 'local-map') content = <LocalOperationsMap />; else if (view === 'requests') content = <RequestsView />; else if (view === 'evacuation') content = <EvacuationView />; else if (view === 'dispatch') content = <DispatchView />; else if (view === 'resources') content = <ResourcesView />; else if (view === 'infrastructure') content = <InfrastructureView />; else if (view === 'simulation') content = <SimulationView />; else return <Navigate to="/app/command" replace />;
  return <><main className="workspace-main"><div key={view} className="workspace-view">{content}</div></main><SourceRail sources={sources} generatedAt={data?.generatedAt} compact /></>;
}

function Workspace() {
  const [navOpen, setNavOpen] = useState(false);
  return <div className="workspace-shell"><SideNavigation open={navOpen} onClose={() => setNavOpen(false)} /><ModuleNavigation /><div className="workspace-surface"><WorkspaceHeader onMenu={() => setNavOpen(true)} /><IncidentRibbon /><CivilianAlertBar /><Routes><Route path=":view" element={<WorkspacePage />} /><Route path="*" element={<Navigate to="command" replace />} /></Routes></div></div>;
}

function ProtectedRoute({ children }) {
  const { profile, ready } = useAuth();
  if (!ready) return <div className="workspace-state"><BrandMark /><LoadingState label="Verifying secure session" /></div>;
  return profile ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return <Routes><Route path="/" element={<Landing />} /><Route path="/login" element={<LoginPage />} /><Route path="/safety" element={<ProtectedRoute><CivilianSafety /></ProtectedRoute>} /><Route path="/app/*" element={<ProtectedRoute><Workspace /></ProtectedRoute>} /><Route path="*" element={<Navigate to="/" replace />} /></Routes>;
}
