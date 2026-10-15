# Meridian Client Growth & Retention

An evidence-grounded Producer and Regional Leader workspace using synthetic insurance records. The primary regional experience prioritizes renewals, supports client review without inline leadership preparation cards. The Executive Dashboard derives its scoped metrics and real producer roster from SQLite, including explicitly labeled synthetic financial ledgers.

## Run locally

1. In `meridian-api`, copy `.env.example` to `.env`, configure the approved gateway key, and run `uv sync` followed by `uv run uvicorn main:app --host 127.0.0.1 --port 8000`.
2. In `meridian-ui`, run `npm.cmd install` and `npm.cmd run dev`. Optional `.env.example` configures the API proxy target. No model credentials belong in frontend configuration.
3. Use the existing synthetic demo sign-in. Backend demo credentials are enabled only when `DEMO_AUTH_ENABLED=1`; this is a local prototype, not an enterprise identity provider.

Normal backend startup retains source records, human review records and real audit events, while clearing generated briefs/jobs and restarting derived brief versions at 1. Do not run `init_db.py` against data you wish to retain. No database recreation is needed for the new workflow tables.

## Structure

| Location | Purpose |
|---|---|
| `meridian-ui/src/` | React workspace, reusable controls, client records, brief generation and controlled workflows |
| `meridian-api/` | FastAPI authentication, authorization, source intelligence, model adapter and background jobs |
| `meridian-api/workflows.py` | Source-based questions, saved actions/approval and correction feedback |
| `meridian-api/sql/` | Synthetic relational source schemas/seeds; generated examples are optional fixtures |
| `meridian-api/scripts/` | Optional read-only model benchmark; never runs during startup |
| `scripts/` | PDF extraction and supporting repository utilities |
| `docs/deliverables/` | Current requirements, architecture, user guide, traceability and demo package |
| `docs/presentation/` | Editable PowerPoint and reproducible presentation/package generator |
| `docs/validation/palette/` | Focused backend check record and UI previews; browser API responses are mocked |

## Current design and AI behavior

The supplied `color_palatte.png` defines white/pale surfaces, primary blue `#0052FF`, navy `#001F61` and dark ink `#000B24`. Shared tokens in `index.css` apply to both personas. See [the design system](docs/design-system.md) and [extracted use case](docs/use-case-extracted.md).

Source cards render before AI completes. A bounded, source-scoped background job uses Flash Lite, then GPT-4o, then a clearly labeled deterministic fallback. Open claims, source citations, contradictions and uncertain opportunities are checked. The Producer view no longer includes the question, action-review or feedback panels. Actions require a saved human decision and do not send messages, bind coverage or edit policy records. Corrections are recorded for review rather than silently changing sources.

Model costs are public list estimates, not gateway invoices; missing usage is explicitly unknown. [Google's pricing reference](https://ai.google.dev/gemini-api/docs/pricing) supports the Gemini estimate inputs. Accessibility decisions follow [W3C contrast guidance](https://www.w3.org/WAI/WCAG21/Understanding/non-text-contrast.html); authorization reuses [FastAPI dependencies](https://fastapi.tiangolo.com/tutorial/dependencies/). The supplied palette takes precedence over visual assumptions from [HUB](https://www.hubinternational.com/en-us/).

Historical reports and screenshots remain available for traceability; their status descriptions may predate the current implementation. This prototype supports two implemented personas, a single API worker service and synthetic data only. Account-executive/service-leader experiences, distributed job ownership and enterprise SSO remain deployment extensions.

Latest dashboard/retrieval implementation: [grounded SQLite dashboard](docs/grounded-dashboard.md). Presentations can be viewed without Office as [HTML](docs/presentation/meridian-solution.html) or [PDF](docs/presentation/meridian-solution.pdf).
