from datetime import date, datetime
from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel, Field


class Contact(BaseModel):
    contact_id: str
    account_id: str
    name: str | None = None
    role: str | None = None
    email: str | None = None
    is_primary: bool = False


class Account(BaseModel):
    account_id: str
    name: str
    industry: str | None = None
    city: str | None = None
    state: str | None = None
    region: str | None = None
    segment: str | None = None
    owner_user_id: str
    annual_premium: Decimal | None = None
    client_since: int | None = None
    risk_level: Literal["high", "medium", "low"] | None = None
    restricted_flag: bool
    source_system: str | None = None
    updated_at: date | None = None
    days_to_renewal: int | None = None
    primary_contact_name: str | None = None
    primary_contact_role: str | None = None


class Policy(BaseModel):
    policy_id: str
    account_id: str
    policy_number: str | None = None
    carrier: str | None = None
    line_of_business: str | None = None
    premium: Decimal | None = None
    effective_date: date | None = None
    renewal_date: date | None = None
    crm_renewal_date: date | None = None
    crm_updated_at: date | None = None
    status: str | None = None
    source_system: str | None = None
    updated_at: date | None = None


class Claim(BaseModel):
    claim_id: str
    policy_id: str
    account_id: str
    claim_number: str | None = None
    status: Literal["open", "closed"]
    loss_date: date | None = None
    reserve_amount: Decimal | None = None
    severity: Literal["high", "medium", "low"] | None = None
    summary: str | None = None
    source_system: str | None = None
    updated_at: date | None = None


class Billing(BaseModel):
    invoice_id: str
    policy_id: str
    account_id: str
    amount: Decimal | None = None
    due_date: date | None = None
    status: Literal["paid", "due", "overdue"] | None = None
    source_system: str | None = None


class ServiceCase(BaseModel):
    case_id: str
    account_id: str
    policy_id: str | None = None
    case_number: str | None = None
    status: Literal["open", "closed"] | None = None
    issue: str | None = None
    category: str | None = None
    opened_at: date | None = None
    resolved_at: date | None = None
    source_system: str | None = None
    updated_at: date | None = None


class Document(BaseModel):
    doc_id: str
    account_id: str
    type: str | None = None
    title: str | None = None
    content_text: str | None = None
    uploaded_at: date | None = None
    source_system: str | None = None


class Signal(BaseModel):
    signal_id: str
    account_id: str
    signal_type: Literal["risk", "opportunity", "coverage_gap"]
    category: str | None = None
    title: str | None = None
    description: str | None = None
    severity: Literal["high", "medium", "low"] | None = None
    is_fact: bool
    confidence: Decimal | None = None
    assumptions: str | None = None
    rule_id: str | None = None
    status: str | None = None
    created_at: date | None = None
    confidence_breakdown: dict[str, Any] | None = None


class Evidence(BaseModel):
    evidence_id: str
    signal_id: str
    source_table: str | None = None
    source_id: str | None = None
    source_system: str | None = None
    snippet: str | None = None
    recency_date: date | None = None
    source_score: Decimal | None = None
    recency_factor: Decimal | None = None
    confidence: Decimal | None = None


class BriefSignal(Signal):
    evidence: list[Evidence] = Field(default_factory=list)


class AccountSnapshot(BaseModel):
    policy_count: int
    open_claim_count: int
    open_service_case_count: int


class RenewalMilestone(BaseModel):
    milestone_id: str
    policy_id: str
    milestone: str | None = None
    due_date: date | None = None
    status: str | None = None


class Commitment(BaseModel):
    commitment_id: str
    account_id: str
    description: str | None = None
    owner_user_id: str | None = None
    due_date: date | None = None
    status: str | None = None
    source: str | None = None


class Contradiction(BaseModel):
    contradiction_id: str
    account_id: str
    policy_id: str | None = None
    field: str | None = None
    value_a: str | None = None
    source_a: str | None = None
    value_b: str | None = None
    source_b: str | None = None
    status: str | None = None
    detected_at: date | None = None
    resolved_at: date | None = None


class SuggestedActionModel(BaseModel):
    action_type: Literal["draft_followup", "review_task", "referral"]
    title: str
    description: str


class BriefTelemetryModel(BaseModel):
    model: str
    tokens_in: int
    tokens_out: int
    total_tokens: int
    latency_ms: int
    cost_usd: float
    fallback_reason: str | None = None
    cost_known: bool = True
    cost_basis: str = "public_list_estimate"


class BriefGenerationState(BaseModel):
    mode: Literal["live_ai", "stored_ai", "rules", "offline"]
    stale: bool
    reason: str | None = None
    can_generate: bool = True
    source_fingerprint: str
    generated_at: datetime | None = None


class LatestBrief(BaseModel):
    brief_id: str
    persona: str | None = None
    version: int | None = None
    generated_at: datetime | None = None
    content_json: dict[str, Any] | None = None
    completeness_check_passed: bool | None = None
    telemetry: BriefTelemetryModel | None = None


class AccountBrief(BaseModel):
    summary: str
    account: Account
    snapshot: AccountSnapshot
    milestones: list[RenewalMilestone]
    commitments: list[Commitment]
    risks: list[BriefSignal]
    opportunities: list[BriefSignal]
    contradictions: list[Contradiction]
    latest_brief: LatestBrief | None = None
    primary_contact: Contact | None = None
    days_to_renewal: int | None = None
    agenda: list[str] = Field(default_factory=list)
    talking_points: list[str] = Field(default_factory=list)
    prioritized_risks: list[str] = Field(default_factory=list)
    opportunity_hypotheses: list[str] = Field(default_factory=list)
    suggested_actions: list[SuggestedActionModel] = Field(default_factory=list)
    evidence_citations: list[str] = Field(default_factory=list)
    telemetry: BriefTelemetryModel | None = None
    completeness_reason: str | None = None
    as_of_date: date
    claim_review: dict[str, Any] = Field(default_factory=dict)
    timeline: list[dict[str, Any]] = Field(default_factory=list)
    permissions: dict[str, bool] = Field(default_factory=dict)
    generation: BriefGenerationState


class BriefGenerationRequest(BaseModel):
    force: bool = False


class BriefGenerationJob(BaseModel):
    job_id: str
    account_id: str
    source_fingerprint: str
    status: Literal["queued", "running", "succeeded", "failed"]
    phase: Literal["queued", "collecting", "generating", "validating", "completed", "failed"]
    message: str
    error: str | None = None
    created_at: datetime
    updated_at: datetime
    result: AccountBrief | None = None
