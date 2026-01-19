// IELTS Click-Reader PWA - app.js
// - Paste text or upload TXT/PDF/DOCX
// - Render click-to-speak word & sentence
// - PDF: pdf.js (browser text-layer extraction)
// - DOCX: mammoth (browser)
// - Optional fallback: external Node backend (?api=... or localStorage IELTS_API_BASE)

"use strict";

// ----------------------------
// DOM
// ----------------------------
const elText = document.getElementById("inputText");
const elFile = document.getElementById("fileInput");
const elGen  = document.getElementById("btnGenerate");
const elStop = document.getElementById("btnStop");
const elPaper = document.getElementById("paper");
const elStatus = document.getElementById("status");

const elVoice = document.getElementById("voiceSelect");
const elRate = document.getElementById("rateSelect");

function setStatus(s){
  if (elStatus) elStatus.textContent = s;
}

// ----------------------------
// TTS
// ----------------------------
let currentUtter = null;
let currentHighlight = null;

function clearHighlight(){
  if (currentHighlight){
    currentHighlight.classList.remove("active");
    currentHighlight = null;
  }
}

function stopSpeak(){
  try{
    if (typeof speechSynthesis !== "undefined"){
      speechSynthesis.cancel();
    }
  }catch(_){}
  currentUtter = null;
  clearHighlight();
}

function speak(text, highlightEl){
  if (!text) return;
  stopSpeak();

  const utter = new SpeechSynthesisUtterance(text);
  const voiceIndex = parseInt(elVoice?.value || "0", 10);
  const voices = speechSynthesis.getVoices();
  if (voices && voices.length && !Number.isNaN(voiceIndex) && voices[voiceIndex]){
    utter.voice = voices[voiceIndex];
  }

  const rate = parseFloat(elRate?.value || "1.0");
  utter.rate = Number.isFinite(rate) ? rate : 1.0;

  utter.onstart = ()=>{
    if (highlightEl){
      highlightEl.classList.add("active");
      currentHighlight = highlightEl;
    }
    setStatus("朗读中...");
  };
  utter.onend = ()=>{
    clearHighlight();
    setStatus("就绪（点击朗读）");
  };
  utter.onerror = ()=>{
    clearHighlight();
    setStatus("朗读失败");
  };

  currentUtter = utter;
  speechSynthesis.speak(utter);
}

function setupVoices(){
  const voices = speechSynthesis.getVoices() || [];
  if (!elVoice) return;
  elVoice.innerHTML = "";

  voices.forEach((v, i)=>{
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = `${v.name} (${v.lang})`;
    elVoice.appendChild(opt);
  });

  // 默认选 en-GB 优先
  let pick = 0;
  for (let i=0;i<voices.length;i++){
    if ((voices[i].lang || "").toLowerCase().includes("en-gb")){
      pick = i; break;
    }
  }
  elVoice.value = String(pick);
}

// ----------------------------
// Render clickable text
// ----------------------------
function escapeHtml(s){
  return (s||"")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function splitSentences(text){
  // very lightweight sentence split
  // keep Chinese punctuation too
  const parts = [];
  let buf = "";
  for (const ch of text){
    buf += ch;
    if (/[.!?。！？]/.test(ch)){
      parts.push(buf.trim());
      buf = "";
    }
  }
  if (buf.trim()) parts.push(buf.trim());
  return parts;
}

function tokenizeWords(sentence){
  // keep punctuation as separate tokens for display
  // words: letters/numbers/'- ; punctuation separate
  const tokens = [];
  const re = /([A-Za-z0-9]+(?:[’']?[A-Za-z0-9]+)*(?:-[A-Za-z0-9]+)*)|([^\sA-Za-z0-9]+)/g;
  let m;
  while ((m = re.exec(sentence)) !== null){
    tokens.push(m[0]);
  }
  return tokens;
}

function renderClickable(text){
  elPaper.innerHTML = "";
  const sentences = splitSentences(text);

  sentences.forEach((s)=>{
    const sEl = document.createElement("div");
    sEl.className = "s";
    sEl.dataset.s = s;

    const tokens = tokenizeWords(s);
    tokens.forEach((tok)=>{
      if (/^[A-Za-z0-9]/.test(tok)){
        const wEl = document.createElement("span");
        wEl.className = "w";
        wEl.dataset.w = tok;
        wEl.innerHTML = escapeHtml(tok);
        sEl.appendChild(wEl);
      } else {
        const pEl = document.createElement("span");
        pEl.className = "p";
        pEl.textContent = tok;
        sEl.appendChild(pEl);
      }
    });

    elPaper.appendChild(sEl);
  });
}

// ----------------------------
// Parse helpers (Browser-first)
// ----------------------------

// Optional external backend base:
// 1) URL ?api=https://xxx.example.com
// 2) localStorage IELTS_API_BASE
function getApiBase(){
  const qs = new URLSearchParams(location.search);
  const q = (qs.get("api") || "").trim();
  const ls = (localStorage.getItem("IELTS_API_BASE") || "").trim();
  return (q || ls).replace(/\/$/, "");
}

function loadScriptOnce(url, globalKey){
  return new Promise((resolve, reject)=>{
    if (globalKey && window[globalKey]) return resolve(window[globalKey]);
    const existed = [...document.scripts].find(s => s.src === url);
    if (existed){
      existed.addEventListener("load", ()=> resolve(globalKey ? window[globalKey] : true), {once:true});
      existed.addEventListener("error", ()=> reject(new Error("加载脚本失败：" + url)), {once:true});
      return;
    }
    const s = document.createElement("script");
    s.src = url;
    s.async = true;
    s.onload = ()=> resolve(globalKey ? window[globalKey] : true);
    s.onerror = ()=> reject(new Error("加载脚本失败：" + url));
    document.head.appendChild(s);
  });
}

async function ensurePdfJs(){
  // pdf.js UMD global: pdfjsLib
  const pdfjsUrl = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.js";
  const workerUrl = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.js";
  const lib = await loadScriptOnce(pdfjsUrl, "pdfjsLib");
  if (lib && lib.GlobalWorkerOptions){
    lib.GlobalWorkerOptions.workerSrc = workerUrl;
  }
  return lib;
}

async function ensureMammoth(){
  // mammoth browser global: mammoth
  const url = "https://unpkg.com/mammoth/mammoth.browser.min.js";
  return await loadScriptOnce(url, "mammoth");
}

async function parsePdfInBrowser(file){
  const pdfjsLib = await ensurePdfJs();
  const ab = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: ab }).promise;

  let out = [];
  for (let i = 1; i <= pdf.numPages; i++){
    const page = await pdf.getPage(i);
    const tc = await page.getTextContent();
    const line = tc.items.map(it => (it.str || "")).join(" ");
    out.push(line);
  }
  return out.join("\n");
}

async function parseDocxInBrowser(file){
  const mammoth = await ensureMammoth();
  const ab = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer: ab });
  return result && result.value ? result.value : "";
}

