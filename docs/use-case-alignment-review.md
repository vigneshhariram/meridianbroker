# Meridian use-case alignment review

Assessment date: 12 October 2026.

This report records the project before the subsequent dashboard/authentication changes. See [the implementation report](regional-dashboard-implementation.md) for the newer functionality and verification; the original score has not been reassessed here.

Source: `Y:\Hackathon\Chennai\Siruseri\Chennai_Hub_Team5_Using\UseCase\TCS_Meridian_Strengthen_Client_Retention_Producer_Effectiveness_Usecase.pdf` (six pages).

## Assessment

**Estimated alignment: 40%.** A reasonable judgment range is 35–45%. This is an evidence-based reviewer estimate using the PDF's 100-point evaluation rubric, not an official judge score or a mechanically measured completion percentage.

The project implements a relevant React/FastAPI/SQLite retention cockpit and a substantial synthetic relational data model. Its principal shortfalls are the absence of the mandatory AI agent, static intelligence panels, incomplete enforcement of access controls, simulated AI economics, and missing assessment deliverables. Visual presence and seeded records receive partial credit only when the corresponding behavior is demonstrable.

Scope includes the current working tree and its existing uncommitted changes. Documentation completeness is assessed only within this repository; artifacts held elsewhere were not available for assessment. Implementation files were not changed by this review.

## Scoring against the PDF rubric

| Criterion (PDF page 6) | Available points | Estimated points | Evidence and limitation |
| --- | ---: | ---: | --- |
| Business relevance | 15 | 11 | Client retention cockpit, renewal attention list, producer books, premium exposure, and regional aggregation address the executive question. No measured retention or preparation-time outcomes. |
| Brief quality and usefulness | 15 | 5 | Account snapshots, stored summaries, agendas, and print support exist. No dynamic brief generation, completeness verification, or reliable account-specific display of all commitments and risks. |
| Risk detection | 15 | 4 | Seeded claim, endorsement, service, billing, and contradiction signals exist. Runtime reads stored signals; no rule execution or recomputation when source records change. |
| Grounding and evidence | 10 | 4 | Relational evidence supports source IDs, recency, confidence, and assumptions. Main evidence panel is static; copilot can fabricate fallback references for accounts without claims. |
| End-to-end engineering | 10 | 6 | Frontend builds and representative API routes work with the repeatable SQLite seed. No committed automated test suite; lint fails; required engineering documents are mostly absent. |
| AI reasoning quality | 10 | 0 | No model invocation, agent framework, retrieval/reasoning pipeline, or integrated intelligence agent. Copilot uses a fixed answer template. |
| Trust, privacy and Responsible AI | 10 | 3 | Approval states, feedback storage, audit persistence, and some explicit deny rules exist. Authentication is simulated and authorization is bypassable; correction and audit coverage are incomplete. |
| User experience | 10 | 7 | Primary React cockpit, role switching, detail tabs, conversational input, feedback, printing, and actions are connected. Many intelligence widgets remain fixed, and only two persona types are supported. |
| Tokenomics and model economics | 5 | 0 | Tokens, model name, cost, and latency are hardcoded. No measured model consumption, optimization evidence, model rationale, or scaled-volume projection. |
| **Total** | **100** | **40** | **Estimated overall alignment: 40%.** |

Mandatory requirements are not waived by partial rubric credit: the integrated AI agent remains unmet.

## Functional scope mapping

