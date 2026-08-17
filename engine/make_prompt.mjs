#!/usr/bin/env node
// scene.json → ①运镜事实表 ②Seedance 2.5 提示词草稿
//
//   node make_prompt.mjs scene.json > prompt.md
//
// 存在的理由：2026-08-14 有两条 prompt 是照着设计稿写的，白模实际渲出来不是那样——
// 一条承诺「环绕收到 2 米」（实际只到 3.4m），一条承诺「降回 12 米」（真降下去会把队形拍残）。
// prompt 里的每个数字都必须是从白模量出来的，不是想出来的。这个脚本负责量。

import { readFileSync } from "node:fs";
import { solveAt, subjectAt, project } from "./solver.mjs";

const file = process.argv[2];
if (!file) { console.error("用法: node make_prompt.mjs scene.json"); process.exit(2); }
const scene = JSON.parse(readFileSync(file, "utf8"));
const M = scene.meta;
const FPS = M.fps ?? 30;
const [aw, ah] = (M.aspect ?? "16:9").split(":").map(Number);
const ASPECT = aw / ah;
const HERO = M.hero ?? scene.subjects?.[0]?.id;

// 景别：按主体在画面里的实际大小判定，不是拍脑袋写的
function shotSize(frac) {
  if (frac >= 1.3) return "特写";
  if (frac >= 1.0) return "近景";
  if (frac >= 0.7) return "中近景";
  if (frac >= 0.45) return "中景";
  if (frac >= 0.2) return "全景";
  if (frac >= 0.08) return "远景";
  return "大远景";
}
const lensWord = (mm) =>
  mm <= 20 ? "超广角" : mm <= 30 ? "广角" : mm <= 45 ? "标准" : mm <= 70 ? "中长焦" : mm <= 105 ? "长焦" : "超长焦";

function measure(time) {
  const cam = solveAt(scene, time);
  const hero = HERO ? subjectAt(scene, HERO, time) : null;
  let dist = null, frac = 0, pitch = null;
  if (hero) {
    dist = Math.hypot(hero.aim[0] - cam.pos[0], hero.aim[1] - cam.pos[1], hero.aim[2] - cam.pos[2]);
    const flat = Math.hypot(hero.aim[0] - cam.pos[0], hero.aim[2] - cam.pos[2]);
    pitch = (Math.atan2(cam.pos[1] - hero.aim[1], flat) * 180) / Math.PI;  // 正=俯拍
    const w = hero.height * 0.26;
    const cs = [];
    for (const dx of [-w / 2, w / 2]) for (const dz of [-w / 2, w / 2]) for (const dy of [0, hero.height])
      cs.push(project([hero.foot[0] + dx, hero.foot[1] + dy, hero.foot[2] + dz], cam, ASPECT));
    const vis = cs.filter((c) => !c.behind);
    if (vis.length) {
      const dy = Math.max(...vis.map((c) => c.y)) - Math.min(...vis.map((c) => c.y));
      const dxs = Math.max(...vis.map((c) => c.x)) - Math.min(...vis.map((c) => c.x));
      frac = Math.max(dy, dxs) / 2;
    }
  }
  return { cam, hero, dist, frac, pitch, mm: cam.mm, height: cam.pos[1] };
}

