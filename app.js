const STORAGE_KEY = "tram_ai_commune_posts";
const GEO_CACHE_KEY = "tram_ai_geo_cache";
const ADMIN_DIVISIONS_CACHE_KEY = "tram_ai_admin_divisions_cache_v2";
const SETTINGS_KEY = "tram_ai_system_settings";
const ADMIN_DIVISIONS_API_URL = "/api/admin-divisions";
const DEFAULT_COMMUNE = "X, tỉnh Z";
const DEFAULT_COORDS = {
  latitude: 19.3833,
  longitude: 104.1167,
  label: "Xã demo Kỳ Sơn, Nghệ An"
};
const LOW_ACCURACY_METERS = 3000;
const LIVE_WELCOME_MESSAGE =
  "Trợ lý Live đã sẵn sàng. Bà con cứ nói câu hỏi, Trợ lý sẽ nghe và trả lời bằng giọng nói.";
const AI_GOODBYE_MESSAGE = "Trợ lý xin chào bà con. Khi nào cần hỗ trợ, bà con cứ mở lại Trợ lý nhé.";
const SILENT_WAV_DATA_URI =
  "data:audio/wav;base64,UklGRlQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YTAAAAAA";
const TTS_REQUEST_TIMEOUT_MS = 6500;
const AI_IDLE_CLOSE_MS = 15000;
const AI_GOODBYE_CLOSE_MS = 3500;
const NOTICE_TOTAL_VISIBLE = 4;
const NOTICE_ROTATE_INTERVAL_MS = 5000;
const TICKER_PIXELS_PER_SECOND = 52;

const defaultSettings = {
  smsPhone: "0912345678",
  smsTemplate: "Tôi đang ở vị trí này và cần hỗ trợ khẩn cấp:",
  smsAttachLocation: true
};

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

const elements = {
  clock: document.querySelector("#clockText"),
  date: document.querySelector("#dateText"),
  homeRefresh: document.querySelector("#homeRefreshButton"),
  location: document.querySelector("#locationText"),
  weatherUpdated: document.querySelector("#weatherUpdated"),
  noticeUpdated: document.querySelector("#noticeUpdated"),
  temperature: document.querySelector("#temperatureText"),
  condition: document.querySelector("#conditionText"),
  humidity: document.querySelector("#humidityText"),
  wind: document.querySelector("#windText"),
  rain: document.querySelector("#rainText"),
  icon: document.querySelector("#currentIcon"),
  forecast: document.querySelector("#forecastList"),
  featured: document.querySelector("#featuredNotice"),
  noticeList: document.querySelector("#noticeList"),
  ticker: document.querySelector("#tickerText"),
  permissionBanner: document.querySelector("#permissionBanner"),
  permissionTitle: document.querySelector("#permissionTitle"),
  permissionMessage: document.querySelector("#permissionMessage"),
  locationButton: document.querySelector("#locationButton"),
  smsActionButton: document.querySelector("#smsActionButton"),
  aiActionButton: document.querySelector("#aiActionButton")
};

const modal = {
  root: document.querySelector("#noticeModal"),
  closeButton: document.querySelector("#modalCloseButton"),
  type: document.querySelector("#modalType"),
  title: document.querySelector("#modalTitle"),
  time: document.querySelector("#modalTime"),
  body: document.querySelector("#modalBody")
};

const aiModal = {
  root: document.querySelector("#aiChatModal"),
  closeButton: document.querySelector("#chatCloseButton"),
  messages: document.querySelector("#chatMessages"),
  form: document.querySelector("#chatForm"),
  input: document.querySelector("#chatInput"),
  voiceButton: document.querySelector("#chatVoiceButton"),
  liveButton: document.querySelector("#chatLiveButton"),
  sendButton: document.querySelector("#chatForm .chat-send-btn"),
  statusText: document.querySelector("#chatStatusText"),
  liveStatusText: document.querySelector("#liveStatusText"),
  suggestions: document.querySelector("#chatSuggestions")
};

let lastCoords = null;
let speechRecognition = null;
let isListening = false;
let voiceBaseText = "";
let voiceFinalText = "";
let voiceInterimText = "";
let isLiveMode = false;
let voiceMode = "dictation";
let liveFinalText = "";
let liveSubmitTimer = null;
let lastLiveSubmittedText = "";
let isAiResponding = false;
let shouldRestartLiveRecognition = false;
let liveSpeechUtterance = null;
let liveSpeechTimer = null;
let liveSpeechKeepAliveTimer = null;
let voicesReadyPromise = null;
let speechSynthesisPrimed = false;
let hasPendingSpeechPriming = false;
let ttsAudioPlayer = null;
let ttsAudioUrl = "";
let isAudioPlaybackPrimed = false;
let hasPendingAudioPriming = false;
let noticeRotationIndex = 0;
let noticeRotationTimer = null;
let tickerResizeTimer = null;
let aiIdleCloseTimer = null;
let aiGoodbyeCloseTimer = null;

function ensureSeedPosts() {
  if (!localStorage.getItem(STORAGE_KEY)) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultPosts));
  }
}

function loadPosts() {
  ensureSeedPosts();
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return defaultPosts;
  }
}

function formatTime(date = new Date()) {
  return date.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
}

