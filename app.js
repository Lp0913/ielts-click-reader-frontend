```javascript
// IELTS Click-Reader PWA - app.js
// - Paste text or upload TXT/PDF/DOCX
// - Render click-to-speak word & sentence
// - PDF: pdf.js (browser text-layer extraction)
// - DOCX: mammoth (browser)
// - Optional fallback: external Node backend (?api=... or localStorage IELTS_API_BASE)
//   Local-first: if running on http://localhost, default to same-origin backend (/api/parse)

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
// Backend base (Local-first)
// ----------------------------
// Priority:
// 1) URL ?api=...
// 2) localStorage IELTS_API_BASE
// 3) If running on localhost -> same origin "" (so POST /api/parse)
// 4) Otherwise -> "" (no backend)
function getApiBase(){
  const qs = new URLSearchParams(location.search);
  const q = (qs.get("api") || "").trim();
  const ls = (localStorage.getItem("IELTS_API_BASE") || "").trim();

  let base = (q || ls).replace(/\/$/, "");
  if (base) return base;

  // local dev: default to same-origin backend (avoid extra config)
  const host = (location.hostname || "").toLowerCase();
  const isLocal = (host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0");
  if (isLocal) return ""; // same origin

  return ""; // no backend
}

function isHttpsPage(){
  return (location.protocol || "").toLowerCase() === "https:";
}

function isHttpUrl(u){
  return /^http:\/\//i.test(u || "");
}

function explainMixedContent(apiBase){
  return (
    "当前前端是 https 页面，但你配置的是 http 后端（例如 http://localhost）。\n" +
    "浏览器会拦截这种请求（Mixed Content）。\n\n" +
    "✅ 解决办法（二选一）：\n" +
    "1) 把前端也放本地跑（http://localhost 打开前端），然后后端 http://localhost 就能用。\n" +
    "2) 把后端部署成 https 域名（云服务器/平台），再用 ?api=https://你的后端域名。\n\n" +
    `你当前 apiBase = ${apiBase}`
  );
}

// ----------------------------
// Load scripts
// ----------------------------
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
  const pdfjsUrl = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.js";
  const workerUrl = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.js";
  const lib = await loadScriptOnce(pdfjsUrl, "pdfjsLib");
  if (lib && lib.GlobalWorkerOptions){
    lib.GlobalWorkerOptions.workerSrc = workerUrl;
  }
  return lib;
}

async function ensureMammoth(){
  const url = "https://unpkg.com/mammoth/mammoth.browser.min.js";
  return await loadScriptOnce(url, "mammoth");
}

// ----------------------------
// Browser parsing
// ----------------------------
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

// ----------------------------
// External / Local backend parsing
// ----------------------------
async function parseByExternalBackend(file, apiBase){
  // mixed content guard
  if (isHttpsPage() && apiBase && isHttpUrl(apiBase)){
    throw new Error(explainMixedContent(apiBase));
  }

  const fd = new FormData();
  fd.append("file", file);

  async function tryPost(url){
    const res = await fetch(url, { method:"POST", body: fd, cache:"no-store" });
    if (!res.ok){
      const t = await res.text().catch(()=> "");
      throw new Error(`后端解析失败：HTTP ${res.status} ${t}`.trim());
    }
    const data = await res.json().catch(()=> null);
    if (!data) throw new Error("后端返回不是 JSON");
    if (data.ok !== true) throw new Error(data.error || "后端返回 ok=false");
    return data.text || "";
  }

  // When apiBase == "" -> same-origin:
  // try /api/parse then /parse
  const base = (apiBase || "").replace(/\/$/, "");
  const candidates = [];
  if (!base){
    candidates.push("/api/parse", "/parse");
  }else{
    candidates.push(base + "/api/parse", base + "/parse");
  }

  let lastErr = null;
  for (const u of candidates){
    try{
      return await tryPost(u);
    }catch(e){
      lastErr = e;
    }
  }
  throw lastErr || new Error("后端解析失败");
}

// ----------------------------
// File reading helpers
// ----------------------------
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

async function parseDocument(file){
  const apiBase = getApiBase();

  const name = (file.name || "").toLowerCase();
  const ext = name.split(".").pop();

  // 1) TXT
  if (ext === "txt" || file.type === "text/plain"){
    setStatus(`读取 TXT：${file.name} ...`);
    return normalizeText(await readTxtFile(file));
  }

  // 2) PDF
  if (ext === "pdf" || file.type === "application/pdf"){
    setStatus(`解析 PDF（浏览器）：${file.name} ...`);
    let t = "";
    try{ t = await parsePdfInBrowser(file); }catch(_){}
    t = normalizeText(t);
    if (t && t.length > 20) return t;

    // fallback backend
    if (apiBase !== ""){
      setStatus(`解析 PDF（后端）：${file.name} ...`);
      return normalizeText(await parseByExternalBackend(file, apiBase));
    }

    // local same-origin backend (only when host is localhost)
    const host = (location.hostname || "").toLowerCase();
    const isLocal = (host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0");
    if (isLocal){
      setStatus(`解析 PDF（本地后端）：${file.name} ...`);
      return normalizeText(await parseByExternalBackend(file, "")); // same-origin
    }

    throw new Error(
      "PDF 解析失败：这份 PDF 可能是扫描件/图片，没有文字层。\n\n" +
      "✅ 解决办法（三选一）：\n" +
      "1) 先把 PDF 转 TXT 再上传\n" +
      "2) 部署一个 https Node 后端，然后用 ?api=https://你的后端域名\n" +
      "3) 把前端也放本地跑（http://localhost 打开前端），再用本地 Node 后端"
    );
  }

  // 3) DOCX
  if (ext === "docx" || file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"){
    setStatus(`解析 DOCX（浏览器）：${file.name} ...`);
    let t = "";
    try{ t = await parseDocxInBrowser(file); }catch(_){}
    t = normalizeText(t);
    if (t && t.length > 5) return t;

    // fallback backend
    if (apiBase !== ""){
      setStatus(`解析 DOCX（后端）：${file.name} ...`);
      return normalizeText(await parseByExternalBackend(file, apiBase));
    }

    const host = (location.hostname || "").toLowerCase();
    const isLocal = (host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0");
    if (isLocal){
      setStatus(`解析 DOCX（本地后端）：${file.name} ...`);
      return normalizeText(await parseByExternalBackend(file, "")); // same-origin
    }

    throw new Error(
      "DOCX 解析失败。\n\n" +
      "✅ 解决办法（三选一）：\n" +
      "1) 换成 TXT 上传\n" +
      "2) 部署一个 https Node 后端，然后用 ?api=https://你的后端域名\n" +
      "3) 把前端也放本地跑（http://localhost 打开前端），再用本地 Node 后端"
    );
  }

  throw new Error("不支持的文件类型：" + (ext || file.type || "unknown"));
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
      elPaper.textContent = "（解析为空：这份 PDF 可能是扫描版/图片，没有文字层，需要 OCR 或后端解析）";
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

  if (target.classList && target.classList.contains("w")){
    const w = target.dataset.w || "";
    speak(w, target);
    return;
  }

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

document.addEventListener("touchstart", ()=>{}, {passive:true});
setStatus("就绪（选择文件→生成点读）");
```
