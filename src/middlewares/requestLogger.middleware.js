import pino from "pino";
import pinoHttp from "pino-http";
import { env, isProduction } from "../config/env.js";

const transport = isProduction ? undefined : {
  target: "pino-pretty",
  options: { colorize: true, translateTime: "SYS:standard", ignore: "pid,hostname,req,res,responseTime", singleLine: true }
};

export const logger = pino({
  level: env.LOG_LEVEL,
  transport,
  redact: {
    paths: ["req.headers.authorization", "req.headers.cookie", "password", "*.password", "token", "*.token"],
    censor: "[Redacted]"
  }
});

export const requestLogger = pinoHttp({
  logger,
  autoLogging: {
    ignore: (req) => env.NODE_ENV === "test" || req.url.startsWith(`${env.API_PREFIX}/docs`) || req.url === "/favicon.ico"
  },
  customSuccessMessage: (req, res) => `${req.method} ${req.originalUrl || req.url} ${res.statusCode}`,
  customErrorMessage: (req, res) => `${req.method} ${req.originalUrl || req.url} ${res.statusCode}`,
  serializers: {
    req: (req) => ({ method: req.method, url: req.url }),
    res: (res) => ({ statusCode: res.statusCode })
  }
});
