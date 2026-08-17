#!/usr/bin/env node
// 白模渲染前体检 —— 不渲染、不开浏览器，纯数学扫一遍时间轴。
// 存在的理由：2026-08-12 那批白模 lint 全绿、时长全对，抽帧一看五个运镜坏了五个。
// 下面每一条检查项都对应一个真实翻过的车。
//
//   node probe.mjs scene.json [--verbose]

import { readFileSync } from "node:fs";
import { solveAt, subjectAt, project, visibleHeightAt, shotAt } from "./solver.mjs";

const file = process.argv[2];
const verbose = process.argv.includes("--verbose");
if (!file) { console.error("用法: node probe.mjs scene.json"); process.exit(2); }
const scene = JSON.parse(readFileSync(file, "utf8"));

const DUR = scene.meta.duration;
const FPS = scene.meta.fps ?? 30;
const [aw, ah] = (scene.meta.aspect ?? "16:9").split(":").map(Number);
const ASPECT = aw / ah;
const HERO = scene.meta.hero ?? (scene.subjects?.[0]?.id);

const issues = [];   // {level:'🔴'|'🟡', msg}
const notes = [];
const bad = (m) => issues.push({ level: "🔴", msg: m });
const warn = (m) => issues.push({ level: "🟡", msg: m });

// ── 0. 结构与时长 ──────────────────────────────────────────
if (!Number.isInteger(DUR * FPS)) bad(`duration×fps = ${DUR * FPS} 不是整数帧，改 duration 或 fps`);
const shots = scene.shots ?? [];
if (!shots.length) bad("没有 shots，白模不知道相机在哪");
shots.forEach((s, i) => {
  if (s.t[1] <= s.t[0]) bad(`shot#${i + 1} 时间区间非法 ${JSON.stringify(s.t)}`);
  if (i > 0 && Math.abs(s.t[0] - shots[i - 1].t[1]) > 1e-6)
    warn(`shot#${i} 结束 ${shots[i - 1].t[1]}s 与 shot#${i + 1} 开始 ${s.t[0]}s 不接续 —— 中间这段没有相机`);
});
if (shots.length && Math.abs(shots[shots.length - 1].t[1] - DUR) > 1e-6)
  warn(`最后一个 shot 在 ${shots[shots.length - 1].t[1]}s 结束，但全片 ${DUR}s`);
if (shots.length && shots[0].t[0] !== 0) warn(`第一个 shot 从 ${shots[0].t[0]}s 才开始`);

// ── 逐帧采样 ───────────────────────────────────────────────
const N = Math.round(DUR * FPS);
const rows = [];
// 镜头内取帧：左闭右开，最后一个镜头含末帧。
// 用闭区间的话切点那一帧已经属于下一个镜头，会把「跨机位的瞬移」算进位移统计
const inShot = (r, s, i) => r.time >= s.t[0] && (i === shots.length - 1 ? r.time <= s.t[1] : r.time < s.t[1]);
for (let f = 0; f <= N; f++) {
  const time = (f / FPS);
  const cam = solveAt(scene, Math.min(time, DUR));
  const hero = HERO ? subjectAt(scene, HERO, Math.min(time, DUR)) : null;
  let pFoot = null, pHead = null, pCen = null, dist = null, heightFrac = null, inFrame = null;
  if (hero) {
    pFoot = project(hero.foot, cam, ASPECT);
    pHead = project(hero.head, cam, ASPECT);
    pCen = project(hero.center, cam, ASPECT);
    dist = Math.hypot(hero.center[0] - cam.pos[0], hero.center[1] - cam.pos[1], hero.center[2] - cam.pos[2]);
    // 占比要用包围盒投影，不能只用头脚两点：垂直俯拍时头脚在画面上几乎重合，
    // 只量头脚会得出「占画高 0%」这种假警报
    const w = hero.height * 0.26;
    const corners = [];
    for (const dx of [-w / 2, w / 2]) for (const dz of [-w / 2, w / 2]) for (const dy of [0, hero.height])
      corners.push(project([hero.foot[0] + dx, hero.foot[1] + dy, hero.foot[2] + dz], cam, ASPECT));
    const vis = corners.filter((c) => !c.behind);
    if (vis.length) {
      const dy = Math.max(...vis.map((c) => c.y)) - Math.min(...vis.map((c) => c.y));
      const dx = Math.max(...vis.map((c) => c.x)) - Math.min(...vis.map((c) => c.x));
      heightFrac = Math.max(dy, dx) / 2;   // 折算成「占画面短边」的比例
    } else heightFrac = 0;
    inFrame = !pCen.behind && Math.abs(pCen.x) <= 1 && Math.abs(pCen.y) <= 1;
  }
  const rig = cam.shot?.rig ?? "static";
  rows.push({ f, time, cam, hero, pCen, pFoot, pHead, dist, heightFrac, inFrame, rig });
}

