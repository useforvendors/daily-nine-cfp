export async function onRequest(context) {
    const url = new URL(context.request.url).searchParams.get("url");
    if (!url) return new Response(JSON.stringify({ error: "Missing url" }), { status: 400 });

    try {
        // Fetch original article HTML
        const res = await fetch(url, {
            headers: { "User-Agent": "Mozilla/5.0" }
        });
        const html = await res.text();

        // Basic readability extraction using Mozilla Readability
        // (You must include readability in your function bundle)
        const { JSDOM } = require("jsdom");
        const Readability = require("@mozilla/readability").Readability;

        const dom = new JSDOM(html, { url });
        const reader = new Readability(dom.window.document);
        const article = reader.parse();

        return new Response(JSON.stringify({
            title: article.title,
            content: article.content
        }), {
            headers: { "Content-Type": "application/json" }
        });

    } catch (err) {
        return new Response(JSON.stringify({ error: err.toString() }), { status: 500 });
    }
}
