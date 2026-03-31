export type EmailPayload = {
    receiver: string,
    subject: string,
    message: string
}

export type CleanupPayload = {
    path: string
}

export type dbPayload = {
    table: string
}

export type WebhookPayload = {
    url: string,
    method: "GET" | "POST" | "PUT" | "DELETE",
    headers: Record<string, string>,
    body: string
}

export type Job = {
    id: string,
    name: string,
    payload: EmailPayload | CleanupPayload | WebhookPayload, 
    status: "PENDING" | "PROCESSING" | "SUCCESS" | "DEAD",
    priorty: string,
    createdAt: Date,
    runAt: Date,
    attempts: number,
    maxRetries: number,
    timeout: number
}