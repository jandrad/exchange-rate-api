import cors from "../../../lib/cors";

async function rate(apiKey: string, symbol?: string | null): Promise<Response> {
    try {
        if (!symbol) {
            return new Response("No symbol provided", { status: 400 });
        }
        const result = await fetch(`https://api.currencyfreaks.com/latest?apikey=${apiKey}&symbols=${symbol}`, {
            method: "GET",
            redirect: "follow",
            headers: {
                "Content-Type": "application/json",
                apiKey,
            },
        });
        const data = (await result.json()) as any;
        const rate = data?.rates?.[symbol];
        if (!rate) {
            return new Response("No rate found", { status: 404 });
        }
        return new Response(rate, { headers: { "Cache-Control": "s-maxage=43200" } });
    } catch (error) {
        if (error instanceof Error) {
            return new Response(error.message, { status: 500 });
        }
        return new Response("Unknown error", { status: 500 });
    }
}

interface Env {
    KV: KVNamespace;
    API_KEY: string;
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env, params }) => {
    const ticker = (params.ticker as string).toUpperCase();
    const res = await rate(env.API_KEY, ticker);
    return cors(request, res);
};
