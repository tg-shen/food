// meal-core.js —— 挑菜 / 份量折算 / 采购清单合并（纯逻辑，不碰 DOM、不碰 localStorage）
// 与 meal.py 的规则保持一致；浏览器与 node --test 共用。

export const ALIAS = {
  "生姜": "姜", "姜末": "姜", "姜丝": "姜", "姜片": "姜", "老姜": "姜",
  "大蒜": "蒜", "蒜头": "蒜", "蒜瓣": "蒜", "蒜末": "蒜", "蒜蓉": "蒜",
  "大葱": "葱", "小葱": "葱", "葱花": "葱", "葱段": "葱", "香葱": "葱", "葱白": "葱",
  "食用盐": "盐", "精盐": "盐", "食盐": "盐",
  "食用油": "油", "植物油": "油", "花生油": "油",
  "白糖": "糖", "白砂糖": "糖",
  "生抽酱油": "生抽", "老抽酱油": "老抽", "酱油": "生抽",
  "干辣椒": "辣椒", "辣椒段": "辣椒", "小米辣": "辣椒",
  "猪五花肉": "五花肉", "鸡蛋液": "鸡蛋", "蛋液": "鸡蛋",
  "马铃薯": "土豆", "西红柿": "番茄",
  "香芹": "芹菜", "西芹": "芹菜",
};

// 采购分组：先看叶子菜白名单（带"油/菜"字的别被调料抢走），再按关键词顺序
export const VEG_FIRST = ["油麦菜", "油菜", "菜心", "白菜", "生菜", "菠菜", "芹菜", "韭菜",
  "香菜", "紫菜", "海带", "芥菜", "芥兰", "卷心菜", "娃娃菜"];

export const GROUPS = [
  ["蛋 / 奶", ["鸡蛋", "鸭蛋", "鹌鹑蛋", "蛋清", "蛋黄", "鸡蛋清", "牛奶", "奶油", "黄油", "芝士", "酸奶", "炼乳"]],
  ["肉 / 水产", ["肉", "排骨", "五花", "猪", "鸡腿", "鸡翅", "鸡胸", "鸡爪", "鸭肉", "鸭腿",
    "牛", "羊", "培根", "火腿", "腊肠", "香肠", "鱼", "虾", "蟹", "贝", "蛤", "蛏",
    "鱿", "墨鱼", "海参", "鳝", "泥鳅", "蛙"]],
  ["豆制品", ["豆腐", "豆皮", "腐竹", "千张", "香干", "豆干", "豆泡", "腐乳", "南乳"]],
  ["主食 / 干货", ["米", "面", "粉丝", "馒头", "花卷", "饺子", "年糕", "饼", "燕麦", "挂面",
    "河粉", "意面", "米粉", "糯米", "小麦"]],
  ["调料", ["淀粉", "生粉", "生抽", "老抽", "蚝油", "料酒", "醋", "豆瓣", "甜面", "辣酱",
    "椒盐", "花椒", "胡椒", "五香", "十三香", "孜然", "咖喱", "香油", "菜籽油", "花生油",
    "食用油", "猪油", "盐", "糖", "鸡精", "味精", "啤酒", "白酒", "香叶", "八角", "桂皮",
    "芝麻", "豆豉", "芥末", "泡打粉", "小苏打", "油", "酱"]],
  ["蔬菜 / 菌菇", ["菜", "瓜", "椒", "茄", "萝卜", "土豆", "番茄", "葱", "姜", "蒜", "菇",
    "笋", "藕", "木耳", "芹", "韭", "菠菜", "生菜", "西兰花", "花菜", "南瓜", "冬瓜",
    "丝瓜", "玉米", "豆芽", "豌豆", "毛豆", "豆角", "豇豆", "四季豆", "扁豆", "芥兰",
    "芥菜", "柠檬", "葫芦"]],
];

// 类别 -> 候选池
export const CATS = {
  meat: ["meat_dish", "aquatic"],
  veg: ["vegetable_dish"],
  soup: ["soup"],
  staple: ["staple"],
};

const WATER = /^(水|开水|饮用水|清水|热水|凉水|冰水|冰块|温水|沸水|凉白开)$/;

export function canonical(name) {
  const n = (name || "").trim();
  return ALIAS[n] || n;
}

export function groupOf(name) {
  if (VEG_FIRST.some((w) => name.includes(w))) return "蔬菜 / 菌菇";
  for (const [g, keys] of GROUPS) {
    if (keys.some((k) => name.includes(k))) return g;
  }
  return "其他";
}

export function factorOf(dish, servings, ppf) {
  const base = dish && dish.base ? dish.base : (ppf || 2);
  return Math.min(2, Math.max(0.5, servings / base));
}

