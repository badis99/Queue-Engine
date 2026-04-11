import { Payload, RecurringJob } from "../queue/types";
import { keys } from "../queue/keys";
import { getRedisClient } from "../config/redis";
import { db } from "../config/db";
import { nextRun } from "./cron-parser";
import { enqueueJob } from "../queue/enqueue";
import { acquireLock, releaseLock } from "./lock";

let schedulerTimer: NodeJS.Timeout | null = null;
let schedulerRunning = false;

function logScheduler(message: string): void {
    console.log(`[scheduler ${new Date().toISOString()}] ${message}`);
}

function clearSchedulerTimer(): void {
    if (schedulerTimer) {
        clearTimeout(schedulerTimer);
        schedulerTimer = null;
    }
}

type RecurringJobRow = {
    name: string;
    cron: string;
    payload: Payload;
    priority: number;
    paused: boolean;
    next_run_at: Date | null;
};

type ScheduleJobOptions = {
    priority?: number;
    paused?: boolean;
};

function toRecurringJob(row: RecurringJobRow): RecurringJob {
    return {
        name: row.name,
        cron: row.cron,
        payload: row.payload,
        options: {
            priority: row.priority,
            paused: row.paused
        }
    };
}

async function refreshTimerIfRunning(): Promise<void> {
    if (schedulerRunning) {
        await refreshSoonestTimer();
    }
}

async function loadRecurringDefinitions(): Promise<RecurringJob[]> {
    const result = await db.query<RecurringJobRow>(
        `SELECT name, cron, payload, priority, paused, next_run_at
         FROM recurring_jobs`
    );

    return result.rows.map(toRecurringJob);
}

async function getRecurringDefinitionByName(name: string): Promise<RecurringJob | null> {
    const result = await db.query<RecurringJobRow>(
        `SELECT name, cron, payload, priority, paused, next_run_at
         FROM recurring_jobs
         WHERE name = $1`,
        [name]
    );

    const row = result.rows[0];
    if (!row) {
        return null;
    }

    return toRecurringJob(row);
}

async function rebuildScheduleFromDefinitions(now: Date = new Date()): Promise<void> {
    const redis = await getRedisClient();
    const definitions = await loadRecurringDefinitions();

    await redis.del(keys.recurring());

    for (const job of definitions) {
        if (job.options?.paused) {
            logScheduler(`Skipping ${job.name}: recurring definition is paused`);
            continue;
        }

        const next = nextRun(job.cron, now);
        if (!next) {
            logScheduler(`Skipping ${job.name}: unable to compute next run from cron '${job.cron}'`);
            continue;
        }

        await redis.zAdd(keys.recurring(), {
            value: job.name,
            score: next.getTime()
        });
        logScheduler(`Rebuilt schedule for ${job.name}, next run at ${next.toISOString()}`);
    }
}

async function refreshSoonestTimer(): Promise<void> {
    if (!schedulerRunning) {
        return;
    }

    const redis = await getRedisClient();
    clearSchedulerTimer();

    const soonest = (await redis.zRangeWithScores(keys.recurring(), 0, 0))[0];
    if (!soonest) {
        logScheduler("No recurring jobs found; timer not armed");
        return;
    }

    const delayMs = Math.max(0, soonest.score - Date.now());
    logScheduler(`Timer armed for ${soonest.value} in ${delayMs}ms`);
    schedulerTimer = setTimeout(() => {
        void onTimerFired();
    }, delayMs);
}

async function onTimerFired(): Promise<void> {
    if (!schedulerRunning) {
        return;
    }

    const redis = await getRedisClient();
    const nowMs = Date.now();
    const scheduled = await redis.zRangeWithScores(keys.recurring(), 0, -1);
    const due = scheduled.filter((entry) => entry.score <= nowMs);
    logScheduler(`Timer fired. Due jobs count: ${due.length}`);

    for (const entry of due) {
        const currentScore = await redis.zScore(keys.recurring(), entry.value);
        if (currentScore === null || currentScore !== entry.score) {
            continue;
        }

        const lockKey = keys.recurringLock(entry.value, entry.score);
        const lockToken = await acquireLock(lockKey, 60);
        if (!lockToken) {
            logScheduler(`Skipped ${entry.value}: lock not acquired (another instance handled it)`);
            continue;
        }

        try {
            const definition = await getRecurringDefinitionByName(entry.value);
            if (!definition) {
                await redis.zRem(keys.recurring(), entry.value);
                continue;
            }

            if (definition.options?.paused) {
                await redis.zRem(keys.recurring(), definition.name);
                logScheduler(`Skipped ${definition.name}: recurring definition is paused`);
                continue;
            }

            const priority = definition.options?.priority ?? 0;
            await enqueueJob(definition.name, definition.payload, priority);
            logScheduler(`Enqueued recurring job ${definition.name} with priority ${priority}`);

            const next = nextRun(definition.cron, new Date(nowMs));
            if (!next) {
                await redis.zRem(keys.recurring(), definition.name);
                logScheduler(`Removed ${definition.name}: unable to compute next run`);
                continue;
            }

            await redis.zAdd(keys.recurring(), {
                value: definition.name,
                score: next.getTime()
            });
            await db.query(
                `UPDATE recurring_jobs
                 SET last_run_at = NOW(),
                     next_run_at = to_timestamp($2 / 1000.0),
                     updated_at = NOW()
                 WHERE name = $1`,
                [definition.name, next.getTime()]
            );
            logScheduler(`Rescheduled ${definition.name} for ${next.toISOString()}`);
        } finally {
            await releaseLock(lockKey, lockToken);
        }
    }

    await refreshSoonestTimer();
}

