// Thumbnails from a clean 3D frame of the episode:
//   out/<ep>-thumb-vertical.png   1080×1920  Shorts / Reels cover
//   out/<ep>-thumb-wide.png       1280×720   YouTube thumbnail
// Settings live in script.json → "thumbnail": { t, kicker, line1, line2, badge, sub }.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { ROOT, arg, serve } from "./lib.mjs";

const { chromium } = createRequire(import.meta.url)("playwright");
const ep = arg("ep", "tatkal");
const th = JSON.parse(readFileSync(join(ROOT, "episodes", ep, "script.json"), "utf8")).thumbnail;
if (!th) throw new Error(`episodes/${ep}/script.json has no "thumbnail" block`);

const server = await serve(0);
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({
  args: process.platform === "linux" ? ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] : [],
});

// 1. the bare 3D frame, supersampled
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
await page.goto(`${base}/web/?ep=${ep}&clean=1&pr=2&t=${th.t}`);
await page.waitForFunction(() => window.__ready === true, null, { timeout: 0 });
const frame = (await page.screenshot({ type: "png", timeout: 0 })).toString("base64");

const fonts = ["anek-telugu/telugu-700", "anek-telugu/telugu-800", "anek-telugu/latin-800", "inter-tight/latin-800", "inter-tight/latin-700"]
  .map((f) => `<link rel="stylesheet" href="${base}/node_modules/@fontsource/${f}.css">`)
  .join("");
const css = `
  *{margin:0;box-sizing:border-box} body{font-family:"Anek Telugu","Inter Tight";color:#1d1e21}
  .bg{position:absolute;inset:0;background:url(data:image/png;base64,${frame}) center/cover}
  .kicker{display:inline-block;background:#1d1e21;color:#f3f1eb;font-weight:700;border-radius:14px}
  .l1{font-weight:800;letter-spacing:-0.02em;line-height:1.02}
  .l2{font-weight:800;color:#e5483b;letter-spacing:-0.02em;line-height:1.02}
  .badge{display:inline-block;font-family:"Inter Tight";font-weight:800;color:#fff;background:#e5483b;border:6px solid #ff8a7f;border-radius:18px;font-variant-numeric:tabular-nums}
  .sub{font-weight:700}
  .panel{background:rgba(232,228,219,0.93);border-radius:28px}`;

async function compose(w, h, body, file) {
  const p = await browser.newPage({ viewport: { width: w, height: h } });
  await p.setContent(`<!doctype html><html><head><meta charset="utf-8">${fonts}<style>${css}</style></head><body style="width:${w}px;height:${h}px;position:relative;overflow:hidden">${body}</body></html>`);
  await p.evaluate(async () => {
    await Promise.all(["700", "800"].map((w) => document.fonts.load(`${w} 80px "Anek Telugu"`, "తెలుగు Tatkal")));
    await document.fonts.load('800 80px "Inter Tight"', "10:00");
    await document.fonts.ready;
  });
  await p.waitForTimeout(200);
  await p.screenshot({ path: file });
  console.log(file);
}

// 2. vertical: headline in the empty sky, clear of the Shorts UI at the bottom and right
await compose(1080, 1920, `
  <div class="bg"></div>
  <div class="panel" style="position:absolute;left:56px;right:150px;top:150px;padding:40px 48px 50px">
    <div class="kicker" style="font-size:44px;padding:6px 24px 10px">${th.kicker}</div>
    <div class="l1" style="font-size:150px;margin-top:26px">${th.line1}</div>
    <div class="l2" style="font-size:150px">${th.line2}</div>
    <div class="sub" style="font-size:54px;margin-top:22px">${th.sub}</div>
  </div>
  <div class="badge" style="position:absolute;right:56px;bottom:120px;font-size:96px;padding:10px 34px 16px">${th.badge}</div>`,
  join(ROOT, "out", `${ep}-thumb-vertical.png`));

// 3. wide: text left, the scene right
await compose(1280, 720, `
  <div class="bg" style="left:520px;background-position:50% 62%;background-size:900px auto"></div>
  <div style="position:absolute;inset:0 760px 0 0;background:#e8e4db"></div>
  <div style="position:absolute;left:500px;top:0;bottom:0;width:120px;background:linear-gradient(90deg,#e8e4db,rgba(232,228,219,0))"></div>
  <div style="position:absolute;left:52px;top:58px;width:640px">
    <div class="kicker" style="font-size:30px;padding:4px 18px 7px">${th.kicker}</div>
    <div class="l1" style="font-size:112px;margin-top:18px">${th.line1}</div>
    <div class="l2" style="font-size:112px">${th.line2}</div>
    <div class="sub" style="font-size:40px;margin-top:16px">${th.sub}</div>
  </div>
  <div class="badge" style="position:absolute;right:44px;top:40px;font-size:66px;padding:6px 24px 12px">${th.badge}</div>`,
  join(ROOT, "out", `${ep}-thumb-wide.png`));

await browser.close();
server.close();