// ── 1. 主体出画 ────────────────────────────────────────────
// case2「主体被裁出画」：绕原点转，而舞者在原点附近游走 ±1.2m
if (HERO) {
  // pov 段相机架在主体身上，pan 段常常就是要从空镜摇到主体——都不算「主体丢了」
  const out = rows.filter((r) => !r.inFrame && r.rig !== "pov" && r.rig !== "pan");
  const panOut = rows.filter((r) => !r.inFrame && r.rig === "pan");
  if (panOut.length) notes.push(`摇摄段有 ${toRanges(panOut.map((r) => r.f), FPS)} 主体不在画内 —— 摇过去之前看不见是正常的，确认它是有意的空镜起手`);
  if (out.length) {
    const ranges = toRanges(out.map((r) => r.f), FPS);
    const total = out.length / rows.length;
    const m = `主体「${HERO}」有 ${(total * 100).toFixed(1)}% 的时间在画外：${ranges}`;
    total > 0.02 ? bad(m) : warn(m);
  }
  // 半出画：脚或头被切。不一定是错（特写就该切），但要知道
  const cut = rows.filter((r) => r.inFrame && (Math.abs(r.pFoot.y) > 1 || Math.abs(r.pHead.y) > 1));
  if (cut.length > rows.length * 0.1)
    notes.push(`主体有 ${((cut.length / rows.length) * 100).toFixed(0)}% 的时间头或脚被画框切（特写段落里正常）`);
}

// ── 2. 主体太小 → AI 会把它丢掉 ────────────────────────────
// 2026-08-16 实证：神殿末段人物只占画高 5%，成片最后 4 秒人整个消失，只剩空祭坛。
// 判据：占画高 < 10% 且该段位移 < 0.5 身高 = 高风险
if (HERO) {
  shots.forEach((s, i) => {
    if (s.rig === "pov") return;
    const rs = rows.filter((r) => inShot(r, s, i) && r.hero);
    if (!rs.length) return;
    const avg = rs.reduce((a, r) => a + r.heightFrac, 0) / rs.length;
    const p0 = rs[0].hero.foot, p1 = rs[rs.length - 1].hero.foot;
    const move = Math.hypot(p1[0] - p0[0], p1[2] - p0[2]) / rs[0].hero.height;
    // 俯拍队形片里「主角」是队形本身，单个人小是设计而不是错
    const formationShot = s.rig === "topdown" && scene.meta.formationRadius;
    if (avg < 0.10 && move < 0.5 && !formationShot)
      bad(`shot#${i + 1} (${s.t[0]}-${s.t[1]}s)：主体只占画高 ${(avg * 100).toFixed(1)}%、位移仅 ${move.toFixed(2)} 个身高 —— AI 有很大概率在成片里把它丢掉。拉近机位或给这段真实位移`);
    else if (formationShot && avg < 0.10)
      notes.push(`shot#${i + 1} 单个主体只占 ${(avg * 100).toFixed(1)}% —— 俯拍队形片这是正常的，但要确认「队形整体」构成了足够强的图形信号，否则 AI 只会看到一地小点`);
    else if (avg < 0.10)
      warn(`shot#${i + 1}：主体平均只占画高 ${(avg * 100).toFixed(1)}%（<10%），靠位移撑着，建议拉近`);
  });
}

