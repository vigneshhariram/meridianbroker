# Meridian UI

Meridian UI is the React and TypeScript web client for the Meridian Brokerage
Group account dashboard (Client Growth & Retention Cockpit). It is built with Vite.

## Prerequisites

- Git
- Node.js **20.19+** or **22.12+**
- npm (included with Node.js)
- Python 3.12+ (and `uv`) to run the backend API

Check that Node.js and npm are available:

```powershell
node --version
npm.cmd --version
```

## Install

From a terminal, navigate to `meridian-ui` and install the dependencies:

```powershell
cd meridian-ui
npm.cmd install
```

Keep `package.json` and `package-lock.json` checked in; do not check in `node_modules`.

## Start the Application

The API and UI run as separate processes. Start the API first, then start the UI.

### 1. Start the API (`meridian-api`)

In a new terminal:

```powershell
cd meridian-api
uv sync
uv run uvicorn main:app --reload --port 8000
```

### 2. Start the UI (`meridian-ui`)

In a separate terminal:

```powershell
cd meridian-ui
npm.cmd run dev
```

Open the URL printed by Vite, typically <http://localhost:5173/>.

Vite proxies `/auth`, `/accounts`, and `/portfolio` requests to `http://127.0.0.1:8000` as configured in `vite.config.ts`. Keep the API running on port `8000` for these requests to work.

## Other commands

Run these commands from `meridian-ui`:

```powershell
npm.cmd run build         # Type-check and create a production build in dist/
npm.cmd run lint          # Run ESLint checks
npm.cmd run lint:fix      # Automatically fix ESLint issues
npm.cmd run format        # Format code using Prettier
npm.cmd run format:check  # Verify code formatting with Prettier
npm.cmd run preview       # Preview the production build locally (run build first)
```

## Project layout

```text
meridian-ui/
├── public/          # Static public assets
├── src/             # React application, components, and styles
│   ├── App.tsx      # Cockpit dashboard implementation
│   ├── App.css      # Cockpit layout and styles
│   └── main.tsx     # Application root
├── index.html       # Vite HTML entry point
├── package.json     # Dependencies and npm scripts
└── vite.config.ts   # Vite configuration and local API proxy
```

## Authenticated workspaces

Credentials determine the workspace: producers see their own book; regional leaders see their authorized regional portfolio. The UI restores valid sessions and revokes them on sign-out. Vite also proxies `/auth`; an optional `MERIDIAN_API_TARGET` environment variable overrides the default API URL for isolated verification.

See [regional dashboard implementation](../docs/regional-dashboard-implementation.md) for synthetic login accounts, dashboard behavior, API/data details, and test instructions.

## Enterprise component system and verification

The latest [compact workspace and AI integration report](../docs/hub-refresh-and-ai.md) covers
the card view, denser layouts, automatic preparation on client load, persistent background
generation, scoped caching, progress, retry, provenance and editable action drafts.

The UI uses source-owned shadcn-style Radix components, Tailwind CSS, Lucide, TanStack Table v8, React Hook Form/Zod, and Sonner. The shared theme supplies navy/cerulean colors, 40px controls, accessible focus rings, tabular numerals and responsive grids. Regional and resource tables support search, sorting, pagination, column visibility and keyboard row navigation. Source records open in focus-trapped inspection sheets. The client workspace includes risk/renewal filters and evidence/confidence inspection.

See [frontend audit and verification](../docs/frontend-overhaul.md) for the current route manifest, implementation details, screenshots and limitations. This manifest takes precedence over older documentation describing routes absent from the current backend.

Run `npm.cmd run typecheck`, `npm.cmd run lint`, and `npm.cmd run build` for the frontend quality gate.

Browser verification requires Python packages `playwright` and `pypdf`, Microsoft Edge, and the npm development dependencies (including `axe-core`). It uses a temporary database and the existing deterministic generation fallback; it does not call the configured LLM gateway. Start the fixture in one terminal:

```powershell
cd meridian-ui
npm.cmd run test:fixture
```

Start Vite against that fixture in a second terminal:

```powershell
cd meridian-ui
$env:MERIDIAN_API_TARGET = 'http://127.0.0.1:8011'
npm.cmd run dev -- --host 127.0.0.1 --port 5174 --strictPort
```

Run the browser suite in a third terminal:

```powershell
cd meridian-ui
npm.cmd run test:browser -- --url http://127.0.0.1:5174 --output ../docs/validation/enterprise
```

Restart the fixture before repeating the suite so the omission scenario starts from its original seed state. Stop both fixture processes after verification; use the normal API for application development.
