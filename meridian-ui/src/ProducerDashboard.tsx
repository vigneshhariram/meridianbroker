import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Printer,
  Sparkles,
} from 'lucide-react'
import { generateBrief, getJson, type UserProfile } from './api'
import type { Account, AccountBrief, AccountDetail, DetailTab } from './types'
import { formatDate, formatMoney } from './format'
import { AccountDetailsPanel } from './AccountDetailsPanel'
import { ClientOverviewPanel } from './ClientOverviewPanel'
import { AiBriefPanel } from './AiBriefPanel'
import { PrintableOnePageBrief } from './PrintableOnePageBrief'
import { Header } from './Header'

export function ProducerDashboard({
  user,
  onSignOut,
  signingOut,
  initialAccountId = '',
  initialTab = 'overview',
  onBack,
}: {
  user: UserProfile
  onSignOut: () => void
  signingOut: boolean
  initialAccountId?: string
  initialTab?: DetailTab
  onBack?: () => void
}) {
  const [selectedId, setSelectedId] = useState(initialAccountId)
  const [tab, setTab] = useState<DetailTab>(initialTab)
  const [search, setSearch] = useState('')
  const accountsQuery = useQuery({
    queryKey: ['accounts', user.userId],
    queryFn: ({ signal }) => getJson<Account[]>('/accounts', signal),
  })
  const accounts = accountsQuery.data ?? []
  const accountId = selectedId || accounts[0]?.account_id || ''
  const briefQuery = useQuery({
    queryKey: ['brief', user.userId, accountId],
    queryFn: ({ signal }) =>
      getJson<AccountBrief>(`/accounts/${encodeURIComponent(accountId)}/brief`, signal),
    enabled: !!accountId,
  })
  const detailsQuery = useQuery({
    queryKey: ['details', user.userId, accountId, tab],
    queryFn: ({ signal }) =>
      getJson<AccountDetail[]>(`/accounts/${encodeURIComponent(accountId)}/${tab}`, signal),
    enabled: !!accountId && tab !== 'overview' && tab !== 'ai-brief',
  })
  const brief = briefQuery.data
  const queryClient = useQueryClient()
  const [regenerateError, setRegenerateError] = useState<string | null>(null)
  const generateMutation = useMutation({
    mutationFn: (id: string) => generateBrief(id),
    onSuccess: (updatedBrief) => {
      setRegenerateError(null)
      queryClient.setQueryData(
        ['brief', user.userId, updatedBrief.account.account_id],
        updatedBrief
      )
      queryClient.invalidateQueries({ queryKey: ['brief', user.userId] })
    },
    onError: (err: Error) => {
      setRegenerateError(err.message)
    },
  })

  function select(id: string) {
    setSelectedId(id)
    setTab('overview')
    setRegenerateError(null)
  }

  function handleExportAiBrief() {
    document.body.classList.add('printing-ai-brief')
    const cleanup = () => {
      document.body.classList.remove('printing-ai-brief')
      window.removeEventListener('afterprint', cleanup)
    }
    window.addEventListener('afterprint', cleanup, { once: true })
    setTimeout(() => {
      window.print()
    }, 50)
  }

  function handlePrintView() {
    document.body.classList.remove('printing-ai-brief')
    window.print()
  }
  const visibleAccounts = [...accounts]
    .filter((row) => row.name.toLowerCase().includes(search.toLowerCase()))
    .sort(
      (a, b) =>
        ({ high: 0, medium: 1, low: 2 })[a.risk_level ?? 'low'] -
          { high: 0, medium: 1, low: 2 }[b.risk_level ?? 'low'] ||
        (a.days_to_renewal ?? 99999) - (b.days_to_renewal ?? 99999)
    )
  const evidence = brief
    ? [...brief.risks, ...brief.opportunities].flatMap((signal) => signal.evidence)
    : []
  const uniqueEvidence = [...new Map(evidence.map((item) => [item.evidence_id, item])).values()]

  return (
    <>
      <div className="app-shell">
      <Header
        user={user}
        subtitle="Client Growth and Retention Cockpit"
        onSignOut={onSignOut}
        signingOut={signingOut}
        onBack={onBack}
      />
      <div className="dashboard">
        <aside className="left-rail">
          <section className="panel accounts-panel">
            <h2 className="panel-label">
              {user.role === 'Producer' ? 'Your book of business' : 'Authorized regional clients'}
            </h2>
            <input
              className="book-search"
              aria-label="Search your clients"
              placeholder="Search clients…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {accountsQuery.isPending && <p role="status">Loading clients…</p>}
            {accountsQuery.isError && (
              <p role="alert" className="text-error">
                {accountsQuery.error.message}
              </p>
            )}
            <div className="account-list">
              {visibleAccounts.map((row) => (
                <button
                  className={`account-option ${accountId === row.account_id ? 'active' : ''}`}
                  key={row.account_id}
                  onClick={() => select(row.account_id)}
                >
                  <div className="account-info-block">
                    <span className="account-option-name">{row.name}</span>
                    <span className="account-option-premium">
                      {formatMoney(row.annual_premium)} premium
                    </span>
                  </div>
                  <span
                    className={`days-pill ${row.risk_level === 'high' ? 'red' : row.risk_level === 'medium' ? 'orange' : 'green'}`}
                  >
                    {row.days_to_renewal == null ? '—' : `${row.days_to_renewal}d`}
                  </span>
                </button>
              ))}
            </div>
            {!accountsQuery.isPending && !visibleAccounts.length && (
              <p className="muted">No matching clients.</p>
            )}
          </section>
          <p className="workspace-scope">
            {user.role === 'Producer'
              ? "Access follows your signed-in account. Other producers' clients remain restricted."
              : 'Only authorized clients in your region are included.'}
          </p>
        </aside>
        <main className="main-column">
          {accountId && briefQuery.isPending && (
            <section className="panel loading-panel" role="status">
              <span className="loader" />
              Loading client intelligence…
            </section>
          )}
          {briefQuery.isError && (
            <div className="error-banner" role="alert">
              {briefQuery.error.message}
              <button onClick={() => briefQuery.refetch()}>Retry</button>
            </div>
          )}
          {brief && (
            <>
              <section className="panel account-heading">
                <div>
                  <h1 className="client-title">{brief.account.name}</h1>
                  <p className="client-subtitle">
                    {brief.account.industry} ·{' '}
                    {[brief.account.city, brief.account.state].filter(Boolean).join(', ')} · Client
                    since {brief.account.client_since}
                  </p>
                  <p className="client-subtitle">
                    {brief.primary_contact
                      ? `Contact: ${brief.primary_contact.name}, ${brief.primary_contact.role}`
                      : 'No primary contact on record.'}
                  </p>
                </div>
                <div className="client-actions-row">
                  <span className={`risk-chip ${brief.account.risk_level ?? 'low'}`}>
                    {brief.account.risk_level} renewal risk ·{' '}
                    {brief.days_to_renewal == null
                      ? 'Date not set'
                      : `${brief.days_to_renewal} days`}
                  </span>
                  <button
                    className="button button-outline print-view-button"
                    onClick={handlePrintView}
                    title="Print current tab view"
                  >
                    <Printer size={14} />
                    Print View
                  </button>
                </div>
              </section>
              <nav className="detail-tabs" aria-label="Client details">
                {(
                  [
                    ['overview', 'Overview'],
                    ['ai-brief', 'AI Brief'],
                    ['policies', 'Policies'],
                    ['claims', 'Claims'],
                    ['billing', 'Billing'],
                    ['service-cases', 'Service cases'],
                    ['documents', 'Documents'],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    className={`detail-tab ${tab === value ? 'active' : ''}`}
                    aria-current={tab === value ? 'page' : undefined}
                    key={value}
                    onClick={() => setTab(value)}
                  >
                    {value === 'ai-brief' && <Sparkles size={12} className="tab-sparkle-icon" />}
                    {label}
                  </button>
                ))}
              </nav>
              {tab === 'overview' ? (
                <ClientOverviewPanel
                  brief={brief}
                  userRole={user.role}
                  onSelectTab={(newTab) => setTab(newTab)}
                  onRegenerate={() => generateMutation.mutate(accountId)}
                  regenerating={generateMutation.isPending}
                  regenerateError={regenerateError}
                />
              ) : tab === 'ai-brief' ? (
                <AiBriefPanel
                  brief={brief}
                  userRole={user.role}
                  onRegenerate={() => generateMutation.mutate(accountId)}
                  regenerating={generateMutation.isPending}
                  regenerateError={regenerateError}
                  onExportPdf={handleExportAiBrief}
                />
              ) : (
                <AccountDetailsPanel
                  accountName={brief.account.name}
                  tab={tab}
                  items={detailsQuery.data ?? null}
                  loading={detailsQuery.isPending}
                  error={detailsQuery.error?.message ?? ''}
                />
              )}
            </>
          )}
        </main>
        <aside className="right-rail">
          {brief && (
            <>
              <section className="panel evidence-panel">
                <h2 className="panel-label">Evidence and sources</h2>
                {brief.contradictions.map((conflict) => (
                  <div className="conflict-card-banner" key={conflict.contradiction_id}>
                    <span className="conflict-title">
                      {(conflict.field ?? 'Record').replaceAll('_', ' ')} differs across systems.
                    </span>
                    <span className="conflict-sub">
                      {conflict.source_a}: {conflict.value_a}
                      <br />
                      {conflict.source_b}: {conflict.value_b}
                      <br />
                      Human review required.
                    </span>
                  </div>
                ))}
                <div className="evidence-sources-list">
                  {uniqueEvidence.map((item) => (
                    <article className="evidence-card" key={item.evidence_id}>
                      <div className="card-top-line">
                        <span className="card-headline">{item.source_system}</span>
                        <span className="confidence-chip">
                          {Math.round(Number(item.confidence) * 100)}%
                        </span>
                      </div>
                      <p className="card-meta">{item.snippet}</p>
                      <p className="card-id">
                        {item.source_id} · {formatDate(item.recency_date)}
                      </p>
                    </article>
                  ))}
                </div>
                {!uniqueEvidence.length && (
                  <p className="muted">No accessible supporting records.</p>
                )}
              </section>
            </>
          )}
        </aside>
      </div>
    </div>
    {brief && (
      <PrintableOnePageBrief
        brief={brief}
        evidence={uniqueEvidence}
        userRole={user.role}
      />
    )}
  </>
  )
}
