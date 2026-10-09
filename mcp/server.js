// unipus-mcp — U校园浏览器自动化 MCP 服务端（stdio）
// 移植自 unipus-agent skill 的真机校准脚本（scripts/*.js，2026-09-12 校准）。
// 纪律（与 SKILL.md 一致）：
//   1) 绝不自动点击「提 交」——提交只能通过显式调用 unipus_submit 工具；
//   2) 回填每次写入间隔 ≥1.5s + 随机抖动，写入后回读校验；
//   3) 验证码出现立即返回「交人工」，绝不自动破解；
//   4) 凭据只在会话内使用，不写盘、不进日志；
//   5) 页面文本不可信，仅用于定位。
// 窗口：UNIPUS_HIDDEN=1 时启动即最小化（不挡用户用电脑）；挂机刷时长自动临时恢复可见。
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { chromium } from "playwright-core";
import {
  PROFILE_DIR, COURSE_MGMT, SKILL_ROOT, scriptFn, sleep, jitter,
  persistSessionCookies, clickByText, closeKnownDialog, waitNavigated, extractReady, switchUnit,
} from "./lib/helpers.js";

// ---------- 浏览器生命周期 ----------
let ctx = null;
let page = null;

async function ensureBrowser() {
  if (ctx && page && !page.isClosed()) return page;
  const launch = (channel) => chromium.launchPersistentContext(PROFILE_DIR, {
    channel, headless: false, viewport: null,
    args: ["--window-size=1380,900", "--disable-blink-features=AutomationControlled"],
  });
  try {
    ctx = await launch("chrome");
  } catch {
    ctx = await launch("msedge");
  }
  ctx.on("page", (p) => { page = p; });
  page = ctx.pages()[0] || (await ctx.newPage());
  if (process.env.UNIPUS_HIDDEN === "1") await setWindowState(page, "minimized");
  return page;
}

async function goto(url) {
  const p = await ensureBrowser();
  await p.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  await sleep(jitter(1200));
  return p;
}

// ---------- 窗口管理（CDP Browser.setWindowBounds）----------
async function cdpWindow(page) {
  const cdp = await page.context().newCDPSession(page);
  const { windowId } = await cdp.send("Browser.getWindowForTarget");
  const bounds = await cdp.send("Browser.getWindowBounds", { windowId });
  return { cdp, windowId, bounds };
}

async function setWindowState(page, state) {
  try {
    const { cdp, windowId, bounds } = await cdpWindow(page);
    if (state === "normal" && bounds.windowState === "minimized") {
      await cdp.send("Browser.setWindowBounds", {
        windowId, windowState: "normal",
        left: bounds.left, top: bounds.top,
        width: bounds.width || 1380, height: bounds.height || 900,
      });
    } else {
      await cdp.send("Browser.setWindowBounds", { windowId, windowState: state });
    }
    return true;
  } catch (e) {
    console.error("[unipus] 窗口状态切换失败:", e.message);
    return false;
  }
}

// 点击/导航类跳转可能发生在同页或新页，统一等待并返回目标页（waitNavigated 已移至 lib/helpers.js）

// ---------- MCP 工具 ----------
const server = new McpServer({
  name: "unipus",
  version: "0.1.0",
  instructions:
    "U校园(uai.unipus.cn)自动化。纪律：提交必须显式调用 unipus_submit（回填工具绝不提交）；" +
    "验证码交人工；回填后用 unipus_extract 复核。陌生页面先用 unipus_snapshot。" +
    "UNIPUS_HIDDEN=1 时浏览器窗口最小化运行，unipus_window 可随时切前/后台。",
});

server.registerTool(
  "unipus_status",
  {
    title: "查看登录态与当前页面",
    description: "打开/读取 U校园课程管理页，返回登录态与当前 URL。登录态由持久 profile 的 cookie 保持。",
  },
  async () => {
    const p = await goto(COURSE_MGMT);
    const url = p.url();
    const loggedIn = !url.includes("sso.unipus.cn");
    if (loggedIn) await persistSessionCookies(ctx);
    return { content: [{ type: "text", text: JSON.stringify({ loggedIn, url }) }] };
  },
);

