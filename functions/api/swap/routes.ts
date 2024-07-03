import { config, getChainConfig } from "../../../config";
import { cors, useFetch } from "../../../lib";
import { isError, getURLParameters, validTimestamp, timestamp } from "../../../utils";

const neftySwapContract = "swap.nefty";

function parseToken(extendedAsset: { contract: string; quantity: string }): Token {
    const { contract, quantity } = extendedAsset;
    const [amountString, symbolCode] = quantity.split(" ");
    const precision = amountString.split(".")[1]?.length || 0;
    return {
        symbol: {
            ticker: symbolCode,
            precision,
        },
        amount: amountString,
        contract,
    };
}

export async function getAllNeftyPairs({ chain }: { chain: string }): Promise<Pair[]> {
    const { chainApiUrl } = getChainConfig(chain);
    let lower_bound = undefined;
    let pairs: Pair[] = [];
    do {
        const result = await useFetch<{ rows: PairRow[]; more: boolean; next_key: any }>("/v1/chain/get_table_rows", {
            baseUrl: chainApiUrl,
            method: "POST",
            body: {
                code: neftySwapContract,
                scope: neftySwapContract,
                table: "pairs",
                lower_bound,
                limit: 1000,
                reverse: false,
                json: true,
                show_payer: false,
            },
        });

        if (result.error) throw result.error;
        if (!result.data) throw new Error("No data found");

        pairs = pairs.concat(
            result.data.rows.map((row: PairRow) => ({
                reserve0: parseToken(row.reserve0),
                reserve1: parseToken(row.reserve1),
                total_liquidity: row.total_liquidity,
                code: row.code,
                active: row.active,
            }))
        );
        if (result.data.more) {
            lower_bound = result.data.next_key;
        } else {
            lower_bound = undefined;
        }
    } while (lower_bound);
    return pairs;
}

async function getNeftyPairs({ env, chain }: { chain: string; env: KVNamespace }): Promise<Pair[]> {
    const store = await env.get("NEFTY_SWAP_PAIRS");
    const parsed = store ? JSON.parse(store) : null;

    let pairs: Pair[] = [];
    if (parsed && validTimestamp(parsed.timestamp)) {
        pairs = parsed.data;
    } else {
        pairs = await getAllNeftyPairs({ chain });
        await env.put(
            "NEFTY_SWAP_PAIRS",
            JSON.stringify({
                // cache for 2 seconds
                timestamp: timestamp(2),
                data: pairs,
            })
        );
    }

    return pairs;
}

export async function getNeftySwapFees({ chain }: { chain: string }): Promise<number> {
    const { chainApiUrl } = getChainConfig(chain);
    const result = await useFetch<{ rows: { key: string; value: string }[] }>("/v1/chain/get_table_rows", {
        baseUrl: chainApiUrl,
        method: "POST",
        body: {
            code: neftySwapContract,
            scope: neftySwapContract,
            table: "configs",
            limit: 1000,
            reverse: false,
            json: true,
            show_payer: false,
        },
    });
    if (result.error) throw result.error;
    if (!result.data) throw new Error("No data found");

    const protocolFee = result.data.rows.find((row) => row.key === "fee.protocol")?.value || "0";
    const tradeFee = result.data.rows.find((row) => row.key === "fee.trade")?.value || "0";
    return +protocolFee + +tradeFee;
}

async function getNeftyPair({
    tokenIn,
    tokenOut,
    env,
    chain,
}: {
    chain: string;
    tokenIn: string;
    tokenOut: string;
    env: KVNamespace;
}): Promise<Pair | undefined> {
    const pairs = await getNeftyPairs({ chain, env });
    const [tokenInSymbolCode, tokenInContract] = tokenIn.split("_");
    const [tokenOutSymbolCode, tokenOutContract] = tokenOut.split("_");

    const pair: Pair | undefined = pairs.find(
        (p) =>
            p.active &&
            ((p.reserve0.symbol.ticker === tokenInSymbolCode &&
                p.reserve1.symbol.ticker === tokenOutSymbolCode &&
                p.reserve0.contract === tokenInContract &&
                p.reserve1.contract === tokenOutContract) ||
                (p.reserve0.symbol.ticker === tokenOutSymbolCode &&
                    p.reserve1.symbol.ticker === tokenInSymbolCode &&
                    p.reserve0.contract === tokenOutContract &&
                    p.reserve1.contract === tokenInContract))
    );
    return pair;
}

