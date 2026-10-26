import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isUrl, domain, extractUrl, detectType, titleFromUrl, daysUntil, dueLabel, formatMinutes,
  parseTags, normalizeItem, filterItems, sortItems, summarize, parseImport, mergeItems, buildExport,
  escapeHtml,
} from "../js/utils.js";

const NOW = new Date(2026, 9, 26, 10, 0); // 26/10/2026, horário local

test("isUrl aceita só http(s)", () => {
  assert.equal(isUrl("https://medium.com/x"), true);
  assert.equal(isUrl("http://a.b"), true);
  assert.equal(isUrl("javascript:alert(1)"), false);
  assert.equal(isUrl("Capítulo 3 de Sapiens"), false);
});

test("domain remove www", () => {
  assert.equal(domain("https://www.youtube.com/watch?v=1"), "youtube.com");
  assert.equal(domain("nada"), "");
});

test("extractUrl acha link dentro de texto compartilhado", () => {
  assert.equal(extractUrl("Olha isso: https://medium.com/@a/post-123abc456def."), "https://medium.com/@a/post-123abc456def");
  assert.equal(extractUrl("sem link"), "");
});

test("detectType pelo domínio", () => {
  assert.equal(detectType("https://youtu.be/abc"), "video");
  assert.equal(detectType("https://www.youtube.com/watch?v=1"), "video");
  assert.equal(detectType("https://open.spotify.com/episode/1"), "podcast");
  assert.equal(detectType("https://www.amazon.com.br/livro/dp/1"), "livro");
  assert.equal(detectType("https://medium.com/@x/y"), "artigo");
  assert.equal(detectType(""), "outro");
  assert.equal(detectType("https://notyoutube.com.evil.io/x"), "artigo");
});

test("titleFromUrl limpa o slug do Medium", () => {
  assert.equal(
    titleFromUrl("https://medium.com/@ana/como-usar-ia-na-redacao-3f9a2b1c4d5e"),
    "Como usar ia na redacao",
  );
  assert.equal(titleFromUrl("https://www.youtube.com/watch?v=1"), "Vídeo do YouTube");
  assert.equal(titleFromUrl("https://exemplo.com/"), "exemplo.com");
  assert.equal(titleFromUrl("https://exemplo.com/2024"), "exemplo.com");
});

test("daysUntil e dueLabel", () => {
  assert.equal(daysUntil("2026-10-26", NOW), 0);
  assert.equal(daysUntil("2026-10-27", NOW), 1);
  assert.equal(daysUntil("2026-10-20", NOW), -6);
  assert.equal(daysUntil("", NOW), null);
  assert.equal(daysUntil("26/10/2026", NOW), null);
  assert.deepEqual(dueLabel("2026-10-26", NOW), { text: "Prazo hoje", cls: "d-soon" });
  assert.deepEqual(dueLabel("2026-10-25", NOW), { text: "Venceu ontem", cls: "d-late" });
  assert.deepEqual(dueLabel("2026-10-22", NOW), { text: "Venceu há 4 dias", cls: "d-late" });
  assert.deepEqual(dueLabel("2026-10-30", NOW), { text: "Prazo em 4 dias", cls: "" });
  assert.deepEqual(dueLabel("2026-12-05", NOW), { text: "Prazo 05/12", cls: "" });
});

test("formatMinutes", () => {
  assert.equal(formatMinutes(12), "12 min");
  assert.equal(formatMinutes(60), "1 h");
  assert.equal(formatMinutes(270), "4 h 30 min");
  assert.equal(formatMinutes(null), "0 min");
});

test("parseTags normaliza e remove duplicadas", () => {
  assert.deepEqual(parseTags(" IA, #trabalho, ia ,, design"), ["ia", "trabalho", "design"]);
});

test("escapeHtml", () => {
  assert.equal(escapeHtml(`<a href="x">'&`), "&lt;a href=&quot;x&quot;&gt;&#39;&amp;");
});

