import { chromium } from "playwright-core";
import { PROFILE_DIR, COURSE_MGMT, scriptFn, sleep, clickByText, waitNavigated, switchUnit, extractReady } from "./lib/helpers.js";
const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
  channel: "chrome", headless: false, viewport: null,
  args: ["--window-size=1380,900", "--disable-blink-features=AutomationControlled"],
});
let page = ctx.pages()[0] || (await ctx.newPage());
await page.goto(COURSE_MGMT, { waitUntil: "domcontentloaded", timeout: 30000 });
await sleep(2500);
await clickByText(page, "综合教程 3", { exact: false });
await sleep(2500);
await switchUnit(page, 2);
const prevUrl = page.url();
let clicked = await clickByText(page, "Banked cloze", { exact: true });
let nav = clicked ? await waitNavigated(ctx, page, { prevUrl, ms: 10000 }) : null;
if (!nav) { clicked = await clickByText(page, "Banked cloze", { exact: true, mode: "js" }); nav = clicked ? await waitNavigated(ctx, page, { prevUrl, ms: 10000 }) : null; }
page = nav.page;
await sleep(2000);
const { data } = await extractReady(page, { timeoutMs: 20000 });
// 空的当前值 + 页脚区域文本 + 可见弹层
const state = await page.evaluate(() => {
  const text = (el) => (el?.innerText || "").trim();
  const inputs = [...document.querySelectorAll('input[type="text"], input:not([type]), textarea')]
    .filter((i) => !i.disabled && i.offsetParent !== null);
  const values = inputs.map((i) => i.value);
  // 找「提 交」按钮及其可点祖先链
  let submitInfo = null;
  for (const el of document.body.querySelectorAll("*")) {
    if (/^提\s*交$/.test(text(el)) && el.offsetParent !== null) {
      const chain = [];
      let n = el;
      for (let i = 0; i < 5 && n && n !== document.body; i++) {
        chain.push({ tag: n.tagName, cls: (n.className||"").toString().slice(0,80), onclick: !!n.onclick });
        n = n.parentElement;
      }
      submitInfo = chain; break;
    }
  }
  // 可见 modal/弹层
  const modals = [...document.querySelectorAll("[class*=modal], [class*=Modal], [class*=dialog], [class*=Dialog], [class*=popup], [class*=toast], [class*=message]")]
    .filter((el) => el.offsetParent !== null && text(el))
    .map((el) => ({ cls: (el.className||"").toString().slice(0,80), text: text(el).slice(0,120) }))
    .slice(0, 8);
  return { inputValues: values, submitChain: submitInfo, modals, footerText: text(document.querySelector("[class*=footer], footer") || document.body).slice(-200) };
});
console.log(JSON.stringify({ section: data.section, qCount: data.questions.length, hasSubmit: data.hasSubmit, ...state }, null, 1));
await ctx.close();
