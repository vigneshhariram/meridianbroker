import { useCallback, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import {
  ArrowRight,
  CalendarDays,
  ChartNoAxesCombined,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  LayoutGrid,
  Rows3,
  Search,
} from 'lucide-react'
import { toast } from 'sonner'
import { getJson, type UserProfile } from './api'
import { formatCurrency, formatDate, formatMoney, formatRenewal } from './format'
import { Header } from './Header'
import { DataTable } from './components/DataTable'
import { RecordSheet, type InspectionRecord } from './components/RecordSheet'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  Input,
  Select,
  StatusBadge,
  Tooltip,
} from './components/ui'
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
  high_severity_claims: number
  overdue_commitments: number
  has_date_conflict: boolean
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
  total_open_claims: number
  total_open_cases: number
  locked_count: number
  risk_distribution: Record<'high' | 'medium' | 'low', number>
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
  const [view, setView] = useState<'cards' | 'table'>('cards')
  const [cardSearch, setCardSearch] = useState('')
  const [inspection, setInspection] = useState<InspectionRecord | null>(null)
  const params = new URLSearchParams({ renewal_days: horizon })
  if (producer) params.set('producer_id', producer)
  if (risk) params.set('risk_level', risk)
  const portfolioQuery = useQuery({
    queryKey: ['portfolio', user.userId, producer, risk, horizon],
    queryFn: ({ signal }) => getJson<Portfolio>(`/portfolio?${params}`, signal),
  })
  const producersQuery = useQuery({
    queryKey: ['portfolio-producers', user.userId],
    queryFn: ({ signal }) => getJson<Portfolio>('/portfolio', signal),
    staleTime: 60_000,
  })
  const portfolio = portfolioQuery.data
  const visibleCards = useMemo(
    () =>
      (portfolio?.accounts ?? []).filter((row) =>
        [row.name, row.producer_name, row.top_signal?.title, ...row.flags]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(cardSearch.trim().toLowerCase())
      ),
    [portfolio?.accounts, cardSearch]
  )
  const selectableAccounts = view === 'cards' ? visibleCards : portfolio?.accounts ?? []
  const selected =
    selectableAccounts.find((row) => row.account_id === selectedId) ?? selectableAccounts[0]
  const filtered = !!producer || !!risk || horizon !== '0'
  const asOfDate = portfolio?.as_of_date
  const inspect = useCallback(
    (row: PortfolioAccount) => {
      setSelectedId(row.account_id)
      setInspection({
        id: row.account_id,
        title: row.name,
        description: `${row.account_id} · Regional account snapshot as of ${formatDate(asOfDate)}`,
        fields: [
          { label: 'Producer', value: row.producer_name },
          { label: 'Annual account premium', value: formatCurrency(row.annual_premium) },
          { label: 'Risk', value: <StatusBadge status={row.risk_level} /> },
          { label: 'Next renewal', value: formatRenewal(row.days_to_renewal) },
          { label: 'Open claims', value: row.open_claims },
          { label: 'High-severity claim signals', value: row.high_severity_claims },
          { label: 'Overdue commitments', value: row.overdue_commitments },
          {
            label: 'Renewal date conflict',
            value: row.has_date_conflict ? 'Human review required' : 'No active date conflict',
          },
        ],
        content: [
          ...row.signals.map(
            (signal) =>
              `${signal.title} · ${signal.severity} · ${Math.round(signal.confidence * 100)}% confidence`
          ),
          ...row.overdue_items,
        ].join('\n\n'),
      })
    },
    [asOfDate]
  )
  const columns = useMemo<ColumnDef<PortfolioAccount>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'Client',
        enableHiding: false,
        cell: ({ row }) => (
          <Button
            variant="ghost"
            className="client-select"
            onClick={() => setSelectedId(row.original.account_id)}
          >
            {row.original.name}
          </Button>
        ),
      },
      { accessorKey: 'producer_name', header: 'Producer' },
      {
        accessorKey: 'annual_premium',
        header: 'Premium',
        meta: { numeric: true },
        cell: ({ row }) => formatCurrency(row.original.annual_premium),
      },
      {
        accessorKey: 'days_to_renewal',
        header: 'Renewal',
        meta: { numeric: true },
        sortUndefined: 'last',
        cell: ({ row }) => formatRenewal(row.original.days_to_renewal),
      },
      {
        accessorKey: 'risk_level',
        header: 'Risk',
        sortingFn: (a, b) =>
          ({ high: 0, medium: 1, low: 2 })[a.original.risk_level] -
          { high: 0, medium: 1, low: 2 }[b.original.risk_level],
        cell: ({ row }) => <StatusBadge status={row.original.risk_level} />,
      },
      {
        id: 'top_signal',
        accessorFn: (row) => row.top_signal?.title ?? '',
        header: 'Top signal and confidence',
        cell: ({ row }) =>
          row.original.top_signal ? (
            <div className="signal-cell">
              <span>{row.original.top_signal.title}</span>
              <Badge tone={row.original.top_signal.is_fact ? 'info' : 'warning'}>
                {row.original.top_signal.is_fact ? 'Fact' : 'Hypothesis'} ·{' '}
                {Math.round(row.original.top_signal.confidence * 100)}%
              </Badge>
            </div>
          ) : (
            'No active signal'
          ),
      },
      {
        id: 'flags',
        accessorFn: (row) => row.flags.join(' '),
        header: 'Flags',
        cell: ({ row }) => (
          <div className="flag-list">
            {row.original.flags.map((flag) => (
              <Badge key={flag} tone={flag === 'Overdue' ? 'critical' : 'warning'}>
                {flag}
              </Badge>
            ))}
            {!row.original.flags.length && <span className="muted">None</span>}
          </div>
        ),
      },
      {
        id: 'inspect',
        header: 'Details',
        enableSorting: false,
        enableHiding: false,
        cell: ({ row }) => (
          <Button
            variant="ghost"
            aria-label={`Inspect ${row.original.name}`}
            onClick={() => inspect(row.original)}
          >
            <ArrowRight />
          </Button>
        ),
      },
    ],
    [inspect]
  )
  async function refresh() {
    try {
      await Promise.all([
        client.refetchQueries({ queryKey: ['portfolio'], type: 'active' }, { throwOnError: true }),
        client.refetchQueries(
          { queryKey: ['portfolio-producers'], type: 'active' },
          { throwOnError: true }
        ),
      ])
      toast.success('Portfolio refreshed')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not refresh portfolio.')
    }
  }
  return (
    <div className="app-shell regional-shell">
      <Header
        user={user}
        subtitle={`Regional portfolio / ${user.region}`}
        onSignOut={onSignOut}
        signingOut={signingOut}
        onOpenAccount={onOpenBrief}
      />
      <div className="regional-layout">
        <main className="regional-main" id="main-content" tabIndex={-1}>
          <section className="regional-title-row" aria-labelledby="portfolio-title">
            <p className="eyebrow">Portfolio intelligence · {user.region}</p>
            <h1 id="portfolio-title">Which renewals need attention?</h1>
            <p>
              {portfolio
                ? `${portfolio.total_accounts} clients · ${formatMoney(portfolio.total_annual_premium)} annual premium · as of ${formatDate(portfolio.as_of_date)}`
                : `Your authorized ${user.region} portfolio`}
            </p>
            <div className="regional-filters">
              <div>
                <span className="filter-label">Producer</span>
                <Select
                  label="Producer filter"
                  value={producer}
                  onValueChange={setProducer}
                  options={[
                    { value: '', label: 'All producers' },
                    ...(producersQuery.data?.producers ?? []).map((item) => ({
                      value: item.user_id,
                      label: item.name,
                    })),
                  ]}
                />
              </div>
              <div>
                <span className="filter-label">Risk level</span>
                <Select
                  label="Risk filter"
                  value={risk}
                  onValueChange={setRisk}
                  options={[
                    { value: '', label: 'All risk levels' },
                    { value: 'high', label: 'High risk' },
                    { value: 'medium', label: 'Medium risk' },
                    { value: 'low', label: 'Low risk' },
                  ]}
                />
              </div>
              <div>
                <span className="filter-label">Renewal window</span>
                <Select
                  label="Renewal filter"
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
              <div className="inline-controls">
                {filtered && (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setProducer('')
                      setRisk('')
                      setHorizon('0')
                    }}
                  >
                    Clear filters
                  </Button>
                )}
                <Tooltip content="Refresh all portfolio metrics and sources">
                  <Button
                    size="icon"
                    aria-label="Refresh portfolio"
                    onClick={refresh}
                    disabled={portfolioQuery.isFetching}
                  >
                    <RefreshCw />
                  </Button>
                </Tooltip>
              </div>
            </div>
          </section>
          {portfolioQuery.isError && (
            <ErrorState
              message={portfolioQuery.error.message}
              onRetry={() => portfolioQuery.refetch()}
            />
          )}
          {portfolioQuery.isPending && <LoadingState label="Loading portfolio intelligence…" />}
          {portfolio && (
            <>
              <section className="regional-kpis" aria-label="Portfolio key metrics">
                <Kpi
                  label="Premium at risk"
                  value={formatMoney(portfolio.premium_at_risk)}
                  detail={`${portfolio.high_risk_clients} high-risk clients`}
                />
                <Kpi
                  label="Renewals in 30 days"
                  value={portfolio.renewals_30_days}
                  detail={`${formatMoney(portfolio.renewals_30_days_premium)} premium · includes overdue`}
                />
                <Kpi
                  label="High-risk clients"
                  value={portfolio.high_risk_clients}
                  detail={`of ${portfolio.total_accounts} in current view`}
                />
                <Kpi
                  label="Open high-severity claims"
                  value={portfolio.open_high_severity_claims}
                  detail="within renewal risk window"
                />
                <Kpi
                  label="Overdue commitments"
                  value={portfolio.overdue_commitments}
                  detail={`across ${portfolio.overdue_clients} clients`}
                  alert
                />
              </section>
              <Card className="regional-table-panel" aria-labelledby="attention-title">
                <div className="panel-header-row">
                  <h2 className="panel-label" id="attention-title">
                    <SlidersHorizontal size={20} />
                    Needs attention
                  </h2>
                  <div className="inline-controls">
                    <Badge>
                      {view === 'cards' ? visibleCards.length : portfolio.total_accounts} clients
                    </Badge>
                    <div className="view-toggle" role="group" aria-label="Portfolio display">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Card view"
                        aria-pressed={view === 'cards'}
                        onClick={() => setView('cards')}
                      >
                        <LayoutGrid />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Table view"
                        aria-pressed={view === 'table'}
                        onClick={() => setView('table')}
                      >
                        <Rows3 />
                      </Button>
                    </div>
                  </div>
                </div>
                <p className="muted mb-4 text-xs">
                  Ranked by risk, then renewal date. Search applies to client records; metrics
                  follow the filters above.
                </p>
                {view === 'table' ? (
                  <DataTable
                    key={`${producer}:${risk}:${horizon}`}
                    data={portfolio.accounts}
                    columns={columns}
                    label="Portfolio clients"
                    className="portfolio-table"
                    getRowId={(row) => row.account_id}
                    onSelect={(row) => setSelectedId(row.account_id)}
                    selectedId={selected?.account_id}
                  />
                ) : (
                  <>
                    <div className="table-toolbar">
                      <div className="search-control">
                        <Search size={16} aria-hidden="true" />
                        <Input
                          aria-label="Search portfolio cards"
                          value={cardSearch}
                          onChange={(event) => setCardSearch(event.target.value)}
                          placeholder="Client, producer or signal..."
                        />
                      </div>
                    </div>
                    <div className="portfolio-cards">
                      {visibleCards.map((row) => (
                          <article
                            className={`portfolio-client-card ${selected?.account_id === row.account_id ? 'selected' : ''}`}
                            key={row.account_id}
                            aria-labelledby={`card-${row.account_id}`}
                            aria-current={selected?.account_id === row.account_id ? 'true' : undefined}
                            onClick={(event) => {
                              if (!(event.target as HTMLElement).closest('button,a,input')) {
                                setSelectedId(row.account_id)
                              }
                            }}
                          >
                            <div className="portfolio-card-heading">
                              <h3 id={`card-${row.account_id}`}>
                                <button
                                  type="button"
                                  className="portfolio-card-select"
                                  aria-pressed={selected?.account_id === row.account_id}
                                  aria-controls="selected-client-details"
                                  onClick={() => setSelectedId(row.account_id)}
                                >
                                  {row.name}
                                </button>
                              </h3>
                              <StatusBadge status={row.risk_level} />
                            </div>
                            <p className="portfolio-card-meta">{row.producer_name}</p>
                            <dl className="portfolio-card-metrics">
                              <div>
                                <dt>Annual premium</dt>
                                <dd>{formatMoney(row.annual_premium)}</dd>
                              </div>
                              <div>
                                <dt>Next renewal</dt>
                                <dd>{formatRenewal(row.days_to_renewal)}</dd>
                              </div>
                            </dl>
                            <div className="portfolio-card-signal">
                              {row.top_signal ? (
                                <>
                                  <p>{row.top_signal.title}</p>
                                  <Badge tone={row.top_signal.is_fact ? 'info' : 'warning'}>
                                    {row.top_signal.is_fact ? 'Fact' : 'Hypothesis'} /{' '}
                                    {Math.round(row.top_signal.confidence * 100)}%
                                  </Badge>
                                </>
                              ) : (
                                <p className="muted">No active risk signals</p>
                              )}
                            </div>
                            <div className="flag-list">
                              {row.flags.map((flag) => (
                                <Badge
                                  key={flag}
                                  tone={flag === 'Overdue' ? 'critical' : 'warning'}
                                >
                                  {flag}
                                </Badge>
                              ))}
                            </div>
                            <div className="portfolio-card-footer">
                              <Button
                                size="sm"
                                variant="ghost"
                                aria-label={`Inspect ${row.name}`}
                                onClick={() => inspect(row)}
                              >
                                Inspect
                              </Button>
                              <Button
                                size="sm"
                                variant="default"
                                onClick={() => onOpenBrief(row.account_id)}
                                aria-label={`Open brief for ${row.name}`}
                              >
                                Open brief
                                <ArrowRight />
                              </Button>
                            </div>
                          </article>
                        ))}
                    </div>
                    {!visibleCards.length && (
                      <EmptyState
                        title="No matching clients"
                        description="Try another client, producer or signal."
                      />
                    )}
                  </>
                )}
                <p className="locked-note">
                  <ShieldCheck size={16} className="inline mr-2" aria-hidden="true" />
                  {portfolio.locked_count} client{portfolio.locked_count !== 1 ? 's' : ''} outside
                  your access. Restricted clients are excluded from results and totals.
                </p>
              </Card>
              <Card aria-labelledby="renewal-title">
                <div className="panel-header-row">
                  <h2 id="renewal-title" className="panel-label">
                    <CalendarDays size={20} />
                    Renewal timeline, next 90 days
                  </h2>
                </div>
                <div className="renewal-buckets">
                  {portfolio.timeline.map((bucket) => (
                    <article key={bucket.label}>
                      <h3>{bucket.label}</h3>
                      <p>
                        {bucket.count} renewals · {formatMoney(bucket.premium)}
                      </p>
                      <div>
                        {bucket.accounts.map((account) => (
                          <Button
                            key={account.account_id}
                            variant="ghost"
                            onClick={() => {
                              const row = portfolio.accounts.find(
                                (item) => item.account_id === account.account_id
                              )
                              if (row) inspect(row)
                            }}
                          >
                            {account.name} · {account.days}d
                          </Button>
                        ))}
                        {!bucket.count && <span className="muted">No renewals</span>}
                      </div>
                    </article>
                  ))}
                </div>
              </Card>
            </>
          )}
        </main>
        <aside className="regional-aside" aria-label="Regional insights">
          {portfolio && (
            <>
              <Card className="regional-summary" aria-labelledby="regional-summary-title">
                <h2 className="panel-label" id="regional-summary-title">
                  Regional summary
                </h2>
                <p>{portfolio.summary}</p>
                <div className="regional-sources">
                  <span className="sr-only">Source record references</span>
                  {portfolio.sources.slice(0, 6).map((source) => (
                    <Tooltip
                      key={`${source.source_id}:${source.system}`}
                      content={`${source.title} · ${source.system}`}
                    >
                      <span tabIndex={0}>
                        <Badge>{source.source_id}</Badge>
                      </span>
                    </Tooltip>
                  ))}
                </div>
              </Card>
              <Card id="selected-client-details" className="selected-client-panel" aria-labelledby="selected-title">
                <div className="panel-header-row">
                  <h2 className="panel-label" id="selected-title">
                    {selected ? `Selected: ${selected.name}` : 'Select a client'}
                  </h2>
                </div>
                {selected ? (
                  <>
                    <p className="selected-meta">
                      {selected.producer_name} · {formatMoney(selected.annual_premium)} ·{' '}
                      {formatRenewal(selected.days_to_renewal)}
                    </p>
                    <StatusBadge status={selected.risk_level}>
                      {selected.risk_level} renewal risk
                    </StatusBadge>
                    <ul className="selected-signals">
                      {selected.signals.map((signal, index) => (
                        <li key={index}>
                          <StatusBadge status={signal.severity}>
                            {signal.severity} · {Math.round(signal.confidence * 100)}%
                          </StatusBadge>
                          {signal.title}
                        </li>
                      ))}
                      {selected.overdue_items.map((item) => (
                        <li key={item}>
                          <Badge tone="critical">Overdue commitment</Badge>
                          {item}
                        </li>
                      ))}
                    </ul>
                    <Button variant="default" onClick={() => onOpenBrief(selected.account_id)}>
                      Open full brief
                      <ArrowRight />
                    </Button>
                  </>
                ) : (
                  <EmptyState
                    title="No clients in this view"
                    description="Broaden your filters to review a client."
                  />
                )}
              </Card>
              <Card aria-labelledby="risk-distribution-title">
                <h2 className="panel-label" id="risk-distribution-title">
                  <ChartNoAxesCombined size={20} />
                  Risk distribution
                </h2>
                <div className="risk-distribution">
                  {(['high', 'medium', 'low'] as const).map((level) => (
                    <div className="distribution-row" key={level}>
                      <span className="capitalize">{level} risk</span>
                      <div className="distribution-track" aria-hidden="true">
                        <div
                          className={`distribution-fill ${level}`}
                          style={{
                            width: `${portfolio.total_accounts ? (portfolio.risk_distribution[level] / portfolio.total_accounts) * 100 : 0}%`,
                          }}
                        />
                      </div>
                      <strong className="numeric">{portfolio.risk_distribution[level]}</strong>
                    </div>
                  ))}
                </div>
                <div className="service-totals">
                  <div>
                    <strong>{portfolio.total_open_claims}</strong>
                    <small>Open claims</small>
                  </div>
                  <div>
                    <strong>{portfolio.total_open_cases}</strong>
                    <small>Open service cases</small>
                  </div>
                </div>
              </Card>
              <Card className="producer-workload" aria-labelledby="workload-title">
                <h2 className="panel-label" id="workload-title">
                  Producer workload
                </h2>
                {portfolio.workloads.map((row) => (
                  <article className="workload-item" key={row.producer_id}>
                    <h3>{row.name}</h3>
                    <div className="workload-metrics">
                      {[
                        ['Clients', row.clients],
                        ['High risk', row.high_risk],
                        ['Claims', row.open_claims],
                        ['Overdue', row.overdue],
                      ].map(([label, value]) => (
                        <div key={label}>
                          <strong>{value}</strong>
                          <small>{label}</small>
                        </div>
                      ))}
                    </div>
                  </article>
                ))}
              </Card>
              <p className="regional-footnote">
                Metrics follow producer, risk and renewal filters. Premium figures use annual
                account premium. Synthetic records as of {formatDate(portfolio.as_of_date)}.
              </p>
            </>
          )}
        </aside>
      </div>
      <RecordSheet record={inspection} onClose={() => setInspection(null)} />
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
    <Card className={`regional-kpi ${alert ? 'alert' : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </Card>
  )
}
