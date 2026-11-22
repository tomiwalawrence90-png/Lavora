/* ==========================================
   LAVORA 4.0 — Social gaming network
   Created by Lawrence Balogun
   Supabase backend (tables: profiles, posts, messages)
========================================== */

const SUPABASE_URL = "https://mbrhbowvygksyskzhjsq.supabase.co";
const SUPABASE_KEY = "sb_publishable_4qqW-cN_LSqOiPlA4KfeXA_87R9s7B-";
const GLOBAL_CHAT_ROOM_ID = "b7f6ca3f-f43f-4c36-b28e-17815d70912a";
const MEDIA_BUCKET = "post-media"; // optional Storage bucket (see README)
const MAX_MEDIA_MB = 25;

// Supabase is optional: if the CDN script can't load (offline) or the server is unreachable, LAVORA runs on-device.
let db = null;
try { if (window.supabase) db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY); } catch (_) { db = null; }
let localMode = !db;                      // true => everything is stored on this device
const isNetErr = e => !e || /fetch|network|failed|load|timeout|abort/i.test(String(e.message || e));
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (_) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (_) { return false; } }
};
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : "id" + Date.now() + Math.random().toString(16).slice(2));
const get = id => document.getElementById(id);
const icon = (name, cls = "ic") => `<svg class="${cls}"><use href="#i-${name}"/></svg>`;

// img/banner: images/<slug>.jpg (600x800 card art) and images/<slug>-banner.jpg (1600x600). Games without a photo fall back to an SVG.
const G = (slug, name, cat, meta, mono, o = {}) => ({ id: slug, name, cat, meta, mono, img: `images/${slug}.jpg`, banner: `images/${slug}-banner.jpg`, fallback: `images/${slug}.svg`, ...o });
const GAMES = [
  G("ea-sports-fc", "EA SPORTS FC", "Football", "Console / PC", "FC"),
  G("efootball", "eFootball", "Football", "Mobile / Console", "eF"),
  G("fc-mobile", "FC Mobile", "Football", "Mobile", "FM"),
  G("rocket-league", "Rocket League", "Sports", "Cars meet football · PC / Console", "RL"),
  G("call-of-duty-mobile", "Call of Duty Mobile", "Shooter", "Mobile", "CD"),
  G("valorant", "Valorant", "Shooter", "Competitive · PC", "VA"),
  G("overwatch-2", "Overwatch 2", "Shooter", "Hero shooter · PC / Console", "OW"),
  G("rainbow-six-siege", "Rainbow Six Siege", "Shooter", "Tactical · PC / Console", "R6"),
  G("blood-strike", "Blood Strike", "Shooter", "Mobile / PC", "BS", { img: null, banner: null, fallback: "images/blood-strike.svg" }),
  G("free-fire", "Free Fire", "Battle Royale", "Mobile", "FF"),
  G("pubg-mobile", "PUBG Mobile", "Battle Royale", "Battle Royale · Mobile", "PU"),
  G("fortnite", "Fortnite", "Battle Royale", "All platforms", "FN"),
  G("apex-legends", "Apex Legends", "Battle Royale", "PC / Console / Mobile", "AL"),
  G("mobile-legends", "Mobile Legends", "MOBA", "MOBA · Mobile", "ML", { img: null, banner: null, fallback: "images/mobile-legends.svg" }),
  G("league-of-legends", "League of Legends", "MOBA", "MOBA · PC", "LL"),
  G("dota-2", "Dota 2", "MOBA", "MOBA · PC", "D2"),
  G("elden-ring", "Elden Ring", "RPG", "Action RPG · PC / Console", "ER"),
  G("genshin-impact", "Genshin Impact", "RPG", "Open world · All platforms", "GI"),
  G("asphalt-legends-unite", "Asphalt Legends Unite", "Racing", "Mobile / PC", "AS"),
  G("forza-horizon-5", "Forza Horizon 5", "Racing", "PC / Xbox", "FH"),
  G("minecraft", "Minecraft", "Sandbox", "Multiple platforms", "MC"),
  G("roblox", "Roblox", "Sandbox", "Platform · Many games", "RB"),
  G("gta-v", "GTA V", "Sandbox", "Open world · PC / Console", "GV"),
  G("stardew-valley", "Stardew Valley", "Simulation", "Farming · All platforms", "SV"),
  G("the-sims-4", "The Sims 4", "Simulation", "Life sim · PC / Console", "S4"),
  G("tekken-8", "Tekken 8", "Fighting", "Console / PC", "T8"),
  G("among-us", "Among Us", "Party", "Mobile / PC", "AU")
];
const FEATURED = ["ea-sports-fc", "fortnite", "call-of-duty-mobile", "elden-ring", "forza-horizon-5", "league-of-legends", "minecraft", "genshin-impact"];
const CATEGORIES = ["All", "Football", "Sports", "Shooter", "Battle Royale", "MOBA", "RPG", "Racing", "Sandbox", "Simulation", "Fighting", "Party"];
const GAME_ALIASES = { "Asphalt": "Asphalt Legends Unite", "PUBG": "PUBG Mobile" };   // names saved by older versions
const normGames = arr => [...new Set((arr || []).map(n => GAME_ALIASES[n] || n))];
const gameByName = n => GAMES.find(g => g.name === (GAME_ALIASES[n] || n));
// <img> that falls back to the SVG art, then hides itself (the gradient/monogram behind it stays)
function gameImg(g, kind = "img", cls = "") {
  const im = document.createElement("img"); im.alt = ""; im.loading = "lazy"; im.decoding = "async"; if (cls) im.className = cls;
  if (kind === "banner") { im.width = 1600; im.height = 600; } else { im.width = 600; im.height = 800; }
  const steps = [g[kind === "banner" ? "banner" : "img"], g.fallback].filter(Boolean); let i = 0;
  im.onerror = () => { i++; if (i < steps.length) im.src = steps[i]; else { im.onerror = null; im.style.visibility = "hidden"; } };
  im.src = steps[0] || ""; if (!steps.length) im.style.visibility = "hidden";
  return im;
}
const bannerUrl = g => g && (g.banner || null);

// ---------- State ----------
let currentUser = null, currentProfile = null, chatChannel = null, liveStream = null;
let authMode = "signup", activeCategory = "All", selectedMedia = null, postsCache = [];
let myGames = new Set(normGames(JSON.parse(localStorage.getItem("lavora_games") || "[]")));
let following = new Set(JSON.parse(localStorage.getItem("lavora_following") || "[]"));
const profileCache = new Map(), seenMessageIds = new Set();
let feedFilter = "all";
let likes = new Set(LS.get("lavora_likes", []));
let saved = new Set(LS.get("lavora_saved", []));
let comments = LS.get("lavora_comments", {});          // { postId: [ {id,user_id,name,content,created_at} ] }
let notifs = LS.get("lavora_notifs", []);              // [ {id,text,created_at,read} ]
let settings = Object.assign({ motion: false, autoplay: false, notifs: true, seed: true }, LS.get("lavora_settings", {}));

// ---------- Helpers ----------
function listen(id, ev, cb) { const el = get(id); if (el) el.addEventListener(ev, cb); else console.warn("LAVORA: missing", id); }
function toast(text, ms = 2600) {
  const t = get("toast"); t.textContent = text; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), ms);
}
function setMessage(el, text, type = "") { if (el) { el.textContent = text; el.className = "form-message" + (type ? " " + type : ""); } }
const initials = n => ((n || "L").trim().charAt(0) || "L").toUpperCase();
function timeAgo(iso) {
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso)) / 1000));
  if (s < 60) return "just now"; if (s < 3600) return Math.floor(s / 60) + "m ago";
  if (s < 86400) return Math.floor(s / 3600) + "h ago"; if (s < 604800) return Math.floor(s / 86400) + "d ago";
  return new Date(iso).toLocaleDateString();
}
const clockTime = iso => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
function setAvatar(el, url, name) {
  if (!el) return;
  if (url) { el.style.backgroundImage = `url("${String(url).replace(/"/g, "%22")}")`; el.textContent = ""; }
  else { el.style.backgroundImage = ""; el.textContent = initials(name); }
}
const isVideoUrl = u => /\.(mp4|webm|mov)(\?|$)/i.test(u || "");
const save = (k, set) => localStorage.setItem(k, JSON.stringify([...set]));

// ---------- Sheets ----------
let lastFocus = null;
function openSheet(id) {
  lastFocus = document.activeElement;
  get(id).hidden = false; document.body.style.overflow = "hidden";
}
function closeSheet(id) {
  get(id).hidden = true; document.body.style.overflow = "";
  if (lastFocus && lastFocus.focus) lastFocus.focus();
}
document.addEventListener("click", e => {
  const c = e.target.closest("[data-close]");
  if (c) { c.dataset.close === "edit-sheet" ? requestCloseEdit() : closeSheet(c.dataset.close); }
});
document.addEventListener("keydown", e => {
  if (e.key !== "Escape") return;
  if (!get("edit-sheet").hidden) requestCloseEdit();
  else ["game-sheet", "search-sheet", "notif-sheet"].forEach(id => { if (!get(id).hidden) closeSheet(id); });
  closeMenus(); closeSidebar();
});

