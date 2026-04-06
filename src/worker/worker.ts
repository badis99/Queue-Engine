import { keys } from "../queue/keys";
import { getRedisClient } from "../config/redis";
import { jobFail } from "../queue/fail";
import { handleJob } from "../handler/handler";
import { claimJob } from "../queue/claim";
import { stallDetector } from "./stall_detector";
import { Semaphore } from "./semaphore";

export async function Jobworker() {
    const redis = await getRedisClient();
    const stallPoller = setInterval(() => {
        stallDetector().catch((error) => {
            console.error("stallDetector failed:", error);
        });
    }, 1000);

    const semaphore = new Semaphore(1);

    try {
        while(true){
            const pendingCount = await redis.zCard(keys.pending());
            const processingCount = await redis.zCard(keys.processing());

            if (pendingCount === 0 && processingCount === 0) {
                break;
            }

            const claimedJobId = await claimJob();

            if(!claimedJobId){
                await new Promise((resolve) => setTimeout(resolve, 200));
                continue;
            }

            const jobHash = await redis.hGetAll(keys.dataHash(claimedJobId));

            await semaphore.acquire();

            try {
                await handleJob(claimedJobId);
                await redis.zRem(keys.processing(), claimedJobId);
            } catch (error) {
                await jobFail(claimedJobId);
            } finally {
                semaphore.release();
            }
        }
    } finally {
        clearInterval(stallPoller);
    }

    // const DebutProcessingSet = await redis.zRangeWithScores(keys.processing(),0,-1);
    // console.log(DebutProcessingSet);

    // const deadQueuedJobs = await redis.zRangeWithScores(keys.dead(),0,-1);
    // console.log(deadQueuedJobs);
}