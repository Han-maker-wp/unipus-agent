# unipus-mcp

U校园（U校园AI版 uai.unipus.cn）浏览器自动化 MCP 服务端。从 [unipus-agent](../SKILL.md) 技能的
真机校准脚本移植而来，供 AI 宿主（ZCode 等）以 MCP 工具调用，替代「逐次内联 evaluate」的低效模式。

## 工具一览

| 工具 | 作用 | 备注 |
| --- | --- | --- |
| `unipus_status` | 登录态 + 当前页 | 顺带把会话 cookie 持久化 |
| `unipus_login` | 账密登录 | 凭据仅会话内用，不落盘；滑块/验证码自动把窗口带到前台等人工（轮询 180s） |
| `unipus_open` | 打开 URL + 关弹窗 | |
| `unipus_snapshot` | 原始 ARIA 快照 | 陌生页面/定位失败时的逃生口 |
| `unipus_list_courses` | 课程清单 | |
| `unipus_open_course` | 点教材名进教程详情 | 片段匹配 + nth |
| `unipus_list_tasks` | 单元任务目录（含状态） | 可先切 Unit |
| `unipus_open_task` | 打开任务（courseware） | 支持 hash 直达；UI 点击无效自动降级 JS 直点 |
| `unipus_extract` | 提取题目 JSON | 内容就绪轮询，直取不再为空 |
| `unipus_fill` | 逐空回填 + 回读复核 | ≥1.5s 抖动节流；**绝不提交** |
| `unipus_submit` | 点「提 交」→「确 定」 | **唯一提交入口**，需 confirm:true |
| `unipus_stay` | 挂机刷时长（≤4 分钟/次） | 自动恢复前台（时长统计检测可见性），心跳走 stderr |
| `unipus_window` | 浏览器窗口前/后台切换 | |
| `unipus_kb_search` | 本地知识库 grep | 题目数据不出境 |

## 纪律（与 SKILL.md 红线一致）

1. 提交必须显式调用 `unipus_submit`，且仅当用户已授权、审核单无低置信度题目时才调用；
   平台提示「仅记录第一次作答的得分」——提交前必须 `unipus_fill` 的 verify 全绿。
2. 验证码/滑块交人工；「检测到异常行为」→ 停止提交。
3. 拟人节奏：所有写入 ≥1.5s 抖动节流。
4. 凭据不落盘（cookie 持久化仅限浏览器 profile 自身的等价存储）。

## 注册（ZCode）

`~/.zcode/cli/config.json` → `mcp.servers` 增加：

```json
"unipus": {
  "type": "stdio",
  "command": "D:/NodeJS/node.exe",
  "args": ["C:/Users/hanbi/.zcode/workspace/default/unipus-agent/mcp/server.js"],
  "env": { "UNIPUS_HIDDEN": "1" },
  "timeoutMs": 300000
}
```

`UNIPUS_HIDDEN=1`：浏览器窗口启动后最小化（不挡人用电脑）；登录/挂机会自动临时恢复前台。
浏览器为持久 profile（`mcp/profile/`），**SSO 会话 cookie 登录成功后自动改写 180 天有效期落盘**，
正常情况下跨会话免登录（实测 2026-10-07）。改完配置重启 ZCode 生效。

## 真机校准记录（2026-10-07）

- **登录**：账密登录（166*** 手机号）正常，首次触发拖滑块需人工；cookie 持久化后跨进程免登。
- **点任务条目**：事件绑在祖先容器（`div.courses-unit_taskItemContainer`，带 onclick）上，
  直接点文本 span 会被 tooltip 层拦截；先爬 onclick 祖先，UI 点不动降级 `el.click()`。
- **课程目录默认落在「上次学习位置」**：点 Unit 1 的任务可能落进 Unit 2 的 courseware
  （子页签跟随点击类型）→ 打开任务后必须用 `unipus_extract` 的 section 字段核对单元。
- **「我知道了」弹窗**：DOM 有多个同名文本，`count()===1` 判断必失效；须 deepest-visible 定位，
  且关完验证 modal 真消失——弹窗盖着时提交点击全被遮罩吞掉。
- **提交流程**：footer `a.btn`「提 交」→ 确认弹窗「本单元仅记录第一次作答的得分，确定提交吗？」
  →「确 定」（带空格）。确认后提交按钮消失。
- **提取就绪**：courseware 是 SPA，词库先渲染、输入框后到；就绪判据用 `questions.length || radioCount`。

## 开发测试

```bash
npm install --registry=https://registry.npmmirror.com   # 本机 env 代理已死，勿用默认源
node test-login.js          # 登录 + 列课程（凭据走环境变量 UNIPUS_USER/UNIPUS_PASS）
node test-flow.js "综合教程 3" 1 "Banked cloze"   # 全链路只读：进教程→切单元→开任务→提取
node test-do-section.js     # 完整做一节（回填+提交，按脚本内知识库答案）
```
