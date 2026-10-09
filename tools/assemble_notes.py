#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把 .cache/notes/<code>-uN.md 分段稿拼装成 knowledge/ 下的成品文件。

用法：
  python tools/assemble_notes.py <code> <out.md> <header.md>

- 自动按 u1,u2,u3… 顺序收集（直到文件缺失为止）
- 单元稿支持两种形态：`<code>-uN.md`（整单元一个文件），或
  `<code>-uN-a.md` / `<code>-uN-b.md` …（单元被拆成多段，按字母序拼接）
- 自动剔除「无编号分组标签」被误写成 ## 的行（Listening to the world 等）
- header.md 为该书的文件头（一级标题 + > 来源/进度说明）
"""
import glob
import io, os, re, sys

BARE = {
    "Listening to the world",
    "Speaking for communication",
    "More practice in listening",
    "Conversations",
    "Unit project",
}


def load_unit(notes: str, code: str, i: int):
    """返回该单元的分段稿文本；不存在返回 None。"""
    whole = os.path.join(notes, f"{code}-u{i}.md")
    if os.path.exists(whole):
        return io.open(whole, encoding="utf-8").read()
    pieces = sorted(glob.glob(os.path.join(notes, f"{code}-u{i}-*.md")))
    if pieces:
        return "\n\n".join(io.open(p, encoding="utf-8").read().strip() for p in pieces)
    return None


def main():
    code, out, header_path = sys.argv[1], sys.argv[2], sys.argv[3]
    notes = ".cache/notes"

    parts, n = [], 0
    for i in range(1, 40):
        raw = load_unit(notes, code, i)
        if raw is None:
            break
        n = i
        lines = raw.split("\n")
        keep = [
            ln for ln in lines
            if not (ln.startswith("## ") and ln[3:].strip() in BARE)
        ]
        parts.append(re.sub(r"\n{3,}", "\n\n", "\n".join(keep)).strip())

    if not parts:
        sys.exit(f"未找到任何分段稿：{notes}/{code}-uN.md")

    header = io.open(header_path, encoding="utf-8").read().strip()
    os.makedirs(os.path.dirname(out), exist_ok=True)
    io.open(out, "w", encoding="utf-8").write(
        header + "\n\n" + "\n\n---\n\n".join(parts) + "\n"
    )
    total = len(io.open(out, encoding="utf-8").read().split("\n"))
    print(f"拼装 {n} 个单元 -> {out}（{total} 行）")


if __name__ == "__main__":
    main()
