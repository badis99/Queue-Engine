import { getRedisClient } from "../config/redis";
import { jobFromHash } from "../queue/jobHash";
import { keys } from "../queue/keys";

export async function stallDetector():Promise<void> {
    const redis = await getRedisClient();

    const currentProcessingJobs = await redis.zRangeWithScores(keys.processing(),0,-1);

    for(let i = 0;i < currentProcessingJobs.length;i++){
        const jobId = currentProcessingJobs[i].value;
        const jobHash = await redis.hGetAll(keys.dataHash(jobId));
        const job = jobFromHash(jobHash);

        if(!job){
            continue;
        }

        const timeout = Number(job.timeout);
        const maxRetries = Number(job.maxRetries);

        if (Number.isNaN(timeout) || Number.isNaN(maxRetries)) {
            continue;
        }

        const time: number = currentProcessingJobs[i].score + timeout;

        if(time < Date.now()){
            const attempts = await redis.hIncrBy(keys.dataHash(jobId), "attempts", 1);

            await redis.zRem(keys.processing(), jobId);

            if(attempts > maxRetries){
                console.log(`Job:${jobId} is Going to the DLQ.GOOD BYEE !!!!!!`);
                
                await redis.zAdd(keys.dead(),{
                    value : jobId,
                    score : Date.now()
                });
                continue;
            }

            console.log(`Job:${jobId} is detected stalled and it's now moving to Pending again`);
            await redis.zAdd(keys.pending(),{
                value : jobId,
                score : Date.now()
            });
        }
        
    }
}