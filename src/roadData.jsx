import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './auth';

const EMPTY = {
  restrictions: [], sources: [], coverage: { status: 'degraded', message: 'Road-restriction coverage has not been requested.', noDataIsOpen: false },
  generatedAt: null, fingerprint: '', loading: false, error: null,
};
const RoadDataContext = createContext(EMPTY);

export function RoadDataProvider({ children }) {
  const { profile } = useAuth();
  const [state, setState] = useState(EMPTY);
  const refresh = useCallback(async ({ force = false, bounds = null } = {}) => {
    if (!profile) { setState(EMPTY); return null; }
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const params = new URLSearchParams();
      if (force) params.set('refresh', '1');
      if (bounds?.length === 4) params.set('bbox', bounds.join(','));
      const response = await fetch(`/api/road-restrictions?${params}`, { cache: 'no-store' });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Road-restriction source is unavailable');
      setState({ ...EMPTY, ...result, loading: false, error: null });
      return result;
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error: error.message, coverage: { status: 'degraded', message: 'Road-restriction data is unavailable. Routing has degraded road awareness.', noDataIsOpen: false } }));
      return null;
    }
  }, [profile]);
  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    if (!profile) return undefined;
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, 60_000);
    return () => window.clearInterval(timer);
  }, [profile, refresh]);
  const value = useMemo(() => ({ ...state, refresh }), [state, refresh]);
  return <RoadDataContext.Provider value={value}>{children}</RoadDataContext.Provider>;
}

export function useRoadData() { return useContext(RoadDataContext); }
