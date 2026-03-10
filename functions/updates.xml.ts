import { handleUpdatesFeed, type Env } from "./_shared";

export const onRequestGet = ({ request, env }: PagesContext<Env>): Promise<Response> =>
  handleUpdatesFeed(request, env);

export const onRequestHead = ({ request, env }: PagesContext<Env>): Promise<Response> =>
  handleUpdatesFeed(request, env);
