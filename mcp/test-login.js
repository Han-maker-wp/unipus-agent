// test-login.js — unipus-mcp 冒烟测试：登录 + 列课程。
// 用法：UNIPUS_USER=... UNIPUS_PASS=... node test-login.js [--no-close]
// 凭据只从环境变量读取，不写盘。--no-close 保留浏览器供人工查看（下次运行前需手动关闭）。
import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const ROOT = dirname(fileURLToPath(import.meta.url));
const PROFILE_DIR = join(ROOT, "profile");
const SKILL_ROOT = resolve(ROOT, "..");
const COURSE_MGMT = "https://uai.unipus.cn/app/cmgt/course-management";
const scriptFn = (name) => eval(readFileSync(join(SKILL_ROOT, "scripts", name), "utf8"));

const keep = process.argv.includes("--no-close");
const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
  channel: "chrome", headless: false, viewport: null,
  args: ["--window-size=1380,900", "--disable-blink-features=AutomationControlled"],
});

// SSO 登录态是会话 cookie，进程退出即丢；改写 expires 为 180 天让 profile 落盘。
async function persistSessionCookies() {
  const cookies = await ctx.cookies();
  if (!cookies.length) return;
  const future = Math.floor(Date.now() / 1000) + 86400 * 180;
  await ctx.addCookies(cookies.map((c) => (c.expires > 0 ? c : { ...c, expires: future })));
  console.error(`已持久化 ${cookies.length} 条 cookie`);
}
let page = ctx.pages()[0] || (await ctx.newPage());
await page.goto(COURSE_MGMT, { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForTimeout(2500);

let url = page.url();
if (url.includes("sso.unipus.cn")) {
  const user = process.env.UNIPUS_USER, pass = process.env.UNIPUS_PASS;
  if (!user || !pass) {
    console.log(JSON.stringify({ step: "login", needEnv: true, url }));
    if (!keep) await ctx.close();
    process.exit(1);
  }
  await page.getByRole("textbox", { name: /手机号|用户名|邮箱/ }).first().fill(user);
  await page.waitForTimeout(700);
  await page.getByRole("textbox", { name: "密码" }).first().fill(pass);
  await page.waitForTimeout(500);
  const agree = page.getByRole("checkbox", { name: /已阅读并同意/ });
  if ((await agree.count()) === 1 && !(await agree.isChecked())) await agree.check();
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: "登录" }).first().click();
  await page.waitForTimeout(3500);
  url = page.url();
  let bodyText = await page.evaluate(() => document.body.innerText.slice(0, 400));
  if (/拖动滑块|验证码|安全验证/.test(bodyText) || url.includes("sso.unipus.cn")) {
    console.log(JSON.stringify({ step: "login", needHuman: true, note: "请在弹出的浏览器窗口完成滑块/验证，脚本每2秒轮询最多180秒" }));
    const deadline = Date.now() + 180000;
    while (Date.now() < deadline) {
      await page.waitForTimeout(2000);
      url = page.url();
      if (!url.includes("sso.unipus.cn")) break;
      bodyText = await page.evaluate(() => document.body.innerText.slice(0, 400));
      if (!/拖动滑块|验证码|安全验证/.test(bodyText) && !url.includes("sso.unipus.cn")) break;
    }
    if (url.includes("sso.unipus.cn")) {
      console.log(JSON.stringify({ step: "login", timeout: true, note: "等待人工验证超时" }));
      if (!keep) await ctx.close();
      process.exit(2);
    }
  }
}

const loggedIn = !url.includes("sso.unipus.cn");
if (loggedIn) await persistSessionCookies();
let courses = null;
if (loggedIn) {
  await page.waitForTimeout(2000);
  courses = await page.evaluate(scriptFn("list_courses.js"));
}
console.log(JSON.stringify({ step: "done", loggedIn, url, courses }, null, 1));
if (!keep) await ctx.close();
