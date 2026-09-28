import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowCounterClockwise, Buildings, CaretDown, CheckCircle, Cube, Database, Eye,
  Flask, Gauge, ImageSquare, Info, MapPin, Pause, Play, Plus, Scan, SidebarSimple,
  SpinnerGap, Warning, WarningCircle, X,
} from '@phosphor-icons/react';
import { useOperations } from '../operationsData';
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
const evidenceBasis = (images = []) => {
  const human = images.filter((image) => image.dataUrl || image.provider === 'Human-supplied evidence' || image.license === 'Supplied by operator').length;
  const open = Math.max(0, images.length - human);
  return [human ? `${human} operator upload${human === 1 ? '' : 's'}` : '', open ? `${open} open-source view${open === 1 ? '' : 's'}` : ''].filter(Boolean).join(' + ') || 'No reviewed imagery';
};
const clampPoint = (point) => ({ x: clamp(Number(point.x), .02, .98), y: clamp(Number(point.y), .02, .98) });
const edgeNormal = (points, index) => {
  const start = points[index];
  const end = points[(index + 1) % points.length];
  if (!start || !end) return { x: 0, y: 0 };
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy) || 1;
  const signedArea = points.reduce((sum, point, pointIndex) => {
    const next = points[(pointIndex + 1) % points.length];
    return sum + point.x * next.y - next.x * point.y;
  }, 0);
  return signedArea >= 0 ? { x: dy / length, y: -dx / length } : { x: -dy / length, y: dx / length };
};
const modelStages = [
  { id: 'locate', label: 'Lock mapped record', detail: 'Preserve coordinates, source tags, and footprint.' },
  { id: 'imagery', label: 'Retrieve visual evidence', detail: 'Search reusable Wikimedia Commons imagery near and by name.' },
  { id: 'review', label: 'Human evidence gate', detail: 'Approve, reject, and add evidence before any AI analysis.' },
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
      resolve({ id: `human-${Date.now()}-${index}`, name: file.name || `Evidence ${index + 1}`, title: file.name || `Evidence ${index + 1}`, dataUrl, thumbnailUrl: dataUrl, description: 'Human-supplied visual evidence', license: 'Supplied by operator' });
    };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`${file.name || 'An image'} could not be read.`)); };
    image.src = url;
  });
}

