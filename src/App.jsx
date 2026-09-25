import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, Navigate, Route, Routes, useParams } from 'react-router-dom';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { DotGlobe } from 'dot-globe';
import {
  ArrowRight, ArrowSquareOut, Broadcast, Buildings, CaretRight, ChartBar,
  ClockCounterClockwise, Database, Flask, ListBullets,
  MapTrifold, NewspaperClipping, Package, Path as RouteIcon, ShieldCheck,
  SpinnerGap, UsersThree, WarningCircle, X,
} from '@phosphor-icons/react';
import LiveMap from './LiveMap';
import { useLiveData } from './liveData';

gsap.registerPlugin(ScrollTrigger);

const NAV_GROUPS = [
  { label: 'Observe', items: [['command', 'Command', Broadcast], ['map', 'Live map', MapTrifold], ['events', 'Event ledger', ListBullets]] },
  { label: 'Context', items: [['timeline', 'Timeline', ClockCounterClockwise], ['analytics', 'Analytics', ChartBar], ['news', 'News context', NewspaperClipping]] },
  { label: 'Operations', items: [['evacuation', 'Evacuation', RouteIcon], ['dispatch', 'Dispatch', UsersThree], ['resources', 'Resources', Package], ['infrastructure', 'Infrastructure', Buildings], ['simulation', 'Simulation', Flask]] },
];

const PAGE_COPY = {
  command: ['Live command picture', 'Agency event feeds, geographic evidence, and source condition in one operational view.'],
  map: ['Live geographic picture', 'Source-native geometry on a navigable, correctly proportioned world map.'],
  events: ['Event ledger', 'Every row comes directly from NASA EONET, GDACS, or USGS.'],
  timeline: ['Source chronology', 'A time-ordered record built only from timestamps published by the upstream sources.'],
  analytics: ['Observed event analysis', 'Counts describe the records currently returned by the connected sources.'],
  news: ['Reporting context', 'Event-linked media reporting from GDACS is kept separate from verified agency records.'],
};

function BrandMark({ compact = false }) {
  return <span className={`brand-mark ${compact ? 'brand-mark--compact' : ''}`}><svg viewBox="0 0 38 38" aria-hidden="true"><path d="M5 33V5h6l16 17V5h6v28h-6L11 16v17z" /><path className="brand-mark__cut" d="m11 8 16 20" /></svg>{!compact && <strong>NAVIRA</strong>}</span>;
}

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

function FailureState({ message, onRetry }) {
  return <div className="state-panel state-panel--error"><WarningCircle size={26} /><div><strong>Live data unavailable</strong><p>{message || 'The source request did not return usable data.'}</p></div>{onRetry && <button className="text-button" onClick={onRetry}>Retry connection <ArrowRight /></button>}</div>;
}

function SourceRail({ sources, generatedAt, compact = false }) {
  return (
    <section className={`source-rail ${compact ? 'source-rail--compact' : ''}`} aria-label="Live source freshness">
      <div className="source-rail__intro"><Database size={19} /><div><strong>Source condition</strong><span>Retrieved {formatTime(generatedAt, { short: true })}</span></div></div>
      {sources.map((source) => <a href={source.href} target="_blank" rel="noreferrer" key={source.id} className="source-rail__source"><i className={source.status === 'available' ? 'is-live' : 'is-down'} /><div><strong>{source.name}</strong><span>{source.status === 'available' ? `${source.count} records · fetched ${formatTime(source.fetchedAt, { short: true })}` : 'Data unavailable'}</span></div><ArrowSquareOut size={15} /></a>)}
    </section>
  );
}

