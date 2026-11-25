/* =====================================================================
   LAVORA 7.1 — live.js
   Agora Web SDK broadcasting + viewing, screen-share with face cam,
   live chat (text / emoji / stickers), spammable hearts, design-only gifts.
   Loaded after script.js (shares its globals: db, localMode, currentUser, toast, setMessage,
   liveStream, stopCamera, nameFor, fetchProfiles, GAMES ...). No secrets here.
   ===================================================================== */
(() => {
"use strict";
const SDK_URL = "https://cdn.jsdelivr.net/npm/agora-rtc-sdk-ng@4.23.4/AgoraRTC_N-production.js"; // pinned
const FN = "agora-token";
const $ = id => document.getElementById(id);
const h = (tag, cls, txt) => { const n = document.createElement(tag); if (cls) n.className = cls; if (txt != null) n.textContent = txt; return n; };
const say = (t, type = "") => setMessage($("live-status"), t, type);
const STUDIO_DEFAULT = "Camera and streaming services are not yet connected.";
const fmt = n => n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1000 ? (n / 1000).toFixed(1) + "K" : String(n);
const reduceMotion = () => !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);

/* Android app (Capacitor) exposes a native screen-capture plugin. In the browser this stays null. */
const Native = (() => {
  try {
    const C = window.Capacitor;
    if (C && C.isNativePlatform && C.isNativePlatform() && C.getPlatform() === "android")
      return C.registerPlugin ? C.registerPlugin("LavoraScreen") : (C.Plugins && C.Plugins.LavoraScreen) || null;
  } catch (_) {}
  return null;
})();
const canScreen = () => !!Native || !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia);

class LiveError extends Error { constructor(m, code) { super(m); this.code = code; } }

let sdkP = null;
function loadSdk() {
  if (window.AgoraRTC) return Promise.resolve(window.AgoraRTC);
  if (!sdkP) sdkP = new Promise((res, rej) => {
    const s = document.createElement("script"); s.src = SDK_URL;
    s.onload = () => window.AgoraRTC ? res(window.AgoraRTC) : rej(new LiveError("Streaming engine failed to load.", "SDK"));
    s.onerror = () => { sdkP = null; rej(new LiveError("Could not load the streaming engine. Check your connection.", "SDK")); };
    document.head.appendChild(s);
  });
  return sdkP;
}
async function callFn(body) {
  if (!db || localMode || !currentUser) throw new LiveError("Live streaming needs an online LAVORA account.", "OFFLINE");
  const { data, error } = await db.functions.invoke(FN, { body });
  if (error) {
    let j = null; try { j = error.context && error.context.json ? await error.context.json() : null; } catch (_) {}
    throw new LiveError((j && j.error) || "Secure connection could not be started.", (j && j.code) || "FN_ERROR");
  }
  if (data && data.error) throw new LiveError(data.error, data.code);
  return data;
}

/* =====================================================================
   FX: floating hearts + gift banners / pop-ups over a video container
   ===================================================================== */
const HEART_COLORS = ["#ff5d7e", "#ff3d6e", "#ff9a5d", "#a855f7", "#3b82f6", "#2cf5b0"];
function createFx(container) {
  const hearts = h("div", "fx-hearts"), gifts = h("div", "fx-gifts"), pop = h("div", "fx-pop");
  container.append(hearts, gifts, pop);
  const spawn = () => {
    if (reduceMotion()) return;
    while (hearts.childElementCount > 45) hearts.firstChild.remove();
    const e = h("span", "fx-heart", "❤"); e.style.color = HEART_COLORS[(Math.random() * HEART_COLORS.length) | 0];
    e.style.setProperty("--dx", Math.round((Math.random() - 0.5) * 90) + "px");
    e.style.setProperty("--r", Math.round((Math.random() - 0.5) * 50) + "deg");
    e.style.setProperty("--s", (0.8 + Math.random() * 0.9).toFixed(2));
    e.style.fontSize = 20 + Math.round(Math.random() * 16) + "px";
    e.addEventListener("animationend", () => e.remove()); hearts.appendChild(e);
  };
  return {
    hearts(n) { for (let i = 0; i < n; i++) setTimeout(spawn, i * 70); },
    gift(name, g) {
      while (gifts.childElementCount >= 3) gifts.firstChild.remove();
      const b = h("div", "fx-gift"); b.append(h("span", "", g.e), document.createTextNode(name + " sent " + g.n));
      gifts.appendChild(b); setTimeout(() => b.remove(), 3700);
      if (!reduceMotion()) { const p = h("div", "fx-pop-e", g.e); pop.appendChild(p); setTimeout(() => p.remove(), 2100); }
    },
    destroy() { hearts.remove(); gifts.remove(); pop.remove(); }
  };
}

/* =====================================================================
   LIVE CHAT: text / emoji / stickers / gifts (stream_chat table) + hearts (broadcast)
   Gifts are DESIGN ONLY: they are sent like stickers, nothing is charged.
   ===================================================================== */
const STK_GEN = [["GG", "#8b5cf6", "#3b82f6"], ["EZ", "#12b886", "#2cf5b0"], ["LFG", "#ff5d7e", "#ff9a5d"], ["GLHF", "#3b82f6", "#22d3ee"],
  ["NT", "#f59e0b", "#ef4444"], ["WP", "#10b981", "#3b82f6"], ["RIP", "#475569", "#1e293b"], ["CLUTCH", "#a855f7", "#f43f5e"],
  ["HYPE", "#f43f5e", "#f59e0b"], ["W", "#22c55e", "#16a34a"], ["L", "#ef4444", "#b91c1c"], ["OP!", "#eab308", "#f97316"]];
