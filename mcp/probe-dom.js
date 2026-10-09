import { chromium } from "playwright-core";
import { PROFILE_DIR, COURSE_MGMT, sleep, clickByText } from "./lib/helpers.js";
const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
  channel: "chrome", headless: false, viewport: null,
  args: ["--window-size=1380,900", "--disable-blink-features=AutomationControlled"],
});
const page = ctx.pages()[0] || (await ctx.newPage());
await page.goto(COURSE_MGMT, { waitUntil: "domcontentloaded", timeout: 30000 });
await sleep(2500);
if (page.url().includes("sso.unipus.cn")) { console.log("NEED_LOGIN"); await ctx.close(); process.exit(2); }
await clickByText(page, "综合教程 3", { exact: false });
await sleep(2500);
await clickByText(page, "Unit 1", { exact: true });
await sleep(1500);
const info = await page.evaluate(() => {
  const text = (el) => (el?.innerText || "").trim();
  let el = null;
  for (const e of document.body.querySelectorAll("*")) {
    if (text(e) === "Banked cloze" && e.children.length === 0 && e.offsetParent !== null) { el = e; break; }
  }
  if (!el) return null;
  const chain = [];
  let n = el;
  for (let i = 0; i < 6 && n && i < 10; i++) {
    chain.push({ tag: n.tagName, cls: (n.className || "").toString().slice(0, 120), hasOnClick: !!n.onclick, children: n.children.length });
    n = n.parentElement;
  }
  return chain;
});
console.log(JSON.stringify(info, null, 1));
await ctx.close();
