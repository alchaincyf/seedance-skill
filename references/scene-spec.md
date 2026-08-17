# scene.json 规范

白模的唯一真源。一份 `scene.json` 同时喂三个工具：

- `probe.mjs` 拿它做渲染前体检
- `build.mjs` 拿它生成可渲染的 `index.html`
- `make_prompt.mjs` 拿它量出运镜事实、生成提示词

**因为是同一份，prompt 里的时间戳和数字不可能和白模对不上。** 这是它存在的全部理由：2026-08-14 有两条 prompt 照着设计稿写，一条承诺「环绕收到 2 米」（白模实际 3.4m），一条承诺「降回 12 米」（真降下去会把队形拍残）。手写两份就必然会分叉。

## 骨架

```json
{
  "meta":     { "duration": 12, "fps": 30, "aspect": "16:9", "hero": "hero" },
  "world":    { "ground": {}, "light": {}, "props": [] },
  "subjects": [ { "id": "hero", "path": [] } ],
  "shots":    [ { "t": [0, 12], "rig": "follow" } ]
}
```

## meta

| 字段 | 必填 | 说明 |
|---|---|---|
| `duration` | ✅ | 秒。`duration × fps` 必须是整数 |
| `fps` | | 默认 30。白模用 30，成片是 24，切点照样对得上 |
| `aspect` | | `16:9`（默认）/ `9:16` / `1:1` / `4:3` / `21:9` |
| `width` `height` | | 通常别填，由 `aspect` 自动推。填了但与 `aspect` 不符会直接报错——两边不一致会导致体检说主体在画内、渲出来却被切掉 |
| `hero` | | 体检盯着谁。默认第一个 subject |
| `seed` | | 伪随机种子，`scatter` 布局用。同一个 seed 永远出同一个排布 |
| `formationRadius` | | 队形半径（米）。填了之后 `topdown` 镜头会自动检查队形装不装得下 |
| `name` | | 报告标题用 |

叙事字段（可选，填了 `make_prompt.mjs` 会直接写进 prompt，不填就留成方括号占位）：

| 字段 | 例子 |
|---|---|
| `heroRole` | `"穿黑色风衣的男人"` |
| `propMap` | `"白灰色长方块对应两侧的居民楼，细柱对应路灯"` |
| `sceneDesc` | `"雨夜的老城区窄巷，霓虹招牌在湿地面上反光，两侧是六层居民楼"` |
| `style` | `"《银翼杀手2049》的体积光，ARRI Alexa，Kodak Vision3 颗粒"` |
| `music` | `"不要配乐。"` 或 `"音乐：(低频鼓点，随镜头拉升在最后四秒加入高频)"` |

## world

```json
"world": {
  "background": "0x1a1c20",
  "fog": [16, 80],
  "ground": { "type": "plane", "size": 400, "color": "ground" },
  "light":  { "pos": [-16, 24, 12], "intensity": 2.2, "ambient": 0.85, "shadowRange": 50 },
  "props":  [ ... ]
}
```

- `background` 写成 `"0x1a1c20"` 或 `"#1a1c20"` 都行。⚠️ JSON 里没有十六进制字面量，**这个值必须是字符串**，直接丢数字以外的写法给 three 会静默变成白色，连雾一起发白
- `fog: [近, 远]` 强化纵深，也帮模型理解远近层次。远处超过第二个数就完全是背景色
- `ground.type`：`plane` 无限地面 / `disc` 悬空圆盘（舞台、竞技场）/ `none` 不要地面
- `light.groundColor` 默认已经调亮过了。**别再调暗**：朝下的面（天花板底、桥面底、屋檐）会渲成死黑一片，室内场景直接吃掉半个画面
- `light.shadowRange` 要盖住主要活动范围，太小会看到阴影边界

## props：静态几何体

几何体不是模型，是**占位符**。选形状的唯一标准是：轮廓能不能让模型认出这是什么类别的东西。官方演示里几个白圆锥当树、一个红方块当角色，成片是一整个海底世界。

```json
{ "shape": "box", "size": [7, 16, 9], "pos": [-8.5, 0, 12], "color": "env" }
```

| shape | 尺寸字段 | 常用于 |
|---|---|---|
| `box` | `size: [x, y, z]` | 建筑、车辆、家具、墙、道路 |
| `cone` | `r`, `h` | 树、山峰、尖塔、帐篷 |
| `cylinder` | `r`, `h`,（`r2` 上底半径） | 柱子、树干、罐体、围观人群 |
| `sphere` | `r` | 球体、灯、星体 |
| `torus` | `r`, `tube` | 拱门、环形轨道 |
| `plane` | `size: [x, y]` | 水面、贴地图案 |
| `human` | `height`,（`skirt`） | 人 |

**`pos` 永远是贴地点，`y: 0` 就是放在地上。** 各种几何体的原点位置不一样，这个差异在渲染器里抹平了，写的时候不用记。

颜色只有六个语义值，**不要自己调色**：

| 值 | 用途 |
|---|---|
| `hero` | 主角。全片只给一个饱和色，让模型认出「谁是主角」 |
| `second` | 第二主体（对手/搭档）。用得越少越好 |
| `crowd` | 人群 |
| `env` | 环境（浅） |
| `dark` | 环境（深），拉开层次 |
| `ground` | 地面 |

