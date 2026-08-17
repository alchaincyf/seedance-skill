// 白模求解器 —— 纯数学，零依赖。
// 渲染器（浏览器里跑 three）和 probe（Node 里静态体检）共用同一份，
// 保证「体检说的」和「渲出来的」是同一件事。

// ── 基础工具 ───────────────────────────────────────────────
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const lerp3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
export const seg = (t, a, b) => (b === a ? 1 : clamp((t - a) / (b - a), 0, 1));

export const EASE = {
  linear: (t) => t,
  in: (t) => t * t,
  out: (t) => 1 - (1 - t) * (1 - t),
  inOut: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  // 起步即最快，尾巴长——适合「冲进来然后收势」
  outExpo: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
};
const ease = (name, t) => (EASE[name] || EASE.inOut)(t);

// 确定性伪随机：同一个 seed 永远出同一串数。不许用 Math.random()
export function makeRand(seed = 20260817) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

// ── 镜头：焦距 ↔ 视场角 ────────────────────────────────────
// 全画幅 36×24mm。three 的 PerspectiveCamera.fov 是垂直视场角。
export const mmToFovY = (mm) => (2 * Math.atan(24 / (2 * mm)) * 180) / Math.PI;
export const fovYToMm = (fovY) => 24 / (2 * Math.tan((fovY * Math.PI) / 360));
// 垂直可见高度（米）：距离 d 处画面能装下多高。case3 「六角星顶点被裁」就是没算这个
export const visibleHeightAt = (d, fovY) => 2 * d * Math.tan((fovY * Math.PI) / 360);