function ModelGenerationDialog({ state, asset, previewModel, reducedMotion, onClose, onRetry, onEvidenceReview }) {
  const closeButton = useRef(null);
  const [reviewItems, setReviewItems] = useState([]);
  const [reviewError, setReviewError] = useState(null);
  useEffect(() => {
    if (!state.open) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButton.current?.focus();
    const escape = (event) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', escape);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener('keydown', escape); };
  }, [state.open]);
  useEffect(() => {
    if (!state.awaitingReview) return;
    setReviewItems((state.images || []).map((image) => ({ ...image, decision: image.preapproved ? 'approved' : 'pending' })));
    setReviewError(null);
  }, [state.reviewKey, state.awaitingReview]);
  if (!state.open || !asset) return null;
  const activeIndex = state.error ? -1 : modelStages.findIndex((item) => item.id === state.stage);
  const descriptor = state.result?.descriptor;
  const assembling = (state.stage === 'geometry' || state.stage === 'complete') && previewModel;
  const approvedCount = reviewItems.filter((image) => image.decision === 'approved').length;
  const rejectedCount = reviewItems.filter((image) => image.decision === 'rejected').length;
  const decide = (id, decision) => setReviewItems((current) => {
    if (decision === 'approved' && current.filter((image) => image.decision === 'approved' && image.id !== id).length >= 15) {
      setReviewError('The vision run accepts a maximum of 15 approved images. Reject or deselect another image first.');
      return current;
    }
    setReviewError(null);
    return current.map((image) => image.id === id ? { ...image, decision } : image);
  });
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
            const needsInput = state.awaitingReview && item.id === 'review';
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
            <span>{state.error ? 'PIPELINE INTERRUPTED' : state.awaitingReview ? 'MANDATORY HUMAN EVIDENCE GATE' : assembling ? state.stage === 'complete' ? 'MODEL ASSEMBLED' : 'LIVE GEOMETRY ASSEMBLY' : 'GROUNDED VISUAL ANALYSIS'}</span>
            <strong>{state.error ? 'The model could not be completed' : state.awaitingReview ? 'Approve every useful view and reject everything that should not reach the model' : assembling ? assemblyLabel : 'AI is checking only the evidence you approved'}</strong>
          </div>
          {state.error ? <div className="model-generation__error"><WarningCircle /><div><strong>Generation unavailable</strong><p>{state.error}</p><p>The current structure will not be replaced with invented detail.</p></div></div> : <>
            {state.awaitingReview ? <div className="model-generation__review">
              <div className="model-generation__human-copy"><div><SourceBadge tone="assumption">Human approval required</SourceBadge><h3>Build the evidence set</h3><p>{state.result?.message || 'Nothing is sent to AI until you approve it.'} Exterior elevations, corners, aerial views, and clearly identified site plans can be useful. Reject interiors, unrelated places, and images where the selected asset cannot be identified.</p></div><strong>{approvedCount}/15</strong></div>
              <div className="model-generation__review-summary"><span><b>{approvedCount}</b> approved</span><span><b>{rejectedCount}</b> rejected</span><span><b>{reviewItems.length - approvedCount - rejectedCount}</b> pending</span></div>
              <label className="model-generation__upload"><input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" multiple onChange={async (event) => {
                setReviewError(null);
                try {
                  const files = [...(event.target.files || [])].slice(0, 15);
                  const prepared = await Promise.all(files.map((file, index) => prepareHumanEvidence(file, reviewItems.length + index)));
                  setReviewItems((current) => {
                    const available = Math.max(0, 30 - current.length);
                    return [...current, ...prepared.slice(0, available).map((image) => ({ ...image, decision: 'pending' }))];
                  });
                } catch (error) { setReviewError(error.message); }
                event.target.value = '';
              }} /><ImageSquare /><span><strong>Take or upload more evidence</strong><small>Exterior, aerial, or site-plan images · JPEG, PNG, WebP</small></span></label>
              {reviewItems.length > 0 ? <div className="model-generation__review-grid">{reviewItems.map((image) => <article key={image.id} data-decision={image.decision}>
                <div className="model-generation__review-image"><img src={image.thumbnailUrl} alt={image.description || image.title} />{image.sourceUrl && <a href={image.sourceUrl} target="_blank" rel="noreferrer">Open source</a>}</div>
                <div className="model-generation__review-meta"><strong>{image.title}</strong><small>{image.dataUrl ? 'Human upload' : image.license || 'Open-source candidate'}</small></div>
                <div className="model-generation__review-actions"><button type="button" className={image.decision === 'approved' ? 'is-approved' : ''} onClick={() => decide(image.id, 'approved')}><CheckCircle /> Approve</button><button type="button" className={image.decision === 'rejected' ? 'is-rejected' : ''} onClick={() => decide(image.id, 'rejected')}><X /> Reject</button></div>
              </article>)}</div> : <div className="model-generation__waiting"><ImageSquare /><span>No open candidates were returned. Upload at least six identifiable exterior, aerial, or site-plan views.</span></div>}
              {reviewError && <p className="model-generation__human-error">{reviewError}</p>}
              <button className="model-generation__human-submit" type="button" disabled={approvedCount < 6} onClick={() => onEvidenceReview(reviewItems.filter((image) => image.decision === 'approved').slice(0, 15))}>Send {approvedCount} approved views to AI</button>
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
            <div className="model-generation__source"><Database /><span>Footprint and tags: OpenStreetMap</span><ImageSquare /><span>{state.result ? `${state.result.viewCountUsed ?? state.images.length} views analyzed` : `${state.images.length} views retrieved`} · {evidenceBasis(state.images)}</span><Scan /><span>Interpretation: {state.result?.model || 'server-side vision pending'}</span></div>
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
      {generatedModel?.assetId === selectedAsset.id && <div className="simulation-visual-record"><SourceBadge tone="assumption">Visual estimate</SourceBadge><p>{generatedModel.descriptor.summary}</p><span>{evidenceBasis(generatedModel.images)} reviewed · {generatedModel.status === 'generated' ? generatedModel.model : 'mapped-source fallback'}</span></div>}
    </div>}
    {source && <div className="simulation-provenance">
      <SourceBadge>Imported</SourceBadge><span>{source.dataset}</span>
      <small>{source.queryScope}</small><a href={source.attributionUrl} target="_blank" rel="noreferrer">© OpenStreetMap contributors · ODbL</a>
      <small>OSM database timestamp: {datasetUpdatedAt ? time(datasetUpdatedAt) : 'Unavailable from search service'}</small>
      <small>Retrieved {time(retrievedAt)}</small>
    </div>}
  </div>;
}

