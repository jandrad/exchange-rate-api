import { config, getChainConfig } from "../../../config";
import { cors, useFetch } from "../../../lib";
import { getURLParameters, timestamp, validTimestamp } from "../../../utils";

async function getEosCafeLogos(env: KVNamespace, chain: string): Promise<Record<string, any>> {
    const cacheId = `NEFTY_${chain.toUpperCase()}_LOGOS_EOSCAFE`;
    const store = await env.get(cacheId);
    const cached = store ? JSON.parse(store) : null;
    if (cached && validTimestamp(cached.timestamp)) return cached.data;
    const { data, error } = await useFetch<{ logo: string; logo_lg: string; symbol: string; account: string }[]>(
        "/eoscafe/eos-airdrops/master/tokens.json",
        {
            baseUrl: config.GITHUB_FILES,
            headers: {
                "Content-Type": "application/json",
                "User-Agent": "request",
            },
        }
    );

    if (error || !data) {
        console.error(error);
        return cached.data || {};
    }

    const logos: Record<string, any> = {};
    const filterData = data.filter((token: any) => token.chain === chain);

    for (let i = 0; i < filterData.length; i++) {
        const token = filterData[i];

        logos[`${token.symbol}@${token.account}`] = {
            logo: token.logo,
            logo_lg: token.logo_lg,
        };
    }

    await env.put(
        cacheId,
        JSON.stringify({
            // cache for 1 hour
            timestamp: timestamp(3600),
            data: logos,
        })
    );

    return logos;
}

async function getAlcorLogos(env: KVNamespace, chain: string): Promise<Record<string, any>> {
    const cacheId = `NEFTY_${chain.toUpperCase()}_LOGOS_ALCOR`;
    const store = await env.get(cacheId);
    const cached = store ? JSON.parse(store) : null;
    if (cached && validTimestamp(cached.timestamp)) return cached.data;

    const { data, error } = await useFetch<{ name: string; download_url: string }[]>(
        `/repos/avral/alcor-ui/contents/assets/tokens/${chain.toLowerCase()}`,
        {
            baseUrl: config.GITHUB_API,
            headers: {
                "Content-Type": "application/json",
                "User-Agent": "request",
            },
        }
    );

    if (error || !data) {
        console.error(error);
        return cached.data || {};
    }

    const logos: Record<string, any> = {};

    for (let i = 0; i < data.length; i++) {
        const { name, download_url } = data[i];

        const nameWithoutLastExtension = name.split(".").slice(0, -1).join(".");
        const [symbol, contract] = nameWithoutLastExtension.split("_");

        if (symbol && contract) {
            logos[`${symbol.toUpperCase()}@${contract.toLowerCase()}`] = {
                logo: download_url,
                logo_lg: download_url,
            };
        }
    }

    await env.put(
        cacheId,
        JSON.stringify({
            // cache for 1 hour
            timestamp: timestamp(3600),
            data: logos,
        })
    );

    return logos;
}

async function getLaunchbagzLogos(env: KVNamespace, chain: string, url?: string): Promise<Record<string, any>> {
    if (!url) return {};

    const cacheId = `NEFTY_${chain.toUpperCase()}_LOGOS_LAUNCHBAGZ`;
    const store = await env.get(cacheId);
    const cached = store ? JSON.parse(store) : null;
    if (cached && validTimestamp(cached.timestamp)) return cached.data;

    const { data, error } = await useFetch<{ data: { token_code: string; token_contract: string; image: string }[] }>(
        "/launchbagz/v1/tokens",
        {
            baseUrl: url,
            params: {
                limit: Number(1000).toString(),
            },
            headers: {
                "Content-Type": "application/json",
                "User-Agent": "request",
            },
        }
    );

    if (error || !data?.data) {
        console.error(error);
        return cached.data || {};
    }

    const logos: Record<string, any> = {};
    for (let i = 0; i < data.data.length; i++) {
        const token = data.data[i];

        if (token.image) {
            logos[`${token.token_code.toUpperCase()}@${token.token_contract}`] = {
                logo: `${config.NEFTY_IPFS}/ipfs/${token.image}`,
                logo_lg: `${config.NEFTY_IPFS}/ipfs/${token.image}`,
            };
        }
    }

    await env.put(
        cacheId,
        JSON.stringify({
            // cache for 1 hour
            timestamp: timestamp(3600),
            data: logos,
        })
    );

    return logos;
}

export async function getAllLogos({
    env,
    chain,
}: {
    env: KVNamespace;
    chain: string;
}): Promise<Record<string, { logo: string; logo_lg: string }>> {
    const { launchbagzUrl, mainChain } = getChainConfig(chain);
    const logos = (
        await Promise.all([
            getAlcorLogos(env, mainChain),
            getEosCafeLogos(env, mainChain),
            getLaunchbagzLogos(env, chain, launchbagzUrl),
        ])
    ).reduce(
        (acc, curr) => ({
            ...acc,
            ...curr,
        }),
        {}
    );
    return logos;
}

async function tokens({
    env,
    token,
    chain,
}: {
    env: KVNamespace;
    token?: string;
    chain?: string | null;
}): Promise<Response> {
    if (!chain) return new Response("No chain provided", { status: 400 });
    try {
        const logos = await getAllLogos({ env, chain });

        if (token) {
            if (logos[token])
                return new Response(JSON.stringify(logos[token]), {
                    headers: { "Cache-Control": "s-maxage=1800", "content-type": "application/json" },
                });
            else return new Response("No token found", { status: 404 });
        }

        return new Response(JSON.stringify(logos), {
            headers: { "Cache-Control": "s-maxage=1800", "content-type": "application/json" },
        });
    } catch (error) {
        if (error instanceof Error) {
            return new Response(error.message, { status: 500 });
        }
        return new Response("Unknown error", { status: 500 });
    }
}

interface Env {
    ERA: KVNamespace;
}

export const onRequestGet: PagesFunction<Env> = async ({ request, params, env }) => {
    const { token } = getURLParameters(request.url);
    const chain = params.chain as string;

    const res = await tokens({
        env: env.ERA,
        chain,
        token,
    });

    return cors(request, res);
};
