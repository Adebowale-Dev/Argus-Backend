import IORedis from "ioredis";
import { Queue, Worker } from "bullmq";
import { env } from "./env.js";

let connection;
let examQueue;

const getConnection = () => {
  connection ??= new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null, lazyConnect: true });
  return connection;
};

export const ensureRedisEvictionPolicy = async () => {
  const redis = getConnection();
  if (redis.status === "wait") await redis.connect();
  const memoryInfo = await redis.info("memory");
  const current = memoryInfo.match(/^maxmemory_policy:(.+)$/m)?.[1]?.trim();
  if (current !== "noeviction") {
    try {
      await redis.config("SET", "maxmemory-policy", "noeviction");
    } catch {
      const message = `Redis maxmemory-policy is "${current || "unknown"}". BullMQ requires "noeviction"; configure this in your managed Redis dashboard to protect delayed exam jobs.`;
      if (env.REDIS_REQUIRE_NOEVICTION) throw new Error(message);
      console.warn(`WARNING: ${message}`);
      return current;
    }
  }
  const confirmedInfo = await redis.info("memory");
  const confirmed = confirmedInfo.match(/^maxmemory_policy:(.+)$/m)?.[1]?.trim();
  if (confirmed !== "noeviction") {
    const message = `Redis maxmemory-policy remains "${confirmed || "unknown"}". BullMQ requires "noeviction".`;
    if (env.REDIS_REQUIRE_NOEVICTION) throw new Error(message);
    console.warn(`WARNING: ${message}`);
  }
  return confirmed;
};

export const getExamQueue = () => {
  examQueue ??= new Queue("argus-exam-jobs", { connection: getConnection(), skipVersionCheck: true });
  return examQueue;
};

export const scheduleExpiry = (attemptId, expiresAt) => getExamQueue().add("expire-attempt", { attemptId }, {
  jobId: `expiry-${attemptId}`,
  delay: Math.max(new Date(expiresAt).getTime() - Date.now(), 0),
  removeOnComplete: true,
  attempts: 3
});

export const scheduleReminder = (examId, scheduledFor) => getExamQueue().add("exam-reminder", { examId }, {
  jobId: `reminder-${examId}`,
  delay: Math.max(new Date(scheduledFor).getTime() - Date.now(), 0),
  removeOnComplete: true
});

export const startJobWorker = (processor) => new Worker("argus-exam-jobs", processor, { connection: getConnection(), skipVersionCheck: true });
export const closeQueue = async () => {
  if (examQueue) await examQueue.close();
  if (connection) await connection.quit();
};
