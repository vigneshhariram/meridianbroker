import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Building2, LogOut, Search, ShieldCheck } from 'lucide-react'
import { getJson, type UserProfile } from './api'
import type { Account } from './types'
import { formatMoney } from './format'
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  Sheet,
  Tooltip,
} from './components/ui'

export function Header({
  user,
  subtitle,
  onSignOut,
  signingOut,
  onBack,
  onOpenAccount,
}: {
  user: UserProfile
  subtitle: string
  onSignOut: () => void
  signingOut: boolean
  onBack?: () => void
  onOpenAccount?: (id: string) => void
}) {
  const [searchOpen, setSearchOpen] = useState(false)
  const [search, setSearch] = useState('')
  const accountsQuery = useQuery({
    queryKey: ['accounts', user.userId],
    queryFn: ({ signal }) => getJson<Account[]>('/accounts', signal),
    enabled: searchOpen,
  })
  const accounts = (accountsQuery.data ?? []).filter((account) =>
    [
      account.name,
      account.industry,
      account.city,
      account.state,
      account.account_id,
      account.primary_contact_name,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(search.toLowerCase())
  )
  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <Building2 size={24} />
          </span>
          <div>
            <span className="brand-name">Meridian Brokerage Group</span>
            <nav aria-label="Breadcrumb">
              <span className="brand-subtitle">Workspace / {subtitle}</span>
            </nav>
          </div>
        </div>
        <div className="header-controls">
          {onBack && (
            <Button variant="ghost" aria-label="Back to regional portfolio" onClick={onBack}>
              <ArrowLeft />
              Regional portfolio
            </Button>
          )}
          {onOpenAccount && (
            <Tooltip content="Search clients, industries, locations and contacts">
              <Button size="icon" aria-label="Find a client" onClick={() => setSearchOpen(true)}>
                <Search />
              </Button>
            </Tooltip>
          )}
          <Badge tone="info">
            <ShieldCheck size={16} />
            Authorized workspace
          </Badge>
          <div className="user-profile">
            <span className="user-avatar" aria-hidden="true">
              {user.name
                .split(' ')
                .map((part) => part[0])
                .join('')}
            </span>
            <div>
              <strong>{user.name}</strong>
              <small>{user.title}</small>
            </div>
          </div>
          <Button variant="ghost" onClick={onSignOut} disabled={signingOut}>
            <LogOut />
            {signingOut ? 'Signing out…' : 'Sign out'}
          </Button>
        </div>
      </header>
      <div className="scope-bar" role="region" aria-label="Workspace access status">
        <ShieldCheck size={16} aria-hidden="true" />
        <span>
          {user.role} workspace · {user.region} · Record access is logged
        </span>
        <span className="scope-end">Client Growth & Retention</span>
      </div>
      <Sheet
        open={searchOpen}
        onOpenChange={setSearchOpen}
        title="Find a client"
        description="Search clients available to your signed-in account."
      >
        <Input
          aria-label="Search authorized clients"
          placeholder="Client, industry, location or contact…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        {accountsQuery.isPending ? (
          <LoadingState />
        ) : accountsQuery.isError ? (
          <ErrorState
            message={accountsQuery.error.message}
            onRetry={() => accountsQuery.refetch()}
          />
        ) : (
          <div className="card-list-items mt-6">
            {accounts.map((account) => (
              <Button
                key={account.account_id}
                className="account-option"
                onClick={() => {
                  setSearchOpen(false)
                  onOpenAccount?.(account.account_id)
                }}
              >
                <span className="account-info-block">
                  <span>{account.name}</span>
                  <span className="account-option-premium">
                    {account.industry} · {formatMoney(account.annual_premium)}
                  </span>
                </span>
              </Button>
            ))}
            {!accounts.length && (
              <EmptyState
                title="No matching clients"
                description="Try another name, industry or location."
              />
            )}
          </div>
        )}
      </Sheet>
    </>
  )
}
