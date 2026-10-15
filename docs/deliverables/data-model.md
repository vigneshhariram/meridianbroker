# Relational data design

Physical source: [SQLite schema and seed](../../meridian-api/sql/meridian_schema_and_seed_sqlite.sql).
The [field dictionary](data-dictionary.csv) is extracted from repository DDL, without opening
the application database. It includes source and runtime tables detected at package generation.
See [ER diagram](../presentation/assets/data-er.svg) and [editable Mermaid](diagrams.md).

## Logical model

Users own accounts; accounts contain contacts, policies and source interactions. Policies
relate to claims, invoices, endorsements and renewal milestones. Activities, service cases,
documents and commitments form relationship context. Signals join rules and evidence;
evidence references a source table/ID. Contradictions retain both source values. Access
rules join users/accounts and record-category permissions. Generated briefs, generation
jobs and audit rows are derived runtime records. Pending client actions and feedback are
governed user/account records, separate from source policy changes.

## Physical design and invariants

- Text primary identifiers match source records; monetary fields use NUMERIC and dates
  are ISO dates. SQL foreign keys establish account/policy ownership. Enable SQLite foreign
  keys on every connection. Indexes cover account/renewal, claim status, account/signal and
  signal/evidence reads.
- Some references (evidence.source_table/source_id and timeline.ref_table/ref_id) are
  polymorphic rather than database foreign keys. The service resolves them only against
  accessible records for the selected account; unresolved evidence is excluded.
- accounts.risk_level is a source/cache field; runtime intelligence recomputes the displayed
  risk. Severity, evidence confidence and opportunity hypotheses are separate concepts.
- briefs.content_json is derived structured output, not the primary input store. Its
  generation scope contains user and current source/permission fingerprint. A matching
  historical cache can be reused even when another user has a newer persona version.
- brief_generation_jobs has a partial unique index for active user/account/persona/snapshot
  work. The local executor is not a distributed queue.
- Authentication uses salted password hashes and hashed session tokens; no secret values
  belong in this dictionary. Action approval must validate account/user, decision state and
  source fingerprint. Corrected feedback requires meaningful correction text.

## Repeatable synthetic data

Source SQL explicitly seeds ten fictional clients, two producers and a regional leader,
with policies, claims, service, activity, billing, documents and governance examples. The
business clock defaults to 2026-10-08. Optional legacy generated narratives/audit scenarios
are isolated under sql/fixtures and do not load as current AI output. Current startup clears
derived briefs/jobs while preserving source rows and real audit history. Never reset a user's
database to apply a presentation or styling change.

Mandatory demonstrations use Horizon's CLM-88410, Riverside's conflicting renewal dates,
Cedar's low-confidence opportunity and Harbor's restricted documents. A judge can insert
a synthetic claim/date conflict into an isolated demo database; subsequent source intelligence
must reflect it without changing core code. No ingestion from live enterprise systems exists.
