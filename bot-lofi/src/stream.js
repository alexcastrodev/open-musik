import { PassThrough } from "node:stream";
import { request } from "undici";

export function httpOpusStream(url) {
  const out = new PassThrough();
  const ac = new AbortController();

  request(url, { signal: ac.signal })
    .then(({ statusCode, body }) => {
      if (statusCode !== 200) {
        body.dump().catch(() => {});
        out.destroy(new Error(`HTTP ${statusCode} em ${url}`));
        return;
      }
      body.on("error", (e) => out.destroy(e));
      body.pipe(out);
    })
    .catch((e) => {
      if (e.name === "AbortError") return;
      console.error(`[opus] erro ao abrir stream: ${e.message}`);
      out.destroy(e);
    });

  return {
    stream: out,
    kill: () => {
      ac.abort();
      out.destroy();
    },
  };
}
