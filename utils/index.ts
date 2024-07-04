export * from "./url";
export * from "./error";
export * from "./cache";

const FALLBACK_COUNTER_KEY = "WAXONEDGE_ERROR_COUNTER";
const FALLBACK_COUNTER_TTL = 3600;
const FALLBACK_COUNTER_THRESHOLD = 10;

export const shouldFallbackToNeftyPools = async (env: KVNamespace) => {
    const store = await env.get(FALLBACK_COUNTER_KEY);
    const parsed = store ? JSON.parse(store) : null;

    const now = Date.now() / 1000;
    if (parsed && now - parsed.timestamp < FALLBACK_COUNTER_TTL) {
        if (parsed.counter >= FALLBACK_COUNTER_THRESHOLD) return true;
    }
    return false;
};

export const reportWoeResult = async (env: KVNamespace, success: boolean) => {
    const store = await env.get(FALLBACK_COUNTER_KEY);
    const parsed = store ? JSON.parse(store) : null;

    const now = Date.now() / 1000;
    if (parsed && now - parsed.timestamp < FALLBACK_COUNTER_TTL) {
        if (success) {
            parsed.counter -= 1;
            if (parsed.counter < 0) parsed.counter = 0;
        } else {
            parsed.counter += 1;
        }
        await env.put(FALLBACK_COUNTER_KEY, JSON.stringify(parsed));
    } else {
        const counter = success ? 0 : 1;
        await env.put(FALLBACK_COUNTER_KEY, JSON.stringify({ timestamp: now, counter }));
    }
    return false;
};

export async function fetchCached<T>(
    fn: () => Promise<T>,
    options: {
        key: string;
        env: KVNamespace;
        ttlSeconds: number;
        fallbackToCache?: boolean;
    }
): Promise<T> {
    const { key, env, ttlSeconds, fallbackToCache = false } = options;
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
