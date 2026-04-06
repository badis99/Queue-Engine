import { db } from "../config/db";
import { getRedisClient } from "../config/redis";
import { jobFromHash } from "../queue/jobHash";
import { keys } from "../queue/keys";

export type StatsSnapshot = {
  counts: {
    pending: number;
    processing: number;
    dead: number;
    recurring: number;
  };
  recentRuns: Array<{
    id: number;
    job_id: string;
    job_name: string;
    status: string;
    message: string | null;
    run_at: string;
  }>;
  deadJobs: Array<{
    id: string;
    score: number;
  }>;
};

export async function getStatsSnapshot(): Promise<StatsSnapshot> {
  const redis = await getRedisClient();

  const [pending, processing, dead, recurring, deadJobs] = await Promise.all([
    redis.zCard(keys.pending()),
    redis.zCard(keys.processing()),
    redis.zCard(keys.dead()),
    redis.zCard(keys.recurring()),
    redis.zRangeWithScores(keys.dead(), 0, 49)
  ]);

  const recentRuns = await getRecentRuns();

  return {
    counts: { pending, processing, dead, recurring },
    recentRuns,
    deadJobs: deadJobs.map((entry) => ({ id: entry.value, score: entry.score }))
  };
}

export type ControlRoomPayload = {
  stats: {
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    dead: number;
  };
  jobs: Array<{
    id: string;
    name: string;
    status: "pending" | "processing" | "completed" | "failed" | "dead";
    attempts: number;
    maxRetries: number;
    createdAt: number;
  }>;
  workers: Array<{ utilization: number }>;
  avgDurationMs?: number;
};

export async function getControlRoomPayload(): Promise<ControlRoomPayload> {
  const redis = await getRedisClient();
  const [pendingRaw, processingRaw, deadRaw, recentRuns] = await Promise.all([
    redis.zRange(keys.pending(), 0, 99),
    redis.zRange(keys.processing(), 0, 99),
    redis.zRange(keys.dead(), 0, 99),
    getRecentRuns()
  ]);

  const jobs: ControlRoomPayload["jobs"] = [];

  for (const id of pendingRaw) {
    const parsed = jobFromHash(await redis.hGetAll(keys.dataHash(id)));
    if (!parsed) continue;
    jobs.push({
      id: parsed.id,
      name: parsed.name,
      status: "pending",
      attempts: parsed.attempts,
      maxRetries: parsed.maxRetries,
      createdAt: parsed.createdAt
    });
  }

  for (const id of processingRaw) {
    const parsed = jobFromHash(await redis.hGetAll(keys.dataHash(id)));
    if (!parsed) continue;
    jobs.push({
      id: parsed.id,
      name: parsed.name,
      status: "processing",
      attempts: parsed.attempts,
      maxRetries: parsed.maxRetries,
      createdAt: parsed.createdAt
    });
  }

  for (const id of deadRaw) {
    const parsed = jobFromHash(await redis.hGetAll(keys.dataHash(id)));
    if (!parsed) continue;
    jobs.push({
      id: parsed.id,
      name: parsed.name,
      status: "dead",
      attempts: parsed.attempts,
      maxRetries: parsed.maxRetries,
      createdAt: parsed.createdAt
    });
  }

  const completed = recentRuns.filter((r) => r.status === "SUCCESS").length;
  const failed = recentRuns.filter((r) => r.status === "FAILED").length;

  for (const run of recentRuns) {
    const parsed = jobFromHash(await redis.hGetAll(keys.dataHash(run.job_id)));

    jobs.push({
      id: run.job_id,
      name: run.job_name,
      status: run.status === "SUCCESS" ? "completed" : "failed",
      attempts: parsed?.attempts ?? 0,
      maxRetries: parsed?.maxRetries ?? 0,
      createdAt: Date.parse(run.run_at)
    });
  }

  return {
    stats: {
      pending: pendingRaw.length,
      processing: processingRaw.length,
      completed,
      failed,
      dead: deadRaw.length
    },
    jobs,
    workers: [],
    avgDurationMs: undefined
  };
}

async function getRecentRuns(): Promise<StatsSnapshot["recentRuns"]> {
  try {
    const result = await db.query<{
      id: number;
      job_id: string;
      job_name: string;
      status: string;
      message: string | null;
      run_at: Date;
    }>(
      `SELECT id, job_id, job_name, status, message, run_at
       FROM job_run_history
       ORDER BY run_at DESC
       LIMIT 50`
    );

    return result.rows.map((row) => ({
      id: row.id,
      job_id: row.job_id,
      job_name: row.job_name,
      status: row.status,
      message: row.message,
      run_at: row.run_at.toISOString()
    }));
  } catch {
    return [];
  }
}
