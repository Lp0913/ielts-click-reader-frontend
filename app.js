// app.js - FINAL Cloudflare Pages version
// 前端：只负责上传文件，不做任何 PDF/DOCX 判断

const API_BASE = (() => {
  const qs = new URLSearchParams(location.search);
  if (qs.get("api")) return qs.get("api");
  return ""; // same-origin -> /api/parse
})();

const fileInput = document.getElementById("fileInput");
const genBtn = document.getElementById("generateBtn");
const outputEl = document.getElementById("output");

genBtn.addEventListener("click", async () => {
  const file = fileInput.files[0];
  if (!file) {
    alert("请选择文件");
    return;
  }

  outputEl.textContent = "解析中，请稍候…";

  const fd = new FormData();
  fd.append("file", file);

  try {
    const res = await fetch(`${API_BASE}/api/parse`, {
      method: "POST",
      body: fd,
    });

    const data = await res.json();

    if (!data.ok) {
      throw new Error(data.error || "解析失败");
    }

    outputEl.textContent = data.text || "(无文本内容)";
  } catch (err) {
    console.error(err);
    alert("解析失败：" + err.message);
    outputEl.textContent = "";
  }
});