// ---------- Screens & navigation ----------
const screens = { welcome: get("welcome-screen"), auth: get("auth-screen"), onboard: get("onboard-screen"), dash: get("dashboard-screen") };
function show(which) {
  screens.welcome.hidden = which !== "welcome"; screens.auth.hidden = which !== "auth"; screens.onboard.hidden = which !== "onboard"; screens.dash.hidden = which !== "dash";
  window.scrollTo(0, 0);
}
const PAGES = ["home", "games", "live", "live-studio", "messages", "saved", "settings", "profile", "post", "user"];
const BOTTOM = ["home", "games", "live", "messages", "profile"];
function navigateToPage(name, { push = true, hash = null } = {}) {
  name = String(name).replace("-page", ""); if (!PAGES.includes(name)) name = "home";
  PAGES.forEach(p => { const el = get(p + "-page"); if (el) el.hidden = p !== name; });
  hash = hash || name; document.body.classList.toggle("on-post", name === "post");
  const key = name === "live-studio" ? "live" : name === "post" ? "home" : name === "user" ? "" : name;
  document.querySelectorAll(".nav-button").forEach(b => b.classList.toggle("active", b.dataset.page === key));
  document.querySelectorAll(".sb-link[data-nav]").forEach(b => b.classList.toggle("active", b.dataset.nav === name));
  closeSidebar(); closeMenus();
  if (push && location.hash !== "#" + hash) history.pushState({ page: name, inApp: true }, "", "#" + hash);
  const pt = { home: "Home", games: "Games", live: "Live", "live-studio": "Live Studio", messages: "Chat", saved: "Saved", settings: "Settings", profile: "Profile", post: "Post", user: "Profile" };
  document.title = "LAVORA | " + (pt[name] || "Home");
  window.scrollTo({ top: 0 });
  if (name === "games") { renderCategories(); renderGames(); renderMyGames(); renderFeatured(); }
  if (name === "saved") { renderSaved(); if (!postsCache.length) loadPosts().then(renderSaved); }
  if (name !== "live-studio") stopCamera();
  if (name === "messages") loadMessages();
  if (name === "profile") { updateProfile(); loadStats(); }
  if (name === "home") loadPosts();
}
window.showPage = navigateToPage;
function route(h, push = false) {
  h = h || "home"; const i = h.indexOf("/"), base = i < 0 ? h : h.slice(0, i), arg = i < 0 ? "" : decodeURIComponent(h.slice(i + 1));
  if (base === "post" && arg) return openPost(arg, { push });
  if (base === "user" && arg) return openUser(arg, { push });
  navigateToPage(base === "post" || base === "user" ? "home" : base, { push });
}
function goBack() { if (history.state && history.state.inApp) history.back(); else navigateToPage("home"); }
window.addEventListener("popstate", () => { if (currentUser && !screens.dash.hidden) route(location.hash.slice(1) || "home", false); });

// ---------- Sidebar ----------
function openSidebar() { get("sidebar-wrap").hidden = false; document.body.style.overflow = "hidden"; requestAnimationFrame(() => get("sidebar-wrap").classList.add("open")); get("open-sidebar").setAttribute("aria-expanded", "true"); get("close-sidebar").focus(); }
function closeSidebar() {
  const w = get("sidebar-wrap"); if (!w || w.hidden) return;
  w.classList.remove("open"); document.body.style.overflow = ""; get("open-sidebar").setAttribute("aria-expanded", "false");
  setTimeout(() => { if (!w.classList.contains("open")) w.hidden = true; }, 240);
}
listen("open-sidebar", "click", openSidebar);
listen("close-sidebar", "click", closeSidebar);
listen("sidebar-backdrop", "click", closeSidebar);
listen("sb-notifs", "click", () => { closeSidebar(); openNotifs(); });
listen("sb-search", "click", () => { closeSidebar(); openSearch(); });
listen("sb-logout", "click", () => { closeSidebar(); doLogout(); });
(function swipeToClose() {   // swipe the drawer left to close it
  const sb = get("sidebar"); let x0 = null;
  sb.addEventListener("touchstart", e => { x0 = e.touches[0].clientX; }, { passive: true });
  sb.addEventListener("touchend", e => { if (x0 !== null && x0 - e.changedTouches[0].clientX > 60) closeSidebar(); x0 = null; }, { passive: true });
})();
function refreshSidebarUser() {
  const p = currentProfile || {}, name = p.display_name || p.username || "LAVORA Member";
  get("sb-name").textContent = name; get("sb-user").textContent = p.username ? "@" + p.username : (currentUser?.email || "");
  setAvatar(get("sb-avatar"), p.avatar_url, name);
}
document.addEventListener("click", e => {
  if (e.target.closest("[data-back]")) { goBack(); return; }
  const usr = e.target.closest("[data-user]"); if (usr && currentUser) { e.preventDefault(); openUser(usr.dataset.user); return; }
  const nav = e.target.closest("[data-nav]"); if (nav) { e.preventDefault(); if (!currentUser) return; navigateToPage(nav.dataset.nav); return; }
  const btn = e.target.closest(".nav-button"); if (btn) navigateToPage(btn.dataset.page);
  if (!e.target.closest(".menu") && !e.target.closest(".post-menu-btn")) closeMenus();
});

// ---------- Auth ----------
function updateAuthMode() {
  const su = authMode === "signup";
  get("auth-title").textContent = su ? "Create account" : "Welcome back";
  get("auth-description").textContent = su ? "Join the LAVORA community." : "Log in to your LAVORA account.";
  get("auth-submit").textContent = su ? "Create account" : "Log in";
  get("password").autocomplete = su ? "new-password" : "current-password";
  [["tab-signup", su], ["tab-login", !su]].forEach(([id, on]) => { get(id).classList.toggle("active", on); get(id).setAttribute("aria-selected", on); });
  setMessage(get("auth-message"), "");
}
listen("getStarted", "click", () => show("auth"));
listen("back-home", "click", () => show("welcome"));
listen("tab-signup", "click", () => { authMode = "signup"; updateAuthMode(); });
listen("tab-login", "click", () => { authMode = "login"; updateAuthMode(); });
listen("toggle-password", "click", () => {
  const p = get("password"), s = p.type === "password"; p.type = s ? "text" : "password"; get("toggle-password").textContent = s ? "Hide" : "Show";
});
listen("auth-form", "submit", async e => {
  e.preventDefault();
  const email = get("email").value.trim(), password = get("password").value, msg = get("auth-message"), submit = get("auth-submit");
  if (!email || !password) return setMessage(msg, "Enter your email and password.", "error");
  if (password.length < 6) return setMessage(msg, "Password must be at least 6 characters.", "error");
  if (!/^\S+@\S+\.\S+$/.test(email)) return setMessage(msg, "Enter a valid email address.", "error");
  submit.disabled = true; setMessage(msg, "Please wait…");
  try {
    if (!localMode) {
      try {
        const r = authMode === "signup" ? await db.auth.signUp({ email, password }) : await db.auth.signInWithPassword({ email, password });
        if (r.error) throw r.error;
        if (authMode === "signup" && r.data.user?.id) LS.set("lavora_onboard_" + r.data.user.id, true);
        if (r.data.session) { await enterApp(r.data.session.user); return; }
        return setMessage(msg, "Account created! Check your email to confirm it, then log in.", "ok");
      } catch (err) {
        if (!isNetErr(err)) throw err;
        localMode = true; toast("Server unreachable: using an on-device account");
      }
    }
    await enterApp(await localAuth(authMode, email, password));
  } catch (err) { setMessage(msg, err.message, "error"); } finally { submit.disabled = false; }
});
// On-device accounts (used when no server is reachable)
async function sha(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}
async function localAuth(mode, email, password) {
  const users = LS.get("lavora_local_users", {}), key = email.toLowerCase(), hash = await sha(key + ":" + password);
  if (mode === "signup") {
    if (users[key]) throw new Error("An account with this email already exists. Log in instead.");
    users[key] = { id: uid(), hash, created_at: new Date().toISOString() }; LS.set("lavora_local_users", users); LS.set("lavora_onboard_" + users[key].id, true);
  } else if (!users[key] || users[key].hash !== hash) throw new Error("Wrong email or password.");
  LS.set("lavora_local_session", key);
  return { id: users[key].id, email: key, created_at: users[key].created_at };
}
function localSessionUser() {
  const key = LS.get("lavora_local_session", null), u = key && LS.get("lavora_local_users", {})[key];
  return u ? { id: u.id, email: key, created_at: u.created_at } : null;
}
let enteringId = null, profileFetchOk = false;
async function enterApp(user) {
  if (enteringId === user.id || (currentUser && currentUser.id === user.id && (!screens.dash.hidden || !screens.onboard.hidden))) return;
  enteringId = user.id; currentUser = user;
  try { await updateProfile(); } finally { enteringId = null; }
  if (LS.get("lavora_onboard_" + user.id, false) || (profileFetchOk && !currentProfile?.username)) return startOnboarding();   // new account: design profile + pick games
  finishEnter();
}
function finishEnter() {
  show("dash");
  route(location.hash.slice(1), false);
  history.replaceState({ page: location.hash.slice(1) || "home" }, "", location.hash || "#home");
  syncMyGamesFromProfile(); renderGames(); renderMyGames(); updateNotifBadge();
  if (window.lavoraFeatures) lavoraFeatures.onEnter();
  if (!LS.get("lavora_welcomed_" + currentUser.id, false)) { LS.set("lavora_welcomed_" + currentUser.id, true); addNotif("Welcome to LAVORA! Share your first post from Home."); }
}

