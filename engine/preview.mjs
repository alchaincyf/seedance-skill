#!/usr/bin/env node
// 单帧预览：把某一时刻渲成 PNG，用来对构图。
// 照片反解白模时要反复看首帧和照片像不像，渲整段视频太慢。
//
//   node preview.mjs scene.json 0 preview-t0.png

import { execFileSync } from "node:child_process";
import { mkdirSync, copyFileSync, readdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const [sceneFile, timeArg, outArg] = process.argv.slice(2);
if (!sceneFile) { console.error("用法: node preview.mjs scene.json [时刻秒] [out.png]"); process.exit(2); }
const t = Number(timeArg ?? 0);
const out = resolve(outArg ?? `preview-t${t}.png`);
const tmp = join(dirname(resolve(sceneFile)), "_preview");

rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });
execFileSync("node", [join(here, "build.mjs"), resolve(sceneFile), join(tmp, "index.html"), "--freeze", String(t)], { stdio: "pipe" });
execFileSync("npx", ["hyperframes@0.7.107", "render", "--quality", "draft", "--format", "png-sequence", "--output", join(tmp, "seq"), tmp], { stdio: "pipe" });
const seq = readdirSync(join(tmp, "seq")).filter((f) => f.endsWith(".png")).sort();
if (!seq.length) { console.error("没渲出帧，去 _preview/ 里看 index.html"); process.exit(1); }
copyFileSync(join(tmp, "seq", seq[0]), out);
rmSync(tmp, { recursive: true, force: true });
console.log(`✅ ${out}  (t=${t}s)`);
