import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowCounterClockwise, Buildings, CaretDown, CheckCircle, Cube, Database, Eye,
  Flask, Gauge, ImageSquare, Info, MapPin, Pause, Play, Plus, Scan, SidebarSimple,
  SpinnerGap, Warning, WarningCircle, X,
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
  faceOverrides: {},
};

const scenarioDefaults = {
  type: 'earthquake', magnitude: 6.2, intensity: 'VII', groundMotion: .28,
  windSpeed: 120, waterLevel: 2.2, flowVelocity: 1.4, duration: 24, direction: 45,
};

const initialFootprint = [{ x: .18, y: .2 }, { x: .82, y: .2 }, { x: .82, y: .8 }, { x: .18, y: .8 }];
const time = (value) => value ? new Date(value).toLocaleString() : 'Data unavailable';
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const modelStages = [
  { id: 'locate', label: 'Lock mapped record', detail: 'Preserve coordinates, source tags, and footprint.' },
  { id: 'imagery', label: 'Retrieve visual evidence', detail: 'Search reusable Wikimedia Commons imagery near and by name.' },
  { id: 'analysis', label: 'Analyze visible architecture', detail: 'Send retrieved evidence to the server-side vision model.' },
  { id: 'geometry', label: 'Assemble procedural geometry', detail: 'Combine mapped geometry with validated visual observations.' },
  { id: 'complete', label: 'Model ready', detail: 'Load the generated approximation into the 3D test chamber.' },
];

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

function prepareHumanEvidence(file, index) {
  return new Promise((resolve, reject) => {
    if (!file?.type?.startsWith('image/')) { reject(new Error('Only image files can be used as visual evidence.')); return; }
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      const scale = Math.min(1, 1400 / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      const dataUrl = canvas.toDataURL('image/jpeg', .8);
      resolve({ id: `human-${index}`, name: file.name || `Exterior view ${index + 1}`, title: file.name || `Exterior view ${index + 1}`, dataUrl, thumbnailUrl: dataUrl, description: 'Human-supplied exterior evidence', license: 'Supplied by operator' });
    };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`${file.name || 'An image'} could not be read.`)); };
    image.src = url;
  });
}

