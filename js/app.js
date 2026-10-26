import {
  TYPES, PRIORITIES, STATUS,
  escapeHtml as esc, isUrl, domain, extractUrl, detectType, titleFromUrl,
  dueLabel, formatMinutes, normalizeItem, inTab, filterItems, sortItems, summarize,
  buildExport, parseImport, mergeItems, toDateStr,
} from "./utils.js";
import { openStore, notifyChange, onExternalChange, requestPersistence } from "./store.js";

const TYPE_STYLE = {
  artigo:  { c: "--t-artigo",  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="5" y="3.5" width="14" height="17" rx="2"/><path d="M8.5 8h7M8.5 11.5h7M8.5 15h4.5"/></svg>' },
  video:   { c: "--t-video",   icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><rect x="3" y="5.5" width="18" height="13" rx="3"/><path d="M10.5 9.5v5l4-2.5z" fill="currentColor"/></svg>' },
  livro:   { c: "--t-livro",   icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 6.5C10 5 7 4.5 4 5v13c3-.5 6 0 8 1.5 2-1.5 5-2 8-1.5V5c-3-.5-6 0-8 1.5zM12 6.5v13"/></svg>' },
  podcast: { c: "--t-podcast", icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="9" y="3.5" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v2.5"/></svg>' },
  outro:   { c: "--t-outro",   icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="8"/><circle cx="8.5" cy="12" r=".8" fill="currentColor"/><circle cx="12" cy="12" r=".8" fill="currentColor"/><circle cx="15.5" cy="12" r=".8" fill="currentColor"/></svg>' },
};

const state = {
  items: [], loaded: false, confirmId: null,
  tab: "fila", type: "", tags: new Set(), q: "", time: 0, sort: "smart",
};
let store = null;

const $ = (s, root = document) => root.querySelector(s);

/* ---------- toast ---------- */
let toastTimer;
function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 2600);
}

/* ---------- persistência ---------- */
async function reload() {
  state.items = await store.all();
  state.loaded = true;
  render();
}
async function save(item, msg) {
  try {
    await store.put(item);
    const i = state.items.findIndex((x) => x.id === item.id);
    if (i >= 0) state.items[i] = item; else state.items.push(item);
    notifyChange();
    render();
    if (msg) toast(msg);
  } catch (err) {
    console.error(err);
    toast("Não deu para salvar. Verifique o espaço do navegador e tente de novo.");
  }
}
async function remove(id) {
  try {
    await store.remove(id);
    state.items = state.items.filter((i) => i.id !== id);
    notifyChange();
    render();
    toast("Excluído");
  } catch (err) {
    console.error(err);
    toast("Não deu para excluir agora. Tente de novo.");
  }
}

/* ---------- formulário (novo e edição) ---------- */
function formHTML(it, p) {
  const type = it.type || "artigo";
  const prio = it.priority || 2;
  return `
  <div class="form">
    <label class="c6">Título<input id="${p}title" type="text" value="${esc(it.title)}" placeholder="Ex.: Capítulo 4 de Rápido e Devagar"></label>
    <label class="c6">Link (opcional)<input id="${p}url" type="url" value="${esc(it.url)}" placeholder="https://"></label>
    <label class="c6">Tipo<div class="seg" id="${p}type">${Object.entries(TYPES).map(([k, v]) =>
      `<button type="button" data-v="${k}" aria-pressed="${k === type}"><span class="dot" style="--c:var(${TYPE_STYLE[k].c})"></span> ${v.label}</button>`).join("")}</div></label>
    <label class="c3">Prioridade<div class="seg" id="${p}prio">${[3, 2, 1].map((n) =>
      `<button type="button" data-v="${n}" aria-pressed="${n === prio}">${PRIORITIES[n].label}</button>`).join("")}</div></label>
    <label class="c3 half">Tempo estimado (min)<input id="${p}min" type="number" min="1" max="2000" inputmode="numeric" value="${esc(it.minutes ?? TYPES[type].minutes)}"></label>
    <label class="c3 half">Prazo<input id="${p}due" type="date" value="${esc(it.due)}"></label>
    <label class="c3">Tags (separe por vírgula)<input id="${p}tags" type="text" value="${esc((it.tags || []).join(", "))}" placeholder="trabalho, ia, design"></label>
    ${it.id ? `<label class="c3">Status<select id="${p}status">${Object.entries(STATUS).map(([k, v]) =>
      `<option value="${k}" ${k === it.status ? "selected" : ""}>${v}</option>`).join("")}</select></label>` : ""}
    <label class="c6">Notas<textarea id="${p}notes" placeholder="Por que guardar isso? Quem indicou? Em que página parou?">${esc(it.notes)}</textarea></label>
    <div class="actions">
      <button type="button" class="btn ghost" data-act="cancel">Cancelar</button>
      <button type="button" class="btn primary" data-act="save">${it.id ? "Salvar alterações" : "Guardar na fila"}</button>
    </div>
  </div>`;
}

function wireSeg(root, sel, onPick) {
  $(sel, root).addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    root.querySelectorAll(`${sel} button`).forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    onPick?.(b.dataset.v);
  });
}

function readForm(root, p) {
  const pick = (sel) => root.querySelector(`${sel} button[aria-pressed="true"]`)?.dataset.v;
  const out = {
    title: $(`#${p}title`, root).value,
    url: $(`#${p}url`, root).value,
    type: pick(`#${p}type`) || "outro",
    priority: Number(pick(`#${p}prio`) || 2),
    minutes: $(`#${p}min`, root).value,
    due: $(`#${p}due`, root).value,
    tags: $(`#${p}tags`, root).value,
    notes: $(`#${p}notes`, root).value,
  };
  const st = $(`#${p}status`, root);
  if (st) out.status = st.value;
  return out;
}

/* ---------- captura rápida ---------- */
const quickDetails = $("#quick-details");

function openQuick({ url = "", title = "" } = {}) {
  const type = url ? detectType(url) : "livro";
  const draft = { title: title || (url ? titleFromUrl(url) : ""), url, type, priority: 2, minutes: TYPES[type].minutes };
  quickDetails.innerHTML = formHTML(draft, "n-");
  quickDetails.hidden = false;
  let minTouched = false;
  const minEl = $("#n-min", quickDetails);
  minEl.addEventListener("input", () => (minTouched = true));
  wireSeg(quickDetails, "#n-type", (v) => { if (!minTouched) minEl.value = TYPES[v].minutes; });
  wireSeg(quickDetails, "#n-prio");
  const t = $("#n-title", quickDetails);
  t.focus();
  t.select();
}
function closeQuick() {
  quickDetails.hidden = true;
  quickDetails.innerHTML = "";
  $("#q-input").value = "";
}
function saveQuick() {
  const raw = readForm(quickDetails, "n-");
  const now = Date.now();
  const item = normalizeItem({ ...raw, status: "pendente", createdAt: now, updatedAt: now }, now);
  if (!item.title) { toast("Dê um título ou cole um link."); return; }
  save(item, "Guardado na fila");
  closeQuick();
}
function quickFromInput() {
  const v = $("#q-input").value.trim();
  const url = isUrl(v) ? v : extractUrl(v);
  openQuick(url ? { url, title: v === url ? "" : v.replace(url, "").trim() } : { title: v });
}

$("#quick").addEventListener("submit", (e) => {
  e.preventDefault();
  if (!quickDetails.hidden) saveQuick(); else quickFromInput();
});
$("#q-input").addEventListener("paste", () => setTimeout(() => {
  if (isUrl($("#q-input").value.trim())) quickFromInput();
}, 0));
quickDetails.addEventListener("click", (e) => {
  const act = e.target.closest("[data-act]")?.dataset.act;
  if (act === "cancel") closeQuick();
  if (act === "save") saveQuick();
});

/* ---------- edição ---------- */
function openEdit(id) {
  const it = state.items.find((i) => i.id === id);
  if (!it) return;
  const root = $("#overlay-root");
  root.innerHTML = `<div class="overlay" id="ov"><div class="sheet" role="dialog" aria-modal="true" aria-label="Editar item"><h2>Editar</h2>${formHTML(it, "e-")}</div></div>`;
  wireSeg(root, "#e-type");
  wireSeg(root, "#e-prio");
  $("#e-title", root).focus();
  const onKey = (e) => { if (e.key === "Escape") close(); };
  const close = () => { root.innerHTML = ""; document.removeEventListener("keydown", onKey); };
  document.addEventListener("keydown", onKey);
  $("#ov", root).addEventListener("click", (e) => {
    if (e.target.id === "ov") return close();
    const act = e.target.closest("[data-act]")?.dataset.act;
    if (act === "cancel") close();
    if (act === "save") {
      const now = Date.now();
      const next = normalizeItem({ ...it, ...readForm(root, "e-"), id: it.id, createdAt: it.createdAt, updatedAt: now }, now);
      if (!next.title) { toast("O título não pode ficar vazio."); return; }
      if (next.status === "concluido" && it.status !== "concluido") next.doneAt = now;
      if (next.status !== "concluido") next.doneAt = null;
      save(next, "Alterações salvas");
      close();
    }
  });
}

/* ---------- render ---------- */
function renderSummary() {
  if (!state.loaded) { $("#summary").innerHTML = "<span>Carregando sua fila…</span>"; return; }
  const s = summarize(state.items);
  $("#summary").innerHTML = `
    <span><b class="mono">${s.open}</b> na fila</span>
    <span><b class="mono">${formatMinutes(s.minutes)}</b> de conteúdo</span>
    ${s.dueNow ? `<span class="due"><b class="mono">${s.dueNow}</b> com prazo hoje ou vencido</span>` : ""}
    <span><b class="mono">${s.doneWeek}</b> ${s.doneWeek === 1 ? "concluído" : "concluídos"} na semana</span>`;
}

function renderTabs() {
  const c = { fila: 0, andamento: 0, concluido: 0, tudo: state.items.length };
  state.items.forEach((i) => {
    if (i.status !== "concluido") c.fila++;
    if (i.status === "andamento") c.andamento++;
    if (i.status === "concluido") c.concluido++;
  });
  const tabs = [["fila", "Na fila"], ["andamento", "Em andamento"], ["concluido", "Concluídos"], ["tudo", "Tudo"]];
  $("#tabs").innerHTML = tabs.map(([k, l]) =>
    `<button role="tab" data-tab="${k}" aria-selected="${state.tab === k}">${l}<span class="n">${c[k]}</span></button>`).join("");
}

function renderFilters() {
  $("#typefilters").innerHTML = Object.entries(TYPES).map(([k, v]) => {
    const n = state.items.filter((i) => i.type === k && inTab(i, state.tab)).length;
    if (!n && state.type !== k) return "";
    return `<button class="chip" data-type="${k}" aria-pressed="${state.type === k}"><span class="dot" style="--c:var(${TYPE_STYLE[k].c})"></span>${v.label} <span class="mono">${n}</span></button>`;
  }).join("");

  const count = {};
  state.items.filter((i) => inTab(i, state.tab)).forEach((i) => (i.tags || []).forEach((t) => (count[t] = (count[t] || 0) + 1)));
  state.tags.forEach((t) => { if (!(t in count)) count[t] = 0; });
  const tags = Object.entries(count).sort((a, b) => b[1] - a[1]).slice(0, 20);
  $("#tagfilters").innerHTML = tags.map(([t, n]) =>
    `<button class="chip" data-tag="${esc(t)}" aria-pressed="${state.tags.has(t)}">#${esc(t)} <span class="mono">${n}</span></button>`).join("");
  $("#tagfilters").hidden = !tags.length;
}

function cardHTML(it) {
  const T = TYPES[it.type] || TYPES.outro;
  const S = TYPE_STYLE[it.type] || TYPE_STYLE.outro;
  const P = PRIORITIES[it.priority || 2];
  const done = it.status === "concluido";
  const dl = done ? null : dueLabel(it.due);
  const title = it.url
    ? `<a class="title" href="${esc(it.url)}" target="_blank" rel="noopener">${esc(it.title)}</a>`
    : `<span class="title">${esc(it.title)}</span>`;
  const next = it.status === "pendente" ? ["andamento", "Comecei"]
    : it.status === "andamento" ? ["concluido", "Concluí"]
    : ["pendente", "Voltar pra fila"];
  const confirming = state.confirmId === it.id;
  return `<article class="card ${done ? "done" : ""}" style="--c:var(${S.c})">
    <div class="typemark" title="${T.label}">${S.icon}</div>
    <div class="top">${title}</div>
    <div class="meta">
      <span>${T.label}</span>
      ${it.url ? `<span class="domain">${esc(domain(it.url))}</span>` : ""}
      ${it.minutes ? `<span class="mono">~${formatMinutes(it.minutes)}</span>` : ""}
      ${done ? "" : `<span class="pill ${P.cls}">${P.label}</span>`}
      ${it.status === "andamento" ? `<span class="pill s-doing">Em andamento</span>` : ""}
      ${dl ? `<span class="${dl.cls}">${dl.text}</span>` : ""}
      ${done && it.doneAt ? `<span>Concluído em ${new Date(it.doneAt).toLocaleDateString("pt-BR")}</span>` : ""}
    </div>
    <div>
      ${(it.tags || []).length ? `<div class="tags">${it.tags.map((t) => `<span class="tag">#${esc(t)}</span>`).join("")}</div>` : ""}
      ${it.notes ? `<p class="notes">${esc(it.notes)}</p>` : ""}
    </div>
    <div class="row-actions">
      <button class="btn ${it.status === "andamento" ? "primary" : ""}" data-act="status" data-id="${esc(it.id)}" data-to="${next[0]}">${next[1]}</button>
      ${it.status === "pendente" ? `<button class="btn ghost" data-act="status" data-id="${esc(it.id)}" data-to="concluido">Marcar como concluído</button>` : ""}
      <button class="btn ghost" data-act="edit" data-id="${esc(it.id)}">Editar</button>
      ${confirming
        ? `<span class="confirm">Excluir de vez? <button class="btn danger" data-act="del-yes" data-id="${esc(it.id)}">Excluir</button><button class="btn ghost" data-act="del-no">Manter</button></span>`
        : `<button class="btn ghost" data-act="del" data-id="${esc(it.id)}">Excluir</button>`}
    </div>
  </article>`;
}

function render() {
  renderSummary();
  renderTabs();
  renderFilters();
  const el = $("#list");
  if (!state.loaded) {
    el.innerHTML = `<div class="empty"><h2>Abrindo sua fila</h2>Artigos, vídeos e capítulos que você guardou aparecem aqui.</div>`;
    return;
  }
  if (!state.items.length) {
    el.innerHTML = `<div class="empty"><h2>Sua fila está vazia</h2>Cole um link do Medium, do YouTube ou de onde for no campo acima, ou escreva algo como “Capítulo 3 de Sapiens”.</div>`;
    return;
  }
  const list = sortItems(filterItems(state.items, state), state.sort, state.tab);
  if (!list.length) {
    const msg = state.time ? `Nada na fila cabe em ${formatMinutes(state.time)}. Tente um tempo maior.`
      : state.tab === "concluido" ? "Nada concluído ainda com esses filtros."
      : "Nenhum item com esses filtros.";
    el.innerHTML = `<div class="empty"><h2>Nada por aqui</h2>${msg}</div>`;
    return;
  }
  el.innerHTML = list.map(cardHTML).join("");
}

/* ---------- eventos da lista e filtros ---------- */
$("#tabs").addEventListener("click", (e) => {
  const b = e.target.closest("[data-tab]");
  if (!b) return;
  state.tab = b.dataset.tab;
  render();
});
$("#typefilters").addEventListener("click", (e) => {
  const b = e.target.closest("[data-type]");
  if (!b) return;
  state.type = state.type === b.dataset.type ? "" : b.dataset.type;
  render();
});
$("#tagfilters").addEventListener("click", (e) => {
  const b = e.target.closest("[data-tag]");
  if (!b) return;
  const t = b.dataset.tag;
  state.tags.has(t) ? state.tags.delete(t) : state.tags.add(t);
  render();
});
let searchTimer;
$("#search").addEventListener("input", (e) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { state.q = e.target.value.trim(); render(); }, 120);
});
$("#time").addEventListener("change", (e) => {
  state.time = Number(e.target.value);
  if (state.time && state.tab === "concluido") state.tab = "fila";
  render();
});
$("#sort").addEventListener("change", (e) => { state.sort = e.target.value; render(); });

