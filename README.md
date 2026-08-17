<div align="center">

# Seedance.skill · 白模驱动的 AI 视频工作台

**Control AI video with clay renders — and a prompt that can't drift from them.**<br>
**用白模控制 AI 视频运镜，并让提示词与白模出自同一份数据。**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Agent Skills](https://img.shields.io/badge/Agent%20Skills-Standard-green)](https://agentskills.io)
[![Multi-Runtime](https://img.shields.io/badge/Runtime-Claude%20Code%20·%20Codex%20·%20Cursor%20·%20OpenClaw-blueviolet)](#安装)

> 白模只提供三件事：空间关系、运镜路径、时间节奏。<br>
> 材质、光线、色彩、造型，全部交给参考图。

[解决什么](#它解决什么) · [四条产线](#四条产线) · [三分钟上手](#三分钟上手) · [安装](#安装) · [目录](#目录)

</div>

---

## 它解决什么

用参考视频（白模）控制 AI 视频生成，是目前精确控制运镜和空间关系最有效的办法——官方演示里几个白圆锥当树、一个红方块当角色，成片是完整的海底世界。但这条路上有三个反复出现的坑：

**1. 需求没澄清就开工。** 时长、画幅、要不要切镜没定下来就建白模，返工的成本是澄清成本的几十倍。

**2. 白模做出来是坏的，但看不出来。** 手写三维代码，lint 全绿、时长全对，抽帧一看运镜全错——相机和主体重叠在同一点、绕圈的中心不是主体所在的位置导致人被裁出画、队形半径超出机位覆盖永远拍不全。这些是纯几何问题，没有工具会报。

**3. 提示词和白模对不上。** 提示词照设计稿写，白模照代码渲，两边分头演化，最后 prompt 承诺了白模里根本没有的运镜。

对应的三个解法：

| 坑 | 解法 |
|---|---|
| 需求没澄清 | `references/intake.md` —— 只问三件必须问的（多长、发在哪、一镜到底还是切镜头），其余先推断再摊给用户否决，摊完先给一张镜头表让他改字 |
| 白模坏了看不出来 | `engine/probe.mjs` —— 渲染前纯数学扫一遍时间轴：主体出画、主体太小会被模型丢掉、死时间、缓动瘫尾、相机钻进墙里、队形超框、画幅不一致，全部在渲染前报出来 |
| 提示词对不上 | `engine/make_prompt.mjs` —— 从白模的实际几何量出景别、机位距离、俯角、环绕角度，用量出来的数字写提示词，而不是用意图；同时按六要素配方产出配套的参考图提示词 |

## 四条产线

| 产线 | 产出 | 什么时候用 |
|---|---|---|
| **A · 提示词** | 符合官方规范的 T2V / R2V 提示词 | 任何时候，这是主线 |
| **B · 白模** | scene.json 引擎渲出的白模视频 | 要精确控制运镜、空间关系、时间节奏、镜头切换 |
| **C · 参考图** | 影视级参考图的六要素配方 | 要锁材质、光线、造型 |
| **D · 照片反解** | 从一张照片反解出白模 | 用户给了照片，要让这个场景动起来 |

产线 D 有个别处没有的好处：**那张照片同时是空间来源和材质参考**，两边天然一致，不用担心参考图的构图把镜头拽偏。

十种机位类型（固定、摇摄、变焦、轨道推拉、背后跟随、前置倒退跟拍、环绕、摇臂升降、航拍、垂直俯拍、主观视角）都是时间的纯函数，写在 `engine/solver.mjs` 里，渲染器和体检共用同一份——**体检说的和渲出来的是同一件事**。

## 三分钟上手

```bash
export SKILL_DIR=<本 skill 所在目录>
mkdir my-shot && cd my-shot
cp "$SKILL_DIR/templates/scenes/多机位切换.json" scene.json

node "$SKILL_DIR/engine/probe.mjs" scene.json     # 体检，必须 0 个 🔴
node "$SKILL_DIR/engine/build.mjs" scene.json     # 生成 index.html
npx hyperframes render --quality draft --output whitemodel.mp4
node "$SKILL_DIR/engine/frames.mjs" whitemodel.mp4 scene.json   # 抽帧自检
node "$SKILL_DIR/engine/make_prompt.mjs" scene.json > prompt.md
```

12 秒 1080p 白模渲染约 9 秒。然后把 `whitemodel.mp4` 挂给 Seedance 当 `@白模1`，用 `prompt.md` 里的草稿填上叙事内容。

**渲完一定要抽帧看。** 体检查得了几何，查不了好不好看——这一步没有替代品。`frames.mjs` 会按镜头切点和段内均分自动挑帧（切点前后正是最容易坏的地方，均匀抽会跳过它）。反过来也成立：抽帧看过不等于全片对，坏的往往在你没挑的那一段——所以先让 `probe.mjs` 报出可疑区间，再去抽那几帧。

## 安装

```bash
# Claude Code（推荐放到全局 skills 目录）
git clone https://github.com/alchaincyf/seedance-skill.git ~/.claude/skills/seedance-skill
```

兼容 Claude Code / Codex / Cursor / OpenClaw 等支持 Agent Skills 标准的运行时。安装后，当你说「我想拍一个……」「做个白模」「写 Seedance 提示词」「这张照片让它动起来」时自动触发。

### 依赖

- Node 18+
- ffmpeg（抽帧自检用；不需要 `drawtext` 滤镜）
- Python 3 + opencv-python（只有照片反解的读图辅助用得上，其余流程不需要）
- `npx hyperframes` 会自动下载，不用预装

## 几条拿实测换来的经验

| 事实 | 怎么发现的 |
|---|---|
| 主体占画高 < 10% 且该段位移 < 0.5 身高 → 模型会把它丢掉 | 成片最后 4 秒人整个消失，只剩空祭坛，加强提示词也救不回来 |
| 白模能钉死位置、速度、时机、空间关系，**钉不死违反常识的姿态** | 人物朝向反了 180° 的白模，成片里被模型悄悄纠正成正着走了 |
| 白模主体的颜色会渗进成片 | 蓝色的人群白模 → 成片出现「蓝面罩人群」 |
| 硬切点会被精确执行，误差 < 1 帧，且跨帧率成立 | 白模 30fps 切在 3.967/8.467/11.967s，成片 24fps 切在 3.958/8.458/12.000s |
| 白模人物没有脸，正反面一个样，朝向错了肉眼看不出来 | 三条片子全员倒着走，熬一夜跑三轮审查都没发现，最后靠查数值 |

最后一条现在被工具堵死了：朝向由代码从路径切线算，不给人填错的机会；人形还带一个鼻子和胸标，抽帧放大就能肉眼验正反面。

## 目录

```
SKILL.md                        agent 的入口：澄清流程、四条产线、七条铁律
references/
  intake.md                     需求澄清：问什么、推断什么、怎么摊假设
  scene-spec.md                 scene.json 完整字段规范
  camera-rig.md                 十种机位类型、景别距离表、多机位切换
  whitemodel.md                 白模流程、自检、首帧 bug、手写逃生舱
  photo-to-whitemodel.md        照片反解产线
  prompt-spec.md                提示词规范 + 官方样本 + 三个模板
  reference-image.md            参考图六要素配方
  model-differences.md          四家官方公式对比与三处冲突
engine/
  solver.mjs                    机位求解，纯数学零依赖（渲染器和体检共用同一份）
  renderer.html                 通用渲染器模板
  build.mjs                     scene.json → 可渲染的 index.html
  probe.mjs                     渲染前几何体检
  preview.mjs                   单帧预览（对构图用，可一次多个时刻，附带机位事实）
  frames.mjs                    从渲好的白模抽帧自检
  make_prompt.mjs               运镜事实表 + 提示词草稿 + 参考图提示词
  photo_grid.py                 照片叠网格读数
templates/
  scenes/                       三个可直接改的样板
  whitemodel-base.html          手写路线的起手模板
docs/index.html                 给人看的说明页：这套规则凭什么这么定
```

## 方法论出处

规则全部来自各家模型团队的**官方**发布博客与官方演示物料（配着成片的 prompt 原文），不是二手转述。四家官方指南之间有三处真实冲突，取舍写在 `references/model-differences.md` 里——这套 skill 服务的是 Seedance 生成，口径冲突时以 Seedance 官方为准。

⚠️ 模型迭代会让部分规则失效，尤其是「复杂物理做不好」那几条能力边界。新版本发布时要重测。

---

**English**

An AI-agent workbench for Seedance 2.5 video generation. Its core idea: the clay-render reference video and the text prompt are generated from **one** `scene.json`, so they can never drift apart.

Three tools do the work. `probe.mjs` catches geometry defects *before* rendering — subject out of frame, subject too small for the model to keep, dead time, camera stuck inside a wall, formation wider than the lens can cover. `build.mjs` compiles the scene into a deterministic Three.js composition (roughly 9 seconds for 12s of 1080p). `make_prompt.mjs` measures the actual geometry — shot size, camera distance, tilt, orbit sweep — and writes the prompt draft from those numbers rather than from intent, along with a matching reference-image prompt. `frames.mjs` pulls self-check frames from the rendered file, sampling around cut points where things break most often.

A fourth pipeline reconstructs a clay-render scene from a user-supplied photo, so the same image serves as both the spatial source and the texture reference.

Requires Node 18+, ffmpeg, and optionally Python 3 with opencv-python. See `SKILL.md` for the agent-facing entry point.

---

<div align="center">

MIT License · 关注公众号「花叔」获取更多 AI 实践

</div>
