# Meridian Broker Business Requirements

## Purpose and scope

This document describes the business capabilities currently implemented by the
Meridian Broker UI and API. It is reverse-engineered from the code and tests, not
an approved statement of future product scope. Requirements marked **API-only**
are implemented by the service but do not currently have a corresponding UI
screen.

The application is a brokerage account and renewal workspace. It uses
synthetic/demo records, a configurable business date, and a local SQLite
database. Production integrations, hosting, and data-ingestion processes are
outside the behavior established by this repository.

## Users and business outcomes

| User | Current workspace | Intended outcome |
|---|---|---|
| Producer | Their permitted book of business | Prepare for renewals, review client records and evidence, and generate client meeting briefs. |
| Regional Leader | Permitted accounts in their region | Identify renewal and service exposures, compare portfolio risk, and open an account workspace for follow-up. |

## Functional requirements

### Access and workspaces

| ID | Requirement | Acceptance criteria / implementation behavior |
|---|---|---|
| BR-01 | Users must sign in with their assigned credentials before accessing business data. | Valid credentials establish a server-side session and return the user's assigned role and region. Invalid credentials are rejected. The client does not select or override the user's role. |
| BR-02 | Users must be able to restore an unexpired session when reopening the UI and explicitly sign out. | The UI checks the session at startup. Sign-out revokes the session and clears client-side query data. An expired/invalid session returns the user to sign-in and clears the workspace. |
| BR-03 | The system must limit repeated unsuccessful sign-in attempts. | Five failed attempts for an email within a five-minute window cause further attempts in that window to be rate-limited. |
| BR-04 | Authenticated mutating requests must be protected against cross-site request forgery. | The session supplies a CSRF token; authenticated non-GET requests require the matching `X-CSRF-Token`. Sign-in is the unauthenticated credential-exchange exception. |
| BR-05 | Account visibility must follow the signed-in user's role, region, ownership, and account-level access rules. | Producers see only accounts they own and are allowed to access. Regional Leaders see only allowed accounts in their region. Attempts to access out-of-scope accounts or resources are denied and recorded. |
| BR-06 | The API must enforce resource-specific permissions for policies, claims, billing, service cases, and documents. | Restricted resources are omitted from account-brief inputs; direct reads of unauthorized resource records are denied. Account brief completeness must identify when claims cannot be reviewed due to access restrictions. |

### Producer account workspace

| ID | Requirement | Acceptance criteria / implementation behavior |
|---|---|---|
| BR-07 | Producers must be able to find and prioritize accounts in their book. | The UI lists authorized accounts, supports name search, and sorts accounts by risk tier followed by days to renewal. |
| BR-08 | The account overview must present the account context needed for a renewal discussion. | The overview includes account/profile and primary contact details, renewal timing, summary, claim-review completeness, evidence citations, signals, and suggested actions when available. |
| BR-09 | Users must be able to inspect account source records by category. | Account tabs retrieve policies, claims, billing, service cases, and documents from their corresponding API routes. The UI shows loading, errors, empty results, and available record fields. |
| BR-10 | The account brief must combine source records with relevant computed intelligence. | The brief includes a snapshot, accessible milestones and commitments, risk/opportunity signals with evidence, detected contradictions, and the latest generated brief for that user's persona. |
| BR-11 | Risk and opportunity signals must be distinguishable as facts versus hypotheses and traceable to evidence. | Signal rows show title, description, confidence, severity for factual risks, assumptions for hypotheses, and an expandable confidence breakdown when supplied. Evidence records retain source, source date, and confidence attributes. |
| BR-12 | Risk severity and evidence confidence must remain distinct. | Severity is shown using high/medium/low styling; confidence is shown as a percentage. Equal confidence values do not imply equal severity. |
| BR-13 | Users must be able to regenerate a client brief on demand. | The API builds structured context, requests a schema-constrained brief from the configured model gateway, checks that accessible open claims are cited or mentioned, stores a persona-specific version and telemetry, and returns the updated account brief. |
| BR-14 | Brief generation must remain available when the model gateway is unavailable. | The agent uses deterministic local generation as a fallback and returns a structured brief. Generated actions are recommendations only; the application does not execute them on a user's behalf. |
| BR-15 | The UI must communicate brief completeness and generation failures. | The overview shows claim-review status, missing-claim/completeness alerts, and generation errors. Users can retry/regenerate where the UI offers that action. |
| BR-16 | Users must be able to print/export the displayed account brief. | The Export brief control invokes the browser print flow. No separate file-export service is implemented. |

### Risk and opportunity business rules

Signals are constructed by the API from current account records and are not
limited to pre-seeded rows in the `signals` table. The default demo business
date is October 8, 2026; `MERIDIAN_AS_OF_DATE` can override it.

