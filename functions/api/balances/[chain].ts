import { getChainConfig } from "../../../config";
import { cors, useFetch } from "../../../lib";
import { getAllLogos } from "../../../services/logos";
import { getAllTaxes } from "../../../services/taxes";
import { isError, getURLParameters } from "../../../utils";
import { getPrices } from "../prices/[chain]";

async function getAccountBalances({
    balanceUrl,
    fallbackUrl,
    account,
}: {
    account: string;
    balanceUrl: string;
    fallbackUrl?: string;
}): Promise<{ data: BalancesResponse | null; error: any }> {
    const result = await Promise.race([
        useFetch<BalancesResponse>(`/${account}`, {
            baseUrl: balanceUrl,
            headers: {
                "Content-Type": "application/json",
            },
        }),
        new Promise<{ data: BalancesResponse | null; error: any }>((resolve) =>
            setTimeout(() => resolve({ data: null, error: new Error("Timeout exceeded") }), fallbackUrl ? 1500 : 4000)
        ),
    ]);

    if (result.error) {
        if (fallbackUrl) {
            return getAccountBalances({ account, balanceUrl: fallbackUrl, fallbackUrl: undefined });
        }
        return result;
    }

    return result;
}

async function balances({
    env,
    account,
    chain,
}: {
    env: KVNamespace;
    account?: string;
    chain: string;
}): Promise<Response> {
    if (!account) return new Response("No account provided", { status: 400 });

    const { balanceUrl, balancesFallbackUrl } = getChainConfig(chain);
    if (!balanceUrl) {
        return new Response("Unsupported chain", { status: 400 });
    }

    const [prices, { data, error }, taxes, logos] = await Promise.all([
        getPrices(env, chain),
        getAccountBalances({ balanceUrl: balanceUrl, account, fallbackUrl: balancesFallbackUrl }),
        getAllTaxes({ chain }),
        getAllLogos({ env, chain }),
    ]);

    if (error) return isError(error);
    if (!data) return new Response("No data found", { status: 404 });

    const balances: Balance[] = [];
    for (let i = 0; i < data.balances.length; i++) {
        const balance = data.balances[i];
        if (+balance.amount <= 0) continue;

        const tokenKey = `${balance.currency}@${balance.contract}`;
        const price = prices[tokenKey];
        let usdValue = "0.00";
        if (price) {
            usdValue = (+balance.amount * price).toFixed(2);
        }
        balances.push({
            contract: balance.contract,
            amount: balance.amount,
            decimals: balance.decimals,
            currency: balance.currency,
            usdValue,
            tax: taxes[tokenKey] || 0,
            logo: logos[tokenKey]?.logo_lg,
        });
    }

    balances.sort((a, b) => +b.usdValue! - +a.usdValue!);

    return new Response(JSON.stringify(balances), {
        headers: { "content-type": "application/json" },
    });
}

interface Env {
    ERA: KVNamespace;
}

export const onRequest: PagesFunction<Env> = async ({ request, env, params }) => {
    const { account } = getURLParameters(request.url);
    const chain = params.chain as string;
    const res = await balances({
        env: env.ERA,
        chain,
        account,
    });

    return cors(request, res);
};

type BalancesResponse = {
    balances: Balance[];
};

type Balance = {
    contract: string;
    amount: string;
    decimals: number;
    currency: string;
    usdValue: string;
    tax: number;
    logo?: string;
};