const STK_EMO = "🔥 😂 😭 😎 🥳 💀 👑 🎮 🏆 💯 🤝 👀 🫡 😤 🤯 ❤️".split(" ");
const EMOJI = "😀 😁 😂 🤣 😊 😍 🥰 😘 😎 🤩 🥳 😏 😮 😱 😭 😤 😡 🤔 🙄 😴 🤝 👏 🙌 👍 👎 💪 🙏 🔥 ⚡ ✨ 💯 🎉 ❤️ 💜 💙 💚 🧡 💔 🎮 🕹️ 🏆 🥇 🎯 💣 ⚔️ 🛡️ 👑 💎 🚀 💀 👀 😈 🤖".split(" ");
const GIFTS = [{ id: "rose", e: "🌹", n: "Rose", p: 1 }, { id: "pad", e: "🎮", n: "Controller", p: 5 }, { id: "cup", e: "🏆", n: "Trophy", p: 10 },
  { id: "crown", e: "👑", n: "Crown", p: 25 }, { id: "rocket", e: "🚀", n: "Rocket", p: 50 }, { id: "gem", e: "💎", n: "Diamond", p: 100 },
  { id: "dragon", e: "🐉", n: "Dragon", p: 200 }, { id: "galaxy", e: "🌌", n: "Galaxy", p: 500 }];
const HEX = /^#[0-9a-f]{6}$/i;

function stickerNode(content) {
  if (content.startsWith("emoji:")) return h("span", "lc-emo-big", content.slice(6, 16));
  if (content.startsWith("gen:")) {
    const [t, c1, c2] = content.slice(4).split("|");
    if (/^[A-Z0-9!?+]{1,8}$/.test(t || "") && HEX.test(c1 || "") && HEX.test(c2 || "")) {
      const n = h("span", "lc-stk", t); n.style.background = `linear-gradient(135deg,${c1},${c2})`; return n;
    }
  }
  return h("span", "", "[sticker]");
}
const nameColor = id => { let x = 0; for (let i = 0; i < id.length; i++) x = (x * 31 + id.charCodeAt(i)) % 360; return `hsl(${x} 75% 66%)`; };

