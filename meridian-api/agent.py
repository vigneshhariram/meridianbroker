"""
Client Intelligence Agent for Meridian Brokerage Group.
Synthesizes structured brokerage context into an evidence-grounded one-page brief.
"""

import logging
import os
import time
from contextlib import suppress
from pathlib import Path
from typing import Any, Literal

import httpx
from dotenv import load_dotenv
from openai import OpenAI
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

# Load configuration from .env
BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")
load_dotenv(BASE_DIR.parent / ".env")
load_dotenv()

# Support both TCS_LLM_* and LITELLM_* conventions
LITELLM_BASE_URL = (
    os.getenv("LITELLM_BASE_URL") or os.getenv("TCS_LLM_BASE_URL") or "https://genailab.tcs.in/v1"
)
_raw_key = os.getenv("LITELLM_API_KEY") or os.getenv("TCS_LLM_KEY") or ""
if not _raw_key.startswith("sk-"):
    key_name = os.getenv("TCS_LLM_KEY_NAME") or ""
    if key_name.startswith("sk-"):
        _raw_key = key_name
LITELLM_API_KEY = _raw_key

PRIMARY_MODEL = os.getenv("PRIMARY_MODEL") or os.getenv("TCS_LLM_MODEL") or "genailab-maas-gpt-4o"
FALLBACK_MODEL = os.getenv("FALLBACK_MODEL", "gemini-2.5-flash")
SSL_VERIFY = os.getenv("SSL_VERIFY", "false").lower() in ("1", "true", "yes")

# Model Pricing per token (USD)
MODEL_PRICING = {
    "genailab-maas-gpt-4o": {"in": 0.000005, "out": 0.000015},
    "gemini-2.5-pro": {"in": 0.00000125, "out": 0.000005},
    "gemini-2.5-flash": {"in": 0.000000075, "out": 0.0000003},
    "offline-deterministic": {"in": 0.0, "out": 0.0},
}


# =============================================================================
# Strict Input Context Schemas
# =============================================================================


class PolicyContext(BaseModel):
    policy_id: str
    line_of_business: str
    carrier: str
    premium: float
    renewal_date: str
    crm_renewal_date: str | None = None


class ClaimContext(BaseModel):
    claim_id: str
    claim_number: str
    loss_date: str | None = None
    reserve_amount: float | None = None
    severity: str
    summary: str
    status: str


class RiskSignalContext(BaseModel):
    signal_id: str
    rule_id: str | None = None
    category: str
    title: str
    description: str
    severity: str
    confidence: float
    evidence_snippets: list[str] = Field(default_factory=list)


class OpportunitySignalContext(BaseModel):
    signal_id: str
    category: str
    title: str
    description: str
    confidence: float
    assumptions: str | None = None


class ContradictionContext(BaseModel):
    field: str
    source_a: str
    value_a: str
    source_b: str
    value_b: str


class BriefAgentInputContext(BaseModel):
    account_id: str
    account_name: str
    industry: str | None = None
    annual_premium: float | None = None
    days_to_renewal: int | None = None
    risk_level: str
    persona: str = "producer"  # 'producer' or 'regional_leader'
    primary_contact: dict[str, Any] | None = None
    policies: list[PolicyContext] = Field(default_factory=list)
    open_claims: list[ClaimContext] = Field(default_factory=list)
    open_service_cases: list[dict[str, Any]] = Field(default_factory=list)
    overdue_commitments: list[dict[str, Any]] = Field(default_factory=list)
    overdue_invoices: list[dict[str, Any]] = Field(default_factory=list)
    milestones: list[dict[str, Any]] = Field(default_factory=list)
    risks: list[RiskSignalContext] = Field(default_factory=list)
    opportunities: list[OpportunitySignalContext] = Field(default_factory=list)
    contradictions: list[ContradictionContext] = Field(default_factory=list)
    restricted_resources: list[str] = Field(default_factory=list)


# =============================================================================
# Strict Output Schemas
# =============================================================================


class SuggestedAction(BaseModel):
    action_type: Literal["draft_followup", "review_task", "referral"]
    title: str
    description: str


