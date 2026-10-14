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

Vite proxies `/accounts`, `/copilot`, `/actions`, `/feedback`, `/admin`, and `/portfolio` requests to `http://localhost:8000` as configured in `vite.config.ts`. Keep the API running on port `8000` for these requests to work.

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
