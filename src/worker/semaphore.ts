export class Semaphore {

    private running: number = 0;
    private max:     number;
    private waiters: Array<() => void> = [];

    public constructor(max: number) {
        this.max = max;
    }

    public acquire(): Promise<void> {
        if (this.running < this.max) {
            this.running++;
            return Promise.resolve();
        }

        return new Promise<void>((resolve) => {
            this.waiters.push(resolve);
        });
    }

    public release(): void {
        if (this.waiters.length > 0) {
            const next = this.waiters.shift()!;
            next();
            return;
        }

        this.running--;
    }
}