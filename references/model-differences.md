# 四家官方公式对比

> ⚠️ **本文件仅供参考，不用于指导本 skill 的产出。**
> 铁律是：口径冲突时以 Seedance 2.5 / 2.0 官方为准。别家的最佳实践未必迁移得过来。
> 收录它的目的是让你知道「为什么网上那些教程互相矛盾」，以及在需要跨模型工作时有个对照。

## 公式横向对比

| | 官方公式 | 特点 |
|---|---|---|
| **Seedance 2.5**（字节 Seed）✅ 本 skill 采纳 | 无固定公式，实际范式：时长画幅 → 参考素材分组绑定 → 镜头序列（含时间戳）→ 全局约束 | 唯一把**大规模素材绑定**做成一等公民的。`@图片1` / `@视频1` / `@白模1` 语法，30图+10视频+10音频 |
| **Veo 3.1**（Google） | `[Cinematography] + [Subject] + [Action] + [Context] + [Style & Ambiance]` | **把 Cinematography 放在第一位**，官方称其为「传达情绪最强的工具」。音频拆 Dialogue / SFX / Ambient 三类分别写 |
| **Sora 2**（OpenAI） | 散文描述 + `Cinematography:` / `Actions:` / `Dialogue:` 分区块 | **对白单开区块**，与视觉描述分离。强调控制与留白的平衡 |
| **Kling**（快手） | `Subject（描述）+ Subject Movement + Scene（描述）+（Camera Language + Lighting + Atmosphere）` | 括号内可选。官方明确区分 **Camera Language ≠ 运镜控制**（前者是景别/焦段/景深，后者是推拉摇移） |

## 三处口径冲突（这就是网上教程互相矛盾的根源）

**1. 对白放哪**
Sora 2 要求对白单开区块，让模型区分「画面」和「台词」；Seedance 官方案例把对白直接嵌在镜头描述里、用引号包住。
→ **按 Seedance 来：嵌在镜头描述里。**

**2. prompt 该长该短**
Kling 官方说「用简单词汇和句式，避免过于复杂的语言」；Seedance 官方案例动辄两三百字且信息密集。
→ Kling 那份文档是 5-10 秒时代写的，长度建议随时长变化。**Seedance 做 30 秒，该长就长。**

**3. 公式的约束力**
Kling 说「不要被公式限制，大胆自由表达可能有惊喜」；Sora 2 说详细 prompt 保证一致性、简短 prompt 换来自由度。
→ Sora 2 官方原话值得记住：**「Treat your prompt as a creative wish list, not a contract.」** 同一个 prompt 多次生成结果不同，这是特性不是 bug。

## 别家值得借鉴的两条（不冲突，可以吸收）

**Veo 官方的负面提示词写法**：描述你想排除的**情景**，而不是说「不要什么」。
官方原例：写 `a desolate landscape with no buildings or roads`，不要写 `no man-made structures`。
→ 这和 Seedance 的「避免白模塑料感 / 不做教学拆解」是同一个思路，可以互相印证。

**Sora 2 官方的迭代心法**：**「Edit for nudging, not gambling」**——一次只改一个要素（`same shot, switch to 85mm`），锁住已经对的部分。

## Sora 2 官方的弱 / 强 prompt 对照表（跨模型通用）

| 弱 | 强 |
|---|---|
| A beautiful street at night | Wet asphalt, zebra crosswalk, neon signs reflecting in puddles |
| Person moves quickly | Cyclist pedals three times, brakes, stops at crosswalk |
| cinematic look | Anamorphic 2.0x lens, shallow DOF, volumetric light |
| Actor walks across the room | Actor takes four steps to window, pauses, pulls curtain in final second |
| brightly lit room | soft window light with warm lamp fill, cool rim from hallway; Palette: amber, cream, walnut brown |

⚠️ 注意最后一行的 `Anamorphic` —— 那是给 Sora 的。**在 Seedream 生成参考图时不要写 anamorphic，它会画出信箱黑边**（见 `reference-image.md`）。这正是「别家最佳实践未必迁移得过来」的实例。

## 四家口径一致的硬限制

- **复杂运动的物理合理性做不好**（球的弹跳、高空抛物轨迹）。Seedance 2.5 官方博客结尾自己承认
- **多主体互动场景的稳定性不足**。同上
- **模型对数字不敏感**，数量一致性做不到（Kling 官方原例：「沙滩上10只小狗」）

→ 设计分镜时绕开这三类。

## 信源

| 来源 | 链接 | 日期 |
|---|---|---|
| 字节 Seed · Seedance 2.5 发布博客 | seed.bytedance.com/en/blog/one-take-creation-flexible-referencing-introducing-seedance-2-5 | 2026-07-31 |
| Google Cloud · Veo 3.1 指南 | cloud.google.com/blog/products/ai-machine-learning/ultimate-prompting-guide-for-veo-3-1 | 2025-10-16 |
| OpenAI Cookbook · Sora 2 Guide | developers.openai.com/cookbook/examples/sora/sora2_prompting_guide | 2025-10-06 |
| 可灵 Kling · 官方提示词指南 | app.klingai.com/global/quickstart/text-to-video-prompt-guide | 页面标注 2025-11-24 |

⚠️ 后三份都已超过半年，且 Veo/Sora/Kling 各自的产品状态都有变化（Sora 应用 2026-04-26 已关停）。**引用前先确认它对应的模型版本还活着。**
