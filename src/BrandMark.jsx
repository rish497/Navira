export default function BrandMark({ compact = false }) {
  return (
    <span className={`brand-mark ${compact ? 'brand-mark--compact' : ''}`}>
      <svg viewBox="0 0 120 110" aria-hidden="true">
        <path className="brand-mark__boundary" d="M0 0 30 28v54L0 110V0Z" />
        <path className="brand-mark__boundary" d="M120 0v110L90 82V28L120 0Z" />
        <path className="brand-mark__route" d="M0 0h36l39 35v27L44 35 0 0Z" />
        <path className="brand-mark__route" d="m44 35 76 75H82L44 75V35Z" />
      </svg>
      {!compact && <strong>NAVIRA</strong>}
    </span>
  );
}
