// functions/api/daily-articles.js
// Cloudflare Pages Function format

export async function onRequest(context) {
  try {
    const articles = await fetchArticles();
    
    return new Response(JSON.stringify(articles), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=3600'
      }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

async function fetchArticles() {
  const FEEDS = [
    'https://aeon.co/feed.rss',
    'https://www.theparisreview.org/blog/feed/',
    'https://nautil.us/feed/',
    'https://lithub.com/category/craftandcriticism/craft-and-advice/feed/',
    'https://www.lrb.co.uk/feeds/lrb'
  ];

  const allArticles = [];

  // Fetch all feeds
  for (const feedUrl of FEEDS) {
    try {
      const response = await fetch(feedUrl);
      const xml = await response.text();
      const articles = parseRSS(xml, feedUrl);
      allArticles.push(...articles);
    } catch (error) {
      console.error(`Error fetching ${feedUrl}:`, error.message);
    }
  }

  // Score and filter articles
  const scoredArticles = allArticles
    .map(article => ({
      ...article,
      score: scoreArticle(article)
    }))
    .filter(article => article.score > 0)
    .sort((a, b) => b.score - a.score);

  // Select top 9 with source diversity
  const selectedArticles = [];
  const usedSources = new Set();

  for (const article of scoredArticles) {
    if (selectedArticles.length >= 9) break;
    if (!usedSources.has(article.source) || selectedArticles.length >= 5) {
      selectedArticles.push({
        title: article.title,
        url: article.url
      });
      usedSources.add(article.source);
    }
  }

  // Fill remaining slots
  for (const article of scoredArticles) {
    if (selectedArticles.length >= 9) break;
    if (!selectedArticles.find(a => a.url === article.url)) {
      selectedArticles.push({
        title: article.title,
        url: article.url
      });
    }
  }

  return selectedArticles.slice(0, 9);
}

// Simple RSS parser (no external dependencies)
function parseRSS(xml, source) {
  const articles = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const itemXml = match[1];
    
    const title = extractTag(itemXml, 'title');
    const link = extractTag(itemXml, 'link');
    const pubDateStr = extractTag(itemXml, 'pubDate') || extractTag(itemXml, 'dc:date');
    const description = extractTag(itemXml, 'description') || extractTag(itemXml, 'content:encoded');

    if (title && link) {
      articles.push({
        title: cleanText(title),
        url: link.trim(),
        pubDate: new Date(pubDateStr || Date.now()),
        source: source,
        contentSnippet: cleanText(description || '')
      });
    }

    if (articles.length >= 30) break;
  }

  return articles;
}

function extractTag(xml, tagName) {
  const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\/${tagName}>`, 'i');
  const match = xml.match(regex);
  return match ? match[1] : '';
}

function cleanText(text) {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function scoreArticle(article) {
  let score = 0;
  const title = article.title.toLowerCase();
  const content = (article.contentSnippet || '').toLowerCase();
  const fullText = title + ' ' + content;
  
  // Filter patterns
  const excludePatterns = [
    'gift guide', 'gifts for', 'gift ideas',
    'weekly update', 'this week', 'week in',
    'roundup', 'round-up', 'recap',
    '10 things', '5 ways', 'best of', 'top 10', 'top 5',
    'listicle', 'must-read', 'must read',
    'trending', 'viral', 'hot take',
    'sponsored', 'partner content',
    'newsletter', 'briefing',
    'podcast', 'video', 'watch'
  ];
  
  if (excludePatterns.some(pattern => title.includes(pattern))) return -1000;
  if (title.includes('!')) return -1000;
  if (article.title.length < 30) return -500;
  
  // Recency
  const ageInHours = (Date.now() - article.pubDate.getTime()) / (1000 * 60 * 60);
  if (ageInHours < 24) score += 30;
  else if (ageInHours < 72) score += 25;
  else if (ageInHours < 168) score += 20;
  else if (ageInHours < 336) score += 15;
  else if (ageInHours < 720) score += 10;
  
  // Essay indicators
  const essayWords = ['essay', 'reflection', 'meditation', 'contemplation', 'exploration', 'examination', 'perspective', 'thoughts on', 'thinking about', 'consider', 'reconsidering'];
  const essayCount = essayWords.filter(word => fullText.includes(word)).length;
  score += Math.min(essayCount * 12, 35);
  
  const longformWords = ['deep dive', 'in-depth', 'long read', 'comprehensive', 'understanding', 'meaning of', 'nature of'];
  const longformCount = longformWords.filter(phrase => fullText.includes(phrase)).length;
  score += Math.min(longformCount * 10, 15);
  
  // Title quality
  if (article.title.length >= 40 && article.title.length <= 120) score += 15;
  
  const clickbaitWords = ['shocking', 'unbelievable', 'you won\'t believe', 'this one trick', 'breaking', 'just in', 'developing'];
  if (clickbaitWords.some(word => title.includes(word))) score -= 30;
  
  const qualityWords = ['how', 'why', 'what if', 'understanding', 'rethinking', 'reimagining', 'reconsidering', 'beyond', 'after'];
  const qualityWordCount = qualityWords.filter(word => title.includes(word)).length;
  score += Math.min(qualityWordCount * 5, 10);
  
  if (title.includes(':')) score += 5;
  
  // Depth indicators
  const depthWords = ['revolution', 'transformation', 'evolution', 'crisis', 'future of', 'history of', 'meaning of', 'nature of', 'question of', 'problem of'];
  const depthCount = depthWords.filter(word => fullText.includes(word)).length;
  score += Math.min(depthCount * 10, 20);
  
  return score;
}