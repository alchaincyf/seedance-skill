#!/usr/bin/env node
// 从渲好的白模里抽帧自检。
//
//   node frames.mjs whitemodel.mp4 scene.json          按镜头切点+段内均分自动挑
//   node frames.mjs whitemodel.mp4 scene.json 0,7.5,15 只抽这几个时刻
//   node frames.mjs whitemodel.mp4 scene.json --contact 额外拼一张联系表（3 列）
//
// 「渲完必须抽帧看」是铁律里唯一没有替代品的一步，但 skill 之前没给抽帧的手段，
// 于是每次都在手搓 ffmpeg 命令。挑帧本身也有讲究：均匀抽会漏掉切点前后，
// 而切点正是最容易坏的地方（跨机位瞬移、主体跳位）。
//
// 需要 ffmpeg 在 PATH 里。

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve, basename } from "node:path";

const [video, sceneFile, ...rest] = process.argv.slice(2);
if (!video || !sceneFile) {
  console.error("用法: node frames.mjs whitemodel.mp4 scene.json [时刻,逗号分隔] [--contact]");
  process.exit(2);
}
if (!existsSync(video)) { console.error(`✗ 找不到 ${video}`); process.exit(1); }
try { execFileSync("ffmpeg", ["-version"], { stdio: "pipe" }); }
catch { console.error("✗ 需要 ffmpeg（brew install ffmpeg）"); process.exit(1); }

const scene = JSON.parse(readFileSync(resolve(sceneFile), "utf8"));
const DUR = scene.meta.duration, FPS = scene.meta.fps ?? 30;
const contact = rest.includes("--contact");
const explicit = rest.find((a) => !a.startsWith("--"));

const times = explicit
  ? explicit.split(",").map(Number).filter(Number.isFinite)
  : pickTimes(scene);

const outDir = join(dirname(resolve(video)), "抽帧");
mkdirSync(outDir, { recursive: true });

const made = [];
for (const t of times) {
  const f = Math.min(Math.round(t * FPS), Math.round(DUR * FPS) - 1);
  const out = join(outDir, `${basename(video, ".mp4")}-t${t.toFixed(2)}.png`);
  execFileSync("ffmpeg", ["-v", "error", "-i", video, "-vf", `select=eq(n\\,${f})`, "-vsync", "0", "-frames:v", "1", out, "-y"], { stdio: "pipe" });
  made.push(out);
  console.log(`  t=${t.toFixed(2)}s (帧 ${f})  ${out}`);
}

if (contact && made.length > 1) {
  const sheet = join(outDir, `${basename(video, ".mp4")}-联系表.png`);
  execFileSync("ffmpeg", ["-v", "error", ...made.flatMap((m) => ["-i", m]),
    "-filter_complex", `${made.map((_, i) => `[${i}:v]scale=640:-1[s${i}]`).join(";")};${made.map((_, i) => `[s${i}]`).join("")}tile=3x${Math.ceil(made.length / 3)}`,
    sheet, "-y"], { stdio: "pipe" });
  console.log(`\n📋 联系表 ${sheet}`);
}
console.log(`\n共 ${made.length} 帧 → ${outDir}\n把它们逐张看过再往下走：体检查得了几何，查不了「好不好看」。`);

// 挑哪些帧：每个镜头的头、尾、中间两个点，外加硬切点前后各一帧。
// 切点前后是跨机位瞬移和主体跳位最容易暴露的位置，均匀抽会正好跳过它
function pickTimes(sc) {
  const set = new Set();
  const push = (t) => set.add(Math.max(0, Math.min(DUR, Math.round(t * 100) / 100)));
  for (const s of sc.shots ?? []) {
    const [a, b] = s.t;
    push(a); push(b - 1 / FPS);
    push(a + (b - a) / 3); push(a + (b - a) * 2 / 3);
  }
  for (const s of (sc.shots ?? []).slice(1)) { push(s.t[0] - 2 / FPS); push(s.t[0] + 2 / FPS); }
  return [...set].sort((x, y) => x - y);
}
