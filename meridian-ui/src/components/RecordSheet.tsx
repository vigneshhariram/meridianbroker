import type { ReactNode } from 'react'
import { Sheet } from './ui'

export type InspectionRecord = {
  id: string
  title: string
  description: string
  fields: { label: string; value: ReactNode }[]
  content?: string | null
}

export function RecordSheet({
  record,
  onClose,
}: {
  record: InspectionRecord | null
  onClose: () => void
}) {
  return (
    <Sheet
      open={!!record}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title={record?.title ?? 'Record details'}
      description={record?.description ?? 'Inspect the selected source record.'}
    >
      {record && (
        <>
          <dl className="record-fields">
            {record.fields.map((field) => (
              <div key={field.label}>
                <dt>{field.label}</dt>
                <dd>{field.value ?? 'Not recorded'}</dd>
              </div>
            ))}
          </dl>
          {record.content && (
            <section className="record-content">
              <h3>Full record content</h3>
              <p>{record.content}</p>
            </section>
          )}
        </>
      )}
    </Sheet>
  )
}
