import { enqueueJob } from "../queue/enqueue";
import { Job, Payload } from "../queue/types";
import { keys } from "../queue/keys";
import { getRedisClient } from "../config/redis";
import { jobFail } from "../queue/fail";
import { handleJob } from "../handler/handler";
import { claimJob } from "../queue/claim";

export async function Jobworker() {
    const redis = await getRedisClient();

    const payload1: Payload = {
        receiver: "user1@user.com",
        subject: "The keyboard",
        message: "Bring me the keyboard next time"
    }
    
    const payload2: Payload = {
        receiver: "user2@user.com",
        subject: "The Mouse",
        message: "Bring me the mouse next time"
    }   

    const job1: Job = await enqueueJob("email", payload1,1);
    const job2: Job = await enqueueJob("email", payload2);

    const DebutPendingSet = await redis.zRangeWithScores(keys.pending(),0,-1);
    console.log(DebutPendingSet);

    while(true){
        const pendingCount = await redis.zCard(keys.pending());
        if (pendingCount === 0) {
            break;
        }

        const claimedJobId = await claimJob();

        if(!claimedJobId){
            const nextPendingJob = await redis.zRangeWithScores(keys.pending(), 0, 0);
            if (nextPendingJob.length === 0) {
                break;
            }

            const waitMs = Math.max(0, nextPendingJob[0].score - Date.now());
            await new Promise((resolve) => setTimeout(resolve, Math.min(waitMs, 200)));
            continue;
        }

        try {
            await handleJob(claimedJobId);
            await redis.zRem(keys.processing(), claimedJobId);
        } catch (error) {
            await jobFail(claimedJobId);
        }
    }

    const DebutProcessingSet = await redis.zRangeWithScores(keys.processing(),0,-1);
    console.log(DebutProcessingSet);

    const deadQueuedJobs = await redis.zRangeWithScores(keys.dead(),0,-1);
    console.log(deadQueuedJobs);
}