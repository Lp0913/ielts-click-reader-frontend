// app.js (Cloudflare Pages static) - TXT/Paste only, PDF/DOCX show hint
// v4.3

(function () {
  "use strict";

  // ---------- DOM ----------
  const elText = document.getElementById("text");
  const elFile = document.getElementById("file");
  const elGen = document.getElementById("btnGen");
  const elStop = document.getElementById("btnStop");
  const elPaper = document.getElementById("paper");
  const elStatus = document.getElementById("status");

  const elAccent = document.getElementById("accent");
  const elRate = document.getElementById("rate");
  const elVoice = document.getElementById("voice");

  function setStatus(s) {
    if (elStatus) elStatus.textContent = `状态：${s}`;
  }

  function safeAlert(msg) {
    try { alert(msg); } catch (_) {}
  }

  // ---------- Guard ----------
  function must(el, name) {
    if (!el) throw new Error(`页面元素缺失：${name}（id 不匹配或 HTML 未更新）`);
  }
  try {
    must(elText, "#text");
    must(elFile, "#file");
    must(elGen, "#btnGen");
    must(elStop, "#btnStop");
    must(elPaper, "#paper");
    must(elStatus, "#status");
    must(elAccent, "#accent");
    must(elRate, "#rate");
    must(elVoice, "#voice");
  } catch (e) {
    console.error(e);
    safeAlert(String(e.message || e));
    return;
  }

  // ---------- TTS ----------
  const synth = window.speechSynthesis;
  const hasTTS = !!(synth && window.SpeechSynthesisUtterance);

  let voices = [];
  let currentUtter = null;

  function normalizeLang(lang) {
    return (lang || "").toLowerCase();
  }

  function wantAccent(lang, accent) {
    const l = normalizeLang(lang);
    if (accent === "auto") return true;
    if (accent === "en-GB") return l.startsWith("en-gb");
    if (accent === "en-US") return l.startsWith("en-us");
    if (accent === "en") return l.startsWith("en");
    if (accent === "zh") return l.startsWith("zh");
    return true;
  }

  function refreshVoices() {
    if (!hasTTS) {
      elVoice.innerHTML = `<option value="">(浏览器不支持 TTS)</option>`;
      return;
    }
    voices = synth.getVoices() || [];

    const accent = elAccent.value || "auto";
    const filtered = voices.filter(v => wantAccent(v.lang, accent));
    const list = (filtered.length ? filtered : voices);

    elVoice.innerHTML = "";
    list.forEach((v, idx) => {
      const opt = document.createElement("option");
      opt.value = String(idx);
      opt.textContent = `${v.name} (${v.lang})`;
      elVoice.appendChild(opt);
    });

    if (!elVoice.value && elVoice.options.length) elVoice.selectedIndex = 0;
  }

  if (hasTTS) {
    refreshVoices();
    // 部分浏览器 voices 异步加载
    window.speechSynthesis.onvoiceschanged = () => refreshVoices();
  } else {
    refreshVoices();
  }

  elAccent.addEventListener("change", () => refreshVoices());

  function stopSpeak() {
    try {
      if (hasTTS) synth.cancel();
    } catch (_) {}
    currentUtter = null;
  }

  function pickVoice() {
    if (!hasTTS) return null;
    const accent = elAccent.value || "auto";
    const all = voices.length ? voices : (synth.getVoices() || []);
    if (!all.length) return null;

    const filtered = all.filter(v => wantAccent(v.lang, accent));
    const list = (filtered.length ? filtered : all);

    const idx = parseInt(elVoice.value || "0", 10);
    if (!Number.isNaN(idx) && list[idx]) return list[idx];
    return list[0] || null;
  }

  function speak(text) {
    if (!hasTTS) {
      safeAlert("浏览器不支持 TTS（SpeechSynthesis）。建议用 Chrome/Edge。");
      return;
    }
    const t = (text || "").trim();
    if (!t) return;

    stopSpeak();
    const u = new SpeechSynthesisUtterance(t);

    const v = pickVoice();
    if (v) u.voice = v;

    const rate = Number(elRate.value || "1.0");
    u.rate = Number.isFinite(rate) ? rate : 1.0;

    currentUtter = u;
    synth.speak(u);
  }

  // ---------- Text -> Sentences/Words ----------
  function splitSentences(paragraph) {
    const p = (paragraph || "").trim();
    if (!p) return [];
    // 按中英文句末符号切句，尽量保留符号
    const parts = p
      .replace(/\r\n/g, "\n")
      .split(/(?<=[。！？.!?])\s+/g)
      .map(s => s.trim())
      .filter(Boolean);
    return parts.length ? parts : [p];
  }

  function tokenizeWords(sentence) {
    // 保留英文单词、数字、以及中文连续块；其它符号单独成 token
    const s = sentence || "";
    const tokens = [];
    const re = /[A-Za-z]+(?:'[A-Za-z]+)?|\d+(?:\.\d+)?|[\u4e00-\u9fff]+|[^\s]/g;
    let m;
    while ((m = re.exec(s))) tokens.push(m[0]);
    return tokens;
  }

  function escapeHtml(str) {
    return (str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function renderText(raw) {
    const text = (raw || "").trim();
    if (!text) {
      elPaper.innerHTML = `<div class="empty">(还没有生成内容)</div>`;
      setStatus("就绪");
      return;
    }

    const paras = text
      .replace(/\r\n/g, "\n")
      .split(/\n{2,}/g)
      .map(p => p.trim())
      .filter(Boolean);

    const frag = document.createDocumentFragment();

    paras.forEach((para) => {
      const pEl = document.createElement("div");
      pEl.className = "para";

      const sents = splitSentences(para);
      sents.forEach((sent, si) => {
        const sentEl = document.createElement("span");
        sentEl.className = "sent";
        sentEl.setAttribute("data-sent", sent);
        sentEl.title = "点击朗读整句";
        sentEl.addEventListener("click", (e) => {
          // 防止点到词也触发句子（词会 stopPropagation）
          speak(sent);
        });

        const tokens = tokenizeWords(sent);
        tokens.forEach((tok) => {
          const w = document.createElement("span");
          w.className = "word";
          w.textContent = tok;
          w.title = "点击朗读单词";
          w.addEventListener("click", (e) => {
            e.stopPropagation();
            speak(tok);
          });
          sentEl.appendChild(w);

          // 词间空格（中文块不加）
          if (/^[A-Za-z0-9]/.test(tok)) {
            sentEl.appendChild(document.createTextNode(" "));
          }
        });

        // 句子间隔
        if (si !== sents.length - 1) {
          sentEl.appendChild(document.createTextNode("  "));
        }

        pEl.appendChild(sentEl);
      });

      frag.appendChild(pEl);
    });

    elPaper.innerHTML = "";
    elPaper.appendChild(frag);
    setStatus("已生成（可点击朗读）");
  }

  // ---------- File handling ----------
  async function readTxtFile(file) {
    return await file.text();
  }

  function extOf(name) {
    const n = (name || "").toLowerCase();
    const i = n.lastIndexOf(".");
    return i >= 0 ? n.slice(i + 1) : "";
  }

  // ---------- Main action ----------
  async function onGenerate() {
    try {
      setStatus("处理中...");

      const pasted = (elText.value || "").trim();
      const file = elFile.files && elFile.files[0];

      if (pasted) {
        setStatus("解析粘贴文本...");
        renderText(pasted);
        return;
      }

      if (!file) {
        setStatus("就绪");
        safeAlert("请先粘贴文本，或选择一个 TXT/PDF/DOCX 文件。");
        return;
      }

      const ext = extOf(file.name);

      if (ext === "txt") {
        setStatus("读取 TXT...");
        const t = await readTxtFile(file);
        elText.value = t;
        renderText(t);
        return;
      }

      // Cloudflare Pages/Workers 环境下不做 PDF/DOCX 解析
      setStatus("需要后端（PDF/DOCX）");
      safeAlert(
        "PDF/DOCX 在 Cloudflare Pages/Workers 里无法直接解析。\n\n" +
          "你现在有 2 条路：\n" +
          "1）先把 PDF/DOCX 转成 TXT 再上传（最快）\n" +
          "2）上一个 Node 微服务（PDF/DOCX -> TXT），前端再调用它（最小可维护架构）"
      );
    } catch (e) {
      console.error(e);
      setStatus("出错");
      safeAlert("生成失败：\n" + (e && e.message ? e.message : String(e)));
    }
  }

  // ---------- Bind ----------
  elGen.addEventListener("click", () => onGenerate());
  elStop.addEventListener("click", () => {
    stopSpeak();
    setStatus("已停止朗读");
  });

  // 初始状态
  setStatus("就绪");

  // 让用户一眼知道：/api/parse 不是页面
  if (location.pathname === "/api/parse") {
    document.body.innerHTML =
      `<pre style="padding:16px;font-size:14px;line-height:1.6">` +
      escapeHtml(
        "这是前端站点。\n\n" +
          "Cloudflare Pages 的 /api/parse 如果你用 Pages Functions，会跑在 Workers 运行时，" +
          "无法直接做 PDF/DOCX 解析（缺 Node 原生能力）。\n\n" +
          "建议：\n" +
          "1) PDF/DOCX 先转 TXT 再用\n" +
          "2) 或部署一个 Node 微服务来解析 PDF/DOCX"
      ) +
      `</pre>`;
  }
})();
