import { handleGitHubAuthStart, type Env } from "../../_shared";

export const onRequestGet = ({ request, env }: PagesContext<Env>): Promise<Response> =>
  handleGitHubAuthStart(request, env);
