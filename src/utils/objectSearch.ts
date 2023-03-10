import _ from 'lodash';

type SearchFn = (data: any) => Generator<any, void> | any[];

export const makeSearcher = (
    ...pipe: Array<string | SearchFn>
) => {
    const processItem = (data: any, processor: string | SearchFn) => {
        if (typeof processor === 'string') {
            return [ _.get(data, processor) ];
        } else {
            return processor(data);
        }
    };

    return (data: any) => {
        let items: any[] = [ data ];

        for (const processor of pipe) {
            items = items
                .map(item => processItem(item, processor))
                .reduce<any[]>((acc, item) => {
                    acc.push(
                        ...item
                    );
                    return acc;
                }, []);
        }

        return items;
    };
};

export const walkDeep = function *(data: any): Generator<any> {
    yield data;

    switch (true) {
        case data instanceof Array:
            for (const item of data) {
                yield* walkDeep(item);
            }
            break;

        case typeof data === 'object' && data !== null:
            for (const item of Object.values(data)) {
                yield* walkDeep(item);
            }
            break;
    }
};

export const filter = (cb: (data: any) => boolean) => (data: any) => cb(data) ? [ data ] : [];

export const map = (cb: (data: any) => any) => (data: any) => [ cb(data) ];
