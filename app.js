/* IELTS 点读器 - STATIC v4.3
   - TXT: 本地读取
   - PDF/DOCX: 上传到本机后端 /api/parse 解析
   - 单击单词：读单词
   - 双击单词：读该单词所在整句
   - 长按单词（移动端好用）：读该单词所在整句
   - 点击句子空白处：读整句
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
// Service Worker: hard disable (避免老缓存)
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
  if (!t) return;

  // iOS/PWA 有时需要先 “触发一次” 才稳定：这里做个温和兜底
  try { window.speechSynthesis.resume && window.speechSynthesis.resume(); } catch(_){}

  const u = new SpeechSynthesisUtterance(t);
  const lang = elAccent.value;
  u.lang = lang;
  u.rate = parseFloat(elRate.value||"1.0");
  const v = pickVoice(lang);
  if (v) u.voice = v;

  currentEl = targetEl;
  if (currentEl) currentEl.classList.add("playing");

  setStatus(`朗读中：${t.length>40 ? (t.slice(0,40)+"…") : t}`);
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
  return s
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/\"/g,"&quot;")
    .replace(/'/g,"&#39;");
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
  const fd = new FormData();
  fd.append("file", file);

  setStatus(`上传并解析：${file.name} ...`);
  const res = await fetch("/api/parse", {
    method: "POST",
    body: fd,
    cache: "no-store",
  });

  if (!res.ok){
    const t = await res.text().catch(()=>"");
    throw new Error(`后端解析失败：HTTP ${res.status} ${t}`);
  }

  const data = await res.json();
  if (!data || typeof data.text !== "string"){
    throw new Error("后端返回格式不对（需要 {text: ...}）");
  }
  return data.text;
}

async function readTxtFile(file){
  return await file.text();
}

function normalizeText(t){
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
    setStatus("已生成：单击单词读单词｜双击/长按单词读整句｜点句子空白读整句");

  } catch (e){
    console.error(e);
    alert(String(e && e.message ? e.message : e));
    setStatus("失败");
  }
});

// ----------------------------
// Click / Double-click / Long-press to speak
// ----------------------------
function findSentenceNode(node){
  let cur = node;
  while (cur && cur !== elPaper){
    if (cur.classList && cur.classList.contains("s")) return cur;
    cur = cur.parentNode;
  }
  return null;
}

let longPressTimer = null;
let longPressed = false;

function clearLongPress(){
  if (longPressTimer){
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }
}

elPaper.addEventListener("touchstart", (ev)=>{
  // 长按单词读整句（移动端重点）
  const target = ev.target;
  if (!target || !(target.classList && target.classList.contains("w"))) return;

  longPressed = false;
  clearLongPress();

  longPressTimer = setTimeout(()=>{
    const sNode = findSentenceNode(target);
    if (sNode){
      const s = sNode.dataset.s || "";
      longPressed = true;
      speak(s, sNode);
    }
  }, 450);
}, {passive:true});

elPaper.addEventListener("touchend", ()=>{
  clearLongPress();
}, {passive:true});

elPaper.addEventListener("touchcancel", ()=>{
  clearLongPress();
}, {passive:true});

elPaper.addEventListener("click", (ev)=>{
  const target = ev.target;
  if (!target) return;

  // 如果刚刚触发过长按，就不要再执行“单击读单词”
  if (longPressed){
    longPressed = false;
    return;
  }

  // 点单词：单击读单词；双击读整句
  if (target.classList && target.classList.contains("w")){
    const clickCount = ev.detail || 1;
    if (clickCount >= 2){
      const sNode = findSentenceNode(target);
      const s = sNode ? (sNode.dataset.s || "") : "";
      if (s) speak(s, sNode || target);
      else speak(target.dataset.w || "", target);
      return;
    }
    const w = target.dataset.w || "";
    speak(w, target);
    return;
  }

  // 点句子空白处：读整句
  const sNode = findSentenceNode(target);
  if (sNode){
    const s = sNode.dataset.s || "";
    speak(s, sNode);
  }
});

// Voice init
setupVoices();
if (typeof speechSynthesis !== "undefined"){
  speechSynthesis.onvoiceschanged = ()=> setupVoices();
}

// iOS first interaction hint
document.addEventListener("touchstart", ()=>{}, {passive:true});
setStatus("就绪（选择文件→生成点读）");
