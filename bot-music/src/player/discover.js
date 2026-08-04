
import { spawn } from "node:child_process";
import { YTDLP } from "./ytdlp.js";

const DISCOVER_TIMEOUT_MS = Number(process.env.DISCOVER_RESOLVE_TIMEOUT_MS) || 15_000;
const MIX_DEPTH = Number(process.env.DISCOVER_MIX_DEPTH) || 15;

function youtubeId(urlOrId) {
  const s = String(urlOrId || "");
  const m =
    s.match(/[?&]v=([A-Za-z0-9_-]{11})/) ||
    s.match(/youtu\.be\/([A-Za-z0-9_-]{11})/) ||
    s.match(/\/shorts\/([A-Za-z0-9_-]{11})/) ||
    s.match(/^([A-Za-z0-9_-]{11})$/);
  return m ? m[1] : null;
}

function watchUrl(id) {
  return `https://www.youtube.com/watch?v=${id}`;
}

function listMix(seedId) {
  return new Promise((resolve) => {
    const mixUrl = `https://www.youtube.com/watch?v=${seedId}&list=RD${seedId}`;
    const args = [
      "--flat-playlist",
      "--no-warnings",
      "--playlist-end", String(MIX_DEPTH),
      "--dump-json",
      mixUrl,
    ];
    const child = spawn(YTDLP, args, { stdio: ["ignore", "pipe", "pipe"] });

    let buf = "";
    let done = false;
    const entries = [];
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { child.kill("SIGKILL"); } catch { /* já encerrado */ }
      resolve(entries);
    };

    const timer = setTimeout(finish, DISCOVER_TIMEOUT_MS);

    child.stdout.on("data", (d) => {
      buf += d.toString();
      let nl;
      while ((nl = buf.indexOf("\n")) !== -1) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        try {
          const o = JSON.parse(line);
          if (o?.id) entries.push({ id: String(o.id), title: String(o.title || "").trim() });
        } catch {
        }
      }
    });
    child.stderr.on("data", (d) => {
      const msg = d.toString().trim();
      if (msg) console.error(`[discover yt-dlp] ${msg}`);
    });
    child.on("error", (e) => {
      console.error(`[discover yt-dlp] erro ao iniciar: ${e.message}`);
      finish();
    });
    child.on("close", finish);
  });
}

export async function resolveNextSuggestion(seedUrlOrId, excludeIds = new Set(), excludeTitles = new Set()) {
  const seedId = youtubeId(seedUrlOrId);
  if (!seedId) {
    console.warn(`[discover] seed não é do YouTube; sem Mix pra sugerir: ${seedUrlOrId}`);
    return null;
  }

  const entries = await listMix(seedId);
  return pickSuggestion(entries, seedId, excludeIds, excludeTitles);
}

export function pickSuggestion(entries, seedId, excludeIds = new Set(), excludeTitles = new Set()) {
  for (const { id, title } of entries) {
    if (id === seedId) continue;
    if (excludeIds.has(id)) continue;
    if (titleExcluded(title, excludeTitles)) continue;
    return { url: watchUrl(id), title };
  }
  return null;
}

export function normalizeTitle(title) {
  return String(title || "")
    .toLowerCase()
    .replace(/[\(\[\{].*?[\)\]\}]/g, " ")
    .replace(/\b(official|video|audio|lyric|lyrics|hd|hq|4k|mv|m\/v|remaster(?:ed)?|visualizer|clipe|oficial|ao vivo|live)\b/g, " ")
    .replace(/\bfeat\.?\b|\bft\.?\b/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function titleExcluded(title, excludeTitles) {
  const n = normalizeTitle(title);
  if (!n) return false;
  if (excludeTitles.has(n)) return true;
  for (const ex of excludeTitles) {
    if (ex.length < 4 || n.length < 4) continue;
    if (n.includes(ex) || ex.includes(n)) return true;
  }
  return false;
}

export { youtubeId };