function EventList({ events, selectedEvent, onSelect, limit }) {
  const visible = limit ? events.slice(0, limit) : events;
  if (!visible.length) return <div className="empty-data"><strong>Data unavailable</strong><span>No event records were returned by the enabled sources.</span></div>;
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

function Landing() {
  const root = useRef(null);
  const { data, events, sources, loading, error, selectedEvent, selectEvent, refresh } = useLiveData();
  useGSAP(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
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
  }, { scope: root });
  return (
    <main ref={root} className="landing-shell">
      <header className="landing-nav">
        <Link to="/" aria-label="NAVIRA home"><BrandMark /></Link>
        <nav aria-label="Public navigation"><a href="#civilian">For people in danger</a><a href="#response">How response connects</a><a href="#sources">Data and sources</a></nav>
        <div><span className="live-word"><i /> LIVE DATA</span><Link className="button button--dark" to="/app/map">Check live hazards <ArrowRight /></Link></div>
      </header>

      <section className="hero-civic" aria-labelledby="hero-title">
        <div className="hero-primary">
          <div className="hero-primary__copy">
            <p className="hero-signal"><i /> {events.length ? `${events.length} current source records` : 'Connecting to disaster sources'}</p>
            <h1 id="hero-title"><span>Know the danger.</span><span>Find your way out.</span></h1>
            <p className="hero-primary__body">NAVIRA brings live hazards and official guidance into one map for people in danger and the teams helping them.</p>
            <div className="hero-actions"><Link className="button button--signal" to="/app/map">Check the live map <ArrowRight /></Link><a className="button button--ghost" href="#response">See how response connects</a></div>
          </div>
          <div className="decision-strip" id="civilian">
            <div className="decision-cell"><b>01</b><strong>Am I in danger?</strong><span>Inspect published hazards near your location.</span></div>
            <div className="decision-cell"><b>02</b><strong>Where should I go?</strong><span>Use official destination guidance when a source provides it.</span></div>
            <div className="decision-cell"><b>03</b><strong>How do I get there?</strong><span>Follow a route only when an authorized feed is connected.</span></div>
          </div>
        </div>
        <div className="hero-map-shell">
          {loading ? <LoadingState /> : error ? <FailureState message={error} onRetry={refresh} /> : <LiveMap events={events} selectedEvent={selectedEvent} onSelect={selectEvent} variant="hero" />}
          <div className="hero-map__label"><span><i /> LIVE GEOGRAPHY</span><b>MapLibre · OpenStreetMap</b></div>
          {selectedEvent && <div className="hero-event"><SourceBadge source={selectedEvent.source} /><strong>{selectedEvent.title}</strong><span>{selectedEvent.type} · {formatTime(selectedEvent.timestamp, { short: true })}</span><Link to="/app/map">Inspect record <ArrowRight /></Link></div>}
        </div>
      </section>
      <SourceRail sources={sources} generatedAt={data?.generatedAt} />

      <section className="civilian-brief section-reveal" aria-labelledby="civilian-title">
        <div><span className="section-index">01 / CIVILIAN DECISIONS</span><h2 id="civilian-title">Location turns a disaster alert into a decision.</h2></div>
        <div className="civilian-brief__body"><p>A headline says something happened. NAVIRA keeps the event attached to geography, time, severity, and its publishing source so a person can understand what is known nearby.</p><p>When an authority has not supplied a destination or route, NAVIRA says “Data unavailable.” It does not fill the gap with a guess.</p></div>
      </section>

      <section className="response-system" id="response" aria-labelledby="response-title">
        <ResponseGlobe />
        <div className="response-system__lead section-reveal"><span className="section-index">02 / SHARED RESPONSE</span><h2 id="response-title">One event moves through three hands.</h2></div>
        <div className="response-steps">
          <article className="response-step"><b>PUBLIC</b><h3>See what is happening nearby.</h3><p>Current source records appear on a navigable map with published time, location, severity, and status.</p><Link to="/app/map">Open the public map <ArrowRight /></Link></article>
          <article className="response-step"><b>RESPONDERS</b><h3>Inspect the record behind the marker.</h3><p>Source links and geometry stay attached, so field context can be checked against the original agency record.</p><Link to="/app/events">Inspect the event ledger <ArrowRight /></Link></article>
          <article className="response-step"><b>COMMAND</b><h3>Keep the wider picture accountable.</h3><p>Source condition, event chronology, analysis, and news context remain distinct and time-stamped.</p><Link to="/app/command">Enter command view <ArrowRight /></Link></article>
        </div>
      </section>

      <section className="response-flow section-reveal" aria-labelledby="flow-title">
        <div className="response-flow__title"><span className="section-index">03 / RESPONSE FLOW</span><h2 id="flow-title">From published hazard to human action.</h2></div>
        <div className="response-flow__track">
          <article><b>01</b><h3>Observe</h3><p>NASA EONET, GDACS, and USGS publish event data.</p></article>
          <article><b>02</b><h3>Preserve</h3><p>NAVIRA retains source identity, time, geometry, and status.</p></article>
          <article><b>03</b><h3>Coordinate</h3><p>Responders and command teams read from the same live picture.</p></article>
          <article><b>04</b><h3>Guide</h3><p>Official routes and instructions appear only when connected.</p></article>
        </div>
      </section>

      <section className="live-ledger section-reveal"><div className="live-ledger__title"><span className="section-index">04 / CURRENT RECORDS</span><h2>Each marker has a source behind it.</h2><p>Select a current record to carry it into the live map. NAVIRA does not rewrite missing facts.</p></div><div className="live-ledger__content"><EventList events={events} selectedEvent={selectedEvent} onSelect={selectEvent} limit={6} /><Link to="/app/events" className="ledger-link">See every current source record <ArrowRight /></Link></div></section>

      <section className="trust-system" id="sources" aria-labelledby="trust-title">
        <div className="trust-system__lead"><span className="section-index">05 / DATA TRUST</span><h2 id="trust-title">Know what is live. Know what is missing.</h2></div>
        <div className="trust-rules"><article><ShieldCheck /><h3>Agency records stay separate from reporting.</h3><p>GDACS news adds context, but it is never presented as verified incident fact.</p></article><article><MapTrifold /><h3>Geography keeps its real proportions.</h3><p>MapLibre renders OpenStreetMap-based geography with real zooming, panning, labels, and source-native geometry.</p></article><article><Database /><h3>Absence is shown plainly.</h3><p>Routes, dispatch units, resources, and infrastructure remain unavailable until authoritative systems are connected.</p></article></div>
      </section>

      <section className="landing-action section-reveal"><div><span className="section-index">LIVE RESPONSE MAP</span><h2>Check the hazards that sources are reporting now.</h2></div><Link className="button button--paper" to="/app/map">Open the live map <ArrowRight /></Link></section>
      <footer className="landing-footer"><BrandMark /><span>Disaster data: NASA EONET · GDACS · USGS</span><span>Geography: OpenFreeMap · OpenStreetMap</span><Link to="/app/command">Command workspace <ArrowRight /></Link></footer>
    </main>
  );
}

