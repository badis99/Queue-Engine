import { createClient } from "redis";
import { enqueueJob } from "./queue/enqueue";
import { env } from "./config/env";
import { Job } from "./queue/types";
import { keys } from "./queue/keys";
import { exit } from "node:process";
import { claimJob } from "./queue/claim";

const redis = createClient({ url: env.REDIS_URL });

redis.connect().catch(err => {
    console.error("Presence Redis connection failed:", err);
    process.exit(1);
});

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

async function main() {
    await redis.FLUSHALL();
    const job1: Job = await enqueueJob("email", payload1,1);
    const job2: Job = await enqueueJob("email", payload2);
    const pendingBeforeClaim = await redis.zRangeWithScores(keys.pending(),0,-1);

    const claimedJobId = await claimJob();

    const pendingAfterClaim = await redis.zRangeWithScores(keys.pending(),0,-1);
    const processingAfterClaim = await redis.zRangeWithScores(keys.processing(),0,-1);

    console.log("First Job",job1);
    console.log("Second Job",job2);
    console.log("Pending before claim:", pendingBeforeClaim);
    console.log("Claimed job id:", claimedJobId);
    console.log("Pending after claim:", pendingAfterClaim);
    console.log("Processing after claim:", processingAfterClaim);
    return;
}

main().catch((err) => {
  console.error("Failed to enqueue job:", err);
  process.exit(1);
});
