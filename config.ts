type Config = {
    WAXONEDGE_API: string;
    NEFTY_IPFS: string;
    GITHUB_FILES: string;
    GITHUB_API: string;
    CHAINS: {
        [chain: string]: {
            NEFTY_API?: string;
            CHAIN_API?: string;
            BALANCES_API?: string;
            BALANCES_FALLBACK?: string;
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
            BALANCES_API: "https://lightapi-mainnet.neftyblocks.com/api/balances/wax",
            BALANCES_FALLBACK: "https://wax.light-api.net/api/balances/wax",
        },
        waxtest: {
            NEFTY_API: "https://aa-testnet.neftyblocks.com",
            CHAIN_API: "https://wax-testnet.neftyblocks.com",
            BALANCES_API: "https://lightapi-testnet.neftyblocks.com/api/balances/waxtest",
            BALANCES_FALLBACK: "https://testnet-lightapi.eosams.xeos.me/api/balances/waxtest",
        },
        proton: {
            BALANCES_API: "https://proton.light-api.net/api/balances/proton",
        },
        protontest: {
            BALANCES_API: "https://testnet-lightapi.eosams.xeos.me/api/balances/protontest",
        },
        telos: {
            BALANCES_API: "https://lightapi-mainnet.neftyblocks.com/api/balances/wax",
        },
        telostest: {
            BALANCES_API: "https://telos.light-api.net/api/balances/telos",
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

    const launchbagzUrl = config.CHAINS[configChain]?.NEFTY_API;
    const balanceUrl = config.CHAINS[configChain]?.BALANCES_API;
    const chainApiUrl = config.CHAINS[configChain]?.CHAIN_API;
    const balancesFallbackUrl = config.CHAINS[configChain]?.BALANCES_FALLBACK;

    return {
        mainChain,
        launchbagzUrl,
        balanceUrl,
        balancesFallbackUrl,
        chainApiUrl,
    };
};
