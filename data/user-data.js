// User-owned data and storage separation for easy deployment/migration.

const USER_STORAGE_KEYS = {
  places: "visitedPlaces.user.places.v1",
  inputDraft: "visitedPlaces.user.inputDraft.v1",
  placeFilter: "visitedPlaces.user.placeFilter.v1",
  preferences: "visitedPlaces.user.preferences.v1"
};

const LEGACY_PLACE_KEYS = [
  "visitedPlaces.v1",
  "visitedCities.v3",
  "visitedCities.v2",
  "visitedCities.v1"
];

const USER_DEFAULTS = {
  // Optional starter list for first load in a new browser profile.
  initialPlaces: [],
  // Optional default values for user-editable inputs.
  inputDraft: "",
  placeFilter: "",
  preferences: {
    groupMode: "country",
    mapStyle: "dark",
    pathMode: "none",
    mapShape: "orbital"
  }
};
