// serve.mjs — 常驻本地驱动：浏览器只启动一次，通过 127.0.0.1:8791 接收指令
// 复用 unipus-mcp 的 helpers，等价于 mcp__unipus__* 工具集
import http from "node:http";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join as pjoin } from "node:path";
import { chromium } from "playwright-core";
import {
  PROFILE_DIR, COURSE_MGMT, SKILL_ROOT, scriptFn, sleep, jitter,
  persistSessionCookies, clickByText, closeKnownDialog, waitNavigated, extractReady, switchUnit,
} from "./lib/helpers.js";

const PORT = 8791;
let ctx = null, page = null, lastDetailUrl = null;

async function ensureBrowser() {
  if (ctx && page && !page.isClosed()) return page;
  const launch = (channel) => chromium.launchPersistentContext(PROFILE_DIR, {
    channel, headless: false, viewport: null,
    args: ["--window-size=1380,900", "--disable-blink-features=AutomationControlled"],
  });
  try { ctx = await launch("chrome"); } catch (e) { console.error("chrome fail, try edge:", e.message); ctx = await launch("msedge"); }
  ctx.on("page", (p) => { page = p; });
  page = ctx.pages()[0] || (await ctx.newPage());
  // 原生对话框（如离开页面确认）会自动挂住页面 —— 一律自动接受
  ctx.on("page", (pg) => pg.on("dialog", (d) => d.accept().catch(() => {})));
  page.on("dialog", (d) => d.accept().catch(() => {}));
  return page;
}
async function goto(url) {
  const p = await ensureBrowser();
  await p.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  if (/resource-detail/.test(url)) lastDetailUrl = url;
  await sleep(jitter(1200));
  return p;
}
async function setWindowState(p, state) {
  try {
    const cdp = await p.context().newCDPSession(p);
    const { windowId } = await cdp.send("Browser.getWindowForTarget");
    const b = await cdp.send("Browser.getWindowBounds", { windowId });
    if (state === "normal" && b.windowState === "minimized") {
      await cdp.send("Browser.setWindowBounds", { windowId, windowState: "normal", left: b.left, top: b.top, width: b.width || 1380, height: b.height || 900 });
    } else {
      await cdp.send("Browser.setWindowBounds", { windowId, windowState: state });
    }
    return true;
  } catch (e) { return false; }
}

