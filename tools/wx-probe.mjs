// wx-probe.mjs — 在已接管的普通 Chrome 里打开一篇微信文章，输出诊断信息，
// 并尝试点掉「第三方商业营销信息 / 继续访问」确认页。
//
// 用法：WX_CDP=1 node tools/wx-probe.mjs "<url>" [out.html]
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync, mkdirSync } from "node:fs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const require = createRequire(join(ROOT, "mcp", "package.json"));
const { chromium } = require("playwright-core");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const url = process.argv[2];
const out = process.argv[3];

const browser = await chromium.connectOverCDP(`http://localhost:${process.env.WX_PORT || 9222}`);
const ctx = browser.contexts()[0];
const page = await ctx.newPage();

await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
await sleep(3500);

const snap = async (tag) => {
  const t = (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 300);
  const links = await page.evaluate(() =>
    Array.from(document.querySelectorAll('a[href*="mp.weixin.qq.com/s?"]')).length
  );
  const imgs = await page.evaluate(() =>
    Array.from(document.querySelectorAll("#js_content img")).length
  );
  console.log(`[${tag}] links=${links} imgs=${imgs} text="${t}"`);
  return { links, imgs };
};

await snap("before");

// 尝试点掉确认页
let clicked = false;
for (const sel of [
  'a.weui-btn_primary:has-text("继续访问")',
  'button:has-text("继续访问")',
  'a:has-text("继续访问")',
]) {
  try {
    const el = page.locator(sel).first();
    if (await el.count()) {
      await el.click({ timeout: 3000 });
      clicked = true;
      console.log(`[click] ${sel}`);
      break;
    }
  } catch (e) {
    console.log(`[click-fail] ${sel}: ${e.message.slice(0, 80)}`);
  }
}
// 兜底：仅当页面确实出现「继续访问」确认页时，才用 JS 直接点击其主按钮
if (!clicked) {
  const r = await page.evaluate(() => {
    const body = (document.body && document.body.innerText) || "";
    if (!body.includes("继续访问")) return "skip:no-gate";
    const btns = Array.from(document.querySelectorAll("a,button"));
    const hit = btns.filter((b) => (b.innerText || "").trim() === "继续访问");
    if (hit.length) { hit[hit.length - 1].click(); return "js-click:" + hit.length; }
    const prim = document.querySelector("a.weui-btn_primary");
    if (prim) { prim.click(); return "js-primary"; }
    return "none";
  }).catch((e) => "err:" + e.message.slice(0, 60));
  console.log(`[js-click] ${r}`);
  clicked = r.startsWith("js-");
}
if (clicked) {
  await sleep(4500);
  await snap("after");
}

if (out) {
  const html = await page.content();
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, html, "utf8");
  console.log(`[dump] ${out} (${html.length} bytes)`);
}

await page.close().catch(() => {});
process.exit(0);
