import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Mail, Printer, Search, Sparkles } from 'lucide-react'
import { getJson, type UserProfile } from './api'
import type { Account, AccountBrief, AccountDetail, DetailTab } from './types'
import { formatDate, formatMoney, formatRenewal } from './format'
import { AccountDetailsPanel } from './AccountDetailsPanel'
import { ClientOverviewPanel } from './ClientOverviewPanel'
import { AiBriefPanel } from './AiBriefPanel'
import { PrintableOnePageBrief } from './PrintableOnePageBrief'
import { Header } from './Header'
import { useBriefGeneration } from './useBriefGeneration'
import { WorkspaceSkeleton } from './components/WorkspaceSkeleton'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  Select,
  StatusBadge,
  Tabs,
} from './components/ui'
import { RecordSheet, type InspectionRecord } from './components/RecordSheet'

const detailTabs = [
  { value: 'overview', label: 'Overview' },
  { value: 'ai-brief', label: 'AI Brief', icon: <Sparkles size={16} /> },
  { value: 'policies', label: 'Policies' },
  { value: 'claims', label: 'Claims' },
  { value: 'billing', label: 'Billing' },
  { value: 'service-cases', label: 'Service cases' },
  { value: 'documents', label: 'Documents' },
]

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
  const [risk, setRisk] = useState('')
  const [horizon, setHorizon] = useState('0')
  const [inspection, setInspection] = useState<InspectionRecord | null>(null)
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
  const generation = useBriefGeneration(user.userId, accountId, brief)
  function select(id: string) {
    setSelectedId(id)
    setTab('overview')
    setInspection(null)
  }
  function exportBrief() {
    document.body.classList.add('printing-ai-brief')
    try {
      window.print()
    } finally {
      document.body.classList.remove('printing-ai-brief')
    }
  }
  const visibleAccounts = [...accounts]
    .filter(
      (row) =>
        [row.name, row.industry, row.city, row.state, row.segment, row.account_id]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(search.toLowerCase()) &&
        (!risk || row.risk_level === risk) &&
        (horizon === '0' || (row.days_to_renewal != null && row.days_to_renewal <= Number(horizon)))
    )
    .sort(
      (a, b) =>
        ({ high: 0, medium: 1, low: 2 })[a.risk_level ?? 'low'] -
          { high: 0, medium: 1, low: 2 }[b.risk_level ?? 'low'] ||
        (a.days_to_renewal ?? Infinity) - (b.days_to_renewal ?? Infinity)
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
          subtitle="Client growth and retention"
          onSignOut={onSignOut}
          signingOut={signingOut}
          onBack={onBack}
          onOpenAccount={select}
        />
        <div className="dashboard">
          <aside className="left-rail" aria-label="Client navigation">
            <Card className="accounts-panel" aria-labelledby="book-title">
              <h2 className="panel-label" id="book-title">
                {user.role === 'Producer' ? 'Your book of business' : 'Regional clients'}
              </h2>
              <div className="book-controls">
                <div className="search-control">
                  <Search size={16} aria-hidden="true" />
                  <Input
                    aria-label="Search your clients"
                    placeholder="Client, industry or city…"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </div>
                <Select
                  label="Client risk filter"
                  value={risk}
                  onValueChange={setRisk}
                  options={[
                    { value: '', label: 'All risk levels' },
                    { value: 'high', label: 'High risk' },
                    { value: 'medium', label: 'Medium risk' },
                    { value: 'low', label: 'Low risk' },
                  ]}
                />
                <Select
                  label="Client renewal filter"
                  value={horizon}
                  onValueChange={setHorizon}
                  options={[
                    { value: '0', label: 'All renewals' },
                    { value: '30', label: 'Within 30 days / overdue' },
                    { value: '60', label: 'Within 60 days / overdue' },
                    { value: '90', label: 'Within 90 days / overdue' },
                  ]}
                />
              </div>
              {accountsQuery.isPending && <LoadingState label="Loading clients…" />}
              {accountsQuery.isError && (
                <ErrorState
                  message={accountsQuery.error.message}
                  onRetry={() => accountsQuery.refetch()}
                />
              )}
              <nav className="account-list" aria-label="Authorized clients">
                {visibleAccounts.map((row) => (
                  <Button
                    className={`account-option ${accountId === row.account_id ? 'active' : ''}`}
                    key={row.account_id}
                    onClick={() => select(row.account_id)}
                    aria-current={accountId === row.account_id ? 'page' : undefined}
                  >
                    <span className="account-info-block">
                      <span className="account-option-name">{row.name}</span>
                      <span className="account-option-premium">
                        {formatMoney(row.annual_premium)} premium
                      </span>
                      <StatusBadge status={row.risk_level}>
                        {row.risk_level ?? 'Unrated'} risk
                      </StatusBadge>
                    </span>
                    <span className="text-xs muted">
                      {row.days_to_renewal == null ? '—' : `${row.days_to_renewal}d`}
                    </span>
                  </Button>
                ))}
              </nav>
              {!accountsQuery.isPending && !accountsQuery.isError && !visibleAccounts.length && (
                <EmptyState
                  title="No matching clients"
                  description="Broaden the search or filters."
                />
              )}
              <p className="muted text-xs mt-4" role="status">
                {visibleAccounts.length} of {accounts.length} authorized clients
              </p>
            </Card>
            <p className="workspace-scope">
              Your signed-in account determines client and record access.
            </p>
          </aside>
          <main className="main-column" id="main-content" tabIndex={-1}>
            {accountId && briefQuery.isPending && <WorkspaceSkeleton />}
            {briefQuery.isError && (
              <ErrorState message={briefQuery.error.message} onRetry={() => briefQuery.refetch()} />
            )}
            {!accountId && !accountsQuery.isPending && !accountsQuery.isError && (
              <Card>
                <EmptyState
                  title="No authorized clients"
                  description="There are no client records available to this account."
                />
              </Card>
            )}
            {brief && (
              <>
                <Card className="account-heading" aria-labelledby="client-title">
                  <div>
                    <p className="eyebrow">Client workspace · {brief.account.account_id}</p>
                    <h1 className="client-title" id="client-title">
                      {brief.account.name}
                    </h1>
                    <p className="client-subtitle">
                      {[
                        brief.account.industry,
                        [brief.account.city, brief.account.state].filter(Boolean).join(', '),
                        brief.account.client_since
                          ? `Client since ${brief.account.client_since}`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                    {brief.primary_contact ? (
                      <p className="client-contact">
                        <Mail size={16} aria-hidden="true" />
                        {brief.primary_contact.name}
                        {brief.primary_contact.role ? `, ${brief.primary_contact.role}` : ''}
                      </p>
                    ) : (
                      <p className="client-subtitle">No primary contact on record.</p>
                    )}
                    <p className="client-subtitle">
                      {brief.account.segment} · Source records as of {formatDate(brief.as_of_date)}
                    </p>
                  </div>
                  <div className="client-actions-row">
                    <StatusBadge status={brief.account.risk_level}>
                      {brief.account.risk_level ?? 'Unrated'} renewal risk ·{' '}
                      {formatRenewal(brief.days_to_renewal)}
                    </StatusBadge>
                    <Button onClick={() => window.print()}>
                      <Printer />
                      Print View
                    </Button>
                  </div>
                </Card>
                <Tabs
                  value={tab}
                  onValueChange={(value) => setTab(value as DetailTab)}
                  tabs={detailTabs}
                >
                  {tab === 'overview' ? (
                    <ClientOverviewPanel
                      brief={brief}
                      userRole={user.role}
                      onSelectTab={setTab}
                      generation={generation}
                    />
                  ) : tab === 'ai-brief' ? (
                    <AiBriefPanel
                      brief={brief}
                      userRole={user.role}
                      generation={generation}
                      onExportPdf={exportBrief}
                    />
                  ) : (
                    <AccountDetailsPanel
                      key={`${accountId}:${tab}`}
                      accountName={brief.account.name}
                      tab={tab}
                      items={detailsQuery.data ?? null}
                      loading={detailsQuery.isPending}
                      error={detailsQuery.error?.message ?? ''}
                      onRetry={() => detailsQuery.refetch()}
                    />
                  )}
                </Tabs>
              </>
            )}
          </main>
          <aside className="right-rail" aria-label="Evidence and source records">
            {brief && (
              <Card className="evidence-panel" aria-labelledby="evidence-title">
                <div className="panel-header-row">
                  <h2 className="panel-label" id="evidence-title">
                    Evidence and sources
                  </h2>
                  <Badge>{uniqueEvidence.length}</Badge>
                </div>
                {brief.contradictions.map((conflict) => (
                  <article className="conflict-card-banner" key={conflict.contradiction_id}>
                    <span className="conflict-title">
                      {(conflict.field ?? 'Record').replaceAll('_', ' ')} conflict
                    </span>
                    <span className="conflict-sub">
                      {conflict.source_a}: {conflict.value_a}
                      <br />
                      {conflict.source_b}: {conflict.value_b}
                      <br />
                      Human review required.
                    </span>
                  </article>
                ))}
                <div className="evidence-sources-list">
                  {uniqueEvidence.map((item) => (
                    <article className="evidence-card" key={item.evidence_id}>
                      <div className="card-top-line">
                        <span className="card-headline">{item.source_system}</span>
                        <Badge tone="info">
                          {item.confidence == null
                            ? '—'
                            : `${Math.round(Number(item.confidence) * 100)}%`}
                        </Badge>
                      </div>
                      <p className="card-meta">{item.snippet}</p>
                      <Button
                        variant="ghost"
                        className="p-0 text-xs"
                        aria-label={`Inspect evidence ${item.source_id}`}
                        onClick={() =>
                          setInspection({
                            id: item.evidence_id,
                            title: item.source_id ?? item.evidence_id,
                            description: 'Accessible evidence returned for the selected client.',
                            content: item.snippet,
                            fields: [
                              { label: 'Source system', value: item.source_system },
                              {
                                label: 'Record type',
                                value: item.source_table?.replaceAll('_', ' '),
                              },
                              { label: 'Recency date', value: formatDate(item.recency_date) },
                              {
                                label: 'Confidence',
                                value:
                                  item.confidence == null
                                    ? 'Not recorded'
                                    : `${Math.round(Number(item.confidence) * 100)}%`,
                              },
                              { label: 'Evidence ID', value: item.evidence_id },
                            ],
                          })
                        }
                      >
                        {item.source_id} · {formatDate(item.recency_date)}
                      </Button>
                    </article>
                  ))}
                </div>
                {!uniqueEvidence.length && (
                  <EmptyState
                    title="No supporting evidence"
                    description="No accessible source records support this client's signals."
                  />
                )}
              </Card>
            )}
          </aside>
        </div>
      </div>
      <RecordSheet record={inspection} onClose={() => setInspection(null)} />
      {brief && (
        <PrintableOnePageBrief brief={brief} evidence={uniqueEvidence} userRole={user.role} />
      )}
    </>
  )
}
