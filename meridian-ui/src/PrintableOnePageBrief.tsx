import type { AccountBrief, Evidence } from './types'
import { formatDate, formatMoney } from './format'

export function PrintableOnePageBrief({
  brief,
  evidence,
  userRole = 'Producer',
}: {
  brief: AccountBrief
  evidence: Evidence[]
  userRole?: string
}) {
  const isComplete = !brief.claim_review?.omitted && !!brief.claim_review?.complete
  const telemetry = brief.telemetry

  return (
    <div className="printable-brief-container" id="printable-ai-brief" aria-hidden="true">
      <article className="printable-brief-sheet">
        {/* Header Strip */}
        <header className="print-header">
          <div className="print-header-top">
            <span className="print-brand">
              <strong>MERIDIAN BROKERAGE GROUP</strong> | Client Intelligence Brief
            </span>
            <span className="print-meta-right">
              Scenario Date: {formatDate(brief.as_of_date)} · GenAILab v{brief.latest_brief?.version ?? 1}
            </span>
          </div>

          <div className="print-header-main">
            <div>
              <h1 className="print-client-name">{brief.account.name}</h1>
              <p className="print-client-sub">
                {brief.account.industry || 'Commercial Lines'} ·{' '}
                {[brief.account.city, brief.account.state].filter(Boolean).join(', ')} · Client since{' '}
                {brief.account.client_since || 'N/A'}
              </p>
            </div>
            <div className="print-kpi-chips">
              <span className="print-kpi-chip">
                <strong>Premium:</strong> {formatMoney(brief.account.annual_premium)}
              </span>
              <span className="print-kpi-chip">
                <strong>Renewal:</strong>{' '}
                {brief.days_to_renewal != null ? `${brief.days_to_renewal} days` : 'Not set'}
              </span>
              <span className={`print-kpi-chip risk-${brief.account.risk_level ?? 'low'}`}>
                <strong>Risk:</strong> {(brief.account.risk_level ?? 'low').toUpperCase()}
              </span>
              <span className="print-kpi-chip">
                <strong>Contact:</strong>{' '}
                {brief.primary_contact
                  ? `${brief.primary_contact.name} (${brief.primary_contact.role || 'Primary'})`
                  : 'None'}
              </span>
            </div>
          </div>
        </header>

        {/* Completeness & Model Telemetry Strip */}
        <div className={`print-completeness-strip ${isComplete ? 'complete' : 'alert'}`}>
          <div className="print-completeness-text">
            {isComplete ? (
              <span>
                ✓ <strong>Completeness Verified:</strong> {brief.claim_review.reviewed} of{' '}
                {brief.claim_review.total} accessible open claims reviewed · No material omissions
              </span>
            ) : (
              <span>
                ⚠ <strong>Completeness Notice:</strong>{' '}
                {brief.claim_review.omitted
                  ? `Material record ${brief.claim_review.omitted} omitted`
                  : 'Incomplete open claim synthesis'}{' '}
                · Human review required
              </span>
            )}
          </div>
          {telemetry && (
            <div className="print-telemetry-text">
              Model: {telemetry.model} · {telemetry.total_tokens} tokens ·{' '}
              {(telemetry.latency_ms / 1000).toFixed(1)}s · ${telemetry.cost_usd.toFixed(4)}
            </div>
          )}
        </div>

        {/* Executive Summary Block */}
        <section className="print-section print-summary-section">
          <h2 className="print-section-title">Executive Summary Narrative</h2>
          <p className="print-summary-body">{brief.summary}</p>
          {brief.evidence_citations && brief.evidence_citations.length > 0 && (
            <div className="print-citations-line">
              <span className="print-cite-label">Grounded Citations:</span>
              <span className="print-cite-items">{brief.evidence_citations.join(' · ')}</span>
            </div>
          )}
        </section>

        {/* 2-Column Meeting Prep & Grounded Intelligence Grid */}
        <div className="print-two-col">
          {/* Left Column: Meeting Prep & Actions */}
          <div className="print-col">
            {/* Agenda */}
            {brief.agenda && brief.agenda.length > 0 && (
              <section className="print-section">
                <h2 className="print-section-title">Stewardship Meeting Agenda</h2>
                <ol className="print-agenda-list">
                  {brief.agenda.slice(0, 4).map((item, idx) => (
                    <li key={idx}>{item.replace(/^\d+\.\s*/, '')}</li>
                  ))}
                </ol>
              </section>
            )}

            {/* Talking Points */}
            {brief.talking_points && brief.talking_points.length > 0 && (
              <section className="print-section">
                <h2 className="print-section-title">
                  {userRole === 'Producer' ? 'Producer Talking Points' : 'Leadership Talking Points'}
                </h2>
                <ul className="print-talking-points">
                  {brief.talking_points.slice(0, 4).map((tp, idx) => {
                    const isHypothesis = tp.toLowerCase().includes('hypothesis')
                    return (
                      <li key={idx} className={isHypothesis ? 'point-hyp' : 'point-fact'}>
                        <span className={`print-tag ${isHypothesis ? 'tag-hyp' : 'tag-fact'}`}>
                          {isHypothesis ? 'HYPOTHESIS' : 'FACT'}
                        </span>{' '}
                        <span>
                          {tp.replace(
                            /^(Confirmed fact:\s*|Fact:\s*|Portfolio status:\s*|Hypothesis:\s*|Hypothesis \(unverified\):\s*)/i,
                            ''
                          )}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              </section>
            )}

            {/* Suggested Actions */}
            {brief.suggested_actions && brief.suggested_actions.length > 0 && (
              <section className="print-section">
                <h2 className="print-section-title">Suggested Next Actions</h2>
                <div className="print-actions-list">
                  {brief.suggested_actions.slice(0, 3).map((action, idx) => (
                    <div key={idx} className="print-action-item">
                      <span className={`print-tag tag-action ${action.action_type}`}>
                        {action.action_type === 'draft_followup'
                          ? 'FOLLOW-UP'
                          : action.action_type === 'review_task'
                            ? 'REVIEW'
                            : 'REFERRAL'}
                      </span>
                      <strong>{action.title}:</strong> {action.description}
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>

          {/* Right Column: Intelligence, Signals & Evidence */}
          <div className="print-col">
            {/* Risk Drivers */}
            <section className="print-section">
              <h2 className="print-section-title">Prioritized Risk Drivers</h2>
              {brief.prioritized_risks && brief.prioritized_risks.length > 0 ? (
                <ul className="print-bullet-list">
                  {brief.prioritized_risks.slice(0, 3).map((risk, idx) => (
                    <li key={idx}>
                      <strong>{risk}</strong>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="print-muted">No material operational risks identified.</p>
              )}
            </section>

            {/* Opportunity Hypotheses */}
            <section className="print-section">
              <h2 className="print-section-title">Opportunity Hypotheses (Governed)</h2>
              {brief.opportunity_hypotheses && brief.opportunity_hypotheses.length > 0 ? (
                <ul className="print-bullet-list">
                  {brief.opportunity_hypotheses.slice(0, 2).map((hyp, idx) => (
                    <li key={idx} className="print-hyp-item">
                      <span className="print-tag tag-hyp">HYPOTHESIS</span> {hyp}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="print-muted">Insufficient evidence for growth hypotheses.</p>
              )}
              <p className="print-disclaimer-note">
                * Unverified hypotheses require producer client discovery before coverage proposal.
              </p>
            </section>

            {/* Data Discrepancies (if any) */}
            {brief.contradictions && brief.contradictions.length > 0 && (
              <section className="print-section print-conflicts-section">
                <h2 className="print-section-title">Cross-System Discrepancies</h2>
                {brief.contradictions.slice(0, 2).map((conflict) => (
                  <div key={conflict.contradiction_id} className="print-conflict-row">
                    <strong>{(conflict.field ?? 'Record').replaceAll('_', ' ')}:</strong>{' '}
                    {conflict.source_a} ({conflict.value_a}) vs {conflict.source_b} (
                    {conflict.value_b})
                  </div>
                ))}
              </section>
            )}

            {/* Grounded Evidence Records */}
            <section className="print-section">
              <h2 className="print-section-title">Grounded Evidence Audit ({evidence.length} records)</h2>
              {evidence.length > 0 ? (
                <div className="print-evidence-grid">
                  {evidence.slice(0, 4).map((item) => (
                    <div key={item.evidence_id} className="print-evidence-pill">
                      <span className="print-ev-sys">{item.source_system}</span>
                      <span className="print-ev-id">{item.source_id}</span>
                      <span className="print-ev-conf">
                        {Math.round(Number(item.confidence) * 100)}%
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="print-muted">No supported evidence records.</p>
              )}
            </section>
          </div>
        </div>

        {/* Responsible AI Compliance Footer */}
        <footer className="print-footer">
          <p>
            <strong>CONFIDENTIAL · FOR PRODUCER PREPARATION ONLY.</strong> Factual enterprise data
            combined with TCS GenAILab synthesis. Human review required prior to coverage binding or
            client transmission.
          </p>
        </footer>
      </article>
    </div>
  )
}
