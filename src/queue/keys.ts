export const keys = {
    pending: (id: string) => `queue:pending${id}`,
    processing: (id: string) => `queue:processing:${id}`,
    dead: (id: string) => `queue:dead:${id}`,
    dataHash : (id : string) => `job:${id}`,
    history: (id: string) => `job:history:${id}`,
}