import cors from '../../lib/cors'

export const config = {
    runtime: 'edge',
};

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
            (await alcorPromise.value.json())
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
        }

        if (eosCafePromise.status === 'fulfilled') {
            (await eosCafePromise.value.json())
            .filter((token: any) => token.chain === chain)
            .forEach((token: any) => {
                logos[`${token.symbol}@${token.account}`] = {
                    logo: token.logo,
                    logo_lg: token.logo_lg,
                }
            });
        }
        return new Response(JSON.stringify(logos), { headers: { 'Cache-Control': 's-maxage=600', 'content-type': 'application/json'}, });
    } catch (error) {
        return new Response(error.message, { status: 500 });
    }
}

export default async (req: Request) => {
    let res = new Response("");
    if (req.method === 'GET') {
        const url = new URL(req.url);
        const urlSearchParams = new URLSearchParams(url.search);
        const ticker = urlSearchParams.get('chain')?.toLocaleLowerCase();
        res = await tokens(ticker);
    }
    return cors(req, res);
};
