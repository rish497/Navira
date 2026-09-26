import { useState } from 'react';
import { Crosshair, MagnifyingGlass, SpinnerGap, X } from '@phosphor-icons/react';

export default function LocationFilter({ value, radiusKm, onChange, onRadiusChange, label = 'Analyze a location' }) {
  const [query, setQuery] = useState('');
  const [state, setState] = useState({ loading: false, items: [], error: null });

  const search = async (event) => {
    event.preventDefault();
    if (query.trim().length < 3) return;
    setState({ loading: true, items: [], error: null });
    try {
      const response = await fetch(`/api/geocode?q=${encodeURIComponent(query.trim())}`, { cache: 'no-store' });
      if (!response.ok) throw new Error('Location search is unavailable');
      const result = await response.json();
      setState({ loading: false, items: result.items || [], error: result.items?.length ? null : 'No matching location was returned.' });
    } catch (reason) {
      setState({ loading: false, items: [], error: reason.message });
    }
  };

  return <section className="location-filter" aria-label={label}>
    <form onSubmit={search}>
      <label htmlFor="location-filter-search">{label}</label>
      <div><input id="location-filter-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="City, region, or country" minLength={3} /><button type="submit" disabled={state.loading}>{state.loading ? <SpinnerGap className="spin" /> : <MagnifyingGlass />} Search</button></div>
    </form>
    {state.error && <p role="alert">{state.error}</p>}
    {state.items.length > 0 && <div className="location-filter__results">{state.items.map((item) => <button type="button" key={item.id} onClick={() => { onChange(item); setQuery(item.label); setState({ loading: false, items: [], error: null }); }}><Crosshair /><span><strong>{item.label}</strong><small>Photon · OpenStreetMap</small></span></button>)}</div>}
    <div className="location-filter__scope">
      <div>{value ? <><span>Selected area</span><strong>{value.label}</strong><button type="button" onClick={() => onChange(null)} aria-label="Clear location"><X /></button></> : <><span>Selected area</span><strong>Worldwide</strong></>}</div>
      {value && <label>Analysis radius<select value={radiusKm} onChange={(event) => onRadiusChange(Number(event.target.value))}><option value="25">25 km</option><option value="100">100 km</option><option value="500">500 km</option><option value="1000">1,000 km</option><option value="2500">2,500 km</option></select></label>}
    </div>
  </section>;
}
