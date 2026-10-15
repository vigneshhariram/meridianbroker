import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Database,
  LoaderCircle,
  RefreshCw,
  Sparkles,
} from 'lucide-react'
import type { AccountBrief } from './types'
import type { GenerationController } from './useBriefGeneration'
import { formatDate } from './format'
import { Badge, Button, ErrorState } from './components/ui'
import './AiExperience.css'

const stages = ['Collect sources', 'Synthesize', 'Validate', 'Ready']

export function BriefStatus({
  brief,
  generation,
}: {
  brief: AccountBrief
  generation: GenerationController
}) {
  const info = brief.generation
  const { isGenerating, job, error, connectionError, regenerate, retryStatus } = generation
  const complete = brief.claim_review.complete && !brief.claim_review.omitted
  const offline = info?.mode === 'offline'
  const ai = info?.mode === 'live_ai' || info?.mode === 'stored_ai'
  const stage =
    job?.phase === 'generating'
      ? 1
      : job?.phase === 'validating'
        ? 2
        : job?.phase === 'completed'
          ? 3
          : 0
  const sourceLabel = offline
    ? 'Source-based fallback'
    : info?.mode === 'stored_ai'
      ? 'Saved AI brief'
      : info?.mode === 'live_ai'
        ? 'AI brief'
        : 'Source-based brief'
  return (
    <div
      className={`brief-generation ${isGenerating ? 'is-generating' : ''}`}
      aria-busy={isGenerating}
    >
      <div className="generation-topline">
        <div className="generation-meta">
          <Badge tone={offline ? 'warning' : ai ? 'info' : 'neutral'}>
            {ai ? <Sparkles size={14} /> : <Database size={14} />}
            {sourceLabel}
          </Badge>
          <Badge
            tone={complete ? 'success' : 'warning'}
            className={`completeness-badge ${complete ? '' : 'alert'}`}
          >
            {complete ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
            {complete
              ? `${brief.claim_review.reviewed} of ${brief.claim_review.total} accessible open claims reviewed`
              : !brief.permissions.claims
                ? 'Claims access restricted'
                : `${brief.claim_review.total} open claim${brief.claim_review.total !== 1 ? 's' : ''} · validation pending`}
          </Badge>
        </div>
        <Button
          variant="default"
          onClick={regenerate}
          disabled={isGenerating || info?.can_generate === false}
        >
          {isGenerating ? (
            <LoaderCircle className="generation-spinner" />
          ) : error ? (
            <RefreshCw />
          ) : (
            <Sparkles />
          )}
          {isGenerating
            ? 'Generating brief…'
            : error
              ? 'Retry AI Brief'
              : ai || offline
                ? 'Regenerate AI Brief'
                : 'Generate AI Brief'}
        </Button>
      </div>
      {isGenerating && (
        <div className="generation-progress">
          <div className="generation-status" role="status" aria-live="polite">
            <LoaderCircle size={14} className="generation-spinner" aria-hidden="true" />
            <span>{job?.message || 'Preparing your verified brief…'}</span>
            <small>Keep working while this updates</small>
          </div>
          <ol className="generation-steps" aria-label="Brief generation stages">
            {stages.map((label, index) => (
              <li
                key={label}
                aria-current={index === stage ? 'step' : undefined}
                data-state={index < stage ? 'done' : index === stage ? 'current' : 'pending'}
              >
                <span aria-hidden="true">{index < stage ? <Check size={12} /> : index + 1}</span>
                {label}
              </li>
            ))}
          </ol>
        </div>
      )}
      {!isGenerating && info?.stale && !error && (
        <p className="generation-note">
          {info.reason || 'A fresh brief is being prepared from your current source records.'}
        </p>
      )}
      {!isGenerating && offline && (
        <p className="generation-note fallback-note">
          <Database size={14} aria-hidden="true" />
          {info.reason || 'AI synthesis is unavailable. Your source-based brief is ready.'}
        </p>
      )}
      {!isGenerating && info?.generated_at && (
        <p className="generation-date">
          Updated {formatDate(info.generated_at)}
          {brief.latest_brief?.version ? ` · Version ${brief.latest_brief.version}` : ''}
        </p>
      )}
      {connectionError && (
        <div className="generation-connection" role="status">
          <span>{connectionError}</span>
          <Button size="sm" onClick={retryStatus}>
            Reconnect
          </Button>
        </div>
      )}
      {error && <ErrorState message={error} />}
    </div>
  )
}
