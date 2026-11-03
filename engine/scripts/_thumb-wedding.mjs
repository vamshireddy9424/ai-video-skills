import { chromium } from "playwright";
import { readFileSync } from "node:fs";
const root = process.argv[2];
const bg = "data:image/png;base64," + readFileSync(`${root}/out/wedding-thumbframe.png`).toString("base64");
const f64 = (f) => "data:font/woff2;base64," + readFileSync(`${root}/node_modules/@fontsource/${f}`).toString("base64");
const css = `@font-face{font-family:A;src:url(${f64("anek-telugu/files/anek-telugu-telugu-700-normal.woff2")})}@font-face{font-family:L;src:url(${f64("inter-tight/files/inter-tight-latin-800-normal.woff2")})}`;
const common = `.num{font:800 1em L;color:#ffd23f;letter-spacing:-3px;line-height:.95;text-shadow:0 8px 30px rgba(0,0,0,.6)}
.te{font:700 1em A,L;color:#fff;line-height:1.15;text-shadow:0 6px 24px rgba(0,0,0,.75)}
.chip{display:inline-block;background:#d62828;color:#fff;font:800 1em L,A;padding:.12em .5em .22em;border-radius:.3em}`;
const vert = `<html><head><style>${css}${common}
body{margin:0;width:1080px;height:1920px;background:url(${bg}) center/cover;position:relative;overflow:hidden}
.shade{position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.55) 0%,rgba(0,0,0,0) 22%,rgba(0,0,0,0) 52%,rgba(0,0,0,.85) 80%)}
.top{position:absolute;top:70px;left:0;right:0;text-align:center}
.bot{position:absolute;bottom:150px;left:50px;right:50px;text-align:center}
</style></head><body><div class="shade"></div>
<div class="top"><span class="chip" style="font-size:54px">పెళ్లికి ఎవరూ లేరు…</span></div>
<div class="bot"><div class="num" style="font-size:230px;margin-bottom:24px">20,000</div><div class="te" style="font-size:92px">మంది వచ్చారు!</div></div>
</body></html>`;
const wide = `<html><head><style>${css}${common}
body{margin:0;width:1280px;height:720px;background:#14100c;position:relative;overflow:hidden}
.img{position:absolute;right:0;top:0;width:720px;height:720px;background:url(${bg}) center 30%/cover}
.fade{position:absolute;right:0;top:0;width:720px;height:720px;background:linear-gradient(90deg,#14100c 0%,rgba(20,16,12,0) 35%)}
.txt{position:absolute;left:56px;top:110px;width:640px}
</style></head><body><div class="img"></div><div class="fade"></div>
<div class="txt"><span class="chip" style="font-size:34px">పెళ్లికి ఎవరూ లేరు…</span>
<div class="num" style="font-size:150px;margin-top:40px;margin-bottom:22px">20,000</div><div class="te" style="font-size:68px">మంది వచ్చారు!</div></div>
</body></html>`;
const b = await chromium.launch();
for (const [html, w, h, name] of [[vert, 1080, 1920, "vertical"], [wide, 1280, 720, "wide"]]) {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  await p.setContent(html); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(500);
  await p.screenshot({ path: `${root}/out/wedding-thumb-${name}.png` }); await p.close();
}
await b.close(); console.log("ok");