// ---------- Profiles ----------
async function fetchProfiles(ids) {
  if (typeof SEED_USERS !== "undefined") ids.forEach(id => { if (SEED_USERS[id]) profileCache.set(id, SEED_USERS[id]); });
  const missing = [...new Set(ids)].filter(id => id && !profileCache.has(id));
  if (!missing.length) return;
  try {
    if (localMode) { const all = LS.get("lavora_local_profiles", {}); missing.forEach(id => { if (all[id]) profileCache.set(id, all[id]); }); }
    else { const { data } = await db.from("profiles").select("*").in("id", missing); (data || []).forEach(p => profileCache.set(p.id, p)); }
  } catch (_) {}
  missing.forEach(id => { if (!profileCache.has(id)) profileCache.set(id, null); });
}
function nameFor(id) {
  if (currentUser && id === currentUser.id) return currentProfile?.display_name || currentProfile?.username || "You";
  const p = profileCache.get(id); return p?.display_name || p?.username || "LAVORA Member";
}
function avatarFor(id) {
  if (currentUser && id === currentUser.id) return currentProfile?.avatar_url || "";
  return profileCache.get(id)?.avatar_url || "";
}
async function updateProfile() {
  if (!currentUser) return;
  profileFetchOk = false;
  try {
    let data = null;
    if (localMode) data = LS.get("lavora_local_profiles", {})[currentUser.id] || null;
    else { const r = await db.from("profiles").select("*").eq("id", currentUser.id).maybeSingle(); if (r.error) throw r.error; data = r.data; }
    currentProfile = data || null; if (data) profileCache.set(currentUser.id, data); profileFetchOk = true;
  } catch (err) { console.error("LAVORA profile error:", err); }
  const p = currentProfile || {}, display = p.display_name || p.username || "LAVORA Member";
  get("profile-display-name").textContent = display;
  get("profile-username").textContent = p.username ? "@" + p.username : "Add a username";
  get("profile-bio").textContent = p.bio || "Your place in the LAVORA community.";
  const c = get("profile-country"); c.hidden = !p.country; c.textContent = p.country ? "📍 " + p.country : "";
  get("profile-email").textContent = currentUser.email || "";
  setAvatar(get("profile-avatar"), p.avatar_url, display);
  setAvatar(get("composer-avatar"), p.avatar_url, display);
  renderMyGames(); refreshSidebarUser();
}
async function loadStats() {
  if (!currentUser) return;
  get("stat-games").textContent = myGames.size;
  const joined = currentUser.created_at ? new Date(currentUser.created_at) : null;
  get("stat-joined").textContent = joined ? joined.toLocaleDateString([], { month: "short", year: "2-digit" }) : "–";
  const localCount = LS.get("lavora_local_posts", []).filter(p => p.user_id === currentUser.id).length;
  get("stat-posts").textContent = localCount;
  if (localMode) return;
  try {
    const { count, error } = await db.from("posts").select("id", { count: "exact", head: true }).eq("user_id", currentUser.id);
    if (!error && count !== null) get("stat-posts").textContent = count + localCount;
  } catch (_) {}
}

// ---------- Edit profile sheet ----------
const edit = { initial: null, games: new Set(), avatar: { mode: "keep", blob: null, preview: "" }, usernameOk: true, checkTimer: null };
const USERNAME_RE = /^[A-Za-z0-9_.]{3,30}$/;

(function fillCountries() {
  try {
    const dn = new Intl.DisplayNames(["en"], { type: "region" }), names = new Set();
    for (let a = 65; a < 91; a++) for (let b = 65; b < 91; b++) {
      const code = String.fromCharCode(a, b);
      try { const n = dn.of(code); if (n && n !== code && !/unknown|region/i.test(n)) names.add(n); } catch (_) {}
    }
    const dl = get("country-list");
    [...names].sort().forEach(n => { const o = document.createElement("option"); o.value = n; dl.appendChild(o); });
  } catch (_) {}
})();

function editSnapshot() {
  return JSON.stringify({
    n: get("edit-display-name").value.trim(), u: get("edit-username").value.trim(),
    b: get("edit-bio").value.trim(), c: get("edit-country").value.trim(),
    g: [...edit.games].sort(), a: edit.avatar.mode + (edit.avatar.mode === "preset" ? edit.avatar.preview : "")
  });
}
function isEditDirty() { return edit.initial !== null && editSnapshot() !== edit.initial; }
function refreshEditState() {
  get("count-name").textContent = get("edit-display-name").value.length + "/50";
  get("count-bio").textContent = get("edit-bio").value.length + "/250";
  get("count-games").textContent = edit.games.size + " selected";
  get("save-profile").disabled = !isEditDirty() || !edit.usernameOk;
}
function renderEditAvatar() {
  const name = get("edit-display-name").value || currentProfile?.display_name || "L";
  const url = edit.avatar.mode === "new" || edit.avatar.mode === "preset" ? edit.avatar.preview : edit.avatar.mode === "remove" ? "" : currentProfile?.avatar_url || "";
  setAvatar(get("edit-avatar-preview"), url, name);
  get("avatar-remove").hidden = !url;
  const grid = get("edit-avatar-grid"); grid.replaceChildren();
  PRESET_AVATARS.forEach((p, i) => {
    const on = url === p, b = document.createElement("button"); b.type = "button"; b.className = "av-opt" + (on ? " on" : ""); b.style.backgroundImage = `url("${p}")`;
    b.setAttribute("aria-label", "Avatar " + (i + 1)); b.setAttribute("aria-pressed", on);
    b.addEventListener("click", () => { edit.avatar = { mode: "preset", blob: null, preview: p }; renderEditAvatar(); refreshEditState(); });
    grid.appendChild(b);
  });
}
function renderGamePicker() {
  const box = get("edit-games-picker"); box.replaceChildren();
  const names = [...GAMES.map(g => g.name), ...[...edit.games].filter(n => !GAMES.some(g => g.name === n))];
  names.forEach(n => {
    const on = edit.games.has(n), b = document.createElement("button");
    b.type = "button"; b.className = "chip" + (on ? " on" : ""); b.setAttribute("aria-pressed", on);
    b.innerHTML = (on ? icon("check") : ""); const g = gameByName(n); if (g) { const t = gameImg(g); t.className = "chip-thumb"; b.appendChild(t); } b.append(document.createTextNode(n));
    b.addEventListener("click", () => { on ? edit.games.delete(n) : edit.games.add(n); renderGamePicker(); refreshEditState(); });
    box.appendChild(b);
  });
}
function setUsernameState(kind, text) {
  const s = get("username-state"), h = get("username-hint");
  s.className = "count" + (kind === "ok" ? " ok" : kind === "bad" ? " bad" : ""); s.textContent = text || "";
  h.textContent = kind === "bad" ? text : "3–30 letters, numbers, _ or .";
}
function openEdit() {
  const p = currentProfile || {};
  get("edit-display-name").value = p.display_name || ""; get("edit-username").value = p.username || "";
  get("edit-bio").value = p.bio || ""; get("edit-country").value = p.country || "";
  edit.games = new Set(normGames(Array.isArray(p.favorite_games) && p.favorite_games.length ? p.favorite_games : [...myGames]));
  edit.avatar = { mode: "keep", blob: null, preview: "" }; edit.usernameOk = true;
  setUsernameState("", ""); setMessage(get("profile-edit-status"), "");
  renderEditAvatar(); renderGamePicker();
  edit.initial = editSnapshot(); refreshEditState();
  openSheet("edit-sheet");
}
function requestCloseEdit() {
  if (isEditDirty() && !confirm("Discard your changes?")) return;
  edit.initial = null; closeSheet("edit-sheet");
}
listen("edit-profile", "click", () => currentUser ? openEdit() : toast("Please log in first."));
listen("cancel-profile", "click", requestCloseEdit);
["edit-display-name", "edit-bio", "edit-country"].forEach(id => listen(id, "input", () => { if (id === "edit-display-name") renderEditAvatar(); refreshEditState(); }));

listen("edit-username", "input", () => {
  const v = get("edit-username").value.trim(); clearTimeout(edit.checkTimer);
  if (!v) { edit.usernameOk = false; setUsernameState("bad", "Username is required"); return refreshEditState(); }
  if (!USERNAME_RE.test(v)) { edit.usernameOk = false; setUsernameState("bad", "Use 3–30 letters, numbers, _ or ."); return refreshEditState(); }
  if (v === (currentProfile?.username || "")) { edit.usernameOk = true; setUsernameState("", ""); return refreshEditState(); }
  edit.usernameOk = false; setUsernameState("", "Checking…"); refreshEditState();
  edit.checkTimer = setTimeout(async () => {
    try {
      let data;
      if (localMode) data = Object.values(LS.get("lavora_local_profiles", {})).filter(p => p.id !== currentUser.id && (p.username || "").toLowerCase() === v.toLowerCase());
      else { const r = await db.from("profiles").select("id").eq("username", v).neq("id", currentUser.id).limit(1); if (r.error) throw r.error; data = r.data; }
      if (get("edit-username").value.trim() !== v) return;
      if (data && data.length) { edit.usernameOk = false; setUsernameState("bad", "That username is taken"); }
      else { edit.usernameOk = true; setUsernameState("ok", "✓ Available"); }
    } catch (_) { edit.usernameOk = true; setUsernameState("", ""); }  // can't verify: server will enforce uniqueness on save
    refreshEditState();
  }, 450);
});

// avatar picking: crop to a square, resize, preview
listen("avatar-pick", "click", () => get("avatar-file").click());
listen("avatar-change", "click", () => get("avatar-file").click());
listen("avatar-remove", "click", () => { edit.avatar = { mode: "remove", blob: null, preview: "" }; renderEditAvatar(); refreshEditState(); });
listen("avatar-file", "change", async e => {
  const file = e.target.files[0]; e.target.value = "";
  if (!file) return;
  if (!file.type.startsWith("image/")) return toast("Please choose an image.");
  try {
    const blob = await squareJpeg(file, 384);
    edit.avatar = { mode: "new", blob, preview: URL.createObjectURL(blob) };
    renderEditAvatar(); refreshEditState();
  } catch (_) { toast("Couldn't read that image."); }
});
function squareJpeg(file, size) {
  return new Promise((resolve, reject) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const s = Math.min(img.width, img.height), c = document.createElement("canvas");
      c.width = c.height = size;
      c.getContext("2d").drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
      URL.revokeObjectURL(url);
      c.toBlob(b => b ? resolve(b) : reject(new Error("encode")), "image/jpeg", 0.86);
    };
    img.onerror = () => reject(new Error("load")); img.src = url;
  });
}
const blobToDataUrl = b => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(b); });
async function storeAvatar(blob) {
  if (localMode) return blobToDataUrl(blob);
  try {   // preferred: Supabase Storage
    const path = `${currentUser.id}/avatar-${Date.now()}.jpg`;
    const { error } = await db.storage.from(MEDIA_BUCKET).upload(path, blob, { contentType: "image/jpeg" });
    if (error) throw error;
    return db.storage.from(MEDIA_BUCKET).getPublicUrl(path).data.publicUrl;
  } catch (_) { return blobToDataUrl(blob); }  // fallback: small embedded image, works with no setup
}

