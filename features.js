/* ==========================================================
   LAVORA 6.0 — features.js
   · Chat: emoji picker, stickers (built-in / custom / import / export),
           photos, edit + delete your messages, live updates
   · Login streak: daily check-in, flame, milestones, confetti
   Loaded after script.js (shares its globals: db, LS, toast, ...).
   ========================================================== */
(() => {
"use strict";

/* ---------- tiny helpers ---------- */
const $ = id => document.getElementById(id);
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
const reduceMotion = () => !!(typeof settings !== "undefined" && settings.motion) || (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
const b2d = b => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(new Error("Could not read file")); r.readAsDataURL(b); });
const d2b = async d => (await fetch(d)).blob();
const loadImg = blob => new Promise((res, rej) => {
  const u = URL.createObjectURL(blob), i = new Image();
  i.onload = () => { URL.revokeObjectURL(u); res(i); };
  i.onerror = () => { URL.revokeObjectURL(u); rej(new Error("Could not read that image")); };
  i.src = u;
});
async function scaleToBlob(blob, max, type, q) {
  const img = await loadImg(blob), r = Math.min(1, max / Math.max(img.width, img.height));
  const c = el("canvas"); c.width = Math.max(1, Math.round(img.width * r)); c.height = Math.max(1, Math.round(img.height * r));
  const ctx = c.getContext("2d");
  if (type === "image/jpeg") { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height); }
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error("Could not process image")), type, q));
}
const SAFE_URL = /^(https?:\/\/|data:image\/(png|jpe?g|webp|gif);base64,)/i;
const safeUrl = u => (typeof u === "string" && SAFE_URL.test(u.trim())) ? u.trim() : "";
const svgIcon = (d, cls = "ic") => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const ICONS = {
  smile: '<circle cx="12" cy="12" r="9"/><path d="M8.5 14.2a4.2 4.2 0 0 0 7 0M9 9.5h.01M15 9.5h.01"/>',
  image: '<rect x="3" y="4.5" width="18" height="15" rx="3"/><circle cx="9" cy="10" r="1.7"/><path d="M4 17l5-4.5 4 3.5 3-2.5 4 3.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  dots: '<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>'
};
function iconBtn(name, label, cls = "icon-btn") {
  const b = el("button", cls); b.type = "button"; b.setAttribute("aria-label", label); b.title = label; b.innerHTML = svgIcon(ICONS[name]); return b;
}

/* =========================================================
   CHAT
   Message encoding (no database migration needed):
     plain text                 -> text
     [[img]]<url>\n<caption>    -> photo
     [[stk]]<ref>               -> sticker (gen:TEXT|c1|c2, emoji:🔥, or an image URL)
     trailing U+2063            -> "edited"
   ========================================================= */
const IMG_TAG = "[[img]]", STK_TAG = "[[stk]]", EDIT_MARK = "\u2063";
const MAX_STICKERS = 48;
const msgCache = new Map();
let pending = null, sending = false, trayOpen = false, trayTab = "emoji", emojiCat = "Recent", stkPack = "mine", manage = false;

function parseMsg(raw) {
  let s = String(raw || ""), edited = false;
  if (s.endsWith(EDIT_MARK)) { edited = true; s = s.slice(0, -1); }
  if (s.startsWith(STK_TAG)) return { type: "sticker", ref: s.slice(STK_TAG.length).trim(), edited };
  if (s.startsWith(IMG_TAG)) {
    const rest = s.slice(IMG_TAG.length), nl = rest.indexOf("\n");
    return { type: "image", url: (nl < 0 ? rest : rest.slice(0, nl)).trim(), caption: nl < 0 ? "" : rest.slice(nl + 1), edited };
  }
  return { type: "text", text: s, edited };
}
const previewText = raw => { const p = parseMsg(raw); return p.type === "sticker" ? "Sticker" : p.type === "image" ? "Photo" : p.text; };