function formatDate(date = new Date()) {
  return date.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function updateClock() {
  const now = new Date();
  elements.clock.textContent = formatTime(now);
  elements.date.textContent = formatDate(now);
}

function weatherCodeLabel(code, isDay = true) {
  const numericCode = Number(code);
  if (!Number.isFinite(numericCode)) return [isDay ? "🌤️" : "☁️", "Đang cập nhật"];
  code = numericCode;
  if (code >= 200 && code < 300) return ["⛈️", "Dông, mưa lớn"];
  if (code >= 300 && code < 400) return ["🌦️", "Mưa phùn"];
  if (code >= 500 && code < 600) return ["🌧️", "Mưa"];
  if (code >= 600 && code < 700) return ["🌨️", "Mưa tuyết"];
  if (code >= 700 && code < 800) return ["🌫️", "Sương mù"];
  if (code === 800) return [isDay ? "☀️" : "🌙", "Trời quang"];
  if ([801, 802].includes(code)) return [isDay ? "⛅" : "☁️", "Có mây"];
  if ([803, 804].includes(code)) return ["☁️", "Nhiều mây"];
  if ([0].includes(code)) return [isDay ? "☀️" : "🌙", "Trời quang"];
  if ([1, 2].includes(code)) return [isDay ? "⛅" : "☁️", "Có mây"];
  if ([3, 45, 48].includes(code)) return ["☁️", "Nhiều mây"];
  if ([51, 53, 55, 56, 57].includes(code)) return ["🌦️", "Mưa phùn"];
  if ([61, 63, 65, 80, 81, 82].includes(code)) return ["🌧️", "Mưa rào"];
  if ([71, 73, 75, 77, 85, 86].includes(code)) return ["🌨️", "Mưa tuyết"];
  if ([95, 96, 99].includes(code)) return ["⛈️", "Dông, mưa lớn"];
  return ["🌦️", "Thời tiết thay đổi"];
}

function openWeatherIconSymbol(icon, fallbackCode, isDay = true) {
  const iconId = String(icon || "").slice(0, 2);
  return {
    "01": isDay ? "☀️" : "🌙",
    "02": isDay ? "⛅" : "☁️",
    "03": "☁️",
    "04": "☁️",
    "09": "🌧️",
    "10": "🌦️",
    "11": "⛈️",
    "13": "🌨️",
    "50": "🌫️"
  }[iconId] || weatherCodeLabel(fallbackCode, isDay)[0];
}

function iconClass(type) {
  return {
    meeting: ["📣", ""],
    health: ["💉", "health"],
    weather: ["⛰️", "weather"],
    agriculture: ["🌿", "agriculture"],
    general: ["ℹ️", ""]
  }[type] || ["📣", ""];
}

function typeName(type) {
  return {
    meeting: "Họp dân",
    health: "Y tế",
    weather: "Cảnh báo",
    agriculture: "Nông nghiệp",
    general: "Thông tin chung"
  }[type] || "Thông tin chung";
}

function setWeatherLoading(message) {
  elements.weatherUpdated.textContent = message;
  elements.condition.textContent = "Đang lấy dữ liệu thời tiết";
  elements.temperature.textContent = "--°C";
  elements.humidity.textContent = "--%";
  elements.wind.textContent = "-- km/h";
  elements.rain.textContent = "--%";
  elements.forecast.innerHTML = Array.from({ length: 3 }, () => `
    <article class="forecast-day is-loading">
      <time>--/--</time>
      <span aria-hidden="true">⌁</span>
      <strong>--°C / --°C</strong>
      <p>Đang tải</p>
    </article>
  `).join("");
}

function setLocationBanner(title, message, isVisible = true) {
  elements.permissionTitle.textContent = title;
  elements.permissionMessage.textContent = message;
  elements.permissionBanner.hidden = !isVisible;
}

function setWeatherError(message) {
  elements.weatherUpdated.textContent = "Chưa có dữ liệu thời tiết";
  elements.condition.textContent = message;
  elements.icon.textContent = "!";
  elements.temperature.textContent = "--°C";
}

function formatAccuracy(meters) {
  if (!Number.isFinite(meters)) return "không rõ";
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.round(meters)} m`;
}

function geoCacheKey(latitude, longitude) {
  return `${latitude.toFixed(3)},${longitude.toFixed(3)}`;
}

function loadGeoCache() {
  try {
    return JSON.parse(sessionStorage.getItem(GEO_CACHE_KEY)) || {};
  } catch {
    return {};
  }
}

function saveGeoCache(cache) {
  sessionStorage.setItem(GEO_CACHE_KEY, JSON.stringify(cache));
}

function normalizeAdminName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/\b(tinh|thanh pho|tp|quan|huyen|thi xa|thi tran|phuong|xa)\b/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function loadAdminDivisionsCache() {
  try {
    const cached = JSON.parse(sessionStorage.getItem(ADMIN_DIVISIONS_CACHE_KEY));
    if (cached?.savedAt && Date.now() - cached.savedAt < 24 * 60 * 60 * 1000 && Array.isArray(cached.data)) {
      return cached.data;
    }
  } catch {}
  return null;
}

function saveAdminDivisionsCache(data) {
  try {
    sessionStorage.setItem(ADMIN_DIVISIONS_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), data }));
  } catch {}
}

async function fetchAdminDivisions() {
  const cached = loadAdminDivisionsCache();
  if (cached) return cached;

  const response = await fetch(ADMIN_DIVISIONS_API_URL);
  if (!response.ok) throw new Error("Không lấy được dữ liệu hành chính mới");
  const data = await response.json();
  if (!Array.isArray(data)) throw new Error("Dữ liệu hành chính mới không hợp lệ");
  saveAdminDivisionsCache(data);
  return data;
}

function findAdminNameMatch(items, value) {
  const normalized = normalizeAdminName(value);
  if (!normalized) return null;
  return items.find((item) => normalizeAdminName(item.name) === normalized) ||
    items.find((item) => {
      const itemName = normalizeAdminName(item.name);
      return itemName && (itemName.includes(normalized) || normalized.includes(itemName));
    }) ||
    null;
}

function flattenAdminWards(provinces) {
  return provinces.flatMap((province) =>
    (province.wards || []).map((ward) => ({
      ...ward,
      province
    }))
  );
}

function firstAddressPart(address, keys) {
  return keys.map((key) => address?.[key]).find(Boolean) || "";
}

function normalizeVietnamName(value, prefix) {
  if (!value) return "";
  const clean = String(value).trim();
  const lower = clean.toLocaleLowerCase("vi-VN");
  const knownPrefixes = ["xã", "phường", "thị trấn", "huyện", "quận", "thành phố", "tỉnh"];
  if (knownPrefixes.some((item) => lower.startsWith(item))) return clean;
  return `${prefix} ${clean}`;
}

function buildPlaceLabel(geoResult, latitude, longitude, accuracy, sourceLabel = "vị trí hiện tại") {
  const address = geoResult?.address || {};
  const commune = firstAddressPart(address, [
    "village",
    "town",
    "municipality",
    "suburb",
    "quarter",
    "neighbourhood",
    "hamlet",
    "city_district",
    "locality"
  ]);
  const district = firstAddressPart(address, ["county", "state_district", "city"]);
  const province = firstAddressPart(address, ["state", "province", "region", "city"]);
  const parts = [
    normalizeVietnamName(commune, "Xã"),
    normalizeVietnamName(district, "Huyện"),
    normalizeVietnamName(province, "Tỉnh")
  ].filter((value, index, list) => value && list.indexOf(value) === index);

  const placeText = parts.length ? parts.join(", ") : geoResult?.display_name || sourceLabel;
  return `${placeText} · sai số khoảng ${formatAccuracy(accuracy)} · ${latitude.toFixed(4)}, ${longitude.toFixed(4)} · địa danh © OpenStreetMap`;
}

async function buildMergedAdminPlaceLabel(geoResult, latitude, longitude, accuracy) {
  const address = geoResult?.address || {};
  const rawWard = firstAddressPart(address, [
    "village",
    "town",
    "municipality",
    "suburb",
    "quarter",
    "neighbourhood",
    "hamlet",
    "city_district",
    "locality"
  ]);
  const rawProvince = firstAddressPart(address, ["state", "province", "region", "city"]);
  const provinces = await fetchAdminDivisions();
  const wards = flattenAdminWards(provinces);
  const wardMatch = findAdminNameMatch(wards, rawWard);
  const provinceMatch = wardMatch?.province || findAdminNameMatch(provinces, rawProvince);

  if (wardMatch && provinceMatch) {
    return `${wardMatch.name}, ${provinceMatch.name} · sai số khoảng ${formatAccuracy(accuracy)} · ${latitude.toFixed(4)}, ${longitude.toFixed(4)} · hành chính mới © provinces.open-api.vn`;
  }

  if (provinceMatch) {
    return `${provinceMatch.name} · sai số khoảng ${formatAccuracy(accuracy)} · ${latitude.toFixed(4)}, ${longitude.toFixed(4)} · hành chính mới © provinces.open-api.vn`;
  }

  return buildPlaceLabel(geoResult, latitude, longitude, accuracy);
}

function stripLocationAttribution(value) {
  return String(value || "")
    .replace(" · địa danh © OpenStreetMap", "")
    .replace(" · hành chính mới © provinces.open-api.vn", "");
}

async function reverseGeocode(latitude, longitude) {
  const cacheKey = geoCacheKey(latitude, longitude);
  const cache = loadGeoCache();
  if (cache[cacheKey]) return cache[cacheKey];

  const params = new URLSearchParams({
    format: "jsonv2",
    lat: latitude.toFixed(6),
    lon: longitude.toFixed(6),
    addressdetails: "1",
    zoom: "13",
    layer: "address",
    "accept-language": "vi"
  });
  const response = await fetch(`https://nominatim.openstreetmap.org/reverse?${params.toString()}`);
  if (!response.ok) throw new Error("Không lấy được tên địa phương");
  const result = await response.json();
  cache[cacheKey] = result;
  saveGeoCache(cache);
  return result;
}

