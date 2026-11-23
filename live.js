/* =====================================================================
   LAVORA 7.0 — live.js  (Agora Web SDK: camera/mic broadcasting + viewing)
   Loaded after script.js (shares its globals: db, localMode, currentUser, toast, setMessage...).
   No secrets here. Tokens come from the `agora-token` Edge Function.
   ===================================================================== */
(() => {
"use strict";
const SDK_URL = "https://cdn.jsdelivr.net/npm/agora-rtc-sdk-ng@4.23.4/AgoraRTC_N-production.js"; // pinned; verify/upgrade in Agora docs
const FN = "agora-token";
const $ = id => document.getElementById(id);
const say = (t, type = "") => setMessage($("live-status"), t, type);
const STUDIO_DEFAULT = "Camera and streaming services are not yet connected.";

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

/* ---------------------------------------------------------------
   STREAMER
   states: IDLE REQUESTING_PERMISSION(handled by script.js) STARTING CONNECTING LIVE RECONNECTING ENDING ENDED ERROR QUOTA_BLOCKED
   LIVE is only set after Agora publish() succeeded AND the server confirmed.
   --------------------------------------------------------------- */
let state = "IDLE", gateOk = true, gateMsg = "";
const host = { client: null, v: null, a: null, streamId: null, hb: null, chan: null, cancel: false };

function setState(s, msg, type) { state = s; if (msg) say(msg, type); hostUi(); }
function hostUi() {
  const live = state === "LIVE" || state === "RECONNECTING";
  const busy = ["STARTING", "CONNECTING", "ENDING"].includes(state);
  const badge = $("live-badge"), st = $("broadcast-start"), sp = $("broadcast-stop");
  if (!badge || !st || !sp) return;
  badge.hidden = !live; badge.textContent = state === "RECONNECTING" ? "● RECONNECTING" : "● LIVE";
  st.hidden = live; st.disabled = busy || !liveStream; st.textContent = busy ? "Connecting…" : "Go live";
  sp.hidden = !live; sp.disabled = state === "ENDING";
}
function setViewers(n) { const e = $("live-viewer-count"); if (e) e.textContent = (n || 0) + " viewer" + (n === 1 ? "" : "s") + " (approx.)"; }

async function teardown(status) {
  clearInterval(host.hb); host.hb = null;
  if (host.chan) { try { db.removeChannel(host.chan); } catch (_) {} host.chan = null; }
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

async function goLive(ms) {
  if (!["IDLE", "ERROR", "ENDED", "QUOTA_BLOCKED"].includes(state)) return;
  if (!ms) return say("Enable your camera first.", "error");
  const game = $("live-game-custom").value.trim() || $("live-game").value;
  if (!game) return toast("Pick a game first");
  if (!gateOk) return setState("QUOTA_BLOCKED", gateMsg || "Live streaming is temporarily unavailable.", "error");
  const title = ($("live-title").value.trim() || game + " live").slice(0, 80);
  host.cancel = false;
  const chk = () => { if (host.cancel) throw new LiveError("Cancelled", "CANCELLED"); };
  let localClient = null;
  try {
    setState("STARTING", "Starting securely…");
    const t = await callFn({ action: "start", title, game_name: game.slice(0, 60), stream_type: "camera" });
    host.streamId = t.stream_id; chk();
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
    if (!vt) throw new LiveError("No camera video found.", "NO_CAMERA");
    try { await vt.applyConstraints({ width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 15, max: 24 } }); } catch (_) {}
    host.v = AgoraRTC.createCustomVideoTrack({ mediaStreamTrack: vt, bitrateMin: 200, bitrateMax: 800, optimizationMode: "motion" });
    const list = [host.v];
    if (at) { host.a = AgoraRTC.createCustomAudioTrack({ mediaStreamTrack: at }); list.push(host.a); }
    await client.publish(list); chk();                       // Agora confirms publication here
    await callFn({ action: "live", stream_id: host.streamId }); chk();   // server confirms

    setState("LIVE", "You are live.", "ok");
    toast("You're live!");
    host.hb = setInterval(async () => {
      try {
        const r = await callFn({ action: "heartbeat", stream_id: host.streamId });
        if (r.stop) { await failLive(r.error || "Broadcast stopped.", r.code); }
      } catch (e) { console.warn("LAVORA heartbeat:", e.message); }
    }, 30000);
    host.chan = db.channel("lavora-host-" + host.streamId)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "streams", filter: "id=eq." + host.streamId }, p => {
        setViewers(p.new.viewer_count);
        if (p.new.status === "ended" || p.new.status === "failed") {
          if (state === "LIVE" || state === "RECONNECTING") failLive("Your broadcast was ended by the platform.");
        }
      }).subscribe();
  } catch (e) {
    if (e.code === "CANCELLED") { if (localClient && host.client !== localClient) { try { await localClient.leave(); } catch (_) {} } return; }
    console.warn("LAVORA go-live failed:", e);
    let msg = e.message || "Could not start your broadcast.";
    if (e.code === "NO_CAMERA") msg = "No camera video found.";
    else if (/permission|not.?allowed/i.test(msg)) msg = "Permission was denied for camera or microphone.";
    if (host.streamId || host.client) { host.cancel = true; await teardown("failed"); }
    else if (localClient) { try { await localClient.leave(); } catch (_) {} }
    if (e.code === "QUOTA_BLOCKED") setState("QUOTA_BLOCKED", msg, "error"); else setState("ERROR", msg, "error");
  }
}

async function end() {
  if (!host.streamId && !host.client) { if (state !== "IDLE") { setState("IDLE"); hostUi(); } return; }
  host.cancel = true;
  setState("ENDING", "Ending broadcast…");
  await teardown("ended");
  setState("ENDED", "Broadcast ended.");
}
function cleanup() {
  if (host.streamId || host.client) end();
  closeViewer();
}

