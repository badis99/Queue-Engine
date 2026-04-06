import { Router } from "express";
import { getRedisClient } from "../config/redis";
import { keys } from "../queue/keys";
import { enqueueJob } from "../queue/enqueue";
import { jobFromHash } from "../queue/jobHash";
import {
  deleteRecurringJob,
  listRecurringJobs,
  pauseRecurringJob,
  resumeRecurringJob,
  scheduleJob
} from "../scheduler/scheduler";

export const jobsRouter = Router();

async function getJobsFromSet(setKey: string, status: "PENDING" | "PROCESSING" | "DEAD") {
  const redis = await getRedisClient();
  const items = await redis.zRangeWithScores(setKey, 0, 99);
  const jobs = [] as Array<{
    id: string;
    name: string;
    status: string;
    attempts: number;
    maxRetries: number;
    createdAt: number;
  }>;

  for (const item of items) {
    const hash = await redis.hGetAll(keys.dataHash(item.value));
    const parsed = jobFromHash(hash);
    if (!parsed) {
      continue;
    }

    jobs.push({
      id: parsed.id,
      name: parsed.name,
      status: status.toLowerCase(),
      attempts: parsed.attempts,
      maxRetries: parsed.maxRetries,
      createdAt: parsed.createdAt
    });
  }

  return jobs;
}

jobsRouter.get("/", async (_req, res) => {
  try {
    const [pending, processing, dead] = await Promise.all([
      getJobsFromSet(keys.pending(), "PENDING"),
      getJobsFromSet(keys.processing(), "PROCESSING"),
      getJobsFromSet(keys.dead(), "DEAD")
    ]);

    res.json({ jobs: [...pending, ...processing, ...dead] });
  } catch {
    res.status(500).json({ error: "Failed to load jobs" });
  }
});

jobsRouter.get("/dlq", async (_req, res) => {
  try {
    const redis = await getRedisClient();
    const dead = await redis.zRangeWithScores(keys.dead(), 0, 100);
    res.json({
      jobs: dead.map((entry) => ({ id: entry.value, score: entry.score }))
    });
  } catch {
    res.status(500).json({ error: "Failed to load DLQ jobs" });
  }
});

jobsRouter.post("/:id/retry", async (req, res) => {
  const { id } = req.params;

  try {
    const redis = await getRedisClient();
    const score = await redis.zScore(keys.dead(), id);

    if (score === null) {
      res.status(404).json({ error: "Job not found in DLQ" });
      return;
    }

    await redis.zRem(keys.dead(), id);
    await redis.zAdd(keys.pending(), {
      value: id,
      score: Date.now()
    });

    await redis.hSet(keys.dataHash(id), {
      status: "PENDING",
      runAt: String(Date.now())
    });

    res.json({ ok: true, id });
  } catch {
    res.status(500).json({ error: "Failed to retry job" });
  }
});

jobsRouter.post("/pending", async (req, res) => {
  const { name, payload, priority } = req.body;
  if (!name || typeof name !== "string") {
    res.status(400).json({ error: "Missing or invalid job name" });
    return;
  }

  try {
    const normalizedPayload = payload ?? {};
    const normalizedPriority = Number(priority ?? 0);

    const job = await enqueueJob(name, normalizedPayload, Number.isFinite(normalizedPriority) ? normalizedPriority : 0);
    res.status(201).json({ ok: true, job });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to enqueue pending job";
    res.status(500).json({ error: message });
  }
});

jobsRouter.post("/", async (req, res) => {
  const { name, payload, priority, maxRetries } = req.body;

  if (!name || typeof name !== "string") {
    res.status(400).json({ error: "Missing or invalid job name" });
    return;
  }

  try {
    const normalizedPayload = payload ?? {};
    const normalizedPriority = Number(priority ?? 0);

    const job = await enqueueJob(name, normalizedPayload, Number.isFinite(normalizedPriority) ? normalizedPriority : 0);

    if (Number.isFinite(Number(maxRetries))) {
      const retries = Math.max(0, Number(maxRetries));
      const redis = await getRedisClient();
      await redis.hSet(keys.dataHash(job.id), {
        maxRetries: String(retries)
      });
      job.maxRetries = retries;
    }

    res.status(201).json({ ok: true, job });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to enqueue job";
    res.status(500).json({ error: message });
  }
});

jobsRouter.delete("/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const redis = await getRedisClient();
    const inPending = await redis.zScore(keys.pending(), id);
    if (inPending === null) {
      res.status(404).json({ error: "Only pending jobs can be cancelled" });
      return;
    }

    await redis.zRem(keys.pending(), id);
    await redis.hSet(keys.dataHash(id), {
      status: "DEAD"
    });
    await redis.zAdd(keys.dead(), {
      value: id,
      score: Date.now()
    });

    res.json({ ok: true, id });
  } catch {
    res.status(500).json({ error: "Failed to cancel job" });
  }
});

jobsRouter.post("/recurring", async (req, res) => {
  const { name, payload, cron, priority } = req.body;
  if (!name || typeof name !== "string" || !cron || typeof cron !== "string") {
    res.status(400).json({ error: "Missing or invalid name/cron" });
    return;
  }

  try {
    const normalizedPayload = payload ?? {};
    const normalizedPriority = Number(priority ?? 0);

    await scheduleJob(name, normalizedPayload, cron, {
      priority: Number.isFinite(normalizedPriority) ? normalizedPriority : 0
    });

    res.status(201).json({ ok: true, name, cron });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to schedule recurring job";
    res.status(500).json({ error: message });
  }
});

jobsRouter.get("/recurring", async (_req, res) => {
  try {
    const jobs = await listRecurringJobs();
    res.json({ jobs });
  } catch {
    res.status(500).json({ error: "Failed to load recurring jobs" });
  }
});

jobsRouter.post("/recurring/:name/pause", async (req, res) => {
  const { name } = req.params;

  try {
    await pauseRecurringJob(name);
    res.json({ ok: true, name, paused: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to pause recurring job";
    res.status(400).json({ error: message });
  }
});

jobsRouter.post("/recurring/:name/resume", async (req, res) => {
  const { name } = req.params;

  try {
    await resumeRecurringJob(name);
    res.json({ ok: true, name, paused: false });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to resume recurring job";
    res.status(400).json({ error: message });
  }
});

jobsRouter.delete("/recurring/:name", async (req, res) => {
  const { name } = req.params;

  try {
    await deleteRecurringJob(name);
    res.json({ ok: true, name, deleted: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete recurring job";
    res.status(400).json({ error: message });
  }
});
