import { readFileSync, existsSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function arg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (hit) return hit.slice(name.length + 3);
  return process.argv.includes(`--${name}`) ? true : fallback;
}

/** Reads explainer/.env.local (git-ignored) without printing anything from it. */
export function env(key) {
  if (process.env[key]) return process.env[key];
  const file = join(ROOT, ".env.local");
  if (!existsSync(file)) return undefined;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && m[1] === key) return m[2].replace(/^["']|["']$/g, "");
  }
}

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json",
  ".css": "text/css", ".woff2": "font/woff2", ".woff": "font/woff", ".mp3": "audio/mpeg", ".png": "image/png" };

export function serve(port = 0) {
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
    let file = resolve(join(ROOT, path));
    if (!file.startsWith(ROOT + sep)) return res.writeHead(403).end();
    if (path.endsWith("/")) file = join(file, "index.html");
    if (!existsSync(file)) return res.writeHead(404).end("not found");
    res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream", "cache-control": "no-store", "access-control-allow-origin": "*" });
    res.end(readFileSync(file));
  });
  return new Promise((ok) => server.listen(port, "127.0.0.1", () => ok(server)));
}