export async function startScheduler(): Promise<void> {
    if (schedulerRunning) {
        logScheduler("startScheduler called, but scheduler is already running");
        return;
    }

    schedulerRunning = true;
    logScheduler("Scheduler starting...");
    await rebuildScheduleFromDefinitions();
    await refreshSoonestTimer();
}

export function stopScheduler(): void {
    schedulerRunning = false;
    clearSchedulerTimer();
    logScheduler("Scheduler stopped");
}

export async function scheduleJob(
    name: string,
    payload: Payload,
    cron: string,
    options?: ScheduleJobOptions
): Promise<void> {
    const redis = await getRedisClient();
    const definition: RecurringJob = { name, payload, cron, options: { priority: options?.priority, paused: options?.paused ?? false } };

    await db.query(
        `INSERT INTO recurring_jobs (name, cron, payload, priority, paused, next_run_at)
         VALUES ($1, $2, $3::jsonb, $4, $5, NULL)
         ON CONFLICT (name)
         DO UPDATE SET
            cron = EXCLUDED.cron,
            payload = EXCLUDED.payload,
            priority = EXCLUDED.priority,
            paused = EXCLUDED.paused,
            updated_at = NOW()`,
        [
            name,
            cron,
            JSON.stringify(payload),
            definition.options?.priority ?? 0,
            definition.options?.paused ?? false
        ]
    );
    logScheduler(`Registered recurring definition ${name} with cron '${cron}'`);

    const next = nextRun(cron, new Date());

    if (definition.options?.paused) {
        await redis.zRem(keys.recurring(), name);
        logScheduler(`Registered ${name} as paused recurring definition`);
        await refreshTimerIfRunning();
        return;
    }

    if (!next) {
        await redis.zRem(keys.recurring(), name);
        logScheduler(`Removed ${name} from recurring schedule: invalid next run`);
        await refreshTimerIfRunning();
        return;
    }

    await redis.zAdd(keys.recurring(), {
        value: name,
        score: next.getTime()
    });
    await db.query(
        `UPDATE recurring_jobs
         SET next_run_at = to_timestamp($2 / 1000.0),
             updated_at = NOW()
         WHERE name = $1`,
        [name, next.getTime()]
    );
    logScheduler(`Scheduled ${name} for first run at ${next.toISOString()}`);

    await refreshTimerIfRunning();

}

export type RecurringJobView = {
    name: string;
    cron: string;
    payload: Payload;
    priority: number;
    paused: boolean;
    nextRunAt: number | null;
};

export async function listRecurringJobs(): Promise<RecurringJobView[]> {
    const result = await db.query<RecurringJobRow>(
        `SELECT name, cron, payload, priority, paused, next_run_at
         FROM recurring_jobs`
    );

    const views = result.rows.map((row) => ({
        name: row.name,
        cron: row.cron,
        payload: row.payload,
        priority: row.priority,
        paused: row.paused,
        nextRunAt: row.next_run_at ? row.next_run_at.getTime() : null
    }));

    views.sort((a, b) => {
        const aTime = a.nextRunAt ?? Number.MAX_SAFE_INTEGER;
        const bTime = b.nextRunAt ?? Number.MAX_SAFE_INTEGER;
        return aTime - bTime;
    });

    return views;
}

export async function pauseRecurringJob(name: string): Promise<void> {
    const redis = await getRedisClient();
    const definition = await getRecurringDefinitionByName(name);
    if (!definition) {
        throw new Error(`Recurring job '${name}' was not found`);
    }

    await db.query(
        `UPDATE recurring_jobs
         SET paused = true,
             next_run_at = NULL,
             updated_at = NOW()
         WHERE name = $1`,
        [name]
    );
    await redis.zRem(keys.recurring(), name);

    await refreshTimerIfRunning();
}

export async function resumeRecurringJob(name: string): Promise<void> {
    const redis = await getRedisClient();
    const definition = await getRecurringDefinitionByName(name);
    if (!definition) {
        throw new Error(`Recurring job '${name}' was not found`);
    }

    const next = nextRun(definition.cron, new Date());
    if (!next) {
        throw new Error(`Unable to compute next run for '${name}'`);
    }

    await db.query(
        `UPDATE recurring_jobs
         SET paused = false,
             next_run_at = to_timestamp($2 / 1000.0),
             updated_at = NOW()
         WHERE name = $1`,
        [name, next.getTime()]
    );

    await redis.zAdd(keys.recurring(), {
        value: name,
        score: next.getTime()
    });

    await refreshTimerIfRunning();
}

export async function deleteRecurringJob(name: string): Promise<void> {
    const redis = await getRedisClient();
    await db.query(`DELETE FROM recurring_jobs WHERE name = $1`, [name]);
    await redis.zRem(keys.recurring(), name);

    await refreshTimerIfRunning();
}