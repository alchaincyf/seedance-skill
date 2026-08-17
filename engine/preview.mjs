#!/usr/bin/env node
// 单帧预览：把某几个时刻渲成 PNG，用来对构图。
// 照片反解白模时要反复看首帧和照片像不像，渲整段视频太慢。
//
//   node preview.mjs scene.json 0 preview-t0.png     单个时刻
//   node preview.mjs scene.json 0,7.5,15             多个时刻，一次渲完
//
// 每渲一帧会同时打印该时刻的机位事实（位置/焦距/到主体距离/占画高）。
// 这不是装饰：2026-08-17 freeze 钳位坏掉时，三张「不同时刻」的图逐像素相同，
// 而图本身看不出哪里不对——有参数在旁边对照，一眼就知道渲的根本不是那个时刻。

import { execFileSync } from "node:child_process";
import { mkdirSync, copyFileSync, readdirSync, rmSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { solveAt, subjectAt, project } from "./solver.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const [sceneFile, timeArg, outArg] = process.argv.slice(2);
if (!sceneFile) { console.error("用法: node preview.mjs scene.json [时刻秒，可逗号分隔] [out.png]"); process.exit(2); }

const scene = JSON.parse(readFileSync(resolve(sceneFile), "utf8"));
const times = String(timeArg ?? 0).split(",").map((s) => Number(s.trim())).filter((n) => Number.isFinite(n));
if (!times.length) { console.error("✗ 时刻解析不出数字"); process.exit(2); }
if (times.length > 1 && outArg) console.error("⚠️ 多个时刻时忽略指定的输出文件名，按 preview-t<秒>.png 命名");

const [aw, ah] = (scene.meta.aspect ?? "16:9").split(":").map(Number);
const ASPECT = aw / ah;
const HERO = scene.meta.hero ?? scene.subjects?.[0]?.id;

for (const t of times) {
  const out = resolve(times.length === 1 && outArg ? outArg : `preview-t${t}.png`);
  const tmp = join(dirname(resolve(sceneFile)), "_preview");
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  execFileSync("node", [join(here, "build.mjs"), resolve(sceneFile), join(tmp, "index.html"), "--freeze", String(t)], { stdio: "pipe" });
  execFileSync("npx", ["hyperframes@0.7.107", "render", "--quality", "draft", "--format", "png-sequence", "--output", join(tmp, "seq"), tmp], { stdio: "pipe" });
  const seq = readdirSync(join(tmp, "seq")).filter((f) => f.endsWith(".png")).sort();
  if (!seq.length) { console.error("没渲出帧，去 _preview/ 里看 index.html"); process.exit(1); }
  copyFileSync(join(tmp, "seq", seq[0]), out);
  rmSync(tmp, { recursive: true, force: true });
  console.log(`✅ ${out}\n   ${facts(t)}`);
}

// 这一帧的机位事实——和图配着看，图对不上参数就是引擎出了问题
function facts(t) {
  const cam = solveAt(scene, t);
  const p = cam.pos.map((v) => v.toFixed(1)).join(", ");
  const bits = [`t=${t}s`, cam.shot?.rig ?? "static", `${cam.mm.toFixed(0)}mm`, `机位(${p})`];
  const hero = HERO ? subjectAt(scene, HERO, t) : null;
  if (hero) {
    const d = Math.hypot(...[0, 1, 2].map((j) => hero.center[j] - cam.pos[j]));
    bits.push(`距主体 ${d.toFixed(1)}m`);
    const c = [project(hero.foot, cam, ASPECT), project(hero.head, cam, ASPECT)];
    if (c.every((x) => !x.behind)) bits.push(`占画高 ${(Math.abs(c[1].y - c[0].y) / 2 * 100).toFixed(0)}%`);
    else bits.push("主体在机位后方");
  }
  return bits.join(" · ");
}
