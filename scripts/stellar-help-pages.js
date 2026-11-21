const { helpPages } = require('../arcade/help-content.mjs');

const escape = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[character]);

function renderSection({ heading, paragraphs }) {
  const content = paragraphs.map(({ text, email, link, linkText }) => {
    const address = email ? ` <a href="mailto:${escape(email)}">${escape(email)}</a>.` : '';
    const source = link ? ` <a href="${escape(link)}">${escape(linkText)}</a>.` : '';
    return `<p>${escape(text)}${address}${source}</p>`;
  }).join('\n');
  return `<section><h2>${escape(heading)}</h2>\n${content}</section>`;
}

function renderPage(slug, { title, updated, intro, sections, webSections = [], nativeSections = [] }) {
  const links = Object.entries(helpPages).map(([name, page]) =>
    `<a href="/${name}/"${name === slug ? ' aria-current="page"' : ''}>${escape(page.title)}</a>`).join('');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#080f19">
<link rel="canonical" href="https://stellar-rebels.web.app/${slug}/">
<title>${escape(title)} · Stellar Rebels</title>
<style>
:root{color-scheme:dark;background:#080f19;color:#f8f1e5;font-family:system-ui,sans-serif;line-height:1.65}
body{margin:0}header,main,footer{box-sizing:border-box;width:min(100%,46rem);margin:auto;padding:1rem clamp(1.15rem,5vw,2.5rem)}
header{border-bottom:1px solid #27394a}header a{font-weight:750;text-decoration:none}main{padding-top:2.75rem;padding-bottom:2.5rem}
h1,h2{line-height:1.2}h1{font-size:clamp(2rem,6vw,3.4rem);margin:0 0 .8rem}h2{font-size:1.23rem;margin:0 0 .65rem}section{margin-top:1.9rem}p{margin:.5rem 0;color:#d8e1e9}
a{color:#aee4f1;overflow-wrap:anywhere}a:focus-visible{outline:2px solid #ffa16e;outline-offset:3px}.updated{font-size:.88rem;color:#a8bdcd}
footer{border-top:1px solid #27394a}nav{display:flex;gap:0 1rem;flex-wrap:wrap}nav a{padding-block:.6rem}a[aria-current]{color:#f8f1e5}
</style>
</head>
<body>
<header><a href="/">Stellar Rebels</a></header>
<main><h1>${escape(title)}</h1>
${updated ? `<p class="updated">Updated ${escape(updated)}</p>` : ''}
<p>${escape(intro)}</p>
${[...sections.slice(0, 1), ...webSections, ...nativeSections, ...sections.slice(1)].map(renderSection).join('\n')}
</main>
<footer><nav aria-label="Help and legal">${links}</nav></footer>
</body>
</html>\n`;
}

module.exports = Object.entries(helpPages).map(([slug, page]) => [`/${slug}/index.html`, renderPage(slug, page)]);
