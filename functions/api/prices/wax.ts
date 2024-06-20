import { cors } from "../../../lib";
import { config } from "../../../config";
import { timestamp, validTimestamp } from "../../../utils";

async function prices(env: KVNamespace): Promise<Response> {
    try {
        const store = await env.get("WAX_TOKEN_PRICES");
        const parsed = store ? JSON.parse(store) : null;

        let prices: Record<string, number> = {};

        if (parsed && validTimestamp(parsed.timestamp)) prices = parsed.data;
        else {
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

            await env.put(
                "WAX_TOKEN_PRICES",
                JSON.stringify({
                    // cache for 1 hour
                    timestamp: timestamp(3600),
                    data: prices,
                })
            );
        }

        return new Response(JSON.stringify(prices), {
            headers: {
                "Cache-Control": "s-maxage=1800",
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

export const onRequestGet: PagesFunction<Env> = async ({ request, params }) => {
    const res = await prices();
    return cors(request, res);
};
