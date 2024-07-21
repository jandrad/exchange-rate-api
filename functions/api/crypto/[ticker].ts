import { cors } from "../../../lib";

async function rate(symbol?: string | null): Promise<Response> {
    try {
        if (!symbol) {
            return new Response("No symbol provided", { status: 400 });
        }

        let rate;
        try {
            const result = await fetch(`https://min-api.cryptocompare.com/data/price?fsym=${symbol}&tsyms=USD`, {
                method: "GET",
                redirect: "follow",
                headers: {
                    "Content-Type": "application/json",
                },
            });
            rate = ((await result.json()) as any).USD;
        } catch (error) {
            console.log(error);
        }

        if (!rate) {
            const result = await fetch(`https://cryptoprices.cc/${symbol}`, {
                method: "GET",
                redirect: "follow",
                headers: {
                    "Content-Type": "text/plain",
                },
            });
            rate = await result.text();
        }

        console.log("Rate for " + symbol + ": " + rate);

        if (!rate) {
            return new Response("No rate found", { status: 404 });
        }
        return new Response(rate, { headers: { "Cache-Control": "s-maxage=600" } });
    } catch (error) {
        if (error instanceof Error) {
            return new Response(error.message, { status: 500 });
        }
        return new Response("Unknown error", { status: 500 });
    }
}

export const onRequest: PagesFunction = async ({ request, params }) => {
    const ticker = (params.ticker as string).toUpperCase();
    const res = await rate(ticker);
    return cors(request, res);
};
