# 踩坑速查表（pitfalls）

> 现象 → 原因 → 解决。真机校准 2026-09-12；平台改版先怀疑本文档过期。

| # | 现象 | 原因 | 解决 |
| --- | --- | --- | --- |
| 1 | 点任务条目无响应：报「covered by unipus-tabs_tabItemContainer」/「pointer probe returned no click point」（ZCode browser-use），Playwright 同类表现为 click 超时 "element is outside of the viewport / intercepted" | 任务条目被吸顶单元页签遮挡/文本节点无点击点 | `scrollIntoView({block:"center"})` 后重试；仍失败取 `getBoundingClientRect` 中心坐标用坐标点击兜底（Playwright 用 `page.mouse.click`） |
| 2 | 任务条目（Banked cloze 等）用 getByRole("button") 找不到 | 任务条目是普通 generic 文本，不是 button | `getByText(名称,{exact:true})` + count()==1 再点 |
| 3 | 点「我的课程」strict violation 命中 2 个元素 | 侧边栏标题和返回链接同名 | 用 `getByRole("link",{name:"我的课程"})` |
| 4 | 课程卡片点了没反应 | 课程名 generic 不可点，入口在教材名上 | 点卡片内「教材名 paragraph」（如「新编大学英语（第四版）综合教程 3（2023版）」） |
| 5 | 「作业」页签/我的作业显示「暂无作业」 | 老师没在平台布置作业；练习都在单元任务里 | 走教程学习目录定位任务，不是等作业列表 |
| 6 | 进入任务弹「本单元学习时间：…」对话框 | 每单元首个任务的例行提示 | 点 `button "我知道了"` 关闭 |
| 7 | 找不到提交按钮 | 按钮在页脚 `footer.ant-layout-footer > a.btn`，不在题目 main 容器里；文本是「提 交」（中间有空格） | 全文档匹配 `/提\s*交/` 的最深层可见元素；点击前必须过 submit-policy |
| 8 | 登录点了没反应 | 未勾选「我已阅读并同意…」协议 checkbox | 填完账密先 `check()` 协议框再点登录 |
| 9 | 微信文章抓几篇后标题变「微信公众平台」/「环境异常」 | 触发反爬验证页 | 换真实浏览器访问；节奏 ≥8-12s/篇；被拦冷却 60s+ 重试；每篇落盘断点续跑 |
| 10 | mmbiz 图片下载下来 <1KB 或打不开 | CDN 返回了校验页/防盗链 | 请求带 `Referer: https://mp.weixin.qq.com/`；重试；仍失败换浏览器下载 |
| 11 | 微信书文章里只找到 1 张图 | 该文章是二级目录：8 个 Unit 各是超链接 | 提取 `a[href]` 单元链接，进单元文章拿答案图 |
| 12 | 单元文章 img 数量比预期多 | 含 `mmbiz_svg` 装饰分隔图 | 过滤 src 含 `mmbiz_svg` 的项 |
| 13 | U校园课程 URL 里 hash 每次都变 | hash 是路由（单元/小节/任务），不是随机参数 | 整段保存复用，可直达同一任务 |
| 14 | 教材对不上知识库 | 版本词差异（2023版/第四版/智慧版） | 按 knowledge-base.md 版本校验表核对；U校园 hash 的 `nce_4_rw_3` 类代码是铁证 |
| 15 | 填的答案提交前被清空 | 页面停留过久会话过期/切题未保存 | 挂机结束前重跑 extract_questions 核对；异常按 submit-policy 记录 |
| 16 | 「操作过于频繁」弹窗 | 操作节奏太快 | 冷却 ≥180s 再继续；日常遵守 ≥1.5s 节流红线 |

## 2026-10-11 真机校准补充（综合教程3 全册）

| # | 现象 | 原因 | 解决 |
| --- | --- | --- | --- |
| 17 | 枚举任务/切单元后读到的永远是 Unit 1 的内容 | 教程详情页**每个单元各有一个** `div[class*=courseDetailNodeCollapseContainer]`（共 8 个），只有当前单元那个 `offsetParent!==null`；隐藏单元的 `innerText` 还会把相邻元素文字粘连（"Preview1-1 Lead-inLead-in已完成"） | 一律取**可见容器**：`cs.find(c=>c.offsetParent!==null)`。旧文档里"单实例复用、索引恒为 0"的说法是错的 |
| 18 | 用 `document.querySelector('[role=tabpanel]')` 拿到的是课程简介，不是单元目录 | 页面有**两个** `ant-tabs-tabpane`，第 0 个是外层（教程简介/学习要求/…），第 1 个才是单元目录 | 别用 `[role=tabpanel]` 定位目录，用 `courseDetailNodeCollapseContainer` |
| 19 | 词汇卡（Vocabulary）逐张点「下一个」翻到 62/62 仍显示「未开始」 | 该任务按**逐张停留计时**判定完成，快速翻页不算 | 必须点 `div.action.auto`「自动播放」并**等它自然跑完**（62 张约 150s，末尾「下一个」变 disabled、按钮文案回退为「自动播放」） |
| 20 | Reading in detail / Lead-in 之类任务没有题目也没有提交按钮 | 它们本来就是**阅读型**任务，进入即计完成 | 打开后停留（顺带滚动）即可，无需作答；返回目录确认状态变「已完成」 |
| 21 | 多步写作任务（Read and think / Read and write）只有一个 textarea、没有提交按钮 | 这类任务用 `a.btn`「下一题」分步推进，最后一步才出现「提 交」 | 逐字段回填 → 若存在可见「下一题」就点它 → 循环；无「下一题」时再提交。步骤数 = 各步可见字段数之和 |
| 22 | 必修/选修判定混乱，误以为全册都要做 | 必修标记只打在**部分小节**上（本教材 Unit1 仅 1-6/1-9~1-15、Unit3 仅 3-6、Unit5 仅 5-6；Unit2/4/6/7/8 全部小节必修） | 以行内 `span[class*=taskRequireIcon]` 文本为准；「已完成/未开始/进行中」取 `[class*=nodePassStateTip]` |
| 23 | 关闭弹窗后仍提取不到题目 | SPA 渲染慢，直取常为空 | 轮询提取（driver 的 `extract` 已内建 15s 重试 + 自动关「我知道了」） |
| 24 | 同一单元内同名任务点错 | 同名任务在同一单元重复出现（如 Vocabulary / Reading in detail / Word building / Translating / Global understanding 各两次） | 按同单元内**出现序号**给 `click-row` 传 `nth`（0 基）。注意：**Unit 8 有两个 Word building（8-6 / 8-13）**，人工探查时极易 nth 传错 |

