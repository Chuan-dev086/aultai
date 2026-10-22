/**
 * Central provider adapter for Gemini, DeepSeek, OpenRouter, Anthropic, OpenAI,
 * and custom OpenAI-compatible APIs.
 */

/**
 * Check whether mock mode is active (no provider API key configured).
 * @returns {boolean} True when no API key is set.
 */
export function isMockMode() {
  return selectedProvider() === null;
}

/**
 * Run an LLM completion. Returns a string, or a parsed object when
 * `json_schema` is provided. Provider failures are surfaced rather than
 * disguised as successful mock completions.
 * @param {object} args
 * @param {string} args.task AI task name for safe diagnostics.
 * @param {string} args.requestId Diagnostic request identifier.
 * @param {string} args.system System prompt.
 * @param {string} args.user User prompt.
 * @param {object} [args.json_schema] Optional schema; when present the
 * result is parsed as JSON and its top-level keys validated.
 * @returns {Promise<string | object>} Completion text or parsed object.
 */
export async function complete({ task, requestId, system, user, json_schema }) {
  if (isMockMode()) {
    return mockComplete({ system, user, json_schema });
  }
  return callLive({ task, requestId, system, user, json_schema });
}

/**
 * Call the configured provider.
 * @param {object} args
 * @param {string} args.system System prompt.
 * @param {string} args.user User prompt.
 * @param {object} [args.json_schema] Optional schema for key validation.
 * @returns {Promise<string | object>} Completion.
 */
