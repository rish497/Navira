import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, ShieldCheck, User, UsersThree } from '@phosphor-icons/react';
import BrandMark from './BrandMark';
import { useAuth } from './auth';

export default function LoginPage() {
  const { profile, signIn } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const requested = new URLSearchParams(location.search).get('role');
  const [role, setRole] = useState(requested === 'operator' ? 'operator' : 'civilian');
  const [leaving, setLeaving] = useState(false);

  if (profile) return <Navigate to="/app/command" replace />;

  const submit = (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    signIn({ ...values, role });
    setLeaving(true);
    window.setTimeout(() => navigate('/app/command', { replace: true }), 220);
  };

  return <main className={`login-shell ${leaving ? 'is-leaving' : ''}`}>
    <header className="login-header"><a href="/"><BrandMark /></a><span>SECURE RESPONSE ACCESS</span></header>
    <section className="login-composition">
      <div className="login-statement"><span>NAVIRA ACCESS</span><h1>One operating picture. Two responsibilities.</h1><p>Civilians share only what they choose. Government response teams work from verified requests, recorded capacity, and attributable disaster data.</p><div className="login-rule"><ShieldCheck /><span><strong>Facts remain attributable</strong><small>AI explains verified data. It does not create incidents, routes, people, capacity, or infrastructure status.</small></span></div></div>
      <form className="login-panel" onSubmit={submit}>
        <div className="role-switch" aria-label="Choose workspace"><button type="button" className={role === 'civilian' ? 'is-active' : ''} onClick={() => setRole('civilian')}><User /><span><strong>Civilian</strong><small>Safety, help, evacuation</small></span></button><button type="button" className={role === 'operator' ? 'is-active' : ''} onClick={() => setRole('operator')}><UsersThree /><span><strong>Operator</strong><small>Coordination and response</small></span></button></div>
        <div className="login-panel__heading"><span>{role === 'operator' ? 'GOVERNMENT RESPONSE' : 'CIVILIAN SAFETY'}</span><h2>{role === 'operator' ? 'Enter the operator workspace.' : 'Enter your safety workspace.'}</h2><p>{role === 'operator' ? 'Use your agency identity. Operator actions remain marked as operator-entered records.' : 'Your browser location is requested only when you activate a local safety tool.'}</p></div>
        <label>Full name<input name="name" required minLength="2" autoComplete="name" /></label>
        <label>Email address<input name="email" type="email" required autoComplete="email" /></label>
        {role === 'operator' && <label>Government organization<input name="organization" required minLength="2" autoComplete="organization" /></label>}
        <button className="login-submit" type="submit">Continue to NAVIRA <ArrowRight /></button>
        <p className="login-prototype-note">Prototype identity session. Connect a government identity provider before production deployment.</p>
      </form>
    </section>
  </main>;
}
