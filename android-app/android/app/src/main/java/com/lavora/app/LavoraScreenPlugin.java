package com.lavora.app;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.media.projection.MediaProjectionManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import androidx.activity.result.ActivityResult;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;

import io.agora.rtc2.ChannelMediaOptions;
import io.agora.rtc2.Constants;
import io.agora.rtc2.IRtcEngineEventHandler;
import io.agora.rtc2.RtcEngine;
import io.agora.rtc2.RtcEngineConfig;
import io.agora.rtc2.ScreenCaptureParameters;
import io.agora.rtc2.video.CameraCapturerConfiguration;
import io.agora.rtc2.video.VideoEncoderConfiguration;
import io.agora.rtc2.LocalTranscoderConfiguration;

/**
 * LAVORA native broadcaster. JS (live.js) asks for a stream via the secure Edge Function, then hands the
 * channel + token here. This plugin captures the phone screen (+ optional front camera picture-in-picture
 * and microphone) with the Agora Android SDK, keeps running while another app is in front, and sends its own
 * heartbeats / token renewals to the Edge Function so the stream survives while the WebView is asleep.
 */
@CapacitorPlugin(
    name = "LavoraScreen",
    permissions = {
        @Permission(alias = "camera", strings = { Manifest.permission.CAMERA }),
        @Permission(alias = "microphone", strings = { Manifest.permission.RECORD_AUDIO })
    }
)
@SuppressWarnings("unused")
public class LavoraScreenPlugin extends Plugin {
    private static final String TAG = "LavoraScreen";
    private final Handler main = new Handler(Looper.getMainLooper());

    private RtcEngine engine;
    private PluginCall startCall;
    private ScheduledExecutorService ex;
    private ScheduledFuture<?> hbFuture;
    private volatile String jwt = "";
    private String anonKey = "", functionUrl = "", streamId = "";
    private boolean joined = false, faceOn = false, usingTranscoder = false;

    /* ------------------------------------------------------------------ JS API */

    @PluginMethod
    public void isSupported(PluginCall call) {
        JSObject r = new JSObject();
        r.put("supported", true);
        call.resolve(r);
    }

    @PluginMethod
    public void setAuth(PluginCall call) {
        String t = call.getString("accessToken");
        if (t != null && !t.isEmpty()) jwt = t;
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        stopInternal(true);
        call.resolve();
    }

    @PluginMethod
    public void start(PluginCall call) {
        if (engine != null || startCall != null) { call.reject("Already broadcasting."); return; }
        if (isBlank(call.getString("appId")) || isBlank(call.getString("channel")) || isBlank(call.getString("token"))) {
            call.reject("Missing stream details."); return;
        }
        boolean face = Boolean.TRUE.equals(call.getBoolean("showFace", true));
        String[] aliases = face ? new String[] { "microphone", "camera" } : new String[] { "microphone" };
        boolean all = true;
        for (String a : aliases) if (getPermissionState(a) != PermissionState.GRANTED) all = false;
        if (all) askProjection(call); else requestPermissionForAliases(aliases, call, "permsResult");
    }

    /* ------------------------------------------------------------ permissions */

    @PermissionCallback
    private void permsResult(PluginCall call) {
        boolean face = Boolean.TRUE.equals(call.getBoolean("showFace", true));
        if (getPermissionState("microphone") != PermissionState.GRANTED) { call.reject("Microphone permission was denied."); return; }
        if (face && getPermissionState("camera") != PermissionState.GRANTED) {
            call.reject("Camera permission was denied. Allow it, or turn off “Show my face”."); return;
        }
        askProjection(call);
    }

