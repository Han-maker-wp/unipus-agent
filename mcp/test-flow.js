// test-flow.js — unipus-mcp 全链路冒烟：进教程 → 切 Unit → 开任务 → 提取题目（只读，不填不提交）
// 用法：node test-flow.js [bookName片段] [unit编号] [任务名]
import { chromium } from "playwright-core";
import {
  PROFILE_DIR, COURSE_MGMT, scriptFn, sleep, clickByText, closeKnownDialog, waitNavigated, extractReady, switchUnit,
} from "./lib/helpers.js";

const BOOK = process.argv[2] || "综合教程 3";
const UNIT = Number(process.argv[3] || 1);
const TASK = process.argv[4] || "Banked cloze";

const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
  channel: "chrome", headless: false, viewport: null,
  args: ["--window-size=1380,900", "--disable-blink-features=AutomationControlled"],
});
let page = ctx.pages()[0] || (await ctx.newPage());

// 1. 课程管理页 → 点教材名进教程详情
await page.goto(COURSE_MGMT, { waitUntil: "domcontentloaded", timeout: 30000 });
await sleep(2500);
if (page.url().includes("sso.unipus.cn")) {
  console.log(JSON.stringify({ step: "course", needLogin: true, url: page.url() }));
  await ctx.close(); process.exit(2);
}
if (!(await clickByText(page, BOOK, { exact: false }))) {
  console.log(JSON.stringify({ step: "course", error: `未找到教材「${BOOK}」` }));
  await ctx.close(); process.exit(1);
}
await sleep(2500);

// 2. 切 Unit 页签（带验证）
const sw = await switchUnit(page, UNIT);

// 3. 点任务条目（等跳转到 courseware；UI 点击无效则降级 JS 直点）
const prevUrl = page.url();
let clicked = await clickByText(page, TASK, { exact: true });
let nav = clicked ? await waitNavigated(ctx, page, { prevUrl, ms: 10000 }) : null;
if (!nav) {
  clicked = await clickByText(page, TASK, { exact: true, mode: "js" });
  nav = clicked ? await waitNavigated(ctx, page, { prevUrl, ms: 10000 }) : null;
}
if (!nav) {
  console.log(JSON.stringify({ step: "task", error: "点击后未跳转", url: page.url() }));
  await ctx.close(); process.exit(1);
}
page = nav.page;
await sleep(1500);

// 4. 内容就绪 + 提取题目
const { data: qs, dialogClosed } = await extractReady(page, { timeoutMs: 20000 });
console.log(JSON.stringify({
  step: "done", unitSwitch: sw, taskUrl: page.url(), dialogClosed, extract: qs,
}, null, 1));
await ctx.close();
