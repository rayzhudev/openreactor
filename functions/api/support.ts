import { handleCreateSupport, handleOptions, type Env } from "../_shared";

export const onRequestPost = ({ request, env }: PagesContext<Env>): Promise<Response> =>
  handleCreateSupport(request, env);

export const onRequestOptions = (): Response => handleOptions();
