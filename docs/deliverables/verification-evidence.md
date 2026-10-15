# Evidence ledger

The final focused backend record also contains three additional edge checks: blank/whitespace
structured summaries are rejected, deterministic overdue wording handles negative days, and
a stale draft is rejected on submission with409 before persistence. These supplement the
eight workflow/security checks below; they are not a full regression suite.

| Evidence | Observation | Practical limit |
|---|---|---|
| Earlier isolated API run | 28 unittest cases passed | Predates final lifecycle/palette/workflow changes; not a final full regression claim |
| [Latest focused backend record](../validation/grounding/backend-checks.json) | Eight checks: source seed separation; Pinecrest offline completeness; three source-answer topics; cross-client denial; action create/approve; duplicate/stale409; correction201/422; Producer executive/cross-region denial | Isolated in-memory data; source DROP statements excluded; no app startup/live database; not full suite |
| Frontend quality gates, reported in current integration work | ESLint, TypeScript and production build passed | Build success is not end-to-end behaviour validation |
| [Regional desktop](../validation/grounding/retired UI capture), [mobile](../validation/grounding/regional-mobile.png) | Mocked-browser checks covered default regional portfolio, Pinecrest selection/inline preparation, selected-client question, approval submission/decision, correction and no 390px document overflow | Browser API responses were mocked; real provider/combined API-to-browser flow not validated here |
| [Executive desktop](../validation/grounding/executive-desktop.png), [mobile](../validation/grounding/executive-mobile.png) | Light palette and responsive Executive view captured | Agency metrics are an isolated screenshot fixture, not production or client-derived KPIs |
| [Historical axe/browser artifacts](../validation/hub-refresh/) | Earlier source cards, loading/progress/retry, records, keyboard, drafts, mobile and PDF previews | Predate some final changes; automated checks do not certify accessibility |
| [Five-model Pinecrest benchmark](../validation/pinecrest-model-benchmark.json) | One request/model with observed elapsed time and total tokens; Flash Lite pipeline confirmation3.82s without fallback | No prompt/completion split or billed cost; not a distribution/SLA; no new provider calls for this package |
| [Presentation artifact check](../presentation/artifact-check.json) | Fourteen slides, editable native shapes; opens with python-pptx; all shape bounds within slide | This is document validation, not actual Office rendering certification |

No new application test suite, provider call or application database startup was performed
to generate the deliverable package. Full integrated regression, load/p95 benchmarks,
screen-reader evaluation and business KPI validation remain unperformed for the latest revision.
