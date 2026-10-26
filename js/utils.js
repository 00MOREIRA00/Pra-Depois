// Funções puras: sem DOM, sem armazenamento. Testadas em tests/utils.test.js.

export const TYPES = {
  artigo:  { label: "Artigo",           minutes: 10 },
  video:   { label: "Vídeo",            minutes: 15 },
  livro:   { label: "Livro / capítulo", minutes: 30 },
  podcast: { label: "Podcast",          minutes: 40 },
  outro:   { label: "Outro",            minutes: 15 },
};

export const PRIORITIES = {
  3: { label: "Alta",  cls: "p-alta" },
  2: { label: "Média", cls: "p-media" },
  1: { label: "Baixa", cls: "p-baixa" },
};

export const STATUS = {
  pendente: "Na fila",
  andamento: "Em andamento",
  concluido: "Concluído",
};

export function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

export function isUrl(s) {
  try {
    const u = new URL(String(s).trim());
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export function domain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** Primeiro link http(s) encontrado num texto (útil para o "compartilhar" do Android). */
export function extractUrl(text) {
  const m = String(text ?? "").match(/https?:\/\/[^\s<>"']+/i);
  return m ? m[0].replace(/[).,;!?]+$/, "") : "";
}

export function detectType(url) {
  const d = domain(url);
  if (!d) return "outro";
  if (/(^|\.)(youtube\.com|youtu\.be|vimeo\.com|twitch\.tv|tiktok\.com|ted\.com)$/.test(d)) return "video";
  if (/(^|\.)(spotify\.com|podcasts\.apple\.com|anchor\.fm|overcast\.fm|pocketcasts\.com|deezer\.com)$/.test(d)) return "podcast";
  if (/(goodreads\.com|books\.google\.|amazon\.|kindle|oreilly\.com|skoob\.com\.br|scribd\.com)/.test(d)) return "livro";
  return "artigo";
}

export function titleFromUrl(url) {
  let u;
  try { u = new URL(url); } catch { return String(url ?? ""); }
  const d = domain(url);
  if (/(youtube\.com|youtu\.be)$/.test(d)) return "Vídeo do YouTube";
  const segs = u.pathname.split("/").filter(Boolean);
  let slug = segs[segs.length - 1] || "";
  try { slug = decodeURIComponent(slug); } catch { /* mantém como veio */ }
  slug = slug
    .replace(/\.(html?|php|aspx?)$/i, "")
    .replace(/-[0-9a-f]{8,14}$/i, ""); // id do Medium no fim do slug
  if (!slug || slug.length < 4 || /^\d+$/.test(slug)) return d;
  const t = slug.replace(/[-_+]+/g, " ").replace(/\s+/g, " ").trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function toDateStr(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** Dias entre hoje (local) e a data YYYY-MM-DD. Negativo = já passou. */
export function daysUntil(due, now = new Date()) {
  if (!due || !/^\d{4}-\d{2}-\d{2}$/.test(due)) return null;
  const [y, m, d] = due.split("-").map(Number);
  const a = Date.UTC(y, m - 1, d);
  const b = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((a - b) / 864e5);
}

export function dueLabel(due, now = new Date()) {
  const n = daysUntil(due, now);
  if (n === null) return null;
  if (n < -1) return { text: `Venceu há ${-n} dias`, cls: "d-late" };
  if (n === -1) return { text: "Venceu ontem", cls: "d-late" };
  if (n === 0) return { text: "Prazo hoje", cls: "d-soon" };
  if (n === 1) return { text: "Prazo amanhã", cls: "d-soon" };
  if (n <= 7) return { text: `Prazo em ${n} dias`, cls: "" };
  const [, m, d] = due.split("-");
  return { text: `Prazo ${d}/${m}`, cls: "" };
}

export function formatMinutes(min) {
  const m = Math.round(Number(min) || 0);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

export function parseTags(s) {
  const tags = String(s ?? "")
    .split(",")
    .map((t) => t.trim().toLowerCase().replace(/^#/, ""))
    .filter(Boolean);
  return [...new Set(tags)].slice(0, 12);
}

export function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/** Normaliza um item vindo de formulário ou de um JSON importado. */
export function normalizeItem(raw, now = Date.now()) {
  const r = raw && typeof raw === "object" ? raw : {};
  const url = isUrl(r.url) ? String(r.url).trim() : "";
  const type = TYPES[r.type] ? r.type : (url ? detectType(url) : "outro");
  const title = String(r.title ?? "").trim() || (url ? titleFromUrl(url) : "");
  const minutes = Number(r.minutes);
  return {
    id: typeof r.id === "string" && r.id ? r.id : newId(),
    title,
    url,
    type,
    status: STATUS[r.status] ? r.status : "pendente",
    priority: [1, 2, 3].includes(Number(r.priority)) ? Number(r.priority) : 2,
    minutes: Number.isFinite(minutes) && minutes > 0 ? Math.min(2000, Math.round(minutes)) : null,
    due: typeof r.due === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.due) ? r.due : "",
    tags: Array.isArray(r.tags) ? parseTags(r.tags.join(",")) : parseTags(r.tags),
    notes: String(r.notes ?? "").trim(),
    createdAt: Number(r.createdAt) || now,
    updatedAt: Number(r.updatedAt) || now,
    doneAt: Number(r.doneAt) || null,
  };
}

/* ---------- filtro e ordenação ---------- */

export function inTab(item, tab) {
  if (tab === "fila") return item.status !== "concluido";
  if (tab === "andamento") return item.status === "andamento";
  if (tab === "concluido") return item.status === "concluido";
  return true;
}

export function filterItems(items, f = {}, now = new Date()) {
  const q = String(f.q ?? "").toLowerCase().trim();
  const tags = f.tags ? [...f.tags] : [];
  return items.filter((it) => {
    if (!inTab(it, f.tab ?? "fila")) return false;
    if (f.type && it.type !== f.type) return false;
    if (tags.some((t) => !(it.tags || []).includes(t))) return false;
    if (f.time && (it.status === "concluido" || !it.minutes || it.minutes > f.time)) return false;
    if (q) {
      const hay = `${it.title} ${it.notes || ""} ${(it.tags || []).join(" ")} ${domain(it.url || "")}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function sortItems(items, sort = "smart", tab = "fila", now = new Date()) {
  const dueKey = (it) => (it.due ? daysUntil(it.due, now) : 9999);
  const list = [...items];
  if (tab === "concluido" && sort === "smart") {
    return list.sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
  }
  const cmp = {
    // Em andamento primeiro; depois o que vence até depois de amanhã; depois prioridade e prazo.
    smart: (a, b) =>
      (b.status === "andamento") - (a.status === "andamento") ||
      Math.min(dueKey(a), 2) - Math.min(dueKey(b), 2) ||
      (b.priority || 2) - (a.priority || 2) ||
      dueKey(a) - dueKey(b) ||
      (a.createdAt || 0) - (b.createdAt || 0),
    due: (a, b) => dueKey(a) - dueKey(b) || (b.priority || 2) - (a.priority || 2),
    new: (a, b) => (b.createdAt || 0) - (a.createdAt || 0),
    short: (a, b) => (a.minutes || 9999) - (b.minutes || 9999),
  }[sort] || (() => 0);
  return list.sort(cmp);
}

export function summarize(items, now = new Date()) {
  const open = items.filter((i) => i.status !== "concluido");
  const minutes = open.reduce((s, i) => s + (i.minutes || 0), 0);
  const dueNow = open.filter((i) => i.due && daysUntil(i.due, now) <= 0).length;
  const doneWeek = items.filter(
    (i) => i.status === "concluido" && i.doneAt && now.getTime() - i.doneAt < 7 * 864e5,
  ).length;
  return { open: open.length, minutes, dueNow, doneWeek };
}

/* ---------- exportar / importar ---------- */

export const EXPORT_FORMAT = "pra-depois";
export const EXPORT_VERSION = 1;

export function buildExport(items, now = new Date()) {
  return { format: EXPORT_FORMAT, version: EXPORT_VERSION, exportedAt: now.toISOString(), items };
}

/** Aceita o formato exportado ou um array simples de itens. Lança erro com mensagem em português. */
export function parseImport(text) {
  let data;
  try { data = JSON.parse(text); } catch { throw new Error("O arquivo não é um JSON válido."); }
  const list = Array.isArray(data) ? data : data && Array.isArray(data.items) ? data.items : null;
  if (!list) throw new Error("Não encontrei uma lista de itens nesse arquivo.");
  const items = list.map((r) => normalizeItem(r)).filter((i) => i.title);
  if (!items.length) throw new Error("O arquivo não tem itens com título.");
  return items;
}

/** Junta itens importados aos atuais: mesmo id ou mesmo link = atualiza pelo mais recente. */
export function mergeItems(current, incoming) {
  const byId = new Map(current.map((i) => [i.id, i]));
  const byUrl = new Map(current.filter((i) => i.url).map((i) => [i.url, i]));
  let added = 0, updated = 0;
  for (const inc of incoming) {
    const existing = byId.get(inc.id) || (inc.url && byUrl.get(inc.url));
    if (existing) {
      if ((inc.updatedAt || 0) > (existing.updatedAt || 0)) {
        Object.assign(existing, { ...inc, id: existing.id });
        updated++;
      }
    } else {
      byId.set(inc.id, inc);
      if (inc.url) byUrl.set(inc.url, inc);
      added++;
    }
  }
  return { items: [...byId.values()], added, updated };
}