$("#list").addEventListener("click", (e) => {
  const b = e.target.closest("[data-act]");
  if (!b) return;
  const { id, act } = b.dataset;
  if (act === "status") {
    const it = state.items.find((i) => i.id === id);
    if (!it) return;
    const to = b.dataset.to;
    const now = Date.now();
    save({ ...it, status: to, updatedAt: now, doneAt: to === "concluido" ? now : null },
      to === "concluido" ? "Concluído. Um a menos!" : to === "andamento" ? "Marcado como em andamento" : "De volta à fila");
  }
  if (act === "edit") openEdit(id);
  if (act === "del") { state.confirmId = id; render(); }
  if (act === "del-no") { state.confirmId = null; render(); }
  if (act === "del-yes") { state.confirmId = null; remove(id); }
});

/* ---------- exportar / importar ---------- */
$("#export").addEventListener("click", () => {
  const data = JSON.stringify(buildExport(state.items), null, 2);
  const blob = new Blob([data], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `pra-depois-${toDateStr(new Date())}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast(`${state.items.length} itens exportados`);
});

$("#import-file").addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  e.target.value = "";
  if (!file) return;
  try {
    const incoming = parseImport(await file.text());
    const { items, added, updated } = mergeItems(state.items.map((i) => ({ ...i })), incoming);
    await store.putMany(items);
    notifyChange();
    await reload();
    toast(`Importação concluída: ${added} novos, ${updated} atualizados`);
  } catch (err) {
    toast(err.message || "Não consegui importar esse arquivo.");
  }
});

/* ---------- instalação (PWA) ---------- */
let installEvent = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  installEvent = e;
  $("#install").hidden = false;
});
$("#install").addEventListener("click", async () => {
  if (!installEvent) return;
  installEvent.prompt();
  await installEvent.userChoice.catch(() => {});
  installEvent = null;
  $("#install").hidden = true;
});
window.addEventListener("appinstalled", () => { $("#install").hidden = true; toast("Pra Depois instalado"); });

/* ---------- link compartilhado (Android: Compartilhar → Pra Depois) ---------- */
function handleShareTarget() {
  const p = new URLSearchParams(location.search);
  if (!p.has("share")) return;
  const text = p.get("text") || "";
  const url = (isUrl(p.get("url")) && p.get("url")) || extractUrl(text);
  const title = (p.get("title") || text.replace(url, "")).trim();
  history.replaceState(null, "", location.pathname);
  if (url || title) openQuick({ url, title });
}

/* ---------- inicialização ---------- */
async function boot() {
  render();
  store = await openStore();
  if (!store.persistent) {
    const n = $("#notice");
    n.hidden = false;
    n.textContent = "Este navegador não permite salvar dados aqui (talvez esteja em janela anônima). O que você adicionar some ao fechar a página.";
  }
  await reload();
  requestPersistence();
  onExternalChange(() => reload());
  handleShareTarget();

  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register("sw.js").catch((err) => console.warn("[Pra Depois] service worker:", err));
  }
}
boot();