function createChat(streamId, opts) {
  const fx = opts.fx;
  let destroyed = false, last = 0, pending = 0, total = 0, flushT = null, holdT = null, trayTab = null, chain = Promise.resolve();
  const seen = new Set();
  const el = h("div", "lc " + (opts.overlay ? "lc-overlay" : "lc-embedded"));
  const feed = h("div", "lc-feed"); feed.setAttribute("aria-live", "polite");
  const tray = h("div", "lc-tray"); tray.hidden = true;
  const bar = h("div", "lc-bar");
  const input = h("input", "lc-input"); input.type = "text"; input.maxLength = 200; input.placeholder = "Say something…"; input.autocomplete = "off"; input.setAttribute("aria-label", "Chat message");
  const send = h("button", "lc-btn lc-send", "➤"); send.type = "button"; send.setAttribute("aria-label", "Send");
  const emojiBtn = h("button", "lc-btn", "😊"); emojiBtn.type = "button"; emojiBtn.setAttribute("aria-label", "Emoji and stickers");
  const giftBtn = h("button", "lc-btn", "🎁"); giftBtn.type = "button"; giftBtn.setAttribute("aria-label", "Send a gift");
  bar.append(input, send, emojiBtn, giftBtn);
  let heart = null;
  if (opts.canHeart) { heart = h("button", "lc-heart", "❤"); heart.type = "button"; heart.setAttribute("aria-label", "Send love"); bar.appendChild(heart); }
  el.append(feed, tray, bar);

  const updateHearts = () => { if (opts.onHearts) opts.onHearts(total); };

  /* ----- channel: new rows + hearts ----- */
  const ch = db.channel("lavora-sc-" + streamId)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "stream_chat", filter: "stream_id=eq." + streamId }, p => enqueue(p.new, true))
    .on("broadcast", { event: "hearts" }, ({ payload }) => {
      const n = Math.min(60, Math.max(1, (payload && payload.n) | 0)); total += n; fx.hearts(Math.min(n, 8)); updateHearts();
    })
    .subscribe();

  function enqueue(row, fresh) { chain = chain.then(() => addMsg(row, fresh)).catch(() => {}); }
  async function addMsg(row, fresh) {
    if (destroyed || !row || seen.has(row.id)) return; seen.add(row.id);
    try { if (typeof fetchProfiles === "function") await fetchProfiles([row.user_id]); } catch (_) {}
    if (destroyed) return;
    const mine = !!currentUser && row.user_id === currentUser.id;
    const name = mine ? "You" : (typeof nameFor === "function" ? nameFor(row.user_id) : "Member");
    const g = row.kind === "gift" ? GIFTS.find(x => x.id === row.content) : null;
    const line = h("div", "lc-line" + (row.kind === "sticker" ? " is-sticker" : row.kind === "gift" ? " is-gift" : ""));
    const nm = h("span", "lc-name", name); nm.style.color = row.kind === "gift" ? "#fff" : nameColor(row.user_id); line.appendChild(nm);
    if (row.kind === "sticker") line.appendChild(stickerNode(String(row.content)));
    else if (row.kind === "gift") { line.append(document.createTextNode(" sent " + (g ? g.n + " " : "a gift ")), h("span", "", g ? g.e : "🎁")); }
    else line.appendChild(document.createTextNode(String(row.content)));
    const near = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 90;
    feed.appendChild(line); while (feed.childElementCount > 80) feed.firstChild.remove();
    if (near || mine) feed.scrollTop = feed.scrollHeight;
    if (g && fresh) fx.gift(name, g);
  }
  db.from("stream_chat").select("id,user_id,kind,content,created_at").eq("stream_id", streamId).order("created_at", { ascending: false }).limit(40)
    .then(({ data }) => { (data || []).slice().reverse().forEach(r => enqueue(r, false)); }, () => {});

  /* ----- sending ----- */
  async function post(kind, content) {
    if (!currentUser || localMode) return toast("Sign in online to chat");
    const now = Date.now(); if (now - last < 800) return toast("Slow down a little"); last = now;
    const { error } = await db.from("stream_chat").insert({ stream_id: streamId, user_id: currentUser.id, kind, content });
    if (error) toast(/slow/i.test(error.message) ? "Slow down a little" : "Message not sent");
  }
  const sendText = () => { const t = input.value.trim(); if (!t) return; input.value = ""; post("text", t.slice(0, 200)); };
  send.addEventListener("click", sendText);
  input.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); sendText(); } });
  input.addEventListener("focus", () => { if (opts.overlay && window.innerWidth < 900) closeTray(); });

  /* ----- hearts: tap or HOLD to spam ----- */
  function tapHeart() {
    fx.hearts(1); pending++; total++; updateHearts();
    if (!flushT) flushT = setTimeout(flush, 450);
  }
  function flush() {
    flushT = null; const n = Math.min(pending, 60); pending = 0;
    if (n > 0) { try { Promise.resolve(ch.send({ type: "broadcast", event: "hearts", payload: { n } })).catch(() => {}); } catch (_) {} }
  }
  if (heart) {
    const stop = () => { clearInterval(holdT); holdT = null; };
    heart.addEventListener("pointerdown", e => { e.preventDefault(); tapHeart(); stop(); holdT = setInterval(tapHeart, 110); });
    ["pointerup", "pointerleave", "pointercancel"].forEach(ev => heart.addEventListener(ev, stop));
    heart.addEventListener("contextmenu", e => e.preventDefault());
    heart.addEventListener("click", e => { if (e.detail === 0) tapHeart(); });   // keyboard
  }

  /* ----- tray: emoji / stickers / gifts ----- */
  function closeTray() { trayTab = null; tray.hidden = true; }
  function openTray(tab) { if (trayTab === tab) return closeTray(); trayTab = tab; tray.hidden = false; renderTray(); }
  function renderTray() {
    tray.replaceChildren();
    const tabs = h("div", "lc-tabs");
    [["emoji", "😊 Emoji"], ["stickers", "Stickers"], ["gifts", "🎁 Gifts"]].forEach(([k, l]) => {
      const b = h("button", "lc-tab" + (k === trayTab ? " on" : ""), l); b.type = "button"; b.addEventListener("click", () => { trayTab = k; renderTray(); }); tabs.appendChild(b);
    });
    const grid = h("div", "lc-grid " + (trayTab === "emoji" ? "emo" : trayTab === "stickers" ? "stk" : "gft"));
    if (trayTab === "emoji") EMOJI.forEach(e => {
      const b = h("button", "lc-cell", e); b.type = "button";
      b.addEventListener("click", () => { if (input.value.length + e.length <= input.maxLength) input.value += e; input.focus(); }); grid.appendChild(b);
    });
    else if (trayTab === "stickers") {
      STK_GEN.forEach(([t, c1, c2]) => {
        const b = h("button", "lc-cell stk-text", t); b.type = "button"; b.style.background = `linear-gradient(135deg,${c1},${c2})`;
        b.addEventListener("click", () => { post("sticker", `gen:${t}|${c1}|${c2}`); closeTray(); }); grid.appendChild(b);
      });
      STK_EMO.forEach(e => {
        const b = h("button", "lc-cell stk-cell", e); b.type = "button";
        b.addEventListener("click", () => { post("sticker", "emoji:" + e); closeTray(); }); grid.appendChild(b);
      });
    } else {
      GIFTS.forEach(g => {
        const b = h("button", "lc-cell lc-gift"); b.type = "button"; b.append(h("span", "", g.e), h("small", "", g.n), h("i", "", "🪙 " + g.p));
        b.addEventListener("click", () => { post("gift", g.id); closeTray(); }); grid.appendChild(b);
      });
      grid.appendChild(h("p", "lc-note", "Gifts are just for fun right now. No coins are charged."));
    }
    tray.append(tabs, grid);
  }
  emojiBtn.addEventListener("click", () => openTray("emoji"));
  giftBtn.addEventListener("click", () => openTray("gifts"));

  return {
    el,
    destroy() {
      destroyed = true; clearInterval(holdT); clearTimeout(flushT);
      try { db.removeChannel(ch); } catch (_) {}
      el.remove();
    }
  };
}

/* =====================================================================
   BROADCAST MODES: camera, or screen share + face cam (composited on a canvas)
   NOTE: browsers on phones cannot share their screen. Phone gameplay needs the native Android build.
   ===================================================================== */
let mode = "camera";
const comp = { c: null };   // composite capture session
const BUSY = ["STARTING", "CONNECTING", "LIVE", "RECONNECTING", "ENDING"];

function makeTicker(fps, cb) {
  try {
    const src = `let t=null;onmessage=e=>{if(e.data==='start'){t=setInterval(()=>postMessage(0),${Math.round(1000 / fps)})}else{clearInterval(t)}}`;
    const url = URL.createObjectURL(new Blob([src], { type: "text/javascript" })), w = new Worker(url);
    w.onmessage = cb; w.postMessage("start");
    return () => { try { w.postMessage("stop"); w.terminate(); URL.revokeObjectURL(url); } catch (_) {} };
  } catch (_) { const t = setInterval(cb, Math.round(1000 / fps)); return () => clearInterval(t); }   // worker timers keep running when the tab is in the background
}
function stopComposite() {
  const c = comp.c; if (!c) return; comp.c = null; c.stopping = true;
  try { c.stopTick(); } catch (_) {}
  [c.disp, c.user].forEach(s => { if (s) s.getTracks().forEach(t => { try { t.stop(); } catch (_) {} }); });
  try { c.sv.srcObject = null; if (c.cv) c.cv.srcObject = null; } catch (_) {}
  try { c.ac.close(); } catch (_) {}
}
const vid = stream => { const v = document.createElement("video"); v.muted = true; v.playsInline = true; v.srcObject = stream; return v; };

