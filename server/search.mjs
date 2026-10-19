function stripHtml(value) {
  return String(value || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export async function searchWeb(query) {
  const q = String(query || '').trim().slice(0, 240);
  if (!q) return [];
  const url = `https://www.bing.com/search?q=${encodeURIComponent(q)}&setlang=zh-CN&cc=CN`;
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.6',
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`搜索接口返回 ${response.status}`);
  const html = await response.text();
  const blocks = html.split(/<li class="b_algo"/i).slice(1);
  const results = [];
  for (const block of blocks) {
    const titleMatch = block.match(/<h2[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!titleMatch) continue;
    const snippetMatch = block.match(/<p[^>]*>([\s\S]*?)<\/p>/i)
      || block.match(/<div[^>]*class="[^"]*b_caption[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    const title = stripHtml(titleMatch[2]);
    const snippet = stripHtml(snippetMatch?.[1] || '');
    if (!title) continue;
    results.push({ title, url: titleMatch[1], snippet });
    if (results.length >= 5) break;
  }
  return results;
}
