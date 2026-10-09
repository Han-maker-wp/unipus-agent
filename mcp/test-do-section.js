// test-do-section.js — 完整做一节测试：定位→提取→知识库答案回填→复核→提交→确认
// 用法：node test-do-section.js [--keep]
// 答案来源：knowledge/新编大学英语（第四版）/新编大学英语 综合教程3.md §2-6 Read and practice · Banked cloze
// 提交策略：用户已授权本节自动提交。
import { chromium } from "playwright-core";
import {
  PROFILE_DIR, COURSE_MGMT, scriptFn, sleep, clickByText, closeKnownDialog,
  waitNavigated, extractReady, switchUnit,
} from "./lib/helpers.js";

const keep = process.argv.includes("--keep");
const BOOK = "综合教程 3";
const UNIT = 2;
const TASK = "Banked cloze";
const EXPECT_SECTION = "2-6 Read and practice";

// 知识库答案（index 0 起，对应 extract 的 no 1)~10)）
const ANSWERS = {
  0: "Popularizing", 1: "workforce", 2: "obstacles", 3: "options", 4: "accompanied",
  5: "constantly", 6: "productivity", 7: "panic", 8: "limitations", 9: "boundaries",
};

const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
  channel: "chrome", headless: false, viewport: null,
  args: ["--window-size=1380,900", "--disable-blink-features=AutomationControlled"],
});
let page = ctx.pages()[0] || (await ctx.newPage());
const report = { steps: [] };

// 1. 进教程
await page.goto(COURSE_MGMT, { waitUntil: "domcontentloaded", timeout: 30000 });
await sleep(2500);
if (page.url().includes("sso.unipus.cn")) {
  console.log(JSON.stringify({ needLogin: true }));
  await ctx.close(); process.exit(2);
}
if (!(await clickByText(page, BOOK, { exact: false }))) throw new Error("未找到教材");
await sleep(2500);

// 2. 切 Unit 2 + 点任务
const sw = await switchUnit(page, UNIT);
report.steps.push({ step: "switchUnit", ...sw });
const prevUrl = page.url();
let clicked = await clickByText(page, TASK, { exact: true });
let nav = clicked ? await waitNavigated(ctx, page, { prevUrl, ms: 10000 }) : null;
if (!nav) {
  clicked = await clickByText(page, TASK, { exact: true, mode: "js" });
  nav = clicked ? await waitNavigated(ctx, page, { prevUrl, ms: 10000 }) : null;
}
if (!nav) throw new Error("任务点击未跳转");
page = nav.page;

// 3. 内容就绪 + 校验小节
const { data: qs, dialogClosed } = await extractReady(page, { timeoutMs: 20000 });
report.steps.push({ step: "extract", dialogClosed, section: qs.section, wordBankCount: qs.wordBank.length, questionCount: qs.questions.length });
if (!qs.section.startsWith(EXPECT_SECTION.slice(0, 3))) {
  report.error = `落点小节=${qs.section}，期望=${EXPECT_SECTION}`;
  console.log(JSON.stringify(report, null, 1));
  if (!keep) await ctx.close(); process.exit(1);
}

// 4. 回填（节流在 fill_answers 外层逐空调用；这里逐空循环 + 1.5s 抖动）
const fills = [];
for (const [idx, answer] of Object.entries(ANSWERS)) {
  const r = await page.evaluate(scriptFn("fill_answers.js"), { index: Number(idx), answer });
  fills.push({ index: Number(idx), ok: r.ok, value: r.value });
  await sleep(1500 + Math.floor(Math.random() * 700));
}
report.steps.push({ step: "fill", fills });

// 5. 回读复核
const re = await page.evaluate(scriptFn("extract_questions.js"));
const verify = re.questions.map((q) => ({
  no: q.no, expected: ANSWERS[q.index] ?? null, actual: q.value,
  ok: ANSWERS[q.index] != null && q.value === ANSWERS[q.index],
}));
const allOk = verify.every((v) => v.ok);
report.steps.push({ step: "verify", allOk, verify });
if (!allOk) {
  console.log(JSON.stringify(report, null, 1));
  if (!keep) await ctx.close(); process.exit(1);
}

// 6. 提交（已授权自动提交）：点「提 交」→ 确认弹窗点「确 定」→ 等待判分
const submitted = await clickByText(page, "提 交", { exact: true }) || await clickByText(page, "提交", { exact: true });
await sleep(2500);
let confirmClicked = false;
for (const t of ["确 定", "确定"]) {
  if (await clickByText(page, t, { exact: true })) { confirmClicked = true; break; }
}
await sleep(4000);
const after = await page.evaluate(scriptFn("extract_questions.js"));
const pageText = await page.evaluate(() => document.body.innerText.slice(0, 2000));
report.steps.push({
  step: "submit", clicked: submitted, confirmClicked,
  hasSubmitAfter: after.hasSubmit,
  successToast: /提交成功|已提交|恭喜|成绩|正确率|答案解析|查看解析/.test(pageText),
  bodyTail: pageText.slice(-200),
});
console.log(JSON.stringify(report, null, 1));
if (!keep) await ctx.close();
