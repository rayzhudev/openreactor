import { handleLeaderboard, handleOptions, type Env } from "../_shared";

export const onRequestGet = ({ env }: PagesContext<Env>): Promise<Response> => handleLeaderboard(env);
export const onRequestOptions = (): Response => handleOptions();
