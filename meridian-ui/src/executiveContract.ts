import { z } from 'zod'

const color = z.enum(['blue', 'purple', 'green', 'amber', 'coral', 'gray'])
const amount = z.number().finite().nonnegative()
const count = z.number().int().nonnegative()
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
export const executiveSchema = z
  .object({
    subtitle: z.string(),
    metadata: z
      .object({
        source: z.literal('sqlite'),
        as_of: date,
        scope: z.string(),
        authorized_client_count: count,
        producer_count: count,
        period_start: date,
        period_end: date,
        metric_definitions: z.record(z.string(), z.string()),
        notes: z.array(z.string()),
      })
      .strict(),
    kpis: z.array(
      z
        .object({
          label: z.string(),
          value: z.string(),
          raw_value: z.number().finite().nullable(),
          change: z.string(),
          color,
        })
        .strict()
    ),
    premium_by_line: z.array(z.object({ label: z.string(), premium: amount, color }).strict()),
    carrier_mix: z
      .object({
        total: count,
        carriers: z.array(
          z
            .object({
              name: z.string(),
              premium: amount,
              percentage: z.number().finite().min(0).max(100),
              color,
            })
            .strict()
        ),
      })
      .strict(),
    commission_trend: z
      .object({
        months: z.array(z.object({ month: z.string(), label: z.string(), value: amount }).strict()),
        latest_label: z.string(),
        latest: amount.nullable(),
        average: amount.nullable(),
        period_label: z.string(),
      })
      .strict(),
    top_producers: z.array(
      z
        .object({
          producer_id: z.string(),
          name: z.string(),
          client_count: count,
          premium: amount,
          retention: z.number().finite().min(0).max(100).nullable(),
          commission: amount.nullable(),
        })
        .strict()
    ),
  })
  .strict()

export type ExecutiveData = z.infer<typeof executiveSchema>

export function parseExecutive(value: unknown): ExecutiveData {
  const result = executiveSchema.safeParse(value)
  if (!result.success)
    throw new Error('Dashboard data failed validation. Refresh or check the API configuration.')
  return result.data
}
