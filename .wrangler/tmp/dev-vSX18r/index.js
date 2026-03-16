var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker/index.js
var FALLBACK_MEMORY_STATE = /* @__PURE__ */ new Map();
var MAX_BODY_BYTES = 2 * 1024 * 1024;
var MAX_USERS = 1e3;
var MAX_PLACES = 6e4;
var ALLOWED_RELATIONSHIP_TYPES = /* @__PURE__ */ new Set(["visit", "lived", "studied", "work"]);
var worker_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/state") {
      return handleStateApi(request, env, url);
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
  const corsHeaders = {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "POST,OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400"
  };
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders
    });
  }
  if (request.method !== "POST") {
    return jsonResponse({ ok: false, error: "Use POST for /api/chat" }, 405, corsHeaders);
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ ok: false, error: "Body must be JSON" }, 400, corsHeaders);
  }
  const userMessage = String(body.message || "").trim();
  if (!userMessage) {
    return jsonResponse({ ok: false, error: "Missing 'message' field" }, 400, corsHeaders);
  }
  const apiKey = env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return jsonResponse(
      { ok: false, error: "Server missing ANTHROPIC_API_KEY secret" },
      500,
      corsHeaders
    );
  }
  const payload = {
    model: "claude-3-5-sonnet-20241022",
    max_tokens: 256,
    system: "You are a friendly travel guide. When the user asks about a country, give a concise overview of that country.",
    messages: [
      {
        role: "user",
        content: userMessage
      }
    ]
  };
  let claudeRes;
  try {
    claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify(payload)
    });
  } catch {
    return jsonResponse({ ok: false, error: "Network error calling Claude" }, 502, corsHeaders);
  }
  if (!claudeRes.ok) {
    const text = await claudeRes.text();
    return jsonResponse(
      {
        ok: false,
        error: "Claude API error",
        status: claudeRes.status,
        body: text
      },
      502,
      corsHeaders
    );
  }
  const data = await claudeRes.json();
  const textBlock = Array.isArray(data.content) && data.content.find((block) => block.type === "text");
  const reply = textBlock ? String(textBlock.text || "").trim() : "";
  return jsonResponse(
    {
      ok: true,
      reply
    },
    200,
    corsHeaders
  );
}
__name(handleChatApi, "handleChatApi");
async function handleStateApi(request, env, url) {
  const corsHeaders = buildCorsHeaders(request);
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders
    });
  }
  if (request.method !== "GET" && request.method !== "PUT") {
    return jsonResponse(
      { ok: false, error: "Method not allowed. Use GET or PUT." },
      405,
      corsHeaders
    );
  }
  const space = sanitizeSpaceKey(url.searchParams.get("space"));
  if (!space) {
    return jsonResponse(
      { ok: false, error: "Missing or invalid ?space=. Use 3-80 chars [a-z0-9_-]." },
      400,
      corsHeaders
    );
  }
  if (request.method === "GET") {
    const stored = await readState(env, space);
    return jsonResponse(
      {
        ok: true,
        state: stored || emptyState(space)
      },
      200,
      corsHeaders
    );
  }
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return jsonResponse(
      { ok: false, error: `Payload too large. Max ${MAX_BODY_BYTES} bytes.` },
      413,
      corsHeaders
    );
  }
  let rawBody = "";
  try {
    rawBody = await request.text();
  } catch {
    return jsonResponse({ ok: false, error: "Unable to read request body." }, 400, corsHeaders);
  }
  if (rawBody.length > MAX_BODY_BYTES * 2) {
    return jsonResponse(
      { ok: false, error: `Payload too large. Max ${MAX_BODY_BYTES} bytes.` },
      413,
      corsHeaders
    );
  }
  let parsed = null;
  try {
    parsed = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return jsonResponse({ ok: false, error: "Body must be valid JSON." }, 400, corsHeaders);
  }
  const normalizedState = sanitizeStatePayload(parsed, space);
  await writeState(env, space, normalizedState);
  return jsonResponse(
    {
      ok: true,
      state: normalizedState
    },
    200,
    corsHeaders
  );
}
__name(handleStateApi, "handleStateApi");
function sanitizeStatePayload(value, space, options = {}) {
  const touchUpdatedAt = options.touchUpdatedAt !== false;
  const input = value && typeof value === "object" ? value : {};
  const users = dedupeUsers(
    (Array.isArray(input.users) ? input.users : []).slice(0, MAX_USERS).map(sanitizeUser).filter(Boolean)
  );
  const places = dedupePlaces(
    (Array.isArray(input.places) ? input.places : []).slice(0, MAX_PLACES).map(sanitizePlace).filter(Boolean)
  );
  return {
    version: 1,
    space,
    updatedAt: touchUpdatedAt ? (/* @__PURE__ */ new Date()).toISOString() : sanitizeTimestamp(input.updatedAt) || (/* @__PURE__ */ new Date()).toISOString(),
    users,
    places
  };
}
__name(sanitizeStatePayload, "sanitizeStatePayload");
function sanitizeUser(value) {
  if (!value || typeof value !== "object") return null;
  const id = sanitizeSpaceKey(value.id);
  const name = String(value.name || "").trim();
  if (!id || !name) return null;
  return {
    id,
    name,
    color: sanitizeColor(value.color),
    createdAt: sanitizeTimestamp(value.createdAt) || ""
  };
}
__name(sanitizeUser, "sanitizeUser");
function sanitizePlace(value) {
  if (!value || typeof value !== "object") return null;
  const lat = Number(value.lat);
  const lng = Number(value.lng);
  const name = String(value.name || "").trim();
  if (!name || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }
  const relationshipType = sanitizeRelationshipType(value.relationshipType);
  const tags = Array.isArray(value.tags) ? [...new Set(value.tags.map((tag) => String(tag || "").trim()).filter(Boolean))].slice(0, 40) : [];
  return {
    id: String(value.id || "").trim() || crypto.randomUUID(),
    eventId: String(value.eventId || "").trim(),
    userId: sanitizeSpaceKey(value.userId) || "user_local",
    cityId: String(value.cityId || "").trim(),
    tripId: value.tripId ? String(value.tripId).trim() : null,
    relationshipType,
    startDate: sanitizeDate(value.startDate),
    endDate: sanitizeDate(value.endDate),
    tags,
    name,
    fullName: String(value.fullName || name).trim(),
    lat,
    lng,
    country: String(value.country || "").trim(),
    countryCode: String(value.countryCode || "").trim().toUpperCase(),
    continent: String(value.continent || "").trim(),
    notes: String(value.notes || "").trim(),
    source: String(value.source || "").trim(),
    query: String(value.query || "").trim()
  };
}
__name(sanitizePlace, "sanitizePlace");
function sanitizeColor(value) {
  const color = String(value || "").trim();
  if (/^#(?:[0-9a-fA-F]{3}){1,2}$/.test(color)) return color;
  return "";
}
__name(sanitizeColor, "sanitizeColor");
function sanitizeRelationshipType(value) {
  const type = String(value || "").trim().toLowerCase();
  if (ALLOWED_RELATIONSHIP_TYPES.has(type)) return type;
  return "visit";
}
__name(sanitizeRelationshipType, "sanitizeRelationshipType");
function sanitizeDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return "";
  return raw;
}
__name(sanitizeDate, "sanitizeDate");
function sanitizeTimestamp(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const date = new Date(raw);
  if (!Number.isFinite(date.getTime())) return "";
  return date.toISOString();
}
__name(sanitizeTimestamp, "sanitizeTimestamp");
function dedupeUsers(users) {
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  for (const user of users) {
    if (!user) continue;
    if (seen.has(user.id)) continue;
    seen.add(user.id);
    out.push(user);
  }
  return out;
}
__name(dedupeUsers, "dedupeUsers");
function dedupePlaces(places) {
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  for (const place of places) {
    if (!place) continue;
    const key = place.eventId ? `event:${place.userId}:${place.eventId}` : `${place.userId}:${normalizeCompare(place.fullName || place.name)}:${Number(place.lat).toFixed(
      3
    )}:${Number(place.lng).toFixed(3)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(place);
  }
  return out;
}
__name(dedupePlaces, "dedupePlaces");
function sanitizeSpaceKey(value) {
  const normalized = String(value || "").trim().toLowerCase().replace(/\s+/g, "-");
  if (!/^[a-z0-9_-]{3,80}$/.test(normalized)) {
    return "";
  }
  return normalized;
}
__name(sanitizeSpaceKey, "sanitizeSpaceKey");
function normalizeCompare(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}
__name(normalizeCompare, "normalizeCompare");
function emptyState(space) {
  return {
    version: 1,
    space,
    updatedAt: "",
    users: [],
    places: []
  };
}
__name(emptyState, "emptyState");
async function readState(env, space) {
  const key = toStorageKey(space);
  if (env.STATE_STORE && typeof env.STATE_STORE.get === "function") {
    const raw = await env.STATE_STORE.get(key);
    if (!raw) return null;
    try {
      return sanitizeStatePayload(JSON.parse(raw), space, { touchUpdatedAt: false });
    } catch {
      return null;
    }
  }
  return FALLBACK_MEMORY_STATE.get(key) || null;
}
__name(readState, "readState");
async function writeState(env, space, state) {
  const key = toStorageKey(space);
  const safeState = sanitizeStatePayload(state, space, { touchUpdatedAt: false });
  if (env.STATE_STORE && typeof env.STATE_STORE.put === "function") {
    await env.STATE_STORE.put(key, JSON.stringify(safeState));
    return;
  }
  FALLBACK_MEMORY_STATE.set(key, safeState);
}
__name(writeState, "writeState");
function toStorageKey(space) {
  return `state:${sanitizeSpaceKey(space)}`;
}
__name(toStorageKey, "toStorageKey");
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
__name(jsonResponse, "jsonResponse");
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
__name(buildCorsHeaders, "buildCorsHeaders");

// ../../node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// ../../node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-D1hG52/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = worker_default;

// ../../node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-D1hG52/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=index.js.map
