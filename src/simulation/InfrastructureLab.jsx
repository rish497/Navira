import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowCounterClockwise, Buildings, CaretDown, CheckCircle, Cube, Database,
  Flask, Gauge, Info, MapPin, Pause, Play, Plus, SidebarSimple, SpinnerGap,
  Warning, WarningCircle, X,
} from '@phosphor-icons/react';
import { useOperations } from '../operationsData';
import FootprintEditor from './FootprintEditor';
import SimulationViewport from './SimulationViewport';
import './lab.css';

const categories = [
  ['buildings', 'Buildings'], ['hospitals', 'Hospitals'], ['bridges', 'Bridges'],
  ['schools', 'Schools'], ['roads', 'Roads'], ['airports', 'Airports'], ['other', 'Utilities'],
];

const customDefaults = {
  name: 'Untitled test structure', shape: 'drawn', width: 24, length: 32, height: 15,
  floors: 5, floorHeight: 3, roof: 'flat', walls: 'masonry infill', openings: 'regular bays',
  structuralLayout: 'reinforced concrete frame', material: 'reinforced concrete', foundation: 'unspecified',
};

const scenarioDefaults = {
  type: 'earthquake', magnitude: 6.2, intensity: 'VII', groundMotion: .28,
  windSpeed: 120, waterLevel: 2.2, flowVelocity: 1.4, duration: 24, direction: 45,
};

const initialFootprint = [{ x: .18, y: .2 }, { x: .82, y: .2 }, { x: .82, y: .8 }, { x: .18, y: .8 }];
const time = (value) => value ? new Date(value).toLocaleString() : 'Data unavailable';
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function Field({ label, note, children }) {
  return <label className="simulation-field"><span>{label}</span>{children}{note && <small>{note}</small>}</label>;
}

function Notice({ type = 'info', children }) {
  return <div className={`simulation-notice simulation-notice--${type}`} role={type === 'error' ? 'alert' : 'status'}>
    {type === 'error' ? <WarningCircle /> : type === 'success' ? <CheckCircle /> : <Info />}{children}
  </div>;
}

function SourceBadge({ children, tone = 'source' }) {
  return <span className={`simulation-source simulation-source--${tone}`}>{children}</span>;
}

function RangeField({ label, name, min, max, step, value, unit, onChange }) {
  return <Field label={label}>
    <div className="simulation-range">
      <input aria-label={label} name={name} type="range" min={min} max={max} step={step} value={value} onChange={onChange} />
      <output>{value}{unit}</output>
    </div>
  </Field>;
}

