#!/usr/bin/env python
# runner.py — U校园 综合教程3 必修任务自动作答执行器
# 通过本地驱动 127.0.0.1:8791 操作同一浏览器会话。
# 模式：cards=翻完词汇卡；read=仅停留刷时长；fields=按序回填（含多步「下一题」）。
# 纪律：每步回填后校验；校验不通过即中止该任务并记录，不提交。
import json, time, os, sys, re, urllib.request, urllib.parse

# Windows 控制台默认 GBK，会把中文日志写成乱码；强制 stdout 用 UTF-8，与文件写入一致
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

HERE = os.path.dirname(os.path.abspath(__file__))   # mcp/ 目录（不依赖 cwd）
BASE = "http://127.0.0.1:8791"
DETAIL = "https://uai.unipus.cn/app/cmgt/resource-detail/20001198340"
STAY_MIN = float(os.environ.get("STAY_MIN", "5"))
ONLY = os.environ.get("ONLY", "").strip()          # 只跑匹配的子串（调试用）
LIMIT = int(os.environ.get("LIMIT", "0"))          # 最多跑几个任务（0=不限）
DO_SUBMIT = os.environ.get("DO_SUBMIT", "1") != "0"
PREFLIGHT = os.environ.get("PREFLIGHT", "0") == "1"
PF_ONLY = os.environ.get("PF_ONLY", "").strip()   # 预检时只看匹配的子串（空=全部 fields 任务）
STATE_FILE = os.environ.get("STATE_FILE", os.path.join(HERE, "_run_state.json"))
LOG_FILE = os.path.join(HERE, "_run.log")

_op = urllib.request.build_opener(urllib.request.ProxyHandler({}))

def _log(msg):
    line = time.strftime("[%m-%d %H:%M:%S] ") + msg
    print(line, flush=True)
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(line + "\n")

def api(cmd, body=None, timeout=180, **q):
    url = BASE + "/" + cmd
    if q:
        url += "?" + urllib.parse.urlencode(q)
    data = json.dumps(body).encode() if body is not None else None
    headers = {"content-type": "application/json"} if body is not None else {}
    for attempt in range(3):
        try:
            with _op.open(urllib.request.Request(url, data=data, headers=headers), timeout=timeout) as r:
                return json.loads(r.read().decode())
        except Exception as e:
            if attempt == 2:
                return {"_error": str(e)}
            time.sleep(2)

def evaljs(js, timeout=60):
    return api("eval", body={"js": js}, timeout=timeout).get("result")

def extract():
    d = api("extract", timeout=90)
    return d.get("data") or {}

def goto_detail():
    api("nav", url=DETAIL, timeout=90)
    time.sleep(1.5)

def _relogin():
    """课件域（ucontent）SSO 过期时，当前页会停在 sso.unipus.cn，用环境变量凭据重登。"""
    u, p = os.environ.get("UNIPUS_USER"), os.environ.get("UNIPUS_PASS")
    if not (u and p):
        _log("   !! 需要重新登录但无凭据环境变量")
        return False
    r = api("login", body={"username": u, "password": p}, timeout=180)
    _log(f"   重新登录: loggedIn={r.get('loggedIn')} needHuman={r.get('needHuman')} url={(r.get('url') or '')[:60]}")
    time.sleep(3)
    return bool(r.get("loggedIn"))

def ensure_login():
    """会话失效（被踢回 SSO）时用环境变量里的凭据重新登录；凭据不落盘。"""
    st = api("status", timeout=90)
    if st.get("loggedIn"):
        return True
    api("nav", url=DETAIL, timeout=90)   # 会被重定向到 SSO
    time.sleep(2)
    return _relogin()

# ---------- 任务模式实现 ----------
COUNTER_JS = "(()=>{const m=(document.body.innerText||'').match(/(\\d+)\\s*\\/\\s*(\\d+)/);return m?[+m[1],+m[2]]:null;})()"
NEXT_JS = "(()=>[...document.querySelectorAll('a,button,div,span')].some(e=>e.children.length===0&&(e.innerText||'').trim()==='下一题'&&e.offsetParent!==null))()"
SUBMIT_JS = "(()=>[...document.querySelectorAll('*')].some(e=>/^提\\s*交$/.test((e.innerText||'').trim())&&e.offsetParent!==null&&e.children.length===0))()"
AUTO_JS = "(()=>{const a=[...document.querySelectorAll('div.action')].find(e=>/自动播放|暂停自动播放/.test(e.innerText||''));return a?a.innerText.replace(/\\s+/g,'').trim():null;})()"
NEXT_DISABLED_JS = "(()=>{const n=[...document.querySelectorAll('div.action')].find(e=>/下一个/.test(e.innerText||''));return n?/disabled/.test(n.className):null;})()"
# 「自动播放」被遮罩挡住，Playwright 真实点击无效；用 JS 原生 click 才触发 React 处理
AUTO_CLICK_JS = "(()=>{const a=[...document.querySelectorAll('div.action')].find(e=>/^自动播放$/.test((e.innerText||'').trim()));if(!a)return false;a.click();return true;})()"

