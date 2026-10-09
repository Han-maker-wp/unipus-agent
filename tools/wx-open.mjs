// wx-open.mjs — 用「普通方式」启动 Chrome（无 Playwright 自动化指纹）+ 远程调试端口，
//                打开指定 URL 并保持运行，供 wx-fetch.mjs 以 WX_CDP=1 接管。
//
// 用法：node wx-open.mjs <url>
import { spawn } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";

const HERE = dirname(fileURLToPath(import.meta.url));   // tools/
const ROOT = resolve(HERE, "..");
const PROFILE = join(ROOT, ".cache", "wxprofile");
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = process.env.WX_PORT || "9222";
const url = process.argv[2] || "https://mp.weixin.qq.com/";

mkdirSync(PROFILE, { recursive: true });
const child = spawn(
  CHROME,
  [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${PROFILE}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-blink-features=AutomationControlled",
    "--lang=zh-CN",
    url,
  ],
  { detached: true, stdio: "ignore" }
);
child.unref();
console.log(`已启动 Chrome（profile=${PROFILE}，调试端口=${PORT}）`);
console.log(`如页面显示「环境异常」，请点「去验证」完成验证，然后告诉我。`);
