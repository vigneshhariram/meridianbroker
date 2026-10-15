import { useMemo, useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { ArrowUpRight } from 'lucide-react'
import type { AccountDetail, DetailTab } from './types'
import { formatCurrency, formatDate } from './format'
import { DataTable } from './components/DataTable'
import { RecordSheet, type InspectionRecord } from './components/RecordSheet'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  Select,
  StatusBadge,
} from './components/ui'

type RecordRow = {
  id: string
  title: string
  category: string
  status: string
  amount: number | null
  date: string | null
  source: string
  inspection: InspectionRecord
}

function normalize(item: AccountDetail): RecordRow {
  if ('case_id' in item)
    return {
      id: item.case_id,
      title: item.issue ?? 'Service case',
      category: item.category ?? 'Not recorded',
      status: item.status ?? '',
      amount: null,
      date: item.opened_at,
      source: item.source_system ?? 'Not recorded',
      inspection: {
        id: item.case_id,
        title: item.case_number ?? item.case_id,
        description: 'Service case details from the authorized source record.',
        content: item.issue,
        fields: [
          { label: 'Case ID', value: item.case_id },
          { label: 'Status', value: <StatusBadge status={item.status} /> },
          { label: 'Category', value: item.category },
          { label: 'Policy ID', value: item.policy_id },
          { label: 'Opened', value: formatDate(item.opened_at) },
          { label: 'Resolved', value: formatDate(item.resolved_at) },
          { label: 'Source system', value: item.source_system },
          { label: 'Last updated', value: formatDate(item.updated_at) },
        ],
      },
    }
  if ('claim_id' in item)
    return {
      id: item.claim_id,
      title: item.claim_number ?? item.claim_id,
      category: item.severity ?? 'Not recorded',
      status: item.status,
      amount: item.reserve_amount == null ? null : Number(item.reserve_amount),
      date: item.loss_date,
      source: item.source_system ?? 'Not recorded',
      inspection: {
        id: item.claim_id,
        title: item.claim_number ?? item.claim_id,
        description: 'Claim status, reserve and provenance from the authorized source record.',
        content: item.summary,
        fields: [
          { label: 'Claim ID', value: item.claim_id },
          { label: 'Policy ID', value: item.policy_id },
          { label: 'Status', value: <StatusBadge status={item.status} /> },
          { label: 'Severity', value: <StatusBadge status={item.severity} /> },
          { label: 'Reserve amount', value: formatCurrency(item.reserve_amount) },
          { label: 'Loss date', value: formatDate(item.loss_date) },
          { label: 'Source system', value: item.source_system },
          { label: 'Last updated', value: formatDate(item.updated_at) },
        ],
      },
    }
  if ('invoice_id' in item)
    return {
      id: item.invoice_id,
      title: item.invoice_id,
      category: item.policy_id,
      status: item.status ?? '',
      amount: item.amount == null ? null : Number(item.amount),
      date: item.due_date,
      source: item.source_system ?? 'Not recorded',
      inspection: {
        id: item.invoice_id,
        title: `Invoice ${item.invoice_id}`,
        description: 'Billing details as reported by the source system.',
        fields: [
          { label: 'Invoice ID', value: item.invoice_id },
          { label: 'Policy ID', value: item.policy_id },
          { label: 'Amount', value: formatCurrency(item.amount) },
          { label: 'Status', value: <StatusBadge status={item.status} /> },
          { label: 'Due date', value: formatDate(item.due_date) },
          { label: 'Source system', value: item.source_system },
        ],
      },
    }
  if ('doc_id' in item)
    return {
      id: item.doc_id,
      title: item.title ?? item.doc_id,
      category: item.type?.replaceAll('_', ' ') ?? 'Document',
      status: '',
      amount: null,
      date: item.uploaded_at,
      source: item.source_system ?? 'Not recorded',
      inspection: {
        id: item.doc_id,
        title: item.title ?? item.doc_id,
        description: 'Full permitted document content and source metadata.',
        content: item.content_text,
        fields: [
          { label: 'Document ID', value: item.doc_id },
          { label: 'Type', value: item.type?.replaceAll('_', ' ') },
          { label: 'Uploaded', value: formatDate(item.uploaded_at) },
          { label: 'Source system', value: item.source_system },
        ],
      },
    }
  return {
    id: item.policy_id,
    title: item.policy_number ?? item.policy_id,
    category: item.line_of_business ?? 'Not recorded',
    status: item.status ?? '',
    amount: item.premium == null ? null : Number(item.premium),
    date: item.renewal_date,
    source: item.source_system ?? 'Not recorded',
    inspection: {
      id: item.policy_id,
      title: item.policy_number ?? item.policy_id,
      description: 'Policy details, source renewal date and CRM copy for reconciliation.',
      fields: [
        { label: 'Policy ID', value: item.policy_id },
        { label: 'Carrier', value: item.carrier },
        { label: 'Line of business', value: item.line_of_business },
        { label: 'Premium', value: formatCurrency(item.premium) },
        { label: 'Status', value: <StatusBadge status={item.status} /> },
        { label: 'Effective date', value: formatDate(item.effective_date) },
        { label: 'Source renewal date', value: formatDate(item.renewal_date) },
        { label: 'CRM renewal date', value: formatDate(item.crm_renewal_date) },
        { label: 'Source system', value: item.source_system },
        { label: 'Last updated', value: formatDate(item.updated_at) },
        { label: 'CRM last updated', value: formatDate(item.crm_updated_at) },
        {
          label: 'Date reconciliation',
          value:
            item.crm_renewal_date && item.crm_renewal_date !== item.renewal_date ? (
              <Badge tone="warning">Conflicting dates · review required</Badge>
            ) : (
              'No active date conflict'
            ),
        },
      ],
    },
  }
}

