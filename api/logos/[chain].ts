import cors from '../../lib/cors'

export const config = {
    runtime: 'edge',
};

async function tokens(chain?: string | null): Promise<Response> {
    try {
        if (!chain) {
            return new Response('No symbol provided', { status: 400 });
        }
        const result = await fetch(`https://raw.githubusercontent.com/eoscafe/eos-airdrops/master/tokens.json`, {
            method: 'GET',
            redirect: 'follow',
            headers: {
                'Content-Type': 'application/json',
            }
        });
        const list = await result.json();
        const filtered = list.filter((token: any) => token.chain === chain);
        const logos = filtered.reduce((map: any, token: any) => {
            map[`${token.symbol}@${token.account}`] = {
                logo: token.logo,
                logo_lg: token.logo_lg,
            }
            return map;
        }, {});
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
