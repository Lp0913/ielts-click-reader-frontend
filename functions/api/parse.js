// functions/api/parse.js
export async function onRequest(context) {
  return new Response(
    JSON.stringify({
      ok: false,
      reason: "PDF/DOCX parsing is not supported in Cloudflare Workers",
      suggestion: [
        "Convert PDF/DOCX to TXT locally",
        "Or connect a Node backend later (Railway / Render / VPS)",
      ],
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    }
  );
}