function renderWeather(data) {
  const [icon, label] = weatherCodeLabel(data.current.code, data.current.isDay);
  elements.icon.textContent = openWeatherIconSymbol(data.current.icon, data.current.code, data.current.isDay) || icon;
  elements.condition.textContent = sentenceCase(data.current.label || label);
  elements.temperature.textContent = `${Math.round(data.current.temperature)}°C`;
  elements.humidity.textContent = `${Math.round(data.current.humidity)}%`;
  elements.wind.textContent = `${Math.round(data.current.wind)} km/h`;
  elements.rain.textContent = `${Math.round(data.current.rain)}%`;
  elements.weatherUpdated.textContent = `OpenWeather: ${formatTime(new Date(data.current.time))}`;

  elements.forecast.innerHTML = data.daily
    .slice(0, 3)
    .map((day) => {
      const [dayIcon, dayLabel] = weatherCodeLabel(day.code, true);
      const date = new Date(`${day.date}T00:00:00`);
      return `
        <article class="forecast-day">
          <time>${date.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" })}</time>
          <span aria-hidden="true">${openWeatherIconSymbol(day.icon, day.code, true) || dayIcon}</span>
          <strong>${Math.round(day.max)}°C / ${Math.round(day.min)}°C</strong>
          <p>${sentenceCase(day.label || dayLabel)}</p>
        </article>
      `;
    })
    .join("");
}

function sentenceCase(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  return text.charAt(0).toLocaleUpperCase("vi-VN") + text.slice(1);
}

function rotatingWindow(items, count, startIndex) {
  if (items.length <= count) return items;
  return Array.from({ length: count }, (_, index) => items[(startIndex + index) % items.length]);
}

function stopNoticeRotation() {
  window.clearInterval(noticeRotationTimer);
  noticeRotationTimer = null;
}

function scheduleNoticeRotation(rotatingPosts) {
  stopNoticeRotation();
  if (rotatingPosts.length <= NOTICE_TOTAL_VISIBLE - 1) {
    noticeRotationIndex = 0;
    return;
  }

  noticeRotationTimer = window.setInterval(() => {
    noticeRotationIndex = (noticeRotationIndex + 1) % rotatingPosts.length;
    renderPosts({ skipTicker: true, isRotation: true });
  }, NOTICE_ROTATE_INTERVAL_MS);
}

function renderPosts(options = {}) {
  const { skipTicker = false, isRotation = false } = options;
  const posts = loadPosts().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const featured = posts.find((post) => post.featured) || posts[0];
  const rotatingPosts = posts.filter((post) => post.id !== featured?.id);
  const otherVisibleCount = NOTICE_TOTAL_VISIBLE - 1;
  if (noticeRotationIndex >= rotatingPosts.length) noticeRotationIndex = 0;
  const others = rotatingWindow(rotatingPosts, otherVisibleCount, noticeRotationIndex);

  if (!featured) {
    stopNoticeRotation();
    elements.featured.innerHTML = `
      <div class="badge">Thông báo mới</div>
      <h3>Chưa có thông báo</h3>
      <p>UBND xã sẽ cập nhật khi có thông tin mới.</p>
      <footer>UBND xã ${DEFAULT_COMMUNE}</footer>
    `;
    elements.noticeList.innerHTML = `<div class="empty-state">Chưa có thông báo khác</div>`;
    if (!skipTicker) renderTicker([]);
    return;
  }

  const updatedAt = new Date(featured.updatedAt || featured.createdAt);
  elements.noticeUpdated.textContent = `Cập nhật: ${formatTime(updatedAt)}`;
  elements.featured.innerHTML = `
    <div class="badge">Thông báo mới</div>
    <h3>${escapeHtml(featured.title)}</h3>
    <p>${escapeHtml(featured.body)}</p>
    <footer>UBND xã ${DEFAULT_COMMUNE}</footer>
  `;

  elements.noticeList.classList.toggle("is-rotating", isRotation);
  elements.noticeList.innerHTML = others.length
    ? others
      .map((post) => {
      const [icon, typeClass] = iconClass(post.type);
      return `
        <button class="notice-item" type="button" data-notice-id="${escapeHtml(post.id)}">
          <span class="notice-icon ${typeClass}" aria-hidden="true">${icon}</span>
          <div>
            <h4>${escapeHtml(post.title)}</h4>
            <p>${escapeHtml(post.body || post.time || "Đang cập nhật")}</p>
          </div>
          <span class="notice-arrow" aria-hidden="true">›</span>
        </button>
      `;
      })
      .join("")
    : `<div class="empty-state">Chưa có thông báo khác</div>`;

  scheduleNoticeRotation(rotatingPosts);
  if (!skipTicker) renderTicker(posts);
}

function renderTicker(posts) {
  const messages = posts.length
    ? posts.map((post) => `${post.title}${post.body ? `. ${post.body}` : ""}`)
    : ["Chưa có thông báo mới từ xã."];
  const tickerText = messages.map(escapeHtml).join('<span class="ticker-separator">•</span>');

  elements.ticker.innerHTML = `
    <span class="ticker-track">
      <span>${tickerText}</span>
      <span aria-hidden="true">${tickerText}</span>
    </span>
  `;
  syncTickerSpeed();
}

function syncTickerSpeed() {
  const track = elements.ticker.querySelector(".ticker-track");
  const firstText = track?.querySelector("span");
  if (!track || !firstText) return;

  window.requestAnimationFrame(() => {
    const distance = firstText.getBoundingClientRect().width + 34;
    const duration = Math.max(24, distance / TICKER_PIXELS_PER_SECOND);
    track.style.setProperty("--ticker-duration", `${duration.toFixed(2)}s`);
  });
}

function scheduleTickerSpeedSync() {
  window.clearTimeout(tickerResizeTimer);
  tickerResizeTimer = window.setTimeout(syncTickerSpeed, 120);
}

function openNoticeModal(post) {
  modal.type.textContent = typeName(post.type);
  modal.title.textContent = post.title;
  modal.time.textContent = post.time ? `Thời gian: ${post.time}` : "Thời gian: Đang cập nhật";
  modal.body.textContent = post.body || "Đang cập nhật nội dung.";
  modal.root.hidden = false;
  document.body.classList.add("modal-open");
  modal.closeButton.focus();
}

function closeNoticeModal() {
  modal.root.hidden = true;
  document.body.classList.remove("modal-open");
}

function handleNoticeClick(event) {
  const button = event.target.closest("[data-notice-id]");
  if (!button) return;

  const post = loadPosts().find((item) => item.id === button.dataset.noticeId);
  if (post) openNoticeModal(post);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Trình duyệt không hỗ trợ định vị"));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 12000,
      maximumAge: 300000
    });
  });
}

async function fetchWeather(latitude, longitude) {
  const params = new URLSearchParams({
    lat: latitude.toFixed(5),
    lon: longitude.toFixed(5)
  });

  const response = await fetch(`/api/weather?${params.toString()}`);
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json.error || "Không lấy được dữ liệu thời tiết từ OpenWeather");
  return json;
}

async function loadWeatherFromPosition() {
  setWeatherLoading("Đang xin quyền vị trí...");
  setLocationBanner(
    "Cần vị trí để lấy thời tiết thật",
    "Hãy cho phép trình duyệt truy cập vị trí hiện tại.",
    false
  );

  try {
    const position = await getCurrentPosition();
    const { latitude, longitude, accuracy } = position.coords;
    lastCoords = { latitude, longitude };
    let placeLabel = "";
    try {
      const geoResult = await reverseGeocode(latitude, longitude);
      placeLabel = await buildMergedAdminPlaceLabel(geoResult, latitude, longitude, accuracy);
    } catch {
      placeLabel = `${latitude.toFixed(4)}, ${longitude.toFixed(4)} · sai số khoảng ${formatAccuracy(accuracy)}`;
    }

    if (accuracy > LOW_ACCURACY_METERS) {
      elements.location.textContent = `Vị trí ước lượng · ${placeLabel}`;
      setLocationBanner(
        "Vị trí trình duyệt có thể chưa chính xác",
        "Máy tính thường định vị bằng IP/Wi-Fi nên có thể lệch xa.",
        true
      );
    } else {
      elements.location.textContent = `Vị trí thiết bị · ${placeLabel}`;
      setLocationBanner(
        "Đã lấy vị trí thiết bị",
        "Thời tiết đang được tải theo tọa độ trình duyệt cung cấp.",
        false
      );
    }

    setWeatherLoading("Đang tải thời tiết OpenWeather...");
    const weather = await fetchWeather(latitude, longitude);
    renderWeather(weather);
  } catch (error) {
    setLocationBanner(
      "Chưa lấy được vị trí",
      "Cho phép quyền vị trí để lấy thời tiết thật theo nơi đang truy cập.",
      true
    );
    elements.location.textContent = `${DEFAULT_COMMUNE} · chưa có quyền vị trí`;
    setWeatherError(error.message || "Không thể lấy vị trí hiện tại");
  }
}

