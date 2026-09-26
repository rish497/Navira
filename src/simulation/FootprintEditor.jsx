import { ArrowCounterClockwise, Polygon, Trash } from '@phosphor-icons/react';

const toSvg = (point) => `${Math.round(point.x * 1000) / 10},${Math.round(point.y * 1000) / 10}`;

export default function FootprintEditor({ points, onChange }) {
  const addPoint = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    onChange([...points, {
      x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
    }]);
  };

  const preset = (shape) => {
    if (shape === 'l') {
      onChange([{ x: .18, y: .18 }, { x: .82, y: .18 }, { x: .82, y: .48 }, { x: .52, y: .48 }, { x: .52, y: .82 }, { x: .18, y: .82 }]);
      return;
    }
    onChange([{ x: .18, y: .2 }, { x: .82, y: .2 }, { x: .82, y: .8 }, { x: .18, y: .8 }]);
  };

  const polygon = points.length > 2 ? points.map(toSvg).join(' ') : '';
  return <div className="simulation-footprint">
    <div className="simulation-footprint__tools">
      <span>Footprint editor</span>
      <button type="button" onClick={() => preset('rectangle')}>Rectangle</button>
      <button type="button" onClick={() => preset('l')}>L-shape</button>
      <button type="button" aria-label="Undo last footprint point" onClick={() => onChange(points.slice(0, -1))} disabled={!points.length}><ArrowCounterClockwise /></button>
      <button type="button" aria-label="Clear footprint" onClick={() => onChange([])} disabled={!points.length}><Trash /></button>
    </div>
    <button className="simulation-footprint__canvas" type="button" onClick={addPoint} aria-label="Draw footprint by adding points">
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <path d="M0 25H100M0 50H100M0 75H100M25 0V100M50 0V100M75 0V100" className="simulation-footprint__grid" />
        {polygon && <polygon points={polygon} className="simulation-footprint__shape" />}
        {points.length > 1 && <polyline points={points.map(toSvg).join(' ')} className="simulation-footprint__line" />}
        {points.map((point, index) => <circle key={`${point.x}-${point.y}-${index}`} cx={point.x * 100} cy={point.y * 100} r="1.8" />)}
      </svg>
      {!points.length && <span><Polygon /> Click to draw points</span>}
    </button>
    <p>{points.length >= 3 ? `${points.length} vertices · closed automatically` : `${points.length} of at least 3 vertices`}</p>
  </div>;
}
