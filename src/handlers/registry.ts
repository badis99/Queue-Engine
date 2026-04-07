import { getRedisClient } from "../config/redis";
import { jobFromHash } from "../queue/jobHash";
import { keys } from "../queue/keys";
import { Payload } from "../queue/types";
import { cleanupHandler } from "./cleanup.handler";
import { dbVacuumHandler } from "./db-vacuum.handler";
import { emailHandler } from "./email.handler";
import { webhookHandler } from "./webhook.handler";

type Handler = (payload: Payload) => Promise<void>;

const registry: Record<string, Handler> = {
  email: async (payload) => emailHandler(payload as { receiver: string; subject: string; message: string }),
  webhook: async (payload) => webhookHandler(payload as { url: string; method: "GET" | "POST" | "PUT" | "DELETE"; headers: Record<string, string>; body: string }),
  cleanup: async (payload) => cleanupHandler(payload as { path: string; maxAgeMinutes?: number }),
  "db-vacuum": async () => dbVacuumHandler()
};

export async function runRegisteredHandler(jobName: string, payload: Payload): Promise<void> {
  const handler = registry[jobName];
  if (!handler) {
    throw new Error(`No handler registered for job '${jobName}'`);
  }

  await handler(payload);
}

export async function handleRegisteredJob(jobId: string): Promise<void> {
  const redis = await getRedisClient();
  const hash = await redis.hGetAll(keys.dataHash(jobId));
  const job = jobFromHash(hash);

  if (!job) {
    throw new Error(`Job '${jobId}' not found or malformed`);
  }

  await runRegisteredHandler(job.name, job.payload);

  await redis.hSet(keys.dataHash(job.id), {
    status: "SUCCESS"
  });
}