function ModelGenerationDialog({ state, asset, previewModel, reducedMotion, onClose, onRetry, onHumanEvidence }) {
  const closeButton = useRef(null);
  const [humanImages, setHumanImages] = useState([]);
  const [humanError, setHumanError] = useState(null);
  useEffect(() => {
    if (!state.open) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButton.current?.focus();
    const escape = (event) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', escape);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener('keydown', escape); };
  }, [state.open]);
  useEffect(() => { setHumanImages([]); setHumanError(null); }, [asset?.id]);
  if (!state.open || !asset) return null;
  const activeIndex = state.error ? -1 : state.awaitingHuman ? 2 : modelStages.findIndex((item) => item.id === state.stage);
  const descriptor = state.result?.descriptor;
  const assembling = (state.stage === 'geometry' || state.stage === 'complete') && previewModel;
  const assemblyLabel = state.assemblyProgress < .18 ? 'Raising primary supports'
    : state.assemblyProgress < .42 ? 'Setting floor levels'
      : state.assemblyProgress < .7 ? 'Building the structural envelope'
        : state.assemblyProgress < .9 ? 'Applying façade geometry'
          : state.assemblyProgress < 1 ? 'Setting roof and final details' : 'Procedural model complete';
  return createPortal(<div className="model-generation" role="dialog" aria-modal="true" aria-labelledby="model-generation-title">
    <div className="model-generation__surface">
      <header>
        <div><span>VISUAL MODEL PIPELINE</span><h2 id="model-generation-title">Reconstructing {asset.name}</h2><p>Mapped facts remain authoritative. Visual details are estimates from retrieved open imagery and are labeled accordingly.</p></div>
        <button ref={closeButton} type="button" onClick={onClose} aria-label="Close model generation progress"><X /></button>
      </header>
      <div className="model-generation__body">
        <ol className="model-generation__stages">
          {modelStages.map((item, index) => {
            const needsInput = state.awaitingHuman && index === 2;
            const done = !state.error && !needsInput && (activeIndex > index || (state.stage === 'complete' && item.id === 'complete'));
            const active = !state.error && !needsInput && activeIndex === index && !done;
            return <li key={item.id} className={done ? 'is-done' : needsInput ? 'needs-input' : active ? 'is-active' : ''}>
              <i>{done ? <CheckCircle weight="fill" /> : needsInput ? <WarningCircle /> : active ? <SpinnerGap /> : index + 1}</i>
              <span><strong>{item.label}</strong><small>{item.detail}</small></span>
            </li>;
          })}
        </ol>
        <section className="model-generation__evidence">
          <div className="model-generation__evidence-head">
            <span>{state.error ? 'PIPELINE INTERRUPTED' : state.awaitingHuman ? 'HUMAN EVIDENCE REQUIRED' : assembling ? state.stage === 'complete' ? 'MODEL ASSEMBLED' : 'LIVE GEOMETRY ASSEMBLY' : 'EXTERIOR EVIDENCE VALIDATION'}</span>
            <strong>{state.error ? 'The model could not be completed' : state.awaitingHuman ? 'Open sources did not provide enough verified exterior views' : assembling ? assemblyLabel : 'Candidate images are being checked before they enter the model'}</strong>
          </div>
          {state.error ? <div className="model-generation__error"><WarningCircle /><div><strong>Generation unavailable</strong><p>{state.error}</p><p>The current structure will not be replaced with invented detail.</p></div></div> : <>
            {state.awaitingHuman ? <div className="model-generation__human">
              <div className="model-generation__human-copy"><div><SourceBadge tone="assumption">Human in the loop</SourceBadge><h3>Add clear exterior views</h3><p>{state.result?.message} Use wide shots from the front, rear, both sides, and corners. Avoid interiors, people-only photos, maps, and close-up objects.</p></div><strong>{humanImages.length}/15</strong></div>
              <label className="model-generation__upload"><input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" multiple onChange={async (event) => {
                setHumanError(null);
                try {
                  const files = [...(event.target.files || [])].slice(0, 15 - humanImages.length);
                  const prepared = await Promise.all(files.map((file, index) => prepareHumanEvidence(file, humanImages.length + index)));
                  setHumanImages((current) => [...current, ...prepared].slice(0, 15));
                } catch (error) { setHumanError(error.message); }
                event.target.value = '';
              }} /><ImageSquare /><span><strong>Take or upload exterior photos</strong><small>6 required · up to 15 · camera or computer</small></span></label>
              {humanImages.length > 0 && <div className="model-generation__human-grid">{humanImages.map((image) => <div key={image.id}><img src={image.thumbnailUrl} alt={image.title} /><button type="button" onClick={() => setHumanImages((current) => current.filter((item) => item.id !== image.id))} aria-label={`Remove ${image.title}`}><X /></button><span>{image.title}</span></div>)}</div>}
              {humanError && <p className="model-generation__human-error">{humanError}</p>}
              <button className="model-generation__human-submit" type="button" disabled={humanImages.length < 6} onClick={() => onHumanEvidence(humanImages)}>Validate {humanImages.length} exterior views</button>
            </div> : assembling ? <div className="model-generation__assembly">
              <SimulationViewport model={previewModel} scenario={scenarioDefaults} progress={0} running={false} reducedMotion={reducedMotion} assemblyProgress={state.assemblyProgress} />
              <div className="model-generation__assembly-status"><span>{assemblyLabel}</span><strong>{Math.round(state.assemblyProgress * 100)}%</strong><i><b style={{ transform: `scaleX(${state.assemblyProgress})` }} /></i></div>
            </div> : state.result && state.images.length > 0 ? <>
              <div className="model-generation__coverage"><strong>{state.images.length >= 15 ? 'Exterior-view target met' : 'Verified exterior coverage limited'}</strong><span>{state.images.length} verified exterior image{state.images.length === 1 ? '' : 's'} · target 15</span></div>
              <div className="model-generation__images">
                {state.images.slice(0, 15).map((image) => image.sourceUrl ? <a key={image.id} href={image.sourceUrl} target="_blank" rel="noreferrer"><img src={image.thumbnailUrl} alt={image.description || image.title} /><span>{image.title}</span><small>{Number.isFinite(image.bearing) ? `${Math.round(image.bearing)}° view · ` : ''}{image.license}</small></a> : <div key={image.id}><img src={image.thumbnailUrl} alt={image.description || image.title} /><span>{image.title}</span><small>Human-supplied exterior</small></div>)}
              </div>
            </> : <div className="model-generation__waiting"><ImageSquare /><span>{state.stage === 'locate' || state.stage === 'imagery' ? 'Searching open sources for exterior candidates…' : 'Classifying candidate images and rejecting interiors or unrelated scenes…'}</span></div>}
            {descriptor && <div className="model-generation__spec">
              <div><span>Visual match</span><strong>{descriptor.targetVisibility.replace('-', ' ')}</strong></div>
              <div><span>Confidence</span><strong>{descriptor.confidence}</strong></div>
              <div><span>Massing</span><strong>{descriptor.massing.replace('-', ' ')}</strong></div>
              <div><span>Observed floors</span><strong>{descriptor.floors ?? 'Unavailable'}</strong></div>
              <div><span>Roof</span><strong>{descriptor.roof.type}</strong></div>
              <div><span>Façade</span><strong>{descriptor.facade.material}</strong></div>
            </div>}
            <div className="model-generation__source"><Database /><span>Footprint and tags: OpenStreetMap</span><ImageSquare /><span>{state.result ? `${state.result.viewCountUsed ?? state.images.length} views analyzed` : `${state.images.length} views retrieved`} · Wikimedia Commons</span><Scan /><span>Interpretation: {state.result?.model || 'server-side vision pending'}</span></div>
          </>}
        </section>
      </div>
      <footer>
        <p>{state.result?.status === 'source-only' ? state.result.message : 'This is a visual approximation for scenario display, not an engineering or safety model.'}</p>
        {state.error && <button type="button" className="model-generation__retry" onClick={() => onRetry(asset)}>Try generation again</button>}
        {state.stage === 'complete' && <button type="button" className="model-generation__enter" onClick={onClose}><Eye /> Enter 3D lab</button>}
      </footer>
    </div>
  </div>, document.body);
}

