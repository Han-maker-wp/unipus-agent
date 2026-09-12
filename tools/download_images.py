#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""下载微信文章里的答案截图到本地缓存（供视觉转录用）。

输入：单元图片清单 JSON（见 kb-builder.md 流水线），
形如 { "1": {"status":"ok","imgs":[url,...]}, ... }

用法：
  python tools/download_images.py --manifest .cache/nce4-综合教程3-unit-images.json \
      --out .cache/images/nce4-rw3 --units 1

说明：
  - mmbiz.qpic.cn 图片 CDN 通常不限频，但带 Referer 更稳；
  - 已存在的文件跳过（可断点续跑）；
  - URL 上的 #imgIndex 片段会被去掉。
"""
import argparse
import json
import os
import random
import time
import urllib.request

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")


def download(url: str, path: str) -> bool:
    req = urllib.request.Request(url, headers={
        "User-Agent": UA,
        "Referer": "https://mp.weixin.qq.com/",
    })
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            data = r.read()
    except Exception as e:
        print(f"  [err] {e}: {url[:70]}")
        return False
    if len(data) < 1000:  # 微信对小体积返回校验页
        print(f"  [too small] {len(data)}B {url[:70]}")
        return False
    with open(path, "wb") as f:
        f.write(data)
    return True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--manifest", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--units", default="", help="逗号分隔单元号，空=全部")
    args = ap.parse_args()

    manifest = json.load(open(args.manifest, encoding="utf-8"))
    units = args.units and [u.strip() for u in args.units.split(",")] or list(manifest)
    os.makedirs(args.out, exist_ok=True)

    ok = fail = 0
    for u in units:
        item = manifest.get(u)
        if not item or item.get("status") != "ok":
            print(f"Unit {u}: 清单缺失或未就绪，跳过")
            continue
        udir = os.path.join(args.out, f"u{u}")
        os.makedirs(udir, exist_ok=True)
        for i, url in enumerate(item["imgs"], 1):
            path = os.path.join(udir, f"{i:02d}.jpg")
            if os.path.exists(path) and os.path.getsize(path) > 1000:
                ok += 1
                continue
            url = url.split("#")[0]
            if download(url, path):
                ok += 1
            else:
                fail += 1
            time.sleep(random.uniform(0.4, 1.0))
        print(f"Unit {u}: 完成（成功{ok} 失败{fail}）")
    print(f"总计：成功 {ok}，失败 {fail}，目录 {args.out}")


if __name__ == "__main__":
    main()
