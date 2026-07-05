const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const tls = require("node:tls");

const EDGE_TTS_HOST = "speech.platform.bing.com";
const EDGE_TTS_ENDPOINT =
  "/consumer/speech/synthesize/readaloud/edge/v1";
const EDGE_TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const DEFAULT_TTS_VOICE = "vi-VN-HoaiMyNeural";
const DEFAULT_TTS_RATE = "-2%";
const DEFAULT_TTS_PITCH = "+0Hz";
const DEFAULT_TTS_TIMEOUT_MS = 12000;
const MAX_TTS_TEXT_LENGTH = 1800;
const CHROMIUM_FULL_VERSION = "143.0.3650.75";
const CHROMIUM_MAJOR_VERSION = CHROMIUM_FULL_VERSION.split(".")[0];
const SEC_MS_GEC_VERSION = `1-${CHROMIUM_FULL_VERSION}`;
const WIN_EPOCH_SECONDS = 11644473600;

loadEnvFile();

module.exports = async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      sendJson(res, 405, { error: "Method not allowed" });
      return;
    }

    const requestBody = await readJsonBody(req);
    const text = String(requestBody.text || "").trim();
    if (!text) {
      sendJson(res, 400, { error: "Missing text for TTS." });
      return;
    }

    const voice = String(process.env.EDGE_TTS_VOICE || DEFAULT_TTS_VOICE).trim();
    const rate = String(process.env.EDGE_TTS_RATE || DEFAULT_TTS_RATE).trim();
    const pitch = String(process.env.EDGE_TTS_PITCH || DEFAULT_TTS_PITCH).trim();
    const timeoutMs = Number(process.env.EDGE_TTS_TIMEOUT_MS || DEFAULT_TTS_TIMEOUT_MS);
    const ssml = buildSsml(text.slice(0, MAX_TTS_TEXT_LENGTH), { voice, rate, pitch });

    const audioBuffer = await synthesizeWithEdgeTts(ssml, timeoutMs);
    if (!audioBuffer.length) {
      sendJson(res, 502, { error: "Edge TTS returned empty audio." });
      return;
    }

    res.writeHead(200, {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "no-cache",
      "Content-Length": audioBuffer.length
    });
    res.end(audioBuffer);
  } catch (error) {
    const isAbort = error?.name === "AbortError";
    console.error("[api/tts] Unexpected error:", error);
    sendJson(res, isAbort ? 504 : 500, {
      error: isAbort ? "TTS request timed out." : "Đã xảy ra lỗi hệ thống khi tạo giọng nói."
    });
  }
};

