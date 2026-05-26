import express from "express";
import helmet from "helmet";
import cors from "cors";
import compression from "compression";
import cookieParser from "cookie-parser";
import swaggerUi from "swagger-ui-express";
import { env } from "./config/env.js";
import { swaggerSpec } from "./config/swagger.js";
import { apiLimiter } from "./middlewares/rateLimit.middleware.js";
import { requestLogger } from "./middlewares/requestLogger.middleware.js";
import { sanitizeMongoKeys } from "./middlewares/sanitize.middleware.js";
import { errorHandler, notFound } from "./middlewares/error.middleware.js";
import v1Routes from "./routes/v1.routes.js";

const app = express();
const docsUrl = `${env.SERVER_URL}${env.API_PREFIX}/docs`;
const landingPage = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${env.APP_NAME} Backend | Live</title>
  <style>
    :root { --navy:#092735; --teal:#11807b; --mint:#e6f5f1; --line:#d4e2e4; --ink:#142b36; --muted:#5c6f77; }
    * { box-sizing:border-box; }
    body { margin:0; min-height:100vh; display:grid; place-items:center; font-family:"Segoe UI",Tahoma,sans-serif; color:var(--ink); background:radial-gradient(circle at 78% 12%,#d5ede7 0,transparent 34%),linear-gradient(145deg,#f6faf9,#edf4f5); }
    main { width:min(880px,calc(100% - 34px)); background:#fff; border:1px solid var(--line); border-radius:26px; box-shadow:0 20px 65px rgba(9,39,53,.1); overflow:hidden; }
    header { padding:38px 42px; color:#fff; background:linear-gradient(110deg,var(--navy),#0a4d59); }
    .status { display:inline-flex; align-items:center; gap:9px; margin-bottom:22px; padding:7px 13px; border:1px solid rgba(211,255,242,.32); border-radius:40px; color:#d9fff1; font-size:13px; text-transform:uppercase; letter-spacing:.1em; }
    .dot { width:9px; height:9px; border-radius:50%; background:#37e59a; box-shadow:0 0 13px #37e59a; }
    h1 { margin:0 0 12px; font-size:clamp(32px,5vw,48px); letter-spacing:-.045em; }
    header p { margin:0; color:#ceebed; font-size:17px; max-width:580px; line-height:1.55; }
    section { padding:32px 42px 40px; }
    .links { display:flex; flex-wrap:wrap; gap:12px; margin-bottom:29px; }
    a { text-decoration:none; font-weight:600; border-radius:11px; padding:13px 19px; color:#fff; background:var(--teal); }
    a.secondary { color:var(--navy); background:var(--mint); }
    .details { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; }
    article { border:1px solid var(--line); background:#fbfdfd; padding:17px; border-radius:12px; }
    label { display:block; color:var(--muted); text-transform:uppercase; letter-spacing:.08em; font-size:11px; margin-bottom:7px; }
    strong { font-size:15px; }
    @media (max-width:640px) { header,section { padding:27px 23px; } .details { grid-template-columns:1fr; } }
  </style>
</head>
<body>
  <main>
    <header>
      <div class="status"><span class="dot"></span> Operational</div>
      <h1>${env.APP_NAME} Backend is live</h1>
      <p>Secure examination services, real-time monitoring, and anti-cheat automation are ready for API requests.</p>
    </header>
    <section>
      <div class="links">
        <a href="${env.API_PREFIX}/docs">Explore API Docs</a>
        <a class="secondary" href="/health">View Health Status</a>
        <a class="secondary" href="${env.API_PREFIX}">API Discovery</a>
      </div>
      <div class="details">
        <article><label>Version</label><strong>API V1</strong></article>
        <article><label>Documentation</label><strong>Swagger / OpenAPI</strong></article>
        <article><label>Platform</label><strong>ARGUS CBT</strong></article>
      </div>
    </section>
  </main>
</body>
</html>`;
app.use(helmet());
app.use(cors({ origin: env.CLIENT_URL.split(",").map((value) => value.trim()), credentials: true }));
app.use(compression());
app.use(cookieParser());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(requestLogger);
app.use(sanitizeMongoKeys);
app.get("/", (_req, res) => res.type("html").send(landingPage));
app.get("/health", (_req, res) => res.json({ success: true, message: "ARGUS API is healthy." }));
app.get(`${env.API_PREFIX}/docs.json`, (_req, res) => res.json(swaggerSpec));
app.use(`${env.API_PREFIX}/docs`, swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.get(env.API_PREFIX, (_req, res) => res.json({
  success: true,
  message: `${env.APP_NAME} API V1 is live.`,
  data: { version: "v1", documentationUrl: docsUrl, healthUrl: `${env.SERVER_URL}/health` }
}));
app.use(env.API_PREFIX, apiLimiter, v1Routes);
app.use(notFound);
app.use(errorHandler);
export default app;
