#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""从「单元文章」HTML 目录提取答案图片清单（.cache/<code>-unit-images.json）。

用法：python tools/extract_images.py <html_dir> <out.json>
      html_dir 内文件名形如 art-<mid>-<idx>.html，idx 即单元号。
      若提供 --units 1,2,3 则只处理指定单元。
输出格式：{"1": {"status": "ok", "imgs": [url, ...]}, ...}
"""
import io, json, os, re, sys


def js_content(html: str) -> str:
    i = html.rfind('id="js_content"')
    return html[i:] if i >= 0 else html


def images_of(html: str):
    body = js_content(html)
    urls, seen = [], set()
    # 微信图片：data-src（懒加载真链）优先，回退 src
    for m in re.finditer(r'data-src="([^"]+)"', body):
        u = m.group(1).replace("&amp;", "&")
        if "mmbiz.qpic.cn" not in u or "mmbiz_svg" in u:
            continue
        if u in seen:
            continue
        seen.add(u)
        urls.append(u)
    return urls


def main():
    argv = sys.argv[1:]
    only = None
    if "--units" in argv:
        i = argv.index("--units")
        only = set(argv[i + 1].split(","))
        del argv[i : i + 2]
    html_dir, out = argv[0], argv[1]

    result = {}
    for fn in sorted(os.listdir(html_dir)):
        m = re.match(r"art-\d+-(\d+)\.html$", fn)
        if not m:
            continue
        unit = m.group(1)
        if only and unit not in only:
            continue
        html = io.open(os.path.join(html_dir, fn), encoding="utf-8").read()
        imgs = images_of(html)
        result[unit] = {"status": "ok" if imgs else "empty", "imgs": imgs}
        print(f"  Unit {unit}: {len(imgs)} 张")

    io.open(out, "w", encoding="utf-8").write(
        json.dumps(result, ensure_ascii=False, indent=1)
    )
    print(f"-> {out}")


if __name__ == "__main__":
    main()
