# ARGUS API Overview

All public endpoints are versioned beneath `/api/v1`. Authenticate with the access token in `Authorization: Bearer <token>`; refresh tokens are rotated through an `HttpOnly` cookie.

Key workflows:

- Administrators manage users, settings, curricula, audit history and reports according to role and explicit sub-admin permissions.
- Examiners author course-owned question banks and exams, assign candidates, publish schedules and monitor attempts.
- Candidates retrieve assigned exams, begin timed attempts, save answers, submit, and send anti-cheat events detected by the client.
- The server grades attempts and makes every warning or auto-submit decision; clients do not decide exam state.
- Anti-cheat snapshots/screenshots are private Cloudinary assets. Monitoring roles request short-lived signed evidence URLs through the API.
- Redis/BullMQ processes timer expiry and reminder emails so disconnection does not prevent automatic submission.
