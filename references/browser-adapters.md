# 浏览器适配层（browser-adapters）

> 本技能全部用「语义动作」描述操作。**任何具备下述 7 项能力的浏览器自动化工具都能驱动**，
> 绑定具体工具时按本表翻译；换工具不用改流程文档。

## 能力要求（7 项语义能力）

1. **navigate**：打开 URL 并等待加载
2. **read**：读页面可访问性结构/可见文本（用于理解页面与定位元素）
3. **locate + act**：按角色/文本/属性定位元素并点击、填写
4. **evaluate**：在页面上下文执行 JS 函数（scripts/ 全部基于此）
5. **screenshot**：截屏留档
6. **scroll**：滚动（整页或元素滚入可视区）
7. **wait**：等待加载状态/固定短等待

主流选项：独立 Playwright（Node/Python）、Playwright MCP、chrome-devtools MCP、
各宿主内置浏览器（ZCode browser-use、Claude Code computer-use 等）。缺哪项能力，
去 pitfalls.md 找该语义动作的降级路径（例如无 evaluate 时用坐标点击兜底）。

## 语义动作映射表（Playwright 为基线）

| 语义动作 | Playwright / Playwright MCP | chrome-devtools MCP | ZCode browser-use（内置浏览器） |
| --- | --- | --- | --- |
| 打开 URL | `page.goto(url, {waitUntil:"domcontentloaded"})` | `navigate_page` | `tab.goto(url)` + `waitForLoadState("domcontentloaded")` |
| 读页面结构 | `page.locator("body").ariaSnapshot()` | `take_snapshot` | `tab.playwright.domSnapshot()` |
| 按角色定位 | `page.getByRole(role,{name})` | snapshot 取 uid | `tab.playwright.getByRole(role,{name})` |
| 按文本定位 | `page.getByText(txt,{exact:true})` | snapshot 取 uid | `tab.playwright.getByText(txt,{exact:true})` |
| 填输入框 | `locator.fill(v)` | `fill(uid,v)` | `locator.fill(v)` |
| 点击 | `locator.click()`；遮挡时坐标 `page.mouse.click` | `click(uid)` | `locator.click()`；遮挡时 `tab.cua.click({x,y})` |
| 滚动到可视区 | `locator.evaluate(el=>el.scrollIntoView({block:"center"}))` | — | 同左 |
| 执行页面回调 | `page.evaluate(fn, arg)` | `evaluate_script` | `tab.playwright.evaluate(fn, arg)` |
| 截图 | `page.screenshot({path})` | `take_screenshot` | `tab.screenshot()`（同轮 emitImage+存盘） |
| 坐标滚动 | `page.mouse.wheel` | `scroll_page` | `tab.cua.scroll({x,y,scrollY})` |

## 通用纪律（跨工具一致）

1. **快照优先**：先读页面结构拿事实，再构造定位器；禁止凭猜测写选择器。
2. **唯一性检查**：定位后取数量，≠1 不操作，收窄作用域重来。
3. **失败不重试同一选择器**：超时/严格模式失败 → 重新读结构 → 重建定位器。
4. **iframe**：U校园 courseware 的可访问性快照可穿透 iframe（2026-09 实测）；若你的工具
   看不到 iframe 内容，用 frameLocator 链（Playwright 系）或先切入 frame 上下文，
   **不要** goto 子 iframe 的 src。
5. **evaluate 传参形态**：脚本文件本身就是「函数源码」。Playwright 两种都支持：
   `page.evaluate(fn)`（函数对象）或 `page.evaluate(src)`（源码字符串）。
   **部分宿主只认函数对象**（如 ZCode browser-use，传字符串会静默返回空对象），
   统一安全写法是 `const fn = eval(src)` 后传 `fn`。
6. **evaluate 传参上限约 1MB**：大脚本分块或直接粘文本。
7. 每个状态变更动作后做一次最便宜的可观测验证（目标定位器状态或新快照）。

## scripts/ 目录约定

页面回调脚本（extract_questions.js / fill_answers.js / list_courses.js / list_tasks.js）：

- 文件内容 = 一个纯 JS 箭头函数，**标准浏览器 evaluate 语法，零依赖**；
- 头部注释 = 用法文档 + 纪律声明（如「绝不点击提交」）；
- 无外部依赖、可重复执行（幂等读，回填类脚本带节流）。

独立运行（不依赖任何 agent 宿主）的完整示例见 `scripts/playwright-runner.example.js`。
