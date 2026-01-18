// app.js

function isTextFile(file) {
  return file.type === "text/plain";
}

function isPDFOrDocx(file) {
  return (
    file.type === "application/pdf" ||
    file.name.toLowerCase().endsWith(".docx")
  );
}

async function handleGenerate(file, textArea) {
  if (file) {
    if (isTextFile(file)) {
      const text = await file.text();
      renderResult(text);
      return;
    }

    if (isPDFOrDocx(file)) {
      alert(
        "PDF / DOCX 解析暂不支持在 Cloudflare Pages 上运行。\n\n" +
          "解决方案：\n" +
          "1️⃣ 本地转换成 TXT 再上传\n" +
          "2️⃣ 之后接入 Node 后端（Railway / VPS）"
      );
      return;
    }
  }

  // 粘贴文本兜底
  const pasted = textArea.value.trim();
  if (pasted) {
    renderResult(pasted);
  } else {
    alert("请粘贴文本或上传 TXT 文件");
  }
}

function renderResult(text) {
  const output = document.getElementById("output");
  output.innerText = text;
}
