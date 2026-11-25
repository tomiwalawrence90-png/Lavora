import fs from "node:fs";

const file = process.argv[2] ||
  "android/app/src/main/java/com/lavora/app/LavoraScreenPlugin.java";

if (!fs.existsSync(file)) {
  console.error("File not found: " + file);
  process.exit(1);
}

let src = fs.readFileSync(file, "utf8");
fs.writeFileSync(file + ".bak", src);

const fixes = [
  // The real compile error (Agora 4.x field name)
  ["videoInputStreams", "transcodingVideoStreams"],

  // SDK_INT is always >= 23
  ['r.put("supported", Build.VERSION.SDK_INT >= 23);', 'r.put("supported", true);'],

  // Unboxing NPE on uid
  ['int uid = call.getInt("uid", 1);',
   'Integer uidBoxed = call.getInt("uid", 1);\n            int uid = uidBoxed != null ? uidBoxed : 1;'],

  // StandardCharsets
  ['body.toString().getBytes("UTF-8")', "body.toString().getBytes(StandardCharsets.UTF_8)"],
  ['String s = bo.toString("UTF-8");', "String s = new String(bo.toByteArray(), StandardCharsets.UTF_8);"],
  ["import java.net.URL;", "import java.net.URL;\nimport java.nio.charset.StandardCharsets;"],

  // Lambda -> method reference
  ["LavoraCaptureService.onFailed = msg -> failStart(msg);", "LavoraCaptureService.onFailed = this::failStart;"],

  // Silence "never used" warnings (Capacitor calls these by reflection)
  ["public class LavoraScreenPlugin extends Plugin {",
   '@SuppressWarnings("unused")\npublic class LavoraScreenPlugin extends Plugin {'],
];

for (const [from, to] of fixes) {
  if (src.includes(to) && !to.includes(from)) { console.log("already applied: " + from.slice(0, 40)); continue; }
  if (!src.includes(from)) { console.log("not found:       " + from.slice(0, 40)); continue; }
  src = src.split(from).join(to);
  console.log("applied:         " + from.slice(0, 40));
}

fs.writeFileSync(file, src);
console.log("\nDone. Backup saved as " + file + ".bak");