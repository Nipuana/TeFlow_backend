# Teflow — Backend

Teflow is a team-collaboration app: organizations, projects, tasks, and
notifications. This is the backend — a TypeScript REST API (Express) that serves
the Teflow web client.

## What it does

- Accounts, authentication and sessions (JWT access tokens, rotating refresh
  tokens, optional TOTP two-factor).
- Organizations and role-based membership (owner / admin / manager / employee).
- Projects and tasks, with per-project membership and object-level access checks.
- Notifications, billing and outbound integrations.
- Health check at `GET /health`; all API routes are served under `/api/v1`.

## Running it

```bash
cd backend
npm install
npm run dev                    # start the API on http://localhost:3000
```

Other scripts:

```bash
npm test                       # run the unit + integration tests
npm run build && npm start     # compile to dist/ and run the compiled server
npm run typecheck              # type-check only, no output
```

Configuration comes from environment variables and is optional in development
(sensible defaults are used, and persistence runs in-memory). For a production
deployment, set at least `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`,
`ALLOWED_HOSTS`, and `CORS_ALLOWED_ORIGINS`.
