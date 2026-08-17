#!/usr/bin/env node
// scene.json + renderer.html + solver.mjs → index.html（hyperframes 可直接渲）
//
//   node build.mjs scene.json [index.html]
//
// 为什么要内联而不是 fetch('scene.json')：渲染进程走 file:// 协议时 fetch 必失败。

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const sceneFile = process.argv[2];
const outFile = process.argv[3] ?? join(dirname(resolve(sceneFile)), "index.html");
if (!sceneFile) { console.error("用法: node build.mjs scene.json [out.html]"); process.exit(2); }

const scene = JSON.parse(readFileSync(sceneFile, "utf8"));

// 画幅一致性：probe 按 meta.aspect 判断出画，渲染器按 width/height 出画面。
// 两边不一致会静默错开——体检说主体在画内，渲出来却被切掉。这里统一由 aspect 推导
const ASPECT_SIZE = { "16:9": [1920, 1080], "9:16": [1080, 1920], "1:1": [1080, 1080], "4:3": [1440, 1080], "21:9": [2560, 1080] };
{
  const a = scene.meta.aspect ?? "16:9";
  const [dw, dh] = ASPECT_SIZE[a] ?? [1920, 1080];
  if (scene.meta.width && scene.meta.height) {
    const r = scene.meta.width / scene.meta.height, [x, y] = a.split(":").map(Number);
    if (Math.abs(r - x / y) > 0.02) {
      console.error(`✗ meta.aspect=${a} 与 width/height=${scene.meta.width}×${scene.meta.height} 对不上。删掉 width/height 让它按 aspect 自动定，或者改对。`);
      process.exit(1);
    }
  } else {
    scene.meta.width = dw; scene.meta.height = dh;
  }
}
// --freeze <秒>：产出一个锁死在该时刻的单帧工程，用于快速对构图（照片反解时要反复看首帧）
const fi = process.argv.indexOf("--freeze");
const freeze = fi > 0 ? Number(process.argv[fi + 1]) : null;
if (freeze !== null && !(freeze >= 0 && freeze <= scene.meta.duration)) {
  console.error(`✗ --freeze ${freeze} 超出 0–${scene.meta.duration}s`);
  process.exit(1);
}
// ⚠️ 时间轴长度（data-duration，freeze 时缩到 0.1 秒只渲一帧）和场景时长（SCENE.meta.duration）
// 必须分开。2026-08-17 踩过：freeze 时把 scene.meta.duration 一起改成 0.1，
// 而渲染器用 Math.min(DUR, t) 钳时间——于是不管传哪个时刻，渲出来的永远是 t=0.1 那一帧。
// 三张「不同时刻」的预览图逐像素相同，看上去像运镜没生效，白查一轮
const timelineDur = freeze !== null ? 0.1 : scene.meta.duration;
const tpl = readFileSync(join(here, "renderer.html"), "utf8");
// 去掉 export 关键字：内联进 <script type="module"> 后这些函数是同作用域直接可见的
const solver = readFileSync(join(here, "solver.mjs"), "utf8").replace(/^export /gm, "");

const html = tpl
  .replace("__DURATION__", String(timelineDur))
  .replace("__WIDTH__", String(scene.meta.width ?? 1920))
  .replace("__HEIGHT__", String(scene.meta.height ?? 1080))
  .replace("__SCENE__", JSON.stringify(scene, null, 2))
  .replace("__SOLVER__", solver)
  .replace("__FREEZE__", freeze === null ? "null" : String(freeze));

writeFileSync(outFile, html);
console.log(`✅ ${outFile}`);
if (freeze !== null) console.log(`   单帧工程，锁死在 t=${freeze}s`);
else console.log(`   ${scene.meta.duration}s × ${scene.meta.fps ?? 30}fps = ${scene.meta.duration * (scene.meta.fps ?? 30)} 帧 · ${scene.shots?.length ?? 0} 个镜头`);
