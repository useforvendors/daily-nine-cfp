export async function onRequest(context) {
  const requestUrl = new URL(context.request.url);
  const targetUrl = requestUrl.searchParams.get("url");

  if (!targetUrl) {
    return new Response(
      JSON.stringify({ error: "Missing url parameter" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    // Jina clean-reader API
    const jinaUrl = `https://r.jina.ai/${targetUrl}`;

    const res = await fetch(jinaUrl, {
      headers: { "User-Agent": "Mozilla/5.0" }
    });

    const md = await res.text();

    // Convert markdown to simple HTML
    const html = md
      .replace(/^# (.*$)/gim, "<h1>$1</h1>")
      .replace(/^## (.*$)/gim, "<h2>$1</h2>")
      .replace(/^### (.*$)/gim, "<h3>$1</h3>")
      .replace(/\*\*(.*?)\*\*/gim, "<b>$1</b>")
      .replace(/\*(.*?)\*/gim, "<i>$1</i>")
      .replace(/\[(.*?)\]\((.*?)\)/gim, '<a href="$2">$1</a>')
      .replace(/\n/g, "<br>");

    return new Response(
      JSON.stringify({
        title: targetUrl,
        content: html
      }),
      { headers: { "Content-Type": "application/json" } }
    );

  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.toString() }),
      { status: 500 }
    );
  }
}
