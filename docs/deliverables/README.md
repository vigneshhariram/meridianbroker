> Current UI: Producer question, action-review and brief-feedback panels have been removed. Drafts support editing and manual copying only. Earlier screenshots/demo steps for those controls are historical; backend APIs remain separate from the current UI.

> Current update: the Executive Dashboard now uses authorized SQLite records and a strict retrieval contract. See [the implementation note](../grounded-dashboard.md). Earlier fixture descriptions below are historical.

# Meridian delivery package

Prepared 15 October 2026 against the six-page [source use case](../use-case-extracted.md).
Meridian is fictional; all account, carrier, policy, people and financial examples are synthetic.

| Required deliverable | Artifact |
|---|---|
| 1. Functional requirements | [Requirements and acceptance criteria](requirements.md) |
| 2. Architecture | [Architecture, integration, deployment and controls](architecture.md) |
| 3. Database design | [Logical/physical data model](data-model.md), [field dictionary](data-dictionary.csv), [ER source](diagrams.md) |
| 4. UI/UX design | [Journey, screen inventory and design contract](ux-and-user-guide.md); [current mocked-browser previews](../validation/grounding/) |
| 5. Runnable software | [UI setup](../../meridian-ui/README.md), [API setup](../../meridian-api/README.md), source directories and SQL seed |
| 6. Test scripts | [Functional/non-functional test inventory](tests.csv) |
| 7. Traceability | [Requirement-to-code/test/demo mapping](traceability.csv) |
| 8. End-user manual | [Persona guidance, workflows and troubleshooting](ux-and-user-guide.md) |
| 9. Integrated AI agent | [Agent contract and safeguards](agent-and-governance.md); [agent source](../../meridian-api/agent.py) |
| 10. Prompt register | [Evidence-bounded prompt/AI usage register](prompt-register.csv), [history limitations](prompt-history.md) |
| 11. Tokenomics | [Observed measurements and scenario projections](tokenomics.md) |
| 12. Demo package | [Eight-minute demo and two-minute value statement](demo.md), [editable PowerPoint](../presentation/meridian-solution.pptx) |

The deck uses native editable PowerPoint shapes, text and vector-style icons. Architecture,
journey and ER figures also have [Mermaid sources](diagrams.md) and [standalone SVGs](../presentation/assets/).

## Evidence and status

This package distinguishes implemented code, historical observations and planned verification.
An earlier isolated suite passed 28 API tests; screenshots and axe artifacts describe earlier
UI revisions. Eight later focused backend checks passed in an isolated in-memory database
([record](../validation/grounding/backend-checks.json)); final UI lint, typecheck and build passed.
The latest palette, lifecycle, regional portfolio navigation and workflow changes have not received a
complete regression run. See each row in tests.csv. No live application database was started
or changed to create these documents or slides.

Only Producer and Regional Leader personas are implemented. Account Executive and Service
Leader views remain future scope. Business outcomes are hypotheses for a pilot, not proven
retention, revenue, preparation-time or ROI results. Executive agency-wide figures are an
isolated screenshot fixture, not aggregates from the client database.

When older reports conflict, use current source code and this package's explicit status notes.
The [historical alignment assessment](../use-case-alignment-review.md) is not a current score.
See [verification evidence](verification-evidence.md) for the latest focused API and mocked-UI checks.