// ── 2b. 配角出画 / 两个主体在画面上重叠 ────────────────────
// 2026-08-17 踩的：体检零红、lint 全绿，抽帧一看对手整段出画、另一段两人重叠成一条竖线。
// 根因是这里只盯 meta.hero 一个人——而双人对打的片子，对手不在画面里就等于没有戏。
// 一镜到底尤其致命：没有硬切可以躲，坏了就是整条坏
{
  const actors = (scene.subjects ?? []).filter((s) => (s.shape ?? "human") === "human" && s.id !== HERO);
  for (const a of actors) {
    const outFrames = [], overlapFrames = [];
    for (const r of rows) {
      if (!r.hero) continue;
      const o = subjectAt(scene, a.id, Math.min(r.time, DUR));
      const p = project(o.center, r.cam, ASPECT);
      if (p.behind || Math.abs(p.x) > 1 || Math.abs(p.y) > 1) { outFrames.push(r.f); continue; }
      // 重叠：两人投影到画面上的水平间距，折算成「几个身宽」。
      // 身宽按身高的 0.26 估（和主体占比用的是同一个系数）
      const dPix = Math.abs(p.x - r.pCen.x) / 2 * (ASPECT > 1 ? ASPECT : 1);
      const bodyFrac = (o.height * 0.26) / Math.max(0.01, visibleHeightAt2(o.center, r.cam));
      if (!r.pCen.behind && dPix < bodyFrac * 0.9) overlapFrames.push(r.f);
    }
    if (outFrames.length) {
      const pct = outFrames.length / rows.length;
      // 首尾 0.5 秒不看占比直接判红：开场和收尾是观众唯一记得住的两帧，
      // 15 秒的片子末尾丢 0.43 秒只占 3%，按占比算会被降成黄——而那正是定格画面
      const edge = outFrames.some((f) => f / FPS < 0.5 || f / FPS > DUR - 0.5);
      const m = `配角「${a.id}」有 ${(pct * 100).toFixed(1)}% 的时间在画外：${toRanges(outFrames, FPS)}`
        + ` —— 双人戏里对手不在画面等于没有戏${edge ? "，而且落在开场或收尾的定格帧上" : ""}`;
      pct > 0.05 || edge ? bad(m) : warn(m);
    }
    if (overlapFrames.length > rows.length * 0.06)
      bad(`「${a.id}」与主体在画面上重叠成一团：${toRanges(overlapFrames, FPS)} —— 相机落在两人连线方向上了。`
        + `要么把环绕角度挪开这个方位，要么给两人加垂直于连线的错位（对角线站位比正对站位稳）`);
    else if (overlapFrames.length)
      notes.push(`「${a.id}」与主体短暂重叠：${toRanges(overlapFrames, FPS)} —— 贴身缠斗时正常，确认不是相机方位造成的`);
  }
}
// 某点所在深度上，画面覆盖的真实高度（米）——用来把「米」换算成「占画面的比例」
function visibleHeightAt2(pt, cam) {
  const d = Math.hypot(...[0, 1, 2].map((j) => pt[j] - cam.pos[j]));
  return 2 * d * Math.tan((cam.fovY * Math.PI) / 180 / 2);
}

// ── 3. 相机穿模 / 贴地拍出「地面洞」 ───────────────────────
// 实证：悬空盘场景里相机 Y=0.25 几乎与地板共面，画面最底一行 94-98% 纯黑，人脚悬在虚空里。抬到 1.6 后归零
rows.forEach((r) => {
  if (r.cam.pos[1] < 0.35) r._lowCam = true;
  if (r.dist !== null && r.dist < 0.8 && r.rig !== "pov") r._tooClose = true;
});
const lowCam = rows.filter((r) => r._lowCam);
if (lowCam.length) warn(`相机高度低于 0.35m 的时段：${toRanges(lowCam.map((r) => r.f), FPS)} —— 贴地机位在悬空/台面场景里会拍出「地面洞」，建议 ≥1.2m 或确认地面是无限平面`);
const tooClose = rows.filter((r) => r._tooClose);
if (tooClose.length) bad(`相机与主体距离 <0.8m：${toRanges(tooClose.map((r) => r.f), FPS)} —— 会穿模或糊成一片`);

