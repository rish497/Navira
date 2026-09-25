import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const LiveDataContext = createContext(null);

export function LiveDataProvider({ children }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);

  const load = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/live-events${force ? '?refresh=1' : ''}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Live data request failed (${response.status})`);
      const next = await response.json();
      setData(next);
      setSelectedId((current) => current && next.events.some((event) => event.id === current) ? current : next.events[0]?.id || null);
    } catch (reason) {
      setError(reason.message || 'Live data unavailable');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(false); }, [load]);

  useEffect(() => {
    if (!data?.sources.some((source) => source.id === 'eonet' && source.status === 'unavailable')) return undefined;
    const timer = setTimeout(() => load(false), 32000);
    return () => clearTimeout(timer);
  }, [data, load]);

  const selectedEvent = useMemo(
    () => data?.events.find((event) => event.id === selectedId) || null,
    [data, selectedId],
  );

  const value = useMemo(() => ({
    data,
    events: data?.events || [],
    sources: data?.sources || [],
    notices: data?.notices || {},
    loading,
    error,
    selectedEvent,
    selectEvent: (event) => setSelectedId(event?.id || event || null),
    refresh: () => load(true),
  }), [data, loading, error, selectedEvent, load]);

  return <LiveDataContext.Provider value={value}>{children}</LiveDataContext.Provider>;
}

export function useLiveData() {
  const value = useContext(LiveDataContext);
  if (!value) throw new Error('useLiveData must be used within LiveDataProvider');
  return value;
}