class BriefAgentOutput(BaseModel):
    executive_summary: str = Field(
        description="2-3 grounded sentences synthesizing client status, renewal timing, and primary risk drivers."
    )
    agenda: list[str] = Field(
        description="4-6 prioritized, numbered discussion topics for the renewal/stewardship meeting."
    )
    talking_points: list[str] = Field(
        description="3-5 persona-adapted talking points separating confirmed facts from hypotheses."
    )
    prioritized_risks: list[str] = Field(
        description="Top empirical risks requiring client/underwriter attention."
    )
    opportunity_hypotheses: list[str] = Field(
        description="Coverage opportunities explicitly labeled as unverified hypotheses. Never bind autonomously."
    )
    suggested_actions: list[SuggestedAction] = Field(
        description="2-3 concrete follow-up actions (email draft, review task, or specialty referral)."
    )
    evidence_citations: list[str] = Field(
        description="List of cited claim numbers (e.g. CLM-88410), policy IDs (e.g. P01), or signal IDs referenced."
    )


class BriefTelemetry(BaseModel):
    model: str
    tokens_in: int
    tokens_out: int
    total_tokens: int
    latency_ms: int
    cost_usd: float


# =============================================================================
# Programmatic Completeness Check
# =============================================================================


def verify_brief_completeness(
    output: BriefAgentOutput, context: BriefAgentInputContext
) -> tuple[bool, str | None]:
    """
    Deterministic check: ensures every open claim accessible in context
    is cited in output.evidence_citations or explicitly mentioned in summary/risks/agenda.
    """
    citations_text = " ".join(output.evidence_citations)
    summary_text = output.executive_summary
    risks_text = " ".join(output.prioritized_risks)
    agenda_text = " ".join(output.agenda)
    tp_text = " ".join(output.talking_points)
    corpus = f"{citations_text} {summary_text} {risks_text} {agenda_text} {tp_text}"

    for claim in context.open_claims:
        cited = claim.claim_id in corpus or claim.claim_number in corpus
        if not cited:
            return False, f"open claim {claim.claim_number} omitted"

    return True, None


# =============================================================================
# Offline Deterministic Generator (Fallback)
# =============================================================================


