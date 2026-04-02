import { getRedisClient } from "../config/redis";
import { keys } from "./keys";

export async function jobFail(jobId: string): Promise<void> {
    const redis = await getRedisClient();

    const attempts: number = await redis.hIncrBy(keys.dataHash(jobId),"attempts",1);
    const job = await redis.hGetAll(keys.dataHash(jobId));
    const maxAttempts: number = Number(job.maxRetries);

    if(attempts <= maxAttempts){
        console.log(`This is the attempt number ${attempts} for the job of id:${job.id}`);
        const jilter:number = Math.random() * 1000;
        const retryAt = Date.now() + Math.pow(2, attempts) * 1000 + jilter;
        await redis.zRem(keys.processing(),jobId);

        await redis.zAdd(keys.pending(),{
            value : jobId,
            score : retryAt
        });

        return;
    }

    console.log(`The job of id:${job.id} is moving to the DEAD-QUEUE`);
    await redis.zRem(keys.processing(), jobId);
    await redis.del(keys.dataHash(job.id));
    await redis.zAdd(keys.dead(),{
        value : jobId,
        score : Date.now()
    })

}