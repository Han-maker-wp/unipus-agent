# 作业/单元任务作答主流程（homework）

> 真机校准：2026-09-12 · 以《新编大学英语（第四版）综合教程 3》Unit 1 实测为准

## 两种「作业」

1. **老师布置的作业**：教程详情「作业」页签 / 侧边栏「我的作业」（待作答/批阅中/已批阅）。
   老师没布置时显示「暂无作业」——这不是故障。
2. **单元任务（教程学习目录里的练习）**：U校园的主体，绝大多数练习在这里。本技能主要服务于此。

## 主流程（单元任务）

### 1. 定位任务

- 我的课程 → 点教材名进教程详情 → 「教程学习」→ 教程目录选 Unit → 展开小节 → 点任务条目。
- 任务条目匹配用 `getByText("任务名", { exact: true })`，先 `count()` 确认唯一（同一小节名可能在
  Reading 1/Reading 2 重复出现，先确认当前 Unit 页签下再点）。
- 被遮挡处理见 pitfalls.md #1。

### 2. 进入任务页

- 关弹窗：「本单元学习时间…」→ `button "我知道了"`。
- 顶部面包屑显示 `Unit 主题 > 1-6 Read and practice`；若小节含多个子练习
  （如 Read and practice = Word building / Synonyms / Language in use / Banked cloze），
  子练习是页签，逐个切换作答。
- 每个子练习页有 `Directions` 说明 + 题面 + 右下 `generic "提 交"`。

### 3. 提取题目

运行 `scripts/extract_questions.js`（整段粘进页面 evaluate），返回 JSON：

```json
{ "section": "Banked cloze",
  "directions": "Complete the passage with...",
  "wordBank": ["adequate", "assigned", "..."],
  "questions": [ { "no": "1)", "stemBefore": "many term papers and ", "type": "blank" } ],
  "submitted": false }
```

提取后立即核对：题数、词库词数与页面一致（不一致 → 重新提取或换选择器，见 pitfalls）。

### 4. 检索知识库

按 references/knowledge-base.md。命中判据：小节名一致 + 词库一致（banked cloze）
或题干关键词一致（句子填空/选择）。文件头会标注教材版本（`nce_4_rw_3` ↔ 综合教程3）。

### 5. 审核单 + 回填

- 先出审核单（references/answer-verify.md），用户确认或按会话提交策略执行。
- 运行 `scripts/fill_answers.js` 回填（≥1.5s/次节流，每次填写后回读校验）。
- 填完 `extract_questions.js` 再跑一遍，比对每个空非空且值正确（红线 5）。

### 6. 提交

见 references/submit-policy.md。默认**不提交**：答案留在页面上，由用户检查后人工点击「提 交」；
挂机期间保持页面打开正好给用户留出检查窗口。

### 7. 挂机刷时长

见 references/duration.md。默认每节 10 分钟，到时后才切下一个任务。

### 8. 多子练习/多任务

一个小节内有多个子练习页签时逐个完成；一个小节完成后回目录确认状态变化
（「未开始」→「进行中/已完成」），再进下一个。每完成一节输出一次小结。

## 题型与交互速查（实测 + 已知）

| 题型 | 交互 | 提取/回填 |
| --- | --- | --- |
| Banked cloze 选词填空 | 段落内编号 `textbox` | 填词库词 |
| 句子填空 | `textbox` | 直接填 |
| 单选（A/B/C…） | 选项为可点文本/radio（待真机逐题型校准） | 逐个点击，≥1.5s |
| 判断正误 | 同单选 | — |
| 翻译/写作 | 大段 `textarea` | fill 全文，注意换行 |
| 听力题 | 有音频播放器，答案不依赖音频内容（知识库直接给） | 先暂停播放再作答更稳 |

> 标注「待真机校准」的题型，首次遇到时先提取截图确认 DOM 再批量作答，并把结论补进本文件。