function SideNavigation({ open, onClose }) {
  return <><button className={`nav-backdrop ${open ? 'is-visible' : ''}`} onClick={onClose} aria-label="Close navigation" /><aside className={`side-navigation ${open ? 'is-open' : ''}`} aria-label="Mobile workspace navigation"><div className="side-navigation__brand"><Link to="/"><BrandMark /></Link><button onClick={onClose} aria-label="Close navigation"><X /></button></div><nav>{NAV_GROUPS.map((group) => <div className="nav-cluster" key={group.label}><span>{group.label}</span>{group.items.map(([id, label, Icon]) => <NavLink key={id} to={`/app/${id}`} onClick={onClose}><Icon /><b>{label}</b></NavLink>)}</div>)}</nav><div className="side-navigation__foot"><i /><span><strong>LIVE SOURCES</strong><small>NASA · GDACS · USGS</small></span></div></aside></>;
}

function ModuleNavigation() {
  return <aside className="module-navigation"><Link className="module-navigation__brand" to="/" aria-label="NAVIRA home"><BrandMark /></Link><nav aria-label="Workspace modules">{NAV_GROUPS.map((group) => <div className="module-group" key={group.label}><span>{group.label}</span>{group.items.map(([id, label, Icon]) => <NavLink key={id} to={`/app/${id}`}><Icon /><b>{label}</b></NavLink>)}</div>)}</nav><div className="module-navigation__foot"><i /><span><strong>LIVE SOURCES</strong><small>NASA · GDACS · USGS</small></span></div></aside>;
}

