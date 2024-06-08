import cors from '../../../lib/cors'

async function tokens(chain?: string | null): Promise<Response> {
    try {
        if (!chain) {
            return new Response('No chain provided', { status: 400 });
        }

        let mainChain = chain;
        let launchbagzUrl = chain.includes('wax') ? 'https://aa.neftyblocks.com' : undefined;
        if (chain.includes('test')) { 
            mainChain = chain.replace('testnet', '').replace('test', '');
            if (launchbagzUrl) {
                launchbagzUrl = 'https://aa-testnet.neftyblocks.com';
            }
        } else if (chain.includes('main')) { 
            mainChain = chain.replace('mainnet', '').replace('main', '');
        }

        const [eosCafePromise, alcorPromise, launchbagzTokens] = await Promise.allSettled([
            fetch(`https://raw.githubusercontent.com/eoscafe/eos-airdrops/master/tokens.json`, {
                method: 'GET',
                redirect: 'follow',
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'request',
                }
            }),
            fetch(`https://api.github.com/repos/avral/alcor-ui/contents/assets/tokens/${mainChain.toLowerCase()}`, {
                method: 'GET',
                redirect: 'follow',
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'request',
                }
            }),
            launchbagzUrl ? fetch(`${launchbagzUrl}/launchbagz/v1/tokens?limit=1000`, {
                method: 'GET',
                redirect: 'follow',
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'request',
                }
            }) : Promise.reject(new Error('No launchbagz url provided')),
        ]);

        const logos: Record<string, any> = {};

        if (alcorPromise.status === 'rejected' && eosCafePromise.status === 'rejected' && launchbagzTokens.status === 'rejected') {
            return new Response('No logos found', { status: 404 });
        }

        if (alcorPromise.status === 'fulfilled') {
            try {
                (await alcorPromise.value.json() as any)
                .forEach((token: any) => {
                    const nameWithoutLastExtension = token.name.split('.').slice(0, -1).join('.');
                    const [symbol, contract] = nameWithoutLastExtension.split('_');
                    if (symbol && contract) {
                        logos[`${symbol.toUpperCase()}@${contract.toLowerCase()}`] = {
                            logo: token.download_url,
                            logo_lg: token.download_url,
                        }
                    }
                });
            } catch (error) {
                console.log(error);
            }
        }

        if (eosCafePromise.status === 'fulfilled') {
            try {
                const json = await eosCafePromise.value.json() as any;
                json.filter((token: any) => token.chain === mainChain)
                .forEach((token: any) => {
                    logos[`${token.symbol}@${token.account}`] = {
                        logo: token.logo,
                        logo_lg: token.logo_lg,
                    }
                });
            } catch (error) {
                console.log(error);   
            }
        }

        if (launchbagzTokens.status === 'fulfilled') {
            try {
                (await launchbagzTokens.value.json() as any).data
                .forEach((token: any) => {
                    logos[`${token.token_code.toUpperCase()}@${token.token_contract}`] = {
                        logo: `https://ipfs.neftyblocks.io/ipfs/${token.image}`,
                        logo_lg: `https://ipfs.neftyblocks.io/ipfs/${token.image}`
                    }
                });
            } catch (error) {
                console.log(error);
            }
        }

        return new Response(JSON.stringify(logos), { headers: { 'Cache-Control': 's-maxage=600', 'content-type': 'application/json'}, });
    } catch (error) {
        if (error instanceof Error) {
            return new Response(error.message, { status: 500 });
        }
        return new Response('Unknown error', { status: 500 });
    }
}



export const onRequestGet: PagesFunction = async({ request, params }) => {
    const chain = params.chain as string;
    const res = await tokens(chain);
    return cors(request, res);
};