async function callLive({ task, requestId, system, user, json_schema }) {
  const provider = selectedProvider();
  const model = provider === "gemini"
    ? process.env.GEMINI_MODEL ?? "gemini-3.1-flash-lite"
    : provider === "deepseek"
      ? process.env.DEEPSEEK_MODEL ?? "deepseek-flash"
      : provider === "openrouter"
        ? process.env.OPENROUTER_MODEL ?? "recursive/flint-v1.0:free"
        : provider === "custom"
          ? process.env.CUSTOM_AI_MODEL ?? ""
          : provider === "anthropic" ? "claude-3-5-sonnet-20241022" : "gpt-4o-mini";
  if (provider === "custom" && model.trim() === "") {
    throw aiError("AI_PROVIDER_NOT_CONFIGURED", "Set CUSTOM_AI_MODEL to the model name provided by your API service.");
  }
  const metadata = { requestId, task, provider, model };
  aiLog("provider_selected", metadata);
  if (provider === "gemini") {
    const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? "";
    const response = await providerFetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: user }] }],
          generationConfig: {
            maxOutputTokens: 4096,
            ...(json_schema === undefined ? {} : {
              responseMimeType: "application/json",
              ...(json_schema.schema === undefined ? {} : { responseSchema: json_schema.schema }),
            }),
          },
        }),
      },
      metadata,
    );
    const body = await providerJson(response);
    aiLog("provider_response_received", {
      ...metadata,
      candidateCount: body.candidates?.length ?? 0,
      finishReasons: (body.candidates ?? []).map((candidate) => candidate.finishReason ?? "unspecified"),
    });
    const text = (body.candidates?.[0]?.content?.parts ?? [])
      .map((part) => part.text ?? "")
      .join("");
    if (text.length === 0) {
      aiLog("empty_model_output", { task, provider, model });
      throw aiError("AI_INVALID_RESPONSE", "Gemini returned an empty response.");
    }
    return coerceJson(text, json_schema, metadata);
  }
  if (provider === "deepseek") {
    const apiKey = process.env.DEEPSEEK_API_KEY ?? "";
    const response = await providerFetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: 8192,
        thinking: { type: "disabled" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        ...(json_schema === undefined ? {} : { response_format: { type: "json_object" } }),
      }),
    }, metadata);
    const body = await providerJson(response);
    const choice = body.choices?.[0];
    const text = typeof choice?.message?.content === "string" ? choice.message.content : "";
    const finishReason = choice?.finish_reason ?? "unspecified";
    aiLog("provider_response_received", {
      ...metadata,
      candidateCount: body.choices?.length ?? 0,
      finishReasons: (body.choices ?? []).map((item) => item.finish_reason ?? "unspecified"),
      contentCharacters: text.length,
      completionTokens: body.usage?.completion_tokens ?? null,
    });
    if (text.length === 0) {
      aiLog("empty_model_output", { ...metadata, finishReason }, "warn");
      const message = finishReason === "length"
        ? "DeepSeek used the response token limit before returning an answer. Retry the request."
        : `DeepSeek returned a response without usable answer text (finish reason: ${finishReason}). Retry the request.`;
      throw aiError("AI_INVALID_RESPONSE", message);
    }
    return coerceJson(text, json_schema, metadata);
  }
  if (provider === "openrouter") {
    const apiKey = process.env.OPENROUTER_API_KEY ?? "";
    const response = await providerFetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
        "x-openrouter-title": "AultAI",
      },
      body: JSON.stringify({
        model,
        max_tokens: 8192,
        reasoning: { effort: "low", exclude: true },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        ...(json_schema === undefined ? {} : { response_format: { type: "json_object" } }),
      }),
    }, metadata);
    const body = await providerJson(response);
    const content = body.choices?.[0]?.message?.content;
    const text = typeof content === "string"
      ? content
      : Array.isArray(content)
        ? content.map((part) => part.type === "text" ? part.text ?? "" : "").join("")
        : "";
    const choice = body.choices?.[0];
    const finishReason = choice?.finish_reason ?? "unspecified";
    aiLog("provider_response_received", {
      ...metadata,
      candidateCount: body.choices?.length ?? 0,
      finishReasons: (body.choices ?? []).map((item) => item.finish_reason ?? "unspecified"),
      contentCharacters: text.length,
      reasoningPresent: typeof choice?.message?.reasoning === "string" &&
        choice.message.reasoning.length > 0,
      completionTokens: body.usage?.completion_tokens ?? null,
      reasoningTokens: body.usage?.completion_tokens_details?.reasoning_tokens ?? null,
    });
    if (text.length === 0) {
      aiLog("empty_model_output", { ...metadata, finishReason }, "warn");
      const message = finishReason === "length"
        ? "OpenRouter used the response token limit before returning an answer. Retry Analyze; the request now allows more output and lower reasoning."
        : `OpenRouter returned a response without usable answer text (finish reason: ${finishReason}). Retry Analyze.`;
      throw aiError("AI_INVALID_RESPONSE", message);
    }
    return coerceJson(text, json_schema, metadata);
  }
  if (provider === "custom") {
    const apiKey = process.env.CUSTOM_AI_API_KEY ?? "";
    const endpoint = customChatCompletionsUrl(process.env.CUSTOM_AI_BASE_URL ?? "");
    const response = await providerFetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: 8192,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        ...(json_schema === undefined ? {} : { response_format: { type: "json_object" } }),
      }),
    }, metadata);
    const body = await providerJson(response);
    const content = body.choices?.[0]?.message?.content;
    const text = typeof content === "string"
      ? content
      : Array.isArray(content)
        ? content.map((part) => part.type === "text" ? part.text ?? "" : "").join("")
        : "";
    if (text.length === 0) {
      aiLog("empty_model_output", {
        ...metadata,
        finishReason: body.choices?.[0]?.finish_reason ?? "unspecified",
      }, "warn");
      throw aiError("AI_INVALID_RESPONSE", "The custom AI provider returned no answer text.");
    }
    return coerceJson(text, json_schema, metadata);
  }
  const anthropicKey = process.env.ANTHROPIC_API_KEY ?? "";
  const openaiKey = process.env.OPENAI_API_KEY ?? "";
  if (provider === "anthropic") {
    const res = await providerFetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 2048,
        system,
        messages: [{ role: "user", content: user }],
      }),
    }, metadata);
    const body = await providerJson(res);
    const text = (body.content ?? [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");
    if (text.length === 0) {
      throw aiError("AI_INVALID_RESPONSE", "Anthropic returned an empty response.");
    }
    return coerceJson(text, json_schema, metadata);
  }
  if (provider === "openai") {
    const res = await providerFetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        ...(json_schema === undefined ? {} : { response_format: { type: "json_object" } }),
      }),
    }, metadata);
    const body = await providerJson(res);
    const text = body.choices?.[0]?.message?.content ?? "";
    if (text.length === 0) {
      throw aiError("AI_INVALID_RESPONSE", "The AI provider returned an empty response.");
    }
    return coerceJson(text, json_schema, metadata);
  }
  throw aiError("AI_PROVIDER_NOT_CONFIGURED", "No supported AI provider is configured.");
}

/**
 * Parse completion text as JSON when a schema is given; validate keys once,
 * and reject malformed output.
 * @param {string} text Raw completion text.
 * @param {object} [json_schema] Optional schema with a `required` key list.
 * @returns {string | object} Parsed object or the raw text.
 */