| Requirement (PDF pages 3–4) | Status | Findings |
| --- | --- | --- |
| Synthetic client data hub using an RDBMS | Largely implemented | SQLite schema has 24 tables and 10 fictional clients. Accounts, contacts, policies, claims, activities, cases, documents, billing, and endorsements are represented. SQL initialization is repeatable; JSON is used for derived payloads rather than the primary business store. |
| Client intelligence model | Partial | Timeline events, milestones, commitments, risks, and opportunities are modeled. Activities/timeline are not assembled into the principal brief, and risk rules are not executed. |
| Brief generator | Partial | GET retrieves a previously seeded brief. No generation or regeneration endpoint. Summary/agenda have generic fallbacks. The latest brief is selected without filtering by the user's persona. |
| Evidence panel | Partial | API returns evidence metadata. UI displays fixed source cards and dates rather than the selected client's returned evidence or contradictions. |
| Conversational copilot | Minimal | Prompt reaches the API, but allowed questions receive the same claim/endorsement template. Answers do not adapt to question intent or persona. |
| Controlled next actions | Partial | Draft/review creation and approve/reject operations persist. Referral is represented in the database/API model. UI action payloads are fixed, approval operates on the first pending item, and access/approver authorization is absent. No client-contact execution was found. |
| Feedback and quality | Partial | Accept/reject/correction records persist. “Correct this” submits a generic comment; no correction editor, brief regeneration, or accuracy monitoring. |
| Audit and economics | Partial / simulated | Copilot prompts and blocks are logged. Read access is not comprehensively logged; aggregates lack a today filter, and metrics contain mock fallbacks. AI usage values are not measurements. |
| Persona adaptation | Partial | Producer and regional leader views exist. Account executive and service leader views are missing; briefs and answers are not reliably persona-sensitive. |

## Mandatory scenarios and live scenario

| Scenario (PDF page 4) | Assessment | Evidence |
| --- | --- | --- |
| Material open claim omitted from initial summary | Seeded example only | SQL stores an omitted-claim brief, corrected brief, and correction feedback. Injecting another material claim changes the snapshot count from 1 to 2 but leaves the summary, risk list, and stored completeness flag unchanged. UI always displays “17 of 17 open claims reviewed”; the seed has six open claims in total. |
| Conflicting renewal dates across systems | Seeded example only | Contradiction records exist, but injecting a new policy/CRM date mismatch produces no new contradiction. Evidence cards display fixed 2025 dates despite the seed's October 2026 scenario. |
| Cross-sell opportunity lacks sufficient evidence | Partial presentation | UI labels fixed opportunities as hypotheses and warns that evidence is insufficient. No runtime evidence threshold or recomputed opportunity validation is present. |
| Prompt attempts to expose restricted client information | Partial and bypassable | Explicit U1/A05 denial blocks the copilot request. Restricted documents return 200 when user ID is omitted or unknown; supplied identities are not authenticated. Generic cross-client injection is not blocked, although its fixed reply did not expose all requested records in this test. |
| Additional live scenario without core code changes | Not demonstrated | New source claims and policy conflicts do not refresh intelligence. `signal_rules` exists but is never read/executed by the backend. Several conditions retain PostgreSQL syntax or descriptive pseudocode. An injected `coverage_gap` signal is excluded from the brief's risk/opportunity queries. |

## Required deliverables

The PDF lists twelve deliverables on page 5. Repository evidence is as follows:

| Deliverable | Repository evidence | Status |
| --- | --- | --- |
| 1. Functional Requirements Document | No FRD with acceptance criteria, non-functional requirements, assumptions, and scope found. | Missing |
| 2. Application architecture/document | No architecture document or context/component/AI/security/deployment diagrams found. | Missing |
| 3. Database design/data models | SQLite and PostgreSQL schema/seed scripts exist; ER diagram, logical model, and formal data dictionary were not found. | Partial |
| 4. UI/UX/wireframe design | Producer and regional screenshots plus implemented cockpit, drill-downs, chat, and approvals; outcome views incomplete. | Substantial partial |
| 5. Code and working software | React/FastAPI implementation, configuration, README setup steps, and SQL-backed initialization exist; required intelligence behavior incomplete. | Partial |
| 6. Functional/non-functional test scripts | No CSV/Excel test inventory or committed automated tests found. | Missing |
| 7. Traceability matrix | No requirements-to-code/test/demo mapping found. | Missing |
| 8. End user manual | Developer setup READMEs exist; no full persona/approval/limitations user manual. | Missing |
| 9. Integrated intelligence agent using an AI framework | No agent framework or actual model call. | Missing |
| 10. Prompt and AI usage register | Seeded application audit rows do not document AI use throughout the SDLC, accepted/rejected iterations, and human validation. | Missing |
| 11. Tokenomics/model economics report | Mock runtime values; no report with rationale, controls, and scaled costs. | Missing |
| 12. Demo package | No architecture summary, assumptions/limitations package, eight-minute script, or two-minute value statement found. | Missing |

