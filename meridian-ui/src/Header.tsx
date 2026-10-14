import type { UserProfile } from './api'

export function Header({
  user,
  subtitle,
  onSignOut,
  signingOut,
  onBack,
}: {
  user: UserProfile
  subtitle: string
  onSignOut: () => void
  signingOut: boolean
  onBack?: () => void
}) {
  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-name">Meridian Brokerage Group</span>
        <span className="brand-subtitle">{subtitle}</span>
      </div>
      <div className="header-controls">
        {onBack && (
          <button
            type="button"
            className="header-back"
            aria-label="Back to regional portfolio"
            onClick={onBack}
          >
            ← Regional portfolio
          </button>
        )}
        <span>
          {user.name}, {user.title}
        </span>
        <button type="button" className="signout-button" onClick={onSignOut} disabled={signingOut}>
          {signingOut ? 'Signing out…' : 'Sign out'}
        </button>
      </div>
    </header>
  )
}