function InfrastructureImporter({ countries, country, setCountry, category, setCategory, assets, selectedAsset, setSelectedAsset, loading, error, onRetry, retrievedAt, datasetUpdatedAt, source }) {
  return <div className="simulation-config-stack">
    <Field label="Country" note="Country codes: ISO 3166-1. Infrastructure: OpenStreetMap contributors.">
      <select value={country} onChange={(event) => setCountry(event.target.value)}>
        <option value="">Select a country</option>
        {countries.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
      </select>
    </Field>
    <div className="simulation-categories" aria-label="Infrastructure category">
      {categories.map(([value, label]) => <button key={value} type="button" className={category === value ? 'is-active' : ''} onClick={() => setCategory(value)}>{label}</button>)}
    </div>
    {loading && <div className="simulation-loading"><SpinnerGap /><span>Searching mapped infrastructure…</span></div>}
    {error && <Notice type="error"><div><strong>Infrastructure data unavailable</strong><p>{error}</p><button className="simulation-retry" type="button" onClick={onRetry}>Try again</button></div></Notice>}
    {!country && <Notice><div><strong>Choose a country</strong><p>NAVIRA will query named, mapped features in the selected category.</p></div></Notice>}
    {country && !loading && !error && !assets.length && <Notice><div><strong>No returned features</strong><p>The source returned no matching named features. NAVIRA will not create substitutes.</p></div></Notice>}
    {!!assets.length && <div className="simulation-assets" role="listbox" aria-label="Imported infrastructure">
      <div className="simulation-assets__head"><span>{assets.length} returned features</span><small>maximum 12</small></div>
      {assets.map((asset) => <button key={asset.id} type="button" role="option" aria-selected={selectedAsset?.id === asset.id} className={selectedAsset?.id === asset.id ? 'is-selected' : ''} onClick={() => setSelectedAsset(asset)}>
        <span><strong>{asset.name}</strong><small>{asset.geometryType === 'footprint' ? 'Mapped footprint' : 'Mapped point'}</small></span><MapPin />
      </button>)}
    </div>}
    {selectedAsset && <div className="simulation-imported-record">
      <div className="simulation-imported-record__head"><SourceBadge>Imported record</SourceBadge><a href={selectedAsset.source.url} target="_blank" rel="noreferrer">Open source feature</a></div>
      <dl>
        <div><dt>OSM element</dt><dd>{selectedAsset.osmType} / {selectedAsset.osmId}</dd></div>
        <div><dt>Coordinates</dt><dd>{selectedAsset.center?.[1]?.toFixed(5)}, {selectedAsset.center?.[0]?.toFixed(5)}</dd></div>
        <div><dt>Geometry</dt><dd>{selectedAsset.geometryType}</dd></div>
        <div><dt>Height</dt><dd>{selectedAsset.imported.heightMeters === null ? 'Data unavailable' : `${selectedAsset.imported.heightMeters} m`}</dd></div>
        <div><dt>Levels</dt><dd>{selectedAsset.imported.levels ?? 'Data unavailable'}</dd></div>
        <div><dt>Material</dt><dd>{selectedAsset.imported.material || 'Data unavailable'}</dd></div>
        <div><dt>Operator</dt><dd>{selectedAsset.imported.operator || 'Data unavailable'}</dd></div>
        <div><dt>Address</dt><dd>{selectedAsset.imported.address || 'Data unavailable'}</dd></div>
      </dl>
    </div>}
    {source && <div className="simulation-provenance">
      <SourceBadge>Imported</SourceBadge><span>{source.dataset}</span>
      <small>{source.queryScope}</small><a href={source.attributionUrl} target="_blank" rel="noreferrer">© OpenStreetMap contributors · ODbL</a>
      <small>OSM database timestamp: {datasetUpdatedAt ? time(datasetUpdatedAt) : 'Unavailable from search service'}</small>
      <small>Retrieved {time(retrievedAt)}</small>
    </div>}
  </div>;
}

function CustomBuilder({ values, setValues, footprint, setFootprint }) {
  const update = (event) => setValues((current) => ({ ...current, [event.target.name]: event.target.value }));
  const floorStackHeight = Number(values.floors) * Number(values.floorHeight);
  const heightMismatch = Number.isFinite(floorStackHeight) && Math.abs(Number(values.height) - floorStackHeight) > .1;
  return <div className="simulation-config-stack">
    <Notice><div><strong>User-defined test geometry</strong><p>Every value in this mode is an assumption supplied for visualization. It is not imported asset data.</p></div></Notice>
    <Field label="Structure name"><input name="name" value={values.name} onChange={update} /></Field>
    <FootprintEditor points={footprint} onChange={setFootprint} />
    <div className="simulation-field-pair">
      <Field label="Width"><div className="simulation-unit-input"><input name="width" type="number" min="1" value={values.width} onChange={update} /><span>m</span></div></Field>
      <Field label="Length"><div className="simulation-unit-input"><input name="length" type="number" min="1" value={values.length} onChange={update} /><span>m</span></div></Field>
      <Field label="Height"><div className="simulation-unit-input"><input name="height" type="number" min="1" value={values.height} onChange={update} /><span>m</span></div></Field>
      <Field label="Floors"><input name="floors" type="number" min="1" max="80" value={values.floors} onChange={update} /></Field>
      <Field label="Floor height"><div className="simulation-unit-input"><input name="floorHeight" type="number" min="2" step=".1" value={values.floorHeight} onChange={update} /><span>m</span></div></Field>
      <Field label="Roof"><select name="roof" value={values.roof} onChange={update}><option value="flat">Flat</option><option value="gable">Gable</option><option value="hip">Hip</option><option value="unspecified">Unspecified</option></select></Field>
    </div>
    {heightMismatch && <Notice><div><strong>Geometry values do not reconcile</strong><p>Floors × floor height equals {floorStackHeight.toFixed(1)} m. The viewport uses the entered overall height and distributes floor markers evenly.</p></div></Notice>}
    <Field label="Structural layout"><select name="structuralLayout" value={values.structuralLayout} onChange={update}><option>reinforced concrete frame</option><option>steel moment frame</option><option>load-bearing walls</option><option>timber frame</option><option>unspecified</option></select></Field>
    <Field label="Primary material"><select name="material" value={values.material} onChange={update}><option>reinforced concrete</option><option>structural steel</option><option>masonry</option><option>timber</option><option>unspecified</option></select></Field>
    <Field label="Walls"><select name="walls" value={values.walls} onChange={update}><option>masonry infill</option><option>reinforced concrete</option><option>curtain wall</option><option>timber</option><option>unspecified</option></select></Field>
    <Field label="Openings"><select name="openings" value={values.openings} onChange={update}><option>regular bays</option><option>limited openings</option><option>open ground floor</option><option>unspecified</option></select></Field>
    <Field label="Foundation"><select name="foundation" value={values.foundation} onChange={update}><option>unspecified</option><option>shallow spread footing</option><option>raft</option><option>pile</option></select></Field>
    <div className="simulation-provenance"><SourceBadge tone="assumption">Assumed</SourceBadge><span>Parameters entered by operator</span><small>No material strength, reinforcement detail, soil profile, connection model, or validated engineering mesh is generated.</small></div>
  </div>;
}

function HazardPanel({ scenario, setScenario }) {
  const update = (event) => setScenario((current) => ({ ...current, [event.target.name]: event.target.value }));
  return <div className="simulation-config-stack">
    <Field label="Hazard model"><select name="type" value={scenario.type} onChange={update}><option value="earthquake">Earthquake</option><option value="flood">Flood</option><option value="wind">Extreme wind</option></select></Field>
    {scenario.type === 'earthquake' && <>
      <RangeField label="Magnitude" name="magnitude" min="1" max="9.5" step=".1" value={scenario.magnitude} onChange={update} />
      <Field label="Reported intensity"><select name="intensity" value={scenario.intensity} onChange={update}><option>IV</option><option>V</option><option>VI</option><option>VII</option><option>VIII</option><option>IX</option><option>X+</option></select></Field>
      <RangeField label="Peak ground acceleration" name="groundMotion" min="0" max="1.5" step=".01" value={scenario.groundMotion} unit=" g" onChange={update} />
    </>}
    {scenario.type === 'flood' && <>
      <RangeField label="Water level" name="waterLevel" min="0" max="12" step=".1" value={scenario.waterLevel} unit=" m" onChange={update} />
      <RangeField label="Flow velocity" name="flowVelocity" min="0" max="8" step=".1" value={scenario.flowVelocity} unit=" m/s" onChange={update} />
    </>}
    {scenario.type === 'wind' && <RangeField label="Wind speed" name="windSpeed" min="0" max="320" step="1" value={scenario.windSpeed} unit=" km/h" onChange={update} />}
    <RangeField label="Direction" name="direction" min="0" max="359" step="1" value={scenario.direction} unit="°" onChange={update} />
    <RangeField label="Duration" name="duration" min="5" max="120" step="1" value={scenario.duration} unit=" s" onChange={update} />
    <Notice><div><strong>Scenario parameters are operator supplied</strong><p>No live hazard measurement is attached to this run. Visual response is illustrative and deterministic; it is not a finite-element, fluid-dynamics, or code-compliance result.</p></div></Notice>
    <div className="simulation-layer-key">
      <div><i className="is-stress" /><span><strong>Stress region</strong><small>Qualitative visualization layer</small></span></div>
      <div><i className="is-crack" /><span><strong>Crack path</strong><small>Illustrative initiation/propagation</small></span></div>
      <div><i className="is-hazard" /><span><strong>Hazard field</strong><small>Driven by entered scenario values</small></span></div>
    </div>
  </div>;
}

function RecordsPanel({ data, mutate }) {
  const [status, setStatus] = useState({ busy: false, error: null, success: null });
  const submitAsset = async (event) => {
    event.preventDefault(); const form = event.currentTarget;
    setStatus({ busy: true, error: null, success: null });
    try { await mutate('infrastructure', Object.fromEntries(new FormData(form))); form.reset(); setStatus({ busy: false, error: null, success: 'Infrastructure asset recorded.' }); }
    catch (error) { setStatus({ busy: false, error: error.message, success: null }); }
  };
  const submitCapacity = async (event) => {
    event.preventDefault(); const form = event.currentTarget;
    setStatus({ busy: true, error: null, success: null });
    try { await mutate('simulation', Object.fromEntries(new FormData(form))); form.reset(); setStatus({ busy: false, error: null, success: 'Capacity comparison recorded.' }); }
    catch (error) { setStatus({ busy: false, error: error.message, success: null }); }
  };
  const change = async (id, next) => {
    try { await mutate('infrastructure-status', { id, status: next }); }
    catch (error) { setStatus({ busy: false, error: error.message, success: null }); }
  };
  return <div className="simulation-config-stack simulation-records">
    <details open>
      <summary>Operator infrastructure register <CaretDown /></summary>
      <form onSubmit={submitAsset}>
        <Field label="Asset name"><input name="name" required /></Field>
        <div className="simulation-field-pair">
          <Field label="Type"><select name="type"><option>Hospital</option><option>Bridge</option><option>Power</option><option>Water</option><option>Communications</option><option>Shelter</option></select></Field>
          <Field label="Observed state"><select name="status"><option value="operational">Operational</option><option value="degraded">Degraded</option><option value="offline">Offline</option></select></Field>
        </div>
        <Field label="Location"><input name="location" required /></Field>
        <div className="simulation-field-pair"><Field label="Capacity"><input name="capacity" type="number" min="0" required /></Field><Field label="Unit"><input name="unit" required placeholder="beds, MW" /></Field></div>
        <button className="simulation-primary-button" type="submit" disabled={status.busy}><Plus /> Record accountable asset</button>
      </form>
      <div className="simulation-record-list">
        {data.infrastructure.map((item) => <article key={item.id}><div><span>{item.type} · {item.location}</span><strong>{item.name}</strong><small>{item.capacity} {item.unit}</small></div><select aria-label={`State for ${item.name}`} value={item.status} onChange={(event) => change(item.id, event.target.value)}><option value="operational">Operational</option><option value="degraded">Degraded</option><option value="offline">Offline</option></select></article>)}
        {!data.infrastructure.length && <p>No accountable operator records yet.</p>}
      </div>
    </details>
    <details>
      <summary>Capacity comparison <CaretDown /></summary>
      <form onSubmit={submitCapacity}>
        <Field label="Infrastructure asset"><select name="assetId" required defaultValue=""><option value="" disabled>Select an asset</option>{data.infrastructure.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.capacity} {item.unit}</option>)}</select></Field>
        <Field label="Scenario name"><input name="scenario" required /></Field>
        <Field label="Scenario load"><input name="scenarioLoad" type="number" min="0" required /></Field>
        <Field label="Operator notes"><textarea name="notes" rows="3" /></Field>
        <button className="simulation-primary-button" type="submit" disabled={status.busy}><Gauge /> Run transparent comparison</button>
      </form>
      <div className="simulation-record-list">{data.simulations.map((item) => <article key={item.id}><div><span>{item.status}</span><strong>{item.scenario}</strong><small>{item.assetName} · {item.outcome}</small></div><b>{item.utilization === null ? 'N/A' : `${Math.round(item.utilization * 100)}%`}</b></article>)}</div>
    </details>
    {(status.error || status.success) && <Notice type={status.error ? 'error' : 'success'}><div>{status.error || status.success}</div></Notice>}
  </div>;
}

