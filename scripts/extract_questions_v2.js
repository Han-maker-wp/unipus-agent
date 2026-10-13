// extract_questions_v2.js — U校园 courseware 题目提取回调（v2，2026-10-11 真机校准）
// 相对 v1 的增量：识别「可点选项」选择题（div.question-common-abs-choice > .option-wrap > .option，
// 无 radio input），并把选择题与填空/textarea 统一编号，供 fill_answers_v2.js 按 index 回填。
// 宿主无关：只读函数，绝不点击任何按钮。
// 真机校准：2026-10-11《新编大学英语（第四版）综合教程3》1-11 Detailed understanding。
() => {
  const main = document.querySelector("main") || document.body;
  const text = (el) => (el?.innerText || "").trim();
  const clean = (s) => (s || "").replace(/\s+/g, " ").trim();

  // Directions
  let directions = "";
  for (const p of main.querySelectorAll("p, div, span")) {
    const t = text(p);
    if (t.startsWith("Directions")) { directions = clean(t); break; }
  }

  // 词库表（banked cloze / 选词填空）
  const wordBank = [];
  const table = main.querySelector("table");
  if (table) for (const td of table.querySelectorAll("td")) { const t = text(td); if (t) wordBank.push(t); }

  const questions = [];
  let idx = 0;

  // 1) 可点选项选择题
  for (const q of main.querySelectorAll("div[class*=question-common-abs-choice]")) {
    const stemEl = q.querySelector("[class*=ques-title]");
    const stem = clean(text(stemEl));
    const opts = [...q.querySelectorAll(".option-wrap > .option")].map((o) => ({
      key: clean(text(o.querySelector(".caption"))),
      text: clean(text(o.querySelector(".content"))),
      selected: /(^|\s)selected(\s|$)/.test(o.className || ""),
    }));
    const m = stem.match(/^(\d+)\s*[.、)]/);
    questions.push({
      index: idx++, type: "choice",
      no: m ? m[1] : String(idx),
      stem: stem.slice(0, 400),
      options: opts,
      value: (opts.find((o) => o.selected) || {}).key || "",
    });
  }

  // 2) 文本输入框 / textarea（按 DOM 顺序）
  const fields = [...main.querySelectorAll('input[type="text"], input:not([type]), textarea')]
    .filter((i) => main.contains(i) && !i.disabled && i.offsetParent !== null);
  for (const f of fields) {
    const para = f.closest("p") || f.parentElement;
    const ctx = clean(text(para));
    const m = ctx.match(/^(\d+)\s*[.、)]/);
    questions.push({
      index: idx++,
      type: f.tagName === "TEXTAREA" ? "essay" : "blank",
      no: m ? m[1] : String(idx),
      context: ctx.slice(0, 300),
      value: f.value || "",
    });
  }

  // 3) 提交按钮状态（只探测）
  let submitBtn = null;
  for (const el of document.body.querySelectorAll("*")) {
    if (/^提\s*交$/.test(text(el)) && el.offsetParent !== null) {
      if (!submitBtn || el.querySelectorAll("*").length < submitBtn.querySelectorAll("*").length) submitBtn = el;
    }
  }

  return {
    url: location.href,
    section: clean(text(document.querySelector("[class*=breadcrumb] li:last-child"))) || clean(text(main.querySelector("h1, h2"))),
    directions: directions.slice(0, 300),
    wordBank: [...new Set(wordBank)],
    questions,
    radioCount: main.querySelectorAll('input[type="radio"]').length,
    choiceCount: main.querySelectorAll("div[class*=question-common-abs-choice]").length,
    fieldCount: fields.length,
    hasSubmit: !!submitBtn,
    extractedAt: new Date().toISOString(),
  };
}