⚠️ 主体的颜色**会渗进成片**。实证：某条片子的人群用了蓝色白模，成片里出现了「蓝面罩人群」，看起来像风格化处理，实际是白模颜色泄漏。所以除主角外一律用灰白系。

### layout：不要手写 90 个圆锥

```json
{ "shape": "cylinder", "r": 0.4, "h": 1.8, "color": "crowd",
  "layout": { "type": "ring", "count": 10, "radius": 4.2, "jitter": 0.2 } }
```

| type | 参数 | 用于 |
|---|---|---|
| `ring` | `count`, `radius`, `from`, `to`, `jitter` | 围观圈层、圆形座次 |
| `grid` | `count`, `cols`, `spacing: [x, z]`, `jitter` | 座位、车列、方阵 |
| `line` | `count`, `from: [x,y,z]`, `to`, `jitter` | 路灯、门洞、沿街建筑 |
| `scatter` | `count`, `area: [w, d]`, `corridor` | 树林、废墟。`corridor` 会在中间留出通道 |

`scatter` 用的是确定性伪随机（seed 来自 `meta.seed`），同一个 seed 永远同一个排布。

## subjects：会动的主体

```json
{
  "id": "hero", "shape": "human", "height": 1.78, "color": "hero",
  "faceAlongPath": true,
  "path": [
    { "t": 0,  "p": [0.4, 0, 10], "ease": "out" },
    { "t": 5,  "p": [0.1, 0, 1],  "ease": "linear" },
    { "t": 12, "p": [-0.3, 0, -13], "ease": "inOut" }
  ]
}
```

- `p` 是脚底坐标，`y: 0` 就是站在地上
- `ease` 写在**目标航点**上，控制从上一点到这一点的速度曲线：`linear` / `in` / `out` / `inOut`（默认）/ `outExpo`
- `faceAlongPath: true`（默认）**朝向从路径切线自动算**，不用填角度

最后这条是拿血换来的。2026-08-16 那批白模，人物航点的朝向套用了机位的角度公式，三条片子全员倒着走（moonwalk）——位置、速度、步态循环全对，只有朝向反了 180°。熬穿一整夜跑了三轮审查都没发现，因为**白模人物没有脸，正面和背面都是一具光滑的人形**。

所以现在两道保险：朝向由代码从路径算（不给人填错的机会），加上人形自带鼻子和胸标（抽帧放大就能肉眼验朝向）。

要让主体面向固定方向（比如站着不动的角色），写 `"faceAlongPath": false, "yaw": 1.57`（弧度，0 朝 +Z）。

## shots：镜头序列

相邻两个 shot 的边界就是硬切点，不需要额外声明。全部 rig 和参数见 `camera-rig.md`。

```json
{ "t": [4, 7.5], "rig": "lead", "target": "hero", "lead": 3.6,
  "height": [1.4, 1.2], "lens": 35, "ease": "inOut",
  "action": "他抬头看向巷子深处，脚步没停" }
```

| 通用字段 | 说明 |
|---|---|
| `t: [起, 止]` | 秒。要首尾相接，不接续 `probe` 会报警 |
| `lens` | 35mm 等效焦距。写数组 `[24, 85]` 就是变焦 |
| `ease` | 这一段运镜的速度曲线 |
| `shake` | `{ amp, freq }`，手持修饰，可叠在任何 rig 上 |
| `roll` | `[起, 止]` 度，画面横滚 |
| `spin` | `[起, 止]` 度，`topdown` 专用，画面绕中心自转 |
| `action` | 这一段主体在干什么。`make_prompt.mjs` 会写进 prompt 的对应时间戳 |

凡是「起→止」变化的参数都可以写成两元素数组：`"height": [1.6, 2.1]`、`"radius": [6, 4.6]`、`"lens": [24, 85]`。

## 完整例子

`templates/scenes/` 下面有三个可以直接改的：

| 文件 | 覆盖什么 |
|---|---|
| `多机位切换.json` | 12 秒 4 机位：跟随 → 前置倒退 → 环绕 → 起吊。手持修饰、硬切 |
| `俯拍队形.json` | 垂直俯拍 + 画面自转 + 悬空圆盘地面 + ring 布局 + 队形覆盖检查 |
| `照片反解-走廊.json` | 从一张照片反解出的空间，含 `sourcePhoto` 和 `solvedFrom` 记录 |

## 三条工程约束（改渲染器时别破坏）

1. 根元素必须有 `data-duration`。three 适配器不做时长推断，缺了直接报「Composition has zero duration」
2. 根元素必须有 `data-no-timeline`。否则渲染器轮询 GSAP timeline，白等 45 秒
3. 只能从 `hf-seek` 事件渲染，不能用 `requestAnimationFrame`。确定性渲染是白模能和 prompt 时间戳对齐的前提

`npx hyperframes check` 会报 `sweep_static`，**这是误报**——它检测 DOM 元素的几何变化，而白模的动画全在 canvas 像素内部。以渲出来的 mp4 为准。
