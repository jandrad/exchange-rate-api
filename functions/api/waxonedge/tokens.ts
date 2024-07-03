import { config } from "../../../config";
import { cors, useFetch } from "../../../lib";
import { isError, getURLParameters, timestamp, validTimestamp } from "../../../utils";
import { getAllLogos } from "../logos/[chain]";

const pageSize = 50;

async function tokens({
    env,
    search,
    page,
    preset,
    limit,
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
            const [tokensPromise, taxPromise, logosPromise] = await Promise.allSettled([
                useFetch<TokenApi[]>("/tokens", {
                    baseUrl: config.WAXONEDGE_API,
                    headers: {
                        "Content-Type": "application/json",
                    },
                }),
                useFetch<TaxAPI>("/launchbagz/v1/tokens", {
                    baseUrl: config.NEFTY_API,
                    headers: {
                        "Content-Type": "application/json",
                    },
                }),
                getAllLogos({ env, chain: "wax" }),
            ]);

            const { data, error } =
                tokensPromise.status === "fulfilled"
                    ? tokensPromise.value
                    : { data: null, error: tokensPromise.reason };
            if (error) return isError(error);
            if (!data) return new Response("No data found", { status: 404 });

            const taxData = taxPromise.status === "fulfilled" ? taxPromise.value.data?.data : [];
            const logos = logosPromise.status === "fulfilled" ? logosPromise.value : {};

            const taxs = transformTaxs(taxData);
            tokens = filterTokens(data, taxs, logos);

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
            const tokenNames = Object.keys(tokens);

            const hits = (
                tokenNames
                    .map((name) => {
                        const [contract, symbol] = name.split("_");
                        const closeSymbolScore = symbol.includes(search.toUpperCase()) ? 1 : 0;
                        const closeContractScore = contract.includes(search.toLowerCase()) ? 1 : 0;
                        const startsSymbolScore = symbol.startsWith(search.toUpperCase()) ? 2 : 0;
                        const startsContractScore = contract.startsWith(search.toLowerCase()) ? 2 : 0;
                        const exactMatch =
                            symbol === search.toUpperCase() || search.toLocaleLowerCase() === contract ? 100 : 0;

                        const totalScore =
                            closeSymbolScore +
                            closeContractScore +
                            startsSymbolScore +
                            startsContractScore +
                            exactMatch;
                        if (totalScore) {
                            return {
                                name,
                                score: totalScore,
                            };
                        } else {
                            return null;
                        }
                    })
                    .filter((x) => !!x) as { name: string; score: number }[]
            )
                .sort((a, b) => b.score - a.score)
                .map((x) => x.name);

            for (let i = 0; i < hits.length; i++) {
                if (result.length >= limit) break;
                result.push(tokens[hits[i]]);
            }
        } else if (preset) {
            const hits = preset.split(",");

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
        page: page ? +page : 1,
        preset,
        limit: limit ? +limit : pageSize,
    });

    return cors(request, res);
};

const filterTokens = (
    tokens: TokenApi[],
    taxs: Record<string, number>,
    logos: Record<string, { logo_lg: string }> = {}
): Record<string, TokenList> => {
    const results: Record<string, TokenList> = {};

    for (let i = 0; i < tokens.length; i++) {
        const { symbol, contract, in_pool } = tokens[i];

        const maxPool = in_pool.length > 0 ? in_pool.reduce((a, b) => (a.quote_amount > b.quote_amount ? a : b)) : null;

        if (maxPool) {
            const { vstoken } = maxPool;

            const tokens: TokenList = {
                pair_id: maxPool.pairid,
                exchange: maxPool.src,
                in: {
                    ticker: symbol.ticker,
                    contract: contract,
                    tax: taxs[`${contract}_${symbol.ticker}`] || 0,
                    precision: symbol.precision,
                    logo: logos[`${symbol.ticker}@${contract}`]?.logo_lg,
                },
                out: {
                    ticker: vstoken.symbol.ticker,
                    contract: vstoken.contract,
                    tax: taxs[`${vstoken.symbol.ticker}_${vstoken.contract}`] || 0,
                    precision: vstoken.symbol.precision,
                    logo: logos[`${vstoken.symbol.ticker}@${vstoken.contract}`]?.logo_lg,
                },
            };

            results[`${contract}_${symbol.ticker}`] = tokens;
        }
    }

    return results;
};

const transformTaxs = (taxs: Tax[] = []): Record<string, number> => {
    const results: Record<string, number> = {};

    for (let i = 0; i < taxs.length; i++) {
        const { token_code, token_contract, tx_fee } = taxs[i];
        results[`${token_contract}_${token_code}`] = tx_fee;
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

type TaxAPI = {
    success: boolean;
    message?: string;
    data?: Tax[];
    query_time: number;
};

type Tax = {
    contract: string;
    token_contract: string;
    token_code: string;
    image: string;
    tx_fee: number;
    created_at_time: string;
    updated_at_time: string;
    created_at_block: string;
    updated_at_block: string;
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
    tax: number;
    logo?: string;
};