// rig → 中文摄影语言。数字全部来自 a/b 两次实测，不是模板里的固定话术
function describe(s, a, b) {
  const d0 = a.dist, d1 = b.dist;
  const near = (x) => (x == null ? "?" : x.toFixed(1));
  const dh = b.height - a.height;
  const parts = [];
  switch (s.rig) {
    case "static":
      parts.push(`机位固定不动（离地 ${near(a.height)} 米），构图不变，主体在画面内运动`);
      break;
    case "pan":
      parts.push(`机位不动，镜头从一侧摇向主体，摇摄过程中主体从画外进入画内`);
      break;
    case "zoom":
      parts.push(`机位不动，焦距从 ${a.mm.toFixed(0)}mm ${b.mm > a.mm ? "推到" : "拉到"} ${b.mm.toFixed(0)}mm（原地变焦，不是机位前推，透视关系保持不变）`);
      break;
    case "dolly":
      parts.push(`镜头沿直线${d1 < d0 ? "向主体推进" : "后撤拉开"}，与主体距离从 ${near(d0)} 米变为 ${near(d1)} 米，焦距固定 ${a.mm.toFixed(0)}mm（是机位移动不是变焦）`);
      break;
    case "follow": {
      parts.push(`镜头在主体身后约 ${near(d0)} 米处贴身跟随，与主体同速前进，全程保持恒定距离`);
      if (Math.abs(d1 - d0) > 0.6) parts.push(`跟随距离从 ${near(d0)} 米${d1 > d0 ? "缓慢拉开到" : "缩短到"} ${near(d1)} 米`);
      if (Math.abs(dh) > 0.3) parts.push(`机位从离地 ${near(a.height)} 米${dh > 0 ? "抬升到" : "降到"} ${near(b.height)} 米`);
      break;
    }
    case "lead":
      parts.push(`镜头在主体前方约 ${near(d0)} 米处倒退跟拍，主体正面朝向镜头`);
      break;
    case "orbit": {
      const ang = Array.isArray(s.angle) ? s.angle : [90, 270];
      const sweep = Math.abs(ang[1] - ang[0]);
      const dir = ang[1] > ang[0] ? "顺时针" : "逆时针";   // 俯视视角
      parts.push(`镜头以 ${near(d0)} 米半径绕主体${dir}环绕 ${sweep.toFixed(0)} 度，角速度恒定`);
      if (Math.abs(d1 - d0) > 0.5) parts.push(`环绕半径同时${d1 < d0 ? "收到" : "放到"} ${near(d1)} 米`);
      if (Math.abs(dh) > 0.4) parts.push(`机位从 ${near(a.height)} 米${dh > 0 ? "升到" : "降到"} ${near(b.height)} 米`);
      break;
    }
    case "crane":
      parts.push(`镜头从离地 ${near(a.height)} 米${dh > 0 ? "升到" : "降到"} ${near(b.height)} 米，俯角从 ${a.pitch.toFixed(0)}° 变为 ${b.pitch.toFixed(0)}°，全程锁定主体`);
      break;
    case "drone":
      parts.push(`高空镜头从 ${near(a.height)} 米${dh > 0 ? "继续爬升到" : "下降到"} ${near(b.height)} 米，同时${d1 > d0 ? "拉远" : "接近"}，主体始终在画面中心`);
      break;
    case "topdown": {
      parts.push(`严格垂直俯瞰（90° 正上方），机位从 ${near(a.height)} 米${dh > 0 ? "升到" : "降到"} ${near(b.height)} 米`);
      if (s.spin) parts.push(`画面绕中心${s.spin[1] > s.spin[0] ? "" : "反向"}自转 ${Math.abs(s.spin[1] - s.spin[0])} 度`);
      break;
    }
    case "pov":
      parts.push(`主观视角，镜头架在主体视线高度随其一同前进`);
      break;
  }
  if (s.shake) parts.push("带轻微手持晃动");
  if (s.roll) parts.push(`画面横滚 ${Math.abs(s.roll[1] - s.roll[0])} 度`);
  return parts.join("，");
}

// ── 量 ────────────────────────────────────────────────────
const shots = scene.shots ?? [];
const facts = shots.map((s, i) => {
  const eps = 1 / FPS;
  const a = measure(s.t[0]);
  const b = measure(Math.max(s.t[0], s.t[1] - eps));
  const hero0 = subjectAt(scene, HERO, s.t[0]), hero1 = subjectAt(scene, HERO, s.t[1]);
  const move = hero0 && hero1 ? Math.hypot(hero1.foot[0] - hero0.foot[0], hero1.foot[2] - hero0.foot[2]) : 0;
  return {
    i, s, a, b,
    sizeA: shotSize(a.frac), sizeB: shotSize(b.frac),
    desc: describe(s, a, b),
    move,
    action: s.action ?? null,
  };
});

