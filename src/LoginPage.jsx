import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, ShieldCheck, User, UsersThree } from '@phosphor-icons/react';
import BrandMark from './BrandMark';
import { useAuth } from './auth';

export default function LoginPage() {
  const { profile, ready, signIn, register } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const requested = new URLSearchParams(location.search).get('role');
  const [role, setRole] = useState(requested === 'operator' ? 'operator' : 'civilian');
  const [mode, setMode] = useState('signin');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [leaving, setLeaving] = useState(false);

  if (!ready) return <main className="login-shell login-shell--checking"><BrandMark /><span>VERIFYING SECURE SESSION</span></main>;
  if (profile) return <Navigate to="/app/command" replace />;

  const changeRole = (nextRole) => {
    setRole(nextRole);
    setError(null);
  };

  const submit = async (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    if (mode === 'register' && values.password !== values.confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (mode === 'register') await register({ ...values, role });
      else await signIn({ ...values, role });
      setLeaving(true);
      window.setTimeout(() => navigate('/app/command', { replace: true }), 220);
    } catch (reason) {
      setError(reason.message || 'Unable to authenticate');
      setBusy(false);
    }
  };

  const operator = role === 'operator';
  const registering = mode === 'register';
  return <main className={`login-shell ${leaving ? 'is-leaving' : ''}`}>
    <header className="login-header"><a href="/"><BrandMark /></a><span>SECURE RESPONSE ACCESS</span></header>
    <section className="login-composition">
      <div className="login-statement"><span>NAVIRA ACCESS</span><h1>One operating picture. Two responsibilities.</h1><p>Civilians control what they share. Government teams work in an organization-linked workspace where actions remain tied to an authenticated account.</p><div className="login-rule"><ShieldCheck /><span><strong>Server-verified identity</strong><small>Passwords are salted and hashed. The browser receives an HttpOnly session cookie; authenticated identity remains server-controlled.</small></span></div></div>
      <form className="login-panel" onSubmit={submit}>
        <div className="auth-mode-switch" aria-label="Authentication action">
          <button type="button" className={mode === 'signin' ? 'is-active' : ''} onClick={() => { setMode('signin'); setError(null); }}>Sign in</button>
          <button type="button" className={mode === 'register' ? 'is-active' : ''} onClick={() => { setMode('register'); setError(null); }}>Create account</button>
        </div>
        <div className="role-switch" aria-label="Choose workspace"><button type="button" className={role === 'civilian' ? 'is-active' : ''} onClick={() => changeRole('civilian')}><User /><span><strong>Civilian</strong><small>Safety, help, evacuation</small></span></button><button type="button" className={role === 'operator' ? 'is-active' : ''} onClick={() => changeRole('operator')}><UsersThree /><span><strong>Operator</strong><small>Coordination and response</small></span></button></div>
        <div className="login-panel__heading"><span>{operator ? 'GOVERNMENT RESPONSE' : 'CIVILIAN SAFETY'}</span><h2>{registering ? operator ? 'Create an operator account.' : 'Create your safety account.' : operator ? 'Enter the operator workspace.' : 'Enter your safety workspace.'}</h2><p>{operator ? registering ? 'Register the account under the government or response organization responsible for its operational actions.' : 'Sign in with the operator account registered to your organization.' : registering ? 'Create one account for help requests, safety alerts, and routes tied to you.' : 'Your location remains off until you explicitly activate a local safety tool.'}</p></div>
        {registering && <label>Full name<input name="name" required minLength="2" autoComplete="name" /></label>}
        <label>Email address<input name="email" type="email" required autoComplete="email" /></label>
        {registering && operator && <label>Government organization<input name="organization" required minLength="2" autoComplete="organization" /></label>}
        <label>Password<input name="password" type="password" required minLength="12" autoComplete={registering ? 'new-password' : 'current-password'} /></label>
        {registering && <label>Confirm password<input name="confirmPassword" type="password" required minLength="12" autoComplete="new-password" /></label>}
        {error && <p className="login-error" role="alert">{error}</p>}
        <button className="login-submit" type="submit" disabled={busy}>{busy ? 'Verifying…' : registering ? 'Create secure account' : 'Sign in to NAVIRA'} <ArrowRight /></button>
        <p className="login-security-note">Sessions expire after seven days. Operator privileges are assigned only by the server and cannot be changed from this screen.</p>
      </form>
    </section>
  </main>;
}