## Verification performed

- Read all six PDF pages and inspected API, frontend, sign-in, database initialization, both database scripts, dependency manifests, READMEs, API notes, and repository file inventory.
- `npm.cmd run build`: passed TypeScript and Vite production build.
- `npm.cmd run lint`: failed with six errors: four `react-hooks/set-state-in-effect` findings in `App.tsx`, two `react-refresh/only-export-components` findings in `SignIn.tsx`.
- Executed actual FastAPI ASGI requests using an isolated in-memory database loaded from the project's SQLite seed; the existing `meridian.db` was not modified.
- Twelve representative read routes returned HTTP 200: account list, producer/region lists, brief, policies, claims, billing, service cases, documents, actions, portfolio, and audit.
- Feedback persistence and action create/approve operations worked in the isolated database. U1 could also create and approve an action against denied account A05, confirming missing action authorization.
- Explicit restricted-document access returned 403 for denied users; omitting `user_id` or using an unknown value returned 200.
- Two unrelated copilot questions returned identical answers. Claim-free A09 received fallback claim `CLM-99231` and endorsement `PA-77821` instead of an insufficient-data answer.
- Copilot requests completed in roughly 0.5–1.1 ms in the in-process check while reporting a fixed 2,100 ms latency. This confirms simulation, not a deployment performance benchmark.
- Injected material-claim, renewal-conflict, and coverage-gap cases into the isolated database to verify behavior described above.
- Inspected the existing database read-only: 10 accounts, 9 claims, 6 open claims, 33 signals, 4 briefs, and 7 audit rows. Source seed and current database agree on these main business counts.

No browser-based usability assessment, load test, external integration test, or business-outcome validation was performed. Existing uncommitted source changes were preserved.

## Highest-priority improvements

1. Implement the mandatory integrated AI agent with account-scoped retrieval, dynamic briefs, grounded answers, evidence validation, and explicit insufficient-data behavior.
2. Bind risks, opportunities, commitments, evidence, contradictions, and completeness indicators to the selected account's actual payload; remove fixed business assertions and generic misleading fallbacks.
3. Authenticate server-side and deny access by default. Apply account/resource/region checks to every read, copilot operation, action, feedback item, and audit view; enforce approver permissions.
4. Recompute signals, conflicts, confidence, and completeness from source changes. Demonstrate all four mandatory scenarios and one newly injected scenario through the principal UI.
5. Measure actual model usage, cost, and latency; add workflow-specific reporting, model-selection rationale, optimization evidence, and scaled-volume projections.
6. Complete the missing deliverables and scenario/security/grounding tests, and resolve the six lint errors.

## Key code evidence

- Relational hub and governance model: [SQLite schema](../meridian-api/sql/meridian_schema_and_seed_sqlite.sql:37).
- Stored signal/evidence assembly: [brief endpoint](../meridian-api/main.py:681).
- Stored brief selection without persona filtering: [brief selection](../meridian-api/main.py:753).
- Scripted copilot and simulated trace: [copilot response](../meridian-api/main.py:1004).
- Optional identity and default-allow access: [access helper](../meridian-api/main.py:387).
- Actions without account/approver access validation: [action endpoints](../meridian-api/main.py:801).
- Fixed completeness, risks, opportunities, and commitments: [cockpit widgets](../meridian-ui/src/App.tsx:869).
- Fixed evidence cards: [evidence panel](../meridian-ui/src/App.tsx:1063).
- Simulated sign-in and two role types: [sign-in implementation](../meridian-ui/src/SignIn.tsx:5).
- Mock audit aggregates: [audit endpoint](../meridian-api/main.py:1073).