async function refreshWeather() {
  if (!lastCoords) return;
  try {
    const weather = await fetchWeather(lastCoords.latitude, lastCoords.longitude);
    renderWeather(weather);
  } catch {
    elements.weatherUpdated.textContent = "Không thể cập nhật thời tiết mới";
  }
}

async function reloadHomeData() {
  elements.homeRefresh.classList.add("is-refreshing");
  updateClock();
  renderPosts();

  try {
    await loadWeatherFromPosition();
  } finally {
    window.setTimeout(() => {
      elements.homeRefresh.classList.remove("is-refreshing");
    }, 300);
  }
}

function loadSettings() {
  try {
    const saved = localStorage.getItem(SETTINGS_KEY);
    if (saved) return { ...defaultSettings, ...JSON.parse(saved) };
  } catch {}
  return defaultSettings;
}

function handleSMSButtonClick() {
  const settings = loadSettings();
  const phone = settings.smsPhone || "0912345678";
  const template = settings.smsTemplate || "Tôi đang ở vị trí này và cần hỗ trợ khẩn cấp:";
  
  let messageBody = template;
  if (settings.smsAttachLocation !== false) {
    let locationText = elements.location.textContent || "";
    locationText = stripLocationAttribution(locationText);
    messageBody = `${template}\n📍 Vị trí: ${locationText}`;
  }
  
  const smsUri = `sms:${phone}?body=${encodeURIComponent(messageBody)}`;
  window.location.href = smsUri;
}

let aiChatHistory = [];

const aiTools = {
  async endConversation(userInput) {
    setChatStatus("Trợ lý đang kết thúc cuộc trò chuyện", "speaking");
    setLiveStatus("Trợ lý đang chào bà con...");
    appendChatBubble(AI_GOODBYE_MESSAGE, "assistant", { format: "assistant" });
    aiChatHistory.push({ role: "user", parts: [{ text: userInput }] });
    aiChatHistory.push({ role: "model", parts: [{ text: AI_GOODBYE_MESSAGE }] });
    window.clearTimeout(aiGoodbyeCloseTimer);
    aiGoodbyeCloseTimer = window.setTimeout(closeAiChatModal, AI_GOODBYE_CLOSE_MS);
    await Promise.race([
      speakAssistantResponse(AI_GOODBYE_MESSAGE),
      new Promise((resolve) => window.setTimeout(resolve, AI_GOODBYE_CLOSE_MS - 300))
    ]);
    closeAiChatModal();
  }
};

function normalizeIntentText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function resolveAiTool(userInput) {
  const text = normalizeIntentText(userInput);
  if (!text) return null;

  const wantsEnd =
    /\b(ket thuc|tam biet|bye|goodbye|thoat|dong|dong lai|tat|dung lai|ngung|nghi)\b/.test(text) &&
    /\b(cuoc tro chuyen|tro chuyen|chat|popup|hop thoai|ai|tro ly|noi chuyen)\b/.test(text);
  const shortGoodbye = /^(tam biet|bye|goodbye|ket thuc|thoat|dong|tat|dong chat|dong ai|tat ai|ngung tro chuyen)$/.test(text);

  if (wantsEnd || shortGoodbye) {
    return aiTools.endConversation;
  }

  return null;
}

function openAiChatModal() {
  primeTtsPlayback();
  aiModal.root.hidden = false;
  document.body.classList.add("modal-open");
  aiModal.input.focus();
  scrollToBottom();
  resetAiIdleCloseTimer();
}

function closeAiChatModal() {
  window.clearTimeout(aiIdleCloseTimer);
  window.clearTimeout(aiGoodbyeCloseTimer);
  aiIdleCloseTimer = null;
  aiGoodbyeCloseTimer = null;
  stopLiveMode();
  stopVoiceInput();
  aiModal.root.hidden = true;
  document.body.classList.remove("modal-open");
}

function resetAiIdleCloseTimer() {
  window.clearTimeout(aiIdleCloseTimer);
  if (aiModal.root.hidden || isAiResponding) return;
  aiIdleCloseTimer = window.setTimeout(() => {
    if (!aiModal.root.hidden && !isAiResponding && !isListening) {
      closeAiChatModal();
    }
  }, AI_IDLE_CLOSE_MS);
}

function scrollToBottom() {
  aiModal.messages.scrollTop = aiModal.messages.scrollHeight;
}

function formatAssistantMessage(text) {
  const lines = String(text || "").split(/\r?\n/);
  const html = [];
  let listType = null;

  const closeList = () => {
    if (!listType) return;
    html.push(`</${listType}>`);
    listType = null;
  };

  const inlineFormat = (value) =>
    escapeHtml(value)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/__(.+?)__/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>");

  lines.forEach((line) => {
    const trimmed = line.trim();

    if (!trimmed) {
      closeList();
      return;
    }

    const unordered = trimmed.match(/^(?:[-*])\s+(.+)$/);
    const ordered = trimmed.match(/^\d+[.)]\s+(.+)$/);

    if (unordered || ordered) {
      const nextListType = unordered ? "ul" : "ol";
      if (listType !== nextListType) {
        closeList();
        html.push(`<${nextListType}>`);
        listType = nextListType;
      }
      html.push(`<li>${inlineFormat((unordered || ordered)[1])}</li>`);
      return;
    }

    closeList();
    html.push(`<p>${inlineFormat(trimmed)}</p>`);
  });

  closeList();
  return html.join("");
}

function appendChatBubble(text, sender, options = {}) {
  const bubble = document.createElement("div");
  bubble.className = `chat-bubble ${sender}`;
  if (options.format === "assistant") {
    bubble.innerHTML = formatAssistantMessage(text);
  } else {
    bubble.textContent = text;
  }
  aiModal.messages.appendChild(bubble);
  scrollToBottom();
  return bubble;
}

function setChatStatus(message, state = "ready") {
  if (aiModal.statusText) {
    aiModal.statusText.innerHTML = `<span class="status-dot ${state}"></span> ${escapeHtml(message)}`;
  }
}

function setLiveStatus(message) {
  if (aiModal.liveStatusText) {
    aiModal.liveStatusText.textContent = message;
  }
}

