const ADMIN_DIVISIONS_API_URL = "https://provinces.open-api.vn/api/v2/?depth=2";
const DEFAULT_TIMEOUT_MS = 10000;

module.exports = async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      sendJson(res, 405, { error: "Method not allowed" });
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
    let response;
    try {
      response = await fetch(ADMIN_DIVISIONS_API_URL, { signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }

    const data = await response.json().catch(() => null);
    if (!response.ok || !Array.isArray(data)) {
      sendJson(res, 502, { error: "Không lấy được dữ liệu hành chính mới." });
      return;
    }

    sendJson(res, 200, data);
  } catch (error) {
    console.error("[api/admin-divisions] Unexpected error:", error);
    sendJson(res, 500, { error: "Không lấy được dữ liệu hành chính mới." });
  }
};

function sendJson(res, statusCode, data) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  res.end(JSON.stringify(data));
}
