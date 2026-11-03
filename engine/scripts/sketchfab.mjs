// Fetch a Sketchfab model as GLB, with its licence recorded beside it.
//   node scripts/sketchfab.mjs <uid> <folder>     → assets/<folder>/model.glb + credit.json
// Refuses non-commercial licences: the channel is monetised. Token from explainer/.env.local.
import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { ROOT, env } from "./lib.mjs";

if (process.env.HTTPS_PROXY && !process.env.NODE_USE_ENV_PROXY) {
  const r = spawnSync(process.execPath, process.argv.slice(1), { stdio: "inherit", env: { ...process.env, NODE_USE_ENV_PROXY: "1" } });
  process.exit(r.status ?? 1);
}

const [uid, folder] = process.argv.slice(2);
if (!uid || !folder) throw new Error("usage: node scripts/sketchfab.mjs <uid> <folder>");
const token = env("SKETCHFAB_API_TOKEN");
if (!token) throw new Error("SKETCHFAB_API_TOKEN missing in explainer/.env.local");

const api = async (path, auth) => {
  const res = await fetch(`https://api.sketchfab.com/v3${path}`, auth ? { headers: { Authorization: `Token ${token}` } } : {});
  if (!res.ok) throw new Error(`${path} → ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
};

const info = await api(`/models/${uid}`);
const licence = info.license?.label || "unknown";
if (/noncommercial|non-commercial/i.test(licence)) throw new Error(`"${info.name}" is ${licence}: not usable on a monetised channel`);
const dl = await api(`/models/${uid}/download`, true);
if (!dl.glb?.url) throw new Error(`"${info.name}" has no GLB download`);
const glb = Buffer.from(await (await fetch(dl.glb.url)).arrayBuffer());

const dir = join(ROOT, "assets", folder);
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, "model.glb"), glb);
const credit = {
  name: info.name,
  author: info.user?.displayName || info.user?.username,
  licence,
  url: info.viewerUrl,
  line: `"${info.name}" by ${info.user?.displayName || info.user?.username} (${info.viewerUrl}), ${licence}`,
};
writeFileSync(join(dir, "credit.json"), JSON.stringify(credit, null, 2) + "\n");
console.log(`${folder}: ${(glb.length / 1e6).toFixed(1)} MB, ${info.faceCount} faces, ${licence}`);
