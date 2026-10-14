import { useState, type FormEvent } from 'react'
import { Eye, EyeOff, LockKeyhole } from 'lucide-react'
import { postJson, type Session } from './api'
import './SignIn.css'

export function SignIn({
  onSignIn,
  notice,
}: {
  onSignIn: (session: Session) => void
  notice?: string
}) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (loading) return
    setLoading(true)
    setError('')
    try {
      onSignIn(
        await postJson<Session>('/auth/login', {
          email: email.trim(),
          password,
          remember_me: rememberMe,
        })
      )
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Sign-in failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="signin-container">
      <div className="signin-left-pane">
        <div className="signin-left-content">
          <header className="signin-brand-header">
            <h1 className="signin-brand-name">Meridian Brokerage Group</h1>
            <p className="signin-brand-motto">People. Protection. Progress.</p>
          </header>
          <div className="signin-hero-section">
            <h2 className="signin-hero-title">Walk into every renewal prepared.</h2>
            <p className="signin-hero-subtitle">
              Your clients, your priorities, and the evidence behind every risk and opportunity.
            </p>
            <div className="signin-features-list">
              <div className="signin-feature-item">
                <span className="feature-number-badge">1</span>
                <div className="feature-text">
                  <strong>Evidence first.</strong> Sources, dates and confidence stay alongside the
                  conversation.
                </div>
              </div>
              <div className="signin-feature-item">
                <span className="feature-number-badge">2</span>
                <div className="feature-text">
                  <strong>A workspace for your role.</strong> Producers see their book. Regional
                  leaders see their authorized portfolio.
                </div>
              </div>
              <div className="signin-feature-item">
                <span className="feature-number-badge">3</span>
                <div className="feature-text">
                  <strong>You stay in control.</strong> Review tasks and follow-up drafts wait for
                  approval.
                </div>
              </div>
            </div>
          </div>
          <footer className="signin-left-footer">
            Synthetic demo data only. Meridian is a fictional broker.
          </footer>
        </div>
      </div>
      <div className="signin-right-pane">
        <div className="signin-card">
          <div className="signin-card-header">
            <h2 className="signin-card-title">Sign in</h2>
            <p className="signin-card-subtitle">Use your work account to open your workspace.</p>
          </div>
          {notice && (
            <p className="signin-notice" role="status">
              {notice}
            </p>
          )}
          <form className="signin-form" onSubmit={submit}>
            <div className="role-callout-box">
              <LockKeyhole size={16} />
              <p>Your role and client access are assigned to your account.</p>
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="work-email">
                Work email
              </label>
              <input
                className="form-input"
                id="work-email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
                autoFocus
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="password">
                Password
              </label>
              <div className="password-field">
                <input
                  className="form-input"
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </div>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                disabled={loading}
              />{' '}
              Remember me on this device
            </label>
            {error && (
              <p className="signin-error" role="alert">
                {error}
              </p>
            )}
            <button className="button-submit-signin" type="submit" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
          <details className="demo-accounts">
            <summary>Synthetic demo accounts</summary>
            <p>
              Password for all three: <code>MeridianDemo!2026</code>
            </p>
            {[
              ['Jordan Davis', 'jordan.davis@meridian.example', 'Producer'],
              ['Priya Nair', 'priya.nair@meridian.example', 'Producer'],
              ['Morgan Hayes', 'morgan.hayes@meridian.example', 'Regional Leader'],
            ].map(([name, address, role]) => (
              <button
                type="button"
                key={address}
                onClick={() => {
                  setEmail(address)
                  setPassword('MeridianDemo!2026')
                  setError('')
                }}
                disabled={loading}
              >
                <strong>{name}</strong>
                <span>{role}</span>
                <small>{address}</small>
              </button>
            ))}
          </details>
          <p className="signin-card-footer">
            Access is limited to your authorized clients. Sign-in and record access are logged.
          </p>
        </div>
      </div>
    </div>
  )
}
