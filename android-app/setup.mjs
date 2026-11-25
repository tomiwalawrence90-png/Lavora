#!/usr/bin/env node
/* Run AFTER `npx cap add android`, from inside android-app/:   node setup.mjs
   Installs the LAVORA native plugin into the generated Android project:
   copies the Java files, registers the plugin, adds permissions + foreground service, adds the Agora SDK.
   Safe to re-run. */
import fs from "node:fs";
import path from "node:path";

const root = path.join(process.cwd(), "android");
if (!fs.existsSync(root)) { console.error("✖ android/ not found. Run `npx cap add android` first (inside android-app/)."); process.exit(1); }

const AGORA_DEP = 'io.agora.rtc:full-sdk:4.5.2';   // pinned; check Agora docs for a newer 4.x if the build complains

function walk(d, out = []) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { if (!["build", ".gradle", "node_modules"].includes(e.name)) walk(p, out); } else out.push(p); } return out; }

// 1) find MainActivity + package
const main = walk(path.join(root, "app/src/main/java")).find(f => f.endsWith("MainActivity.java"));
if (!main) { console.error("✖ MainActivity.java not found."); process.exit(1); }
let mainSrc = fs.readFileSync(main, "utf8");
const pkg = (mainSrc.match(/^\s*package\s+([\w.]+)\s*;/m) || [])[1];
if (!pkg) { console.error("✖ Could not read the package name from MainActivity.java"); process.exit(1); }
const dir = path.dirname(main);

// 2) copy native java files with the right package
for (const f of ["LavoraScreenPlugin.java", "LavoraCaptureService.java"]) {
  const src = fs.readFileSync(path.join(process.cwd(), "native", f), "utf8").replaceAll("__PKG__", pkg);
  fs.writeFileSync(path.join(dir, f), src); console.log("✔ copied", f);
}

// 3) register the plugin in MainActivity
if (!mainSrc.includes("LavoraScreenPlugin")) {
  const re = /public class MainActivity extends BridgeActivity\s*\{\s*\}/;
  if (re.test(mainSrc)) {
    mainSrc = mainSrc.replace(re,
`public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(LavoraScreenPlugin.class);
        super.onCreate(savedInstanceState);
    }
}`);
    if (!mainSrc.includes("import android.os.Bundle;")) mainSrc = mainSrc.replace(/(package\s+[\w.]+\s*;)/, "$1\n\nimport android.os.Bundle;");
    fs.writeFileSync(main, mainSrc); console.log("✔ MainActivity: plugin registered");
  } else {
    console.warn("⚠ MainActivity has custom code. Add manually inside onCreate, BEFORE super.onCreate(...):  registerPlugin(LavoraScreenPlugin.class);");
  }
} else console.log("• MainActivity already registers the plugin");

// 4) manifest
const mf = path.join(root, "app/src/main/AndroidManifest.xml");
let m = fs.readFileSync(mf, "utf8");
const perms = ["CAMERA", "RECORD_AUDIO", "MODIFY_AUDIO_SETTINGS", "ACCESS_NETWORK_STATE", "FOREGROUND_SERVICE", "FOREGROUND_SERVICE_MEDIA_PROJECTION",
  "FOREGROUND_SERVICE_CAMERA", "FOREGROUND_SERVICE_MICROPHONE", "POST_NOTIFICATIONS", "WAKE_LOCK"];
const missing = perms.filter(p => !m.includes(`android.permission.${p}"`));
if (missing.length) {
  m = m.replace(/<application/, missing.map(p => `    <uses-permission android:name="android.permission.${p}" />`).join("\n") + "\n\n    <application");
  console.log("✔ manifest: permissions added (" + missing.length + ")");
}
if (!m.includes("LavoraCaptureService")) {
  m = m.replace(/<\/application>/, `    <service android:name=".LavoraCaptureService" android:exported="false"
            android:foregroundServiceType="mediaProjection|camera|microphone" />\n    </application>`);
  console.log("✔ manifest: foreground service added");
}
fs.writeFileSync(mf, m);

// 5) gradle: Agora SDK + native lib packaging
const gf = path.join(root, "app/build.gradle");
let g = fs.readFileSync(gf, "utf8");
if (!g.includes("io.agora.rtc")) {
  g = g.replace(/dependencies\s*\{/, `dependencies {\n    implementation "${AGORA_DEP}"`);
  console.log("✔ build.gradle: Agora SDK added");
}
if (!g.includes("libc++_shared")) {
  g = g.replace(/android\s*\{/, `android {\n    packagingOptions { pickFirst '**/libc++_shared.so' }`);
  console.log("✔ build.gradle: native packaging rule added");
}
fs.writeFileSync(gf, g);

console.log("\nDone. Next:  npx cap sync android   then   npx cap open android");
