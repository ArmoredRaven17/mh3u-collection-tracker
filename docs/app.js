/* MH3U Collection Tracker — all app logic (IIFE, no modules). Ported from the MHGU Collection
   Tracker; the data comes from MH3U's own executable via scripts/build_data.py. */
(function () {
  "use strict";
  const $ = id => document.getElementById(id);
  const C = window.CATALOG;
  if (!C) { document.body.innerHTML = "<p style='padding:20px'>Failed to load catalog data.</p>"; return; }

  // Bump whenever docs/data/ is regenerated. The JSON files are fetched at runtime,
  // so without this a browser holding a cached copy runs new code against old data —
  // which fails silently, as wrong numbers rather than an error.
  const DATA_VERSION = "1";
  const APP_TITLE = "MH3U Collection Tracker";
  const SAVE_APP = "mh3u-collection-tracker";
  const SAVE_VERSION = 1;
  // mh3u- prefixed: this app shares an origin with the MHGU apps and must not read their keys.
  const AUTOSAVE_KEY = "mh3u-tracker-autosave";
  const LOCAL_ENABLED_KEY = "mh3u-tracker-local";   // "0" opts out of browser storage
  const SETTINGS_KEY = "mh3u-tracker-settings";
  const VIEW_KEY = "mh3u-tracker-view";
  const THEME_KEY = "mh3u-collection-tracker-theme";
  const KINDS = ["w", "a"];

  const SHARP_COLORS = ["#c0392b", "#e08a2b", "#d9cf1f", "#4caf50", "#4a90d0", "#eeeeee", "#a05ad0"];
  const SHARP_LABELS = C.labels.sharp;
  const SHARP_MAX = 450;               // the game's full bar (0x8d2f70 caps max sharpness at 0x1c2)
  const RES_NAMES = ["Fire", "Water", "Thndr", "Ice", "Drgn"];   // the status screen's order (Menu 401-405)
  const RARITY_COLORS = C.rarityColors;   // the game's Rare 1-10 name colours (0xcb986c)

  // Theme palette: identical across the MH3U apps. Same 31 hexes as the MHGU family (each one
  // clears the white-text / white-checkbox contrast line — do not add one without checking it),
  // with 3U monster names and the game's own monster icons.
  const THEMES = [
    { name: "Volvidon", hex: "#570B0B" },
    { name: "Rathalos", hex: "#b51717" },
    { name: "R. Duramboros", hex: "#783E0F", icon: "Rust Duramboros" },
    { name: "Agnaktor", hex: "#C7620E" },
    { name: "Uragaan", hex: "#74631D" },
    { name: "G. Rathian", hex: "#9C8328", icon: "Gold Rathian" },
    { name: "G. Nargacuga", hex: "#436713", icon: "Green Nargacuga" },
    { name: "G. Plesioth", hex: "#67922E", icon: "Green Plesioth" },
    { name: "Deviljho", hex: "#0B570F" },
    { name: "Rathian", hex: "#39993E" },
    { name: "S. Uragaan", hex: "#14503d", icon: "Steel Uragaan" },
    { name: "Zinogre", hex: "#279773" },
    { name: "A. Lagiacrus", hex: "#0C5D68", icon: "Abyssal Lagiacrus" },
    { name: "G. Agnaktor", hex: "#118898", icon: "Glacial Agnaktor" },
    { name: "Nargacuga", hex: "#005984" },
    { name: "Plesioth", hex: "#0080c1" },
    { name: "Brachydios", hex: "#0B2757" },
    { name: "Lagiacrus", hex: "#0b3f97" },
    { name: "Great Wroggi", hex: "#1F0B57" },
    { name: "Great Jaggi", hex: "#4e2fa2" },
    { name: "H. Jhen Mohran", hex: "#62008f", icon: "Hallowed Jhen Mohran" },
    { name: "P. Ludroth", hex: "#8e50ab", icon: "Purple Ludroth" },
    { name: "P. Rathian", hex: "#D4358C", icon: "Pink Rathian" },
    { name: "Qurupeco", hex: "#C8679D" },
    { name: "Duramboros", hex: "#5a411f" },
    { name: "Diablos", hex: "#997c54" },
    { name: "Barroth", hex: "#835A32" },
    { name: "Bullfango", hex: "#B17A47" },
    { name: "S. Rathalos", hex: "#505358", icon: "Silver Rathalos" },
    { name: "Barioth", hex: "#7C879B" },
    { name: "Forbidden", hex: "#1E2025", icon: "Question Mark" },
  ];
  // Retired hexes remap on read (a saved theme is a bare hex). Kept identical to the other apps.
  const LEGACY_HEX = {
    "#C8A319": "#74631D", "#57470B": "#74631D", "#5E4D0C": "#74631D",
    "#574916": "#74631D", "#68581A": "#74631D",
    "#F1D364": "#9C8328", "#B59417": "#9C8328", "#C39F19": "#9C8328",
    "#BEA031": "#9C8328",
    "#C65900": "#783E0F", "#FC933E": "#C7620E",
    "#68360D": "#783E0F", "#B5590D": "#C7620E",
    "#3A9B3F": "#39993E", "#2DAE85": "#279773",
    "#D84696": "#D4358C", "#CE79A8": "#C8679D",
    "#B57C45": "#835A32", "#CFAA87": "#B17A47",
    "#AEB5C1": "#7C879B",
  };
  const DEFAULT_HEX = "#1E2025";
  const migrateHex = (h) => (h && LEGACY_HEX[h.toUpperCase()]) || h;
  const themeByHex = hex => THEMES.find(t => t.hex.toUpperCase() === String(hex).toUpperCase());
  const FALLBACK_ICON = "assets/MonsterIcons/MH3U-Question_Mark_Icon.png";
  const monsterIcon = name => name ? "assets/MonsterIcons/MH3U-" + name.replace(/ /g, "_") + "_Icon.png" : FALLBACK_ICON;

  // ── Category model ─────────────────────────────────────────────────────
  // Each category: {kind:'w'|'a', key, label, iconSlug, entries, statsFile}
  //   weapon entry: [id, name, rarity, parentId, treeOrder, elementMask, [attack, affinity, defense, slots], classPayload]
  //   armor entry:  [id, name, rarity, levels, gender (0 m, 1 f, 2 both), class ('B' | 'G' | 'A')]
  const CATS = [];
  for (const [slug, o] of Object.entries(C.weapons))
    CATS.push({ kind: "w", key: slug, label: o.label, iconSlug: o.icon, entries: o.entries, statsFile: `${slug}.json` });
  for (const [slot, o] of Object.entries(C.armor))
    CATS.push({ kind: "a", key: slot, label: o.label, iconSlug: o.icon, entries: o.entries, statsFile: `armor_${slot}.json` });

  const catId = c => `${c.kind}:${c.key}`;
  const catByIdMap = new Map(CATS.map(c => [catId(c), c]));
  const validIds = new Map();   // "kind:key" -> Set(ids)
  for (const c of CATS) validIds.set(catId(c), new Set(c.entries.map(e => e[0])));
  // "kind:key" -> Map(id -> maxLevel). 3U weapons have no upgrade levels — every upgrade is its
  // own weapon — so only armor carries them (the level count from the game's armor info table).
  const maxLevels = new Map();
  for (const c of CATS) {
    const m = new Map();
    if (c.kind === "a") for (const e of c.entries) if (e[3] > 1) m.set(e[0], e[3]);
    maxLevels.set(catId(c), m);
  }
  const maxLevelOf = (c, id) => maxLevels.get(catId(c)).get(id) || 0;
  const isMaxLevel = (level, max) => level > 0 && max > 0 && level >= max;
  const entryOf = (c, id) => c.entries.find(e => e[0] === id);

  // ── State ──────────────────────────────────────────────────────────────
  const owned = new Map();      // "kind:key" -> Map(id -> level); level 0 = owned, no level chosen
  for (const c of CATS) owned.set(catId(c), new Map());
  const unknownOwned = { w: {}, a: {} };   // preserved unknown ids, re-exported verbatim
  const unknownLevels = { w: {}, a: {} };  // preserved levels for unknown ids
  // Top-level keys in a loaded file that this app doesn't own; carried through a save untouched.
  const OWN_KEYS = new Set(["app", "version", "savedAt", "settings", "owned", "levels", "checklist"]);
  // Checklist: pieces the user intends to build, and how much of each material they already
  // hold. `targets` mirrors `owned`'s shape; the value is the level to build to (0 = max).
  // `haveMats` is keyed by material NAME, never index — indices are per-file and a data
  // rebuild may reshuffle them.
  const targets = new Map();
  for (const c of CATS) targets.set(catId(c), new Map());
  const unknownTargets = { w: {}, a: {} };
  const haveMats = new Map();   // material name -> count held
  let carriedKeys = {};
  let dirty = false;
  let fileHandle = null;
  let current = CATS[0];
  let selectedId = null;
  let sharpBand = 0;            // 0 = base, 1 = Sharpness+1
  let openMaterials = null;     // resolved materials data for the currently-open item
  let localSaveEnabled = true;  // keep the collection in this browser (opt-out)
  try { localSaveEnabled = localStorage.getItem(LOCAL_ENABLED_KEY) !== "0"; } catch (e) {}
  // Every switch in the Settings dialog. Persisted to localStorage and written into the save
  // file so it travels with a collection. localSaveEnabled is deliberately NOT here — "save in
  // this browser" is a property of this device, not of the collection.
  const SETTING_KEYS = ["clickLevel", "ctrlRemove", "altMax", "shiftTarget", "spendMats", "armorGender"];
  // armorGender ("all" | "m" | "f") is which hunter the collection is for. It belongs with the
  // save rather than the browser: it is a fact about the character being tracked, and someone
  // keeping two saves wants it to arrive with the file.
  const settings = { clickLevel: true, ctrlRemove: true, altMax: true, shiftTarget: true, spendMats: true,
                     armorGender: "all" };
  const GENDERS = ["all", "m", "f"];
  const SETTING_DEFAULTS = { ...settings };   // types a loaded file is checked against
  const toggleSyncs = [];   // re-sync every switch after a save is loaded
  try { Object.assign(settings, JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}")); } catch (e) {}
  if (!GENDERS.includes(settings.armorGender)) settings.armorGender = "all";
  const saveSettings = () => { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) {} };
  let viewMode = "grid";
  try { viewMode = localStorage.getItem(VIEW_KEY) || "grid"; } catch (e) {}

  // Bit order matches build_data.py: element codes 1-5 then status codes 1-4.
  const ELEMENTS = C.labels.elements;
  const filters = { text: "", searchAll: false, owned: "all", sort: "rarity", armorClass: "all", element: "all",
    aff: "all", slots: "all", def: "all", cls: {}, rarity: new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 0]) };
  const armorClassName = { B: "Blademaster", G: "Gunner", A: "Both" };
  // A few armor pieces are one gender's only (entry[4]: 0 male only, 1 female only, 2 either —
  // from the record's wearer bits, 0x5dcb8c): 22 male-only and 28 female-only per slot, the
  // Guild Bard / Scholar's style sets. Picking a gender takes the other's pieces out of the lists
  // AND out of the counts: a category that could never reach 100% would make its completion tier
  // — and the icon colour that tier drives — mean nothing.
  const genderIds = new Map();   // "a:slot" -> { m: Set(male-only ids), f: Set(female-only ids) }
  for (const c of CATS) {
    if (c.kind !== "a") continue;
    const m = new Set(), f = new Set();
    for (const e of c.entries) { if (e[4] === 0) m.add(e[0]); else if (e[4] === 1) f.add(e[0]); }
    genderIds.set(catId(c), { m, f });
  }
  // The ids the current choice hides: tracking a male hunter drops the female-only gear.
  function hiddenGenderIds(c) {
    if (c.kind !== "a" || settings.armorGender === "all") return null;
    const g = genderIds.get(catId(c));
    return settings.armorGender === "m" ? g.f : g.m;
  }
  const outOfScope = (c, id) => { const hidden = hiddenGenderIds(c); return !!hidden && hidden.has(id); };
  const statsCache = new Map();
  const materialsCache = new Map();

  // ── Helpers ────────────────────────────────────────────────────────────
  const escapeHtml = s => String(s).replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  const iconPath = (slug, r) => `assets/icons/icon_${slug}${r >= 1 && r <= 10 ? "_r" + r : ""}.png`;
  const fmtNum = n => n.toLocaleString("en-US");
  const slotsText = n => "◯".repeat(n) + "―".repeat(Math.max(0, 3 - n));

  function toast(msg, ms = 2600) {
    const t = $("toast"); t.textContent = msg; t.classList.remove("hidden");
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.add("hidden"), ms);
  }

  async function loadStats(file) {
    if (statsCache.has(file)) return statsCache.get(file);
    const p = fetch(`data/stats/${file}?v=${DATA_VERSION}`).then(r => r.ok ? r.json() : Promise.reject(r.status));
    statsCache.set(file, p);
    try { return await p; } catch (e) { statsCache.delete(file); throw e; }
  }
  async function loadMaterials(file) {
    if (materialsCache.has(file)) return materialsCache.get(file);
    const p = fetch(`data/materials/${file}?v=${DATA_VERSION}`).then(r => r.ok ? r.json() : Promise.reject(r.status));
    materialsCache.set(file, p);
    try { return await p; } catch (e) { materialsCache.delete(file); return null; }
  }

  // ── Dirty tracking ─────────────────────────────────────────────────────
  function markDirty() {
    if (!dirty) { dirty = true; $("dirtyDot").classList.remove("hidden"); document.title = "● " + APP_TITLE; }
    scheduleAutosave();
  }
  function clearDirty() {
    dirty = false; $("dirtyDot").classList.add("hidden"); document.title = APP_TITLE;
  }

  // Re-read the stored document before every write and keep any keys this app does not own, so
  // two tabs (or a future sibling app sharing the key) never silently revert each other.
  function refreshCarriedFromStorage() {
    let raw;
    try { raw = localStorage.getItem(AUTOSAVE_KEY); } catch (e) { return; }
    if (!raw) return;
    let obj;
    try { obj = JSON.parse(raw); } catch (e) { return; }
    if (!obj || typeof obj !== "object") return;
    const fresh = {};
    for (const k of Object.keys(obj)) if (!OWN_KEYS.has(k)) fresh[k] = obj[k];
    carriedKeys = fresh;
  }
  function writeLocalSave() {
    refreshCarriedFromStorage();
    try { localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(serializeSave())); } catch (e) {}
  }
  function dropOwnSectionFromStorage() {
    refreshCarriedFromStorage();
    try {
      if (Object.keys(carriedKeys).length)
        localStorage.setItem(AUTOSAVE_KEY, JSON.stringify({ ...carriedKeys, app: SAVE_APP, version: SAVE_VERSION }));
      else
        localStorage.removeItem(AUTOSAVE_KEY);
    } catch (e) {}
  }

  let autosaveTimer = null;
  function scheduleAutosave() {
    if (!localSaveEnabled) return;
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(writeLocalSave, 500);
  }
  // Another tracker tab wrote the shared document. Material counts legitimately go down when
  // spent, so they are adopted wholesale rather than merged — unless this tab has unsaved edits
  // of its own, in which case last-writer-wins and this tab is the writer.
  function adoptChecklistFromStorage() {
    if (dirty) return;
    let cl;
    try { cl = JSON.parse(localStorage.getItem(AUTOSAVE_KEY) || "{}").checklist; } catch (e) { return; }
    if (!cl || typeof cl !== "object") return;
    const before = JSON.stringify(serializeSave().checklist);
    if (before === JSON.stringify(cl)) return;
    for (const c of CATS) targets.get(catId(c)).clear();
    haveMats.clear();
    unknownTargets.w = {}; unknownTargets.a = {};
    applyChecklist(cl);
    clearDirty();
    if (viewMode === "checklist" || viewMode === "grid" || viewMode === "list") renderGrid();
    toast("Checklist updated from another tab.");
  }
  window.addEventListener("storage", e => {
    if (e.key !== AUTOSAVE_KEY) return;
    refreshCarriedFromStorage();
    adoptChecklistFromStorage();
  });

  // ── Owned toggling ─────────────────────────────────────────────────────
  const ownedMapOf = c => owned.get(catId(c));
  function isOwned(c, id) { return ownedMapOf(c).has(id); }
  function ownedLevel(c, id) { return ownedMapOf(c).get(id) || 0; }   // 0 = owned but no level set
  const priorLevel = (c, id) => { const m = ownedMapOf(c); return m.has(id) ? m.get(id) : null; };
  function toggleOwned(c, id) {
    const m = ownedMapOf(c), prev = priorLevel(c, id);
    if (m.has(id)) m.delete(id); else m.set(id, 0);
    afterOwnedChange(c, id, prev);
  }
  // Record a specific upgrade level (armor). Clicking the already-selected level un-owns it.
  function setLevel(c, id, lv) {
    const m = ownedMapOf(c), prev = priorLevel(c, id);
    if (m.has(id) && m.get(id) === lv) m.delete(id); else m.set(id, lv);
    afterOwnedChange(c, id, prev);
  }
  // Alt+click shortcut: own the piece outright at its top level (level-less gear just owned).
  function setMaxOwned(c, id) {
    const max = maxLevelOf(c, id), prev = priorLevel(c, id);
    ownedMapOf(c).set(id, max > 0 ? max : 0);
    afterOwnedChange(c, id, prev);
  }
  // Repeat click on the open piece: unowned → owned → LV1 → … → max, then stop.
  function advanceLevel(c, id) {
    const m = ownedMapOf(c), max = maxLevelOf(c, id), prev = priorLevel(c, id);
    if (!m.has(id)) m.set(id, 0);
    else {
      const cur = m.get(id);
      if (cur === 0) { if (max < 1) return; m.set(id, 1); }
      else if (max > 0 && cur < max) m.set(id, cur + 1);
      else return;
    }
    afterOwnedChange(c, id, prev);
  }
  function afterOwnedChange(c, id, prevLevel) {
    markDirty();
    updateProgress();
    if (viewMode === "materials" || viewMode === "routes") {
      renderGrid();
    } else if (viewMode !== "checklist") {
      const cell = $("grid").querySelector(`[data-id="${id}"][data-cat="${catId(c)}"]`);
      if (cell) updateCellOwned(cell, isOwned(c, id), ownedLevel(c, id), maxLevelOf(c, id));
    }
    if (selectedId === id && current === c) refreshDetailOwned(c, id);
    spendForBuild(c, id, prevLevel).then(() => { if (viewMode === "checklist") renderChecklistView(); });
  }
  // Building a checklist piece consumes what it cost: the drop in its own remaining cost comes
  // off the recorded stock. Ownership gained only — un-owning does not refund.
  async function spendForBuild(c, id, prevLevel) {
    if (prevLevel === undefined || !settings.spendMats || !haveMats.size || !isTargeted(c, id)) return;
    if (prevLevel !== null) return;   // only creation is costed (3U weapons have no levels; armor upgrades are not decoded)
    if (!isOwned(c, id)) return;
    const data = await loadMaterials(c.statsFile);
    if (!data) return;
    const m = ownedMapOf(c), cur = m.get(id);
    m.delete(id);
    const before = targetCost(c, id, data).map;
    m.set(id, cur);
    let spent = false;
    for (const [n, used] of before) {
      const have = haveMats.get(n) || 0;
      if (used <= 0 || !have) continue;
      const left = Math.max(0, have - used);
      if (left) haveMats.set(n, left); else haveMats.delete(n);
      spent = true;
    }
    if (spent) markDirty();
  }

  // ── Checklist targets ──────────────────────────────────────────────────
  const targetsMapOf = c => targets.get(catId(c));
  function isTargeted(c, id) { return targetsMapOf(c).has(id); }
  function toggleTarget(c, id) {
    const m = targetsMapOf(c);
    if (m.has(id)) m.delete(id); else m.set(id, 0);
    afterTargetChange(c, id);
  }
  function targetCount() {
    let n = 0;
    for (const m of targets.values()) n += m.size;
    return n;
  }
  function setHaveMat(name, n) {
    const v = Math.max(0, Math.floor(Number(n) || 0));
    if (v) haveMats.set(name, v); else haveMats.delete(name);
    markDirty();
  }
  function afterTargetChange(c, id) {
    markDirty();
    if (viewMode === "checklist" || viewMode === "materials" || viewMode === "routes" || filters.owned === "target") renderGrid();
    else {
      const cell = $("grid").querySelector(`[data-id="${id}"][data-cat="${catId(c)}"]`);
      if (cell) updateCellTarget(cell, isTargeted(c, id));
    }
    if (selectedId === id && current === c) refreshDetailTarget(c, id);
  }
  function updateCellTarget(cell, on) {
    cell.classList.toggle("targeted", on);
    let star = cell.querySelector(".cell-target");
    if (on) {
      if (!star) { star = document.createElement("span"); star.className = "cell-target"; star.textContent = "★"; cell.appendChild(star); }
    } else if (star) star.remove();
  }
  function updateCellOwned(cell, on, level, max) {
    cell.classList.toggle("owned", on);
    let chk = cell.querySelector(".cell-check");
    if (on) {
      if (!chk) { chk = document.createElement("span"); chk.className = "cell-check"; cell.appendChild(chk); }
      const maxed = isMaxLevel(level, max);
      chk.textContent = level > 0 ? (maxed ? "Max" : String(level)) : "✓";
      chk.classList.toggle("max", maxed);
    } else if (chk) chk.remove();
  }

  // ── Progress ───────────────────────────────────────────────────────────
  // Counts honour the gender scope: hidden pieces leave both numerator and denominator, but their
  // owned state stays in `owned` (kept, not deleted), so it returns with Both.
  function catTotal(c) {
    const hidden = hiddenGenderIds(c);
    return c.entries.length - (hidden ? hidden.size : 0);
  }
  function catOwnedCount(c) {
    const m = owned.get(catId(c));
    if (!hiddenGenderIds(c)) return m.size;
    let n = 0; for (const id of m.keys()) if (!outOfScope(c, id)) n++;
    return n;
  }
  function catMaxedCount(c) {
    let n = 0;
    for (const [id, lv] of owned.get(catId(c))) {
      if (outOfScope(c, id)) continue;
      const max = maxLevelOf(c, id);
      if (max === 0 || lv >= max) n++;
    }
    return n;
  }
  // Category colour from completion: Rare 1..9 in 10% owned bands, Rare 10 once everything is
  // owned (and, for armor, fully upgraded).
  function categoryTier(c) {
    const total = catTotal(c);
    if (total === 0) return 1;
    if (catOwnedCount(c) >= total && catMaxedCount(c) >= total) return 10;
    return Math.min(9, Math.floor(catOwnedCount(c) / total * 10) + 1);
  }
  function updateProgress() {
    let total = 0, have = 0;
    for (const c of CATS) { total += catTotal(c); have += catOwnedCount(c); }
    $("overallProgress").textContent = `${fmtNum(have)} / ${fmtNum(total)} — ${total ? ((have / total) * 100).toFixed(1) : 0}%`;
    for (const c of CATS) {
      const row = document.querySelector(`.cat-row[data-cat="${catId(c)}"]`);
      if (!row) continue;
      const n = catOwnedCount(c), d = catTotal(c), tier = categoryTier(c);
      row.querySelector(".cat-frac").textContent = `${n}/${d}`;
      row.classList.toggle("complete", n === d && d > 0);
      const img = row.querySelector("img"); if (img) img.src = iconPath(c.iconSlug, tier);
      const nameEl = row.querySelector(".cat-name"); if (nameEl) nameEl.style.color = RARITY_COLORS[tier - 1];
    }
    const n = catOwnedCount(current), d = catTotal(current);
    $("catProgressFill").style.width = d ? (n / d * 100) + "%" : "0";
    if (viewMode === "totals" || viewMode === "checklist") updateViewHeader();
    else $("catCount").textContent = `${n} / ${d} owned`;
  }

  // ── Sidebar ────────────────────────────────────────────────────────────
  function buildSidebar() {
    const groups = [
      { title: "Weapons", cats: CATS.filter(c => c.kind === "w") },
      { title: "Armor", cats: CATS.filter(c => c.kind === "a") },
    ];
    const tree = $("categoryTree"); tree.innerHTML = "";
    groups.forEach((g, gi) => {
      const sec = document.createElement("div");
      sec.className = "cat-section"; sec.dataset.open = gi === 0 ? "true" : "false";
      sec.innerHTML = `<button class="cat-section-head"><span>${g.title}</span><span class="chev">▾</span></button>
        <div class="cat-section-body"></div>`;
      const body = sec.querySelector(".cat-section-body");
      for (const c of g.cats) {
        const row = document.createElement("div");
        row.className = "cat-row"; row.dataset.cat = catId(c);
        row.innerHTML = `<img src="${iconPath(c.iconSlug, 1)}" alt="">
          <span class="cat-name">${escapeHtml(c.label)}</span>
          <span class="cat-frac"></span>`;
        row.addEventListener("click", () => selectCategory(c));
        body.appendChild(row);
      }
      sec.querySelector(".cat-section-head").addEventListener("click", () => {
        const willOpen = sec.dataset.open !== "true";
        tree.querySelectorAll(".cat-section").forEach(s => s.dataset.open = "false");
        sec.dataset.open = willOpen ? "true" : "false";
      });
      tree.appendChild(sec);
    });
  }
  function buildRarityFilters() {
    const wrap = $("rarityFilters"); wrap.innerHTML = "";
    for (let r = 1; r <= 10; r++) {
      const chip = document.createElement("div");
      chip.className = "rarity-chip"; chip.dataset.r = r; chip.textContent = String(r);
      chip.style.background = RARITY_COLORS[r - 1];
      chip.addEventListener("click", () => {
        if (filters.rarity.has(r)) filters.rarity.delete(r); else filters.rarity.add(r);
        chip.classList.toggle("off", !filters.rarity.has(r));
        renderGrid();
      });
      wrap.appendChild(chip);
    }
  }
  function buildElementFilter() {
    $("elementSelect").innerHTML = `<option value="all">Any</option>`
      + ELEMENTS.map(e => `<option value="${escapeHtml(e)}">${escapeHtml(e)}</option>`).join("")
      + `<option value="none">No element</option>`;
  }
  // Rarity tints for the grid cells, from the game's own colour table.
  function injectRarityStyles() {
    const css = RARITY_COLORS.map((hex, i) => {
      const [r, g, b] = [1, 3, 5].map(j => parseInt(hex.substr(j, 2), 16));
      return `.box-cell.rarity-${i + 1}::after{background:rgba(${r},${g},${b},.38)}`
        + `.rarity-text-${i + 1}{color:${hex}}`;
    }).join("\n");
    const el = document.createElement("style"); el.textContent = css; document.head.appendChild(el);
  }

  // ── Grid rendering ─────────────────────────────────────────────────────
  function normalize(c, entry) {
    const w = c.kind === "w";
    return { kind: c.kind, key: c.key, cat: c, id: entry[0], name: entry[1], rar: entry[2] || 0,
      names: [entry[1]],
      parent: w ? entry[3] : 0,
      order: w ? (entry[4] || 0) : 0,
      ele: w ? (entry[5] || 0) : 0,
      st: w ? (entry[6] || null) : null,   // [attack, affinity, defense, slots]
      cx: w ? (entry[7] || null) : null,   // class-specific payload, see CLASS_FILTERS
      armorClass: c.kind === "a" ? (entry[5] || "A") : "",
      gender: c.kind === "a" ? (entry[4] ?? 2) : 2,
      iconSlug: c.iconSlug };
  }
  function currentItems() {
    if (filters.searchAll && filters.text) {
      const q = filters.text.toLowerCase();
      const out = [];
      for (const c of CATS)
        for (const e of c.entries)
          if (e[1].toLowerCase().includes(q)) out.push(normalize(c, e));
      return out;
    }
    return current.entries.map(e => normalize(current, e));
  }
  function passesFilters(it) {
    // Gender: pieces the tracked hunter cannot wear are hidden outright. They are out of the
    // counts too — see genderIds — so this is a scope, not just a view.
    if (it.kind === "a" && settings.armorGender !== "all"
        && it.gender !== 2 && it.gender !== (settings.armorGender === "m" ? 0 : 1)) return false;
    if (it.kind === "a" && filters.armorClass !== "all" && it.armorClass !== "A" && it.armorClass !== filters.armorClass) return false;
    if (filters.text && !filters.searchAll) {
      const q = filters.text.toLowerCase();
      if (!it.names.some(n => n.toLowerCase().includes(q))) return false;
    }
    if (it.kind === "w" && (filters.aff !== "all" || filters.slots !== "all" || filters.def !== "all")) {
      const st = it.st;
      if (!st) return false;
      const [, aff, def, slots] = st;
      if (filters.aff === "pos" && !(aff > 0)) return false;
      if (filters.aff === "neg" && !(aff < 0)) return false;
      if (filters.aff === "neutral" && aff !== 0) return false;
      if (filters.slots !== "all" && slots !== Number(filters.slots)) return false;
      if (filters.def === "yes" && !def) return false;
    }
    if (!passesClassFilters(it)) return false;
    if (filters.element !== "all" && it.kind === "w") {
      if (filters.element === "none") { if (it.ele) return false; }
      else {
        const bit = ELEMENTS.indexOf(filters.element);
        if (bit < 0 || !((it.ele >> bit) & 1)) return false;
      }
    }
    if (it.rar >= 1 && !filters.rarity.has(it.rar)) return false;
    if (filters.owned !== "all") {
      const has = owned.get(`${it.kind}:${it.key}`).has(it.id);
      if (filters.owned === "target") return isTargeted(it.cat, it.id);
      if (filters.owned === "owned" && !has) return false;
      if (filters.owned === "missing" && has) return false;
      if (filters.owned === "maxed") {
        if (!has) return false;
        const mx = maxLevelOf(it.cat, it.id);
        if (mx > 0 && ownedLevel(it.cat, it.id) < mx) return false;
      }
      if (filters.owned === "partial") {
        if (!has) return false;
        const mx = maxLevelOf(it.cat, it.id);
        if (mx <= 0 || ownedLevel(it.cat, it.id) >= mx) return false;
      }
    }
    return true;
  }
  const rarKey = r => (r === 0 ? 99 : r);
  function sortItems(items) {
    if (filters.sort === "name") items.sort((a, b) => a.name.localeCompare(b.name));
    // Upgrade-tree order: each base weapon followed by everything it upgrades into. Armor keeps
    // the game's own table order, which pairs each Blademaster piece with its Gunner twin.
    else if (filters.sort === "tree") items.sort((a, b) =>
      (a.kind === "w" && b.kind === "w" ? (a.order - b.order) : 0) || (a.id - b.id));
    else items.sort((a, b) => (rarKey(a.rar) - rarKey(b.rar)) || (a.kind === "w" ? a.order - b.order : 0) || (a.id - b.id));
    return items;
  }
  function ownedBadgeHtml(it) {
    const cid = `${it.kind}:${it.key}`;
    const m = owned.get(cid);
    if (!m.has(it.id)) return { on: false, html: "" };
    const level = m.get(it.id) || 0;
    const maxed = isMaxLevel(level, maxLevels.get(cid).get(it.id) || 0);
    const text = level > 0 ? (maxed ? "Max" : level) : "✓";
    return { on: true, html: `<span class="cell-check${maxed ? " max" : ""}">${text}</span>` };
  }
  const targetBadgeHtml = it => targets.get(`${it.kind}:${it.key}`).has(it.id)
    ? { on: true, html: '<span class="cell-target">★</span>' } : { on: false, html: "" };
  function cellHtml(it) {
    const { on, html } = ownedBadgeHtml(it);
    const tg = targetBadgeHtml(it);
    const rc = it.rar >= 1 ? ` rarity-${it.rar}` : "";
    return `<div class="box-cell${rc}${on ? " owned" : ""}${tg.on ? " targeted" : ""}" data-id="${it.id}" data-cat="${it.kind}:${it.key}" title="${escapeHtml(it.name)}">
      <img class="cell-icon" src="${iconPath(it.iconSlug, it.rar)}" alt="" loading="lazy">${html}${tg.html}</div>`;
  }
  function listRowHtml(it) {
    const { on, html } = ownedBadgeHtml(it);
    const rc = it.rar >= 1 ? ` rarity-${it.rar}` : "";
    const tg = targetBadgeHtml(it);
    return `<div class="list-row${rc}${on ? " owned" : ""}${tg.on ? " targeted" : ""}" data-id="${it.id}" data-cat="${it.kind}:${it.key}" title="${escapeHtml(it.name)}">
      <img class="list-icon" src="${iconPath(it.iconSlug, it.rar)}" alt="" loading="lazy">
      <span class="list-name">${escapeHtml(it.name)}${genderPill(it.gender)}</span>
      <span class="list-rar">R${it.rar >= 1 ? it.rar : "–"}</span>${html}${tg.html}</div>`;
  }
  function renderGrid() {
    const grid = $("grid");
    grid.classList.toggle("view-list", viewMode === "list");
    grid.classList.toggle("view-materials",
      viewMode === "materials" || viewMode === "routes" || viewMode === "totals" || viewMode === "checklist");
    if (viewMode === "totals") { updateViewHeader(); $("gridEmpty").classList.add("hidden"); renderTotalsView(); return; }
    if (viewMode === "checklist") { updateViewHeader(); $("gridEmpty").classList.add("hidden"); renderChecklistView(); return; }
    let items = currentItems().filter(passesFilters);
    sortItems(items);
    if (!items.length) { grid.innerHTML = ""; $("gridEmpty").classList.remove("hidden"); return; }
    $("gridEmpty").classList.add("hidden");
    if (viewMode === "materials") { renderMaterialsView(items); return; }
    if (viewMode === "routes") { renderRoutesView(items); return; }
    const render = viewMode === "list" ? listRowHtml : cellHtml;
    grid.innerHTML = items.map(render).join("");
  }

  // ── Recipes ────────────────────────────────────────────────────────────
  // Weapon materials file: create[id] = {d: pairs, f: [parentId, null, pairs]}. `d` is the
  // weapon's own create recipe (create table 0xc06b64); `f` is the cost of upgrading into it
  // from its parent (upgrade table 0xc06bb4). Armor files: create[id] = pairs.
  const weaponName = (c, id) => { const e = entryOf(c, id); return e ? e[1] : "?"; };
  const addPairs = (map, pairs, mats) => {
    for (const [mi, q] of pairs || []) {
      const n = mats[mi];
      if (n) map.set(n, (map.get(n) || 0) + q);
    }
  };
  const addMap = (map, other) => { for (const [n, q] of other) map.set(n, (map.get(n) || 0) + q); };
  // What it costs to make one weapon, given what you already have: its upgrade recipe when you
  // own (or plan to build) the weapon it upgrades from, else its create recipe, else the upgrade
  // plus the cost of making its parent — walking up until something is owned, targeted or craftable.
  const coveredOf = (c, id) => isOwned(c, id) || isTargeted(c, id);
  function weaponBuildCost(data, c, id, seen, isRoot) {
    const map = new Map(), notes = [];
    if (!data || seen.has(id)) return { map, notes };
    seen.add(id);
    if (isRoot ? isOwned(c, id) : coveredOf(c, id)) return { map, notes };
    const cr = (data.create || {})[String(id)];
    if (!cr) { notes.push("No recipe (event / reward weapon)."); return { map, notes }; }
    if (cr.f && coveredOf(c, cr.f[0])) {
      addPairs(map, cr.f[2], data.mats);
      notes.push(`upgraded from ${weaponName(c, cr.f[0])}`);
    } else if (cr.d) {
      addPairs(map, cr.d, data.mats);
    } else if (cr.f) {
      addPairs(map, cr.f[2], data.mats);
      const up = weaponBuildCost(data, c, cr.f[0], seen, false);
      addMap(map, up.map);
      notes.push(`via ${weaponName(c, cr.f[0])}`, ...up.notes);
    }
    return { map, notes };
  }
  function targetCost(c, id, data) {
    if (!data) return { map: new Map(), notes: [] };
    if (c.kind === "w") return weaponBuildCost(data, c, id, new Set(), true);
    const map = new Map();
    if (!isOwned(c, id)) addPairs(map, (data.create || {})[String(id)], data.mats);
    return { map, notes: [] };
  }
  // Totals: what is still owed, category by category. A weapon is counted by the step that makes
  // it — the upgrade from its parent when it has one, else its create recipe — so following the
  // tree from the bottom builds everything once. Armor counts its create recipe.
  const totalsPieceCost = (c, it, data) => {
    const sum = new Map();
    if (!data || isOwned(c, it.id)) return sum;
    const cr = (data.create || {})[String(it.id)];
    if (c.kind === "w") { if (cr) addPairs(sum, cr.f ? cr.f[2] : cr.d, data.mats); }
    else addPairs(sum, cr, data.mats);
    return sum;
  };

  // ── Materials View — a whole category's shopping list, one block per piece ──
  let materialsViewToken = 0;
  async function renderMaterialsView(items) {
    const token = ++materialsViewToken;
    const grid = $("grid");
    grid.innerHTML = '<div class="detail-note" style="padding:20px">Loading materials…</div>';
    const files = [...new Set(items.map(it => it.cat.statsFile))];
    const dataByFile = {};
    await Promise.all(files.map(f => loadMaterials(f).then(d => { dataByFile[f] = d; }).catch(() => { dataByFile[f] = null; })));
    if (token !== materialsViewToken) return;
    const note = items.some(it => it.kind === "w")
      ? '<div class="mat-view-note">Each weapon shows the step that makes it: the <b>upgrade from</b> the weapon below it '
        + 'in its tree, or its <b>create</b> recipe when it has no parent. Open a weapon to see both when it has both.</div>'
      : '<div class="mat-view-note">Create recipes. Armor upgrade costs (Armor Spheres) are not decoded yet.</div>';
    grid.innerHTML = note + items.map(it => materialsRowHtml(it.cat, it.id, it, dataByFile[it.cat.statsFile])).join("");
  }
  function materialsRowHtml(c, id, it, data) {
    let bodyHtml, complete = isOwned(c, id);
    if (complete) bodyHtml = '<span class="mat-complete">Owned</span>';
    else if (!data) bodyHtml = '<div class="detail-note">No material data.</div>';
    else {
      const cr = (data.create || {})[String(id)];
      if (!cr) bodyHtml = '<div class="detail-note">No recipe (event / reward).</div>';
      else if (c.kind === "w") bodyHtml = cr.f
        ? `<div class="mat-step">Upgrade from ${escapeHtml(weaponName(c, cr.f[0]))}</div>${matPairsHtml(cr.f[2], data.mats)}`
        : `<div class="mat-step">Create</div>${matPairsHtml(cr.d, data.mats)}`;
      else bodyHtml = matPairsHtml(cr, data.mats);
    }
    return `<div class="mat-view-row${complete ? " complete" : ""}" data-id="${id}" data-cat="${c.kind}:${c.key}" title="${escapeHtml(it.name)}">
      <div class="mat-view-head"><img class="list-icon" src="${iconPath(it.iconSlug, it.rar)}" alt="">
        <span class="list-name">${escapeHtml(it.name)}</span><span class="list-rar">R${it.rar || "–"}</span></div>
      <div class="mat-view-body">${bodyHtml}</div></div>`;
  }

  // ── Crafting Routes View — how each weapon in the list is obtained ──
  //   Created directly  — it has a create recipe (`d`).
  //   Needs base weapon — no create recipe, only an upgrade from its parent (`f` alone). The chain
  //                       is followed up while each base too can only be upgraded into.
  //   Branch weapon     — it CAN be created, and its parent also upgrades into it (`d` and `f`).
  let routesViewToken = 0;
  function baseChain(data, id) {
    const create = data.create || {}, chain = [], seen = new Set([id]);
    let cr = create[String(id)];
    while (cr && cr.f && !seen.has(cr.f[0])) {
      const sid = cr.f[0], src = create[String(sid)];
      seen.add(sid);
      chain.push({ id: sid, relic: !src });
      if (!src || src.d) break;
      cr = src;
    }
    return chain;
  }
  // Links use data-jump-* rather than data-id/data-cat so the badge updaters never mistake one for a row.
  const routeLinkHtml = (c, sid, extra = "") => {
    const n = escapeHtml(weaponName(c, sid));
    return `<span class="route-step"><button type="button" class="route-link" data-jump-cat="${catId(c)}"
      data-jump-id="${sid}" title="Show ${n}">${n}</button>${extra}</span>`;
  };
  function routeRowHtml(it, data) {
    const c = it.cat, yes = '<span class="route-yes">Yes</span>', no = '<span class="route-no">No</span>';
    const dash = '<span class="route-no">&mdash;</span>';
    const cr = data && data.create ? data.create[String(it.id)] : null;
    let direct, base, branch, tag = "";
    if (!data) {
      direct = base = branch = '<span class="route-no">?</span>';
      tag = '<span class="route-tag">recipes unavailable</span>';
    } else if (!cr) {
      direct = no; base = no; branch = dash;
      tag = '<span class="route-tag">no recipe &middot; event / reward</span>';
    } else {
      direct = cr.d ? yes : no;
      base = !cr.d && cr.f
        ? yes + `<ol class="route-chain">${baseChain(data, it.id).map((st, i) =>
            `<li style="--depth:${i}">${routeLinkHtml(c, st.id, st.relic ? '<span class="route-tag">no recipe</span>' : "")}</li>`).join("")}</ol>`
        : no;
      branch = cr.d && cr.f ? routeLinkHtml(c, cr.f[0]) : dash;
    }
    const sel = current === c && selectedId === it.id ? " selected" : "";
    return `<tr class="route-row${sel}" data-id="${it.id}" data-cat="${catId(c)}">
      <td class="route-name"><img class="list-icon" src="${iconPath(it.iconSlug, it.rar)}" alt="" loading="lazy"><span
        class="list-name">${escapeHtml(it.name)}</span>${tag}</td>
      <td>${direct}</td><td>${base}</td><td>${branch}</td></tr>`;
  }
  async function renderRoutesView(items) {
    const token = ++routesViewToken;
    const grid = $("grid");
    const weapons = items.filter(it => it.kind === "w");
    if (!weapons.length) {
      grid.innerHTML = '<div class="mat-view-note">Crafting routes are about weapons &mdash; pick a weapon class to see how each one is made.</div>';
      return;
    }
    const scroller = scrollHost(grid), scrollTop = scroller ? scroller.scrollTop : 0;
    const files = [...new Set(weapons.map(it => it.cat.statsFile))];
    if (!files.every(f => materialsCache.has(f)))
      grid.innerHTML = '<div class="detail-note" style="padding:20px">Loading recipes…</div>';
    const dataByFile = {};
    await Promise.all(files.map(f => loadMaterials(f).then(d => { dataByFile[f] = d; }).catch(() => { dataByFile[f] = null; })));
    if (token !== routesViewToken) return;
    const left = items.length - weapons.length;
    grid.innerHTML = `<div class="route-wrap"><table class="route-table">
        <thead><tr><th>Weapon</th><th>Created directly</th><th>Needs base weapon</th><th>Branch weapon</th></tr></thead>
        <tbody>${weapons.map(it => routeRowHtml(it, dataByFile[it.cat.statsFile])).join("")}</tbody>
      </table></div>` + (left ? `<div class="mat-view-note">${left} armor piece${left === 1 ? "" : "s"}
        in these results ${left === 1 ? "is" : "are"} not shown &mdash; crafting routes are for weapons.</div>` : "");
    if (scroller) scroller.scrollTop = scrollTop;
  }
  function showRouteWeapon(c, id) {
    $("grid").querySelectorAll(".route-row.selected").forEach(x => x.classList.remove("selected"));
    const row = $("grid").querySelector(`.route-row[data-id="${id}"][data-cat="${catId(c)}"]`);
    if (row) { row.classList.add("selected"); row.scrollIntoView({ block: "nearest" }); }
    openDetail(c, id);
  }

  // ── Totals View — every category at once, merged outstanding cost ──
  let totalsViewToken = 0;
  async function renderTotalsView() {
    const token = ++totalsViewToken;
    const grid = $("grid");
    grid.innerHTML = '<div class="detail-note" style="padding:20px">Loading materials…</div>';
    const files = [...new Set(CATS.map(c => c.statsFile))];
    const dataByFile = {};
    await Promise.all(files.map(f => loadMaterials(f).then(d => { dataByFile[f] = d; }).catch(() => { dataByFile[f] = null; })));
    if (token !== totalsViewToken) return;
    const blocks = [], pending = new Map();
    let grand = 0;
    const GROUPS = [
      { t: "Weapons", k: "w", note: "Each weapon counted once, by the step that makes it: the upgrade from its parent, or its create recipe when it has none." },
      { t: "Armor", k: "a", note: "Create recipes. Upgrade costs (Armor Spheres) are not decoded yet, so they are not included." },
    ];
    for (const group of GROUPS) {
      const rows = [];
      for (const c of CATS.filter(x => x.kind === group.k)) {
        const data = dataByFile[c.statsFile];
        const merge = new Map();
        let pieces = 0;
        for (const e of c.entries) {
          const it = normalize(c, e);
          if (!passesFilters(it)) continue;
          const sum = totalsPieceCost(c, it, data);
          if (!sum.size) continue;
          pieces++;
          addMap(merge, sum);
        }
        const units = [...merge.values()].reduce((a, b) => a + b, 0);
        grand += units;
        const cid = catId(c);
        pending.set(cid, merge.size ? merge : "Nothing outstanding — everything shown is already owned.");
        rows.push(`<div class="mat-view-row totals-row${merge.size ? "" : " complete"}" data-cat="${cid}">
          <div class="mat-view-head"><img class="list-icon" src="${iconPath(c.iconSlug, 1)}" alt="">
            <span class="list-name">${escapeHtml(c.label)}</span>
            <span class="list-rar">${pieces} ${pieces === 1 ? "piece" : "pieces"} · ${fmtNum(units)} items</span>
            <span class="totals-chev">▾</span></div>
          <div class="mat-view-body"></div></div>`);
      }
      if (rows.length) blocks.push(`<div class="mat-view-note"><b>${group.t}</b> — ${group.note}</div>${rows.join("")}`);
    }
    const note = `<div class="mat-view-note">Everything still to craft, per category, for the pieces the current
      filters show. Equipment you own is left out.<br>You will need <b>${fmtNum(grand)}</b> items in total.</div>`;
    grid.innerHTML = note + blocks.join("");
    grid.querySelectorAll(".totals-row").forEach(rowEl => {
      rowEl.querySelector(".mat-view-head").addEventListener("click", () => {
        const body = rowEl.querySelector(".mat-view-body");
        if (!body.innerHTML) {
          const v = pending.get(rowEl.dataset.cat);
          body.innerHTML = typeof v === "string" ? `<div class="detail-note">${v}</div>` : matNameListHtml(v);
        }
        rowEl.classList.toggle("open");
      });
    });
  }

  // ── Checklist view ─────────────────────────────────────────────────────
  // Spans every category. The summary's Have is one global count per material; per-target lines
  // show a first-come allocation down the list so covered amounts never sum past it.
  let checklistViewToken = 0;
  function targetedItems() {
    const out = [];
    for (const c of CATS) {
      const m = targets.get(catId(c));
      if (!m.size) continue;
      for (const e of c.entries) if (m.has(e[0])) out.push({ c, id: e[0], entry: e });
    }
    return out;
  }
  const stepperHtml = (mat, inner) => {
    const m = escapeHtml(mat);
    return `<div class="chk-stepper">
      <button type="button" class="chk-step" data-mat="${m}" data-d="-1" tabindex="-1"
        title="One fewer ${m}" aria-label="One fewer ${m}">&minus;</button>${inner}<button
        type="button" class="chk-step" data-mat="${m}" data-d="1" tabindex="-1"
        title="One more ${m}" aria-label="One more ${m}">+</button></div>`;
  };
  function scrollHost(el) {
    for (let p = el; p && p !== document.body; p = p.parentElement) {
      const oy = getComputedStyle(p).overflowY;
      if ((oy === "auto" || oy === "scroll") && p.scrollHeight > p.clientHeight) return p;
    }
    return null;
  }
  const chkRowKey = el => el.classList.contains("chk-summary") ? "sum" : `${el.dataset.cat}:${el.dataset.id}`;
  async function renderChecklistView() {
    const token = ++checklistViewToken;
    const grid = $("grid");
    const list = targetedItems();
    if (!list.length) {
      grid.innerHTML = '<div class="mat-view-note">Nothing on your checklist yet. Open any weapon or armor piece and use '
        + '<b>Add to checklist</b> to start a build list.</div>';
      return;
    }
    const openKeys = new Set([...grid.querySelectorAll(".totals-row.open")].map(chkRowKey));
    const scroller = scrollHost(grid), scrollTop = scroller ? scroller.scrollTop : 0;
    const active = document.activeElement;
    const focusMat = active && active.classList && active.classList.contains("chk-have") ? active.dataset.mat : null;
    const files = [...new Set(list.map(t => t.c.statsFile))];
    if (!files.every(f => materialsCache.has(f)))
      grid.innerHTML = '<div class="detail-note" style="padding:20px">Loading materials…</div>';
    const dataByFile = {};
    await Promise.all(files.map(f => loadMaterials(f).then(d => { dataByFile[f] = d; }).catch(() => { dataByFile[f] = null; })));
    if (token !== checklistViewToken) return;

    const rows = [], totalNeed = new Map();
    const remaining = new Map(haveMats);
    for (const t of list) {
      const { map, notes } = targetCost(t.c, t.id, dataByFile[t.c.statsFile]);
      addMap(totalNeed, map);
      const lines = [...map].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([n, need]) => {
          const avail = remaining.get(n) || 0;
          const covered = Math.min(avail, need);
          remaining.set(n, avail - covered);
          return { n, need, covered };
        });
      const built = isOwned(t.c, t.id);
      rows.push({ t, lines, notes, done: built || (lines.length > 0 && lines.every(l => l.covered >= l.need)), built,
                  units: lines.reduce((a, l) => a + l.need, 0) });
    }
    const summary = [...totalNeed].sort((a, b) => a[0].localeCompare(b[0])).map(([n, need]) => {
      const have = haveMats.get(n) || 0;
      return { n, need, have, short: Math.max(0, need - have) };
    });
    const shortTotal = summary.reduce((a, m) => a + m.short, 0);
    const summaryHtml = `<div class="mat-view-row totals-row chk-summary">
      <div class="mat-view-head"><span class="list-name">Everything you still need</span>
        <span class="list-rar">${fmtNum(shortTotal)} outstanding</span><span class="totals-chev">▾</span></div>
      <div class="mat-view-body"><table class="chk-table">
        <thead><tr><th>Material</th><th class="num">Need</th><th class="num">Have</th><th class="num">Short</th></tr></thead>
        <tbody>${summary.map(m => `<tr${m.short ? "" : ' class="done"'}>
          <td>${escapeHtml(m.n)}</td>
          <td class="num">${fmtNum(m.need)}</td>
          <td class="num">${stepperHtml(m.n, `<input type="number" class="chk-have" min="0" inputmode="numeric"
              value="${m.have || ""}" placeholder="0" data-mat="${escapeHtml(m.n)}" title="How many you hold">`)}</td>
          <td class="num chk-short${m.short ? "" : " ok"}">${m.short ? fmtNum(m.short) : "✓"}</td>
        </tr>`).join("")}</tbody></table></div></div>`;
    const rowHtml = r => {
      const it = normalize(r.t.c, r.t.entry);
      const body = r.built
        ? '<div class="detail-note">Already built.</div>'
        : (r.lines.length
            ? `<table class="chk-table">
                <thead><tr><th>Material</th><th class="num">Need</th><th class="num">Have</th><th class="num">Short</th></tr></thead>
                <tbody>${r.lines.map(l => { const short = Math.max(0, l.need - l.covered); return `<tr${short ? "" : ' class="done"'}>
                  <td>${escapeHtml(l.n)}</td>
                  <td class="num">${fmtNum(l.need)}</td>
                  <td class="num">${stepperHtml(l.n, `<span class="chk-alloc">${fmtNum(l.covered)}</span>`)}</td>
                  <td class="num chk-short${short ? "" : " ok"}">${short ? fmtNum(short) : "✓"}</td>
                </tr>`; }).join("")}</tbody></table>`
            : '<div class="detail-note">Nothing outstanding.</div>')
        + (r.notes.length ? `<div class="mat-step">${r.notes.map(escapeHtml).join(" · ")}</div>` : "");
      const badge = r.built ? '<span class="mat-complete">Already built</span>'
        : r.done ? '<span class="mat-complete">Ready to build</span>'
        : `<span class="list-rar">${fmtNum(r.units)} items</span>`;
      return `<div class="mat-view-row totals-row${r.done ? " complete" : ""}" data-id="${r.t.id}" data-cat="${catId(r.t.c)}">
        <div class="mat-view-head"><img class="list-icon" src="${iconPath(it.iconSlug, it.rar)}" alt="">
          <span class="list-name">${escapeHtml(it.name)}</span>${badge}<span class="totals-chev">▾</span></div>
        <div class="mat-view-body">${body}</div></div>`;
    };
    const note = `<div class="mat-view-note">Materials for the ${list.length} piece${list.length === 1 ? "" : "s"}
      on your checklist. Enter what you hold in the summary — counts are global, so a material
      shared by several targets is only counted once. Targets below are covered top to bottom.</div>`;
    grid.innerHTML = note + summaryHtml + rows.map(rowHtml).join("");
    grid.querySelectorAll(".totals-row").forEach(el => {
      if (openKeys.has(chkRowKey(el))) el.classList.add("open");
      if (current && el.dataset.cat === catId(current) && Number(el.dataset.id) === selectedId) el.classList.add("selected");
    });
    if (scroller) scroller.scrollTop = scrollTop;
    if (focusMat) {
      const back = [...grid.querySelectorAll(".chk-have")].find(i => i.dataset.mat === focusMat);
      if (back) { back.focus(); back.select(); }
    }
    grid.querySelectorAll(".totals-row").forEach(el => {
      el.querySelector(".mat-view-head").addEventListener("click", ev => {
        if (ev.ctrlKey || ev.metaKey || ev.altKey || ev.shiftKey) return;   // let the gesture through
        el.classList.toggle("open");
        const c = catByIdMap.get(el.dataset.cat), id = Number(el.dataset.id);
        if (c && Number.isInteger(id)) {
          grid.querySelectorAll(".mat-view-row.selected").forEach(x => x.classList.remove("selected"));
          el.classList.add("selected");
          openDetail(c, id);
        }
        ev.stopPropagation();   // a plain click here must never reach the level-up logic
      });
    });
  }

  // ── Class-specific weapon filters ──────────────────────────────────────
  // Only rendered for the classes that have the attribute. Values are the raw codes
  // build_data.py stores in catalog entry[7]; labels come from the game's own text.
  const L = C.labels;
  const GUNS = ["light_bowgun", "heavy_bowgun"];
  const MELEE = ["great_sword", "long_sword", "sword_and_shield", "dual_blades", "hammer",
    "hunting_horn", "lance", "gunlance", "switch_axe"];
  const CLASS_FILTERS = [
    // Max sharpness colour, base and with Sharpness+1, packed base << 3 | plus.
    { k: "sh", label: "Max Sharpness", classes: MELEE, sharp: true },
    { k: "p",  label: "Phial", classes: ["switch_axe"], opts: L.phial },
    { k: "s",  label: "Shelling", classes: ["gunlance"], opts: L.shell },
    { k: "sl", label: "Shell level", classes: ["gunlance"], opts: ["Lv1", "Lv2", "Lv3", "Lv4", "Lv5"], base: 1 },
    { k: "a",  label: "Arc shot", classes: ["bow"], opts: L.arc },
    { k: "r",  label: "Reload", classes: GUNS, opts: L.reload },
    { k: "rc", label: "Recoil", classes: GUNS, opts: L.recoil },
    { k: "d",  label: "Deviation", classes: GUNS, opts: L.deviation },
    { k: "n",  label: "Note combo", classes: ["hunting_horn"], combo: true },
  ];
  function classFiltersFor(c) {
    return c.kind === "w" ? CLASS_FILTERS.filter(f => f.classes.includes(c.key)) : [];
  }
  const noteCombo = v => [(v >> 8) & 15, (v >> 4) & 15, v & 15].map(i => L.notes[i] || "?").join(" / ");
  const SHARP_BANDS = ["Base", "S+1"];
  const sharpAt = (packed, band) => band ? packed & 7 : (packed >> 3) & 7;
  function sharpOptions() {
    const seen = new Set();
    for (const e of current.entries) {
      const p = e[7] && e[7].sh;
      if (p == null) continue;
      for (let b = 0; b < 2; b++) seen.add(b * 8 + sharpAt(p, b));
    }
    return [...seen]
      .sort((a, b) => (a % 8) - (b % 8) || Math.floor(a / 8) - Math.floor(b / 8))
      .map(v => [v, `${SHARP_LABELS[v % 8]} (${SHARP_BANDS[Math.floor(v / 8)]})`]);
  }
  function optionsFor(f) {
    if (f.sharp) return sharpOptions();
    const seen = new Map();
    for (const e of current.entries) {
      const x = e[7];
      if (!x) continue;
      const v = x[f.k];
      if (v == null || seen.has(v)) continue;
      seen.set(v, f.combo ? noteCombo(v) : (f.opts[f.base ? v - f.base : v] ?? String(v)));
    }
    return [...seen].sort((a, b) => (f.combo ? a[1].localeCompare(b[1]) : a[0] - b[0]));
  }
  function renderClassFilters() {
    const wrap = $("classFilters");
    if (!wrap) return;
    wrap.innerHTML = classFiltersFor(current).map(f => {
      const pairs = optionsFor(f);
      if (pairs.length < 2) return "";
      return `<div class="filter-group">
      <div class="filter-label">${escapeHtml(f.label)}</div>
      <select class="mini-select" data-ck="${f.k}">
        <option value="all">Any</option>
        ${pairs.map(([v, o]) => `<option value="${v}">${escapeHtml(o)}</option>`).join("")}
      </select></div>`;
    }).join("");
    wrap.querySelectorAll("select").forEach(sel => {
      const key = sel.dataset.ck;
      if (filters.cls[key] != null) sel.value = String(filters.cls[key]);
      sel.addEventListener("change", () => {
        if (sel.value === "all") delete filters.cls[key]; else filters.cls[key] = Number(sel.value);
        renderGrid();
      });
    });
  }
  function passesClassFilters(it) {
    const keys = Object.keys(filters.cls);
    if (!keys.length || it.kind !== "w") return true;
    const x = it.cx;
    if (!x) return false;
    for (const key of keys) {
      const def = CLASS_FILTERS.find(f => f.k === key);
      const want = filters.cls[key];
      if (def && def.sharp) {
        if (x.sh == null || sharpAt(x.sh, Math.floor(want / 8)) !== want % 8) return false;
      } else if (x[key] !== want) return false;
    }
    return true;
  }
  // Level-based Show filters only mean something for armor (3U weapons have no levels).
  function updateLevelFilterAvailability() {
    const enabled = current.kind === "a" || (filters.searchAll && !!filters.text);
    let reset = false;
    for (const v of ["maxed", "partial"]) {
      const r = document.querySelector(`input[name="ownedFilter"][value="${v}"]`);
      if (!r) continue;
      r.disabled = !enabled;
      if (!enabled && r.checked) reset = true;
    }
    if (reset) {
      filters.owned = "all";
      const all = document.querySelector('input[name="ownedFilter"][value="all"]');
      if (all) all.checked = true;
    }
    return reset;
  }
  function selectCategory(c) {
    current = c;
    selectedId = null;
    filters.cls = {};   // a Phial setting means nothing on a Hunting Horn
    renderClassFilters();
    updateLevelFilterAvailability();
    $("weaponStatGroup").classList.toggle("hidden", c.kind !== "w");
    $("elementGroup").classList.toggle("hidden", c.kind !== "w");
    $("armorTypeGroup").classList.toggle("hidden", c.kind !== "a");
    $("armorGenderGroup").classList.toggle("hidden", c.kind !== "a");
    document.querySelectorAll(".cat-row").forEach(r => r.classList.toggle("active", r.dataset.cat === catId(c)));
    $("catTitle").textContent = c.label;
    renderGrid();
    updateProgress();
    $("detailPanel").innerHTML = '<div class="detail-empty">Select an item to see its details.</div>';
  }

  // ── Grid interaction ───────────────────────────────────────────────────
  $("grid").addEventListener("change", ev => {
    const inp = ev.target.closest(".chk-have");
    if (!inp) return;
    setHaveMat(inp.dataset.mat, inp.value);
    if (viewMode === "checklist") renderChecklistView();
  });
  let stepTimer = null, stepRepeat = null;
  const stopStepping = () => { clearTimeout(stepTimer); clearInterval(stepRepeat); stepTimer = stepRepeat = null; };
  function stepMat(mat, d) {
    setHaveMat(mat, (haveMats.get(mat) || 0) + d);
    if (viewMode === "checklist") renderChecklistView();
  }
  $("grid").addEventListener("pointerdown", ev => {
    const btn = ev.target.closest(".chk-step");
    if (!btn || ev.button) return;
    ev.preventDefault();
    const mat = btn.dataset.mat, d = Number(btn.dataset.d);
    stepMat(mat, d);
    stopStepping();
    stepTimer = setTimeout(() => { stepRepeat = setInterval(() => stepMat(mat, d), 90); }, 420);
  });
  ["pointerup", "pointercancel", "pointerleave", "blur"].forEach(e => window.addEventListener(e, stopStepping));
  // Route links (grid) and tree links (detail panel) jump to the weapon they name.
  document.addEventListener("click", ev => {
    const jump = ev.target.closest(".route-link");
    if (!jump) return;
    const c = catByIdMap.get(jump.dataset.jumpCat), id = Number(jump.dataset.jumpId);
    if (c && Number.isInteger(id)) showRouteWeapon(c, id);
  });
  //   first click on a cell = inspect (open detail, no change)
  //   clicking the already-open piece = own it, then (armor) raise its level each click
  //   ctrl = toggle owned · alt = own at max level · shift = checklist
  $("grid").addEventListener("click", ev => {
    if (ev.target.closest("input, button, select, label")) return;
    if (viewMode === "checklist" && !ev.ctrlKey && !ev.metaKey && !ev.altKey && !ev.shiftKey) return;
    const cell = ev.target.closest(".box-cell, .list-row, .mat-view-row, .route-row");
    if (!cell) return;
    const c = catByIdMap.get(cell.dataset.cat);
    const id = Number(cell.dataset.id);
    if (!c || !Number.isInteger(id)) return;
    if (ev.shiftKey && settings.shiftTarget) { toggleTarget(c, id); return; }
    if (ev.altKey && settings.altMax) { setMaxOwned(c, id); return; }
    if ((ev.ctrlKey || ev.metaKey) && settings.ctrlRemove) { toggleOwned(c, id); return; }
    if (viewMode === "routes") { showRouteWeapon(c, id); return; }
    const alreadyOpen = selectedId === id && current === c;
    if (alreadyOpen) {
      if (settings.clickLevel) {
        if (maxLevelOf(c, id) > 1) advanceLevel(c, id);
        else if (!isOwned(c, id)) toggleOwned(c, id);
      }
    } else {
      document.querySelectorAll(".box-cell.selected, .list-row.selected").forEach(x => x.classList.remove("selected"));
      cell.classList.add("selected");
      openDetail(c, id);
    }
  });

  // ── Detail panel ───────────────────────────────────────────────────────
  function ownedBtnLabel(c, id) {
    if (!isOwned(c, id)) return "Mark as owned";
    const lv = ownedLevel(c, id);
    return lv > 0 ? `✓ Owned — LV ${lv}` : "✓ Owned";
  }
  const targetBtnLabel = (c, id) => isTargeted(c, id) ? "★ On checklist" : "Add to checklist";
  function refreshDetailTarget(c, id) {
    const btn = $("detailTargetBtn");
    if (btn) { btn.classList.toggle("is-target", isTargeted(c, id)); btn.textContent = targetBtnLabel(c, id); }
  }
  function refreshDetailOwned(c, id) {
    const btn = $("detailOwnedBtn");
    if (btn) { btn.classList.toggle("is-owned", isOwned(c, id)); btn.textContent = ownedBtnLabel(c, id); }
    const lv = ownedLevel(c, id), on = isOwned(c, id);
    document.querySelectorAll("#detailStats .lvl-row").forEach(tr =>
      tr.classList.toggle("selected", on && Number(tr.dataset.lv) === lv));
    if (openMaterials) renderMaterials(c, id, openMaterials);
  }
  function wireLevelRows(c, id) {
    document.querySelectorAll("#detailStats .lvl-row").forEach(tr =>
      tr.addEventListener("click", () => setLevel(c, id, Number(tr.dataset.lv))));
  }
  // 0 male-only, 1 female-only, 2 either. Only the restrictions are worth saying.
  const GENDER_LABEL = { 0: "Male Only", 1: "Female Only" };
  const genderPill = g => (GENDER_LABEL[g] ? ` <span class="gender-pill g${g}">${GENDER_LABEL[g]}</span>` : "");
  function detailHead(c, entry) {
    let title = escapeHtml(entry[1]);
    let sub = `<span class="rarity-text-${entry[2]}">Rare ${entry[2] || "?"}</span>`;
    if (c.kind === "a") {
      sub = `${armorClassName[entry[5] || "A"]} · ${sub}`;
      title += genderPill(entry[4]);
    } else sub = `${escapeHtml(c.label)} · ${sub}`;
    return { title, sub, rar: entry[2] || 0 };
  }
  async function openDetail(c, id) {
    selectedId = id; current = c;
    const entry = entryOf(c, id);
    if (!entry) return;
    const { title, sub, rar } = detailHead(c, entry);
    const on = isOwned(c, id);
    $("detailPanel").innerHTML = `
      <div class="detail-head">
        <img class="detail-icon" src="${iconPath(c.iconSlug, rar)}" alt="">
        <div><div class="detail-title">${title}</div><div class="detail-sub">${sub}</div></div>
      </div>
      <button id="detailOwnedBtn" class="detail-owned-btn ${on ? "is-owned" : ""}">${ownedBtnLabel(c, id)}</button>
      <button id="detailTargetBtn" class="detail-target-btn ${isTargeted(c, id) ? "is-target" : ""}">${targetBtnLabel(c, id)}</button>
      <div id="detailStats"><div class="detail-note">Loading stats…</div></div>
      <div id="detailMaterials"></div>`;
    $("detailOwnedBtn").addEventListener("click", () => toggleOwned(c, id));
    $("detailTargetBtn").addEventListener("click", () => toggleTarget(c, id));
    openMaterials = null;
    try {
      const data = await loadStats(c.statsFile);
      if (selectedId !== id) return;
      const body = $("detailStats");
      if (c.kind === "w") body.innerHTML = renderWeaponDetail(c, data, id);
      else { body.innerHTML = renderArmorDetail(data, id); wireLevelRows(c, id); }
      wireSharpToggle();
      refreshDetailOwned(c, id);
    } catch (e) {
      $("detailStats").innerHTML = '<div class="detail-note">Stats unavailable for this item.</div>';
    }
    loadMaterials(c.statsFile).then(md => {
      if (selectedId !== id) return;
      openMaterials = md;
      renderMaterials(c, id, md);
    });
  }

  function sharpBarHtml(bar) {
    if (!bar) return "";
    const segs = bar.map((v, i) => v ? `<div class="sharp-seg" style="width:${v / SHARP_MAX * 100}%;background:${SHARP_COLORS[i]}" title="${SHARP_LABELS[i]}: ${v}"></div>` : "").join("");
    return `<div class="sharp-bar sharp-bar-lg">${segs}</div>`;
  }
  const row = (k, v) => `<div class="stat-row"><span class="k">${escapeHtml(k)}</span><span class="v">${escapeHtml(v)}</span></div>`;
  const chips = items => `<div class="chip-list">${items.map(c => `<span class="chip">${escapeHtml(c)}</span>`).join("")}</div>`;
  const treeLinks = (c, ids) => ids.map(i => routeLinkHtml(c, i)).join('<span class="tree-sep">·</span>');

  function renderWeaponDetail(c, data, id) {
    const s = data.byId[String(id)];
    if (!s) return '<div class="detail-note">No detailed stats for this weapon.</div>';
    let h = row("Attack", s.atk)
      + (s.aff ? row("Affinity", (s.aff > 0 ? "+" : "") + s.aff + "%") : row("Affinity", "0%"));
    if (s.ele) h += row("Element", s.ele.length
      ? s.ele.map(e => `${e[0]} ${e[1]}${e[2] ? " (Awaken)" : ""}`).join(" / ") : "—");
    if (s.def) h += row("Defense", "+" + s.def);
    h += row("Slots", slotsText(s.slots || 0));
    if (s.notes) h += `<div class="stat-row"><span class="k">Notes</span><span class="v">${s.notes.map(n =>
      `<span class="note-dot note-${n.toLowerCase()}" title="${escapeHtml(n)}"></span>`).join("")}</span></div>`;
    if (s.shell) h += row("Shelling", s.shell);
    if (s.phial) h += row("Phial", s.phial);
    if (s.arc) h += row("Arc shot", s.arc);
    if (s.reload) h += row("Reload", s.reload) + row("Recoil", s.recoil) + row("Deviation", s.deviation);
    if (s.sh) {
      h += `<div class="detail-section-title">Sharpness</div>
        <div class="sharp-toggle" data-role="sharp">
          <button data-band="0" class="${sharpBand === 0 ? "active" : ""}">Base</button>
          <button data-band="1" class="${sharpBand === 1 ? "active" : ""}">Sharpness +1</button></div>
        ${sharpBarHtml(s.sh[sharpBand])}`;
    }
    if (s.charges && s.charges.length) h += `<div class="detail-section-title">Charges</div>${chips(s.charges)}`;
    if (s.coatings && s.coatings.length) h += `<div class="detail-section-title">Coatings</div>${chips(s.coatings)}`;
    if (s.ammo && s.ammo.length)
      h += `<div class="detail-section-title">Ammo</div><table class="lvl-table ammo-table"><tbody>${s.ammo.map(([n, cap]) =>
        `<tr><td>${escapeHtml(n)}</td><td class="num">${cap}</td></tr>`).join("")}</tbody></table>`;
    if (s.parent || (s.children && s.children.length)) {
      h += `<div class="detail-section-title">Upgrade tree</div>`;
      if (s.parent) h += `<div class="tree-row"><span class="k">Upgrades from</span> ${treeLinks(c, [s.parent])}</div>`;
      if (s.children && s.children.length) h += `<div class="tree-row"><span class="k">Upgrades into</span> ${treeLinks(c, s.children)}</div>`;
    }
    return h;
  }
  function resGridHtml(res) {
    return `<div class="detail-section-title">Resistances</div><div class="res-grid">
      ${RES_NAMES.map((n, i) => `<div><div class="res-name">${n}</div><div class="res-val">${res[i] > 0 ? "+" + res[i] : res[i]}</div></div>`).join("")}</div>`;
  }
  function renderArmorDetail(data, id) {
    const s = data.byId[String(id)];
    if (!s) return '<div class="detail-note">Stats unavailable for this armor piece.</div>';
    let h = `${row("Defense", `${s.def[0]} – ${s.def[1]}`)}${row("Slots", slotsText(s.slots || 0))}`;
    h += resGridHtml(s.res);
    if (s.sk && s.sk.length)
      h += `<div class="detail-section-title">Skills</div>${chips(s.sk.map(k => `${k[0]} ${k[1] > 0 ? "+" + k[1] : k[1]}`))}`;
    // Per-level defense, as the game computes it (0x8943fc). Only defense changes with level.
    if (s.lv && s.lv.length > 1) {
      const rows = s.lv.map((def, i) => {
        const gain = i ? def - s.lv[i - 1] : 0;
        return `<tr class="lvl-row" data-lv="${i + 1}">
          <td class="lvl-own"></td><td>${i + 1}</td><td>${def}</td><td>${gain ? "+" + gain : "—"}</td></tr>`;
      }).join("");
      h += `<div class="detail-section-title">Upgrade levels</div>
        <div class="lvl-hint">Click the level you currently have.</div>
        <table class="lvl-table"><thead><tr><th class="lvl-own"></th><th>Lv</th><th>Defense</th><th>Gain</th></tr></thead>
        <tbody>${rows}</tbody></table>`;
    }
    return h;
  }
  function wireSharpToggle() {
    const t = document.querySelector('.sharp-toggle[data-role="sharp"]');
    if (!t) return;
    t.querySelectorAll("button").forEach(b => b.addEventListener("click", () => {
      sharpBand = Number(b.dataset.band);
      if (selectedId != null) openDetail(current, selectedId);
    }));
  }

  // ── Crafting materials (detail panel) ──────────────────────────────────
  const matPairsHtml = (pairs, mats) =>
    (!pairs || !pairs.length) ? '<div class="detail-note">None listed.</div>'
      : `<ul class="mat-list">${pairs.map(([mi, q]) => `<li><span class="mat-q">${q}×</span> ${escapeHtml(mats[mi])}</li>`).join("")}</ul>`;
  const matNameListHtml = map => {
    const entries = [...map].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    return `<ul class="mat-list">${entries.map(([n, q]) => `<li><span class="mat-q">${q}×</span> ${escapeHtml(n)}</li>`).join("")}</ul>`;
  };
  function renderMaterials(c, id, data) {
    const el = $("detailMaterials"); if (!el) return;
    if (!data) { el.innerHTML = ""; return; }
    const cr = (data.create || {})[String(id)];
    let h = '<div class="detail-section-title">Crafting materials</div>';
    if (!cr) h += '<div class="detail-note">No recipe — an event or reward piece.</div>';
    else if (c.kind === "w") {
      if (cr.d) h += `<div class="mat-step">Create</div>${matPairsHtml(cr.d, data.mats)}`;
      if (cr.f) h += `<div class="mat-step">${cr.d ? "Or upgrade" : "Upgrade"} from ${escapeHtml(weaponName(c, cr.f[0]))}</div>${matPairsHtml(cr.f[2], data.mats)}`;
    } else {
      h += `<div class="mat-step">Create</div>${matPairsHtml(cr, data.mats)}`;
      if (maxLevelOf(c, id) > 1) h += '<div class="detail-note">Upgrade costs (Armor Spheres) are not decoded yet.</div>';
    }
    el.innerHTML = h;
  }

  // ── Save / load ────────────────────────────────────────────────────────
  function serializeSave() {
    const out = { ...carriedKeys,
      app: SAVE_APP, version: SAVE_VERSION, savedAt: new Date().toISOString(),
      settings: { ...settings }, owned: { w: {}, a: {} }, levels: { w: {}, a: {} } };
    for (const c of CATS) {
      const m = owned.get(catId(c));
      const ids = [...m.keys()].sort((a, b) => a - b);
      const unk = (unknownOwned[c.kind] || {})[c.key] || [];
      out.owned[c.kind][c.key] = unk.length ? ids.concat(unk).sort((a, b) => a - b) : ids;
      const lv = {};
      m.forEach((level, id) => { if (level > 0) lv[id] = level; });
      Object.assign(lv, (unknownLevels[c.kind] || {})[c.key] || {});
      if (Object.keys(lv).length) out.levels[c.kind][c.key] = lv;
    }
    const tg = { w: {}, a: {} };
    for (const c of CATS) {
      const o = {};
      targets.get(catId(c)).forEach((lvl, id) => { o[id] = lvl; });
      Object.assign(o, (unknownTargets[c.kind] || {})[c.key] || {});
      if (Object.keys(o).length) tg[c.kind][c.key] = o;
    }
    const mats = {};
    haveMats.forEach((n, name) => { if (n > 0) mats[name] = n; });
    out.checklist = { version: 1, targets: tg, mats };
    return out;
  }
  function validateSave(obj) {
    if (!obj || typeof obj !== "object") return "Not a valid file.";
    if (obj.app !== SAVE_APP) return "This file isn't an MH3U Collection Tracker save.";
    if (!Number.isInteger(obj.version) || obj.version > SAVE_VERSION) return "This save was made with a newer version.";
    if (!obj.owned || typeof obj.owned !== "object") return "Save file is missing collection data.";
    for (const kind of KINDS) {
      const bucket = obj.owned[kind];
      if (bucket == null) continue;
      if (typeof bucket !== "object") return "Collection data is malformed.";
      for (const arr of Object.values(bucket))
        if (!Array.isArray(arr) || arr.some(x => !Number.isInteger(x))) return "Collection data is malformed.";
    }
    if (obj.levels != null && typeof obj.levels !== "object") return "Collection data is malformed.";
    return null;
  }
  // A malformed checklist is skipped rather than rejecting the file — losing a whole collection
  // over a bad shopping list would be absurd. Assumes the caller cleared the checklist state.
  function applyChecklist(cl) {
    if (!cl || typeof cl !== "object") return;
    const tg = cl.targets;
    if (tg && typeof tg === "object") {
      for (const kind of KINDS) {
        const bucket = tg[kind]; if (!bucket || typeof bucket !== "object") continue;
        for (const [key, map] of Object.entries(bucket)) {
          if (!map || typeof map !== "object") continue;
          const cid = `${kind}:${key}`, valid = validIds.get(cid), m = targets.get(cid);
          if (!m) continue;
          for (const [rawId, rawLv] of Object.entries(map)) {
            const id = Number(rawId), lv = Number(rawLv) || 0;
            if (!Number.isInteger(id)) continue;
            if (valid && valid.has(id)) m.set(id, lv > 0 ? lv : 0);
            else ((unknownTargets[kind][key] ||= {}))[id] = lv;
          }
        }
      }
    }
    if (cl.mats && typeof cl.mats === "object")
      for (const [name, n] of Object.entries(cl.mats)) {
        const v = Math.max(0, Math.floor(Number(n) || 0));
        if (v) haveMats.set(name, v);
      }
  }
  function applySave(obj) {
    for (const c of CATS) { owned.get(catId(c)).clear(); targets.get(catId(c)).clear(); }
    haveMats.clear();
    unknownOwned.w = {}; unknownOwned.a = {};
    unknownLevels.w = {}; unknownLevels.a = {};
    unknownTargets.w = {}; unknownTargets.a = {};
    carriedKeys = {};
    for (const k of Object.keys(obj)) if (!OWN_KEYS.has(k)) carriedKeys[k] = obj[k];
    let unknownCount = 0;
    for (const kind of KINDS) {
      const bucket = obj.owned && obj.owned[kind]; if (!bucket) continue;
      for (const [key, ids] of Object.entries(bucket)) {
        const cid = `${kind}:${key}`, valid = validIds.get(cid), m = owned.get(cid);
        for (const id of ids) {
          if (valid && valid.has(id)) { if (!m.has(id)) m.set(id, 0); }
          else { (unknownOwned[kind][key] ||= []).push(id); unknownCount++; }
        }
      }
    }
    if (obj.levels && typeof obj.levels === "object") {
      for (const kind of KINDS) {
        const bucket = obj.levels[kind]; if (!bucket || typeof bucket !== "object") continue;
        for (const [key, map] of Object.entries(bucket)) {
          if (!map || typeof map !== "object") continue;
          const cid = `${kind}:${key}`, valid = validIds.get(cid), m = owned.get(cid);
          for (const [rawId, rawLv] of Object.entries(map)) {
            const id = Number(rawId), lv = Number(rawLv);
            if (!Number.isInteger(lv) || lv <= 0) continue;
            if (valid && valid.has(id)) m.set(id, lv);
            else ((unknownLevels[kind][key] ||= {}))[id] = lv;
          }
        }
      }
    }
    applyChecklist(obj.checklist);
    if (unknownCount) toast(`${unknownCount} unrecognized id(s) preserved for re-export.`);
    if (obj.settings && typeof obj.settings === "object")
      for (const k of SETTING_KEYS) {
        // Checked against the default's type, so the string setting is not dropped.
        const v = obj.settings[k];
        if (typeof v !== typeof SETTING_DEFAULTS[k]) continue;
        if (k === "armorGender" && !GENDERS.includes(v)) continue;
        settings[k] = v;
      }
    saveSettings();
    for (const sync of toggleSyncs) sync();
    updateProgress();
    renderGrid();
    $("detailPanel").innerHTML = '<div class="detail-empty">Select an item to see its details.</div>';
    selectedId = null;
    scheduleAutosave();
  }

  const supportsFsApi = "showSaveFilePicker" in window;
  const saveOpts = { suggestedName: "mh3u-collection.json", types: [{ description: "JSON", accept: { "application/json": [".json"] } }] };
  async function saveToFile(forceNew) {
    refreshCarriedFromStorage();
    const data = JSON.stringify(serializeSave(), null, 2);
    if (supportsFsApi) {
      try {
        if (forceNew || !fileHandle) fileHandle = await window.showSaveFilePicker(saveOpts);
        const w = await fileHandle.createWritable(); await w.write(data); await w.close();
        clearDirty(); toast("Saved."); return;
      } catch (e) { if (e && e.name === "AbortError") return; }
    }
    downloadBlob(data, "mh3u-collection.json");
    clearDirty(); toast("Downloaded save file.");
  }
  function downloadBlob(data, name) {
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function openFile() {
    if (supportsFsApi) {
      try {
        const [h] = await window.showOpenFilePicker({ types: saveOpts.types });
        fileHandle = h;
        loadFromText(await (await h.getFile()).text());
        return;
      } catch (e) { if (e && e.name === "AbortError") return; }
    }
    $("importFile").click();
  }
  function loadFromText(text) {
    let obj;
    try { obj = JSON.parse(text); } catch (e) { toast("That file isn't valid JSON."); return; }
    const err = validateSave(obj);
    if (err) { toast(err); return; }
    applySave(obj);
    clearDirty();
    toast("Collection loaded.", 4000);
  }
  $("importFile").addEventListener("change", function () {
    const file = this.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = e => loadFromText(e.target.result);
    reader.readAsText(file);
    this.value = "";
  });
  $("saveBtn").addEventListener("click", () => saveToFile(false));
  $("saveAsBtn").addEventListener("click", () => saveToFile(true));
  $("openBtn").addEventListener("click", () => openFile());
  window.addEventListener("beforeunload", e => {
    if (localSaveEnabled) { clearTimeout(autosaveTimer); writeLocalSave(); return; }
    if (dirty) { e.preventDefault(); e.returnValue = ""; }
  });

  // ── Keyboard navigation for the grid and list ──────────────────────────
  const GRID_NAV = { arrowleft: [-1, 0], a: [-1, 0], arrowright: [1, 0], d: [1, 0],
                     arrowup: [0, -1], w: [0, -1], arrowdown: [0, 1], s: [0, 1] };
  const isTypingTarget = el => !!el && (el.isContentEditable || /^(input|textarea|select)$/i.test(el.tagName));
  const NAV_ITEM = () => viewMode === "list" ? ".list-row" : ".box-cell";
  function gridColumns(grid, items) {
    const tracks = (getComputedStyle(grid).gridTemplateColumns || "").split(/\s+/).filter(t => t.endsWith("px"));
    if (tracks.length) return tracks.length;
    if (!items || !items.length) return 1;
    const top = items[0].offsetTop;
    return Math.max(1, items.filter(el => el.offsetTop === top).length);
  }
  function moveSelection(dx, dy) {
    const grid = $("grid"), cells = [...grid.querySelectorAll(NAV_ITEM())];
    if (!cells.length) return;
    const cur = cells.findIndex(el => el.classList.contains("selected")
      || (current && el.dataset.cat === catId(current) && Number(el.dataset.id) === selectedId));
    const next = cur < 0 ? 0 : cur + (dx || dy * gridColumns(grid, cells));
    if (next < 0 || next >= cells.length) return;
    const el = cells[next];
    cells.forEach(x => x.classList.remove("selected"));
    el.classList.add("selected");
    el.scrollIntoView({ block: "nearest" });
    const c = catByIdMap.get(el.dataset.cat), id = Number(el.dataset.id);
    if (c && Number.isInteger(id)) openDetail(c, id);
  }
  document.addEventListener("keydown", e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); saveToFile(false); return; }
    if ((viewMode !== "grid" && viewMode !== "list") || e.ctrlKey || e.metaKey || e.altKey) return;
    if (isTypingTarget(e.target) || document.querySelector(".modal:not(.hidden)")) return;
    const step = GRID_NAV[e.key.toLowerCase()];
    if (!step) return;
    e.preventDefault();
    moveSelection(step[0], step[1]);
  });

  // ── Search / filter wiring ─────────────────────────────────────────────
  let searchTimer = null;
  $("searchInput").addEventListener("input", function () {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { filters.text = this.value.trim(); updateLevelFilterAvailability(); renderGrid(); updateSearchTitle(); }, 120);
  });
  $("searchAll").addEventListener("change", function () { filters.searchAll = this.checked; updateLevelFilterAvailability(); renderGrid(); updateSearchTitle(); });
  document.querySelectorAll('input[name="ownedFilter"]').forEach(r =>
    r.addEventListener("change", function () { if (this.checked) { filters.owned = this.value; renderGrid(); } }));
  $("sortSelect").addEventListener("change", function () { filters.sort = this.value; renderGrid(); });
  $("elementSelect").addEventListener("change", function () { filters.element = this.value; renderGrid(); });
  $("affSelect").addEventListener("change", function () { filters.aff = this.value; renderGrid(); });
  $("slotSelect").addEventListener("change", function () { filters.slots = this.value; renderGrid(); });
  $("defSelect").addEventListener("change", function () { filters.def = this.value; renderGrid(); });
  document.querySelectorAll('input[name="armorClassFilter"]').forEach(r =>
    r.addEventListener("change", function () { if (this.checked) { filters.armorClass = this.value; renderGrid(); } }));
  const armorGenderRadios = [...document.querySelectorAll('input[name="armorGenderFilter"]')];
  const syncArmorGender = () => armorGenderRadios.forEach(r => { r.checked = r.value === settings.armorGender; });
  armorGenderRadios.forEach(r => r.addEventListener("change", function () {
    if (!this.checked) return;
    settings.armorGender = this.value;
    saveSettings();
    markDirty();              // it rides along in the save, like the other settings
    updateProgress();         // totals, sidebar fractions and the tier colouring each icon
    renderGrid();
  }));
  syncArmorGender();
  toggleSyncs.push(syncArmorGender);   // a loaded save brings its own hunter
  function updateViewHeader() {
    if (viewMode === "totals") { $("catTitle").textContent = "All categories"; $("catCount").textContent = ""; }
    else if (viewMode === "checklist") {
      const n = targetCount();
      $("catTitle").textContent = "Checklist";
      $("catCount").textContent = `${n} target${n === 1 ? "" : "s"}`;
    } else updateSearchTitle();
  }
  function setView(v) {
    viewMode = (v === "list" || v === "materials" || v === "routes" || v === "totals" || v === "checklist") ? v : "grid";
    try { localStorage.setItem(VIEW_KEY, viewMode); } catch (e) {}
    $("viewToggle").querySelectorAll("button").forEach(b => b.classList.toggle("active", b.dataset.view === viewMode));
    updateViewHeader();
    renderGrid();
  }
  $("viewToggle").querySelectorAll("button").forEach(b => b.addEventListener("click", () => setView(b.dataset.view)));
  function updateSearchTitle() {
    if (filters.searchAll && filters.text) { $("catTitle").textContent = `Search: "${filters.text}"`; $("catCount").textContent = ""; }
    else if (current) { $("catTitle").textContent = current.label; updateProgress(); }
  }

  // ── Theme ──────────────────────────────────────────────────────────────
  const hexRgb = h => { h = h.replace("#", ""); return [0, 2, 4].map(i => parseInt(h.substr(i, 2), 16)); };
  const clamp = n => Math.max(0, Math.min(255, Math.round(n)));
  const clamp01 = n => Math.max(0, Math.min(1, n));
  const rgbToHsl = ([r, g, b]) => {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min, l = (max + min) / 2;
    if (d === 0) return [0, 0, l];
    const s = d / (1 - Math.abs(2 * l - 1));
    const h = max === r ? ((g - b) / d + (g < b ? 6 : 0)) / 6 : max === g ? ((b - r) / d + 2) / 6 : ((r - g) / d + 4) / 6;
    return [h, s, l];
  };
  const hslToRgb = ([h, s, l]) => {
    const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h * 6) % 2 - 1)), m = l - c / 2;
    const hi = Math.floor(h * 6) % 6;
    const [r, g, b] = hi === 0 ? [c, x, 0] : hi === 1 ? [x, c, 0] : hi === 2 ? [0, c, x] : hi === 3 ? [0, x, c] : hi === 4 ? [x, 0, c] : [c, 0, x];
    return [r + m, g + m, b + m].map(v => clamp(v * 255));
  };
  const darken = (rgb, f) => { const [h, s, l] = rgbToHsl(rgb); return hslToRgb([h, s, clamp01(l * f)]); };
  const lighten = (rgb, b) => { const [h, s, l] = rgbToHsl(rgb); return hslToRgb([h, s, clamp01(l + (1 - l) * b)]); };
  const cssRgb = rgb => `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
  function applyTheme(hex) {
    const c = hexRgb(hex), r = document.documentElement.style;
    r.setProperty("--bg", cssRgb(darken(c, .70)));
    r.setProperty("--bg1", cssRgb(darken(c, .80)));
    r.setProperty("--grid-bg", cssRgb(darken(c, .35)));
    r.setProperty("--content-bg", cssRgb(darken(c, .55)));
    r.setProperty("--panel-bg", cssRgb(darken(c, .40)));
    r.setProperty("--bg2", cssRgb(darken(c, .95)));
    r.setProperty("--hover", cssRgb(darken(c, .30)));
    r.setProperty("--accent", cssRgb(darken(c, .7)));
    r.setProperty("--accent-hover", cssRgb(lighten(c, .4)));
    r.setProperty("--text", "#ffffff");
    r.setProperty("--text-dim", "#fffffff5");
    r.setProperty("--line", "rgba(255,255,255,0.12)");
    r.setProperty("--card", "rgba(255,255,255,0.05)");
    try { localStorage.setItem(THEME_KEY, hex); } catch (e) {}
    document.querySelectorAll(".swatch").forEach(s => s.classList.toggle("sel", s.dataset.hex === hex));
    const titleIcon = document.querySelector(".title-icon");
    if (titleIcon) {
      const t = themeByHex(hex);
      titleIcon.src = t ? monsterIcon(t.icon || t.name) : FALLBACK_ICON;
    }
  }
  function buildSwatches() {
    const wrap = $("swatches"); wrap.innerHTML = "";
    for (const t of THEMES) {
      const d = document.createElement("div");
      d.className = "swatch"; d.dataset.hex = t.hex; d.style.background = t.hex; d.title = t.icon || t.name;
      d.innerHTML = `<img class="swatch-icon" src="${monsterIcon(t.icon || t.name)}" alt=""><span>${t.name}</span>`;
      d.addEventListener("click", () => applyTheme(t.hex));
      wrap.appendChild(d);
    }
  }

  // ── Modals ─────────────────────────────────────────────────────────────
  function bindModal(btnId, modalId, closeId) {
    $(btnId).addEventListener("click", () => $(modalId).classList.remove("hidden"));
    $(closeId).addEventListener("click", () => $(modalId).classList.add("hidden"));
    $(modalId).addEventListener("click", e => { if (e.target.id === modalId) $(modalId).classList.add("hidden"); });
  }
  bindModal("aboutBtn", "aboutModal", "aboutClose");
  bindModal("linksBtn", "linksModal", "linksClose");
  bindModal("helpBtn", "helpModal", "helpClose");
  bindModal("themeBtn", "themeModal", "themeClose");

  // ── Browser storage ────────────────────────────────────────────────────
  function readLocalSave() {
    let raw; try { raw = localStorage.getItem(AUTOSAVE_KEY); } catch (e) { return null; }
    if (!raw) return null;
    let obj; try { obj = JSON.parse(raw); } catch (e) { return null; }
    if (validateSave(obj)) return null;
    const hasAny = KINDS.some(k => obj.owned[k] && Object.values(obj.owned[k]).some(a => a.length))
      || (obj.checklist && obj.checklist.targets && KINDS.some(k => Object.keys(obj.checklist.targets[k] || {}).length));
    return hasAny ? obj : null;
  }
  function loadFromBrowser() {
    const obj = readLocalSave();
    if (!obj) return;
    if (localSaveEnabled) {
      applySave(obj); clearDirty();
      toast("Collection loaded from this browser.");
      return;
    }
    $("restoreBanner").classList.remove("hidden");
    $("restoreYes").addEventListener("click", () => { applySave(obj); clearDirty(); $("restoreBanner").classList.add("hidden"); });
    $("restoreNo").addEventListener("click", () => $("restoreBanner").classList.add("hidden"));
  }
  function bindToggle(id, get, set) {
    const el = $(id);
    const sync = () => el.setAttribute("aria-checked", get() ? "true" : "false");
    sync();
    el.addEventListener("click", () => { set(!get()); sync(); });
    return sync;
  }
  function bindSetting(id, key, onChange) {
    toggleSyncs.push(bindToggle(id, () => settings[key], v => {
      settings[key] = v;
      saveSettings();
      markDirty();
      if (onChange) onChange();
    }));
  }
  bindSetting("clickLevelToggle", "clickLevel");
  bindSetting("ctrlRemoveToggle", "ctrlRemove");
  bindSetting("altMaxToggle", "altMax");
  bindSetting("shiftTargetToggle", "shiftTarget");
  bindSetting("spendMatsToggle", "spendMats");
  bindToggle("localSaveToggle", () => localSaveEnabled, v => {
    localSaveEnabled = v;
    try {
      localStorage.setItem(LOCAL_ENABLED_KEY, localSaveEnabled ? "1" : "0");
      if (localSaveEnabled) scheduleAutosave();
      else dropOwnSectionFromStorage();
    } catch (e) {}
    toast(localSaveEnabled ? "Saving your collection in this browser." : "Browser save turned off and cleared.");
  });
  $("clearLocalBtn").addEventListener("click", () => {
    if (!confirm("Clear your collection from this browser?\n\n"
      + "This erases the saved copy and resets what's currently tracked, including your "
      + "checklist targets and every material count you've entered. "
      + "Collections you've saved to a file are not affected.")) return;
    clearTimeout(autosaveTimer);
    dropOwnSectionFromStorage();
    applySave({ owned: {}, levels: {}, ...carriedKeys });
    clearDirty();
    toast("Browser save cleared.");
  });
  document.querySelectorAll(".panel > .panel-head").forEach(h => h.addEventListener("click", () => {
    const p = h.parentElement;
    p.dataset.open = p.dataset.open === "true" ? "false" : "true";
  }));

  // ── Deep links ─────────────────────────────────────────────────────────
  // `#w:great_sword/12` or `#a:head/1` opens that piece straight away.
  function openFromHash() {
    const m = /^#([wa]):([a-z_]+)\/(\d+)$/.exec(location.hash || "");
    if (!m) return false;
    const c = catByIdMap.get(`${m[1]}:${m[2]}`);
    if (!c) return false;
    const id = Number(m[3]);
    if (!entryOf(c, id)) return false;
    selectCategory(c);
    openDetail(c, id);
    return true;
  }

  // ── Init ───────────────────────────────────────────────────────────────
  injectRarityStyles();
  buildSidebar();
  buildRarityFilters();
  buildElementFilter();
  buildSwatches();
  let savedTheme = DEFAULT_HEX;
  try { savedTheme = migrateHex(localStorage.getItem(THEME_KEY)) || savedTheme; } catch (e) {}
  applyTheme(savedTheme);
  $("viewToggle").querySelectorAll("button").forEach(b => b.classList.toggle("active", b.dataset.view === viewMode));
  selectCategory(CATS[0]);
  updateProgress();
  loadFromBrowser();
  openFromHash();
  window.addEventListener("hashchange", openFromHash);

  // Once MHFU has swapped in, Chrome still draws each select's text too low until the select is
  // restyled. A font-family round trip restyles them.
  if (document.fonts) document.fonts.load("1em MHFU").then(() => {
    const selects = document.querySelectorAll("select");
    selects.forEach(s => { s.style.fontFamily = "serif"; });
    selects.forEach(s => getComputedStyle(s).fontFamily);
    selects.forEach(s => { s.style.fontFamily = ""; });
  }, () => {});
})();