// ── 3b. 相机钻进实体里 ─────────────────────────────────────
// 环绕半径一大，相机就绕到墙里去了，主体被建筑挡死——画面上只剩一条边。
// 体检不查这个的话，要等渲完抽帧才发现（实测踩过一次）
{
  const boxes = [];
  for (const spec of scene.world?.props ?? []) {
    if (spec.shape !== "box" || !spec.size) continue;
    const [sx, sy, sz] = spec.size;
    const spots = [];
    const L = spec.layout;
    if (!L) spots.push(spec.pos ?? [0, 0, 0]);
    else if (L.type === "line") {
      for (let i = 0; i < L.count; i++) {
        const t = L.count === 1 ? 0 : i / (L.count - 1);
        spots.push([0, 1, 2].map((j) => L.from[j] + (L.to[j] - L.from[j]) * t));
      }
    } else if (L.type === "ring") {
      for (let i = 0; i < L.count; i++) {
        const a = ((L.from ?? 0) + ((L.to ?? 360) - (L.from ?? 0)) * (i / L.count)) * Math.PI / 180;
        const b = spec.pos ?? [0, 0, 0];
        spots.push([b[0] + Math.cos(a) * (L.radius ?? 5), b[1], b[2] + Math.sin(a) * (L.radius ?? 5)]);
      }
    }
    for (const p of spots) boxes.push([p[0] - sx / 2, p[0] + sx / 2, p[1], p[1] + sy, p[2] - sz / 2, p[2] + sz / 2]);
  }
  const inside = rows.filter((r) => boxes.some((b) =>
    r.cam.pos[0] > b[0] && r.cam.pos[0] < b[1] &&
    r.cam.pos[1] > b[2] && r.cam.pos[1] < b[3] &&
    r.cam.pos[2] > b[4] && r.cam.pos[2] < b[5]));
  if (inside.length)
    bad(`相机钻进了实体内部：${toRanges(inside.map((r) => r.f), FPS)} —— 主体会被墙挡死，画面上只剩一条边。收小环绕半径，或把机位抬到实体上方`);
}

// ── 4. 死时间：相机不动 + 主体不动 ─────────────────────────
// 导演审查的原话：「段4 死时间」是相机零运动 + 主角原地踏步两件事，我第一轮只修了相机
shots.forEach((s, i) => {
  const rs = rows.filter((r) => inShot(r, s, i));
  if (rs.length < 2) return;
  let camMove = 0;
  for (let k = 1; k < rs.length; k++) {
    const a = rs[k - 1].cam.pos, b = rs[k].cam.pos;
    camMove += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  }
  const fovChange = Math.abs(rs[rs.length - 1].cam.mm - rs[0].cam.mm);
  let heroMove = 0;
  if (HERO) for (let k = 1; k < rs.length; k++) {
    const a = rs[k - 1].hero.foot, b = rs[k].hero.foot;
    heroMove += Math.hypot(b[0] - a[0], b[2] - a[2]);
  }
  const dur = s.t[1] - s.t[0];
  const camStill = camMove / dur < 0.15 && fovChange < 3;
  const heroStill = HERO && heroMove / dur < 0.15;
  if (camStill && heroStill)
    bad(`shot#${i + 1} (${s.t[0]}-${s.t[1]}s) 是死时间：相机 ${dur}s 只走了 ${camMove.toFixed(2)}m、主体只走了 ${heroMove.toFixed(2)}m。白模是给 AI 的运动控制信号，这一段等于没给信号`);
  else if (camStill && !shotIsIntentionalStatic(s))
    notes.push(`shot#${i + 1} 相机基本不动（${camMove.toFixed(2)}m/${dur}s）—— 若是有意的固定机位就没问题，主体在动就成立`);
});
function shotIsIntentionalStatic(s) { return s.rig === "static" || s.rig === "zoom" || s.rig === "pan"; }

// ── 5. 缓动把末段吃光 ──────────────────────────────────────
// 审查给的量化判据：把一段五等分看每份贡献多少「距离缩短」，最后一格 <15% 就是尾巴瘫了。
// 「只把起点往后挪会被 ease-in 全吃掉，末段反而更慢」——要动就动终点
shots.forEach((s, i) => {
  const rs = rows.filter((r) => inShot(r, s, i));
  if (rs.length < 10) return;
  const q = [];
  for (let k = 0; k < 5; k++) {
    const a = rs[Math.floor((rs.length - 1) * k / 5)], b = rs[Math.floor((rs.length - 1) * (k + 1) / 5)];
    q.push(Math.hypot(b.cam.pos[0] - a.cam.pos[0], b.cam.pos[1] - a.cam.pos[1], b.cam.pos[2] - a.cam.pos[2]));
  }
  const sum = q.reduce((a, b) => a + b, 0);
  if (sum < 0.3) return;
  const pct = q.map((v) => (v / sum) * 100);
  if (pct[4] < 8)
    warn(`shot#${i + 1} 的相机末段几乎停了（五等分贡献 ${pct.map((p) => p.toFixed(0)).join("/")}%）—— 缓动把尾巴吃掉了，最后一格应 ≥15%`);
  if (verbose) notes.push(`shot#${i + 1} 相机速度五等分：${pct.map((p) => p.toFixed(1)).join(" / ")}%`);
});

