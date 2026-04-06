type EmailPayload = {
    receiver: string,
    subject: string,
    message: string
};

type CleanupPayload = {
    path: string,
    maxAgeMinutes?: number
};

type dbPayload = {
    table: string
};

type WebhookPayload = {
    url: string,
    method: "GET" | "POST" | "PUT" | "DELETE",
    headers: Record<string, string>,
    body: string
};

export type Payload = EmailPayload | CleanupPayload | dbPayload | WebhookPayload;

export type Job = {
    id: string,
    name: string,
    payload: Payload, 
    status: "PENDING" | "PROCESSING" | "SUCCESS" | "DEAD",
    priorty: number,
    createdAt: number,
    runAt: number,
    attempts: number,
    maxRetries: number,
    timeout: number
}

export type RecurringJob = {
    name: string,
    payload: Payload, 
    cron: string,
    options?: {
        priority?: number,
        paused?: boolean
    }
}