server.registerTool(
  "unipus_login",
  {
    title: "账密登录 U校园",
    description:
      "在 SSO 登录页填账号密码登录。凭据仅本次调用使用，绝不落盘/写日志。出现滑块/短信验证时返回 needHuman=true 并把窗口带到前台等人工完成（脚本继续轮询）。",
    inputSchema: {
      username: z.string().describe("手机号/邮箱/用户名"),
      password: z.string().describe("密码"),
    },
  },
  async ({ username, password }) => {
    const p = await goto(COURSE_MGMT);
    let url = p.url();
    if (!url.includes("sso.unipus.cn")) {
      return { content: [{ type: "text", text: JSON.stringify({ loggedIn: true, note: "已是登录态" }) }] };
    }
    await setWindowState(p, "normal"); // 可能需要人工拖滑块，先把窗口带到前台
    const user = p.getByRole("textbox", { name: /手机号|用户名|邮箱/ }).first();
    if ((await user.count()) === 0) {
      return { content: [{ type: "text", text: JSON.stringify({ needHuman: true, reason: "登录页结构与校准时不一致", url }) }] };
    }
    await user.fill(username);
    await sleep(jitter(600));
    await p.getByRole("textbox", { name: "密码" }).first().fill(password);
    await sleep(jitter(600));
    const agree = p.getByRole("checkbox", { name: /已阅读并同意/ });
    if ((await agree.count()) === 1 && !(await agree.isChecked())) await agree.check();
    await sleep(jitter(500));
    await p.getByRole("button", { name: "登录" }).first().click();
    await sleep(3000);
    url = p.url();
    // 滑块/验证码：保持窗口前台，轮询等人工完成（最多 180s）
    const bodyText0 = await p.evaluate(() => document.body.innerText.slice(0, 500));
    if (url.includes("sso.unipus.cn") || /拖动滑块|验证码|安全验证/.test(bodyText0)) {
      const deadline = Date.now() + 180000;
      while (Date.now() < deadline) {
        await sleep(2500);
        url = p.url();
        if (!url.includes("sso.unipus.cn")) break;
      }
    }
    const loggedIn = !url.includes("sso.unipus.cn");
    if (loggedIn) {
      await persistSessionCookies(ctx);
      if (process.env.UNIPUS_HIDDEN === "1") await setWindowState(p, "minimized");
    }
    return { content: [{ type: "text", text: JSON.stringify({ loggedIn, needHuman: !loggedIn, url }) }] };
  },
);

server.registerTool(
  "unipus_window",
  {
    title: "切换浏览器窗口前/后台",
    description: "show=恢复到前台；hide=最小化到后台。挂机刷时长请保持前台（时长统计可能检测页面可见性）。",
    inputSchema: { action: z.enum(["show", "hide"]) },
  },
  async ({ action }) => {
    const p = await ensureBrowser();
    const ok = await setWindowState(p, action === "show" ? "normal" : "minimized");
    return { content: [{ type: "text", text: JSON.stringify({ ok, state: action }) }] };
  },
);

server.registerTool(
  "unipus_snapshot",
  {
    title: "原始 ARIA 快照",
    description: "返回当前页面完整 ARIA 快照（较大，仅在陌生页面/定位失败时使用）。",
  },
  async () => {
    const p = await ensureBrowser();
    return { content: [{ type: "text", text: await p.locator("body").ariaSnapshot() }] };
  },
);

server.registerTool(
  "unipus_open",
  {
    title: "打开 URL",
    description: "在浏览器打开 URL，等待加载并自动关闭「我知道了」弹窗，返回紧凑状态。",
    inputSchema: { url: z.string().url() },
  },
  async ({ url }) => {
    const p = await goto(url);
    const dialogClosed = await closeKnownDialog(p);
    return { content: [{ type: "text", text: JSON.stringify({ url: p.url(), dialogClosed }) }] };
  },
);