function WorkspaceHeader({ onMenu }) {
  const { data, loading, refresh } = useLiveData();
  return <><header className="workspace-header"><div className="workspace-header__brand"><button className="menu-button" onClick={onMenu} aria-label="Open navigation"><span /><span /></button><Link to="/" aria-label="NAVIRA home"><BrandMark /></Link></div><p>Disaster geography, event sources, and operational context</p><button className="refresh-button" disabled={loading} onClick={refresh}>{loading ? <SpinnerGap className="spin" /> : <Broadcast />}<span>Refresh sources</span></button></header><div className="freshness-bar"><span key={data?.generatedAt || 'pending'} className="freshness-live"><i /> LIVE DATA</span><b>Last NAVIRA retrieval</b><time>{formatTime(data?.generatedAt, { short: true })}</time><small>Every record retains its source time</small></div></>;
}

function PageIntro({ view }) {
  const copy = PAGE_COPY[view] || ['Operational module', 'Authoritative data is required before this module can be used.'];
  return <div className="page-intro"><div><span className="module-code">NAVIRA / {view.toUpperCase()}</span><h1>{copy[0]}</h1></div><p>{copy[1]}</p></div>;
}

function CommandView() {
  const { events, selectedEvent, selectEvent } = useLiveData();
  return <><PageIntro view="command" /><div className="command-layout"><div className="command-layout__map"><LiveMap events={events} selectedEvent={selectedEvent} onSelect={selectEvent} variant="command" /></div><div className="command-layout__rail"><div className="rail-title"><span>LIVE QUEUE</span><b>{events.length} source records</b></div><EventList events={events} selectedEvent={selectedEvent} onSelect={selectEvent} limit={12} /></div><EventDetail key={selectedEvent?.id || 'empty'} event={selectedEvent} /></div></>;
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
  return <><PageIntro view="timeline" /><div className="timeline-records">{events.length ? events.map((event) => <button key={event.id} onClick={() => selectEvent(event)}><time>{formatTime(event.timestamp)}</time><i className={`event-signal event-signal--${eventTone(event)}`} /><div><SourceBadge source={event.source} /><strong>{event.title}</strong><span>{event.type} · {event.status}</span></div><ArrowRight /></button>) : <div className="empty-data"><strong>Data unavailable</strong></div>}</div></>;
}

function AnalyticsView() {
  const { events, sources } = useLiveData();
  const byType = useMemo(() => Object.entries(events.reduce((acc, event) => ({ ...acc, [event.type]: (acc[event.type] || 0) + 1 }), {})).sort((a, b) => b[1] - a[1]), [events]);
  const max = Math.max(1, ...byType.map(([, count]) => count));
  return <><PageIntro view="analytics" /><section className="analytics-sheet"><div className="analytics-sheet__sources"><h2>Records by source</h2>{sources.map((source) => <div key={source.id}><SourceBadge source={source} /><strong>{source.status === 'available' ? source.count : 'Data unavailable'}</strong><span>Fetched {formatTime(source.fetchedAt)}</span></div>)}</div><div className="analytics-sheet__types"><h2>Published event types</h2>{byType.length ? byType.map(([type, count]) => <div className="type-bar" key={type}><span>{type}</span><i><b style={{ width: `${(count / max) * 100}%` }} /></i><strong>{count}</strong></div>) : <div className="empty-data"><strong>Data unavailable</strong></div>}<p>Counts reflect the current API response only. They do not estimate impact, people affected, or risk.</p></div></section></>;
}

