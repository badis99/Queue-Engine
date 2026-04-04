import { enqueueJob } from "../queue/enqueue";
import { Job, Payload } from "../queue/types";
import { keys } from "../queue/keys";
import { getRedisClient } from "../config/redis";
import { jobFail } from "../queue/fail";
import { handleJob,  hang_test} from "../handler/handler";
import { claimJob } from "../queue/claim";
import { stallDetector } from "./stall_detector";

export async function Jobworker() {
    const redis = await getRedisClient();
    const stallPoller = setInterval(() => {
        stallDetector().catch((error) => {
            console.error("stallDetector failed:", error);
        });
    }, 1000);

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
    // const job2: Job = await enqueueJob("email", payload2);

    const DebutPendingSet = await redis.zRangeWithScores(keys.pending(),0,-1);
    console.log(DebutPendingSet);

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
            const timeoutMs = Number(jobHash.timeout) || 5000;

            try {
                await Promise.race([
                    hang_test("Email"),
                    new Promise<never>((_, reject) => {
                        setTimeout(() => reject(new Error("Job handler timeout")), timeoutMs + 5000);
                    })
                ]);

                await redis.zRem(keys.processing(), claimedJobId);
            } catch (error) {
                await jobFail(claimedJobId);
            }
        }
    } finally {
        clearInterval(stallPoller);
    }

    const DebutProcessingSet = await redis.zRangeWithScores(keys.processing(),0,-1);
    console.log(DebutProcessingSet);

    const deadQueuedJobs = await redis.zRangeWithScores(keys.dead(),0,-1);
    console.log(deadQueuedJobs);
}