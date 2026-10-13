# 待推送清单：常驻驱动 + 自动作答执行器（2026-10-11）

> 状态：**等全量跑完再执行**。本文是发布前的操作清单，照做即可一次提交干净。
> 目标：把 U校园技能从「agent 每次手动点」升级为「常驻浏览器驱动 + 自动作答执行器」。

## 0. 前置条件

- [ ] `_runner.py` 全量跑完（`_run_state.json` 不再增长），或明确决定中途发版。
- [ ] 跑完后核对 `_run_state.json`，把 `leftover` / `noq` / `navfail` 的任务列出，确认答案表无需再改。
- [ ] **停止所有使用 `mcp/` 下文件的进程**（执行器与驱动），否则改名会断。

## 1. 改名：草稿 `_` 前缀 → 正式名

仓库既有约定：`mcp/` 下**不带 `_`** 的是正式文件（`server.js`、`lib/`、`probe-dom.js`…），
带 `_` 的是本地草稿。因此发布前把 4 个正式产物改名：

| 现名 | 改为 | 说明 |
| --- | --- | --- |
| `mcp/_serve.mjs` | `mcp/serve.mjs` | 常驻浏览器驱动（127.0.0.1:8791） |
| `mcp/_runner.py` | `mcp/runner.py` | 自动作答执行器 |
| `mcp/_answers.json` | `mcp/answers/nce_4_rw_3.json` | 答案表（综合教程3 实例，124 条） |
| `mcp/_all_tasks.json` | `mcp/ledger/nce_4_rw_3.json` | 任务台账（单元/小节/必修/状态） |

改名后**必须同步改引用**（否则跑不起来）：

- [ ] `mcp/runner.py` 内 `STATE_FILE`、`LOG_FILE`、`_answers.json`、`_all_tasks.json` 路径
- [ ] `mcp/runner.py` 内 `DETAIL` 若指向上面的文件则一并改
- [ ] `mcp/serve.mjs` 内 `import ... from "./lib/helpers.js"` 不受影响；但它调用的 `scriptFn("extract_questions_v2.js")` / `fill_answers_v2.js` 在 `scripts/` 下，无需改
- [ ] 重跑一次 `STAY_MIN=0 LIMIT=1 python mcp/runner.py` 冒烟，确认改名后仍能跑

## 2. 入库文件清单

**新增（推）**
- `mcp/serve.mjs`
- `mcp/runner.py`
- `mcp/answers/nce_4_rw_3.json`
- `mcp/ledger/nce_4_rw_3.json`
- `scripts/extract_questions_v2.js` ← `serve.mjs` 运行依赖，**必推**
- `scripts/fill_answers_v2.js` ← 同上，**必推**
- `scripts/list_tasks_v2.js`
- `docs/RELEASE-待推送.md`（本文件，发版后可直接删）

**修改（推）**
- `references/pitfalls.md`（增补 #17–31）
- `references/homework.md`（增补「答案表结构 / 安全闸门 / 不支持题型」）
- `mcp/.gitignore`（增补草稿忽略规则）

**不推（草稿，已被 `mcp/.gitignore` 挡下）**
`_enum*.json`、`_enum*.sh`、`_enum*.js`、`_dir.sh`、`_go.sh`、`_nav.sh`、
`_probe_task.sh`、`_preflight.json`、`_run_state.json`、`_answers.bak.json`、`*.log`

## 3. 安全红线（每次提交前必查）

- [ ] `git status` 里**不得**出现 `mcp/profile/`（含登录态 cookie，126 MB）。已被 `mcp/.gitignore` 排除，别用 `git add -f`。
- [ ] 不得出现任何含账号/密码的文件。已知安全项：`_run_state.json`、`_answers.json`、两份 md 均**不含**凭据。
- [ ] 提交信息里不要写账号、密码、手机号。

## 4. 一键提交（改名并核对后执行）

```bash
cd D:/Desktop/Project/U校园/unipus-agent
git add mcp/serve.mjs mcp/runner.py mcp/answers mcp/ledger \
        scripts/extract_questions_v2.js scripts/fill_answers_v2.js scripts/list_tasks_v2.js \
        references/pitfalls.md references/homework.md mcp/.gitignore docs/RELEASE-待推送.md
git status                      # 再确认一次没有 profile/ 与草稿
git commit -m "feat(auto): 常驻浏览器驱动 + 必修任务自动作答执行器（三大类任务/多步题/安全闸门/断点续跑）"
git push origin HEAD
```

推送是**外部动作**，执行前先让韩炳硕确认。

## 5. 发版后可删

- `docs/RELEASE-待推送.md`（本清单）
- `mcp/answers/`、`mcp/ledger/` 若不想公开实例数据，可改为 `.example.json` 或移入 `knowledge/`
