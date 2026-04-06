export const keys = {
    pending: () => `queue:pending`,
    processing: () => `queue:processing`,
    recurring: () => `queue:recurring`,
    recurringDefinitions: () => `queue:recurring:definitions`,
    dead: () => `queue:dead`,
    dataHash : (id : string) => `job:${id}`,
    history: (id: string) => `job:history:${id}`,
}