# Producer and Client Intelligence Agent

The principal application includes a real model-backed brief agent using OpenAI's Python
SDK and Pydantic structured output through the configured compatible gateway. Current
defaults prefer Gemini 2.5 Flash Lite, then GPT-4o, then deterministic source-based fallback.
Environment configuration can override those names; never claim a model was used solely
because it is the default. See [agent.py](../../meridian-api/agent.py) and telemetry.

## Controlled pipeline

Authenticated user → account/resource authorization → consistent relational snapshot →
current risk/commitment/renewal/conflict assembly → exact scoped cache → queued generation →
structured provider output → citation/completeness checks → persisted version/audit →
source-fingerprint check → human-reviewed brief and suggested action.

Allowed citations include only accessible record IDs, displayed claim/policy/case aliases
and returned signal IDs. Every accessible open claim needs both narrative coverage and an
exact citation. Unsupported identifiers are rejected. Untrusted document/activity text is
context, not permission to change system instructions or reveal another account. Contradictions
retain both source values. Low-confidence opportunities remain hypotheses with assumptions.
Deterministic checks reduce specific errors; they do not prove every sentence factually correct.

## Freshness and failure

GET brief does not wait for a provider and does not treat historical seeded prose as current AI.
Automatic generation runs once per current account/fingerprint; explicit regeneration is
available. Current operational cards remain visible through pending/error states. Generation
is bounded by configured deadlines, provider retries are disabled and a local fallback stays
clearly labeled. Cache keys include user, persona, source data and permissions. Changing source
or permission scope suppresses old synthesis; backend restart clears derived versions/jobs.

## Human decision boundary

Suggested follow-up, review and referral actions are proposals. The newly added persisted
workflow saves user/account scope and requires explicit approve/reject; a changed source
fingerprint prevents approval against outdated context. Approval has no external execution
side effect. The human checks factual content, contradictions, coverage assumptions and
client wording before using the proposal in the normal brokerage workflow. Feedback captures
accept/reject/correction decisions for review, not autonomous source edits or self-training.

Selected-client conversational retrieval is deterministic and labeled source-based. It is
not a second independent LLM agent, a generic chatbot or proof of unconstrained reasoning.
Only Producer and Regional Leader views are implemented. Eight focused backend checks cover
representative new workflow behaviours; full UI regression remains pending. No production
readiness or measured business outcome is claimed.
