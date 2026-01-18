export async function onRequestPost(context) {
  try {
    const request = context.request;
    const formData = await request.formData();

    const file = formData.get("file");
    if (!file) {
      return new Response(
        JSON.stringify({ error: "No file uploaded" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // 先不真正解析 PDF
    // 只是把文件名 & 类型返回，验证链路
    const text = `文件名：${file.name}
文件类型：${file.type}

（Worker 后端已接通，下一步可加 PDF 解析）`;

    return new Response(
      JSON.stringify({ text }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );

  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
