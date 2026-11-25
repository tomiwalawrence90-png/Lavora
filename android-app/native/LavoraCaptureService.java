package __PKG__;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.util.Log;

import androidx.core.app.NotificationCompat;

/** Foreground service that keeps screen capture, camera and mic alive while the user plays another app. */
public class LavoraCaptureService extends Service {
    public interface Failure { void run(String message); }

    static volatile Runnable onStarted;
    static volatile Failure onFailed;

    private static final String CHANNEL = "lavora_live";
    private static final int NOTIF_ID = 7101;

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        try {
            NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (Build.VERSION.SDK_INT >= 26 && nm != null) {
                nm.createNotificationChannel(new NotificationChannel(CHANNEL, "LAVORA live", NotificationManager.IMPORTANCE_LOW));
            }
            Intent launch = getPackageManager().getLaunchIntentForPackage(getPackageName());
            PendingIntent pi = launch == null ? null : PendingIntent.getActivity(this, 0, launch,
                    PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
            Notification n = new NotificationCompat.Builder(this, CHANNEL)
                    .setSmallIcon(android.R.drawable.presence_video_online)
                    .setContentTitle("LAVORA is live")
                    .setContentText("Broadcasting your screen. Open LAVORA to end the stream.")
                    .setOngoing(true)
                    .setContentIntent(pi)
                    .build();

            if (Build.VERSION.SDK_INT >= 29) {
                int type = ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION;
                if (Build.VERSION.SDK_INT >= 30) {
                    type |= ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE;
                    if (intent != null && intent.getBooleanExtra("camera", false)) type |= ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA;
                }
                startForeground(NOTIF_ID, n, type);
            } else {
                startForeground(NOTIF_ID, n);
            }
        } catch (Throwable e) {
            Log.e("LavoraScreen", "startForeground failed", e);
            final Failure f = onFailed;
            if (f != null) new Handler(Looper.getMainLooper()).post(() -> f.run("Could not start the broadcast service: " + e.getMessage()));
            stopSelf();
            return START_NOT_STICKY;
        }
        final Runnable r = onStarted;
        if (r != null) new Handler(Looper.getMainLooper()).post(r);
        return START_NOT_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }
}
