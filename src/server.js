import http from "http";
import app from "./app.js";
import { env } from "./config/env.js";
import { connectDatabase, disconnectDatabase } from "./config/database.js";
import { initializeSockets } from "./sockets/socket.server.js";
import { startExamJobs } from "./jobs/examJobs.js";
import { closeQueue, ensureRedisEvictionPolicy } from "./config/queue.js";

const server = http.createServer(app);
let worker;
const start = async () => {
  await connectDatabase();
  const redisPolicy = await ensureRedisEvictionPolicy();
  console.info(`Redis jobs connected (maxmemory-policy=${redisPolicy})`);
  initializeSockets(server);
  worker = startExamJobs();
  server.listen(env.PORT, () => {
    console.info(`${env.APP_NAME} Backend is live: ${env.SERVER_URL}`);
    console.info(`API V1: ${env.SERVER_URL}${env.API_PREFIX}`);
    console.info(`Swagger Docs: ${env.SERVER_URL}${env.API_PREFIX}/docs`);
    console.info(`Health Check: ${env.SERVER_URL}/health`);
  });
};
const shutdown = async () => {
  server.close();
  if (worker) await worker.close();
  await closeQueue();
  await disconnectDatabase();
  process.exit(0);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
process.on("unhandledRejection", (error) => { console.error(error); shutdown(); });
start().catch((error) => { console.error("Server startup failed", error); process.exit(1); });
