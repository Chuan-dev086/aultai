/**
 * Central provider adapter. Gemini is the preferred configured provider;
 * Anthropic/OpenAI remain supported for existing installations.
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
 * @param {string} args.system System prompt.
 * @param {string} args.user User prompt.
 * @param {object} [args.json_schema] Optional schema; when present the
 * result is parsed as JSON and its top-level keys validated.
 * @returns {Promise<string | object>} Completion text or parsed object.
 */
export async function complete({ system, user, json_schema }) {
  if (isMockMode()) {
    return mockComplete({ system, user, json_schema });
  }
  return callLive({ system, user, json_schema });
}

/**
 * Call the configured provider.
 * @param {object} args
 * @param {string} args.system System prompt.
 * @param {string} args.user User prompt.
 * @param {object} [args.json_schema] Optional schema for key validation.
 * @returns {Promise<string | object>} Completion.
 */
async function callLive({ system, user, json_schema }) {
  const provider = selectedProvider();
  if (provider === "gemini") {
    const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? "";
    const model = process.env.GEMINI_MODEL ?? "gemini-3.1-flash-lite";
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
            ...(json_schema === undefined ? {} : { responseMimeType: "application/json" }),
          },
        }),
      },
    );
    const body = await providerJson(response);
    const text = (body.candidates?.[0]?.content?.parts ?? [])
      .map((part) => part.text ?? "")
      .join("");
    if (text.length === 0) {
      throw aiError("AI_INVALID_RESPONSE", "Gemini returned an empty response.");
    }
    return coerceJson(text, json_schema);
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
    });
    const body = await providerJson(res);
    const text = (body.content ?? [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");
    if (text.length === 0) {
      throw aiError("AI_INVALID_RESPONSE", "Anthropic returned an empty response.");
    }
    return coerceJson(text, json_schema);
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
      }),
    });
    const body = await providerJson(res);
    const text = body.choices?.[0]?.message?.content ?? "";
    if (text.length === 0) {
      throw aiError("AI_INVALID_RESPONSE", "The AI provider returned an empty response.");
    }
    return coerceJson(text, json_schema);
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
function coerceJson(text, json_schema) {
  if (json_schema === undefined || json_schema === null) {
    return text;
  }
  const required = json_schema.required ?? [];
  try {
    const parsed = JSON.parse(extractJson(text));
    if (typeof parsed === "object" && parsed !== null) {
      const missing = required.filter((key) => !(key in parsed));
      if (missing.length === 0) {
        return parsed;
      }
      throw aiError("AI_INVALID_RESPONSE", `The AI response is missing required fields: ${missing.join(", ")}.`);
    }
  } catch (err) {
    if (err.code === "AI_INVALID_RESPONSE") {
      throw err;
    }
    throw aiError("AI_INVALID_RESPONSE", "The AI provider returned invalid JSON.");
  }
  throw aiError("AI_INVALID_RESPONSE", "The AI response must be a JSON object.");
}

const AI_TIMEOUT_MS = 30000;

function selectedProvider() {
  const configured = (process.env.AI_PROVIDER ?? "").toLowerCase();
  if (configured !== "") {
    if (!["gemini", "anthropic", "openai"].includes(configured)) {
      throw aiError("AI_PROVIDER_UNSUPPORTED", `Unsupported AI_PROVIDER value: ${configured}.`);
    }
    const key = configured === "gemini"
      ? process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY
      : configured === "anthropic"
        ? process.env.ANTHROPIC_API_KEY
        : process.env.OPENAI_API_KEY;
    if ((key ?? "") === "") {
      throw aiError("AI_PROVIDER_NOT_CONFIGURED", `AI_PROVIDER is set to ${configured}, but its API key is missing.`);
    }
    return configured;
  }
  if ((process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? "") !== "") return "gemini";
  if ((process.env.ANTHROPIC_API_KEY ?? "") !== "") return "anthropic";
  if ((process.env.OPENAI_API_KEY ?? "") !== "") return "openai";
  return null;
}

async function providerFetch(url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!response.ok) {
      let details = "";
      try {
        const body = await response.json();
        details = `${body.error?.status ?? ""} ${body.error?.message ?? ""}`;
      } catch {
        details = "";
      }
      const quotaFailure = response.status === 429 || /quota|resource[_ -]?exhausted|rate.?limit/i.test(details);
      const code = quotaFailure ? "AI_QUOTA_EXHAUSTED"
        : response.status === 401 || response.status === 403 ? "AI_AUTH_FAILED"
          : "AI_PROVIDER_UNAVAILABLE";
      const message = code === "AI_QUOTA_EXHAUSTED"
        ? "The AI provider rate limit or free quota has been reached. Try again later or check your provider quota."
        : code === "AI_AUTH_FAILED"
          ? "The AI provider rejected its API key. Check the backend environment configuration."
          : `The AI provider returned HTTP ${response.status}. Try again later.`;
      throw aiError(code, message);
    }
    return response;
  } catch (err) {
    if (err.code?.startsWith("AI_")) {
      throw err;
    }
    if (err.name === "AbortError") {
      throw aiError("AI_TIMEOUT", `The AI provider did not respond within ${AI_TIMEOUT_MS / 1000} seconds.`);
    }
    throw aiError("AI_PROVIDER_UNAVAILABLE", `Could not reach the AI provider: ${err.message}`);
  } finally {
    clearTimeout(timer);
  }
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
