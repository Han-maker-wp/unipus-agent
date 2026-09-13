// list_tasks.js — U校园教程详情页单元/小节/任务目录提取回调（宿主无关：只读函数）
// 用法：在 https://uai.unipus.cn/app/cmgt/resource-detail/<id> 页面（教程学习页签）执行本函数
// （Playwright / 浏览器类 MCP / 宿主内置浏览器均可，传参形态见 browser-adapters.md）。
// 纪律：只读函数。
// 真机校准：2026-09-12《新编大学英语（第四版）综合教程3》。
() => {
  const text = (el) => (el?.innerText || "").trim();

  // 单元页签
  const units = [...document.querySelectorAll("[role=tab], [class*=tabItemContainer]")]
    .map(text).filter((t) => /^Unit\s*\d+$/.test(t));

  // 当前展示的目录：小节按钮（1-6 Read and practice）与任务条目（generic 文本 + 状态）
  const items = [];
  const panel = document.querySelector("[role=tabpanel]");
  const root = panel || document.body;
  for (const btn of root.querySelectorAll("button")) {
    const t = text(btn);
    if (/^\d+-\d+\s/.test(t)) items.push({ kind: "section", title: t });
  }
  // 任务条目：紧跟小节按钮之后的短文本行（带状态词）
  const lines = [...root.querySelectorAll("*")].filter((el) => {
    if (el.children.length) return false;
    const t = text(el);
    return t && t.length <= 60 && !/^(未开始|必修|选修|已完成|进行中)$/.test(t) && !/^\d+-\d+\s/.test(t);
  });
  // 以 DOM 顺序合并：记录每行文本与其后兄弟的状态词
  const taskState = (el) => {
    let n = el.parentElement;
    for (let i = 0; i < 3 && n; i++) {
      const s = text(n).replace(text(el), "").trim();
      const m = s.match(/(未开始|必修|选修|已完成|进行中)/);
      if (m) return m[1];
      n = n.parentElement;
    }
    return "";
  };
  const seenText = new Set();
  const tasks = [];
  let lastSection = "";
  for (const el of root.querySelectorAll("*")) {
    const t = text(el);
    if (!t || t.length > 60) continue;
    // 小节标题（如 1-6 Read and practice）：父层先命中即记，叶子重复出现靠 seenText 去重
    if (/^\d+-\d+\s/.test(t)) {
      const title = t.split("\n").map((s) => s.trim()).find((l) => /^\d+-\d+\s/.test(l)) || t;
      if (!seenText.has(title)) { seenText.add(title); items.push({ kind: "section", title }); }
      lastSection = title;
      continue;
    }
    if (el.children.length) continue;
    if (seenText.has(t)) continue;
    seenText.add(t);
    const st = taskState(el);
    if (st || /^(Preview|Reading \d)/.test(t))
      tasks.push({ section: lastSection, title: t, state: st });
  }

  return {
    page: location.href,
    bookTitle: text(document.querySelector("main img[alt] + * ")) || "",
    units,
    sections: items,
    tasks,
  };
}
