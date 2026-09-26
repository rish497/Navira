export default function BrandMark({ compact = false }) {
  return <span className={`brand-mark ${compact ? 'brand-mark--compact' : ''}`}><svg viewBox="0 0 40 40" aria-hidden="true"><path className="brand-mark__boundary" d="M5 34V7l4-4h5v31H5Z" /><path className="brand-mark__boundary" d="M26 3h9v27l-4 4h-5V3Z" /><path className="brand-mark__route" d="M12 3h6l10 18v16h-6L12 19V3Z" /></svg>{!compact && <strong>NAVIRA</strong>}</span>;
}
