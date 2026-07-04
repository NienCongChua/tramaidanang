const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_TTS_MODEL = "gemini-3.1-flash-tts-preview";
const DEFAULT_TTS_VOICE = "Kore";
const WAV_SAMPLE_RATE = 24000;
const WAV_CHANNELS = 1;
const WAV_BIT_DEPTH = 16;

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
    const text = String(requestBody.text || "").trim();
    if (!text) {
      sendJson(res, 400, { error: "Missing text for TTS." });
      return;
    }

    const model = (process.env.GEMINI_TTS_MODEL || DEFAULT_TTS_MODEL).trim();
    const voice = (process.env.GEMINI_TTS_VOICE || DEFAULT_TTS_VOICE).trim();
    const prompt = buildTtsPrompt(text);

    const geminiResponse = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey
      },
      body: JSON.stringify({
        model,
        input: prompt,
        response_format: {
          type: "audio"
        },
        generation_config: {
          speech_config: [
            { voice }
          ]
        }
      })
    });

    const responseText = await geminiResponse.text();
    let result = {};
    try {
      result = JSON.parse(responseText);
    } catch {}

    if (!geminiResponse.ok) {
      console.error("[Gemini TTS] API error:", geminiResponse.status, responseText);
      sendJson(res, geminiResponse.status, {
        error: result.error?.message || "Gemini TTS request failed."
      });
      return;
    }

    const pcmBase64 = result.output_audio?.data;
    if (!pcmBase64) {
      console.error("[Gemini TTS] Empty audio response:", responseText);
      sendJson(res, 502, { error: "Gemini TTS returned empty audio." });
      return;
    }

    const pcmBuffer = Buffer.from(pcmBase64, "base64");
    const wavBuffer = pcmToWav(pcmBuffer);

    res.writeHead(200, {
      "Content-Type": "audio/wav",
      "Cache-Control": "no-cache",
      "Content-Length": wavBuffer.length
    });
    res.end(wavBuffer);
  } catch (error) {
    console.error("[api/tts] Unexpected error:", error);
    sendJson(res, 500, { error: "Đã xảy ra lỗi hệ thống khi tạo giọng nói." });
  }
};

function buildTtsPrompt(text) {
  return [
    "Read the following Vietnamese text naturally in a warm, clear, helpful voice.",
    "Speak at a moderate pace and recite the text faithfully.",
    "",
    text
  ].join("\n");
}

function pcmToWav(pcmBuffer) {
  const blockAlign = (WAV_CHANNELS * WAV_BIT_DEPTH) / 8;
  const byteRate = WAV_SAMPLE_RATE * blockAlign;
  const wavBuffer = Buffer.alloc(44 + pcmBuffer.length);

  wavBuffer.write("RIFF", 0);
  wavBuffer.writeUInt32LE(36 + pcmBuffer.length, 4);
  wavBuffer.write("WAVE", 8);
  wavBuffer.write("fmt ", 12);
  wavBuffer.writeUInt32LE(16, 16);
  wavBuffer.writeUInt16LE(1, 20);
  wavBuffer.writeUInt16LE(WAV_CHANNELS, 22);
  wavBuffer.writeUInt32LE(WAV_SAMPLE_RATE, 24);
  wavBuffer.writeUInt32LE(byteRate, 28);
  wavBuffer.writeUInt16LE(blockAlign, 32);
  wavBuffer.writeUInt16LE(WAV_BIT_DEPTH, 34);
  wavBuffer.write("data", 36);
  wavBuffer.writeUInt32LE(pcmBuffer.length, 40);
  pcmBuffer.copy(wavBuffer, 44);

  return wavBuffer;
}

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
