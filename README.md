# HissabBook API System

Backend API system for HissabBook - a CashBook-style accounting/ledger application.

## Quick Start

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Configure Environment Variables**
   - Copy `.env.example` to `.env` (if available)
   - Set up your database connection: `DATABASE_URL`
   - Set up JWT secret: `JWT_SECRET`
   - Set up Gmail SMTP for email OTP: See [GMAIL_SETUP.md](./GMAIL_SETUP.md)
   - Set up Fast2SMS for mobile OTP: `FAST2SMS_API_KEY`

3. **Run Database Migrations**
   - Execute SQL migration files from `data/migrations/` directory

4. **Start the Server**
   ```bash
   npm start
   # or for development
   npm run dev
   ```

## Gmail SMTP Setup

For email OTP functionality, you need to configure Gmail SMTP. See the detailed guide in [GMAIL_SETUP.md](./GMAIL_SETUP.md).

**Quick Setup:**
1. Enable 2-Step Verification on your Google Account
2. Generate an App Password for Gmail
3. Add to your `.env` file:
   ```env
   SMTP_USER=your-email@gmail.com
   SMTP_PASSWORD=your-16-character-app-password
   SMTP_FROM_EMAIL=your-email@gmail.com
   ```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register with email/password
- `POST /api/auth/login` - Login with email/password
- `POST /api/auth/create-user` - Create/login user after email OTP verification
- `GET /api/auth/me` - Get current user (requires auth)
- `POST /api/auth/logout` - Logout (requires auth)

### OTP (One-Time Password)
- `POST /api/otp/request` - Send OTP to mobile number
- `POST /api/otp/verify` - Verify mobile OTP
- `POST /api/otp/email/request` - Send OTP to email address
- `POST /api/otp/email/verify` - Verify email OTP

### Payout Requests
- `POST /api/payout-requests` - Create payout request
- `GET /api/payout-requests` - Get payout requests (requires auth)

## Environment Variables

See `.env.example` for all available environment variables.

**Required:**
- `DATABASE_URL` - PostgreSQL connection string
- `JWT_SECRET` - Secret key for JWT tokens
- `SMTP_USER` or `GMAIL_USER` - Gmail email address
- `SMTP_PASSWORD` or `GMAIL_APP_PASSWORD` - Gmail App Password

**Optional:**
- `SMTP_HOST` - SMTP host (default: smtp.gmail.com)
- `SMTP_PORT` - SMTP port (default: 587)
- `SMTP_SECURE` - Use SSL/TLS (default: false for port 587)
- `OTP_TTL_MINUTES` - OTP expiration time in minutes (default: 5)
- `FAST2SMS_API_KEY` - Fast2SMS API key for mobile OTP
- `JWT_EXPIRES_IN` - JWT token expiration (default: 1h)

## Project Structure

```
hissabbook-api-system/
├── src/
│   ├── app.js              # Fastify app configuration
│   ├── server.js           # Server startup
│   ├── plugins/
│   │   └── db.js           # Database plugin
│   ├── routes/
│   │   ├── auth.js         # Authentication routes
│   │   ├── otp.js          # OTP routes (mobile & email)
│   │   └── payoutRequests.js
│   ├── services/
│   │   └── userService.js  # User service
│   └── utils/
│       ├── email.js        # Email utility (Gmail SMTP)
│       └── password.js     # Password hashing utility
├── GMAIL_SETUP.md          # Gmail SMTP setup guide
└── package.json
```

## Features

- ✅ Email OTP authentication (passwordless)
- ✅ Mobile OTP authentication (via Fast2SMS)
- ✅ JWT-based authentication
- ✅ User registration and login
- ✅ Email OTP sending via Gmail SMTP
- ✅ Database migrations support

## Development

```bash
# Install dependencies
npm install

# Run in development mode (with auto-reload)
npm run dev

# Run in production mode
npm start
```

## Troubleshooting

### Gmail SMTP Issues
- See [GMAIL_SETUP.md](./GMAIL_SETUP.md) for detailed troubleshooting
- Make sure you're using an App Password, not your regular Gmail password
- Verify that 2-Step Verification is enabled on your Google Account

### Database Issues
- Check your `DATABASE_URL` connection string
- Verify that PostgreSQL is running
- Run database migrations from `data/migrations/` directory

### OTP Issues
- Check server logs for detailed error messages
- Verify Gmail SMTP configuration for email OTP
- Verify Fast2SMS API key for mobile OTP

