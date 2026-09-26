import { createContext, useCallback, useContext, useMemo, useState } from 'react';

const STORAGE_KEY = 'navira-session-v1';
const AuthContext = createContext(null);

function readSession() {
  try {
    const value = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
    return value?.id && value?.role ? value : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [profile, setProfile] = useState(readSession);

  const signIn = useCallback(({ name, email, role, organization }) => {
    const normalizedRole = role === 'operator' ? 'operator' : 'civilian';
    const next = {
      id: profile?.email === email.trim().toLowerCase() && profile?.role === normalizedRole
        ? profile.id
        : window.crypto.randomUUID(),
      name: name.trim(),
      email: email.trim().toLowerCase(),
      role: normalizedRole,
      organization: normalizedRole === 'operator' ? organization.trim() : null,
      signedInAt: new Date().toISOString(),
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setProfile(next);
    return next;
  }, [profile]);

  const signOut = useCallback(() => {
    window.localStorage.removeItem(STORAGE_KEY);
    setProfile(null);
  }, []);

  const value = useMemo(() => ({ profile, signIn, signOut }), [profile, signIn, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used within AuthProvider');
  return value;
}

export function actorHeaders(profile, extra = {}) {
  return {
    'Content-Type': 'application/json',
    'X-Navira-User': profile?.id || '',
    'X-Navira-Role': profile?.role || '',
    'X-Navira-Name': encodeURIComponent(profile?.name || ''),
    'X-Navira-Organization': encodeURIComponent(profile?.organization || ''),
    ...extra,
  };
}