async function startScreen() {
  if (BUSY.includes(state)) return;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) return say("Screen sharing isn't supported in this browser. Use desktop Chrome or Edge.", "error");
  const AC = window.AudioContext || window.webkitAudioContext;
  const ac = new AC();                                   // created inside the click so audio is allowed to run
  stopComposite();
  if (liveStream) { liveStream.getTracks().forEach(t => t.stop()); liveStream = null; }
  say("Choose the game window or screen to share…");
  let disp = null, user = null;
  try {
    disp = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 30 }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: true });
  } catch (e) { try { ac.close(); } catch (_) {} return say(e && e.name === "NotAllowedError" ? "Screen sharing was cancelled." : "Could not share the screen: " + (e && e.message), "error"); }
  const wantFace = $("live-face").checked;
  try { user = await navigator.mediaDevices.getUserMedia({ video: wantFace ? { facingMode: "user", width: { ideal: 480 }, height: { ideal: 480 } } : false, audio: true }); }
  catch (_) { try { user = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch (__) { user = null; } }

  const W = 1280, H = 720, cvs = document.createElement("canvas"); cvs.width = W; cvs.height = H;
  const ctx = cvs.getContext("2d"), sv = vid(new MediaStream(disp.getVideoTracks()));
  const camTracks = user ? user.getVideoTracks() : [], cv = camTracks.length ? vid(new MediaStream(camTracks)) : null;
  try { await sv.play(); if (cv) await cv.play(); } catch (_) {}

  const draw = () => {
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
    const vw = sv.videoWidth || W, vh = sv.videoHeight || H, r = Math.min(W / vw, H / vh), dw = vw * r, dh = vh * r;
    try { ctx.drawImage(sv, (W - dw) / 2, (H - dh) / 2, dw, dh); } catch (_) {}
    if (cv && cv.videoWidth && $("live-face").checked) {
      const d = 200, m = 22, corner = $("live-face-corner").value || "tr";
      const x = corner.endsWith("r") ? W - d - m : m, y = corner.startsWith("t") ? m : H - d - m, s = Math.min(cv.videoWidth, cv.videoHeight);
      ctx.save(); ctx.shadowColor = "rgba(0,0,0,.55)"; ctx.shadowBlur = 18;
      ctx.beginPath(); ctx.arc(x + d / 2, y + d / 2, d / 2, 0, Math.PI * 2); ctx.closePath(); ctx.fillStyle = "#000"; ctx.fill();
      ctx.shadowBlur = 0; ctx.clip();
      try { ctx.drawImage(cv, (cv.videoWidth - s) / 2, (cv.videoHeight - s) / 2, s, s, x, y, d, d); } catch (_) {}
      ctx.restore();
      ctx.lineWidth = 5; ctx.strokeStyle = "#fff"; ctx.beginPath(); ctx.arc(x + d / 2, y + d / 2, d / 2 - 2, 0, Math.PI * 2); ctx.stroke();
    }
  };
  draw();
  const stopTick = makeTicker(24, draw);

  // mix game/tab audio + microphone into one track
  const dest = ac.createMediaStreamDestination();
  if (disp.getAudioTracks().length) ac.createMediaStreamSource(new MediaStream(disp.getAudioTracks())).connect(dest);
  if (user && user.getAudioTracks().length) ac.createMediaStreamSource(new MediaStream(user.getAudioTracks())).connect(dest);
  const out = cvs.captureStream(30);
  dest.stream.getAudioTracks().forEach(t => out.addTrack(t));

  const session = { disp, user, sv, cv, ac, stopTick, out, stopping: false };
  comp.c = session;
  disp.getVideoTracks()[0].addEventListener("ended", () => {
    if (session.stopping || comp.c !== session) return;
    const wasLive = !!(host.streamId || host.client);
    (wasLive ? end() : Promise.resolve()).then(() => { stopCamera(); say("Screen sharing stopped."); toast("Screen sharing stopped"); });
  });

  liveStream = out;
  const prev = $("live-preview"); prev.srcObject = out; $("video-placeholder").hidden = true;
  $("broadcast-start").disabled = false;
  const notes = [];
  if (!disp.getAudioTracks().length) notes.push("no game audio (tick “Share audio” in the picker)");
  if (wantFace && !cv) notes.push("camera unavailable");
  if (!user) notes.push("no microphone");
  say("Screen ready" + (notes.length ? " (" + notes.join(", ") + ")" : "") + ". Choose your game and a title, then go live.", "ok");
}

