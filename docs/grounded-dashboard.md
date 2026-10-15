# SQLite dashboard and retrieval contracts

The Executive Dashboard now reads the authenticated user's authorized SQLite accounts, policies, producers and financial records. The screenshot fixture and invented producer/carrier roster have been removed from its implementation. The existing source seed has ten clients and two producers; the Midwest leader sees nine permitted clients, Jordan Davis and Priya Nair, and $5.44M annual account premium. Restricted clients do not contribute to metrics.

Financial facts are isolated in `policy_financial_months` and `renewal_outcomes`. Fresh SQLite/PostgreSQL scripts and an idempotent additive SQLite upgrade use the same rules and existing source identities. Demo financial assumptions—12% commission, 35% paid-loss allocation, and retained prior renewal outcomes—are explicitly synthetic and disclosed by the API/UI. They are not verified operating results. Existing financial rows are never overwritten. Dates and reporting windows use the configured synthetic business clock. Undefined measures are null, not fabricated percentages; historical comparisons are omitted without comparable records.

Premium uses account annual premium; line/carrier charts use accessible active policy premium. These are different bases and are explained in the dashboard. Commission/loss calculations enforce policy, billing and claim permissions independently. Producer rows, carriers and months render dynamically, including zero/empty/missing results. Backend Pydantic models and frontend Zod contracts forbid unknown fields and reject invalid payloads.

## Grounding layer

`retrieval.py` reads a fresh permission-filtered snapshot of the selected client's original relational source tables. A request-local SQLite FTS5 index ranks those records; lexical ranking handles SQLite installations without FTS5. This is keyword RAG, not a semantic vector database. Source identifiers, excerpts, content hashes, snapshot hashes and retrieval counts accompany each answer. Every accessible open claim is retained even when ranking would omit it. No persistent derived index can outlive a source or permission change.

The configured AI models receive the retrieved context with an evidence-only structured-output prompt. Citation references must resolve to that context; failures produce a labeled source-based response. The main brief also receives retrieved document/activity context while preserving all structured open claims. Financial ledger aggregates remain authoritative through the dashboard API; the selected-client copilot currently retrieves the original client source tables rather than claiming to calculate portfolio financial analytics. Input questions are bounded, typed and account-scoped. Client code validates the answer contract and source account before rendering it and exposes the retrieved source snapshot in a record drawer.

The implementation follows [SQLite FTS5](https://www.sqlite.org/fts5.html) for keyword indexing and [Pydantic strict validation](https://docs.pydantic.dev/latest/concepts/strict_mode/) for typed boundaries. Neither format validation nor citations prove every generated sentence; human source review remains required.

## Focused verification

An isolated in-memory database confirmed authorized counts/premium/producer names, four actual carriers, idempotent financial seeds, real FTS5 retrieval, canonical same-client citations, strict invalid-input rejection, restricted-client denial, source-edit fingerprint changes and Producer dashboard denial. AI calls were mocked for those checks; the live application database and startup lifecycle were not run. UI TypeScript/build and lint passed. Response examples are in `docs/validation/grounding/`.

Open the presentation without Office using [HTML](presentation/meridian-solution.html) or [PDF](presentation/meridian-solution.pdf). The [PowerPoint](presentation/meridian-solution.pptx) remains an optional editable source.

A single bounded live Pinecrest retrieval probe also succeeded: configured GPT-4o, SQLite FTS5, eight retrieved records, canonical C05/E05 citations, 1,460 tokens and 2.37 seconds. This is one observation, not a latency guarantee. See `docs/validation/grounding/live-pinecrest.json`. A desktop/mobile browser check rendered the actual strict executive response with two producer rows and nine authorized clients without page overflow; transport was mocked.
