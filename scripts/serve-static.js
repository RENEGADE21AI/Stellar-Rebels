const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const root = path.resolve(process.argv[2] || "dist");
const port = Number(process.argv[3] || 4173);
const hitboxes = process.argv.includes("--hitboxes");
const mime = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mp3": "audio/mpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".woff2": "font/woff2"
};

http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const overlay = hitboxes && /^arcade\/[a-f0-9]{15}\/dev-hitboxes\.mjs$/.test(relative);
  const file = path.resolve(root, relative);
  if (file !== root && !file.startsWith(`${root}${path.sep}`)) {
    response.writeHead(403).end("Forbidden");
    return;
  }
  fs.readFile(overlay ? path.join(__dirname, "stellar-hitboxes.mjs") : file, (error, body) => {
    if (error) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
      return;
    }
    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Type": mime[path.extname(file).toLowerCase()] || "application/octet-stream"
    });
    if (hitboxes && relative === "index.html") {
      body = body.toString("utf8").replace(' data-pack="true"', ' data-pack="true" data-local-preview="true"');
    } else if (hitboxes && /^arcade\/[a-f0-9]{15}\/app\.mjs$/.test(relative)) {
      body = body.toString("utf8") + "\nif (new URLSearchParams(location.search).has('hitboxes')) { " +
        "import('./dev-hitboxes.mjs').then(({ drawHitboxes }) => { renderer.collisionOverlay = drawHitboxes; }); }\n";
    }
    response.end(body);
  });
}).listen(port, "127.0.0.1", () => {
  console.log(`Serving ${root} at http://127.0.0.1:${port}`);
});