function paintMode() {
  document.querySelectorAll(".st-mode").forEach(b => b.classList.toggle("active", b.dataset.mode === mode));
  const g = mode === "gameplay", opts = $("st-screen-opts"), hint = $("st-hint"), stage = document.querySelector("#live-studio-page .st-stage");
  if (opts) opts.hidden = !g;
  if (stage) stage.classList.toggle("screen", g);
  const nat = g && !!Native, cs = $("camera-start"), ow = $("live-orient-wrap");
  if (cs) { cs.textContent = g ? "Share screen" : "Enable camera"; cs.hidden = nat; }
  if (ow) ow.hidden = !nat;
  if (hint) {
    hint.hidden = !g;
    hint.textContent = nat
      ? "Pick your game and a title, then press Go live. Android will ask to record your screen. Switch to your game and LAVORA keeps streaming from a notification. Come back here to end the stream."
      : canScreen()
        ? "Pick your game window (or screen). Tick “Share audio” to include game sound. Your face shows in the corner you choose."
        : "This browser can't share the screen. On a phone, use the LAVORA Android app; on a computer, use Chrome or Edge.";
  }
}
function setMode(m) {
  if (m === mode) return;
  if (BUSY.includes(state)) return toast("End your broadcast first");
  if (liveStream || comp.c) stopCamera();
  mode = m; paintMode();
  say(m === "gameplay" ? (Native ? "Pick a game and title, then press Go live." : "Click “Share screen” to begin.") : "Enable your camera to get started.");
}

/* =====================================================================
   STREAMER
   states: IDLE STARTING CONNECTING LIVE RECONNECTING ENDING ENDED ERROR QUOTA_BLOCKED
   LIVE is only set after Agora publish() succeeded AND the server confirmed.
   ===================================================================== */
let state = "IDLE", gateOk = true, gateMsg = "";
const host = { client: null, v: null, a: null, streamId: null, hb: null, chan: null, cancel: false, chat: null, fx: null, native: false, nativeSub: null };

function setState(s, msg, type) { state = s; if (msg) say(msg, type); hostUi(); }
function hostUi() {
  const live = state === "LIVE" || state === "RECONNECTING";
  const busy = ["STARTING", "CONNECTING", "ENDING"].includes(state);
  const badge = $("live-badge"), st = $("broadcast-start"), sp = $("broadcast-stop");
  if (!badge || !st || !sp) return;
  badge.hidden = !live; badge.textContent = state === "RECONNECTING" ? "● RECONNECTING" : "● LIVE";
  st.hidden = live; st.disabled = busy || !(liveStream || (mode === "gameplay" && !!Native)); st.textContent = busy ? "Connecting…" : "Go live";
  sp.hidden = !live; sp.disabled = state === "ENDING";
  const chip = $("live-state-chip");
  if (chip) {
    const map = { LIVE: "● Live", RECONNECTING: "Reconnecting", STARTING: "Connecting", CONNECTING: "Connecting", ENDING: "Ending", ERROR: "Error", QUOTA_BLOCKED: "Unavailable" };
    chip.textContent = map[state] || "Offline"; chip.className = "st-chip" + (state === "LIVE" ? " on" : map[state] ? " warn" : "");
  }
  const pill = $("st-viewers"); if (pill) pill.hidden = !live;
  document.querySelectorAll(".st-mode").forEach(b => { b.disabled = live || busy || (b.dataset.mode === "gameplay" && !canScreen()); });
}
function setViewers(n) {
  n = n || 0; const e = $("live-viewer-count"); if (e) e.textContent = n + " viewer" + (n === 1 ? "" : "s");
  const p = $("st-viewers"); if (p) p.textContent = "👁 " + n;
}
function mountHostChat(streamId) {
  const mount = $("studio-chat"), stage = document.querySelector("#live-studio-page .st-stage"); if (!mount || !stage) return;
  host.fx = createFx(stage);
  host.chat = createChat(streamId, { overlay: false, canHeart: false, fx: host.fx, onHearts: n => { const e = $("st-hearts"); if (e) e.textContent = "❤ " + fmt(n); } });
  mount.replaceChildren(host.chat.el);
}
function unmountHostChat() {
  if (host.chat) { host.chat.destroy(); host.chat = null; }
  if (host.fx) { host.fx.destroy(); host.fx = null; }
  const mount = $("studio-chat"); if (mount) { mount.replaceChildren(h("p", "muted", "Chat, hearts and gifts appear here once you are live.")); }
  const e = $("st-hearts"); if (e) e.textContent = "❤ 0";
}

async function teardown(status) {
  clearInterval(host.hb); host.hb = null;
  if (host.chan) { try { db.removeChannel(host.chan); } catch (_) {} host.chan = null; }
  unmountHostChat();
  if (host.native) {
    host.native = false;
    try { if (host.nativeSub) await host.nativeSub.remove(); } catch (_) {}
    host.nativeSub = null;
    try { await Native.stop(); } catch (_) {}
    const ph = $("video-placeholder"), sp = ph && ph.querySelector("span"); if (sp) sp.textContent = "Your preview will appear here.";
  }
  const c = host.client, id = host.streamId, tracks = [host.v, host.a].filter(Boolean);
  host.client = null; host.v = host.a = null; host.streamId = null;
  if (c) { try { await c.unpublish(); } catch (_) {} try { await c.leave(); } catch (_) {} }
  tracks.forEach(t => { try { t.close(); } catch (_) {} });
  if (id) { try { await callFn({ action: "end", stream_id: id, status }); } catch (e) { console.warn("LAVORA end:", e.message); } }
  setViewers(0);
}
async function failLive(msg, code) {
  host.cancel = true;
  await teardown("failed");
  if (code === "QUOTA_BLOCKED") setState("QUOTA_BLOCKED", msg, "error"); else setState("ERROR", msg, "error");
  toast(msg);
}

