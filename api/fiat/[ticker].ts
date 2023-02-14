import cors from '../../lib/cors'

export const config = {
    runtime: 'edge',
};

async function rate(symbol?: string | null): Promise<Response> {
    try {
        if (!symbol) {
            return new Response('No symbol provided', { status: 400 });
        }
        const apikey = process.env.API_KEY || '';
        const result = await fetch(`https://api.currencyfreaks.com/latest?apikey=${apikey}&symbols=${symbol}`, {
            method: 'GET',
            redirect: 'follow',
            headers: {
                'Content-Type': 'application/json',
                apikey,
            }
        });
        const data = await result.json();
        const rate = data?.rates?.[symbol];
        if (!rate) {
            return new Response('No rate found', { status: 404 });
        }
        return new Response(rate, { headers: { 'Cache-Control': 's-maxage=43200' } });
    } catch (error) {
        return new Response(error.message, { status: 500 });
    }
}

export default async (req: Request) => {

    let res = new Response("");
    if (req.method === 'GET') {
        const url = new URL(req.url);
        const urlSearchParams = new URLSearchParams(url.search);
        const ticker = urlSearchParams.get('ticker')?.toUpperCase();
        res = await rate(ticker);
    }
    return cors(req, res);
};