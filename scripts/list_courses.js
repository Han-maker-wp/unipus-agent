// list_courses.js — U校园课程管理页课程清单提取回调（宿主无关：只读函数）
// 用法：在 https://uai.unipus.cn/app/cmgt/course-management 页面上下文执行本函数
// （Playwright / 浏览器类 MCP / 宿主内置浏览器均可，传参形态见 browser-adapters.md）。
// 纪律：只读函数。
// 真机校准：2026-09-12。卡片字段为「标签：值」文本对，按文本启发式解析。
() => {
  const text = (el) => (el?.innerText || "").trim();
  const pick = (root, label) => {
    for (const el of root.querySelectorAll("*")) {
      if (el.children.length === 0 && text(el) === label) {
        // 值在兄弟或相邻节点
        let n = el.nextElementSibling;
        if (n && text(n)) return text(n);
        n = el.parentElement?.nextElementSibling;
        if (n && text(n) && text(n).length < 40) return text(n);
      }
    }
    return "";
  };

  // 每个课程卡：含「课程名称：」文本的较大容器 —— 用进度条所在卡片向上找
  const cards = [];
  const seen = new Set();
  for (const bar of document.querySelectorAll("[role=progressbar]")) {
    let card = bar.closest("div[class*=card], li, section") || bar.parentElement?.parentElement;
    while (card && card.parentElement && !text(card).includes("课程名称")) {
      card = card.parentElement;
      if (text(card).length > 400) break; // 冲出卡片到整页了
    }
    if (!card || seen.has(card)) continue;
    seen.add(card);
    const books = [...card.querySelectorAll("p")].map(text).filter((t) => t && t.length > 6);
    const progress = [...card.querySelectorAll("[role=progressbar]")].map((p) => text(p) || p.getAttribute("aria-valuenow") || "");
    cards.push({
      course: pick(card, "课程名称："),
      className: pick(card, "班级名称："),
      term: pick(card, "记分周期："),
      books,
      progress,
    });
  }
  return {
    page: location.href,
    activeTab: text(document.querySelector("[role=tab][aria-selected=true], [class*=tab][class*=active]")),
    courses: cards,
  };
}
