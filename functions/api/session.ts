import {
  handleOptions,
  handleSession,
  handleSessionDelete,
  type Env
} from "../_shared";

export const onRequestGet = ({ request, env }: PagesContext<Env>): Promise<Response> =>
  handleSession(request, env);

export const onRequestDelete = ({ request, env }: PagesContext<Env>): Promise<Response> =>
  handleSessionDelete(request, env);

export const onRequestOptions = (): Response => handleOptions();
