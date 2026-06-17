// Resolve which LLM provider to use from env. Supports OpenAI and OpenRouter
// (both speak the OpenAI API), defaulting to OpenAI when an OpenAI key is present.
export function resolveLlmConfig(explicitModel?: string): {
  apiKey?: string;
  baseURL?: string;
  model: string;
} {
  const openaiKey = process.env.OPENAI_API_KEY;
  const openrouterKey = process.env.OPENROUTER_API_KEY;
  const apiKey = openaiKey ?? openrouterKey;

  // OpenAI uses the SDK's default endpoint (no baseURL); OpenRouter needs its own.
  const baseURL =
    process.env.LLM_BASE_URL ??
    (openaiKey ? undefined : openrouterKey ? "https://openrouter.ai/api/v1" : undefined);

  const model =
    explicitModel ??
    process.env.LLM_MODEL ??
    process.env.OPENROUTER_MODEL ??
    (openaiKey ? "gpt-4o-mini" : "anthropic/claude-3.5-haiku");

  return { apiKey, baseURL, model };
}