/* ----- built-in stickers (generated, no image files) ----- */
const GEN_STICKERS = [
  ["GG", "#8b5cf6", "#3b82f6"], ["EZ", "#12b886", "#2cf5b0"], ["LFG", "#ff5d7e", "#ff9a5d"], ["GLHF", "#3b82f6", "#22d3ee"],
  ["NT", "#f59e0b", "#ef4444"], ["WP", "#10b981", "#3b82f6"], ["RIP", "#475569", "#1e293b"], ["CLUTCH", "#a855f7", "#f43f5e"],
  ["HYPE", "#f43f5e", "#f59e0b"], ["AFK", "#64748b", "#94a3b8"], ["BRB", "#0ea5e9", "#6366f1"], ["W", "#22c55e", "#16a34a"],
  ["L", "#ef4444", "#b91c1c"], ["OP!", "#eab308", "#f97316"], ["GGEZ", "#8b5cf6", "#ec4899"], ["1V1?", "#06b6d4", "#8b5cf6"]
];
const EMOJI_STICKERS = "🔥 😂 😭 😎 🥳 💀 👑 🎮 🏆 💯 🤝 👀 🫡 😤 🤯 ❤️ 🥶 🙌 👏 🚀 ⚡ 🎯 🤡 😴".split(" ");
function genSrc(t, c1, c2) {
  if (!/^[A-Z0-9!?+]{1,8}$/.test(t || "") || !/^#[0-9a-f]{6}$/i.test(c1 || "") || !/^#[0-9a-f]{6}$/i.test(c2 || "")) return "";
  const size = t.length > 5 ? 32 : t.length > 3 ? 42 : 56;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs><g transform="rotate(-6 80 80)"><rect x="10" y="36" width="140" height="88" rx="24" fill="#fff"/><rect x="19" y="45" width="122" height="70" rx="17" fill="url(#g)"/><text x="80" y="81" font-family="Outfit,Arial Black,Arial,sans-serif" font-weight="900" font-size="${size}" fill="#fff" text-anchor="middle" dominant-baseline="central">${t}</text></g></svg>`;
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}
function stickerNode(ref, cls = "stk-img") {
  ref = String(ref || "");
  if (ref.startsWith("emoji:")) return el("span", "stk-emoji", ref.slice(6, 16));
  let src = "";
  if (ref.startsWith("gen:")) { const [t, c1, c2] = ref.slice(4).split("|"); src = genSrc(t, c1, c2); } else src = safeUrl(ref);
  if (!src) return el("span", "chat-img-missing", "Sticker unavailable");
  const im = el("img", cls); im.src = src; im.alt = "Sticker"; im.loading = "lazy"; im.draggable = false;
  im.onerror = () => im.replaceWith(el("span", "chat-img-missing", "Sticker unavailable"));
  return im;
}

/* ----- my stickers (stored on this device) ----- */
const stkKey = () => "lavora_stickers_" + (currentUser ? currentUser.id : "anon");
let myStickers = [];
const loadStickers = () => { myStickers = (LS.get(stkKey(), []) || []).filter(s => s && s.id && s.src); };
function saveStickers() { if (!LS.set(stkKey(), myStickers)) { toast("Storage is full. Remove a few stickers."); return false; } return true; }
async function stickerFromBlob(blob) {
  if (blob.type === "image/gif" && blob.size <= 450 * 1024) return b2d(blob);      // keep small GIFs animated
  for (const max of [256, 192, 128]) {
    const d = await b2d(await scaleToBlob(blob, max, "image/webp", 0.85));
    if (d.length <= 120000) return d;
  }
  throw new Error("That image is too detailed for a sticker");
}
async function addStickerFiles(files) {
  let added = 0;
  for (const f of files) {
    if (myStickers.length >= MAX_STICKERS) { toast("Sticker limit is " + MAX_STICKERS); break; }
    if (!/^image\//.test(f.type)) continue;
    try { myStickers.push({ id: uid(), src: await stickerFromBlob(f), name: f.name.replace(/\.[^.]+$/, "").slice(0, 24) }); added++; }
    catch (e) { toast(e.message); }
  }
  if (added) { if (!saveStickers()) myStickers.splice(-added, added); else toast(added === 1 ? "Sticker added" : added + " stickers added"); renderTray(); }
}
async function importPack(file) {
  try {
    const data = JSON.parse(await file.text()), list = Array.isArray(data) ? data : data.stickers;
    if (!Array.isArray(list)) throw new Error();
    let n = 0;
    for (const s of list) {
      if (myStickers.length >= MAX_STICKERS) break;
      const src = s && typeof s.src === "string" ? s.src.trim() : "";
      if (!safeUrl(src) || src.length > 200000 || myStickers.some(m => m.src === src)) continue;
      myStickers.push({ id: uid(), src, name: String(s.name || "").slice(0, 24) }); n++;
    }
    if (!n) return toast("No new stickers found in that file");
    if (!saveStickers()) myStickers.splice(-n, n); else toast(n + " sticker" + (n > 1 ? "s" : "") + " imported");
    renderTray();
  } catch (_) { toast("That isn't a LAVORA sticker pack (.json)"); }
}
function exportPack() {
  if (!myStickers.length) return toast("Add some stickers first");
  const blob = new Blob([JSON.stringify({ app: "lavora", type: "sticker-pack", name: "My LAVORA stickers", stickers: myStickers.map(s => ({ name: s.name || "", src: s.src })) })], { type: "application/json" });
  const a = el("a"); a.href = URL.createObjectURL(blob); a.download = "lavora-stickers.json"; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
async function saveAsSticker(p) {
  if (myStickers.length >= MAX_STICKERS) return toast("Sticker limit is " + MAX_STICKERS);
  try {
    let src;
    if (p.type === "sticker") src = p.ref.startsWith("gen:") ? genSrc(...p.ref.slice(4).split("|")) : safeUrl(p.ref);
    else src = safeUrl(p.url);
    if (!src) throw new Error("Can't save that one");
    if (myStickers.some(s => s.src === src)) return toast("Already in your stickers");
    let stored = src;
    if (p.type === "image" || src.startsWith("http")) { try { stored = await stickerFromBlob(await (await fetch(src)).blob()); } catch (_) { stored = src; } }
    myStickers.push({ id: uid(), src: stored, name: "saved" });
    if (!saveStickers()) myStickers.pop(); else toast("Added to your stickers");
  } catch (e) { toast(e.message || "Could not save"); }
}
async function refForSend(st) {
  if (!st.src.startsWith("data:")) return st.src;
  if (st.url) return st.url;
  if (!localMode && db) {
    try {
      const blob = await d2b(st.src), ext = (blob.type.split("/")[1] || "png").replace("jpeg", "jpg");
      const path = `${currentUser.id}/stk-${Date.now()}.${ext}`;
      const { error } = await db.storage.from(MEDIA_BUCKET).upload(path, blob, { contentType: blob.type });
      if (error) throw error;
      st.url = db.storage.from(MEDIA_BUCKET).getPublicUrl(path).data.publicUrl; saveStickers(); return st.url;
    } catch (_) { /* bucket missing: embed instead */ }
  }
  if (st.src.length <= 150000) return st.src;
  throw new Error("Sticker is too large to send");
}

/* ----- emoji ----- */
const EMOJI = {
  Smileys: "😀 😃 😄 😁 😆 😅 😂 🤣 😊 😇 🙂 😉 😍 🥰 😘 😋 😛 😜 🤪 🤔 🤨 😐 😑 😶 🙄 😏 😴 😪 🤤 😷 🤒 🤕 🤢 🤮 🥵 🥶 😵 🤯 🤠 🥳 😎 🤓 😕 😟 🙁 😮 😲 😳 🥺 😢 😭 😤 😠 😡 🤬 😈 💀 🤡 👻".split(" "),
  Gestures: "👍 👎 👌 ✌️ 🤞 🤟 🤘 🤙 👈 👉 👆 👇 👋 🤚 ✋ 🖖 👏 🙌 🤝 🙏 💪 🫡 🫶 ✍️ 🤌".split(" "),
  Hearts: "❤️ 🧡 💛 💚 💙 💜 🖤 🤍 💔 💯 💢 💥 💫 ✨ 🔥 ⚡ 🌟 ⭐ 🎉 🎊 🎁 🌈".split(" "),
  Gaming: "🎮 🕹️ 👾 🏆 🥇 🥈 🥉 🎯 🎲 ♟️ 🧩 ⚽ 🏀 🏈 🎾 🏎️ 🚗 ✈️ 🚀 🎧 🎤 💻 🖥️ 📱 ⌨️ 🖱️ ⚔️ 🛡️ 💣 🔫 🗡️ 🏹 👑 💎 🪙".split(" "),
  Fun: "🐶 🐱 🦊 🐼 🐸 🐵 🦁 🐯 🐺 🦄 🐲 🦖 🐙 🍕 🍔 🍟 🌮 🍿 🍩 🍪 🍺 ☕ 🥤".split(" ")
};
const recentEmoji = () => LS.get("lavora_recent_emoji", []);
function pushRecent(e) { const r = [e, ...recentEmoji().filter(x => x !== e)].slice(0, 24); LS.set("lavora_recent_emoji", r); }
function insertEmoji(e) {
  const input = $("chat-input"), s = input.selectionStart ?? input.value.length, t = input.selectionEnd ?? s;
  if ((input.value.length - (t - s)) + e.length > input.maxLength) return;
  input.value = input.value.slice(0, s) + e + input.value.slice(t);
  input.selectionStart = input.selectionEnd = s + e.length; pushRecent(e);
}

/* ----- tray UI ----- */
function tab(label, active, fn, cls = "tray-tab") { const b = el("button", cls + (active ? " active" : ""), label); b.type = "button"; b.addEventListener("click", fn); return b; }
function renderTray() {
  const tray = $("chat-tray"); if (!tray) return; tray.replaceChildren();
  const head = el("div", "tray-head");
  head.append(
    tab("😊 Emoji", trayTab === "emoji", () => { trayTab = "emoji"; manage = false; renderTray(); }),
    tab("Stickers", trayTab === "stickers", () => { trayTab = "stickers"; renderTray(); })
  );
  const x = iconBtn("close", "Close", "icon-btn tray-x"); x.addEventListener("click", closeTray); head.appendChild(x);
  const sub = el("div", "tray-sub"), grid = el("div", "tray-grid");
  if (trayTab === "emoji") {
    const cats = ["Recent", ...Object.keys(EMOJI)];
    if (emojiCat === "Recent" && !recentEmoji().length) emojiCat = "Smileys";
    cats.forEach(c => { if (c === "Recent" && !recentEmoji().length) return; sub.appendChild(tab(c, c === emojiCat, () => { emojiCat = c; renderTray(); }, "tray-chip")); });
    (emojiCat === "Recent" ? recentEmoji() : EMOJI[emojiCat] || []).forEach(e => {
      const b = el("button", "emoji-cell", e); b.type = "button"; b.addEventListener("click", () => insertEmoji(e)); grid.appendChild(b);
    });
    grid.classList.add("emoji-grid");
  } else {
    [["mine", "Mine"], ["gamer", "Gamer"], ["emoji", "Emoji"]].forEach(([k, l]) => sub.appendChild(tab(l, k === stkPack, () => { stkPack = k; manage = false; renderTray(); }, "tray-chip")));
    grid.classList.add("stk-grid");
    if (stkPack === "gamer") GEN_STICKERS.forEach(([t, a, b2]) => cell(grid, "gen:" + [t, a, b2].join("|")));
    else if (stkPack === "emoji") EMOJI_STICKERS.forEach(e => cell(grid, "emoji:" + e));
    else {
      const add = el("button", "stk-cell stk-add"); add.type = "button"; add.setAttribute("aria-label", "Add stickers"); add.innerHTML = svgIcon(ICONS.plus) + "<span>Add</span>";
      add.addEventListener("click", () => $("stk-file").click()); grid.appendChild(add);
      myStickers.forEach(st => {
        const c = el("button", "stk-cell"); c.type = "button"; c.title = st.name || "Sticker"; c.appendChild(stickerNode(st.src));
        if (manage) {
          c.classList.add("managing"); const d = el("span", "stk-del"); d.innerHTML = svgIcon(ICONS.close); c.appendChild(d);
          c.addEventListener("click", () => { myStickers = myStickers.filter(s => s.id !== st.id); saveStickers(); renderTray(); });
        } else c.addEventListener("click", async () => {
          try { await sendSticker(await refForSend(st)); } catch (e) { toast(e.message); }
        });
        grid.appendChild(c);
      });
    }
  }
  tray.append(head, sub, grid);
  if (trayTab === "stickers" && stkPack === "mine") {
    const foot = el("div", "tray-foot");
    const imp = tab("Import pack", false, () => $("stk-pack").click(), "btn btn-ghost btn-sm");
    const exp = tab("Export", false, exportPack, "btn btn-ghost btn-sm");
    const man = tab(manage ? "Done" : "Edit", false, () => { manage = !manage; renderTray(); }, "btn btn-ghost btn-sm");
    foot.append(imp, exp, man);
    if (!myStickers.length) foot.prepend(el("span", "hint", "Tap Add to make stickers from your images."));
    tray.appendChild(foot);
  }
}
function cell(grid, ref) {
  const c = el("button", "stk-cell"); c.type = "button"; c.appendChild(stickerNode(ref));
  c.addEventListener("click", () => sendSticker(ref)); grid.appendChild(c);
}
function openTray(which) {
  if (which) trayTab = which;
  trayOpen = true; $("chat-tray").hidden = false; $("chat-emoji-btn").classList.add("active"); renderTray();
  const l = $("chat-messages"); l.scrollTop = l.scrollHeight;
}
function closeTray() { trayOpen = false; const t = $("chat-tray"); if (t) t.hidden = true; const b = $("chat-emoji-btn"); if (b) b.classList.remove("active"); }

/* ----- sending ----- */
const isLocalId = id => String(id).startsWith("local-");
const MSG_COLS = "id, room_id, author_id, content, created_at";
function saveLocalMsgs(arr) {
  arr = arr.slice(-200);
  while (!LS.set("lavora_local_msgs", arr) && arr.length > 5) arr = arr.slice(Math.ceil(arr.length / 2));   // storage full: drop oldest
}
async function postContent(content) {
  let data = null;
  if (!localMode) {
    try {
      const r = await db.from("messages").insert({ room_id: GLOBAL_CHAT_ROOM_ID, author_id: currentUser.id, content }).select(MSG_COLS).single();
      if (r.error) throw r.error; data = r.data;
    } catch (err) { if (isNetErr(err)) { localMode = true; setOnline(false, "On this device"); } else throw err; }
  }
  if (localMode) {
    data = { id: "local-" + uid(), room_id: GLOBAL_CHAT_ROOM_ID, author_id: currentUser.id, content, created_at: new Date().toISOString() };
    const arr = LS.get("lavora_local_msgs", []); arr.push(data); saveLocalMsgs(arr);
  }
  return data;
}
async function sendSticker(ref) {
  if (sending) return; sending = true;
  try { addMessage(await postContent(STK_TAG + ref)); closeTray(); } catch (e) { toast("Sticker failed: " + e.message); } finally { sending = false; }
}
async function uploadChatImage(file) {
  if (!/^image\//.test(file.type)) throw new Error("Choose an image file");
  if (file.size > 15 * 1024 * 1024) throw new Error("Image is over 15 MB");
  const keep = file.type === "image/gif" && file.size <= 3 * 1024 * 1024;
  if (!localMode && db) {
    try {
      const blob = keep ? file : await scaleToBlob(file, 1280, "image/jpeg", 0.82), ext = keep ? "gif" : "jpg";
      const path = `${currentUser.id}/chat-${Date.now()}.${ext}`;
      const { error } = await db.storage.from(MEDIA_BUCKET).upload(path, blob, { contentType: blob.type });
      if (error) throw error;
      return db.storage.from(MEDIA_BUCKET).getPublicUrl(path).data.publicUrl;
    } catch (_) { /* bucket not set up: embed a small copy instead */ }
  }
  const small = keep && file.size <= 350 * 1024 ? file : await scaleToBlob(file, 900, "image/jpeg", 0.7), d = await b2d(small);
  if (d.length > 380000) throw new Error("Photo upload needs the post-media bucket (see README)");
  return d;
}
function setPending(file) {
  if (!file) return;
  if (!/^image\//.test(file.type)) return toast("Choose an image file");
  clearPending(); pending = { file, url: URL.createObjectURL(file) };
  const box = $("chat-attach"); box.replaceChildren();
  const im = el("img", "attach-thumb"); im.src = pending.url; im.alt = "Selected photo";
  const meta = el("div", "attach-meta"); meta.append(el("b", "", file.name.length > 28 ? file.name.slice(0, 25) + "…" : file.name), el("span", "", (file.size / 1024 / 1024).toFixed(file.size > 1048576 ? 1 : 2) + " MB · add a caption, then send"));
  const rm = iconBtn("close", "Remove photo"); rm.addEventListener("click", clearPending);
  box.append(im, meta, rm); box.hidden = false; $("chat-input").focus();
}
function clearPending() {
  if (pending) URL.revokeObjectURL(pending.url); pending = null;
  const box = $("chat-attach"); if (box) { box.replaceChildren(); box.hidden = true; }
  const f = $("chat-photo-file"); if (f) f.value = "";
}

/* ----- render ----- */
function renderBody(item, p) {
  const box = item.querySelector(".chat-content"), list = $("chat-messages"); box.replaceChildren();
  item.classList.toggle("sticker", p.type === "sticker"); item.classList.toggle("has-img", p.type === "image");
  if (p.type === "sticker") box.appendChild(stickerNode(p.ref));
  else if (p.type === "image") {
    const url = safeUrl(p.url), near = list.scrollHeight - list.scrollTop - list.clientHeight < 160;
    if (url) {
      const im = el("img", "chat-img"); im.alt = "Photo"; im.loading = "lazy"; im.src = url; im.addEventListener("click", () => openLightbox(url));
      im.onload = () => { if (near) list.scrollTop = list.scrollHeight; };
      im.onerror = () => im.replaceWith(el("span", "chat-img-missing", "Photo unavailable"));
      box.appendChild(im);
    } else box.appendChild(el("span", "chat-img-missing", "Photo unavailable"));
    if (p.caption) box.appendChild(el("div", "chat-caption", p.caption));
  } else box.textContent = p.text;
  item.querySelector(".chat-edited").hidden = !p.edited;
  const more = item.querySelector(".chat-more"), mine = item.classList.contains("mine");
  more.hidden = !(mine || p.type !== "text");
}
function addMessage(m, { animate = true } = {}) {
  if (m.id && seenMessageIds.has(m.id)) return;
  if (m.id) { seenMessageIds.add(m.id); msgCache.set(m.id, m); }
  const list = $("chat-messages"), mine = !!currentUser && m.author_id === currentUser.id, item = el("div", "chat-message" + (mine ? " mine" : ""));
  if (m.id) item.dataset.id = m.id;
  list.querySelectorAll(".chat-message.system").forEach((x, i) => { if (i > 0) x.remove(); });
  if (!animate) item.style.animation = "none";
  const un = el("div", "chat-username", mine ? "You" : nameFor(m.author_id));
  if (!mine && m.author_id) { un.dataset.user = m.author_id; un.classList.add("link-user"); }
  const foot = el("div", "chat-time"), ed = el("span", "chat-edited", "edited · "); ed.hidden = true;
  foot.append(ed, document.createTextNode(m.created_at ? clockTime(m.created_at) : ""));
  const more = iconBtn("dots", "Message options", "chat-more"); more.addEventListener("click", e => { e.stopPropagation(); openMsgMenu(item, more); });
  item.append(un, el("div", "chat-content"), foot, more);
  renderBody(item, parseMsg(m.content));
  const near = list.scrollHeight - list.scrollTop - list.clientHeight < 120;
  list.appendChild(item); if (near || mine) list.scrollTop = list.scrollHeight;
}

/* ----- message menu, edit, delete ----- */
function openMsgMenu(item, btn) {
  const wasOpen = item.querySelector(".chat-menu"); closeMenus(); if (wasOpen) return;
  const id = item.dataset.id, m = msgCache.get(id); if (!m) return;
  const p = parseMsg(m.content), mine = item.classList.contains("mine"), menu = el("div", "menu chat-menu" + (mine ? "" : " left"));
  const add = (label, fn, cls) => { const b = el("button", cls || "", label); b.type = "button"; b.addEventListener("click", ev => { ev.stopPropagation(); fn(); }); menu.appendChild(b); };
  if (mine && p.type !== "sticker") add("Edit", () => { closeMenus(); startEdit(item); });
  if (p.type !== "text") add(p.type === "sticker" ? "Add to my stickers" : "Save as sticker", () => { closeMenus(); saveAsSticker(p); });
  if (mine) add("Delete", () => confirmDelete(menu, item), "danger");
  item.appendChild(menu);
  const lr = $("chat-messages").getBoundingClientRect(), br = btn.getBoundingClientRect();
  menu.classList.toggle("up", lr.bottom - br.bottom < 170);
}
function confirmDelete(menu, item) {
  menu.replaceChildren(); menu.classList.add("confirm");
  menu.appendChild(el("p", "confirm-text", "Delete this message?"));
  const row = el("div", "confirm-row"), no = el("button", "", "Cancel"), yes = el("button", "danger", "Delete");
  no.type = yes.type = "button";
  no.addEventListener("click", ev => { ev.stopPropagation(); closeMenus(); });
  yes.addEventListener("click", async ev => {
    ev.stopPropagation(); yes.disabled = true; yes.textContent = "Deleting…";
    try { await deleteMessage(item.dataset.id); closeMenus(); removeMsgEl(item.dataset.id); toast("Message deleted"); }
    catch (e) { closeMenus(); toast(e.message); }
  });
  row.append(no, yes); menu.appendChild(row);
}
const NEED_SQL = "Not allowed yet. Run the SQL in the README to enable edit/delete.";
async function deleteMessage(id) {
  if (isLocalId(id) || !db) { saveLocalMsgs(LS.get("lavora_local_msgs", []).filter(m => m.id !== id)); return; }
  const r = await db.from("messages").delete().eq("id", id).eq("author_id", currentUser.id).select("id");
  if (r.error) throw new Error(r.error.message); if (!r.data || !r.data.length) throw new Error(NEED_SQL);
}
async function updateMessage(id, content) {
  if (isLocalId(id) || !db) {
    const arr = LS.get("lavora_local_msgs", []), m = arr.find(x => x.id === id); if (m) { m.content = content; saveLocalMsgs(arr); } return;
  }
  const r = await db.from("messages").update({ content }).eq("id", id).eq("author_id", currentUser.id).select(MSG_COLS);
  if (r.error) throw new Error(r.error.message); if (!r.data || !r.data.length) throw new Error(NEED_SQL);
}
function removeMsgEl(id) {
  seenMessageIds.delete(id); msgCache.delete(id);
  const it = $("chat-messages").querySelector(`.chat-message[data-id="${CSS.escape(id)}"]`); if (!it) return;
  it.classList.add("removing"); setTimeout(() => it.remove(), 220);
}
function startEdit(item) {
  const id = item.dataset.id, m = msgCache.get(id); if (!m || item.classList.contains("editing")) return;
  const p = parseMsg(m.content), box = item.querySelector(".chat-content"), original = p.type === "image" ? p.caption : p.text;
  item.classList.add("editing"); box.replaceChildren();
  if (p.type === "image") { const im = el("img", "chat-img small"); im.src = safeUrl(p.url); box.appendChild(im); }
  const ta = el("textarea", "chat-edit-input"); ta.value = original; ta.maxLength = 1000; ta.rows = 2; ta.setAttribute("aria-label", "Edit message");
  const row = el("div", "edit-row"), cancel = el("button", "btn btn-ghost btn-sm", "Cancel"), save = el("button", "btn btn-primary btn-sm", "Save");
  cancel.type = save.type = "button";
  const done = () => { item.classList.remove("editing"); renderBody(item, parseMsg((msgCache.get(id) || m).content)); };
  const commit = async () => {
    const v = ta.value.trim();
    if (v === original.trim()) return done();
    if (!v && p.type === "text") return toast("A message can't be empty. Use Delete instead.");
    save.disabled = true; save.textContent = "Saving…";
    const content = (p.type === "image" ? IMG_TAG + p.url + (v ? "\n" + v : "") : v) + EDIT_MARK;
    try { await updateMessage(id, content); m.content = content; msgCache.set(id, m); done(); toast("Message updated"); }
    catch (e) { save.disabled = false; save.textContent = "Save"; toast(e.message); }
  };
  cancel.addEventListener("click", done); save.addEventListener("click", commit);
  ta.addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); commit(); } else if (e.key === "Escape") { e.stopPropagation(); done(); } });
  row.append(cancel, save); box.append(ta, row); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);
}

/* ----- lightbox ----- */
function openLightbox(url) {
  const box = el("div", "lightbox"), im = el("img"); im.src = url; im.alt = "Photo";
  const x = iconBtn("close", "Close", "icon-btn lb-x"); box.append(im, x);
  const close = () => { box.remove(); document.removeEventListener("keydown", onKey, true); };
  const onKey = e => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
  box.addEventListener("click", close); document.addEventListener("keydown", onKey, true); document.body.appendChild(box);
}

/* ----- load / live ----- */
function setOnline(on, text) { const d = $("online-dot"); if (!d) return; d.textContent = "● " + text; d.classList.toggle("on", on); }
async function loadMessages() {
  const list = $("chat-messages"); if (!currentUser) return; setMessage($("chat-status"), "");
  try {
    let data = [];
    if (!localMode) {
      try {
        const r = await db.from("messages").select(MSG_COLS).eq("room_id", GLOBAL_CHAT_ROOM_ID).order("created_at", { ascending: false }).limit(100);
        if (r.error) throw r.error; data = r.data || [];
      } catch (err) { if (isNetErr(err)) { localMode = true; toast("Offline: chat saved on this device"); } else throw err; }
    }
    if (localMode) data = LS.get("lavora_local_msgs", []).slice().reverse();
    const msgs = data.slice().reverse(); await fetchProfiles(msgs.map(m => m.author_id));
    list.replaceChildren(); seenMessageIds.clear(); msgCache.clear();
    list.appendChild(el("div", "chat-message system", "Welcome to the LAVORA global chat 👋"));
    if (!msgs.length) list.appendChild(el("div", "chat-message system", "No messages yet. Say hi!"));
    msgs.forEach(m => addMessage(m, { animate: false })); list.scrollTop = list.scrollHeight;
    if (localMode) setOnline(false, "On this device"); else subscribeToChat();
  } catch (err) { setMessage($("chat-status"), "Chat error: " + err.message, "error"); setOnline(false, "Offline"); }
}
function applyRemoteUpdate(m) {
  if (!m || !m.id || !msgCache.has(m.id)) return;
  msgCache.set(m.id, Object.assign(msgCache.get(m.id), m));
  const it = $("chat-messages").querySelector(`.chat-message[data-id="${CSS.escape(m.id)}"]`);
  if (it && !it.classList.contains("editing")) renderBody(it, parseMsg(m.content));
}
function subscribeToChat() {
  if (chatChannel || !db) return;
  const f = "room_id=eq." + GLOBAL_CHAT_ROOM_ID;
  chatChannel = db.channel("lavora-global-chat")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: f }, async p => { await fetchProfiles([p.new.author_id]); addMessage(p.new); })
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages", filter: f }, p => applyRemoteUpdate(p.new))
    .on("postgres_changes", { event: "DELETE", schema: "public", table: "messages" }, p => { if (p.old && p.old.id && msgCache.has(p.old.id)) removeMsgEl(p.old.id); })
    .subscribe(s => {
      if (s === "SUBSCRIBED") setOnline(true, "Online");
      else if (["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(s)) setOnline(false, "Reconnecting");
    });
}

/* ----- build composer ----- */
function initChat() {
  const form = $("public-chat-form"), input = $("chat-input"); if (!form || !input) return;
  const submit = form.querySelector("button[type=submit]");
  input.removeAttribute("required"); input.placeholder = "Message the community…";
  const emojiBtn = iconBtn("smile", "Emoji and stickers", "icon-btn chat-tool"), photoBtn = iconBtn("image", "Send a photo", "icon-btn chat-tool");
  emojiBtn.id = "chat-emoji-btn";
  const photoFile = el("input"); photoFile.type = "file"; photoFile.accept = "image/*"; photoFile.id = "chat-photo-file"; photoFile.hidden = true;
  const stkFile = el("input"); stkFile.type = "file"; stkFile.accept = "image/*"; stkFile.multiple = true; stkFile.id = "stk-file"; stkFile.hidden = true;
  const packFile = el("input"); packFile.type = "file"; packFile.accept = "application/json,.json"; packFile.id = "stk-pack"; packFile.hidden = true;
  form.insertBefore(photoBtn, input); form.insertBefore(emojiBtn, photoBtn); form.append(photoFile, stkFile, packFile);
  const attach = el("div", "chat-attach"); attach.id = "chat-attach"; attach.hidden = true;
  const tray = el("div", "chat-tray"); tray.id = "chat-tray"; tray.hidden = true;
  form.before(tray, attach);

  emojiBtn.addEventListener("click", () => trayOpen ? closeTray() : openTray());
  photoBtn.addEventListener("click", () => photoFile.click());
  photoFile.addEventListener("change", () => setPending(photoFile.files[0]));
  stkFile.addEventListener("change", async () => { await addStickerFiles([...stkFile.files]); stkFile.value = ""; });
  packFile.addEventListener("change", async () => { if (packFile.files[0]) await importPack(packFile.files[0]); packFile.value = ""; });
  input.addEventListener("paste", e => { const f = [...(e.clipboardData?.files || [])].find(x => /^image\//.test(x.type)); if (f) { e.preventDefault(); setPending(f); } });
  input.addEventListener("focus", () => { if (window.innerWidth < 620 && trayOpen) closeTray(); });
  $("chat-messages").addEventListener("click", e => { if (!e.target.closest(".menu") && !e.target.closest(".chat-more")) closeMenus(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && trayOpen) closeTray(); });

  form.addEventListener("submit", async e => {
    e.preventDefault(); if (!currentUser || sending) return;
    const text = input.value.trim(); if (!pending && !text) return;
    sending = true; submit.disabled = true;
    try {
      const content = pending ? IMG_TAG + await uploadChatImage(pending.file) + (text ? "\n" + text : "") : text;
      const data = await postContent(content);
      input.value = ""; clearPending(); addMessage(data);
    } catch (err) { toast("Message failed: " + err.message); }
    finally { sending = false; submit.disabled = false; input.focus(); }
  });
}

/* =========================================================
   LOGIN STREAK  (stored on this device, per account)
   ========================================================= */
const TIERS = [[100, "Legend"], [30, "Mythic"], [14, "Inferno"], [7, "Blaze"], [3, "Flame"], [1, "Spark"]];
const MILESTONES = [3, 7, 14, 30, 60, 100, 200, 365, 500, 1000];
const tierOf = n => { for (let i = 0; i < TIERS.length; i++) if (n >= TIERS[i][0]) return { level: 6 - i, name: TIERS[i][1] }; return { level: 0, name: "Cold" }; };
const dayKey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const dayNum = k => { const [y, m, d] = k.split("-").map(Number); return Math.round(Date.UTC(y, m - 1, d) / 864e5); };
const skKey = () => "lavora_streak_" + currentUser.id;
const loadStreak = () => Object.assign({ count: 0, best: 0, last: null, days: [], total: 0 }, LS.get(skKey(), null) || {});
function checkIn() {
  const s = loadStreak(), today = dayKey(new Date());
  if (s.last && dayNum(today) <= dayNum(s.last)) return { s, isNew: false, broke: 0, milestone: 0 };
  let broke = 0;
  if (s.last && dayNum(today) - dayNum(s.last) === 1) s.count += 1; else { broke = s.last ? s.count : 0; s.count = 1; }
  s.last = today; s.best = Math.max(s.best, s.count); s.total = (s.total || 0) + 1; s.days = [...(s.days || []), today].slice(-60);
  LS.set(skKey(), s);
  return { s, isNew: true, broke, milestone: MILESTONES.includes(s.count) ? s.count : 0 };
}
const flameSvg = cls => `<svg class="flame ${cls || ""}" viewBox="0 0 100 130" aria-hidden="true"><path class="f-out" d="M50 3C55 26 84 40 84 80C84 106 69 126 50 126C31 126 16 106 16 80C16 60 27 49 35 37C37 48 41 53 46 51C40 33 42 17 50 3Z"/><path class="f-mid" d="M50 40C54 56 70 64 70 86C70 104 61 118 50 118C39 118 30 104 30 86C30 74 37 68 42 60C44 67 47 69 50 67C47 58 47 50 50 40Z"/><path class="f-core" d="M50 80C53 90 60 93 60 103C60 111 55 117 50 117C45 117 40 111 40 103C40 97 44 93 47 88C48 92 49 93 51 92C49 88 49 84 50 80Z"/></svg>`;
function weekDays(s) {
  const out = [], set = new Set(s.days || []), L = ["S", "M", "T", "W", "T", "F", "S"];
  for (let i = 6; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); const k = dayKey(d); out.push({ k, letter: L[d.getDay()], done: set.has(k), today: i === 0 }); }
  return out;
}
function nextMilestone(n) { const nx = MILESTONES.find(m => m > n) || n + 100, prev = [...MILESTONES].reverse().find(m => m <= n) || 0; return { next: nx, prev, pct: Math.max(4, Math.round(((n - prev) / (nx - prev)) * 100)) }; }

function buildStreakUI() {
  if ($("streak-sheet")) return;
  const chip = el("button", "streak-chip"); chip.type = "button"; chip.id = "streak-chip"; chip.hidden = true; chip.setAttribute("aria-label", "Login streak");
  chip.innerHTML = flameSvg("mini") + "<b>0</b>";
  const actions = document.querySelector(".header-actions"); if (actions) actions.prepend(chip);
  chip.addEventListener("click", () => openStreak());

  const sheet = el("div", "sheet"); sheet.id = "streak-sheet"; sheet.hidden = true; sheet.setAttribute("role", "dialog"); sheet.setAttribute("aria-modal", "true"); sheet.setAttribute("aria-label", "Login streak");
  sheet.innerHTML = `<div class="sheet-backdrop" data-close="streak-sheet"></div>
    <div class="sheet-panel gb streak-panel" id="streak-panel">
      <canvas class="streak-confetti" id="streak-confetti" aria-hidden="true"></canvas>
      <button type="button" class="icon-btn streak-x" data-close="streak-sheet" aria-label="Close">${svgIcon(ICONS.close)}</button>
      <div class="streak-hero"><div class="streak-rays"></div><div class="flame-wrap">${flameSvg("big")}<i class="spark s1"></i><i class="spark s2"></i><i class="spark s3"></i><i class="spark s4"></i><i class="spark s5"></i></div></div>
      <div class="streak-count"><span id="sk-num">0</span></div>
      <div class="streak-label">day streak</div>
      <div class="streak-tier" id="sk-tier"></div>
      <p class="streak-msg" id="sk-msg"></p>
      <div class="streak-week" id="sk-week"></div>
      <div class="streak-next"><div class="sn-top"><span id="sk-next-label"></span><b id="sk-next-left"></b></div><div class="sn-bar"><i id="sk-bar"></i></div></div>
      <div class="streak-stats"><div><b id="sk-best">0</b><span>Best</span></div><div><b id="sk-total">0</b><span>Days active</span></div></div>
      <button type="button" class="btn btn-primary btn-block" data-close="streak-sheet">Keep it going</button>
    </div>`;
  document.body.appendChild(sheet);
  document.addEventListener("keydown", e => { if (e.key === "Escape" && !sheet.hidden) closeSheet("streak-sheet"); });

  const card = el("button", "streak-card"); card.type = "button"; card.id = "streak-card"; card.hidden = true;
  const anchor = $("edit-profile"); if (anchor) anchor.before(card);
  card.addEventListener("click", () => openStreak());
}
function applyTier(node, level) { node.dataset.tier = level; }
function paintStreakWidgets(s) {
  const t = tierOf(s.count), chip = $("streak-chip"), card = $("streak-card");
  if (chip) { chip.hidden = false; applyTier(chip, t.level); chip.querySelector("b").textContent = s.count; chip.title = s.count + "-day streak"; }
  if (card) {
    card.hidden = false; applyTier(card, t.level);
    card.innerHTML = flameSvg("card-flame") + `<div class="sc-text"><b>${s.count}-day streak</b><span>${t.name} · Best ${s.best} · tap for details</span></div><div class="sc-dots">${weekDays(s).map(d => `<i class="${d.done ? "on" : ""}"></i>`).join("")}</div>`;
  }
}
function openStreak(res) {
  if (!currentUser) return;
  const s = (res && res.s) || loadStreak(), isNew = !!(res && res.isNew), panel = $("streak-panel"), t = tierOf(s.count);
  applyTier(panel, t.level); $("sk-tier").textContent = t.name; $("sk-best").textContent = s.best; $("sk-total").textContent = s.total;
  const todayDone = s.last === dayKey(new Date());
  let msg;
  if (res && res.milestone) msg = `🏆 Milestone unlocked: ${s.count} days in a row!`;
  else if (isNew && res.broke) msg = `Your ${res.broke}-day streak ended, but today is a fresh start. You've got this.`;
  else if (isNew && s.count === 1) msg = "Streak started! Come back tomorrow to keep it alive.";
  else if (isNew) msg = `Day ${s.count}. You're on fire. See you tomorrow!`;
  else msg = todayDone ? `Checked in today ✅ Come back tomorrow to reach ${s.count + 1}.` : "Log in today to start your streak.";
  $("sk-msg").textContent = msg;
  const wk = $("sk-week"); wk.replaceChildren();
  weekDays(s).forEach((d, i) => {
    const c = el("div", "wd" + (d.done ? " done" : "") + (d.today ? " today" : "")); c.style.setProperty("--i", i);
    c.innerHTML = `<span>${d.letter}</span><div class="wd-dot">${d.done ? flameSvg("wd-flame") : ""}</div>`; wk.appendChild(c);
  });
  const nm = nextMilestone(s.count), bar = $("sk-bar"); bar.style.width = "0%";
  $("sk-next-label").textContent = `Next reward: ${nm.next} days`; $("sk-next-left").textContent = (nm.next - s.count) + " to go";
  openSheet("streak-sheet");
  const num = $("sk-num"), from = s.count <= 12 ? 0 : s.count - 12;
  num.parentElement.classList.remove("pop");
  if (reduceMotion() || !isNew) { num.textContent = s.count; bar.style.width = nm.pct + "%"; }
  else {
    const t0 = performance.now(), dur = 900;
    const step = now => { const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3); num.textContent = Math.round(from + (s.count - from) * e); if (k < 1) requestAnimationFrame(step); else num.parentElement.classList.add("pop"); };
    requestAnimationFrame(step); setTimeout(() => { bar.style.width = nm.pct + "%"; }, 350);
  }
  if (isNew && !reduceMotion()) { confetti(res.milestone ? 140 : 70); if (res.milestone && navigator.vibrate && navigator.userActivation && navigator.userActivation.hasBeenActive) { try { navigator.vibrate([30, 40, 60]); } catch (_) {} } }
}
function confetti(n) {
  const cv = $("streak-confetti"), panel = $("streak-panel"); if (!cv || !panel) return;
  const w = cv.width = panel.clientWidth, h = cv.height = panel.clientHeight, ctx = cv.getContext("2d");
  const cols = ["#ff9a5d", "#ffd166", "#ff5d7e", "#8b5cf6", "#3b82f6", "#2cf5b0", "#ffffff"];
  const ps = Array.from({ length: n }, () => ({ x: w / 2 + (Math.random() - .5) * 60, y: h * 0.28, vx: (Math.random() - .5) * 9, vy: -Math.random() * 9 - 3, r: Math.random() * 5 + 3, c: cols[(Math.random() * cols.length) | 0], a: Math.random() * 6, va: (Math.random() - .5) * .4, life: 0 }));
  const t0 = performance.now();
  (function frame(now) {
    const k = (now - t0) / 2200; ctx.clearRect(0, 0, w, h);
    if (k >= 1 || $("streak-sheet").hidden) return ctx.clearRect(0, 0, w, h);
    ps.forEach(p => { p.vy += .32; p.x += p.vx; p.y += p.vy; p.a += p.va; ctx.save(); ctx.globalAlpha = Math.max(0, 1 - k * k); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.fillStyle = p.c; ctx.fillRect(-p.r, -p.r / 2, p.r * 2, p.r); ctx.restore(); });
    requestAnimationFrame(frame);
  })(t0);
}
let lastCheckDay = null;
function runStreak() {
  if (!currentUser) return;
  buildStreakUI();
  const res = checkIn(); paintStreakWidgets(res.s); lastCheckDay = dayKey(new Date());
  if (res.isNew) {
    const chip = $("streak-chip"); chip.classList.remove("bump"); void chip.offsetWidth; chip.classList.add("bump");
    if (res.milestone && typeof addNotif === "function") addNotif(`🔥 ${res.s.count}-day login streak. Milestone reached!`);
    setTimeout(() => { if (currentUser && !screens.dash.hidden && $("streak-sheet").hidden) openStreak(res); }, 700);
  }
}
document.addEventListener("visibilitychange", () => { if (!document.hidden && currentUser && !screens.dash.hidden && lastCheckDay && lastCheckDay !== dayKey(new Date())) runStreak(); });

/* =========================================================
   wiring
   ========================================================= */
initChat();
window.loadMessages = loadMessages;
window.lavoraFeatures = {
  onEnter() { loadStickers(); runStreak(); },
  onLeave() {
    closeTray(); clearPending(); msgCache.clear(); myStickers = []; lastCheckDay = null;
    const c = $("streak-chip"); if (c) c.hidden = true; const k = $("streak-card"); if (k) k.hidden = true;
    const sh = $("streak-sheet"); if (sh && !sh.hidden) closeSheet("streak-sheet");
  },
  preview: previewText
};
if (typeof currentUser !== "undefined" && currentUser && typeof screens !== "undefined" && !screens.dash.hidden) window.lavoraFeatures.onEnter();   // app finished loading before this file ran
})();
