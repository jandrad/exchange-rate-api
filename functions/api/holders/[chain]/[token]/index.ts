import { getChainConfig } from "../../../../../config";
import { cors, useFetch } from "../../../../../lib";
import { isError, getURLParameters, fetchCached } from "../../../../../utils";

async function getTopHolders({
    url,
    fallbackUrl,
    contract,
    symbolCode,
    limit,
}: {
    contract: string;
    symbolCode: string;
    limit: number;
    url: string;
    fallbackUrl?: string;
}): Promise<{ data: string[][] | null; error: any }> {
    const result = await Promise.race([
        useFetch<string[][]>(`/${contract}/${symbolCode}/${limit}`, {
            baseUrl: url,
            headers: {
                "Content-Type": "application/json",
            },
        }),
        new Promise<{ data: string[][] | null; error: any }>((resolve) =>
            setTimeout(() => resolve({ data: null, error: new Error("Timeout exceeded") }), fallbackUrl ? 500 : 2000)
        ),
    ]);

    if (result.error) {
        if (fallbackUrl) {
            return getTopHolders({ contract, symbolCode, limit, url: fallbackUrl, fallbackUrl: undefined });
        }
        return result;
    }

    return result;
}

async function holders({
    env,
    chain,
    contract,
    symbolCode,
    limit,
}: {
    env: KVNamespace;
    chain: string;
    contract: string;
    symbolCode: string;
    limit: number;
}): Promise<Response> {
    const { holdersUrl, holdersFallbackUrl } = getChainConfig(chain);
    if (!holdersUrl) {
        return new Response("Unsupported chain", { status: 400 });
    }

    const { data, error } = await fetchCached(
        () => getTopHolders({ contract, symbolCode, limit, url: holdersUrl, fallbackUrl: holdersFallbackUrl }),
        {
            env,
            key: `${holdersUrl}/${contract}/${symbolCode}/${limit}`,
            ttlSeconds: 60,
        }
    );

    if (error) return isError(error);
    if (!data) return new Response("No data found", { status: 404 });

    return new Response(JSON.stringify(data), {
        headers: { "content-type": "application/json" },
    });
}

interface Env {
    ERA: KVNamespace;
}

export const onRequest: PagesFunction<Env> = async ({ request, env, params }) => {
    const chain = params.chain as string;
    const token = params.token as string;
    const [contract, symbolCode] = token.split("_");
    const { limit } = getURLParameters(request.url);
    const res = await holders({
        env: env.ERA,
        chain,
        contract: contract.toLocaleLowerCase(),
        symbolCode: symbolCode.toUpperCase(),
        limit: limit ? +limit : 50,
    });

    return cors(request, res);
};
