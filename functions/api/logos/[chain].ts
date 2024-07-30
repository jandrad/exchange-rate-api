import { cors } from "../../../lib";
import { getAllLogos } from "../../../services/logos";
import { getURLParameters } from "../../../utils";

async function tokens({
    env,
    token,
    chain,
}: {
    env: KVNamespace;
    token?: string;
    chain?: string | null;
}): Promise<Response> {
    if (!chain) return new Response("No chain provided", { status: 400 });
    try {
        const logos = await getAllLogos({ env, chain });

        if (token) {
            if (logos[token])
                return new Response(JSON.stringify(logos[token]), {
                    headers: { "Cache-Control": "s-maxage=300", "content-type": "application/json" },
                });
            else return new Response("No token found", { status: 404 });
        }

        return new Response(JSON.stringify(logos), {
            headers: { "Cache-Control": "s-maxage=60", "content-type": "application/json" },
        });
    } catch (error) {
        if (error instanceof Error) {
            return new Response(error.message, { status: 500 });
        }
        return new Response("Unknown error", { status: 500 });
    }
}

interface Env {
    ERA: KVNamespace;
}

export const onRequest: PagesFunction<Env> = async ({ request, params, env }) => {
    const { token } = getURLParameters(request.url);
    const chain = params.chain as string;

    const res = await tokens({
        env: env.ERA,
        chain,
        token,
    });

    return cors(request, res);
};
