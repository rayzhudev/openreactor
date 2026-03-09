import { handleHealth, type Env } from "../_shared";

export const onRequestGet = ({ env }: PagesContext<Env>): Promise<Response> => handleHealth(env);
export const onRequestOptions = (): Response => new Response(null, { status: 204 });
