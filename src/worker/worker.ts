import { createClient } from "redis";
import { claimJob } from "../queue/claim";
import { env } from "../config/env";
import { enqueueJob } from "../queue/enqueue";
import { Job } from "../queue/types";
import { keys } from "../queue/keys";
import { jobFromHash } from "../queue/jobHash";

const redis = createClient({ url: env.REDIS_URL });

redis.connect().catch(err => {
  console.error("Presence Redis connection failed:", err);
  process.exit(1);
});

export async function Jobworker() {
    const payload1 = {
        receiver: "user1@user.com",
        subject: "The keyboard",
        message: "Bring me the keyboard next time"
    }
    
    const payload2 = {
        receiver: "user2@user.com",
        subject: "The Mouse",
        message: "Bring me the mouse next time"
    }   

    const job1: Job = await enqueueJob("email", payload1,1);
    const job2: Job = await enqueueJob("email", payload2);

    const DebutProcessingSet = await redis.zRangeWithScores(keys.processing(),0,-1);
    console.log(DebutProcessingSet);

    for(let i:number = 0;i < 2;i++){
        const claimedJobId = await claimJob();
        if(!claimedJobId){
            return;
        }
        const jobProcessedHash = await redis.hGetAll(keys.dataHash(claimedJobId));
        const jobProcessed = jobFromHash(jobProcessedHash);

        if(!jobProcessed){
            console.log(`Job of id:${claimedJobId} is not found`);
        }
        console.log(jobProcessed?.payload);
        const currentProcessingSet = await redis.zRangeWithScores(keys.processing(),0,-1);
        console.log(currentProcessingSet);
        
    }
}