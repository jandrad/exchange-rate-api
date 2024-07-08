import { cors } from "../../../lib";
import { config } from "../../../config";
import { fetchCached } from "../../../utils/cache";

export async function getPrices(env: KVNamespace): Promise<Record<string, number>> {
    return await fetchCached(
        async () => {
            let prices: Record<string, number> = {};
            const [{ rows: waxRows }, woePrices] = await Promise.all([
                fetch(`${config.CHAIN_API}/v1/chain/get_table_rows`, {
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
                fetch(`${config.WAXONEDGE_API}/tokens`, {
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
            ttlSeconds: 3600,
            fallbackToCache: true,
        }
    );
}

async function prices(env: KVNamespace): Promise<Response> {
    try {
        const prices = await getPrices(env);
        return new Response(JSON.stringify(prices), {
            headers: {
                "Cache-Control": "s-maxage=60",
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

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
    const res = await prices(env.ERA);
    return cors(request, res);
};
