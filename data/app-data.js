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

const CONTINENT_HEADERS = new Set([
  "NORTH AMERICA",
  "SOUTH AMERICA",
  "EUROPE",
  "ASIA",
  "AFRICA",
  "OCEANIA",
  "AUSTRALIA",
  "ANTARCTICA"
]);

const COUNTRY_ALIASES = {
  USA: "United States",
  US: "United States",
  "UNITED STATES": "United States",
  MEXICO: "Mexico",
  CANADA: "Canada",
  BAHAMAS: "Bahamas",
  "PUERTO RICO": "Puerto Rico",
  BRAZIL: "Brazil",
  FRANCE: "France",
  SWITZERLAND: "Switzerland",
  ITALY: "Italy",
  ENGLAND: "England, United Kingdom",
  SCOTLAND: "Scotland, United Kingdom",
  TURKEY: "Turkey",
  SPAIN: "Spain",
  GREECE: "Greece",
  PAKISTAN: "Pakistan",
  "SAUDIA ARABIA": "Saudi Arabia",
  "SAUDI ARABIA": "Saudi Arabia",
  UAE: "United Arab Emirates",
  "UNITED ARAB EMIRATES": "United Arab Emirates",
  JAPAN: "Japan",
  THAILAND: "Thailand",
  MOROCCO: "Morocco",
  EGYPT: "Egypt"
};

const STATE_ABBREVIATIONS = {
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

const PLACE_ALIASES = {
  NYC: "New York City",
  NOVA: "Northern Virginia",
  DMV: "Washington metropolitan area",
  OBX: "Outer Banks",
  PITTSBURG: "Pittsburgh",
  LUZERNE: "Lucerne",
  "WEST VA": "West Virginia",
  "UNIVERSITY, AL": "Tuscaloosa, Alabama"
};

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
  "united states": "North America",
  "puerto rico": "North America",
  mexico: "North America",
  canada: "North America",
  bahamas: "North America",
  brazil: "South America",
  france: "Europe",
  switzerland: "Europe",
  italy: "Europe",
  "united kingdom": "Europe",
  england: "Europe",
  scotland: "Europe",
  spain: "Europe",
  greece: "Europe",
  turkey: "Asia",
  pakistan: "Asia",
  "saudi arabia": "Asia",
  "united arab emirates": "Asia",
  japan: "Asia",
  thailand: "Asia",
  morocco: "Africa",
  egypt: "Africa"
};

const CONTINENT_COLORS = {
  "North America": "#69d1ff",
  "South America": "#64e6a8",
  Europe: "#b98dff",
  Asia: "#ff9ecf",
  Africa: "#ffd166",
  Oceania: "#7de3ff",
  "Other / Unknown": "#b7c4d3"
};
