# 接入任意 AI Agent（agent-integration）

> 本技能不绑定任何宿主。核心资产只有两类：**Markdown 手册**（SKILL.md + references/）和
> **纯 JS 页面回调**（scripts/，标准浏览器 evaluate 语法）。任何能操作浏览器、能读写本地
> 文件的 AI 都能用。

## 先做环境自检（30 秒）

| 要求 | 判定方法 |
| --- | --- |
| 浏览器自动化 | 能让浏览器打开 `https://uai.unipus.cn` 并读回页面结构（任意一种：宿主内置浏览器、Playwright/Selenium 脚本、chrome-devtools MCP、Playwright MCP、computer-use 类工具均可，见 browser-adapters.md 能力清单） |
| 本地文件读取 + 文本检索 | 能 `读 knowledge/INDEX.md` 并在其中 grep 关键词 |
| Python 3.10+（可选） | 仅知识库建库（tools/）需要；只用现成知识库可跳过 |

## 方式 A：宿主支持 Agent Skills 标准（最简）

Claude Code / ZCode / 其他声明支持 SKILL.md 的宿主——整个目录拷进技能目录即可：

```bash
git clone https://github.com/Han-maker-wp/unipus-agent.git ~/.claude/skills/unipus   # Claude Code
git clone https://github.com/Han-maker-wp/unipus-agent.git ~/.agents/skills/unipus   # ZCode
```

之后对 AI 说人话即可触发（描述里有触发词：U校园/unipus/做英语作业/刷时长…）。

## 方式 B：宿主有规则文件机制但无技能发现（Codex CLI、Cursor、Cline、Windsurf…）

把下面片段粘进宿主的规则/指令文件（`AGENTS.md`、`.cursor/rules`、`CLAUDE.md` 等）：

```markdown
## U校园任务指引
当用户提到 U校园/unipus/大学英语作业时：
1. 完整阅读 unipus-agent/SKILL.md 并严格遵守其中的「纪律红线」；
2. 按 SKILL.md 的路由表按需阅读 references/ 下对应手册，不要一次全读；
3. scripts/ 下的 JS 函数用浏览器自动化工具的 evaluate 执行（用法见各文件头注释）。
（把 unipus-agent/ 替换为你的实际克隆路径）
```

## 方式 C：裸 LLM / 自研 agent / API 编排

1. 把 `SKILL.md` 全文放进 system prompt（它本身就是为「给 AI 读」而写的）；
2. 按需把当前步骤对应的 reference 文件内容追加进上下文（路由表在 SKILL.md 里）；
3. 浏览器操作二选一：
   - 给 agent 挂一个浏览器 MCP（Playwright MCP / chrome-devtools MCP 等）；
   - 或自己写 Playwright 脚本执行 scripts/ 里的函数——完整可运行示例见
     `scripts/playwright-runner.example.js`（无需任何 agent 宿主）。

## 凭据与安全（所有方式通用）

- 账号密码让用户**当场提供**，只存在会话内存里；绝不写进任何文件、日志、提示词模板。
- `.gitignore` 已兜底，但别在别的仓库/配置里复述凭据。
- 提交按钮的点击必须过 `references/submit-policy.md`，默认不提交。

## 已验证环境

| 宿主 | 状态 |
| --- | --- |
| ZCode（内置浏览器 browser-use） | ✅ 2026-09-12 全流程真机校准（登录/导航/提取/回填dryRun） |
| Playwright（Node） | ✅ 脚本语法即 Playwright evaluate 原生格式（见 runner 示例） |
| chrome-devtools MCP / Playwright MCP | 能力覆盖（见 browser-adapters.md 映射表），欢迎按 pitfalls.md 模式回填实测结论 |
