export type Params = Record<string, string>;

export const getURLParameters = (url?: string): Params =>
    (url?.match(/([^?=&]+)(=([^&]*))/g) || []).reduce(
        (a, v) => (
            ((a as unknown as Record<string, string>)[
                (v as unknown as string).slice(0, (v as unknown as string).indexOf("="))
            ] = (v as unknown as string).slice((v as unknown as string).indexOf("=") + 1)),
            a
        ),
        {} as unknown as never
    ) as unknown as Params;
