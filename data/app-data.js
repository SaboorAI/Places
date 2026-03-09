// App-level config separated from runtime logic (src/app.js).
// This file is safe to edit for tuning parsing/matching behavior.

const APP_CONFIG = {
  dataModel: {
    enabled: true,
    basePath: "data",
    // If true, locationEvents seed the map only when local storage is empty.
    seedFromEventsOnEmpty: true,
    // If true, keep local places and append event-driven places.
    mergeWithLocal: false,
    // Leave blank to use first user in users.json.
    eventUserId: "user_saboor"
  },
  importer: {
    requestDelayMs: 180,
    geocoderMaxRetries: 3,
    retryBaseDelayMs: 900,
    cacheTtlMs: 1000 * 60 * 60 * 8,
    cacheMaxEntries: 500,
    autoApproveScore: 0.8,
    autoApproveLead: 0.12,
    nominatimMinIntervalMs: 1100
  },
  parser: {
    continentHeaders: [
      "NORTH AMERICA",
      "SOUTH AMERICA",
      "EUROPE",
      "ASIA",
      "AFRICA",
      "OCEANIA",
      "AUSTRALIA",
      "ANTARCTICA"
    ],
    ignoredHeaders: ["PLACES IVE BEEN", "HOME"],
    noiseTokens: ["home", "others", "other"],
    // Keep this short: this is only for abbreviations/slang/typos.
    customPlaceAliases: {
      NYC: "New York City",
      NOVA: "Northern Virginia",
      DMV: "Washington metropolitan area",
      OBX: "Outer Banks",
      PITTSBURG: "Pittsburgh",
      LUZERNE: "Lucerne",
      "WEST VA": "West Virginia",
      "UNIVERSITY AL": "Tuscaloosa, Alabama"
    },
    customCountryAliases: {
      "SAUDIA ARABIA": "Saudi Arabia",
      UK: "United Kingdom",
      UAE: "United Arab Emirates",
      ENGLAND: "United Kingdom",
      SCOTLAND: "United Kingdom",
      WALES: "United Kingdom",
      "NORTHERN IRELAND": "United Kingdom"
    },
    // US state shorthand context for parser hints.
    stateAbbreviations: {
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
    }
  },
  continents: {
    // Optional country-name overrides where a geocoder may return sub-national names.
    countryNameOverrides: {
      england: "Europe",
      scotland: "Europe",
      wales: "Europe",
      "northern ireland": "Europe"
    },
    colors: {
      "North America": "#69d1ff",
      "South America": "#64e6a8",
      Europe: "#b98dff",
      Asia: "#ff9ecf",
      Africa: "#ffd166",
      Oceania: "#7de3ff",
      Antarctica: "#e2f0ff",
      "Other / Unknown": "#b7c4d3"
    }
  }
};