export function AccountDetailsPanel({
  accountName,
  tab,
  items,
  loading,
  error,
  onRetry,
}: {
  accountName: string
  tab: Exclude<DetailTab, 'overview' | 'ai-brief'>
  items: AccountDetail[] | null
  loading: boolean
  error: string
  onRetry?: () => void
}) {
  const [inspection, setInspection] = useState<InspectionRecord | null>(null)
  const [status, setStatus] = useState('')
  const title = {
    policies: 'Policies',
    claims: 'Claims',
    billing: 'Invoices & billing',
    'service-cases': 'Service cases',
    documents: 'Documents',
  }[tab]
  const rows = (items ?? []).map(normalize)
  const visible = rows.filter((row) => !status || row.status === status)
  const statuses = [...new Set(rows.map((row) => row.status).filter(Boolean))]
  const hasAmount = ['policies', 'claims', 'billing'].includes(tab)
  const columns = useMemo<ColumnDef<RecordRow>[]>(
    () => [
      {
        accessorKey: 'title',
        header: tab === 'documents' ? 'Document' : 'Record',
        enableHiding: false,
        cell: ({ row }) => (
          <Button
            variant="ghost"
            className="detail-inspect"
            aria-label={`Inspect ${row.original.title}`}
            onClick={() => setInspection(row.original.inspection)}
          >
            {row.original.title}
            <ArrowUpRight />
          </Button>
        ),
      },
      {
        accessorKey: 'category',
        header: {
          policies: 'Coverage',
          claims: 'Severity',
          billing: 'Policy ID',
          'service-cases': 'Category',
          documents: 'Type',
        }[tab],
        cell: ({ row }) =>
          tab === 'claims' ? <StatusBadge status={row.original.category} /> : row.original.category,
      },
      ...(tab !== 'documents'
        ? [
            {
              accessorKey: 'status',
              header: 'Status',
              cell: ({ row }: { row: { original: RecordRow } }) => (
                <StatusBadge status={row.original.status} />
              ),
            } as ColumnDef<RecordRow>,
          ]
        : []),
      ...(hasAmount
        ? [
            {
              accessorKey: 'amount',
              header: tab === 'claims' ? 'Reserve' : tab === 'policies' ? 'Premium' : 'Amount',
              meta: { numeric: true },
              cell: ({ row }: { row: { original: RecordRow } }) =>
                formatCurrency(row.original.amount),
            } as ColumnDef<RecordRow>,
          ]
        : []),
      {
        accessorKey: 'date',
        header: {
          policies: 'Renewal',
          claims: 'Loss date',
          billing: 'Due date',
          'service-cases': 'Opened',
          documents: 'Uploaded',
        }[tab],
        cell: ({ row }) => formatDate(row.original.date),
      },
      { accessorKey: 'source', header: 'Source system' },
    ],
    [tab, hasAmount]
  )
  return (
    <Card className="details-panel" aria-labelledby="details-title">
      <div className="details-heading">
        <div>
          <p className="eyebrow">{accountName}</p>
          <h2 id="details-title">{title}</h2>
        </div>
        <Badge>{rows.length} records</Badge>
      </div>
      {loading ? (
        <LoadingState label={`Loading ${title.toLowerCase()}…`} />
      ) : error ? (
        <div className="details-error">
          <ErrorState message={error} onRetry={onRetry} />
        </div>
      ) : !rows.length ? (
        <EmptyState
          title={`No ${title.toLowerCase()} recorded`}
          description="No accessible source records were returned for this account."
        />
      ) : (
        <>
          <div className="panel-header-row">
            <p className="muted text-xs">
              Inspect a record to see its full content and provenance.
            </p>
            {statuses.length > 0 && (
              <Select
                label={`${title} status filter`}
                value={status}
                onValueChange={setStatus}
                options={[
                  { value: '', label: 'All statuses' },
                  ...statuses.map((value) => ({ value, label: value.replaceAll('_', ' ') })),
                ]}
              />
            )}
          </div>
          <DataTable
            key={`${tab}:${status}`}
            label={title}
            data={visible}
            columns={columns}
            getRowId={(row) => row.id}
            onSelect={(row) => setInspection(row.inspection)}
          />
        </>
      )}
      <RecordSheet record={inspection} onClose={() => setInspection(null)} />
    </Card>
  )
}
