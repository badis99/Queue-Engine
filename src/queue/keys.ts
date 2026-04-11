export const keys = {
    pending: () => `queue:pending`,
    processing: () => `queue:processing`,
    recurring: () => `queue:recurring`,
    recurringDefinitions: () => `queue:recurring:definitions`,
    recurringLock: (name: string, score: number) => `queue:recurring:lock:${name}:${score}`,
    dead: () => `queue:dead`,
    dataHash: (id: string) => `job:${id}`,
    history: (id: string) => `job:history:${id}`,
};