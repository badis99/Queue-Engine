import { Payload, RecurringJob } from "../queue/types";
import { keys } from "../queue/keys";
import { getRedisClient } from "../config/redis";
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

async function loadRecurringDefinitions(): Promise<RecurringJob[]> {
    const redis = await getRedisClient();
    const definitions = await redis.hGetAll(keys.recurringDefinitions());

    const jobs: RecurringJob[] = [];
    for (const rawDefinition of Object.values(definitions)) {
        try {
            jobs.push(JSON.parse(rawDefinition) as RecurringJob);
        } catch {
            
        }
    }

    return jobs;
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

        const lockKey = `queue:recurring:lock:${entry.value}:${entry.score}`;
        const lockToken = await acquireLock(lockKey, 60);
        if (!lockToken) {
            logScheduler(`Skipped ${entry.value}: lock not acquired (another instance handled it)`);
            continue;
        }

        try {
        const rawDefinition = await redis.hGet(keys.recurringDefinitions(), entry.value);
        if (!rawDefinition) {
            await redis.zRem(keys.recurring(), entry.value);
            continue;
        }

        let definition: RecurringJob;
        try {
            definition = JSON.parse(rawDefinition) as RecurringJob;
        } catch {
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
    options?: { priority?: number; paused?: boolean }
): Promise<void> {
    const redis = await getRedisClient();
    const definition: RecurringJob = { name, payload, cron, options: { priority: options?.priority, paused: options?.paused ?? false } };

    await redis.hSet(keys.recurringDefinitions(), {
        [name]: JSON.stringify(definition)
    });
    logScheduler(`Registered recurring definition ${name} with cron '${cron}'`);

    const next = nextRun(cron, new Date());

    if (definition.options?.paused) {
        await redis.zRem(keys.recurring(), name);
        logScheduler(`Registered ${name} as paused recurring definition`);
        if (schedulerRunning) {
            await refreshSoonestTimer();
        }
        return;
    }

    if (!next) {
        await redis.zRem(keys.recurring(), name);
        logScheduler(`Removed ${name} from recurring schedule: invalid next run`);
        if (schedulerRunning) {
            await refreshSoonestTimer();
        }
        return;
    }

    await redis.zAdd(keys.recurring(), {
        value: name,
        score: next.getTime()
    });
    logScheduler(`Scheduled ${name} for first run at ${next.toISOString()}`);

    if (schedulerRunning) {
        await refreshSoonestTimer();
    }

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
    const redis = await getRedisClient();
    const definitions = await loadRecurringDefinitions();

    const views = await Promise.all(
        definitions.map(async (definition) => {
            const paused = definition.options?.paused ?? false;
            const nextScore = await redis.zScore(keys.recurring(), definition.name);

            return {
                name: definition.name,
                cron: definition.cron,
                payload: definition.payload,
                priority: definition.options?.priority ?? 0,
                paused,
                nextRunAt: paused ? null : nextScore
            };
        })
    );

    views.sort((a, b) => {
        const aTime = a.nextRunAt ?? Number.MAX_SAFE_INTEGER;
        const bTime = b.nextRunAt ?? Number.MAX_SAFE_INTEGER;
        return aTime - bTime;
    });

    return views;
}

export async function pauseRecurringJob(name: string): Promise<void> {
    const redis = await getRedisClient();
    const rawDefinition = await redis.hGet(keys.recurringDefinitions(), name);
    if (!rawDefinition) {
        throw new Error(`Recurring job '${name}' was not found`);
    }

    const definition = JSON.parse(rawDefinition) as RecurringJob;
    definition.options = {
        ...definition.options,
        paused: true
    };

    await redis.hSet(keys.recurringDefinitions(), {
        [name]: JSON.stringify(definition)
    });
    await redis.zRem(keys.recurring(), name);

    if (schedulerRunning) {
        await refreshSoonestTimer();
    }
}

export async function resumeRecurringJob(name: string): Promise<void> {
    const redis = await getRedisClient();
    const rawDefinition = await redis.hGet(keys.recurringDefinitions(), name);
    if (!rawDefinition) {
        throw new Error(`Recurring job '${name}' was not found`);
    }

    const definition = JSON.parse(rawDefinition) as RecurringJob;
    definition.options = {
        ...definition.options,
        paused: false
    };

    const next = nextRun(definition.cron, new Date());
    if (!next) {
        throw new Error(`Unable to compute next run for '${name}'`);
    }

    await redis.hSet(keys.recurringDefinitions(), {
        [name]: JSON.stringify(definition)
    });

    await redis.zAdd(keys.recurring(), {
        value: name,
        score: next.getTime()
    });

    if (schedulerRunning) {
        await refreshSoonestTimer();
    }
}

export async function deleteRecurringJob(name: string): Promise<void> {
    const redis = await getRedisClient();
    await redis.hDel(keys.recurringDefinitions(), name);
    await redis.zRem(keys.recurring(), name);

    if (schedulerRunning) {
        await refreshSoonestTimer();
    }
}