function coerceJson(text, json_schema, metadata) {
  if (json_schema === undefined || json_schema === null) {
    return text;
  }
  const required = json_schema.required ?? [];
  try {
    const parsed = JSON.parse(extractJson(text));
    if (typeof parsed === "object" && parsed !== null) {
      const missing = required.filter((key) => !(key in parsed));
      aiLog("response_shape_received", {
        ...metadata,
        responseFields: Object.keys(parsed).sort(),
        missingFields: missing,
      });
      if (missing.length === 0) {
        return parsed;
      }
      throw aiError("AI_INVALID_RESPONSE", `The AI response is missing required fields: ${missing.join(", ")}.`);
    }
  } catch (err) {
    if (err.code === "AI_INVALID_RESPONSE") {
      throw err;
    }
    aiLog("response_json_invalid", { ...metadata, responseCharacters: text.length }, "warn");
    throw aiError("AI_INVALID_RESPONSE", "The AI provider returned invalid JSON.");
  }
  throw aiError("AI_INVALID_RESPONSE", "The AI response must be a JSON object.");
}

const AI_TIMEOUT_MS = 30000;
const MAX_PROVIDER_ATTEMPTS = 3;
const RETRY_DELAY_MS = 500;
const MAX_RETRY_AFTER_MS = 5000;

function selectedProvider() {
  const configured = (process.env.AI_PROVIDER ?? "").toLowerCase();
  if (configured !== "") {
    if (!["gemini", "deepseek", "openrouter", "anthropic", "openai", "custom"].includes(configured)) {
      throw aiError("AI_PROVIDER_UNSUPPORTED", `Unsupported AI_PROVIDER value: ${configured}.`);
    }
    const key = configured === "gemini"
      ? process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY
      : configured === "deepseek"
        ? process.env.DEEPSEEK_API_KEY
        : configured === "openrouter"
        ? process.env.OPENROUTER_API_KEY
        : configured === "custom"
          ? process.env.CUSTOM_AI_API_KEY
        : configured === "anthropic"
        ? process.env.ANTHROPIC_API_KEY
        : process.env.OPENAI_API_KEY;
    if ((key ?? "") === "") {
      throw aiError("AI_PROVIDER_NOT_CONFIGURED", `AI_PROVIDER is set to ${configured}, but its API key is missing.`);
    }
    if (configured === "custom" && (process.env.CUSTOM_AI_BASE_URL ?? "").trim() === "") {
      throw aiError("AI_PROVIDER_NOT_CONFIGURED", "Set CUSTOM_AI_BASE_URL to your API service's HTTPS base URL.");
    }
    return configured;
  }
  if ((process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? "") !== "") return "gemini";
  if ((process.env.DEEPSEEK_API_KEY ?? "") !== "") return "deepseek";
  if ((process.env.OPENROUTER_API_KEY ?? "") !== "") return "openrouter";
  if ((process.env.ANTHROPIC_API_KEY ?? "") !== "") return "anthropic";
  if ((process.env.OPENAI_API_KEY ?? "") !== "") return "openai";
  return null;
}

