// biome-ignore lint/suspicious/noExplicitAny: <explanation>
export const isError = (error: any): Response => {
    if (error instanceof Error) return new Response(error.message, { status: 500 });
    return new Response("Unknown error", { status: 500 });
};