function finishLive(native) {
  setState("LIVE", "You are live.", "ok");
  toast("You're live!");
  mountHostChat(host.streamId);
  if (!native) host.hb = setInterval(async () => {   // native streams send their own heartbeat (the WebView may be asleep)
    try { const r = await callFn({ action: "heartbeat", stream_id: host.streamId }); if (r.stop) await failLive(r.error || "Broadcast stopped.", r.code); }
    catch (e) { console.warn("LAVORA heartbeat:", e.message); }
  }, 30000);
  host.chan = db.channel("lavora-host-" + host.streamId)
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "streams", filter: "id=eq." + host.streamId }, p => {
      setViewers(p.new.viewer_count);
      if ((p.new.status === "ended" || p.new.status === "failed") && (state === "LIVE" || state === "RECONNECTING")) failLive("Your broadcast was ended by the platform.");
    }).subscribe();
}

/* ----- Android native path: screen + face cam recorded by the native plugin ----- */
async function nativeAuth() {
  try { const { data } = await db.auth.getSession(); return data && data.session ? data.session.access_token : ""; } catch (_) { return ""; }
}
function onNativeState(ev) {
  if (!host.native || !ev) return;
  if (ev.state === "reconnecting" && state === "LIVE") setState("RECONNECTING", "Connection interrupted. Reconnecting…", "error");
  else if (ev.state === "connected" && state === "RECONNECTING") setState("LIVE", "You are live.", "ok");
  else if ((ev.state === "failed" || ev.state === "stopped") && (state === "LIVE" || state === "RECONNECTING") && !host.cancel) failLive(ev.message || "Your broadcast ended.", ev.code);
  else if (ev.state === "auth") nativeAuth().then(t => { if (t && Native) Native.setAuth({ accessToken: t }); });
}
async function goLiveNative(t, chk) {
  setState("CONNECTING", "Android will ask to record your screen…");
  host.native = true;
  host.nativeSub = await Native.addListener("state", onNativeState);
  const jwt = await nativeAuth(); chk();
  await Native.start({
    appId: t.app_id, channel: t.channel, token: t.token, uid: t.uid, streamId: host.streamId,
    functionUrl: SUPABASE_URL + "/functions/v1/" + FN, anonKey: SUPABASE_KEY, accessToken: jwt,
    showFace: $("live-face").checked, faceCorner: $("live-face-corner").value, orientation: $("live-orient").value
  });
  chk();                                                              // native joined the channel and is capturing
  await callFn({ action: "live", stream_id: host.streamId }); chk();   // server confirms
  const ph = $("video-placeholder"), sp = ph && ph.querySelector("span");
  if (ph) { ph.hidden = false; if (sp) sp.textContent = "Broadcasting your phone screen."; }
  finishLive(true);
}

async function goLive(ms) {
  if (!["IDLE", "ERROR", "ENDED", "QUOTA_BLOCKED"].includes(state)) return;
  const nativeMode = mode === "gameplay" && !!Native;
  if (!ms && !nativeMode) return say(mode === "gameplay" ? "Share your screen first." : "Enable your camera first.", "error");
  const game = $("live-game-custom").value.trim() || $("live-game").value;
  if (!game) return toast("Pick a game first");
  if (!gateOk) return setState("QUOTA_BLOCKED", gateMsg || "Live streaming is temporarily unavailable.", "error");
  if (comp.c && comp.c.ac.state === "suspended") comp.c.ac.resume().catch(() => {});
  const title = ($("live-title").value.trim() || game + " live").slice(0, 80);
  const gameplay = mode === "gameplay";
  host.cancel = false;
  const chk = () => { if (host.cancel) throw new LiveError("Cancelled", "CANCELLED"); };
  let localClient = null;
  try {
    setState("STARTING", "Starting securely…");
    const t = await callFn({ action: "start", title, game_name: game.slice(0, 60), stream_type: gameplay ? "gameplay" : "camera" });
    host.streamId = t.stream_id; chk();
    if (nativeMode) { await goLiveNative(t, chk); return; }
    setState("CONNECTING", "Connecting to the live network…");
    const AgoraRTC = await loadSdk(); chk();
    AgoraRTC.setLogLevel(3);
    const client = localClient = host.client = AgoraRTC.createClient({ mode: "live", codec: "vp8" });
    await client.setClientRole("host");

    client.on("connection-state-change", cur => {
      if (state === "LIVE" && cur === "RECONNECTING") setState("RECONNECTING", "Connection interrupted. Reconnecting…", "error");
      else if (state === "RECONNECTING" && cur === "CONNECTED") setState("LIVE", "You are live.", "ok");
      else if (cur === "DISCONNECTED" && (state === "LIVE" || state === "RECONNECTING") && !host.cancel) failLive("Connection lost. Your broadcast ended.");
    });
    client.on("token-privilege-will-expire", async () => {
      try { const r = await callFn({ action: "renew", stream_id: host.streamId, role: "publisher" }); await client.renewToken(r.token); }
      catch (e) { failLive("Could not refresh your connection. Broadcast ended."); }
    });
    client.on("token-privilege-did-expire", () => failLive("Connection expired. Please go live again."));

    await client.join(t.app_id, t.channel, t.token, t.uid); chk();

    const vt = ms.getVideoTracks()[0], at = ms.getAudioTracks()[0];
    if (!vt) throw new LiveError("No video found.", "NO_CAMERA");
    if (!gameplay) { try { await vt.applyConstraints({ width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 15, max: 24 } }); } catch (_) {} }
    host.v = AgoraRTC.createCustomVideoTrack(gameplay
      ? { mediaStreamTrack: vt, bitrateMin: 600, bitrateMax: 2200, optimizationMode: "motion" }
      : { mediaStreamTrack: vt, bitrateMin: 200, bitrateMax: 800, optimizationMode: "motion" });
    const list = [host.v];
    if (at) { host.a = AgoraRTC.createCustomAudioTrack({ mediaStreamTrack: at }); list.push(host.a); }
    await client.publish(list); chk();                                  // Agora confirms publication here
    await callFn({ action: "live", stream_id: host.streamId }); chk();   // server confirms

    finishLive(false);
  } catch (e) {
    if (e.code === "CANCELLED") { if (localClient && host.client !== localClient) { try { await localClient.leave(); } catch (_) {} } return; }
    console.warn("LAVORA go-live failed:", e);
    let msg = e.message || "Could not start your broadcast.";
    if (!nativeMode && /permission|not.?allowed/i.test(msg)) msg = "Permission was denied for camera or microphone.";
    if (host.streamId || host.client) { host.cancel = true; await teardown("failed"); }
    else if (localClient) { try { await localClient.leave(); } catch (_) {} }
    if (e.code === "QUOTA_BLOCKED") setState("QUOTA_BLOCKED", msg, "error"); else setState("ERROR", msg, "error");
  }
}
async function end() {
  if (!host.streamId && !host.client) { if (state !== "IDLE") setState("IDLE"); return; }
  host.cancel = true;
  setState("ENDING", "Ending broadcast…");
  await teardown("ended");
  setState("ENDED", "Broadcast ended.");
}
function cleanup() {
  if (host.streamId || host.client) end();
  stopComposite();
  closeViewer();
}