function normalizeSpeechTranscript(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function mergeSpeechTranscript(current, next) {
  const currentText = normalizeSpeechTranscript(current);
  const nextText = normalizeSpeechTranscript(next);
  if (!currentText) return nextText;
  if (!nextText) return currentText;

  const currentLower = currentText.toLocaleLowerCase("vi-VN");
  const nextLower = nextText.toLocaleLowerCase("vi-VN");
  if (currentLower === nextLower || currentLower.endsWith(` ${nextLower}`)) return currentText;
  if (nextLower.startsWith(`${currentLower} `)) return nextText;

  const currentWords = currentText.split(/\s+/);
  const nextWords = nextText.split(/\s+/);
  const maxOverlap = Math.min(currentWords.length, nextWords.length);

  for (let size = maxOverlap; size > 0; size -= 1) {
    const currentTail = currentWords.slice(-size).join(" ").toLocaleLowerCase("vi-VN");
    const nextHead = nextWords.slice(0, size).join(" ").toLocaleLowerCase("vi-VN");
    if (currentTail === nextHead) {
      return [...currentWords, ...nextWords.slice(size)].join(" ");
    }
  }

  return `${currentText} ${nextText}`;
}

function resetVoiceTranscript() {
  voiceFinalText = "";
  voiceInterimText = "";
}

function combineVoiceTranscript() {
  return mergeSpeechTranscript(voiceFinalText, voiceInterimText);
}

function captureVoiceResult(event) {
  let hasFinalResult = false;

  for (let index = event.resultIndex; index < event.results.length; index += 1) {
    const result = event.results[index];
    const transcript = normalizeSpeechTranscript(result[0]?.transcript);
    if (!transcript) continue;

    if (result.isFinal) {
      voiceFinalText = mergeSpeechTranscript(voiceFinalText, transcript);
      voiceInterimText = "";
      hasFinalResult = true;
    } else {
      voiceInterimText = transcript;
    }
  }

  return {
    text: combineVoiceTranscript(),
    finalText: voiceFinalText,
    isFinal: hasFinalResult && event.results[event.results.length - 1]?.isFinal
  };
}

async function ensureMicrophonePermission() {
  if (!navigator.mediaDevices?.getUserMedia) {
    setLiveStatus("Trình duyệt này chưa hỗ trợ quyền micro.");
    return false;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
    return true;
  } catch (error) {
    console.warn("[Trạm AI] Không thể xin quyền micro:", error);
    if (error?.name === "NotAllowedError" || error?.name === "SecurityError") {
      setLiveStatus("Trình duyệt chưa cho phép dùng micro. Bà con cấp quyền micro rồi thử lại.");
    } else if (error?.name === "NotFoundError") {
      setLiveStatus("Thiết bị chưa có micro khả dụng.");
    } else {
      setLiveStatus("Không thể bật micro trên thiết bị này.");
    }
    return false;
  }
}

function initVoiceInput() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!aiModal.voiceButton || !SpeechRecognition) {
    if (aiModal.voiceButton) {
      aiModal.voiceButton.disabled = true;
      aiModal.voiceButton.title = "Trình duyệt này chưa hỗ trợ nhập bằng giọng nói";
      aiModal.voiceButton.setAttribute("aria-label", "Trình duyệt này chưa hỗ trợ nhập bằng giọng nói");
    }
    if (aiModal.liveButton) {
      aiModal.liveButton.disabled = true;
      aiModal.liveButton.title = "Trình duyệt này chưa hỗ trợ trò chuyện Live";
    }
    setLiveStatus("Trình duyệt này chưa hỗ trợ nhận diện giọng nói Live.");
    return;
  }

  speechRecognition = new SpeechRecognition();
  speechRecognition.lang = "vi-VN";
  speechRecognition.continuous = true;
  speechRecognition.interimResults = true;
  speechRecognition.maxAlternatives = 3;

  speechRecognition.addEventListener("start", () => {
    isListening = true;
    aiModal.voiceButton.classList.add("is-listening");
    if (voiceMode === "live") {
      setChatStatus("Đang nghe bà con nói", "listening");
      setLiveStatus("Đang nghe... Bà con nói xong, trợ lý sẽ tự gửi câu hỏi.");
      aiModal.input.placeholder = "Live đang nghe...";
    } else {
      aiModal.voiceButton.title = "Đang nghe, bấm để dừng";
      aiModal.voiceButton.setAttribute("aria-label", "Đang nghe, bấm để dừng");
      aiModal.input.placeholder = "Đang nghe bà con nói...";
    }
  });

  speechRecognition.addEventListener("result", (event) => {
    const recognized = captureVoiceResult(event);
    const recognizedText = recognized.text;
    if (!recognizedText) return;

    if (voiceMode === "live") {
      aiModal.input.value = recognizedText;
      if (recognized.isFinal) {
        liveFinalText = recognized.finalText || recognizedText;
        scheduleLiveSubmit();
      }
      return;
    }

    aiModal.input.value = [voiceBaseText, recognizedText].filter(Boolean).join(" ").trim();
  });

  speechRecognition.addEventListener("error", (event) => {
    console.warn("[Trạm AI] Lỗi nhận diện giọng nói:", event.error);
    if (event.error === "aborted") return;

    if (event.error === "not-allowed" || event.error === "service-not-allowed") {
      setChatStatus("Micro bị chặn", "ready");
      if (voiceMode === "live") {
        setLiveStatus("Micro đang bị chặn. Bà con kiểm tra quyền micro của trình duyệt.");
      } else {
        aiModal.input.placeholder = "Micro đang bị chặn, bà con cấp quyền rồi thử lại...";
      }
      return;
    }

    if (event.error === "audio-capture") {
      setChatStatus("Không tìm thấy micro", "ready");
      if (voiceMode === "live") {
        setLiveStatus("Thiết bị không tìm thấy micro khả dụng.");
      } else {
        aiModal.input.placeholder = "Thiết bị không tìm thấy micro...";
      }
      return;
    }

    if (voiceMode === "live") {
      setLiveStatus("Chưa nghe rõ. Bà con thử nói gần micro hơn.");
    } else {
      aiModal.input.placeholder = "Không nghe rõ, bà con thử nói lại hoặc nhập bằng tay...";
    }
  });

  speechRecognition.addEventListener("end", () => {
    isListening = false;
    aiModal.voiceButton.classList.remove("is-listening");
    aiModal.voiceButton.title = "Nhập bằng giọng nói";
    aiModal.voiceButton.setAttribute("aria-label", "Nhập bằng giọng nói");
    aiModal.input.placeholder = "Nhập câu hỏi của bà con tại đây...";
    if (voiceMode === "live" && isLiveMode && shouldRestartLiveRecognition && !isAiResponding) {
      window.setTimeout(startLiveRecognition, 450);
      return;
    }
    if (voiceMode !== "live") {
      aiModal.input.focus();
    }
  });
}

async function startVoiceInput() {
  if (!speechRecognition || isListening) return;
  if (isAiResponding) return;
  const hasMicrophonePermission = await ensureMicrophonePermission();
  if (!hasMicrophonePermission) {
    setChatStatus("Micro chưa sẵn sàng", "ready");
    aiModal.input.placeholder = "Bà con cấp quyền micro rồi thử lại...";
    return;
  }
  voiceMode = "dictation";
  shouldRestartLiveRecognition = false;
  voiceBaseText = aiModal.input.value.trim();
  resetVoiceTranscript();
  try {
    speechRecognition.start();
  } catch (error) {
    console.warn("[Trạm AI] Không thể bắt đầu nhận diện giọng nói:", error);
    setChatStatus("Không thể mở micro", "ready");
    aiModal.input.placeholder = "Không thể mở micro, bà con thử lại...";
  }
}

function stopVoiceInput() {
  if (!speechRecognition || !isListening) return;
  speechRecognition.stop();
}

async function toggleVoiceInput() {
  if (isListening) {
    stopVoiceInput();
    return;
  }
  await startVoiceInput();
}

function startLiveRecognition() {
  if (!speechRecognition || !isLiveMode || isListening || isAiResponding) return;
  voiceMode = "live";
  shouldRestartLiveRecognition = true;
  liveFinalText = "";
  lastLiveSubmittedText = "";
  resetVoiceTranscript();
  aiModal.input.value = "";
  try {
    speechRecognition.start();
  } catch (error) {
    console.warn("[Trạm AI] Không thể bắt đầu Live:", error);
  }
}