function synthesizeWithEdgeTts(ssml, timeoutMs) {
  return new Promise((resolve, reject) => {
    const requestId = crypto.randomUUID().replace(/-/g, "");
    const connectionId = crypto.randomUUID().replace(/-/g, "");
    const chunks = [];
    let isSettled = false;
    let isHandshakeComplete = false;
    let pending = Buffer.alloc(0);
    let socket;

    const settle = (error, audioBuffer = null) => {
      if (isSettled) return;
      isSettled = true;
      clearTimeout(timeout);
      try {
        socket?.end();
      } catch {}

      if (error) {
        reject(error);
        return;
      }
      resolve(audioBuffer || Buffer.concat(chunks));
    };

    const timeout = setTimeout(() => {
      const error = new Error("TTS request timed out.");
      error.name = "AbortError";
      settle(error);
    }, timeoutMs);

    const requestPath =
      `${EDGE_TTS_ENDPOINT}?TrustedClientToken=${encodeURIComponent(EDGE_TRUSTED_CLIENT_TOKEN)}` +
      `&ConnectionId=${encodeURIComponent(connectionId)}` +
      `&Sec-MS-GEC=${encodeURIComponent(generateSecMsGec())}` +
      `&Sec-MS-GEC-Version=${encodeURIComponent(SEC_MS_GEC_VERSION)}`;
    const websocketKey = crypto.randomBytes(16).toString("base64");

    socket = tls.connect(443, EDGE_TTS_HOST, { servername: EDGE_TTS_HOST }, () => {
      socket.write([
        `GET ${requestPath} HTTP/1.1`,
        `Host: ${EDGE_TTS_HOST}`,
        "Connection: Upgrade",
        "Upgrade: websocket",
        "Sec-WebSocket-Version: 13",
        `Sec-WebSocket-Key: ${websocketKey}`,
        "Pragma: no-cache",
        "Cache-Control: no-cache",
        "Origin: chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
        "Accept-Encoding: gzip, deflate, br, zstd",
        "Accept-Language: en-US,en;q=0.9",
        `Cookie: muid=${crypto.randomBytes(16).toString("hex").toUpperCase()};`,
        `User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ` +
          `(KHTML, like Gecko) Chrome/${CHROMIUM_MAJOR_VERSION}.0.0.0 Safari/537.36 ` +
          `Edg/${CHROMIUM_MAJOR_VERSION}.0.0.0`,
        "",
        ""
      ].join("\r\n"));
    });

    const sendSynthesisRequest = () => {
      sendWsText(socket, buildWsMessage("speech.config", {
        context: {
          synthesis: {
            audio: {
              metadataoptions: {
                sentenceBoundaryEnabled: false,
                wordBoundaryEnabled: false
              },
              outputFormat: "audio-24khz-48kbitrate-mono-mp3"
            }
          }
        }
      }));

      sendWsText(socket, buildSsmlWsMessage(requestId, ssml));
    };

    socket.on("data", (data) => {
      try {
        pending = Buffer.concat([pending, data]);

        if (!isHandshakeComplete) {
          const headerEnd = pending.indexOf("\r\n\r\n");
          if (headerEnd === -1) return;

          const responseHeader = pending.subarray(0, headerEnd).toString("utf8");
          pending = pending.subarray(headerEnd + 4);
          if (!responseHeader.startsWith("HTTP/1.1 101")) {
            settle(new Error(`Edge TTS websocket handshake failed: ${responseHeader.split("\r\n")[0]}`));
            return;
          }

          isHandshakeComplete = true;
          sendSynthesisRequest();
        }

        pending = readWsFrames(pending, {
          text: (text) => {
            if (text.includes("Path:turn.end")) {
              settle(null, Buffer.concat(chunks));
            }
          },
          binary: (buffer) => {
            const audioChunk = extractAudioChunk(buffer);
            if (audioChunk.length) {
              chunks.push(audioChunk);
            }
          },
          ping: (buffer) => sendWsFrame(socket, 0xA, buffer),
          close: () => {
            if (chunks.length) {
              settle(null, Buffer.concat(chunks));
            } else {
              settle(new Error("Edge TTS websocket closed before audio was returned."));
            }
          }
        });
      } catch (error) {
        settle(error);
      }
    });

    socket.on("error", (error) => {
      settle(error);
    });

    socket.on("end", () => {
      if (!isSettled && chunks.length) {
        settle(null, Buffer.concat(chunks));
      } else if (!isSettled) {
        settle(new Error("Edge TTS websocket ended before audio was returned."));
      }
    });
  });
}

function sendWsText(socket, text) {
  sendWsFrame(socket, 0x1, Buffer.from(text, "utf8"));
}

function sendWsFrame(socket, opcode, payload) {
  const data = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  const length = data.length;
  let headerLength = 2;
  if (length >= 126 && length <= 65535) headerLength += 2;
  if (length > 65535) headerLength += 8;

  const frame = Buffer.alloc(headerLength + 4 + length);
  frame[0] = 0x80 | opcode;
  if (length < 126) {
    frame[1] = 0x80 | length;
  } else if (length <= 65535) {
    frame[1] = 0x80 | 126;
    frame.writeUInt16BE(length, 2);
  } else {
    frame[1] = 0x80 | 127;
    frame.writeBigUInt64BE(BigInt(length), 2);
  }

  const maskOffset = headerLength;
  const mask = crypto.randomBytes(4);
  mask.copy(frame, maskOffset);
  for (let index = 0; index < length; index += 1) {
    frame[maskOffset + 4 + index] = data[index] ^ mask[index % 4];
  }

  socket.write(frame);
}