def start_auto():
    return evaljs(AUTO_CLICK_JS)

def do_cards():
    """词汇卡：必须逐张停留计时，用「自动播放」跑完全程才会被判完成。"""
    c = evaljs(COUNTER_JS)
    if not c:
        _log("   [cards] 无计数 -> 按 read 处理")
        return do_read()
    total = int(c[1])
    if evaljs(AUTO_JS) == "自动播放":
        start_auto()
    t0 = time.time()
    last, stuck = -1, 0
    cur = 0
    while time.time() - t0 < 1500:
        time.sleep(6)
        c2 = evaljs(COUNTER_JS)
        cur = int(c2[0]) if c2 else 0
        if cur >= total and evaljs(NEXT_DISABLED_JS):
            break
        if cur == last:
            stuck += 1
            if stuck >= 2 and evaljs(AUTO_JS) == "自动播放":
                start_auto()
                stuck = 0
        else:
            stuck = 0
        last = cur
    _log(f"   [cards] 自动播放结束 {cur}/{total}（用时 {int(time.time()-t0)}s）")
    return "ok"

def do_read():
    evaljs("(()=>{window.scrollTo({top:300});setTimeout(()=>window.scrollTo({top:0}),1200);return 1})()")
    time.sleep(2)
    return "ok"

CONTAINER_JS = ("(()=>{const cs=[...document.querySelectorAll('div[class*=courseDetailNodeCollapseContainer]')];"
                "return cs.filter(c=>c.offsetParent!==null).length;})()")

def wait_detail_ready(timeout=25):
    """等详情页单元容器渲染出来。SPA 偶发空白时 click-row 会报 row not found（本会话主要故障源）。"""
    t0 = time.time()
    while time.time() - t0 < timeout:
        try:
            if evaljs(CONTAINER_JS):
                return True
        except Exception:
            pass
        time.sleep(1.5)
    return False

def open_task(item, need_qs=True, tries=4):
    """导航到任务并返回首步题目；详情页 SPA 偶发未渲染，先等容器就绪再点击，失败重试。"""
    api("window", action="show", timeout=30)   # 确保窗口非最小化
    for i in range(tries):
        goto_detail()
        ready = wait_detail_ready()
        r = api("click-row", unit=item["unit"], title=item["title"], nth=item["nth"], timeout=120)
        if r.get("ok"):
            # 课件域 SSO 过期时，点任务会被重定向到 sso.unipus.cn（该页只有 1 个输入框）
            if "sso.unipus.cn" in (r.get("url") or ""):
                _log(f"   第{i+1}次：被重定向到 SSO（课件会话过期）")
                if not _relogin():
                    return []
                if not need_qs:
                    return None
                qs = extract().get("questions", [])
                if qs:
                    return qs
                time.sleep(4)
                qs = extract().get("questions", [])
                if qs:
                    return qs
                _log(f"   第{i+1}次：重新登录后仍无题目")
                continue
            time.sleep(3.5)
            if not need_qs:
                return None
            qs = extract().get("questions", [])
            if qs:
                return qs
            time.sleep(4)
            qs = extract().get("questions", [])
            if qs:
                return qs
            _log(f"   第{i+1}次打开：页面无题目（容器就绪={ready}）")
        else:
            _log(f"   第{i+1}次打开失败: {json.dumps(r, ensure_ascii=False)[:160]}（容器就绪={ready}）")
        if not api("status", timeout=60).get("loggedIn"):
            _relogin()
        time.sleep(2)
    return []

def _page_url():
    try:
        return evaljs("location.href") or ""
    except Exception:
        return ""

