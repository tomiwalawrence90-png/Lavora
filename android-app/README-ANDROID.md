# LAVORA Android (phone gameplay streaming)

This wraps your live site in a Capacitor app and adds a native plugin that records the phone screen with your
face in a corner (picture-in-picture), keeps streaming while you play another app, and talks to the same
`agora-token` Supabase function as the web app. Viewers watch it exactly like any other stream.

## One-time setup (on your computer)
1. Install Node 20+, then Android Studio (it bundles the JDK).
2. `cd android-app`
3. Open `capacitor.config.json` and replace `https://YOUR-SITE.onrender.com` with your real Render URL.
4. `npm install`
5. `npx cap add android`
6. `node setup.mjs`        (installs the native plugin, permissions, foreground service, Agora SDK)
7. `npx cap sync android`
8. `npx cap open android`  → in Android Studio: plug in your phone (USB debugging on) and press Run,
   or Build → Build APK(s) to get an installable file.

## Using it
Open the app → sign in → Live → Studio → **Screen + face** → pick a game + title → **Go live**.
Android asks to record the screen (Android 14+ may ask twice). Then switch to your game; a "LAVORA is live"
notification stays up. Come back to LAVORA and press **End broadcast** to stop.

## Good to know
- Game sound is only captured from apps that allow it (Android 10+). Your microphone is always mixed in.
- Chat, hearts and gifts keep arriving, but you only see them when you return to LAVORA.
- The stream is kept alive by native code, but your sign-in token lasts about 1 hour. Open LAVORA now and then
  during very long streams so it can refresh.
- When you change the web app, just push to Render; the Android app loads the live site, no rebuild needed.
- Only rebuild the APK when you change files in `android-app/native/`.

## If the build fails
Send me the FIRST red error line from Android Studio's Build tab. The most likely culprits are Agora SDK
class or method names that moved between 4.x versions (in `LavoraScreenPlugin.java`), or a duplicate
`libc++_shared.so` (the setup already adds a `pickFirst` rule for that).
Runtime problems: `adb logcat | grep -i lavora`.
