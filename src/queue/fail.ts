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

    const deadQueueLength: number = await redis.zCard(keys.dead());

    if(deadQueueLength > 100){
        const lastJobQueuedInDeadQueue = await redis.zRangeWithScores(keys.dead(),-1,-1); 

        await redis.zAdd(keys.pending(),{
            value : lastJobQueuedInDeadQueue[0].value,
            score : Date.now()
        });

        await redis.zRem(keys.dead(),lastJobQueuedInDeadQueue[0].value);
    }
}