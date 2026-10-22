import { routeCommunity } from './community.js';
import { routeAtlas } from "./atlas.js";
export { AtlasStore } from "./atlas.js";
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/community" || url.pathname.startsWith("/api/community/")) return routeCommunity(request, env);

    if (url.pathname === "/api/health") {
      return jsonResponse({ ok: true, travelGuide: Boolean(env.ANTHROPIC_API_KEY), cloudStorage: Boolean(env.ATLAS_STORE) }, 200);
    }

    if (url.pathname === "/api/atlas" || url.pathname === "/api/atlas/unlock") {
      return routeAtlas(request, env);
    }
    if (url.pathname === "/api/state") {
      return jsonResponse({ error: "Use the authenticated atlas API at /api/atlas." }, 410);
    }

    if (url.pathname === "/api/chat") {
      return handleChatApi(request, env);
    }

    if (env.ASSETS && typeof env.ASSETS.fetch === "function") {
      return env.ASSETS.fetch(request);
    }

    return new Response("Not Found", { status: 404 });
  }
};

async function handleChatApi(request, env) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return jsonResponse({ ok: false, error: "This endpoint only accepts same-origin requests." }, 403);
  }
  if (request.method !== "POST") {
    return jsonResponse({ ok: false, error: "Use POST for /api/chat" }, 405, { allow: "POST" });
  }
  // Bound streamed bodies too, rather than trusting Content-Length.
  const reader = request.body?.getReader();
  if (!reader) return jsonResponse({ ok: false, error: "Body must be JSON" }, 400);
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 16000) {
        await reader.cancel();
        return jsonResponse({ ok: false, error: "Message is too large." }, 413);
      }
      chunks.push(value);
    }
  } catch {
    return jsonResponse({ ok: false, error: "Unable to read message." }, 400);
  }
  let body;
  try {
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    body = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return jsonResponse({ ok: false, error: "Body must be JSON" }, 400);
  }
  if (!body || typeof body.message !== "string" || !body.message.trim()) {
    return jsonResponse({ ok: false, error: "Enter a country or travel question." }, 400);
  }
  const userMessage = body.message.trim();
  if (userMessage.length > 2000) {
    return jsonResponse({ ok: false, error: "Please keep your question under 2,000 characters." }, 413);
  }
  if (!env.ANTHROPIC_API_KEY) {
    return jsonResponse({ ok: false, code: "GUIDE_NOT_CONFIGURED", error: "The travel guide isn’t connected yet. Your atlas and place importing are still available." }, 503);
  }
  let response;
  try {
    response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: env.ANTHROPIC_MODEL || "claude-sonnet-4-6",
        max_tokens: 512,
        system: "You are a friendly travel guide. Give concise, practical country overviews and travel inspiration. Use plain text and short paragraphs. Do not claim live knowledge of prices, opening hours, visas, or safety conditions.",
        messages: [{ role: "user", content: userMessage }]
      }),
      signal: AbortSignal.timeout(25000)
    });
  } catch (error) {
    const timeout = error?.name === "TimeoutError" || error?.name === "AbortError";
    return jsonResponse({ ok: false, code: timeout ? "GUIDE_TIMEOUT" : "GUIDE_NETWORK_ERROR", error: timeout ? "The travel guide took too long to respond. Please try again." : "The travel guide couldn’t connect. Please try again later." }, timeout ? 504 : 502);
  }
  if (!response.ok) {
    // Never expose upstream bodies, credentials, or provider diagnostics to visitors.
    const errors = {
      401: ["GUIDE_AUTH_ERROR", "The travel guide connection needs attention. Please try again later."],
      403: ["GUIDE_AUTH_ERROR", "The travel guide connection needs attention. Please try again later."],
      404: ["GUIDE_MODEL_ERROR", "The travel guide needs a model update. Please try again later."],
      429: ["GUIDE_RATE_LIMIT", "The travel guide is busy. Please try again in a moment."]
    };
    const [code, error] = errors[response.status] || ["GUIDE_UPSTREAM_ERROR", "The travel guide is temporarily unavailable. Please try again later."];
    return jsonResponse({ ok: false, code, error }, response.status === 429 ? 429 : 502);
  }
  let data;
  try { data = await response.json(); }
  catch { return jsonResponse({ ok: false, error: "The travel guide returned an invalid response. Please try again." }, 502); }
  const reply = Array.isArray(data?.content)
    ? data.content.filter((block) => block.type === "text").map((block) => String(block.text || "")).join("\n\n").trim()
    : "";
  if (!reply) return jsonResponse({ ok: false, error: "The travel guide returned an empty response. Please try again." }, 502);
  return jsonResponse({ ok: true, reply }, 200);
}

function jsonResponse(payload, status, headers = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...headers
    }
  });
}

function buildCorsHeaders(request) {
  const origin = request.headers.get("origin");
  return {
    "access-control-allow-origin": origin || "*",
    "access-control-allow-methods": "GET,PUT,OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400",
    vary: "origin"
  };
}
