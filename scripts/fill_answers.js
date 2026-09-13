// fill_answers.js — U校园 courseware 页面答案回填回调（宿主无关：任意浏览器自动化的 evaluate 均可执行）
// 用法：本文件是「函数源码」。常见三种执行形态：
//   Playwright:    await page.evaluate(fn, { index, answer, dryRun })   // fn=eval(本文件源码) 或直接传函数
//   宿主内置浏览器:  同上传函数对象（部分宿主只认函数对象，安全写法 const fn = eval(src)，见 browser-adapters.md）
//   完整独立示例:   scripts/playwright-runner.example.js
// payload:
//   { answers: { "0": "finals", ... },   // key = extract_questions 的 index
//     dryRun: true }                     // dryRun 只校验选择器不写入
//   （也可一次只填一个空：{ index, answer, dryRun }）
// 纪律：
//   1) 本脚本绝不点击「提 交」及任何提交类按钮；
//   2) 每次写入间隔 ≥1.5s（节流，防风控）——批量回填请在外层循环逐空调用并 sleep，
//      单次调用形态 payload = { index, answer, dryRun }。
// 真机校准：2026-09-12 填空/textarea；选择题点击需真机逐题型校准后补充。
async (payload) => {
  const { index, answer, dryRun } = payload;
  const main = document.querySelector("main") || document.body;
  const inputs = [...main.querySelectorAll('input[type="text"], input:not([type]), textarea')]
    .filter((i) => main.contains(i) && !i.disabled && i.offsetParent !== null);
  const inp = inputs[index];
  if (!inp) return { ok: false, reason: "index out of range", total: inputs.length };

  const setVal = (el, v) => {
    const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
    setter.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  };

  if (dryRun) return { ok: true, dryRun: true, total: inputs.length, target: index };

  setVal(inp, answer);
  // 回读校验（React 受控组件经原生 setter + input 事件后应已生效）
  await new Promise((r) => setTimeout(r, 300));
  return { ok: inp.value === answer, value: inp.value, expected: answer, index };
}
