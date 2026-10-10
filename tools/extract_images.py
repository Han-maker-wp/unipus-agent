#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""从「单元文章」HTML 目录提取答案图片清单（.cache/<code>-unit-images.json）。

用法：python tools/extract_images.py <html_dir> <out.json>
      html_dir 内文件名形如 art-<mid>-<idx>.html。
      单元号按「文件名排序后的顺序」编号 1..N（不是直接用 idx）——
      因为一本书的文章可能跨多个 mid，各 mid 的 idx 都从 1 开始，直接用 idx 会互相覆盖。
      若提供 --units 1,2,3 则只处理指定序号。
输出格式：{"1": {"status": "ok", "src": "art-...-1.html", "imgs": [url, ...]}, ...}
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

    files = sorted(
        fn for fn in os.listdir(html_dir) if re.match(r"art-\d+-\d+\.html$", fn)
    )
    result = {}
    for seq, fn in enumerate(files, 1):
        unit = str(seq)
        if only and unit not in only:
            continue
        html = io.open(os.path.join(html_dir, fn), encoding="utf-8").read()
        imgs = images_of(html)
        result[unit] = {
            "status": "ok" if imgs else "empty",
            "src": fn,
            "imgs": imgs,
        }
        print(f"  Unit {unit}: {len(imgs)} 张  <- {fn}")

    io.open(out, "w", encoding="utf-8").write(
        json.dumps(result, ensure_ascii=False, indent=1)
    )
    print(f"-> {out}（共 {len(result)} 个单元）")


if __name__ == "__main__":
    main()