async function providerFetch(url, options, metadata) {
  for (let attempt = 1; attempt <= MAX_PROVIDER_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
    try {
      aiLog("provider_attempt_started", { ...metadata, attempt, maxAttempts: MAX_PROVIDER_ATTEMPTS });
      const response = await fetch(url, { ...options, signal: controller.signal });
      if (response.ok) {
        aiLog("provider_attempt_succeeded", { ...metadata, attempt, status: response.status });
        return response;
      }
      let details = "";
      try {
        const body = await response.json();
        details = `${body.error?.status ?? ""} ${body.error?.message ?? ""}`;
      } catch {
        details = "";
      }
      const quotaFailure = response.status === 429 || /quota|resource[_ -]?exhausted|rate.?limit/i.test(details);
      aiLog("provider_attempt_failed", {
        ...metadata,
        attempt,
        status: response.status,
        quotaFailure,
      }, "warn");
      if (
        !quotaFailure &&
        [500, 502, 503, 504].includes(response.status) &&
        attempt < MAX_PROVIDER_ATTEMPTS
      ) {
        const waitMs = retryDelay(response.headers.get("retry-after"), attempt);
        aiLog("provider_retry_scheduled", { ...metadata, nextAttempt: attempt + 1, waitMs });
        await delay(waitMs);
        continue;
      }

      const code = quotaFailure ? "AI_QUOTA_EXHAUSTED"
        : response.status === 402 ? "AI_PAYMENT_REQUIRED"
        : response.status === 401 || response.status === 403 ? "AI_AUTH_FAILED"
          : "AI_PROVIDER_UNAVAILABLE";
      const message = code === "AI_QUOTA_EXHAUSTED"
        ? "The AI provider rate limit or free quota has been reached. Try again later or check your provider quota."
        : code === "AI_PAYMENT_REQUIRED"
          ? "The AI provider requires available account balance or billing to process this request. Check your DeepSeek account balance and billing settings."
        : code === "AI_AUTH_FAILED"
          ? "The AI provider rejected its API key. Check the backend environment configuration."
          : `The AI provider returned HTTP ${response.status} after ${attempt} attempt${attempt === 1 ? "" : "s"}. Try again later.`;
      throw aiError(code, message);
    } catch (err) {
      if (typeof err?.code === "string" && err.code.startsWith("AI_")) {
        throw err;
      }
      if (err?.name === "AbortError") {
        throw aiError("AI_TIMEOUT", `The AI provider did not respond within ${AI_TIMEOUT_MS / 1000} seconds.`);
      }
      throw aiError(
        "AI_PROVIDER_UNAVAILABLE",
        `Could not reach the AI provider: ${typeof err?.message === "string" ? err.message : String(err)}`,
      );
    } finally {
      clearTimeout(timer);
    }
  }
  throw aiError("AI_PROVIDER_UNAVAILABLE", "The AI provider could not complete the request.");
}

function customChatCompletionsUrl(baseUrl) {
  let parsed;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw aiError("AI_PROVIDER_NOT_CONFIGURED", "CUSTOM_AI_BASE_URL must be a valid HTTPS URL ending at the API base (for example, https://api.example.edu/v1).");
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.search !== "" ||
    parsed.hash !== ""
  ) {
    throw aiError("AI_PROVIDER_NOT_CONFIGURED", "CUSTOM_AI_BASE_URL must use HTTPS and must not contain credentials, query parameters, or a fragment.");
  }
  parsed.pathname = `${parsed.pathname.replace(/\/+$/, "")}/chat/completions`;
  return parsed.toString();
}

function retryDelay(retryAfter, attempt) {
  if (retryAfter !== null) {
    const seconds = Number(retryAfter);
    const requestedDelay = Number.isFinite(seconds)
      ? seconds * 1000
      : Date.parse(retryAfter) - Date.now();
    if (Number.isFinite(requestedDelay) && requestedDelay > 0) {
      return Math.min(requestedDelay, MAX_RETRY_AFTER_MS);
    }
  }
  return RETRY_DELAY_MS * (2 ** (attempt - 1));
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function aiLog(event, details, level = "info") {
  console[level](`[ai] ${JSON.stringify({ event, ...details })}`);
}

async function providerJson(response) {
  try {
    return await response.json();
  } catch {
    throw aiError("AI_INVALID_RESPONSE", "The AI provider returned an unreadable response.");
  }
}

function aiError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

/**
 * Extract the first {...} or [...] JSON block from surrounding prose.
 * @param {string} text Raw completion text.
 * @returns {string} The JSON substring, or the original text.
 */
function extractJson(text) {
  const start = text.search(/[[{]/);
  const endObj = text.lastIndexOf("}");
  const endArr = text.lastIndexOf("]");
  const end = Math.max(endObj, endArr);
  if (start === -1 || end === -1 || end <= start) {
    return text;
  }
  return text.slice(start, end + 1);
}

/**
 * Deterministic offline mock completion.
 * @param {object} args
 * @param {string} args.system System prompt (used for keyword routing).
 * @param {string} args.user User prompt.
 * @param {object} [args.json_schema] Ignored beyond signalling structured output.
 * @returns {string | object} Mock response.
 */
function mockComplete({ system, user, json_schema }) {
  void json_schema;
  if (/explain/i.test(system)) {
    return (
      "This node is part of the shop-api checkout flow. " +
      "It takes the current cart and an optional voucher plus a timestamp, then " +
      "combines the discountable subtotal with tax and shipping. " +
      `Context: ${user.slice(0, 160)}. ` +
      "Known demo bugs in this area are the unfloored fixed-voucher total and " +
      "the inverted expiry comparison, both reachable through calculateCheckoutTotal."
    );
  }
  return "Mock analysis complete: see deterministic heuristics for details.";
}
