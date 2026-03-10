import { handleCreateRequest, handleListRequests, handleOptions, type Env } from "../_shared";

export const onRequestGet = ({ request, env }: PagesContext<Env>): Promise<Response> =>
  handleListRequests(request, env);

export const onRequestPost = ({ request, env }: PagesContext<Env>): Promise<Response> =>
  handleCreateRequest(request, env);

export const onRequestOptions = (): Response => handleOptions();
