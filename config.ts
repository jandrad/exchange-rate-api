export const config = {
    WAXONEDGE_API: "https://mev-api.waxonedge.app",
    CHAIN_API: "https://wax.neftyblocks.com",
    CHAIN_API_TEST: "https://wax-testnet.neftyblocks.com",
    NEFTY_API: "https://aa.neftyblocks.com",
    NEFTY_API_TEST: "https://aa-testnet.neftyblocks.com",
    NEFTY_IPFS: "https://ipfs.neftyblocks.io",
    GITHUB_FILES: "https://raw.githubusercontent.com",
    GITHUB_API: "https://api.github.com",
    BALANCES_API: "https://lightapi-mainnet.neftyblocks.com/api/balances/wax",
    BALANCES_API_TEST: "https://lightapi-testnet.neftyblocks.com/api/balances/waxtest",
};

export const getChainConfig = (
    chain: string
): {
    mainChain: string;
    launchbagzUrl?: string;
    balanceUrl?: string;
    chainApiUrl?: string;
} => {
    let launchbagzUrl = chain.includes("wax") ? config.NEFTY_API : undefined;
    let balanceUrl = chain.includes("wax") ? config.BALANCES_API : undefined;
    let chainApiUrl = chain.includes("wax") ? config.CHAIN_API : undefined;
    let mainChain = chain;

    if (chain.includes("test")) {
        mainChain = chain.replace("testnet", "").replace("test", "");
        if (launchbagzUrl) launchbagzUrl = config.NEFTY_API_TEST;
        if (balanceUrl) balanceUrl = config.BALANCES_API_TEST;
        if (chainApiUrl) chainApiUrl = config.CHAIN_API_TEST;
    } else if (chain.includes("main")) {
        mainChain = chain.replace("mainnet", "").replace("main", "");
    }

    return {
        mainChain,
        launchbagzUrl,
        balanceUrl,
        chainApiUrl,
    };
};