def do_fields(answers, qs):
    if "sso.unipus.cn" in _page_url():
        _log("   [fields] 页面停在 SSO 登录页 -> 中止（不提交）")
        return "sso"
    idx, step = 0, 0
    while True:
        step += 1
        if not qs:
            if step == 1:
                _log("   [fields] 首步无题目 -> 标记 noq（仍挂机尝试）")
                do_read()
                return "noq"
            _log(f"   [fields] step{step} 无题目，结束步骤循环")
            break
        n = len(qs)
        if idx + n > len(answers):
            _log(f"   [fields] step{step}: 需要 {n} 个答案，剩余 {len(answers)-idx} -> 跳过(不提交)")
            return "mismatch"
        payload = {str(q["index"]): answers[idx + j] for j, q in enumerate(qs)}
        idx += n
        fr = api("fill", body={"answers": payload}, timeout=300)
        if fr.get("_error"):
            _log(f"   [fields] step{step} fill 出错: {fr['_error']}")
            return "error"
        ok = fr.get("allOk")
        if not ok:
            bad = [v for v in (fr.get("verify") or []) if not v.get("ok")]
            # 容忍 essay 型「仅空白/换行差异」（编辑器会把 \n 归一化）；实际为空则不算通过
            def _norm(s): return re.sub(r"\s+", " ", (s or "")).strip()
            hard = [v for v in bad if not (v.get("type") == "essay" and _norm(v.get("actual")) and _norm(v.get("actual")) == _norm(v.get("expected")))]
            if not hard:
                _log(f"   [fields] step{step}: 回填 {n} 题（essay 仅空白差异，视为通过）")
                ok = True
            else:
                _log(f"   [fields] step{step}: 回填 {n} 题 allOk=False")
        else:
            _log(f"   [fields] step{step}: 回填 {n} 题 allOk={ok}")
        if not ok:
            bad = [v for v in (fr.get("verify") or []) if not v.get("ok")]
            _log("   [fields] 校验不通过: " + json.dumps(bad, ensure_ascii=False)[:500])
            return "verifyfail"
        if not evaljs(NEXT_JS):
            break
        api("click", text="下一题", exact="1", timeout=60)
        time.sleep(2.0)
        qs = extract().get("questions", [])
    if idx != len(answers):
        # 安全闸门：答案数与平台题目数不一致 -> 绝不提交（避免误提交错误答案）
        _log(f"   [fields] 答案数与题目数不一致（已用 {idx} / 共 {len(answers)}）-> 不提交")
        return "leftover"
    if "sso.unipus.cn" in _page_url():
        _log("   [fields] 页面在 SSO 登录页 -> 不提交")
        return "sso"
    if not DO_SUBMIT:
        _log("   [fields] DO_SUBMIT=0，跳过提交")
        return "filled"
    if not evaljs(SUBMIT_JS):
        _log("   [fields] 页面无提交按钮 -> 视为完成")
        return "nosubmit"
    sr = api("submit", timeout=150)
    sig = sr.get("successSignal")
    gone = not sr.get("hasSubmitAfter")   # 提交按钮消失 = 已提交（某些任务成功文案不固定）
    txt = (sr.get("pageText") or "").replace("\n", " ")[:150]
    _log(f"   [submit] successSignal={sig} hasSubmitAfter={sr.get('hasSubmitAfter')} | {txt}")
    return "submitted" if (sig or gone) else "submit?"

def stay(minutes):
    if minutes <= 0:
        return
    api("window", action="minimize", timeout=30)
    _log(f"   挂机 {minutes} 分钟 ...")
    end = time.time() + minutes * 60
    while time.time() < end:
        time.sleep(min(60, max(1, end - time.time())))
        left = max(0, round((end - time.time()) / 60))
        _log(f"   ⏳ 剩余 {left} 分钟（正常挂机，非故障）")