| Rule | Current behavior |
|---|---|
| R1 — Open claim near renewal | An open claim on a policy whose renewal date is no more than 60 days away produces a risk; past-due renewals also meet the implemented date threshold. Severity follows the claim record, defaulting to medium if missing. |
| R2 — Conflicting renewal dates | An active policy with differing Policy Admin and CRM renewal dates produces a medium risk and a contradiction requiring human review. Confidence uses the weaker of the two source evidence scores without corroboration. |
| R3 — Pending endorsement | A pending endorsement on a policy whose renewal date is no more than 90 days away produces a risk; past-due renewals also meet the implemented date threshold. Severity is medium when the date is no more than 30 days away, otherwise low. |
| R4 — Open service case | An open service case produces a risk: medium for Claims Handling or Billing, otherwise low. |
| R6 — Overdue commitment | An unfinished commitment whose due date is before the business date is marked overdue and produces a medium risk. |
| R7 — Overdue invoice | An overdue invoice, or a due invoice whose due date is before the business date, produces a medium risk. |
| R8 — Stale engagement | If the latest dated activity is more than 180 days old, a low engagement risk is produced. |
| R9 — Risk language | The first activity containing configured risk terms (`price`, `unhappy`, `concern`, `frustrated`, `complaint`) produces a low risk. Documents are searched only if no activity matched. |
| R10 — Stale policy data | Each active policy last updated more than 540 days ago produces a low data-quality risk. |

For non-conflict computed risks, confidence is based on the strongest evidence
confidence plus up to 0.10 for independent corroborating source systems, capped
at 0.98. Account risk roll-up is high if a high-severity risk has confidence at
least 0.50; otherwise it is medium if a medium-severity risk meets that
confidence threshold; otherwise it is low. Opportunities do not change the
account risk tier. Curated active signals are retained when their evidence is
accessible and resolves to records for that account; dynamically computed risk
categories are recalculated from their source records.

### Regional portfolio workspace

| ID | Requirement | Acceptance criteria / implementation behavior |
|---|---|---|
| BR-17 | Regional Leaders must be able to review portfolio exposure. | The portfolio presents authorized client accounts, producers, annual premium, risk tier, renewal timing, open claims, high-severity claims, overdue commitments, signals, and flags. Results are ranked by risk then renewal date. |
| BR-18 | Regional Leaders must be able to filter the portfolio by producer, risk tier, and renewal horizon. | `/portfolio` accepts `producer_id`, `risk_level` (`high`, `medium`, `low`), and `renewal_days` (0–3650; zero means no renewal-horizon filter). Producer selection outside the leader's portfolio is rejected. |
| BR-19 | Portfolio KPIs and renewal timeline must be calculated from the currently visible authorized accounts. | Totals include annual premium, premium at risk, renewals within 30 days, high-risk clients, open high-severity claims, and overdue commitments/clients. The timeline groups renewals into 0–30, 31–60, and 61–90 day buckets. |
| BR-20 | A Regional Leader must be able to open an account from the portfolio and return to the portfolio. | Selecting a client opens its producer-style account brief; the UI provides a return path to the regional portfolio. |

### Audit and operational behavior

| ID | Requirement | Acceptance criteria / implementation behavior |
|---|---|---|
| BR-21 | The API must record security-relevant access and authentication events. | Login, logout, failed login, access denial, account/brief reads, portfolio reads, and brief generation are written to security events as applicable. |
| BR-22 | Brief-generation usage must be auditable. | Generation records model, token counts, latency, cost, completeness status, user, account, persona, and version. |
| BR-23 | Authenticated users can retrieve aggregate and recent generation telemetry through the audit endpoint. | **API-only:** `GET /admin/audit` requires a valid session and returns generation count, token total, cost, average latency, and up to 50 recent audit rows. The route currently has no additional administrator-role authorization check, and the UI has no audit screen. |
| BR-24 | The business date and database location must be configurable for the API. | `MERIDIAN_AS_OF_DATE` controls deterministic date-based logic and `SQLITE_DB_PATH` selects the SQLite file. |

## Data and scope constraints

- The current seed data is synthetic. The codebase does not define production
  data ingestion or live synchronization with CRM, policy, billing, claims, or
  document systems.
- The SQLite schema contains account, user, policy, claim, billing, service,
  document, endorsement, activity, commitment, signal, evidence, access,
  contradiction, brief, and audit records.
- API startup defaults `RESET_DB_ON_START` to enabled, which recreates the
  synthetic database at startup. This is a demo default, not a safe production
  data-retention policy.
- The UI's API proxy is a Vite development configuration. The repository does
  not define production hosting, deployment, or ingress requirements.

## Source traceability

- UI workspace and interactions: [ProducerDashboard](../meridian-ui/src/ProducerDashboard.tsx), [RegionalDashboard](../meridian-ui/src/RegionalDashboard.tsx), [AccountDetailsPanel](../meridian-ui/src/AccountDetailsPanel.tsx), [App](../meridian-ui/src/App.tsx), and [API client](../meridian-ui/src/api.ts).
- API routes and persistence: [main.py](../meridian-api/main.py), [auth.py](../meridian-api/auth.py), [access.py](../meridian-api/access.py), and [portfolio.py](../meridian-api/portfolio.py).
- Intelligence and brief rules: [intelligence.py](../meridian-api/intelligence.py) and [agent.py](../meridian-api/agent.py).
- Schema and demo data: [SQLite schema and seed](../meridian-api/sql/meridian_schema_and_seed_sqlite.sql).
- Verified behavior: [workspace tests](../meridian-api/tests/test_workspaces.py) and [agent/scenario tests](../meridian-api/tests/test_agent_and_scenarios.py).
- Component and data flow: [solution architecture](./solution-architecture.md).
