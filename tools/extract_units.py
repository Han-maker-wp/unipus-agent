#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""从「书的微信文章」HTML 提取单元链接清单（tools/manifests/<code>-units.json）。

用法：python tools/extract_units.py <book.html> <out.json>
"""
import io, json, re, sys


def js_content(html: str) -> str:
    """取 #js_content 之后的正文（正文基本在文末，取最后一段最稳）。"""
    i = html.rfind('id="js_content"')
    return html[i:] if i >= 0 else html


BLOCK = {"了解更多", "阅读原文", "查看更多", "往期回顾", "推荐阅读", "点赞", "分享"}


def main():
    src, out = sys.argv[1], sys.argv[2]
    html = io.open(src, encoding="utf-8").read()
    body = js_content(html)

    items, seen = [], set()
    for m in re.finditer(r'<a\b[^>]*href="([^"]+)"[^>]*>(.*?)</a>', body, re.S):
        href = m.group(1).replace("&amp;", "&")
        text = re.sub(r"<[^>]+>", "", m.group(2)).strip()
        text = re.sub(r"\s+", " ", text)
        if not text or "mp.weixin.qq.com" not in href:
            continue
        if text in BLOCK:
            continue
        if href in seen:
            continue
        seen.add(href)
        items.append({"href": href, "text": text})

    io.open(out, "w", encoding="utf-8").write(
        json.dumps(items, ensure_ascii=False, indent=1)
    )
    print(f"提取到 {len(items)} 个单元链接 -> {out}")
    for it in items:
        print("  ", it["text"])


if __name__ == "__main__":
    main()
