import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'
import { getJson, type UserProfile } from './api'
import { formatDate, formatMoney } from './format'
import { Header } from './Header'
import './RegionalDashboard.css'

type PortfolioAccount = {
  account_id: string
  name: string
  producer_id: string
  producer_name: string
  annual_premium: number
  risk_level: 'high' | 'medium' | 'low'
  days_to_renewal: number | null
  open_claims: number
  top_signal: { title: string; confidence: number; is_fact: boolean } | null
  flags: string[]
  signals: { title: string; severity: string; confidence: number }[]
  overdue_items: string[]
}
type Portfolio = {
  region: string
  as_of_date: string
  total_accounts: number
  total_region_accounts: number
  total_annual_premium: number
  premium_at_risk: number
  renewals_30_days: number
  renewals_30_days_premium: number
  high_risk_clients: number
  open_high_severity_claims: number
  overdue_commitments: number
  overdue_clients: number
  locked_count: number
  accounts: PortfolioAccount[]
  producers: { user_id: string; name: string }[]
  workloads: {
    producer_id: string
    name: string
    clients: number
    high_risk: number
    open_claims: number
    overdue: number
  }[]
  timeline: {
    label: string
    count: number
    premium: number
    accounts: { account_id: string; name: string; days: number; risk_level: string }[]
  }[]
  summary: string
  sources: { source_id: string; source_table: string; system: string; title: string }[]
}

