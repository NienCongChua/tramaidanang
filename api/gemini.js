const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_MODEL = "gemini-3.5-flash";

loadEnvFile();

module.exports = async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      sendJson(res, 405, { error: "Method not allowed" });
      return;
    }

    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      sendJson(res, 500, { error: "Gemini API key is not configured." });
      return;
    }

    const requestBody = await readJsonBody(req);
    const contents = Array.isArray(requestBody.contents) ? requestBody.contents : [];
    const systemInstruction = requestBody.systemInstruction;

    if (!contents.length) {
      sendJson(res, 400, { error: "Missing chat contents." });
      return;
    }

    const model = (process.env.GEMINI_MODEL || DEFAULT_MODEL).trim();
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const payload = {
      contents,
      systemInstruction,
      generationConfig: {
        temperature: 0.65,
        maxOutputTokens: Number(process.env.GEMINI_MAX_OUTPUT_TOKENS || 2048)
      }
    };

    const geminiResponse = await fetch(geminiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const responseText = await geminiResponse.text();
    let result = {};
    try {
      result = JSON.parse(responseText);
    } catch {}

    if (!geminiResponse.ok) {
      console.error("[Gemini] API error:", geminiResponse.status, responseText);
      sendJson(res, geminiResponse.status, {
        error: result.error?.message || "Gemini request failed."
      });
      return;
    }

    const candidate = result.candidates?.[0];
    const text = (candidate?.content?.parts || [])
      .map((part) => part.text || "")
      .filter(Boolean)
      .join("\n")
      .trim();

    if (!text) {
      console.error("[Gemini] Empty response:", responseText);
      sendJson(res, 502, { error: "Gemini returned an empty response." });
      return;
    }

    sendJson(res, 200, {
      text,
      finishReason: candidate?.finishReason || ""
    });
  } catch (error) {
    console.error("[api/gemini] Unexpected error:", error);
    sendJson(res, 500, { error: "Đã xảy ra lỗi hệ thống." });
  }
};

function loadEnvFile() {
  const envPath = path.join(__dirname, "..", ".env");
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

function readJsonBody(req) {
  if (req.body && typeof req.body === "object") {
    return Promise.resolve(req.body);
  }

  if (typeof req.body === "string") {
    try {
      return Promise.resolve(JSON.parse(req.body));
    } catch {
      return Promise.resolve({});
    }
  }

  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 128 * 1024) {
        req.destroy();
        reject(new Error("Request body is too large."));
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, statusCode, data) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  res.end(JSON.stringify(data));
}