---

# HissabBook — Scalable Architecture (React frontend + Node.js backend)

This document describes a production-ready, scalable architecture for **HissabBook** (a CashBook-style accounting/ledger app). It includes high-level diagrams, component responsibilities, recommended tech choices, data model sketches, REST API design, scaling strategies, CI/CD, security and observability recommendations, and starter folder structure.

---

## Goals

* Smooth UX (fast page loads, near-real-time updates)
* Horizontal scalability (handle growth in users and transactions)
* Strong consistency for financial data
* Secure (authentication, authorization, audit logs)
* Maintainable and testable codebase

---

## High-level components

1. **Client (React SPA)**

   * React + React Router
   * State: Redux / Zustand / React Query for server state
   * UI Library: Tailwind CSS + component library (or MUI)
   * Offline & sync-friendly: service worker + client-side persistence (IndexedDB)
   * Real-time: WebSockets or Server-Sent Events for live updates

2. **API Gateway / Load Balancer**

   * Public endpoint (Nginx / AWS ALB / Cloudflare)
   * TLS termination, rate limiting

3. **Backend (Node.js)**

   * Express / Fastify (Fastify recommended for performance)
   * RESTful endpoints (JSON)
   * Authentication: JWT (short-lived access tokens) + refresh tokens stored server-side or using rotating refresh tokens
   * Authorization: role-based (RBAC) and resource-level checks
   * Business services layer (service classes), controllers, repositories (data layer)

4. **Database (Primary)**

   * **Postgres** (recommended) for relational ACID properties
   * Use strong transactions for double-entry operations
   * Partitioning (by tenant/date) for scale
   * Read replicas for reporting

5. **Caching & Fast Reads**

   * **Redis** for caching frequently-read objects, session storage, distributed locks, and rate limiting

6. **Background Workers / Queue**

   * **BullMQ** (Redis-backed) or RabbitMQ for asynchronous tasks (export CSV/PDF, sending notifications, heavy computations)

7. **Object Storage** 

   * **S3-compatible** storage for invoices, backups, exports

8. **Search & Analytics**

   * **Elasticsearch / OpenSearch** for full-text search and advanced filtering (optional)

9. **Real-time layer**

   * WebSocket server or socket.io (horizontally scaled with Redis pub/sub adapter)
   * Alternatively, SSE for simpler update flows

10. **Monitoring & Observability**

    * Prometheus + Grafana for metrics
    * ELK / Loki for logs
    * Sentry for error tracking

11. **CI/CD**

    * GitHub Actions / GitLab CI to build, lint, test, and deploy
    * Docker images pushed to registry
    * Deploy via Kubernetes (recommended) or ECS / Cloud Run

12. **Multi-tenancy (if needed)**

    * Tenant-per-row (tenant_id column) with row-level security in Postgres OR separate DB per tenant for strong isolation

---

## Data model (core entities)

* **User**: id, email, password_hash, role, created_at
* **Organization / AccountBook**: id, name, owner_id, plan, timezone
* **Ledger**: id, org_id, name, type (cash/bank/etc.)
* **Transaction**: id, ledger_id, org_id, date, amount, type (debit/credit), description, metadata
* **Entry** (double-entry): id, transaction_id, account_id, debit, credit
* **BalanceSnapshot**: ledger_id, date, opening_balance, closing_balance
* **AuditLog**: actor_id, action, resource_type, resource_id, before, after, ip, timestamp

Use UUIDs for IDs (v4 or v7).

Important: use Postgres transactions to ensure that a financial transaction writes all related entries atomically.

---

## Example REST endpoints

**Auth**

* POST /api/v1/auth/register
* POST /api/v1/auth/login -> returns access_token + refresh_token
* POST /api/v1/auth/refresh
* POST /api/v1/auth/logout

**Organizations & Users**

* GET /api/v1/orgs
* POST /api/v1/orgs
* GET /api/v1/orgs/:orgId/members
* POST /api/v1/orgs/:orgId/members

**Ledgers & Transactions**

* GET /api/v1/orgs/:orgId/ledgers
* POST /api/v1/orgs/:orgId/ledgers
* GET /api/v1/orgs/:orgId/transactions?from=&to=&ledger=&page=&limit=
* POST /api/v1/orgs/:orgId/transactions  (body contains entries[])
* GET /api/v1/orgs/:orgId/transactions/:id
* DELETE /api/v1/orgs/:orgId/transactions/:id  (soft delete + audit)