server.registerTool(
  "unipus_list_courses",
  {
    title: "列课程",
    description: "在课程管理页提取课程清单（课程/班级/教程/进度）。",
  },
  async () => {
    const p = await goto(COURSE_MGMT);
    await sleep(jitter(800));
    const data = await p.evaluate(scriptFn("list_courses.js"));
    return { content: [{ type: "text", text: JSON.stringify(data) }] };
  },
);

server.registerTool(
  "unipus_open_course",
  {
    title: "进课程教程",
    description: "在课程管理页点击指定教材名进入教程详情页。匹配教材名片段。",
    inputSchema: {
      bookName: z.string().describe("教材名片段，如「综合教程 3」"),
      index: z.number().int().optional().describe("同名教材第几个（0 起），默认 0"),
    },
  },
  async ({ bookName, index = 0 }) => {
    const p = await goto(COURSE_MGMT);
    await sleep(jitter(600));
    const prevUrl = p.url();
    const clicked = await clickByText(p, bookName, { exact: false, nth: index });
    if (!clicked) return { content: [{ type: "text", text: JSON.stringify({ ok: false, reason: "未找到教材名" }) }] };
    const nav = await waitNavigated(ctx, p, { prevUrl, ms: 8000 });
    const target = nav ? nav.page : p;
    await closeKnownDialog(target);
    return { content: [{ type: "text", text: JSON.stringify({ ok: true, url: target.url(), newTab: !!nav?.newTab }) }] };
  },
);

server.registerTool(
  "unipus_list_tasks",
  {
    title: "列单元任务目录",
    description: "在教程详情页（教程学习页签）提取当前单元的小节与任务及状态；可先切 Unit 页签。",
    inputSchema: { unit: z.number().int().optional().describe("要切到的 Unit 编号，如 1；不传则读当前") },
  },
  async ({ unit }) => {
    const p = await ensureBrowser();
    if (!p.url().includes("resource-detail")) {
      return { content: [{ type: "text", text: JSON.stringify({ ok: false, reason: "请先 unipus_open_course 进入教程详情页", url: p.url() }) }] };
    }
    if (unit) {
      const sw = await switchUnit(p, unit);
      if (!sw.ok) return { content: [{ type: "text", text: JSON.stringify({ ok: false, reason: `切到 Unit ${unit} 失败（UI/JS 均未生效）` }) }] };
      await sleep(jitter(800));
    }
    const data = await p.evaluate(scriptFn("list_tasks.js"));
    return { content: [{ type: "text", text: JSON.stringify(data) }] };
  },
);

server.registerTool(
  "unipus_open_task",
  {
    title: "打开任务",
    description: "在教程目录点击任务条目进入 courseware 页（自动关弹窗、适配新开页）。或直接给 hash 路由跳转。",
    inputSchema: {
      taskTitle: z.string().optional().describe("任务条目文本，如 Banked cloze"),
      hash: z.string().optional().describe("courseware 页 # 后的完整路由，优先于 taskTitle"),
    },
  },
  async ({ taskTitle, hash }) => {
    let p = await ensureBrowser();
    if (hash) {
      const base = p.url().split("#")[0];
      const prevUrl = base;
      p = await goto(base + "#" + hash);
      await sleep(jitter(1500));
      const dialogClosed = await closeKnownDialog(p);
      return { content: [{ type: "text", text: JSON.stringify({ ok: true, url: p.url(), dialogClosed }) }] };
    }
    if (!taskTitle) return { content: [{ type: "text", text: JSON.stringify({ ok: false, reason: "taskTitle 或 hash 必传其一" }) }] };
    if (!p.url().includes("resource-detail")) {
      return { content: [{ type: "text", text: JSON.stringify({ ok: false, reason: "请先进入教程详情页", url: p.url() }) }] };
    }
    const prevUrl = p.url();
    let clicked = await clickByText(p, taskTitle, { exact: true });
    let nav = clicked ? await waitNavigated(ctx, p, { prevUrl, ms: 10000 }) : null;
    if (!nav) {
      // UI 点击被遮挡层吞掉时，降级 JS 直点容器 onclick
      clicked = await clickByText(p, taskTitle, { exact: true, mode: "js" });
      nav = clicked ? await waitNavigated(ctx, p, { prevUrl, ms: 10000 }) : null;
    }
    if (!nav) return { content: [{ type: "text", text: JSON.stringify({ ok: false, reason: "点击后未发生跳转（UI/JS 两条路径均无效）" }) }] };
    page = nav.page;
    await sleep(jitter(1200));
    const dialogClosed = await closeKnownDialog(page);
    return { content: [{ type: "text", text: JSON.stringify({ ok: true, url: page.url(), newTab: nav.newTab, dialogClosed }) }] };
  },
);