async function getNeftyRoutes({ params, env }: { params: Record<string, any>; env: KVNamespace }): Promise<Route[]> {
    const [pair, fees] = await Promise.all([
        getNeftyPair({
            tokenIn: params.token_in,
            tokenOut: params.token_out,
            env,
            chain: params.chain,
        }),
        getNeftySwapFees({ chain: params.chain }),
    ]);
    if (!pair) {
        return [];
    }

    const reserve0String = `${pair.reserve0.symbol.ticker}_${pair.reserve0.contract}`;
    const inputReserve = reserve0String === params.token_in ? pair.reserve0 : pair.reserve1;
    const outputReserve = reserve0String === params.token_in ? pair.reserve1 : pair.reserve0;
    const inputAmount = +params.amount_in;
    const inputReserveAmount = +inputReserve.amount;
    const outputReserveAmount = +outputReserve.amount;
    const routePrice = inputReserveAmount / outputReserveAmount;
    const fee = fees;
    const inputWithFee = inputAmount - (inputAmount * fee) / 10000;
    const outputAmount =
        Math.floor(
            ((inputWithFee * outputReserveAmount) / (inputReserveAmount + inputWithFee)) *
                10 ** outputReserve.symbol.precision
        ) /
        10 ** outputReserve.symbol.precision;
    const minAmount =
        Math.floor(outputAmount * (1 - params.slippage / 10000) * 10 ** inputReserve.symbol.precision) /
        10 ** inputReserve.symbol.precision;

    const route: Route = {
        hash: `neftyblocks_${pair.code}`,
        route_price: routePrice,
        fees: 30,
        platform_fees: 0,
        amount_in: inputAmount,
        amount_received: outputAmount,
        amounts_received: [outputAmount],
        minimum_received: minAmount,
        minimums_received: [minAmount],
        actions: [
            {
                to: neftySwapContract,
                quantity: `${inputAmount.toFixed(inputReserve.symbol.precision)} ${inputReserve.symbol.ticker}`,
                memo: `swap:${pair.code},min:${minAmount.toFixed(outputReserve.symbol.precision).replaceAll(".", "")}`,
            },
        ],
        type: "direct",
    };

    return [route];
}

async function getWoeRoutes({ params }: { params: Record<string, any> }): Promise<Route[]> {
    const { data, error } = await useFetch<Route[]>(`${config.WAXONEDGE_API}/swapRoutes`, {
        method: "GET",
        headers: {
            "Content-Type": "application/json",
            "User-Agent": "request",
        },
        params: {
            ...params,
            limit: "1",
        },
    });

    if (error) {
        throw error;
    }
    if (!data) {
        throw new Error("No data");
    }
    return data;
}

async function getGlobalLiquidity({
    token_in,
    token_out,
}: {
    token_in: string;
    token_out: string;
}): Promise<{ token_in_amount: number; token_out_amount: number }> {
    const { data, error } = await useFetch<PairSource[]>(
        `${config.WAXONEDGE_API}/pairDirectSources/${token_in}/${token_out}`,
        {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
                "User-Agent": "request",
            },
        }
    );
    if (error) {
        throw error;
    }
    if (!data) {
        throw new Error("No data");
    }

    let token_in_amount = 0;
    let token_out_amount = 0;
    for (const source of data) {
        let in_amount = source.token0.amount;
        let out_amount = source.token1.amount;
        if (`${source.token0.symbol.ticker}_${source.token0.contract}` === token_out) {
            in_amount = source.token1.amount;
            out_amount = source.token0.amount;
        }

        if (in_amount && out_amount) {
            token_in_amount += +in_amount;
            token_out_amount += +out_amount;
        }
    }

    return { token_in_amount, token_out_amount };
}

