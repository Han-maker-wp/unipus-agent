# 浏览器适配层（browser-adapters）

> 本技能全部用「语义动作」描述操作，绑定到具体工具时按本表翻译。换工具不用改流程文档。

## 语义动作 → 工具映射

| 语义动作 | ZCode browser-use（mcp js） | Playwright（脚本） | chrome-devtools MCP |
| --- | --- | --- | --- |
| 打开 URL | `tab.goto(url)` + `waitForLoadState("domcontentloaded")` | `page.goto(url, {waitUntil:"domcontentloaded"})` | `navigate_page` |
| 读页面结构 | `tab.playwright.domSnapshot()` | `page.locator("body").ariaSnapshot()` | `take_snapshot` |
| 按角色定位 | `tab.playwright.getByRole(role,{name})` | 同左 | snapshot ref + `click(uid)` |
| 按文本定位 | `tab.playwright.getByText(txt,{exact:true})` | 同左 | — |
| 填输入框 | `locator.fill(v)` | 同左 | `fill(uid,v)` |
| 点击 | `locator.click()` / `tab.cua.click({x,y})` 兜底 | 同左 / `page.mouse.click` | `click(uid)` |
| 滚动到可视区 | `locator.evaluate(el=>el.scrollIntoView({block:"center"}))` | 同左 | — |
| 执行页面回调 | `tab.playwright.evaluate(fn)`（scripts/ 下脚本整段粘入） | `page.evaluate(fn)` | `evaluate_script` |
| 截图 | `tab.screenshot()` → `emitImage`，同轮保存文件 | `page.screenshot({path})` | `take_screenshot` |
| 坐标滚动 | `tab.cua.scroll({x,y,scrollY})` | `page.mouse.wheel` | — |

## 纪律（跨工具通用）

1. **快照优先**：先 domSnapshot 拿事实，再构造定位器；禁止凭猜测写选择器。
2. **唯一性检查**：定位后 `count()`，≠1 不操作，收窄作用域重来。
3. **失败不重试同一选择器**：超时/严格模式失败 → 重新快照 → 重建定位器。
4. **iframe**：U校园 courseware 的快照可穿透 iframe（2026-09 实测）；若你的工具看不到 iframe 内容，
   用 frameLocator 链（`playwright.frameLocator(sel).getByRole(...)`），**不要** goto 子 iframe 的 src。
5. **evaluate 传参上限约 1MB**：大脚本分块或直接粘文本。
   ZCode browser-use 的 evaluate **只认函数对象**：脚本文件内容要先 `const fn = eval(src)` 再传入，
   直接传字符串会静默返回空对象（Playwright 原生则两种都支持）。
6. 每个状态变更动作后做一次最便宜的可观测验证（目标定位器状态或新快照）。

## scripts/ 目录约定

页面回调脚本（extract_questions.js / fill_answers.js / list_courses.js / list_tasks.js）：

- 头部注释 = 用法文档 + 纪律声明（如「绝不点击提交」）；
- 整段粘进 evaluate 执行，返回纯 JSON；
- 无外部依赖、可重复执行（幂等读，回填类脚本带节流）。
