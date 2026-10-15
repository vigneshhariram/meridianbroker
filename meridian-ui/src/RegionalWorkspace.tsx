import { lazy, useEffect, useState } from 'react'
import type { UserProfile } from './api'
import { Header } from './Header'
import { ErrorState } from './components/ui'
import { ExecutiveDashboard } from './ExecutiveDashboard'
import './RegionalWorkspace.css'

const RegionalDashboard = lazy(() =>
  import('./RegionalDashboard').then((module) => ({ default: module.RegionalDashboard }))
)

export function RegionalWorkspace({
  user,
  onSignOut,
  signingOut,
  onOpenBrief,
}: {
  user: UserProfile
  onSignOut: () => void
  signingOut: boolean
  onOpenBrief: (id: string) => void
}) {
  const [portfolio, setPortfolio] = useState(
    window.location.pathname.replace(/\/$/, '') !== '/executive-dashboard'
  )
  useEffect(() => {
    const sync = () =>
      setPortfolio(window.location.pathname.replace(/\/$/, '') !== '/executive-dashboard')
    window.addEventListener('popstate', sync)
    return () => window.removeEventListener('popstate', sync)
  }, [])

  if (user.role !== 'Regional Leader')
    return <ErrorState message="This dashboard is available only to Regional Leaders." />

  function navigate(showPortfolio: boolean) {
    window.history.pushState(
      null,
      '',
      showPortfolio ? '/regional-portfolio' : '/executive-dashboard'
    )
    setPortfolio(showPortfolio)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }

  const navigation = (
    <nav className="regional-workspace-nav" aria-label="Regional workspace">
      <a
        href="/executive-dashboard"
        aria-current={!portfolio ? 'page' : undefined}
        onClick={(event) => {
          event.preventDefault()
          navigate(false)
        }}
      >
        Executive Dashboard
      </a>
      <a
        href="/regional-portfolio"
        aria-current={portfolio ? 'page' : undefined}
        onClick={(event) => {
          event.preventDefault()
          navigate(true)
        }}
      >
        Regional portfolio
      </a>
    </nav>
  )

  return (
    <div className={`regional-workspace${portfolio ? '' : ' regional-workspace--executive'}`}>
      <Header
        user={user}
        subtitle={portfolio ? `Regional portfolio / ${user.region}` : 'Executive Dashboard'}
        onSignOut={onSignOut}
        signingOut={signingOut}
        onOpenAccount={onOpenBrief}
      />
      {navigation}
      {portfolio ? (
        <RegionalDashboard
          user={user}
          onSignOut={onSignOut}
          signingOut={signingOut}
          onOpenBrief={onOpenBrief}
          embedded
        />
      ) : (
        <ExecutiveDashboard userId={user.userId} />
      )}
    </div>
  )
}
