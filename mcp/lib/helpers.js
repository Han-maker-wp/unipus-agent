// lib/helpers.js — server.js 与 test-*.js 共用的浏览器助手（移植自 skill 真机校准结论）
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const ROOT = dirname(fileURLToPath(import.meta.url));
export const MCP_ROOT = resolve(ROOT, "..");
export const SKILL_ROOT = resolve(MCP_ROOT, "..");
export const PROFILE_DIR = join(MCP_ROOT, "profile");
export const COURSE_MGMT = "https://uai.unipus.cn/app/cmgt/course-management";

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const jitter = (base) => base + Math.floor(Math.random() * base * 0.4);

// 加载 skill 校准脚本为函数对象（eval 源码 → 传函数）
export const scriptFn = (name) => eval(readFileSync(join(SKILL_ROOT, "scripts", name), "utf8"));

// SSO 登录态是会话 cookie，进程退出即丢；把 expires 改写为 180 天后重新写回，
// 让持久 profile 把它落盘（与浏览器自身存储 cookie 同类行为，仍在 profile 目录内）。
export async function persistSessionCookies(context) {
  try {
    const cookies = await context.cookies();
    if (!cookies.length) return 0;
    const future = Math.floor(Date.now() / 1000) + 86400 * 180;
    const adjusted = cookies.map((c) => (c.expires > 0 ? c : { ...c, expires: future }));
    await context.addCookies(adjusted);
    console.error(`[unipus] 已持久化 ${adjusted.length} 条 cookie`);
    return adjusted.length;
  } catch (e) {
    console.error("[unipus] cookie 持久化失败:", e.message);
    return 0;
  }
}

// 按「可见文本」找目标并真点击。要点：
//  1) 取文本匹配的最深层可见元素；nth 指定同名第几个；
//  2) 真机校准（2026-10-07）：U校园任务条目的点击事件绑在带 onclick 的祖先容器
//     （div.courses-unit_taskItemContainer）上，直接点文本 span 会被 tooltip 层拦截无效
//     → 命中后向上找最近带 onclick 且文本不超长的祖先作为点击目标；
//  3) mode="ui"：居中滚动（避吸顶页签）→ 真 Playwright 点击 → 坐标兜底；
//     mode="js"：el.click() 直接触发 onclick（绕过遮挡层；部分风控只认 isTrusted，作兜底用）。
export async function clickByText(page, textPattern, { exact = true, nth = 0, mode = "ui" } = {}) {
  const tag = "data-unipus-click-" + Date.now() + "-" + Math.floor(Math.random() * 1e6);
  const ok = await page.evaluate(({ textPattern, exact, nth, tag }) => {
    const re = exact ? null : new RegExp(textPattern);
    const text = (el) => (el?.innerText || "").trim();
    const matches = [];
    for (const el of document.body.querySelectorAll("*")) {
      const t = text(el);
      const m = exact ? t === textPattern : re.test(t);
      if (m && el.offsetParent !== null && el.children.length === 0) matches.push(el);
    }
    if (!matches.length) return 0;
    let el = matches[Math.min(nth, matches.length - 1)];
    // 向上找最近带 onclick 的祖先（文本仍聚焦在目标附近，防止爬到 body 级）
    let target = el;
    for (let i = 0; i < 5; i++) {
      const up = target.parentElement;
      if (!up || up === document.body) break;
      if (up.onclick && text(up).length <= 300) target = up;
      else break;
    }
    target.setAttribute(tag, "1");
    return matches.length;
  }, { textPattern, exact, nth, tag });
  if (!ok) return false;

  let done = false;
  if (mode === "js") {
    done = await page.evaluate((t) => {
      const el = document.querySelector(`[${t}]`);
      if (!el) return false;
      el.click();
      return true;
    }, tag);
  } else {
    const loc = page.locator(`[${tag}]`);
    try {
      await loc.evaluate((el) => el.scrollIntoView({ block: "center" }));
      await sleep(300);
      await loc.click({ timeout: 2500 });
      done = true;
    } catch {
      try {
        const box = await loc.boundingBox();
        if (!box) throw new Error("no box");
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        done = true;
      } catch { done = false; }
    }
  }
  await page.evaluate((t) => document.querySelector(`[${t}]`)?.removeAttribute(t), tag).catch(() => {});
  await sleep(jitter(900));
  return done;
}

