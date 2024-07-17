import { getChainConfig } from "../../../../../config";
import { cors } from "../../../../../lib";
import { isError, fetchCached } from "../../../../../utils";

async function getHoldersCount({
    url,
    fallbackUrl,
    contract,
    symbolCode,
}: {
    contract: string;
    symbolCode: string;
    url: string;
    fallbackUrl?: string;
}): Promise<{ data: number | null; error: any }> {
    console.log({ url, fallbackUrl });
    const result = await Promise.race([
        new Promise<{ data: number | null; error: any }>((resolve) => {
            fetch(`${url}/${contract}/${symbolCode}`)
                .then((res) => res.text())
                .then((data) => {
                    const count = +data;
                    if (count === 0) {
                        return resolve({ data: null, error: new Error("No holders") });
                    }
                    return resolve({ data: +data, error: null });
                })
                .catch((e) => resolve({ data: null, error: e }));
        }),
        new Promise<{ data: number | null; error: any }>((resolve) =>
            setTimeout(() => resolve({ data: null, error: new Error("Timeout exceeded") }), fallbackUrl ? 500 : 2000)
        ),
    ]);

    if (result.error) {
        if (fallbackUrl) {
            return getHoldersCount({ contract, symbolCode, url: fallbackUrl, fallbackUrl: undefined });
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
}: {
    env: KVNamespace;
    chain: string;
    contract: string;
    symbolCode: string;
}): Promise<Response> {
    const { holdersCountUrl, holdersCountFallbackUrl } = getChainConfig(chain);
    if (!holdersCountUrl) {
        return new Response("Unsupported chain", { status: 400 });
    }

    const { data, error } = await fetchCached(
        () => getHoldersCount({ contract, symbolCode, url: holdersCountUrl, fallbackUrl: holdersCountFallbackUrl }),
        {
            env,
            key: `${holdersCountUrl}/${contract}/${symbolCode}`,
            ttlSeconds: 60,
        }
    );

    console.log("Holders count", data, error);

    if (error) return isError(error);
    if (!data) return new Response("No data found", { status: 404 });

    return new Response(JSON.stringify({ count: data }), {
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
    const res = await holders({
        env: env.ERA,
        chain,
        contract: contract.toLocaleLowerCase(),
        symbolCode: symbolCode.toUpperCase(),
    });

    return cors(request, res);
};