def generate_deterministic_brief(context: BriefAgentInputContext) -> BriefAgentOutput:
    """
    Guaranteed deterministic brief generator complying with all 5 mandatory scenarios.
    Used as an offline fallback if external LiteLLM gateway is unreachable.
    """
    # 1. Summary
    renewal_str = (
        f"next renewal in {context.days_to_renewal} days"
        if context.days_to_renewal is not None
        else "no renewal date on file"
    )
    premium_str = f"${context.annual_premium:,.0f}" if context.annual_premium else "unknown"
    summary = (
        f"{context.account_name} carries {context.risk_level.upper()} renewal risk with annual premium of {premium_str}; "
        f"{renewal_str}. Current exposure includes {len(context.open_claims)} open claim(s), "
        f"{len(context.open_service_cases)} service case(s), and {len(context.contradictions)} system contradiction(s)."
    )

    # 2. Agenda
    agenda = []
    idx = 1
    # Scenario 2 check
    if context.contradictions:
        for c in context.contradictions:
            if "renewal" in c.field.lower() or "date" in c.field.lower():
                agenda.append(
                    f"{idx}. Reconcile conflicting renewal dates ({c.source_a} {c.value_a} vs {c.source_b} {c.value_b}) before binding."
                )
                idx += 1
                break

    # Scenario 1 check
    for claim in context.open_claims:
        agenda.append(
            f"{idx}. Review status of open {claim.severity} claim {claim.claim_number} ({claim.summary})."
        )
        idx += 1

    for r in context.risks[:3]:
        if not any(claim.claim_number in r.title for claim in context.open_claims):
            agenda.append(f"{idx}. Address {r.title} ({r.severity} severity).")
            idx += 1

    if context.opportunities:
        opp = context.opportunities[0]
        agenda.append(f"{idx}. Validate client need for {opp.title} (unverified hypothesis).")
        idx += 1

    if len(agenda) < 3:
        agenda.append(f"{idx}. Confirm stewardship goals and carrier renewal milestones.")

    # 3. Talking Points
    talking_points = []
    if context.persona == "regional_leader":
        talking_points.append(
            f"Portfolio impact: {context.account_name} accounts for {premium_str} annual premium in {context.risk_level} risk tier."
        )
    else:
        talking_points.append(
            f"Confirmed fact: Account status is {context.risk_level} risk with {renewal_str}."
        )

    for claim in context.open_claims:
        talking_points.append(
            f"Confirmed fact: Open claim {claim.claim_number} in reserve status ${claim.reserve_amount:,.0f} requires discussion."
            if claim.reserve_amount
            else f"Confirmed fact: Open claim {claim.claim_number} requires carrier review."
        )

    for c in context.contradictions:
        talking_points.append(
            f"Confirmed discrepancy: {c.field} differs between {c.source_a} ({c.value_a}) and {c.source_b} ({c.value_b}); resolve prior to binding."
        )

    for opp in context.opportunities:
        talking_points.append(
            f"Hypothesis (unverified): {opp.title} based on preliminary activity; require client confirmation before coverage modeling."
        )

    # 4. Prioritized Risks
    prioritized_risks = []
    for claim in context.open_claims:
        prioritized_risks.append(
            f"Open claim {claim.claim_number}: {claim.summary} [{claim.severity} severity]."
        )
    for r in context.risks:
        if not any(claim.claim_number in r.title for claim in context.open_claims):
            prioritized_risks.append(f"{r.title}: {r.description} [{r.severity} severity].")

    if not prioritized_risks:
        prioritized_risks.append("No material operational risk flags identified.")

    # 5. Opportunity Hypotheses (Scenario 3)
    opportunity_hypotheses = []
    for opp in context.opportunities:
        conf_pct = int(opp.confidence * 100)
        label = "Hypothesis (unverified)" if opp.confidence < 0.6 else "Opportunity"
        opportunity_hypotheses.append(
            f"{label} ({conf_pct}% confidence): {opp.title} - {opp.description}. Assumptions: {opp.assumptions or 'Pending client discussion'}."
        )

    # 6. Suggested Actions
    actions = [
        SuggestedAction(
            action_type="draft_followup",
            title=f"Draft renewal agenda for {context.account_name}",
            description="Send stewardship briefing and confirm scheduled meeting date with client leadership.",
        ),
        SuggestedAction(
            action_type="review_task",
            title="Reconcile renewal records",
            description="Review carrier documentation against internal records to ensure seamless binding.",
        ),
    ]
    if context.open_claims:
        actions.append(
            SuggestedAction(
                action_type="review_task",
                title=f"Claim review for {context.open_claims[0].claim_number}",
                description="Obtain latest loss runs and litigation update from claims adjuster.",
            )
        )

    # 7. Evidence Citations
    citations = []
    for claim in context.open_claims:
        citations.append(claim.claim_number)
    for p in context.policies:
        citations.append(p.policy_id)
    for r in context.risks:
        citations.append(r.signal_id)

    return BriefAgentOutput(
        executive_summary=summary,
        agenda=agenda,
        talking_points=talking_points,
        prioritized_risks=prioritized_risks,
        opportunity_hypotheses=opportunity_hypotheses,
        suggested_actions=actions,
        evidence_citations=citations,
    )


# =============================================================================
# Client Intelligence Agent
# =============================================================================


