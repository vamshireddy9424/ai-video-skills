// Render an episode to MP4: headless Chromium draws each frame, ffmpeg encodes.
//
//   node scripts/render.mjs --ep=tatkal                 full video → out/tatkal.mp4
//   node scripts/render.mjs --ep=tatkal --from=10 --to=20   a slice
//   node scripts/render.mjs --ep=tatkal --stills=2,9,17      PNG stills for review
//   node scripts/render.mjs --ep=tatkal --cues          just the sound cues (for scripts/mix.mjs)
//   --fps=30  --pr=1.5 (supersampling)  --ao=0 (skip ambient occlusion, faster)
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync, statSync, renameSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { ROOT, arg, serve } from "./lib.mjs";
import { buildTimeline } from "./timeline.mjs";

// Resolved through require so a globally installed Playwright works too.
const { chromium } = createRequire(import.meta.url)("playwright");

const ep = arg("ep", "tatkal");
const fps = Number(arg("fps", 30));
const pr = Number(arg("pr", 1.5));
const ao = arg("ao", "1");
const tl = buildTimeline(ep);
const outDir = join(ROOT, "out");
mkdirSync(outDir, { recursive: true });

const server = await serve(0);
const url = `http://127.0.0.1:${server.address().port}/web/?ep=${ep}&render=1&pr=${pr}&ao=${ao}`;
// On a Mac, Chromium uses the real GPU. On a Linux box with no GPU, fall back to SwiftShader.
// --gpu=1 uses a Linux box's own GPU (e.g. a Raspberry Pi); --chrome=/usr/bin/chromium uses a system browser.
const browser = await chromium.launch({
  ...(arg("chrome", null) ? { executablePath: arg("chrome", null) } : {}),
  args:
    process.platform === "linux" && arg("gpu", false)
      ? ["--ignore-gpu-blocklist", "--enable-gpu"]
      : process.platform === "linux"
        ? ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
      : process.platform === "darwin"
        ? ["--use-angle=metal", "--ignore-gpu-blocklist", "--enable-gpu-rasterization"] // Apple GPU
        : ["--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
page.on("pageerror", (e) => console.error("page error:", e.message));
page.on("console", (m) => m.type() === "error" && console.error("console:", m.text()));
await page.goto(url);
await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
// say which GPU is drawing: "Apple M1" is fast, "SwiftShader" means software and is ~10× slower
console.log("GPU:", await page.evaluate(() => {
  const gl = document.createElement("canvas").getContext("webgl2");
  const ext = gl?.getExtension("WEBGL_debug_renderer_info");
  return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "unknown";
}));
// Sound cues ride along with every render, so the mix always matches the picture.
const cues = await page.evaluate(() => window.__cues());
writeFileSync(join(ROOT, "episodes", ep, "cues.json"), JSON.stringify(cues, null, 1));
if (arg("cues", false)) {
  console.log(`${cues.length} sound cues → episodes/${ep}/cues.json`);
  await browser.close();
  server.close();
  process.exit(0);
}
const shot = async (t) => {
  await page.evaluate((t) => window.__seek(t), t);
  // heavy scenes on a GPU-less box can take far longer than Playwright's 30 s default per frame
  return page.screenshot({ type: "png", clip: { x: 0, y: 0, width: 1080, height: 1920 }, timeout: 0 });
};

// warm-up: the first frame compiles every shader; do it once before timing anything
await page.evaluate(() => window.__seek(0));
await page.screenshot({ type: "png", timeout: 0 });

const stills = arg("stills", null);
if (stills) {
  for (const t of String(stills).split(",").map(Number)) {
    const file = join(outDir, `${ep}-${t.toFixed(1)}s.png`);
    await page.evaluate((t) => window.__seek(t), t);
    await page.screenshot({ path: file, timeout: 0 });
    console.log(file);
  }
} else {
  const from = Number(arg("from", 0));
  const to = Math.min(Number(arg("to", tl.duration)), tl.duration);
  const n = Math.round((to - from) * fps);
  const out = join(outDir, from === 0 && to === tl.duration ? `${ep}.mp4` : `${ep}-${from}-${to}.mp4`);
  const leadMs = Math.round((tl.lead || 0) * 1000);
  const audio = tl.audio
    ? ["-i", join(ROOT, "episodes", ep, tl.audio), "-af", `adelay=${leadMs}|${leadMs},apad,atrim=start=${from}:end=${to},asetpts=PTS-STARTPTS`]
    : [];
  // Frames go to disk first, so a restarted container resumes where it stopped instead of starting over.
  const framesDir = join(outDir, "frames", `${ep}-${from}-${to}-${fps}`);
  mkdirSync(framesDir, { recursive: true });
  const frame = (i) => join(framesDir, `f${String(i).padStart(5, "0")}.png`);
  const done = (i) => existsSync(frame(i)) && statSync(frame(i)).size > 0;
  const todo = [...Array(n).keys()].filter((i) => !done(i));
  if (todo.length < n) console.log(`resuming: ${n - todo.length} of ${n} frames already rendered`);
  const t0 = Date.now();
  for (const [j, i] of todo.entries()) {
    const png = await shot(from + i / fps);
    writeFileSync(frame(i) + ".tmp", png);
    renameSync(frame(i) + ".tmp", frame(i)); // never leave a half-written frame behind
    if (j % fps === 0) {
      const per = (Date.now() - t0) / (j + 1);
      process.stdout.write(`\r${(from + i / fps).toFixed(1)}s / ${to}s · ${(per / 1000).toFixed(2)}s per frame · ~${Math.round(((todo.length - j) * per) / 60000)} min left   `);
    }
  }
  await new Promise((ok, fail) =>
    spawn("ffmpeg", [
      "-v", "error", "-y",
      "-framerate", String(fps), "-i", join(framesDir, "f%05d.png"),
      ...audio,
      "-c:v", "libx264", "-preset", "medium", "-crf", "17", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
      ...(tl.audio ? ["-c:a", "aac", "-b:a", "192k"] : []),
      out,
    ], { stdio: "inherit" }).on("close", (code) => (code ? fail(new Error(`ffmpeg exited ${code}`)) : ok()))
  );
  console.log(`\n${out}${tl.estimated ? "  (silent: timing estimated, no voice yet)" : ""}`);
}
await browser.close();
server.close();