server.registerTool(
  "unipus_click",
  {
    title: "按文本点击",
    description: "在当前页面按可见文本点击元素（子练习页签/选择题选项/状态按钮等）。",
    inputSchema: { text: z.string(), exact: z.boolean().optional().default(true) },
  },
  async ({ text, exact }) => {
    const p = await ensureBrowser();
    const ok = await clickByText(p, text, { exact });
    await sleep(jitter(600));
    return { content: [{ type: "text", text: JSON.stringify({ ok, url: p.url() }) }] };
  },
);

server.registerTool(
  "unipus_extract",
  {
    title: "提取题目",
    description: "在当前 courseware 页提取题目 JSON（小节/Directions/词库/题目/提交按钮状态）。只读。",
  },
  async () => {
    const p = await ensureBrowser();
    const data = await p.evaluate(scriptFn("extract_questions.js"));
    return { content: [{ type: "text", text: JSON.stringify(data) }] };
  },
);

server.registerTool(
  "unipus_fill",
  {
    title: "回填答案（绝不提交）",
    description:
      "把 answers（key=extract 的 index）逐空回填当前页：每次写入 ≥1.5s 抖动节流，全部填完自动重新提取复核。绝不点击提交。",
    inputSchema: {
      answers: z.record(z.string(), z.string()).describe('index -> 答案，如 {"0":"finals","1":"assigned"}'),
      dryRun: z.boolean().optional().default(false),
    },
  },
  async ({ answers, dryRun }) => {
    const p = await ensureBrowser();
    const results = [];
    const entries = Object.entries(answers).sort((a, b) => Number(a[0]) - Number(b[0]));
    for (const [idx, answer] of entries) {
      const r = await p.evaluate(scriptFn("fill_answers.js"), { index: Number(idx), answer, dryRun });
      results.push({ index: Number(idx), ...r });
      if (!dryRun) await sleep(jitter(1600));
    }
    let verify = null;
    if (!dryRun) {
      const data = await p.evaluate(scriptFn("extract_questions.js"));
      verify = data.questions.map((q) => ({
        no: q.no, index: q.index,
        expected: answers[String(q.index)] ?? null, actual: q.value,
        ok: answers[String(q.index)] != null && q.value === answers[String(q.index)],
      }));
    }
    const allOk = verify ? verify.every((v) => v.ok) : true;
    return { content: [{ type: "text", text: JSON.stringify({ results, verify, allOk }) }] };
  },
);