export default function InfrastructureLab({ entry = 'simulation' }) {
  const { data, mutate } = useOperations();
  const [countries, setCountries] = useState([]);
  const [country, setCountry] = useState('');
  const [category, setCategory] = useState('hospitals');
  const [assets, setAssets] = useState([]);
  const [assetState, setAssetState] = useState({ loading: false, error: null, retrievedAt: null, datasetUpdatedAt: null, source: null });
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [sourceMode, setSourceMode] = useState('imported');
  const [custom, setCustom] = useState(customDefaults);
  const [footprint, setFootprint] = useState(initialFootprint);
  const [panel, setPanel] = useState('asset');
  const [panelOpen, setPanelOpen] = useState(true);
  const [scenario, setScenario] = useState(scenarioDefaults);
  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(false);
  const previousTime = useRef(null);
  const reducedMotion = useMemo(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false, []);

  useEffect(() => {
    let active = true;
    fetch('/api/simulation/countries', { cache: 'no-store' }).then((response) => {
      if (!response.ok) throw new Error('Country reference data is unavailable');
      return response.json();
    }).then((payload) => { if (active) setCountries(payload.countries || []); }).catch(() => { if (active) setCountries([]); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!country || sourceMode !== 'imported') { setAssets([]); setSelectedAsset(null); return undefined; }
    const controller = new AbortController();
    setAssets([]);
    setSelectedAsset(null);
    setAssetState({ loading: true, error: null, retrievedAt: null, datasetUpdatedAt: null, source: null });
    const timer = window.setTimeout(() => {
      fetch(`/api/simulation/infrastructure?country=${encodeURIComponent(country)}&category=${encodeURIComponent(category)}`, { signal: controller.signal, cache: 'no-store' })
        .then(async (response) => {
          const payload = await response.json();
          if (!response.ok) throw new Error(payload.error || 'OpenStreetMap infrastructure is temporarily unavailable. Try again.');
          return payload;
        })
        .then((payload) => {
          setAssets(payload.assets || []);
          setSelectedAsset(payload.assets?.[0] || null);
          setAssetState({ loading: false, error: null, retrievedAt: payload.retrievedAt, datasetUpdatedAt: payload.datasetUpdatedAt, source: payload.source });
        })
        .catch((error) => {
          if (error.name !== 'AbortError') setAssetState({ loading: false, error: error.message, retrievedAt: null, datasetUpdatedAt: null, source: null });
        });
    }, 300);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [country, category, sourceMode, reloadKey]);

  useEffect(() => {
    if (!playing) { previousTime.current = null; return undefined; }
    let frame;
    const tick = (now) => {
      if (previousTime.current === null) previousTime.current = now;
      const delta = (now - previousTime.current) / 1000;
      previousTime.current = now;
      setProgress((current) => {
        const next = clamp(current + delta / Math.max(1, Number(scenario.duration)), 0, 1);
        if (next >= 1) setPlaying(false);
        return next;
      });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, scenario.duration]);

  const model = useMemo(() => {
    if (sourceMode === 'custom') {
      if (footprint.length < 3) return null;
      return { ...custom, kind: 'custom', footprint, provenance: 'User-defined assumptions' };
    }
    if (!selectedAsset) return null;
    const importedHeight = selectedAsset.imported.heightMeters;
    const importedLevels = selectedAsset.imported.levels;
    return {
      kind: 'imported', category: selectedAsset.category, name: selectedAsset.name, footprint: selectedAsset.geometry,
      height: importedHeight || (importedLevels ? importedLevels * 3 : 12),
      floors: importedLevels || 3,
      structuralLayout: 'unavailable',
      visualAssumptions: [
        !importedHeight && !importedLevels ? '12 m display height' : null,
        !importedLevels ? '3 display floors' : null,
        selectedAsset.geometryType !== 'footprint' ? 'rectangular display footprint' : null,
      ].filter(Boolean),
    };
  }, [sourceMode, selectedAsset, custom, footprint]);

  const phase = progress === 0 ? 'before' : progress >= 1 ? 'after' : 'during';
  const displayedSeconds = Math.round(Number(scenario.duration) * progress * 10) / 10;
  const run = () => { setProgress(0); requestAnimationFrame(() => setPlaying(true)); };
  const reset = () => { setPlaying(false); setProgress(0); };

  return <section className={`simulation-lab ${panelOpen ? 'has-panel' : 'is-panel-closed'}`}>
    <header className="simulation-lab__header">
      <div><span>NAVIRA / {entry === 'infrastructure' ? 'INFRASTRUCTURE LAB' : 'SIMULATION LAB'}</span><h1>Test infrastructure against a controlled hazard scenario.</h1></div>
      <div className="simulation-lab__truth"><SourceBadge tone={sourceMode === 'imported' ? 'source' : 'assumption'}>{sourceMode === 'imported' ? 'Imported asset' : 'Built model'}</SourceBadge><p>Visualization only. No structural safety or collapse determination.</p></div>
    </header>

    <div className="simulation-lab__workspace">
      <main className="simulation-viewport">
        <div className="simulation-viewport__topline">
          <div><span>3D TEST CHAMBER</span><strong>{model?.name || 'No infrastructure selected'}</strong></div>
          <div className="simulation-phase" data-phase={phase}><i />{phase}</div>
          {!panelOpen && <button className="simulation-panel-open" type="button" onClick={() => setPanelOpen(true)}><SidebarSimple /> Configure</button>}
        </div>
        <div className="simulation-viewport__stage">
          <SimulationViewport model={model} scenario={scenario} progress={progress} running={playing} reducedMotion={reducedMotion} />
          {!model && <div className="simulation-viewport__empty"><Cube /><strong>Select or build infrastructure</strong><p>The viewport will remain empty until a sourced feature or valid custom footprint is available.</p></div>}
          <div className="simulation-viewport__telemetry">
            <div><span>Hazard</span><strong>{scenario.type === 'wind' ? 'Extreme wind' : scenario.type}</strong></div>
            <div><span>Simulation time</span><strong>{displayedSeconds.toFixed(1)} s</strong></div>
            <div><span>Solver</span><strong>Visual heuristic</strong></div>
          </div>
          {model?.visualAssumptions?.length > 0 && <div className="simulation-viewport__assumption"><Warning /> Display assumptions: {model.visualAssumptions.join(', ')}</div>}
        </div>
        <div className="simulation-timeline">
          <button type="button" aria-label="Reset simulation" onClick={reset}><ArrowCounterClockwise /></button>
          <button className="simulation-timeline__play" type="button" aria-label={playing ? 'Pause simulation' : 'Play simulation'} onClick={() => model && (progress >= 1 ? run() : setPlaying((value) => !value))} disabled={!model}>{playing ? <Pause weight="fill" /> : <Play weight="fill" />}</button>
          <div className="simulation-timeline__track">
            <div><span>Before</span><span>During</span><span>After</span></div>
            <input aria-label="Simulation timeline" type="range" min="0" max="1" step=".001" value={progress} onChange={(event) => { setPlaying(false); setProgress(Number(event.target.value)); }} disabled={!model} />
          </div>
          <button className="simulation-run" type="button" onClick={run} disabled={!model}><Flask /> Run simulation</button>
        </div>
      </main>

      {panelOpen && <aside className="simulation-panel">
        <div className="simulation-panel__head"><div><span>CONFIGURATION</span><strong>{panel === 'asset' ? 'Infrastructure' : panel === 'hazard' ? 'Hazard scenario' : 'Accountable records'}</strong></div><button type="button" aria-label="Close configuration panel" onClick={() => setPanelOpen(false)}><X /></button></div>
        <nav className="simulation-panel__tabs" aria-label="Lab configuration">
          <button type="button" className={panel === 'asset' ? 'is-active' : ''} onClick={() => setPanel('asset')}><Buildings /> Asset</button>
          <button type="button" className={panel === 'hazard' ? 'is-active' : ''} onClick={() => setPanel('hazard')}><Warning /> Hazard</button>
          <button type="button" className={panel === 'records' ? 'is-active' : ''} onClick={() => setPanel('records')}><Database /> Records</button>
        </nav>
        <div className="simulation-panel__body">
          {panel === 'asset' && <>
            <div className="simulation-mode-switch"><button type="button" className={sourceMode === 'imported' ? 'is-active' : ''} onClick={() => setSourceMode('imported')}>Real infrastructure</button><button type="button" className={sourceMode === 'custom' ? 'is-active' : ''} onClick={() => setSourceMode('custom')}>Build your own</button></div>
            {sourceMode === 'imported'
              ? <InfrastructureImporter {...{ countries, country, setCountry, category, setCategory, assets, selectedAsset, setSelectedAsset, loading: assetState.loading, error: assetState.error, onRetry: () => setReloadKey((value) => value + 1), retrievedAt: assetState.retrievedAt, datasetUpdatedAt: assetState.datasetUpdatedAt, source: assetState.source }} />
              : <CustomBuilder values={custom} setValues={setCustom} footprint={footprint} setFootprint={setFootprint} />}
          </>}
          {panel === 'hazard' && <HazardPanel scenario={scenario} setScenario={setScenario} />}
          {panel === 'records' && <RecordsPanel data={data} mutate={mutate} />}
        </div>
      </aside>}
    </div>

    <footer className="simulation-lab__evidence">
      <div><span>MODEL BASIS</span><strong>{sourceMode === 'imported' ? selectedAsset ? `${selectedAsset.source.dataset} / ${selectedAsset.geometryType}` : 'Data unavailable' : 'Operator-defined geometry'}</strong></div>
      <div><span>ENGINEERING PROPERTIES</span><strong>{sourceMode === 'imported' ? 'Unavailable unless present in source tags' : 'User-entered assumptions'}</strong></div>
      <div><span>OUTPUT STATUS</span><strong>Simulated visualization · no safety verdict</strong></div>
      <div><span>EXTENSION POINTS</span><strong>Dataset adapters · solver adapters · result layers</strong></div>
    </footer>
  </section>;
}