// custom game
function addCustomGame() {
  const input = get("edit-custom-game"), v = input.value.trim();
  if (!v) return;
  const existing = [...GAMES.map(g => g.name), ...edit.games].find(n => n.toLowerCase() === v.toLowerCase());
  edit.games.add(existing || v); input.value = "";
  renderGamePicker(); refreshEditState();
}
listen("add-custom-game", "click", addCustomGame);
listen("edit-custom-game", "keydown", e => { if (e.key === "Enter") { e.preventDefault(); addCustomGame(); } });

listen("profile-edit-form", "submit", async e => {
  e.preventDefault();
  const status = get("profile-edit-status"), btn = get("save-profile");
  const username = get("edit-username").value.trim(), displayName = get("edit-display-name").value.trim();
  if (!displayName) return setMessage(status, "Add a display name.", "error");
  if (!USERNAME_RE.test(username)) return setMessage(status, "Check your username.", "error");
  btn.disabled = true; btn.textContent = "Saving…"; setMessage(status, "");
  try {
    let avatar_url = currentProfile?.avatar_url || null;
    if (edit.avatar.mode === "new") avatar_url = await storeAvatar(edit.avatar.blob);
    if (edit.avatar.mode === "preset") avatar_url = edit.avatar.preview;
    if (edit.avatar.mode === "remove") avatar_url = null;
    const favorite_games = [...edit.games];
    const row = { id: currentUser.id, username, display_name: displayName, avatar_url,
      bio: get("edit-bio").value.trim() || null, favorite_games, country: get("edit-country").value.trim() || null };
    await persistProfile(row);
    myGames = new Set(favorite_games); save("lavora_games", myGames);
    profileCache.delete(currentUser.id);
    await updateProfile(); loadStats(); renderGames();
    edit.initial = null; closeSheet("edit-sheet"); toast("Profile saved ✓"); refreshSidebarUser();
  } catch (err) {
    const dup = /duplicate|unique/i.test(err.message);
    if (dup) { edit.usernameOk = false; setUsernameState("bad", "That username is taken"); }
    setMessage(status, dup ? "That username is taken. Try another." : "Could not save: " + err.message, "error");
  } finally { btn.textContent = "Save changes"; refreshEditState(); }
});

async function persistProfile(row) {
  if (localMode) {
    const all = LS.get("lavora_local_profiles", {});
    if (Object.values(all).some(p => p.id !== row.id && (p.username || "").toLowerCase() === row.username.toLowerCase())) throw new Error("duplicate username");
    all[row.id] = row; if (!LS.set("lavora_local_profiles", all)) throw new Error("Not enough storage space. Try a smaller photo.");
  } else {
    const { error } = await db.from("profiles").upsert(row, { onConflict: "id" }); if (error) throw error;
  }
}

