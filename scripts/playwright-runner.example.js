// playwright-runner.example.js — 独立运行示例：不依赖任何 agent 宿主
// 作用：演示如何用 Node + Playwright 直接驱动 scripts/ 里的页面回调函数。
// 安装：npm init -y && npm i playwright && npx playwright install chromium
// 运行：node playwright-runner.example.js   （首次会打开浏览器，请人工完成 U校园登录）
//
// 纪律提醒（与 SKILL.md 一致）：本示例只演示「提取」与「dryRun 回填」，
// 绝不点击提交；正式回填前必须先过 references/answer-verify.md 与 submit-policy.md。
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

// scripts/*.js 的文件内容是「函数源码」，用 eval 还原成函数对象（最通用的方式，
// 在只接受函数对象的宿主 evaluate 里也是这么用，见 references/browser-adapters.md）
const load = (name) => eval(fs.readFileSync(path.join(__dirname, name), "utf8"));
const extractQuestions = load("extract_questions.js");
const fillAnswers = load("fill_answers.js");

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  // 1. 打开课程管理页（未登录会跳 SSO，人工登录一次即可，cookie 会保持）
  await page.goto("https://uai.unipus.cn/app/cmgt/course-management", {
    waitUntil: "domcontentloaded",
  });
  console.log(">>> 请在浏览器中完成登录后，回到终端按回车继续");
  await new Promise((r) => process.stdin.once("data", r));

  // 2. 提取课程清单
  const courses = await page.evaluate(load("list_courses.js"));
  console.log(JSON.stringify(courses, null, 2));

  // 3. 进入某任务页后（此处留给你按 references/homework.md 导航），提取题目：
  //    const questions = await page.evaluate(extractQuestions);
  //
  // 4. 回填（逐空、≥1.5s 节流；先 dryRun 验证定位，再真填）：
  //    for (const q of questions.questions) {
  //      const r = await page.evaluate(fillAnswers, { index: q.index, answer: "finals", dryRun: true });
  //      console.log(q.no, r);
  //      await page.waitForTimeout(1600);
  //    }

  await browser.close();
})();
