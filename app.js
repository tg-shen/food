// app.js —— 渲染与交互；挑菜/折算/清单逻辑全在 meal-core.js
import { pick, factorOf, fmtAmt, buildShopping } from "./meal-core.js";

const KEY = {
  settings: "meal.settings",
  history: "meal.history",
  expanded: "meal.expanded",
  checked: (day) => `meal.checked.${day}`,
};

const DEFAULTS = {
  servings: 2, ppf: 2, meat: 1, veg: 1, soup: 0, avoid: ["香菜", "苦瓜"], recentDays: 10,
};

const CAT_LABEL = {
  meat_dish: "荤菜", aquatic: "水产", vegetable_dish: "素菜", soup: "汤",
  staple: "主食", breakfast: "早餐",
};

const today = () => new Date().toLocaleDateString("sv");        // 2026-11-17
const seedOf = (day) => Number(day.replaceAll("-", "")) || 1;

// localStorage 不可用（无痕/配额满）时全部降级为内存值，页面照常能用
const mem = new Map();
const store = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch {
      return mem.has(key) ? mem.get(key) : fallback;
    }
  },
  set(key, value) {
    mem.set(key, value);
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* 忽略 */ }
  },
};

const $ = (sel) => document.querySelector(sel);

function el(tag, props = {}, ...kids) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else if (k === "html") node.innerHTML = v;
    else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? "" : String(v));
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    node.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return node;
}

function setStatus(msg, kind = "warn") {
  const box = $("#status");
  box.hidden = !msg;
  box.textContent = msg || "";
  box.className = kind;
}

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { t.hidden = true; }, 2200);
}

// ---------------------------------------------------------------- 挑菜
let state = { dishes: [], settings: DEFAULTS, chosen: [], day: today(), shopping: [] };

function loadSettings() {
  const s = store.get(KEY.settings, {});
  return { ...DEFAULTS, ...s, avoid: Array.isArray(s.avoid) ? s.avoid : DEFAULTS.avoid };
}

function chooseDay(forceNew) {
  const day = state.day;
  const history = store.get(KEY.history, {});
  const s = state.settings;
  const opts = {
    servings: s.servings, ppf: s.ppf || 2, meat: s.meat, veg: s.veg, soup: s.soup, staple: 0,
    avoid: s.avoid, recentDays: s.recentDays, history, today: day,
  };

  if (!forceNew && Array.isArray(history[day]) && history[day].length) {
    const byName = new Map(state.dishes.map((d) => [d.name, d]));
    const reuse = history[day].map((n) => byName.get(n)).filter(Boolean);
    if (reuse.length) return reuse;
  }

  let chosen = pick(state.dishes, opts, forceNew ? Date.now() : seedOf(day));
  // "换一批"尽量不要跟当前这组一样
  if (forceNew && state.chosen.length) {
    const before = state.chosen.map((d) => d.name).join("|");
    for (let i = 0; i < 5 && chosen.map((d) => d.name).join("|") === before; i++) {
      chosen = pick(state.dishes, opts, Date.now() + i * 7919);
    }
  }
  history[day] = chosen.map((d) => d.name);
  store.set(KEY.history, history);
  return chosen;
}

// ---------------------------------------------------------------- 渲染
function renderHeader() {
  const d = new Date();
  const week = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][d.getDay()];
  $("#head-date").textContent = `${d.getMonth() + 1}月${d.getDate()}日 ${week}`;
  const s = state.settings;
  const parts = [`${s.servings} 人份`, `${s.meat} 荤 ${s.veg} 素${s.soup ? ` ${s.soup} 汤` : ""}`];
  if (s.avoid.length) parts.push(`忌口：${s.avoid.join("、")}`);
  else parts.push("无忌口");
  $("#head-sub").textContent = parts.join(" · ");
}

function renderCards() {
  const box = $("#cards");
  box.replaceChildren();
  const expanded = new Set(store.get(KEY.expanded, []));
  const f = (d) => factorOf(d, state.settings.servings, state.settings.ppf || 2);

  state.chosen.forEach((d, i) => {
    const meta = [CAT_LABEL[d.cat] || d.cat, d.diff, d.min ? `约 ${d.min} 分钟` : "", d.kcal ? `${Math.round(d.kcal)} 大卡/份` : ""]
      .filter(Boolean).join(" · ");
    const basis = d.base
      ? `原方 1 份 ≈ ${d.range && d.range[1] !== d.range[0] ? `${d.range[0]}~${d.range[1]}` : d.base} 人，按 ${state.settings.servings} 人折算 ×${f(d).toFixed(2)}`
      : `原方未写人数，按 1 份 ≈ ${state.settings.ppf || 2} 人处理，本次 ×${f(d).toFixed(2)}`;

    const rows = d.ings
      .filter((ing) => !ing.opt)
      .map((ing) => el("tr", {},
        el("td", { text: ing.n }),
        el("td", { text: fmtAmt(ing, f(d)) }),
        el("td", { class: "raw", text: ing.raw })));

    const details = el("details", { open: expanded.has(d.name) },
      el("summary", { text: `用料（${rows.length}）` }),
      el("table", {},
        el("thead", {}, el("tr", {}, el("th", { text: "用料" }), el("th", { text: "本次" }), el("th", { text: "原方" }))),
        el("tbody", {}, ...rows)),
      el("p", { class: "basis", text: basis }));

    details.addEventListener("toggle", () => {
      const set = new Set(store.get(KEY.expanded, []));
      if (details.open) set.add(d.name); else set.delete(d.name);
      store.set(KEY.expanded, [...set]);
    });

    box.append(
      el("article", { class: "card" },
        el("h2", {}, el("span", { class: "idx", text: `${i + 1}` }), d.title || d.name),
        el("p", { class: "meta", text: meta }),
        rows.length ? details : el("p", { class: "hint", text: "这道菜没有可解析的用料表（看原菜谱）。" })),
    );
  });
}

