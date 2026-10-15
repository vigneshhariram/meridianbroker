# Enterprise frontend overhaul

For the subsequent density, card-view and background-generation implementation, see the
[compact workspace and AI integration report](hub-refresh-and-ai.md). Its AI behavior and
backend changes supersede the limitations recorded below.

## Evidence and scope

Audit date: 2026-10-15. Source: `gemini-code-1792039409146.md`.

The running application is React 19 / TypeScript / Vite with TanStack Query and plain CSS. Tailwind is installed but was not connected to Vite. FastAPI uses SQLite; `main.py` is the route manifest, `models.py` defines response contracts, `access.py` applies account/resource authorization, `intelligence.py` computes live signals, and `portfolio.py` aggregates authorized regional accounts. Authentication uses revocable HttpOnly cookies and CSRF tokens.

The SQLite seed contains ten accounts, eighteen policies, nine claims, eight service cases, documents, billing, endorsements, activities, commitments, milestones, timeline events, thirty-three curated signals, thirty-six evidence records, contradictions, briefs, source reliability, recency bands, access rules and generation telemetry. The PostgreSQL script is an alternative seed, not the runtime database. The scenario date is 2026-10-08; dates must come from the API rather than the browser clock.

Implemented routes: `/auth/login`, `/auth/session`, `/auth/logout`, `/accounts`, `/accounts/{id}/brief`, `/accounts/{id}/brief/generate`, five account resource collections, `/portfolio`, and `/admin/audit`. Earlier documentation describes actions, feedback and copilot endpoints that do not exist in the current route implementation. This overhaul does not invent successful mutations for those endpoints.

## Findings and upgrades

| Evidence | Resulting change |
| --- | --- |
| Regional account data includes flags, workloads, risk distribution, open claims/cases and renewal buckets | Surface these metrics with consistent filtered totals and searchable, sortable, paginated tables |
| Resource endpoints return complete records, while document text is truncated and policy CRM dates are absent from frontend types | Add shared record inspection sheets and expose full permitted content, source dates, reserves and policy/CRM discrepancies |
| Service cases contain `policy_id` and satisfy the existing `isPolicy` guard | Replace ambiguous guards with discriminated record normalization |
| Opportunity signals have `is_fact=false`, assumptions and confidence evidence | Derive fact/hypothesis labels from data and expose supporting evidence with an accessible accordion |
| Producer client search matches only names | Add industry/location matching, risk filters and renewal windows using returned account fields |
| Sign-in and toolbar controls are bespoke; detail tabs lack tab keyboard semantics | Standardize Radix primitives, React Hook Form/Zod, and TanStack Table |
| Stored AI narratives can contain amounts that differ from current account records | Present current operational figures separately and clearly identify stored synthesis/version/date; preserve returned narrative rather than silently rewriting it |
| Styles contain accumulated overrides, arbitrary spacing and low-contrast metadata | Replace styles with centralized tokens, 4/8-point spacing, 40px controls, tabular numbers and responsive aligned grids |

## Component manifest

Refactor `App.tsx`, `Header.tsx`, `SignIn.tsx`, `RegionalDashboard.tsx`, `ProducerDashboard.tsx`, `AccountDetailsPanel.tsx`, `ClientOverviewPanel.tsx`, `AiBriefPanel.tsx`, and `PrintableOnePageBrief.tsx`; replace `index.css`, `App.css`, `RegionalDashboard.css`, and `SignIn.css`. Add shared `components/ui.tsx`, `components/DataTable.tsx`, `components/RecordSheet.tsx`, `components/ErrorBoundary.tsx`, and utilities. Update `types.ts`, Vite configuration, dependencies and browser verification.

## Design and accessibility

Use shadcn-style source-owned components backed by Radix UI and Tailwind, Lucide icons, TanStack Table, React Hook Form/Zod and Sonner. Reference: [HUB International](https://www.hubinternational.com/en-us/). Preserve Meridian's fictional identity. All theme colors live in the root stylesheet. Primary navy `#012254`, action blue `#0065FF`, accent/focus `#00ADEF`, white panels and porcelain canvas. White on `#0065FF` must be measured rather than assumed to satisfy 4.5:1; use a darker action token if necessary. Soft semantic badge borders are decorative; interactive boundaries use a separate high-contrast token.

Provide semantic landmarks, a skip link, labeled controls, focus outlines, roving tab behavior, focus-trapped sheets, Escape dismissal, sorting announcements and keyboard table-row navigation. Automated browser/axe checks supplement manual keyboard checks; they do not certify WCAG conformance.

## Verification

Completed on 2026-10-15:

| Gate | Result |
| --- | --- |
| ESLint | Passed |
| TypeScript (`tsc --noEmit -p tsconfig.app.json`; project references in build) | Passed |
| Production build | Passed; lazy workspace chunks; largest JavaScript chunk approximately 271 kB minified, with no chunk-size warnings |
| Backend regressions | All 18 tests passed against isolated in-memory databases, with remote model calls stubbed to exercise the deterministic fallback |
| Browser workflows | Passed in headless Microsoft Edge: all three roles, form validation, server errors, scoped filters, numeric sorting, pagination, search reset, column visibility, record drawers, source conflicts, full documents, regeneration, session restore, logout and denied resources |
| Keyboard checks | Passed: row arrows, tab arrows, drawer focus trapping, Escape dismissal and focus return to the opening control |
| Responsive checks | Sign-in, regional portfolio and producer workspace fit a 390px viewport without document-level horizontal overflow; tables and tabs scroll within their containers |
| PDF | Generated Horizon brief occupies exactly one Letter page, without content clipping rules |
| Axe | Zero detected violations across 11 views, using WCAG 2 A/AA, 2.1 AA, 2.2 AA and best-practice tags |
| Source scan | No raw button/input/select/textarea JSX outside the shared primitives, and no hardcoded hex colors outside root tokens in active TS/TSX/CSS |

Measured contrast ratios: white/action blue **4.88:1**, primary ink/white **19.35:1**, body/white **14.69:1**, muted/white **5.90:1**, control border/white **3.65:1**. Semantic text/surface pairs: success **6.83:1**, warning **5.20:1**, critical **6.05:1**. Cerulean focus outlines have an additional navy ring to provide a contrasting edge.

Browser testing found and resolved a missing access-status landmark, table cell remounts breaking focus restoration, implicit grid tracks overflowing on mobile, and toast fade opacity reducing text contrast. TanStack Table is pinned to v8 because the package registry's default v9 has a different API. Toasts now use the same palette and render without fade animations.

Automated checks do not certify WCAG conformance. Axe reports manual-review items for transparent sheets/evidence views; screen-reader and assistive-technology testing remains a release consideration. Remote gateway generation was not exercised in this offline verification. Existing stored synthesis may differ from live operational records; its date/version is shown explicitly. No backend schema, access policy, seed content or existing database was changed.

Artifacts: [axe results](validation/enterprise/accessibility.json), [regional desktop](validation/enterprise/regional-dashboard.png), [regional mobile](validation/enterprise/regional-dashboard-mobile.png), [producer desktop](validation/enterprise/producer-dashboard.png), [producer mobile](validation/enterprise/producer-dashboard-mobile.png), [sign-in](validation/enterprise/sign-in.png), [one-page PDF](validation/enterprise/client-brief.pdf).

Repeatable browser instructions are in the UI README. `tests/serve_fixture.py` creates a temporary SQLite database and disables remote generation only in the test process. Restart it before repeating the mutation workflow. The user's existing database is never reset by these checks.
