# TaskMaster2

Automated legal task extraction pipeline that ingests evidence from emails, phone transcripts, and meeting notes, then extracts, normalizes, deduplicates, and syncs tasks to Clio — the legal practice management system.

## Architecture

TaskMaster2 is a 7-stage event-driven pipeline built on BullMQ (Redis) with PostgreSQL (pgvector) for storage:

```
Evidence ─→ Ingestion ─→ Extraction ─→ Normalization ─→ Identity Resolution ─→ Dedup ─→ Assignment ─→ Sync
  (email,     (parse,       (Claude       (summary        (matter/user          (finger-    (route      (push to
  phone,       clean,        action        refine,         matching)             print +     task to     Clio API)
  meeting)     validate)     spans)        validate)                             semantic)   user)
```

| Stage | Queue | Description |
|-------|-------|-------------|
| Ingestion | `evidence.ingest` | Parse raw evidence, validate schema, normalize text |
| Extraction | `extraction.extract` | Extract action spans and candidate tasks via Claude |
| Normalization | `normalization.normalize` | Refine summaries, validate PII, enforce style rules |
| Identity Resolution | `identity.resolve` | Match matters, contacts, and assignees |
| Deduplication | `dedup.check` | Fingerprint + semantic matching against canonical registry |
| Assignment | `assignment.assign` | Route tasks to users based on authority and confidence |
| Sync | `sync.push` | Push canonical tasks to Clio with optimistic concurrency |

## Quick Start

Prerequisites: Docker, Docker Compose, an Anthropic API key.

```bash
# Clone and start all services
git clone <repo-url> && cd TaskMaster2
cp .env.example .env
# Edit .env — set ANTHROPIC_API_KEY at minimum

docker compose up -d
# Runs: Postgres (pgvector), Redis, migrator, API server, worker
```

The API is available at `http://localhost:3000`. Verify with:

```bash
curl http://localhost:3000/health
```

## Development Setup

Prerequisites: Node.js 20+, PostgreSQL 16+ (with pgvector), Redis 7+.

```bash
# Install dependencies
npm install

# Start Postgres and Redis (via Docker or locally)
docker compose up -d postgres redis

# Run migrations
npm run migrate

# Copy and configure environment
cp .env.example .env
# Edit .env with your credentials

# Start in development mode (API + worker, hot reload)
npm run dev

# Or start API and worker separately
PROCESS_ROLE=api npm run dev
PROCESS_ROLE=worker npm run dev
```

## API Reference

All API endpoints (except health checks) require the `X-API-Key` header.

### Health

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Liveness probe |
| GET | `/ready` | Readiness probe |
| GET | `/api/v1/metrics` | Pipeline stage metrics (queue depths) |
| GET | `/api/v1/audit` | Audit log entries |

### Evidence

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/evidence` | Submit a new evidence event |
| GET | `/api/v1/evidence` | List evidence events (paginated) |
| GET | `/api/v1/evidence/:id` | Get evidence event by ID |

Aliases: `POST /api/v1/evidence-events`, `GET /api/v1/evidence-events/:id`

### Registry (Canonical Tasks)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/tasks` | List canonical tasks (paginated) |
| GET | `/api/v1/tasks/:id` | Get canonical task by ID |
| GET | `/api/v1/tasks/:id/evidence` | Get evidence linked to a task |
| PATCH | `/api/v1/tasks/:id` | Update canonical task fields |

Aliases: `GET /api/v1/canonical-tasks/:id`, `GET /api/v1/canonical-tasks/open`, `POST /api/v1/canonical-tasks/:id/recompute`

### Review

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/reviews` | List review items (paginated) |
| GET | `/api/v1/reviews/:id` | Get review item by ID |
| GET | `/api/v1/reviews/:id/context` | Get full review context |
| POST | `/api/v1/reviews/:id/decide` | Submit review decision |

Aliases: `GET /api/v1/review-items/open`, `POST /api/v1/review-items/:id/resolve`

### Normalization

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/candidate-tasks/:id` | Get candidate task by ID |

### Sync

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/sync/canonical-tasks/:id` | Trigger sync for a canonical task |

### Replay

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/replay/:evidenceEventId` | Replay full pipeline for an evidence event |
| POST | `/api/v1/replay/:evidenceEventId/:stage` | Replay from a specific stage |

### Clio Integration

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/clio/authorize` | Start Clio OAuth flow |
| GET | `/api/v1/clio/callback` | OAuth callback (no auth required) |
| GET | `/api/v1/clio/status` | Check Clio connection status |

### Identity

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/matters` | List matters |
| POST | `/api/v1/matters` | Create a matter |
| PATCH | `/api/v1/matters/:id` | Update a matter |
| GET | `/api/v1/users` | List users |
| POST | `/api/v1/users` | Create a user |
| PATCH | `/api/v1/users/:id` | Update a user |

## Configuration

All configuration is loaded from environment variables and validated with Zod at startup.

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PROCESS_ROLE` | No | `both` | Process mode: `api`, `worker`, `both`, or `migrator` |
| `PORT` | No | `3000` | HTTP server port |
| `HOST` | No | `0.0.0.0` | HTTP server bind address |
| `LOG_LEVEL` | No | `info` | Pino log level: `fatal\|error\|warn\|info\|debug\|trace` |
| `DATABASE_URL` | **Yes** | — | PostgreSQL connection string |
| `REDIS_URL` | No | `redis://localhost:6379` | Redis connection string |
| `ANTHROPIC_API_KEY` | **Yes** | — | Anthropic API key for Claude extraction |
| `EMBEDDING_PROVIDER` | No | `voyage` | Embedding provider: `voyage` or `openai` |
| `VOYAGE_API_KEY` | No | — | Voyage AI API key (if using voyage provider) |
| `OPENAI_API_KEY` | No | — | OpenAI API key (if using openai provider) |
| `EMBEDDING_MODEL` | No | `voyage-3` | Embedding model name |
| `EMBEDDING_DIMENSIONS` | No | `1536` | Embedding vector dimensions |
| `CLIO_CLIENT_ID` | No | — | Clio OAuth client ID |
| `CLIO_CLIENT_SECRET` | No | — | Clio OAuth client secret |
| `CLIO_REDIRECT_URI` | No | — | Clio OAuth redirect URI |
| `CLIO_API_BASE` | No | `https://app.clio.com/api/v4` | Clio API base URL |
| `API_KEY` | **Yes** | — | API key for authenticating requests |
| `DEFAULT_TENANT_ID` | No | `default` | Default tenant identifier |
| `CORS_ORIGIN` | No | `*` | CORS allowed origins (comma-separated or `*`) |
| `RATE_LIMIT_MAX` | No | `100` | Max requests per rate limit window per IP |
| `RATE_LIMIT_WINDOW_MS` | No | `60000` | Rate limit window in milliseconds |

## Database Migrations

Migrations are managed via a custom runner in `scripts/migrate.ts`:

```bash
# Run all pending migrations
npm run migrate

# Or via Docker Compose (runs automatically on startup)
docker compose up migrator
```

Migration files are in the `migrations/` directory, executed in filename order.

## Testing

```bash
# Run all tests
npm test

# Run in watch mode
npm run test:watch

# Type-check (src + test)
npm run lint
```

Tests are written with Vitest and use mocked Redis/database dependencies — no external services required.
