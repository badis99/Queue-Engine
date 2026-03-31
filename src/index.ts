import { createClient } from "redis";
import { enqueueJob } from "./queue/enqueue";
import { env } from "./config/env";
import { Job } from "./queue/types";
import { keys } from "./queue/keys";
import { exit } from "node:process";

const redis = createClient({ url: env.REDIS_URL });

redis.connect().catch(err => {
    console.error("Presence Redis connection failed:", err);
    process.exit(1);
});

const payload = {
    receiver: "hama@user.com",
    subject: "Hama",
    message: "Hama mezyen"
}

async function main() {
    await redis.FLUSHALL();
    const job2: Job = await enqueueJob("email", payload,1);
    const job1: Job = await enqueueJob("email", payload);
    const pendingJob1 = await redis.hGetAll(keys.dataHash(job1.id));
    const pendingJob2 = await redis.hGetAll(keys.dataHash(job2.id));
    console.log(pendingJob1);
    console.log(pendingJob2);
    const currentSet = await redis.zRangeWithScores(keys.pending(),0,-1);
    console.log(currentSet);
    return;
}

main().catch((err) => {
  console.error("Failed to enqueue job:", err);
  process.exit(1);
});
