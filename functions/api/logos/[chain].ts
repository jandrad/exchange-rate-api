import { config } from "../../../config";
import { cors, useFetch } from "../../../lib";
import { getURLParameters, timestamp, validTimestamp } from "../../../utils";

async function tokens({
    env,
    token,
    chain,
}: {
    env: KVNamespace;
    token?: string;
    chain?: string | null;
}): Promise<Response> {
    if (!chain) return new Response("No chain provided", { status: 400 });

    try {
        const id = `NEFTY_${chain.toUpperCase()}_LOGOS`;
        const store = await env.get(id);
        const parsed = store ? JSON.parse(store) : null;

        let logos: Record<string, any> = {};

        if (parsed && validTimestamp(parsed.timestamp)) logos = parsed.data;
        else {
            let mainChain = chain;
            let launchbagzUrl = chain.includes("wax") ? config.NEFTY_API : undefined;

            if (chain.includes("test")) {
                mainChain = chain.replace("testnet", "").replace("test", "");

                if (launchbagzUrl) launchbagzUrl = config.NEFTY_API_TEST;
            } else if (chain.includes("main")) {
                mainChain = chain.replace("mainnet", "").replace("main", "");
            }

            const [eosCafePromise, alcorPromise, launchbagzTokens] = await Promise.allSettled([
                useFetch("/eoscafe/eos-airdrops/master/tokens.json", {
                    baseUrl: config.GITHUB_FILES,
                    headers: {
                        "Content-Type": "application/json",
                        "User-Agent": "request",
                    },
                }),
                useFetch(`/repos/avral/alcor-ui/contents/assets/tokens/${mainChain.toLowerCase()}`, {
                    baseUrl: config.GITHUB_API,
                    headers: {
                        "Content-Type": "application/json",
                        "User-Agent": "request",
                    },
                }),
                launchbagzUrl
                    ? useFetch("/launchbagz/v1/tokens", {
                          baseUrl: launchbagzUrl,
                          params: {
                              limit: Number(1000).toString(),
                          },
                          headers: {
                              "Content-Type": "application/json",
                              "User-Agent": "request",
                          },
                      })
                    : Promise.reject(new Error("No launchbagz url provided")),
            ]);

            if (
                alcorPromise.status === "rejected" &&
                eosCafePromise.status === "rejected" &&
                launchbagzTokens.status === "rejected"
            ) {
                return new Response("No logos found", { status: 404 });
            }

            if (alcorPromise.status === "fulfilled") {
                const { data, error } = alcorPromise.value;
                if (error) console.log(error);

                if (data) {
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
                }
            }

            if (eosCafePromise.status === "fulfilled") {
                const { data, error } = eosCafePromise.value;
                if (error) console.log(error);

                if (data) {
                    const filterData = data.filter((token: any) => token.chain === mainChain);

                    for (let i = 0; i < filterData.length; i++) {
                        const token = filterData[i];

                        logos[`${token.symbol}@${token.account}`] = {
                            logo: token.logo,
                            logo_lg: token.logo_lg,
                        };
                    }
                }
            }

            if (launchbagzTokens.status === "fulfilled") {
                const { data, error } = launchbagzTokens.value;
                if (error) console.log(error);

                if (data) {
                    for (let i = 0; i < data.length; i++) {
                        const token = data[i];

                        if (token.image) {
                            logos[`${token.token_code.toUpperCase()}@${token.token_contract}`] = {
                                logo: `${config.NEFTY_IPFS}/ipfs/${token.image}`,
                                logo_lg: `${config.NEFTY_IPFS}/ipfs/${token.image}`,
                            };
                        }
                    }
                }
            }

            await env.put(
                id,
                JSON.stringify({
                    // cache for 1 hour
                    timestamp: timestamp(3600),
                    data: logos,
                })
            );
        }

        if (token) {
            if (logos[token])
                return new Response(JSON.stringify(logos[token]), {
                    headers: { "Cache-Control": "s-maxage=3600", "content-type": "application/json" },
                });
            else return new Response("No token found", { status: 404 });
        }

        return new Response(JSON.stringify(logos), {
            headers: { "Cache-Control": "s-maxage=3600", "content-type": "application/json" },
        });
    } catch (error) {
        if (error instanceof Error) {
            return new Response(error.message, { status: 500 });
        }
        return new Response("Unknown error", { status: 500 });
    }
}

interface Env {
    ERA: KVNamespace;
}

export const onRequestGet: PagesFunction<Env> = async ({ request, params, env }) => {
    const { token } = getURLParameters(request.url);
    const chain = params.chain as string;

    const res = await tokens({
        env: env.ERA,
        chain,
        token,
    });

    return cors(request, res);
};
