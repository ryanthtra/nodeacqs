# NodeAcqs

> A REST API scaffold for the **"Acquisitions"** domain, built on Node.js + Express 5, with a Neon serverless Postgres wired up via Drizzle ORM.

**Status:** Early scaffolding — the foundation (boot, middleware, logging, DB schema + migrations) is in place; the domain layers (routes → controllers → services) are the next step.

---

## 1. The Big Picture

- **What it is:** `nodeacqs` ("Node Acquisitions API") is a **REST API backend** project, currently in its early scaffolding stage.
- **What it does today:** Boots an HTTP server (port `3000` by default) with a security + logging middleware stack and a single health-check-style route (`GET /`). It is pre-wired to a **serverless PostgreSQL database (Neon)** via Drizzle ORM, with a `users` table schema + migration already generated.
- **Where it's headed:** The `imports` map in `package.json` (`#routes/*`, `#controllers/*`, `#services/*`, `#middleware/*`, `#validations/*`) reveals the intended layered "Acquisitions" domain API.

### Project history (git)

| # | Commit | What it added |
|---|--------|---------------|
| 1 | `c2accf0` | Initial folder setup + three main JS files |
| 2 | `b974c62` | Prettier + ESLint tooling |
| 3 | `e3357a1` | PostgreSQL on Neon via Drizzle ORM |
| 4 | `69cc173` | Logging/security middleware: winston, helmet, morgan, cors, cookie-parser |

---

## 2. Core Architecture

**Pattern: layered monolith** — single process, no microservices, no event bus yet. Notably:

- **Zero build step** — pure ESM (`"type": "module"`), run directly with `node --watch` (Node 18.11+).
- **Node subpath imports** provide a stable namespace for the planned layers: `#config/*`, `#models/*`, `#routes/*`, `#controllers/*`, `#services/*`, `#middleware/*`, `#validations/*` — even though only `config` and `models` exist so far.

### Repository layout

```
nodeacqs/
├── src/
│   ├── index.js            ← entry: loads env, boots server (side-effect imports)
│   ├── server.js           ← binds app to PORT (default 3000)
│   ├── app.js              ← Express app: middleware chain + routes
│   ├── config/
│   │   ├── database.js     ← Neon HTTP driver + Drizzle ORM client (lazy)
│   │   └── logger.js       ← Winston: JSON file logs + colored console
│   └── models/
│       └── user.model.js   ← Drizzle schema: "users" table
├── drizzle/                ← generated SQL migrations + meta/_journal.json
├── drizzle.config.js       ← drizzle-kit: schema dir → dialect → DSN
├── logs/                   ← combined.log, error.log (gitignored)
├── .env / .env.example     ← PORT, NODE_ENV, LOG_LEVEL, DATABASE_URL
└── tooling: eslint (flat config), prettier, .vscode/settings.json
```

### The three-file startup split

| File | Responsibility |
|---|---|
| `src/index.js` | Process bootstrap: `import 'dotenv/config'`, then `import './server.js'` |
| `src/server.js` | The **only** place that calls `app.listen(PORT)` |
| `src/app.js` | A **pure, exported Express app** — no binding side effects |

Why this matters: `app.js` can be imported by test suites (e.g., supertest) without opening a port, and environment loading is explicitly ordered before anything reads `process.env`.

---

## 3. Key Components

