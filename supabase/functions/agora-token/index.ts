// LAVORA 7.0 — secure Agora token + stream lifecycle service (Supabase Edge Function, Deno)
// Secrets (set with `supabase secrets set`, never in the frontend):
//   AGORA_APP_ID, AGORA_APP_CERTIFICATE
// Optional: AGORA_FREE_MINUTES (10000), AGORA_SAFE_PERCENT (60), AGORA_MINUTE_MULTIPLIER (2),
//           MAX_STREAM_MINUTES (180), ALLOWED_ORIGIN (*)
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are injected automatically.
import { createClient } from "npm:@supabase/supabase-js@2";
import { RtcTokenBuilder, RtcRole } from "npm:agora-token@2.0.5";

const env = (k: string) => Deno.env.get(k) ?? "";
const APP_ID = env("AGORA_APP_ID");
const CERT = env("AGORA_APP_CERTIFICATE");
const FREE = Number(env("AGORA_FREE_MINUTES") || 10000);
const SAFE = Number(env("AGORA_SAFE_PERCENT") || 60) / 100;      // block new streams at 60% of the allowance
const MULT = Number(env("AGORA_MINUTE_MULTIPLIER") || 2);        // camera (640x360). Conservative. VERIFY in Agora console.
const MULT_HD = Number(env("AGORA_MINUTE_MULTIPLIER_HD") || 4);  // screen/gameplay (1280x720). Conservative. VERIFY in Agora console.
const MAX_MIN = Number(env("MAX_STREAM_MINUTES") || 180);
const TTL = 1800;                                                // token lifetime (s); client renews before expiry
const STALE_MS = 90_000;                                         // no heartbeat for 90s => stream is dead
const ACTIVE = ["starting", "live", "reconnecting"];
const HOST_UID = 1;                                              // viewers always get uid >= 1000

const CORS = {
  "Access-Control-Allow-Origin": env("ALLOWED_ORIGIN") || "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const j = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const admin = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function authUser(req: Request) {
  const h = req.headers.get("Authorization") ?? "";
  if (!h.startsWith("Bearer ")) return null;
  const { data, error } = await admin.auth.getUser(h.slice(7));
  return error ? null : data.user;
}

