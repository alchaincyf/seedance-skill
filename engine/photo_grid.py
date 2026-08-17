#!/usr/bin/env python3
"""照片反解辅助：给照片叠一层刻度，并把透视线和灭点标出来。

    python3 photo_grid.py 照片.jpg [输出.jpg] [--no-lines]

肉眼估「灭点在画面 0.40 还是 0.45」很不靠谱，差 0.05 就是差 5° 俯仰。
这个脚本给照片叠一层刻度，让你读数而不是猜：
  · 10×10 网格 + 中心十字 + 三分线
  · 检测到的长斜线（画出来供你参考，帮你看清墙脚线朝哪收敛）

⚠️ 它不替你判断灭点，两个方向都会错：
  · 机器会错——一张酒店走廊照片，地毯的菱形花纹全是 45° 长线，把 Hough 检出的
    「透视线」整个带偏（检出斜率清一色 ±1.0），算出 y=0.58~0.64，真值 0.51。
    地毯、瓷砖、砖墙、格栅这类重复纹理的画面都会这样。
  · 人也会错——同一张图，我不叠网格肉眼估是 0.40，叠上网格读出来是 0.51，差了 0.11，
    换算成俯仰角就是 5°，白模的地面占比会整个不对。
**所以：线只当参考，位置一律叠网格读数，参数靠迭代对帧收敛。**
"""
import sys
import cv2
import numpy as np

args = [a for a in sys.argv[1:] if not a.startswith("--")]
if not args:
    print(__doc__)
    sys.exit(2)
src = args[0]
out = args[1] if len(args) > 1 else src.rsplit(".", 1)[0] + "-grid.jpg"
draw_lines = "--no-lines" not in sys.argv

img = cv2.imread(src)
if img is None:
    print(f"读不到 {src}")
    sys.exit(1)
h, w = img.shape[:2]
vis = img.copy()

# ── 透视线与灭点 ─────────────────────────────────────────
vp = None
if draw_lines:
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    edges = cv2.Canny(gray, 60, 180, apertureSize=3)
    segs = cv2.HoughLinesP(edges, 1, np.pi / 180, threshold=90,
                           minLineLength=int(min(h, w) * 0.18), maxLineGap=14)
    keep = []
    if segs is not None:
        for x1, y1, x2, y2 in np.asarray(segs).reshape(-1, 4):
            ang = abs(np.degrees(np.arctan2(y2 - y1, x2 - x1)))
            # 只留斜线：水平线和垂直线不指向灭点，留着只会污染交点
            if 8 < ang < 82 or 98 < ang < 172:
                keep.append((x1, y1, x2, y2))
    for x1, y1, x2, y2 in keep:
        cv2.line(vis, (x1, y1), (x2, y2), (90, 200, 255), 1, cv2.LINE_AA)
    vp = len(keep)

# ── 刻度网格 ─────────────────────────────────────────────
for i in range(1, 10):
    c = (255, 255, 255) if i != 5 else (0, 255, 255)
    t = 1 if i != 5 else 2
    cv2.line(vis, (int(w * i / 10), 0), (int(w * i / 10), h), c, t, cv2.LINE_AA)
    cv2.line(vis, (0, int(h * i / 10)), (w, int(h * i / 10)), c, t, cv2.LINE_AA)
for i in (1, 2):  # 三分线
    cv2.line(vis, (int(w * i / 3), 0), (int(w * i / 3), h), (0, 255, 0), 1, cv2.LINE_AA)
    cv2.line(vis, (0, int(h * i / 3)), (w, int(h * i / 3)), (0, 255, 0), 1, cv2.LINE_AA)
for i in range(1, 10):
    cv2.putText(vis, f"{i/10:.1f}", (6, int(h * i / 10) - 6), cv2.FONT_HERSHEY_SIMPLEX,
                min(w, h) / 1400, (255, 255, 255), 1, cv2.LINE_AA)
    cv2.putText(vis, f"{i/10:.1f}", (int(w * i / 10) + 6, 26), cv2.FONT_HERSHEY_SIMPLEX,
                min(w, h) / 1400, (255, 255, 255), 1, cv2.LINE_AA)

cv2.imwrite(out, vis, [cv2.IMWRITE_JPEG_QUALITY, 92])
print(f"✅ {out}  ({w}×{h})")
print(f"画了 {vp or 0} 条斜线供参考——它们里面混着纹理线，别当透视线用。")
print("""
读这张图的顺序：
  1. 顺着两侧墙脚线（或天花板线）往远处延长，交点就是灭点，在网格上读出它的 y
     · 灭点 y = 0.50 → 镜头水平
     · 灭点 y < 0.50 → 镜头上仰（灭点在中心之上）
     · 灭点 y > 0.50 → 镜头俯视
  2. 灭点所在的那条水平线就是地平线。画面里任何站在地上的人，
     地平线穿过他身体的位置 = 相机高度（穿过腰 → 相机在腰高；穿过头顶 → 相机在人眼高）
  3. 找一把尺子：人 1.7m、门 2.1m、车 1.5m、楼层 3m。用它换算画面里其他东西的实际尺寸
  4. 焦段先猜（室内广角 24-35mm，人像中长焦 50-85mm），渲首帧和照片并排看，两三轮收敛
""")
