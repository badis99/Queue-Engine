export const keys = {
    pending: () => `queue:pending`,
    processing: () => `queue:processing`,
    dead: () => `queue:dead`,
    dataHash : (id : string) => `job:${id}`,
    history: (id: string) => `job:history:${id}`,
}