function CustomBuilder({ values, setValues, footprint, selectedFace, setSelectedFace, modelerMode, setModelerMode, modelerSelection, onModelerSelect, onModelerAction, canUndo }) {
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
    <ModelerToolbar mode={modelerMode} setMode={setModelerMode} selection={modelerSelection ? { ...modelerSelection, vertexCount: footprint.length } : null} elementCount={footprint.length} onSelect={onModelerSelect} onAction={onModelerAction} canUndo={canUndo} />
    <Field label="Structure name"><input name="name" value={values.name} onChange={update} /></Field>
    <div className="simulation-modeler-readout">
      <div><span>3D TOPOLOGY</span><strong>{footprint.length} vertices · {footprint.length} edges</strong></div>
      <p>Edit the structure directly in the viewport. Select vertices, edges, façades, or the roof; then drag the highlighted handle or use the precision actions.</p>
    </div>
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

function ModelerToolbar({ mode, setMode, selection, elementCount, onSelect, onAction, canUndo }) {
  const selectedLabel = selection?.type === 'vertex' ? `Vertex ${selection.index + 1}`
    : selection?.type === 'edge' ? `Edge ${selection.index + 1}`
      : selection?.type === 'face' ? `${selection.faceId || 'Side'} face`
        : selection?.type === 'roof' ? 'Roof plane' : 'Nothing selected';
  return <div className="simulation-modeler" aria-label="Direct 3D modelling tools">
    <div className="simulation-modeler__modes" role="toolbar" aria-label="Selection mode">
      {['select', 'vertex', 'edge', 'face', 'roof'].map((item) => <button key={item} type="button" className={mode === item ? 'is-active' : ''} onClick={() => setMode(item)}>{item}</button>)}
    </div>
    {['vertex', 'edge', 'face'].includes(mode) && <div className="simulation-modeler__elements" aria-label={`Select ${mode}`}>
      {Array.from({ length: elementCount }, (_, index) => <button key={index} type="button" className={selection?.type === mode && selection.index === index ? 'is-active' : ''} onClick={() => onSelect({ type: mode, index })}>{mode === 'vertex' ? 'V' : mode === 'edge' ? 'E' : 'F'}{index + 1}</button>)}
    </div>}
    {mode === 'roof' && <div className="simulation-modeler__elements"><button type="button" className={selection?.type === 'roof' ? 'is-active' : ''} onClick={() => onSelect({ type: 'roof', faceId: 'roof' })}>Roof plane</button></div>}
    <div className="simulation-modeler__selection"><span>ACTIVE ELEMENT</span><strong>{selectedLabel}</strong><small>{mode === 'vertex' ? 'Drag the red point across the ground plane.' : mode === 'edge' || mode === 'face' ? 'Drag perpendicular to extend or intrude the footprint.' : mode === 'roof' ? 'Drag vertically to change the extrusion height.' : 'Choose an edit mode, then select geometry.'}</small></div>
    <div className="simulation-modeler__actions">
      {(selection?.type === 'edge' || selection?.type === 'face') && <>
        <button type="button" onClick={() => onAction('pull-out')}>Pull out</button>
        <button type="button" onClick={() => onAction('push-in')}>Push in</button>
      </>}
      {selection?.type === 'edge' && <>
        <button type="button" onClick={() => onAction('insert-vertex')}><Plus /> Add vertex</button>
        <button type="button" onClick={() => onAction('bend-out')}>Bend out</button>
        <button type="button" onClick={() => onAction('bend-in')}>Bend in</button>
      </>}
      {selection?.type === 'vertex' && <button type="button" onClick={() => onAction('delete-vertex')} disabled={selection.vertexCount <= 3}>Delete vertex</button>}
      {selection?.type === 'roof' && <>
        <button type="button" onClick={() => onAction('raise')}>Raise</button>
        <button type="button" onClick={() => onAction('lower')}>Lower</button>
      </>}
      <button type="button" onClick={() => onAction('undo')} disabled={!canUndo}><ArrowCounterClockwise /> Undo</button>
      <button type="button" onClick={() => onAction('reset')}>Reset mesh</button>
    </div>
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
    <Notice><div><strong>Scenario parameters are operator supplied</strong><p>No live hazard measurement is attached to this run. Water motion and post-threshold falling use real-time simulation, while hydrodynamic loads, failure onset, deformation, crack growth, and debris remain visual heuristics—not CFD, finite-element, or code-compliance results.</p></div></Notice>
    <div className="simulation-layer-key">
      <div><i className="is-stress" /><span><strong>Geometry sensitivity</strong><small>Corner, support, and façade-discontinuity heuristic</small></span></div>
      <div><i className="is-crack" /><span><strong>Illustrative crack onset</strong><small>Anchored to mapped/modelled surfaces; no fracture solver</small></span></div>
      <div><i className="is-hazard" /><span><strong>Hazard field</strong><small>Driven by entered scenario values</small></span></div>
      <div><i className="is-failure" /><span><strong>Rigid-body failure</strong><small>Physics takes over only after the assumed extreme-load threshold</small></span></div>
    </div>
  </div>;
}

function ComparisonPanel({ enabled, onToggle, model, values, setValues, cameraLinked, setCameraLinked, differences, onSave, saveState, saved }) {
  const update = (event) => setValues((current) => ({ ...current, [event.target.name]: event.target.value }));
  return <div className="simulation-config-stack comparison-config">
    <Notice type="info"><div><strong>Same building. Same disaster. Two designs.</strong><p>Design B begins as a duplicate of Design A. Both viewports share the exact hazard parameters and simulation clock. Only the listed design parameters differ.</p></div></Notice>
    <button className={`simulation-primary-button ${enabled ? 'is-active' : ''}`} type="button" onClick={onToggle} disabled={!model}>{enabled ? 'Return to single simulation' : 'Duplicate as Design B'}</button>
    {enabled && <>
      <div className="simulation-field-pair"><Field label="Design B height"><div className="simulation-unit-input"><input name="height" type="number" min="1" max="300" step=".1" value={values.height} onChange={update} /><span>m</span></div></Field><Field label="Design B floors"><input name="floors" type="number" min="1" max="120" value={values.floors} onChange={update} /></Field></div>
      <Field label="Design B roof"><select name="roof" value={values.roof} onChange={update}><option value="flat">Flat</option><option value="gable">Gable</option><option value="hip">Hip</option><option value="dome">Dome</option><option value="vaulted">Vaulted</option><option value="sawtooth">Sawtooth</option></select></Field>
      <Field label="Design B display material"><select name="material" value={values.material} onChange={update}><option value="reinforced concrete">Reinforced concrete</option><option value="structural steel">Structural steel</option><option value="masonry">Masonry</option><option value="timber">Timber</option><option value="mixed">Mixed</option></select><small>Display assumption only unless supplied by the imported record.</small></Field>
      <label className="comparison-camera-toggle"><input type="checkbox" checked={cameraLinked} onChange={(event) => setCameraLinked(event.target.checked)} /><span><strong>Synchronized cameras</strong><small>Orbit, pan, and zoom either viewport to move both. Disable for independent inspection.</small></span></label>
      <section className="comparison-differences"><span>PARAMETER DIFFERENCES</span>{differences.length ? differences.map((item) => <div key={item.label}><b>{item.label}</b><span>{item.a}</span><i>to</i><strong>{item.b}</strong></div>) : <p>Design B currently matches Design A.</p>}</section>
      <form className="comparison-save" onSubmit={onSave}><Field label="Comparison name"><input name="name" required maxLength="180" placeholder="Scenario comparison name" /></Field><button className="simulation-primary-button" type="submit" disabled={saveState.busy}>{saveState.busy ? <SpinnerGap className="spin" /> : <Database />} Save comparison</button>{saveState.error && <p className="simulation-inline-error">{saveState.error}</p>}{saveState.success && <p className="simulation-inline-success">{saveState.success}</p>}</form>
      {saved.length > 0 && <div className="comparison-saved"><span>SAVED COMPARISONS</span>{saved.slice(0, 6).map((item) => <article key={item.id}><strong>{item.name}</strong><small>{time(item.createdAt)} · {item.disclaimer}</small></article>)}</div>}
    </>}
    <Notice><div><strong>Observable outputs only</strong><p>The comparison synchronizes deformation, affected geometry, flooding, wind, cracks, debris, and other existing visual layers. It does not produce safety, compliance, collapse-probability, or structural-soundness conclusions.</p></div></Notice>
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
  const [generation, setGeneration] = useState({ open: false, stage: 'locate', images: [], result: null, error: null, awaitingReview: false, reviewKey: null, evidenceToken: null, evidenceSource: null, assemblyProgress: 0 });
  const [reloadKey, setReloadKey] = useState(0);
  const [sourceMode, setSourceMode] = useState('imported');
  const [custom, setCustom] = useState(customDefaults);
  const [selectedFace, setSelectedFace] = useState('south');
  const [footprint, setFootprint] = useState(initialFootprint);
  const [modelerMode, setModelerMode] = useState('select');
  const [modelerSelection, setModelerSelection] = useState(null);
  const [geometryHistory, setGeometryHistory] = useState([]);
  const [panel, setPanel] = useState('asset');
  const [panelOpen, setPanelOpen] = useState(true);
  const [scenario, setScenario] = useState(scenarioDefaults);
  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [comparisonMode, setComparisonMode] = useState(false);
  const [designB, setDesignB] = useState({ height: 15, floors: 5, roof: 'flat', material: 'reinforced concrete' });
  const [cameraLinked, setCameraLinked] = useState(true);
  const [sharedCamera, setSharedCamera] = useState(null);
  const [comparisonSave, setComparisonSave] = useState({ busy: false, error: null, success: null });
  const previousTime = useRef(null);
  const generationController = useRef(null);
  const reviewSubmitting = useRef(false);
  const geometryDragActive = useRef(false);
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

  const geometrySnapshot = () => ({ footprint: footprint.map((point) => ({ ...point })), height: Number(custom.height) || 15 });
  const rememberGeometry = () => setGeometryHistory((current) => [...current.slice(-23), geometrySnapshot()]);
  const beginGeometryEdit = () => {
    if (geometryDragActive.current) return;
    geometryDragActive.current = true;
    rememberGeometry();
  };
  const endGeometryEdit = () => { geometryDragActive.current = false; };
  const updateGeometryFromViewport = ({ footprint: nextFootprint, height }) => {
    if (Array.isArray(nextFootprint) && nextFootprint.length >= 3) setFootprint(nextFootprint.map(clampPoint));
    if (Number.isFinite(height)) setCustom((current) => ({ ...current, height: Math.round(clamp(height, 1, 180) * 10) / 10 }));
  };
  const applyModelerAction = (action) => {
    if (action === 'undo') {
      setGeometryHistory((current) => {
        const previous = current.at(-1);
        if (!previous) return current;
        setFootprint(previous.footprint.map((point) => ({ ...point })));
        setCustom((value) => ({ ...value, height: previous.height }));
        setModelerSelection(null);
        return current.slice(0, -1);
      });
      return;
    }
    if (action === 'reset') {
      rememberGeometry();
      setFootprint(initialFootprint.map((point) => ({ ...point })));
      setCustom((current) => ({ ...current, height: customDefaults.height }));
      setModelerSelection(null);
      return;
    }
    if (!modelerSelection) return;
    if (['raise', 'lower'].includes(action) && modelerSelection.type === 'roof') {
      rememberGeometry();
      setCustom((current) => ({ ...current, height: clamp(Number(current.height) + (action === 'raise' ? 1 : -1), 1, 180) }));
      return;
    }
    const edgeIndex = modelerSelection.index;
    if ((modelerSelection.type === 'edge' || modelerSelection.type === 'face') && Number.isInteger(edgeIndex)) {
      const normal = edgeNormal(footprint, edgeIndex);
      if (['pull-out', 'push-in'].includes(action)) {
        rememberGeometry();
        const amount = action === 'pull-out' ? .035 : -.035;
        setFootprint((current) => current.map((point, index) => (index === edgeIndex || index === (edgeIndex + 1) % current.length) ? clampPoint({ x: point.x + normal.x * amount, y: point.y + normal.y * amount }) : point));
        return;
      }
      if (modelerSelection.type === 'edge' && ['insert-vertex', 'bend-out', 'bend-in'].includes(action) && footprint.length < 24) {
        rememberGeometry();
        const start = footprint[edgeIndex];
        const end = footprint[(edgeIndex + 1) % footprint.length];
        const amount = action === 'bend-out' ? .055 : action === 'bend-in' ? -.055 : 0;
        const vertex = clampPoint({ x: (start.x + end.x) / 2 + normal.x * amount, y: (start.y + end.y) / 2 + normal.y * amount });
        const next = [...footprint];
        next.splice(edgeIndex + 1, 0, vertex);
        setFootprint(next);
        setModelerMode('vertex');
        setModelerSelection({ type: 'vertex', index: edgeIndex + 1 });
        return;
      }
    }
    if (action === 'delete-vertex' && modelerSelection.type === 'vertex' && footprint.length > 3) {
      rememberGeometry();
      setFootprint((current) => current.filter((_, index) => index !== modelerSelection.index));
      setModelerSelection(null);
    }
  };

  const assembleGeneratedResult = async ({ result, mappedAsset, candidateImages, evidenceSource, evidenceToken, controller }) => {
    const completedResult = result.status === 'needs-human-evidence'
      ? {
        ...result,
        status: 'source-only',
        message: result.message || 'AI retained too little visual evidence for a grounded reconstruction. Mapped geometry remains the model basis.',
      }
      : result;
    const acceptedIds = new Set(completedResult.acceptedImageIds || []);
    const candidateById = new Map(candidateImages.map((image) => [String(image.id), image]));
    const serverById = new Map((completedResult.acceptedImages || []).map((image) => [String(image.id), image]));
    const verifiedImages = acceptedIds.size
      ? [...acceptedIds].map((id) => candidateById.get(String(id)) || serverById.get(String(id))).filter(Boolean)
      : completedResult.acceptedImages || [];
    setGeneration((current) => ({ ...current, stage: 'geometry', awaitingReview: false, result: completedResult, images: verifiedImages, evidenceToken, assemblyProgress: 0 }));
    const ready = { ...completedResult, assetId: mappedAsset.id, images: verifiedImages, evidenceSource };
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
    if (!controller.signal.aborted) setGeneration((current) => ({ ...current, stage: 'complete', result: completedResult, awaitingReview: false, assemblyProgress: 1 }));
  };

  const selectAsset = async (asset) => {
    generationController.current?.abort();
    reviewSubmitting.current = false;
    const controller = new AbortController();
    generationController.current = controller;
    setSelectedAsset(asset);
    setGeneratedModel(null);
    setPlaying(false);
    setProgress(0);
    setGeneration({ open: true, stage: 'locate', images: [], result: null, error: null, awaitingReview: false, reviewKey: null, evidenceToken: null, evidenceSource: null, assemblyProgress: 0 });
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
      setGeneration((current) => ({
        ...current,
        stage: 'review',
        awaitingReview: true,
        images: evidence.images || [],
        evidenceToken: evidence.token,
        evidenceSource: evidence.source,
        result: null,
        reviewKey: evidence.token || `review-${Date.now()}`,
      }));
    } catch (error) {
      if (error.name !== 'AbortError') setGeneration((current) => ({ ...current, error: error.message || 'Model generation failed.' }));
    }
  };

  const submitEvidenceReview = async (images) => {
    if (!selectedAsset || images.length < 6 || reviewSubmitting.current) return;
    reviewSubmitting.current = true;
    generationController.current?.abort();
    const controller = new AbortController();
    generationController.current = controller;
    setGeneratedModel(null);
    const approvedImageIds = images.filter((image) => !image.dataUrl).map((image) => image.id);
    const humanImages = images.filter((image) => image.dataUrl).map(({ name, title, dataUrl }) => ({ name: name || title, dataUrl }));
    setGeneration((current) => ({ ...current, stage: 'analysis', awaitingReview: false, images, result: null, error: null, assemblyProgress: 0 }));
    try {
      const response = await fetch('/api/simulation/model-generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
        body: JSON.stringify({ asset: selectedAsset, evidenceToken: generation.evidenceToken, approvedImageIds, humanImages }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'The approved visual evidence could not be analyzed.');
      await assembleGeneratedResult({ result, mappedAsset: selectedAsset, candidateImages: images, evidenceSource: generation.evidenceSource || { provider: 'Human-reviewed visual evidence' }, evidenceToken: generation.evidenceToken, controller });
    } catch (error) {
      if (error.name !== 'AbortError') setGeneration((current) => ({ ...current, error: error.message || 'Approved evidence analysis failed.' }));
    } finally {
      if (generationController.current === controller) reviewSubmitting.current = false;
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

  useEffect(() => {
    if (!model) { setComparisonMode(false); return; }
    setDesignB({ height: Number(model.height) || 12, floors: Number(model.floors) || 1, roof: model.roof || 'flat', material: model.material || 'mixed' });
    setSharedCamera(null);
  }, [model?.name, model?.kind, selectedAsset?.id]);

  const comparisonModel = useMemo(() => model && comparisonMode ? {
    ...model,
    name: `${model.name || 'Structure'} · Design B`,
    height: clamp(Number(designB.height) || Number(model.height) || 12, 1, 300),
    floors: clamp(Math.round(Number(designB.floors) || Number(model.floors) || 1), 1, 120),
    roof: designB.roof,
    material: designB.material,
    visualAssumptions: [...new Set([...(model.visualAssumptions || []), 'Design B parameters entered for visual comparison'])],
  } : null, [model, comparisonMode, designB]);
  const comparisonDifferences = useMemo(() => {
    if (!model || !comparisonModel) return [];
    return [
      { label: 'Height', a: `${Number(model.height).toFixed(1)} m`, b: `${Number(comparisonModel.height).toFixed(1)} m`, changed: Number(model.height) !== Number(comparisonModel.height) },
      { label: 'Floors', a: String(model.floors || 1), b: String(comparisonModel.floors || 1), changed: Number(model.floors || 1) !== Number(comparisonModel.floors || 1) },
      { label: 'Roof', a: model.roof || 'unavailable', b: comparisonModel.roof || 'unavailable', changed: model.roof !== comparisonModel.roof },
      { label: 'Material display', a: model.material || 'unavailable', b: comparisonModel.material || 'unavailable', changed: model.material !== comparisonModel.material },
    ].filter((item) => item.changed);
  }, [model, comparisonModel]);

  const phase = progress === 0 ? 'before' : progress >= 1 ? 'after' : 'during';
  const displayedSeconds = Math.round(Number(scenario.duration) * progress * 10) / 10;
  const run = () => { setProgress(0); requestAnimationFrame(() => setPlaying(true)); };
  const reset = () => { setPlaying(false); setProgress(0); };
  const toggleComparison = () => {
    if (!model) return;
    if (!comparisonMode) {
      setDesignB({ height: Number(model.height) || 12, floors: Number(model.floors) || 1, roof: model.roof || 'flat', material: model.material || 'mixed' });
      setSharedCamera(null);
    }
    setComparisonMode((current) => !current);
    setProgress(0);
    setPlaying(false);
    setPanel('comparison');
  };
  const saveComparison = async (event) => {
    event.preventDefault();
    if (!model || !comparisonModel) return;
    setComparisonSave({ busy: true, error: null, success: null });
    const summary = (value) => ({
      name: value.name || 'Structure', kind: value.kind, category: value.category || 'building',
      height: Number(value.height) || null, floors: Number(value.floors) || null, roof: value.roof || null,
      material: value.material || null, footprint: Array.isArray(value.footprint) ? value.footprint.slice(0, 64) : [],
      visualAssumptions: value.visualAssumptions || [],
    });
    try {
      await mutate('comparison-save', {
        name: new FormData(event.currentTarget).get('name'), buildingId: selectedAsset?.id || null,
        disaster: { ...scenario }, designA: summary(model), designB: summary(comparisonModel),
      });
      event.currentTarget.reset();
      setComparisonSave({ busy: false, error: null, success: 'Comparison saved to the active operational context.' });
    } catch (error) { setComparisonSave({ busy: false, error: error.message, success: null }); }
  };
  const selectModelElement = (selection) => {
    setModelerSelection(selection);
    if (selection?.faceId) setSelectedFace(selection.faceId);
  };

  return <section className={`simulation-lab ${panelOpen ? 'has-panel' : 'is-panel-closed'} ${comparisonMode ? 'is-comparing' : ''}`}>
    <header className="simulation-lab__header">
      <div><span>NAVIRA / {entry === 'infrastructure' ? 'INFRASTRUCTURE LAB' : 'SIMULATION LAB'}</span><h1>Test infrastructure against a controlled hazard scenario.</h1></div>
      <div className="simulation-lab__truth"><SourceBadge tone={sourceMode === 'imported' ? 'source' : 'assumption'}>{sourceMode === 'imported' ? 'Imported asset' : 'Built model'}</SourceBadge><p>Visualization only. No structural safety or collapse determination.</p>{model && <button type="button" onClick={toggleComparison}>{comparisonMode ? 'Single simulation' : 'Compare Design A / B'}</button>}</div>
    </header>

    <div className="simulation-lab__workspace">
      <main className="simulation-viewport">
        <div className="simulation-viewport__topline">
          <div><span>3D TEST CHAMBER</span><strong>{model?.name || 'No infrastructure selected'}</strong></div>
          <div className="simulation-phase" data-phase={phase}><i />{phase}</div>
          {!panelOpen && <button className="simulation-panel-open" type="button" onClick={() => setPanelOpen(true)}><SidebarSimple /> Configure</button>}
        </div>
        <div className={`simulation-viewport__stage ${comparisonMode ? 'simulation-viewport__stage--comparison' : ''}`}>
          <div className="comparison-viewport comparison-viewport--a">{comparisonMode && <div className="comparison-viewport__label"><span>DESIGN A</span><strong>{model?.name || 'Source design'}</strong></div>}<SimulationViewport
            model={model} scenario={scenario} progress={progress} running={playing} reducedMotion={reducedMotion}
            editable={sourceMode === 'custom' && progress === 0} selectedFace={selectedFace} onFaceSelect={setSelectedFace}
            modelerMode={modelerMode} selectedElement={modelerSelection} onElementSelect={selectModelElement}
            onGeometryEditStart={beginGeometryEdit} onGeometryEditEnd={endGeometryEdit} onGeometryChange={updateGeometryFromViewport}
            cameraState={cameraLinked ? sharedCamera : null} onCameraChange={cameraLinked ? setSharedCamera : undefined} viewportId="design-a"
          /></div>
          {comparisonMode && <div className="comparison-viewport comparison-viewport--b"><div className="comparison-viewport__label"><span>DESIGN B</span><strong>{comparisonDifferences.length} changed parameter{comparisonDifferences.length === 1 ? '' : 's'}</strong></div><SimulationViewport model={comparisonModel} scenario={scenario} progress={progress} running={playing} reducedMotion={reducedMotion} cameraState={cameraLinked ? sharedCamera : null} onCameraChange={cameraLinked ? setSharedCamera : undefined} viewportId="design-b" /></div>}
          {!model && <div className="simulation-viewport__empty"><Cube /><strong>Select or build infrastructure</strong><p>The viewport will remain empty until a sourced feature or valid custom footprint is available.</p></div>}
          <div className="simulation-viewport__telemetry">
            <div><span>Hazard</span><strong>{scenario.type === 'wind' ? 'Extreme wind' : scenario.type}</strong></div>
            <div><span>Simulation time</span><strong>{displayedSeconds.toFixed(1)} s</strong></div>
            <div><span>Response model</span><strong>{scenario.type === 'flood' ? 'Surge + rigid impact' : scenario.type === 'earthquake' ? 'Ground motion + rigid failure' : 'Gust + rigid failure'}</strong></div>
            {comparisonMode && <div><span>Camera</span><strong>{cameraLinked ? 'Synchronized A / B' : 'Independent inspection'}</strong></div>}
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
          <button className="simulation-run" type="button" onClick={run} disabled={!model}><Flask /> {comparisonMode ? 'Run both designs' : 'Run simulation'}</button>
        </div>
      </main>

      {panelOpen && <aside className="simulation-panel">
        <div className="simulation-panel__head"><div><span>CONFIGURATION</span><strong>{panel === 'asset' ? 'Infrastructure' : panel === 'hazard' ? 'Hazard scenario' : panel === 'comparison' ? 'Scenario comparison' : 'Accountable records'}</strong></div><button type="button" aria-label="Close configuration panel" onClick={() => setPanelOpen(false)}><X /></button></div>
        <nav className="simulation-panel__tabs" aria-label="Lab configuration">
          <button type="button" className={panel === 'asset' ? 'is-active' : ''} onClick={() => setPanel('asset')}><Buildings /> Asset</button>
          <button type="button" className={panel === 'hazard' ? 'is-active' : ''} onClick={() => setPanel('hazard')}><Warning /> Hazard</button>
          <button type="button" className={panel === 'comparison' ? 'is-active' : ''} onClick={() => setPanel('comparison')}><Cube /> Compare</button>
          <button type="button" className={panel === 'records' ? 'is-active' : ''} onClick={() => setPanel('records')}><Database /> Records</button>
        </nav>
        <div className="simulation-panel__body">
          {panel === 'asset' && <>
            <div className="simulation-mode-switch"><button type="button" className={sourceMode === 'imported' ? 'is-active' : ''} onClick={() => setSourceMode('imported')}>Real infrastructure</button><button type="button" className={sourceMode === 'custom' ? 'is-active' : ''} onClick={() => setSourceMode('custom')}>Build your own</button></div>
            {sourceMode === 'imported'
              ? <InfrastructureImporter {...{ countries, country, setCountry, locationQuery, setLocationQuery, onLocationSearch: () => setAppliedLocationQuery(locationQuery.trim()), category, setCategory, assets, selectedAsset, selectAsset, loading: assetState.loading, error: assetState.error, onRetry: () => setReloadKey((value) => value + 1), retrievedAt: assetState.retrievedAt, datasetUpdatedAt: assetState.datasetUpdatedAt, source: assetState.source, generatedModel }} />
              : <CustomBuilder values={custom} setValues={setCustom} footprint={footprint} selectedFace={selectedFace} setSelectedFace={setSelectedFace} modelerMode={modelerMode} setModelerMode={setModelerMode} modelerSelection={modelerSelection} onModelerSelect={selectModelElement} onModelerAction={applyModelerAction} canUndo={geometryHistory.length > 0} />}
          </>}
          {panel === 'hazard' && <HazardPanel scenario={scenario} setScenario={setScenario} />}
          {panel === 'comparison' && <ComparisonPanel enabled={comparisonMode} onToggle={toggleComparison} model={model} values={designB} setValues={setDesignB} cameraLinked={cameraLinked} setCameraLinked={setCameraLinked} differences={comparisonDifferences} onSave={saveComparison} saveState={comparisonSave} saved={data.comparisonScenarios || []} />}
          {panel === 'records' && <RecordsPanel data={data} mutate={mutate} />}
        </div>
      </aside>}
    </div>

    <footer className="simulation-lab__evidence">
      <div><span>MODEL BASIS</span><strong>{sourceMode === 'imported' ? selectedAsset ? generatedModel ? `${selectedAsset.source.dataset} + ${evidenceBasis(generatedModel.images)}` : 'Awaiting visual reconstruction' : 'Data unavailable' : 'Operator-defined geometry'}</strong></div>
      <div><span>ENGINEERING PROPERTIES</span><strong>{sourceMode === 'imported' ? 'Unavailable unless present in source tags' : 'User-entered assumptions'}</strong></div>
      <div><span>OUTPUT STATUS</span><strong>Simulated visualization · no safety verdict</strong></div>
      <div><span>EXTENSION POINTS</span><strong>Dataset adapters · solver adapters · result layers</strong></div>
    </footer>
    <ModelGenerationDialog state={generation} asset={selectedAsset} previewModel={model} reducedMotion={reducedMotion} onClose={() => setGeneration((current) => ({ ...current, open: false }))} onRetry={selectAsset} onEvidenceReview={submitEvidenceReview} />
  </section>;
}
