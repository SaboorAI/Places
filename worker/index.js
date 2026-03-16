const FALLBACK_MEMORY_STATE = new Map();
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const MAX_USERS = 1000;
const MAX_PLACES = 60000;
const ALLOWED_RELATIONSHIP_TYPES = new Set(["visit", "lived", "studied", "work"]);

export default {
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
  const textBlock =
    Array.isArray(data.content) && data.content.find((block) => block.type === "text");
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

function sanitizeStatePayload(value, space, options = {}) {
  const touchUpdatedAt = options.touchUpdatedAt !== false;
  const input = value && typeof value === "object" ? value : {};
  const users = dedupeUsers(
    (Array.isArray(input.users) ? input.users : [])
      .slice(0, MAX_USERS)
      .map(sanitizeUser)
      .filter(Boolean)
  );
  const places = dedupePlaces(
    (Array.isArray(input.places) ? input.places : [])
      .slice(0, MAX_PLACES)
      .map(sanitizePlace)
      .filter(Boolean)
  );

  return {
    version: 1,
    space,
    updatedAt: touchUpdatedAt
      ? new Date().toISOString()
      : sanitizeTimestamp(input.updatedAt) || new Date().toISOString(),
    users,
    places
  };
}

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

function sanitizePlace(value) {
  if (!value || typeof value !== "object") return null;

  const lat = Number(value.lat);
  const lng = Number(value.lng);
  const name = String(value.name || "").trim();
  if (!name || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  const relationshipType = sanitizeRelationshipType(value.relationshipType);
  const tags = Array.isArray(value.tags)
    ? [...new Set(value.tags.map((tag) => String(tag || "").trim()).filter(Boolean))].slice(0, 40)
    : [];

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

function sanitizeColor(value) {
  const color = String(value || "").trim();
  if (/^#(?:[0-9a-fA-F]{3}){1,2}$/.test(color)) return color;
  return "";
}

function sanitizeRelationshipType(value) {
  const type = String(value || "").trim().toLowerCase();
  if (ALLOWED_RELATIONSHIP_TYPES.has(type)) return type;
  return "visit";
}

function sanitizeDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return "";
  return raw;
}

function sanitizeTimestamp(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const date = new Date(raw);
  if (!Number.isFinite(date.getTime())) return "";
  return date.toISOString();
}

function dedupeUsers(users) {
  const out = [];
  const seen = new Set();
  for (const user of users) {
    if (!user) continue;
    if (seen.has(user.id)) continue;
    seen.add(user.id);
    out.push(user);
  }
  return out;
}

function dedupePlaces(places) {
  const out = [];
  const seen = new Set();

  for (const place of places) {
    if (!place) continue;
    const key = place.eventId
      ? `event:${place.userId}:${place.eventId}`
      : `${place.userId}:${normalizeCompare(place.fullName || place.name)}:${Number(place.lat).toFixed(
          3
        )}:${Number(place.lng).toFixed(3)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(place);
  }

  return out;
}

function sanitizeSpaceKey(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
  if (!/^[a-z0-9_-]{3,80}$/.test(normalized)) {
    return "";
  }
  return normalized;
}

function normalizeCompare(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function emptyState(space) {
  return {
    version: 1,
    space,
    updatedAt: "",
    users: [],
    places: []
  };
}

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

async function writeState(env, space, state) {
  const key = toStorageKey(space);
  const safeState = sanitizeStatePayload(state, space, { touchUpdatedAt: false });

  if (env.STATE_STORE && typeof env.STATE_STORE.put === "function") {
    await env.STATE_STORE.put(key, JSON.stringify(safeState));
    return;
  }

  FALLBACK_MEMORY_STATE.set(key, safeState);
}

function toStorageKey(space) {
  return `state:${sanitizeSpaceKey(space)}`;
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