function stopLiveMode() {
  isLiveMode = false;
  shouldRestartLiveRecognition = false;
  window.clearTimeout(liveSubmitTimer);
  window.clearTimeout(liveSpeechTimer);
  stopSpeechKeepAlive();
  liveSubmitTimer = null;
  liveSpeechTimer = null;
  liveFinalText = "";
  lastLiveSubmittedText = "";
  resetVoiceTranscript();
  liveSpeechUtterance = null;
  stopAudioPlayback();
  window.speechSynthesis?.cancel();
  if (aiModal.liveButton) {
    aiModal.liveButton.classList.remove("is-live");
    aiModal.liveButton.setAttribute("aria-pressed", "false");
    aiModal.liveButton.querySelector("span:last-child").textContent = "Bật trò chuyện Live";
  }
  setChatStatus("Sẵn sàng hỗ trợ bà con");
  setLiveStatus("Bấm Live để nói trực tiếp, trợ lý sẽ tự nghe và đọc câu trả lời.");
  stopVoiceInput();
}

async function startLiveMode() {
  if (!speechRecognition) {
    setLiveStatus("Trình duyệt này chưa hỗ trợ nhận diện giọng nói Live.");
    return;
  }

  stopVoiceInput();
  resetVoiceTranscript();
  primeSpeechSynthesis();
  isLiveMode = true;
  if (aiModal.liveButton) {
    aiModal.liveButton.classList.add("is-live");
    aiModal.liveButton.setAttribute("aria-pressed", "true");
    aiModal.liveButton.querySelector("span:last-child").textContent = "Tắt trò chuyện Live";
  }
  setChatStatus("Live đang khởi động", "speaking");
  setLiveStatus("Live đã bật. Trợ lý đang kiểm tra quyền micro...");
  const welcomePromise = speakLiveWelcome();
  const hasMicrophonePermission = await ensureMicrophonePermission();
  if (!isLiveMode) return;
  if (!hasMicrophonePermission) {
    stopLiveMode();
    setLiveStatus("Trình duyệt chưa cho phép dùng micro. Bà con kiểm tra quyền micro rồi bật Live lại.");
    return;
  }

  await welcomePromise;
  if (!isLiveMode) return;
  setChatStatus("Đang nghe bà con nói", "listening");
  setLiveStatus("Micro đã mở. Bà con cứ nói câu hỏi, Trợ lý sẽ tự gửi khi bà con nói xong.");
  startLiveRecognition();
}

function toggleLiveMode() {
  if (isLiveMode) {
    stopLiveMode();
    return;
  }
  startLiveMode();
}

function scheduleLiveSubmit() {
  const nextLiveText = normalizeSpeechTranscript(liveFinalText);
  if (!isLiveMode || !nextLiveText || nextLiveText === lastLiveSubmittedText) return;
  window.clearTimeout(liveSubmitTimer);
  liveSubmitTimer = window.setTimeout(() => {
    const submittedText = normalizeSpeechTranscript(liveFinalText);
    if (!isLiveMode || isAiResponding || !submittedText || submittedText === lastLiveSubmittedText) return;
    aiModal.input.value = submittedText;
    lastLiveSubmittedText = submittedText;
    liveFinalText = "";
    resetVoiceTranscript();
    handleAiSubmit(null, { fromLive: true });
  }, 900);
}

function speechText(value) {
  return String(value || "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/^\s*[-*]\s+/gm, "")
    .replace(/^\s*\d+[.)]\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getVietnameseVoice() {
  if (!canUseSpeechSynthesis()) return null;
  const voices = window.speechSynthesis.getVoices();
  const vietnameseVoices = voices.filter((voice) => voice.lang?.toLowerCase().startsWith("vi"));
  return (
    vietnameseVoices.find((voice) => voice.lang?.toLowerCase() === "vi-vn" && voice.localService) ||
    vietnameseVoices.find((voice) => voice.lang?.toLowerCase() === "vi-vn") ||
    vietnameseVoices.find((voice) => /vietnam|hoai|nam|linh|mai/i.test(voice.name)) ||
    vietnameseVoices[0] ||
    null
  );
}

function getDefaultSpeechVoice() {
  if (!canUseSpeechSynthesis()) return null;
  const voices = window.speechSynthesis.getVoices();
  return (
    voices.find((voice) => voice.default) ||
    voices.find((voice) => voice.localService) ||
    voices[0] ||
    null
  );
}

function resolveSpeechVoice() {
  return getVietnameseVoice() || getDefaultSpeechVoice();
}

function applySpeechVoice(utterance) {
  const preferredVoice = resolveSpeechVoice();
  if (preferredVoice) {
    utterance.voice = preferredVoice;
    utterance.lang = preferredVoice.lang || "vi-VN";
    return;
  }

  utterance.lang = "vi-VN";
}

function ensureVoicesReady() {
  if (!canUseSpeechSynthesis()) return Promise.resolve();
  if (window.speechSynthesis.getVoices().length) return Promise.resolve();
  if (voicesReadyPromise) return voicesReadyPromise;

  voicesReadyPromise = new Promise((resolve) => {
    const done = () => {
      window.speechSynthesis.removeEventListener("voiceschanged", done);
      resolve();
    };
    window.speechSynthesis.addEventListener("voiceschanged", done, { once: true });
    window.setTimeout(done, 900);
  });

  return voicesReadyPromise;
}

function canUseSpeechSynthesis() {
  return "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
}

function primeSpeechSynthesisFromGesture() {
  primeTtsPlayback();
}

function ensureTtsAudioPlayer() {
  if (ttsAudioPlayer) return ttsAudioPlayer;
  ttsAudioPlayer = new Audio();
  ttsAudioPlayer.preload = "auto";
  ttsAudioPlayer.playsInline = true;
  ttsAudioPlayer.setAttribute("playsinline", "");
  return ttsAudioPlayer;
}

function clearTtsAudioSource() {
  if (!ttsAudioPlayer) return;
  ttsAudioPlayer.removeAttribute("src");
  ttsAudioPlayer.load();
  if (ttsAudioUrl) {
    URL.revokeObjectURL(ttsAudioUrl);
    ttsAudioUrl = "";
  }
}

function stopAudioPlayback() {
  if (!ttsAudioPlayer) return;
  ttsAudioPlayer.pause();
  ttsAudioPlayer.currentTime = 0;
  clearTtsAudioSource();
}

function primeAudioPlaybackFromGesture() {
  if (isAudioPlaybackPrimed || hasPendingAudioPriming) return;
  const player = ensureTtsAudioPlayer();
  hasPendingAudioPriming = true;
  player.muted = true;
  player.src = SILENT_WAV_DATA_URI;
  const primingPromise = player.play();
  Promise.resolve(primingPromise)
    .catch(() => {})
    .finally(() => {
      player.pause();
      player.currentTime = 0;
      player.muted = false;
      clearTtsAudioSource();
      isAudioPlaybackPrimed = true;
      hasPendingAudioPriming = false;
    });
}

function primeTtsPlayback() {
  primeAudioPlaybackFromGesture();
  if (!canUseSpeechSynthesis()) return;
  if (speechSynthesisPrimed || hasPendingSpeechPriming) return;
  primeSpeechSynthesis();
}

function stopSpeechKeepAlive() {
  window.clearInterval(liveSpeechKeepAliveTimer);
  liveSpeechKeepAliveTimer = null;
}

function startSpeechKeepAlive() {
  stopSpeechKeepAlive();
  liveSpeechKeepAliveTimer = window.setInterval(() => {
    if (!canUseSpeechSynthesis()) return;
    window.speechSynthesis.resume();
  }, 8000);
}

function primeSpeechSynthesis() {
  if (speechSynthesisPrimed || !canUseSpeechSynthesis()) return;
  hasPendingSpeechPriming = true;
  ensureVoicesReady();

  try {
    const utterance = new SpeechSynthesisUtterance(".");
    applySpeechVoice(utterance);
    utterance.volume = 0;
    utterance.rate = 1;
    utterance.onstart = () => {
      speechSynthesisPrimed = true;
    };
    utterance.onend = () => {
      hasPendingSpeechPriming = false;
    };
    utterance.onerror = () => {
      hasPendingSpeechPriming = false;
    };
    window.speechSynthesis.cancel();
    window.speechSynthesis.resume();
    window.speechSynthesis.speak(utterance);
    window.setTimeout(() => {
      window.speechSynthesis.cancel();
      hasPendingSpeechPriming = false;
    }, 180);
  } catch (error) {
    hasPendingSpeechPriming = false;
    console.warn("[Trạm AI] Không thể khởi động phát giọng nói:", error);
  }
}

function splitSpeechChunks(text) {
  const sentences = text.match(/[^.!?。！？]+[.!?。！？]?/g) || [text];
  const chunks = [];
  let chunk = "";

  sentences.forEach((sentence) => {
    const next = [chunk, sentence.trim()].filter(Boolean).join(" ");
    if (next.length > 180 && chunk) {
      chunks.push(chunk);
      chunk = sentence.trim();
    } else {
      chunk = next;
    }
  });

  if (chunk) chunks.push(chunk);
  return chunks;
}

function estimateSpeechTimeout(text) {
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.min(Math.max(words * 520, 2800), 30000);
}

function handleSpeechPlaybackFailure(message = "Không thể phát giọng nói trên thiết bị này.") {
  console.warn("[Trạm AI] Phát giọng nói không bắt đầu hoặc bị chặn.");
  setChatStatus("Không thể phát loa", "ready");
  if (aiModal.liveStatusText && (isLiveMode || !aiModal.root.hidden)) {
    setLiveStatus(message);
  }
}

async function requestTtsAudioBlob(text) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), TTS_REQUEST_TIMEOUT_MS);
  let response;
  try {
    response = await fetch("/api/tts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ text }),
      signal: controller.signal
    });
  } finally {
    window.clearTimeout(timeout);
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const message = errorData.error || `HTTP error ${response.status}`;
    throw new Error(message);
  }

  return response.blob();
}

