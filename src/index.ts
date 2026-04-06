import { getRedisClient } from "./config/redis";
import { Payload } from "./queue/types";
import { scheduleJob, startScheduler, stopScheduler } from "./scheduler/scheduler";
import { keys } from "./queue/keys";
import { Jobworker } from "./worker/worker";

function logApp(message: string): void {
    console.log(`[app ${new Date().toISOString()}] ${message}`);
}

async function printSnapshot(label: string): Promise<void> {
    const redis = await getRedisClient();
    const pendingCount = await redis.zCard(keys.pending());
    const recurring = await redis.zRangeWithScores(keys.recurring(), 0, -1);

    logApp(`${label} pending=${pendingCount}`);
    logApp(`${label} recurring=${JSON.stringify(recurring)}`);
}

async function main() {
    const redis = await getRedisClient();
    await redis.FLUSHALL();
    logApp("Redis cleared");

    const payload1: Payload = {
        receiver: "user1@user.com",
        subject: "The keyboard",
        message: "Bring me the keyboard next time"
    };
        
    const payload2: Payload = {
        receiver: "user2@user.com",
        subject: "The Mouse",
        message: "Bring me the mouse next time"
    };
    
    await scheduleJob("email1", payload1, "* * * * *", { priority: 1 });
    await scheduleJob("email2", payload2, "*/2 * * * *", { priority: 0 });

    await printSnapshot("before-start");
    await startScheduler();

    await printSnapshot("after-start");

    let workerRunning = false;
    const workerLoop = setInterval(() => {
        if (workerRunning) {
            return;
        }

        workerRunning = true;
        void Jobworker()
            .catch((error) => {
                console.error("Jobworker failed:", error);
            })
            .finally(() => {
                workerRunning = false;
            });
    }, 2000);

    const observer = setInterval(() => {
        void printSnapshot("tick");
    }, 10000);

    setTimeout(async () => {
        clearInterval(workerLoop);
        clearInterval(observer);
        stopScheduler();
        await printSnapshot("final");
        logApp("Demo completed, exiting process");
        process.exit(0);
    }, 121000);
}

main().catch((err) => {
  console.error("Failed to enqueue job:", err);
  process.exit(1);
});