function readWsFrames(buffer, handlers) {
  let offset = 0;

  while (offset + 2 <= buffer.length) {
    const firstByte = buffer[offset];
    const secondByte = buffer[offset + 1];
    const opcode = firstByte & 0x0f;
    const isMasked = Boolean(secondByte & 0x80);
    let length = secondByte & 0x7f;
    let headerLength = 2;

    if (length === 126) {
      if (offset + 4 > buffer.length) break;
      length = buffer.readUInt16BE(offset + 2);
      headerLength += 2;
    } else if (length === 127) {
      if (offset + 10 > buffer.length) break;
      const bigLength = buffer.readBigUInt64BE(offset + 2);
      if (bigLength > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new Error("WebSocket frame is too large.");
      }
      length = Number(bigLength);
      headerLength += 8;
    }

    const maskLength = isMasked ? 4 : 0;
    const frameEnd = offset + headerLength + maskLength + length;
    if (frameEnd > buffer.length) break;

    let payload = buffer.subarray(offset + headerLength + maskLength, frameEnd);
    if (isMasked) {
      const mask = buffer.subarray(offset + headerLength, offset + headerLength + 4);
      payload = Buffer.from(payload);
      for (let index = 0; index < payload.length; index += 1) {
        payload[index] ^= mask[index % 4];
      }
    }

    if (opcode === 0x1) {
      handlers.text(payload.toString("utf8"));
    } else if (opcode === 0x2) {
      handlers.binary(payload);
    } else if (opcode === 0x8) {
      handlers.close();
    } else if (opcode === 0x9) {
      handlers.ping(payload);
    }

    offset = frameEnd;
  }

  return buffer.subarray(offset);
}

function buildWsMessage(pathName, body) {
  return [
    `X-Timestamp:${dateToEdgeString()}`,
    "Content-Type:application/json; charset=utf-8",
    `Path:${pathName}`,
    "",
    JSON.stringify(body)
  ].join("\r\n");
}

function buildSsmlWsMessage(requestId, ssml) {
  return [
    `X-RequestId:${requestId}`,
    "Content-Type:application/ssml+xml",
    `X-Timestamp:${dateToEdgeString()}Z`,
    "Path:ssml",
    "",
    ssml
  ].join("\r\n");
}

function dateToEdgeString() {
  return new Date().toUTCString().replace("GMT", "GMT+0000 (Coordinated Universal Time)");
}

function extractAudioChunk(buffer) {
  if (buffer.length >= 2) {
    const headerLength = buffer.readUInt16BE(0);
    if (headerLength <= buffer.length - 2) {
      const header = buffer.subarray(2, 2 + headerLength).toString("utf8");
      if (header.includes("Path:audio") && header.includes("Content-Type:audio/mpeg")) {
        return buffer.subarray(2 + headerLength);
      }
      if (header.includes("Path:audio")) return Buffer.alloc(0);
    }
  }

  const separator = Buffer.from("\r\n\r\n");
  let separatorIndex = buffer.indexOf(separator);
  if (separatorIndex === -1 && buffer.length > 2) {
    separatorIndex = buffer.subarray(2).indexOf(separator);
    if (separatorIndex !== -1) separatorIndex += 2;
  }
  if (separatorIndex === -1) return Buffer.alloc(0);

  const header = buffer.subarray(0, separatorIndex).toString("utf8");
  if (!header.includes("Path:audio")) return Buffer.alloc(0);
  return buffer.subarray(separatorIndex + separator.length);
}

function generateSecMsGec() {
  let ticks = Date.now() / 1000;
  ticks += WIN_EPOCH_SECONDS;
  ticks -= ticks % 300;
  ticks *= 10000000;
  return crypto
    .createHash("sha256")
    .update(`${ticks.toFixed(0)}${EDGE_TRUSTED_CLIENT_TOKEN}`, "ascii")
    .digest("hex")
    .toUpperCase();
}

function buildSsml(text, options) {
  return [
    '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="vi-VN">',
    `<voice name="${escapeXml(options.voice)}">`,
    `<prosody rate="${escapeXml(options.rate)}" pitch="${escapeXml(options.pitch)}">`,
    escapeXml(text),
    "</prosody>",
    "</voice>",
    "</speak>"
  ].join("");
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
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
