import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConfigStore } from "./store.js";

function tmpStorePath() {
  const dir = mkdtempSync(join(tmpdir(), "lofi-store-"));
  return { path: join(dir, "config.json"), dir };
}

test("setGuild cria e getGuild devolve a config", () => {
  const { path, dir } = tmpStorePath();
  try {
    const store = new ConfigStore(path);
    store.setGuild("g1", {
      voiceChannelId: "v1",
      panelChannelId: "c1",
      panelMessageId: "m1",
      station: "tokyo",
    });
    assert.deepEqual(store.getGuild("g1"), {
      voiceChannelId: "v1",
      panelChannelId: "c1",
      panelMessageId: "m1",
      station: "tokyo",
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("getGuild devolve null pra guild desconhecida", () => {
  const { path, dir } = tmpStorePath();
  try {
    assert.equal(new ConfigStore(path).getGuild("nope"), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("setGuild faz merge parcial (só troca a estação)", () => {
  const { path, dir } = tmpStorePath();
  try {
    const store = new ConfigStore(path);
    store.setGuild("g1", { voiceChannelId: "v1", station: "tokyo" });
    store.setGuild("g1", { station: "focus" });
    assert.deepEqual(store.getGuild("g1"), { voiceChannelId: "v1", station: "focus" });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("setGuild ignora chaves fora do schema", () => {
  const { path, dir } = tmpStorePath();
  try {
    const store = new ConfigStore(path);
    store.setGuild("g1", { station: "tokyo", hacker: "x", __proto__: "y" });
    assert.deepEqual(store.getGuild("g1"), { station: "tokyo" });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("persiste no disco e recarrega em nova instância", () => {
  const { path, dir } = tmpStorePath();
  try {
    new ConfigStore(path).setGuild("g1", { station: "anime" });
    const reloaded = new ConfigStore(path);
    assert.equal(reloaded.getGuild("g1").station, "anime");
    const raw = JSON.parse(readFileSync(path, "utf8"));
    assert.equal(raw.guilds.g1.station, "anime");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("allGuilds lista todas com guildId", () => {
  const { path, dir } = tmpStorePath();
  try {
    const store = new ConfigStore(path);
    store.setGuild("g1", { station: "tokyo" });
    store.setGuild("g2", { station: "akita" });
    const all = store.allGuilds().sort((a, b) => a.guildId.localeCompare(b.guildId));
    assert.deepEqual(all, [
      { guildId: "g1", station: "tokyo" },
      { guildId: "g2", station: "akita" },
    ]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("removeGuild apaga e persiste", () => {
  const { path, dir } = tmpStorePath();
  try {
    const store = new ConfigStore(path);
    store.setGuild("g1", { station: "tokyo" });
    assert.equal(store.removeGuild("g1"), true);
    assert.equal(store.getGuild("g1"), null);
    assert.equal(store.removeGuild("g1"), false);
    assert.deepEqual(new ConfigStore(path).allGuilds(), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("arquivo ausente/corrompido vira estado vazio", () => {
  const { path, dir } = tmpStorePath();
  try {
    assert.deepEqual(new ConfigStore(path).allGuilds(), []);
    writeFileSync(path, "{ nao-e-json");
    assert.deepEqual(new ConfigStore(path).allGuilds(), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
