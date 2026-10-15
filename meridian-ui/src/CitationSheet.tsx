import { useQuery } from '@tanstack/react-query'
import { getJson } from './api'
import type { AccountBrief, AccountDetail } from './types'
import { formatCurrency, formatDate } from './format'
import { EmptyState, ErrorState, LoadingState, Sheet } from './components/ui'

const identifiers = new Set(['claim_id', 'claim_number', 'policy_id', 'policy_number', 'case_id', 'case_number', 'invoice_id', 'doc_id'])
const contentFields = new Set(['summary', 'content_text', 'issue'])
const moneyFields = new Set(['reserve_amount', 'premium', 'amount'])

export function CitationSheet({ brief, reference, onClose }: { brief: AccountBrief; reference: string; onClose: () => void }) {
  const query = useQuery({
    queryKey: ['citation', brief.account.account_id, brief.generation.source_fingerprint, reference],
    queryFn: async ({ signal }) => {
      const evidence = [...brief.risks, ...brief.opportunities].flatMap((item) => item.evidence)
        .filter((item) => item.evidence_id === reference || item.signal_id === reference || item.source_id === reference)
      const sourceIds = new Set([reference, ...evidence.map((item) => item.source_id)])
      const resources = ['policies', 'claims', 'service-cases', 'billing', 'documents'].filter((resource) => brief.permissions[resource])
      const collections = await Promise.all(resources.map((resource) => getJson<AccountDetail[]>(`/accounts/${encodeURIComponent(brief.account.account_id)}/${resource}`, signal)))
      const record = collections.flat().find((item) => Object.entries(item).some(([key, value]) => identifiers.has(key) && value != null && sourceIds.has(String(value))))
      const linkedEvidence = evidence.length ? evidence : record ? [...brief.risks, ...brief.opportunities].flatMap((item) => item.evidence)
        .filter((item) => Object.entries(record).some(([key, value]) => identifiers.has(key) && value === item.source_id)) : []
      return { record, evidence: linkedEvidence }
    },
  })
  const record = query.data?.record
  const content = record ? Object.entries(record).filter(([key, value]) => contentFields.has(key) && value).map(([, value]) => String(value)).join('\n\n') : ''
  return <Sheet open onOpenChange={(open) => { if (!open) onClose() }} title={`Citation ${reference}`} description={`Authorized source records for ${brief.account.name}.`}>
    {query.isPending ? <LoadingState label="Resolving citation to its source record…" /> : query.isError ? <ErrorState message={query.error.message} onRetry={() => query.refetch()} /> : <>
      {record && <dl className="record-fields">{Object.entries(record).filter(([key]) => !contentFields.has(key)).map(([key, value]) => <div key={key}><dt>{key.replaceAll('_', ' ')}</dt><dd>{value == null ? 'Not recorded' : moneyFields.has(key) ? formatCurrency(value) : /(?:_date|_at)$/.test(key) ? formatDate(String(value)) : String(value)}</dd></div>)}</dl>}
      {content && <section className="record-content"><h3>Full record content</h3><p>{content}</p></section>}
      {!!query.data?.evidence.length && <section className="record-content"><h3>Supporting evidence</h3>{query.data.evidence.map((item) => <article className="evidence-entry" key={item.evidence_id}><strong>{item.source_system} · {item.source_id}</strong><p>{item.snippet}</p><small>{formatDate(item.recency_date)}</small></article>)}</section>}
      {!record && !query.data?.evidence.length && <EmptyState title="No matching accessible record" description="This reference could not be resolved within your current record permissions." />}
    </>}
  </Sheet>
}