// ---------- Sign-up onboarding: design profile, then pick favourite games ----------
const AV_COLORS = [["#8b5cf6", "#3b82f6"], ["#ff5d7e", "#ff9a5d"], ["#12b886", "#3b82f6"], ["#f59e0b", "#ef4444"], ["#6366f1", "#ec4899"], ["#0ea5e9", "#22d3ee"], ["#10b981", "#a3e635"], ["#a855f7", "#f43f5e"]];
const AV_EMOJI = ["🎮", "🎧", "⚔️", "👾", "🚀", "👑", "🐉", "🏆", "🦊", "🔥", "⚡", "🎯"];
const PRESET_AVATARS = AV_EMOJI.map((e, i) => {
  const [a, b] = AV_COLORS[i % AV_COLORS.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="96" height="96" fill="url(#g)"/><text x="48" y="50" font-size="46" text-anchor="middle" dominant-baseline="central">${e}</text></svg>`;
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
});
const ob = { avatar: PRESET_AVATARS[0], blob: null, preview: "", games: new Set(), redo: false };
function renderObAvatars() {
  const grid = get("ob-avatar-grid"); grid.replaceChildren();
  PRESET_AVATARS.forEach((url, i) => {
    const on = !ob.blob && ob.avatar === url, b = document.createElement("button");
    b.type = "button"; b.className = "av-opt" + (on ? " on" : ""); b.style.backgroundImage = `url("${url}")`; b.setAttribute("aria-label", "Avatar " + (i + 1)); b.setAttribute("aria-pressed", on);
    b.addEventListener("click", () => { ob.avatar = url; ob.blob = null; renderObAvatars(); });
    grid.appendChild(b);
  });
  const up = document.createElement("button"); up.type = "button"; up.className = "av-opt av-upload" + (ob.blob ? " on" : ""); up.setAttribute("aria-label", "Upload your own photo");
  if (ob.blob) up.style.backgroundImage = `url("${ob.preview}")`; else up.innerHTML = icon("camera");
  up.addEventListener("click", () => get("ob-avatar-file").click()); grid.appendChild(up);
  setAvatar(get("ob-avatar"), ob.blob ? ob.preview : ob.avatar, get("ob-name").value);
}
function renderObGames() {
  const box = get("ob-games"); box.replaceChildren();
  GAMES.forEach(g => {
    const on = ob.games.has(g.name), b = document.createElement("button"); b.type = "button"; b.className = "ob-game" + (on ? " on" : ""); b.setAttribute("aria-pressed", on);
    const nm = document.createElement("span"); nm.className = "ob-game-name"; nm.textContent = g.name;
    const ck = document.createElement("span"); ck.className = "ob-check"; ck.innerHTML = icon("check");
    b.append(gameImg(g), nm, ck);
    b.addEventListener("click", () => { const now = !ob.games.has(g.name); now ? ob.games.add(g.name) : ob.games.delete(g.name); b.classList.toggle("on", now); b.setAttribute("aria-pressed", now); refreshObCount(); });
    box.appendChild(b);
  });
  refreshObCount();
}
function refreshObCount() { get("ob-count").textContent = ob.games.size + " selected"; }
function obStep(n) { get("ob-step1").hidden = n !== 1; get("ob-step2").hidden = n !== 2; get("ob-bar").style.width = n === 1 ? "50%" : "100%"; if (n === 2) renderObGames(); window.scrollTo(0, 0); }
function startOnboarding(redo = false) {
  ob.redo = redo; get("ob-logout").textContent = redo ? "Cancel" : "Use a different account";
  const p = currentProfile || {}, guess = (currentUser.email || "").split("@")[0].replace(/[^A-Za-z0-9_.]/g, "").slice(0, 30);
  ob.avatar = p.avatar_url || PRESET_AVATARS[Math.floor(Math.random() * PRESET_AVATARS.length)]; ob.blob = null; ob.preview = "";
  ob.games = new Set(normGames(Array.isArray(p.favorite_games) ? p.favorite_games : []));
  get("ob-name").value = p.display_name || ""; get("ob-username").value = p.username || (guess.length >= 3 ? guess : ""); get("ob-bio").value = p.bio || "";
  get("ob-name-count").textContent = get("ob-name").value.length + "/50"; setMessage(get("ob-msg"), ""); setMessage(get("ob-msg2"), "");
  renderObAvatars(); obStep(1); show("onboard");
}
listen("ob-name", "input", () => { get("ob-name-count").textContent = get("ob-name").value.length + "/50"; });
listen("ob-avatar-file", "change", async e => {
  const file = e.target.files[0]; e.target.value = ""; if (!file) return;
  if (!file.type.startsWith("image/")) return toast("Please choose an image.");
  try { const blob = await squareJpeg(file, 384); ob.blob = blob; ob.preview = URL.createObjectURL(blob); renderObAvatars(); } catch (_) { toast("Couldn't read that image."); }
});
listen("ob-step1", "submit", e => {
  e.preventDefault(); const msg = get("ob-msg");
  if (!get("ob-name").value.trim()) return setMessage(msg, "Add a display name.", "error");
  if (!USERNAME_RE.test(get("ob-username").value.trim())) return setMessage(msg, "Username needs 3–30 letters, numbers, _ or .", "error");
  setMessage(msg, ""); obStep(2);
});
listen("ob-back", "click", () => obStep(1));
listen("ob-logout", "click", () => ob.redo ? show("dash") : doLogout());
listen("redo-onboarding", "click", () => currentUser && startOnboarding(true));
listen("ob-finish", "click", async () => {
  const btn = get("ob-finish"), msg = get("ob-msg2"), username = get("ob-username").value.trim();
  btn.disabled = true; btn.textContent = "Saving…"; setMessage(msg, "");
  try {
    const avatar_url = ob.blob ? await storeAvatar(ob.blob) : ob.avatar;
    const row = { id: currentUser.id, username, display_name: get("ob-name").value.trim(), avatar_url, bio: get("ob-bio").value.trim() || null,
      favorite_games: [...ob.games], country: currentProfile?.country || null };
    await persistProfile(row);
    myGames = new Set(row.favorite_games); save("lavora_games", myGames); profileCache.delete(currentUser.id);
    localStorage.removeItem("lavora_onboard_" + currentUser.id); await updateProfile(); finishEnter(); toast(ob.redo ? "Profile updated ✓" : "Welcome to LAVORA!");
  } catch (err) {
    if (/duplicate|unique/i.test(err.message)) { obStep(1); setMessage(get("ob-msg"), "That username is taken. Try another.", "error"); }
    else setMessage(msg, "Could not save: " + err.message, "error");
  } finally { btn.disabled = false; btn.textContent = "Finish"; }
});

// ---------- Games ----------
function renderCategories() {
  const strip = get("category-strip"); strip.replaceChildren();
  CATEGORIES.forEach(c => {
    const b = document.createElement("button"); b.type = "button"; b.className = "cat" + (c === activeCategory ? " active" : "");
    b.textContent = c; b.setAttribute("role", "tab");
    b.addEventListener("click", () => { activeCategory = c; renderCategories(); renderGames(); });
    strip.appendChild(b);
  });
}
function renderGames() {
  const grid = get("game-grid"), q = get("game-search").value.trim().toLowerCase();
  const list = GAMES.filter(g => (activeCategory === "All" || g.cat === activeCategory) && (!q || g.name.toLowerCase().includes(q) || g.cat.toLowerCase().includes(q)));
  get("game-count").textContent = list.length + (list.length === 1 ? " game" : " games");
  grid.replaceChildren();
  if (!list.length) { const p = document.createElement("p"); p.className = "empty-inline"; p.textContent = "No games match your search."; grid.appendChild(p); return; }
  list.forEach(g => {
    const followed = myGames.has(g.name), card = document.createElement("div"); card.className = "game-card" + (followed ? " followed" : "");
    const open = document.createElement("button"); open.type = "button"; open.className = "game-open";
    open.setAttribute("aria-label", `${g.name}: view details`);
    const info = document.createElement("div"); info.className = "game-info"; info.innerHTML = "<h3></h3><p></p>";
    info.querySelector("h3").textContent = g.name; info.querySelector("p").textContent = g.cat + " · " + g.meta;
    open.append(gameImg(g), info); open.addEventListener("click", () => openGame(g.id));
    const add = document.createElement("button"); add.type = "button"; add.className = "game-follow"; add.setAttribute("aria-pressed", followed);
    add.setAttribute("aria-label", followed ? `Remove ${g.name} from My Games` : `Add ${g.name} to My Games`);
    add.textContent = followed ? "✓ Added" : "+ Add"; add.addEventListener("click", () => toggleGame(g.name));
    card.append(open, add); grid.appendChild(card);
  });
}

// ---------- Featured banners (Games page) ----------
let featIdx = 0, featTimer = null, featList = [];
function renderFeatured() {
  const box = get("featured"); if (!box) return;
  featList = FEATURED.map(id => GAMES.find(g => g.id === id)).filter(g => g && g.banner); box.replaceChildren();
  const slides = document.createElement("div"); slides.className = "feat-slides";
  featList.forEach((g, i) => {
    const sl = document.createElement("button"); sl.type = "button"; sl.className = "feat-slide" + (i === featIdx ? " on" : "");
    sl.setAttribute("aria-label", `${g.name}: view details`);
    const meta = document.createElement("div"); meta.className = "feat-meta"; meta.innerHTML = '<span class="eyebrow"></span><h3></h3>';
    meta.querySelector(".eyebrow").textContent = g.cat; meta.querySelector("h3").textContent = g.name;
    sl.append(gameImg(g, "banner"), meta); sl.addEventListener("click", () => openGame(g.id)); slides.appendChild(sl);
  });
  const dots = document.createElement("div"); dots.className = "feat-dots";
  featList.forEach((g, i) => { const d = document.createElement("button"); d.type = "button"; d.className = "feat-dot" + (i === featIdx ? " on" : ""); d.setAttribute("aria-label", "Show " + g.name); d.addEventListener("click", e => { e.stopPropagation(); showFeatured(i); }); dots.appendChild(d); });
  box.append(slides, dots);
  clearInterval(featTimer);
  featTimer = setInterval(() => { if (!get("games-page").hidden && !document.hidden && !settings.motion) showFeatured((featIdx + 1) % featList.length); }, 5000);
}
function showFeatured(i) {
  featIdx = i;
  document.querySelectorAll(".feat-slide").forEach((el, n) => el.classList.toggle("on", n === i));
  document.querySelectorAll(".feat-dot").forEach((el, n) => el.classList.toggle("on", n === i));
}

// ---------- Game detail sheet ----------
let openGameId = null;
function openGame(id) {
  const g = GAMES.find(x => x.id === id); if (!g) return; openGameId = id;
  const ban = get("game-banner"); ban.replaceChildren(gameImg(g, "banner")); ban.classList.toggle("no-photo", !g.banner);
  get("game-sheet-name").textContent = g.name; get("game-sheet-meta").textContent = g.cat + " · " + g.meta;
  const art = get("game-sheet-art"); art.replaceChildren(gameImg(g));
  refreshGameSheet(); openSheet("game-sheet");
}
function refreshGameSheet() {
  const g = GAMES.find(x => x.id === openGameId); if (!g) return;
  const on = myGames.has(g.name), b = get("game-sheet-add");
  b.innerHTML = on ? icon("check") + "In My Games" : icon("userplus") + "Add to My Games"; b.classList.toggle("btn-primary", !on); b.classList.toggle("btn-outline", on);
}
listen("game-sheet-add", "click", async () => { const g = GAMES.find(x => x.id === openGameId); if (g) { await toggleGame(g.name); refreshGameSheet(); } });
listen("game-sheet-live", "click", () => { const g = GAMES.find(x => x.id === openGameId); closeSheet("game-sheet"); navigateToPage("live-studio"); if (g) { get("live-game").value = g.name; get("live-game-custom").value = ""; updateStudioArt(); } });
listen("game-sheet-posts", "click", () => { const g = GAMES.find(x => x.id === openGameId); closeSheet("game-sheet"); openSearch(); if (g) { get("global-search").value = g.name; renderSearch(); } });
function syncMyGamesFromProfile() {
  if (Array.isArray(currentProfile?.favorite_games) && currentProfile.favorite_games.length) { myGames = new Set(normGames(currentProfile.favorite_games)); save("lavora_games", myGames); }
}
async function toggleGame(name) {
  myGames.has(name) ? myGames.delete(name) : myGames.add(name); save("lavora_games", myGames);
  renderGames(); renderMyGames(); refreshGameSheet(); toast(myGames.has(name) ? `${name} added to My Games` : `${name} removed`);
  if (currentUser && currentProfile && localMode) { currentProfile.favorite_games = [...myGames]; const all = LS.get("lavora_local_profiles", {}); all[currentUser.id] = currentProfile; LS.set("lavora_local_profiles", all); }
  else if (currentUser && currentProfile) {
    try { await db.from("profiles").update({ favorite_games: [...myGames] }).eq("id", currentUser.id); currentProfile.favorite_games = [...myGames]; } catch (_) {}
  }
}
function renderMyGames() {
  const names = [...myGames], row = get("my-games-row"), prof = get("profile-game-list");
  get("my-games-block").hidden = !names.length; get("stat-games").textContent = names.length;
  row.replaceChildren(); prof.replaceChildren();
  if (!names.length) { const s = document.createElement("span"); s.className = "chip"; s.textContent = "No games yet"; prof.appendChild(s); }
  names.forEach(n => {
    const g = gameByName(n);
    const b = document.createElement("button"); b.type = "button"; b.className = "chip on"; b.title = "Remove";
    b.innerHTML = icon("check"); b.append(document.createTextNode(n)); b.addEventListener("click", () => toggleGame(n)); row.appendChild(b);
    const s = document.createElement("button"); s.type = "button"; s.className = "chip game-chip"; s.addEventListener("click", () => g && openGame(g.id));
    if (g) { const t = gameImg(g); t.className = "chip-thumb"; s.appendChild(t); }
    s.append(document.createTextNode(n)); prof.appendChild(s);
  });
  // profile banner = first favourite game that has a banner
  const top = names.map(gameByName).find(bannerUrl), pb = get("profile-banner");
  pb.style.backgroundImage = top ? `linear-gradient(#06070e00,#0c0e1d99),url("${top.banner}")` : "";
  pb.classList.toggle("has-game", !!top);
}
listen("game-search", "input", renderGames);
(function fillStudioGames() {
  const sel = get("live-game");
  GAMES.forEach(g => { const o = document.createElement("option"); o.textContent = g.name; sel.appendChild(o); });
  const other = document.createElement("option"); other.textContent = "Other games"; sel.appendChild(other);
})();
function updateStudioArt() {
  const g = GAMES.find(x => x.name === get("live-game").value), ph = get("video-placeholder");
  ph.style.backgroundImage = g && g.banner ? `linear-gradient(#06070eaa,#06070ecc),url("${g.banner}")` : "";
  ph.style.backgroundSize = "cover"; ph.style.backgroundPosition = "center";
}
listen("live-game", "change", updateStudioArt);

// ---------- Header: search & notifications ----------
function openSearch() { openSheet("search-sheet"); get("global-search").value = ""; renderSearch(); setTimeout(() => get("global-search").focus(), 60); }
listen("open-notifications", "click", openNotifs);
listen("open-search", "click", openSearch);
function renderSearch() {
  const q = get("global-search").value.trim().toLowerCase(), box = get("search-results"); box.replaceChildren();
  const games = GAMES.filter(g => !q || g.name.toLowerCase().includes(q) || g.cat.toLowerCase().includes(q)).slice(0, q ? 12 : 6);
  const posts = q ? postsCache.filter(p => (p.content || "").toLowerCase().includes(q) || nameFor(p.user_id).toLowerCase().includes(q)).slice(0, 8) : [];
  const title = t => { const d = document.createElement("div"); d.className = "group-title"; d.textContent = t; box.appendChild(d); };
  if (games.length) {
    title(q ? "Games" : "Popular games");
    games.forEach(g => {
      const r = document.createElement("button"); r.type = "button"; r.className = "result-row";
      r.innerHTML = `<div><div class="t"></div><div class="s"></div></div><span class="go"></span>`; r.prepend(gameImg(g));
      r.querySelector(".t").textContent = g.name; r.querySelector(".s").textContent = g.cat + " · " + g.meta;
      r.querySelector(".go").textContent = myGames.has(g.name) ? "✓ Added" : "View";
      r.addEventListener("click", () => { closeSheet("search-sheet"); openGame(g.id); });
      box.appendChild(r);
    });
  }
  if (posts.length) {
    title("Posts");
    posts.forEach(p => {
      const r = document.createElement("button"); r.type = "button"; r.className = "result-row";
      r.addEventListener("click", () => { closeSheet("search-sheet"); openPost(p.id); });
      r.innerHTML = `<div><div class="t"></div><div class="s"></div></div>`;
      r.querySelector(".t").textContent = nameFor(p.user_id); r.querySelector(".s").textContent = (p.content || "").slice(0, 90);
      box.appendChild(r);
    });
  }
  if (q && !games.length && !posts.length) { const e = document.createElement("div"); e.className = "empty-state"; e.innerHTML = "<h3>No results</h3><p>Try a different game or keyword.</p>"; box.appendChild(e); }
}
listen("global-search", "input", renderSearch);

// ---------- Feed ----------
const composer = get("composer"), postInput = get("post-content");
function autoGrow() { postInput.style.height = "auto"; postInput.style.height = Math.min(postInput.scrollHeight, 220) + "px"; }
function syncComposer() { composer.classList.toggle("open", document.activeElement === postInput || postInput.value.length > 0 || !!selectedMedia); }
postInput.addEventListener("focus", syncComposer);
postInput.addEventListener("blur", () => setTimeout(syncComposer, 100));
postInput.addEventListener("input", () => { get("post-counter").textContent = postInput.value.length + " / 2000"; autoGrow(); syncComposer(); });

function pickMedia(e) {
  const file = e.target.files[0]; e.target.value = ""; if (!file) return;
  if (file.size > MAX_MEDIA_MB * 1024 * 1024) return toast(`File too large (max ${MAX_MEDIA_MB} MB)`);
  selectedMedia = file; const box = get("post-media-preview"); box.replaceChildren();
  const media = document.createElement(file.type.startsWith("video") ? "video" : "img"); media.src = URL.createObjectURL(file);
  if (media.tagName === "VIDEO") { media.controls = true; media.muted = true; media.playsInline = true; }
  const rm = document.createElement("button"); rm.type = "button"; rm.className = "media-remove"; rm.setAttribute("aria-label", "Remove attachment"); rm.innerHTML = icon("close");
  rm.addEventListener("click", clearMedia); box.append(media, rm); box.hidden = false; syncComposer();
}
listen("post-photo", "change", pickMedia); listen("post-video", "change", pickMedia);
function clearMedia() { selectedMedia = null; const b = get("post-media-preview"); b.replaceChildren(); b.hidden = true; syncComposer(); }
async function uploadMedia(file) {
  const ext = (file.name.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `${currentUser.id}/${Date.now()}.${ext}`;
  const { error } = await db.storage.from(MEDIA_BUCKET).upload(path, file, { contentType: file.type });
  if (error) throw error; return db.storage.from(MEDIA_BUCKET).getPublicUrl(path).data.publicUrl;
}

const localPosts = () => LS.get("lavora_local_posts", []);
async function allPosts() {
  let remote = [];
  if (!localMode) {
    try {
      const { data, error } = await db.from("posts").select("*").order("created_at", { ascending: false }).limit(50);
      if (error) throw error; remote = data || [];
    } catch (err) { if (isNetErr(err)) { localMode = true; toast("Offline: showing posts saved on this device"); } else throw err; }
  }
  return [...remote, ...localPosts(), ...(settings.seed && typeof seedPosts === "function" ? (seedSetup(), seedPosts()) : [])].sort((x, y) => new Date(y.created_at) - new Date(x.created_at));
}
function seedSetup() {   // demo comments, plus a few starting likes/saves, added once
  if (typeof seedComments !== "function") return; let changed = false;
  Object.entries(seedComments()).forEach(([pid, arr]) => { if (!comments[pid]) { comments[pid] = arr; changed = true; } });
  if (!LS.get("lavora_seeded", false)) { ["seed-1", "seed-5", "seed-9"].forEach(i => saved.add(i)); ["seed-2", "seed-3", "seed-10"].forEach(i => likes.add(i)); LS.set("lavora_seeded", true); changed = true; }
  if (changed) persistEngagement();
}
function visiblePosts() {
  return postsCache.filter(p => feedFilter === "all" || (feedFilter === "mine" ? p.user_id === currentUser.id : following.has(p.user_id)));
}
function emptyFeedMessage() {
  if (feedFilter === "following") return ["No posts from people you follow", "Tap the follow icon on a post to see their posts here."];
  if (feedFilter === "mine") return ["You haven't posted yet", "Share your first gaming moment above."];
  return ["Welcome to LAVORA!", "Be the first to share something with the community."];
}
function renderFeed(list = get("posts-list"), items = visiblePosts()) {
  list.replaceChildren();
  if (!items.length) { const [t, p] = emptyFeedMessage(); list.innerHTML = '<div class="empty-state gb"><h3></h3><p></p></div>'; list.querySelector("h3").textContent = t; list.querySelector("p").textContent = p; return; }
  items.forEach(p => list.appendChild(renderPost(p)));
}
async function loadPosts() {
  const list = get("posts-list"); if (!list || !currentUser) return;
  if (!list.children.length) list.innerHTML = '<div class="skeleton gb"></div><div class="skeleton gb"></div>';
  try {
    postsCache = await allPosts(); await fetchProfiles(postsCache.map(p => p.user_id));
    renderFeed();
  } catch (err) {
    list.replaceChildren(); const d = document.createElement("div"); d.className = "empty-state gb";
    d.innerHTML = '<h3>Could not load posts</h3><p></p><button type="button" class="btn btn-outline btn-sm" style="margin-top:14px">Try again</button>';
    d.querySelector("p").textContent = err.message; d.querySelector("button").addEventListener("click", loadPosts); list.appendChild(d);
  }
}
document.querySelectorAll(".feed-tabs .cat").forEach(b => b.addEventListener("click", () => {
  feedFilter = b.dataset.feed;
  document.querySelectorAll(".feed-tabs .cat").forEach(x => { const on = x === b; x.classList.toggle("active", on); x.setAttribute("aria-selected", on); });
  renderFeed();
}));
function closeMenus() { document.querySelectorAll(".menu").forEach(m => m.remove()); }

function actionBtn(iconName, label, active, onClick, extraCls = "") {
  const b = document.createElement("button"); b.type = "button"; b.className = "act-btn" + (active ? " on " : " ") + extraCls;
  b.setAttribute("aria-pressed", !!active); b.innerHTML = icon(iconName) + '<span></span>'; b.querySelector("span").textContent = label; b.addEventListener("click", onClick); return b;
}
function toggleFollow(id) {
  following.has(id) ? following.delete(id) : following.add(id); save("lavora_following", following);
  const on = following.has(id); toast(on ? `Following ${nameFor(id)}` : "Unfollowed"); if (on) addNotif(`You're now following ${nameFor(id)}`);
  refreshUserFollow(); return on;
}
function renderPost(post, { detail = false } = {}) {
  const pid = String(post.id), art = document.createElement("article"); art.className = "lavora-post gb" + (detail ? " detail" : ""); art.dataset.post = pid;
  const mine = post.user_id === currentUser.id, fol = following.has(post.user_id);
  const open = () => { if (!detail) openPost(pid); };
  const goComments = () => { if (detail) get("detail-comment-input").focus(); else openPost(pid, { focus: true }); };
  // header: avatar · name · time · follow · menu
  const head = document.createElement("div"); head.className = "post-head";
  const av = document.createElement("div"); av.className = "avatar md link-user"; av.dataset.user = post.user_id; setAvatar(av, avatarFor(post.user_id), nameFor(post.user_id));
  const who = document.createElement("div"); who.innerHTML = '<div class="post-name link-user"></div><div class="post-time"></div>';
  const nm = who.querySelector(".post-name"); nm.textContent = nameFor(post.user_id) + (mine ? " (you)" : ""); nm.dataset.user = post.user_id;
  who.querySelector(".post-time").textContent = post.created_at ? timeAgo(post.created_at) : "";
  const actions = document.createElement("div"); actions.className = "post-actions";
  if (!mine) {
    const f = document.createElement("button"); f.type = "button"; f.className = "icon-btn" + (fol ? " following" : "");
    f.setAttribute("aria-label", fol ? "Unfollow" : "Follow"); f.innerHTML = icon(fol ? "usercheck" : "userplus");
    f.addEventListener("click", () => {
      const on = toggleFollow(post.user_id); f.classList.toggle("following", on); f.setAttribute("aria-label", on ? "Unfollow" : "Follow"); f.innerHTML = icon(on ? "usercheck" : "userplus");
      if (!detail) renderFeed();
    });
    actions.appendChild(f);
  }
  const dots = document.createElement("button"); dots.type = "button"; dots.className = "icon-btn post-menu-btn"; dots.setAttribute("aria-label", "Post options"); dots.innerHTML = icon("dots");
  dots.addEventListener("click", e => {
    e.stopPropagation(); const had = art.querySelector(".menu"); closeMenus(); if (had) return;
    const m = document.createElement("div"); m.className = "menu";
    if (post.content) { const c = document.createElement("button"); c.textContent = "Copy text"; c.addEventListener("click", () => { navigator.clipboard?.writeText(post.content); closeMenus(); toast("Copied"); }); m.appendChild(c); }
    if (mine && post.id !== undefined) {
      const d = document.createElement("button"); d.className = "danger"; d.textContent = "Delete post";
      d.addEventListener("click", async () => {
        closeMenus(); if (!confirm("Delete this post?")) return;
        try {
          if (pid.startsWith("local-")) LS.set("lavora_local_posts", localPosts().filter(x => String(x.id) !== pid));
          else { const { error } = await db.from("posts").delete().eq("id", post.id).eq("user_id", currentUser.id); if (error) throw error; }
        } catch (err) { return toast("Could not delete: " + err.message); }
        postsCache = postsCache.filter(x => String(x.id) !== pid); saved.delete(pid); likes.delete(pid); delete comments[pid]; persistEngagement(); toast("Post deleted");
        if (detail) return goBack();
        art.remove(); if (!get("posts-list").children.length) renderFeed();
      }); m.appendChild(d);
    }
    if (!m.children.length) { const n = document.createElement("button"); n.textContent = "No actions"; n.disabled = true; m.appendChild(n); }
    art.appendChild(m);
  });
  actions.appendChild(dots); head.append(av, who, actions); art.appendChild(head);
  // body + media
  if (post.content) { const b = document.createElement("p"); b.className = "post-body" + (detail ? "" : " tap"); b.textContent = post.content; b.addEventListener("click", open); art.appendChild(b); }
  if (post.image_url) {
    const vid = isVideoUrl(post.image_url) || /^data:video/.test(post.image_url);
    const m = document.createElement(vid ? "video" : "img"); m.className = "post-media" + (detail ? " full" : ""); m.src = post.image_url;
    if (vid) { m.controls = true; m.playsInline = true; m.preload = "metadata"; if (settings.autoplay) { m.muted = true; m.loop = true; observeAutoplay(m); } } else { m.alt = "Post media"; m.loading = "lazy"; if (!detail) { m.classList.add("tap"); m.addEventListener("click", open); } }
    art.appendChild(m);
  }
  // counts row
  const counts = document.createElement("div"); counts.className = "post-counts";
  function refreshCounts() {
    const l = (post.seed_likes || 0) + (likes.has(pid) ? 1 : 0), c = (comments[pid] || []).length; counts.hidden = !l && !c; counts.replaceChildren();
    const a = document.createElement("span"); a.textContent = l ? `${l} like${l > 1 ? "s" : ""}` : ""; const b = document.createElement("button"); b.type = "button"; b.className = "link-count";
    b.textContent = c ? `${c} comment${c > 1 ? "s" : ""}` : ""; b.addEventListener("click", goComments); counts.append(a, b);
  }
  refreshCounts();
  // action bar: like · comment · share · save
  const bar = document.createElement("div"); bar.className = "post-bar";
  const likeBtn = actionBtn("heart", "Like", likes.has(pid), () => {
    likes.has(pid) ? likes.delete(pid) : likes.add(pid); persistEngagement();
    const on = likes.has(pid); likeBtn.classList.toggle("on", on); likeBtn.setAttribute("aria-pressed", on); refreshCounts();
  }, "like");
  const cBtn = actionBtn("comment", "Comment", false, goComments);
  const shBtn = actionBtn("share", "Share", false, async () => {
    const text = (post.content || "Check this out on LAVORA").slice(0, 200), url = location.origin + location.pathname + "#post/" + encodeURIComponent(pid);
    try { if (navigator.share) await navigator.share({ title: "LAVORA", text, url }); else { await navigator.clipboard.writeText(url); toast("Link copied"); } } catch (_) {}
  });
  const sBtn = actionBtn("bookmark", saved.has(pid) ? "Saved" : "Save", saved.has(pid), () => {
    saved.has(pid) ? saved.delete(pid) : saved.add(pid); persistEngagement();
    const on = saved.has(pid); sBtn.classList.toggle("on", on); sBtn.setAttribute("aria-pressed", on); sBtn.querySelector("span").textContent = on ? "Saved" : "Save"; toast(on ? "Saved to your collection" : "Removed from saved");
    if (!get("saved-page").hidden) renderSaved();
  });
  bar.append(likeBtn, cBtn, shBtn, sBtn); art.append(counts, bar);
  return art;
}
function persistEngagement() { LS.set("lavora_likes", [...likes]); LS.set("lavora_saved", [...saved]); LS.set("lavora_comments", comments); }
// ---------- Post detail page (comments under the post) ----------
let detailPost = null;
async function openPost(id, { push = true, focus = false } = {}) {
  id = String(id); navigateToPage("post", { push, hash: "post/" + encodeURIComponent(id) });
  const box = get("post-detail"); detailPost = null; setAvatar(get("detail-comment-avatar"), currentProfile?.avatar_url, nameFor(currentUser.id));
  let post = postsCache.find(p => String(p.id) === id);
  if (!post) {
    box.innerHTML = '<div class="skeleton gb"></div>';
    try { postsCache = await allPosts(); } catch (_) {}
    post = postsCache.find(p => String(p.id) === id);
  }
  if (!post) { box.innerHTML = '<div class="empty-state gb"><h3>Post not found</h3><p>It may have been deleted.</p></div>'; get("detail-comment-form").hidden = true; return; }
  get("detail-comment-form").hidden = false;
  await fetchProfiles([post.user_id, ...(comments[id] || []).map(c => c.user_id)]);
  renderPostDetail(post); if (focus) setTimeout(() => get("detail-comment-input").focus(), 60);
}
function renderPostDetail(post) {
  detailPost = post; const pid = String(post.id), box = get("post-detail"); box.replaceChildren();
  box.appendChild(renderPost(post, { detail: true }));
  const sec = document.createElement("section"), arr = comments[pid] || []; sec.className = "post-comments";
  const h = document.createElement("h3"); h.textContent = arr.length ? `Comments · ${arr.length}` : "Comments"; sec.appendChild(h);
  if (!arr.length) { const p = document.createElement("p"); p.className = "muted"; p.textContent = "No comments yet. Start the conversation."; sec.appendChild(p); }
  arr.forEach(c => {
    const row = document.createElement("div"); row.className = "comment-row";
    const av = document.createElement("div"); av.className = "avatar sm link-user"; av.dataset.user = c.user_id; setAvatar(av, avatarFor(c.user_id), nameFor(c.user_id));
    const bub = document.createElement("div"); bub.className = "comment-bubble"; bub.innerHTML = '<b class="link-user"></b><span></span><div class="comment-meta"><time></time></div>';
    const nb = bub.querySelector("b"); nb.textContent = nameFor(c.user_id); nb.dataset.user = c.user_id;
    bub.querySelector("span").textContent = c.content; bub.querySelector("time").textContent = timeAgo(c.created_at);
    if (c.user_id === currentUser.id) {
      const d = document.createElement("button"); d.type = "button"; d.className = "link-btn danger"; d.textContent = "Delete";
      d.addEventListener("click", () => { comments[pid] = (comments[pid] || []).filter(x => x.id !== c.id); persistEngagement(); renderPostDetail(post); });
      bub.querySelector(".comment-meta").appendChild(d);
    }
    row.append(av, bub); sec.appendChild(row);
  });
  box.appendChild(sec);
}
listen("detail-comment-form", "submit", e => {
  e.preventDefault(); const inp = get("detail-comment-input"), v = inp.value.trim(); if (!v || !detailPost || !currentUser) return;
  const pid = String(detailPost.id); (comments[pid] = comments[pid] || []).push({ id: uid(), user_id: currentUser.id, name: nameFor(currentUser.id), content: v, created_at: new Date().toISOString() });
  persistEngagement(); inp.value = ""; renderPostDetail(detailPost); inp.focus();
  if (detailPost.user_id !== currentUser.id) addNotif(`You commented on ${nameFor(detailPost.user_id)}'s post`);
});

// ---------- Other users' profiles ----------
let openUserId = null;
function refreshUserFollow() {
  const b = get("user-follow"); if (!b || !openUserId) return; const on = following.has(openUserId);
  b.innerHTML = icon(on ? "usercheck" : "userplus") + (on ? "Following" : "Follow"); b.classList.toggle("btn-primary", !on); b.classList.toggle("btn-outline", on);
}
listen("user-follow", "click", () => { if (openUserId) { toggleFollow(openUserId); if (feedFilter === "following") renderFeed(); } });
async function openUser(id, { push = true } = {}) {
  id = String(id);
  if (currentUser && id === currentUser.id) return navigateToPage("profile", { push });
  navigateToPage("user", { push, hash: "user/" + encodeURIComponent(id) }); openUserId = id;
  if (!postsCache.length) { try { postsCache = await allPosts(); } catch (_) {} }
  await fetchProfiles([id, ...postsCache.map(p => p.user_id)]);
  if (openUserId !== id) return;
  const p = profileCache.get(id) || {}, name = p.display_name || p.username || "LAVORA Member", games = normGames(Array.isArray(p.favorite_games) ? p.favorite_games : []);
  get("user-display-name").textContent = name; get("user-username").textContent = p.username ? "@" + p.username : "";
  get("user-bio").textContent = p.bio || ""; get("user-bio").hidden = !p.bio;
  const c = get("user-country"); c.hidden = !p.country; c.textContent = p.country ? "📍 " + p.country : "";
  setAvatar(get("user-avatar"), p.avatar_url, name);
  const theirs = postsCache.filter(x => x.user_id === id);
  get("user-stat-posts").textContent = theirs.length; get("user-stat-games").textContent = games.length;
  get("user-stat-joined").textContent = p.created_at ? new Date(p.created_at).toLocaleDateString([], { month: "short", year: "2-digit" }) : "–";
  const gl = get("user-game-list"); gl.replaceChildren();
  if (!games.length) { const s2 = document.createElement("span"); s2.className = "chip"; s2.textContent = "No games yet"; gl.appendChild(s2); }
  games.forEach(n => {
    const g = gameByName(n), s2 = document.createElement("button"); s2.type = "button"; s2.className = "chip game-chip"; s2.addEventListener("click", () => g && openGame(g.id));
    if (g) { const t = gameImg(g); t.className = "chip-thumb"; s2.appendChild(t); } s2.append(document.createTextNode(n)); gl.appendChild(s2);
  });
  const top = games.map(gameByName).find(bannerUrl), pb = get("user-banner");
  pb.style.backgroundImage = top ? `linear-gradient(#06070e00,#0c0e1d99),url("${top.banner}")` : ""; pb.classList.toggle("has-game", !!top);
  refreshUserFollow();
  const list = get("user-posts"); list.replaceChildren();
  if (!theirs.length) { list.innerHTML = '<div class="empty-state gb"><h3>No posts yet</h3><p></p></div>'; list.querySelector("p").textContent = name + " hasn't posted anything."; }
  theirs.forEach(x => list.appendChild(renderPost(x)));
}

function renderSaved() {
  const list = get("saved-list"); list.replaceChildren();
  const items = postsCache.filter(p => saved.has(String(p.id)));
  if (!items.length) { list.innerHTML = '<div class="empty-state gb"><div class="empty-bell"><svg class="ic xl"><use href="#i-bookmark"/></svg></div><h3>Nothing saved yet</h3><p>Tap Save on any post to keep it here.</p></div>'; return; }
  items.forEach(p => list.appendChild(renderPost(p)));
}
let autoplayObs = null;
function observeAutoplay(v) {
  if (!("IntersectionObserver" in window)) return;
  autoplayObs = autoplayObs || new IntersectionObserver(es => es.forEach(e => e.isIntersecting ? e.target.play().catch(() => {}) : e.target.pause()), { threshold: .6 });
  autoplayObs.observe(v);
}
const fileToDataUrl = f => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); });
listen("create-post-form", "submit", async e => {
  e.preventDefault(); if (!currentUser) return toast("Please log in first.");
  const status = get("post-status"), btn = get("publish-post"), content = postInput.value.trim();
  if (!content && !selectedMedia) return setMessage(status, "Write something or add a photo or video first.", "error");
  btn.disabled = true; setMessage(status, selectedMedia ? "Uploading media…" : "Publishing…");
  try {
    let imageUrl = null, note = "";
    if (selectedMedia && !localMode) {
      try { imageUrl = await uploadMedia(selectedMedia); }
      catch (err) { console.warn("LAVORA media upload failed:", err); if (isNetErr(err)) localMode = true; }
    }
    if (selectedMedia && !imageUrl) {   // no storage bucket / offline: embed small media on this device
      if (selectedMedia.size <= 1.5 * 1024 * 1024) imageUrl = await fileToDataUrl(selectedMedia);
      else if (!content) throw new Error("That file is too large to save without a server (max 1.5 MB). Try a smaller one.");
      else note = " (media was too large to attach without a server, so only your text was posted)";
    }
    const embedded = !!imageUrl && imageUrl.startsWith("data:");   // embedded media can only live on this device
    if (!localMode && !embedded) {
      try { const { error } = await db.from("posts").insert({ user_id: currentUser.id, content, image_url: imageUrl }); if (error) throw error; }
      catch (err) { if (isNetErr(err)) localMode = true; else throw err; }
    }
    if (localMode || embedded) {
      const arr = localPosts(); arr.unshift({ id: "local-" + uid(), user_id: currentUser.id, content, image_url: imageUrl, created_at: new Date().toISOString() });
      if (!LS.set("lavora_local_posts", arr.slice(0, 100))) throw new Error("Device storage is full. Remove some posts or use a smaller file.");
    }
    postInput.value = ""; autoGrow(); get("post-counter").textContent = "0 / 2000"; clearMedia();
    setMessage(status, "Post published!" + note, "ok"); addNotif("Your post is live in the community feed"); await loadPosts();
    setTimeout(() => setMessage(status, ""), 3000);
  } catch (err) { setMessage(status, "Post failed: " + err.message, "error"); } finally { btn.disabled = false; }
});

// ---------- Notifications (generated on this device) ----------
function addNotif(text) {
  if (!settings.notifs) return;
  notifs.unshift({ id: uid(), text, created_at: new Date().toISOString(), read: false }); notifs = notifs.slice(0, 40);
  LS.set("lavora_notifs", notifs); updateNotifBadge();
}
function updateNotifBadge() {
  const n = notifs.filter(x => !x.read).length, b = get("notif-badge"); b.hidden = !n; b.textContent = n > 9 ? "9+" : n;
}
function openNotifs() {
  const box = get("notif-list"); box.replaceChildren();
  if (!notifs.length) box.innerHTML = '<div class="empty-state"><div class="empty-bell"><svg class="ic xl"><use href="#i-bell"/></svg></div><h3>You\'re all caught up</h3><p>Activity will show up here.</p></div>';
  notifs.forEach(n => { const r = document.createElement("div"); r.className = "notif" + (n.read ? "" : " unread"); r.innerHTML = "<span></span><time></time>"; r.querySelector("span").textContent = n.text; r.querySelector("time").textContent = timeAgo(n.created_at); box.appendChild(r); });
  get("notif-clear").hidden = !notifs.length;
  notifs.forEach(n => (n.read = true)); LS.set("lavora_notifs", notifs); updateNotifBadge();
  openSheet("notif-sheet");
}
listen("notif-clear", "click", () => { notifs = []; LS.set("lavora_notifs", notifs); updateNotifBadge(); openNotifs(); });

// ---------- Settings ----------
function applySettings() {
  document.documentElement.classList.toggle("reduce-motion", !!settings.motion);
  get("set-motion").checked = !!settings.motion; get("set-autoplay").checked = !!settings.autoplay; get("set-notifs").checked = !!settings.notifs; get("set-seed").checked = !!settings.seed;
}
[["set-motion", "motion"], ["set-autoplay", "autoplay"], ["set-notifs", "notifs"], ["set-seed", "seed"]].forEach(([id, key]) =>
  listen(id, "change", e => { settings[key] = e.target.checked; LS.set("lavora_settings", settings); applySettings(); if (key === "autoplay") renderFeed(); if (key === "seed") loadPosts(); }));
listen("clear-data", "click", () => {
  if (!confirm("Clear likes, saves, follows, comments and notifications from this device?")) return;
  ["lavora_likes", "lavora_saved", "lavora_comments", "lavora_notifs", "lavora_following"].forEach(k => localStorage.removeItem(k));
  likes = new Set(); saved = new Set(); comments = {}; notifs = []; following = new Set(); updateNotifBadge(); renderFeed(); toast("Local data cleared");
});
applySettings();

// ---------- Theme (light by default, dark mode from the sidebar) ----------
function applyTheme(t) {
  document.documentElement.dataset.theme = t; const dark = t === "dark";
  get("sb-theme")?.setAttribute("aria-checked", dark);
  const m = document.querySelector('meta[name="theme-color"]'); if (m) m.content = dark ? "#07080f" : "#ffffff";
}
listen("sb-theme", "click", () => {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  try { localStorage.setItem("lavora_theme", next); } catch (_) {} applyTheme(next);
});
applyTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light");

// ---------- Public chat: see features.js ----------

// ---------- Live studio ----------
listen("open-live-studio", "click", () => navigateToPage("live-studio"));
listen("back-to-live", "click", () => navigateToPage("live"));
listen("camera-start", "click", async () => {
  const status = get("live-status");
  try {
    liveStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: true });
    get("live-preview").srcObject = liveStream; get("video-placeholder").hidden = true; get("broadcast-start").disabled = false;
    setMessage(status, "Camera ready. Choose your game and a title.", "ok");
  } catch (err) { setMessage(status, "Camera error: " + err.message, "error"); }
});
listen("broadcast-start", "click", () => {
  if (!liveStream) return;
  if (!(get("live-game-custom").value.trim() || get("live-game").value)) return toast("Pick a game first");
  get("live-badge").hidden = false; get("broadcast-start").hidden = true; get("broadcast-stop").hidden = false;
  setMessage(get("live-status"), "Preview mode: public broadcasting is the next development step.");
  toast("Preview is live on your device only");
});
listen("broadcast-stop", "click", stopCamera);
function stopCamera() {
  if (liveStream) { liveStream.getTracks().forEach(t => t.stop()); liveStream = null; }
  const prev = get("live-preview"); if (prev) prev.srcObject = null;
  get("video-placeholder").hidden = false; get("broadcast-start").disabled = true; get("broadcast-start").hidden = false;
  get("broadcast-stop").hidden = true; get("live-badge").hidden = true;
}