/* =====================================================================
   VIEWER (full-screen player with chat, hearts and gifts)
   ===================================================================== */
const view = { client: null, streamId: null, ui: null, chan: null, closing: false, chat: null, fx: null };
const setV = t => { if (view.ui) { view.ui.status.textContent = t; view.ui.status.hidden = !t; } };

function buildViewer(row) {
  const wrap = h("div", "lv-overlay"); wrap.setAttribute("role", "dialog"); wrap.setAttribute("aria-modal", "true"); wrap.setAttribute("aria-label", "Live stream");
  const main = h("div", "lv-main"), stage = h("div", "lv-stage"), status = h("div", "lv-status");
  const top = h("div", "lv-top"), chip = h("div", "lv-chip");
  const who = typeof nameFor === "function" ? nameFor(row.user_id) : "";
  const av = h("div", "lv-av", typeof initials === "function" ? initials(who) : "L");
  const info = h("div"); info.append(h("b", "", row.title || "Live"), h("span", "", [who, row.game_name].filter(Boolean).join(" · ")));
  chip.append(av, info);
  const live = h("span", "lv-tag live", "LIVE"), viewers = h("span", "lv-tag", "👁 " + (row.viewer_count || 0)), hearts = h("span", "lv-tag", "❤ 0");
  const x = h("button", "lv-x", "✕"); x.type = "button"; x.setAttribute("aria-label", "Close");
  top.append(chip, live, viewers, hearts, x);
  main.append(stage, status, top); wrap.appendChild(main); document.body.appendChild(wrap); document.body.style.overflow = "hidden";
  x.addEventListener("click", closeViewer);
  const onKey = e => { if (e.key === "Escape") closeViewer(); }; document.addEventListener("keydown", onKey);
  view.fx = createFx(main);
  view.ui = { wrap, main, stage, status, viewers, hearts, onKey };
}
async function watch(row) {
  if (view.ui) await closeViewer();
  view.closing = false; buildViewer(row); setV("Connecting…");
  let client = null;
  try {
    const t = await callFn({ action: "audience", stream_id: row.id });
    if (view.closing) return;
    view.streamId = row.id;
    const AgoraRTC = await loadSdk(); if (view.closing) return;
    AgoraRTC.setLogLevel(3);
    client = view.client = AgoraRTC.createClient({ mode: "live", codec: "vp8" });
    await client.setClientRole("audience");
    client.on("user-published", async (user, type) => {
      try {
        await client.subscribe(user, type);
        if (type === "video" && view.ui) { user.videoTrack.play(view.ui.stage); setV(""); }
        if (type === "audio") user.audioTrack.play();
      } catch (e) { console.warn("LAVORA subscribe:", e); }
    });
    client.on("user-unpublished", (u, type) => { if (type === "video") setV("Streamer paused their video…"); });
    client.on("user-left", () => streamEnded());
    client.on("connection-state-change", cur => {
      if (cur === "RECONNECTING") setV("Connection lost. Reconnecting…");
      else if (cur === "CONNECTED" && view.ui && !view.ui.stage.querySelector("video")) setV("Waiting for the streamer…");
    });
    client.on("token-privilege-will-expire", async () => {
      try { const r = await callFn({ action: "renew", stream_id: row.id, role: "audience" }); await client.renewToken(r.token); }
      catch (e) { streamEnded(e.message); }
    });
    client.on("token-privilege-did-expire", () => streamEnded("Connection expired. Reopen the stream."));
    await client.join(t.app_id, t.channel, t.token, t.uid);
    if (view.closing) return;
    setV("Waiting for the streamer…");
    view.chat = createChat(row.id, { overlay: true, canHeart: true, fx: view.fx, onHearts: n => { if (view.ui) view.ui.hearts.textContent = "❤ " + fmt(n); } });
    view.ui.wrap.appendChild(view.chat.el);
    view.chan = db.channel("lavora-view-" + row.id)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "streams", filter: "id=eq." + row.id }, p => {
        if (view.ui) view.ui.viewers.textContent = "👁 " + (p.new.viewer_count || 0);
        if (p.new.status !== "live" && p.new.status !== "reconnecting") streamEnded();
      }).subscribe();
  } catch (e) {
    console.warn("LAVORA watch failed:", e);
    if (client && view.client !== client) { try { await client.leave(); } catch (_) {} }
    setV(e.code === "NOT_LIVE" ? "This stream has ended." : e.message || "Could not open this stream.");
    loadList();
  }
}
function streamEnded(msg) {
  if (!view.ui || view.closing) return;
  setV(msg || "This stream has ended.");
  const c = view.client, id = view.streamId; view.client = null; view.streamId = null;
  if (view.chan) { try { db.removeChannel(view.chan); } catch (_) {} view.chan = null; }
  if (c) c.leave().catch(() => {});
  if (id) callFn({ action: "leave", stream_id: id }).catch(() => {});
  const v = view.ui.stage.querySelector("video"); if (v) v.remove();
  loadList();
}
async function closeViewer() {
  if (view.closing) return; if (!view.ui && !view.client) return;
  view.closing = true;
  const c = view.client, id = view.streamId, ui = view.ui;
  view.client = null; view.streamId = null; view.ui = null;
  if (view.chan) { try { db.removeChannel(view.chan); } catch (_) {} view.chan = null; }
  if (view.chat) { view.chat.destroy(); view.chat = null; }
  if (view.fx) { view.fx.destroy(); view.fx = null; }
  if (c) { try { await c.leave(); } catch (_) {} }
  if (ui) { document.removeEventListener("keydown", ui.onKey); ui.wrap.remove(); }
  document.body.style.overflow = "";
  if (id) callFn({ action: "leave", stream_id: id }).catch(() => {});
}