export function RegionalDashboard({
  user,
  onSignOut,
  onOpenBrief,
  signingOut,
}: {
  user: UserProfile
  onSignOut: () => void
  onOpenBrief: (id: string) => void
  signingOut: boolean
}) {
  const client = useQueryClient()
  const [producer, setProducer] = useState('')
  const [risk, setRisk] = useState('')
  const [horizon, setHorizon] = useState('0')
  const [selectedId, setSelectedId] = useState('')
  const filterKey = `${producer}:${risk}:${horizon}`
  const params = new URLSearchParams({ renewal_days: horizon })
  if (producer) params.set('producer_id', producer)
  if (risk) params.set('risk_level', risk)
  const portfolioQuery = useQuery({
    queryKey: ['portfolio', user.userId, filterKey],
    queryFn: ({ signal }) => getJson<Portfolio>(`/portfolio?${params}`, signal),
  })
  // Keep the producer menu stable when other filters return no matching clients.
  const producersQuery = useQuery({
    queryKey: ['portfolio-producers', user.userId],
    queryFn: ({ signal }) => getJson<Portfolio>('/portfolio', signal),
    staleTime: 60_000,
  })
  const portfolio = portfolioQuery.data
  const selected =
    portfolio?.accounts.find((row) => row.account_id === selectedId) ?? portfolio?.accounts[0]

  function selectAccount(id: string) {
    setSelectedId(id)
  }

  return (
    <div className="app-shell regional-shell">
      <Header
        user={user}
        subtitle={`Regional Portfolio | ${user.region}`}
        onSignOut={onSignOut}
        signingOut={signingOut}
      />
      <div className="regional-layout">
        <main className="regional-main">
          <div className="regional-title-row">
            <div>
              <h1>Which renewals need attention?</h1>
              <p>
                {portfolio
                  ? `${portfolio.total_accounts} clients in ${portfolio.region} | ${formatMoney(portfolio.total_annual_premium)} annual premium | as of ${formatDate(portfolio.as_of_date)}`
                  : `Loading your ${user.region} portfolio…`}
              </p>
            </div>
            <div className="regional-filters">
              <label>
                <span className="sr-only">Producer</span>
                <select
                  aria-label="Producer filter"
                  value={producer}
                  onChange={(e) => setProducer(e.target.value)}
                >
                  <option value="">All producers</option>
                  {producersQuery.data?.producers.map((p) => (
                    <option value={p.user_id} key={p.user_id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="sr-only">Risk level</span>
                <select
                  aria-label="Risk filter"
                  value={risk}
                  onChange={(e) => setRisk(e.target.value)}
                >
                  <option value="">All risk levels</option>
                  <option value="high">High risk</option>
                  <option value="medium">Medium risk</option>
                  <option value="low">Low risk</option>
                </select>
              </label>
              <label>
                <span className="sr-only">Renewal window</span>
                <select
                  aria-label="Renewal filter"
                  value={horizon}
                  onChange={(e) => setHorizon(e.target.value)}
                >
                  <option value="0">All renewals</option>
                  <option value="30">Next 30 days</option>
                  <option value="60">Next 60 days</option>
                  <option value="90">Next 90 days</option>
                </select>
              </label>
              <button
                className="regional-refresh"
                aria-label="Refresh portfolio"
                onClick={() => client.invalidateQueries({ queryKey: ['portfolio'] })}
                disabled={portfolioQuery.isFetching}
              >
                <RefreshCw size={16} />
              </button>
            </div>
          </div>
          {portfolioQuery.isError && (
            <div className="error-banner" role="alert">
              {portfolioQuery.error.message}{' '}
              <button onClick={() => portfolioQuery.refetch()}>Retry</button>
            </div>
          )}
          {portfolioQuery.isPending && (
            <div className="regional-loading" role="status">
              <span className="loader" />
              Loading portfolio intelligence…
            </div>
          )}
          {portfolio && (
            <>
              <div className="regional-kpis">
                <Kpi
                  label="Premium at risk"
                  value={formatMoney(portfolio.premium_at_risk)}
                  detail={`${portfolio.high_risk_clients} high-risk clients`}
                />
                <Kpi
                  label="Renewals in 30 days"
                  value={portfolio.renewals_30_days}
                  detail={`${formatMoney(portfolio.renewals_30_days_premium)} premium`}
                />
                <Kpi
                  label="High-risk clients"
                  value={portfolio.high_risk_clients}
                  detail={`of ${portfolio.total_accounts} in current view`}
                />
                <Kpi
                  label="Open high-severity claims"
                  value={portfolio.open_high_severity_claims}
                  detail="across visible clients"
                />
                <Kpi
                  label="Overdue commitments"
                  value={portfolio.overdue_commitments}
                  detail={`across ${portfolio.overdue_clients} clients`}
                  alert
                />
              </div>
              <section className="panel regional-table-panel">
                <h2 className="panel-label">Needs attention, ranked by risk then renewal date</h2>
                <div className="table-scroll">
                  <table className="portfolio-table">
                    <thead>
                      <tr>
                        <th>Client</th>
                        <th>Producer</th>
                        <th>Premium</th>
                        <th>Renewal</th>
                        <th>Risk</th>
                        <th>Top signal and confidence</th>
                        <th>Flags</th>
                      </tr>
                    </thead>
                    <tbody>
                      {portfolio.accounts.map((row) => (
                        <tr
                          key={row.account_id}
                          className={selected?.account_id === row.account_id ? 'selected' : ''}
                          onClick={() => selectAccount(row.account_id)}
                        >
                          <td>
                            <button
                              className="client-select"
                              onClick={() => selectAccount(row.account_id)}
                              aria-pressed={selected?.account_id === row.account_id}
                            >
                              {row.name}
                            </button>
                          </td>
                          <td>{row.producer_name}</td>
                          <td>{formatMoney(row.annual_premium)}</td>
                          <td>
                            {row.days_to_renewal == null
                              ? 'Not set'
                              : row.days_to_renewal < 0
                                ? `${Math.abs(row.days_to_renewal)}d overdue`
                                : `${row.days_to_renewal} days`}
                          </td>
                          <td>
                            <span className={`risk-chip ${row.risk_level}`}>{row.risk_level}</span>
                          </td>
                          <td>
                            {row.top_signal ? (
                              <>
                                {row.top_signal.title}{' '}
                                <span
                                  className={`confidence-chip ${!row.top_signal.is_fact ? 'hypothesis' : ''}`}
                                >
                                  {!row.top_signal.is_fact && 'Hypothesis '}
                                  {Math.round(row.top_signal.confidence * 100)}%
                                </span>
                              </>
                            ) : (
                              'No active signal'
                            )}
                          </td>
                          <td>
                            <div className="flag-list">
                              {row.flags.map((flag) => (
                                <span
                                  key={flag}
                                  className={`flag-chip ${flag === 'Overdue' ? 'overdue' : ''}`}
                                >
                                  {flag}
                                </span>
                              ))}
                            </div>
                          </td>
                        </tr>
                      ))}
                      {!portfolio.accounts.length && (
                        <tr>
                          <td colSpan={7} className="regional-empty">
                            No clients match these filters. Broaden your selection.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <p className="locked-note">
                  {portfolio.locked_count} client{portfolio.locked_count !== 1 && 's'} outside your
                  access. Restricted accounts are excluded from results and totals.
                </p>
              </section>
              <section className="panel">
                <h2 className="panel-label">Renewal timeline, next 90 days</h2>
                <div className="renewal-buckets">
                  {portfolio.timeline.map((bucket) => (
                    <article key={bucket.label}>
                      <h3>{bucket.label}</h3>
                      <p>
                        {bucket.count} renewals | {formatMoney(bucket.premium)}
                      </p>
                      <div>
                        {bucket.accounts.map((account) => (
                          <button
                            key={account.account_id}
                            className={`risk-chip ${account.risk_level}`}
                            onClick={() => selectAccount(account.account_id)}
                          >
                            {account.name.split(' ')[0]} {account.days}d
                          </button>
                        ))}
                        {!bucket.count && <span className="muted">No renewals</span>}
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            </>
          )}
        </main>
        <aside className="regional-aside">
          {portfolio && (
            <>
              <section className="panel regional-summary">
                <h2 className="panel-label">Regional summary</h2>
                <p>{portfolio.summary}</p>
                <div className="regional-sources">
                  <span>Sources</span>
                  {portfolio.sources.slice(0, 6).map((source) => (
                    <span
                      className="source-chip"
                      key={`${source.source_id}:${source.system}`}
                      title={`${source.title} | ${source.system}`}
                    >
                      {source.source_id}
                    </span>
                  ))}
                </div>
              </section>
              <section className="panel selected-client-panel">
                <h2 className="panel-label">
                  {selected ? `Selected: ${selected.name}` : 'Select a client'}
                </h2>
                {selected ? (
                  <>
                    <p className="selected-meta">
                      Producer {selected.producer_name} | {formatMoney(selected.annual_premium)} |
                      renewal{' '}
                      {selected.days_to_renewal == null
                        ? 'not set'
                        : `in ${selected.days_to_renewal} days`}
                    </p>
                    <ul className="selected-signals">
                      {selected.signals.map((signal, index) => (
                        <li key={index}>
                          <span className={`risk-chip ${signal.severity}`}>
                            {signal.severity} {Math.round(signal.confidence * 100)}%
                          </span>{' '}
                          {signal.title}
                        </li>
                      ))}
                      {selected.overdue_items.map((item) => (
                        <li key={item}>
                          <span className="flag-chip overdue">Overdue</span> {item}
                        </li>
                      ))}
                    </ul>
                    <button
                      className="regional-primary"
                      onClick={() => onOpenBrief(selected.account_id)}
                    >
                      Open full brief
                    </button>
                  </>
                ) : (
                  <p className="muted">No client in the current view.</p>
                )}
              </section>
              <section className="panel producer-workload">
                <h2 className="panel-label">Producer workload</h2>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Producer</th>
                        <th>Clients</th>
                        <th>High risk</th>
                        <th>Open claims</th>
                        <th>Overdue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {portfolio.workloads.map((row) => (
                        <tr key={row.producer_id}>
                          <td>{row.name}</td>
                          <td>{row.clients}</td>
                          <td>{row.high_risk}</td>
                          <td>{row.open_claims}</td>
                          <td>{row.overdue}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
              <p className="regional-footnote">
                Metrics follow your filters. Premium figures use annual account premium. Synthetic
                records as of {formatDate(portfolio.as_of_date)}.
              </p>
            </>
          )}
        </aside>
      </div>
    </div>
  )
}

function Kpi({
  label,
  value,
  detail,
  alert,
}: {
  label: string
  value: string | number
  detail: string
  alert?: boolean
}) {
  return (
    <article className={`regional-kpi ${alert ? 'alert' : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  )
}
