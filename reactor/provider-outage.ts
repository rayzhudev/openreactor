export type ProviderKey = "codex" | "claude";

const GENERIC_OUTAGE_PATTERNS = [
  "rate limit",
  "too many requests",
  "overloaded",
  "temporarily unavailable",
  "service unavailable",
  "server had an error while processing your request",
  "internal server error",
  "api connection error",
  "connection error",
  "connection reset",
  "econnreset",
  "timed out",
  "timeout",
  "bad gateway",
  "upstream connect error",
  "error 502",
  "error 503",
  "error 529"
] as const;

const PROVIDER_SPECIFIC_PATTERNS: Record<ProviderKey, readonly string[]> = {
  codex: ["openai", "codex"],
  claude: ["anthropic", "claude"]
};

export function detectProviderOutage(
  provider: ProviderKey,
  message: string | null | undefined
): string | null {
  const normalized = normalizeMessage(message);
  if (!normalized) {
    return null;
  }

  if (normalized.includes("both ai providers appear unavailable")) {
    return "both AI providers appear unavailable";
  }

  const matchedPattern = GENERIC_OUTAGE_PATTERNS.find((pattern) => normalized.includes(pattern));
  if (!matchedPattern) {
    return null;
  }

  const mentionsProvider = PROVIDER_SPECIFIC_PATTERNS[provider].some((pattern) =>
    normalized.includes(pattern)
  );

  if (!mentionsProvider && !looksProviderGeneratedFailure(normalized)) {
    return null;
  }

  return matchedPattern;
}

export function looksProviderGeneratedFailure(message: string | null | undefined): boolean {
  const normalized = normalizeMessage(message);
  if (!normalized) {
    return false;
  }

  return (
    normalized.includes("api error") ||
    normalized.includes("provider") ||
    normalized.includes("model") ||
    normalized.includes("request id") ||
    normalized.includes("x-request-id")
  );
}

function normalizeMessage(message: string | null | undefined): string {
  return (message ?? "").trim().toLowerCase();
}
