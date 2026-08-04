
import { test } from "node:test";
import assert from "node:assert/strict";
import { GuildPlayer } from "./GuildPlayer.js";

function makeGP() {
  const gp = new GuildPlayer("g1", { api: {}, botPool: null, ownClientId: "botA" });
  const events = [];
  gp.connection = { joinConfig: { channelId: "c1" }, destroy() {} };
  gp.player = {
    pause: () => { events.push("pause"); return true; },
    unpause: () => { events.push("unpause"); return true; },
  };
  gp._events = events;
  return gp;
}

test("canal vazio: pausa e marca autoPaused", () => {
  const gp = makeGP();
  gp.pauseForEmpty();
  assert.equal(gp.autoPaused, true);
  assert.deepEqual(gp._events, ["pause"]);
});

test("alguém volta: retoma e limpa autoPaused", () => {
  const gp = makeGP();
  gp.pauseForEmpty();
  gp.resumeIfAutoPaused();
  assert.equal(gp.autoPaused, false);
  assert.deepEqual(gp._events, ["pause", "unpause"]);
});

test("pauseForEmpty é idempotente (não pausa duas vezes)", () => {
  const gp = makeGP();
  gp.pauseForEmpty();
  gp.pauseForEmpty();
  assert.deepEqual(gp._events, ["pause"]);
});

test("NÃO auto-pausa por cima de uma pausa manual do usuário", () => {
  const gp = makeGP();
  gp.paused = true;
  gp.pauseForEmpty();
  assert.equal(gp.autoPaused, false, "não marca auto-pause");
  gp.resumeIfAutoPaused();
  assert.equal(gp.paused, true);
  assert.deepEqual(gp._events, [], "não mexeu no player");
});

test("resumeIfAutoPaused é no-op se não houve auto-pause", () => {
  const gp = makeGP();
  gp.resumeIfAutoPaused();
  assert.deepEqual(gp._events, []);
});

test("sem conexão não auto-pausa", () => {
  const gp = makeGP();
  gp.connection = null;
  gp.pauseForEmpty();
  assert.equal(gp.autoPaused, false);
  assert.deepEqual(gp._events, []);
});

test("sem player (nada tocando) não auto-pausa", () => {
  const gp = makeGP();
  gp.player = null;
  gp.pauseForEmpty();
  assert.equal(gp.autoPaused, false);
});
