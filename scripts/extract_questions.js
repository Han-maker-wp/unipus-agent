// extract_questions.js — U校园 courseware 页面题目提取回调
// 用法：整段粘进 tab.playwright.evaluate(...) 执行，返回 JSON。
// 纪律：只读函数，绝不点击任何按钮、绝不提交。
// 真机校准：2026-09-12《新编大学英语（第四版）综合教程3》Unit 1 Banked cloze。
() => {
  const main = document.querySelector("main") || document.body;
  const text = (el) => (el?.innerText || "").trim();

  // Directions：含 "Directions" 的段落
  let directions = "";
  for (const p of main.querySelectorAll("p, div, span")) {
    const t = text(p);
    if (t.startsWith("Directions")) { directions = t; break; }
  }

  // 词库表（banked cloze）：题面区第一张 table 的非空单元格
  const wordBank = [];
  const table = main.querySelector("table");
  if (table) {
    for (const td of table.querySelectorAll("td"))
      if (text(td)) wordBank.push(text(td));
  }

  // 题目：段落内联输入框，按出现顺序记录上下文
  const inputs = [...main.querySelectorAll('input[type="text"], input:not([type]), textarea')]
    .filter((i) => main.contains(i) && !i.disabled && i.offsetParent !== null);
  // 从输入框向上走到段落，累加途经的前置文本 → 取紧邻的题号
  const prefixText = (inp, para) => {
    let node = inp, prefix = "";
    while (node && node !== para) {
      const parent = node.parentElement;
      if (!parent) break;
      for (const n of parent.childNodes) {
        if (n === node) break;
        prefix += n.textContent || "";
      }
      node = parent;
    }
    return prefix;
  };
  const questions = inputs.map((inp, idx) => {
    const para = inp.closest("p") || inp.parentElement;
    const paraText = text(para);
    const pre = prefixText(inp, para);
    const m = pre.match(/(\d+)\s*[)、.]\s*$/) || paraText.match(/(\d+)\s*[)、.]/);
    return {
      index: idx,
      type: inp.tagName === "TEXTAREA" ? "essay" : "blank",
      no: m ? m[1] + ")" : String(idx + 1),
      context: paraText.slice(0, 160),
      value: inp.value || "",
    };
  });

  // 选择题（radio/可点选项）：检测 radio 或带选项样式的列表（真机逐题型校准点）
  const radios = [...main.querySelectorAll('input[type="radio"]')].length;

  // 提交按钮状态（只探测不点击）：在页脚 footer.ant-layout-footer 里，形如 a.btn，
  // 文本恰为「提 交」；取全文档可见元素中文本匹配的最深层元素
  let submitBtn = null;
  for (const el of document.body.querySelectorAll("*")) {
    if (/^提\s*交$/.test(text(el)) && el.offsetParent !== null) {
      if (!submitBtn || el.querySelectorAll("*").length < submitBtn.querySelectorAll("*").length)
        submitBtn = el;
    }
  }

  return {
    url: location.href,
    section: text(document.querySelector("[class*=breadcrumb] li:last-child") || main.querySelector("h1, h2")) || "",
    directions: directions.slice(0, 300),
    wordBank: [...new Set(wordBank)],
    questions,
    radioCount: radios,
    hasSubmit: !!submitBtn,
    extractedAt: new Date().toISOString(),
  };
}