| Component | Purpose & Role |
|---|---|
| **`src/index.js`** | Entry point (2 lines). Side-effect imports guarantee dotenv loads *before* `server.js` → `app.js` read `process.env`. |
| **`src/server.js`** | Starts the HTTP listener on `PORT \|\| 3000`. Keeps "when to listen" in exactly one place. |
| **`src/app.js`** | Builds the Express app and the middleware pipeline: `helmet() → cors() → express.json() → express.urlencoded() → cookie-parser() → morgan('combined' → winston)`. Defines one route today: `GET /`. |
| **`src/config/database.js`** | Creates the Neon serverless client (`neon(DATABASE_URL)`) and wraps it: `drizzle(sql)` from `drizzle-orm/neon-http`. Exports `db` (ORM) and the raw `sql` helper for custom queries. |
| **`src/config/logger.js`** | Winston logger: JSON format + timestamps, default meta `service: 'nodeacqs-api'`, two file transports (`logs/error.log` for ≥error, `logs/combined.log` for ≥info), plus a colorized console transport when `NODE_ENV !== 'production'`. `LOG_LEVEL` env-var tunable. |
| **`src/models/user.model.js`** | Drizzle `pgTable('users')`: `id` (serial PK), `name`, `email` (unique), `password`, `role` (default `'user'`), `created_at`/`updated_at` (default `now()`). |
| **`drizzle/` + `drizzle.config.js`** | Migration pipeline: schema lives in `src/models/*.js`; drizzle-kit diffs it into plain SQL (`0000_tranquil_the_liberteens.sql` → `CREATE TABLE users`) plus a JSON journal for tracking. |

---

## 4. Data Flow & Communication

### 4.1 Startup flow

```
$ npm run dev   (node --watch src/index.js)
        │
        ▼
  index.js: import 'dotenv/config'           → env vars loaded
        │
        ▼  import './server.js' (side effect)
  server.js: import app from './app.js'      → Express app + middleware built
        │
        ▼
  server.js: app.listen(PORT)                → http://localhost:3000 ready
```

⚡ **Important subtlety:** `database.js` is *not* imported by `app.js` or `server.js`. The Neon client is therefore **lazy** — no DB connection is created until a service/module actually imports `#config/database.js`.

### 4.2 Request flow (today — `GET /`)

```
Client
  │  GET /
  ▼
helmet          → sets security headers (CSP, X-Content-Type-Options, ...)
  ▼
cors            → handles Origin / Access-Control-*
  ▼
express.json /  → parses request body (no-op for GET)
urlencoded
  ▼
cookie-parser   → parses Cookie header into req.cookies
  ▼
morgan          → access log ──▶ winston ──▶ logs/combined.log
  ▼
route handler   → res.status(200).send('Hello from Node Acquisitions APIS!')
  │
  ▼
Client ◀── 200 OK
```

### 4.3 Intended data flow (planned layers)

The `imports` map in `package.json` is the blueprint:

```
Client
  │
  ▼
#routes/*        → URL → handler mapping (Express routers)
  ▼
#controllers/*   → request parsing, validation, response shaping
  ▼
#services/*      → business logic
  ▼
#models/*        → Drizzle schema + queries ──▶ db (drizzle-orm)
                                            ──▶ Neon Postgres (HTTP/JSON, serverless)
  ◀────────────── rows / affected counts bubble back up as JSON ◀────────────
```

### 4.4 Schema → database ops

```
npm run db:generate   # drizzle-kit diffs src/models/*.js → drizzle/NNNN_*.sql
npm run db:migrate    # applies pending SQL migrations to the Neon DB
npm run db:studio     # Drizzle Studio GUI for inspecting data
```

---

## 5. Tech Stack & Why It Matters

| Tech | Role in the architecture |
|---|---|
| **Node.js ESM** + `node --watch` | No build/transpile step; instant dev reload |
| **Express 5.2.1** | HTTP layer. V5 natively propagates async middleware errors — relevant since the planned services will be async |
| **@neondatabase/serverless** | PostgreSQL accessed over **HTTP** (`neon-http` driver) — no persistent connection pool, ideal for serverless deployments; trades a bit of per-query latency for zero connection management |
| **drizzle-orm + drizzle-kit** | Type-safe, SQL-first ORM; migrations as reviewable plain-SQL files in git |
| **helmet** | Security headers from day one |
| **cors** | Enables browser clients on other origins |
| **cookie-parser** | Signals future cookie/session-based auth |
| **morgan → winston** | One unified logging pipeline: HTTP access logs and app logs flow through the same Winston transports (JSON files + console) |
| **dotenv** | 12-factor env config (`PORT`, `NODE_ENV`, `LOG_LEVEL`, `DATABASE_URL`) |
| **ESLint 10 (flat) + Prettier** | Enforced style: 2-space indent, single quotes, semis, LF line endings |