/* =====================================================================
   LIVE LIST (Live Arena page)
   ===================================================================== */
let emptyHTML = null, emptyClass = "", listChan = null, listTimer = null, reloadT = null;
function restoreEmpty() { const el = $("live-stream-list"); if (el && emptyHTML !== null) { el.className = emptyClass; el.innerHTML = emptyHTML; } }
async function loadList() {
  const el = $("live-stream-list"); if (!el) return;
  if (emptyHTML === null) { emptyHTML = el.innerHTML; emptyClass = el.className; }
  if (!db || localMode || !currentUser) return restoreEmpty();
  const cutoff = new Date(Date.now() - 90000).toISOString();
  const { data, error } = await db.from("streams").select("id,user_id,title,game_name,viewer_count,started_at")
    .eq("status", "live").gt("last_heartbeat", cutoff).order("started_at", { ascending: false }).limit(30);
  if (error || !data || !data.length) { if (error) console.warn("LAVORA streams:", error.message); return restoreEmpty(); }
  try { if (typeof fetchProfiles === "function") await fetchProfiles(data.map(s => s.user_id)); } catch (_) {}
  el.className = "lv-grid"; el.replaceChildren();
  data.forEach(row => {
    const b = h("button", "lv-card"); b.type = "button";
    const g = typeof GAMES !== "undefined" ? GAMES.find(x => x.name === row.game_name) : null;
    if (g) { const layers = [g.img, g.fallback].filter(Boolean).map(u => `url("${u}")`); if (layers.length) b.style.backgroundImage = layers.join(","); }
    const info = h("div", "lv-info-card");
    info.append(h("b", "", row.title), h("span", "lv-meta", [typeof nameFor === "function" ? nameFor(row.user_id) : "", row.game_name].filter(Boolean).join(" · ")));
    b.append(h("div", "lv-shade"), h("span", "lv-pill", "● LIVE"), h("span", "lv-watching", "👁 " + (row.viewer_count || 0)), info);
    b.addEventListener("click", () => watch(row)); el.appendChild(b);
  });
}
function listSubscribe() {
  if (!db || localMode || listChan) return;
  listChan = db.channel("lavora-streams-list").on("postgres_changes", { event: "*", schema: "public", table: "streams" }, () => {
    clearTimeout(reloadT); reloadT = setTimeout(loadList, 700);
  }).subscribe();
  listTimer = setInterval(loadList, 20000);
}
function listUnsubscribe() {
  if (listChan) { try { db.removeChannel(listChan); } catch (_) {} listChan = null; }
  clearInterval(listTimer); listTimer = null;
}

async function checkGate() {
  try { const r = await callFn({ action: "status" }); gateOk = !!r.available; gateMsg = r.message || ""; }
  catch (e) {
    if (e.code === "OFFLINE") { gateOk = true; gateMsg = ""; return; }
    gateOk = false; gateMsg = "Live streaming is temporarily unavailable.";   // fail closed
  }
  const msgEl = $("live-status");
  if (!gateOk && ["IDLE", "ENDED", "ERROR", "QUOTA_BLOCKED"].includes(state)) setState("QUOTA_BLOCKED", gateMsg, "error");
  else if (gateOk && state === "QUOTA_BLOCKED") setState("IDLE", "Enable your camera to get started.");
  else if (gateOk && msgEl && msgEl.textContent === STUDIO_DEFAULT) say("Enable your camera to get started.");
}

function onPage(name) {
  if (name === "live") { loadList(); listSubscribe(); } else listUnsubscribe();
  if (name === "live-studio") { setViewers(0); paintMode(); hostUi(); checkGate(); }
}

/* ---------- wiring ---------- */
document.querySelectorAll(".st-mode").forEach(b => b.addEventListener("click", () => setMode(b.dataset.mode)));
document.addEventListener("click", e => {          // capture phase: take over "Share screen" before the camera handler runs
  const b = e.target.closest && e.target.closest("#camera-start");
  if (b && mode === "gameplay") { e.stopImmediatePropagation(); e.preventDefault(); startScreen(); }
}, true);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && host.native && Native) nativeAuth().then(t => { if (t) Native.setAuth({ accessToken: t }); });
});
try { if (db && db.auth) db.auth.onAuthStateChange((_e, sess) => { if (host.native && Native && sess) Native.setAuth({ accessToken: sess.access_token }); }); } catch (_) {}
paintMode();

window.lavoraLive = { goLive, end, cleanup, onPage, watch };
})();
