# 登录与导航地图（login-and-nav）

> 真机校准：2026-09-12 · U校园AI版（uai.unipus.cn）· 班级视图为学生端

## 登录

1. 打开任意 U校园 页面（如 `https://uai.unipus.cn/app/cmgt/course-management`），未登录会 302 到
   `https://sso.unipus.cn/sso/login?service=<原URL>`。
2. 登录页结构（默认「密码登录」页签）：
   - `textbox "手机号/邮箱/用户名"`、`textbox "密码"`
   - `checkbox "记住我"`（默认勾选）
   - `checkbox "我已阅读并同意…"`（**必须勾选**，否则登录无效果）
   - `button "登录"`
3. 流程：填账号 → 填密码 → 勾协议 → 点登录 → `waitForTimeout(3000)` 后读 URL 确认回到 service 地址。
4. 实测（2026-09）账密登录**无验证码**；若风控触发滑块/短信验证 → 红线 3，交人工。
5. 凭据：向用户当场索取（红线 6：不落盘）。会话内登录态由浏览器 cookie 保持，跨会话通常无需重登。

## 导航地图

```
uai.unipus.cn/app/cmgt/course-management     课程管理（侧边栏：首页/我的课程/我的作业/iWrite）
 └─ 课程卡片：点「教材名 paragraph」进入（不是点课程名，课程名不可点）
     └─ uai.unipus.cn/app/cmgt/resource-detail/<教程ID>   教程详情
         ├─ 页签：教程学习 | 作业 | 考核方案 | 综合成绩 | 学习报告 | 补充资源
         ├─ 教程学习 → 教程目录：
         │    ├─ Unit 1..8 横向页签（unipus-tabs）
         │    ├─ 小节按钮：「1-6 Read and practice」[expanded]
         │    └─ 任务条目：generic 文本（如 Banked cloze）+ 状态（未开始/必修）
         └─ 作业 → 待作答/批阅中/已批阅（老师没布置时显示「暂无作业」）
侧边栏「我的作业」= 全部课程的作业聚合页（/app/homework/my-homework），结构同上三个页签
```

任务点击进课程ware：

```
ucontent.unipus.cn/_explorationpc_default/pc.html?cid=…&courseResourceId=…
    #/course-v2:<hash>+nce_4_rw_3_ucloud+2023_12_20/courseware/u1/u1g13/u1g33/u1g61
```

- hash 即「单元/小节/任务」路由，**整段保存**，可直接 goto 回到同一任务。
- `nce_4_rw_3` = 新编大学英语第四版综合教程3（教材代码，可用于校验知识库版本）。
- 首次进入任务弹出 `dialog`：「本单元学习时间：无限制 / 是否必修：必修 / button 我知道了」→ 点「我知道了」关闭。
- 页面顶部面包屑 + 左上 `link "return"` 返回教程详情；右上 `img "list"` 展开全目录侧栏。

## 课程列表提取

用 `scripts/list_courses.js`（页面回调，返回课程/教程 JSON）。手工定位：
课程卡片字段：课程名称、班级名称、记分周期、在学教程、每本教程的「已学任务 a/b + 学习进度」。

## 已知坑

- 「我的课程」文本匹配到侧边栏标题和链接两个元素 → 用 `getByRole("link", { name: "我的课程" })`。
- 任务条目是普通文本不是按钮；且会被吸顶单元页签遮挡 → 先 `scrollIntoView({block:"center"})`，
  仍被遮挡用坐标点击兜底（见 pitfalls.md #1）。
- 提交按钮文本是「提 交」（中间有空格）→ 匹配用 `/提\s*交/`。