---

## 6. Execution Flow — Walkthrough

### Today (`GET /`)

1. Client sends `GET /`.
2. `helmet` stamps security headers; `cors` handles cross-origin headers.
3. Body parsers run (no-op for a GET); `cookie-parser` fills `req.cookies` (empty).
4. `morgan` writes the access line into Winston → `logs/combined.log`.
5. The inline handler returns `200 OK` with the plain-text greeting.
6. Every log line is tagged with `service: 'nodeacqs-api'` (Winston `defaultMeta`) for later filtering.

### A likely future flow (e.g., `POST /users`)

1. **Route** (`#routes/users.js`) matches `POST /users`.
2. **Controller** reads `req.body`, runs validation (planned `#validations/*` layer).
3. **Service** applies business rules — *would* hash the password (⚠️ no hashing library in deps yet — see §7).
4. **Model/DB**: `db.insert(users).values({...}).returning()` → Drizzle compiles SQL → Neon driver POSTs JSON to Neon → row comes back.
5. **Controller** → `res.status(201).json(user)`; the request is also captured by morgan → winston → `logs/combined.log`.

---

## 7. Strengths & Tradeoffs

### ✅ Strengths

- **Testable startup split** — `app.js` is a pure export; `listen` is isolated in `server.js`.
- **Lazy DB client** — no DB connection unless actually imported.
- **Unified structured logging** — JSON files, level-based routing (errors separated), console only in dev, `LOG_LEVEL` tunable.
- **Security-first defaults** — helmet + cors + cookie-parser wired before any routes exist.
- **Schema-as-code + migrations from day one** — Drizzle keeps DB DDL in git, reviewable as plain SQL.
- **Stable import namespace** — `#config/*`, `#services/*`, etc. prevent import drift as layers get added.
- **Zero build tooling** — minimal surface area, fast iteration.

### ⚠️ Tradeoffs & Watch-outs

1. **`.env.example` bug:** it says `DATABSE_URL` (missing the "A"), but the code reads `DATABASE_URL`. Anyone bootstrapping from the example will get a broken DB connection.
2. **Plaintext password column** — `users.password varchar(255)` with no hashing library in dependencies. Add argon2/bcrypt before any auth work.
3. **No error handling yet** — no 404 catch-all, no central error middleware, no graceful shutdown (`SIGTERM`) in `server.js`.
4. **Unbounded log files** — no rotation; `combined.log` grows forever (consider `winston-daily-rotate-file`).
5. **Neon HTTP driver latency** — every query is an HTTP round trip with no persistent pool; fine for serverless, slightly chatty for local dev loops.
6. **`logs/` is CWD-relative** — the logger assumes the process starts from the project root.
7. Minor: root route says "APIS" (typo); `morgan('combined')` logs every request at `info` level; no tests yet (though ESLint already defines Jest-style globals, so tests are on the roadmap); no rate limiting (expected at this stage).

---

## 8. TL;DR for a Teammate

> **NodeAcqs is a Node.js + Express 5 REST API scaffold for an "Acquisitions" domain.** It's a cleanly split monolith — `index.js` loads env, `server.js` binds the port, `app.js` is a pure, testable Express app with helmet/cors/cookie-parser and a unified Winston logging pipeline — pre-wired to a **Neon serverless Postgres** through **Drizzle ORM**, with a `users` table migration already generated. The roadmap is clear from the `package.json` import map: fill in the `#routes/ → #controllers/ → #services/` layers around that foundation.

---
