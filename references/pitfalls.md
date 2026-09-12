# 踩坑速查表（pitfalls）

> 现象 → 原因 → 解决。真机校准 2026-09-12；平台改版先怀疑本文档过期。

| # | 现象 | 原因 | 解决 |
| --- | --- | --- | --- |
| 1 | 点任务条目报「covered by unipus-tabs_tabItemContainer」或「pointer probe returned no click point」 | 任务条目被吸顶单元页签遮挡/文本节点无点击点 | `scrollIntoView({block:"center"})` 后重试；仍失败取 `getBoundingClientRect` 中心坐标用坐标点击兜底 |
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
