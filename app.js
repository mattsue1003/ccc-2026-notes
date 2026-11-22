(function(){
"use strict";
const C = window.CONF, TR = window.TRANSCRIPTS || null;
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const norm = s => String(s).replace(/臺/g, "台").toLowerCase();
const fmt = sec => { sec = Math.max(0, Math.floor(sec)); const h = Math.floor(sec/3600), m = Math.floor(sec%3600/60), s = sec%60;
  return (h ? h + ":" + String(m).padStart(2,"0") : m) + ":" + String(s).padStart(2,"0"); };

// flatten
const SESS = [];
C.days.forEach((d, di) => d.sessions.forEach(s => { s.day = di; SESS.push(s); }));
SESS.forEach(s => {
  const list = C.days[s.day].sessions, i = list.indexOf(s);
  s.end = list[i+1] ? list[i+1].t : Infinity;
  (s.points || []).forEach(p => { p.s = s; });
});
const POINTS = SESS.flatMap(s => s.points || []);
const sessAt = (di, sec) => { let r = null; for (const s of C.days[di].sessions) if (s.t <= sec + 1) r = s; return r; };

const st = { day: 0, tab: "tl", q: "", scope: "all", f: { day: "", kind: "", tag: "", org: "", sess: "" }, limit: 60 };

// ---------- filters ----------
function opt(sel, items){ sel.insertAdjacentHTML("beforeend", items.map(([v,l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join("")); }
opt($("#fDay"), C.days.map((d,i) => [String(i), d.date]));
opt($("#fKind"), C.kinds.map(k => [k, k]));
const tagCount = {}; POINTS.forEach(p => (p.tags||[]).forEach(t => tagCount[t] = (tagCount[t]||0) + 1));
opt($("#fTag"), C.tags.filter(t => tagCount[t]).map(t => [t, `${t}（${tagCount[t]}）`]));
opt($("#fOrg"), C.orgTypes.filter(o => SESS.some(s => s.orgType === o)).map(o => [o, o]));
opt($("#fSess"), SESS.filter(s => s.speaker).map(s => [s.id, `${C.days[s.day].short}｜${s.speaker}（${s.org}）`]));
const FSEL = { day: "#fDay", kind: "#fKind", tag: "#fTag", org: "#fOrg", sess: "#fSess" };
Object.entries(FSEL).forEach(([k, sel]) => $(sel).addEventListener("change", e => { st.f[k] = e.target.value; st.limit = 60; renderAll(); }));
const passS = s => (!st.f.day || s.day == st.f.day) && (!st.f.org || s.orgType === st.f.org) && (!st.f.sess || s.id === st.f.sess);
const passP = p => passS(p.s) && (!st.f.kind || p.kind === st.f.kind) && (!st.f.tag || (p.tags||[]).includes(st.f.tag));
const anyF = () => Object.values(st.f).some(Boolean);
function setFilter(k, v){ st.f[k] = v; $(FSEL[k]).value = v; st.limit = 60; renderAll(); }
function fnote(){
  const n = POINTS.filter(passP).length;
  $("#fnote").innerHTML = anyF() ? `篩選中：符合 ${n} 則重點 <button id="clr">清除篩選</button>` : `共 ${SESS.length} 個場次、${POINTS.length} 則重點` + (TR ? "，含兩天完整逐字稿" : "");
  const b = $("#clr"); if (b) b.onclick = () => { Object.keys(st.f).forEach(k => { st.f[k] = ""; $(FSEL[k]).value = ""; }); renderAll(); };
}

// ---------- player ----------
let player = null, ready = false, pending = null;
window.onYouTubeIframeAPIReady = () => {
  player = new YT.Player("yt", { videoId: C.days[st.day].video, playerVars: { rel: 0, playsinline: 1, start: pending ? pending.t : 0 },
    events: { onReady: () => { ready = true; } } });
};
function go(di, t, autoplay = true){
  t = Math.max(0, Math.floor(t));
  if (di !== st.day) { st.day = di; renderDay(); }
  history.replaceState(null, "", `#d=${di+1}&t=${t}`);
  lastSec = t; seekedAt = Date.now(); tick(true);
  if (!ready) { pending = { t }; return; }
  const want = C.days[di].video;
  const curId = vidId();
  if (curId !== want) autoplay ? player.loadVideoById({ videoId: want, startSeconds: t }) : player.cueVideoById({ videoId: want, startSeconds: t });
  else { player.seekTo(t, true); if (autoplay) player.playVideo(); }
  if (innerWidth <= 900 && st.tab !== "tr") window.scrollTo({ top: $("#mainView").offsetTop - 4, behavior: "smooth" });
}
function vidId(){ try { const d = player && player.getVideoData && player.getVideoData(); return (d && d.video_id) || ""; } catch (e) { return ""; } }
const tsBtn = (di, t) => `<button class="ts${di ? " d2" : ""}" data-d="${di}" data-t="${Math.floor(t)}" title="跳到 ${C.days[di].short} ${fmt(t)}">${fmt(t)}</button>`;
document.addEventListener("click", e => {
  const b = e.target.closest(".ts[data-t]"); if (b) { e.preventDefault(); go(+b.dataset.d, +b.dataset.t); return; }
  const g = e.target.closest(".tag[data-tag]"); if (g) { setFilter("tag", g.dataset.tag); if (!st.q) showTab("pts"); return; }
  const c = e.target.closest(".ctx[data-d]"); if (c) { $("#q").value = ""; st.q = ""; renderAll(); showTab("tr"); go(+c.dataset.d, +c.dataset.t, false); setTimeout(() => flashTr(+c.dataset.t), 60); }
});

// ---------- day header & current panel ----------
function renderDays(){
  $("#days").innerHTML = C.days.map((d,i) => `<button class="${i ? "d2" : ""}" data-i="${i}" aria-current="${i===st.day}"><b>${esc(d.date)}</b><span>${esc(d.theme)}</span></button>`).join("");
  $("#days").querySelectorAll("button").forEach(b => b.onclick = () => go(+b.dataset.i, 0, false));
}
function renderDay(){
  renderDays();
  $("#ytLink").href = "https://www.youtube.com/watch?v=" + C.days[st.day].video;
  renderTL(); if (st.tab === "tr") renderTR();
  lastSess = null; tick(true);
}
let lastSess = null, lastSec = 0, seekedAt = 0;
function renderCur(s){
  if (!s) { $("#cur").innerHTML = `<h3>${esc(C.days[st.day].date)}</h3><p>${esc(C.days[st.day].theme)}</p>`; return; }
  $("#cur").innerHTML = `<div class="slot">${esc(s.slot||"")}　目前場次</div><h3>${esc(s.title)}</h3>
    <div class="who">${s.role ? `<span class="badge">${esc(s.role)}</span>` : ""}${esc(s.speaker||"")}${s.org ? "｜" + esc(s.org) : ""}</div>
    ${s.summary ? `<p>${esc(s.summary)}</p>` : ""}
    ${s.handout ? `<p class="handout"><a href="${esc(s.handout)}" target="_blank" rel="noopener">開啟本場講義 PDF</a></p>` : ""}`;
}
function tick(force){
  let sec = lastSec;
  if (ready && player.getCurrentTime) {
    const id = vidId();
    // while a seek or day switch is still loading, keep showing the target time
    if ((!id || id === C.days[st.day].video) && Date.now() - seekedAt > 1500) sec = player.getCurrentTime() || 0;
  }
  if (!force && Math.abs(sec - lastSec) < 0.5) return;
  lastSec = sec;
  $("#nowT").textContent = `${C.days[st.day].short}　${fmt(sec)}`;
  const s = sessAt(st.day, sec);
  if (s !== lastSess || force) {
    lastSess = s; renderCur(s);
    document.querySelectorAll(".sess").forEach(el => el.classList.toggle("now", s && el.dataset.id === s.id));
  }
  if (st.tab === "tr") followTr(sec);
}
setInterval(() => tick(false), 700);

// ---------- points ----------
function hl(text, q){
  const t = esc(text); if (!q) return t;
  const terms = q.split(/\s+/).filter(Boolean).map(x => esc(x).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/[台臺]/g, "[台臺]"));
  if (!terms.length) return t;
  return t.replace(new RegExp("(" + terms.join("|") + ")", "gi"), "<mark>$1</mark>");
}
const pointLi = (p, q, showSrc) => `<li>${tsBtn(p.s.day, p.t)}<div class="bd"><div class="tx"><span class="kind k-${esc(p.kind)}">${esc(p.kind)}</span>${hl(p.text, q)}</div>
  <div class="mt">${showSrc ? esc(`${C.days[p.s.day].short}｜${p.s.speaker || p.s.title}`) + "　" : ""}${(p.tags||[]).map(t => `<button class="tag" data-tag="${esc(t)}">#${esc(t)}</button>`).join("")}</div></div></li>`;

function renderTL(){
  const d = C.days[st.day];
  const list = d.sessions.filter(passS);
  $("#tl").innerHTML = `<p class="intro">${esc(d.date)}｜${esc(d.theme)}。點時間跳到該場；展開可看本場全部重點。</p>` + (list.length ? list.map(s => {
    const pts = (s.points||[]).filter(passP);
    return `<article class="sess" data-id="${esc(s.id)}">
      <div class="hd">${tsBtn(s.day, s.t)}<div class="ti"><div class="slot">${esc(s.slot||"")}</div><h3>${esc(s.title)}</h3>
      ${s.speaker ? `<div class="who">${s.role ? `<span class="badge">${esc(s.role)}</span>` : ""}${esc(s.speaker)}｜${esc(s.org)}</div>` : ""}</div></div>
      ${s.summary ? `<p>${esc(s.summary)}</p>` : ""}
      ${pts.length ? `<details${anyF() ? " open" : ""}><summary>本場重點 ${pts.length} 則${s.handout ? "" : ""}</summary><ul class="pts">${pts.map(p => pointLi(p, "", false)).join("")}</ul></details>` : ""}
      ${s.handout ? `<div class="handout" style="margin-top:4px"><a href="${esc(s.handout)}" target="_blank" rel="noopener">講義 PDF</a></div>` : ""}
    </article>`; }).join("") : `<p class="empty">這一天沒有符合篩選的場次。</p>`);
  if (lastSess) { const el = document.querySelector(`.sess[data-id="${CSS.escape(lastSess.id)}"]`); if (el) el.classList.add("now"); }
}
function renderPts(){
  const by = SESS.filter(passS).map(s => [s, (s.points||[]).filter(passP)]).filter(([,p]) => p.length);
  $("#pts").innerHTML = `<p class="intro">兩天所有場次的重點，依場次排列。用上方的「類型／主題／單位」篩選，或點任一 #標籤。</p>` + (by.length ? by.map(([s, pts]) =>
    `<section class="grp"><h3>${esc(s.speaker || s.title)}<small>${esc(C.days[s.day].short)}｜${esc(s.org || s.title)}</small></h3>
     <div class="box"><ul class="pts">${pts.map(p => pointLi(p, "", false)).join("")}</ul></div></section>`).join("") : `<p class="empty">沒有符合篩選的重點。</p>`);
}
function groupView(el, kinds, intro, groupBy){
  const pts = POINTS.filter(p => kinds.includes(p.kind) && passP(p));
  const groups = new Map();
  pts.forEach(p => { (groupBy(p)).forEach(g => { if (!groups.has(g)) groups.set(g, []); groups.get(g).push(p); }); });
  const order = [...groups.keys()].sort((a,b) => groups.get(b).length - groups.get(a).length);
  el.innerHTML = `<p class="intro">${intro}</p>` + (order.length ? order.map(g =>
    `<section class="grp"><h3>${esc(g)}<small>${groups.get(g).length} 則</small></h3><div class="box"><ul class="pts">${groups.get(g).map(p => pointLi(p, "", true)).join("")}</ul></div></section>`).join("") : `<p class="empty">沒有符合篩選的內容。</p>`);
}
const renderPol = () => groupView($("#pol"), ["政策"], "政府部門（衛福部、健保署、立法委員等）與講者提到的政策方向、試辦計畫與給付制度，依主題分類。", p => (p.tags && p.tags.length ? [p.tags[0]] : ["其他"]));
const renderStr = () => groupView($("#str"), ["策略", "建議"], "各醫院、診所、社福團體分享的實務做法與對制度的建議，依分享單位分組，方便找到可以仿效的作法。", p => [p.s.org || p.s.title]);

// ---------- transcript ----------
let trRows = [], trHits = [], trHi = -1, trFollowLock = 0;
function renderTR(){
  const body = $("#trBody");
  if (!TR) { body.innerHTML = `<p class="empty">逐字稿尚未載入。</p>`; return; }
  const d = C.days[st.day], rows = TR[d.video] || [];
  const q = $("#trq").value.trim();
  let html = "", si = -1;
  trRows = rows;
  rows.forEach(([t, tx], i) => {
    while (si + 1 < d.sessions.length && d.sessions[si+1].t <= t + 1) { si++; const s = d.sessions[si];
      html += `<div class="trh" id="trh-${esc(s.id)}">${esc(s.slot||"")}　${esc(s.speaker ? s.speaker + "｜" : "")}${esc(s.title)}</div>`; }
    html += `<p class="tp" data-i="${i}" data-t="${t}">${tsBtn(st.day, t)}<span class="tx">${hl(tx, q)}</span></p>`;
  });
  body.innerHTML = html || `<p class="empty">這一天的逐字稿尚未完成。</p>`;
  $("#trJump").innerHTML = `<option value="">跳到場次…</option>` + d.sessions.map(s => `<option value="${esc(s.id)}">${esc((s.slot||"").split("–")[0] + " " + (s.speaker || s.title))}</option>`).join("");
  trHits = [...body.querySelectorAll("mark")]; trHi = -1;
  $("#trCount").textContent = q ? (trHits.length ? `${trHits.length} 處` : "找不到") : "";
  lastTp = null;
}
$("#trq").addEventListener("input", debounce(() => { renderTR(); if (trHits.length) stepHit(1); }, 250));
$("#trq").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); stepHit(e.shiftKey ? -1 : 1); } });
$("#trNext").onclick = () => stepHit(1); $("#trPrev").onclick = () => stepHit(-1);
$("#trJump").onchange = e => { const el = document.getElementById("trh-" + e.target.value); if (el) { trFollowLock = Date.now(); el.scrollIntoView({ block: "start", behavior: "smooth" }); } e.target.value = ""; };
function stepHit(dir){
  if (!trHits.length) return;
  if (trHi >= 0) trHits[trHi].classList.remove("cur");
  trHi = (trHi + dir + trHits.length) % trHits.length;
  const m = trHits[trHi]; m.classList.add("cur"); trFollowLock = Date.now();
  m.scrollIntoView({ block: "center", behavior: "smooth" });
  $("#trCount").textContent = `${trHi+1} / ${trHits.length}`;
}
let lastTp = null;
function followTr(sec){
  if (!trRows.length) return;
  let lo = 0, hi = trRows.length - 1, k = 0;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (trRows[m][0] <= sec + .3) { k = m; lo = m + 1; } else hi = m - 1; }
  const el = document.querySelector(`.tp[data-i="${k}"]`);
  if (el === lastTp) return;
  if (lastTp) lastTp.classList.remove("now");
  lastTp = el; if (!el) return;
  el.classList.add("now");
  const playing = ready && player.getPlayerState && player.getPlayerState() === 1;
  if ($("#follow").checked && playing && Date.now() - trFollowLock > 8000) el.scrollIntoView({ block: "center", behavior: "smooth" });
}
function flashTr(t){
  let best = null; document.querySelectorAll(".tp").forEach(el => { if (+el.dataset.t <= t + .5) best = el; });
  if (best) { trFollowLock = Date.now(); best.scrollIntoView({ block: "center" }); best.classList.add("flash"); setTimeout(() => best.classList.remove("flash"), 2500); }
}

