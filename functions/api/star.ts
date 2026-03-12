import { handleCreateStar, handleOptions, type Env } from "../_shared";

export const onRequestPost = ({ request, env }: PagesContext<Env>): Promise<Response> =>
  handleCreateStar(request, env);

export const onRequestOptions = (): Response => handleOptions();
