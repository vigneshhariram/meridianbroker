import type {
  AccountDetail,
  DetailTab,
  Policy,
  Claim,
  Billing,
  ServiceCase,
  DocumentItem,
} from './types'
import { formatMoney, formatDate } from './format'

function isPolicy(item: AccountDetail): item is Policy {
  return 'policy_id' in item && !('claim_id' in item) && !('invoice_id' in item)
}

function isClaim(item: AccountDetail): item is Claim {
  return 'claim_id' in item
}

function isBilling(item: AccountDetail): item is Billing {
  return 'invoice_id' in item
}

function isServiceCase(item: AccountDetail): item is ServiceCase {
  return 'case_id' in item
}

function isDocumentItem(item: AccountDetail): item is DocumentItem {
  return 'doc_id' in item
}

export function AccountDetailsPanel({
  accountName,
  tab,
  items,
  loading,
  error,
}: {
  accountName: string
  tab: Exclude<DetailTab, 'overview'>
  items: AccountDetail[] | null
  loading: boolean
  error: string
}) {
  const title =
    tab === 'policies'
      ? 'Policies'
      : tab === 'claims'
        ? 'Claims'
        : tab === 'billing'
          ? 'Invoices & Billing'
          : tab === 'service-cases'
            ? 'Service cases'
            : 'Documents'
  const rows = items ?? []

  return (
    <section className="panel details-panel">
      <div className="details-heading">
        <div>
          <p className="eyebrow">{accountName}</p>
          <h2>{title}</h2>
        </div>
        <span className="count-pill">{rows.length}</span>
      </div>
      {loading ? (
        <div className="details-loading" aria-live="polite">
          <span className="loader" />
          <span>Loading {title.toLowerCase()}…</span>
        </div>
      ) : error ? (
        <div className="details-error" role="alert">
          {error}
        </div>
      ) : rows.length === 0 ? (
        <p className="details-empty">No {title.toLowerCase()} found for this account.</p>
      ) : (
        <div className="details-list">
          {tab === 'policies' &&
            rows.filter(isPolicy).map((policy) => (
              <article className="detail-record" key={policy.policy_id}>
                <div className="detail-record-heading">
                  <div>
                    <span className="record-kicker">
                      Policy {policy.policy_number || policy.policy_id}
                    </span>
                    <h3>{policy.line_of_business || 'Policy details'}</h3>
                  </div>
                  <span className={`record-status ${policy.status || 'unknown'}`}>
                    {policy.status || 'Status unavailable'}
                  </span>
                </div>
                <div className="detail-fields">
                  <DetailField label="Carrier" value={policy.carrier} />
                  <DetailField label="Premium" value={formatMoney(policy.premium)} />
                  <DetailField label="Effective" value={formatDate(policy.effective_date)} />
                  <DetailField label="Renewal" value={formatDate(policy.renewal_date)} />
                  <DetailField label="Source" value={policy.source_system} />
                </div>
              </article>
            ))}
          {tab === 'claims' &&
            rows.filter(isClaim).map((claim) => (
              <article className="detail-record" key={claim.claim_id}>
                <div className="detail-record-heading">
                  <div>
                    <span className="record-kicker">
                      Claim {claim.claim_number || claim.claim_id}
                    </span>
                    <h3>{claim.summary || 'Claim details'}</h3>
                  </div>
                  <span className={`record-status ${claim.status}`}>{claim.status}</span>
                </div>
                <div className="detail-fields">
                  <DetailField label="Severity" value={claim.severity} />
                  <DetailField label="Loss date" value={formatDate(claim.loss_date)} />
                  <DetailField label="Reserve" value={formatMoney(claim.reserve_amount)} />
                  <DetailField label="Source" value={claim.source_system} />
                </div>
              </article>
            ))}
          {tab === 'billing' &&
            rows.filter(isBilling).map((bill) => (
              <article className="detail-record" key={bill.invoice_id}>
                <div className="detail-record-heading">
                  <div>
                    <span className="record-kicker">Invoice {bill.invoice_id}</span>
                    <h3>{formatMoney(bill.amount)}</h3>
                  </div>
                  <span
                    className={`record-status ${bill.status === 'overdue' ? 'closed' : bill.status === 'paid' ? 'active' : 'unknown'}`}
                  >
                    {bill.status || 'Status unavailable'}
                  </span>
                </div>
                <div className="detail-fields">
                  <DetailField label="Due date" value={formatDate(bill.due_date)} />
                  <DetailField label="Policy ID" value={bill.policy_id} />
                  <DetailField label="Status" value={bill.status} />
                  <DetailField label="Source" value={bill.source_system} />
                </div>
              </article>
            ))}
          {tab === 'service-cases' &&
            rows.filter(isServiceCase).map((item) => (
              <article className="detail-record" key={item.case_id}>
                <div className="detail-record-heading">
                  <div>
                    <span className="record-kicker">Case {item.case_number || item.case_id}</span>
                    <h3>{item.issue || 'Service issue'}</h3>
                  </div>
                  <span className={`record-status ${item.status || 'unknown'}`}>
                    {item.status || 'Status unavailable'}
                  </span>
                </div>
                <div className="detail-fields">
                  <DetailField label="Category" value={item.category} />
                  <DetailField label="Opened" value={formatDate(item.opened_at)} />
                  <DetailField label="Resolved" value={formatDate(item.resolved_at)} />
                  <DetailField label="Source" value={item.source_system} />
                </div>
              </article>
            ))}
          {tab === 'documents' &&
            rows.filter(isDocumentItem).map((doc) => (
              <article className="detail-record" key={doc.doc_id}>
                <div className="detail-record-heading">
                  <div>
                    <span className="record-kicker">{doc.type || 'Document'}</span>
                    <h3>{doc.title || 'Untitled Document'}</h3>
                  </div>
                  <span className="record-status active">{doc.source_system || 'Internal'}</span>
                </div>
                <div className="detail-fields">
                  <DetailField label="Doc ID" value={doc.doc_id} />
                  <DetailField label="Uploaded" value={formatDate(doc.uploaded_at)} />
                  <DetailField
                    label="Preview"
                    value={
                      doc.content_text
                        ? doc.content_text.length > 70
                          ? doc.content_text.slice(0, 70) + '…'
                          : doc.content_text
                        : 'None'
                    }
                  />
                </div>
              </article>
            ))}
        </div>
      )}
    </section>
  )
}

function DetailField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="detail-field">
      <span>{label}</span>
      <strong>{value || 'Unavailable'}</strong>
    </div>
  )
}