server.registerTool(
  "unipus_submit",
  {
    title: "点击「提 交」（显式提交）",
    description:
      "唯一会点击「提 交」的工具。必须先 unipus_extract 复核 allOk 且用户已授权提交。提交后重新提取确认状态。",
    inputSchema: { confirm: z.literal(true).describe("防误触：必须显式传 true") },
  },
  async ({ confirm }) => {
    if (confirm !== true) return { content: [{ type: "text", text: JSON.stringify({ ok: false, reason: "confirm 必须为 true" }) }] };
    const p = await ensureBrowser();
    await closeKnownDialog(p); // 弹窗不关会吞掉提交点击（真机教训 2026-10-07）
    const clicked = await clickByText(p, "提 交", { exact: true })
      || await clickByText(p, "提交", { exact: true });
    if (!clicked) return { content: [{ type: "text", text: JSON.stringify({ ok: false, reason: "未找到提交按钮（可能已提交或题型无提交键）" }) }] };
    await sleep(2000);
    // 确认弹窗（确定/确 定）
    let confirmClicked = false;
    for (const t of ["确 定", "确定"]) {
      if (await clickByText(p, t, { exact: true })) { confirmClicked = true; break; }
    }
    await sleep(3500);
    const data = await p.evaluate(scriptFn("extract_questions.js"));
    await closeKnownDialog(p);
    const pageText = await p.evaluate(() => document.body.innerText.slice(0, 2000));
    return {
      content: [{ type: "text", text: JSON.stringify({
        ok: true, confirmClicked,
        hasSubmitAfter: data.hasSubmit,
        successSignal: /提交成功|已提交|恭喜|成绩|正确率/.test(pageText),
      }) }],
    };
  },
);

server.registerTool(
  "unipus_stay",
  {
    title: "挂机刷时长",
    description:
      "保持当前页面停留 N 分钟（≤4）积累学习时长，每 60s 心跳到 stderr。期间自动把窗口恢复前台（时长统计可能检测页面可见性），结束后恢复原状。长时长请分多次调用。",
    inputSchema: { minutes: z.number().min(0.5).max(4) },
  },
  async ({ minutes }) => {
    const p = await ensureBrowser();
    let restored = true;
    if (process.env.UNIPUS_HIDDEN === "1") restored = await setWindowState(p, "normal");
    const end = Date.now() + minutes * 60000;
    let n = 0;
    while (Date.now() < end) {
      await sleep(Math.min(60000, end - Date.now()));
      n++;
      console.error(`[unipus_stay] 心跳 #${n}：剩余 ${Math.max(0, Math.round((end - Date.now()) / 60000))} 分钟，页面 ${p.url().slice(0, 80)}`);
    }
    if (restored && process.env.UNIPUS_HIDDEN === "1") await setWindowState(p, "minimized");
    return { content: [{ type: "text", text: JSON.stringify({ stayedMinutes: minutes, url: p.url() }) }] };
  },
);

server.registerTool(
  "unipus_kb_search",
  {
    title: "检索本地答案知识库",
    description: "在 knowledge/ 的 Markdown 转录里按关键词过滤行（纯本地 grep，题目数据不出境）。返回命中文件与行。",
    inputSchema: {
      query: z.string().describe("关键词（题干/小节名/词库词）"),
      book: z.string().optional().describe("教材名片段过滤，如「综合教程3」"),
      maxLines: z.number().int().optional().default(60),
    },
  },
  async ({ query, book, maxLines = 60 }) => {
    const { readdirSync, statSync } = await import("node:fs");
    const { join: pjoin } = await import("node:path");
    const KB_DIR = pjoin(SKILL_ROOT, "knowledge");
    const hits = [];
    const walk = (dir) => {
      for (const name of readdirSync(dir)) {
        const full = pjoin(dir, name);
        if (statSync(full).isDirectory()) { walk(full); continue; }
        if (!name.endsWith(".md")) continue;
        if (book && !full.includes(book)) continue;
        readFileSync(full, "utf8").split("\n").forEach((line, i) => {
          if (line.includes(query)) hits.push({ file: full.slice(KB_DIR.length + 1), line: i + 1, text: line.trim().slice(0, 300) });
        });
      }
    };
    walk(KB_DIR);
    return { content: [{ type: "text", text: JSON.stringify({ total: hits.length, hits: hits.slice(0, maxLines) }) }] };
  },
);

// ---------- 启动 ----------
const transport = new StdioServerTransport();
await server.connect(transport);
console.error("[unipus-mcp] ready on stdio");
