# 产线 B · 白模

## 白模到底提供什么

**只有三件事：空间关系、运镜路径、时间节奏。** 材质、光线、色彩、造型细节全部交给参考图。

官方演示里的白模长这样：几个白色圆锥当树、一个红色方块当角色、一块板当地面——就这么简陋，成片却是一整个海底世界。

所以做白模不要花时间在建模上。**花时间在运镜和节奏上**，那才是白模唯一无法被参考图替代的价值。

## 为什么用 HTML + Three.js 而不是 Blender

| | HTML + hyperframes | Blender |
|---|---|---|
| 出 12 秒 1080p | **约 9 秒** | 分钟级 |
| 时间轴与 prompt 时间戳对齐 | 确定性渲染，`0-4s` 就是 `0-4s` | 手工对齐，易错 |
| 改一个运镜参数 | 改一行数字重渲 | 重新 K 帧 |
| 版本管理 | 纯文本，git 友好 | 二进制 |

关键在**确定性**：hyperframes 是 single paused timeline + seek-safe，同样的代码永远出同样的帧。白模的时间轴能和 prompt 里的 `0-5s:` 严格对齐，这是白模驱动能成立的前提。

## 主路径：写 scene.json，不写代码

```bash
# SKILL_DIR = 本 skill 所在目录
cd <项目目录>
node "$SKILL_DIR/engine/probe.mjs" scene.json      # ① 渲染前体检，必须 0 个 🔴
node "$SKILL_DIR/engine/build.mjs" scene.json      # ② 生成 index.html
npx hyperframes@0.7.107 lint                                          # ③ 必过
npx hyperframes@0.7.107 render --quality draft --output whitemodel.mp4 # ④ 渲染
ffprobe -v error -show_entries format=duration whitemodel.mp4          # ⑤ 验时长
```

字段规范见 `scene-spec.md`，机位类型见 `camera-rig.md`。`templates/scenes/` 下有三个可直接改的样板。

第一步不能跳。**2026-08-12 那批白模，五个全渲出来了、`lint` 全绿、时长全对——抽帧一看，五个里有五个运镜是坏的**：相机和主体重叠在同一点、绕的中心不是主体的中心导致主体被裁出画、队形半径超出机位覆盖永远拍不全、前景道具落在相机背后。这些坑没有一个是 lint 能报出来的，全都是纯几何问题。`probe.mjs` 就是把这些做成了自动检查。

改了 scene.json 就重跑 ①，它只花几百毫秒。

## 自检：渲完必须抽帧看

体检查得了几何，查不了「好不好看」。渲完抽 6-8 帧拼一张图，覆盖每个镜头的首尾：

```bash
mkdir -p frames && i=1
for t in 0.5 2 3.9 4.2 6 7.4 8.8 11.5; do
  ffmpeg -y -ss $t -i whitemodel.mp4 -frames:v 1 -vf "scale=640:-2" -q:v 3 "frames/$(printf %02d $i)_t${t}s.jpg" -loglevel error
  i=$((i+1))
done
ffmpeg -y -pattern_type glob -i "frames/*.jpg" -vf "scale=640:360,tile=4x2" -frames:v 1 -q:v 3 sheet.jpg -loglevel error
```

⚠️ 帧文件名要**零填充编号**，否则 glob 按字典序排会变成 `t0.5 → t11.5 → t2`，拼图顺序全乱。
⚠️ 不少 ffmpeg 构建不带 `drawtext` 滤镜（编译时没有 libfreetype），在抽帧命令里加时间戳水印会直接报 `No such filter`。**把时间写进文件名里**，不依赖水印。

看拼图时专门确认这几样：

- **主体朝向对不对**。人形有鼻子和胸标，放大就能看出正反面。跟拍段应该看到背面，前置倒退段应该看到正面
- **每个镜头的景别是不是设计的那个**
- **切点前后有没有真的换机位**
- **有没有拍到「地面洞」**：贴地机位在悬空/台面场景里，地板会投影成一条接近地平线的细线，线以下是虚空

## 首帧未结算是渲染管线的系统性 bug

**任何一条重录/重渲之后，f0 都要重验。** 判据：

```
f0→f1 的帧间差 ÷ f1→f2 的帧间差
```

正常约等于 1。实测坏掉的两条分别是 6.03（首帧里根本没有人）和 11.00（主体位移 609px）。

修法是成片层帧手术，**不用重渲**：丢掉首帧、克隆末帧补上，帧数和时长都不变。

```bash
ffmpeg -y -i whitemodel.mp4 -vf "select='gte(n,1)',tpad=stop_mode=clone:stop_duration=0.034,setpts=N/FRAME_RATE/TB" -an fixed.mp4
```

⚠️ 这个操作**必须做成幂等的**：先量比值，小于 2 就直接复制不做手术。2026-08-16 有一次对两条片子一起跑了这个命令，其中一条的首帧本来是好的，结果内容整体平移了一帧。

## 手写路线（逃生舱）

引擎覆盖不了的特殊运镜（比如相机沿一条自定义曲线穿过一个不断变形的结构），用 `templates/whitemodel-base.html` 手写。

手写时守住三条工程约束，和引擎一样：

1. 根元素必须有 `data-duration="<秒>"`。three 适配器不做时长推断，缺了直接报「Composition has zero duration」
2. 根元素必须有 `data-no-timeline`。否则渲染器轮询 GSAP timeline，白等 45 秒
3. 运镜必须是时间的纯函数，只从 `hf-seek` 渲染。用 `requestAnimationFrame` 或 `Math.random()` 都会毁掉确定性

`npx hyperframes check` 会报 `sweep_static`，**这是误报**——它检测 DOM 元素的几何变化，而白模的动画全在 canvas 像素内部。以渲出来的 mp4 为准，别为了让 check 变绿去加无意义的 DOM 动画。

手写路线拿不到 `probe.mjs` 的体检和 `make_prompt.mjs` 的运镜事实表，**时间戳要自己回去读代码里的运镜常数**——读代码，不是读设计稿。2026-08-14 有两条 prompt 就是照设计稿写的，一条承诺了白模里没有的环绕半径，一条承诺了会把队形拍残的机位高度。

## 白模做好之后

把 mp4 挂给 Seedance 当 `@白模1`，跑：

```bash
node "$SKILL_DIR/engine/make_prompt.mjs" scene.json > prompt.md
```

它输出两样：一张从实际几何量出来的**运镜事实表**（景别、焦段、距离、机位高度、俯角、环绕角度），和一份按官方四段式排好的 **prompt 草稿**（含待填占位）。

关键是那句分离声明：**运镜/节奏/景别/轨迹/调度从白模来，材质/光线/色彩/造型从参考图来**。
