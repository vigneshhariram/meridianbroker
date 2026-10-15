import { useState } from 'react'
import { Calendar, CheckSquare, FileText, MessageSquare, Sparkles } from 'lucide-react'
import type { AccountBrief, Signal, SuggestedAction } from './types'
import type { GenerationController } from './useBriefGeneration'
import { formatDate } from './format'
import { BriefStatus } from './BriefStatus'
import { BriefActionDraft } from './BriefActionDraft'
import { CitationSheet } from './CitationSheet'
import { Accordion, Badge, Button, Card, EmptyState, Skeleton, StatusBadge } from './components/ui'
import { RecordSheet, type InspectionRecord } from './components/RecordSheet'

export function SignalRow({ signal }: { signal: Signal }) {
  const [inspection, setInspection] = useState<InspectionRecord | null>(null)
  return (
    <article className="live-signal">
      <div className="signal-item">
        <strong>{signal.title ?? 'Untitled signal'}</strong>
        <Badge tone={signal.is_fact ? 'info' : 'warning'}>
          {signal.is_fact ? 'Fact' : 'Hypothesis'} ·{' '}
          {signal.confidence == null
            ? 'Confidence not recorded'
            : `${Math.round(Number(signal.confidence) * 100)}%`}
        </Badge>
      </div>
      <div className="inline-controls mt-2">
        <StatusBadge status={signal.severity} />
        {signal.rule_id && <Badge>{signal.rule_id}</Badge>}
      </div>
      {signal.description && <p>{signal.description}</p>}
      {signal.assumptions && <small>Assumption: {signal.assumptions}</small>}
      <Accordion
        sections={[
          {
            id: `${signal.signal_id}:evidence`,
            title: `Evidence & confidence · ${signal.evidence.length} source records`,
            content: (
              <div className="evidence-list">
                {signal.confidence_breakdown && (
                  <dl className="record-fields">
                    {Object.entries(signal.confidence_breakdown).map(([key, value]) => (
                      <div key={key}>
                        <dt>{key.replaceAll('_', ' ')}</dt>
                        <dd>
                          {typeof value === 'boolean'
                            ? value
                              ? 'Yes'
                              : 'No'
                            : typeof value === 'object'
                              ? JSON.stringify(value)
                              : String(value)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}
                {signal.evidence.map((item) => (
                  <div className="evidence-entry" key={item.evidence_id}>
                    <Button
                      variant="ghost"
                      onClick={() =>
                        setInspection({
                          id: item.evidence_id,
                          title: item.source_id ?? item.evidence_id,
                          description:
                            'Evidence provenance and confidence inputs returned for this signal.',
                          content: item.snippet,
                          fields: [
                            { label: 'Source system', value: item.source_system },
                            {
                              label: 'Record type',
                              value: item.source_table?.replaceAll('_', ' '),
                            },
                            { label: 'Source ID', value: item.source_id },
                            { label: 'Recency date', value: formatDate(item.recency_date) },
                            {
                              label: 'Confidence',
                              value:
                                item.confidence == null
                                  ? 'Not recorded'
                                  : `${Math.round(Number(item.confidence) * 100)}%`,
                            },
                            {
                              label: 'Source reliability',
                              value:
                                item.source_score == null
                                  ? 'Not recorded'
                                  : `${Math.round(Number(item.source_score) * 100)}%`,
                            },
                            {
                              label: 'Recency factor',
                              value:
                                item.recency_factor == null
                                  ? 'Not recorded'
                                  : Number(item.recency_factor).toFixed(2),
                            },
                            { label: 'Evidence ID', value: item.evidence_id },
                          ],
                        })
                      }
                    >
                      {item.source_system} · {item.source_id}
                    </Button>
                    <p>{item.snippet}</p>
                    <small>{formatDate(item.recency_date)}</small>
                  </div>
                ))}
                {!signal.evidence.length && (
                  <p className="muted">No accessible supporting records.</p>
                )}
              </div>
            ),
          },
        ]}
      />
      <RecordSheet record={inspection} onClose={() => setInspection(null)} />
    </article>
  )
}

export function AiBriefPanel({
  brief,
  userRole = 'Producer',
  generation,
  onExportPdf,
}: {
  brief: AccountBrief
  userRole?: string
  generation: GenerationController
  onExportPdf: () => void
}) {
  const [citation, setCitation] = useState<string | null>(null)
  const [selectedAction, setSelectedAction] = useState<SuggestedAction | null>(null)
  return (
    <div className="ai-brief-panel">
      <Card className="executive-summary-card" aria-labelledby="summary-title">
        <div className="summary-title-row">
          <div>
            <p className="eyebrow">
              {userRole === 'Producer' ? 'Producer' : 'Leadership'} preparation
            </p>
            <h2 className="panel-label" id="summary-title">
              <Sparkles size={20} />
              Executive brief
            </h2>
          </div>
          <Button onClick={onExportPdf}>
            <FileText />
            Export Brief (PDF)
          </Button>
        </div>
        <div className="mt-3">
          <BriefStatus brief={brief} generation={generation} />
        </div>
        <p className="summary-body">{brief.summary}</p>
        {generation.isGenerating && (
          <div className="summary-loading" aria-hidden="true">
            <Skeleton />
            <Skeleton />
          </div>
        )}
        {!!brief.evidence_citations?.length && (
          <div className="citations-row">
            <span className="citations-label">Supporting sources</span>
            {brief.evidence_citations.map((citation, index) => (
              <Button
                className="citation-button"
                key={`${citation}:${index}`}
                onClick={() => setCitation(citation)}
                aria-label={`Inspect citation ${citation}`}
              >
                {citation}
              </Button>
            ))}
          </div>
        )}
        <div className="updated-label">
          <p>
            {`Current source records as of ${formatDate(brief.as_of_date)}. ${brief.generation.mode === 'offline' || brief.generation.mode === 'rules' ? 'Source-based synthesis' : 'Verified AI synthesis'}${brief.latest_brief ? ` / Version ${brief.latest_brief.version ?? '-'}` : ''}.`}
          </p>
          {brief.telemetry && (
            <div className="brief-telemetry-row mt-2">
              <span>{brief.telemetry.model}</span>
              <span>{brief.telemetry.total_tokens.toLocaleString()} tokens</span>
              <span>{(brief.telemetry.latency_ms / 1000).toFixed(1)}s</span>
              <span>
                {brief.telemetry.cost_known === false
                  ? 'Cost unavailable'
                  : `Est. $${brief.telemetry.cost_usd.toFixed(4)}`}
              </span>
            </div>
          )}
        </div>
      </Card>
      <div className="meeting-prep-grid">
        <Card className="agenda-panel" aria-labelledby="agenda-title">
          <div className="panel-header-row">
            <h2 className="card-subhead" id="agenda-title">
              <Calendar size={20} />
              Stewardship meeting agenda
            </h2>
            <Badge>{brief.agenda?.length ?? 0} topics</Badge>
          </div>
          {brief.agenda?.length ? (
            <ol className="agenda-numbered-list">
              {brief.agenda.map((item, index) => (
                <li key={index}>{item.replace(/^\d+\.\s*/, '')}</li>
              ))}
            </ol>
          ) : (
            <EmptyState title="No agenda recorded" />
          )}
        </Card>
        <Card className="talking-points-panel" aria-labelledby="talking-title">
          <div className="panel-header-row">
            <h2 className="card-subhead" id="talking-title">
              <MessageSquare size={20} />
              {userRole === 'Producer' ? 'Producer' : 'Leadership'} talking points
            </h2>
          </div>
          {brief.talking_points?.length ? (
            <ul className="talking-points-list">
              {brief.talking_points.map((point, index) => {
                const hypothesis = /hypothesis/i.test(point)
                const fact = /^(confirmed fact:|fact:|confirmed discrepancy:)/i.test(point)
                return (
                  <li className="talking-point-item" key={index}>
                    <Badge tone={hypothesis ? 'warning' : fact ? 'info' : 'neutral'}>
                      {hypothesis ? 'Hypothesis' : fact ? 'Source fact' : 'Brief note'}
                    </Badge>
                    <span>
                      {point.replace(
                        /^(Confirmed fact:\s*|Fact:\s*|Hypothesis:\s*|Hypothesis \(unverified\):\s*)/i,
                        ''
                      )}
                    </span>
                  </li>
                )
              })}
            </ul>
          ) : (
            <EmptyState title="No talking points recorded" />
          )}
        </Card>
      </div>
      {!!brief.suggested_actions?.length && (
        <Card aria-labelledby="suggested-title">
          <div className="panel-header-row">
            <h2 className="card-subhead" id="suggested-title">
              <CheckSquare size={20} />
              Suggested next actions
            </h2>
            <Badge>Review before acting</Badge>
          </div>
          <div className="actions-grid">
            {brief.suggested_actions.map((action, index) => (
              <article className="action-card" key={index}>
                <Badge tone="info">
                  {action.action_type === 'draft_followup'
                    ? 'Follow-up'
                    : action.action_type === 'review_task'
                      ? 'Review'
                      : 'Referral'}
                </Badge>
                <h3>{action.title}</h3>
                <p>{action.description}</p>
                <Button
                  className="action-prepare"
                  size="sm"
                  onClick={() => setSelectedAction(action)}
                >
                  {action.action_type === 'draft_followup' ? 'Prepare draft' : 'Review action'}
                </Button>
              </article>
            ))}
          </div>
        </Card>
      )}
      <div className="cockpit-2x2-grid">
        <Card className="cockpit-grid-card" aria-labelledby="drivers-title">
          <div className="panel-header-row">
            <h2 className="card-subhead" id="drivers-title">
              Prioritized risk drivers
            </h2>
            <Badge>{brief.prioritized_risks?.length ?? 0}</Badge>
          </div>
          {brief.prioritized_risks?.length ? (
            <ul className="ai-prioritized-list">
              {brief.prioritized_risks.map((risk, index) => (
                <li key={index}>{risk}</li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No prioritized risk flags" />
          )}
        </Card>
        <Card className="cockpit-grid-card" aria-labelledby="hypotheses-title">
          <div className="panel-header-row">
            <h2 className="card-subhead" id="hypotheses-title">
              Opportunity hypotheses
            </h2>
            <Badge tone="warning">Unverified</Badge>
          </div>
          {brief.opportunity_hypotheses?.length ? (
            <ul className="ai-prioritized-list">
              {brief.opportunity_hypotheses.map((hypothesis, index) => (
                <li key={index}>{hypothesis}</li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No opportunity hypotheses" />
          )}
          <p className="card-footer-muted">
            Validate assumptions with the client before recommending coverage.
          </p>
        </Card>
      </div>
      {citation && (
        <CitationSheet
          key={`${brief.account.account_id}:${citation}`}
          brief={brief}
          reference={citation}
          onClose={() => setCitation(null)}
        />
      )}
      {selectedAction && (
        <BriefActionDraft
          key={`${selectedAction.title}:${selectedAction.description}`}
          action={selectedAction}
          brief={brief}
          onClose={() => setSelectedAction(null)}
        />
      )}
    </div>
  )
}