const cuts = shots.slice(1).map((s) => s.t[0]);
const oneTake = cuts.length === 0;

// ── 输出 ──────────────────────────────────────────────────
const L = [];
L.push(`# ${M.name ?? "白模"} · 运镜事实表与提示词草稿`);
L.push("");
L.push(`> 表里的每个数字都是从 scene.json 的实际几何量出来的。**改白模就重跑这个脚本，别手改数字。**`);
L.push("");
L.push(`全片 ${M.duration} 秒 · ${M.aspect ?? "16:9"} · ${oneTake ? "一镜到底" : `${shots.length} 个机位，${cuts.length} 次硬切（${cuts.map((c) => c.toFixed(3) + "s").join(" / ")}）`}`);
L.push("");
L.push("## 一、运镜事实表");
L.push("");
L.push("| # | 时间 | 景别 | 焦距 | 与主体距离 | 机位高度 | 俯角 | 运镜 |");
L.push("|---|---|---|---|---|---|---|---|");
facts.forEach((f) => {
  const size = f.sizeA === f.sizeB ? f.sizeA : `${f.sizeA}→${f.sizeB}`;
  const mm = Math.abs(f.b.mm - f.a.mm) > 1 ? `${f.a.mm.toFixed(0)}→${f.b.mm.toFixed(0)}mm` : `${f.a.mm.toFixed(0)}mm（${lensWord(f.a.mm)}）`;
  const dist = f.a.dist == null ? "—" : (Math.abs(f.b.dist - f.a.dist) > 0.4 ? `${f.a.dist.toFixed(1)}→${f.b.dist.toFixed(1)}m` : `${f.a.dist.toFixed(1)}m`);
  const hgt = Math.abs(f.b.height - f.a.height) > 0.3 ? `${f.a.height.toFixed(1)}→${f.b.height.toFixed(1)}m` : `${f.a.height.toFixed(1)}m`;
  const pit = f.a.pitch == null ? "—" : (Math.abs(f.b.pitch - f.a.pitch) > 3 ? `${f.a.pitch.toFixed(0)}°→${f.b.pitch.toFixed(0)}°` : `${f.a.pitch.toFixed(0)}°`);
  L.push(`| ${f.i + 1} | ${f.s.t[0]}–${f.s.t[1]}s | ${size} | ${mm} | ${dist} | ${hgt} | ${pit} | ${f.desc} |`);
});
L.push("");
const totalMove = facts.reduce((a, f) => a + f.move, 0);
L.push(`主体全程位移 ${totalMove.toFixed(1)} 米。`);
// 人自己跑最快也就 4 m/s 上下。超过这个数说明主体站在一个移动的东西上（车顶、船、传送带），
// 而运镜事实表只量得到相机与主体的相对关系，平台本身在动这件事会整个丢掉——
// prompt 里不交代，AI 就会让人在原地打斗、背景纹丝不动
if (totalMove / M.duration > 4.5) {
  L.push("");
  L.push(`⚠️ 主体平均速度 ${(totalMove / M.duration).toFixed(1)} m/s，超出人自身能跑的范围 —— 这是个**移动平台**场景（车顶／船／传送带）。`
    + `事实表只量得到相机与主体的相对关系，「平台本身在动」这件事量不出来，prompt 里必须自己交代：`
    + `平台在往哪个方向、以多快速度移动，以及沿途什么东西在向后掠过。漏了这句，AI 会让主体在原地动作、背景纹丝不动。`);
}
L.push("");

