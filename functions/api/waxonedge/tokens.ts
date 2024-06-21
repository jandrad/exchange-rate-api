import { config } from "../../../config";
import { cors, useFetch, useSearch } from "../../../lib";
import { isError, getURLParameters, timestamp, validTimestamp } from "../../../utils";

const pageSize = 50;

async function tokens({
    env,
    search,
    page = 1,
    preset,
    limit = pageSize,
}: {
    env: KVNamespace;
    search?: string;
    page: number;
    preset?: string;
    limit: number;
}): Promise<Response> {
    const result: TokenList[] = [];

    try {
        let tokens = null;

        const store = await env.get("WAXONEDGE_API_TOKENS");
        const parsed = store ? JSON.parse(store) : null;

        if (parsed && validTimestamp(parsed.timestamp)) tokens = parsed.data;

        if (!tokens) {
            const { data, error } = await useFetch<TokenApi[]>("/tokens", {
                baseUrl: config.WAXONEDGE_API,
                headers: {
                    "Content-Type": "application/json",
                },
            });

            if (error) return isError(error);
            if (!data) return new Response("No data found", { status: 404 });

            tokens = filterTokens(data);

            await env.put(
                "WAXONEDGE_API_TOKENS",
                JSON.stringify({
                    // cache for 1 hour
                    timestamp: timestamp(3600),
                    data: tokens,
                })
            );
        }

        if (search) {
            const tokenNames = Object.keys(tokens).map((key) => tokens[key].in.ticker);
            const searchEngine = useSearch({
                items: tokenNames,
                options: {
                    distance: 2,
                    results_count: 10,
                    results_count_alt: 5,
                },
            });

            const hits = searchEngine(search);

            for (let i = 0; i < hits.length; i++) {
                result.push(tokens[hits[i]]);
            }
        } else if (preset) {
            const hits = preset.split("%2C");

            for (let i = 0; i < hits.length; i++) {
                if (tokens[hits[i]]) result.push(tokens[hits[i]]);
            }

            // if limit is not hit yet fill more
            if (result.length < limit) {
                const normal = Object.keys(tokens).slice((page - 1) * limit, page * limit);

                // filter by preset
                for (let i = 0; i < normal.length; i++) {
                    if (!hits.includes(normal[i])) {
                        result.push(tokens[normal[i]]);
                    }
                }
            }
        } else {
            const hits = Object.keys(tokens).slice((page - 1) * limit, page * limit);

            for (let i = 0; i < hits.length; i++) {
                result.push(tokens[hits[i]]);
            }
        }

        return new Response(JSON.stringify(result), {
            headers: { "Cache-Control": "s-maxage=1800", "content-type": "application/json" },
        });
    } catch (error) {
        return isError(error);
    }
}

interface Env {
    ERA: KVNamespace;
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
    const { search, page, preset, limit } = getURLParameters(request.url);

    const res = await tokens({
        env: env.ERA,
        search,
        page,
        preset,
        limit,
    });

    return cors(request, res);
};

const filterTokens = (tokens: TokenApi[]): Record<string, TokenList> => {
    const results: Record<string, TokenList> = {};

    for (let i = 0; i < tokens.length; i++) {
        const { symbol, contract, in_pool } = tokens[i];

        const maxPool = in_pool.length > 0 ? in_pool.reduce((a, b) => (a.quote_amount > b.quote_amount ? a : b)) : null;

        if (maxPool) {
            const { vstoken } = maxPool;

            const tokens: TokenList = {
                pair_id: maxPool.pairid,
                exchange: maxPool.src,
                in: { ticker: symbol.ticker, contract: contract, precision: symbol.precision },
                out: { ticker: vstoken.symbol.ticker, contract: vstoken.contract, precision: vstoken.symbol.precision },
            };

            results[`${contract}_${symbol.ticker}`] = tokens;
        }
    }

    return results;
};

type TokenApi = {
    contract: string;
    symbol: {
        ticker: string;
        precision: number;
    };
    amount: number;
    wax_price: number;
    tvl: number;
    in_pool: {
        src: string;
        src_type: string;
        pairid: number;
        quote_amount: number;
        vstoken: {
            contract: string;
            symbol: {
                ticker: string;
                precision: number;
            };
            amount: number;
        };
    }[];
};

type TokenList = {
    pair_id: number;
    exchange: string;
    in: TokenItem;
    out: TokenItem;
};

type TokenItem = {
    ticker: string;
    contract: string;
    precision: number;
};
