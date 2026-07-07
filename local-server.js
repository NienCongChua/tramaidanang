const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const geminiHandler = require("./api/gemini");
const ttsHandler = require("./api/tts");
const weatherHandler = require("./api/weather");
const adminDivisionsHandler = require("./api/admin-divisions");
const noticesHandler = require("./api/notices");
const noticeAudioHandler = require("./api/notice-audio");

const ROOT_DIR = __dirname;
const PORT = Number(process.env.PORT || 3000);

loadEnvFile();

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".ico": "image/x-icon"
};

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/config.js") {
      sendConfigScript(res);
      return;
    }

    if (req.method === "POST" && req.url === "/api/gemini") {
      await geminiHandler(req, res);
      return;
    }

    if (req.method === "POST" && req.url === "/api/tts") {
      await ttsHandler(req, res);
      return;
    }

    if (req.method === "GET" && req.url.startsWith("/api/weather")) {
      await weatherHandler(req, res);
      return;
    }

    if (req.method === "GET" && req.url === "/api/admin-divisions") {
      await adminDivisionsHandler(req, res);
      return;
    }

    if ((req.method === "GET" || req.method === "PUT") && req.url === "/api/notices") {
      await noticesHandler(req, res);
      return;
    }

    if (req.method === "POST" && req.url === "/api/notice-audio/claim") {
      await noticeAudioHandler(req, res);
      return;
    }

    if (req.method !== "GET" && req.method !== "HEAD") {
      sendText(res, 405, "Method not allowed");
      return;
    }

    serveStatic(req, res);
  } catch (error) {
    console.error("[local-server] Unexpected error:", error);
    sendText(res, 500, "Đã xảy ra lỗi hệ thống.");
  }
});

server.listen(PORT, () => {
  console.log(`Trạm AI server đang chạy tại http://localhost:${PORT}`);
});

function serveStatic(req, res) {
  const url = new URL(req.url, "http://localhost");
  const pathname = decodeURIComponent(url.pathname);
  const normalizedPath = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.normalize(path.join(ROOT_DIR, normalizedPath));

  if (!filePath.startsWith(ROOT_DIR) || path.basename(filePath).startsWith(".")) {
    sendText(res, 403, "Forbidden");
    return;
  }

  fs.stat(filePath, (error, stats) => {
    if (error || !stats.isFile()) {
      sendText(res, 404, "Not found");
      return;
    }

    const contentType = MIME_TYPES[path.extname(filePath)] || "application/octet-stream";
    res.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": "no-cache"
    });

    if (req.method === "HEAD") {
      res.end();
      return;
    }

    fs.createReadStream(filePath).pipe(res);
  });
}

function sendText(res, statusCode, text) {
  res.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-cache"
  });
  res.end(text);
}

function sendConfigScript(res) {
  const config = {
    supabaseUrl: process.env.SUPABASE_URL || "",
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || ""
  };
  res.writeHead(200, {
    "Content-Type": "text/javascript; charset=utf-8",
    "Cache-Control": "no-cache"
  });
  res.end(`window.TRAM_AI_CONFIG = ${JSON.stringify(config, null, 2)};\n`);
}

function loadEnvFile() {
  const envPath = path.join(ROOT_DIR, ".env");
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();
    if (!key || process.env[key] !== undefined) continue;

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}
