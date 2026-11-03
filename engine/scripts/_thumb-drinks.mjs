import { chromium } from "playwright";
import { readFileSync } from "node:fs";
const root = process.argv[2];
const bg = "data:image/png;base64," + readFileSync(`${root}/out/drinks-thumbframe.png`).toString("base64");
const f64 = (f) => "data:font/woff2;base64," + readFileSync(`${root}/node_modules/@fontsource/${f}`).toString("base64");
const css = `@font-face{font-family:A;src:url(${f64("anek-telugu/files/anek-telugu-telugu-700-normal.woff2")})}@font-face{font-family:L;src:url(${f64("inter-tight/files/inter-tight-latin-800-normal.woff2")})}`;
const html = `<html><head><style>${css}
body{margin:0;width:1080px;height:1920px;background:url(${bg}) center/cover;font-family:L,A;position:relative;overflow:hidden}
.top{position:absolute;left:0;right:0;top:0;height:300px;background:#fff;text-align:center;box-shadow:0 8px 30px rgba(0,0,0,.12)}.t1{font:700 135px A,L;color:#141414;margin-top:30px;line-height:1.1}.t2{font:800 46px L,A;color:#d62828;margin-top:8px}
.band{position:absolute;left:0;right:0;top:790px;padding:22px 0 30px;background:#fff;box-shadow:0 10px 40px rgba(0,0,0,.18);text-align:center}
.q{font:800 150px L,A;color:#141414;letter-spacing:-2px;line-height:1}
.q b{color:#d62828}
.s{font:700 64px A,L;color:#141414;margin-top:14px}
.tag{position:fixed;top:650px;right:30px;background:#d62828;color:#fff;font:800 70px L;padding:8px 26px 14px;border-radius:18px;transform:rotate(4deg)}
.n{position:absolute;top:60px;left:50px;background:#141414;color:#fff;font:800 58px L,A;padding:10px 24px 16px;border-radius:18px;transform:rotate(-3deg)}
</style></head><body>
<div class="top"><div class="t1">కల్లు vs సారా</div><div class="t2">Liquor vs Liqueur · Lager vs Ale · Wine</div></div>
<div class="band"><div class="q">Difference <b>ఏంటి?</b></div></div>
</body></html>`;
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
await p.setContent(html); await p.waitForTimeout(800); await p.evaluate(() => document.fonts.ready);
await p.screenshot({ path: `${root}/out/drinks-thumb-vertical.png` }); await b.close(); console.log("ok");
