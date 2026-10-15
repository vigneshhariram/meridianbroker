> Current UI: Producer question, action-review and brief-feedback panels have been removed. Drafts support editing and manual copying only. Earlier screenshots/demo steps for those controls are historical; backend APIs remain separate from the current UI.

# Application architecture

See [editable deck](../presentation/meridian-solution.pptx), [SVG architecture](../presentation/assets/architecture.svg)
and [Mermaid diagrams](diagrams.md). Detailed module links are in [traceability.csv](traceability.csv).

## Context and components

1. The React/TypeScript browser restores an HttpOnly cookie session. TanStack Query keys
   include user and account; sign-out clears query state. Regional and Producer experiences
   reuse shared source-owned Radix components and client intelligence contracts.
2. FastAPI validates requests with Pydantic. AuthService verifies server-side identity and
   CSRF; access.py applies ownership/region, allowed-account and resource gates.
3. intelligence.py reads relational SQLite records and computes risks, opportunity
   evidence, source confidence, contradictions, commitments and renewal milestones.
4. generation.py accepts background jobs, deduplicates pending work and uses a two-worker
   local pool. It reads context in a consistent transaction, releases SQLite before model I/O,
   validates output, then saves the brief and measured audit data.
5. ClientIntelligenceAgent uses the OpenAI Python SDK as a typed client for the configured
   compatible gateway. It is an explicit single-agent workflow, not a multi-agent runtime or
   vector database. Configured model names/deadlines are environment-controlled.
6. Structured generation, exact accessible citation validation and open-claim completeness
   checks run before serving trusted synthesis. Failures use a clearly labeled deterministic
   fallback. The conversational endpoint is source-based retrieval, distinct from the real
   model-backed brief agent.
7. Pending action and feedback APIs persist user/account-scoped records; approval does not
   dispatch external work. Executive screenshot data is a separate constant fixture.

## Principal contracts

| Route | Responsibility |
|---|---|
| POST /auth/login; GET /auth/session; POST /auth/logout | Credential exchange, session restoration and revocation |
| GET /accounts; GET /portfolio | Authorized book and leader-only regional aggregation |
| GET /accounts/{id}/brief | Current source preparation, evidence and freshness/provenance |
| POST /accounts/{id}/brief/jobs; GET /accounts/{id}/brief/jobs/{job_id} | Accepted generation and scoped polling |
| POST /accounts/{id}/brief/generate | Synchronous compatibility path |
| GET /accounts/{id}/{policies,claims,billing,service-cases,documents} | Canonical permitted source records |
| POST /accounts/{id}/copilot | Grounded selected-client source-based answers |
| GET/POST /accounts/{id}/actions; POST /accounts/{id}/actions/{action_id}/approve | Pending proposal and explicit approve/reject |
| POST /accounts/{id}/feedback | Accept/reject/correction feedback |
| GET /admin/audit | Usage limited to own or authorized regional scope; no new Admin persona |
| GET /api/executive-dashboard | Regional Leader-only screenshot fixture |

The action/copilot/feedback additions are implemented in workflows.py (backend service only; Producer workflow panels are retired);
eight focused backend checks include representative topics, cross-client denial, approval and
correction validation. Complete UI integration regression remains pending. Do not treat older
APIs.txt or historical route lists as the current contract.

## Technology and rationale

React 19, TypeScript and Vite support a typed responsive web client. Radix primitives supply
focus and keyboard foundations; Lucide provides icons. TanStack Query manages asynchronous
state; TanStack Table v8 supplies table tools. React Hook Form/Zod validate input. FastAPI,
Pydantic and Python 3.12 provide typed service boundaries. SQLite keeps synthetic relational
data reproducible; uv manages Python dependencies. httpx/OpenAI SDK implement bounded provider
calls. Playwright/Edge, axe, unittest, Ruff, ESLint and TypeScript provide verification tools.
These are tool choices, not proof of production certification.

## Lifecycle, deployment and scale

Normal startup preserves source business data; RESET_DB_ON_START=1 explicitly recreates a
synthetic database and is not needed for UI changes. Current startup separately clears
derived briefs/jobs and removes known legacy fixture audit IDs; real provider usage audit
records remain. Cache reuse therefore lasts within a backend session. Browser polling of
a removed job must stop on 404 and offer regeneration.

Local Vite proxies API paths. A production reverse proxy must serve SPA routes and forward
API requests to FastAPI over HTTPS; the repository is not a deployed platform specification.
Use COOKIE_SECURE=1, explicit allowed origins and managed credentials at deployment.
For multiple service instances, move job ownership/deduplication to a shared queue and use
a server RDBMS with migrations. Define backup, audit retention, secret management, SSO,
provider egress policy and monitoring before production use. No load or resilience benchmark
has validated a distributed design.

## Observability

Security events cover authentication/access decisions. Generation audit records user,
account, persona, model, input/output/total tokens, cost estimate and latency. Job phases
are actual processing states, not estimated percentages. Costs use configured list-price
estimates when known; they are not enterprise gateway billing. Trace IDs/provider-attempt
metadata and feedback reports should be checked against final API contracts before release.
