import { handleOpenReactorStatus, type Env } from "../_shared";

export const onRequestGet = ({ env }: PagesContext<Env>): Promise<Response> =>
  handleOpenReactorStatus(env);

export const onRequestOptions = (): Response => new Response(null, { status: 204 });
