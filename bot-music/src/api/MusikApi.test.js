import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { MusikApi } from "./MusikApi.js";

function hangingServer(delayMs) {
  const server = createServer((req, res) => {
    const send = () => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    };
    if (delayMs === Infinity) return;
    setTimeout(send, delayMs);
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

function baseUrlFor(server) {
  const { port } = server.address();
  return `http://127.0.0.1:${port}`;
}

test("requisição que nunca responde é abortada por timeoutMs (não pendura o bot)", async () => {
  const server = await hangingServer(Infinity);
  try {
    const api = new MusikApi({ baseUrl: baseUrlFor(server), clientId: "bot-1", timeoutMs: 50 });
    const start = Date.now();
    await assert.rejects(() => api.getGuildQueue("g1", "c1"));
    const elapsed = Date.now() - start;
    assert.ok(elapsed < 2000, `abortou tarde demais (${elapsed}ms)`);
  } finally {
    server.close();
  }
});

test("requisição normal (mais rápida que timeoutMs) não é afetada", async () => {
  const server = await hangingServer(10);
  try {
    const api = new MusikApi({ baseUrl: baseUrlFor(server), clientId: "bot-1", timeoutMs: 5000 });
    const result = await api.getGuildQueue("g1", "c1");
    assert.deepEqual(result, { ok: true });
  } finally {
    server.close();
  }
});

test("timeoutMs tem um default sensato quando não informado", () => {
  const api = new MusikApi({ baseUrl: "http://localhost:1", clientId: "bot-1" });
  assert.ok(api.timeoutMs > 0, "default de timeout presente");
});
