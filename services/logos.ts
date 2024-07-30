import { config, getChainConfig } from "../config";
import { useFetch } from "../lib";
import { fetchCached } from "../utils";
import { getAllNeftyPairs, getAllTacoPairs, Pair } from "./pairs";

async function getEosCafeLogos(env: KVNamespace, chain: string): Promise<Record<string, any>> {
    const cacheId = `NEFTY_${chain.toUpperCase()}_LOGOS_EOSCAFE`;
    return await fetchCached(
        async () => {
            const { data, error } = await useFetch<
                { logo: string; logo_lg: string; symbol: string; account: string }[]
            >("/eoscafe/eos-airdrops/master/tokens.json", {
                baseUrl: config.GITHUB_FILES,
                headers: {
                    "Content-Type": "application/json",
                    "User-Agent": "request",
                },
            });

            if (error) throw error;
            if (!data) throw new Error("No data found");

            const logos: Record<string, any> = {};
            const filterData = data.filter((token: any) => token.chain === chain);

            for (let i = 0; i < filterData.length; i++) {
                const token = filterData[i];

                logos[`${token.symbol}@${token.account}`] = {
                    logo: token.logo,
                    logo_lg: token.logo_lg,
                };
            }
            return logos;
        },
        {
            key: cacheId,
            env,
            ttlSeconds: 3600,
            fallbackToCache: true,
        }
    );
}

async function getAlcorLogos(env: KVNamespace, chain: string): Promise<Record<string, any>> {
    const cacheId = `NEFTY_${chain.toUpperCase()}_LOGOS_ALCOR`;
    return await fetchCached(
        async () => {
            const { data, error } = await useFetch<{ name: string; download_url: string }[]>(
                `/repos/avral/alcor-ui/contents/assets/tokens/${chain.toLowerCase()}`,
                {
                    baseUrl: config.GITHUB_API,
                    headers: {
                        "Content-Type": "application/json",
                        "User-Agent": "request",
                    },
                }
            );

            if (error) throw error;
            if (!data) throw new Error("No data found");

            const logos: Record<string, any> = {};
            for (let i = 0; i < data.length; i++) {
                const { name, download_url } = data[i];

                const nameWithoutLastExtension = name.split(".").slice(0, -1).join(".");
                const [symbol, contract] = nameWithoutLastExtension.split("_");

                if (symbol && contract) {
                    logos[`${symbol.toUpperCase()}@${contract.toLowerCase()}`] = {
                        logo: download_url,
                        logo_lg: download_url,
                    };
                }
            }
            return logos;
        },
        {
            key: cacheId,
            env,
            ttlSeconds: 3600,
            fallbackToCache: true,
        }
    );
}

async function getLaunchbagzLogos(env: KVNamespace, chain: string, url?: string): Promise<Record<string, any>> {
    if (!url) return {};

    const cacheId = `NEFTY_${chain.toUpperCase()}_LOGOS_LAUNCHBAGZ`;
    return await fetchCached(
        async () => {
            const { data, error } = await useFetch<{
                data: { token_code: string; token_contract: string; image: string }[];
            }>("/launchbagz/v1/tokens", {
                baseUrl: url,
                params: {
                    limit: Number(1000).toString(),
                },
                headers: {
                    "Content-Type": "application/json",
                    "User-Agent": "request",
                },
            });

            if (error) throw error;
            if (!data) throw new Error("No data found");

            const logos: Record<string, any> = {};
            for (let i = 0; i < data.data.length; i++) {
                const token = data.data[i];

                if (token.image) {
                    logos[`${token.token_code.toUpperCase()}@${token.token_contract}`] = {
                        logo: `${config.NEFTY_IPFS}/ipfs/${token.image}`,
                        logo_lg: `${config.NEFTY_IPFS}/ipfs/${token.image}`,
                    };
                }
            }

            return logos;
        },
        {
            key: cacheId,
            env,
            ttlSeconds: 3600,
            fallbackToCache: true,
        }
    );
}

async function getNeftyPairs(env: KVNamespace, chain: string): Promise<Pair[]> {
    const cacheId = `NEFTY_${chain.toUpperCase()}_NEFTY_PAIRS`;
    return await fetchCached(
        async () => {
            return await getAllNeftyPairs({
                chain,
            });
        },
        {
            key: cacheId,
            env,
            ttlSeconds: 3600,
            fallbackToCache: true,
        }
    );
}

async function getTacoPairs(env: KVNamespace, chain: string): Promise<Pair[]> {
    const cacheId = `NEFTY_${chain.toUpperCase()}_TACO_PAIRS`;
    return await fetchCached(
        async () => {
            return await getAllTacoPairs({
                chain,
            });
        },
        {
            key: cacheId,
            env,
            ttlSeconds: 3600,
            fallbackToCache: true,
        }
    );
}

export async function getAllLogos({
    env,
    chain,
}: {
    env: KVNamespace;
    chain: string;
}): Promise<Record<string, { logo: string; logo_lg: string }>> {
    const { launchbagzUrl, mainChain } = getChainConfig(chain);

    const [alcorLogos, eosCafeLogos, launchbagzLogos, neftyPairs, tacoPairs] = await Promise.all([
        getAlcorLogos(env, mainChain),
        getEosCafeLogos(env, mainChain),
        getLaunchbagzLogos(env, chain, launchbagzUrl),
        getNeftyPairs(env, chain),
        getTacoPairs(env, chain),
    ]);

    const logos = [alcorLogos, eosCafeLogos, launchbagzLogos].reduce(
        (acc, curr) => ({
            ...acc,
            ...curr,
        }),
        {}
    );

    let newLogos = 0;
    while (newLogos === 0) {
        for (const pair of [...neftyPairs, ...tacoPairs]) {
            const pairKey = `${pair.code}@${pair.contract}`;
            const token1Key = `${pair.reserve0.symbol.ticker}@${pair.reserve0.contract}`;
            const token2Key = `${pair.reserve1.symbol.ticker}@${pair.reserve1.contract}`;
            const logo1 = logos[token1Key];
            const logo2 = logos[token2Key];
            if (logo1 && logo2 && !logos[pairKey]) {
                logos[pairKey] = {
                    logo: `https://resizer.neftyblocks.com/composer?left=${encodeURIComponent(
                        logo1.logo_lg
                    )}&right=${encodeURIComponent(logo2.logo_lg)}&width=100`,
                    logo_lg: `https://resizer.neftyblocks.com/composer?left=${encodeURIComponent(
                        logo1.logo_lg
                    )}&right=${encodeURIComponent(logo2.logo_lg)}&width=300`,
                };
                newLogos++;
            }
        }

        if (newLogos === 0) break;
        newLogos = 0;
    }

    return logos;
}