/* ---------------------------------------------------------------
   VIEWER
   --------------------------------------------------------------- */
const view = { client: null, streamId: null, ui: null, chan: null, closing: false };
const setV = t => { if (view.ui) { view.ui.status.textContent = t; view.ui.status.hidden = !t; } };

function buildViewer(row) {
  const wrap = document.createElement("div"); wrap.className = "lv-overlay"; wrap.setAttribute("role", "dialog"); wrap.setAttribute("aria-modal", "true");
  const top = document.createElement("div"); top.className = "lv-top";
  const info = document.createElement("div"); info.className = "lv-info";
  const t = document.createElement("b"); t.textContent = row.title || "Live";
  const s = document.createElement("span"); s.textContent = [row.game_name, typeof nameFor === "function" ? nameFor(row.user_id) : ""].filter(Boolean).join(" · ");
  info.append(t, s);
  const x = document.createElement("button"); x.type = "button"; x.className = "icon-btn lv-x"; x.setAttribute("aria-label", "Close"); x.textContent = "✕";
  top.append(info, x);
  const stage = document.createElement("div"); stage.className = "lv-stage";
  const status = document.createElement("div"); status.className = "lv-status";
  stage.appendChild(status);
  wrap.append(top, stage); document.body.appendChild(wrap); document.body.style.overflow = "hidden";
  x.addEventListener("click", closeViewer);
  const onKey = e => { if (e.key === "Escape") closeViewer(); }; document.addEventListener("keydown", onKey);
  view.ui = { wrap, stage, status, onKey };
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
    view.chan = db.channel("lavora-view-" + row.id)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "streams", filter: "id=eq." + row.id }, p => {
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
  if (c) { try { await c.leave(); } catch (_) {} }
  if (ui) { document.removeEventListener("keydown", ui.onKey); ui.wrap.remove(); }
  document.body.style.overflow = "";
  if (id) callFn({ action: "leave", stream_id: id }).catch(() => {});
}

/* ---------------------------------------------------------------
   LIVE LIST (Live Arena page)
   --------------------------------------------------------------- */
let emptyHTML = null, emptyClass = "", listChan = null, listTimer = null, reloadT = null;
function restoreEmpty() { const el = $("live-stream-list"); if (el && emptyHTML !== null) { el.className = emptyClass; el.innerHTML = emptyHTML; } }
async function loadList() {
  const el = $("live-stream-list"); if (!el) return;
  if (emptyHTML === null) { emptyHTML = el.innerHTML; emptyClass = el.className; }
  if (!db || localMode || !currentUser) return restoreEmpty();
  const cutoff = new Date(Date.now() - 90000).toISOString();
  const { data, error } = await db.from("streams")
    .select("id,user_id,title,game_name,viewer_count,started_at")
    .eq("status", "live").gt("last_heartbeat", cutoff).order("started_at", { ascending: false }).limit(30);
  if (error || !data || !data.length) { if (error) console.warn("LAVORA streams:", error.message); return restoreEmpty(); }
  try { if (typeof fetchProfiles === "function") await fetchProfiles(data.map(s => s.user_id)); } catch (_) {}
  el.className = "lv-grid"; el.replaceChildren();
  data.forEach(row => {
    const b = document.createElement("button"); b.type = "button"; b.className = "lv-card gb";
    const badge = document.createElement("span"); badge.className = "lv-pill"; badge.textContent = "● LIVE";
    const t = document.createElement("b"); t.textContent = row.title;
    const m = document.createElement("span"); m.className = "lv-meta";
    m.textContent = [row.game_name, typeof nameFor === "function" ? nameFor(row.user_id) : "", (row.viewer_count || 0) + " watching"].filter(Boolean).join(" · ");
    b.append(badge, t, m); b.addEventListener("click", () => watch(row)); el.appendChild(b);
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
  if (name === "live-studio") { setViewers(0); hostUi(); checkGate(); }
}

/* styles */
const css = document.createElement("style");
css.textContent = `
.lv-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px;margin-top:12px}
.lv-card{display:flex;flex-direction:column;align-items:flex-start;gap:6px;text-align:left;padding:14px;border:1px solid var(--line);border-radius:16px;background:var(--card);color:var(--text);cursor:pointer}
.lv-card:hover{border-color:var(--violet)}
.lv-card b{font-size:16px}
.lv-meta{font-size:12.5px;color:var(--muted)}
.lv-pill{background:var(--danger);color:#fff;font-weight:800;font-size:11px;padding:3px 10px;border-radius:99px;letter-spacing:.1em}
.lv-overlay{position:fixed;inset:0;z-index:120;background:#05060d;display:flex;flex-direction:column;color:#fff}
.lv-top{display:flex;align-items:center;gap:12px;padding:calc(12px + env(safe-area-inset-top,0px)) 14px 10px}
.lv-info{flex:1;min-width:0;display:flex;flex-direction:column}
.lv-info b{font-size:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lv-info span{font-size:12.5px;opacity:.7}
.lv-x{color:#fff;background:#ffffff22;width:38px;height:38px;border-radius:50%;border:0;cursor:pointer}
.lv-stage{position:relative;flex:1;min-height:0;background:#000}
.lv-stage>div:not(.lv-status),.lv-stage video{width:100%!important;height:100%!important;object-fit:contain}
.lv-status{position:absolute;inset:0;display:grid;place-items:center;text-align:center;padding:24px;font-weight:700;pointer-events:none;z-index:2}
.lv-status[hidden]{display:none}
`;
document.head.appendChild(css);

window.lavoraLive = { goLive, end, cleanup, onPage, watch };
})();
