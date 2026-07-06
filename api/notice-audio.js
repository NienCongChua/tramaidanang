const fs = require("node:fs/promises");
const path = require("node:path");

const DATA_DIR = path.join(__dirname, "..", "data");
const NOTICES_FILE = path.join(DATA_DIR, "notices.json");
const AUDIO_STATE_FILE = path.join(DATA_DIR, "notice-audio-state.json");

let claimQueue = Promise.resolve();

module.exports = async function noticeAudioHandler(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  claimQueue = claimQueue
    .catch(() => {})
    .then(() => claimNextNoticeAudio());

  try {
    const result = await claimQueue;
    sendJson(res, 200, result);
  } catch (error) {
    console.error("[notice-audio] Không claim được lượt phát:", error);
    sendJson(res, 500, { error: "Không lấy được lượt phát thông báo." });
  }
};

async function claimNextNoticeAudio() {
  const posts = await readJsonFile(NOTICES_FILE, []);
  const state = await readJsonFile(AUDIO_STATE_FILE, {});
  const now = Date.now();
  let nextPlayAt = Infinity;

  const sortedPosts = Array.isArray(posts)
    ? [...posts].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    : [];

  for (const post of sortedPosts) {
    if (!post?.audioEnabled) continue;

    const repeatCount = getNoticeAudioRepeatCount(post);
    const entry = getNoticeAudioEntry(post, state);
    if (entry.played >= repeatCount) continue;

    const playAt = getNoticeAudioPlayAt(post);
    if (playAt > now) {
      nextPlayAt = Math.min(nextPlayAt, playAt);
      continue;
    }

    entry.played += 1;
    entry.lastClaimedAt = new Date(now).toISOString();
    await writeJsonFile(AUDIO_STATE_FILE, state);

    return {
      post,
      played: entry.played,
      repeatCount,
      nextPlayAt: null
    };
  }

  await writeJsonFile(AUDIO_STATE_FILE, state);

  return {
    post: null,
    played: 0,
    repeatCount: 0,
    nextPlayAt: Number.isFinite(nextPlayAt) ? new Date(nextPlayAt).toISOString() : null
  };
}

async function readJsonFile(filePath, fallback) {
  try {
    const text = await fs.readFile(filePath, "utf8");
    return JSON.parse(text);
  } catch {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await writeJsonFile(filePath, fallback);
    return fallback;
  }
}

async function writeJsonFile(filePath, value) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function noticeAudioSignature(post) {
  return [
    post.updatedAt || post.createdAt || "",
    post.title || "",
    post.body || "",
    post.audioEnabled ? "1" : "0",
    post.audioRepeatCount || 1,
    post.audioPlayAt || ""
  ].join("|");
}

function getNoticeAudioEntry(post, state) {
  const signature = noticeAudioSignature(post);
  const current = state[post.id];
  if (!current || current.signature !== signature) {
    state[post.id] = { signature, played: 0, lastClaimedAt: "" };
  }
  return state[post.id];
}

function getNoticeAudioRepeatCount(post) {
  const count = Number(post.audioRepeatCount || 1);
  if (!Number.isFinite(count)) return 1;
  return Math.min(Math.max(Math.round(count), 1), 10);
}

function getNoticeAudioPlayAt(post) {
  if (!post.audioPlayAt) return 0;
  const time = new Date(post.audioPlayAt).getTime();
  return Number.isFinite(time) ? time : 0;
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-cache"
  });
  res.end(JSON.stringify(payload));
}