function renderShopping() {
  const checked = new Set(store.get(KEY.checked(state.day), []));
  const groups = buildShopping(state.chosen, {
    servings: state.settings.servings, ppf: state.settings.ppf || 2, includeOptional: false,
  });
  state.shopping = groups;

  const box = $("#shop-body");
  box.replaceChildren();
  let total = 0;
  for (const g of groups) {
    box.append(el("h3", { text: g.group }));
    const ul = el("ul", { class: "shop" });
    for (const item of g.items) {
      total++;
      const id = `chk-${g.group}-${item.name}`;
      const box2 = el("input", { type: "checkbox", id, checked: checked.has(item.name) ? true : null });
      box2.addEventListener("change", () => {
        const set = new Set(store.get(KEY.checked(state.day), []));
        if (box2.checked) set.add(item.name); else set.delete(item.name);
        store.set(KEY.checked(state.day), [...set]);
      });
      ul.append(el("li", {},
        el("label", { for: id }, box2,
          el("span", { class: "name", text: item.name }),
          el("span", { class: "qty", text: item.text }))));
    }
    box.append(ul);
  }
  if (!total) box.append(el("p", { class: "hint", text: "这次挑的菜没有可汇总的用料。" }));
  $("#shop-hint").textContent = total
    ? `共 ${total} 项；勾选状态只存本机，隔天自动清空。`
    : "";
}

function renderAll() {
  renderHeader();
  renderCards();
  renderShopping();
  window.__mealAppReady = true;
}

// ---------------------------------------------------------------- 设置
function openSettings() {
  const s = state.settings;
  const f = $("#settings-form");
  for (const k of ["servings", "meat", "veg", "soup", "recentDays"]) f.elements[k].value = s[k];
  f.elements.avoid.value = (s.avoid || []).join(",");
  $("#dlg").showModal();
}

function bindSettings() {
  const dlg = $("#dlg");
  const form = $("#settings-form");
  dlg.addEventListener("close", () => {
    const action = dlg.returnValue;
    if (action === "save") {
      const n = (k) => Math.max(0, Number(form.elements[k].value) || 0);
      state.settings = {
        ...state.settings,
        servings: Math.min(8, Math.max(1, n("servings") || 2)),
        meat: Math.min(3, n("meat")),
        veg: Math.min(3, n("veg")),
        soup: Math.min(2, n("soup")),
        recentDays: Math.min(60, n("recentDays")),
        avoid: form.elements.avoid.value.split(/[,，\s]+/).map((x) => x.trim()).filter(Boolean),
      };
      store.set(KEY.settings, state.settings);
      reroll(false);
      toast("设置已保存");
    } else if (action === "clear") {
      store.set(KEY.history, {});
      store.set(KEY.checked(state.day), []);
      reroll(false);
      toast("历史已清空");
    }
  });
}

// ---------------------------------------------------------------- 分享
function shareText() {
  const lines = [`${state.day} 今晚吃什么（${state.settings.servings} 人份）`];
  state.chosen.forEach((d, i) => {
    lines.push(`${i + 1}. ${d.title || d.name}${d.diff ? `  ${d.diff}` : ""}${d.min ? ` · 约 ${d.min} 分钟` : ""}`);
  });
  lines.push("", "采购清单：");
  for (const g of state.shopping) {
    lines.push(`【${g.group}】`);
    for (const it of g.items) lines.push(`- ${it.name}：${it.text}`);
  }
  return lines.join("\n");
}

async function share() {
  const text = shareText();
  try {
    if (navigator.share) {
      await navigator.share({ title: "今天吃什么", text });
      return;
    }
  } catch { /* 用户取消，走兜底 */ }
  try {
    await navigator.clipboard.writeText(text);
    toast("菜单已复制，去微信里粘贴吧");
  } catch {
    window.prompt("复制这段发给家人：", text);
  }
}

// ---------------------------------------------------------------- 启动
function reroll(force) {
  state.chosen = chooseDay(force);
  const want = state.settings.meat + state.settings.veg + state.settings.soup;
  if (state.chosen.length < want) {
    setStatus(`只挑到 ${state.chosen.length}/${want} 道：忌口或"最近不重复"筛得太狠了，去设置里放宽一下。`, "warn");
  } else {
    setStatus("");
  }
  renderAll();
}

async function boot() {
  state.settings = loadSettings();
  state.day = today();

  let data;
  try {
    const res = await fetch("dishes.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();
  } catch (err) {
    $("#head-date").textContent = "加载失败";
    setStatus(`菜库没加载出来（${err.message}）。检查 dishes.json 是否在同一个目录，或用 https/本地服务打开（file:// 下浏览器会拦截 fetch）。`, "error");
    return;
  }

  state.dishes = data.dishes || [];
  bindSettings();
  $("#btn-again").addEventListener("click", () => { reroll(true); toast("换好了"); });
  $("#btn-settings").addEventListener("click", openSettings);
  $("#btn-share").addEventListener("click", share);

  reroll(false);
  // 每天换一天时，页面若一直开着也能重新挑
  setInterval(() => {
    const d = today();
    if (d !== state.day) { state.day = d; reroll(false); }
  }, 60_000);

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => { /* 离线能力不可用不影响使用 */ });
  }
}

boot();
