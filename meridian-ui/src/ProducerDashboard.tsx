import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  CheckSquare,
  FileText,
  MessageSquare,
  RefreshCw,
  Sparkles,
} from 'lucide-react'
import { generateBrief, getJson, type UserProfile } from './api'
import type { Account, AccountBrief, AccountDetail, DetailTab, Signal } from './types'
import { formatDate, formatMoney } from './format'
import { AccountDetailsPanel } from './AccountDetailsPanel'
import { Header } from './Header'

export function ProducerDashboard({
  user,
  onSignOut,
  signingOut,
  initialAccountId = '',
  onBack,
}: {
  user: UserProfile
  onSignOut: () => void
  signingOut: boolean
  initialAccountId?: string
  onBack?: () => void
}) {
  const [selectedId, setSelectedId] = useState(initialAccountId)
  const [tab, setTab] = useState<DetailTab>('overview')
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
    enabled: !!accountId && tab !== 'overview',
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
                    className="button button-outline export-button"
                    onClick={() => window.print()}
                  >
                    <FileText size={14} />
                    Export brief
                  </button>
                </div>
              </section>
              <nav className="detail-tabs" aria-label="Client details">
                {(
                  [
                    ['overview', 'Overview'],
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
                    {label}
                  </button>
                ))}
              </nav>
              {tab === 'overview' ? (
                <>
                  <section className="panel executive-summary-card">
                    <div className="summary-title-row">
                      <h2 className="panel-label">Executive summary</h2>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {brief.claim_review.omitted || !brief.claim_review.complete ? (
                          <span className="completeness-badge alert" role="status">
                            <AlertTriangle size={13} />
                            {brief.claim_review.omitted
                              ? `Completeness failed: ${brief.claim_review.omitted} omitted`
                              : !brief.permissions?.claims
                                ? 'Claim access restricted'
                                : 'Completeness check failed'}
                          </span>
                        ) : (
                          <span className="completeness-badge">
                            <CheckCircle2 size={13} />
                            {`${brief.claim_review.reviewed} of ${brief.claim_review.total} accessible open claims reviewed`}
                          </span>
                        )}
                        <button
                          className="regenerate-btn"
                          onClick={() => generateMutation.mutate(accountId)}
                          disabled={generateMutation.isPending}
                          title="Regenerate brief using TCS GenAILab GPT-4o Model"
                        >
                          {generateMutation.isPending ? (
                            <>
                              <RefreshCw size={12} className="spin-icon" />
                              Synthesizing...
                            </>
                          ) : (
                            <>
                              <Sparkles size={12} />
                              Regenerate AI Brief
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                    {regenerateError && (
                      <div className="error-banner" role="alert" style={{ margin: '8px 0' }}>
                        {regenerateError}
                      </div>
                    )}
                    {(brief.claim_review.omitted || !brief.claim_review.complete) && (
                      <div className="completeness-alert-box" role="alert">
                        <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
                        <div>
                          <strong>Scenario Alert: Material Record Omission Detected</strong>
                          <p>
                            {brief.claim_review.omitted
                              ? `A material record (${brief.claim_review.omitted}) was omitted from the initial brief summary.`
                              : 'Open claim records require synthesis.'}
                            {' '}Click <strong>"Regenerate AI Brief"</strong> to synthesize full grounded context with the Client Intelligence Agent.
                          </p>
                        </div>
                      </div>
                    )}
                    <p className="summary-body">{brief.summary}</p>
                    {brief.evidence_citations && brief.evidence_citations.length > 0 && (
                      <div className="citations-row">
                        <span className="citations-label">Citations:</span>
                        <div className="citations-chips">
                          {brief.evidence_citations.map((cite, idx) => (
                            <span key={idx} className="citation-chip">
                              {cite}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {brief.telemetry && (
                      <div className="brief-telemetry-row">
                        <span className="telemetry-badge">
                          ⚡ {brief.telemetry.model} · {brief.telemetry.total_tokens.toLocaleString()} tokens · {(brief.telemetry.latency_ms / 1000).toFixed(1)}s · ${brief.telemetry.cost_usd.toFixed(4)}
                        </span>
                        <span className="telemetry-version">Version {brief.latest_brief?.version ?? 1}</span>
                      </div>
                    )}
                    <p className="updated-label">
                      Current source records · scenario date {formatDate(brief.as_of_date)}
                    </p>
                  </section>
                  {((brief.agenda && brief.agenda.length > 0) || (brief.talking_points && brief.talking_points.length > 0)) && (
                    <div className="meeting-prep-grid">
                      {brief.agenda && brief.agenda.length > 0 && (
                        <section className="panel agenda-panel">
                          <div className="panel-header-row">
                            <h2 className="card-subhead">
                              <Calendar size={15} /> Stewardship Meeting Agenda
                            </h2>
                            <span className="card-badge">{brief.agenda.length} topics</span>
                          </div>
                          <ol className="agenda-numbered-list">
                            {brief.agenda.map((item, idx) => (
                              <li key={idx} className="agenda-item">
                                <span>{item.replace(/^\d+\.\s*/, '')}</span>
                              </li>
                            ))}
                          </ol>
                        </section>
                      )}
                      {brief.talking_points && brief.talking_points.length > 0 && (
                        <section className="panel talking-points-panel">
                          <div className="panel-header-row">
                            <h2 className="card-subhead">
                              <MessageSquare size={15} />{' '}
                              {user.role === 'Producer'
                                ? 'Producer Talking Points'
                                : 'Leadership Talking Points'}
                            </h2>
                            <span className="card-badge">Facts vs Hypotheses</span>
                          </div>
                          <ul className="talking-points-list">
                            {brief.talking_points.map((tp, idx) => {
                              const isHypothesis = tp.toLowerCase().includes('hypothesis')
                              return (
                                <li
                                  key={idx}
                                  className={`talking-point-item ${isHypothesis ? 'hypothesis-point' : 'fact-point'}`}
                                >
                                  <span className={`point-tag ${isHypothesis ? 'hypothesis-tag' : 'fact-tag'}`}>
                                    {isHypothesis ? 'Hypothesis' : 'Fact'}
                                  </span>
                                  <span className="point-text">
                                    {tp.replace(/^(Confirmed fact:\s*|Hypothesis:\s*|Hypothesis \(unverified\):\s*)/i, '')}
                                  </span>
                                </li>
                              )
                            })}
                          </ul>
                        </section>
                      )}
                    </div>
                  )}
                  {brief.suggested_actions && brief.suggested_actions.length > 0 && (
                    <section className="panel suggested-actions-panel">
                      <div className="panel-header-row">
                        <h2 className="card-subhead">
                          <CheckSquare size={15} /> Suggested Next Actions
                        </h2>
                        <span className="card-badge">{brief.suggested_actions.length} recommended</span>
                      </div>
                      <div className="actions-grid">
                        {brief.suggested_actions.map((action, idx) => (
                          <div key={idx} className="action-card">
                            <div className="action-header">
                              <span className={`action-type-tag ${action.action_type}`}>
                                {action.action_type === 'draft_followup'
                                  ? 'Follow-up'
                                  : action.action_type === 'review_task'
                                    ? 'Review'
                                    : 'Referral'}
                              </span>
                              <span className="action-title">{action.title}</span>
                            </div>
                            <p className="action-description">{action.description}</p>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}
                  <div className="cockpit-2x2-grid">
                    <section className="cockpit-grid-card">
                      <div className="card-subhead-row">
                        <h2 className="card-subhead">Risk flags</h2>
                        {brief.prioritized_risks && brief.prioritized_risks.length > 0 && (
                          <span className="card-badge">{brief.prioritized_risks.length} AI prioritized</span>
                        )}
                      </div>
                      {brief.prioritized_risks && brief.prioritized_risks.length > 0 && (
                        <div className="ai-assessment-box">
                          <span className="ai-box-label"><Sparkles size={11} /> AI Prioritized Risk Drivers</span>
                          <ul className="ai-prioritized-list">
                            {brief.prioritized_risks.map((risk, idx) => (
                              <li key={idx} className="ai-prioritized-item">
                                {risk}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <div className="card-list-items">
                        {brief.risks.map((signal) => (
                          <SignalRow signal={signal} key={signal.signal_id} />
                        ))}
                        {!brief.risks.length && <p className="muted">No supported risk flags.</p>}
                      </div>
                    </section>
                    <section className="cockpit-grid-card">
                      <div className="card-subhead-row">
                        <h2 className="card-subhead">Opportunity signals (hypotheses)</h2>
                        {brief.opportunity_hypotheses && brief.opportunity_hypotheses.length > 0 && (
                          <span className="card-badge">{brief.opportunity_hypotheses.length} AI evaluated</span>
                        )}
                      </div>
                      {brief.opportunity_hypotheses && brief.opportunity_hypotheses.length > 0 && (
                        <div className="ai-assessment-box opportunity-hyp-box">
                          <span className="ai-box-label"><Sparkles size={11} /> AI Opportunity Hypotheses Governance</span>
                          <ul className="ai-hypotheses-list">
                            {brief.opportunity_hypotheses.map((hyp, idx) => {
                              const isHyp = hyp.toLowerCase().includes('hypothesis')
                              return (
                                <li key={idx} className={`ai-hypothesis-item ${isHyp ? 'is-hyp' : 'is-opp'}`}>
                                  <span className={`opp-pill ${isHyp ? 'pill-hyp' : 'pill-opp'}`}>
                                    {isHyp ? 'Hypothesis' : 'Opportunity'}
                                  </span>
                                  <span className="opp-text">{hyp}</span>
                                </li>
                              )
                            })}
                          </ul>
                        </div>
                      )}
                      <div className="card-list-items">
                        {brief.opportunities.map((signal) => (
                          <SignalRow signal={signal} key={signal.signal_id} />
                        ))}
                        {!brief.opportunities.length && (
                          <p className="muted">
                            Insufficient accessible evidence for an opportunity.
                          </p>
                        )}
                      </div>
                      <p className="card-footer-muted">
                        Validate assumptions with the client before recommending coverage.
                      </p>
                    </section>
                    <section className="cockpit-grid-card">
                      <h2 className="card-subhead">Open commitments</h2>
                      <div className="card-list-items">
                        {brief.commitments.map((item) => (
                          <div className="commitment-line" key={item.commitment_id}>
                            <span className="commit-title">{item.description}</span>
                            <span
                              className={item.status === 'overdue' ? 'overdue-tag' : 'date-tag'}
                            >
                              {item.status === 'overdue' && 'Overdue · '}
                              {formatDate(item.due_date)}
                            </span>
                          </div>
                        ))}
                        {!brief.commitments.length && <p className="muted">No open commitments.</p>}
                      </div>
                    </section>
                    {!!brief.milestones.length && (
                      <section className="cockpit-grid-card">
                        <h2 className="card-subhead">Renewal milestones</h2>
                        {brief.milestones.map((item) => (
                          <p className="milestone-line" key={item.milestone_id}>
                            {item.milestone}
                            <span>{formatDate(item.due_date)}</span>
                          </p>
                        ))}
                      </section>
                    )}
                  </div>
                </>
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
  )
}

function SignalRow({ signal }: { signal: Signal }) {
  const conf = Number(signal.confidence || 0)
  const isHypothesis = !signal.is_fact && conf < 0.6
  const isOpportunity = !signal.is_fact && conf >= 0.6
  return (
    <div className="live-signal">
      <div className="signal-item">
        <span className="signal-item-text">{signal.title}</span>
        <span
          className={
            signal.is_fact
              ? `risk-chip ${signal.severity}`
              : isHypothesis
                ? 'confidence-chip hypothesis'
                : 'confidence-chip opportunity-medium'
          }
        >
          {isHypothesis && 'Hypothesis '}
          {isOpportunity && 'Opportunity '}
          {Math.round(conf * 100)}%
        </span>
      </div>
      <p>{signal.description}</p>
      {signal.assumptions && <small>Assumption: {signal.assumptions}</small>}
      {signal.confidence_breakdown && (
        <details className="signal-math-details">
          <summary>Confidence breakdown</summary>
          <pre>{JSON.stringify(signal.confidence_breakdown, null, 2)}</pre>
        </details>
      )}
    </div>
  )
}
