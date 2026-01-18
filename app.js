/* IELTS 点读器 - STATIC v4.2 (force no-sw)
   - TXT: 本地读取
   - PDF/DOCX: 上传到后端 /api/parse 解析（需配置后端域名）
   - 点击单词读单词；点击句子空白读整句
*/

const $ = (id)=>document.getElementById(id);

const elText = $("text");
const elFile = $("file");
const elGen = $("btnGen");
const elStop = $("btnStop");
const elStatus = $("status");
const elPaper = $("paper");

const elAccent = $("accent");
const elRate = $("rate");
const elVoice = $("voice");

let voices = [];
let currentEl = null;

// ----------------------------
// Backend API base (for public deploy)
// ----------------------------
// Local dev:
//   - keep empty -> use same-origin /api/parse (http://localhost:xxxx)
// Cloudflare Pages / any static host:
//   - set to your backend base (Render/Railway/VPS), e.g.
//     localStorage.setItem('IELTS_API_BASE','https://xxxx.onrender.com')
//     then refresh.
//   - or add query param: ?api=https://xxxx.onrender.com
const API_BASE_LS_KEY = "IELTS_API_BASE";

function isLocalhostHost(){
  return /^(localhost|127\.0\.0\.1|0\.0\.0\.0)$/i.test(location.hostname);
}

