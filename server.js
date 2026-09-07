const http = require("http");
const fs = require("fs");
const path = require("path");

const root = __dirname;
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json"
};

const server = http.createServer((req, res) => {
  const requested = decodeURIComponent((req.url || "/").split("?")[0]);
  const file = requested === "/" ? "index.html" : requested.replace(/^\/+/, "");
  const filePath = path.join(root, file);
  if (!filePath.startsWith(root) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    return res.end("Not found");
  }
  res.writeHead(200, {
    "Content-Type": mime[path.extname(filePath)] || "application/octet-stream",
    "Cache-Control": "no-store"
  });
  fs.createReadStream(filePath).pipe(res);
});

const port = Number(process.env.PORT || 5000);
server.listen(port, "0.0.0.0", () => {
  console.log(`Genesis preview running on port ${port}`);
});