function uidFor(userId: string) {
  let h = 2166136261;
  for (let i = 0; i < userId.length; i++) { h ^= userId.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return 1000 + (h % 2_000_000_000);
}
function token(channel: string, uid: number, publisher: boolean) {
  return RtcTokenBuilder.buildTokenWithUid(
    APP_ID, CERT, channel, uid, publisher ? RtcRole.PUBLISHER : RtcRole.SUBSCRIBER, TTL, TTL,
  );
}

// ---- usage estimate: minutes x (host + every audience token issued) x multiplier. Over-counts on purpose. ----
function estMinutes(row: any, endMs: number) {
  const start = new Date(row.started_at ?? row.created_at).getTime();
  const mins = Math.min(MAX_MIN, Math.max(0, Math.ceil((endMs - start) / 60000)));
  return mins * (1 + (row.audience_joins ?? 0)) * (row.stream_type === "gameplay" ? MULT_HD : MULT);
}
async function finalize(row: any, status: "ended" | "failed", endMs = Date.now()) {
  await admin.from("streams").update({
    status, ended_at: new Date(endMs).toISOString(), est_minutes: estMinutes(row, endMs), viewer_count: 0,
  }).eq("id", row.id).in("status", ACTIVE);
}
async function endStale() {
  const cutoff = new Date(Date.now() - STALE_MS).toISOString();
  const { data } = await admin.from("streams").select("*").in("status", ACTIVE)
    .or(`last_heartbeat.lt.${cutoff},last_heartbeat.is.null`);
  for (const r of data ?? []) {
    const hb = r.last_heartbeat ? new Date(r.last_heartbeat).getTime() : new Date(r.created_at).getTime();
    if (Date.now() - hb > STALE_MS) await finalize(r, "ended", hb);
  }
}
async function usedMinutes() {
  const n = new Date();
  const monthStart = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), 1)).toISOString();
  const { data, error } = await admin.from("streams").select("*").gte("created_at", monthStart);
  if (error) throw error;
  let total = 0;
  for (const r of data ?? []) total += ACTIVE.includes(r.status) ? estMinutes(r, Date.now()) : Number(r.est_minutes ?? 0);
  return total;
}
// Fails CLOSED: any doubt => no new broadcasts.
async function gate(): Promise<{ ok: boolean; msg?: string }> {
  try {
    if (!APP_ID || !CERT) return { ok: false, msg: "Live streaming is not set up yet." };
    const { data: cfg, error } = await admin.from("live_config").select("streaming_enabled").eq("id", 1).single();
    if (error || !cfg?.streaming_enabled) return { ok: false, msg: "Live streaming is temporarily unavailable." };
    if ((await usedMinutes()) >= FREE * SAFE) return { ok: false, msg: "Free live streaming capacity is used up for now. Try again later." };
    return { ok: true };
  } catch (e) {
    console.error("gate error", e);
    return { ok: false, msg: "Live streaming is temporarily unavailable." };
  }
}
async function getStream(id: unknown) {
  if (typeof id !== "string" || !UUID.test(id)) return null;
  const { data } = await admin.from("streams").select("*").eq("id", id).maybeSingle();
  return data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const user = await authUser(req);
    if (!user) return j(401, { error: "Please sign in again.", code: "UNAUTHENTICATED" });
    const body = await req.json().catch(() => ({}));

    switch (body.action) {
      case "status": {
        const g = await gate();
        return j(200, { available: g.ok, message: g.msg ?? null });
      }

      case "start": {
        const g = await gate();
        if (!g.ok) return j(403, { error: g.msg, code: "QUOTA_BLOCKED" });
        const stype = body.stream_type === "gameplay" ? "gameplay" : "camera";
        const title = String(body.title ?? "").trim().slice(0, 80);
        const game = String(body.game_name ?? "").trim().slice(0, 60);
        if (!title) return j(400, { error: "Add a stream title.", code: "BAD_REQUEST" });

        await endStale();
        const { data: mine } = await admin.from("streams").select("*").eq("user_id", user.id).in("status", ACTIVE);
        for (const r of mine ?? []) await finalize(r, "ended");   // one live stream per user

        const channel = "lav_" + crypto.randomUUID().replaceAll("-", "");
        const now = new Date().toISOString();
        const { data: row, error } = await admin.from("streams").insert({
          user_id: user.id, title, game_name: game || null, stream_type: stype,
          channel_name: channel, status: "starting", started_at: now, last_heartbeat: now,
        }).select("id").single();
        if (error) throw error;
        return j(200, { stream_id: row.id, app_id: APP_ID, channel, uid: HOST_UID, token: token(channel, HOST_UID, true), expires_in: TTL });
      }

      case "live": {
        const s = await getStream(body.stream_id);
        if (!s || s.user_id !== user.id) return j(403, { error: "Not allowed.", code: "FORBIDDEN" });
        if (!["starting", "reconnecting", "live"].includes(s.status)) return j(409, { error: "Stream is not active.", code: "CONFLICT" });
        await admin.from("streams").update({ status: "live", started_at: s.started_at ?? new Date().toISOString(), last_heartbeat: new Date().toISOString() }).eq("id", s.id);
        return j(200, { ok: true });
      }

      case "heartbeat": {
        const s = await getStream(body.stream_id);
        if (!s || s.user_id !== user.id) return j(403, { error: "Not allowed.", code: "FORBIDDEN" });
        if (!ACTIVE.includes(s.status)) return j(200, { stop: true, code: "ENDED", error: "This broadcast has ended." });
        const elapsedMin = (Date.now() - new Date(s.started_at ?? s.created_at).getTime()) / 60000;
        const g = await gate();
        if (!g.ok || elapsedMin >= MAX_MIN) {
          await finalize(s, "ended");
          return j(200, { stop: true, code: g.ok ? "MAX_DURATION" : "QUOTA_BLOCKED",
            error: g.ok ? "Maximum broadcast length reached." : (g.msg ?? "Streaming was stopped.") });
        }
        await admin.from("streams").update({ last_heartbeat: new Date().toISOString() }).eq("id", s.id);
        return j(200, { ok: true });
      }

      case "renew": {
        const s = await getStream(body.stream_id);
        if (!s) return j(404, { error: "Stream not found.", code: "NOT_FOUND" });
        if (body.role === "publisher") {
          if (s.user_id !== user.id || !ACTIVE.includes(s.status)) return j(403, { error: "Not allowed.", code: "FORBIDDEN" });
          return j(200, { token: token(s.channel_name, HOST_UID, true), expires_in: TTL });
        }
        if (s.status !== "live") return j(409, { error: "This stream has ended.", code: "ENDED" });
        return j(200, { token: token(s.channel_name, uidFor(user.id), false), expires_in: TTL });
      }

      case "audience": {
        const s = await getStream(body.stream_id);
        if (!s || s.status !== "live") return j(404, { error: "This stream is not live.", code: "NOT_LIVE" });
        if (s.last_heartbeat && Date.now() - new Date(s.last_heartbeat).getTime() > STALE_MS)
          return j(404, { error: "This stream is not live.", code: "NOT_LIVE" });
        const g = await gate();
        if (!g.ok) return j(403, { error: g.msg, code: "QUOTA_BLOCKED" });
        await admin.rpc("bump_viewers", { p_stream: s.id, p_delta: 1, p_joined: 1 });
        const uid = uidFor(user.id);
        return j(200, { app_id: APP_ID, channel: s.channel_name, uid, token: token(s.channel_name, uid, false), expires_in: TTL });
      }

      case "leave": {
        const s = await getStream(body.stream_id);
        if (s) await admin.rpc("bump_viewers", { p_stream: s.id, p_delta: -1, p_joined: 0 });
        return j(200, { ok: true });
      }

      case "end": {
        const s = await getStream(body.stream_id);
        if (!s || s.user_id !== user.id) return j(403, { error: "Not allowed.", code: "FORBIDDEN" });
        await finalize(s, body.status === "failed" ? "failed" : "ended");
        return j(200, { ok: true });
      }

      default:
        return j(400, { error: "Unknown action.", code: "BAD_REQUEST" });
    }
  } catch (e) {
    console.error(e);
    return j(500, { error: "Something went wrong. Please try again.", code: "SERVER" });
  }
});
