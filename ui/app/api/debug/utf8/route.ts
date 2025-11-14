export async function GET() {
  const o = { text: "日本語テキスト：あいうえお漢字🙂" };
  return new Response(JSON.stringify(o), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

