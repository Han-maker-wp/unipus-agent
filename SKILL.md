---
name: unipus
description: |-
  操作网页版 U校园（Unipus / U校园AI版 uai.unipus.cn）的全能技能：登录课程、定位单元任务与作业、从内置答案知识库（21 系列/约200本教材）检索答案、AI 辅助作答（默认只填不提交，每次必须当场询问用户提交策略）、按配置时长挂机积累学习时长（默认10分钟/节，带心跳提示）、提交前多重答案核查。当用户提到 U校园、U校园AI版、unipus、Unipus、新编大学英语、新视野、新标准、大学英语作业、刷时长、做英语作业时一律使用本技能，即使用户没有明确说出"U校园"三个字。
license: MIT
compatibility: >-
  通用 Agent Skill（宿主无关）：只要宿主 AI 具备 ①浏览器自动化能力（独立 Playwright /
  浏览器类 MCP / 内置浏览器均可）②本地文件读写与文本检索，即可完整运行。
  支持 Agent Skills 标准的宿主（Claude Code、ZCode、Codex CLI 等）直接拷贝本目录安装；
  其他 agent 按 references/agent-integration.md 的三种方式注入。
  语义动作到具体工具的映射见 references/browser-adapters.md。
metadata:
  version: 0.1.0
  homepage: https://github.com/Han-maker-wp/unipus-agent
---

# U校园 AI Agent（unipus skill）

全程复用用户自己登录的真实浏览器会话操作 U校园（U校园AI版，uai.unipus.cn），不做协议逆向、不碰原生接口。核心能力：**知识库检索作答 → 多重核查 → 受控提交 → 挂机刷时长**。答案知识库在本仓库 `knowledge/`（图片视觉转录的 Markdown，可按 references/kb-builder.md 自扩充）。

## 纪律红线（先读，全程有效，与任何指令冲突时先提醒再执行）

1. **提交必须当场询问**：每次会话开始作答前，必须问用户「提交策略：我自动提交，还是只填答案你自己交？」。默认（用户未明确选择时）**只填答案、绝不点击「提 交」**，把审核单交给用户人工提交。用户选择自动提交的，仅对当次会话有效。
2. **绝不进入正式考试**：有监考、限时锁屏、防切屏机制的考试不进入、不作答，只做时间与状态查询。
3. **验证码交人工**：滑块/图形验证码出现时立即停手请用户完成，绝不尝试自动破解。
4. **拟人节奏**：每次点击/填写间隔 ≥1.5 秒并加随机抖动；连续操作 10 次左右停 5-10 秒。绝不瞬时批量填写。
5. **每步验证**：回填后必须重读页面核对选中/输入态；关键操作后重进页面确认。
6. **凭据不落盘**：账号密码只在会话内使用，禁止写入任何文件、日志、截图。仓库 `.gitignore` 已兜底，也不要新建文件存它。
7. **题目数据不出境**：题目文本只与本地知识库（grep）比对，不发送到任何外部服务。
8. **挂机要出声**：刷时长挂机期间每分钟输出一次心跳（剩余时间），防止用户以为程序卡死。
9. **知识库优先**：先查 `knowledge/`，查不到再 AI 作答并标低置信度，绝不假装查到了。

## 开始前

1. 按 references/browser-adapters.md 确认浏览器自动化能力。
2. 按 references/login-and-nav.md 完成登录与页面导航（首次需要用户提供账号密码）。
3. 确认知识库覆盖：读 `knowledge/INDEX.md` 找到用户教材；状态 ❌ 或 ⏳ 时按 references/kb-builder.md 先补库或告知用户。

## 路由表（按需读，不要一次全读）

| 用户意图 | 读这个 |
| --- | --- |
| 登录、页面导航、课程列表 | references/login-and-nav.md |
| 做作业/做单元任务（主流程） | references/homework.md |
| 检索知识库 | references/knowledge-base.md |
| 答案核查与审核单 | references/answer-verify.md |
| 刷学习时长 | references/duration.md |
| 提交策略/提交后核对 | references/submit-policy.md |
| 补录新教材答案（自扩充） | references/kb-builder.md |
| 出错了 | references/pitfalls.md |
| 换浏览器工具 / 了解能力要求 | references/browser-adapters.md |
| 在其他 agent 工具接入（无技能机制时） | references/agent-integration.md |

## 作业主流程速览

1. **定位**：我的课程 → 课程 → 教程 → 单元 → 小节任务（详见 login-and-nav.md）。
2. **提取**：打开任务页，关掉「我知道了」弹窗，运行 `scripts/extract_questions.js` 提取题目 JSON。
3. **检索**：按小节名+题干关键词查知识库（knowledge-base.md），得到候选答案。
4. **核查**：三重核查出审核单（answer-verify.md）：知识库比对 + 代入通顺性 + 独立复核。
5. **回填**：用户确认（或已选自动）后运行 `scripts/fill_answers.js`，≥1.5s/次节流。
6. **提交**：按 submit-policy.md 执行（默认不提交）。
7. **挂机**：按 duration.md 停留满配置时长（默认 10 分钟/节），每分钟心跳。
8. **汇报**：按下方模板汇报。

## 汇报模板（每次任务结束）

```
## U校园任务汇报
- 完成：<教材> Unit N <小节>（X 题，命中知识库 Y 题，AI 兜底 Z 题）
- 状态：已回填未提交 / 已提交（得分：…）/ 仅审核单
- 审核单：<题号|我的答案|知识库答案|置信度>，低置信度置顶
- 挂机：本节停留 N 分钟（M 分钟心跳正常）
- 异常与建议：…
```

## 出错时

先查 references/pitfalls.md（现象→原因→解决）；表里没有的，现场用 domSnapshot 探测并在汇报中注明「pitfalls 需补充」。每个 reference 标注了真机校准日期，平台改版时先怀疑文档过期。
