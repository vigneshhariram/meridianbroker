export function formatMoney(value: number | string | null | undefined): string {
  if (value == null) return 'Unavailable'
  const amount = Number(value)
  if (!Number.isFinite(amount)) return 'Premium not available'
  if (amount >= 1_000_000) {
    return `$${(amount / 1_000_000).toFixed(2).replace(/0$/, '')}M`
  }
  if (amount >= 1_000) {
    return `$${Math.round(amount / 1_000)}K`
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount)
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return 'Date not set'
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return value
  const dateObj = new Date(year, month - 1, day)
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(dateObj)
}
