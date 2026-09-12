# 知识库自扩充（kb-builder）

> 任何人（或任何 AI 会话）都可以按此流程把 `knowledge/INDEX.md` 里 ⏳ 的书补录成 Markdown。
> 全程零硬编码依赖：一个浏览器 + 本目录三个 Python 工具。

## 源结构（2026-09 实测）

微信文章《U校园英语答案（最新版）》是三级目录：

```
总目录文章（21系列/约200本书卡片）
  └─ 每本书一篇文章（书内是 Unit 链接列表，个别老书直接放答案图）
      └─ 每个单元一篇文章（15~22 张答案截图，svg 分隔图忽略）
```

## 流水线

### 1. 目录页 → catalog + INDEX

```bash
# 目录页 HTML 用浏览器另存或 curl 抓一次（通常不被拦）
python tools/crawl_directory.py --html .cache/html/directory.html
# 产物：.cache/catalog.json（含每本书的子文章URL） + knowledge/INDEX.md
```

### 2. 书文章 → 单元链接

在浏览器打开书的文章 URL，页面回调提取（模式代码，整段粘进 evaluate）：

```js
[...document.querySelector("#js_content").querySelectorAll("a[href]")]
  .map(a => ({ text: a.innerText.trim(), href: a.getAttribute("href").replace(/&amp;/g,"&") }))
  .filter(u => u.text && u.href.includes("mp.weixin.qq.com"))
```

存为 `.cache/<书代号>-units.json`。若书文章没有链接而直接是图片（老书），跳到第 4 步按整书处理。

### 3. 单元文章 → 图片清单

逐个 Unit 文章提取图片（data-src 优先，过滤 `mmbiz_svg` 装饰图），存
`.cache/<书代号>-unit-images.json`，格式 `{"1":{"status":"ok","imgs":[...]}}`。

**反爬纪律（实测）**：mp.weixin.qq.com 同 IP 连续抓 10 篇左右触发「环境异常」验证页。
- 用真实浏览器访问（agent browser），节奏 ≥8-12s/篇 + 随机抖动；
- 被拦（`#js_content` 不存在或标题变「微信公众平台」）→ 冷却 60s+ 再重试，最多 3 次；
- 每篇抓完立刻落盘（断点续跑，重跑只补缺）。

### 4. 下载图片

```bash
python tools/download_images.py --manifest .cache/<书代号>-unit-images.json \
    --out .cache/images/<书代号> --units 1
```

带 `Referer: https://mp.weixin.qq.com/`；<1KB 的响应是校验页，当失败处理。图片 CDN 基本不限频。

### 5. 视觉转录（AI 执行）

按顺序 Read 图片（每批 ≤5 张），转录进 `knowledge/<系列>/<书名>.md`：

- 标题：`# <书名>— Unit N <单元主题>`（单元主题看 U校园目录或首图）；
- 小节标题 `## < Reading 1/Reading 2 · ><小节路径>`，**逐字对齐 U校园小节名**；
- 客观题保持题号与答案；Banked cloze 先写「词库：a / b / c」再列题号答案；
- 主观题（Read and think / 写作）全文转录，`参考` 标注的次选答案一并保留；
- 翻译题标注方向（英译汉/汉译英）；
- 转录完一个 Unit：文件头「已转录单元」更新 + INDEX 该书状态改 🟨（部分）/ ✅（全部）。

### 6. 质检

```bash
python tools/verify_kb.py            # 结构/占位符/空节检查
```

再抽查 2 张已转录图片对照 md（回读核对），确认无漏题号、无串行。

## 书代号约定

`nce4-rw3` = 新编大学英语四版综合教程3，`nce4-ls2` = 视听说2，`nv4-rw1` = 新视野四版读写1，
以此类推（系列缩写 + 版本 + 类型 + 册数），缓存目录与清单文件都用它。