## 2026-10-11 二次校准（自动作答执行器 `_runner.py`）

| # | 现象 | 原因 | 解决 |
| --- | --- | --- | --- |
| 25 | 「预检」（只比对题目数与答案数、不提交）跑出一大片 NOQ/NAVFAIL，但事后单独复查同一任务却完全正常 | 详情页/课件 SPA **瞬时未渲染完**时 `extract` 会返回 0 题；预检无重试，把这些瞬时失败当成了真实异常 | 预检结论**不可尽信**；真正的判定依据是正式运行里的 `verify`/`submit` 回执。要预检就必须带重试 |
| 26 | 多步任务第 2 步「平台需 N 剩余 0」，任务被跳过 | 答案表只填了第 1 步。多步任务的答案是**各步之和、按步顺序拼接** | 例：`8-13 Word building` 第1步10空、第2步再10空（同 10 个词，重复一遍=20）；`5-6 Use of metaphors` 第1步4段分析 + 第2步8词选词填空（=12）。补答案前先用「回填第1步→点下一题→extract」把第2步题目 dump 出来核对 |
| 27 | 答案数与平台题目数不一致时仍可能提交（多出来的答案被浪费、少的时候填不满） | 旧逻辑只警告「还有 N 个答案未使用」，然后照样提交 | **安全闸门**：`idx != len(answers)` 一律返回 `leftover` 且**不提交**。宁可漏交，不可误交 |
| 28 | 匹配题（Directions: Match sentences 1-6 with sentences A-F）抽取到 0 题 | 该题型用拖拽/点选实现，DOM 里**没有 input/select/radio**（`fieldCount=choiceCount=radioCount=0`） | 现抽取器无法处理 → 归人工。KB 里这类题答案常是字母（B/D/F/A/C/E） |
| 29 | `Watch/Listen for information` 抽取到 0 题 | 页面只有视频播放器（`00:00 / 03:44 倍速`），唯一的 iframe 是 0×0 埋点脚本；题目不在 DOM | 视频/听力型任务平台侧可能只要求「观看」，也可能题目延后出现；当前按 `noq` 记录待人工确认 |
| 30 | 连续一批任务 `click-row` 报 "row not found" | 详情页 SPA 未渲染完就切单元，`clickByText("Unit N")` 静默失败，可见容器还停在上一个单元 | `click-row` 内**重试 5 次**并回退到详情页（`lastDetailUrl`）；`_runner.open_task` 再包一层「导航+点击+提取」3 次重试 |
| 31 | 本机 PowerShell 工具本会话无任何输出（`Write-Output` 也为空） | 环境问题 | 用 Bash 工具替代；查进程用 `netstat -ano \| grep`、`tasklist`，别用 `wmic`（无输出） |
| 32 | 全量跑完一轮，32/119 任务报 `click-row` 的 `row not found`，但事后逐条复测**全都能正常打开** | 教程详情页 SPA **偶发未渲染完**就点击：此时 `courseDetailNodeCollapseContainer` 还没进 DOM（实测 `total:0`），`scope` 退化成 `document` → 找不到任何任务行。旧重试 3 次都撞在未渲染窗口里（间隔仅 10s），看似"稳定失败" | `_runner.open_task` 先 `wait_detail_ready()`：轮询「可见容器数 > 0」再点击（最多 25s），重试 3→4 次。**注意**：已实验证伪"窗口最小化导致"——最小化时 click-row 仍成功 |
| 33 | 多行写作题（essay）回填后 round-trip 校验失败 | 编辑器把 `\n` 归一化成空格，`actual !== expected` 逐字比较就误判 | essay 型容忍**仅空白差异**（`re.sub(r"\s+"," ",s)` 后比较）；**实际值为空仍判失败**，避免提交空答案 |
| 34 | `successSignal=False` 但任务其实已提交 | 部分任务提交后的成功文案不固定（不含"提交成功/得分"等关键词） | 提交判定改为 `successSignal or not hasSubmitAfter`（提交按钮消失即视为已提交） |
| 35 | 隔天续跑，**每个任务都只抽到 1 题**，全部 `leftover` 或 `verifyfail` | **课件域 `ucontent.unipus.cn` 的 SSO 会话过期**（`uai.unipus.cn` 的还在，所以 `status` 仍报 `loggedIn:true`）。点任务被重定向到 `sso.unipus.cn/sso/login?...`，该页只有 **1 个用户名输入框**，被当成"1 题" | ① `open_task` 检测 `click-row` 返回的 URL 含 `sso.unipus.cn` → 立即 `_relogin()` 再提取；② `do_fields` 开头与提交前都加"页面在 SSO 页则中止"的保险。**注意**：`status` 只看 uai 域，**不能**用它判断课件会话是否有效 |

