export async function fetchCached<T extends any>(
    key: string,
    env: KVNamespace,
    ttlSeconds: number,
    fallbackToCache: boolean,
    fn: () => Promise<T>
): Promise<T> {
    const store = await env.get(key);
    const parsed = store ? JSON.parse(store) : null;

    let result: T | undefined;
    const now = Date.now() / 1000;
    if (parsed && now - parsed.timestamp < ttlSeconds) result = parsed.data;

    if (!result) {
        try {
            result = await fn();
        } catch (error) {
            if (fallbackToCache && parsed) return parsed.data;
            throw error;
        }

        await env.put(
            key,
            JSON.stringify({
                timestamp: Date.now() / 1000,
                data: result,
            })
        );
    }
    return result;
}
