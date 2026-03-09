const { useCallback, useEffect, useMemo, useRef, useState } = React;

const DEFAULT_USER_STORAGE_KEYS = {
  places: "visitedPlaces.user.places.v1",
  inputDraft: "visitedPlaces.user.inputDraft.v1",
  placeFilter: "visitedPlaces.user.placeFilter.v1",
  preferences: "visitedPlaces.user.preferences.v1"
};
const EXTERNAL_USER_STORAGE_KEYS =
  typeof USER_STORAGE_KEYS !== "undefined" &&
  USER_STORAGE_KEYS &&
  typeof USER_STORAGE_KEYS === "object"
    ? USER_STORAGE_KEYS
    : {};
const USER_STORAGE = {
  places: String(EXTERNAL_USER_STORAGE_KEYS.places || DEFAULT_USER_STORAGE_KEYS.places),
  inputDraft: String(EXTERNAL_USER_STORAGE_KEYS.inputDraft || DEFAULT_USER_STORAGE_KEYS.inputDraft),
  placeFilter: String(EXTERNAL_USER_STORAGE_KEYS.placeFilter || DEFAULT_USER_STORAGE_KEYS.placeFilter),
  preferences: String(EXTERNAL_USER_STORAGE_KEYS.preferences || DEFAULT_USER_STORAGE_KEYS.preferences)
};
const LEGACY_PLACE_STORAGE_KEYS =
  typeof LEGACY_PLACE_KEYS !== "undefined" && Array.isArray(LEGACY_PLACE_KEYS)
    ? LEGACY_PLACE_KEYS
    : ["visitedPlaces.v1", "visitedCities.v3", "visitedCities.v2", "visitedCities.v1"];
const USER_DEFAULTS_CONFIG =
  typeof USER_DEFAULTS !== "undefined" && USER_DEFAULTS && typeof USER_DEFAULTS === "object"
    ? USER_DEFAULTS
    : {
        initialPlaces: [],
        inputDraft: "",
        placeFilter: "",
        preferences: {
          groupMode: "country",
          mapStyle: "dark",
          pathMode: "none",
          mapShape: "orbital"
        }
      };
const EXTERNAL_APP_CONFIG =
  typeof APP_CONFIG !== "undefined" && APP_CONFIG && typeof APP_CONFIG === "object"
    ? APP_CONFIG
    : {};
const IMPORTER_CONFIG =
  EXTERNAL_APP_CONFIG.importer && typeof EXTERNAL_APP_CONFIG.importer === "object"
    ? EXTERNAL_APP_CONFIG.importer
    : {};
const PARSER_CONFIG =
  EXTERNAL_APP_CONFIG.parser && typeof EXTERNAL_APP_CONFIG.parser === "object"
    ? EXTERNAL_APP_CONFIG.parser
    : {};
const CONTINENT_CONFIG =
  EXTERNAL_APP_CONFIG.continents && typeof EXTERNAL_APP_CONFIG.continents === "object"
    ? EXTERNAL_APP_CONFIG.continents
    : {};
const DATA_MODEL_CONFIG =
  EXTERNAL_APP_CONFIG.dataModel && typeof EXTERNAL_APP_CONFIG.dataModel === "object"
    ? EXTERNAL_APP_CONFIG.dataModel
    : {};
const STATUS_DEFAULT =
  "Paste notes with cities/countries. The app will auto-pin confident matches and ask review for uncertain ones.";
const RELATIONSHIP_TYPES = ["visit", "lived", "studied", "work"];
const IMPORT_DELAY_MS = Number(IMPORTER_CONFIG.requestDelayMs) > 0 ? Number(IMPORTER_CONFIG.requestDelayMs) : 180;
const GEOCODER_MAX_RETRIES =
  Number(IMPORTER_CONFIG.geocoderMaxRetries) > 0 ? Number(IMPORTER_CONFIG.geocoderMaxRetries) : 3;
const RETRY_BASE_DELAY_MS =
  Number(IMPORTER_CONFIG.retryBaseDelayMs) > 0 ? Number(IMPORTER_CONFIG.retryBaseDelayMs) : 900;
const GEOCODER_CACHE_TTL_MS =
  Number(IMPORTER_CONFIG.cacheTtlMs) > 0 ? Number(IMPORTER_CONFIG.cacheTtlMs) : 1000 * 60 * 60 * 8;
const GEOCODER_CACHE_MAX_ENTRIES =
  Number(IMPORTER_CONFIG.cacheMaxEntries) > 0 ? Number(IMPORTER_CONFIG.cacheMaxEntries) : 500;
const AUTO_APPROVE_MIN_SCORE =
  Number(IMPORTER_CONFIG.autoApproveScore) > 0 ? Number(IMPORTER_CONFIG.autoApproveScore) : 0.8;
const AUTO_APPROVE_MIN_LEAD =
  Number(IMPORTER_CONFIG.autoApproveLead) > 0 ? Number(IMPORTER_CONFIG.autoApproveLead) : 0.12;
const NOMINATIM_MIN_INTERVAL_MS =
  Number(IMPORTER_CONFIG.nominatimMinIntervalMs) > 0
    ? Number(IMPORTER_CONFIG.nominatimMinIntervalMs)
    : 1100;
const ORBITAL_ZOOM_MIN = 0.32;
const ORBITAL_ZOOM_MAX = 4.2;
const ORBITAL_ZOOM_DEFAULT = (ORBITAL_ZOOM_MIN + ORBITAL_ZOOM_MAX) / 2;
const ORBITAL_DEFAULT_VIEW = { lat: 12, lng: 6, altitude: ORBITAL_ZOOM_DEFAULT };
const ORBITAL_FOCUS_ALTITUDE = 0.88;
const ORBITAL_ARC_DASH_ANIMATE_TIME = 2500;
const ORBITAL_ROTATE_SPEED_BASE = 0.3;
const ORBITAL_ROTATE_SPEED_SATELLITE = 0.42;
const ORBITAL_PIXEL_RATIO_CAP = 2;
const ORBITAL_PIXEL_RATIO_CAP_SATELLITE = 1.45;

const geocodeCache = new Map();
let nominatimNextAllowedAt = 0;
const DATA_MODEL_BOOTSTRAP_ENABLED = DATA_MODEL_CONFIG.enabled !== false;
const DATA_MODEL_BASE_PATH = String(DATA_MODEL_CONFIG.basePath || "data");
const DATA_MODEL_SEED_ON_EMPTY = DATA_MODEL_CONFIG.seedFromEventsOnEmpty !== false;
const DATA_MODEL_MERGE_WITH_LOCAL = DATA_MODEL_CONFIG.mergeWithLocal === true;
const DATA_MODEL_USER_ID = String(DATA_MODEL_CONFIG.eventUserId || "").trim();

const CONTINENT_HEADERS = new Set(
  Array.isArray(PARSER_CONFIG.continentHeaders) && PARSER_CONFIG.continentHeaders.length > 0
    ? PARSER_CONFIG.continentHeaders.map((item) => toHeader(item))
    : [
        "NORTH AMERICA",
        "SOUTH AMERICA",
        "EUROPE",
        "ASIA",
        "AFRICA",
        "OCEANIA",
        "AUSTRALIA",
        "ANTARCTICA"
      ]
);
const IGNORED_LINE_HEADERS = new Set(
  Array.isArray(PARSER_CONFIG.ignoredHeaders) && PARSER_CONFIG.ignoredHeaders.length > 0
    ? PARSER_CONFIG.ignoredHeaders.map((item) => toHeader(item))
    : ["PLACES IVE BEEN", "HOME"]
);
const NOISE_TOKENS = new Set(
  Array.isArray(PARSER_CONFIG.noiseTokens) && PARSER_CONFIG.noiseTokens.length > 0
    ? PARSER_CONFIG.noiseTokens.map((item) => normalizeCompare(item))
    : ["home", "others", "other"]
);

const DEFAULT_STATE_ABBREVIATIONS = {
  AL: "Alabama",
  AZ: "Arizona",
  CA: "California",
  CO: "Colorado",
  DC: "District of Columbia",
  DE: "Delaware",
  FL: "Florida",
  GA: "Georgia",
  HI: "Hawaii",
  IL: "Illinois",
  IN: "Indiana",
  KY: "Kentucky",
  LA: "Louisiana",
  MA: "Massachusetts",
  MD: "Maryland",
  MI: "Michigan",
  NC: "North Carolina",
  NJ: "New Jersey",
  NV: "Nevada",
  NY: "New York",
  OH: "Ohio",
  OR: "Oregon",
  PA: "Pennsylvania",
  TN: "Tennessee",
  TX: "Texas",
  VA: "Virginia",
  WA: "Washington",
  WI: "Wisconsin",
  WV: "West Virginia"
};
const STATE_ABBREVIATIONS = {
  ...DEFAULT_STATE_ABBREVIATIONS,
  ...(PARSER_CONFIG.stateAbbreviations && typeof PARSER_CONFIG.stateAbbreviations === "object"
    ? PARSER_CONFIG.stateAbbreviations
    : {})
};
const DEFAULT_PLACE_ALIASES = {};
const PLACE_ALIASES = normalizeAliasObject({
  ...DEFAULT_PLACE_ALIASES,
  ...(PARSER_CONFIG.customPlaceAliases && typeof PARSER_CONFIG.customPlaceAliases === "object"
    ? PARSER_CONFIG.customPlaceAliases
    : {})
});
const DEFAULT_COUNTRY_ALIASES = {
  USA: "United States",
  US: "United States",
  "UNITED STATES OF AMERICA": "United States",
  UK: "United Kingdom",
  UAE: "United Arab Emirates",
  KSA: "Saudi Arabia",
  "SAUDIA ARABIA": "Saudi Arabia"
};
const COUNTRY_ALIASES = normalizeAliasObject({
  ...DEFAULT_COUNTRY_ALIASES,
  ...(PARSER_CONFIG.customCountryAliases && typeof PARSER_CONFIG.customCountryAliases === "object"
    ? PARSER_CONFIG.customCountryAliases
    : {})
});
const COUNTRY_INDEX = buildCountryIndex(COUNTRY_ALIASES);

const MAP_STYLE_CONFIG = {
  dark: {
    label: "Dark",
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    options: {
      subdomains: "abcd",
      maxZoom: 20,
      attribution: "&copy; OpenStreetMap contributors &copy; CARTO"
    }
  },
  light: {
    label: "Light",
    url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    options: {
      subdomains: "abcd",
      maxZoom: 20,
      attribution: "&copy; OpenStreetMap contributors &copy; CARTO"
    }
  },
  standard: {
    label: "OSM",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    options: {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors"
    }
  },
  terrain: {
    label: "Terrain",
    url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    options: {
      maxZoom: 17,
      attribution: "&copy; OpenStreetMap contributors, SRTM | &copy; OpenTopoMap"
    }
  },
  satellite: {
    label: "Satellite",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    options: {
      maxZoom: 18,
      attribution:
        "Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community"
    }
  }
};

const GLOBE_STYLE_CONFIG = {
  dark: {
    globeImageUrl: "//unpkg.com/three-globe/example/img/earth-night.jpg",
    bumpImageUrl: "//unpkg.com/three-globe/example/img/earth-topology.png",
    backgroundImageUrl: "//unpkg.com/three-globe/example/img/night-sky.png",
    backgroundColor: "rgba(0, 0, 0, 0)",
    atmosphereColor: "#6bb7ff",
    atmosphereAltitude: 0.18,
    arcColor: "#7ad7ff",
    arcDashLength: 0.42,
    arcDashGap: 0.65,
    arcDashAnimateTime: 2600
  },
  light: {
    globeImageUrl: "//unpkg.com/three-globe/example/img/earth-blue-marble.jpg",
    bumpImageUrl: "//unpkg.com/three-globe/example/img/earth-topology.png",
    backgroundImageUrl: "",
    backgroundColor: "#dce7f5",
    atmosphereColor: "#8bc8ff",
    atmosphereAltitude: 0.16,
    arcColor: "#2f7ed9",
    arcDashLength: 0.54,
    arcDashGap: 0.52,
    arcDashAnimateTime: 2400
  },
  standard: {
    globeImageUrl: "//unpkg.com/three-globe/example/img/earth-blue-marble.jpg",
    bumpImageUrl: "//unpkg.com/three-globe/example/img/earth-topology.png",
    backgroundImageUrl: "",
    backgroundColor: "#cddbef",
    atmosphereColor: "#8fc5ff",
    atmosphereAltitude: 0.17,
    arcColor: "#2f7ed9",
    arcDashLength: 0.52,
    arcDashGap: 0.56,
    arcDashAnimateTime: 2400
  },
  terrain: {
    globeImageUrl: "//unpkg.com/three-globe/example/img/earth-topology.png",
    bumpImageUrl: "//unpkg.com/three-globe/example/img/earth-topology.png",
    backgroundImageUrl: "",
    backgroundColor: "#cfd8de",
    atmosphereColor: "#8bb7d8",
    atmosphereAltitude: 0.15,
    arcColor: "#1f6f8d",
    arcDashLength: 0.52,
    arcDashGap: 0.56,
    arcDashAnimateTime: 2300
  },
  satellite: {
    globeImageUrl: "//unpkg.com/three-globe/example/img/earth-blue-marble.jpg",
    bumpImageUrl: "//unpkg.com/three-globe/example/img/earth-topology.png",
    backgroundImageUrl: "//unpkg.com/three-globe/example/img/night-sky.png",
    backgroundColor: "rgba(0, 0, 0, 0)",
    atmosphereColor: "#73b7ff",
    atmosphereAltitude: 0.17,
    arcColor: "#ffb870",
    arcDashLength: 0.4,
    arcDashGap: 0.68,
    arcDashAnimateTime: 2700
  }
};

