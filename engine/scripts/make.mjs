// The whole episode in one command, for a machine with a GPU (e.g. a Mac):
//   node scripts/make.mjs --ep=floaters
// render (full quality) → mix (voice + music + effects) → Telugu subtitles → thumbnails if configured.
// Re-running resumes the render from the frames already on disk; delete out/frames/<ep>-* after
// changing a scene so stale frames are not reused.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, arg } from "./lib.mjs";

const ep = arg("ep", "floaters");
const run = (script, ...args) => {
  console.log(`\n▶ ${script} ${args.join(" ")}`);
  const r = spawnSync(process.execPath, [join(ROOT, "scripts", script), `--ep=${ep}`, ...args], { stdio: "inherit" });
  if (r.status) process.exit(r.status);
};
run("render.mjs", `--pr=${arg("pr", 1.5)}`, `--ao=${arg("ao", 1)}`);
run("mix.mjs");
run("srt.mjs");
if (JSON.parse(readFileSync(join(ROOT, "episodes", ep, "script.json"), "utf8")).thumbnail) run("thumbnail.mjs");
console.log(`\nDone: out/${ep}-final.mp4 (upload this), out/${ep}.te.srt (Telugu subtitles)`);
