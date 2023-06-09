import process from 'node:process';

export const useSignalHandler = callback => {
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