# ---------- 预检：核对「平台题目数」与「答案数」是否一致（不提交） ----------
def preflight():
    q = [it for it in build_queue() if it["mode"] == "fields"]
    if PF_ONLY:
        q = [it for it in q if PF_ONLY in it["key"]]
    done = {}
    if os.path.exists(STATE_FILE):
        done = json.load(open(STATE_FILE, encoding="utf-8"))
    q = [it for it in q if done.get(it["key"]) not in ("ok", "submitted", "submit?", "nosubmit", "filled")]
    _log(f"===== 预检 {len(q)} 个 fields 任务（不提交）=====")
    rows = []
    for item in q:
        k, ans = item["key"], item["answers"]
        t0 = time.time()
        status, info = "MATCH", ""
        try:
            goto_detail()
            r = api("click-row", unit=item["unit"], title=item["title"], nth=item["nth"], timeout=120)
            if not r.get("ok"):
                status, info = "NAVFAIL", str(r.get("reason"))
                rows.append((k, status, info)); _log(f"[PF] {status:10s} {k}  ({info})"); continue
            time.sleep(3.5)
            idx, step, total_q = 0, 0, 0
            while True:
                step += 1
                data = extract()
                qs = data.get("questions", [])
                if not qs:
                    if step == 1:
                        status, info = "NOQ", "第1步无题目(或应视为read)"
                    break
                n = len(qs); total_q += n
                if idx + n > len(ans):
                    status = "MISMATCH"
                    info = f"step{step} 平台需{n} 剩余答案{len(ans)-idx}"
                    break
                if not evaljs(NEXT_JS):
                    # 单步任务：无需回填即可判定
                    if idx + n != len(ans):
                        status, info = "EXTRA", f"平台{total_q}题 但答案{len(ans)}个"
                    break
                # 多步任务：必须真实回填才能翻页
                payload = {str(qq["index"]): ans[idx + j] for j, qq in enumerate(qs)}
                idx += n
                fr = api("fill", body={"answers": payload}, timeout=300)
                if fr.get("_error") or not fr.get("allOk"):
                    status = "VERIFYFAIL"
                    bad = [v for v in (fr.get("verify") or []) if not v.get("ok")]
                    info = json.dumps(bad, ensure_ascii=False)[:200]
                    break
                api("click", text="下一题", exact="1", timeout=60)
                time.sleep(2.0)
            if status == "MATCH":
                info = f"平台{total_q}题 答案{len(ans)}个 步{step}"
            rows.append((k, status, info))
            _log(f"[PF] {status:10s} {k}  ({info}) [{int(time.time()-t0)}s]")
        except Exception as e:
            rows.append((k, "EXC", repr(e)))
            _log(f"[PF] {'EXC':10s} {k}  ({e!r})")
    _log("\n===== 预检汇总（仅列异常）=====")
    bad = [r for r in rows if r[1] != "MATCH"]
    for k, st, info in bad:
        _log(f"  !! {st:10s} {k}  ({info})")
    _log(f"  合计 {len(rows)} 个，异常 {len(bad)} 个")
    json.dump([{"key": k, "status": s, "info": i} for k, s, i in rows],
              open(os.path.join(HERE, "_preflight.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)

# ---------- 主流程 ----------
def build_queue():
    allt = json.load(open(os.path.join(HERE, "ledger", "nce_4_rw_3.json"), encoding="utf-8"))
    ans = json.load(open(os.path.join(HERE, "answers", "nce_4_rw_3.json"), encoding="utf-8"))
    human = re.compile(r"(Watch and discuss|Listen and discuss|Think and discuss|Put on|Make business|Present a proposal|Conduct an interview|Design a poster|Give a presentation)")
    q = []
    for u in allt:
        unit = u["unit"]
        seen_title = {}   # 同名任务在本单元内的出现序号（对应 click-row 的 nth）
        for s in u["sections"]:
            for t in s["tasks"]:
                title = t["title"]
                nth = seen_title.get(title, 0)
                seen_title[title] = nth + 1
                if t["tag"] != "必修" or t["state"] == "已完成":
                    continue
                if human.search(title) or "Unit project" in s["section"]:
                    continue
                key = f"U{unit}|{s['section']}|{title}"
                spec = ans.get(key)
                if not spec:
                    _log(f"!! 无答案条目，跳过 {key}")
                    continue
                q.append({"key": key, "unit": unit, "section": s["section"], "title": title,
                          "nth": nth, "mode": spec["mode"], "answers": spec.get("answers", [])})
    return q

def main():
    if PREFLIGHT:
        return preflight()
    q = build_queue()
    _log(f"===== 队列 {len(q)} 个自动任务 | STAY={STAY_MIN}min | SUBMIT={DO_SUBMIT} =====")
    state = {}
    if os.path.exists(STATE_FILE):
        state = json.load(open(STATE_FILE, encoding="utf-8"))
    done = 0
    for item in q:
        k = item["key"]
        if ONLY and ONLY not in k:
            continue
        if state.get(k) in ("ok", "submitted", "submit?", "nosubmit", "filled", "unsupported"):
            _log(f"--- 跳过(已完成) {k}")
            continue
        if LIMIT and done >= LIMIT:
            _log("达到 LIMIT，停止")
            break
        _log(f"\n=== {k}  [mode={item['mode']} nth={item['nth']}] ===")
        t_start = time.time()
        try:
            qs0 = open_task(item, need_qs=(item["mode"] == "fields"))
            if not qs0 and item["mode"] in ("fields",):
                _log(f"   无法打开任务（{4} 次重试均失败），记录 navfail")
                state[k] = "navfail"
                json.dump(state, open(STATE_FILE, "w", encoding="utf-8"), ensure_ascii=False)
                continue
            if item["mode"] == "cards":
                res = do_cards()
            elif item["mode"] == "read":
                res = do_read()
            else:
                res = do_fields(item["answers"], qs0)
            state[k] = res
            json.dump(state, open(STATE_FILE, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
            if res in ("ok", "submitted", "submit?", "nosubmit", "filled", "noq"):
                elapsed = (time.time() - t_start) / 60.0
                stay(max(0.0, STAY_MIN - elapsed))
                done += 1
        except Exception as e:
            _log(f"   异常: {e!r}")
            state[k] = "exc"; json.dump(state, open(STATE_FILE, "w", encoding="utf-8"), ensure_ascii=False)
    _log(f"===== 结束，本轮完成 {done} 个 =====")

if __name__ == "__main__":
    main()
