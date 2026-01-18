export async function onRequestPost(context) {
  try {
    const req = context.request;

    // 必须是 multipart/form-data
    const contentType = req.headers.get("content-type") || "";
    if (!contentType.includes("multipart/form-data")) {
      return json({
        ok: false,
        error: "Invalid content-type, expected multipart/form-data",
      }, 400);
    }

    const form = await req.formData();
    const file = form.get("file");

    if (!file || typeof file === "string") {
      return json({
        ok: false,
        error: "No file uploaded",
      }, 400);
    }

    const name = (file.name || "").toLowerCase();

    // ----------------------------
    // TXT：直接可解析
    // ----------------------------
    if (name.endsWith(".txt")) {
      const text = await file.text();
      return json({
        ok: true,
        text: normalize(text),
        source: "txt",
      });
    }

    // ----------------------------
    // PDF / DOCX：Worker 不支持原生解析
    // ----------------------------
    if (name.endsWith(".pdf") || name.endsWith(".docx")) {
      return json({
        ok: false,
        error:
          "PDF/DOCX parsing is not supported in Cloudflare Workers.\n" +
          "This file may be a scanned document or requires a Node backend.\n\n" +
          "Suggestion:\n" +
          "1) Convert PDF/DOCX to TXT locally\n" +
          "2) Or add a Node backend later (Render / Railway / VPS)\n" +
          "3) Or integrate OCR / external API",
      });
    }

    return json({
      ok: false,
      error: "Unsupported file type",
    }, 400);

  } catch (err) {
    return json({
      ok: false,
      error: err?.message || String(err),
    }, 500);
  }
}

// ----------------------------
// helpers
// ----------------------------
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
  });
}

function normalize(text) {
  return (text || "")
    .replace(/\u00a0/g, " ")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