const COUNTRY_TO_CONTINENT = {
  england: "Europe",
  scotland: "Europe",
  wales: "Europe",
  "northern ireland": "Europe",
  ...(CONTINENT_CONFIG.countryNameOverrides &&
  typeof CONTINENT_CONFIG.countryNameOverrides === "object"
    ? CONTINENT_CONFIG.countryNameOverrides
    : {})
};
const COUNTRY_CODE_TO_CONTINENT = {
  AQ: "Antarctica",
  ...(CONTINENT_CONFIG.countryCodeOverrides &&
  typeof CONTINENT_CONFIG.countryCodeOverrides === "object"
    ? CONTINENT_CONFIG.countryCodeOverrides
    : {})
};

const CONTINENT_COLORS = {
  "North America": "#69d1ff",
  "South America": "#64e6a8",
  Europe: "#b98dff",
  Asia: "#ff9ecf",
  Africa: "#ffd166",
  Oceania: "#7de3ff",
  Antarctica: "#e2f0ff",
  "Other / Unknown": "#b7c4d3",
  ...(CONTINENT_CONFIG.colors && typeof CONTINENT_CONFIG.colors === "object"
    ? CONTINENT_CONFIG.colors
    : {})
};

function App() {
  const initialPreferences = useMemo(loadUserPreferences, []);
  const [places, setPlaces] = useState(loadPlaces);
  const [rawInput, setRawInput] = useState(loadInputDraft);
  const [placeFilter, setPlaceFilter] = useState(loadPlaceFilter);
  const [groupMode, setGroupMode] = useState(initialPreferences.groupMode);
  const [mapStyle, setMapStyle] = useState(initialPreferences.mapStyle);
  const [pathMode, setPathMode] = useState(initialPreferences.pathMode);
  const [mapShape, setMapShape] = useState(initialPreferences.mapShape);
  const [status, setStatus] = useState(STATUS_DEFAULT);
  const [isImporting, setIsImporting] = useState(false);
  const [reviewQueue, setReviewQueue] = useState([]);
  const [unmatchedQueue, setUnmatchedQueue] = useState([]);
  const [mapFocus, setMapFocus] = useState(null);
  const [selectedPlaceId, setSelectedPlaceId] = useState("");
  const [editingPlaceId, setEditingPlaceId] = useState("");
  const [editDraft, setEditDraft] = useState({
    name: "",
    notes: "",
    relationshipType: "visit",
    startDate: "",
    endDate: "",
    tagsText: ""
  });
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [dataModelSummary, setDataModelSummary] = useState("");
  const [eventAnalytics, setEventAnalytics] = useState(null);
  const placeListScrollTimerRef = useRef(0);
  const dataBootstrapStartedRef = useRef(false);

  const sortedPlaces = useMemo(
    () => [...places].sort((a, b) => a.name.localeCompare(b.name)),
    [places]
  );

  const searchablePlaceRows = useMemo(
    () =>
      sortedPlaces.map((place) => ({
        place,
        text: normalizeCompare(
          `${place.name} ${place.fullName} ${place.country || ""} ` +
            `${place.countryCode || ""} ${place.continent || ""} ` +
            `${place.relationshipType || ""} ${place.startDate || ""} ${place.endDate || ""} ` +
            `${Array.isArray(place.tags) ? place.tags.join(" ") : ""} ` +
            `${place.source} ${place.query} ${place.notes || ""}`
        )
      })),
    [sortedPlaces]
  );

  const placesById = useMemo(
    () => new Map(places.map((place) => [place.id, place])),
    [places]
  );

  useEffect(() => {
    saveInputDraft(rawInput);
  }, [rawInput]);

  useEffect(() => {
    savePlaceFilter(placeFilter);
  }, [placeFilter]);

  useEffect(() => {
    saveUserPreferences({ groupMode, mapStyle, pathMode, mapShape });
  }, [groupMode, mapStyle, pathMode, mapShape]);

  useEffect(() => {
    if (!DATA_MODEL_BOOTSTRAP_ENABLED) return;
    if (dataBootstrapStartedRef.current) return;
    dataBootstrapStartedRef.current = true;
    if (!window.TravelDataModel || typeof window.TravelDataModel.loadModel !== "function") {
      setDataModelSummary("Data model loader unavailable.");
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const model = await window.TravelDataModel.loadModel({ basePath: DATA_MODEL_BASE_PATH });
        if (cancelled) return;

        const resolvedUserId =
          DATA_MODEL_USER_ID || String(model.users?.[0]?.id || "").trim();

        if (!resolvedUserId) {
          setDataModelSummary("Data loaded (no user found in users.json).");
          return;
        }

        const user = model.users.find((entry) => entry.id === resolvedUserId) || null;
        const eventPlaces = window.TravelDataModel.buildUserPlaces(model, resolvedUserId);
        const analytics = window.TravelDataModel.computeAnalytics(model, resolvedUserId);

        setEventAnalytics(analytics);
        setDataModelSummary(
          `Data-driven mode: ${eventPlaces.length} event locations for ${user ? user.name : resolvedUserId}.`
        );

        if (eventPlaces.length === 0) return;

        commitPlaces((prev) => {
          const hasExisting = Array.isArray(prev) && prev.length > 0;

          if (DATA_MODEL_SEED_ON_EMPTY && hasExisting && !DATA_MODEL_MERGE_WITH_LOCAL) {
            return prev;
          }

          if (DATA_MODEL_MERGE_WITH_LOCAL) {
            return mergePlaces(prev, eventPlaces);
          }

          return mergePlaces([], eventPlaces);
        });
      } catch (error) {
        if (cancelled) return;
        const message =
          error && typeof error.message === "string" && error.message
            ? error.message
            : "Failed to load data model JSON files.";
        setDataModelSummary(`Data model load failed: ${message}`);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(
    () => () => {
      if (placeListScrollTimerRef.current) {
        clearTimeout(placeListScrollTimerRef.current);
      }
    },
    []
  );

  useEffect(() => {
    if (selectedPlaceId && !placesById.has(selectedPlaceId)) {
      setSelectedPlaceId("");
    }
    if (editingPlaceId && !placesById.has(editingPlaceId)) {
      cancelEditPlace();
    }
  }, [selectedPlaceId, editingPlaceId, placesById]);

  const filteredPlaces = useMemo(() => {
    const query = normalizeCompare(placeFilter);
    if (!query) return sortedPlaces;
    return searchablePlaceRows
      .filter((row) => row.text.includes(query))
      .map((row) => row.place);
  }, [sortedPlaces, searchablePlaceRows, placeFilter]);

  const groupedPlaces = useMemo(
    () => groupPlaces(filteredPlaces, groupMode),
    [filteredPlaces, groupMode]
  );

  function commitPlaces(updater) {
    setPlaces((prev) => {
      const next = updater(prev);
      savePlaces(next);
      return next;
    });
  }

  async function handleImport(event) {
    event.preventDefault();

    const mentions = parseMentions(rawInput);
    if (mentions.length === 0) {
      setStatus("No valid place candidates found in your input.");
      return;
    }

    setIsImporting(true);
    setStatus(`Parsed ${mentions.length} place candidates. Matching...`);

    const existingKeys = new Set(places.map(placeKey));
    const autoAdded = [];
    const queue = [];
    const unmatched = [];
    let duplicates = 0;
    let failed = 0;

    for (let i = 0; i < mentions.length; i += 1) {
      const mention = mentions[i];
      setStatus(`Matching ${i + 1}/${mentions.length}: ${mention.query}`);

      try {
        const scored = await geocodeMentionScored(mention);
        if (scored.length === 0) {
          unmatched.push({
            id: crypto.randomUUID(),
            mention,
            query: mention.query,
            selectedIndex: 0,
            isSearching: false,
            error: "No matches found yet.",
            options: []
          });
          failed += 1;
          continue;
        }

        const best = scored[0];
        const second = scored[1];
        const strongEnough = best.score >= AUTO_APPROVE_MIN_SCORE;
        const clearLead = !second || best.score - second.score >= AUTO_APPROVE_MIN_LEAD;

        if (strongEnough && clearLead) {
          const candidate = toPlace(best, mention);
          const key = placeKey(candidate);

          if (existingKeys.has(key)) {
            duplicates += 1;
          } else {
            existingKeys.add(key);
            autoAdded.push(candidate);
          }
        } else {
          queue.push({
            id: crypto.randomUUID(),
            mention,
            query: mention.query,
            selectedIndex: 0,
            isRefreshing: false,
            error: "",
            options: scored
          });
        }
      } catch {
        unmatched.push({
          id: crypto.randomUUID(),
          mention,
          query: mention.query,
          selectedIndex: 0,
          isSearching: false,
          error: "Lookup failed, you can retry manually.",
          options: []
        });
        failed += 1;
      }

      if (i < mentions.length - 1) {
        await sleep(IMPORT_DELAY_MS);
      }
    }

    if (autoAdded.length > 0) {
      commitPlaces((prev) => mergePlaces(prev, autoAdded));
    }

    if (queue.length > 0) {
      setReviewQueue((prev) => [...prev, ...queue]);
    }

    if (unmatched.length > 0) {
      setUnmatchedQueue((prev) => [...prev, ...unmatched]);
    }

    setRawInput("");
    setIsImporting(false);
    const summary = [
      `parsed ${mentions.length}`,
      `added ${autoAdded.length}`,
      `review ${queue.length}`,
      duplicates > 0 ? `duplicates ${duplicates}` : "",
      failed > 0 ? `unmatched ${failed}` : ""
    ]
      .filter(Boolean)
      .join(" | ");

    if (failed > 0 && autoAdded.length === 0 && queue.length === 0) {
      setStatus(`${summary} | geocoder rate-limited, use Unmatched -> Find Match`);
    } else {
      setStatus(summary);
    }
  }

  function removePlace(id) {
    if (selectedPlaceId === id) {
      setSelectedPlaceId("");
      setMapFocus(null);
    }
    if (editingPlaceId === id) {
      cancelEditPlace();
    }
    commitPlaces((prev) => prev.filter((p) => p.id !== id));
  }

  function focusPlace(place) {
    if (!place || !Number.isFinite(place.lat) || !Number.isFinite(place.lng)) return;
    setSelectedPlaceId(place.id);
    setMapFocus({
      id: crypto.randomUUID(),
      placeId: place.id,
      lat: place.lat,
      lng: place.lng
    });
  }

  function startEditPlace(place) {
    if (!place) return;
    setEditingPlaceId(place.id);
    setEditDraft({
      name: place.name || "",
      notes: place.notes || "",
      relationshipType: sanitizeRelationshipType(place.relationshipType || "visit"),
      startDate: sanitizeEditableDate(place.startDate || ""),
      endDate: sanitizeEditableDate(place.endDate || ""),
      tagsText: Array.isArray(place.tags) ? place.tags.join(", ") : ""
    });
  }

  function cancelEditPlace() {
    setEditingPlaceId("");
    setEditDraft({
      name: "",
      notes: "",
      relationshipType: "visit",
      startDate: "",
      endDate: "",
      tagsText: ""
    });
  }

  async function saveEditPlace(id) {
    const nextName = String(editDraft.name || "").trim();
    if (!nextName) {
      setStatus("Place name cannot be empty.");
      return;
    }

    const nextNotes = String(editDraft.notes || "").trim();
    const nextRelationshipType = sanitizeRelationshipType(editDraft.relationshipType || "visit");
    const normalizedDateRange = normalizeDateRange(
      sanitizeEditableDate(editDraft.startDate || ""),
      sanitizeEditableDate(editDraft.endDate || "")
    );
    const nextStartDate = normalizedDateRange.startDate;
    const nextEndDate = normalizedDateRange.endDate;
    const nextTags = parseTagsInput(editDraft.tagsText || "");
    const current = places.find((place) => place.id === id);
    if (!current) {
      cancelEditPlace();
      return;
    }

    const nameChanged = normalizeCompare(nextName) !== normalizeCompare(current.name);
    if (!nameChanged) {
      commitPlaces((prev) =>
        prev.map((place) =>
          place.id === id
            ? {
                ...place,
                name: nextName,
                notes: nextNotes,
                relationshipType: nextRelationshipType,
                startDate: nextStartDate,
                endDate: nextEndDate,
                tags: nextTags
              }
            : place
        )
      );
      cancelEditPlace();
      return;
    }

    setIsSavingEdit(true);
    setStatus(`Remapping ${nextName}...`);

    const mention = buildManualEditMention(nextName, current.fullName);

    try {
      const scored = await geocodeMentionScored(mention);
      if (scored.length === 0) {
        commitPlaces((prev) =>
          prev.map((place) =>
            place.id === id
              ? {
                  ...place,
                  name: nextName,
                  notes: nextNotes,
                  relationshipType: nextRelationshipType,
                  startDate: nextStartDate,
                  endDate: nextEndDate,
                  tags: nextTags,
                  query: nextName
                }
              : place
          )
        );
        setStatus(`Could not remap "${nextName}". Kept previous pin location.`);
        cancelEditPlace();
        return;
      }

      const best = scored[0];
      commitPlaces((prev) =>
        prev.map((place) =>
          place.id === id
            ? {
                ...place,
                name: nextName,
                notes: nextNotes,
                relationshipType: nextRelationshipType,
                startDate: nextStartDate,
                endDate: nextEndDate,
                tags: nextTags,
                fullName: best.fullName || place.fullName,
                lat: best.lat,
                lng: best.lng,
                country: best.country || inferCountryFromFullName(best.fullName || place.fullName),
                countryCode: String(best.countryCode || place.countryCode || "").toUpperCase(),
                continent:
                  best.continent ||
                  inferContinent(
                    best.country || place.country,
                    best.countryCode || place.countryCode,
                    best.lat,
                    best.lng
                  ),
                query: nextName
              }
            : place
        )
      );

      setSelectedPlaceId(id);
      setMapFocus({
        id: crypto.randomUUID(),
        placeId: id,
        lat: best.lat,
        lng: best.lng
      });
      setStatus(`Updated and remapped ${nextName}.`);
      cancelEditPlace();
    } catch {
      commitPlaces((prev) =>
        prev.map((place) =>
          place.id === id
            ? {
                ...place,
                name: nextName,
                notes: nextNotes,
                relationshipType: nextRelationshipType,
                startDate: nextStartDate,
                endDate: nextEndDate,
                tags: nextTags,
                query: nextName
              }
            : place
        )
      );
      setStatus(`Could not remap "${nextName}" right now. Kept previous pin location.`);
      cancelEditPlace();
    } finally {
      setIsSavingEdit(false);
    }
  }

  function updateReviewQuery(id, query) {
    setReviewQueue((prev) =>
      prev.map((item) => (item.id === id ? { ...item, query, error: "" } : item))
    );
  }

  function updateReviewSelection(id, selectedIndex) {
    setReviewQueue((prev) =>
      prev.map((item) => (item.id === id ? { ...item, selectedIndex } : item))
    );
  }

  function previewSuggestion(option) {
    if (!option || !Number.isFinite(option.lat) || !Number.isFinite(option.lng)) return;
    setMapFocus({
      id: crypto.randomUUID(),
      lat: option.lat,
      lng: option.lng
    });
  }

  async function refreshReview(id) {
    const current = reviewQueue.find((item) => item.id === id);
    if (!current) return;

    setReviewQueue((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, isRefreshing: true, error: "" } : item
      )
    );

    try {
      const newMention = { ...current.mention, query: current.query };
      const scored = await geocodeMentionScored(newMention);

      if (scored.length === 0) {
        setReviewQueue((prev) =>
          prev.map((item) =>
            item.id === id
              ? {
                  ...item,
                  isRefreshing: false,
                  error: "No matches for this query.",
                  options: []
                }
              : item
          )
        );
        return;
      }

      setReviewQueue((prev) =>
        prev.map((item) =>
          item.id === id
            ? {
                ...item,
                mention: newMention,
                options: scored,
                selectedIndex: 0,
                isRefreshing: false,
                error: ""
              }
            : item
        )
      );
    } catch {
      setReviewQueue((prev) =>
        prev.map((item) =>
          item.id === id
            ? { ...item, isRefreshing: false, error: "Lookup failed. Try again." }
            : item
        )
      );
    }
  }

  function approveReviewItem(id) {
    const item = reviewQueue.find((entry) => entry.id === id);
    const selected = getSelectedOption(item);
    if (!selected) return;

    const candidate = toPlace(selected, item.mention);
    commitPlaces((prev) => mergePlaces(prev, [candidate]));
    setReviewQueue((prev) => prev.filter((entry) => entry.id !== id));
  }

  function approveAllReview() {
    const candidates = reviewQueue
      .map((item) => {
        const selected = getSelectedOption(item);
        return selected ? toPlace(selected, item.mention) : null;
      })
      .filter(Boolean);

    let added = 0;
    commitPlaces((prev) => {
      const merged = mergePlaces(prev, candidates);
      added = merged.length - prev.length;
      return merged;
    });
    setReviewQueue([]);
    setStatus(
      added > 0
        ? `Added ${added} reviewed place${added === 1 ? "" : "s"}.`
        : "No new places from review queue."
    );
  }

  function skipReviewItem(id) {
    setReviewQueue((prev) => prev.filter((entry) => entry.id !== id));
  }

  function updateUnmatchedQuery(id, query) {
    setUnmatchedQueue((prev) =>
      prev.map((item) => (item.id === id ? { ...item, query, error: "" } : item))
    );
  }

  function updateUnmatchedSelection(id, selectedIndex) {
    setUnmatchedQueue((prev) =>
      prev.map((item) => (item.id === id ? { ...item, selectedIndex } : item))
    );
  }

  async function searchUnmatched(id) {
    const current = unmatchedQueue.find((item) => item.id === id);
    if (!current) return;

    setUnmatchedQueue((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, isSearching: true, error: "" } : item
      )
    );

    try {
      const mention = { ...current.mention, query: current.query };
      const scored = await geocodeMentionScored(mention);

      if (scored.length === 0) {
        setUnmatchedQueue((prev) =>
          prev.map((item) =>
            item.id === id
              ? {
                  ...item,
                  isSearching: false,
                  options: [],
                  error: "Still no match. Try City, Country format."
                }
              : item
          )
        );
        return;
      }

      setUnmatchedQueue((prev) =>
        prev.map((item) =>
          item.id === id
            ? {
                ...item,
                mention,
                options: scored,
                selectedIndex: 0,
                isSearching: false,
                error: ""
              }
            : item
        )
      );
    } catch {
      setUnmatchedQueue((prev) =>
        prev.map((item) =>
          item.id === id
            ? {
                ...item,
                isSearching: false,
                error: "Lookup failed. Retry in a moment."
              }
            : item
        )
      );
    }
  }

  function addUnmatchedSelected(id) {
    const item = unmatchedQueue.find((entry) => entry.id === id);
    const selected = getSelectedOption(item);
    if (!selected) return;

    const candidate = toPlace(selected, item.mention);
    commitPlaces((prev) => mergePlaces(prev, [candidate]));
    setUnmatchedQueue((prev) => prev.filter((entry) => entry.id !== id));
  }

  function skipUnmatched(id) {
    setUnmatchedQueue((prev) => prev.filter((entry) => entry.id !== id));
  }

  const handleMapPlaceSelect = useCallback(
    (placeId) => {
      if (!placeId) {
        setSelectedPlaceId("");
        setMapFocus(null);
        return;
      }

      const match = placesById.get(placeId);
      if (!match) return;

      setSelectedPlaceId(placeId);
      setMapFocus({
        id: crypto.randomUUID(),
        placeId: placeId,
        lat: match.lat,
        lng: match.lng
      });

      if (placeListScrollTimerRef.current) {
        clearTimeout(placeListScrollTimerRef.current);
      }

      placeListScrollTimerRef.current = window.setTimeout(() => {
        const row = document.getElementById(placeListItemId(placeId));
        if (row) {
          row.scrollIntoView({
            behavior: "smooth",
            block: "nearest",
            inline: "nearest"
          });
        }
      }, 32);
    },
    [placesById]
  );

  return (
    <main className="app">
      <section className="panel">
        <h1>Visited Places</h1>
        <p className="subtitle">
          Paste mixed travel notes. The importer extracts places, applies country/state context, and
          geocodes dynamically.
        </p>
        {dataModelSummary && <p className="subtitle">{dataModelSummary}</p>}

        <section className="view-options">
          <div className="stats-row">
            <span className="stat-chip">Imported: {places.length}</span>
            <span className="stat-chip">Review: {reviewQueue.length}</span>
            <span className="stat-chip">Unmatched: {unmatchedQueue.length}</span>
            {eventAnalytics && (
              <>
                <span className="stat-chip">Events: {eventAnalytics.totalEvents}</span>
                <span className="stat-chip">Countries: {eventAnalytics.totalCountries}</span>
              </>
            )}
          </div>

          <div className="option-grid">
            <div className="option-group">
              <span className="option-label">Group List</span>
              <div className="segmented">
                <button
                  type="button"
                  className={groupMode === "country" ? "active" : ""}
                  onClick={() => setGroupMode("country")}
                >
                  Country
                </button>
                <button
                  type="button"
                  className={groupMode === "continent" ? "active" : ""}
                  onClick={() => setGroupMode("continent")}
                >
                  Continent
                </button>
              </div>
            </div>

            <div className="option-group">
              <span className="option-label">Map Theme</span>
              <div className="segmented">
                {Object.entries(MAP_STYLE_CONFIG).map(([id, style]) => (
                  <button
                    key={id}
                    type="button"
                    className={mapStyle === id ? "active" : ""}
                    onClick={() => setMapStyle(id)}
                  >
                    {style.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="option-group">
              <span className="option-label">Map Shape</span>
              <div className="segmented">
                <button
                  type="button"
                  className={mapShape === "orbital" ? "active" : ""}
                  onClick={() => setMapShape("orbital")}
                >
                  Orbital
                </button>
                <button
                  type="button"
                  className={mapShape === "panel" ? "active" : ""}
                  onClick={() => setMapShape("panel")}
                >
                  Panel
                </button>
              </div>
            </div>

            <div className="option-group">
              <span className="option-label">Connections</span>
              <div className="segmented">
                <button
                  type="button"
                  className={pathMode === "hub" ? "active" : ""}
                  onClick={() => setPathMode("hub")}
                >
                  Hub
                </button>
                <button
                  type="button"
                  className={pathMode === "chain" ? "active" : ""}
                  onClick={() => setPathMode("chain")}
                >
                  Chain
                </button>
                <button
                  type="button"
                  className={pathMode === "none" ? "active" : ""}
                  onClick={() => setPathMode("none")}
                >
                  Off
                </button>
              </div>
            </div>

          </div>
        </section>

        <form className="import-form" onSubmit={handleImport}>
          <textarea
            value={rawInput}
            onChange={(event) => setRawInput(event.target.value)}
            disabled={isImporting}
            placeholder={"Paste full notes here..."}
          />
          <button type="submit" disabled={isImporting}>
            {isImporting ? "Matching Places..." : "Import Places"}
          </button>
        </form>

        <p className="status" aria-live="polite">
          {status}
        </p>

        {reviewQueue.length > 0 && (
          <section className="review-panel">
            <div className="review-header">
              <h2>Needs Review ({reviewQueue.length})</h2>
              <button type="button" className="secondary" onClick={approveAllReview}>
                Add All Selected
              </button>
            </div>

            <ul className="review-list">
              {reviewQueue.map((item) => (
                <li key={item.id} className="review-item">
                  <div className="review-source" title={item.mention.source}>
                    Source: {item.mention.source}
                  </div>

                  <div className="review-row">
                    <input
                      value={item.query}
                      onChange={(event) => updateReviewQuery(item.id, event.target.value)}
                      disabled={item.isRefreshing}
                    />
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => refreshReview(item.id)}
                      disabled={item.isRefreshing}
                    >
                      {item.isRefreshing ? "Checking..." : "Re-check"}
                    </button>
                  </div>

                  <select
                    value={String(item.selectedIndex)}
                    onChange={(event) => updateReviewSelection(item.id, Number(event.target.value))}
                  >
                    {item.options.map((option, idx) => (
                      <option key={`${item.id}-${idx}`} value={String(idx)}>
                        {option.name} ({Math.round(option.score * 100)}%) - {option.fullName}
                      </option>
                    ))}
                  </select>

                  <div className="review-actions">
                    <button type="button" onClick={() => approveReviewItem(item.id)}>
                      Add Selected
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => previewSuggestion(getSelectedOption(item))}
                    >
                      Preview
                    </button>
                    <button type="button" className="secondary" onClick={() => skipReviewItem(item.id)}>
                      Skip
                    </button>
                  </div>

                  {item.error && <p className="review-error">{item.error}</p>}
                </li>
              ))}
            </ul>
          </section>
        )}

        {unmatchedQueue.length > 0 && (
          <section className="unmatched-panel">
            <div className="review-header">
              <h2>Unmatched ({unmatchedQueue.length})</h2>
            </div>

            <ul className="review-list">
              {unmatchedQueue.map((item) => (
                <li key={item.id} className="review-item">
                  <div className="review-source" title={item.mention.source}>
                    Source: {item.mention.source}
                  </div>

                  <div className="review-row">
                    <input
                      value={item.query}
                      onChange={(event) => updateUnmatchedQuery(item.id, event.target.value)}
                      disabled={item.isSearching}
                    />
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => searchUnmatched(item.id)}
                      disabled={item.isSearching}
                    >
                      {item.isSearching ? "Searching..." : "Find Match"}
                    </button>
                  </div>

                  {item.options.length > 0 && (
                    <>
                      <select
                        value={String(item.selectedIndex)}
                        onChange={(event) =>
                          updateUnmatchedSelection(item.id, Number(event.target.value))
                        }
                      >
                        {item.options.map((option, idx) => (
                          <option key={`${item.id}-unmatched-${idx}`} value={String(idx)}>
                            {option.name} ({Math.round(option.score * 100)}%) - {option.fullName}
                          </option>
                        ))}
                      </select>

                      <div className="review-actions">
                        <button type="button" onClick={() => addUnmatchedSelected(item.id)}>
                          Add Selected
                        </button>
                        <button
                          type="button"
                          className="secondary"
                          onClick={() => previewSuggestion(getSelectedOption(item))}
                        >
                          Preview
                        </button>
                        <button type="button" className="secondary" onClick={() => skipUnmatched(item.id)}>
                          Skip
                        </button>
                      </div>
                    </>
                  )}

                  {item.error && <p className="review-error">{item.error}</p>}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="places-panel">
          <div className="places-header">
            <h2>All Imported Places ({places.length})</h2>
          </div>
          <input
            className="places-filter"
            type="text"
            value={placeFilter}
            onChange={(event) => setPlaceFilter(event.target.value)}
            placeholder="Search city, country, source line..."
          />
          <p className="places-subtext">
            Showing {filteredPlaces.length} of {places.length}
          </p>
        </section>

        <div className="place-groups">
          {groupedPlaces.length === 0 && (
            <div className="empty-state">No places match your current filter.</div>
          )}

          {groupedPlaces.map((group) => (
            <section key={group.label} className="place-group">
              <div className="place-group-header">
                <h3>{group.label}</h3>
                <span className="place-group-count">{group.items.length}</span>
              </div>

              <ul className="place-list">
                {group.items.map((place) => (
                  <li
                    key={place.id}
                    id={placeListItemId(place.id)}
                    data-place-id={place.id}
                    className={`place-item${selectedPlaceId === place.id ? " is-selected" : ""}`}
                    onClick={() => {
                      if (editingPlaceId !== place.id) {
                        focusPlace(place);
                      }
                    }}
                    role={editingPlaceId === place.id ? undefined : "button"}
                    tabIndex={editingPlaceId === place.id ? -1 : 0}
                    onKeyDown={(event) => {
                      if (editingPlaceId === place.id) return;
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        focusPlace(place);
                      }
                    }}
                  >
                    {editingPlaceId === place.id ? (
                      <div
                        className="place-edit"
                        onClick={(event) => event.stopPropagation()}
                        onKeyDown={(event) => event.stopPropagation()}
                      >
                        <input
                          type="text"
                          value={editDraft.name}
                          onChange={(event) =>
                            setEditDraft((prev) => ({ ...prev, name: event.target.value }))
                          }
                          placeholder="Place label"
                          disabled={isSavingEdit}
                        />
                        <textarea
                          value={editDraft.notes}
                          onChange={(event) =>
                            setEditDraft((prev) => ({ ...prev, notes: event.target.value }))
                          }
                          placeholder="Notes (optional)"
                          rows={2}
                          disabled={isSavingEdit}
                        />
                        <div className="place-edit-meta-grid">
                          <select
                            value={editDraft.relationshipType}
                            onChange={(event) =>
                              setEditDraft((prev) => ({
                                ...prev,
                                relationshipType: event.target.value
                              }))
                            }
                            disabled={isSavingEdit}
                            aria-label="Relationship type"
                          >
                            {RELATIONSHIP_TYPES.map((type) => (
                              <option key={`edit-type-${type}`} value={type}>
                                {relationshipLabel(type)}
                              </option>
                            ))}
                          </select>
                          <input
                            type="date"
                            value={editDraft.startDate}
                            onChange={(event) =>
                              setEditDraft((prev) => ({ ...prev, startDate: event.target.value }))
                            }
                            disabled={isSavingEdit}
                            aria-label="Start date"
                          />
                          <input
                            type="date"
                            value={editDraft.endDate}
                            onChange={(event) =>
                              setEditDraft((prev) => ({ ...prev, endDate: event.target.value }))
                            }
                            disabled={isSavingEdit}
                            aria-label="End date"
                          />
                          <input
                            type="text"
                            value={editDraft.tagsText}
                            onChange={(event) =>
                              setEditDraft((prev) => ({ ...prev, tagsText: event.target.value }))
                            }
                            placeholder="Tags (comma separated)"
                            disabled={isSavingEdit}
                            aria-label="Tags"
                          />
                        </div>
                        <div className="place-edit-actions">
                          <button
                            type="button"
                            onClick={() => saveEditPlace(place.id)}
                            disabled={isSavingEdit}
                          >
                            {isSavingEdit ? "Saving..." : "Save"}
                          </button>
                          <button
                            type="button"
                            className="secondary"
                            onClick={cancelEditPlace}
                            disabled={isSavingEdit}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="place-content">
                          <span className="place-name" title={place.fullName}>
                            {place.name}
                          </span>
                          <span className="place-meta">{place.country || "Unknown country"}</span>
                          {place.relationshipType && (
                            <span className="place-meta">
                              {relationshipLabel(place.relationshipType)} |{" "}
                              {formatEventDateRange(place.startDate, place.endDate)}
                            </span>
                          )}
                          {place.notes && (
                            <span className="place-note" title={place.notes}>
                              {place.notes}
                            </span>
                          )}
                        </div>
                        <div className="place-actions">
                          <button
                            type="button"
                            className="secondary"
                            onClick={(event) => {
                              event.stopPropagation();
                              startEditPlace(place);
                            }}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              removePlace(place.id);
                            }}
                          >
                            Remove
                          </button>
                        </div>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </section>

      <section className={`map-wrap map-shape-${mapShape}`}>
        {mapShape === "orbital" ? (
          <GlobeMap
            places={places}
            focusTarget={mapFocus}
            mapStyle={mapStyle}
            pathMode={pathMode}
            selectedPlaceId={selectedPlaceId}
            onPlaceSelect={handleMapPlaceSelect}
          />
        ) : (
          <LeafletMap
            places={places}
            focusTarget={mapFocus}
            mapStyle={mapStyle}
            pathMode={pathMode}
            selectedPlaceId={selectedPlaceId}
            onPlaceSelect={handleMapPlaceSelect}
          />
        )}
      </section>
    </main>
  );
}

function LeafletMap({ places, focusTarget, mapStyle, pathMode, selectedPlaceId, onPlaceSelect }) {
  const hostRef = useRef(null);
  const mapRef = useRef(null);
  const markerLayerRef = useRef(null);
  const pathLayerRef = useRef(null);
  const markerByPlaceIdRef = useRef(new Map());
  const tileLayerRef = useRef(null);
  const [zoomLevel, setZoomLevel] = useState(2);

  useEffect(() => {
    if (!hostRef.current || mapRef.current || typeof L === "undefined") return;

    const map = L.map(hostRef.current, {
      worldCopyJump: true,
      minZoom: 2,
      maxZoom: 18,
      scrollWheelZoom: false,
      zoomControl: false,
      zoomSnap: 0.1,
      zoomDelta: 0.5
    });

    const initialLayer = createTileLayer(mapStyle);
    initialLayer.addTo(map);
    tileLayerRef.current = initialLayer;

    map.setView([20, 0], 2);
    setTimeout(() => map.invalidateSize(), 0);
    setZoomLevel(2);

    pathLayerRef.current = L.layerGroup().addTo(map);
    markerLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    const onZoomEnd = () => {
      setZoomLevel(Number(map.getZoom().toFixed(2)));
    };
    map.on("zoomend", onZoomEnd);

    const onResize = () => map.invalidateSize();
    window.addEventListener("resize", onResize);

    return () => {
      map.off("zoomend", onZoomEnd);
      window.removeEventListener("resize", onResize);
      map.remove();
      mapRef.current = null;
      pathLayerRef.current = null;
      markerLayerRef.current = null;
      tileLayerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current || typeof L === "undefined") return;

    if (tileLayerRef.current) {
      mapRef.current.removeLayer(tileLayerRef.current);
    }

    const nextLayer = createTileLayer(mapStyle);
    nextLayer.addTo(mapRef.current);
    tileLayerRef.current = nextLayer;
  }, [mapStyle]);

  useEffect(() => {
    if (!mapRef.current || !markerLayerRef.current || !pathLayerRef.current) return;

    const markerLayer = markerLayerRef.current;
    const pathLayer = pathLayerRef.current;
    markerLayer.clearLayers();
    pathLayer.clearLayers();
    markerByPlaceIdRef.current.clear();

    if (places.length === 0) {
      mapRef.current.setView([20, 0], 2);
      return;
    }

    const pointPlaces = getPointPlaces(places);

    const bounds = [];

    for (const place of pointPlaces) {
      const relationshipStyle = getRelationshipVisualStyle(place.relationshipType);
      const markerRadius = relationshipStyle.leafletRadius;
      const color = colorForPlace(place);
      const hoverDetails = buildHoverTooltip(place);
      const marker = L.circleMarker([place.lat, place.lng], {
        radius: markerRadius,
        color: "#0b1318",
        weight: 1.4,
        fillColor: color,
        fillOpacity: 0.95
      })
        .bindPopup(buildPlacePopup(place))
        .bindTooltip(hoverDetails, {
          direction: "top",
          offset: [0, -10],
          opacity: 0.94,
          className: "place-hover-tooltip place-hover-tooltip-details",
          sticky: true
        });

      marker.on("click", () => {
        if (typeof onPlaceSelect === "function") {
          onPlaceSelect(place.id);
        }
      });

      const halo = L.circleMarker([place.lat, place.lng], {
        radius: markerRadius + 4,
        color,
        weight: 1.2,
        opacity: 0.28,
        fillOpacity: 0,
        interactive: false,
        bubblingMouseEvents: false
      });
      halo.addTo(markerLayer);
      marker.addTo(markerLayer);

      markerByPlaceIdRef.current.set(place.id, marker);
      bounds.push([place.lat, place.lng]);
    }

    const connections = buildConnectionPairs(pointPlaces, pathMode);
    if (connections.length > 0) {
      const pathColor = mapStyle === "dark" ? "#73c6ff" : "#2f7ed9";
      const opacity = pathMode === "hub" ? 0.34 : 0.24;
      const weight = pathMode === "hub" ? 1.2 : 1.1;

      for (const { from, to } of connections) {
        const arc = buildArcPoints(from, to);
        L.polyline(arc, {
          color: pathColor,
          weight,
          opacity
        }).addTo(pathLayer);
      }
    }

    if (bounds.length === 1) {
      mapRef.current.setView(bounds[0], computeLeafletAutoZoom(pointPlaces));
    } else if (bounds.length > 1) {
      const targetZoom = computeLeafletAutoZoom(pointPlaces);
      mapRef.current.fitBounds(bounds, {
        padding: [32, 32],
        maxZoom: targetZoom
      });
    }
  }, [places, pathMode, mapStyle, onPlaceSelect]);

  useEffect(() => {
    if (!focusTarget || !mapRef.current) return;
    const marker =
      focusTarget.placeId && markerByPlaceIdRef.current
        ? markerByPlaceIdRef.current.get(focusTarget.placeId)
        : null;

    const latLng = marker
      ? marker.getLatLng()
      : hasFiniteCoordinates(focusTarget.lat, focusTarget.lng)
        ? [focusTarget.lat, focusTarget.lng]
        : null;

    if (!latLng) return;

    const nextZoom = clamp(mapRef.current.getZoom() + 1.4, 7.2, 11.6);
    mapRef.current.flyTo(latLng, nextZoom, {
      animate: true,
      duration: 0.9
    });

    if (marker) {
      setTimeout(() => {
        marker.openPopup();
      }, 420);
    }
  }, [focusTarget]);

  useEffect(() => {
    if (!selectedPlaceId || !mapRef.current) return;
    const marker = markerByPlaceIdRef.current.get(selectedPlaceId);
    if (!marker) return;

    setTimeout(() => {
      marker.openPopup();
    }, 110);
  }, [selectedPlaceId, places, mapStyle]);

  function handleZoomInputChange(event) {
    const nextZoom = Number(event.target.value);
    if (!Number.isFinite(nextZoom) || !mapRef.current) return;
    setZoomLevel(nextZoom);
    mapRef.current.setZoom(nextZoom);
  }

  return (
    <div
      className="leaflet-map map-surface"
      aria-label="Visited places map"
      onWheelCapture={forwardPageScrollFromWheel}
    >
      <div ref={hostRef} className="leaflet-host" />
      <div className="map-zoom-control">
        <label className="map-zoom-label" htmlFor="panel-zoom">
          Zoom
        </label>
        <input
          id="panel-zoom"
          className="map-zoom-slider"
          type="range"
          min="2"
          max="18"
          step="0.1"
          value={String(zoomLevel)}
          onChange={handleZoomInputChange}
          aria-label="Map zoom slider"
        />
      </div>
    </div>
  );
}

function GlobeMap({ places, focusTarget, mapStyle, pathMode, selectedPlaceId, onPlaceSelect }) {
  const hostRef = useRef(null);
  const globeRef = useRef(null);
  const onPlaceSelectRef = useRef(onPlaceSelect);
  const rendererRef = useRef(null);
  const mapStyleRef = useRef(mapStyle);
  const orbitalZoomRef = useRef(ORBITAL_DEFAULT_VIEW.altitude);
  const pendingOrbitalZoomRef = useRef(ORBITAL_DEFAULT_VIEW.altitude);
  const zoomSyncRafRef = useRef(0);
  const [orbitalZoom, setOrbitalZoom] = useState(ORBITAL_DEFAULT_VIEW.altitude);
  const pointPlaces = useMemo(
    () => getPointPlaces(places),
    [places]
  );
  const activePlace = useMemo(
    () =>
      places.find(
        (place) => place.id === selectedPlaceId && hasFiniteCoordinates(place.lat, place.lng)
      ) || null,
    [places, selectedPlaceId]
  );

  useEffect(() => {
    onPlaceSelectRef.current = onPlaceSelect;
  }, [onPlaceSelect]);

  useEffect(() => {
    mapStyleRef.current = mapStyle;
  }, [mapStyle]);

  function syncOrbitalZoom(nextZoom) {
    const clampedZoom = clamp(nextZoom, ORBITAL_ZOOM_MIN, ORBITAL_ZOOM_MAX);
    orbitalZoomRef.current = clampedZoom;
    pendingOrbitalZoomRef.current = clampedZoom;
    setOrbitalZoom(clampedZoom);
    return clampedZoom;
  }

  function scheduleOrbitalZoom(nextZoom) {
    const clampedZoom = clamp(nextZoom, ORBITAL_ZOOM_MIN, ORBITAL_ZOOM_MAX);
    pendingOrbitalZoomRef.current = clampedZoom;

    if (zoomSyncRafRef.current) {
      return;
    }

    zoomSyncRafRef.current = requestAnimationFrame(() => {
      zoomSyncRafRef.current = 0;
      const next = pendingOrbitalZoomRef.current;
      if (Math.abs(next - orbitalZoomRef.current) < 0.008) {
        return;
      }
      orbitalZoomRef.current = next;
      setOrbitalZoom(next);
    });
  }

  const closeActivePlace = useCallback(() => {
    if (typeof onPlaceSelectRef.current === "function") {
      onPlaceSelectRef.current("");
    }
    if (!globeRef.current) return;
    resumeGlobeSpin(globeRef.current);
  }, []);

  function handleOrbitalZoomChange(event) {
    const nextZoom = Number(event.target.value);
    if (!Number.isFinite(nextZoom)) return;
    const clampedZoom = syncOrbitalZoom(nextZoom);

    if (!globeRef.current) return;
    const currentView = globeRef.current.pointOfView();
    if (!currentView || !Number.isFinite(currentView.lat) || !Number.isFinite(currentView.lng)) return;
    globeRef.current.pointOfView(
      {
        lat: Number(currentView.lat),
        lng: Number(currentView.lng),
        altitude: clampedZoom
      },
      220
    );
  }

  useEffect(() => {
    if (!hostRef.current || globeRef.current || typeof Globe !== "function") return;

    const globe = Globe()(hostRef.current);
    globeRef.current = globe;

    globe
      .showAtmosphere(true)
      .pointLat("lat")
      .pointLng("lng")
      .pointColor("color")
      .pointAltitude("altitude")
      .pointRadius("radius")
      .pointResolution(28)
      .pointLabel("label")
      .onPointClick((point) => {
        if (!point || !point.placeId) return;
        pauseGlobeSpin(globe);
        if (Number.isFinite(point.lat) && Number.isFinite(point.lng)) {
          globe.pointOfView(
            {
              lat: Number(point.lat),
              lng: Number(point.lng),
              altitude: ORBITAL_FOCUS_ALTITUDE
            },
            900
          );
          syncOrbitalZoom(ORBITAL_FOCUS_ALTITUDE);
        }
        if (typeof onPlaceSelectRef.current === "function") {
          onPlaceSelectRef.current(point.placeId);
        }
      })
      .arcStartLat("startLat")
      .arcStartLng("startLng")
      .arcEndLat("endLat")
      .arcEndLng("endLng")
      .arcColor("color")
      .arcAltitude("altitude")
      .arcStroke("stroke")
      .arcDashLength("dashLength")
      .arcDashGap("dashGap")
      .arcDashAnimateTime("dashAnimateTime");

    if (supportsGlobeLabels(globe)) {
      globe
        .labelLat("lat")
        .labelLng("lng")
        .labelText("text")
        .labelColor("color")
        .labelSize("size")
        .labelDotRadius("dotRadius")
        .labelResolution(3);
    }

    const controls = globe.controls();
    controls.enablePan = false;
    controls.enableZoom = true;
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 70;
    controls.maxDistance = 600;
    controls.zoomSpeed = 0.95;
    controls.rotateSpeed = 0.7;
    controls.autoRotate = true;
    controls.autoRotateSpeed = orbitalAutoRotateSpeedForStyle(mapStyleRef.current);
    const renderer = typeof globe.renderer === "function" ? globe.renderer() : null;
    rendererRef.current = renderer;
    if (renderer && typeof renderer.setPixelRatio === "function") {
      renderer.setPixelRatio(orbitalPixelRatioForStyle(mapStyleRef.current));
    }
    const onControlsChange = () => {
      const view = globe.pointOfView();
      if (!view || !Number.isFinite(view.altitude)) return;
      scheduleOrbitalZoom(Number(view.altitude));
    };
    controls.addEventListener("change", onControlsChange);

    const resize = () => {
      if (!hostRef.current) return;
      const bounds = hostRef.current.getBoundingClientRect();
      if (bounds.width <= 0 || bounds.height <= 0) return;
      globe.width(bounds.width);
      globe.height(bounds.height);
      if (rendererRef.current && typeof rendererRef.current.setPixelRatio === "function") {
        rendererRef.current.setPixelRatio(orbitalPixelRatioForStyle(mapStyleRef.current));
      }
    };

    resize();
    const resizeObserver =
      typeof ResizeObserver === "function" ? new ResizeObserver(resize) : null;
    if (resizeObserver && hostRef.current) {
      resizeObserver.observe(hostRef.current);
    }
    window.addEventListener("resize", resize);

    globe.pointOfView(ORBITAL_DEFAULT_VIEW, 0);
    syncOrbitalZoom(ORBITAL_DEFAULT_VIEW.altitude);

    return () => {
      if (zoomSyncRafRef.current) {
        cancelAnimationFrame(zoomSyncRafRef.current);
        zoomSyncRafRef.current = 0;
      }
      window.removeEventListener("resize", resize);
      controls.removeEventListener("change", onControlsChange);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      if (globeRef.current && typeof globeRef.current._destructor === "function") {
        globeRef.current._destructor();
      }
      globeRef.current = null;
      rendererRef.current = null;
    };
  }, []);

  useEffect(() => {
    const globe = globeRef.current;
    if (!globe) return;

    const style = getGlobeStyle(mapStyle);
    globe.backgroundColor(style.backgroundColor);
    globe.globeImageUrl(style.globeImageUrl || null);
    globe.bumpImageUrl(style.bumpImageUrl || null);
    globe.backgroundImageUrl(style.backgroundImageUrl || null);
    globe.atmosphereColor(style.atmosphereColor);
    globe.atmosphereAltitude(style.atmosphereAltitude);

    const controls = typeof globe.controls === "function" ? globe.controls() : null;
    if (controls) {
      controls.autoRotateSpeed = orbitalAutoRotateSpeedForStyle(mapStyle);
    }

    if (rendererRef.current && typeof rendererRef.current.setPixelRatio === "function") {
      rendererRef.current.setPixelRatio(orbitalPixelRatioForStyle(mapStyle));
    }
  }, [mapStyle]);

  useEffect(() => {
    const globe = globeRef.current;
    if (!globe || !activePlace || !hasFiniteCoordinates(activePlace.lat, activePlace.lng)) return;

    const currentView = globe.pointOfView();
    const altitude = Number.isFinite(currentView?.altitude)
      ? clamp(Number(currentView.altitude), ORBITAL_FOCUS_ALTITUDE, ORBITAL_ZOOM_MAX)
      : ORBITAL_FOCUS_ALTITUDE;

    globe.pointOfView(
      {
        lat: Number(activePlace.lat),
        lng: Number(activePlace.lng),
        altitude
      },
      260
    );
  }, [mapStyle, activePlace]);

  useEffect(() => {
    const globe = globeRef.current;
    if (!globe) return;

    const style = getGlobeStyle(mapStyle);
    const points = pointPlaces.map((place) => {
      const relationshipStyle = getRelationshipVisualStyle(place.relationshipType);
      return {
        placeId: place.id,
        lat: Number(place.lat),
        lng: Number(place.lng),
        color: colorForPlace(place),
        altitude: relationshipStyle.globeAltitude,
        radius: relationshipStyle.globeRadius,
        label: buildGlobeLabel(place)
      };
    });

    const connections = buildConnectionPairs(pointPlaces, pathMode);
    const arcs = connections.map(({ from, to }) => ({
      startLat: Number(from.lat),
      startLng: Number(from.lng),
      endLat: Number(to.lat),
      endLng: Number(to.lng),
      altitude: arcAltitudeForPlaces(from, to),
      color: style.arcColor,
      stroke: pathMode === "hub" ? 0.82 : 0.7,
      dashLength: style.arcDashLength,
      dashGap: style.arcDashGap,
      dashAnimateTime: ORBITAL_ARC_DASH_ANIMATE_TIME
    }));

    globe.pointsData(points);
    globe.arcsData(arcs);

  }, [pointPlaces, pathMode, mapStyle]);

  useEffect(() => {
    const globe = globeRef.current;
    if (!globe || selectedPlaceId) return;

    if (pointPlaces.length === 0) {
      globe.pointOfView(ORBITAL_DEFAULT_VIEW, 700);
      syncOrbitalZoom(ORBITAL_DEFAULT_VIEW.altitude);
      return;
    }

    const overview = computeGlobeOverview(pointPlaces);
    if (!overview) return;

    globe.pointOfView(overview, 980);
    syncOrbitalZoom(overview.altitude);
  }, [pointPlaces, selectedPlaceId]);

  useEffect(() => {
    const globe = globeRef.current;
    if (!globe) return;
    if (!supportsGlobeLabels(globe)) return;

    if (activePlace && Number.isFinite(activePlace.lat) && Number.isFinite(activePlace.lng)) {
      globe.labelsData([
        {
          lat: Number(activePlace.lat),
          lng: Number(activePlace.lng),
          text: activePlace.name,
          color: "#f2fbff",
          size: 0.88,
          dotRadius: 0.38
        }
      ]);
    } else {
      globe.labelsData([]);
    }
  }, [activePlace]);

  useEffect(() => {
    const globe = globeRef.current;
    if (!globe || !focusTarget) return;

    const match =
      focusTarget.placeId &&
      places.find(
        (place) =>
          place.id === focusTarget.placeId &&
          hasFiniteCoordinates(place.lat, place.lng)
      );

    const lat = match
      ? Number(match.lat)
      : hasFiniteCoordinates(focusTarget.lat, focusTarget.lng)
        ? Number(focusTarget.lat)
        : null;
    const lng = match
      ? Number(match.lng)
      : hasFiniteCoordinates(focusTarget.lat, focusTarget.lng)
        ? Number(focusTarget.lng)
        : null;

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    pauseGlobeSpin(globe);

    globe.pointOfView(
      {
        lat,
        lng,
        altitude: ORBITAL_FOCUS_ALTITUDE
      },
      950
    );
    syncOrbitalZoom(ORBITAL_FOCUS_ALTITUDE);
  }, [focusTarget, places]);

  useEffect(() => {
    const globe = globeRef.current;
    if (!globe || typeof globe.controls !== "function") return;
    const controls = globe.controls();
    if (!controls) return;
    controls.enableZoom = !selectedPlaceId;
  }, [selectedPlaceId]);

  if (typeof Globe !== "function") {
    return (
      <div className="globe-map map-surface globe-fallback">
        Globe engine is still loading. Switch to Panel map or refresh.
      </div>
    );
  }

  return (
    <div
      className="globe-map map-surface"
      aria-label="Visited places globe"
    >
      <div ref={hostRef} className="globe-host" />
      <div className="map-zoom-control map-zoom-control-orbital">
        <label className="map-zoom-label" htmlFor="orbital-zoom">
          Zoom
        </label>
        <input
          id="orbital-zoom"
          className="map-zoom-slider"
          type="range"
          min={ORBITAL_ZOOM_MIN}
          max={ORBITAL_ZOOM_MAX}
          step="0.005"
          value={String(orbitalZoom)}
          onChange={handleOrbitalZoomChange}
          aria-label="Orbital zoom slider"
        />
      </div>
      {activePlace && (
        <aside className="globe-detail-card">
          <div className="globe-detail-header">
            <div className="globe-detail-title">{activePlace.name}</div>
            <button
              type="button"
              className="globe-detail-close"
              aria-label="Close place details"
              onClick={closeActivePlace}
            >
              X
            </button>
          </div>
          <div className="globe-detail-location">{activePlace.fullName || activePlace.name}</div>
          {activePlace.notes && <div className="globe-detail-note">{activePlace.notes}</div>}
          <button
            type="button"
            className="secondary globe-detail-btn"
            onClick={() => {
              if (!globeRef.current) return;
              resumeGlobeSpin(globeRef.current);
            }}
          >
            Resume Orbit
          </button>
        </aside>
      )}
    </div>
  );
}

function placeListItemId(placeId) {
  return `place-item-${String(placeId || "").trim()}`;
}

function forwardPageScrollFromWheel(event) {
  const delta = Number(event?.deltaY);
  if (!Number.isFinite(delta) || delta === 0) return;
  if (event?.cancelable) {
    event.preventDefault();
  }
  if (typeof event?.stopPropagation === "function") {
    event.stopPropagation();
  }
  const scrollingElement = document.scrollingElement || document.documentElement;
  if (!scrollingElement) return;
  scrollingElement.scrollTop += delta;
}

function pauseGlobeSpin(globe) {
  if (!globe || typeof globe.controls !== "function") return;
  const controls = globe.controls();
  if (!controls) return;
  controls.autoRotate = false;
}

function resumeGlobeSpin(globe) {
  if (!globe || typeof globe.controls !== "function") return;
  const controls = globe.controls();
  if (!controls) return;
  controls.autoRotate = true;
}

function orbitalAutoRotateSpeedForStyle(styleId) {
  if (styleId === "satellite") {
    return ORBITAL_ROTATE_SPEED_SATELLITE;
  }
  return ORBITAL_ROTATE_SPEED_BASE;
}

function orbitalPixelRatioForStyle(styleId) {
  const maxRatio =
    styleId === "satellite" ? ORBITAL_PIXEL_RATIO_CAP_SATELLITE : ORBITAL_PIXEL_RATIO_CAP;
  return Math.min(window.devicePixelRatio || 1, maxRatio);
}

function supportsGlobeLabels(globe) {
  if (!globe) return false;
  return (
    typeof globe.labelsData === "function" &&
    typeof globe.labelLat === "function" &&
    typeof globe.labelLng === "function" &&
    typeof globe.labelText === "function"
  );
}

function parseMentions(rawText) {
  const lines = normalizeInput(rawText)
    .split("\n")
    .map(cleanLine)
    .filter(Boolean);

  const mentions = [];
  const seen = new Set();
  let activeCountry = "";

  for (const line of lines) {
    const upper = toHeader(line);

    if (isIgnoredLine(upper)) continue;

    if (CONTINENT_HEADERS.has(upper)) {
      activeCountry = "";
      continue;
    }

    const lineCountry = resolveCountry(line);
    if (lineCountry && looksLikeStandaloneHeader(line)) {
      activeCountry = lineCountry;
      pushMention(mentions, seen, {
        token: lineCountry,
        context: "",
        query: lineCountry,
        source: line,
        kind: "country"
      });
      continue;
    }

    const extracted = extractLineMentions(line, activeCountry);
    for (const mention of extracted) {
      pushMention(mentions, seen, mention);
    }
  }

  return mentions;
}

function normalizeInput(rawText) {
  return String(rawText || "")
    .replace(/\r/g, "")
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[+&]/g, ",")
    .replace(/[;|]/g, ",");
}

function cleanLine(value) {
  return String(value || "")
    .replace(/\([^)]*\)/g, "")
    .replace(/\b\d+\s*-\s*\d+\s*(?:x|times?)\b/gi, "")
    .replace(/\b\d+\s*(?:x|times?)\b/gi, "")
    .replace(/[•*]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isIgnoredLine(headerText) {
  if (!headerText) return true;
  if (IGNORED_LINE_HEADERS.has(headerText)) return true;
  if (headerText.includes("PLACES IVE BEEN")) return true;
  return false;
}

function looksLikeStandaloneHeader(line) {
  return !line.includes(",") && !line.includes("-");
}

function extractLineMentions(line, activeCountry) {
  const segments = splitLineByDashContext(line);
  const mentions = [];

  for (const segment of segments) {
    let tokens = splitPlaceTokens(segment.left);
    let context = segment.context || activeCountry;

    if (!context && tokens.length > 1) {
      const last = tokens[tokens.length - 1];
      const trailingContext = resolveContext(last) || resolveCountry(last);
      if (trailingContext) {
        context = trailingContext;
        tokens = tokens.slice(0, -1);
      }
    }

    for (const token of tokens) {
      const normalizedToken = normalizeToken(token);
      if (!normalizedToken) continue;

      const tokenCountry = resolveCountry(normalizedToken);
      const contextFromToken = resolveContext(normalizedToken);
      let finalContext = context;
      let kind = "place";
      let query = normalizedToken;

      if (!finalContext && contextFromToken) {
        finalContext = contextFromToken;
      }

      const tokenMatchesContextCountry =
        tokenCountry &&
        finalContext &&
        normalizeCompare(finalContext).includes(normalizeCompare(tokenCountry));

      if (tokenCountry && tokens.length > 1 && (tokenMatchesContextCountry || finalContext)) {
        if (!context) {
          context = tokenCountry;
        }
        continue;
      }

      if (tokenCountry && tokens.length === 1) {
        kind = "country";
        finalContext = "";
        query = tokenCountry;
      } else if (finalContext) {
        query = `${normalizedToken}, ${finalContext}`;
      }

      mentions.push({
        token: normalizedToken,
        context: finalContext,
        query,
        source: line,
        kind
      });
    }
  }

  return mentions;
}

function splitLineByDashContext(line) {
  const parts = line.split(/\s-\s/).map((p) => p.trim()).filter(Boolean);

  if (parts.length === 1) {
    return [{ left: parts[0], context: "" }];
  }

  const out = [];
  let pendingLeft = parts[0];

  for (let i = 1; i < parts.length; i += 1) {
    const segment = parts[i];
    const leading = extractLeadingContext(segment);

    if (leading.context) {
      out.push({ left: pendingLeft, context: leading.context });
      pendingLeft = leading.rest;
      continue;
    }

    const context = resolveContext(segment) || resolveCountry(segment) || "";
    if (context) {
      out.push({ left: pendingLeft, context });
      pendingLeft = "";
    } else {
      pendingLeft = `${pendingLeft}, ${segment}`;
    }
  }

  if (pendingLeft.trim()) {
    out.push({ left: pendingLeft, context: "" });
  }

  return out;
}

function extractLeadingContext(segment) {
  const clean = String(segment || "").trim();
  if (!clean) return { context: "", rest: "" };

  const tokens = clean.split(/\s+/);

  for (let count = Math.min(4, tokens.length); count >= 1; count -= 1) {
    const prefix = tokens.slice(0, count).join(" ");
    const context = resolveContext(prefix) || resolveCountry(prefix);
    if (!context) continue;

    const rest = tokens.slice(count).join(" ").replace(/^,\s*/, "").trim();
    return { context, rest };
  }

  return { context: "", rest: clean };
}

function splitPlaceTokens(text) {
  return String(text || "")
    .split(/[,/]+/g)
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => !isNoiseToken(part));
}

function isNoiseToken(token) {
  const normalized = normalizeCompare(token);
  if (!normalized) return true;
  if (NOISE_TOKENS.has(normalized)) return true;
  if (normalized === "x") return true;
  if (normalized === "times") return true;
  if (/^\d+$/.test(normalized)) return true;
  if (/^\d+x$/.test(normalized)) return true;
  if (normalized.startsWith("want to live")) return true;
  if (normalized.length < 2) return true;
  return false;
}

function normalizeToken(token) {
  const cleaned = String(token || "")
    .replace(/[.!?]+$/g, "")
    .trim();

  if (!cleaned) return "";

  const alias = PLACE_ALIASES[toHeader(cleaned)];
  return alias || cleaned;
}

function resolveContext(value) {
  const raw = String(value || "").replace(/[.]/g, "").trim();
  if (!raw) return "";

  const upper = toHeader(raw);
  if (STATE_ABBREVIATIONS[upper]) {
    return `${STATE_ABBREVIATIONS[upper]}, United States`;
  }

  const country = resolveCountry(raw);
  if (country) return country;

  const namedState = findNamedState(raw);
  if (namedState) {
    return `${namedState}, United States`;
  }

  return "";
}

function resolveCountry(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  const upper = toHeader(raw);
  if (COUNTRY_ALIASES[upper]) return COUNTRY_ALIASES[upper];

  const normalized = normalizeCompare(raw);
  if (!normalized) return "";

  const resolved = COUNTRY_INDEX.byNormalized.get(normalized);
  if (resolved) return resolved;

  if (normalized.startsWith("the ")) {
    return COUNTRY_INDEX.byNormalized.get(normalized.slice(4)) || "";
  }

  return "";
}

function inferCountryFromContext(context) {
  const raw = String(context || "").trim();
  if (!raw) return "";

  const direct = resolveCountry(raw);
  if (direct) return direct;

  const parts = raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  for (let i = parts.length - 1; i >= 0; i -= 1) {
    const country = resolveCountry(parts[i]);
    if (country) return country;
  }

  return "";
}

function findNamedState(value) {
  const target = normalizeCompare(value);
  for (const stateName of Object.values(STATE_ABBREVIATIONS)) {
    if (normalizeCompare(stateName) === target) return stateName;
  }
  return "";
}

function pushMention(list, seen, mention) {
  const key = `${normalizeCompare(mention.query)}|${mention.kind}`;
  if (!mention.query || seen.has(key)) return;

  seen.add(key);
  list.push(mention);
}

function buildManualEditMention(nextName, existingFullName) {
  const token = String(nextName || "").trim();
  const context = inferEditContext(existingFullName);
  const query =
    context && !normalizeCompare(token).includes(normalizeCompare(context))
      ? `${token}, ${context}`
      : token;

  return {
    token,
    context,
    query,
    source: `manual edit: ${token}`,
    kind: "place"
  };
}

function inferEditContext(fullName) {
  const parts = String(fullName || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length < 2) return "";

  const tailTwo = parts.slice(-2).join(", ");
  if (/\d/.test(tailTwo)) {
    return parts[parts.length - 1] || "";
  }

  return tailTwo;
}

async function geocodeMentionScored(mention) {
  const suggestions = await geocodeMention(mention);
  if (suggestions.length === 0) return [];
  return suggestions
    .map((suggestion) => ({
      ...suggestion,
      score: scoreSuggestion(mention, suggestion)
    }))
    .sort((a, b) => b.score - a.score);
}

async function geocodeMention(mention) {
  const uniqueQueries = buildGeocodeQueries(mention);

  for (const query of uniqueQueries) {
    const cached = readGeocodeCache(query);
    if (cached) return cached;

    const openMeteo = await searchOpenMeteo(query);
    let merged = openMeteo;

    // Use Nominatim as fallback/enrichment only when Open-Meteo is sparse.
    if (openMeteo.length < 2) {
      const nominatim = await searchNominatim(query);
      merged = dedupeSuggestions([...openMeteo, ...nominatim]);
    }

    if (merged.length > 0) {
      writeGeocodeCache(query, merged);
      return merged;
    }
  }

  return [];
}

function buildGeocodeQueries(mention) {
  const out = [];
  const query = String(mention.query || "").trim();
  const token = String(mention.token || "").trim();
  const context = String(mention.context || "").trim();

  if (query) out.push(query);
  if (token && context) out.push(`${token}, ${context}`);
  if (token && token !== query) out.push(token);

  const resolvedCountry = resolveCountry(token);
  if (resolvedCountry && resolvedCountry !== token) {
    out.push(resolvedCountry);
  }

  return [...new Set(out.map((item) => item.trim()).filter(Boolean))];
}

function dedupeSuggestions(candidates) {
  if (!Array.isArray(candidates) || candidates.length === 0) return [];

  const seen = new Set();
  const out = [];

  for (const option of candidates) {
    if (!option) continue;
    const key = `${normalizeCompare(option.fullName)}|${Number(option.lat).toFixed(3)}|${Number(option.lng).toFixed(3)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(option);
  }

  return out;
}

async function searchOpenMeteo(query) {
  let payload = null;

  for (let attempt = 0; attempt < GEOCODER_MAX_RETRIES; attempt += 1) {
    const params = new URLSearchParams({
      name: query,
      count: "8",
      language: "en",
      format: "json"
    });

    let response = null;
    try {
      response = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?${params.toString()}`
      );
    } catch {
      if (attempt === GEOCODER_MAX_RETRIES - 1) break;
      await sleep(RETRY_BASE_DELAY_MS * (attempt + 1));
      continue;
    }

    if (response.ok) {
      payload = await response.json();
      break;
    }

    const retryable = response.status === 429 || response.status === 503 || response.status === 504;
    if (!retryable || attempt === GEOCODER_MAX_RETRIES - 1) {
      payload = null;
      break;
    }

    await sleep(RETRY_BASE_DELAY_MS * (attempt + 1));
  }

  if (!payload || !Array.isArray(payload.results)) return [];

  const seen = new Set();
  const out = [];

  for (const row of payload.results) {
    const option = openMeteoRowToSuggestion(row);
    if (!option) continue;

    const key = `${normalizeCompare(option.fullName)}|${option.lat.toFixed(3)}|${option.lng.toFixed(3)}`;
    if (seen.has(key)) continue;

    seen.add(key);
    out.push(option);
  }

  return out;
}

async function searchNominatim(query) {
  let rows = [];

  for (let attempt = 0; attempt < GEOCODER_MAX_RETRIES; attempt += 1) {
    const params = new URLSearchParams({
      q: query,
      format: "jsonv2",
      addressdetails: "1",
      limit: "5",
      "accept-language": "en"
    });

    await waitForNominatimWindow();

    let response = null;
    try {
      response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
        headers: {
          Accept: "application/json"
        }
      });
    } catch {
      if (attempt === GEOCODER_MAX_RETRIES - 1) break;
      await sleep(RETRY_BASE_DELAY_MS * (attempt + 1));
      continue;
    }

    if (response.ok) {
      const parsed = await response.json();
      rows = Array.isArray(parsed) ? parsed : [];
      break;
    }

    const retryable = response.status === 429 || response.status === 503 || response.status === 504;
    if (!retryable || attempt === GEOCODER_MAX_RETRIES - 1) {
      break;
    }

    await sleep(RETRY_BASE_DELAY_MS * (attempt + 1));
  }

  const seen = new Set();
  const out = [];

  for (const row of rows) {
    const option = rowToSuggestion(row);
    if (!option) continue;

    const key = `${normalizeCompare(option.fullName)}|${option.lat.toFixed(3)}|${option.lng.toFixed(3)}`;
    if (seen.has(key)) continue;

    seen.add(key);
    out.push(option);
  }

  return out;
}

async function waitForNominatimWindow() {
  const waitMs = nominatimNextAllowedAt - Date.now();
  if (waitMs > 0) {
    await sleep(waitMs);
  }
  nominatimNextAllowedAt = Date.now() + NOMINATIM_MIN_INTERVAL_MS;
}

function readGeocodeCache(query) {
  const key = normalizeCompare(query);
  if (!key) return null;

  const cached = geocodeCache.get(key);
  if (!cached) return null;

  if (Date.now() - cached.timestamp > GEOCODER_CACHE_TTL_MS) {
    geocodeCache.delete(key);
    return null;
  }

  // Refresh insertion order to keep frequently used entries hot.
  geocodeCache.delete(key);
  geocodeCache.set(key, cached);

  return cached.results.map((row) => ({ ...row }));
}

function writeGeocodeCache(query, results) {
  const key = normalizeCompare(query);
  if (!key || !Array.isArray(results) || results.length === 0) return;

  geocodeCache.set(key, {
    timestamp: Date.now(),
    results: results.map((row) => ({ ...row }))
  });

  while (geocodeCache.size > GEOCODER_CACHE_MAX_ENTRIES) {
    const oldestKey = geocodeCache.keys().next().value;
    if (!oldestKey) break;
    geocodeCache.delete(oldestKey);
  }
}

function openMeteoRowToSuggestion(row) {
  const lat = Number(row.latitude);
  const lng = Number(row.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const countryRaw = String(row.country || "").trim();
  const country = resolveCountry(countryRaw) || countryRaw;
  const countryCode = String(row.country_code || "").trim().toUpperCase();
  const admin1 = String(row.admin1 || "").trim();
  const admin2 = String(row.admin2 || "").trim();
  const timezone = String(row.timezone || "").trim();
  const namePart = String(row.name || "").trim();
  const primary = namePart || admin1 || country;
  if (!primary) return null;

  const shortSecondary = [admin1, country].filter(Boolean).join(", ");
  const fullName = [primary, admin2, admin1, country].filter(Boolean).join(", ");
  const type = inferOpenMeteoType(String(row.feature_code || ""));

  return {
    name: shortSecondary ? `${primary}, ${shortSecondary}` : primary,
    fullName: fullName || primary,
    lat,
    lng,
    country: country || inferCountryFromFullName(fullName || primary),
    countryCode,
    continent: inferContinentFromTimezone(timezone, lat),
    type,
    className: "place",
    importance: normalizePopulation(row.population)
  };
}

function rowToSuggestion(row) {
  const lat = Number(row.lat);
  const lng = Number(row.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const address = row.address || {};
  const countryCode = String(address.country_code || "").trim().toUpperCase();
  const primary =
    address.city ||
    address.town ||
    address.village ||
    address.municipality ||
    address.county ||
    address.state ||
    address.country ||
    row.name ||
    String(row.display_name || "").split(",")[0];

  const countryRaw = String(address.country || inferCountryFromFullName(row.display_name || primary));
  const country = resolveCountry(countryRaw) || countryRaw;
  const secondary = [address.state, country].filter(Boolean).join(", ");
  const name = secondary ? `${primary}, ${secondary}` : primary;

  return {
    name,
    fullName: String(row.display_name || name),
    lat,
    lng,
    country: country,
    countryCode,
    continent: inferContinent(country, countryCode, lat, lng),
    type: String(row.type || ""),
    className: String(row.class || ""),
    importance: Number(row.importance || 0)
  };
}

function scoreSuggestion(mention, suggestion) {
  const tokenScore = overlap(normalizeCompare(mention.token), normalizeCompare(suggestion.fullName));
  const queryScore = overlap(normalizeCompare(mention.query), normalizeCompare(suggestion.fullName));

  let contextScore = 0.6;
  if (mention.context) {
    contextScore = overlap(normalizeCompare(mention.context), normalizeCompare(suggestion.fullName));
  }

  let typeBoost = 0;
  if (mention.kind === "country") {
    if (suggestion.type === "country" || suggestion.className === "boundary") {
      typeBoost = 0.2;
    }
  } else if (
    ["city", "town", "village", "municipality", "administrative"].includes(suggestion.type) ||
    suggestion.className === "place"
  ) {
    typeBoost = 0.12;
  }

  const contextCountry = inferCountryFromContext(mention.context);
  const suggestionCountry = suggestion.country || inferCountryFromFullName(suggestion.fullName);
  let contextCountryBoost = 0;
  if (contextCountry && suggestionCountry) {
    const contextCountryNorm = normalizeCompare(contextCountry);
    const suggestionCountryNorm = normalizeCompare(suggestionCountry);
    if (
      suggestionCountryNorm === contextCountryNorm ||
      suggestionCountryNorm.includes(contextCountryNorm) ||
      contextCountryNorm.includes(suggestionCountryNorm)
    ) {
      contextCountryBoost = 0.2;
    } else {
      contextCountryBoost = -0.14;
    }
  }

  const importanceBoost = Math.min(0.08, Math.max(0, suggestion.importance * 0.08));
  const score =
    tokenScore * 0.5 +
    queryScore * 0.25 +
    contextScore * 0.25 +
    typeBoost +
    contextCountryBoost +
    importanceBoost;

  return clamp(score, 0, 1);
}

function inferOpenMeteoType(featureCode) {
  const code = String(featureCode || "").toUpperCase();
  if (code === "PCLI") return "country";
  if (code.startsWith("PPL")) return "city";
  if (code.startsWith("ADM")) return "administrative";
  return "place";
}

function normalizePopulation(value) {
  const population = Number(value);
  if (!Number.isFinite(population) || population <= 0) return 0.25;
  return clamp(Math.log10(population) / 8, 0.15, 1);
}

function overlap(source, target) {
  if (!source || !target) return 0;
  if (target.includes(source)) return 1;

  const words = source.split(" ").filter((w) => w.length > 1);
  if (words.length === 0) return 0;

  let hits = 0;
  for (const w of words) {
    if (target.includes(w)) hits += 1;
  }

  return hits / words.length;
}

function getSelectedOption(queueItem) {
  if (!queueItem || !Array.isArray(queueItem.options) || queueItem.options.length === 0) {
    return null;
  }

  const selectedIndex = clamp(
    Number.isFinite(Number(queueItem.selectedIndex)) ? Number(queueItem.selectedIndex) : 0,
    0,
    queueItem.options.length - 1
  );

  return queueItem.options[selectedIndex] || queueItem.options[0] || null;
}

function toPlace(suggestion, mention) {
  const country = suggestion.country || inferCountryFromFullName(suggestion.fullName);
  const continent =
    suggestion.continent ||
    inferContinent(country, suggestion.countryCode, suggestion.lat, suggestion.lng);
  return {
    id: crypto.randomUUID(),
    eventId: "",
    userId: "",
    cityId: "",
    tripId: null,
    relationshipType: "visit",
    startDate: "",
    endDate: "",
    tags: [],
    name: suggestion.name,
    fullName: suggestion.fullName,
    lat: suggestion.lat,
    lng: suggestion.lng,
    country,
    countryCode: String(suggestion.countryCode || ""),
    continent,
    notes: "",
    source: mention.source,
    query: mention.query
  };
}

function mergePlaces(existing, incoming) {
  const result = [...existing];
  const seen = new Set(existing.map(placeKey));

  for (const place of incoming) {
    const key = placeKey(place);
    if (seen.has(key)) continue;

    seen.add(key);
    result.push(place);
  }

  return result;
}

function placeKey(place) {
  if (place && place.eventId) {
    return `event:${String(place.eventId)}`;
  }
  return `${normalizeCompare(place.fullName || place.name)}|${Number(place.lat).toFixed(3)}|${Number(place.lng).toFixed(3)}`;
}

function groupPlaces(places, groupMode) {
  const groups = new Map();

  for (const place of places) {
    const country = place.country || inferCountryFromFullName(place.fullName || place.name);
    const continent =
      place.continent ||
      inferContinent(country, place.countryCode, place.lat, place.lng);
    const label =
      groupMode === "continent" ? continent || "Other / Unknown" : country || "Unknown country";

    if (!groups.has(label)) {
      groups.set(label, []);
    }
    groups.get(label).push(place);
  }

  return [...groups.entries()]
    .map(([label, groupItems]) => ({
      label,
      items: [...groupItems].sort((a, b) => a.name.localeCompare(b.name))
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function inferCountryFromFullName(fullName) {
  const parts = String(fullName || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) return "";
  const tail = parts[parts.length - 1];
  return resolveCountry(tail) || tail;
}

function inferContinent(country, countryCode = "", lat = null, lng = null) {
  const code = String(countryCode || "").toUpperCase();
  if (code) {
    const fromCode = inferContinentFromCountryCode(code);
    if (fromCode) return fromCode;
  }

  const key = normalizeCompare(country);
  if (!key) return "";

  if (COUNTRY_TO_CONTINENT[key]) {
    return COUNTRY_TO_CONTINENT[key];
  }

  for (const [countryName, continent] of Object.entries(COUNTRY_TO_CONTINENT)) {
    if (key.includes(countryName) || countryName.includes(key)) {
      return continent;
    }
  }

  if (Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))) {
    return inferContinentFromCoordinates(Number(lat), Number(lng));
  }

  return "";
}

function inferContinentFromCountryCode(code) {
  const normalizedCode = String(code || "").trim().toUpperCase();
  if (!normalizedCode) return "";
  return COUNTRY_CODE_TO_CONTINENT[normalizedCode] || "";
}

function inferContinentFromTimezone(timezone, lat) {
  const root = String(timezone || "").split("/")[0];
  if (!root) return "";

  if (root === "Europe") return "Europe";
  if (root === "Asia") return "Asia";
  if (root === "Africa") return "Africa";
  if (root === "Australia" || root === "Pacific") return "Oceania";
  if (root === "Antarctica") return "Antarctica";
  if (root === "America") {
    return Number(lat) < 12 ? "South America" : "North America";
  }
  return "";
}

function inferContinentFromCoordinates(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return "";

  if (lat <= -60) return "Antarctica";

  if (lng >= -92 && lng <= -30 && lat <= 15 && lat >= -60) {
    return "South America";
  }

  if (lng >= -172 && lng <= -15 && lat >= 5 && lat <= 84) {
    return "North America";
  }

  if (lng >= -25 && lng <= 60 && lat >= 34 && lat <= 72) {
    return "Europe";
  }

  if (lng >= -25 && lng <= 55 && lat >= -38 && lat <= 38) {
    return "Africa";
  }

  if ((lng >= 110 && lng <= 180 && lat >= -50 && lat <= 20) || (lng <= -140 && lat <= 20 && lat >= -50)) {
    return "Oceania";
  }

  if (lng >= 25 && lng <= 180 && lat >= -8 && lat <= 82) {
    return "Asia";
  }

  return "";
}

function colorForPlace(place) {
  const country = place.country || inferCountryFromFullName(place.fullName || place.name);
  const continent =
    place.continent ||
    inferContinent(country, place.countryCode, place.lat, place.lng) ||
    "Other / Unknown";
  return CONTINENT_COLORS[continent] || CONTINENT_COLORS["Other / Unknown"];
}

function getRelationshipVisualStyle(type) {
  if (
    window.GlobeHelpers &&
    typeof window.GlobeHelpers.relationshipStyle === "function"
  ) {
    return window.GlobeHelpers.relationshipStyle(type);
  }

  const key = String(type || "").toLowerCase();
  if (key === "lived") {
    return { label: "Lived", leafletRadius: 8, globeRadius: 0.42, globeAltitude: 0.022 };
  }
  if (key === "studied") {
    return { label: "Studied", leafletRadius: 7.2, globeRadius: 0.36, globeAltitude: 0.02 };
  }
  if (key === "work") {
    return { label: "Work", leafletRadius: 6.8, globeRadius: 0.34, globeAltitude: 0.019 };
  }
  return { label: "Visit", leafletRadius: 6, globeRadius: 0.3, globeAltitude: 0.016 };
}

function relationshipLabel(type) {
  if (window.UiHelpers && typeof window.UiHelpers.relationshipLabel === "function") {
    return window.UiHelpers.relationshipLabel(type);
  }
  const style = getRelationshipVisualStyle(type);
  return style.label || "Visit";
}

function formatEventDateRange(startDate, endDate) {
  if (window.UiHelpers && typeof window.UiHelpers.formatDateRange === "function") {
    return window.UiHelpers.formatDateRange(startDate, endDate);
  }
  const start = String(startDate || "").trim();
  const end = String(endDate || "").trim();
  if (start && end && start !== end) return `${start} to ${end}`;
  if (start && end && start === end) return start;
  if (start && !end) return `${start} onward`;
  if (!start && end) return `Until ${end}`;
  return "Undated";
}

function sanitizeRelationshipType(value) {
  const key = String(value || "")
    .trim()
    .toLowerCase();
  return RELATIONSHIP_TYPES.includes(key) ? key : "visit";
}

function sanitizeEditableDate(value) {
  const raw = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : "";
}

function parseTagsInput(value) {
  const seen = new Set();
  const tags = [];

  for (const part of String(value || "").split(/[,;\n]+/g)) {
    const tag = String(part || "").trim();
    if (!tag) continue;

    const key = normalizeCompare(tag);
    if (!key || seen.has(key)) continue;

    seen.add(key);
    tags.push(tag);
  }

  return tags;
}

function normalizeDateRange(startDate, endDate) {
  const start = sanitizeEditableDate(startDate);
  const end = sanitizeEditableDate(endDate);

  if (start && end && end < start) {
    return {
      startDate: start,
      endDate: start
    };
  }

  return {
    startDate: start,
    endDate: end
  };
}

function getGlobeStyle(styleId) {
  return GLOBE_STYLE_CONFIG[styleId] || GLOBE_STYLE_CONFIG.dark;
}

function buildConnectionPairs(pointPlaces, pathMode) {
  if (pathMode === "none" || pointPlaces.length < 2) {
    return [];
  }

  if (pathMode === "hub") {
    const hub = pointPlaces[0];
    return pointPlaces.slice(1).map((target) => ({ from: hub, to: target }));
  }

  const sorted = [...pointPlaces].sort(comparePlacesForTimeline);
  const pairs = [];

  for (let i = 1; i < sorted.length; i += 1) {
    pairs.push({ from: sorted[i - 1], to: sorted[i] });
  }

  return pairs;
}

function comparePlacesForTimeline(a, b) {
  const aStart = normalizeTimelineDate(a.startDate, "9999-12-31");
  const bStart = normalizeTimelineDate(b.startDate, "9999-12-31");
  if (aStart !== bStart) return aStart.localeCompare(bStart);

  const aEnd = normalizeTimelineDate(a.endDate || a.startDate, aStart);
  const bEnd = normalizeTimelineDate(b.endDate || b.startDate, bStart);
  if (aEnd !== bEnd) return aEnd.localeCompare(bEnd);

  return String(a.name || "").localeCompare(String(b.name || ""));
}

function normalizeTimelineDate(value, fallback) {
  const raw = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return fallback;
}

function hasFiniteCoordinates(lat, lng) {
  return Number.isFinite(Number(lat)) && Number.isFinite(Number(lng));
}

function isMappablePlace(place) {
  return place && hasFiniteCoordinates(place.lat, place.lng);
}

function getPointPlaces(places) {
  if (!Array.isArray(places) || places.length === 0) return [];
  return places.filter(isMappablePlace);
}

function computeLeafletAutoZoom(pointPlaces) {
  if (!Array.isArray(pointPlaces) || pointPlaces.length === 0) return 2;
  if (pointPlaces.length === 1) return 8.6;

  const lats = pointPlaces.map((place) => Number(place.lat));
  const lngs = pointPlaces.map((place) => wrapLongitude(Number(place.lng)));

  const latSpan = Math.max(...lats) - Math.min(...lats);
  const rawLngSpan = Math.max(...lngs) - Math.min(...lngs);
  const lngSpan = rawLngSpan > 180 ? 360 - rawLngSpan : rawLngSpan;
  const span = Math.max(latSpan, lngSpan);

  if (span < 0.08) return 13;
  if (span < 0.2) return 11.8;
  if (span < 0.6) return 10.5;
  if (span < 1.5) return 9.2;
  if (span < 4) return 8.2;
  if (span < 10) return 7.2;
  if (span < 24) return 6.4;
  return 5.6;
}

function computeGlobeOverview(pointPlaces) {
  if (!Array.isArray(pointPlaces) || pointPlaces.length === 0) return null;
  if (pointPlaces.length === 1) {
    const only = pointPlaces[0];
    return {
      lat: Number(only.lat),
      lng: Number(only.lng),
      altitude: 1.45
    };
  }

  const center = sphericalMeanCenter(pointPlaces);
  let maxDistance = 0;

  for (const place of pointPlaces) {
    const distance = angularDistanceDeg(
      center.lat,
      center.lng,
      Number(place.lat),
      Number(place.lng)
    );
    if (distance > maxDistance) {
      maxDistance = distance;
    }
  }

  const centeredLat = clamp(center.lat * 0.86, -26, 26);
  const centeredLng = wrapLongitude(center.lng * 0.92);
  const altitude = clamp(0.94 + maxDistance / 36, 1.02, 3.1);
  return {
    lat: centeredLat,
    lng: centeredLng,
    altitude
  };
}

function sphericalMeanCenter(pointPlaces) {
  let x = 0;
  let y = 0;
  let z = 0;

  for (const place of pointPlaces) {
    const lat = degToRad(Number(place.lat));
    const lng = degToRad(Number(place.lng));
    const cosLat = Math.cos(lat);
    x += cosLat * Math.cos(lng);
    y += cosLat * Math.sin(lng);
    z += Math.sin(lat);
  }

  const total = pointPlaces.length || 1;
  x /= total;
  y /= total;
  z /= total;

  const lng = Math.atan2(y, x);
  const hyp = Math.hypot(x, y);
  const lat = Math.atan2(z, hyp);

  return {
    lat: radToDeg(lat),
    lng: wrapLongitude(radToDeg(lng))
  };
}

function angularDistanceDeg(lat1, lng1, lat2, lng2) {
  const lat1Rad = degToRad(lat1);
  const lat2Rad = degToRad(lat2);
  const deltaLat = lat2Rad - lat1Rad;
  const deltaLng = degToRad(normalizeLongitudeNear(lng1, lng2) - lng1);

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1Rad) *
      Math.cos(lat2Rad) *
      Math.sin(deltaLng / 2) *
      Math.sin(deltaLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return radToDeg(c);
}

function degToRad(value) {
  return (Number(value) * Math.PI) / 180;
}

function radToDeg(value) {
  return (Number(value) * 180) / Math.PI;
}

function arcAltitudeForPlaces(fromPlace, toPlace) {
  const latDelta = Number(toPlace.lat) - Number(fromPlace.lat);
  const lngDelta = normalizeLongitudeNear(Number(fromPlace.lng), Number(toPlace.lng)) - Number(fromPlace.lng);
  const distance = Math.hypot(latDelta, lngDelta);
  return clamp(distance / 140, 0.1, 0.34);
}

function buildGlobeLabel(place) {
  const title = escapeHtml(place.name);
  const location = escapeHtml(place.fullName || place.name);
  const relationship = place.relationshipType
    ? `<br/><span style="opacity:.9;">${escapeHtml(
        relationshipLabel(place.relationshipType)
      )} · ${escapeHtml(formatEventDateRange(place.startDate, place.endDate))}</span>`
    : "";
  const notes = place.notes
    ? `<br/><span style="opacity:.86;">${escapeHtml(place.notes)}</span>`
    : "";
  return `<div><strong>${title}</strong><br/>${location}${relationship}${notes}</div>`;
}

function buildArcPoints(fromPlace, toPlace) {
  const lat1 = Number(fromPlace.lat);
  const lng1 = Number(fromPlace.lng);
  const lat2 = Number(toPlace.lat);
  const lng2 = normalizeLongitudeNear(lng1, Number(toPlace.lng));
  const midLat = (lat1 + lat2) / 2;
  const midLng = (lng1 + lng2) / 2;
  const distance = Math.hypot(lat2 - lat1, lng2 - lng1);
  const bend = clamp(distance * 0.18, 2.5, 14);
  const ctrlLat = midLat + bend;
  const ctrlLng = midLng;

  const points = [];
  const steps = 22;
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const mt = 1 - t;
    const lat = mt * mt * lat1 + 2 * mt * t * ctrlLat + t * t * lat2;
    const lng = mt * mt * lng1 + 2 * mt * t * ctrlLng + t * t * lng2;
    points.push([lat, wrapLongitude(lng)]);
  }

  return points;
}

function normalizeLongitudeNear(referenceLng, targetLng) {
  let delta = targetLng - referenceLng;
  while (delta > 180) delta -= 360;
  while (delta < -180) delta += 360;
  return referenceLng + delta;
}

function wrapLongitude(lng) {
  let value = lng;
  while (value > 180) value -= 360;
  while (value < -180) value += 360;
  return value;
}

function createTileLayer(styleId) {
  const style = MAP_STYLE_CONFIG[styleId] || MAP_STYLE_CONFIG.dark;
  return L.tileLayer(style.url, {
    detectRetina: true,
    updateWhenIdle: true,
    keepBuffer: 4,
    ...style.options
  });
}

function sanitizePlacesForStorage(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isValidPlace)
    .map((place) => {
      const fullName = String(place.fullName || place.name || "");
      const country = String(place.country || inferCountryFromFullName(fullName));
      const countryCode = String(place.countryCode || "").toUpperCase();
      const lat = Number(place.lat);
      const lng = Number(place.lng);
      const continent = String(
        place.continent || inferContinent(country, countryCode, lat, lng) || ""
      );

      return {
        id: place.id || crypto.randomUUID(),
        eventId: String(place.eventId || ""),
        userId: String(place.userId || ""),
        cityId: String(place.cityId || ""),
        tripId: place.tripId ? String(place.tripId || "") : null,
        relationshipType: sanitizeRelationshipType(place.relationshipType || "visit"),
        startDate: sanitizeEditableDate(place.startDate || ""),
        endDate: sanitizeEditableDate(place.endDate || ""),
        tags: Array.isArray(place.tags)
          ? place.tags.map((tag) => String(tag || "").trim()).filter(Boolean)
          : [],
        name: String(place.name || ""),
        fullName,
        lat,
        lng,
        country,
        countryCode,
        continent,
        notes: String(place.notes || ""),
        source: String(place.source || ""),
        query: String(place.query || "")
      };
    });
}

function loadStoredString(key, fallback = "") {
  try {
    const raw = localStorage.getItem(key);
    return typeof raw === "string" ? raw : fallback;
  } catch {
    return fallback;
  }
}

function saveStoredString(key, value) {
  try {
    localStorage.setItem(key, String(value || ""));
  } catch {
    // Ignore storage write failures.
  }
}

function getDefaultUserPreferences() {
  const fallback = {
    groupMode: "country",
    mapStyle: "dark",
    pathMode: "none",
    mapShape: "orbital"
  };
  return sanitizeUserPreferences(USER_DEFAULTS_CONFIG.preferences || {}, fallback);
}

function sanitizeUserPreferences(value, fallback) {
  const safeFallback = fallback || {
    groupMode: "country",
    mapStyle: "dark",
    pathMode: "none",
    mapShape: "orbital"
  };
  const next = value && typeof value === "object" ? value : {};
  const groupMode = next.groupMode === "continent" ? "continent" : safeFallback.groupMode;
  const mapStyle = MAP_STYLE_CONFIG[next.mapStyle] ? next.mapStyle : safeFallback.mapStyle;
  const pathMode = ["hub", "chain", "none"].includes(next.pathMode)
    ? next.pathMode
    : safeFallback.pathMode;
  const mapShape = ["orbital", "panel"].includes(next.mapShape)
    ? next.mapShape
    : safeFallback.mapShape;

  return {
    groupMode,
    mapStyle,
    pathMode,
    mapShape
  };
}

function loadUserPreferences() {
  const fallback = getDefaultUserPreferences();

  try {
    const raw = localStorage.getItem(USER_STORAGE.preferences);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return sanitizeUserPreferences(parsed, fallback);
  } catch {
    return fallback;
  }
}

function saveUserPreferences(nextPreferences) {
  const fallback = getDefaultUserPreferences();
  const safePreferences = sanitizeUserPreferences(nextPreferences, fallback);
  try {
    localStorage.setItem(USER_STORAGE.preferences, JSON.stringify(safePreferences));
  } catch {
    // Ignore storage write failures.
  }
}

function loadInputDraft() {
  return loadStoredString(USER_STORAGE.inputDraft, String(USER_DEFAULTS_CONFIG.inputDraft || ""));
}

function saveInputDraft(value) {
  saveStoredString(USER_STORAGE.inputDraft, value);
}

function loadPlaceFilter() {
  return loadStoredString(
    USER_STORAGE.placeFilter,
    String(USER_DEFAULTS_CONFIG.placeFilter || "")
  );
}

function savePlaceFilter(value) {
  saveStoredString(USER_STORAGE.placeFilter, value);
}

function loadPlaces() {
  const keys = [USER_STORAGE.places, ...LEGACY_PLACE_STORAGE_KEYS];

  for (const key of keys) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;

      const parsed = JSON.parse(raw);
      const sanitized = sanitizePlacesForStorage(parsed);

      if (sanitized.length > 0) {
        if (key !== USER_STORAGE.places) savePlaces(sanitized);
        return sanitized;
      }
    } catch {
      // Continue to the next storage key.
    }
  }

  return sanitizePlacesForStorage(USER_DEFAULTS_CONFIG.initialPlaces);
}

function savePlaces(nextPlaces) {
  try {
    localStorage.setItem(USER_STORAGE.places, JSON.stringify(nextPlaces));
  } catch {
    // Ignore storage write failures.
  }
}

function isValidPlace(place) {
  return place && typeof place.name === "string" && isMappablePlace(place);
}

function toHeader(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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

function normalizeAliasObject(value) {
  const out = {};
  if (!value || typeof value !== "object") return out;

  for (const [rawKey, rawTarget] of Object.entries(value)) {
    const key = toHeader(rawKey);
    const target = String(rawTarget || "").trim();
    if (!key || !target) continue;
    out[key] = target;
  }

  return out;
}

function buildCountryIndex(aliasMap) {
  const byNormalized = new Map();
  const codeToCountry = new Map();

  const displayNames =
    typeof Intl !== "undefined" && typeof Intl.DisplayNames === "function"
      ? new Intl.DisplayNames(["en"], { type: "region" })
      : null;

  let regionCodes = [];
  if (typeof Intl !== "undefined" && typeof Intl.supportedValuesOf === "function") {
    try {
      regionCodes = Intl.supportedValuesOf("region");
    } catch {
      regionCodes = [];
    }
  }

  if (regionCodes.length === 0 && displayNames) {
    regionCodes = generateRegionCodeCandidates();
  }

  for (const code of regionCodes) {
    if (!/^[A-Z]{2}$/.test(code)) continue;

    let label = "";
    try {
      label = displayNames ? String(displayNames.of(code) || "").trim() : "";
    } catch {
      label = "";
    }
    if (!label || /^[A-Z]{2}$/.test(label)) continue;
    if (normalizeCompare(label) === "unknown region") continue;

    codeToCountry.set(code, label);
    byNormalized.set(normalizeCompare(label), label);
    byNormalized.set(normalizeCompare(code), label);

    const noThe = normalizeCompare(label.replace(/^the\s+/i, ""));
    if (noThe) {
      byNormalized.set(noThe, label);
    }
  }

  for (const [rawAlias, rawTarget] of Object.entries(aliasMap || {})) {
    const alias = normalizeCompare(rawAlias);
    if (!alias) continue;

    const target = String(rawTarget || "").trim();
    if (!target) continue;

    const normalizedTarget = normalizeCompare(target);
    const canonicalTarget = byNormalized.get(normalizedTarget) || target;
    byNormalized.set(alias, canonicalTarget);
  }

  return {
    byNormalized,
    codeToCountry
  };
}

function generateRegionCodeCandidates() {
  const out = [];
  for (let first = 65; first <= 90; first += 1) {
    for (let second = 65; second <= 90; second += 1) {
      out.push(`${String.fromCharCode(first)}${String.fromCharCode(second)}`);
    }
  }
  return out;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function buildPlacePopup(place) {
  const title = `<strong>${escapeHtml(place.name)}</strong>`;
  const location = escapeHtml(place.fullName || place.name);
  const relationship = place.relationshipType
    ? `<br/><small>${escapeHtml(relationshipLabel(place.relationshipType))} · ${escapeHtml(
        formatEventDateRange(place.startDate, place.endDate)
      )}</small>`
    : "";
  const tags =
    Array.isArray(place.tags) && place.tags.length > 0
      ? `<br/><small>${escapeHtml(place.tags.join(", "))}</small>`
      : "";
  const notes = place.notes
    ? `<br/><small>${escapeHtml(place.notes)}</small>`
    : "";
  return `${title}<br/>${location}${relationship}${tags}${notes}`;
}

function buildHoverTooltip(place) {
  const title = `<strong>${escapeHtml(place.name)}</strong>`;
  const location = `<span>${escapeHtml(place.fullName || place.name)}</span>`;
  const relationship = place.relationshipType
    ? `<span>${escapeHtml(relationshipLabel(place.relationshipType))} · ${escapeHtml(
        formatEventDateRange(place.startDate, place.endDate)
      )}</span>`
    : "";
  const notes = place.notes
    ? `<span class="tooltip-note">${escapeHtml(place.notes)}</span>`
    : "";
  return `${title}<br/>${location}${relationship}${notes}`;
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