function playTtsAudioBlob(audioBlob, options = {}) {
  return new Promise((resolve, reject) => {
    const { requireLiveMode = true } = options;
    if (requireLiveMode && !isLiveMode) {
      resolve();
      return;
    }

    const player = ensureTtsAudioPlayer();
    stopAudioPlayback();

    let isSettled = false;
    const settle = (error = null) => {
      if (isSettled) return;
      isSettled = true;
      player.onended = null;
      player.onerror = null;
      if (error) {
        reject(error);
        return;
      }
      resolve();
    };

    ttsAudioUrl = URL.createObjectURL(audioBlob);
    player.src = ttsAudioUrl;
    player.muted = false;
    player.onended = () => {
      clearTtsAudioSource();
      settle();
    };
    player.onerror = () => {
      clearTtsAudioSource();
      settle(new Error("Audio element không phát được file TTS."));
    };

    const playPromise = player.play();
    Promise.resolve(playPromise).catch((error) => {
      clearTtsAudioSource();
      settle(error instanceof Error ? error : new Error("Trình duyệt chặn phát audio."));
    });
  });
}

function speakChunk(text, options = {}) {
  return new Promise((resolve) => {
    const { requireLiveMode = true } = options;
    if ((requireLiveMode && !isLiveMode) || !canUseSpeechSynthesis()) {
      resolve();
      return;
    }

    let isSettled = false;
    let hasStarted = false;
    const finish = () => {
      if (isSettled) return;
      isSettled = true;
      window.clearTimeout(liveSpeechTimer);
      liveSpeechTimer = null;
      liveSpeechUtterance = null;
      stopSpeechKeepAlive();
      resolve();
    };

    const utterance = new SpeechSynthesisUtterance(text);
    applySpeechVoice(utterance);
    utterance.rate = 0.96;
    utterance.pitch = 1;
    utterance.volume = 1;
    utterance.onstart = () => {
      hasStarted = true;
      speechSynthesisPrimed = true;
      hasPendingSpeechPriming = false;
    };
    utterance.onend = finish;
    utterance.onerror = (event) => {
      console.warn("[Trạm AI] Không đọc được giọng nói Live:", event.error);
      handleSpeechPlaybackFailure();
      finish();
    };
    liveSpeechUtterance = utterance;
    window.speechSynthesis.resume();
    window.speechSynthesis.speak(utterance);
    window.speechSynthesis.resume();
    startSpeechKeepAlive();
    liveSpeechTimer = window.setTimeout(() => {
      if (!hasStarted) {
        handleSpeechPlaybackFailure("Loa chưa phát được câu chào. Bà con kiểm tra âm lượng hoặc quyền tự động phát tiếng.");
      }
      finish();
    }, estimateSpeechTimeout(text));
  });
}

async function speakText(text, statusMessage, liveMessage, options = {}) {
  const { requireLiveMode = true } = options;
  if (requireLiveMode && !isLiveMode) return;

  const cleanText = speechText(text);
  if (!cleanText) return;

  setChatStatus(statusMessage, "speaking");
  if (liveMessage) setLiveStatus(liveMessage);

  try {
    const audioBlob = await requestTtsAudioBlob(cleanText);
    if (requireLiveMode && !isLiveMode) return;
    await playTtsAudioBlob(audioBlob, { requireLiveMode });
    return;
  } catch (error) {
    console.warn("[Trạm AI] Server TTS không phát được, chuyển sang Web Speech:", error);
  }

  if (!canUseSpeechSynthesis()) {
    handleSpeechPlaybackFailure(liveMessage || "Thiết bị chưa phát được giọng nói của Trợ lý.");
    return;
  }

  await ensureVoicesReady();
  if (requireLiveMode && !isLiveMode) return;

  window.speechSynthesis.cancel();
  window.clearTimeout(liveSpeechTimer);
  stopSpeechKeepAlive();
  liveSpeechTimer = null;
  liveSpeechUtterance = null;

  for (const chunk of splitSpeechChunks(cleanText)) {
    if (requireLiveMode && !isLiveMode) break;
    setChatStatus(statusMessage, "speaking");
    if (liveMessage) setLiveStatus(liveMessage);
    await speakChunk(chunk, { requireLiveMode });
  }
}

function speakAssistantResponse(text) {
  return speakText(text, "Trợ lý đang đọc câu trả lời", isLiveMode ? "Trợ lý đang đọc câu trả lời..." : "", {
    requireLiveMode: false
  });
}

function speakLiveWelcome() {
  return speakText(
    LIVE_WELCOME_MESSAGE,
    "Trợ lý đang chào bà con",
    "Trợ lý đang đọc câu chào...",
    { requireLiveMode: true }
  );
}

