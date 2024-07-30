import { getChainConfig } from "../config";
import { useFetch } from "../lib";

type TaxAPI = {
    success: boolean;
    message?: string;
    data?: Tax[];
    query_time: number;
};

export type Tax = {
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

export async function getAllTaxes({ chain }: { chain: string }): Promise<Record<string, number>> {
    const { launchbagzUrl } = getChainConfig(chain);
    const taxesPromise = await useFetch<TaxAPI>("/launchbagz/v1/tokens", {
        baseUrl: launchbagzUrl,
        headers: {
            "Content-Type": "application/json",
        },
    });

    const taxData = taxesPromise.data?.data || [];
    return transformTaxes(taxData);
}

const transformTaxes = (taxes: Tax[] = []): Record<string, number> => {
    const results: Record<string, number> = {};

    for (let i = 0; i < taxes.length; i++) {
        const { token_code, token_contract, tx_fee } = taxes[i];
        results[`${token_code}@${token_contract}`] = tx_fee;
    }

    return results;
};