export function fmtMass(v) {
  if (v >= 1000) return `${+(v / 1000).toFixed(2)} kg`;
  if (v >= 100) return `${Math.round(v / 10) * 10} g`;
  if (v >= 10) return `${Math.round(v)} g`;
  if (v >= 1) return `${+v.toFixed(1)} g`;
  return "少许";
}

export function fmtVol(v) {
  if (v >= 1000) return `${+(v / 1000).toFixed(2)} L`;
  if (v >= 100) return `${Math.round(v / 5) * 5} ml`;
  if (v >= 10) return `${Math.round(v)} ml`;
  if (v >= 1) return `${+v.toFixed(1)} ml`;
  return "少许";
}

export function fmtAmt(ing, factor) {
  if (!ing || !ing.k) return (ing && ing.raw) || "";
  const v = ing.v * factor;
  if (ing.k === "mass") return ing.u === "g" ? fmtMass(v) : fmtVol(v);
  return `${Math.max(1, Math.ceil(v - 1e-9))} ${ing.u}`;
}

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 挑今天的菜。
 * opts = {servings, ppf, meat, veg, soup, staple, avoid:[], recentDays, history:{date:[name]}, today}
 * 返回 [{name, cat, diff, min, kcal, base, range, need, ings}]，可能少于请求数（池子被筛空时）。
 */
export function pick(dishes, opts, seed) {
  const o = opts || {};
  const rnd = mulberry32((seed || 0) >>> 0);
  const recent = new Set();
  const today = o.today || "";
  for (const [date, names] of Object.entries(o.history || {})) {
    if (!today || date === today) continue;           // 换一批：当天历史不参与过滤
    const days = (Date.parse(today) - Date.parse(date)) / 86400000;
    if (days >= 0 && days <= (o.recentDays || 0)) (names || []).forEach((n) => recent.add(n));
  }
  const avoid = o.avoid || [];
  const ok = (d) => {
    const hay = d.name + d.ings.map((i) => i.n).join(" ");
    return !avoid.some((b) => b && hay.includes(b)) && !recent.has(d.name);
  };
  const pools = {};
  for (const [key, cats] of Object.entries(CATS)) {
    pools[key] = (dishes || []).filter((d) => cats.includes(d.cat) && ok(d));
  }
  const out = [];
  const seen = new Set();
  const want = [["meat", o.meat], ["veg", o.veg], ["soup", o.soup], ["staple", o.staple]];
  for (const [key, n] of want) {
    for (let i = 0; i < (n || 0); i++) {
      const cand = (pools[key] || []).filter((d) => !seen.has(d.name));
      if (!cand.length) break;
      const d = cand[Math.floor(rnd() * cand.length)];
      seen.add(d.name);
      out.push(d);
    }
  }
  return out;
}

/**
 * 合并采购清单。chosen = [dish]；opts = {servings, ppf, includeOptional}
 * 返回 [{group, items:[{name, text}]}]，空组会被丢掉。
 */
export function buildShopping(chosen, opts) {
  const o = opts || {};
  const shop = new Map();
  for (const d of chosen || []) {
    const f = factorOf(d, o.servings, o.ppf);
    for (const ing of d.ings || []) {
      if (ing.opt && !o.includeOptional) continue;
      const name = canonical(ing.n);
      if (!name || WATER.test(name)) continue;
      const group = groupOf(name);
      const key = `${group}|${name}`;
      let slot = shop.get(key);
      if (!slot) {
        slot = { group, name, g: 0, ml: 0, counts: {}, raw: new Set() };
        shop.set(key, slot);
      }
      if (ing.k === "mass") slot[ing.u === "g" ? "g" : "ml"] += ing.v * f;
      else if (ing.k === "count") slot.counts[ing.u] = (slot.counts[ing.u] || 0) + ing.v * f;
      else slot.raw.add(ing.raw || "适量");
    }
  }
  const order = [...GROUPS.map((g) => g[0]), "其他"];
  return order
    .map((group) => {
      const items = [...shop.values()]
        .filter((s) => s.group === group)
        .sort((a, b) => a.name.localeCompare(b.name, "zh"))
        .map((s) => {
          const parts = [];
          if (s.g > 0) parts.push(fmtMass(s.g));
          if (s.ml > 0) parts.push(fmtVol(s.ml));
          for (const [u, n] of Object.entries(s.counts)) {
            parts.push(`${Math.max(1, Math.ceil(n - 1e-9))} ${u}`);
          }
          if (!parts.length) parts.push([...s.raw][0] || "适量");
          return { name: s.name, text: parts.join(" + ") };
        });
      return items.length ? { group, items } : null;
    })
    .filter(Boolean);
}
