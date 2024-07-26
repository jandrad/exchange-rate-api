import { config } from "../../../config";
import { cors, useFetch } from "../../../lib";
import { getAllNeftyPairs, getNeftySwapFees, neftySwapContract, Pair, Pool, Token } from "../../../services/pairs";
import { isError, getURLParameters, shouldFallbackToNeftyPools, reportWoeResult } from "../../../utils";

async function getNeftyRoute({
    tokenIn,
    tokenOut,
    chain,
}: {
    chain: string;
    tokenIn: string;
    tokenOut: string;
}): Promise<Pair[]> {
    const pairs = await getAllNeftyPairs({ chain });
    const pairsMap: Record<string, Pair> = pairs.reduce(
        (acc, pair) => ({
            ...acc,
            [`${pair.reserve0.symbol.ticker}_${pair.reserve0.contract}-${pair.reserve1.symbol.ticker}_${pair.reserve1.contract}`]:
                pair,
            [`${pair.reserve1.symbol.ticker}_${pair.reserve1.contract}-${pair.reserve0.symbol.ticker}_${pair.reserve0.contract}`]:
                pair,
        }),
        {}
    );

    const directRoute = pairsMap[`${tokenIn}-${tokenOut}`];
    if (directRoute) {
        return [directRoute];
    }

    // Find a route from tokenIn to tokenOut
    const keys = Object.keys(pairsMap);
    const inPairs: Pair[] = [];
    const outPairs: Pair[] = [];
    do {
        const keyIn = keys.find((key) => key.split("-")[0] === tokenIn);
        const keyOut = keys.find((key) => key.split("-")[1] === tokenOut);
        if (!keyIn || !keyOut) return [];
        inPairs.push(pairsMap[keyIn]);
        outPairs.splice(0, 0, pairsMap[keyOut]);
        tokenIn = keyIn.split("-")[1];
        tokenOut = keyOut.split("-")[0];
    } while (tokenIn !== tokenOut);
    return [...inPairs, ...outPairs];
}

async function getNeftyRoutes({ params, env }: { params: Record<string, any>; env: KVNamespace }): Promise<Route[]> {
    const [pairs, fees] = await Promise.all([
        getNeftyRoute({
            tokenIn: params.token_in,
            tokenOut: params.token_out,
            chain: params.chain || "wax",
        }),
        getNeftySwapFees({ chain: params.chain || "wax", env }),
    ]);
    if (!pairs.length) {
        return [];
    }

    const fee = fees;
    const codes = [];
    const inputSymbol = pairs[0].reserve0.symbol;
    let routePrice = undefined;
    let inputAmount = +params.amount_in;
    let outputAmount = 0;
    let outputPrecision = 0;
    let tokenIn: string = params.token_in;

    for (const pair of pairs) {
        const reserve0String = `${pair.reserve0.symbol.ticker}_${pair.reserve0.contract}`;
        const inputReserve = reserve0String === tokenIn ? pair.reserve0 : pair.reserve1;
        const outputReserve = reserve0String === tokenIn ? pair.reserve1 : pair.reserve0;
        const inputReserveAmount = +inputReserve.amount;
        const outputReserveAmount = +outputReserve.amount;

        // Fix
        if (routePrice === undefined) {
            routePrice = inputReserveAmount / outputReserveAmount;
        } else {
            routePrice = (routePrice * inputReserveAmount) / outputReserveAmount;
        }
        const inputWithFee = inputAmount - (inputAmount * fee) / 10000;
        outputAmount =
            Math.floor(
                ((inputWithFee * outputReserveAmount) / (inputReserveAmount + inputWithFee)) *
                    10 ** outputReserve.symbol.precision
            ) /
            10 ** outputReserve.symbol.precision;

        inputAmount = outputAmount;
        outputPrecision = outputReserve.symbol.precision;
        tokenIn = `${outputReserve.symbol.ticker}_${outputReserve.contract}`;

        codes.push(pair.code);
    }

    const minAmount =
        Math.floor(outputAmount * (1 - params.slippage / 10000) * 10 ** outputPrecision) / 10 ** outputPrecision;

    const route: Route = {
        hash: `neftyblocks_${codes.join("-")}`,
        route_price: routePrice,
        fees,
        platform_fees: 0,
        amount_in: +params.amount_in,
        amount_received: outputAmount,
        amounts_received: [outputAmount],
        minimum_received: minAmount,
        minimums_received: [minAmount],
        actions: [
            {
                to: neftySwapContract,
                quantity: `${Number(params.amount_in).toFixed(inputSymbol.precision)} ${inputSymbol.ticker}`,
                memo: `swap:${codes.join("-")},min:${Math.floor(minAmount * 10 ** outputPrecision)}`,
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

async function getAllRoutes({
    params,
    env,
}: {
    params: Record<string, any>;
    env: KVNamespace;
}): Promise<Route[] | { error: string }> {
    let routes: Route[] = [];
    const fallback = await shouldFallbackToNeftyPools(env);
    if (fallback || params.chain?.includes("test")) {
        routes = await getNeftyRoutes({ params, env });
    } else {
        try {
            routes = await getWoeRoutes({ params });
            await reportWoeResult(env, true);
        } catch (error) {
            await reportWoeResult(env, false);
            throw error;
        }
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

        if (routes.error) {
            return new Response(routes.error, { status: 500 });
        }
        const filteredData = (routes as Route[]).slice(0, 1).map((route) => ({
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

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
    const params = getURLParameters(request.url);
    const res = await routes({
        params,
        env: env.ERA,
    });

    return cors(request, res);
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
