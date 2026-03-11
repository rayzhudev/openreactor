import { handleGitHubAuthCallback, type Env } from "../../_shared";

export const onRequestGet = ({ request, env }: PagesContext<Env>): Promise<Response> =>
  handleGitHubAuthCallback(request, env);
