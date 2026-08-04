
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";

export const HOLD_MUSIC = process.env.HOLD_MUSIC_PATH ||
  join(dirname(fileURLToPath(import.meta.url)), "..", "..", "assets", "hold-music.mp3");

function ffmpegArgs(input) {
  return [
    "-nostdin",
    "-reconnect", "1",
    "-reconnect_streamed", "1",
    "-reconnect_delay_max", "5",
    "-analyzeduration", "0",
    "-probesize", "1M",
    "-i", input,
    "-vn",
    "-loglevel", "error",
    "-f", "s16le",
    "-ar", "48000",
    "-ac", "2",
    "pipe:1",
  ];
}

function logFfmpeg(child, label) {
  child.stderr?.on("data", (d) => {
    const msg = d.toString().trim();
    if (msg) console.error(`[ffmpeg] ${msg}`);
  });
  child.on("close", (code) => {
    if (code) console.error(`[ffmpeg] saiu com código ${code} (${label})`);
  });
}

function killAll(child) {
  try {
    child.kill("SIGKILL");
  } catch {
  }
}

export function ffmpegPcmStream(url) {
  const child = spawn(FFMPEG, ffmpegArgs(url), {
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.on("error", (e) => console.error("[ffmpeg] erro:", e.message));
  logFfmpeg(child, url);
  return {
    stream: child.stdout,
    kill: () => killAll(child),
  };
}

export function holdMusicStream(path) {
  const child = spawn(FFMPEG, [
    "-nostdin",
    "-stream_loop", "-1",
    "-analyzeduration", "0",
    "-probesize", "1M",
    "-i", path,
    "-vn",
    "-loglevel", "error",
    "-f", "s16le",
    "-ar", "48000",
    "-ac", "2",
    "pipe:1",
  ], { stdio: ["ignore", "pipe", "pipe"] });
  child.on("error", (e) => console.error("[ffmpeg hold] erro:", e.message));
  logFfmpeg(child, "hold-music");
  return { stream: child.stdout, kill: () => killAll(child) };
}
