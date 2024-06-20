export * from "./url";
export * from "./error";

export const timestamp = (future: number) => Math.floor(Date.now() / 1000) + future;

export const validTimestamp = (timestamp: number) => timestamp > Math.floor(Date.now() / 1000);
