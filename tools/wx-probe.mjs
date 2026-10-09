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
  const r = await page.evaluate(() => {
    const jc = document.getElementById("js_content");
    const body = (document.body && document.body.innerText) || "";
    // 只看「可见」的按钮：隐藏的 DOM 模板不算数（微信页面里常驻隐藏的确认弹窗）
    const visBtns = Array.from(document.querySelectorAll("a,button"))
      .filter((b) => {
        const st = getComputedStyle(b);
        return st.display !== "none" && st.visibility !== "hidden" && (b.innerText || "").trim();
      })
      .map((b) => (b.innerText || "").trim().slice(0, 16));
    const dlg = document.querySelector(".weui-dialog, .weui-mask");
    return {
      title: document.title.slice(0, 60),
      links: document.querySelectorAll('a[href*="mp.weixin.qq.com/s?"]').length,
      jcImgs: jc ? jc.querySelectorAll("img").length : -1,
      jcDataSrc: jc ? (jc.innerHTML.match(/data-src=/g) || []).length : -1,
      bodyLen: body.length,
      dialogDisplay: dlg ? getComputedStyle(dlg).display : "none",
      gateVisible: body.includes("请确认是否继续访问"),
      hasContinueBtn: visBtns.includes("继续访问"),
      btns: [...new Set(visBtns)].slice(0, 12),
      text: body.replace(/\s+/g, " ").slice(0, 240),
    };
  });
  console.log(
    `[${tag}] title="${r.title}" links=${r.links} jcImgs=${r.jcImgs} jcDataSrc=${r.jcDataSrc} ` +
    `bodyLen=${r.bodyLen} dialog=${r.dialogDisplay} gateVisible=${r.gateVisible} continueBtn=${r.hasContinueBtn}`
  );
  console.log(`       btns=${JSON.stringify(r.btns)}`);
  console.log(`       text="${r.text}"`);
  return r;
};

// 判定：正常 / 空壳 / 被确认页拦 / 被验证码拦 / 账号被封
function verdict(r) {
  if (r.text.includes("已被屏蔽")) return "❌ 账号已被屏蔽（永久）";
  if (r.text.includes("环境异常")) return "⚠️ 环境异常（需人工验证）";
  if (r.gateVisible || r.hasContinueBtn) return "⚠️ 「继续访问」确认页（可点掉）";
  if (r.links === 0 && r.jcImgs <= 1) return "⚠️ 疑似空壳文章（无单元链接、正文 ≤1 图）";
  if (r.links > 0 && r.jcImgs === 0) return "⚠️ 书文章正常（有单元链接），但正文 0 图";
  if (r.links === 0 && r.jcImgs > 1) return "✅ 单元文章正常（正文有多图）";
  return "✅ 书文章正常（有单元链接）";
}

const before = await snap("before");
console.log(`[判定] ${verdict(before)}`);

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
  const after = await snap("after");
  console.log(`[判定] ${verdict(after)}`);
}

if (out) {
  const html = await page.content();
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, html, "utf8");
  console.log(`[dump] ${out} (${html.length} bytes)`);
}

await page.close().catch(() => {});
process.exit(0);
