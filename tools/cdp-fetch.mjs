// cdp-fetch.mjs — 通用页面抓取（接管带调试端口的 Chrome）
// 用法：node cdp-fetch.mjs <url> <out.html> [selector] [waitMs]
import { createRequire } from "node:module";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const require = createRequire(join(ROOT, "mcp", "package.json"));
const { chromium } = require("playwright-core");

const [url, out, selector, waitMs] = process.argv.slice(2);
const browser = await chromium.connectOverCDP(`http://localhost:${process.env.WX_PORT || "9222"}`);
const ctx = browser.contexts()[0];
const page = await ctx.newPage();
try { await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 }); } catch (e) { console.error("goto:", e.message); }
if (selector) { try { await page.waitForSelector(selector, { timeout: 15000 }); } catch { console.error("selector 超时:", selector); } }
await new Promise((r) => setTimeout(r, Number(waitMs) || 3000));
const text = await page.locator("body").innerText().catch(() => "");
console.log("TITLE:", await page.title());
console.log("URL:", page.url());
console.log("TEXTLEN:", text.length);
console.log("----- TEXT HEAD -----");
console.log(text.slice(0, 3000));
mkdirSync(dirname(resolve(out)), { recursive: true });
writeFileSync(resolve(out), await page.content(), "utf8");
writeFileSync(resolve(out) + ".txt", text, "utf8");
await page.close();
