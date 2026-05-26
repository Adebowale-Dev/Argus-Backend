import http from "http";
import app from "./app.js";
import { env } from "./config/env.js";
import { connectDatabase, disconnectDatabase } from "./config/database.js";
import { initializeSockets } from "./sockets/socket.server.js";
import { startExamJobs } from "./jobs/examJobs.js";
import { closeQueue, ensureRedisEvictionPolicy } from "./config/queue.js";

const server = http.createServer(app);
let worker;

const closeResources = async () => {
  if (worker) {
    await worker.close();
    worker = undefined;
  }
  await closeQueue();
  await disconnectDatabase();
};

const listen = () => new Promise((resolve, reject) => {
  const onError = (error) => {
    server.off("listening", onListening);
    reject(error);
  };
  const onListening = () => {
    server.off("error", onError);
    resolve();
  };
  server.once("error", onError);
  server.once("listening", onListening);
  server.listen(env.PORT);
});

const start = async () => {
  await connectDatabase();
  const redisPolicy = await ensureRedisEvictionPolicy();
  console.info(`Redis jobs connected (maxmemory-policy=${redisPolicy})`);
  initializeSockets(server);
  await listen();
  worker = startExamJobs();
  console.info(`${env.APP_NAME} Backend is live: ${env.SERVER_URL}`);
  console.info(`API V1: ${env.SERVER_URL}${env.API_PREFIX}`);
  console.info(`Swagger Docs: ${env.SERVER_URL}${env.API_PREFIX}/docs`);
  console.info(`Health Check: ${env.SERVER_URL}/health`);
};
const shutdown = async () => {
  if (server.listening) await new Promise((resolve) => server.close(resolve));
  await closeResources();
  process.exit(0);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
process.on("unhandledRejection", (error) => { console.error(error); shutdown(); });
start().catch(async (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Server startup failed: port ${env.PORT} is already in use. Stop the existing ARGUS server or set a different PORT in .env.`);
  } else {
    console.error("Server startup failed", error);
  }
  await closeResources();
  process.exit(1);
});
