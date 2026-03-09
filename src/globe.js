(function attachGlobeHelpers(globalScope) {
  "use strict";

  const RELATIONSHIP_STYLE = {
    visit: {
      label: "Visit",
      leafletRadius: 6,
      globeRadius: 0.3,
      globeAltitude: 0.016
    },
    lived: {
      label: "Lived",
      leafletRadius: 8,
      globeRadius: 0.42,
      globeAltitude: 0.022
    },
    studied: {
      label: "Studied",
      leafletRadius: 7.2,
      globeRadius: 0.36,
      globeAltitude: 0.02
    },
    work: {
      label: "Work",
      leafletRadius: 6.8,
      globeRadius: 0.34,
      globeAltitude: 0.019
    }
  };

  function relationshipStyle(type) {
    const key = String(type || "").toLowerCase();
    return RELATIONSHIP_STYLE[key] || RELATIONSHIP_STYLE.visit;
  }

  globalScope.GlobeHelpers = {
    relationshipStyle
  };
})(window);
