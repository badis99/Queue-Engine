import { getRedisClient } from "../config/redis";
import { runRegisteredHandler } from "../handlers/registry";
import { jobFromHash } from "../queue/jobHash";
import { keys } from "../queue/keys";

export async function handleJob(jobId: string): Promise<void> {
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