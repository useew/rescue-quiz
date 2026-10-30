/* ============ 危重急症抢救流程 · 刷题助手 — 应用逻辑 ============ */
(function () {
  "use strict";

  const QUESTIONS = (window.QUESTIONS || []);
  const LS = {
    wrong: "rescue_quiz_wrong_v1",
    practiced: "rescue_quiz_practiced_v1",
    stats: "rescue_quiz_stats_v1",
  };

  /* ---------------- 工具 ---------------- */
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };
  const shuffle = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const loadLS = (key, dft) => {
    try { const v = JSON.parse(localStorage.getItem(key)); return v ?? dft; }
    catch { return dft; }
  };
  const saveLS = (key, val) => { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} };

  const wrongSet = () => new Set(loadLS(LS.wrong, []));
  const practicedSet = () => new Set(loadLS(LS.practiced, []));

  /* ---------------- 章节索引 ----------------
     从 knowledge_point（形如“第3章 成人心跳呼吸骤停抢救流程 - 血管活性药物”）推导章节。 */
  function cnToNum(s) {
    const d = { 一:1, 二:2, 三:3, 四:4, 五:5, 六:6, 七:7, 八:8, 九:9 };
    if (/^[0-9]+$/.test(s)) return parseInt(s, 10);
    if (s === "十") return 10;
    if (s.charAt(0) === "十") return 10 + (d[s.charAt(1)] || 0);
    const m2 = /^([一二三四五六七八九])十([一二三四五六七八九])?$/.exec(s);
    if (m2) return d[m2[1]] * 10 + (m2[2] ? d[m2[2]] : 0);
    if (d[s] != null) return d[s];
    return null;
  }

  function kpIdx(kp) {
    const m = String(kp || "").match(/第\s*([一二三四五六七八九十0-9]+)\s*章/);
    if (!m) return 99;
    return cnToNum(m[1]) != null ? cnToNum(m[1]) : 99;
  }

  const chapters = (function buildChapters() {
    const map = new Map(); // idx -> {no, name, ids:[]}
    const parse = (kp) => {
      const m = String(kp || "").match(/第\s*([一二三四五六七八九十0-9]+)\s*章\s*(.+?)(?:\s+[-–—]\s+|$)/);
      if (!m) return null;
      const idx = cnToNum(m[1]);
      return { idx: idx != null ? idx : 99, name: m[2].trim() };
    };
    QUESTIONS.forEach((q) => {
      const p = parse(q.knowledge_point);
      const idx = p ? p.idx : 99;
      if (!map.has(idx)) map.set(idx, { no: idx, name: p ? p.name : "其他知识点", ids: [] });
      map.get(idx).ids.push(q.id);
    });
    return Array.from(map.values()).sort((a, b) => a.no - b.no);
  })();

  const chapterName = (kp) => {
    const m = String(kp || "").match(/第\s*([一二三四五六七八九十0-9]+)\s*章\s*(.+?)(?:\s+[-–—]\s+|$)/);
    if (!m) return "其他";
    const idx = cnToNum(m[1]);
    return ((idx != null ? "第" + idx + "章" : "第" + m[1] + "章") + " " + m[2].trim());
  };

  /* ---------------- 状态 ---------------- */
  const state = {
    mode: null,        // practice | exam | wrong
    pool: [],          // 本轮题目（已过滤/打乱）
    idx: 0,
    selection: null,   // 当前题所选选项
    answered: null,    // 当前题是否已判分
    results: [],       // exam 模式: [{id, chosen, correct}]
    settings: null,    // 本轮设置，用于“再来一次”
    startTime: 0,
  };

  /* ---------------- 首页 ---------------- */
  function fillChapterSelect(sel, defaultVal) {
    sel.innerHTML = "";
    const all = el("option"); all.value = "all"; all.textContent = "全部章节"; sel.appendChild(all);
    chapters.forEach((c) => {
      const o = el("option"); o.value = String(c.no);
      o.textContent = (c.no === 99 ? "其他" : "第" + c.no + "章") + " " + c.name + "（" + c.ids.length + "题）";
      sel.appendChild(o);
    });
    if (defaultVal) sel.value = defaultVal;
  }

  function renderHome() {
    $("#view-home").classList.remove("hidden");
    $("#view-quiz").classList.add("hidden");
    $("#view-result").classList.add("hidden");
    $("#hero-total").textContent = QUESTIONS.length;
    $("#hero-single").textContent = QUESTIONS.filter((q) => q.type === "single_choice").length;
    $("#hero-case").textContent = QUESTIONS.filter((q) => q.type === "case_analysis").length;
    fillChapterSelect($("#sel-practice-chapter"));
    fillChapterSelect($("#sel-exam-chapter"));

    const cl = $("#chapter-list");
    cl.innerHTML = "";
    chapters.forEach((c) => {
      const item = el("div", "chapter-item");
      item.title = "点击开始该章练习";
      const name = c.no === 99 ? "其他知识点" : ("第" + c.no + "章 " + c.name);
      item.appendChild(el("span", "ch-name", name));
      item.appendChild(el("span", "ch-count", c.ids.length + " 题"));
      item.addEventListener("click", () => {
        $("#sel-practice-chapter").value = String(c.no);
        startPractice({ chapter: String(c.no), type: "all", shuffle: true });
      });
      cl.appendChild(item);
    });
    updateWrongCount();
    updateStatChip();
  }

  function updateWrongCount() {
    const n = wrongSet().size;
    $("#wrong-count").textContent = n > 0 ? ("当前错题 " + n + " 题") : "暂无错题";
    $("#wrong-count").classList.toggle("muted", n === 0);
    $("[data-start='wrong']").disabled = n === 0;
  }
  function updateStatChip() {
    $("#stat-summary").textContent = "已练 " + practicedSet().size + " · 错题 " + wrongSet().size;
  }

  /* ---------------- 组卷 ---------------- */
  function pickPool(opts) {
    let pool = QUESTIONS.slice();
    if (opts.chapter && opts.chapter !== "all") {
      const want = parseInt(opts.chapter, 10);
      pool = pool.filter((q) => kpIdx(q.knowledge_point) === want);
    }
    if (opts.type && opts.type !== "all") pool = pool.filter((q) => q.type === opts.type);
    if (opts.shuffle !== false) pool = shuffle(pool);
    if (opts.count) pool = pool.slice(0, opts.count);
    return pool;
  }

  function startQuiz(mode, pool, settings) {
    if (!pool.length) { alert("当前筛选条件下没有题目，请更换章节或题型。"); return; }
    state.mode = mode;
    state.pool = pool;
    state.idx = 0;
    state.selection = null;
    state.answered = null;
    state.results = [];
    state.settings = settings;
    state.startTime = Date.now();
    $("#view-home").classList.add("hidden");
    $("#view-result").classList.add("hidden");
    $("#view-quiz").classList.remove("hidden");
    $("#exam-sheet").classList.toggle("hidden", mode !== "exam");
    if (mode === "exam") buildSheet();
    renderQuestion();
  }

  function startPractice(opts) { startQuiz("practice", pickPool(opts), opts); }
  function startExam(opts) { startQuiz("exam", pickPool(opts), opts); }
  function startWrong(opts) {
    const wrong = wrongSet();
    let pool = QUESTIONS.filter((q) => wrong.has(q.id));
    if (opts.shuffle !== false) pool = shuffle(pool);
    startQuiz("wrong", pool, opts);
  }

  /* ---------------- 答题 ---------------- */
  function renderQuestion() {
    const q = state.pool[state.idx];
    state.selection = null;
    state.answered = false;
    $("#progress-fill").style.width = ((state.idx) / state.pool.length * 100) + "%";
    $("#progress-label").textContent = (state.idx + 1) + " / " + state.pool.length;

    $("#q-type").textContent = q.type === "case_analysis" ? "病例分析" : "常规单选";
    $("#q-kp").textContent = q.knowledge_point || "";

    const qt = $("#q-text");
    qt.innerHTML = "";
    if (q.type === "case_analysis" && q.case) {
      qt.appendChild(el("span", "case-lead", q.case));
      qt.appendChild(el("span", null, q.question));
    } else {
      qt.appendChild(el("span", null, q.question));
    }

    const box = $("#q-options");
    box.innerHTML = "";
    (q.options || []).forEach((optText, i) => {
      const key = String.fromCharCode(65 + i);
      const o = el("div", "opt");
      o.dataset.key = key;
      o.appendChild(el("span", "opt-key", key));
      const t = String(optText).replace(/^[A-D][.、]\s*/, "");
      o.appendChild(el("span", "opt-text", t));
      o.addEventListener("click", () => selectOption(key, o));
      box.appendChild(o);
    });

    $("#q-feedback").classList.add("hidden");
    const isExam = state.mode === "exam";
    $("#btn-confirm").disabled = true;
    $("#btn-confirm").textContent = isExam ? "确认并下一题 →" : "确认答案";
    $("#btn-next").style.display = "none";
    $("#btn-prev").disabled = state.idx === 0;
    markSheetCurrent();
  }

  function selectOption(key, optEl) {
    if (state.answered) return;
    $$("#q-options .opt").forEach((o) => o.classList.remove("selected"));
    optEl.classList.add("selected");
    state.selection = key;
    $("#btn-confirm").disabled = false;
  }

  function confirmAnswer() {
    if (state.selection == null) return;
    const q = state.pool[state.idx];
    const correct = state.selection === String(q.answer).toUpperCase();

    if (state.mode === "exam") {
      state.results.push({ id: q.id, chosen: state.selection, correct });
      markSheetAnswered(state.idx);
      // 记录练习足迹与错题
      recordPractice(q.id, correct);
      if (state.idx + 1 < state.pool.length) {
        state.idx++;
        renderQuestion();
      } else {
        finishExam();
      }
      return;
    }

    // practice / wrong：判分 + 反馈
    state.answered = true;
    $$("#q-options .opt").forEach((o) => {
      o.classList.add("locked");
      if (o.dataset.key === String(q.answer).toUpperCase()) o.classList.add("correct");
      if (o.dataset.key === state.selection && !correct) o.classList.add("wrong");
    });
    const fb = $("#q-feedback");
    fb.classList.remove("hidden");
    const v = $("#fb-verdict");
    v.className = "fb-verdict " + (correct ? "ok" : "bad");
    v.textContent = correct ? "✔ 回答正确" : "✘ 回答错误，正确答案是 " + String(q.answer).toUpperCase();
    $("#fb-explanation").textContent = q.explanation || "（本题暂无解析）";
    $("#fb-kp").textContent = q.knowledge_point || "";
    $("#btn-confirm").disabled = true;
    $("#btn-next").style.display = "";
    $("#btn-next").textContent = state.idx + 1 < state.pool.length ? "下一题 →" : "查看结果 →";
    state.results.push({ id: q.id, chosen: state.selection, correct });
    recordPractice(q.id, correct);
    updateStatChip();
  }

  function recordPractice(id, correct) {
    const p = practicedSet(); p.add(id); saveLS(LS.practiced, Array.from(p));
    const w = wrongSet();
    if (correct) w.delete(id); else w.add(id);
    saveLS(LS.wrong, Array.from(w));
  }

  /* ---------------- 答题卡 ---------------- */
  function buildSheet() {
    const grid = $("#exam-sheet-grid");
    grid.innerHTML = "";
    state.pool.forEach((q, i) => {
      const c = el("div", "sheet-cell", String(i + 1));
      c.addEventListener("click", () => { state.idx = i; renderQuestion(); });
      grid.appendChild(c);
    });
  }
  function markSheetCurrent() {
    $$("#exam-sheet-grid .sheet-cell").forEach((c, i) => c.classList.toggle("current", i === state.idx));
  }
  function markSheetAnswered(i) {
    const c = $$("#exam-sheet-grid .sheet-cell")[i];
    if (c) c.classList.add("answered");
  }

  /* ---------------- 交卷 / 结果 ---------------- */
  function finishExam() {
    const total = state.results.length;
    const right = state.results.filter((r) => r.correct).length;
    const wrong = total - right;
    const secs = Math.round((Date.now() - state.startTime) / 1000);
    const pct = total ? Math.round(right / total * 100) : 0;

    $("#view-quiz").classList.add("hidden");
    $("#view-result").classList.remove("hidden");
    $("#result-title").textContent = pct >= 90 ? "🏆 优秀！抢救流程烂熟于心" : pct >= 60 ? "👍 合格，继续巩固薄弱章节" : "💪 别灰心，复盘后重新挑战";
    $("#result-sub").textContent = "模拟考试 · 共 " + total + " 题";
    $("#rs-total").textContent = total;
    $("#rs-right").textContent = right;
    $("#rs-wrong").textContent = wrong;
    $("#rs-time").textContent = secs >= 60 ? Math.floor(secs / 60) + "分" + (secs % 60) + "秒" : secs + "s";
    $("#score-pct").textContent = pct;
    const ring = $("#ring-fill");
    ring.style.stroke = pct >= 60 ? "var(--ok)" : "var(--danger)";
    ring.style.strokeDashoffset = 326.7;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      ring.style.strokeDashoffset = (326.7 * (1 - pct / 100)).toFixed(1);
    }));
    renderReview();
    updateStatChip();
  }

  function renderReview() {
    const list = $("#review-list");
    list.classList.remove("hidden");
    list.innerHTML = "";
    state.results.forEach((r, i) => {
      const q = QUESTIONS.find((x) => x.id === r.id);
      if (!q) return;
      const item = el("div", "review-item");
      const head = el("div", "ri-head");
      head.appendChild(el("span", "badge " + (r.correct ? "ok" : "bad"), (i + 1) + ". " + (r.correct ? "答对" : "答错")));
      head.appendChild(el("span", "chip chip-type", q.type === "case_analysis" ? "病例分析" : "常规单选"));
      head.appendChild(el("span", "chip chip-kp", q.knowledge_point || ""));
      item.appendChild(head);

      item.appendChild(el("div", "ri-q", q.type === "case_analysis" && q.case ? q.case + "\n" + q.question : q.question));

      const opts = el("div", "ri-opts");
      (q.options || []).forEach((t, oi) => {
        const key = String.fromCharCode(65 + oi);
        const row = el("div", "ri-opt");
        let mark = "";
        if (key === String(q.answer).toUpperCase()) { mark = "✓"; row.classList.add("is-correct"); }
        if (key === r.chosen && !r.correct) { mark = "✗"; row.classList.add("is-wrong"); }
        if (mark) row.appendChild(el("span", mark === "✓" ? "ok-mark" : "bad-mark", mark));
        row.appendChild(el("span", null, key + ". " + String(t).replace(/^[A-D][.、]\s*/, "")));
        opts.appendChild(row);
      });
      item.appendChild(opts);

      const ex = el("div", "ri-expl");
      ex.appendChild(el("span", null, "【解析】" + (q.explanation || "（暂无解析）")));
      ex.appendChild(el("span", "kp", "【知识点】" + (q.knowledge_point || "")));
      item.appendChild(ex);

      list.appendChild(item);
    });
  }

  function finishPractice() {
    const total = state.results.length;
    const right = state.results.filter((r) => r.correct).length;
    const pct = total ? Math.round(right / total * 100) : 0;
    const secs = Math.round((Date.now() - state.startTime) / 1000);
    $("#view-quiz").classList.add("hidden");
    $("#view-result").classList.remove("hidden");
    $("#result-title").textContent = pct === 100 ? "🌟 全对！" : pct >= 80 ? "👍 练习完成，表现不错" : "📚 练习完成，看看解析再巩固";
    $("#result-sub").textContent = (state.mode === "wrong" ? "错题重做 · " : "练习模式 · ") + "共 " + total + " 题";
    $("#rs-total").textContent = total;
    $("#rs-right").textContent = right;
    $("#rs-wrong").textContent = total - right;
    $("#rs-time").textContent = secs >= 60 ? Math.floor(secs / 60) + "分" + (secs % 60) + "秒" : secs + "s";
    $("#score-pct").textContent = pct;
    const ring = $("#ring-fill");
    ring.style.stroke = pct >= 60 ? "var(--ok)" : "var(--danger)";
    ring.style.strokeDashoffset = 326.7;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      ring.style.strokeDashoffset = (326.7 * (1 - pct / 100)).toFixed(1);
    }));
    renderReview();
    updateStatChip();
  }

  function nextAction() {
    if (state.idx + 1 < state.pool.length) {
      state.idx++;
      renderQuestion();
    } else if (state.mode === "exam") {
      if (confirm("已答完全部题目，确定交卷吗？")) finishExam();
    } else {
      finishPractice();
    }
  }

  /* ---------------- 事件绑定 ---------------- */
  function bind() {
    $$(".mode-card [data-start]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const mode = btn.dataset.start;
        if (mode === "practice") {
          startPractice({
            chapter: $("#sel-practice-chapter").value,
            type: $("#sel-practice-type").value,
            shuffle: $("#chk-practice-shuffle").checked,
          });
        } else if (mode === "exam") {
          startExam({
            chapter: $("#sel-exam-chapter").value,
            type: "all",
            shuffle: $("#chk-exam-shuffle").checked,
            count: parseInt($("#sel-exam-count").value, 10),
          });
        } else if (mode === "wrong") {
          startWrong({ shuffle: true });
        }
      });
    });

    $("#btn-confirm").addEventListener("click", confirmAnswer);
    $("#btn-next").addEventListener("click", nextAction);
    $("#btn-prev").addEventListener("click", () => {
      if (state.idx > 0) { state.idx--; renderQuestion(); }
    });
    $("#btn-quit").addEventListener("click", () => {
      if (confirm("退出当前练习？未判分的作答将不记入统计。")) renderHome();
    });
    $("#btn-home").addEventListener("click", renderHome);
    $("#btn-home2").addEventListener("click", renderHome);
    $("#btn-submit").addEventListener("click", () => {
      const unanswered = state.pool.length - state.results.length;
      if (unanswered > 0 && !confirm("还有 " + unanswered + " 题未作答，未作答题按错误计。确定交卷？")) return;
      for (let i = 0; i < state.pool.length; i++) {
        if (!state.results.some((r) => r.id === state.pool[i].id)) {
          // 未作答：按错误记录（chosen=null）
          const q = state.pool[i];
          state.results.push({ id: q.id, chosen: null, correct: false });
          recordPractice(q.id, false);
        }
      }
      state.results.sort((a, b) => state.pool.findIndex((p) => p.id === a.id) - state.pool.findIndex((p) => p.id === b.id));
      finishExam();
    });
    $("#btn-again").addEventListener("click", () => {
      if (!state.settings) { renderHome(); return; }
      const s = state.settings;
      if (state.mode === "exam") startExam(s);
      else if (state.mode === "wrong") startWrong(s);
      else startPractice(s);
    });
    $("#btn-review").addEventListener("click", () => {
      $("#review-list").scrollIntoView({ behavior: "smooth" });
    });
    $("#btn-clear-wrong").addEventListener("click", () => {
      if (confirm("确定清空错题本？")) { saveLS(LS.wrong, []); updateWrongCount(); updateStatChip(); }
    });

    // 键盘快捷键：1-4 选择，回车确认/下一题
    document.addEventListener("keydown", (e) => {
      if ($("#view-quiz").classList.contains("hidden")) return;
      if (/^[1-4]$/.test(e.key)) {
        const opt = $$("#q-options .opt")[parseInt(e.key, 10) - 1];
        if (opt) selectOption(opt.dataset.key, opt);
      } else if (e.key === "Enter") {
        if (!state.answered && state.selection != null && !$("#btn-confirm").disabled) confirmAnswer();
        else if (state.answered || state.mode === "exam") {
          if (state.mode === "practice" || state.mode === "wrong") nextAction();
          else if (state.selection != null) confirmAnswer();
        }
      }
    });
  }

  /* ---------------- 启动 ---------------- */
  function init() {
    if (!QUESTIONS.length) {
      document.body.innerHTML = '<div style="padding:60px;text-align:center;font-family:sans-serif;color:#666">题库数据未加载（data/questions.js 为空）。</div>';
      return;
    }
    bind();
    renderHome();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
