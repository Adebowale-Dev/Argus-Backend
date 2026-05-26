# ARGUS API Overview

All public endpoints are versioned beneath `/api/v1`. Authenticate with the access token in `Authorization: Bearer <token>`; refresh tokens are rotated through an `HttpOnly` cookie.

Key workflows:

- Administrators manage users, settings, curricula, audit history and reports according to role and explicit sub-admin permissions.
- Examiners author their own question banks and exams, publish public links with 6-digit access codes, and monitor attempts.
- Candidates retrieve assigned exams, begin timed attempts, save answers, submit, and send anti-cheat events detected by the client.
- The server grades attempts and makes every warning or auto-submit decision; clients do not decide exam state.
- Anti-cheat snapshots/screenshots are private Cloudinary assets. Monitoring roles request short-lived signed evidence URLs through the API.
- Redis/BullMQ processes timer expiry and reminder emails so disconnection does not prevent automatic submission.

## V1 Endpoint Groups

| Area | Endpoints |
| --- | --- |
| Authentication | `POST /auth/login`, `POST /auth/logout`, `POST /auth/refresh-token`, `GET /auth/me`, `POST /auth/forgot-password`, `POST /auth/reset-password`, `POST /auth/change-password` |
| Users | `GET/POST /users`, `GET/PATCH/DELETE /users/:id`, `PATCH /users/:id/block`, `PATCH /users/:id/unblock`, `PATCH /users/:id/role`, `PATCH /users/:id/password-reset` |
| Question Banks | Examiner-owned `/question-banks` resources with scoped question management |
| Questions | CRUD-style `/questions`, `POST /questions/bulk-import`, `POST /questions/:id/attachments` |
| Exams | CRUD-style `/exams`, publish, close, candidate assignment and assigned-candidate retrieval |
| Candidate Taking | `GET /candidate/exams`, instructions, attempt start, autosave, heartbeat, submit and result |
| Monitoring | `GET /attempts`, anti-cheat event/log/report endpoints, evidence uploads and signed evidence URLs |
| Oversight | Dashboard/results exports under `/reports`, plus `/audit-logs` and `/settings` |

Interactive operation details and request schemas are available at `/api/v1/docs`.
