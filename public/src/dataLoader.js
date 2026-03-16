(function attachTravelDataModel(globalScope) {
  "use strict";

  const DATA_FILES = {
    cities: "cities.json",
    users: "users.json",
    trips: "trips.json",
    locationEvents: "locationEvents.json"
  };

  const ALLOWED_EVENT_TYPES = new Set(["visit", "lived", "studied", "work"]);

  async function loadModel(options = {}) {
    const basePath = String(options.basePath || "/data").replace(/\/+$/, "");

    const [citiesPayload, usersPayload, tripsPayload, eventsPayload] = await Promise.all([
      fetchJson(`${basePath}/${DATA_FILES.cities}`),
      fetchJson(`${basePath}/${DATA_FILES.users}`),
      fetchJson(`${basePath}/${DATA_FILES.trips}`),
      fetchJson(`${basePath}/${DATA_FILES.locationEvents}`)
    ]);

    return {
      cities: sanitizeCities(extractList(citiesPayload, "cities")),
      users: sanitizeUsers(extractList(usersPayload, "users")),
      trips: sanitizeTrips(extractList(tripsPayload, "trips")),
      locationEvents: sanitizeLocationEvents(extractList(eventsPayload, "locationEvents")),
      loadedAt: new Date().toISOString()
    };
  }

  function extractList(payload, key) {
    if (Array.isArray(payload)) return payload;
    if (payload && typeof payload === "object" && Array.isArray(payload[key])) {
      return payload[key];
    }
    return [];
  }

  async function fetchJson(path) {
    const response = await fetch(path, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Unable to load ${path} (${response.status})`);
    }
    return response.json();
  }

  function sanitizeCities(rows) {
    const out = [];
    for (const row of rows) {
      if (!row || typeof row !== "object") continue;
      const lat = Number(row.lat);
      const lon = Number(row.lon);
      const id = String(row.id || "").trim();
      const name = String(row.name || "").trim();
      if (!id || !name || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;

      out.push({
        id,
        name,
        country: String(row.country || "").trim(),
        countryCode: String(row.countryCode || "").trim().toUpperCase(),
        continent: String(row.continent || "").trim(),
        lat,
        lon
      });
    }
    return out;
  }

  function sanitizeUsers(rows) {
    const out = [];
    for (const row of rows) {
      if (!row || typeof row !== "object") continue;
      const id = String(row.id || "").trim();
      const name = String(row.name || "").trim();
      if (!id || !name) continue;

      out.push({
        id,
        name,
        homeCityId: String(row.homeCityId || "").trim()
      });
    }
    return out;
  }

  function sanitizeTrips(rows) {
    const out = [];
    for (const row of rows) {
      if (!row || typeof row !== "object") continue;
      const id = String(row.id || "").trim();
      const userId = String(row.userId || "").trim();
      const name = String(row.name || "").trim();
      if (!id || !userId || !name) continue;

      out.push({
        id,
        userId,
        name,
        startDate: toIsoDate(row.startDate),
        endDate: toIsoDate(row.endDate)
      });
    }
    return out;
  }

  function sanitizeLocationEvents(rows) {
    const out = [];
    for (const row of rows) {
      if (!row || typeof row !== "object") continue;

      const id = String(row.id || "").trim();
      const userId = String(row.userId || "").trim();
      const cityId = String(row.cityId || "").trim();
      const type = String(row.type || "").trim().toLowerCase();

      if (!id || !userId || !cityId || !ALLOWED_EVENT_TYPES.has(type)) {
        continue;
      }

      out.push({
        id,
        userId,
        cityId,
        tripId: row.tripId ? String(row.tripId).trim() : null,
        type,
        startDate: toIsoDate(row.startDate),
        endDate: toIsoDate(row.endDate),
        tags: Array.isArray(row.tags) ? row.tags.map((tag) => String(tag).trim()).filter(Boolean) : [],
        notes: String(row.notes || "").trim()
      });
    }
    return out.sort(compareEventsChronologically);
  }

  function compareEventsChronologically(a, b) {
    const startA = String(a.startDate || "9999-12-31");
    const startB = String(b.startDate || "9999-12-31");
    if (startA !== startB) return startA.localeCompare(startB);

    const endA = String(a.endDate || startA || "9999-12-31");
    const endB = String(b.endDate || startB || "9999-12-31");
    if (endA !== endB) return endA.localeCompare(endB);

    return String(a.id).localeCompare(String(b.id));
  }

  function toIsoDate(value) {
    if (!value) return null;
    const raw = String(value).trim();
    if (!raw) return null;

    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
    if (!match) return null;
    return raw;
  }

  function buildIndexes(model) {
    const cityById = new Map((model.cities || []).map((city) => [city.id, city]));
    const userById = new Map((model.users || []).map((user) => [user.id, user]));
    const tripById = new Map((model.trips || []).map((trip) => [trip.id, trip]));
    return { cityById, userById, tripById };
  }

  function eventsForUser(model, userId) {
    const uid = String(userId || "").trim();
    if (!uid) return [];
    return (model.locationEvents || [])
      .filter((event) => event.userId === uid)
      .sort(compareEventsChronologically);
  }

  function buildUserPlaces(model, userId) {
    const indexes = buildIndexes(model);
    return eventsForUser(model, userId)
      .map((event) => eventToPlace(event, indexes))
      .filter(Boolean);
  }

  function eventToPlace(event, indexes) {
    const city = indexes.cityById.get(event.cityId);
    if (!city) return null;
    const trip = event.tripId ? indexes.tripById.get(event.tripId) : null;

    const fullName = [city.name, city.country].filter(Boolean).join(", ");
    const sourceParts = [
      `event:${event.type}`,
      event.startDate ? `start:${event.startDate}` : "",
      event.endDate ? `end:${event.endDate}` : "",
      trip ? `trip:${trip.name}` : ""
    ].filter(Boolean);

    return {
      id: `event-place-${event.id}`,
      eventId: event.id,
      userId: event.userId,
      cityId: event.cityId,
      tripId: event.tripId,
      relationshipType: event.type,
      startDate: event.startDate,
      endDate: event.endDate,
      tags: event.tags || [],
      name: city.name,
      fullName,
      lat: city.lat,
      lng: city.lon,
      country: city.country,
      countryCode: city.countryCode || "",
      continent: city.continent || "",
      notes: event.notes || "",
      source: sourceParts.join(" | "),
      query: city.name
    };
  }

  function buildEventConnections(model, userId) {
    const indexes = buildIndexes(model);
    const userEvents = eventsForUser(model, userId);
    const points = userEvents
      .map((event) => {
        const city = indexes.cityById.get(event.cityId);
        if (!city) return null;
        return {
          eventId: event.id,
          cityId: city.id,
          cityName: city.name,
          lat: city.lat,
          lng: city.lon,
          startDate: event.startDate,
          endDate: event.endDate
        };
      })
      .filter(Boolean);

    const out = [];
    for (let i = 1; i < points.length; i += 1) {
      const from = points[i - 1];
      const to = points[i];
      if (from.cityId === to.cityId) continue;
      out.push({
        id: `${from.eventId}__${to.eventId}`,
        from,
        to
      });
    }
    return out;
  }

  function computeAnalytics(model, userId) {
    const indexes = buildIndexes(model);
    const userEvents = eventsForUser(model, userId);
    if (userEvents.length === 0) {
      return {
        totalEvents: 0,
        totalCities: 0,
        totalCountries: 0,
        mostVisitedCity: null,
        longestStay: null
      };
    }

    const cityCounts = new Map();
    const cities = new Set();
    const countries = new Set();
    let longestStay = null;

    for (const event of userEvents) {
      const city = indexes.cityById.get(event.cityId);
      if (!city) continue;

      cities.add(city.id);
      if (city.country) countries.add(city.country);
      cityCounts.set(city.id, (cityCounts.get(city.id) || 0) + 1);

      const durationDays = eventDurationDays(event.startDate, event.endDate);
      if (!longestStay || durationDays > longestStay.durationDays) {
        longestStay = {
          eventId: event.id,
          cityId: city.id,
          cityName: city.name,
          type: event.type,
          startDate: event.startDate,
          endDate: event.endDate,
          durationDays
        };
      }
    }

    let mostVisitedCity = null;
    for (const [cityId, count] of cityCounts.entries()) {
      const city = indexes.cityById.get(cityId);
      if (!city) continue;
      if (!mostVisitedCity || count > mostVisitedCity.count) {
        mostVisitedCity = {
          cityId: city.id,
          cityName: city.name,
          count
        };
      }
    }

    return {
      totalEvents: userEvents.length,
      totalCities: cities.size,
      totalCountries: countries.size,
      mostVisitedCity,
      longestStay
    };
  }

  function eventDurationDays(startDate, endDate) {
    if (!startDate) return 0;
    const startMs = Date.parse(startDate);
    const endMs = Date.parse(endDate || startDate);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return 0;
    const diff = Math.max(0, endMs - startMs);
    return Math.round(diff / 86400000) + 1;
  }

  globalScope.TravelDataModel = {
    loadModel,
    buildIndexes,
    eventsForUser,
    buildUserPlaces,
    buildEventConnections,
    computeAnalytics,
    compareEventsChronologically
  };
})(window);