test("normalizeItem preenche padrões e descarta lixo", () => {
  const it = normalizeItem({ url: "https://youtu.be/x", priority: "9", minutes: "-3", due: "amanhã", tags: "A, b", status: "xpto" }, 1000);
  assert.equal(it.type, "video");
  assert.equal(it.title, "Vídeo do YouTube");
  assert.equal(it.priority, 2);
  assert.equal(it.minutes, null);
  assert.equal(it.due, "");
  assert.deepEqual(it.tags, ["a", "b"]);
  assert.equal(it.status, "pendente");
  assert.equal(it.createdAt, 1000);
  assert.ok(it.id);
  assert.equal(normalizeItem({ url: "javascript:alert(1)", title: "x" }).url, "");
});

const items = [
  { id: "a", title: "Artigo curto", type: "artigo", status: "pendente", priority: 1, minutes: 5, due: "", tags: ["ia"], createdAt: 1 },
  { id: "b", title: "Vídeo longo", type: "video", status: "andamento", priority: 2, minutes: 50, due: "", tags: [], createdAt: 2 },
  { id: "c", title: "Livro urgente", type: "livro", status: "pendente", priority: 2, minutes: 30, due: "2026-10-26", tags: ["ia", "trabalho"], createdAt: 3 },
  { id: "d", title: "Podcast alta", type: "podcast", status: "pendente", priority: 3, minutes: 40, due: "2026-11-30", tags: [], createdAt: 4 },
  { id: "e", title: "Feito", type: "artigo", status: "concluido", priority: 3, minutes: 10, due: "", tags: ["ia"], createdAt: 5, doneAt: NOW.getTime() - 864e5 },
];

test("filterItems por aba, tipo, tag, tempo e busca", () => {
  const ids = (f) => filterItems(items, f, NOW).map((i) => i.id).sort().join("");
  assert.equal(ids({ tab: "fila" }), "abcd");
  assert.equal(ids({ tab: "concluido" }), "e");
  assert.equal(ids({ tab: "tudo", tags: new Set(["ia"]) }), "ace");
  assert.equal(ids({ tab: "fila", time: 30 }), "ac");
  assert.equal(ids({ tab: "fila", type: "video" }), "b");
  assert.equal(ids({ tab: "tudo", q: "URGENTE" }), "c");
});

test("sortItems smart: andamento, depois prazo próximo, depois prioridade", () => {
  const order = sortItems(filterItems(items, { tab: "fila" }, NOW), "smart", "fila", NOW).map((i) => i.id).join("");
  assert.equal(order, "bcda");
  assert.equal(sortItems(items, "short", "tudo", NOW)[0].id, "a");
  assert.equal(sortItems(items, "new", "tudo", NOW)[0].id, "e");
});

test("summarize", () => {
  assert.deepEqual(summarize(items, NOW), { open: 4, minutes: 125, dueNow: 1, doneWeek: 1 });
});

test("parseImport aceita export e array, rejeita lixo", () => {
  const exp = JSON.stringify(buildExport([{ id: "x", title: "Um", type: "artigo" }], NOW));
  assert.equal(parseImport(exp)[0].id, "x");
  assert.equal(parseImport(JSON.stringify([{ title: "Dois" }])).length, 1);
  assert.throws(() => parseImport("{"), /JSON válido/);
  assert.throws(() => parseImport('{"a":1}'), /lista de itens/);
  assert.throws(() => parseImport("[{}]"), /título/);
});

test("mergeItems: novo, atualização por id e por link, ignora versão antiga", () => {
  const current = [
    { id: "1", title: "A", url: "https://a.com/x", updatedAt: 10 },
    { id: "2", title: "B", url: "", updatedAt: 10 },
  ];
  const incoming = [
    { id: "zz", title: "A novo", url: "https://a.com/x", updatedAt: 20 },
    { id: "2", title: "B velho", url: "", updatedAt: 5 },
    { id: "3", title: "C", url: "", updatedAt: 1 },
  ];
  const r = mergeItems(current, incoming);
  assert.equal(r.added, 1);
  assert.equal(r.updated, 1);
  const byId = Object.fromEntries(r.items.map((i) => [i.id, i.title]));
  assert.deepEqual(byId, { 1: "A novo", 2: "B", 3: "C" });
});