L.push("## 二、提示词草稿");
L.push("");
L.push("```");
L.push(`成片严格保持 ${M.duration} 秒，${M.aspect ?? "16:9"}，${oneTake ? "单镜头一镜到底，全程无剪切" : `${shots.length} 个机位 ${cuts.length} 次硬切，切点与 @白模1 完全对齐`}。`);
L.push("");
L.push("以 @白模1 为空间与运镜骨架。");
L.push(`参考 @白模1 的：${factsToInheritList(facts, oneTake)}；`);
L.push("不从 @白模1 继承：材质、光线、色彩、几何体的简陋造型、声音。");
L.push(`@白模1 中的红色人形对应本片中的${M.heroRole ?? "[主角是谁：一句话外形描述]"}${M.propMap ? "，" + M.propMap : "，[白灰色几何体分别对应什么]"}。`);
L.push("");
L.push("参考 @图片1 的：材质质感、光比、色温、景深关系、[这个场景特有的视觉元素]；");
L.push("不从 @图片1 继承：构图、机位、任何物件的画面位置。");
L.push("");
L.push(`场景：${M.sceneDesc ?? "[一段场景定位：地点、时代、天气、光线来源、有没有别人。用名词和技术词，不要形容词]"}`);
L.push("");
facts.forEach((f) => {
  const cut = f.i > 0 && !oneTake ? `${f.s.t[0]}s 硬切。` : "";
  L.push(`${cut}${f.s.t[0]}-${f.s.t[1]}s：${f.desc}。${f.action ?? "[主体在这一段做什么——具体动作，不是状态]"}`);
});
L.push("");
L.push(`【保持一致】保持${M.heroRole ? `${M.heroRole}的` : "[主体的]"}服装、体型与身份全片稳定；[场景里不该变的东西]不变形不消失；${oneTake ? "全程无剪切" : "硬切干脆利落，切点之外全程无剪切"}。`);
L.push(`音效：${M.sfx ?? "<[主体动作发出的声音]>，<[环境底噪]>"}。${M.music ?? "不要配乐。"}`);
L.push(`画质：${M.style ?? "[真实片名锚点] + [器材规格，如 ARRI Alexa / Kodak Vision3]"}，无数字修饰，不做慢动作。`);
L.push(`避免[材质错误，如白模塑料感]，不做[叙事品类错误，如教学拆解]，不出现[图形元素错误，如箭头标签]。`);
L.push("```");
L.push("");
// 参考图提示词默认就出，哪怕这次不打算用参考图。
// 理由：上面那段 prompt 里已经写着「参考 @图片1 的材质质感」——不给出这张图怎么来，
// 那一行就是悬空的。而且写这段会逼着把「这个场景到底长什么样」说清楚，这件事迟早要做
L.push("## 三、参考图提示词（产线 C）");
L.push("");
L.push("这张图的职责是**锁材质与光线，不锁构图**——构图和机位归白模管。所以下面这段刻意不写机位、景别和任何物件的画面位置；十几张参考图如果各自都带构图倾向，会把镜头拽向十几个方向。");
L.push("");
L.push(`尺寸出 **${refSize(M.aspect ?? "16:9")}**。长边别低于这个档位——参考图分辨率不够会把成片质感一起拉下来。`);
L.push("");
L.push("```");
L.push(`${M.style ?? "[真实片名锚点，如《敦刻尔克》《银翼杀手2049》] + [器材规格，如 IMAX 65mm、ARRI Alexa 65、Kodak Vision3 500T]"}。`);
L.push(`${M.sceneDesc ?? "[场景定位：地点、时代、天气、光线来源、有没有别人。用名词和技术词，不要形容词]"}。`);
// meta.refImage 的四个字段填了就用，不填留方括号占位——占位本身也是配方提示
const R = M.refImage ?? {};
L.push(`画面里${M.heroRole ?? "[主体外形：一句话，材质和服装写具体]"}，${R.scale ?? "[尺度参照物——让观众读出这东西有多大的那个东西]"}。`);
L.push(`${R.atmosphere ?? "[大气介质：体积光柱／丁达尔光锥／悬浮尘埃／雨雾／热浪扰动。空气必须是可见的，这是大片感的核心]"}。`);
L.push(`${R.lighting ?? "[戏剧性布光：低角度侧逆光／大光比／轮廓光，主光从哪个方向来，暖冷对比。图库照片才是均匀曝光]"}。`);
L.push(`${R.imperfection ?? "[实拍瑕疵：划痕／油渍／锈迹／镜头眩光]"}。`);
L.push("实拍照片质感不是CG渲染不是概念插画，Kodak Vision3 胶片颗粒，高动态范围，暗部深沉保留细节，高光柔和滚降不过曝，轻微暗角。");
L.push(`画面内容完整填满整个${M.aspect ?? "16:9"}画幅，不要黑边，不要信箱式黑框，不要边框装饰`);
L.push("```");
L.push("");
L.push("出图后统一裁边（即便写了「不要边框」仍可能残留一圈细描边）：");
L.push("");
L.push("```bash");
L.push(`ffmpeg -y -i 参考图.png -vf "crop=iw-72:ih-72:36:36,scale=${refSize(M.aspect ?? "16:9").replace("×", ":")}" 参考图-已裁边.png`);
L.push("```");
L.push("");
L.push("六要素自检（缺一件就掉档）：真实片名锚点 · 器材规格 · 大气介质 · 尺度参照物 · 戏剧性布光 · 实拍瑕疵。");
L.push("");
L.push("两条硬避坑：**不要写「变形宽银幕」/「anamorphic」**（模型会把信箱式黑边一起画进画面，Seedance 会连边框一起继承）；**必须明写「实拍照片质感不是CG渲染不是概念插画」**（否则出来的是概念艺术图，漂亮但假，色调容易塌成单一冷蓝）。");
L.push("");

