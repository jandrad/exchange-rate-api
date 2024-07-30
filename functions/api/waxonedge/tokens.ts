import { config, getChainConfig } from "../../../config";
import { cors, useFetch } from "../../../lib";
import { isError, getURLParameters, shouldFallbackToNeftyPools } from "../../../utils";
import { fetchCached } from "../../../utils/cache";
import { getAllNeftyPairs, Pair } from "../../../services/pairs";
import { getAllLogos } from "../../../services/logos";
import { getAllTaxes } from "../../../services/taxes";

const pageSize = 50;

function getTokenApisFromPairs(pairs: Pair[]): TokenApi[] {
    const tokensMap = new Map<string, TokenApi>();

    const addTokenToMap = (pair: Pair, invert = false) => {
        const token0 = invert ? pair.reserve1 : pair.reserve0;
        const token1 = invert ? pair.reserve0 : pair.reserve1;
        const tokenKey = `${token0.contract}:${token0.symbol.ticker}`;

        const pool = {
            src: "nefty",
            src_type: "pools",
            quote_amount: token0.amount,
            vstoken: token1,
            pairid: pair.code,
        };

        if (!tokensMap.has(tokenKey)) {
            tokensMap.set(tokenKey, {
                contract: token0.contract,
                symbol: token0.symbol,
                amount: 0,
                wax_price: 0,
                tvl: 0,
                in_pool: [pool],
            });
        } else {
            tokensMap.get(tokenKey)!.in_pool.push(pool);
        }
    };

    for (const pair of pairs) {
        addTokenToMap(pair);
        addTokenToMap(pair, true);
    }

    return [...tokensMap.values()];
}

async function getNeftyTokens({ env, chain }: { env: KVNamespace; chain: string }): Promise<Record<string, TokenList>> {
    const cacheKey = `NEFTY_API_TOKENS_${chain.toUpperCase()}`;
    const { launchbagzUrl } = getChainConfig(chain);
    if (!launchbagzUrl) return {};
    return await fetchCached(
        async () => {
            const [tokensPromise, taxesPromise, logosPromise] = await Promise.allSettled([
                getAllNeftyPairs({ chain }),
                getAllTaxes({ chain }),
                getAllLogos({ env, chain }),
            ]);

            if (tokensPromise.status === "rejected") {
                throw tokensPromise.reason;
            }

            const data = getTokenApisFromPairs(tokensPromise.value);
            const logos = logosPromise.status === "fulfilled" ? logosPromise.value : {};
            const taxes = taxesPromise.status === "fulfilled" ? taxesPromise.value : {};
            return filterTokens(data, taxes, logos);
        },
        {
            key: cacheKey,
            env,
            ttlSeconds: 3600,
            fallbackToCache: false,
        }
    );
}

async function getWaoTokens({
    env,
    exchange,
}: {
    env: KVNamespace;
    exchange?: string;
}): Promise<Record<string, TokenList>> {
    const { launchbagzUrl } = getChainConfig("wax");
    return await fetchCached(
        async () => {
            const [tokensPromise, taxesPromise, logosPromise] = await Promise.allSettled([
                useFetch<TokenApi[]>("/tokens", {
                    baseUrl: config.WAXONEDGE_API,
                    headers: {
                        "Content-Type": "application/json",
                    },
                }),
                getAllTaxes({ chain: "wax" }),
                getAllLogos({ env, chain: "wax" }),
            ]);

            const { data, error } =
                tokensPromise.status === "fulfilled"
                    ? tokensPromise.value
                    : { data: null, error: tokensPromise.reason };
            if (error) throw error;
            if (!data) throw new Error("No data found");

            const logos = logosPromise.status === "fulfilled" ? logosPromise.value : {};
            const taxes = taxesPromise.status === "fulfilled" ? taxesPromise.value : {};
            return filterTokens(data, taxes, logos, exchange);
        },
        {
            key: "WAXONEDGE_API_TOKENS",
            env,
            ttlSeconds: 3600,
            fallbackToCache: false,
        }
    );
}

async function tokens({
    env,
    search,
    page,
    preset,
    exchange,
    limit,
    chain,
}: {
    env: KVNamespace;
    search?: string;
    page: number;
    preset?: string;
    exchange?: string;
    limit: number;
    chain: string;
}): Promise<Response> {
    const result: TokenList[] = [];

    try {
        let tokens: Record<string, TokenList>;
        const fallback = await shouldFallbackToNeftyPools(env);
        if (fallback || chain.includes("test")) {
            if (exchange && exchange !== "neftyblocks") {
                tokens = {};
            } else {
                tokens = await getNeftyTokens({ env, chain });
            }
        } else {
            tokens = await getWaoTokens({ env, exchange });
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
            headers: { "Cache-Control": "s-maxage=60", "content-type": "application/json" },
        });
    } catch (error) {
        return isError(error);
    }
}

interface Env {
    ERA: KVNamespace;
}

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
    const { search, page, preset, limit, chain } = getURLParameters(request.url);

    const res = await tokens({
        env: env.ERA,
        search,
        page: page ? +page : 1,
        preset,
        limit: limit ? +limit : pageSize,
        chain: chain || "wax",
    });

    return cors(request, res);
};

const filterTokens = (
    tokens: TokenApi[],
    taxes: Record<string, number>,
    logos: Record<string, { logo_lg: string }> = {},
    exchange?: string
): Record<string, TokenList> => {
    const results: Record<string, TokenList> = {};

    for (let i = 0; i < tokens.length; i++) {
        const { symbol, contract, in_pool } = tokens[i];

        const pools = exchange ? in_pool.filter((x) => x.src === exchange) : in_pool;
        const maxPool = pools.length > 0 ? pools.reduce((a, b) => (a.quote_amount > b.quote_amount ? a : b)) : null;

        if (maxPool) {
            const { vstoken } = maxPool;

            const tokens: TokenList = {
                pair_id: maxPool.pairid,
                exchange: maxPool.src,
                in: {
                    ticker: symbol.ticker,
                    contract: contract,
                    tax: taxes[`${symbol.ticker}@${contract}`] || 0,
                    precision: symbol.precision,
                    logo: logos[`${symbol.ticker}@${contract}`]?.logo_lg,
                },
                out: {
                    ticker: vstoken.symbol.ticker,
                    contract: vstoken.contract,
                    tax: taxes[`${vstoken.symbol.ticker}@${vstoken.contract}`] || 0,
                    precision: vstoken.symbol.precision,
                    logo: logos[`${vstoken.symbol.ticker}@${vstoken.contract}`]?.logo_lg,
                },
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
        pairid: number | string;
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
    pair_id: number | string;
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