function RangeField({ label, name, min, max, step, value, unit, onChange }) {
  return <Field label={label}>
    <div className="simulation-range">
      <input aria-label={label} name={name} type="range" min={min} max={max} step={step} value={value} onChange={onChange} />
      <output>{value}{unit}</output>
    </div>
  </Field>;
}

function InfrastructureImporter({ countries, country, setCountry, locationQuery, setLocationQuery, onLocationSearch, category, setCategory, assets, selectedAsset, selectAsset, loading, error, onRetry, retrievedAt, datasetUpdatedAt, source, generatedModel }) {
  return <div className="simulation-config-stack">
    <Field label="Country" note="Country codes: ISO 3166-1. Infrastructure: OpenStreetMap contributors.">
      <select value={country} onChange={(event) => setCountry(event.target.value)}>
        <option value="">Select a country</option>
        {countries.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
      </select>
    </Field>
    <form className="simulation-location-search" onSubmit={(event) => { event.preventDefault(); onLocationSearch(); }}>
      <Field label="Search city, district, airport or address" note="The infrastructure query will recenter on this verified geocoded location."><input value={locationQuery} onChange={(event) => setLocationQuery(event.target.value)} placeholder="Example: Indira Gandhi International Airport, Delhi" /></Field>
      <button type="submit" disabled={!country || loading}><MapPin /> Search this area</button>
    </form>
    <div className="simulation-categories" aria-label="Infrastructure category">
      {categories.map(([value, label]) => <button key={value} type="button" className={category === value ? 'is-active' : ''} onClick={() => setCategory(value)}>{label}</button>)}
    </div>
    {loading && <div className="simulation-loading"><SpinnerGap /><span>Searching mapped infrastructure…</span></div>}
    {error && <Notice type="error"><div><strong>Infrastructure data unavailable</strong><p>{error}</p><button className="simulation-retry" type="button" onClick={onRetry}>Try again</button></div></Notice>}
    {!country && <Notice><div><strong>Choose a country</strong><p>NAVIRA will query named, mapped features in the selected category.</p></div></Notice>}
    {country && !loading && !error && !assets.length && <Notice><div><strong>No returned features</strong><p>The source returned no matching named features. NAVIRA will not create substitutes.</p></div></Notice>}
    {!!assets.length && <div className="simulation-assets" role="listbox" aria-label="Imported infrastructure">
      <div className="simulation-assets__head"><span>{assets.length} returned features</span><small>maximum 30</small></div>
      {assets.map((asset) => <button key={asset.id} type="button" role="option" aria-selected={selectedAsset?.id === asset.id} className={selectedAsset?.id === asset.id ? 'is-selected' : ''} onClick={() => selectAsset(asset)}>
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
      {generatedModel?.assetId === selectedAsset.id && <div className="simulation-visual-record"><SourceBadge tone="assumption">Visual estimate</SourceBadge><p>{generatedModel.descriptor.summary}</p><span>{generatedModel.images?.length || 0} open image{generatedModel.images?.length === 1 ? '' : 's'} reviewed · {generatedModel.status === 'generated' ? generatedModel.model : 'mapped-source fallback'}</span></div>}
    </div>}
    {source && <div className="simulation-provenance">
      <SourceBadge>Imported</SourceBadge><span>{source.dataset}</span>
      <small>{source.queryScope}</small><a href={source.attributionUrl} target="_blank" rel="noreferrer">© OpenStreetMap contributors · ODbL</a>
      <small>OSM database timestamp: {datasetUpdatedAt ? time(datasetUpdatedAt) : 'Unavailable from search service'}</small>
      <small>Retrieved {time(retrievedAt)}</small>
    </div>}
  </div>;
}

function CustomBuilder({ values, setValues, footprint, setFootprint, selectedFace, setSelectedFace }) {
  const update = (event) => setValues((current) => ({ ...current, [event.target.name]: event.target.value }));
  const face = values.faceOverrides?.[selectedFace] || {};
  const updateFace = (key, value) => setValues((current) => ({
    ...current,
    faceOverrides: { ...current.faceOverrides, [selectedFace]: { ...(current.faceOverrides?.[selectedFace] || {}), [key]: value } },
  }));
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
    <section className="simulation-face-editor">
      <header><div><span>FAÇADE EDITOR</span><strong>{selectedFace} face</strong></div><small>Select a side in the viewport or use the controls below.</small></header>
      <div className="simulation-face-editor__faces" role="group" aria-label="Select building face">
        {['north', 'east', 'south', 'west', 'roof'].map((side) => <button key={side} type="button" className={selectedFace === side ? 'is-active' : ''} onClick={() => setSelectedFace(side)}>{side}</button>)}
      </div>
      <div className="simulation-face-editor__controls">
        <Field label="Surface color"><input type="color" value={face.primaryColor || '#c7c3bb'} onChange={(event) => updateFace('primaryColor', event.target.value)} /></Field>
        {selectedFace !== 'roof' && <>
          <Field label="Window pattern"><select value={face.windowPattern || 'grid'} onChange={(event) => updateFace('windowPattern', event.target.value)}><option value="grid">Regular grid</option><option value="horizontal-bands">Horizontal bands</option><option value="limited">Limited openings</option><option value="none">Solid wall</option></select></Field>
          <RangeField label="Glazing" name={`${selectedFace}-glazing`} min="0" max=".9" step=".05" value={face.glazingRatio ?? .42} onChange={(event) => updateFace('glazingRatio', Number(event.target.value))} />
          <Field label="Glass color"><input type="color" value={face.secondaryColor || '#273137'} onChange={(event) => updateFace('secondaryColor', event.target.value)} /></Field>
        </>}
      </div>
    </section>
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
  const [locationQuery, setLocationQuery] = useState('');
  const [appliedLocationQuery, setAppliedLocationQuery] = useState('');
  const [category, setCategory] = useState('hospitals');
  const [assets, setAssets] = useState([]);
  const [assetState, setAssetState] = useState({ loading: false, error: null, retrievedAt: null, datasetUpdatedAt: null, source: null });
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [generatedModel, setGeneratedModel] = useState(null);
  const [generation, setGeneration] = useState({ open: false, stage: 'locate', images: [], result: null, error: null, assemblyProgress: 0 });
  const [reloadKey, setReloadKey] = useState(0);
  const [sourceMode, setSourceMode] = useState('imported');
  const [custom, setCustom] = useState(customDefaults);
  const [selectedFace, setSelectedFace] = useState('south');
  const [footprint, setFootprint] = useState(initialFootprint);
  const [panel, setPanel] = useState('asset');
  const [panelOpen, setPanelOpen] = useState(true);
  const [scenario, setScenario] = useState(scenarioDefaults);
  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(false);
  const previousTime = useRef(null);
  const generationController = useRef(null);
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
    if (!country || sourceMode !== 'imported') { setAssets([]); setSelectedAsset(null); setGeneratedModel(null); return undefined; }
    const controller = new AbortController();
    setAssets([]);
    setSelectedAsset(null);
    setAssetState({ loading: true, error: null, retrievedAt: null, datasetUpdatedAt: null, source: null });
    const timer = window.setTimeout(() => {
      fetch(`/api/simulation/infrastructure?country=${encodeURIComponent(country)}&category=${encodeURIComponent(category)}&query=${encodeURIComponent(appliedLocationQuery)}`, { signal: controller.signal, cache: 'no-store' })
        .then(async (response) => {
          const payload = await response.json();
          if (!response.ok) throw new Error(payload.error || 'OpenStreetMap infrastructure is temporarily unavailable. Try again.');
          return payload;
        })
        .then((payload) => {
          setAssets(payload.assets || []);
          setSelectedAsset(null);
          setGeneratedModel(null);
          setAssetState({ loading: false, error: null, retrievedAt: payload.retrievedAt, datasetUpdatedAt: payload.datasetUpdatedAt, source: payload.source });
        })
        .catch((error) => {
          if (error.name !== 'AbortError') setAssetState({ loading: false, error: error.message, retrievedAt: null, datasetUpdatedAt: null, source: null });
        });
    }, 300);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [country, category, sourceMode, reloadKey, appliedLocationQuery]);

  useEffect(() => () => generationController.current?.abort(), []);

  const assembleGeneratedResult = async ({ result, mappedAsset, candidateImages, evidenceSource, evidenceToken, controller }) => {
    const acceptedIds = new Set(result.acceptedImageIds || []);
    const verifiedImages = acceptedIds.size ? candidateImages.filter((image) => acceptedIds.has(image.id)) : result.acceptedImages || [];
    if (result.status === 'needs-human-evidence') {
      setGeneration((current) => ({ ...current, stage: 'analysis', awaitingHuman: true, result, images: verifiedImages, evidenceToken, assemblyProgress: 0 }));
      return;
    }
    setGeneration((current) => ({ ...current, stage: 'geometry', awaitingHuman: false, result, images: verifiedImages, evidenceToken, assemblyProgress: 0 }));
    const ready = { ...result, assetId: mappedAsset.id, images: verifiedImages, evidenceSource };
    setGeneratedModel(ready);
    await new Promise((resolve) => {
      if (reducedMotion) { setGeneration((current) => ({ ...current, assemblyProgress: 1 })); resolve(); return; }
      const duration = 4200;
      let startedAt = null;
      const assemble = (now) => {
        if (controller.signal.aborted) { resolve(); return; }
        if (startedAt === null) startedAt = now;
        const next = Math.min(1, (now - startedAt) / duration);
        setGeneration((current) => ({ ...current, assemblyProgress: next }));
        if (next >= 1) resolve(); else window.requestAnimationFrame(assemble);
      };
      window.requestAnimationFrame(assemble);
    });
    if (!controller.signal.aborted) setGeneration((current) => ({ ...current, stage: 'complete', result, assemblyProgress: 1 }));
  };

  const selectAsset = async (asset) => {
    generationController.current?.abort();
    const controller = new AbortController();
    generationController.current = controller;
    setSelectedAsset(asset);
    setGeneratedModel(null);
    setPlaying(false);
    setProgress(0);
    setGeneration({ open: true, stage: 'locate', images: [], result: null, error: null, awaitingHuman: false, evidenceToken: null, evidenceSource: null, assemblyProgress: 0 });
    try {
      await new Promise((resolve) => window.setTimeout(resolve, reducedMotion ? 0 : 220));
      if (controller.signal.aborted) return;
      setGeneration((current) => ({ ...current, stage: 'imagery' }));
      const evidenceResponse = await fetch('/api/simulation/model-evidence', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(asset), signal: controller.signal,
      });
      const evidence = await evidenceResponse.json();
      if (!evidenceResponse.ok) throw new Error(evidence.error || 'Open location imagery could not be retrieved.');
      const mappedAsset = evidence.mappedAsset ? { ...asset, ...evidence.mappedAsset, source: asset.source } : asset;
      setSelectedAsset(mappedAsset);
      setGeneration((current) => ({ ...current, stage: 'analysis', images: [], evidenceToken: evidence.token, evidenceSource: evidence.source }));
      const modelResponse = await fetch('/api/simulation/model-generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ asset: mappedAsset, evidenceToken: evidence.token }), signal: controller.signal,
      });
      const result = await modelResponse.json();
      if (!modelResponse.ok) throw new Error(result.error || 'The visual model service could not complete the structure analysis.');
      await assembleGeneratedResult({ result, mappedAsset, candidateImages: evidence.images || [], evidenceSource: evidence.source, evidenceToken: evidence.token, controller });
    } catch (error) {
      if (error.name !== 'AbortError') setGeneration((current) => ({ ...current, error: error.message || 'Model generation failed.' }));
    }
  };

  const submitHumanEvidence = async (images) => {
    if (!selectedAsset || images.length < 6) return;
    generationController.current?.abort();
    const controller = new AbortController();
    generationController.current = controller;
    setGeneratedModel(null);
    setGeneration((current) => ({ ...current, stage: 'analysis', awaitingHuman: false, images: [], result: null, error: null, assemblyProgress: 0 }));
    try {
      const response = await fetch('/api/simulation/model-generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
        body: JSON.stringify({ asset: selectedAsset, evidenceToken: generation.evidenceToken, humanImages: images.map(({ name, dataUrl }) => ({ name, dataUrl })) }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'The uploaded exterior evidence could not be analyzed.');
      await assembleGeneratedResult({ result, mappedAsset: selectedAsset, candidateImages: images, evidenceSource: { provider: 'Human-supplied exterior evidence' }, evidenceToken: generation.evidenceToken, controller });
    } catch (error) {
      if (error.name !== 'AbortError') setGeneration((current) => ({ ...current, error: error.message || 'Uploaded evidence analysis failed.' }));
    }
  };

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
    if (!selectedAsset || generatedModel?.assetId !== selectedAsset.id) return null;
    const importedHeight = selectedAsset.imported.heightMeters;
    const importedLevels = selectedAsset.imported.levels;
    const descriptor = generatedModel.descriptor;
    const observedHeight = descriptor.targetVisibility !== 'not-visible' ? descriptor.heightMeters : null;
    const observedFloors = descriptor.targetVisibility !== 'not-visible' ? descriptor.floors : null;
    const terminalFootprint = selectedAsset.category === 'airports' ? selectedAsset.siteFeatures?.find((feature) => feature.type === 'terminal' && feature.geometry?.length >= 3)?.geometry : null;
    return {
      kind: 'imported', category: selectedAsset.category, name: selectedAsset.name, footprint: terminalFootprint || (selectedAsset.category === 'airports' ? [] : selectedAsset.geometry), siteFeatures: selectedAsset.siteFeatures || [], center: selectedAsset.center,
      height: importedHeight || (importedLevels ? importedLevels * 3 : null) || observedHeight || (observedFloors ? observedFloors * 3 : 12),
      floors: importedLevels || observedFloors || 3,
      material: selectedAsset.imported.material || descriptor.facade.material,
      roof: selectedAsset.imported.roofShape || descriptor.roof.type,
      visualDescriptor: descriptor,
      imagery: generatedModel.images,
      structuralLayout: 'unavailable',
      visualAssumptions: [
        !importedHeight && !importedLevels && observedHeight ? 'height visually estimated from open imagery' : null,
        !importedHeight && !importedLevels && !observedHeight ? '12 m display height' : null,
        !importedLevels && observedFloors ? 'floor count visually estimated from open imagery' : null,
        !importedLevels && !observedFloors ? '3 display floors' : null,
        selectedAsset.geometryType !== 'footprint' ? 'footprint unavailable; visual massing approximation' : null,
        selectedAsset.category === 'airports' && !terminalFootprint ? 'terminal footprint unavailable; airport-area boundary is not extruded' : null,
        selectedAsset.geometryMatch === 'proximity-only' ? 'nearby OSM footprint matched by proximity; identity unconfirmed' : null,
        selectedAsset.geometryMatch === 'name-and-proximity' ? 'OSM footprint matched from nearby name and proximity' : null,
        descriptor.targetVisibility === 'possible' ? 'image-to-asset match is possible, not confirmed' : null,
      ].filter(Boolean),
    };
  }, [sourceMode, selectedAsset, generatedModel, custom, footprint]);

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
          <SimulationViewport model={model} scenario={scenario} progress={progress} running={playing} reducedMotion={reducedMotion} editable={sourceMode === 'custom'} selectedFace={selectedFace} onFaceSelect={setSelectedFace} />
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
              ? <InfrastructureImporter {...{ countries, country, setCountry, locationQuery, setLocationQuery, onLocationSearch: () => setAppliedLocationQuery(locationQuery.trim()), category, setCategory, assets, selectedAsset, selectAsset, loading: assetState.loading, error: assetState.error, onRetry: () => setReloadKey((value) => value + 1), retrievedAt: assetState.retrievedAt, datasetUpdatedAt: assetState.datasetUpdatedAt, source: assetState.source, generatedModel }} />
              : <CustomBuilder values={custom} setValues={setCustom} footprint={footprint} setFootprint={setFootprint} selectedFace={selectedFace} setSelectedFace={setSelectedFace} />}
          </>}
          {panel === 'hazard' && <HazardPanel scenario={scenario} setScenario={setScenario} />}
          {panel === 'records' && <RecordsPanel data={data} mutate={mutate} />}
        </div>
      </aside>}
    </div>

    <footer className="simulation-lab__evidence">
      <div><span>MODEL BASIS</span><strong>{sourceMode === 'imported' ? selectedAsset ? generatedModel ? `${selectedAsset.source.dataset} + ${generatedModel.images.length} open images` : 'Awaiting visual reconstruction' : 'Data unavailable' : 'Operator-defined geometry'}</strong></div>
      <div><span>ENGINEERING PROPERTIES</span><strong>{sourceMode === 'imported' ? 'Unavailable unless present in source tags' : 'User-entered assumptions'}</strong></div>
      <div><span>OUTPUT STATUS</span><strong>Simulated visualization · no safety verdict</strong></div>
      <div><span>EXTENSION POINTS</span><strong>Dataset adapters · solver adapters · result layers</strong></div>
    </footer>
    <ModelGenerationDialog state={generation} asset={selectedAsset} previewModel={model} reducedMotion={reducedMotion} onClose={() => setGeneration((current) => ({ ...current, open: false }))} onRetry={selectAsset} onHumanEvidence={submitHumanEvidence} />
  </section>;
}