// ── 6. 覆盖范围：画面装不装得下 ────────────────────────────
// case3「六角星顶点被裁」：垂直可见半径 = 机位高 × tan(FOV/2)，机位 12m 只覆盖 5.1m，而顶点在 7.8m
if (scene.meta.formationRadius) {
  const R = scene.meta.formationRadius;
  shots.filter((s) => s.rig === "topdown").forEach((s, i) => {
    const rs = rows.filter((r) => inShot(r, s, i));
    rs.forEach((r) => {
      const halfV = visibleHeightAt(r.cam.pos[1], r.cam.fovY) / 2;
      const halfH = halfV * ASPECT;
      if (Math.min(halfV, halfH) < R) r._cropFormation = true;
    });
    if (rs.some((r) => r._cropFormation))
      bad(`topdown shot (${s.t[0]}-${s.t[1]}s)：队形半径 ${R}m 超出画面覆盖 —— 机位高度 × tan(FOV/2) 决定了能拍多宽，抬高机位或换广角`);
  });
}

// ── 7. 硬切点（直接抄进 prompt 的时间戳）────────────────────
const cuts = shots.slice(1).map((s) => s.t[0]);

// ── 报告 ───────────────────────────────────────────────────
const L = [];
L.push(`# 白模体检 · ${scene.meta.name ?? file}`);
L.push("");
L.push(`时长 ${DUR}s / ${FPS}fps / ${N} 帧 · 画幅 ${scene.meta.aspect ?? "16:9"} · 主体「${HERO ?? "无"}」`);
L.push(`镜头 ${shots.length} 个${cuts.length ? ` · 硬切点 ${cuts.map((c) => c.toFixed(3) + "s").join(" / ")}` : "（一镜到底）"}`);
L.push("");
L.push("## 镜头表");
L.push("");
L.push("| # | 时间 | rig | 焦距 | 主体占画高 | 相机位移 |");
L.push("|---|---|---|---|---|---|");
shots.forEach((s, i) => {
  const rs = rows.filter((r) => inShot(r, s, i));
  const avg = HERO && rs.length ? (rs.reduce((a, r) => a + r.heightFrac, 0) / rs.length * 100).toFixed(1) + "%" : "—";
  let cm = 0;
  for (let k = 1; k < rs.length; k++) cm += Math.hypot(...[0, 1, 2].map((j) => rs[k].cam.pos[j] - rs[k - 1].cam.pos[j]));
  const mm = Array.isArray(s.lens) ? `${s.lens[0]}→${s.lens[1]}mm` : `${s.lens ?? 35}mm`;
  L.push(`| ${i + 1} | ${s.t[0]}–${s.t[1]}s | ${s.rig} | ${mm} | ${avg} | ${cm.toFixed(1)}m |`);
});
L.push("");
if (issues.length) {
  L.push("## 问题");
  L.push("");
  issues.forEach((i) => L.push(`- ${i.level} ${i.msg}`));
  L.push("");
}
if (notes.length) {
  L.push("## 备注");
  L.push("");
  notes.forEach((n) => L.push(`- ${n}`));
  L.push("");
}
const reds = issues.filter((i) => i.level === "🔴").length;
L.push(reds ? `**${reds} 个 🔴 必须修掉再渲。**` : "**无 🔴。可以渲了——但渲完仍然要抽帧看，体检只查得了几何，查不了「好不好看」。**");
console.log(L.join("\n"));
process.exit(reds ? 1 : 0);

function toRanges(frames, fps) {
  if (!frames.length) return "";
  const out = [];
  let s = frames[0], p = frames[0];
  for (const f of frames.slice(1)) {
    if (f === p + 1) { p = f; continue; }
    out.push([s, p]); s = f; p = f;
  }
  out.push([s, p]);
  return out.map(([a, b]) => `${(a / fps).toFixed(2)}–${(b / fps).toFixed(2)}s`).join("、");
}