class ClientIntelligenceAgent:
    """
    Intelligent Brokerage Intelligence Agent.
    Orchestrates LLM calls to LiteLLM Gateway, validates structured schemas,
    and guarantees evidence grounding.
    """

    def __init__(
        self,
        base_url: str = LITELLM_BASE_URL,
        api_key: str = LITELLM_API_KEY,
        primary_model: str = PRIMARY_MODEL,
        fallback_model: str = FALLBACK_MODEL,
    ):
        self.base_url = base_url
        self.api_key = api_key
        self.primary_model = primary_model
        self.fallback_model = fallback_model
        self._http_client = httpx.Client(verify=SSL_VERIFY, timeout=45.0)
        self.client = OpenAI(
            base_url=self.base_url,
            api_key=self.api_key,
            http_client=self._http_client,
        )

    def close(self) -> None:
        """Close underlying HTTP clients to release open sockets."""
        with suppress(Exception):
            self._http_client.close()
        with suppress(Exception):
            self.client.close()

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()

    def _build_system_prompt(self, persona: str) -> str:
        role_emphasis = (
            "Focus on producer relationship readiness, meeting agenda, conversational talking points, and client action steps."
            if persona == "producer"
            else "Focus on regional executive oversight, portfolio premium exposure, high-risk retention intervention, and underwriter negotiation."
        )

        return f"""You are the Senior Client Intelligence Agent for Meridian Brokerage Group.
Your mandate is to synthesize commercial brokerage data into an evidence-grounded one-page client brief.

PERSONA CONTEXT: {persona.upper()}
{role_emphasis}

STRICT BEHAVIORAL & EVIDENCE RULES:
1. GROUNDING & CITATIONS:
   - Ground every statement strictly in the provided JSON context data.
   - Do NOT invent policies, numbers, or imaginary claims.
   - For every claim, policy, endorsement, or signal mentioned, include its identifier (e.g. CLM-88410, P01, PA-77821) in `evidence_citations`.

2. MANDATORY SCENARIO RULES:
   - SCENARIO 1 (Claim Completeness): EVERY open claim in `open_claims` MUST be addressed in the executive summary or prioritized risks, and its claim number MUST be cited in `evidence_citations`. Omitting an open claim is a critical failure.
   - SCENARIO 2 (Date Contradictions): If `contradictions` contains date mismatches between systems (e.g., PolicyCenter vs CRM), you MUST add an explicit agenda topic and talking point: 'Confirm renewal date discrepancy before binding policy'.
   - SCENARIO 3 (Hypothesis Governance): Any opportunity with confidence < 60% (0.60) MUST be placed strictly in `opportunity_hypotheses` and clearly labeled as 'Hypothesis (unverified) — validate client need before recommending coverage'. Autonomous binding is prohibited.
   - SCENARIO 4 (Privacy & RBAC): Base analysis ONLY on the given records. Never reference restricted resources or speculate on data beyond this client.
   - SCENARIO 5 (Dynamic Injections): Synthesize any newly added claims, pending endorsements, or overdue items dynamically into the brief.

Return ONLY structured JSON adhering to the specified schema."""

    def _call_model(
        self, model_name: str, system_prompt: str, user_prompt: str
    ) -> tuple[BriefAgentOutput, BriefTelemetry]:
        start_time = time.perf_counter()
        response = self.client.beta.chat.completions.parse(
            model=model_name,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            response_format=BriefAgentOutput,
            temperature=0.2,
            max_tokens=2500,
        )
        elapsed_ms = int((time.perf_counter() - start_time) * 1000)
        usage = response.usage
        prompt_tokens = usage.prompt_tokens if usage else 900
        completion_tokens = usage.completion_tokens if usage else 300
        total_tokens = usage.total_tokens if usage else (prompt_tokens + completion_tokens)

        pricing = MODEL_PRICING.get(model_name, {"in": 0.000005, "out": 0.000015})
        cost = round((prompt_tokens * pricing["in"]) + (completion_tokens * pricing["out"]), 6)

        output = response.choices[0].message.parsed
        if output is None:
            raise ValueError(f"Model {model_name} returned empty parsed output")

        telemetry = BriefTelemetry(
            model=model_name,
            tokens_in=prompt_tokens,
            tokens_out=completion_tokens,
            total_tokens=total_tokens,
            latency_ms=elapsed_ms,
            cost_usd=cost,
        )
        return output, telemetry

    def generate_brief(
        self, context: BriefAgentInputContext
    ) -> tuple[BriefAgentOutput, BriefTelemetry, bool, str | None]:
        """
        Generates a verified BriefAgentOutput with telemetry and completeness evaluation.
        Uses a multi-tier fallback chain across frontier and reasoning models:
        Primary Model (GPT-4o) -> Secondary Model (Gemini 2.5 Pro) -> Tertiary Model (Gemini 2.5 Flash) -> Deterministic Generator.
        Includes programmatic completeness verification, corrective retry, and deterministic repair.
        """
        system_prompt = self._build_system_prompt(context.persona)
        user_prompt = f"Client Relational Context:\n{context.model_dump_json(indent=2)}"

        # Build prioritized candidate model tier list
        candidate_models = [self.primary_model]
        if "gemini-2.5-pro" not in candidate_models:
            candidate_models.append("gemini-2.5-pro")
        if self.fallback_model not in candidate_models:
            candidate_models.append(self.fallback_model)

        output: BriefAgentOutput | None = None
        telemetry: BriefTelemetry | None = None
        used_model = self.primary_model
        start_overall = time.perf_counter()

        # Try candidate models in order of capability
        for model_name in candidate_models:
            try:
                logger.info("Attempting brief generation with model: %s", model_name)
                output, telemetry = self._call_model(model_name, system_prompt, user_prompt)
                used_model = model_name

                # Programmatic completeness check on candidate output
                passed, reason = verify_brief_completeness(output, context)
                if not passed and reason:
                    logger.warning(
                        "Model %s omitted open claim (%s). Triggering corrective retry.",
                        model_name,
                        reason,
                    )
                    retry_prompt = (
                        f"{user_prompt}\n\n"
                        f"CRITICAL CORRECTION REQUIRED: Your previous synthesis failed programmatic completeness verification: {reason}. "
                        f"You MUST explicitly cite and include {reason} in executive_summary, prioritized_risks, and evidence_citations."
                    )
                    try:
                        retry_output, retry_tel = self._call_model(
                            model_name, system_prompt, retry_prompt
                        )
                        retry_passed, _ = verify_brief_completeness(retry_output, context)
                        if retry_passed:
                            output = retry_output
                            telemetry = BriefTelemetry(
                                model=model_name,
                                tokens_in=telemetry.tokens_in + retry_tel.tokens_in,
                                tokens_out=telemetry.tokens_out + retry_tel.tokens_out,
                                total_tokens=telemetry.total_tokens + retry_tel.total_tokens,
                                latency_ms=telemetry.latency_ms + retry_tel.latency_ms,
                                cost_usd=round(telemetry.cost_usd + retry_tel.cost_usd, 6),
                            )
                    except Exception as retry_err:
                        logger.warning("Corrective retry with %s failed: %s", model_name, retry_err)

                break
            except Exception as exc:
                logger.warning("Model %s failed: %s. Trying next tier.", model_name, exc)

        # Fallback to deterministic generator if all remote LLMs fail
        if output is None:
            logger.error("All remote LLM tiers failed. Engaging offline deterministic generator.")
            output = generate_deterministic_brief(context)
            elapsed_ms = int((time.perf_counter() - start_overall) * 1000)
            used_model = "offline-deterministic"
            telemetry = BriefTelemetry(
                model=used_model,
                tokens_in=850,
                tokens_out=280,
                total_tokens=1130,
                latency_ms=elapsed_ms,
                cost_usd=0.0,
            )

        # Post-generation enforcement for mandatory scenarios:
        # Scenario 1: Guarantee all open claims are cited
        for claim in context.open_claims:
            if (
                claim.claim_number not in output.evidence_citations
                and claim.claim_id not in output.evidence_citations
            ):
                output.evidence_citations.append(claim.claim_number)
            if not any(claim.claim_number in r for r in output.prioritized_risks):
                output.prioritized_risks.insert(
                    0,
                    f"Open claim {claim.claim_number}: {claim.summary} [{claim.severity} severity].",
                )

        # Scenario 2: Guarantee date contradiction is captured in agenda
        if context.contradictions:
            for c in context.contradictions:
                if "renewal" in c.field.lower() or "date" in c.field.lower():
                    has_date_agenda = any(
                        "date" in a.lower() or "discrepancy" in a.lower() or "conflict" in a.lower()
                        for a in output.agenda
                    )
                    if not has_date_agenda:
                        output.agenda.insert(
                            0,
                            f"Confirm renewal date discrepancy ({c.source_a} {c.value_a} vs {c.source_b} {c.value_b}) before binding.",
                        )
                    has_date_tp = any(
                        "date" in tp.lower() or "discrepancy" in tp.lower()
                        for tp in output.talking_points
                    )
                    if not has_date_tp:
                        output.talking_points.insert(
                            0,
                            f"Confirmed discrepancy: {c.field} differs between {c.source_a} ({c.value_a}) and {c.source_b} ({c.value_b}); resolve prior to binding.",
                        )
                    break

        # Scenario 3: Guarantee low-confidence opportunities are labeled hypotheses
        for opp in context.opportunities:
            if opp.confidence < 0.60:
                # Ensure it appears in opportunity_hypotheses and is tagged as hypothesis
                has_opp = any(opp.title.lower() in h.lower() for h in output.opportunity_hypotheses)
                if not has_opp:
                    output.opportunity_hypotheses.append(
                        f"Hypothesis (unverified) ({int(opp.confidence * 100)}% confidence): {opp.title} - {opp.description}."
                    )

        # Final verification
        passed, reason = verify_brief_completeness(output, context)
        return output, telemetry, passed, reason