async function parseByExternalBackend(file, apiBase){
  const fd = new FormData();
  fd.append("file", file);

  // 你可以把 Node 微服务做成：POST ${apiBase}/parse
  // 也可以做成：POST ${apiBase}/api/parse
  // 这里我们两种都尝试一下（先 /parse）
  async function tryPost(url){
    const res = await fetch(url, { method:"POST", body: fd, cache:"no-store" });
    if (!res.ok){
      const t = await res.text().catch(()=> "");
      throw new Error(`后端解析失败：HTTP ${res.status} ${t}`);
    }
    const data = await res.json();
    if (!data || data.ok !== true) throw new Error("后端返回 ok=false");
    return data.text || "";
  }

  try{
    return await tryPost(apiBase + "/parse");
  }catch(_){
    return await tryPost(apiBase + "/api/parse");
  }
}

async function parseDocument(file){
  const apiBase = getApiBase();

  // extension
  const name = (file.name || "").toLowerCase();
  const ext = name.split(".").pop();

  // 1) TXT：直接读
  if (ext === "txt" || file.type === "text/plain"){
    setStatus(`读取 TXT：${file.name} ...`);
    return normalizeText(await readTxtFile(file));
  }

  // 2) PDF：优先浏览器抽文字层；抽不到再尝试外部后端
  if (ext === "pdf" || file.type === "application/pdf"){
    setStatus(`解析 PDF（浏览器）：${file.name} ...`);
    let t = "";
    try{ t = await parsePdfInBrowser(file); }catch(e){ /* ignore, fallback */ }
    if (t && t.length > 20) return t;
    if (apiBase) return normalizeText(await parseByExternalBackend(file, apiBase));
    throw new Error("PDF 解析失败：这份 PDF 可能是扫描件/图片，没有文字层。建议：1) 先把 PDF 转成 TXT 再上传；2) 或配置 Node 后端（?api=你的后端域名）。");
  }

  // 3) DOCX：浏览器可解析；失败再走外部后端
  if (ext === "docx" || file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"){
    setStatus(`解析 DOCX（浏览器）：${file.name} ...`);
    let t = "";
    try{ t = await parseDocxInBrowser(file); }catch(e){ /* ignore, fallback */ }
    if (t && t.length > 5) return t;
    if (apiBase) return normalizeText(await parseByExternalBackend(file, apiBase));
    throw new Error("DOCX 解析失败：请换成 TXT 或配置 Node 后端（?api=你的后端域名）。");
  }

  // 其他格式
  throw new Error("不支持的文件类型：" + (ext || file.type || "unknown"));
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
      alert("请先：粘贴文本，或选择 TXT/PDF/DOCX 文件。\n\n想用 PDF/DOCX：选择文件后，再点【生成点读】。");
      return;
    }

    let text = "";

    if (pasted){
      setStatus("读取粘贴文本...");
      text = pasted;
    } else if (f){
      text = await parseDocument(f);
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
