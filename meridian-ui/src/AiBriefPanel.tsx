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
import type { AccountBrief, Signal } from './types'
import { formatDate } from './format'

export function SignalRow({ signal }: { signal: Signal }) {
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

export function AiBriefPanel({
  brief,
  userRole = 'Producer',
  onRegenerate,
  regenerating,
  regenerateError,
  onExportPdf,
}: {
  brief: AccountBrief
  userRole?: string
  onRegenerate: () => void
  regenerating: boolean
  regenerateError?: string | null
  onExportPdf: () => void
}) {
  return (
    <div className="ai-brief-panel">
      {/* 1. Synthesis & Telemetry Header */}
      <section className="panel executive-summary-card">
        <div className="summary-title-row">
          <h2 className="panel-label">Executive summary & agent synthesis</h2>
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
            <button
              className="button button-outline export-brief-inline-btn"
              onClick={onExportPdf}
              title="Export 1-page publication-ready executive briefing PDF"
            >
              <FileText size={12} />
              Export Brief (PDF)
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
                  : 'Open claim records require synthesis.'}{' '}
                Click <strong>"Regenerate AI Brief"</strong> to synthesize full grounded context
                with the Client Intelligence Agent.
              </p>
            </div>
          </div>
        )}

        <p className="summary-body">{brief.summary}</p>

        {brief.evidence_citations && brief.evidence_citations.length > 0 && (
          <div className="citations-row">
            <span className="citations-label">Grounded Citations:</span>
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
              ⚡ {brief.telemetry.model} · {brief.telemetry.total_tokens.toLocaleString()} tokens ·{' '}
              {(brief.telemetry.latency_ms / 1000).toFixed(1)}s · ${brief.telemetry.cost_usd.toFixed(4)}
            </span>
            <span className="telemetry-version">Version {brief.latest_brief?.version ?? 1}</span>
          </div>
        )}
        <p className="updated-label">
          Current source records · scenario date {formatDate(brief.as_of_date)}
        </p>
      </section>

      {/* 2. Stewardship Meeting Preparation Grid */}
      {((brief.agenda && brief.agenda.length > 0) ||
        (brief.talking_points && brief.talking_points.length > 0)) && (
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
                  {userRole === 'Producer' ? 'Producer Talking Points' : 'Leadership Talking Points'}
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
                        {tp.replace(
                          /^(Confirmed fact:\s*|Hypothesis:\s*|Hypothesis \(unverified\):\s*)/i,
                          ''
                        )}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </section>
          )}
        </div>
      )}

      {/* 3. Suggested Next Actions */}
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

      {/* 4. AI Prioritized Intelligence & Hypotheses */}
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
              <span className="ai-box-label">
                <Sparkles size={11} /> AI Prioritized Risk Drivers
              </span>
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
              <span className="card-badge">
                {brief.opportunity_hypotheses.length} AI evaluated
              </span>
            )}
          </div>
          {brief.opportunity_hypotheses && brief.opportunity_hypotheses.length > 0 && (
            <div className="ai-assessment-box opportunity-hyp-box">
              <span className="ai-box-label">
                <Sparkles size={11} /> AI Opportunity Hypotheses Governance
              </span>
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
              <p className="muted">Insufficient accessible evidence for an opportunity.</p>
            )}
          </div>
          <p className="card-footer-muted">
            Validate assumptions with the client before recommending coverage.
          </p>
        </section>
      </div>
    </div>
  )
}
