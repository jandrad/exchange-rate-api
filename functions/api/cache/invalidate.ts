interface Env {
    ERA: KVNamespace;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
    const { logos, tokens, prices } = await request.json<{ logos: boolean; tokens: boolean; prices: boolean }>();
    const list = await env.ERA.list();
    const keysToInvalidate = list.keys
        .filter(({ name }) => {
            if (logos && name.includes("LOGOS_LAUNCHBAGZ")) return true;
            if (tokens && (name.includes("NEFTY_API_TOKENS") || name.includes("WAXONEDGE_API_TOKENS"))) return true;
            if (prices && name.includes("TOKEN_PRICES")) return true;
        })
        .map(({ name }) => name);

    if (!keysToInvalidate.length) return new Response("No cache to invalidate", { status: 200 });
    for (let i = 0; i < keysToInvalidate.length; i++) {
        await env.ERA.delete(keysToInvalidate[i]);
        console.log(`Invalidated ${keysToInvalidate[i]}`);
    }
    return new Response("OK", { status: 200 });
};
