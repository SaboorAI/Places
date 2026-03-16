(function attachUiHelpers(globalScope) {
  "use strict";

  const TYPE_LABELS = {
    visit: "Visit",
    lived: "Lived",
    studied: "Studied",
    work: "Work"
  };

  function relationshipLabel(type) {
    const key = String(type || "").toLowerCase();
    return TYPE_LABELS[key] || "Visit";
  }

  function formatDateRange(startDate, endDate) {
    const start = formatDate(startDate);
    const end = formatDate(endDate);

    if (start && end && start === end) return start;
    if (start && end) return `${start} to ${end}`;
    if (start && !end) return `${start} onward`;
    if (!start && end) return `Until ${end}`;
    return "Undated";
  }

  function formatDate(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    const date = new Date(`${raw}T00:00:00`);
    if (!Number.isFinite(date.getTime())) return "";
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric"
    });
  }

  globalScope.UiHelpers = {
    relationshipLabel,
    formatDateRange
  };
})(window);