    /** Android 14+ wants the user's consent BEFORE a mediaProjection foreground service starts. */
    private void askProjection(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 34) {
            MediaProjectionManager mpm = (MediaProjectionManager) getContext().getSystemService(Context.MEDIA_PROJECTION_SERVICE);
            startActivityForResult(call, mpm.createScreenCaptureIntent(), "projectionResult");
        } else {
            beginCapture(call);
        }
    }

    @ActivityCallback
    private void projectionResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result == null || result.getResultCode() != Activity.RESULT_OK) { call.reject("Screen recording permission was not granted."); return; }
        beginCapture(call);
    }

    /* ---------------------------------------------------------------- startup */

    private void beginCapture(PluginCall call) {
        startCall = call;
        faceOn = Boolean.TRUE.equals(call.getBoolean("showFace", true));
        Intent si = new Intent(getContext(), LavoraCaptureService.class);
        si.putExtra("camera", faceOn);
        LavoraCaptureService.onStarted = () -> startAgora(call);
        LavoraCaptureService.onFailed = this::failStart;
        try {
            ContextCompat.startForegroundService(getContext(), si);
        } catch (Throwable e) {
            failStart("Could not start the broadcast service: " + e.getMessage());
        }
    }

    private void startAgora(PluginCall call) {
        try {
            String appId = call.getString("appId"), channel = call.getString("channel"), token = call.getString("token");
            Integer uidBoxed = call.getInt("uid", 1);
            int uid = uidBoxed != null ? uidBoxed : 1;
            streamId = str(call.getString("streamId"));
            functionUrl = str(call.getString("functionUrl"));
            anonKey = str(call.getString("anonKey"));
            jwt = str(call.getString("accessToken"));
            boolean portrait = "portrait".equals(call.getString("orientation", "landscape"));
            String corner = str(call.getString("faceCorner", "tr"));
            final int W = portrait ? 720 : 1280, H = portrait ? 1280 : 720;

            RtcEngineConfig cfg = new RtcEngineConfig();
            cfg.mContext = getContext().getApplicationContext();
            cfg.mAppId = appId;
            cfg.mChannelProfile = Constants.CHANNEL_PROFILE_LIVE_BROADCASTING;
            cfg.mEventHandler = handler;
            engine = RtcEngine.create(cfg);
            engine.setClientRole(Constants.CLIENT_ROLE_BROADCASTER);
            engine.enableVideo();
            engine.enableAudio();

            // screen (and its sound where Android allows it)
            ScreenCaptureParameters sp = new ScreenCaptureParameters();
            sp.captureAudio = true;
            sp.captureVideo = true;
            sp.videoCaptureParameters.width = W;
            sp.videoCaptureParameters.height = H;
            sp.videoCaptureParameters.framerate = 24;
            engine.startScreenCapture(sp);

            ChannelMediaOptions o = new ChannelMediaOptions();
            o.channelProfile = Constants.CHANNEL_PROFILE_LIVE_BROADCASTING;
            o.clientRoleType = Constants.CLIENT_ROLE_BROADCASTER;
            o.publishMicrophoneTrack = true;
            o.publishScreenCaptureAudio = true;
            o.publishCameraTrack = false;
            o.autoSubscribeAudio = false;
            o.autoSubscribeVideo = false;

            if (faceOn) {
                // front camera picture-in-picture, composited on the phone into ONE video track
                CameraCapturerConfiguration cc = new CameraCapturerConfiguration(CameraCapturerConfiguration.CAMERA_DIRECTION.CAMERA_FRONT);
                engine.startCameraCapture(Constants.VideoSourceType.VIDEO_SOURCE_CAMERA_PRIMARY, cc);

                int base = Math.min(W, H), fw = Math.round(base * 0.32f), fh = Math.round(fw * 3f / 4f), m = 20;
                int fx = corner.endsWith("r") ? W - fw - m : m;
                int fy = corner.startsWith("t") ? m : H - fh - m;

                LocalTranscoderConfiguration lt = new LocalTranscoderConfiguration();
                lt.transcodingVideoStreams = new ArrayList<>();
                LocalTranscoderConfiguration.TranscodingVideoStream scr = new LocalTranscoderConfiguration.TranscodingVideoStream();
                scr.sourceType = Constants.VideoSourceType.VIDEO_SOURCE_SCREEN_PRIMARY;
                scr.x = 0; scr.y = 0; scr.width = W; scr.height = H; scr.zOrder = 1; scr.alpha = 1.0;
                LocalTranscoderConfiguration.TranscodingVideoStream cam = new LocalTranscoderConfiguration.TranscodingVideoStream();
                cam.sourceType = Constants.VideoSourceType.VIDEO_SOURCE_CAMERA_PRIMARY;
                cam.x = fx; cam.y = fy; cam.width = fw; cam.height = fh; cam.zOrder = 2; cam.alpha = 1.0; cam.mirror = false;
                lt.transcodingVideoStreams.add(scr);
                lt.transcodingVideoStreams.add(cam);
                lt.videoOutputConfiguration = new VideoEncoderConfiguration(
                    new VideoEncoderConfiguration.VideoDimensions(W, H),
                    VideoEncoderConfiguration.FRAME_RATE.FRAME_RATE_FPS_24,
                    VideoEncoderConfiguration.STANDARD_BITRATE,
                    VideoEncoderConfiguration.ORIENTATION_MODE.ORIENTATION_MODE_FIXED_LANDSCAPE);
                engine.startLocalVideoTranscoder(lt);
                usingTranscoder = true;
                o.publishTranscodedVideoTrack = true;
                o.publishScreenCaptureVideo = false;
            } else {
                o.publishScreenCaptureVideo = true;
            }

            int rc = engine.joinChannel(token, channel, uid, o);
            if (rc != 0) { failStart("Could not join the live channel (code " + rc + ")."); return; }

            ex = Executors.newSingleThreadScheduledExecutor();
            hbFuture = ex.scheduleWithFixedDelay(this::heartbeat, 30, 30, TimeUnit.SECONDS);
        } catch (Throwable e) {
            Log.e(TAG, "startAgora failed", e);
            failStart("Could not start screen streaming: " + e.getMessage());
        }
    }

    /* ------------------------------------------------------------ Agora events */

    private final IRtcEngineEventHandler handler = new IRtcEngineEventHandler() {
        @Override
        public void onJoinChannelSuccess(String channel, int uid, int elapsed) {
            main.post(() -> {
                joined = true;
                PluginCall c = startCall; startCall = null;
                if (c != null) c.resolve();
                emit("joined", null, null);
            });
        }

        @Override
        public void onConnectionStateChanged(int state, int reason) {
            main.post(() -> {
                if (state == 4) emit("reconnecting", null, null);           // RECONNECTING
                else if (state == 3 && joined) emit("connected", null, null); // CONNECTED
                else if (state == 5) { emit("failed", "Connection failed.", null); }
            });
        }

        @Override
        public void onTokenPrivilegeWillExpire(String token) { renewToken(); }

        // no @Override on purpose: signature differs between SDK 4.x minors; if it never fires, check logcat
        public void onLocalVideoStateChanged(Constants.VideoSourceType source, int state, int error) {
            Log.i(TAG, "local video state source=" + source + " state=" + state + " error=" + error);
            if (state == 3) { // FAILED
                main.post(() -> {
                    if (startCall != null) failStart("Screen capture failed (code " + error + ").");
                    else emit("failed", "Screen capture stopped (code " + error + ").", null);
                });
            }
        }
    };

    /* ------------------------------------------- server heartbeat / renewal */

    private void heartbeat() {
        try {
            JSONObject b = new JSONObject().put("action", "heartbeat").put("stream_id", streamId);
            JSONObject r = post(b);
            int http = r.optInt("_http", 0);
            if (http == 401) { main.post(() -> emit("auth", "Sign-in needs refreshing.", null)); return; }
            if (r.optBoolean("stop", false)) {
                final String msg = r.optString("error", "Your broadcast was stopped."), code = r.optString("code", "");
                main.post(() -> { emit("stopped", msg, code); stopInternal(false); });
            }
        } catch (Throwable e) { Log.w(TAG, "heartbeat failed: " + e.getMessage()); }
    }

    private void renewToken() {
        final ScheduledExecutorService e = ex; if (e == null) return;
        e.execute(() -> {
            try {
                JSONObject r = post(new JSONObject().put("action", "renew").put("stream_id", streamId).put("role", "publisher"));
                String t = r.optString("token", "");
                if (!t.isEmpty() && engine != null) engine.renewToken(t);
                else if (r.optInt("_http", 0) == 401) main.post(() -> emit("auth", "Sign-in needs refreshing.", null));
            } catch (Throwable ex2) { Log.w(TAG, "renew failed: " + ex2.getMessage()); }
        });
    }

    private JSONObject post(JSONObject body) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(functionUrl).openConnection();
        try {
            c.setRequestMethod("POST"); c.setConnectTimeout(8000); c.setReadTimeout(10000); c.setDoOutput(true);
            c.setRequestProperty("Content-Type", "application/json");
            c.setRequestProperty("Authorization", "Bearer " + jwt);
            c.setRequestProperty("apikey", anonKey);
            c.getOutputStream().write(body.toString().getBytes(StandardCharsets.UTF_8));
            int code = c.getResponseCode();
            InputStream is = code < 400 ? c.getInputStream() : c.getErrorStream();
            ByteArrayOutputStream bo = new ByteArrayOutputStream();
            if (is != null) { byte[] buf = new byte[2048]; int n; while ((n = is.read(buf)) > 0) bo.write(buf, 0, n); }
            String s = new String(bo.toByteArray(), StandardCharsets.UTF_8);
            JSONObject o = new JSONObject(s.isEmpty() ? "{}" : s);
            o.put("_http", code);
            return o;
        } finally { c.disconnect(); }
    }

    /* ---------------------------------------------------------------- teardown */

    private void failStart(String msg) {
        PluginCall c = startCall; startCall = null;
        stopInternal(true);
        if (c != null) c.reject(msg);
        else emit("failed", msg, null);
    }

    private synchronized void stopInternal(boolean callEnd) {
        LavoraCaptureService.onStarted = null; LavoraCaptureService.onFailed = null;
        if (hbFuture != null) { hbFuture.cancel(false); hbFuture = null; }
        if (engine != null) {
            try { if (usingTranscoder) engine.stopLocalVideoTranscoder(); } catch (Throwable t) { Log.w(TAG, "stop transcoder", t); }
            try { if (faceOn) engine.stopCameraCapture(Constants.VideoSourceType.VIDEO_SOURCE_CAMERA_PRIMARY); } catch (Throwable t) { Log.w(TAG, "stop camera", t); }
            try { engine.stopScreenCapture(); } catch (Throwable t) { Log.w(TAG, "stop screen", t); }
            try { engine.leaveChannel(); } catch (Throwable t) { Log.w(TAG, "leave", t); }
            try { RtcEngine.destroy(); } catch (Throwable t) { Log.w(TAG, "destroy", t); }
            engine = null;
        }
        usingTranscoder = false; joined = false;
        try { getContext().stopService(new Intent(getContext(), LavoraCaptureService.class)); } catch (Throwable ignored) { }
        if (ex != null) {
            final String sid = streamId;
            if (callEnd && !sid.isEmpty()) {
                ex.execute(() -> { try { post(new JSONObject().put("action", "end").put("stream_id", sid).put("status", "ended")); } catch (Throwable ignored) { } });
            }
            ex.shutdown(); ex = null;
        }
    }

    @Override
    protected void handleOnDestroy() { stopInternal(true); }

    /* ----------------------------------------------------------------- helpers */

    private void emit(String state, String message, String code) {
        JSObject o = new JSObject();
        o.put("state", state);
        if (message != null) o.put("message", message);
        if (code != null) o.put("code", code);
        notifyListeners("state", o);
    }
    private static boolean isBlank(String s) { return s == null || s.isEmpty(); }
    private static String str(String s) { return s == null ? "" : s; }
}
