> Current UI: Producer question, action-review and brief-feedback panels have been removed. Drafts support editing and manual copying only. Earlier screenshots/demo steps for those controls are historical; backend APIs remain separate from the current UI.

# Functional requirements and acceptance criteria

Source: use-case pages 1–6. Journey: Renewal-to-Retention. Executive question:
**Which client conversation or renewal needs attention, and what evidence should guide the producer?**

As a producer, I need a concise evidence-grounded brief before a renewal or stewardship
meeting so I can address service issues, honour commitments and discuss appropriate coverage.
The application supports judgement; it cannot bind, change policy data or contact clients autonomously.

## Personas

| Persona | Current authority | Experience |
|---|---|---|
| Producer | Owned, explicitly allowed accounts and permitted record categories | Client book, source records, brief, evidence and reviewed follow-ups |
| Regional Leader | Explicitly allowed accounts in their region | Renewal priorities, filtered portfolio and selected-client preparation; SQLite-derived Executive Dashboard |
| Account Executive | Future; not an additional working role | Relationship/service coordination proposed after permission design |
| Service Leader | Future; not an additional working role | Service issue oversight proposed after permission design |

## Functional scope

| ID | Requirement and observable acceptance criterion | Delivery status |
|---|---|---|
| FR-01 | Authenticate with credentials; restore/revoke a server session; reject spoofed identity, missing session and missing CSRF on authenticated writes. | Implemented; historical isolated verification |
| FR-02 | Scope accounts by ownership/region plus explicit account/resource permissions; deny restricted direct reads and exclude the same records from AI context. | Implemented; historical isolated verification |
| FR-03 | Assemble account/contact/policy/claim/billing/service/activity/document context from relational data; show current record counts and business date. | Implemented; historical isolated verification |
| FR-04 | Prioritize authorized renewals, premium exposure and signals; maintain consistent aggregates when producer/risk/horizon filters change. | Implemented, portfolio filters and client selection; inline leadership preparation removed |
| FR-05 | Generate a persona-specific structured brief with summary, agenda, talking points, risks, hypotheses, citations and next actions; allow one-page print/export. | Implemented agent and client workspace; current client-brief workspace; full regression pending |
| FR-06 | Show source evidence, recency, confidence, assumptions and contradictions. A citation must open its permitted canonical source record. | Implemented; final canonical citation edits not fully regression verified |
| FR-07 | Require every accessible open claim to appear substantively in narrative plus an exact permitted citation. Reject/repair incomplete provider output. | Implemented; historical completeness and fallback tests |
| FR-08 | Detect Policy Admin/CRM renewal conflicts and require reconciliation before binding. | Implemented; historical mandatory scenario verification |
| FR-09 | Label low-confidence opportunities as unverified hypotheses; keep opportunity confidence separate from risk severity. | Implemented; historical mandatory scenario verification |
| FR-10 | Keep source cards usable during background generation; show real phases, retries, fallback and fresh/stale provenance; deduplicate pending jobs by user/account/snapshot. | Implemented; historical lifecycle tests; latest UI integration unverified |
| FR-11 | Answer selected-client questions from accessible evidence with explicit insufficient-data behaviour; never imply deterministic retrieval is an LLM answer. | Implemented; focused API topics/cross-client denial passed; full UI verification pending |
| FR-12 | Persist follow-up/review/referral proposals and an explicit approve/reject decision; prevent stale-source approval. Never send, bind or alter policies. | Implemented; focused create/approve/duplicate/stale checks passed; full UI verification pending |
| FR-13 | Persist accept/reject/correction feedback; require correction text; expose measurable counts without claiming established model accuracy. | Implemented; focused correction201/422 passed; full UI verification pending |
| FR-14 | Audit user/account/persona/model, measured usage, latency, completeness and access events. Separate cost estimates from gateway invoices. | Implemented generation audit; latest extensions unverified |
| FR-15 | A newly injected claim or date conflict must alter source-based preparation without core code changes. | Historical isolated injection passed; final seed lifecycle not rerun |
| FR-16 | Regional Leaders may view the exact Executive screenshot fixture; Producers cannot open it through navigation, URL or API. | Focused historical UI/API checks; separate from live portfolio metrics |

## Non-functional requirements

| ID | Criterion | Acceptance and current limit |
|---|---|---|
| NFR-01 | Privacy and responsible AI | Synthetic data only; authorized context; least privilege; no autonomous external actions; no secrets in browser payloads or documentation. |
| NFR-02 | Accessibility and responsive UX | Labeled keyboard controls, focus trapping/return, semantic headings, reduced motion, 40px mobile inputs/selects and no document-level overflow at 390px. Historical axe results do not certify conformance. |
| NFR-03 | Bounded latency | Configured provider request timeout 10s; shared generation budget 22s; browser request timeout 30s. These are limits, not proven response SLAs. |
| NFR-04 | Reliability | Two local workers; maximum eight active/queued generation jobs; duplicate active work deduplicated. Source cards survive generation failure. |
| NFR-05 | Freshness | Cache requires exact user and source/permission fingerprint. Source changes suppress stale synthesis. Backend startup clears derived briefs/jobs and restarts versions; source data and real usage history remain. |
| NFR-06 | Maintainability | Typed React/FastAPI contracts, source-owned components, separate auth/access/intelligence/agent modules, reproducible SQL source seed, documented dependencies. |
| NFR-07 | Observability/economics | Record known provider usage and latency; zero invented local tokens; unknown costs must be identified. Production monitoring, load tests and retention policy remain to be designed. |

## Assumptions and exclusions

SQLite is the prototype RDBMS; JSON stores derived model payloads, not primary brokerage input.
The repeatable synthetic business date is 8 October 2026, configurable independently of the
operating-system clock. CRM, Guidewire and service names identify synthetic provenance,
not connected production systems. Enterprise SSO, ingestion pipelines, external messaging,
policy binding, automated task execution and additional personas are outside current delivery.
No business KPI improvement has been measured. Production deployment and scale assurance require a separate release review.
