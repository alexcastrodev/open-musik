import { test } from "node:test";
import assert from "node:assert/strict";
import { youtubeId, normalizeTitle, pickSuggestion } from "./discover.js";

test("youtubeId: watch?v=", () => {
  assert.equal(youtubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ"), "dQw4w9WgXcQ");
});

test("youtubeId: watch?v= com outros params", () => {
  assert.equal(youtubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=RDxyz&t=10"), "dQw4w9WgXcQ");
});

test("youtubeId: youtu.be curto", () => {
  assert.equal(youtubeId("https://youtu.be/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
});

test("youtubeId: /shorts/", () => {
  assert.equal(youtubeId("https://www.youtube.com/shorts/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
});

test("youtubeId: id cru de 11 chars", () => {
  assert.equal(youtubeId("dQw4w9WgXcQ"), "dQw4w9WgXcQ");
});

test("youtubeId: não-YouTube → null", () => {
  assert.equal(youtubeId("https://open.spotify.com/track/abc"), null);
  assert.equal(youtubeId(""), null);
  assert.equal(youtubeId(null), null);
});

test("normalizeTitle colapsa ruído de YouTube", () => {
  assert.equal(normalizeTitle("Song Name (Official Video)"), "song name");
  assert.equal(normalizeTitle("Song Name [Lyrics]"), "song name");
  assert.equal(normalizeTitle("Song Name (Audio) HD"), "song name");
  assert.equal(
    normalizeTitle("Artista - Música (Official Video)"),
    normalizeTitle("Artista - Música (Lyric Video)"),
    "variações do mesmo clip colapsam",
  );
});

test("pickSuggestion pula a seed e ids já excluídos", () => {
  const entries = [
    { id: "seed0000000", title: "Seed" },
    { id: "aaaaaaaaaaa", title: "Já tocou" },
    { id: "bbbbbbbbbbb", title: "Nova" },
  ];
  const s = pickSuggestion(entries, "seed0000000", new Set(["aaaaaaaaaaa"]));
  assert.equal(s.title, "Nova");
  assert.match(s.url, /bbbbbbbbbbb/);
});

test("pickSuggestion pula a MESMA música em outro clip (dedupe por título)", () => {
  const entries = [
    { id: "clip1111111", title: "Minha Faixa (Official Video)" },
    { id: "clip2222222", title: "Outra Coisa" },
  ];
  const excludeTitles = new Set([normalizeTitle("Minha Faixa (Lyrics)")]);
  const s = pickSuggestion(entries, "seed0000000", new Set(), excludeTitles);
  assert.equal(s.title, "Outra Coisa", "não repete a mesma música de outro clip");
});

test("pickSuggestion devolve null se tudo já foi excluído", () => {
  const entries = [{ id: "clip1111111", title: "Repetida (Audio)" }];
  const excludeTitles = new Set([normalizeTitle("Repetida")]);
  assert.equal(pickSuggestion(entries, "seed0000000", new Set(), excludeTitles), null);
});

