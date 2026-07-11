import { cors } from "../../../lib";

async function rate(symbol?: string | null): Promise<Response> {
    try {
        if (!symbol) {
            return new Response("No symbol provided", { status: 400 });
        }

        let rate;
        if (!rate) {
            const result = await fetch(`https://cryptoprices.cc/${symbol.toLocaleUpperCase()}`, {
                method: "GET",
                redirect: "follow",
                headers: {
                    "Content-Type": "text/plain",
                },
            });
            if (result.status !== 200) {
                return new Response("No rate found", { status: 404 });
            }
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
