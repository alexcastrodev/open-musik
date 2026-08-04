export const LOFI_RELAY_URL = (process.env.LOFI_RELAY_URL || "https://lofi.kurz.fyi").replace(/\/+$/, "");

const STATIONS = {
  tokyo: { label: "Lofi Tokyo", mount: "tokyo.opus" },
  focus: { label: "Lofi Focus", mount: "focus.opus" },
  anime: { label: "Lofi Anime", mount: "anime.opus" },
  anime2: { label: "Lofi Anime 2", mount: "anime2.opus" },
  akita: { label: "Lofi Akita", mount: "akita.opus" },
};

export function lofiChoices() {
  return Object.entries(STATIONS).map(([value, { label }]) => ({ name: label, value }));
}

export function resolveStation(value) {
  const s = STATIONS[value];
  if (!s) return null;
  return { value, label: s.label, url: `${LOFI_RELAY_URL}/${s.mount}` };
}

export function allStations() {
  return Object.keys(STATIONS).map((value) => resolveStation(value));
}
