#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""U校园答案知识库 - 目录页爬取与索引生成工具。

解析微信文章《U校园英语答案（最新版）》目录页（21 个系列 / 约 194 本教材），
生成机器可读的 catalog.json 与人读/AI 检索用的 INDEX.md。

目录页结构（2026-09 实测）：
  - 系列标题：表格之间的纯文本段落，如「新视野大学英语（第四版）」
  - 教材卡片：表格内「上行 td 放 <a> 卡片（含 imgurl 封面图），下行 td 放粗体说明文字」

反爬提示（实测）：mp.weixin.qq.com 对同 IP 连续抓取子文章约 10+ 篇即触发
「环境异常」验证页。目录页一次抓取通常没问题；子文章元数据建议走真实浏览器
（参考 references/kb-builder.md 的浏览器协助模式），或加大间隔至 30s+ 并接受失败重试。

用法：
  python tools/crawl_directory.py --html .cache/html/directory.html   # 离线解析+建索引
  python tools/crawl_directory.py --url https://mp.weixin.qq.com/s/x  # 在线抓目录页+建索引

输出：
  .cache/catalog.json   全量名录：[{series, books:[{name,url,cover}]}]
  knowledge/INDEX.md    总索引（转录状态需人工/AI 维护）
"""
import argparse
import html as H
import json
import re
import urllib.request

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")

DIR_URL = "https://mp.weixin.qq.com/s/hiWCaZIHjLT3ADlYReSfJg"

# 目录页正文里的无关文案（公众号装饰按钮等）
NOISE = re.compile(
    r"^(预览时标签|点此|轻点|微信|扫一扫|小程序|公众号|关注|写留言|喜欢此内容|"
    r"分享|在看|赞$|收藏|推荐|划线|复制|搜一搜|反馈|更多|关闭|展开|收起|"
    r"已同步|等你来|了解更多|继续访问|取消|确定)", re.I)


def fetch(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode("utf-8", errors="replace")


def unesc(s: str) -> str:
    return H.unescape(s).strip()


def parse_directory(html: str):
    """返回 [{series, books:[{name,url,cover}]}]，顺序与目录页一致。"""
    j = html.find('id="js_content"')
    if j < 0:
        raise SystemExit("目录页缺少 js_content，可能被验证页拦截（换浏览器抓或稍后再试）")
    dom = html[j:]
    parts = re.split(r"(<table[^>]*>.*?</table>)", dom, flags=re.S)

    books, series = [], "未分组"
    pending = []  # 上一行的卡片，等下一行说明文字来配对
    for part in parts:
        if part.startswith("<table"):
            for row in re.findall(r"<tr[^>]*>(.*?)</tr>", part, re.S):
                row_cards, row_caps = [], []
                for td in re.findall(r"<td[^>]*>(.*?)</td>", row, re.S):
                    a = re.search(r'<a\s[^>]*href="(https?://mp\.weixin\.qq\.com/s[^"]+)"', td)
                    if a:
                        img = re.search(r'imgurl="([^"]+)"', td)
                        row_cards.append({"url": unesc(a.group(1)).split("#")[0],
                                          "cover": unesc(img.group(1)) if img else ""})
                        continue
                    text = unesc(re.sub(r"<[^>]+>", "", td))
                    if text:
                        row_caps.append(text)
                if row_cards and not row_caps:
                    pending = row_cards
                elif row_caps:
                    books.extend({"series": series, "name": cap,
                                  **(pending[i] if i < len(pending) else {})}
                                 for i, cap in enumerate(row_caps))
                    pending = []
        else:
            text = unesc(re.sub(r"<[^>]+>", "\n", part))
            for line in (l.replace("\u00a0", " ").strip() for l in text.split("\n")):
                if not line or len(line) > 40 or NOISE.match(line):
                    continue
                if any(k in line for k in ("var ", "function", "=")):
                    continue
                series = line
    groups: dict = {}
    for b in books:
        groups.setdefault(b["series"], []).append(b)
    return [{"series": s, "books": bs} for s, bs in groups.items()]


def write_index(catalog, path="knowledge/INDEX.md"):
    total = sum(len(g["books"]) for g in catalog)
    lines = [
        "# U校园教材答案知识库 · 总索引",
        "",
        f"> 来源：[U校园英语答案（最新版）]({DIR_URL}) · "
        f"**{len(catalog)}** 个系列 / **{total}** 本教材。",
        "> 转录状态：✅ 已转录 · ⏳ 待转录（链接可用，按 kb-builder.md 流程补齐）。",
        "> 检索方法见 [knowledge-base.md](../references/knowledge-base.md)。",
        "",
    ]
    for g in catalog:
        lines += [f"## {g['series']}", "",
                  "| 教材 | 转录状态 | 答案源 | 本地笔记 |",
                  "| --- | --- | --- | --- |"]
        for b in g["books"]:
            slug = b["name"].replace("答案", "").strip()
            if not b.get("url"):  # 目录里有书名但未挂卡片：源未发布
                lines.append(f"| {b['name']} | ❌ 源缺失 | - | - |")
                continue
            lines.append(f"| {b['name']} | ⏳ | [微信文章]({b['url']}) |"
                         f" [{slug}](./{g['series']}/{slug}.md) |")
        lines.append("")
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    return total


def main():
    ap = argparse.ArgumentParser()
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument("--html", help="已保存的目录页 HTML")
    src.add_argument("--url", help="目录页 URL")
    ap.add_argument("--catalog", help="已有 catalog.json，仅重建 INDEX")
    args = ap.parse_args()

    if args.catalog:
        catalog = json.load(open(args.catalog, encoding="utf-8"))
    else:
        html = open(args.html, encoding="utf-8").read() if args.html else fetch(args.url)
        catalog = parse_directory(html)
    json.dump(catalog, open(".cache/catalog.json", "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    total = write_index(catalog)
    print(f"完成：{len(catalog)} 个系列 / {total} 本 → .cache/catalog.json + knowledge/INDEX.md")


if __name__ == "__main__":
    main()
