# Meridian Broker Solution Architecture

This diagram reflects the current API and UI implementation. The Vite proxy shown
below is for local development; production hosting and ingress are not defined by
the repository.

```mermaid
flowchart LR
    producer["Producer"]
    leader["Regional Leader"]

    subgraph ui["Web UI - meridian-ui"]
        browser["Browser"]
        vite["Vite dev server<br/>React + TypeScript"]
        proxy["Development API proxy<br/>/auth, /accounts, /portfolio"]
        app["App/session coordination"]
        signin["SignIn"]
        producerDash["ProducerDashboard<br/>Account brief and record details"]
        regionalDash["RegionalDashboard<br/>Portfolio filters and metrics"]
        query["API client + React Query<br/>Cookie credentials + CSRF header"]

        browser --> vite
        vite --> app
        app --> signin
        app --> producerDash
        app --> regionalDash
        signin --> query
        producerDash --> query
        regionalDash --> query
        query --> vite
        vite --> proxy
    end

    subgraph api["API - meridian-api"]
        fastapi["FastAPI application<br/>CORS + request/response models"]
        auth["AuthService<br/>Login, session, logout"]
        guard["Session, CSRF and access checks<br/>Producer or regional scope"]
        endpoints["Account and portfolio routes<br/>Records, briefs, metrics"]
        rules["Intelligence rules<br/>Signals, evidence, conflicts"]
        portfolio["Regional portfolio aggregation"]
        briefAgent["ClientIntelligenceAgent<br/>Structured brief + completeness check"]

        fastapi --> auth
        fastapi --> guard
        guard --> endpoints
        endpoints --> rules
        endpoints --> portfolio
        endpoints --> briefAgent
        portfolio --> rules
    end

    subgraph storage["SQLite - meridian.db"]
        authData[("Auth and audit tables<br/>users, auth_credentials, auth_sessions,<br/>login_failures, security_events, audit_log")]
        businessData[("Brokerage data and configuration<br/>accounts, contacts, policies, claims,<br/>billing, service cases, documents,<br/>endorsements, commitments, signals,<br/>evidence, access rules and brief history")]
    end

    llm["Configured LiteLLM-compatible gateway<br/>Primary model, then fallback model"]
    deterministic["Deterministic local brief fallback"]

    producer --> browser
    leader --> browser
    proxy --> fastapi
    auth --> authData
    guard --> authData
    guard --> businessData
    endpoints --> businessData
    rules --> businessData
    portfolio --> businessData
    briefAgent --> businessData
    briefAgent -->|"Brief generation"| llm
    llm -->|"Structured model response"| briefAgent
    briefAgent -. "Gateway unavailable" .-> deterministic
    deterministic --> briefAgent
    briefAgent -->|"Persist generated brief and telemetry"| businessData
```

## Request and data flow

- The UI restores a cookie-backed session on startup. Sign-in and sign-out use
  `/auth/login` and `/auth/logout`; mutating requests include the session's CSRF
  token. A `401` on a protected request clears the UI session and cached data.
- Producers receive accounts in their assigned book. Regional leaders can read
  authorized accounts in their region and use `/portfolio` to filter and
  aggregate renewal, risk, claim, and commitment data.
- Account record endpoints and briefs are protected by both session checks and
  account/resource access rules. The API applies the same authorization scope
  when it builds account intelligence and portfolio aggregates.
- A regular brief read combines persisted broker data with rule-derived signals,
  supporting evidence, renewal milestones, and the latest generated brief.
  Generating a brief additionally calls the configured LLM gateway, checks
  structured output for completeness, persists the result and telemetry, and
  falls back to deterministic local generation if the gateway is unavailable.
- The API initializes synthetic SQLite data at startup according to
  `RESET_DB_ON_START`; security tables are initialized without resetting
  existing business data when needed.