// 点击/导航类跳转可能发生在同页或新页，统一等待并返回目标页
export async function waitNavigated(context, cur, { prevUrl = cur.url(), ms = 8000 } = {}) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    await sleep(500);
    if (cur.url() !== prevUrl && !cur.url().includes("sso.unipus.cn")) return { page: cur, newTab: false };
    const extra = context.pages().find((p) => p !== cur && p.url().includes("unipus.cn"));
    if (extra) return { page: extra, newTab: true };
  }
  return null;
}

// 切换 Unit 页签（带验证）：切完必须能在目录里看到 `${unit}-数字` 小节号，否则 JS 模式重试。
// 真机教训（2026-10-07）：UI 点击 Unit 页签可能静默无效（停在原单元），必须验证生效。
export async function switchUnit(page, unit) {
  const panelHasUnit = () => page.evaluate((u) => {
    const re = new RegExp(`(^|\\s|\\n)${u}-\\d`);
    const panel = document.querySelector("[role=tabpanel]") || document.body;
    return re.test(panel.innerText || "");
  }, unit);
  if (await panelHasUnit()) return { already: true, ok: true };
  await clickByText(page, `Unit ${unit}`, { exact: true });
  await sleep(jitter(1200));
  if (await panelHasUnit()) return { ok: true };
  await clickByText(page, `Unit ${unit}`, { exact: true, mode: "js" });
  await sleep(jitter(1500));
  return { ok: await panelHasUnit() };
}

// courseware 页内容就绪轮询：先关弹窗，再等题目/词库/提交键任一出现（SPA 渲染慢，直取常为空）
export async function extractReady(page, { timeoutMs = 15000, bookRoot } = {}) {
  const deadline = Date.now() + timeoutMs;
  let dialogClosed = false;
  let data = null;
  while (Date.now() < deadline) {
    if ((await page.getByText("我知道了", { exact: true }).count()) === 1) {
      await page.getByText("我知道了", { exact: true }).click();
      dialogClosed = true;
      await sleep(800);
    }
    data = await page.evaluate(scriptFn("extract_questions.js"));
    // 就绪判据：题目输入框/选择项已渲染（词库先出现不代表题目区就绪）
    if (data.questions.length || data.radioCount) break;
    await sleep(900);
  }
  return { data, dialogClosed };
}

// 关「本单元学习时间」弹窗。真机教训（2026-10-07）：DOM 里可能有多个「我知道了」文本
// （含隐藏的），getByText count===1 判断会失效 → 弹窗盖住页面，提交点击全被遮罩吞掉。
// 改用 deepest-visible 定位（clickByText），并验证弹窗消失。
export async function closeKnownDialog(page) {
  try {
    const visible = await page.evaluate(() => {
      const text = (el) => (el?.innerText || "").trim();
      let hit = null;
      for (const el of document.body.querySelectorAll("*")) {
        if (text(el) === "我知道了" && el.children.length === 0 && el.offsetParent !== null) {
          if (!hit || el.querySelectorAll("*").length < hit.querySelectorAll("*").length) hit = el;
        }
      }
      return !!hit;
    });
    if (!visible) return false;
    await clickByText(page, "我知道了", { exact: true });
    // 等弹窗真的消失（modal root 不可见）
    for (let i = 0; i < 5; i++) {
      await sleep(400);
      const gone = await page.evaluate(() => {
        const roots = [...document.querySelectorAll(".ant-modal-root, [class*=modal]")];
        return !roots.some((el) => el.offsetParent !== null && (el.innerText || "").includes("我知道了"));
      });
      if (gone) return true;
    }
    return false;
  } catch {
    return false;
  }
}
