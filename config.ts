type Config = {
    WAXONEDGE_API: string;
    NEFTY_IPFS: string;
    GITHUB_FILES: string;
    GITHUB_API: string;
    CHAINS: {
        [chain: string]: {
            NEFTY_API?: string;
            CHAIN_API?: string;
            LIGHT_API: string[];
        };
    };
};

export const config: Config = {
    WAXONEDGE_API: "https://woe-api.neftyblocks.com",
    NEFTY_IPFS: "https://ipfs.neftyblocks.io",
    GITHUB_FILES: "https://raw.githubusercontent.com",
    GITHUB_API: "https://api.github.com",
    CHAINS: {
        wax: {
            NEFTY_API: "https://aa.neftyblocks.com",
            CHAIN_API: "https://wax.neftyblocks.com",
            LIGHT_API: ["https://lightapi-mainnet.neftyblocks.com", "https://wax.light-api.net"],
        },
        waxtest: {
            NEFTY_API: "https://aa-testnet.neftyblocks.com",
            CHAIN_API: "https://wax-testnet.neftyblocks.com",
            LIGHT_API: ["https://lightapi-testnet.neftyblocks.com", "https://testnet-lightapi.eosams.xeos.me"],
        },
        proton: {
            LIGHT_API: ["https://proton.light-api.net"],
        },
        protontest: {
            LIGHT_API: ["https://testnet-lightapi.eosams.xeos.me"],
        },
        telos: {
            LIGHT_API: ["https://telos.light-api.net"],
        },
        telostest: {
            LIGHT_API: ["https://testnet-lightapi.eosams.xeos.me"],
        },
    },
};

export const getChainConfig = (
    chain: string
): {
    mainChain: string;
    launchbagzUrl?: string;
    balanceUrl?: string;
    balancesFallbackUrl?: string;
    holdersUrl?: string;
    holdersFallbackUrl?: string;
    holdersCountUrl?: string;
    holdersCountFallbackUrl?: string;
    chainApiUrl?: string;
} => {
    let mainChain = chain;
    let configChain = chain;

    if (chain.includes("test")) {
        mainChain = chain
            .replace(/\\_\\-/g, "")
            .replace("testnet", "")
            .replace("test", "")
            .toLocaleLowerCase();
        configChain = `${mainChain}test`;
    } else {
        mainChain = chain.replace("mainnet", "").replace("main", "").toLocaleLowerCase();
        configChain = mainChain;
    }

    const lightApiUrl = config.CHAINS[configChain]?.LIGHT_API[0];
    const lightApiFallbackUrl = config.CHAINS[configChain]?.LIGHT_API[1];

    const getApiUrl = (chain: string, path: string, fallback: boolean) => {
        if (fallback && lightApiFallbackUrl) {
            return `${lightApiFallbackUrl}/${path}/${chain}`;
        }

        if (lightApiUrl) {
            return `${lightApiUrl}/${path}/${chain}`;
        }

        return undefined;
    };

    const launchbagzUrl = config.CHAINS[configChain]?.NEFTY_API;
    const chainApiUrl = config.CHAINS[configChain]?.CHAIN_API;

    return {
        mainChain,
        launchbagzUrl,
        balanceUrl: getApiUrl(configChain, "api/balances", false),
        balancesFallbackUrl: getApiUrl(configChain, "api/balances", true),
        holdersUrl: getApiUrl(configChain, "api/topholders", false),
        holdersFallbackUrl: getApiUrl(configChain, "api/topholders", true),
        holdersCountUrl: getApiUrl(configChain, "api/holdercount", false),
        holdersCountFallbackUrl: getApiUrl(configChain, "api/holdercount", true),
        chainApiUrl,
    };
};
