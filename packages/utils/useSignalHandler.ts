export const useSignalHandler = (callback: () => void): (() => void) => {
    const onSignal = () => {
        callback();
    };

    process.on('SIGTERM', onSignal);
    process.on('SIGINT', onSignal);

    return () => {
        process.off('SIGTERM', onSignal);
        process.off('SIGINT', onSignal);
    };
};
