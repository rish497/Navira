import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './auth';

const EMPTY = { alerts: [], sources: [], fingerprint: '', generatedAt: null, coverage: { status: 'degraded', message: 'Official alert monitoring has not started.' }, loading: false, error: null };
const AlertDataContext = createContext(EMPTY);

export function AlertDataProvider({ children }) {
  const { profile } = useAuth();
  const [state, setState] = useState(EMPTY);
  const refresh = useCallback(async (force = false) => {
    if (!profile) { setState(EMPTY); return null; }
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const response = await fetch(`/api/official-alerts${force ? '?refresh=1' : ''}`, { cache: 'no-store' });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Official alerts are unavailable');
      setState({ ...EMPTY, ...result, loading: false, error: null });
      return result;
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error: error.message, coverage: { status: 'degraded', message: 'Official alert monitoring is unavailable.' } }));
      return null;
    }
  }, [profile]);
  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { if (!profile) return undefined; const timer = window.setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, 60_000); return () => window.clearInterval(timer); }, [profile, refresh]);
  const value = useMemo(() => ({ ...state, refresh }), [state, refresh]);
  return <AlertDataContext.Provider value={value}>{children}</AlertDataContext.Provider>;
}

export function useAlertData() { return useContext(AlertDataContext); }
