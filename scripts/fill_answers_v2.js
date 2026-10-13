// fill_answers_v2.js — U校园 courseware 答案回填回调（v2，2026-10-11 真机校准）
// 与 extract_questions_v2.js 的 index 编号严格对应：
//   index < choiceCount → 选择题（answer 传选项字母，如 "B"），点击对应 .option
//   其余 → 填空 / textarea，用原生 setter 写值
// 纪律：绝不点击「提 交」；单次调用只处理一个 index，批量请在外层 ≥1.5s 节流。
async (payload) => {
  const { index, answer, dryRun } = payload;
  const main = document.querySelector("main") || document.body;
  const text = (el) => (el?.innerText || "").trim();
  const clean = (s) => (s || "").replace(/\s+/g, " ").trim();

  // 与 extract v2 相同的编号顺序
  const items = [];
  for (const q of main.querySelectorAll("div[class*=question-common-abs-choice]")) items.push({ kind: "choice", el: q });
  const fields = [...main.querySelectorAll('input[type="text"], input:not([type]), textarea')]
    .filter((i) => main.contains(i) && !i.disabled && i.offsetParent !== null);
  for (const f of fields) items.push({ kind: "field", el: f });

  const it = items[index];
  if (!it) return { ok: false, reason: "index out of range", total: items.length };
  if (dryRun) return { ok: true, dryRun: true, total: items.length, target: index, kind: it.kind };

  if (it.kind === "choice") {
    const opts = [...it.el.querySelectorAll(".option-wrap > .option")];
    const want = String(answer).trim().toUpperCase();
    const target = opts.find((o) => clean(text(o.querySelector(".caption"))).toUpperCase() === want);
    if (!target) return { ok: false, reason: "option not found", want, available: opts.map((o) => clean(text(o.querySelector(".caption")))) };
    target.click();
    await new Promise((r) => setTimeout(r, 300));
    return { ok: true, clicked: want, selected: /(^|\s)selected(\s|$)/.test(target.className || "") };
  }

  const el = it.el;
  const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
  setter.call(el, answer);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 300));
  return { ok: el.value === answer, value: el.value, expected: answer, index };
}
