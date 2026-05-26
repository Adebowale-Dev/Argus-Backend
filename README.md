# ARGUS Backend V1

ARGUS is a production-style API for an online computer-based examination platform with server-authoritative anti-cheat controls, automatic submissions, live monitoring, and auditable administration.

## Technology

- Node.js, Express.js, ES Modules, MongoDB and Mongoose
- JWT access tokens with rotated `HttpOnly` refresh cookies and bcrypt password hashing
- Zod validation, Helmet, CORS, rate limits, Pino logging and Swagger/OpenAPI
- Socket.IO live exam monitoring, Redis/BullMQ durable timer and reminder jobs
- Brevo transactional email templates and Cloudinary private anti-cheat evidence storage

## Features

- `SUPER_ADMIN`, `SUB_ADMIN`, `EXAMINER`, and `CANDIDATE` role enforcement with sub-admin permissions.
- Departments, courses, question banks, exam publishing, assignment, candidate attempts, backend grading and result gating.
- Anti-cheat scoring, warnings, private snapshots/screenshots, signed evidence URLs, examiner notifications and threshold auto-submit.
- Immutable event logs, administrative audit logs, operational settings, dashboard summaries and CSV report exports.

## Structure

```txt
src/
  config/       Environment, MongoDB, Redis/BullMQ, Brevo, Cloudinary, Swagger
  constants/    Roles, permissions, statuses and anti-cheat events
  emails/       Email service, renderer and branded HTML templates
  jobs/         Expiry and exam-reminder worker
  middlewares/  Authentication, authorization, validation and security
  modules/      Auth, users, curricula, exams, attempts, anti-cheat, reports, audit and settings
  routes/       /api/v1 route composition
  seeders/      Super-admin, defaults and optional sample records
  sockets/      Authenticated monitoring rooms and event emitter
  utils/        Responses, errors, pagination and tokens
tests/          API and anti-cheat engine tests
```

## Setup

Prerequisites are Node.js 20+, MongoDB and Redis. Create Cloudinary and Brevo accounts for uploaded evidence and live email delivery.

```bash
cd Argus-Backend
npm install
```

Update `.env` from `.env.example`. Development defaults keep `SEND_EMAILS=false`; configure `BREVO_API_KEY` and set it to `true` only when ready to send messages. Configure `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` before using evidence or question-attachment uploads.

Generate different high-entropy values for `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`; do not place real database, Redis, Cloudinary, Brevo, or JWT credentials in `.env.example` or source control. JWTs are signed for the configured `JWT_ISSUER` and `JWT_AUDIENCE`; clients receive access tokens in the login/refresh response and refresh tokens only through the rotated `HttpOnly` cookie.

Start MongoDB and Redis locally, then seed and run:

```bash
npm run seed
npm run dev
```

Optional sample department/course data can be seeded by setting `SEED_SAMPLE_DATA=true` before `npm run seed`.
Redis must use `maxmemory-policy=noeviction` because BullMQ delayed attempt submissions must not be evicted. ARGUS verifies and sets this policy at startup when the configured Redis account permits configuration changes; managed Redis services must have it configured in their dashboard. Set `REDIS_REQUIRE_NOEVICTION=true` in production to refuse startup when that durability requirement is not met.

## Default Super Admin

```txt
Email: admin@gmail.com
Password: 123456789
```

The seed is idempotent and reads `DEFAULT_ADMIN_EMAIL` and `DEFAULT_ADMIN_PASSWORD` when overridden. The seeded administrator has `mustChangePassword: true` and must change this password after first login.

## API And Documentation

- Health check: `http://localhost:5000/health`
- Live server landing page: `http://localhost:5000/`
- API base URL: `http://localhost:5000/api/v1`
- Interactive Swagger documentation: `http://localhost:5000/api/v1/docs`

Primary resources are `/auth`, `/users`, `/departments`, `/courses`, `/questions`, `/exams`, `/attempts`, `/settings`, `/audit-logs`, and `/reports`.
Monitoring roles can retrieve paginated attempt sessions with `GET /api/v1/attempts`, scoped by role and optional `exam`, `candidate`, or `status` filters.

## Anti-Cheat Flow

Candidates send validated events to `POST /api/v1/attempts/:attemptId/anti-cheat/log`. The backend assigns points, records immutable logs, evaluates exam-level limits, broadcasts monitoring events, and atomically auto-submits attempts when a threshold is crossed. BullMQ independently submits timed-out attempts even when a candidate disconnects. Snapshots and screenshots are stored as private Cloudinary assets; authorized viewers retrieve short-lived signed URLs only.

## Emails And Live Monitoring

All email rendering lives in `src/emails`. Brevo failures for informational notifications are logged without failing the exam request, and `SEND_EMAILS=false` logs suppressed messages during development. Socket.IO authenticates JWT connections and supports candidate attempt rooms, examiner exam rooms, and authorized platform-monitoring rooms; REST/service operations remain the source of truth.

## Verification

```bash
npm test
npm run lint
```

The test suite verifies authentication behavior and anti-cheat scoring/auto-submit decisions; extend it alongside new workflows.
On its first integration-test run, `mongodb-memory-server` downloads a MongoDB test binary into the ignored `.cache/` directory; allow that download or provide a cached binary in restricted environments.
