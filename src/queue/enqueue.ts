import { Job, Payload } from "./types";
import { v4 as uuidv4 } from "uuid";
import { keys } from "./keys";
import { createClient } from "redis";
import { env } from "../config/env";

const redis = createClient({ url: env.REDIS_URL });

redis.connect().catch(err => {
  console.error("Presence Redis connection failed:", err);
  process.exit(1);
});

export async function enqueueJob(jobName: string,payload: Payload, priority: number = 0): Promise<Job> {
    const newJob: Job = {
        id: uuidv4(),
        name: jobName,
        payload : payload,
        status: "PENDING",
        priorty: priority,
        createdAt: new Date(),
        runAt: Date.now(),
        attempts: 0,
        maxRetries: 5,
        timeout: 5000
    }

    await redis.hSet(
        keys.dataHash(newJob.id),
        newJob.id,
        JSON.stringify(newJob)
    );

    await redis.zAdd(
        keys.pending(),
        {
            score : newJob.runAt,
            value : JSON.stringify(newJob)
        }
    )

    return newJob;

}