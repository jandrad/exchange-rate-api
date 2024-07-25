import { getChainConfig } from "../config";
import { useFetch } from "../lib";
import { fetchCached } from "../utils";

export const tacoSwapContract = "swap.taco";
export const neftySwapContract = "swap.nefty";
export const neftyLpContract = "lp.nefty";

export type Pair = {
    contract: string;
    code: string;
    active: boolean;
    reserve0: Token;
    reserve1: Token;
    total_liquidity: string;
};

export type Token = {
    symbol: Symbol;
    amount: any;
    contract: string;
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

type Symbol = {
    ticker: string;
    precision: number;
};

type RowsResponse<T> = {
    rows: T[];
    more: boolean;
    next_key: any;
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

type TacoPairRow = {
    id: string;
    pool1: {
        quantity: string;
        contract: string;
    };
    pool2: {
        quantity: string;
        contract: string;
    };
};

export async function getAllNeftyPairs({
    chain,
    options = {},
}: {
    chain: string;
    options?: Record<string, any>;
}): Promise<Pair[]> {
    const { chainApiUrl } = getChainConfig(chain);
    let lower_bound = undefined;
    let pairs: Pair[] = [];
    do {
        const result: { data: RowsResponse<PairRow> | null; error: Error | null } = await useFetch<
            RowsResponse<PairRow>
        >("/v1/chain/get_table_rows", {
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
                ...options,
            },
        });

        if (result.error) throw result.error;
        if (!result.data) throw new Error("No data found");

        pairs = pairs.concat(
            result.data.rows
                .filter(
                    (row) => row.active && +parseToken(row.reserve0).amount > 0 && +parseToken(row.reserve1).amount > 0
                )
                .map((row: PairRow) => ({
                    contract: neftyLpContract,
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

export async function getAllTacoPairs({
    chain,
    options = {},
}: {
    chain: string;
    options?: Record<string, any>;
}): Promise<Pair[]> {
    const { chainApiUrl } = getChainConfig(chain);
    let lower_bound = undefined;
    let pairs: Pair[] = [];
    do {
        const result: { data: RowsResponse<TacoPairRow> | null; error: Error | null } = await useFetch<
            RowsResponse<TacoPairRow>
        >("/v1/chain/get_table_rows", {
            baseUrl: chainApiUrl,
            method: "POST",
            body: {
                code: tacoSwapContract,
                scope: tacoSwapContract,
                table: "pairs",
                lower_bound,
                limit: 1000,
                reverse: false,
                json: true,
                show_payer: false,
                ...options,
            },
        });

        if (result.error) throw result.error;
        if (!result.data) throw new Error("No data found");

        pairs = pairs.concat(
            result.data.rows
                .filter((row) => +parseToken(row.pool1).amount > 0 && +parseToken(row.pool2).amount > 0)
                .map((row: TacoPairRow) => ({
                    contract: tacoSwapContract,
                    reserve0: parseToken(row.pool1),
                    reserve1: parseToken(row.pool2),
                    total_liquidity: "",
                    code: row.id,
                    active: true,
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

export async function getNeftySwapFees({ chain, env }: { chain: string; env: KVNamespace }): Promise<number> {
    return await fetchCached(
        async () => {
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

            const protocolFee = result.data.rows.find((row) => row.key === "fee.protocol")?.value ?? "0";
            const tradeFee = result.data.rows.find((row) => row.key === "fee.trade")?.value ?? "0";
            return +protocolFee + +tradeFee;
        },
        {
            key: `NEFTY_SWAP_FEES_${chain.toLocaleUpperCase()}`,
            env,
            ttlSeconds: 3600 * 24,
            fallbackToCache: false,
        }
    );
}

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
