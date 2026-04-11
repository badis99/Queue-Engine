import { getRedisClient } from "../config/redis";
import { keys } from "../queue/keys";
import { recordRunHistory } from "../queue/run-history";

export async function completeJob(jobId: string, jobName: string): Promise<void> {
    const redis = await getRedisClient();

    await redis.zRem(keys.processing(), jobId);
    await redis.hSet(keys.dataHash(jobId), {
        status: "done"
    });

    await recordRunHistory(jobId, jobName, "SUCCESS", null);
}
