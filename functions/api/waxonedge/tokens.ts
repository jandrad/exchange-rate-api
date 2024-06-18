import { config } from "../../../config";
import { cors, useFetch, useSWR, useSearch } from "../../../lib";
import { isError, getURLParameters } from "../../../utils";

const pageSize = 50;
let searchEngine: ReturnType<typeof useSearch>;

async function tokens({
    search,
    page = 1,
    preset,
}: {
    search?: string;
    page: number;
    preset?: string;
}): Promise<Response> {
    const result: TokenList[] = [];

    try {
        const data = await useSWR<Record<string, TokenList>>(
            "waxonedge-tokens",
            async () => {
                const { data } = await useFetch<TokenApi[]>("/tokens", {
                    baseUrl: config.WAXONEDGE_API,
                    headers: {
                        "Content-Type": "application/json",
                    },
                });

                if (!data) return {};

                const tokens = filterTokens(data);
                const tokenNames = Object.keys(tokens);

                searchEngine = useSearch({
                    items: tokenNames,
                    options: {
                        distance: 2,
                        results_count: 10,
                        results_count_alt: 5,
                    },
                });

                return tokens;
            },
            120_000
        );

        if (search) {
            const hits = searchEngine(search);

            for (let i = 0; i < hits.length; i++) {
                result.push(data[hits[i]]);
            }
        } else if (preset) {
            const hits = preset.split(",");

            for (let i = 0; i < hits.length; i++) {
                result.push(data[hits[i]]);
            }

            const normal = Object.keys(data).slice((page - 1) * pageSize, page * pageSize);

            // filter by preset
            for (let i = 0; i < normal.length; i++) {
                if (!hits.includes(normal[i])) {
                    result.push(data[normal[i]]);
                }
            }
        } else {
            const hits = Object.keys(data).slice((page - 1) * pageSize, page * pageSize);

            for (let i = 0; i < hits.length; i++) {
                result.push(data[hits[i]]);
            }
        }

        return new Response(JSON.stringify(result), {
            headers: { "Cache-Control": "s-maxage=60", "content-type": "application/json" },
        });
    } catch (error) {
        return isError(error);
    }
}

export const onRequestGet: PagesFunction = async ({ request }) => {
    const { search, page, preset } = getURLParameters(request.url);

    const res = await tokens({
        search,
        page,
        preset,
    });

    return cors(request, res);
};

const filterTokens = (tokens: TokenApi[]): Record<string, TokenList> => {
    const results: Record<string, TokenList> = {};

    for (let i = 0; i < tokens.length; i++) {
        const { symbol, contract, in_pool, wax_price } = tokens[i];

        const maxPool = in_pool.length > 0 ? in_pool.reduce((a, b) => (a.quote_amount > b.quote_amount ? a : b)) : null;

        if (maxPool) {
            const { vstoken } = maxPool;

            const tokens: TokenList = {
                pair_id: maxPool.pairid,
                exchange: maxPool.src,
                wax_price,
                in: { ticker: symbol.ticker, contract: contract, precision: symbol.precision },
                out: { ticker: vstoken.symbol.ticker, contract: vstoken.contract, precision: vstoken.symbol.precision },
            };

            results[`${symbol.ticker}_${contract}`] = tokens;
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
    wax_price: number;
    exchange: string;
    in: TokenItem;
    out: TokenItem;
};

type TokenItem = {
    ticker: string;
    contract: string;
    precision: number;
};