**Reports / Exports**

* GET /api/v1/orgs/:orgId/reports/trial-balance?date=
* POST /api/v1/orgs/:orgId/exports -> queue background job and return job id
* GET /api/v1/jobs/:jobId/status

**Realtime**

* GET /api/v1/orgs/:orgId/stream (SSE) or WebSocket connection

---

## Consistency & Concurrency patterns

* Wrap each transaction creation in a DB transaction (BEGIN ... COMMIT).
* Use optimistic concurrency (version column) for edits where applicable.
* For balance updates: avoid storing derived mutable balances; instead compute on demand or update using atomic SQL statements (e.g., `UPDATE balances SET amount = amount + $1 WHERE account_id = $2 RETURNING ...`) inside a transaction.
* To avoid race conditions when multiple processes update same ledger, use advisory locks or Redis-based distributed locks.

---

## Scaling strategy

**Vertical → Horizontal** 

1. Start with a single Node.js service behind a load balancer and Postgres primary.
2. Add read replicas for analytical/reading load.
3. Move heavy tasks to workers (BullMQ) and scale worker replicas separately.
4. Scale WebSocket servers horizontally with a Redis adapter for pub/sub.
5. Use Kubernetes or managed services (EKS/GKE/Azure AKS) for orchestration.

**Database scaling**

* Use partitioning and archiving for old transactions.
* Use read replicas for reporting queries.
* Consider sharding by organization for very large scale (one DB per group of orgs).

**Caching**

* Cache lookup data (currencies, static lists) in Redis.
* Cache computed reports for short durations.

---

## Security & Compliance

* TLS everywhere (HTTPS)
* Secure JWT handling: short-lived access tokens (e.g., 5–15 minutes) and rotating refresh tokens.
* Store sensitive creds in a secret manager (AWS Secrets Manager / HashiCorp Vault).
* Audit logs: every change to ledgers/transactions must have an associated audit record.
* Input validation + JSON schema validation (Ajv) for API bodies.
* Rate limiting (IP and user-based) using Redis.
* Penetration testing and periodic dependency scans. 

---

## Observability & reliability

* Instrument HTTP request latency, DB queries, queue length, worker errors.
* Log structured JSON to stdout (centralized into ELK/Loki).
* Use distributed tracing (OpenTelemetry) across frontend ↔ API ↔ workers.
* Configure alerts for error rate, queue backlog, DB replica lag.

---

## DevOps & Deployment

* Dockerize each service: api, worker, websocket, migrations
* Kubernetes recommended: use HPA (horizontal pod autoscaler) with metrics (CPU, custom queue length metric)
* Use Helm charts for deployments
* Migrations: use a migration tool (Flyway / Alembic / node-pg-migrate)
* Backups: regular Postgres backups to S3 + point-in-time recovery (PITR)

---

## Frontend structure & UX tips

* **Routing**: client-side routes for org dashboards, ledger views, transaction creation
* **State**: React Query for server-synced data + optimistic updates for snappy UI
* **Forms**: Formik or React Hook Form with schema validation
* **Large lists**: virtualized lists (react-window) for long transaction lists
* **Data sync**: background polling + WebSocket/SSE for real-time pushes
* **Performance**: code-splitting, compress assets, serve from CDN

---

## Developer workflow & testing

* Unit tests (Jest) for services and utilities
* Integration tests for API endpoints (supertest)
* Contract tests for API consumer/producer (Pact optionally)
* End-to-end tests (Cypress) for critical flows (create transaction, view ledger)

---

## Minimal starter folder structure

```
/backend
  /src
    /controllers
    /services
    /repositories
    /jobs
    /models 
    /routes
    /middlewares
    /utils
  Dockerfile
  helm-chart/
/frontend
  /src
    /components
    /pages
    /hooks
    /services (api client)
    /store
  Dockerfile
/k8s
/infra
  terraform/
/docs
README.md
```

--- 

## Next steps & deliverables I can provide

* Kubernetes + Helm deployment templates for API + worker + web
* Example Node.js service (Fastify) with transaction endpoint and tests
* React SPA skeleton with authentication and ledger list pages
* Postgres schema SQL + migrations

Tell me which of the above you want me to build first (e.g., `React skeleton`, `Node.js API scaffold`, `Kubernetes manifest`, or `DB schema`) and I will produce ready-to-run code.
