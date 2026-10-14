import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  CheckSquare,
  Clock,
  RefreshCw,
  Sparkles,
} from 'lucide-react'
import type { AccountBrief, DetailTab } from './types'
import { formatDate, formatMoney } from './format'

function formatEventType(type: string): string {
  switch (type) {
    case 'claim_opened':
      return 'Claim Opened'
    case 'meeting':
      return 'Meeting'
    case 'service_escalation':
      return 'Service Escalation'
    case 'service_case':
      return 'Service Case'
    case 'billing_overdue':
      return 'Billing Overdue'
    case 'commitment_overdue':
      return 'Commitment Overdue'
    case 'endorsement_requested':
      return 'Endorsement'
    default:
      return type.replaceAll('_', ' ')
  }
}

export function ClientOverviewPanel({
  brief,
  onSelectTab,
  onRegenerate,
  regenerating,
  regenerateError,
}: {
  brief: AccountBrief
  userRole?: string
  onSelectTab: (tab: DetailTab) => void
  onRegenerate: () => void
  regenerating: boolean
  regenerateError?: string | null
}) {
  return (
    <div className="client-overview-panel">
      {/* 1. Operational Snapshot KPI Grid */}
      <div className="snapshot-grid">
        <div className="panel snapshot-card blue">
          <div className="snapshot-label">Active Policies & Annual Premium</div>
          <div className="snapshot-bottom">
            <strong>{brief.snapshot.policy_count} Active</strong>
            <span>{formatMoney(brief.account.annual_premium)}/yr</span>
          </div>
          <button
            type="button"
            className="card-quick-action"
            onClick={() => onSelectTab('policies')}
          >
            View policies →
          </button>
        </div>

        <div className="panel snapshot-card coral">
          <div className="snapshot-label">Open Claims</div>
          <div className="snapshot-bottom">
            <strong>{brief.snapshot.open_claim_count}</strong>
            <span>{brief.claim_review.complete ? 'Full claims review' : 'Review needed'}</span>
          </div>
          <button
            type="button"
            className="card-quick-action"
            onClick={() => onSelectTab('claims')}
          >
            View claims →
          </button>
        </div>

        <div className="panel snapshot-card">
          <div className="snapshot-label">Open Service Cases</div>
          <div className="snapshot-bottom">
            <strong>{brief.snapshot.open_service_case_count}</strong>
            <span>Active service tickets</span>
          </div>
          <button
            type="button"
            className="card-quick-action"
            onClick={() => onSelectTab('service-cases')}
          >
            View service cases →
          </button>
        </div>

        <div className="panel snapshot-card green">
          <div className="snapshot-label">Renewal Due</div>
          <div className="snapshot-bottom">
            <strong>{brief.days_to_renewal != null ? `${brief.days_to_renewal}d` : '—'}</strong>
            <span className={`mini-risk ${brief.account.risk_level ?? 'low'}`}>
              {brief.account.risk_level ?? 'low'} risk
            </span>
          </div>
          <button
            type="button"
            className="card-quick-action"
            onClick={() => onSelectTab('ai-brief')}
          >
            Brief & prep →
          </button>
        </div>
      </div>

      {/* 2. AI Intelligence Status Pill & Scenario 1 Banner */}
      <section className="panel ai-overview-callout">
        <div className="ai-callout-header">
          <div className="ai-callout-left">
            <span className="ai-brief-pill">
              <Sparkles size={13} /> AI Meeting Brief v{brief.latest_brief?.version ?? 1}
            </span>
            {brief.claim_review.omitted || !brief.claim_review.complete ? (
              <span className="ai-callout-status">
                Synthesis pending · Scenario alert active
              </span>
            ) : (
              <span className="completeness-badge">
                <CheckCircle2 size={13} />
                {`${brief.claim_review.reviewed} of ${brief.claim_review.total} accessible open claims reviewed`}
              </span>
            )}
            {brief.telemetry && (
              <span className="telemetry-pill">
                {brief.telemetry.model} · {(brief.telemetry.latency_ms / 1000).toFixed(1)}s
              </span>
            )}
          </div>
          <button
            type="button"
            className="button button-outline ai-jump-btn"
            onClick={() => onSelectTab('ai-brief')}
          >
            <Sparkles size={13} />
            Open AI Meeting Brief →
          </button>
        </div>

        {regenerateError && (
          <div className="error-banner" role="alert" style={{ marginTop: '8px' }}>
            {regenerateError}
          </div>
        )}

        {(brief.claim_review.omitted || !brief.claim_review.complete) && (
          <div className="completeness-alert-box" role="alert">
            <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
            <div style={{ flex: 1 }}>
              <strong>Scenario Alert: Material Record Omission Detected</strong>
              <p>
                {brief.claim_review.omitted
                  ? `A material record (${brief.claim_review.omitted}) was omitted from the initial brief summary.`
                  : 'Open claim records require synthesis.'}{' '}
                Click <strong>"Regenerate AI Brief"</strong> to synthesize full grounded context
                with the Client Intelligence Agent.
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
              <span className="completeness-badge alert" role="status">
                <AlertTriangle size={13} />
                {brief.claim_review.omitted
                  ? `Completeness failed: ${brief.claim_review.omitted} omitted`
                  : !brief.permissions?.claims
                    ? 'Claim access restricted'
                    : 'Completeness check failed'}
              </span>
              <button
                className="regenerate-btn"
                onClick={onRegenerate}
                disabled={regenerating}
                title="Regenerate brief using TCS GenAILab GPT-4o Model"
              >
                {regenerating ? (
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
        )}
      </section>

      {/* 3. Relationship Journey Timeline */}
      <section className="panel timeline-card-panel">
        <div className="panel-header-row">
          <h2 className="card-subhead">
            <Clock size={15} /> Relationship Journey Timeline
          </h2>
          <span className="card-badge">
            {brief.timeline ? brief.timeline.length : 0} multi-system events
          </span>
        </div>
        {brief.timeline && brief.timeline.length > 0 ? (
          <div className="timeline-items-list">
            {brief.timeline.map((event) => (
              <div key={event.event_id} className="timeline-item-row">
                <span className="timeline-date">{formatDate(event.event_date)}</span>
                <span className={`timeline-type-badge ${event.event_type}`}>
                  {formatEventType(event.event_type)}
                </span>
                <span className="timeline-title">{event.title}</span>
                {event.ref_id && <span className="timeline-ref-id">{event.ref_id}</span>}
              </div>
            ))}
          </div>
        ) : (
          <p className="muted" style={{ padding: '8px 0', margin: 0 }}>
            No relationship events recorded in enterprise timeline.
          </p>
        )}
      </section>

      {/* 4. Commitments & Milestones Grid */}
      <div className="cockpit-2x2-grid" style={{ marginTop: '12px' }}>
        <section className="cockpit-grid-card">
          <div className="panel-header-row" style={{ marginBottom: '8px' }}>
            <h2 className="card-subhead">
              <CheckSquare size={14} /> Open Commitments
            </h2>
            <span className="card-badge">{brief.commitments.length}</span>
          </div>
          <div className="card-list-items">
            {brief.commitments.map((item) => (
              <div className="commitment-line" key={item.commitment_id}>
                <span className="commit-title">{item.description}</span>
                <span className={item.status === 'overdue' ? 'overdue-tag' : 'date-tag'}>
                  {item.status === 'overdue' && 'Overdue · '}
                  {formatDate(item.due_date)}
                </span>
              </div>
            ))}
            {!brief.commitments.length && <p className="muted">No open commitments.</p>}
          </div>
        </section>

        <section className="cockpit-grid-card">
          <div className="panel-header-row" style={{ marginBottom: '8px' }}>
            <h2 className="card-subhead">
              <Calendar size={14} /> Renewal Milestones
            </h2>
            <span className="card-badge">{brief.milestones.length}</span>
          </div>
          <div className="card-list-items">
            {brief.milestones.map((item) => (
              <div className="milestone-line" key={item.milestone_id}>
                <span>{item.milestone}</span>
                <span className="date-tag">{formatDate(item.due_date)}</span>
              </div>
            ))}
            {!brief.milestones.length && <p className="muted">No renewal milestones scheduled.</p>}
          </div>
        </section>
      </div>

      {/* 5. Cross-System Contradictions (if any) */}
      {brief.contradictions && brief.contradictions.length > 0 && (
        <section className="panel contradictions-panel" style={{ marginTop: '12px' }}>
          <div className="panel-header-row">
            <h2 className="card-subhead">
              <AlertTriangle size={15} color="#b45309" /> Cross-System Data Discrepancies
            </h2>
            <span className="card-badge">{brief.contradictions.length} detected</span>
          </div>
          <div style={{ display: 'grid', gap: '8px' }}>
            {brief.contradictions.map((conflict) => (
              <div className="conflict-card-banner" key={conflict.contradiction_id}>
                <span className="conflict-title">
                  {(conflict.field ?? 'Record').replaceAll('_', ' ')} differs across systems.
                </span>
                <span className="conflict-sub">
                  {conflict.source_a}: <strong>{conflict.value_a}</strong> vs {conflict.source_b}:{' '}
                  <strong>{conflict.value_b}</strong>
                  <br />
                  Human review required prior to client communication.
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
