import cors from '../../../lib/cors'

async function rate(symbol?: string | null): Promise<Response> {
    try {
        if (!symbol) {
            return new Response('No symbol provided', { status: 400 });
        }

        let rate;
        try {
            const result = await fetch(`https://min-api.cryptocompare.com/data/price?fsym=${symbol}&tsyms=USD`, {
                method: 'GET',
                redirect: 'follow',
                headers: {
                    'Content-Type': 'text/plain',
                }
            });
            rate = (await result.json() as any).USD;
        } catch (error) {
            const result = await fetch(`https://cryptoprices.cc/${symbol}`, {
                method: 'GET',
                redirect: 'follow',
                headers: {
                    'Content-Type': 'text/plain',
                }
            });
            rate = await result.text();
        }
        
        if (!rate) {
            return new Response('No rate found', { status: 404 });
        }
        return new Response(rate, { headers: { 'Cache-Control': 's-maxage=600' } });
    } catch (error) {
        if (error instanceof Error) {
            return new Response(error.message, { status: 500 });
        }
        return new Response('Unknown error', { status: 500 });
    }
}

export const onRequestGet: PagesFunction = async({ request, params }) => {
    const ticker = (params.ticker as string).toUpperCase();
    const res = await rate(ticker);
    return cors(request, res);
};
