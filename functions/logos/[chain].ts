import cors from '../../lib/cors'

async function tokens(chain?: string | null): Promise<Response> {
    try {
        if (!chain) {
            return new Response('No symbol provided', { status: 400 });
        }
        const [eosCafePromise, alcorPromise] = await Promise.allSettled([
            fetch(`https://raw.githubusercontent.com/eoscafe/eos-airdrops/master/tokens.json`, {
                method: 'GET',
                redirect: 'follow',
                headers: {
                    'Content-Type': 'application/json',
                }
            }),
            fetch(`https://api.github.com/repos/avral/alcor-ui/contents/assets/tokens/${chain.toLowerCase()}`, {
                method: 'GET',
                redirect: 'follow',
                headers: {
                    'Content-Type': 'application/json',
                }
            }),
        ]);

        const logos: Record<string, any> = {};

        if (alcorPromise.status === 'rejected' && eosCafePromise.status === 'rejected') {
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
                const text = (await eosCafePromise.value.text()).replace(`"chain": "wax",`, `"chain": "wax"`); // fix invalid json
                JSON.parse(text)
                .filter((token: any) => token.chain === chain)
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
        return new Response(JSON.stringify(logos), { headers: { 'Cache-Control': 's-maxage=600', 'content-type': 'application/json'}, });
    } catch (error) {
        if (error instanceof Error) {
            return new Response(error.message, { status: 500 });
        }
        return new Response('Unknown error', { status: 500 });
    }
}



export const onRequestGet: PagesFunction = async({ request, params }) => {
    console.log(request);
    const chain = params.chain as string;
    const res = await tokens(chain);
    return cors(request, res);
};