async function handle(cmd, q, body) {
  switch (cmd) {
    case "status": {
      const p = await goto(COURSE_MGMT);
      const url = p.url();
      const loggedIn = !url.includes("sso.unipus.cn");
      if (loggedIn) await persistSessionCookies(ctx);
      return { loggedIn, url, title: await p.title() };
    }
    case "courses": {
      const p = await goto(COURSE_MGMT);
      if (p.url().includes("sso.unipus.cn")) return { loggedIn: false, url: p.url() };
      await sleep(jitter(1500));
      return { loggedIn: true, data: await p.evaluate(scriptFn("list_courses.js")) };
    }
    case "open-course": {
      const p = await goto(COURSE_MGMT);
      await sleep(jitter(800));
      const prevUrl = p.url();
      const clicked = await clickByText(p, q.book, { exact: false, nth: Number(q.index || 0) });
      if (!clicked) return { ok: false, reason: "未找到教材名" };
      const nav = await waitNavigated(ctx, p, { prevUrl, ms: 9000 });
      page = nav ? nav.page : p;
      await closeKnownDialog(page);
      return { ok: true, url: page.url(), newTab: !!nav?.newTab };
    }
    case "tasks": {
      const p = await ensureBrowser();
      if (!p.url().includes("resource-detail")) return { ok: false, reason: "当前不在教程详情页", url: p.url() };
      if (q.unit) {
        const sw = await switchUnit(p, Number(q.unit));
        if (!sw.ok) return { ok: false, reason: `切到 Unit ${q.unit} 失败` };
        await sleep(jitter(900));
      }
      return { ok: true, url: p.url(), data: await p.evaluate(scriptFn("list_tasks.js")) };
    }
    case "open-task": {
      const p = await ensureBrowser();
      if (q.hash) {
        const base = p.url().split("#")[0];
        const np = await goto(base + "#" + q.hash);
        await sleep(jitter(1800));
        const dc = await closeKnownDialog(np);
        page = np;
        return { ok: true, url: np.url(), dialogClosed: dc };
      }
      if (!p.url().includes("resource-detail")) return { ok: false, reason: "请先进入教程详情页", url: p.url() };
      const prevUrl = p.url();
      let clicked = await clickByText(p, q.title, { exact: true });
      let nav = clicked ? await waitNavigated(ctx, p, { prevUrl, ms: 10000 }) : null;
      if (!nav) { clicked = await clickByText(p, q.title, { exact: true, mode: "js" }); nav = clicked ? await waitNavigated(ctx, p, { prevUrl, ms: 10000 }) : null; }
      if (!nav) return { ok: false, reason: "点击后未跳转（UI/JS 均无效）" };
      page = nav.page;
      await sleep(jitter(1200));
      const dc = await closeKnownDialog(page);
      return { ok: true, url: page.url(), newTab: nav.newTab, dialogClosed: dc };
    }
    case "login": {
      const username = body?.username, password = body?.password;
      const p = await ensureBrowser();
      if (!p.url().includes("sso.unipus.cn")) return { needLogin: false, url: p.url(), note: "当前不在 SSO 页" };
      await setWindowState(p, "normal");
      const user = p.getByRole("textbox", { name: /手机号|用户名|邮箱/ }).first();
      if ((await user.count()) === 0) {
        const snap = await p.evaluate(() => (document.body.innerText || "").slice(0, 400));
        return { needHuman: true, reason: "登录页结构不符", url: p.url(), snap };
      }
      await user.fill(username); await sleep(jitter(600));
      await p.getByRole("textbox", { name: "密码" }).first().fill(password); await sleep(jitter(600));
      const agree = p.getByRole("checkbox", { name: /已阅读并同意/ });
      if ((await agree.count()) >= 1 && !(await agree.first().isChecked())) await agree.first().check().catch(() => {});
      await sleep(jitter(500));
      await p.getByRole("button", { name: "登录" }).first().click();
      await sleep(3500);
      const url = p.url();
      const bodyText0 = await p.evaluate(() => (document.body.innerText || "").slice(0, 400));
      const needHuman = url.includes("sso.unipus.cn") && /拖动滑块|验证码|安全验证/.test(bodyText0);
      if (!url.includes("sso.unipus.cn")) await persistSessionCookies(ctx);
      return { loggedIn: !url.includes("sso.unipus.cn"), needHuman, url, bodyText0 };
    }
    case "click-row": {
      const p = await ensureBrowser();
      const { title, unit } = q;
      const nth = Number(q.nth || 0);
      const tag = "data-unipus-row-" + Date.now();
      const lookup = ({ title, nth, tag }) => {
        // 每个单元一个容器，只有当前激活单元可见；必须取可见容器（隐藏单元 innerText 会粘连）
        const cs = [...document.querySelectorAll("div[class*=courseDetailNodeCollapseContainer]")];
        const scope = cs.find((c) => c.offsetParent !== null) || cs[0] || document;
        const rows = [...scope.querySelectorAll("div[class*=courses-unit_taskItemContainer]")];
        const hits = [];
        for (const r of rows) {
          const inner = r.querySelector("div[class*=taskItemInnerLayout]");
          const t = ((inner && inner.children[0] && inner.children[0].innerText) || "").trim().replace(/\s+/g, " ");
          const clean = t.replace(/(必修|选修)/g, "").trim();
          if (clean === title.trim()) hits.push({ r, t });
        }
        if (!hits.length) return null;
        const k = Math.min(nth, hits.length - 1);
        hits[k].r.setAttribute(tag, "1");
        return { t: hits[k].t, total: hits.length, picked: k };
      };
      let found = null;
      for (let attempt = 0; attempt < 5 && !found; attempt++) {
        // 详情页 SPA 未渲染完时切单元会静默失败 —— 重试，必要时回退到详情页
        if (attempt > 0 && !/resource-detail/.test(p.url()) && lastDetailUrl) {
          await p.goto(lastDetailUrl, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
          await sleep(1800);
        }
        if (unit) { try { await clickByText(p, `Unit ${unit}`, { exact: true }); } catch {} await sleep(jitter(900)); }
        found = await p.evaluate(lookup, { title, nth, tag });
        if (!found) await sleep(1300);
      }
      if (!found) return { ok: false, reason: "row not found", title, unit };
      const prevUrl = p.url();
      const loc = p.locator(`[${tag}]`);
      try { await loc.scrollIntoViewIfNeeded(); await sleep(300); await loc.click({ timeout: 3000 }); }
      catch { await p.evaluate((t) => document.querySelector(`[${t}]`).click(), tag).catch(() => {}); }
      await p.evaluate((t) => document.querySelector(`[${t}]`)?.removeAttribute(t), tag).catch(() => {});
      const nav = await waitNavigated(ctx, p, { prevUrl, ms: 10000 });
      page = nav ? nav.page : p;
      await sleep(jitter(1200));
      await closeKnownDialog(page);
      return { ok: true, found, url: page.url(), newTab: !!nav?.newTab };
    }
    case "extract": {
      const p = await ensureBrowser();
      let data = null, dialogClosed = false;
      const deadline = Date.now() + 15000;
      while (Date.now() < deadline) {
        if ((await p.getByText("我知道了", { exact: true }).count()) === 1) {
          await p.getByText("我知道了", { exact: true }).click(); dialogClosed = true; await sleep(800);
        }
        data = await p.evaluate(scriptFn("extract_questions_v2.js"));
        if (data.questions.length) break;
        await sleep(900);
      }
      return { ok: true, url: p.url(), dialogClosed, data };
    }
    case "raw-extract": {
      const p = await ensureBrowser();
      return { ok: true, url: p.url(), data: await p.evaluate(scriptFn("extract_questions.js")) };
    }
    case "nav": {
      const p = await goto(q.url);
      await sleep(jitter(1500));
      const dc = await closeKnownDialog(p);
      return { ok: true, url: p.url(), dialogClosed: dc };
    }
    case "click": {
      const p = await ensureBrowser();
      const ok = await clickByText(p, q.text, { exact: q.exact !== "0" });
      await sleep(jitter(700));
      return { ok, url: p.url() };
    }
    case "fill": {
      const answers = body?.answers || {};
      const dryRun = !!body?.dryRun;
      const p = await ensureBrowser();
      const results = [];
      const entries = Object.entries(answers).sort((a, b) => Number(a[0]) - Number(b[0]));
      for (const [idx, answer] of entries) {
        const r = await p.evaluate(scriptFn("fill_answers_v2.js"), { index: Number(idx), answer, dryRun });
        results.push({ index: Number(idx), ...r });
        if (!dryRun) await sleep(jitter(1600));
      }
      let verify = null;
      if (!dryRun) {
        const data = await p.evaluate(scriptFn("extract_questions_v2.js"));
        verify = data.questions.map((qq) => ({ no: qq.no, index: qq.index, type: qq.type, expected: answers[String(qq.index)] ?? null, actual: qq.value, ok: answers[String(qq.index)] != null && qq.value === answers[String(qq.index)] }));
      }
      return { results, verify, allOk: verify ? verify.every((v) => v.ok) : true };
    }
    case "submit": {
      const p = await ensureBrowser();
      await closeKnownDialog(p);
      const clicked = await clickByText(p, "提 交", { exact: true }) || await clickByText(p, "提交", { exact: true });
      if (!clicked) return { ok: false, reason: "未找到提交按钮" };
      await sleep(2000);
      let confirmClicked = false;
      for (const t of ["确 定", "确定"]) { if (await clickByText(p, t, { exact: true })) { confirmClicked = true; break; } }
      await sleep(3500);
      const data = await p.evaluate(scriptFn("extract_questions_v2.js"));
      await closeKnownDialog(p);
      const pageText = await p.evaluate(() => document.body.innerText.slice(0, 2500));
      return { ok: true, confirmClicked, hasSubmitAfter: data.hasSubmit, successSignal: /提交成功|已提交|恭喜|成绩|正确率|得分/.test(pageText), pageText: pageText.slice(0, 800) };
    }
    case "stay": {
      const minutes = Number(q.minutes || 1);
      const p = await ensureBrowser();
      await setWindowState(p, "normal");
      const end = Date.now() + minutes * 60000;
      let n = 0;
      while (Date.now() < end) { await sleep(Math.min(60000, end - Date.now())); n++; console.error(`[stay] 心跳 #${n} 剩余 ${Math.max(0, Math.round((end - Date.now()) / 60000))} 分钟`); }
      return { stayedMinutes: minutes, url: p.url() };
    }
    case "shot": {
      const p = await ensureBrowser();
      await setWindowState(p, "normal");
      const file = q.file || "shot.png";
      await p.screenshot({ path: file });
      return { ok: true, file, url: p.url() };
    }
    case "snapshot": {
      const p = await ensureBrowser();
      return { ok: true, url: p.url(), text: await p.locator("body").ariaSnapshot() };
    }
    case "eval": {
      const p = await ensureBrowser();
      const js = q.js ?? body?.js;
      const r = await p.evaluate(js);
      return { ok: true, url: p.url(), result: r };
    }
    case "window": {
      const p = await ensureBrowser();
      return { ok: await setWindowState(p, q.action === "show" ? "normal" : "minimized"), state: q.action };
    }
    case "kb": {
      const KB_DIR = pjoin(SKILL_ROOT, "knowledge");
      const hits = [];
      const walk = (dir) => {
        for (const name of readdirSync(dir)) {
          const full = pjoin(dir, name);
          if (statSync(full).isDirectory()) { walk(full); continue; }
          if (!name.endsWith(".md")) continue;
          if (q.book && !full.includes(q.book)) continue;
          readFileSync(full, "utf8").split("\n").forEach((line, i) => {
            if (line.includes(q.query)) hits.push({ file: full.slice(KB_DIR.length + 1), line: i + 1, text: line.trim().slice(0, 400) });
          });
        }
      };
      walk(KB_DIR);
      return { total: hits.length, hits: hits.slice(0, Number(q.max || 60)) };
    }
    case "quit": {
      try { await ctx?.close(); } catch {}
      setTimeout(() => process.exit(0), 300);
      return { ok: true, bye: true };
    }
    default: return { error: "unknown cmd", cmd };
  }
}

const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://127.0.0.1");
  const cmd = u.pathname.replace(/^\//, "") || u.searchParams.get("cmd");
  const q = Object.fromEntries(u.searchParams.entries());
  if (req.method === "GET" && u.pathname === "/ping") { res.end(JSON.stringify({ ok: true })); return; }
  let chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", async () => {
    let body = null;
    if (chunks.length) { try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch {} }
    try {
      const result = await handle(cmd, q, body);
      res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(result));
    } catch (e) {
      res.writeHead(500, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: e.stack || e.message }));
    }
  });
});
server.listen(PORT, "127.0.0.1", () => console.error(`[unipus-drive] listening on http://127.0.0.1:${PORT}`));