function NewsView() {
  const { events, selectedEvent, selectEvent } = useLiveData();
  const gdacsEvents = events.filter((event) => event.gdacsKey);
  const active = selectedEvent?.gdacsKey ? selectedEvent : gdacsEvents[0];
  const [state, setState] = useState({ loading: false, data: null, error: null });
  useEffect(() => {
    if (!active?.gdacsKey) { setState({ loading: false, data: null, error: null }); return; }
    const params = new URLSearchParams({ eventtype: active.gdacsKey.eventtype, eventid: active.gdacsKey.eventid });
    let current = true;
    setState({ loading: true, data: null, error: null });
    fetch(`/api/gdacs-news?${params}`, { cache: 'no-store' }).then((response) => { if (!response.ok) throw new Error('News feed unavailable'); return response.json(); }).then((data) => current && setState({ loading: false, data, error: null })).catch((error) => current && setState({ loading: false, data: null, error: error.message }));
    return () => { current = false; };
  }, [active?.id]);
  return <><PageIntro view="news" /><div className="news-layout"><aside><span>GDACS EVENTS</span>{gdacsEvents.map((event) => <button className={active?.id === event.id ? 'is-selected' : ''} key={event.id} onClick={() => selectEvent(event)}><strong>{event.title}</strong><small>{event.country || event.type}</small></button>)}</aside><section className="news-feed"><div className="news-feed__warning"><NewspaperClipping /><div><strong>News reporting</strong><span>These items are media context indexed by GDACS. They are not agency-verified incident facts.</span></div></div>{!active ? <div className="empty-data"><strong>Data unavailable</strong><span>No GDACS event record is currently available.</span></div> : state.loading ? <LoadingState label="Loading event-linked reporting" /> : state.error ? <FailureState message={state.error} /> : state.data?.items?.length ? <>{state.data.items.map((item) => <article key={item.id}><div><span>{item.publisher}</span><time>{formatTime(item.publishedAt, { short: true })}</time></div><h2>{item.title}</h2><p>{item.description || 'Data unavailable'}</p>{item.href && <a href={item.href} target="_blank" rel="noreferrer">Read original report <ArrowSquareOut /></a>}</article>)}<small className="feed-freshness">Feed retrieved {formatTime(state.data.fetchedAt)}</small></> : <div className="empty-data"><strong>Data unavailable</strong><span>No indexed reporting was returned for this event.</span></div>}</section></div></>;
}

const OPERATION_COPY = {
  evacuation: { title: 'Evacuation routes', requirement: 'A route can only be published from an authorized local transport or emergency-management feed.', icon: RouteIcon },
  dispatch: { title: 'Responder dispatch', requirement: 'Unit identity, capability, availability, and location require a connected dispatch authority.', icon: UsersThree },
  resources: { title: 'Resource coordination', requirement: 'Inventory and shelter capacity require a connected logistics or humanitarian source.', icon: Package },
  infrastructure: { title: 'Infrastructure monitoring', requirement: 'Utility state requires a connected infrastructure operator or public authority.', icon: Buildings },
  simulation: { title: 'Disaster simulation', requirement: 'A simulation requires an explicit model, inputs, uncertainty range, and run provenance.', icon: Flask },
};

function UnavailableOperation({ view }) {
  const item = OPERATION_COPY[view]; const Icon = item.icon;
  return <><div className="page-intro"><div><span className="module-code">NAVIRA / {view.toUpperCase()}</span><h1>{item.title}</h1></div><p>{item.requirement}</p></div><section className="unavailable-module"><Icon size={48} /><div><strong>Data unavailable</strong><p>{item.requirement} NAVIRA will not infer operational data from public disaster events.</p></div><Link to="/app/map">Return to live geographic picture <ArrowRight /></Link></section></>;
}

function WorkspacePage() {
  const { view = 'command' } = useParams();
  const { data, sources, loading, error, refresh } = useLiveData();
  if (loading && !data) return <div className="workspace-state"><BrandMark /><LoadingState /></div>;
  if (error && !data) return <div className="workspace-state"><BrandMark /><FailureState message={error} onRetry={refresh} /></div>;
  let content;
  if (view === 'command') content = <CommandView />; else if (view === 'map') content = <MapView />; else if (view === 'events') content = <LedgerView />; else if (view === 'timeline') content = <TimelineView />; else if (view === 'analytics') content = <AnalyticsView />; else if (view === 'news') content = <NewsView />; else if (OPERATION_COPY[view]) content = <UnavailableOperation view={view} />; else return <Navigate to="/app/command" replace />;
  return <><main className="workspace-main"><div key={view} className="workspace-view">{content}</div></main><SourceRail sources={sources} generatedAt={data?.generatedAt} compact /></>;
}

function Workspace() {
  const [navOpen, setNavOpen] = useState(false);
  return <div className="workspace-shell"><SideNavigation open={navOpen} onClose={() => setNavOpen(false)} /><ModuleNavigation /><div className="workspace-surface"><WorkspaceHeader onMenu={() => setNavOpen(true)} /><Routes><Route path=":view" element={<WorkspacePage />} /><Route path="*" element={<Navigate to="command" replace />} /></Routes></div></div>;
}

export default function App() {
  return <Routes><Route path="/" element={<Landing />} /><Route path="/app/*" element={<Workspace />} /><Route path="*" element={<Navigate to="/" replace />} /></Routes>;
}
