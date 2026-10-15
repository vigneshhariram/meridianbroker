import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  CheckSquare,
  Clock,
  Files,
  ShieldAlert,
  Sparkles,
  Ticket,
} from 'lucide-react'
import type { AccountBrief, DetailTab } from './types'
import type { GenerationController } from './useBriefGeneration'
import { formatDate, formatMoney, formatRenewal } from './format'
import { SignalRow } from './AiBriefPanel'
import { BriefStatus } from './BriefStatus'
import { Badge, Button, Card, EmptyState, StatusBadge } from './components/ui'

export function ClientOverviewPanel({
  brief,
  userRole = 'Producer',
  onSelectTab,
  generation,
}: {
  brief: AccountBrief
  userRole?: string
  onSelectTab: (tab: DetailTab) => void
  generation: GenerationController
}) {
  const snapshots = [
    {
      label: 'Active policies',
      value: brief.snapshot.policy_count,
      detail: `${formatMoney(brief.account.annual_premium)} annual account premium`,
      tab: 'policies' as const,
      action: 'View policies',
      icon: Files,
    },
    {
      label: 'Open claims',
      value: brief.snapshot.open_claim_count,
      detail: brief.claim_review.complete ? 'Full claims review' : 'Review needed',
      tab: 'claims' as const,
      action: 'View claims',
      icon: ShieldAlert,
    },
    {
      label: 'Open service cases',
      value: brief.snapshot.open_service_case_count,
      detail: 'Active service tickets',
      tab: 'service-cases' as const,
      action: 'View service cases',
      icon: Ticket,
    },
    {
      label: 'Next renewal',
      value:
        brief.days_to_renewal == null
          ? 'Not set'
          : brief.days_to_renewal < 0
            ? `${Math.abs(brief.days_to_renewal)}d overdue`
            : `${brief.days_to_renewal}d`,
      detail: brief.account.risk_level
        ? `${brief.account.risk_level} renewal risk`
        : 'Risk not recorded',
      tab: 'ai-brief' as const,
      action: 'Brief & prep',
      icon: Calendar,
    },
  ]
  const factualRisks = brief.risks.filter((signal) => signal.is_fact).length
  const hypotheses = brief.opportunities.filter((signal) => !signal.is_fact).length
  return (
    <div className="client-overview-panel">
      <section className="snapshot-grid" aria-label="Client operational snapshot">
        {snapshots.map(({ label, value, detail, tab, action, icon: Icon }) => (
          <Card className="snapshot-card" key={label}>
            <Icon size={20} className="snapshot-icon" aria-hidden="true" />
            <span className="snapshot-label">{label}</span>
            <div className="snapshot-bottom">
              <strong>{value}</strong>
              <span>{detail}</span>
            </div>
            <Button variant="ghost" className="card-quick-action" onClick={() => onSelectTab(tab)}>
              {action}
              <ArrowRight />
            </Button>
          </Card>
        ))}
      </section>
      <Card className="ai-overview-callout" aria-labelledby="readiness-title">
        <div className="panel-header-row">
          <h2 className="panel-label" id="readiness-title">
            <Sparkles size={20} />
            {userRole === 'Producer' ? 'Producer' : 'Leadership'} intelligence
          </h2>
          <Badge tone="info">
            {brief.latest_brief ? `Version ${brief.latest_brief.version ?? '—'}` : 'Live records'}
          </Badge>
        </div>
        <BriefStatus brief={brief} generation={generation} />
        <p className="overview-summary">{brief.summary}</p>
        <Button
          variant="ghost"
          className="overview-brief-link"
          onClick={() => onSelectTab('ai-brief')}
        >
          Open full brief
          <ArrowRight />
        </Button>
      </Card>
      <div className="cockpit-2x2-grid">
        <Card className="cockpit-grid-card" aria-labelledby="commitments-title">
          <div className="panel-header-row">
            <h2 className="card-subhead" id="commitments-title">
              <CheckSquare size={20} />
              Open commitments
            </h2>
            <Badge>{brief.commitments.length}</Badge>
          </div>
          {brief.commitments.length ? (
            brief.commitments.map((item) => (
              <article className="commitment-line" key={item.commitment_id}>
                <div>
                  <p>{item.description}</p>
                  <small>
                    Due {formatDate(item.due_date)} · Owner {item.owner_user_id ?? 'not assigned'}
                  </small>
                </div>
                <StatusBadge status={item.status} />
              </article>
            ))
          ) : (
            <EmptyState title="No open commitments" />
          )}
        </Card>
        <Card className="cockpit-grid-card" aria-labelledby="milestones-title">
          <div className="panel-header-row">
            <h2 className="card-subhead" id="milestones-title">
              <Calendar size={20} />
              Renewal milestones
            </h2>
            <Badge>{brief.milestones.length}</Badge>
          </div>
          {brief.milestones.length ? (
            brief.milestones.map((item) => (
              <article className="milestone-line" key={item.milestone_id}>
                <div>
                  <p>{item.milestone}</p>
                  <small>{formatDate(item.due_date)}</small>
                </div>
                <StatusBadge status={item.status} />
              </article>
            ))
          ) : (
            <EmptyState title="No milestones scheduled" />
          )}
          <p className="card-footer-muted">Next renewal: {formatRenewal(brief.days_to_renewal)}</p>
        </Card>
      </div>
      <div className="cockpit-2x2-grid risk-opportunity-grid">
        <Card className="cockpit-grid-card" aria-labelledby="risk-title">
          <div className="panel-header-row">
            <h2 className="card-subhead" id="risk-title">
              Risk flags
            </h2>
            <Badge>
              {factualRisks} facts · {brief.risks.length - factualRisks} hypotheses
            </Badge>
          </div>
          <div>
            {brief.risks.map((signal) => (
              <SignalRow signal={signal} key={signal.signal_id} />
            ))}
            {!brief.risks.length && <EmptyState title="No supported risk flags" />}
          </div>
        </Card>
        <Card className="cockpit-grid-card" aria-labelledby="opportunities-title">
          <div className="panel-header-row">
            <h2 className="card-subhead" id="opportunities-title">
              Opportunity signals
            </h2>
            <Badge tone="warning">{hypotheses} hypotheses</Badge>
          </div>
          <div>
            {brief.opportunities.map((signal) => (
              <SignalRow signal={signal} key={signal.signal_id} />
            ))}
            {!brief.opportunities.length && (
              <EmptyState
                title="No supported opportunities"
                description="Insufficient accessible evidence for an opportunity."
              />
            )}
          </div>
          <p className="card-footer-muted">
            Validate assumptions with the client before recommending coverage.
          </p>
        </Card>
      </div>
      {!!brief.contradictions.length && (
        <Card aria-labelledby="conflicts-title">
          <div className="panel-header-row">
            <h2 className="card-subhead" id="conflicts-title">
              <AlertTriangle size={20} />
              Cross-system discrepancies
            </h2>
            <Badge tone="warning">{brief.contradictions.length} need review</Badge>
          </div>
          {brief.contradictions.map((conflict) => (
            <article className="conflict-card-banner" key={conflict.contradiction_id}>
              <span className="conflict-title">
                {(conflict.field ?? 'Record').replaceAll('_', ' ')} differs across systems.
              </span>
              <span className="conflict-sub">
                {conflict.source_a}: <strong>{conflict.value_a}</strong>
                <br />
                {conflict.source_b}: <strong>{conflict.value_b}</strong>
                <br />
                Human review required before client communication.
              </span>
            </article>
          ))}
        </Card>
      )}
      <Card className="timeline-card-panel" aria-labelledby="journey-title">
        <div className="panel-header-row">
          <h2 className="card-subhead" id="journey-title">
            <Clock size={20} />
            Relationship journey timeline
          </h2>
          <Badge>{brief.timeline.length} events</Badge>
        </div>
        {brief.timeline.length ? (
          <div className="timeline-items-list">
            {brief.timeline.map((event) => {
              const tab = (
                {
                  claims: 'claims',
                  policies: 'policies',
                  service_cases: 'service-cases',
                  billing: 'billing',
                  documents: 'documents',
                } as Record<string, DetailTab>
              )[event.ref_table ?? '']
              return (
                <article key={event.event_id} className="timeline-item-row">
                  <time className="timeline-date" dateTime={event.event_date}>
                    {formatDate(event.event_date)}
                  </time>
                  <div>
                    <Badge>{event.event_type.replaceAll('_', ' ')}</Badge>
                    <span className="timeline-title">{event.title}</span>
                    {tab ? (
                      <Button
                        variant="ghost"
                        className="p-0 text-xs"
                        onClick={() => onSelectTab(tab)}
                      >
                        Inspect {event.ref_id}
                        <ArrowRight />
                      </Button>
                    ) : (
                      event.ref_id && <span className="timeline-ref-id">{event.ref_id}</span>
                    )}
                  </div>
                </article>
              )
            })}
          </div>
        ) : (
          <EmptyState title="No relationship events recorded" />
        )}
      </Card>
    </div>
  )
}
