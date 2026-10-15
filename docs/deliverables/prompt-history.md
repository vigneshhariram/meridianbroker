# Prompt and AI usage evidence

[prompt-register.csv](prompt-register.csv) records only evidence available in the current
conversation/repository. It is a bounded register, not a reconstructed complete development
history. Exact historical prompts, model identifiers, token counts, accepted/rejected outputs
and human review decisions were not consistently retained. Missing fields say not recorded.
No retrospective approval or fabricated prompt is attributed to a human.

Available sources include the preserved frontend prompt file, supplied Executive master prompt,
extracted six-page use case, current instructions, source changes, test files and reports.
Repository system prompts in agent.py describe application inference, not the developer's
complete SDLC prompt history. The delivered deck/documents were generated from a reproducible
script; reviewer acceptance remains pending.

For continued work append one immutable row per meaningful prompt/revision: timestamp,
tool/model, purpose, exact prompt/artifact reference, parent iteration, output artifact,
accepted/rejected/pending, validation performed, reviewer and measured tokens/cost when available.
Keep credentials and real customer data out of the register. Store prompt text separately
where event policy permits and use stable file/hash references. Deployment inference trace
and development prompt history must remain distinct.
