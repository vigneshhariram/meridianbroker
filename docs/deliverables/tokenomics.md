# Tokenomics and model economics

## Observed evidence, not benchmarks

The [Pinecrest model benchmark](../validation/pinecrest-model-benchmark.json), measured
15 October 2026 at06:23:55UTC against synthetic accountA03/business date2026-10-08, records
one structured source-grounded request per model, without repair or fallback, using two
concurrent workers and a read-only database. All five recorded requests passed:

| Model | Observed elapsed time | Observed total tokens |
|---|---:|---:|
| genailab-maas-gpt-35-turbo | 8.08s | 2,328 |
| genailab-maas-gpt-4o | 5.37s | 2,313 |
| gemini-2.5-pro | 17.59s | 3,708 |
| gemini-2.5-flash | 9.77s | 3,275 |
| gemini-2.5-flash-lite | 2.93s | 2,663 |

The same artifact records a separate selected-pipeline confirmation: Flash Lite passed in
**3.82s** without fallback. These single observations have no sample distribution or
production SLA. Concurrent execution may affect elapsed times; the17.59s Pro observation
is not proof that it meets the selected10s request limit. Small earlier connection probes
in the [integration report](../hub-refresh-and-ai.md) are different workloads and must not be
substituted for the full structured-request measurements above.

No new provider call was made for this delivery package. The benchmark records total tokens,
but does not record the prompt/completion split or gateway billed cost. Exact per-call
price estimates and billed costs cannot be reconstructed from those totals alone and are
not invented here. The scaled examples below use explicit assumptions instead.

Current generation audit stores model, input/output/total tokens, latency, estimated USD cost,
account, persona and completeness. Local generation has zero model tokens unless an earlier
provider attempt has known measured consumption. Unknown consumption/cost must remain unknown.
Configured public-list estimates are not the enterprise gateway invoice. Cost_basis/cost_known
metadata identifies estimate provenance and unknown cost; verify the final response before
reporting totals externally.

## Model rationale and controls

Use a fast lower-cost model for structured source-constrained preparation; reserve the configured
fallback for failed/invalid output. Choose on measured completeness, citation validity, latency
and cost—not model prestige. Exact source-scoped cache hits and duplicate suppression avoid
unnecessary calls. Provider request timeout defaults to 10s, shared budget 22s, browser 30s;
two workers and eight active jobs bound local concurrency. These controls are implemented
design limits, not a capacity benchmark. Business context is relational and bounded; no
embedding/vector-store expense is present.

## Illustrative scaled scenario

Assumptions only: 1,000 input + 500 output tokens per remote brief; implementation-configured
Flash Lite estimate $0.10/$0.40 per million input/output tokens; fallback estimate $5/$15 per
million. These are static code estimates for illustration, not freshly verified prices,
procurement advice or a quote. Taxes, gateway fees, hosting and operational labour are excluded.

| Scenario | Calculation | Estimated model cost |
|---|---|---:|
| One primary call | 1,000×0.10/1M + 500×0.40/1M | $0.00030 |
| 10,000 primary calls | 10,000×0.00030 | $3.00 |
| 100,000 primary calls | 100,000×0.00030 | $30.00 |
| 10% additional fallback calls | 0.00030 + 0.10×(1,000×5/1M + 500×15/1M) | $0.00155 per request |
| 100,000 requests, 40% exact cache hits, above fallback rate | 100,000×0.60×0.00155 | $93.00 |

Fallback rates and cache-hit rates are assumptions, not observations. Prompt/correction retries,
thinking-token accounting and provider failure billing can change actual cost. Preserve known
attempt usage; do not assign artificial zero usage to an unknown charged response.

## Pilot measurement plan

Record first-load-to-usable-source time, provider/total preparation latency p50/p95, exact-cache
hit rate, fallback/error rate, token distribution, citation validity, claim-completeness failures,
feedback decisions and cost per accepted useful brief. Compare preparation time with a timed
manual baseline. Track renewal conversations and service follow-through before considering
retention/revenue effects. No retention lift, revenue lift or labour savings is established.
