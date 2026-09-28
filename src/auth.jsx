import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const AuthContext = createContext(null);

async function authRequest(path, payload) {
  const response = await fetch(`/api/auth/${path}`, {
    method: payload ? 'POST' : 'GET',
    credentials: 'same-origin',
    headers: payload ? { 'Content-Type': 'application/json' } : undefined,
    body: payload ? JSON.stringify(payload) : undefined,
    cache: 'no-store',
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || `Authentication failed (${response.status})`);
  return result;
}

export function AuthProvider({ children }) {
  const [profile, setProfile] = useState(undefined);

  useEffect(() => {
    let active = true;
    authRequest('session').then((result) => {
      if (active) setProfile(result.profile || null);
    }).catch(() => {
      if (active) setProfile(null);
    });
    return () => { active = false; };
  }, []);

  const signIn = useCallback(async ({ email, password, role }) => {
    const result = await authRequest('login', { email, password, role });
    setProfile(result.profile);
    return result.profile;
  }, []);

  const register = useCallback(async (values) => {
    const result = await authRequest('register', values);
    setProfile(result.profile);
    return result.profile;
  }, []);

  const signOut = useCallback(async () => {
    try {
      await authRequest('logout', {});
    } finally {
      setProfile(null);
    }
  }, []);

  const ready = profile !== undefined;
  const value = useMemo(() => ({ profile, ready, signIn, register, signOut }), [profile, ready, signIn, register, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used within AuthProvider');
  return value;
}

export function actorHeaders(_profile, extra = {}) {
  return { 'Content-Type': 'application/json', ...extra };
}
