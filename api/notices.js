const fs = require("node:fs/promises");
const path = require("node:path");

const DATA_DIR = path.join(__dirname, "..", "data");
const NOTICES_FILE = path.join(DATA_DIR, "notices.json");
const VALID_TYPES = new Set(["meeting", "health", "weather", "agriculture", "general"]);

const defaultPosts = [
  {
    id: "seed-main",
    title: "Ngày mai vào lúc 07:00 họp dân tại Nhà Văn Hóa bản",
    body: "Kính đề nghị bà con sắp xếp thời gian tham dự đầy đủ.",
    time: "02/07/2026",
    type: "meeting",
    featured: true,
    createdAt: "2026-07-01T10:25:00.000Z"
  },
  {
    id: "seed-health",
    title: "Lịch tiêm phòng cho đàn gia súc đợt 2",
    body: "Thời gian: 05/07/2026",
    time: "05/07/2026",
    type: "health",
    featured: false,
    createdAt: "2026-07-01T09:10:00.000Z"
  },
  {
    id: "seed-weather",
    title: "Cảnh báo nguy cơ sạt lở đất",
    body: "Từ ngày 03/07 - 05/07, hạn chế đi qua taluy cao khi mưa lớn.",
    time: "03/07 - 05/07",
    type: "weather",
    featured: false,
    createdAt: "2026-07-01T08:15:00.000Z"
  },
  {
    id: "seed-agri",
    title: "Hướng dẫn phòng trừ sâu bệnh hại ngô",
    body: "Xem chi tiết tại trạm hoặc liên hệ cán bộ nông nghiệp.",
    time: "Trong tuần",
    type: "agriculture",
    featured: false,
    createdAt: "2026-07-01T07:40:00.000Z"
  }
];

module.exports = async function noticesHandler(req, res) {
  try {
    if (req.method === "GET") {
      const posts = await readPosts();
      sendJson(res, 200, posts);
      return;
    }

    if (req.method === "PUT") {
      const body = await readJsonBody(req);
      const posts = normalizePosts(body);
      await writePosts(posts);
      sendJson(res, 200, posts);
      return;
    }

    sendJson(res, 405, { error: "Method not allowed" });
  } catch (error) {
    console.error("[notices] Không xử lý được request:", error);
    sendJson(res, 500, { error: error.message || "Không lưu được thông báo." });
  }
};

async function readPosts() {
  await ensureDataFile();
  try {
    const text = await fs.readFile(NOTICES_FILE, "utf8");
    const parsed = JSON.parse(text);
    return normalizePosts(parsed);
  } catch (error) {
    console.error("[notices] Không đọc được file notices.json:", error);
    return defaultPosts;
  }
}

async function writePosts(posts) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(NOTICES_FILE, `${JSON.stringify(posts, null, 2)}\n`, "utf8");
}

async function ensureDataFile() {
  try {
    await fs.access(NOTICES_FILE);
  } catch {
    await writePosts(defaultPosts);
  }
}

function normalizePosts(value) {
  if (!Array.isArray(value)) {
    throw new Error("Dữ liệu thông báo không hợp lệ.");
  }

  return value.map((post, index) => {
    const title = String(post.title || "").trim();
    const body = String(post.body || "").trim();
    if (!title || !body) {
      throw new Error("Thông báo cần có tiêu đề và nội dung.");
    }

    return {
      id: String(post.id || `post-${Date.now()}-${index}`),
      title,
      body,
      time: String(post.time || "").trim(),
      type: VALID_TYPES.has(post.type) ? post.type : "general",
      featured: Boolean(post.featured),
      audioEnabled: Boolean(post.audioEnabled),
      audioRepeatCount: normalizeAudioRepeat(post.audioRepeatCount),
      audioPlayAt: normalizeDateString(post.audioPlayAt),
      createdAt: normalizeDateString(post.createdAt) || new Date().toISOString(),
      updatedAt: normalizeDateString(post.updatedAt)
    };
  });
}

function normalizeAudioRepeat(value) {
  const count = Number(value || 1);
  if (!Number.isFinite(count)) return 1;
  return Math.min(Math.max(Math.round(count), 1), 10);
}

function normalizeDateString(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString();
}

function readJsonBody(req) {
  if (req.body && typeof req.body === "object") {
    return Promise.resolve(req.body);
  }

  if (typeof req.body === "string") {
    try {
      return Promise.resolve(JSON.parse(req.body));
    } catch {
      return Promise.resolve(null);
    }
  }

  return new Promise((resolve, reject) => {
    let body = "";
    if (typeof req.setEncoding === "function") {
      req.setEncoding("utf8");
    }
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        req.destroy(new Error("Request body quá lớn."));
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : null);
      } catch {
        reject(new Error("JSON không hợp lệ."));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-cache"
  });
  res.end(JSON.stringify(payload));
}
