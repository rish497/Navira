import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { actorHeaders, useAuth } from './auth';

const EMPTY = {
  helpRequests: [], locations: [], dispatches: [], resources: [], allocations: [],
  infrastructure: [], simulations: [], evacuations: [], updatedAt: null,
};
const OperationsContext = createContext(null);

export function OperationsProvider({ children }) {
  const { profile } = useAuth();
  const [data, setData] = useState(EMPTY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    if (!profile) { setData(EMPTY); return; }
    setLoading(true); setError(null);
    try {
      const response = await fetch('/api/operations', { headers: actorHeaders(profile), cache: 'no-store' });
      if (!response.ok) throw new Error(`Operations request failed (${response.status})`);
      setData(await response.json());
    } catch (reason) { setError(reason.message || 'Operational records are unavailable'); }
    finally { setLoading(false); }
  }, [profile]);

  useEffect(() => { refresh(); }, [refresh]);

  const mutate = useCallback(async (action, payload, method = 'POST') => {
    if (!profile) throw new Error('Sign in is required');
    const response = await fetch(`/api/operations/${action}`, { method, headers: actorHeaders(profile), body: JSON.stringify(payload || {}) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `Operation failed (${response.status})`);
    await refresh();
    return result;
  }, [profile, refresh]);

  const value = useMemo(() => ({ data, loading, error, refresh, mutate }), [data, loading, error, refresh, mutate]);
  return <OperationsContext.Provider value={value}>{children}</OperationsContext.Provider>;
}

export function useOperations() {
  const value = useContext(OperationsContext);
  if (!value) throw new Error('useOperations must be used within OperationsProvider');
  return value;
}