async function getAllRoutes({ params, env }: { params: Record<string, any>; env: KVNamespace }): Promise<Route[]> {
    let routes: Route[] = [];
    if (config.NEFTY_SWAP_FALLBACK) {
        routes = await getNeftyRoutes({ params: { ...params, chain: "wax" }, env });
    } else {
        routes = await getWoeRoutes({ params });
    }

    return routes;
}

async function routes({ params, env }: { params: Record<string, any>; env: KVNamespace }): Promise<Response> {
    try {
        const [routes, globalLiquidity] = await Promise.all([
            getAllRoutes({ params, env }),
            getGlobalLiquidity({ token_in: params.token_in, token_out: params.token_out }),
        ]);

        const { token_in_amount, token_out_amount } = globalLiquidity;
        const global_price = token_in_amount / token_out_amount;

        const filteredData = routes.slice(0, 1).map((route) => ({
            hash: route.hash,
            route_price: route.route_price,
            fees: route.fees,
            platform_fees: route.platform_fees,
            amount_in: route.amount_in,
            amount_received: route.amount_received,
            amounts_received: route.amounts_received,
            minimum_received: route.minimum_received,
            minimums_received: route.minimums_received,
            actions: route.actions,
            type: route.type,
            price_impact: route.route_price
                ? Math.max(1 - route.amount_received / (route.amount_in / route.route_price), 0)
                : 0,
            global_price_impact: global_price
                ? Math.max(1 - route.amount_received / (route.amount_in / global_price), 0)
                : 0,
        }));

        return new Response(JSON.stringify(filteredData), {
            headers: { "Cache-Control": "s-maxage=3", "content-type": "application/json" },
        });
    } catch (error) {
        return isError(error);
    }
}

interface Env {
    ERA: KVNamespace;
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
    const params = getURLParameters(request.url);
    const res = await routes({
        params,
        env: env.ERA,
    });

    return cors(request, res);
};

export type Pair = {
    code: string;
    active: boolean;
    reserve0: Token;
    reserve1: Token;
    total_liquidity: string;
};

type PairRow = {
    code: string;
    active: boolean;
    reserve0: {
        quantity: string;
        contract: string;
    };
    reserve1: {
        quantity: string;
        contract: string;
    };
    total_liquidity: string;
};

type Route = {
    hash: string;
    exchanges?: string[];
    markets?: Market[];
    path?: [string[], boolean, string, string, string][];
    pools?: Pool[];
    poolsV3?: any[];
    routeLiquidity?: Liquidity;
    src_types?: string[];
    srcedPath?: Path[];
    route_price?: number;
    type: string;
    fees: number;
    platform_fees: number;
    amount_in: number;
    amount_received: number;
    amounts_received: number[];
    minimum_received: number;
    minimums_received: number[];
    actions: Action[];
};

type PairSource = {
    src: string;
    src_type?: string;
    pair_id?: string;
    token0: Token;
    token1: Token;
    fee: number;
};

type Market = {
    id: number;
    src: string;
    token0: Token;
    token1: Token;
    min_buy: number;
    min_sell: number;
    frozen: boolean;
    fee: number;
    lastPrice: number;
    lastSide: string;
    src_type: string;
};

export type Token = {
    symbol: Symbol;
    amount: any;
    contract: string;
};

type Symbol = {
    ticker: string;
    precision: number;
};

export type Pool = {
    pairid: string;
    src: string;
    fee: number;
    lptoken: Token;
    token0: Token;
    token1: Token;
    reserve0: number;
    reserve1: number;
    input_min_units: number;
    price: number;
    src_type: string;
    update_num: number;
};

type Liquidity = {
    input: number;
    output: number;
};

type Path = {
    type: string;
    index: number;
};

type Action = {
    to: string;
    quantity: string;
    memo: string;
};
