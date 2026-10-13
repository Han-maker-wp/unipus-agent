// list_tasks_v2.js — U校园教程详情页「单元目录」提取回调（v2，2026-10-11 真机校准）
// 相对 v1 的修正：
//  1) v1 用 document.querySelector("[role=tabpanel]") 定位目录，命中的是**外层** tabpane（教程简介/学习要求），
//     故拿不到单元目录；本版改用 div[class*=courseDetailNodeCollapseContainer]。
//  2) 教程详情页**每个单元各有一个**该容器（共 8 个），只有当前单元可见；
//     隐藏单元的 innerText 会把相邻文字粘连，必须取可见容器。
//  3) 以 [class*=nodePanel] 为小节节点，行内 [class*=taskRequireIcon]=必修/选修、[class*=nodePassStateTip]=状态。
// 用法：在 https://uai.unipus.cn/app/cmgt/resource-detail/<id> 页面执行（只读函数，不点击任何东西）。
// 切单元请用真实点击（Playwright locator.click），React 合成的 el.click() 不会触发页签切换。
() => {
  const clean = (s) => (s || "").replace(/\s+/g, " ").trim();
  const cs = [...document.querySelectorAll("div[class*=courseDetailNodeCollapseContainer]")];
  const scope = cs.find((c) => c.offsetParent !== null) || cs[0] || document.body;

  const seen = new Set();
  const sections = [];
  for (const node of scope.querySelectorAll("[class*=nodePanel]")) {
    const header = node.querySelector(".ant-collapse-header");
    const sec = clean(header ? header.innerText : "").slice(0, 60);
    if (!/^\d+-\d+\s/.test(sec) || seen.has(sec)) continue; // 只要带编号的小节，且去重
    seen.add(sec);
    const tasks = [];
    for (const nameEl of node.querySelectorAll("[class*=taskTypeName]")) {
      const row = nameEl.closest("[class*=taskItemInnerLayout]");
      if (!row) continue;
      const tag = row.querySelector("[class*=taskRequireIcon]");
      const st = row.querySelector("[class*=nodePassStateTip]");
      tasks.push({
        title: clean(nameEl.innerText),
        tag: tag ? clean(tag.innerText) : "",      // 必修 / 选修 / ""
        state: st ? clean(st.innerText) : "",      // 已完成 / 进行中 / 未开始
      });
    }
    if (tasks.length) sections.push({ section: sec, tasks });
  }

  const units = [...document.querySelectorAll("[class*=tabItemContainer] *")]
    .map((e) => clean(e.innerText))
    .filter((t) => /^Unit\s*\d+$/.test(t));

  return { url: location.href, units: [...new Set(units)], sections };
};
