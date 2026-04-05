export async function handleJob(jobId: string) {
    throw new Error('Fialed to handle the job');
}

export const sleep = () => new Promise<void>((resolve) => setTimeout(resolve, 5000));


export async function hang_test(jobName: string): Promise<void> {
    if(jobName === 'Email'){
        console.log("Starting hang-test handler (will never finish)");

        await new Promise<void>(() => {

        });

        return;
    }

    console.log("Name is incorrect");
}