// ── 主体运动 ───────────────────────────────────────────────
// path: [{t, p:[x,y,z], ease?}]，y 是脚底高度（0 = 站在地面上）
export function samplePath(path, time) {
  if (!path || path.length === 0) return { p: [0, 0, 0], v: [0, 0, 0] };
  if (path.length === 1) return { p: path[0].p.slice(), v: [0, 0, 0] };
  const first = path[0], last = path[path.length - 1];
  if (time < first.t) {
    // 起点之前按第一段的速度往回外推，不钳住。
    // 钳住会让 follow 机位在开头和主体重叠在同一个点上——case1「开头 1.4 秒看不见主角」就是这么来的。
    // 相机采样 t−lag 得到负数时间是对的，它表示相机还在起跑线后方。
    const b = path[1] ?? first;
    const dt = (b.t - first.t) || 1;
    const k = (time - first.t) / dt;
    return { p: [first.p[0] + (b.p[0] - first.p[0]) * k, first.p[1] + (b.p[1] - first.p[1]) * k, first.p[2] + (b.p[2] - first.p[2]) * k], v: dirOf(path, 0) };
  }
  if (time === first.t) return { p: first.p.slice(), v: dirOf(path, 0) };
  if (time >= last.t) return { p: last.p.slice(), v: dirOf(path, path.length - 2) };
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i], b = path[i + 1];
    if (time >= a.t && time <= b.t) {
      const t = ease(b.ease || a.ease || "inOut", seg(time, a.t, b.t));
      return { p: lerp3(a.p, b.p, t), v: dirOf(path, i) };
    }
  }
  return { p: last.p.slice(), v: [0, 0, 0] };
}
function dirOf(path, i) {
  const a = path[i].p, b = path[i + 1].p;
  return [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
}

// 朝向：从路径切线自动算。
// ⚠️ 这条是拿血换来的：2026-08-16 有一批白模，人物航点朝向套用了机位的角度公式，
// 三条片子全员倒着走（moonwalk），熬穿一整夜三轮审查都没发现——白模人物没脸，正反面一个样。
// three 里 Object3D 默认朝 +Z，所以 yaw = atan2(dx, dz)。机位那套 atan2(-dx,-dz) 差 180°。
export function yawAlongPath(v) {
  const [dx, , dz] = v;
  if (Math.abs(dx) < 1e-6 && Math.abs(dz) < 1e-6) return null; // 没在动，保持原朝向
  return Math.atan2(dx, dz);
}

export function subjectAt(scene, id, time) {
  const s = (scene.subjects || []).find((x) => x.id === id);
  if (!s) return null;
  const { p, v } = samplePath(s.path, time);
  const h = s.height ?? 1.75;
  return {
    id,
    height: h,
    foot: p,                       // 脚底
    center: [p[0], p[1] + h / 2, p[2]],
    head: [p[0], p[1] + h, p[2]],
    aim: [p[0], p[1] + h * 0.62, p[2]],  // 摄影上瞄胸口偏上，不瞄头顶也不瞄脚
    yaw: s.faceAlongPath === false ? (s.yaw ?? 0) : (yawAlongPath(v) ?? s.yaw ?? 0),
    speed: Math.hypot(v[0], v[2]),
  };
}

// lookAt 目标可以写 subject id、固定坐标、或 {id, offset}
function resolveTarget(scene, target, time) {
  if (!target) return [0, 1, 0];
  if (Array.isArray(target)) return target;
  if (typeof target === "string") {
    const s = subjectAt(scene, target, time);
    return s ? s.aim : [0, 1, 0];
  }
  if (target.id) {
    const s = subjectAt(scene, target.id, time);
    const o = target.offset || [0, 0, 0];
    return s ? [s.aim[0] + o[0], s.aim[1] + o[1], s.aim[2] + o[2]] : o;
  }
  return [0, 1, 0];
}

// ── 手持抖动：确定性噪声，不用 Math.random ──────────────────
// 三条不同频率的正弦叠加，看起来像人手，但同一时刻永远同一个值
function shakeOffset(time, sh) {
  if (!sh) return { pos: [0, 0, 0], aim: [0, 0, 0] };
  const a = sh.amp ?? 0.02;            // 位移幅度（米）
  const f = sh.freq ?? 1.1;            // 主频（Hz）
  const ph = sh.phase ?? 0;
  const n = (k, m) => Math.sin(time * f * 2 * Math.PI * m + ph + k) * 0.6
                    + Math.sin(time * f * 2 * Math.PI * m * 2.7 + ph + k * 2) * 0.3
                    + Math.sin(time * f * 2 * Math.PI * m * 0.41 + ph + k * 3) * 0.1;
  return {
    pos: [n(0, 1) * a, n(1.7, 0.83) * a * 0.7, n(3.4, 1.19) * a],
    aim: [n(5.1, 0.61) * a * 1.8, n(6.8, 0.77) * a * 1.4, 0],
  };
}

// ── 机位求解：一个 shot + 时刻 → 相机状态 ────────────────────
// 每个 rig 都是时间的纯函数。t01 是这个 shot 内部的归一化进度。
export function solveShot(scene, shot, time) {
  const [t0, t1] = shot.t;
  const raw = seg(time, t0, t1);
  const t01 = ease(shot.ease || "inOut", raw);
  const lensAt = (l) => (Array.isArray(l) ? lerp(l[0], l[1], t01) : l);
  const pair = (v, d) => (Array.isArray(v) ? v : [v ?? d, v ?? d]);

  let pos, aim;
  const rig = shot.rig || "static";
  const tgt = () => resolveTarget(scene, shot.lookAt ?? shot.target, time);
  let mm = lensAt(shot.lens ?? 35);

  switch (rig) {
    // 三脚架：一动不动。给 AI 的信号是「构图稳定，主体在里面动」
    case "static": {
      pos = shot.pos.slice();
      aim = tgt();
      break;
    }
    // 摇摄/俯仰：位置不动，只转。lookAt 给两个目标点就是摇过去
    case "pan": {
      pos = shot.pos.slice();
      const a = resolveTarget(scene, shot.from, time);
      const b = resolveTarget(scene, shot.to, time);
      aim = lerp3(a, b, t01);
      break;
    }
    // 变焦：机位不动，焦距变。⚠️ 和 dolly 是两件事，透视关系完全不同
    case "zoom": {
      pos = shot.pos.slice();
      aim = tgt();
      break;
    }
    // 轨道/推拉：机位沿直线走，焦距不变
    case "dolly": {
      pos = lerp3(shot.from, shot.to, t01);
      aim = tgt();
      break;
    }
    // 跟随：相机走主体走过的同一条路，滞后 lag 秒。
    // 滞后量 × 速度 = 景别距离——这是 Steadicam 跟拍的物理本质
    case "follow": {
      const s = subjectAt(scene, shot.target, time);
      const back = subjectAt(scene, shot.target, time - (shot.lag ?? 2));
      const h = pair(shot.height, 1.5);
      // ⚠️ 不要把 time-lag 钳到 0：负数才对，它表示相机还在起跑线后方。
      // case1 「开头 1.4 秒看不见主角」就是钳了这一下，相机和主体重叠在同一点
      const off = shot.side ?? 0;
      pos = [back.foot[0] + off, lerp(h[0], h[1], t01), back.foot[2]];
      aim = [s.aim[0], s.aim[1], s.aim[2]];
      break;
    }
    // 前置倒退跟拍：在主体前方 lead 米处后退，主体正面对着镜头
    case "lead": {
      const s = subjectAt(scene, shot.target, time);
      const d = shot.lead ?? 3;
      const h = pair(shot.height, 1.4);
      const fx = Math.sin(s.yaw), fz = Math.cos(s.yaw);   // 主体朝向的单位向量
      pos = [s.foot[0] + fx * d, lerp(h[0], h[1], t01), s.foot[2] + fz * d];
      aim = s.aim;
      break;
    }
    // 环绕：角速度恒定是关键。绕的中心要跟着主体走，不然主体会甩出画
    // （case2 「主体被裁出画」就是绕原点转、而舞者在原点附近游走 ±1.2m）
    case "orbit": {
      const c = resolveTarget(scene, shot.center ?? shot.target, time);
      const r = pair(shot.radius, 6);
      const h = pair(shot.height, 1.6);
      const ang = pair(shot.angle, [90, 270]);
      const a = (lerp(ang[0], ang[1], t01) * Math.PI) / 180;
      const rr = lerp(r[0], r[1], t01);
      pos = [c[0] + Math.cos(a) * rr, lerp(h[0], h[1], t01), c[2] + Math.sin(a) * rr];
      aim = tgt();
      break;
    }
    // 摇臂/升降：从 from 升到 to，全程锁主体。crane down/up 必须用这个，不能靠「画轨迹」
    // （实证：在所见即所得的工具里直接「画」机位路径，画出来的路径会贴地，高度只在静止时生效）
    case "crane": {
      pos = lerp3(shot.from, shot.to, t01);
      aim = tgt();
      break;
    }
    // 航拍：高空路径 + 持续锁定。和 crane 的区别只在尺度和默认俯角
    case "drone": {
      pos = lerp3(shot.from, shot.to, t01);
      aim = tgt();
      break;
    }
    // 垂直俯拍：严格 90° 向下。画面旋转靠转 up 向量，不转场景
    case "topdown": {
      const c = resolveTarget(scene, shot.center ?? shot.target, time);
      const h = pair(shot.height, 14);
      pos = [c[0], lerp(h[0], h[1], t01), c[2]];
      aim = [c[0], c[1] ?? 0, c[2]];
      break;
    }
    // 主观/车载：架在主体身上，朝它的前方看
    case "pov": {
      const s = subjectAt(scene, shot.target, time);
      const eye = shot.eye ?? s.height * 0.94;
      const fx = Math.sin(s.yaw), fz = Math.cos(s.yaw);
      pos = [s.foot[0] + fx * (shot.ahead ?? 0.2), s.foot[1] + eye, s.foot[2] + fz * (shot.ahead ?? 0.2)];
      aim = [pos[0] + fx * 10, pos[1] + (shot.pitch ?? 0) * 10, pos[2] + fz * 10];
      break;
    }
    default:
      throw new Error(`未知 rig: ${rig}`);
  }

  // 手持修饰可以叠在任何 rig 上
  const sh = shakeOffset(time, shot.shake);
  pos = [pos[0] + sh.pos[0], pos[1] + sh.pos[1], pos[2] + sh.pos[2]];
  aim = [aim[0] + sh.aim[0], aim[1] + sh.aim[1], aim[2] + sh.aim[2]];

  const roll = shot.roll ? lerp(shot.roll[0], shot.roll[1], t01) : 0;
  const spin = shot.spin ? lerp(shot.spin[0], shot.spin[1], t01) : 0; // topdown 专用：画面自转
  return { pos, aim, fovY: mmToFovY(mm), mm, roll, spin, shot };
}

// 某一时刻生效的是哪个 shot。相邻 shot 的边界 = 硬切点
export function shotAt(scene, time) {
  const shots = scene.shots || [];
  for (let i = 0; i < shots.length; i++) {
    const [a, b] = shots[i].t;
    if (time >= a && (time < b || (i === shots.length - 1 && time <= b))) return { shot: shots[i], index: i };
  }
  return { shot: shots[shots.length - 1], index: shots.length - 1 };
}

export function solveAt(scene, time) {
  const { shot, index } = shotAt(scene, time);
  return { ...solveShot(scene, shot, time), shotIndex: index };
}

// ── 投影：世界点 → 画面归一化坐标 ─────────────────────────
// 自己写，不引 three，这样 Node 里能零依赖跑体检
function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function cross(a, b) { return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]; }
function dot(a, b) { return a[0]*b[0] + a[1]*b[1] + a[2]*b[2]; }
function norm(a) { const l = Math.hypot(...a) || 1; return [a[0]/l, a[1]/l, a[2]/l]; }

export function project(worldP, cam, aspect) {
  const fwd = norm(sub(cam.aim, cam.pos));           // 相机看向 -Z，这里 fwd 是世界方向
  let up = [0, 1, 0];
  if (Math.abs(dot(fwd, up)) > 0.999) up = [0, 0, 1]; // 垂直俯拍时 up 退化，换一个
  const right = norm(cross(fwd, up));
  const trueUp = cross(right, fwd);
  const d = sub(worldP, cam.pos);
  const z = dot(d, fwd);                              // 相机前方距离
  if (z <= 0.001) return { x: NaN, y: NaN, z, behind: true };
  const tanH = Math.tan((cam.fovY * Math.PI) / 360);
  const y = dot(d, trueUp) / (z * tanH);              // −1..1，1 = 画面上沿
  const x = dot(d, right) / (z * tanH * aspect);      // −1..1，1 = 画面右沿
  return { x, y, z, behind: false };
}
