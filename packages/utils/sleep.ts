export function sleep(timeout: number, abortSignal?: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
        const handle = isFinite(timeout) ?
            setTimeout(() => {
                abortSignal?.removeEventListener('abort', onAbort);
                resolve();
            }, timeout) :
            undefined;

        const onAbort = (reason: any) => {
            clearTimeout(handle);
            reject(reason);
        };

        abortSignal?.addEventListener('abort', onAbort);
    });
}
