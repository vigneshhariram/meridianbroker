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
  const [year, month, day] = value.slice(0, 10).split('-').map(Number)
  if (!year || !month || !day) return value
  const dateObj = new Date(year, month - 1, day)
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(dateObj)
}

export function formatCurrency(value: number | string | null | undefined): string {
  if (value == null || !Number.isFinite(Number(value))) return 'Not recorded'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(Number(value))
}

export function formatRenewal(days: number | null | undefined): string {
  if (days == null) return 'Date not set'
  if (days < 0) return `${Math.abs(days)}d overdue`
  return days === 0 ? 'Due today' : `${days} days`
}