L.push("## 四、发出去之前逐条过一遍");
L.push("");
L.push("- [ ] 方括号占位全部填掉了（一个都不能留）");
L.push("- [ ] 每个参考素材都写了「继承什么」和「不继承什么」——漏掉「不继承」，模型会把参考里的一切都端过来");
L.push("- [ ] prompt 里的朝向描述和白模一致（抽帧看主体的鼻子和胸标朝哪，别靠记忆）");
L.push("- [ ] 每一段都同时交代了「镜头怎么动」和「主体做什么」，缺一样模型就自由发挥另一样");
L.push("- [ ] 负面约束具体到「排除哪个错误品类」，没写「不要低质量」这种废话");
L.push("- [ ] 风格锚点用的是真实片名和器材型号，不是「电影感」「高级」");
if (!oneTake) L.push("- [ ] 切点时间与事实表一致（成片帧率可能与白模不同，切点仍然会对齐，实测误差 < 1 帧）");
L.push("");
console.log(L.join("\n"));

// 参考图尺寸：短边压在 1440，够喂 Seedance 又不至于让后端拒绝高分辨率档位
function refSize(aspect) {
  return { "16:9": "2560×1440", "9:16": "1440×2560", "1:1": "2048×2048", "4:3": "2048×1536", "21:9": "2560×1097" }[aspect] ?? "2560×1440";
}

function factsToInheritList(facts, oneTake) {
  const items = new Set(["机位高度与运动路径", "与主体的距离变化", "主体的运动轨迹与时间节奏"]);
  facts.forEach((f) => {
    if (f.s.rig === "orbit") items.add("环绕的角速度与累计转角");
    if (f.s.rig === "crane" || f.s.rig === "drone") items.add("抬升的时机与幅度");
    if (f.s.rig === "zoom") items.add("焦距变化的时机");
    if (f.s.rig === "topdown") items.add("垂直俯瞰的角度与画面自转");
    if (f.s.rig === "follow" || f.s.rig === "lead") items.add("跟随的速度与滞后距离");
  });
  if (!oneTake) items.add("硬切的时间点与各机位的景别关系");
  return [...items].join("、");
}
