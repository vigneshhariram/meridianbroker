export type Contact = {
  contact_id: string
  name: string
  role: string | null
  email: string | null
  is_primary: boolean
}

export type Account = {
  account_id: string
  name: string
  industry: string | null
  city: string | null
  state: string | null
  region: string | null
  segment: string | null
  owner_user_id: string
  annual_premium: number | string | null
  client_since: number | null
  risk_level: 'high' | 'medium' | 'low' | null
  days_to_renewal: number | null
  primary_contact_name: string | null
  primary_contact_role: string | null
}

export type Policy = {
  policy_id: string
  account_id: string
  policy_number: string | null
  carrier: string | null
  line_of_business: string | null
  premium: number | string | null
  effective_date: string | null
  renewal_date: string | null
  status: string | null
  source_system: string | null
}

export type Claim = {
  claim_id: string
  account_id: string
  policy_id: string
  claim_number: string | null
  status: 'open' | 'closed'
  loss_date: string | null
  reserve_amount: number | string | null
  severity: 'high' | 'medium' | 'low' | null
  summary: string | null
  source_system: string | null
  updated_at: string | null
}

export type ServiceCase = {
  case_id: string
  account_id: string
  policy_id: string | null
  case_number: string | null
  status: 'open' | 'closed' | null
  issue: string | null
  category: string | null
  opened_at: string | null
  resolved_at: string | null
  source_system: string | null
  updated_at: string | null
}

export type Billing = {
  invoice_id: string
  policy_id: string
  account_id: string
  amount: number | string | null
  due_date: string | null
  status: 'paid' | 'due' | 'overdue' | null
  source_system: string | null
}

export type DocumentItem = {
  doc_id: string
  account_id: string
  type: string | null
  title: string | null
  content_text: string | null
  uploaded_at: string | null
  source_system: string | null
}

export type DetailTab =
  'overview' | 'policies' | 'claims' | 'billing' | 'service-cases' | 'documents'
export type AccountDetail = Policy | Claim | Billing | ServiceCase | DocumentItem

export type Evidence = {
  evidence_id: string
  signal_id: string
  source_table: string | null
  source_id: string | null
  source_system: string | null
  snippet: string | null
  recency_date: string | null
  confidence: number | string | null
  source_score?: number | null
  recency_factor?: number | null
}

export type Signal = {
  signal_id: string
  account_id: string
  signal_type: 'risk' | 'opportunity' | 'coverage_gap'
  category: string | null
  title: string | null
  description: string | null
  severity: 'high' | 'medium' | 'low' | null
  confidence: number | string | null
  status: string | null
  evidence: Evidence[]
  is_fact: boolean
  assumptions: string | null
  rule_id?: string | null
  confidence_breakdown?: Record<string, unknown> | null
}

export type Commitment = {
  commitment_id: string
  description: string | null
  due_date: string | null
  status: string | null
  owner_user_id: string | null
}

export type Milestone = {
  milestone_id: string
  milestone: string | null
  due_date: string | null
  status: string | null
}

export type Contradiction = {
  contradiction_id: string
  field: string | null
  value_a: string | null
  source_a: string | null
  value_b: string | null
  source_b: string | null
  status: string | null
}

export type BriefTelemetry = {
  model: string
  tokens_in: number
  tokens_out: number
  total_tokens: number
  latency_ms: number
  cost_usd: number
}

export type SuggestedAction = {
  action_type: 'draft_followup' | 'review_task' | 'referral'
  title: string
  description: string
}

export type AccountBrief = {
  summary: string
  account: Account
  snapshot: {
    policy_count: number
    open_claim_count: number
    open_service_case_count: number
  }
  milestones: Milestone[]
  commitments: Commitment[]
  risks: Signal[]
  opportunities: Signal[]
  contradictions: Contradiction[]
  latest_brief: {
    brief_id: string
    persona: string | null
    version: number | null
    generated_at: string | null
    content_json: {
      summary?: string
      agenda?: string[]
      talking_points?: string[]
      prioritized_risks?: string[]
      opportunity_hypotheses?: string[]
      suggested_actions?: SuggestedAction[]
      evidence_citations?: string[]
      telemetry?: BriefTelemetry
    } | null
    completeness_check_passed?: boolean
    telemetry?: BriefTelemetry | null
  } | null
  primary_contact?: Contact | null
  days_to_renewal?: number | null
  agenda?: string[]
  talking_points?: string[]
  prioritized_risks?: string[]
  opportunity_hypotheses?: string[]
  suggested_actions?: SuggestedAction[]
  evidence_citations?: string[]
  telemetry?: BriefTelemetry | null
  completeness_reason?: string | null
  as_of_date: string
  claim_review: {
    reviewed: number
    total: number
    complete: boolean
    omitted?: string | null
  }
  permissions: Record<string, boolean>
  timeline: { event_id: string; event_date: string; title: string; event_type: string }[]
}