// ---------- global search ----------
function renderSearch(){
  const q = st.q, terms = norm(q).split(/\s+/).filter(Boolean);
  const match = s => { const n = norm(s); return terms.every(t => n.includes(t)); };
  const items = [];
  if (st.scope !== "tr") {
    SESS.filter(passS).forEach(s => { if (!st.f.kind && !st.f.tag && match([s.title, s.speaker, s.org, s.summary].join(" "))) items.push({ k: "s", s }); });
    POINTS.filter(p => passP(p) && match(p.text + " " + (p.tags||[]).join(" ") + " " + (p.s.speaker||"") + " " + (p.s.org||""))).forEach(p => items.push({ k: "p", p }));
  }
  let trCount = 0;
  if (TR && st.scope !== "notes" && !st.f.kind && !st.f.tag) {
    C.days.forEach((d, di) => { if (st.f.day && st.f.day != di) return;
      (TR[d.video] || []).forEach(([t, tx]) => { if (!match(tx)) return; const s = sessAt(di, t); if (s && !passS(s)) return;
        items.push({ k: "t", di, t, tx, s }); trCount++; }); });
  }
  const nn = items.length - trCount;
  $("#searchTitle").textContent = `「${q}」：重點筆記 ${nn} 筆` + (TR && st.scope !== "notes" ? `、逐字稿 ${trCount} 段` : "") + (anyF() ? "（已套用篩選）" : "");
  const shown = items.slice(0, st.limit);
  $("#results").innerHTML = shown.length ? shown.map(it => {
    if (it.k === "s") { const s = it.s; return `<li><div class="src"><span class="badge">場次</span>${esc(C.days[s.day].short)}｜${esc(s.slot||"")}</div>
      <div class="tx"><b>${hl(s.title, q)}</b>　${hl((s.speaker||"") + (s.org ? "｜" + s.org : ""), q)}</div>${s.summary ? `<div class="tx" style="margin-top:4px">${hl(s.summary, q)}</div>` : ""}
      <div class="acts">${tsBtn(s.day, s.t)}</div></li>`; }
    if (it.k === "p") { const p = it.p; return `<li><div class="src"><span class="badge">重點</span>${esc(C.days[p.s.day].short)}｜${esc(p.s.speaker || p.s.title)}${p.s.org ? "（" + esc(p.s.org) + "）" : ""}</div>
      <div class="tx"><span class="kind k-${esc(p.kind)}">${esc(p.kind)}</span>${hl(p.text, q)}</div>
      <div class="acts">${tsBtn(p.s.day, p.t)}${(p.tags||[]).map(t => `<button class="tag" data-tag="${esc(t)}">#${esc(t)}</button>`).join("")}</div></li>`; }
    return `<li><div class="src"><span class="badge">逐字稿</span>${esc(C.days[it.di].short)}｜${esc(it.s ? (it.s.speaker || it.s.title) : "")}</div>
      <div class="tx">${hl(it.tx, q)}</div><div class="acts">${tsBtn(it.di, it.t)}<button class="ctx" data-d="${it.di}" data-t="${it.t}">看上下文</button></div></li>`;
  }).join("") + (items.length > st.limit ? `<li class="more" style="background:none;border:0"><button id="moreBtn">再顯示 60 筆（剩 ${items.length - st.limit}）</button></li>` : "")
  : `<li class="empty" style="background:none;border:0">找不到符合的內容。試試較短的關鍵字，或清除篩選。</li>`;
  const mb = $("#moreBtn"); if (mb) mb.onclick = () => { st.limit += 60; renderSearch(); };
}
$("#q").addEventListener("input", debounce(e => { st.q = e.target.value.trim(); st.limit = 60; renderAll(); }, 250));
$("#scope").querySelectorAll("button").forEach(b => b.onclick = () => { st.scope = b.dataset.s; $("#scope").querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", x === b)); st.limit = 60; renderSearch(); });

// ---------- tabs ----------
function showTab(t){
  st.tab = t;
  document.querySelectorAll(".tabs button").forEach(b => b.setAttribute("aria-selected", b.dataset.tab === t));
  ["tl","pts","pol","str","tr"].forEach(x => $("#" + x).classList.toggle("hide", x !== t));
  renderTab();
}
function renderTab(){ ({ tl: renderTL, pts: renderPts, pol: renderPol, str: renderStr, tr: renderTR })[st.tab](); if (st.tab === "tr") { lastTp = null; followTr(lastSec); } }
document.querySelectorAll(".tabs button").forEach(b => b.onclick = () => showTab(b.dataset.tab));
if (!TR) document.querySelectorAll("[data-tr]").forEach(el => el.classList.add("hide"));
if (!TR) {
  document.getElementById("h1").textContent = "2026 台灣社區整合照顧研討會｜重點筆記與時間軸";
  document.getElementById("q").placeholder = "搜尋重點筆記：在宅急症、復健病房、出院準備、重症兒、居家醫療…";
  document.getElementById("caveat").textContent = "重點筆記由語音辨識結果整理改寫，人名、單位、數字可能有誤；引用前請對照影片或各講者講義原文。";
}

function renderAll(){
  fnote();
  const searching = !!st.q;
  $("#searchView").classList.toggle("hide", !searching);
  if (searching) renderSearch();
  renderTab();
}
function debounce(fn, ms){ let h; return (...a) => { clearTimeout(h); h = setTimeout(() => fn(...a), ms); }; }

// ---------- init ----------
const m = location.hash.match(/d=(\d)(?:&t=(\d+))?/);
if (m) { st.day = Math.min(C.days.length - 1, Math.max(0, +m[1] - 1)); pending = { t: +(m[2] || 0) }; lastSec = pending.t; }
renderDay(); renderAll();
})();
