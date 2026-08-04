
import { spawn } from "node:child_process";
import { PassThrough } from "node:stream";
import { StreamType } from "@discordjs/voice";
import { FFMPEG } from "./ffmpeg.js";

export const YTDLP = process.env.YTDLP_PATH || "yt-dlp";

const YTDLP_FORMAT = process.env.YTDLP_FORMAT || "bestaudio/best";
const YTDLP_FORMAT_SORT = process.env.YTDLP_FORMAT_SORT || "hasaud,acodec:opus,abr,asr";

export const YTDLP_SKIP_JS = process.env.YTDLP_PLAYER_SKIP_JS !== "0";

function ytdlpTarget(target) {
  return /^https?:\/\//i.test(target) ? target : `ytsearch1:${target}`;
}

function ytdlpArgs(url, { live = false } = {}) {
  const skipJs = YTDLP_SKIP_JS && !live;
  return [
    "--no-playlist",
    "--no-part",
    "--no-cache-dir",
    "--no-check-formats",
    "-q",
    ...(skipJs ? [ "--extractor-args", "youtube:player_skip=js" ] : []),
    "--format", YTDLP_FORMAT,
    "--format-sort", YTDLP_FORMAT_SORT,
    "-o", "-",
    ytdlpTarget(url),
  ];
}

function ffmpegStdinArgs() {
  return [
    "-nostdin",
    "-analyzeduration", "0",
    "-probesize", "1M",
    "-i", "pipe:0",
    "-vn",
    "-loglevel", "error",
    "-f", "s16le",
    "-ar", "48000",
    "-ac", "2",
    "pipe:1",
  ];
}

function logChild(child, label) {
  child.stderr?.on("data", (d) => {
    const msg = d.toString().trim();
    if (msg) console.error(`[${label}] ${msg}`);
  });
}

function killChild(child) {
  try {
    child.kill("SIGKILL");
  } catch {
  }
}

export function ytdlpSourceStream(url, { live = false } = {}) {
  const out = new PassThrough();

  const tSpawn = Date.now();
  let ytFirstByte = false;

  const ytdlp = spawn(YTDLP, ytdlpArgs(url, { live }), {
    stdio: ["ignore", "pipe", "pipe"],
  });
  const ffmpeg = spawn(FFMPEG, ffmpegStdinArgs(), {
    stdio: ["pipe", "pipe", "pipe"],
  });

  const kill = () => {
    killChild(ytdlp);
    killChild(ffmpeg);
    out.destroy();
  };

  ytdlp.on("error", (e) => {
    console.error(`[yt-dlp] erro ao iniciar: ${e.message}`);
    out.destroy(e);
    killChild(ffmpeg);
  });
  ffmpeg.on("error", (e) => {
    console.error(`[ffmpeg<yt-dlp] erro ao iniciar: ${e.message}`);
    out.destroy(e);
    killChild(ytdlp);
  });

  logChild(ytdlp, "yt-dlp");
  logChild(ffmpeg, "ffmpeg<yt-dlp");

  ytdlp.on("close", (code) => {
    if (code) {
      console.error(`[yt-dlp] saiu com código ${code} (${url})`);
      killChild(ffmpeg);
      out.destroy(new Error(`yt-dlp exited ${code}`));
    }
  });
  ffmpeg.on("close", (code) => {
    if (code) console.error(`[ffmpeg<yt-dlp] saiu com código ${code}`);
  });

  ytdlp.stdout.on("error", () => {});
  ytdlp.stdout.pipe(ffmpeg.stdin).on("error", () => {});
  ffmpeg.stdout.on("error", (e) => out.destroy(e));
  ffmpeg.stdout.pipe(out);

  ytdlp.stdout.on("data", () => {
    if (ytFirstByte) return;
    ytFirstByte = true;
    console.log(`[yt-dlp] resolução pronta em ${Date.now() - tSpawn}ms (começou a baixar)`);
  });

  return { stream: out, kill, type: StreamType.Raw };
}