// ---------- Logout / start ----------
listen("logout", "click", doLogout);
async function doLogout() {
  stopCamera(); if (chatChannel && db) { try { await db.removeChannel(chatChannel); } catch (_) {} chatChannel = null; }
  localStorage.removeItem("lavora_local_session");
  if (db) { try { const { error } = await db.auth.signOut(); if (error && !isNetErr(error)) return toast(error.message); } catch (_) {} }
  resetSession();
}
function resetSession() {
  document.body.classList.remove("on-post"); currentUser = null; currentProfile = null; profileCache.clear(); seenMessageIds.clear(); postsCache = [];
  get("posts-list").replaceChildren(); get("chat-messages").replaceChildren(); if (window.lavoraFeatures) lavoraFeatures.onLeave(); closeSidebar(); history.replaceState(null, "", location.pathname); show("welcome");
}
async function initializeLavora() {
  renderCategories(); renderGames(); renderMyGames(); updateAuthMode();
  try {
    let user = null;
    if (db) { try { const { data, error } = await db.auth.getSession(); if (error) throw error; user = data.session?.user || null; } catch (err) { if (isNetErr(err)) localMode = true; else console.error(err); } }
    if (!user) { user = localSessionUser(); if (user) localMode = true; }
    if (user) await enterApp(user); else show("welcome");
  } catch (err) { console.error("LAVORA startup error:", err); show("welcome"); }
  if (db) db.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT" && currentUser && !localMode) resetSession();
    if (event === "SIGNED_IN" && session && !localMode) setTimeout(() => enterApp(session.user), 0);
  });
  window.addEventListener("online", () => toast("Back online"));
  window.addEventListener("offline", () => toast("You're offline. Showing saved content."));
}
initializeLavora();
