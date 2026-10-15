# Compact workspaces and reliable client intelligence

This update continues the [frontend overhaul](frontend-overhaul.md) and supersedes its AI-loading limitations. Visual reference: [HUB International](https://www.hubinternational.com/en-us/).

## Experience

- Reviewed the shared controls, cards, navigation, tables, drawers, forms and responsive layouts. Reduced unnecessary panel padding and gaps, compacted snapshot headers and table rows, and stopped short content cards stretching to the height of much longer neighbors.
- Navy provides structure and primary actions; cerulean marks focus and highlights; porcelain surfaces and pale blue selection states maintain contrast. Desktop controls are 36px, with 40px touch controls. Spacing follows a 4px sub-grid. Skeletons and subtle hover effects respect reduced-motion preferences.
- Regional clients open in a searchable card view with risk, premium, renewal, signal confidence and direct brief access. A labeled view switch retains the sortable, searchable, paginated table.
- The client workspace shows current operational cards and a source-based summary immediately. Missing or stale AI synthesis starts automatically for the selected client. During regeneration, source cards remain usable while actual job phases report collection, synthesis and validation.
- Provenance distinguishes source-based preparation, saved AI, newly generated AI and a source-based fallback. A fallback never claims that a provider generated its text. Claims coverage reflects current accessible records rather than a historical flag.
- Citation controls open evidence inspection. Suggested actions open an editable, validated draft that the user can review and copy into their normal workflow. The application does not send or assign these local drafts.

## AI integration

`GET /accounts/{id}/brief` returns current authorized records with `generation` metadata: mode, freshness, explanation, source fingerprint and generation timestamp. Old seeded narratives and telemetry are not presented as current AI output. A stored synthesis can be reused only for the exact user and current source/permission fingerprint, including when another user has a newer brief for the same persona.

The UI uses `POST /accounts/{id}/brief/jobs` with `{force: false}` for automatic preparation and `{force: true}` for an explicit regeneration. `GET /accounts/{id}/brief/jobs/{job_id}` reports `queued`, `running`, `succeeded` or `failed`, the current phase and a validated result. Polling is account-scoped, reconnectable and authorized on every request. In-flight requests are deduplicated; completed fresh results are reused. UI errors stay with the client that produced them.

Generation runs in a bounded local pool of two workers, with at most eight active/queued jobs. SQLite persists job state and brief history. Startup marks interrupted work as retryable rather than leaving it permanently running. Database reset is now opt-in. The legacy synchronous generation endpoint remains compatible.

The provider pipeline uses the existing configured gateway and structured Pydantic output. Gemini 2.5 Flash Lite is the primary model, followed by GPT-4o and deterministic source-based fallback. Measured Pinecrest structured-brief latency was 2.93s for Flash Lite and 5.37s for GPT-4o; these are single observations, not latency guarantees. Provider request timeout is 10s and the shared generation budget is 22s; browser requests time out at 30s. SDK retries are disabled, request timeouts share an overall deadline, and only configured primary/fallback models are called. TLS verification defaults on. Client text is treated as untrusted context; citations must resolve to accessible source identifiers, and every open claim requires substantive narrative coverage and a citation. Risk, overdue records, pending endorsements and open service cases come from current data.

Local fallback has zero invented tokens. If an earlier provider attempt consumed measurable tokens, those actual tokens remain in telemetry. Audit access is scoped to the requesting producer or authorized regional accounts. Source changes during generation suppress stale synthesis from the returned brief.

This worker model suits the current single API process. A deployment with multiple independent API services should use a shared worker queue with explicit job ownership rather than treating the in-process pool as a distributed scheduler. Browser refresh or changing clients does not cancel a job already accepted by the server.

## Validation

A previous controlled check of the configured `genailab-maas-gpt-4o` gateway returned structured output and passed claim completeness in **4.05 seconds**. The latest small structured-response connection probes passed for `gemini-2.5-pro` in **3.39 seconds** and `gemini-2.5-flash` in **1.18 seconds**. These probes did not write to the application database and do not establish full client-brief correctness. No test suite was run for the latest selection, validation and seed corrections, as requested.

Before the final citation/layout edits, lint, TypeScript and production build passed; all 28 backend tests passed, and browser checks covered cards, loading, generation retry/progress, account switching, citation focus and action drafts. Final citation resolution now loads permitted source collections and resolves displayed claim/policy numbers to their underlying records. Risk and opportunity panels use compact two-column signal lists to remove the remaining unequal-column gap.

At the user's request, tests and additional validation were not rerun after these final edits. Existing previews are in [validation/hub-refresh](validation/hub-refresh/); they precede the final citation/layout refinements.

Implementation references: [OpenAI Python SDK retry and timeout configuration](https://github.com/openai/openai-python#retries), [HUB visual reference](https://www.hubinternational.com/en-us/).

Startup data separation: source SQL seeds contain no AI narratives or fabricated generation audit rows. Optional legacy scenarios live in `meridian-api/sql/fixtures/`. Every backend startup clears runtime briefs and jobs, so the next generated brief starts at version 1. Known legacy fixture audit rows are removed; real usage audit records remain. A removed job returns 404 and the UI stops polling, refreshes source data and offers regeneration. These latest changes were reviewed without running tests, as requested.
