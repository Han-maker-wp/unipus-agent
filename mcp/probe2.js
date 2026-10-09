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
const info = await page.evaluate(() => {
  const text = (el) => (el?.innerText || "").trim();
  const out = [];
  for (const el of document.body.querySelectorAll("*")) {
    if (text(el) === "Banked cloze" && el.children.length === 0) {
      const vis = el.offsetParent !== null;
      // 向上找最近的 "N-M xxx" 小节标题或单元上下文
      let up = el, ctxLabel = "";
      for (let i = 0; i < 10 && up; i++) {
        const m = (up.innerText || "").match(/(\d+-\d+)\s+(Read and practice|Read and understand)/);
        if (m) { ctxLabel = m[1]; break; }
        up = up.parentElement;
      }
      out.push({ visible: vis, section: ctxLabel, cls: (el.className||"").slice(0,60) });
    }
  }
  // 单元页签结构：是 tabs 还是 accordion
  const unitTabs = [...document.querySelectorAll("*")].filter(e => text(e) === "Unit 1").map(e => ({
    tag: e.tagName, cls: (e.className||"").toString().slice(0,80), visible: e.offsetParent !== null, hasOnClick: !!e.onclick,
  }));
  const collapseHeaders = [...document.querySelectorAll(".ant-collapse-header, [class*=collapse]")].length;
  return { bankedClozeRows: out, unitEls: unitTabs, collapseHeaders };
});
console.log(JSON.stringify(info, null, 1));
await ctx.close();
