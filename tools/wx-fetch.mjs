// wx-fetch.mjs — 用 playwright-core + 系统 Chrome 抓取 mp.weixin.qq.com 文章 HTML
//
// 用法：
//   node wx-fetch.mjs <url> <out.html>            # 单篇
//   node wx-fetch.mjs --list urls.txt <outdir>    # 批量（每行一个 URL，# 开头忽略）
//
// 反爬纪律（沿用 references/kb-builder.md 实测结论）：
//   - 持久 profile（.cache/wxprofile）积累微信白名单 cookie，重试 2-5 次即过 poc 挑战
//   - 单篇之间 sleep 8-12s + 抖动
//   - 被拦（无 #js_content）→ 冷却 60s 重试，最多 3 次
//   - 每篇抓完立刻落盘（断点续跑）
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));   // tools/
const ROOT = resolve(HERE, "..");                        // 仓库根
const PROFILE = join(ROOT, ".cache", "wxprofile");
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";

// playwright-core 装在 mcp/node_modules（ESM 不认 NODE_PATH，用 createRequire 从那里解析）
const require = createRequire(join(ROOT, "mcp", "package.json"));
const { chromium } = require("playwright-core");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = (base) => base + Math.floor(Math.random() * base * 0.4);

function parseArgs(argv) {
  const a = argv.slice(2);
  if (a[0] === "--list") return { mode: "list", listFile: a[1], outDir: a[2] };
  return { mode: "single", url: a[0], out: a[1] };
}

async function waitContent(page) {
  try {
    await page.waitForSelector("#js_content", { timeout: 10000 });
    return true;
  } catch {
    return false;
  }
}

// 判断是「账号被封」（永久）还是「环境异常」（可重试）
async function classify(page) {
  const t = (await page.locator("body").innerText().catch(() => "")).slice(0, 200);
  if (t.includes("已被屏蔽")) return "banned";
  if (t.includes("环境异常")) return "captcha";
  return "other";
}

async function fetchOne(page, url, outPath) {
  for (let round = 1; round <= 4; round++) {
    // 每轮内快速重试若干次（kb-builder.md：间隔 2.5-4s 重试即过）
    for (let i = 0; i < 5; i++) {
      try { await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 }); } catch { /* poc 重定向 ERR_ABORTED */ }
      if (await waitContent(page)) {
        const html = await page.content();
        mkdirSync(dirname(outPath), { recursive: true });
        writeFileSync(outPath, html, "utf8");
        const title = (await page.title()).slice(0, 60);
        return { ok: true, title, size: html.length };
      }
      const kind = await classify(page);
      if (kind === "banned") return { ok: false, title: "账号已被屏蔽", banned: true };
      await sleep(jitter(3000));
    }
    console.error(`  [round ${round}] 仍被拦，冷却 45s`);
    await sleep(45000);
  }
  return { ok: false, title: "环境异常(验证未通过)" };
}

const args = parseArgs(process.argv);
mkdirSync(PROFILE, { recursive: true });

// WX_CDP=1：接管已带 --remote-debugging-port 的普通 Chrome（无自动化指纹，微信放行）
let ctx, owned = false, page;
if (process.env.WX_CDP === "1") {
  const port = process.env.WX_PORT || "9222";
  const browser = await chromium.connectOverCDP(`http://localhost:${port}`);
  ctx = browser.contexts()[0];
  page = await ctx.newPage();          // 新开标签页，不动用户已有的窗口
  console.log(`[CDP] 已接管 localhost:${port} 的浏览器`);
} else {
  ctx = await chromium.launchPersistentContext(PROFILE, {
    executablePath: CHROME,
    headless: process.env.WX_HEADED !== "1",
    args: ["--disable-blink-features=AutomationControlled", "--no-first-run", "--no-default-browser-check"],
    viewport: { width: 1280, height: 900 },
  });
  owned = true;
  await ctx.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  });
  page = ctx.pages()[0] || (await ctx.newPage());
}

let ok = 0, fail = 0;
if (args.mode === "single") {
  const r = await fetchOne(page, args.url, args.out);
  console.log(JSON.stringify(r, null, 1));
  ok += r.ok ? 1 : 0; fail += r.ok ? 0 : 1;
} else {
  const urls = readFileSync(args.listFile, "utf8")
    .split(/\r?\n/).map((s) => s.trim())
    .filter((s) => s && !s.startsWith("#"));
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    // 用 mid+idx 做文件名，稳定且可断点续跑
    const m = url.match(/mid=(\d+).*?idx=(\d+)/);
    const name = m ? `art-${m[1]}-${m[2]}.html` : `art-${i}.html`;
    const outPath = join(args.outDir, name);
    if (existsSync(outPath) && readFileSync(outPath, "utf8").includes("js_content")) {
      console.log(`[${i + 1}/${urls.length}] skip（已有） ${name}`);
      ok++;
      continue;
    }
    const r = await fetchOne(page, url, outPath);
    if (r.ok) { ok++; console.log(`[${i + 1}/${urls.length}] OK ${name}  «${r.title}»`); }
    else { fail++; console.log(`[${i + 1}/${urls.length}] FAIL ${url}`); }
    if (i < urls.length - 1) await sleep(jitter(9000));
  }
}

if (!owned && page) await page.close().catch(() => {});
await (owned ? ctx.close() : Promise.resolve());
console.log(`\n完成：成功 ${ok} / 失败 ${fail}`);
process.exit(fail ? 1 : 0);
