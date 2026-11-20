import http from "node:http";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { readFile, stat } from "node:fs/promises";
import { resolve, sep, extname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import api from "./app.js";
import { openDatabase } from "./database.js";
import { publicFetch } from "./public-fetch.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".bcmap": "application/octet-stream",
  ".ttf": "font/ttf",
};
const bodyLimit = 7_050_000;
async function bodyBytes(request) {
  if (Number(request.headers["content-length"]) > bodyLimit)
    throw Object.assign(new Error("資料過大"), { status: 413 });
  const chunks = [];
  let length = 0;
  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    length += chunk.length;
    if (length > bodyLimit)
      throw Object.assign(new Error("資料過大"), { status: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, length);
}

export async function createAtlasServer({
  dbPath = resolve(root, "data/atlas.sqlite"),
  adminToken = "",
  allowedOrigins = "http://localhost:5174,http://127.0.0.1:5174",
  publicUrl = "http://localhost:8787",
  localDev = false,
  turnstileSecret = "",
  turnstileHostnames = "",
  staticDirectory = resolve(root, "dist"),
} = {}) {
  const canonical = new URL(publicUrl);
  if (
    !["http:", "https:"].includes(canonical.protocol) ||
    canonical.username ||
    canonical.password
  )
    throw new Error("PUBLIC_URL 必須是網站的 HTTP／HTTPS 網址");
  const database = await openDatabase(dbPath);
  const env = {
    DB: database,
    PUBLIC_FETCH: publicFetch,
    ADMIN_TOKEN: adminToken,
    ALLOWED_ORIGINS: allowedOrigins,
    LOCAL_DEV:
      localDev && process.env.NODE_ENV !== "production" ? "true" : "false",
    TURNSTILE_SECRET: turnstileSecret,
    TURNSTILE_HOSTNAMES: turnstileHostnames,
  };
  const server = http.createServer(async (request, response) => {
    try {
      // A configured origin prevents forged Host headers from enabling local mode.
      const incoming = new URL(request.url, "http://request.invalid"),
        url = new URL(canonical);
      url.pathname = incoming.pathname;
      url.search = incoming.search;
      if (url.pathname.startsWith("/api/") || url.pathname === "/api") {
        const headers = new Headers();
        for (const [name, value] of Object.entries(request.headers))
          if (value !== undefined)
            headers.set(name, Array.isArray(value) ? value.join(", ") : value);
        const init = { method: request.method, headers };
        if (!["GET", "HEAD"].includes(request.method))
          init.body = await bodyBytes(request);
        const result = await api.fetch(new Request(url, init), env);
        response.writeHead(result.status, Object.fromEntries(result.headers));
        if (request.method === "HEAD" || !result.body) response.end();
        else await pipeline(Readable.fromWeb(result.body), response);
        return;
      }
      if (!["GET", "HEAD"].includes(request.method)) {
        response.writeHead(405);
        response.end();
        return;
      }
      const pathname = decodeURIComponent(url.pathname),
        base = resolve(staticDirectory),
        filename = resolve(
          base,
          "." + (pathname === "/" ? "/index.html" : pathname),
        );
      if (
        !filename.startsWith(base + sep) ||
        pathname.split("/").some((part) => part.startsWith("."))
      ) {
        response.writeHead(404);
        response.end();
        return;
      }
      let info;
      try {
        info = await stat(filename);
      } catch {
        response.writeHead(404);
        response.end("找不到頁面");
        return;
      }
      if (!info.isFile()) {
        response.writeHead(404);
        response.end();
        return;
      }
      response.writeHead(200, {
        "Content-Type": types[extname(filename)] || "application/octet-stream",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "Cache-Control": filename.endsWith("index.html")
          ? "no-cache"
          : "public,max-age=3600",
      });
      response.end(
        request.method === "HEAD" ? undefined : await readFile(filename),
      );
    } catch (error) {
      if (response.headersSent) {
        response.destroy();
        return;
      }
      const status = error.status || (error instanceof URIError ? 400 : 503);
      response.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        Connection: "close",
      });
      response.end(
        JSON.stringify({
          error:
            status === 413
              ? "資料過大"
              : status === 400
                ? "網址格式錯誤"
                : "服務暫時無法處理，請稍後重試",
        }),
      );
      request.resume();
    }
  });
  server.requestTimeout = 60000;
  server.headersTimeout = 15000;
  server.on("close", () => database.close());
  return server;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const port = Number(process.env.PORT || 8787),
    host = process.env.HOST || "127.0.0.1";
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("PORT 必須為有效連接埠");
  if (!process.env.ADMIN_TOKEN) throw new Error("請在 .env 設定 ADMIN_TOKEN");
  if (
    process.env.NODE_ENV === "production" &&
    !process.env.PUBLIC_URL?.startsWith("https://")
  )
    throw new Error("正式環境需設定 HTTPS PUBLIC_URL");
  const server = await createAtlasServer({
    dbPath: resolve(process.env.DB_PATH || resolve(root, "data/atlas.sqlite")),
    adminToken: process.env.ADMIN_TOKEN,
    allowedOrigins:
      process.env.ALLOWED_ORIGINS ||
      "http://localhost:5174,http://127.0.0.1:5174",
    publicUrl: process.env.PUBLIC_URL || `http://localhost:${port}`,
    localDev: process.env.LOCAL_DEV === "true",
    turnstileSecret: process.env.TURNSTILE_SECRET,
    turnstileHostnames: process.env.TURNSTILE_HOSTNAMES,
  });
  server.listen(port, host, () =>
    console.log(`GeoPORT Node.js server: http://${host}:${port}`),
  );
  for (const signal of ["SIGINT", "SIGTERM"])
    process.once(signal, () => server.close(() => process.exit(0)));
}
