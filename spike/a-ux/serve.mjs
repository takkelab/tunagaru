// 試作A（体験）の静的ページを 127.0.0.1 で配信する。使い捨て（ADR 0025）
// データは gitignore 済みの spike/data/likes.json を読む
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const routes = {
  "/": { file: join(here, "index.html"), type: "text/html; charset=utf-8" },
  "/data/likes.json": {
    file: join(here, "..", "data", "likes.json"),
    type: "application/json; charset=utf-8",
  },
};
const port = Number(process.argv[2] ?? 8790);

createServer(async (req, res) => {
  const route = routes[new URL(req.url ?? "/", "http://127.0.0.1").pathname];
  if (!route) {
    res.writeHead(404).end("not found");
    return;
  }
  try {
    const body = await readFile(route.file);
    res.writeHead(200, { "content-type": route.type, "cache-control": "no-store" }).end(body);
  } catch {
    res.writeHead(404).end(`${route.file} がありません`);
  }
}).listen(port, "127.0.0.1", () => {
  process.stdout.write(`試作A: http://127.0.0.1:${port}/ （止めるときは Ctrl+C）\n`);
});
