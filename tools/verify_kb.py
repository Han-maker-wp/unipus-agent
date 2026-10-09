#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""知识库质量校验：结构、空节、占位符、U校园小节名对齐、INDEX 链接完整性。

用法：
  python tools/verify_kb.py            # 校验 knowledge/ 全部
  python tools/verify_kb.py --book 新编  # 只校验书名含关键词的书

退出码：0=全部通过，1=存在问题（清单见输出）。
"""
import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / "knowledge"

# 已知合法小节名（U校园任务名），用于「小节标题与平台对齐」软校验
KNOWN_SECTIONS = {
    "Preview", "Lead-in", "Get ready to read", "Read the passage",
    "Read and understand", "Read and think", "Read and practice",
    "Read and translate", "Read and write", "Unit project",
    "Listening for information", "Listen and discuss", "Vocabulary",
    "Reading in detail", "Global understanding", "Detailed understanding",
    "Word building", "Synonyms", "Language in use", "Banked cloze",
    "Translating", "Write to refute", "Watch for information",
    "Watch and discuss", "Meaning in context", "Sentence structure",
    "Error correction", "Translation skills", "Use of short sentences in narratives",
    # 视听说系列小节词表（教师用书/U校园视听说单元结构）
    "Warming up", "Listening & speaking", "News report", "Conversation",
    "Passage", "Listening and understanding", "Thinking and speaking",
    "Extended listening", "Speaking for communication", "Further listening",
    "Scripts", "Viewing & speaking", "Viewing and understanding",
    "Unit project",
    # 视听说3 单元专有栏目（Listening to China 等）
    "Listening to China", "Listening skills", "Before you listen",
    "While you listen", "After you listen", "Viewing world cultures",
    "Watching street interviews", "Thinking and speaking",
    # 新视野读写系列小节词表（第四版 U校园任务结构）
    "Reading the text", "Pre-reading activities", "Vocabulary learning",
    "Reading comprehension", "Understanding the text", "Critical thinking",
    "Critical thinking skill", "Language focus", "Words in use",
    "Expressions in use", "Structure analysis and writing", "Structure analysis",
    "Structured writing", "Reading skills", "Collocation", "Stories of China",
    "Sentence translation", "Paragraph translation", "Unit review", "Unit test",
    "Quiz", "Practicing", "Reading", "Translation", "Learning", "Listening to the world",
    "Speaking for communication", "Viewing world cultures", "Further listening",
    "Role-play", "Present ideas", "Wrapping up", "Culture notes", "Get ideas",
    "Opening up", "Taking in", "Speaking out", "Watching street interviews",
    "Group discussion", "Discuss and organize ideas",
    # 综合训练系列（Part 结构）
    "Vocabulary and structure", "Grammar study", "Writing", "General writing",
    "Practical writing", "Multiple choice questions",
    # 新视野视听说（第三版）单元栏目（Listening to the world / Speaking for communication 分组）
    "Sharing", "Listening", "Viewing", "Get a clue", "View it",
    "Role-playing", "Note them down", "Presenting", "Organize ideas",
    "More practice in listening", "Short conversations", "Long conversation",
    "Passages", "News", "Use the skills", "Practice",
    # 新标准大学英语（第二版）综合教程单元栏目
    "Active reading", "First reading", "First reading Task", "Reading in detail",
    "Vocabulary exercises", "Language in use", "Guided writing", "Writing Task",
    "Unit test", "Vocabulary and Structure", "Banked Cloze",
    "Reading Comprehension", "Section A", "Section B", "Section C",
    # 新未来大学英语 综合教程（Section / Episode / Text 结构）
    "Section", "Episode", "Text A", "Text B", "Comprehension", "Preview task",
    "Words and expressions", "Structure", "Communication skill",
    "Warm up", "Wrap up", "Collocation",
}

# XXX 白名单：教材范文本身用 XXX 作占位（XXX Road / XXX University / Room XXX 等），不算转录占位符
PLACEHOLDER = re.compile(r"(待补充|TODO|TBD|(?<!Room )(?<![0-9X])XXX(?![0-9X])(?!\s*(?:Road|Street|Avenue|University|School|College|Company|Dormitory|Building|graduates|in your company))|占位|＼width|[一-鿿]{0,2}略）$)")
ANSWER_LINE = re.compile(r"^\s*(\d+[)、.])\s*(.+)$")


def check_book(path: Path, issues: list):
    rel = path.relative_to(ROOT.parent)
    text = path.read_text(encoding="utf-8")
    if len(text) < 200:
        issues.append(f"{rel}: 文件过短（{len(text)}字符），疑似未完成转录")
    if "已转录单元" not in text:
        issues.append(f"{rel}: 缺少「已转录单元」进度头")
    if "来源" not in text:
        issues.append(f"{rel}: 缺少来源标注")

    cur = ""
    in_comment = False
    # 教师用书类文件：栏目名来自教师用书本身（Unit overview / Scenario / …），
    # 与 U校园任务点本就不一一对应，跳过「小节名对齐」软校验。
    is_teacher_book = "教师用书" in text[:800]
    for i, line in enumerate(text.splitlines(), 1):
        # 跳过 <!-- 校订说明 --> 多行注释块（转录者备注，非知识库正文）
        if in_comment:
            if "-->" in line:
                in_comment = False
            continue
        if "<!--" in line:
            if "-->" not in line.split("<!--", 1)[1]:
                in_comment = True
            continue
        if line.startswith("## "):
            cur = line[3:].strip()
            # 小节名对齐：## 后应包含已知小节关键词之一
            if (not is_teacher_book and "（结构页）" not in cur
                    and "（续）" not in cur
                    and not any(k in cur for k in KNOWN_SECTIONS)):
                issues.append(f"{rel}:{i} 小节名可能未对齐U校园：{cur!r}")
        m = ANSWER_LINE.match(line)
        if m and not m.group(2).strip():
            issues.append(f"{rel}:{i} 空答案行（{cur} {m.group(1)}）")
        if PLACEHOLDER.search(line) and not line.startswith(">"):
            issues.append(f"{rel}:{i} 疑似占位符：{line.strip()[:40]!r}")
        # 全角数字/括号混用（转录常见手误）
        if re.search(r"[０-９]", line):
            issues.append(f"{rel}:{i} 全角数字：{line.strip()[:30]!r}")


def check_index(issues: list):
    idx = ROOT / "INDEX.md"
    if not idx.exists():
        issues.append("knowledge/INDEX.md 不存在")
        return
    for i, line in enumerate(idx.read_text(encoding="utf-8").splitlines(), 1):
        if line.startswith("|") and "微信文章" in line:
            m = re.search(r"\]\((\./[^)]+)\)", line.split("微信文章")[-1])
            if m:
                target = ROOT / m.group(1).lstrip("./").replace("%EF%BC%88", "（")
                if not target.exists() and "⏳" not in line and "❌" not in line:
                    issues.append(f"INDEX.md:{i} 笔记链接目标不存在：{m.group(1)}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--book", default="", help="只校验书名含此关键词的书")
    args = ap.parse_args()
    issues: list = []

    books = sorted(p for p in ROOT.rglob("*.md") if p.name != "INDEX.md")
    for p in books:
        if args.book and args.book not in p.name:
            continue
        check_book(p, issues)
    if not args.book:
        check_index(issues)

    if issues:
        print(f"发现 {len(issues)} 个问题：")
        for s in issues:
            print(" -", s)
        sys.exit(1)
    n = len([p for p in books if not args.book or args.book in p.name])
    print(f"OK：{n} 本书校验通过")


if __name__ == "__main__":
    main()