async function callGemini(userInput) {
  console.log("[Trạm AI] Đang gửi câu hỏi đến máy chủ Gemini...");

  const posts = loadPosts();
  const activeNotices = posts
    .map((p) => `- [${typeName(p.type)}] ${p.title}: ${p.body} (${p.time || "không rõ thời gian"})`)
    .join("\n");
  
  const locationLabel = stripLocationAttribution(elements.location.textContent || "Không rõ");
  const weatherTemp = elements.temperature.textContent || "--°C";
  const weatherCond = elements.condition.textContent || "Đang cập nhật";
  const weatherHum = elements.humidity.textContent || "--%";
  const weatherWind = elements.wind.textContent || "-- km/h";
  const weatherRain = elements.rain.textContent || "--%";
  
  const systemInstruction = `Bạn là "Trợ lý Trạm AI Đa Năng", một trợ lý thông minh thân thiện, mộc mạc và nhiệt tình tại trạm hỗ trợ người dân vùng cao.
Nhiệm vụ của bạn là giúp đỡ người dân bản địa giải đáp thắc mắc về thời tiết, thông báo của xã, nông nghiệp, y tế, đời sống hoặc hướng dẫn các kỹ năng khẩn cấp (như sạt lở, lũ quét).
Hãy sử dụng ngôn từ dễ hiểu, ngắn gọn, ấm áp, gần gũi với bà con vùng cao.

Thông tin ngữ cảnh tại Trạm AI (dùng thông tin này để trả lời chính xác):
- Vị trí của trạm/người dân: ${locationLabel}
- Thời tiết hiện tại: Nhiệt độ: ${weatherTemp}, Trạng thái: ${weatherCond}, Độ ẩm: ${weatherHum}, Gió: ${weatherWind}, Khả năng mưa: ${weatherRain}
- Danh sách thông báo chính thức từ Ủy ban nhân dân (UBND) xã:
${activeNotices || "Hiện chưa có thông báo mới nào từ xã."}

Nguyên tắc trả lời:
1. Luôn ưu tiên thông tin chính thức từ xã nếu câu hỏi liên quan đến lịch họp, thông báo, y tế hay hoạt động tại bản/xã.
2. Trả lời cực kỳ ngắn gọn, dễ hiểu, đi thẳng vào ý chính (khoảng 2-4 câu). Tránh viết dài dòng vì người dân có thể dùng mạng di động yếu.
3. Nếu người dân hỏi về sạt lở, thiên tai hoặc tình huống khẩn cấp, hãy ngay lập tức hướng dẫn họ cách phòng tránh, di chuyển lên cao hoặc liên hệ cứu hộ.
4. Xưng hô thân mật là "Trợ lý" và gọi người dùng là "Bà con", "Anh chị", hoặc "Cô bác". Tránh dùng thuật ngữ kỹ thuật quá phức tạp.
5. Nếu cần liệt kê nhiều ý, hãy kết thúc trọn vẹn từng ý, không dừng giữa câu.`;

  const slicedHistory = aiChatHistory.slice(-6);
  const contents = [...slicedHistory, { role: "user", parts: [{ text: userInput }] }];
  
  const payload = {
    contents: contents,
    systemInstruction: {
      parts: [{ text: systemInstruction }]
    },
    generationConfig: {
      temperature: 0.65
    }
  };

  const response = await fetch("/api/gemini", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const message = errorData.error?.message || `HTTP error ${response.status}`;
    throw new Error(message);
  }

  const result = await response.json();
  const text = result.text;
  if (!text) {
    throw new Error("Không nhận được câu trả lời từ AI.");
  }
  return text;
}

async function handleAiSubmit(event, options = {}) {
  if (event) event.preventDefault();
  primeTtsPlayback();
  if (isAiResponding) return;
  window.clearTimeout(aiIdleCloseTimer);
  isAiResponding = true;
  shouldRestartLiveRecognition = false;
  stopVoiceInput();
  const userInput = aiModal.input.value.trim();
  if (!userInput) {
    isAiResponding = false;
    if (isLiveMode) {
      shouldRestartLiveRecognition = true;
      startLiveRecognition();
    }
    return;
  }
  
  aiModal.input.value = "";
  appendChatBubble(userInput, "user");

  const aiTool = resolveAiTool(userInput);
  if (aiTool) {
    try {
      await aiTool(userInput);
    } catch (error) {
      console.error("[Trạm AI] Không chạy được AI tool:", error);
      closeAiChatModal();
    } finally {
      isAiResponding = false;
    }
    return;
  }

  if (options.fromLive) {
    setChatStatus("Đang gửi câu hỏi", "thinking");
    setLiveStatus("Đã nghe câu hỏi. Trợ lý đang chuẩn bị trả lời...");
  }
  
  const loadingBubble = appendChatBubble("Trợ lý đang suy nghĩ...", "assistant loading");
  
  try {
    const aiResponse = await callGemini(userInput);
    console.log("[Trạm AI] Nhận phản hồi thành công:", aiResponse);
    
    loadingBubble.remove();
    appendChatBubble(aiResponse, "assistant", { format: "assistant" });
    
    aiChatHistory.push({ role: "user", parts: [{ text: userInput }] });
    aiChatHistory.push({ role: "model", parts: [{ text: aiResponse }] });
    await speakAssistantResponse(aiResponse);
  } catch (error) {
    console.error("[Trạm AI] Lỗi phản hồi API:", error);
    loadingBubble.classList.remove("loading");
    loadingBubble.style.color = "var(--red)";
    loadingBubble.textContent = "Đã xảy ra 1 số lỗi không mong muốn, vui lòng báo cáo lại cho cán bộ xã!";
    setLiveStatus("Trợ lý chưa trả lời được. Bà con có thể nói lại hoặc nhập bằng tay.");
  } finally {
    isAiResponding = false;
    if (isLiveMode) {
      setChatStatus("Đang nghe bà con nói", "listening");
      setLiveStatus("Live đang nghe tiếp. Bà con có thể hỏi câu khác.");
      shouldRestartLiveRecognition = true;
      startLiveRecognition();
    } else {
      setChatStatus("Sẵn sàng hỗ trợ bà con");
    }
    resetAiIdleCloseTimer();
  }
}

function handleSuggestionClick(event) {
  const button = event.target.closest(".suggestion-chip");
  if (!button) return;
  
  const text = button.textContent.trim().replace(/^[^\s]+\s*/, "");
  aiModal.input.value = text;
  handleAiSubmit();
}

ensureSeedPosts();
updateClock();
renderPosts();
setWeatherLoading("Đang tải dữ liệu thật...");
loadWeatherFromPosition();

elements.homeRefresh.addEventListener("click", reloadHomeData);
elements.locationButton.addEventListener("click", loadWeatherFromPosition);
elements.noticeList.addEventListener("click", handleNoticeClick);
window.addEventListener("resize", scheduleTickerSpeedSync);
if (document.fonts?.ready) {
  document.fonts.ready.then(syncTickerSpeed).catch(() => {});
}
modal.closeButton.addEventListener("click", closeNoticeModal);
modal.root.addEventListener("click", (event) => {
  if (event.target === modal.root) closeNoticeModal();
});

// Quick action buttons
elements.smsActionButton.addEventListener("click", handleSMSButtonClick);
elements.aiActionButton.addEventListener("click", openAiChatModal);

// AI Modal controls
aiModal.closeButton.addEventListener("click", closeAiChatModal);
aiModal.root.addEventListener("click", (event) => {
  if (event.target === aiModal.root) closeAiChatModal();
});
aiModal.root.addEventListener("pointerdown", resetAiIdleCloseTimer);
aiModal.root.addEventListener("keydown", resetAiIdleCloseTimer);
aiModal.input.addEventListener("input", resetAiIdleCloseTimer);
aiModal.form.addEventListener("submit", handleAiSubmit);
if (aiModal.voiceButton) {
  initVoiceInput();
  aiModal.voiceButton.addEventListener("pointerdown", primeSpeechSynthesisFromGesture);
  aiModal.voiceButton.addEventListener("click", toggleVoiceInput);
}
if (aiModal.liveButton) {
  aiModal.liveButton.addEventListener("pointerdown", primeSpeechSynthesisFromGesture);
  aiModal.liveButton.addEventListener("click", toggleLiveMode);
}
if (aiModal.sendButton) {
  aiModal.sendButton.addEventListener("pointerdown", primeSpeechSynthesisFromGesture);
}
if (aiModal.suggestions) {
  aiModal.suggestions.addEventListener("pointerdown", primeSpeechSynthesisFromGesture);
}
aiModal.suggestions.addEventListener("click", handleSuggestionClick);

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (!modal.root.hidden) closeNoticeModal();
    if (!aiModal.root.hidden) closeAiChatModal();
  }
});
setInterval(updateClock, 1000);
setInterval(refreshWeather, 15 * 60 * 1000);

window.addEventListener("storage", (event) => {
  if (event.key === STORAGE_KEY) renderPosts();
});
