# Editable diagrams

## End-to-end journey
```mermaid
flowchart LR
 A[Sign in and authorize] --> B[Select renewal/client]
 B --> C[Relational source snapshot]
 C --> D[Current rules and evidence]
 D --> E{Exact user/source cache?}
 E -->|yes| H[Verified preparation cards]
 E -->|no| F[Background structured AI]
 F --> G[Validate citations + claim narrative]
 G -->|valid| H
 G -->|unavailable/invalid| I[Labeled source-based fallback]
 I --> H
 H --> J[Human edits and approves/rejects]
 J --> K[Feedback + scoped audit]
```

## Application architecture
```mermaid
flowchart TB
 U[Producer / Regional Leader] --> W[React + TypeScript / TanStack Query]
 W --> A[FastAPI + Pydantic]
 A --> S[Session + CSRF + account/resource authorization]
 S --> R[Relational intelligence + evidence]
 R --> D[(SQLite source records)]
 R --> J[Bounded background job pool]
 J --> L[OpenAI SDK / configured compatible gateway]
 L --> V[Structured output / exact citations / claim completeness]
 V --> B[(Derived brief + usage audit)]
 J --> F[Deterministic fallback]
 F --> V
 S --> H[Pending action / approval / feedback]
 H --> D
 B --> W
```

## Logical ER model
```mermaid
erDiagram
 USERS ||--o{ ACCOUNTS : owns
 USERS ||--o{ ACCESS_RULES : grants
 ACCOUNTS ||--o{ ACCESS_RULES : protects
 ACCOUNTS ||--o{ CONTACTS : has
 ACCOUNTS ||--o{ POLICIES : covers
 POLICIES ||--o{ CLAIMS : records
 POLICIES ||--o{ BILLING : invoices
 POLICIES ||--o{ ENDORSEMENTS : changes
 POLICIES ||--o{ RENEWAL_MILESTONES : schedules
 ACCOUNTS ||--o{ ACTIVITIES : records
 ACCOUNTS ||--o{ SERVICE_CASES : serves
 ACCOUNTS ||--o{ DOCUMENTS : contains
 ACCOUNTS ||--o{ COMMITMENTS : promises
 ACCOUNTS ||--o{ SIGNALS : derives
 SIGNAL_RULES ||--o{ SIGNALS : informs
 SIGNALS ||--o{ EVIDENCE : supports
 ACCOUNTS ||--o{ CONTRADICTIONS : reconciles
 ACCOUNTS ||--o{ BRIEFS : prepares
 ACCOUNTS ||--o{ BRIEF_GENERATION_JOBS : queues
 ACCOUNTS ||--o{ CLIENT_ACTIONS : proposes
 ACCOUNTS ||--o{ CLIENT_FEEDBACK : reviews
 USERS ||--o{ AUDIT_LOG : creates
```

Evidence/timeline polymorphic references are service-resolved, not direct SQL foreign keys.
Action/feedback entities are the newly added runtime schema; focused verification is pending.
