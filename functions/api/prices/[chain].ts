import { cors } from "../../../lib";
import { config, getChainConfig } from "../../../config";
import { fetchCached } from "../../../utils/cache";

export async function getAlcorPrices(env: KVNamespace, mainChain: string): Promise<Record<string, number>> {
    return await fetchCached(
        async () => {
            const response: AlcorToken[] = await fetch(`https://${mainChain}.alcor.exchange/api/v2/tokens`).then((r) =>
                r.json()
            );
            const tokenPrices: Record<string, number> = {};
            for (let i = 0; i < response.length; i++) {
                const { contract, symbol, usd_price } = response[i];
                tokenPrices[`${symbol}@${contract}`] = usd_price;
            }

            return tokenPrices;
        },
        {
            key: `${mainChain.toUpperCase()}_ALCOR_PRICES`,
            env,
            ttlSeconds: 30,
            fallbackToCache: true,
        }
    );
}

export async function getWaxPrices(env: KVNamespace): Promise<Record<string, number>> {
    const { chainApiUrl } = getChainConfig("wax");
    return await fetchCached(
        async () => {
            let prices: Record<string, number> = {};
            const [{ rows: waxRows }, woePrices] = await Promise.all([
                fetch(`${chainApiUrl}/v1/chain/get_table_rows`, {
                    method: "POST",
                    redirect: "follow",
                    headers: {
                        "Content-Type": "application/json",
                        "User-Agent": "request",
                    },
                    body: JSON.stringify({
                        index_position: 3,
                        key_type: "i64",
                        code: "delphioracle",
                        scope: "waxpusd",
                        table: "datapoints",
                        limit: 1,
                        reverse: true,
                        json: true,
                        show_payer: false,
                    }),
                }).then((r) => r.json()),
                fetch(`${config.WAXONEDGE_API}/tokens?minimaldata=true`, {
                    method: "GET",
                    redirect: "follow",
                    headers: {
                        "Content-Type": "application/json",
                        "User-Agent": "request",
                    },
                }).then((r) => r.json()),
            ]);

            const waxPrice = Math.round((waxRows[0].median / 10000) * Math.pow(10, 8)) / Math.pow(10, 8);
            for (let i = 0; i < woePrices.length; i++) {
                const price = woePrices[i];
                const key = `${price.symbol.ticker}@${price.contract}`;
                if (price.wax_price) {
                    prices[key] = price.wax_price * waxPrice;
                }
            }

            return prices;
        },
        {
            key: "WAX_TOKEN_PRICES",
            env,
            ttlSeconds: 30,
            fallbackToCache: true,
        }
    );
}

export async function getPrices(env: KVNamespace, chain: string): Promise<Record<string, number>> {
    const { mainChain } = getChainConfig(chain);
    if (mainChain === "wax") {
        return await getWaxPrices(env);
    }
    return await getAlcorPrices(env, mainChain);
}

async function prices(env: KVNamespace, chain: string): Promise<Response> {
    try {
        const prices = await getPrices(env, chain);
        return new Response(JSON.stringify(prices), {
            headers: {
                "Cache-Control": "s-maxage=5",
                "content-type": "application/json",
            },
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

interface AlcorToken {
    contract: string;
    decimals: number;
    symbol: string;
    id: string;
    system_price: number;
    usd_price: number;
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env, params }) => {
    const chain = params.chain as string;
    const res = await prices(env.ERA, chain);
    return cors(request, res);
};
