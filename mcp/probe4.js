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
console.log("section:", data.section, "q:", data.questions.length, "filled:", data.questions.filter(q=>q.value).length);

// 提交前截图 + footer 结构
await page.screenshot({ path: "shot-before-submit.png" });
const footerInfo = await page.evaluate(() => {
  const foot = document.querySelector("footer.ant-layout-footer");
  if (!foot) return { err: "no footer" };
  const anchors = [...foot.querySelectorAll("a")].map((a) => ({
    cls: (a.className||"").toString(), text: (a.innerText||"").trim(), href: a.getAttribute("href"), id: a.id,
  }));
  return { footerText: (foot.innerText||"").trim().slice(0,100), anchors };
});
console.log("footerInfo:", JSON.stringify(footerInfo, null, 1));

// 点 footer 里的 a.btn 本体
const tag = "data-probe-submit-" + Date.now();
await page.evaluate((tag) => {
  const a = document.querySelector("footer.ant-layout-footer a.btn") 
    || [...document.querySelectorAll("footer a")].find((x) => /提\s*交/.test(x.innerText));
  if (a) a.setAttribute(tag, "1");
}, tag);
const aLoc = page.locator(`[${tag}]`);
const aCount = await aLoc.count();
if (aCount === 1) {
  await aLoc.click({ timeout: 5000 }).catch(async (e) => {
    console.log("locator click failed:", e.message.split("\n")[0]);
    const box = await aLoc.boundingBox();
    if (box) await page.mouse.click(box.x + box.width/2, box.y + box.height/2);
  });
  console.log("clicked a.btn");
}
await page.evaluate((t) => document.querySelector(`[${t}]`)?.removeAttribute(t), tag);
await sleep(4000);
await page.screenshot({ path: "shot-after-submit.png" });
const after = await page.evaluate(() => {
  const text = (el) => (el?.innerText || "").trim();
  const modals = [...document.querySelectorAll(".ant-modal-root, [class*=modal], [class*=Modal]")]
    .filter((el) => el.offsetParent !== null && text(el))
    .map((el) => ({ cls: (el.className||"").toString().slice(0,60), text: text(el).slice(0,150) }))
    .slice(0, 5);
  return { modals, bodyTail: text(document.body).slice(-250) };
});
console.log("after:", JSON.stringify(after, null, 1));
await ctx.close();
