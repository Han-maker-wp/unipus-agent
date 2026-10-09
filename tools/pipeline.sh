#!/usr/bin/env bash
# 一键跑完「抓文章 → 单元链接 → 抓单元 → 图片清单 → 下载图片」
#
# 前置：Chrome 已由 tools/wx-open.mjs 以远程调试端口启动并保持运行
# 用法：tools/pipeline.sh <书代号> "<系列名>" "<书名（不含"答案"）>"
#   例：tools/pipeline.sh nv3-ls2 "新视野大学英语（第三版）" "新视野大学英语 视听说教程2"
#
# 产物：
#   .cache/html/<code>-book.html         书文章
#   tools/manifests/<code>-units.json    单元链接清单
#   .cache/html/<code>/                  各单元文章
#   .cache/<code>-unit-images.json       答案图片清单
#   .cache/images/<code>/uN/             答案图片
set -euo pipefail
cd "$(dirname "$0")/.."

CODE="$1"; SERIES="$2"; BOOK="$3"
NODE="${NODE_BIN:-C:/Users/hanbi/.workbuddy-ai/binaries/node/versions/22.22.2-2/node.exe}"
PY="${PY_BIN:-python}"

URL=$("$PY" - "$SERIES" "$BOOK" <<'EOF'
import json, io, sys
series, book = sys.argv[1], sys.argv[2]
d = json.load(io.open('.cache/catalog.json', encoding='utf-8'))
for s in d:
    if s['series'] == series:
        for b in s['books']:
            if b['name'].startswith(book) and b.get('url'):
                print(b['url']); sys.exit(0)
sys.exit(f'未在目录中找到：{series} / {book}')
EOF
)
echo "== 书文章 URL: $URL"

WX_CDP=1 "$NODE" tools/wx-fetch.mjs "$URL" ".cache/html/$CODE-book.html"
"$PY" tools/extract_units.py ".cache/html/$CODE-book.html" "tools/manifests/$CODE-units.json"
"$PY" - "$CODE" <<'EOF'
import json, io, sys
code = sys.argv[1]
d = json.load(io.open(f'tools/manifests/{code}-units.json', encoding='utf-8'))
io.open(f'.cache/{code}-urls.txt', 'w', encoding='utf-8').write('\n'.join(x['href'] for x in d))
print(f'  单元数：{len(d)}')
EOF

mkdir -p ".cache/html/$CODE"
WX_CDP=1 "$NODE" tools/wx-fetch.mjs --list ".cache/$CODE-urls.txt" ".cache/html/$CODE"
"$PY" tools/extract_images.py ".cache/html/$CODE" ".cache/$CODE-unit-images.json"
"$PY" tools/download_images.py --manifest ".cache/$CODE-unit-images.json" --out ".cache/images/$CODE"

echo "== 完成：$CODE（图片在 .cache/images/$CODE/）"