function readApiBaseFromUrl(){
  // Support setting backend via URL:
  //   - ?api=...  or ?apiBase=...
  //   - #api=...  or #apiBase=...
  try{
    const u = new URL(location.href);
    const q = u.searchParams.get("api") || u.searchParams.get("apiBase");
    if (q) return q.replace(/\/$/, "");

    const hash = (u.hash || "").replace(/^#/, "");
    const params = new URLSearchParams(hash);
    const h = params.get("api") || params.get("apiBase");
    if (h) return h.replace(/\/$/, "");
  }catch(_e){}
  return "";
}

function resolveApiBase(){
  const fromUrl = readApiBaseFromUrl();
  if (fromUrl){
    try{ localStorage.setItem(API_BASE_LS_KEY, fromUrl); }catch(_e){}
    return fromUrl;
  }
  try{
    return (localStorage.getItem(API_BASE_LS_KEY) || "").replace(/\/$/, "");
  }catch(_e){
    return "";
  }
}

function ensureApiBaseConfiguredOrThrow(){
  const apiBase = resolveApiBase();
  if (!apiBase && !isLocalhostHost()){
    const msg = [
      "未配置后端地址：当前是静态站点域名（非 localhost），但 PDF/DOCX 解析需要后端。",
      "",
      "✅ 解决办法（任选其一）：",
      "1) 在浏览器控制台执行：",
      "   localStorage.setItem('" + API_BASE_LS_KEY + "','https://<你的Render域名>'); 然后刷新",
      "2) 或在网址后面加参数：?api=https://<你的Render域名>",
      "",
      "（例如：https://ielts-click-reader-frontend.pages.dev/?api=https://xxxx.onrender.com）"
    ].join("\n");
    throw new Error(msg);
  }
  // Local dev: allow empty (use same-origin)
  return apiBase;
}

// ----------------------------
// Service Worker: hard disable
// ----------------------------
(async function hardDisableSW(){
  try{
    if ("serviceWorker" in navigator){
      const regs = await navigator.serviceWorker.getRegistrations();
      for (const r of regs) await r.unregister();
    }
  }catch(_){/* ignore */}
})();

// ----------------------------
// TTS
// ----------------------------
function setStatus(msg){ elStatus.textContent = `状态：${msg}`; }

function setupVoices(){
  if (!("speechSynthesis" in window)){
    setStatus("浏览器不支持 TTS（建议 Chrome/Edge）");
    return;
  }
  voices = window.speechSynthesis.getVoices() || [];
  elVoice.innerHTML = "";
  const optAuto = document.createElement("option");
  optAuto.value = "__auto__";
  optAuto.textContent = "自动选择（推荐）";
  elVoice.appendChild(optAuto);
  for (const v of voices){
    const opt = document.createElement("option");
    opt.value = v.name;
    opt.textContent = `${v.name} (${v.lang})`;
    elVoice.appendChild(opt);
  }
}

function pickVoice(langHint){
  const name = elVoice.value;
  if (name && name !== "__auto__"){
    const v = voices.find(x=>x.name===name);
    if (v) return v;
  }
  const hint = (langHint||"").toLowerCase();
  const pref = voices.filter(v=>(v.lang||"").toLowerCase().startsWith(hint));
  if (pref.length) return pref[0];
  const anyEn = voices.find(v=>(v.lang||"").toLowerCase().startsWith("en"));
  return anyEn || voices[0] || null;
}

function stopSpeak(){
  try{ window.speechSynthesis.cancel(); }catch(_){ }
  if (currentEl) currentEl.classList.remove("playing");
  currentEl = null;
}

function speak(text, targetEl=null){
  stopSpeak();
  if (!("speechSynthesis" in window)){
    alert("浏览器不支持 TTS（SpeechSynthesis）。建议 Chrome/Edge。");
    return;
  }
  const t = (text||"").trim();
  if (!t){ return; }
  const u = new SpeechSynthesisUtterance(t);
  const lang = elAccent.value;
  u.lang = lang;
  u.rate = parseFloat(elRate.value||"1.0");
  const v = pickVoice(lang);
  if (v) u.voice = v;

  currentEl = targetEl;
  if (currentEl) currentEl.classList.add("playing");

  setStatus(`朗读中：${t.length>40? t.slice(0,40)+"…" : t}`);
  window.speechSynthesis.speak(u);

  u.onend = ()=>{
    if (currentEl) currentEl.classList.remove("playing");
    currentEl = null;
    setStatus("就绪");
  };
  u.onerror = ()=>{
    if (currentEl) currentEl.classList.remove("playing");
    currentEl = null;
    setStatus("朗读失败（可能被系统阻止，先点一下页面再试）");
  };
}

// ----------------------------
// Text processing: sentence -> word
// ----------------------------
const WORD_RE = /[A-Za-z]+(?:[-'][A-Za-z]+)*/g;

function escapeHtml(s){
  return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\"/g,"&quot;").replace(/'/g,"&#39;");
}

function splitSentences(text){
  // 尽量保守：按 . ! ? 和换行切
  const raw = (text||"")
    .replace(/\r\n/g,"\n")
    .replace(/\r/g,"\n")
    .split(/(?<=[.!?])\s+|\n+/);
  return raw.map(s=>s.trim()).filter(Boolean);
}

function renderClickable(text){
  const sentences = splitSentences(text);
  if (!sentences.length){
    elPaper.innerHTML = "（空内容）";
    return;
  }
  const html = sentences.map((s)=>{
    let out = "";
    let last = 0;
    const matches = [...s.matchAll(WORD_RE)];
    for (const m of matches){
      const start = m.index;
      const end = start + m[0].length;
      out += escapeHtml(s.slice(last, start));
      const w = escapeHtml(m[0]);
      out += `<span class="w" data-w="${w}">${w}</span>`;
      last = end;
    }
    out += escapeHtml(s.slice(last));
    const dataS = escapeHtml(s);
    return `<div class="s" data-s="${dataS}">${out}</div>`;
  }).join("");

  elPaper.innerHTML = html;
}

// ----------------------------
// Parse helpers
// ----------------------------
async function parseByBackend(file){
  const apiBase = ensureApiBaseConfiguredOrThrow();
  const url = (apiBase ? apiBase : "") + "/api/parse";

  const fd = new FormData();
  fd.append("file", file, file.name);

  const r = await fetch(url, {
    method: "POST",
    body: fd,
    mode: apiBase ? "cors" : "same-origin",
  });

  // Cloudflare Pages 上如果误走到同源 /api/parse，常见就是 405/404
  if (!r.ok){
    let text = "";
    try{ text = await r.text(); }catch(_){ /* ignore */ }
    throw new Error(`后端解析失败：HTTP ${r.status}${text ? "\n"+text.slice(0,400) : ""}`);
  }
  const data = await r.json();
  if (!data.ok){
    throw new Error(data.error || "后端返回 ok=false");
  }
  return data.text || "";
}

async function readTxtFile(file){
  return await file.text();
}

function normalizeText(t){
  // 保留换行，但去掉太多空白
  return (t||"")
    .replace(/\u00a0/g," ")
    .replace(/\r\n/g,"\n")
    .replace(/\r/g,"\n")
    .replace(/[ \t]+/g," ")
    .replace(/\n{3,}/g,"\n\n")
    .trim();
}

// ----------------------------
// UI actions
// ----------------------------
elStop.addEventListener("click", ()=>{
  stopSpeak();
  setStatus("已停止");
});

elGen.addEventListener("click", async ()=>{
  try{
    stopSpeak();

    // 1) 优先用粘贴文本
    const pasted = (elText.value||"").trim();
    const f = elFile.files && elFile.files.length ? elFile.files[0] : null;

    if (!pasted && !f){
      alert("请先：粘贴文本，或选择 TXT/PDF/DOCX 文件。\n\n想用 PDF：选择文件后，再点【生成点读】。");
      return;
    }

    let text = "";

    if (pasted){
      setStatus("读取粘贴文本...");
      text = pasted;
    } else if (f){
      const name = (f.name||"").toLowerCase();
      if (name.endsWith(".txt")){
        setStatus(`读取 TXT：${f.name} ...`);
        text = await readTxtFile(f);
      } else if (name.endsWith(".pdf") || name.endsWith(".docx")){
        text = await parseByBackend(f);
      } else {
        alert("仅支持：TXT / PDF / DOCX");
        return;
      }
    }

    text = normalizeText(text);
    if (!text){
      setStatus("解析结果为空（可能是扫描版 PDF 没文字层）");
      elPaper.textContent = "（解析为空：这份 PDF 可能是扫描版/图片，没有文字层，需要 OCR）";
      return;
    }

    renderClickable(text);
    setStatus("已生成，点击朗读");

  } catch (e){
    console.error(e);
    alert(String(e && e.message ? e.message : e));
    setStatus("失败");
  }
});

// Click-to-speak
elPaper.addEventListener("click", (ev)=>{
  const target = ev.target;
  if (!target) return;

  // 单词
  if (target.classList && target.classList.contains("w")){
    const w = target.dataset.w || "";
    speak(w, target);
    return;
  }

  // 句子：点击句子容器空白处 或 非单词文本
  let node = target;
  while (node && node !== elPaper){
    if (node.classList && node.classList.contains("s")){
      const s = node.dataset.s || "";
      speak(s, node);
      return;
    }
    node = node.parentNode;
  }
});

// Voice init
setupVoices();
if (typeof speechSynthesis !== "undefined"){
  speechSynthesis.onvoiceschanged = ()=> setupVoices();
}

// First interaction hint for iOS
document.addEventListener("touchstart", ()=>{}, {passive:true});
setStatus("就绪（选择文件→生成点读）");
