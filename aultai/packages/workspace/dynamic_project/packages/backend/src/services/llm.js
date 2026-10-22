/**
 * Provider-agnostic LLM completion with a mock-mode fallback.
 * When neither ANTHROPIC_API_KEY nor OPENAI_API_KEY is set, mock responses
 * are returned so the demo works offline.
 */

/**
 * Check whether mock mode is active (no provider API key configured).
 * @returns {boolean} True when no API key is set.
 */
export function isMockMode() {
  return (
    (process.env.ANTHROPIC_API_KEY ?? "") === "" &&
    (process.env.OPENAI_API_KEY ?? "") === ""
  );
}

/**
 * Run an LLM completion. Returns a string, or a parsed object when
 * `json_schema` is provided. Never throws on JSON parse failure — falls
 * back to mock output instead.
 * @param {object} args
 * @param {string} args.system System prompt.
 * @param {string} args.user User prompt.
 * @param {object} [args.json_schema] Optional schema; when present the
 * result is parsed as JSON and its top-level keys validated.
 * @returns {Promise<string | object>} Completion text or parsed object.
 */
export async function complete({ system, user, json_schema }) {
  if (!isMockMode()) {
    try {
      const live = await callLive({ system, user, json_schema });
      if (live !== null) {
        return live;
      }
    } catch {
      // Fall through to mock mode on any provider error.
    }
  }
  return mockComplete({ system, user, json_schema });
}

/**
 * Call the real provider (Anthropic preferred, OpenAI fallback).
 * @param {object} args
 * @param {string} args.system System prompt.
 * @param {string} args.user User prompt.
 * @param {object} [args.json_schema] Optional schema for key validation.
 * @returns {Promise<string | object | null>} Completion or null on failure.
 */
async function callLive({ system, user, json_schema }) {
  const anthropicKey = process.env.ANTHROPIC_API_KEY ?? "";
  const openaiKey = process.env.OPENAI_API_KEY ?? "";
  if (anthropicKey !== "") {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5-5",
        max_tokens: 2048,
        system,
        messages: [{ role: "user", content: user }],
      }),
    });
    if (!res.ok) {
      return null;
    }
    const body = await res.json();
    const text = (body.content ?? [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");
    return coerceJson(text, json_schema);
  }
  if (openaiKey !== "") {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (!res.ok) {
      return null;
    }
    const body = await res.json();
    const text = body.choices?.[0]?.message?.content ?? "";
    return coerceJson(text, json_schema);
  }
  return null;
}

/**
 * Parse completion text as JSON when a schema is given; validate keys once,
 * retry once on failure, then signal the caller to use mock output.
 * @param {string} text Raw completion text.
 * @param {object} [json_schema] Optional schema with a `required` key list.
 * @returns {string | object} Parsed object or the raw text.
 */
function coerceJson(text, json_schema) {
  if (json_schema === undefined || json_schema === null) {
    return text;
  }
  const required = json_schema.required ?? [];
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const parsed = JSON.parse(extractJson(text));
      if (typeof parsed === "object" && parsed !== null) {
        const missing = required.filter((k) => !(k in parsed));
        if (missing.length === 0) {
          return parsed;
        }
      }
    } catch {
      // Retry once, then fall through to mock.
    }
  }
  return mockComplete({ system: "", user: text, json_schema });
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
