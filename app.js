const STORAGE_KEY = "tram_ai_commune_posts";
const GEO_CACHE_KEY = "tram_ai_geo_cache";
const SETTINGS_KEY = "tram_ai_system_settings";
const DEFAULT_COMMUNE = "X, tỉnh Z";
const DEFAULT_COORDS = {
  latitude: 19.3833,
  longitude: 104.1167,
  label: "Xã demo Kỳ Sơn, Nghệ An"
};
const LOW_ACCURACY_METERS = 3000;

const defaultSettings = {
  smsPhone: "0912345678",
  smsTemplate: "Tôi đang ở vị trí này và cần hỗ trợ khẩn cấp:",
  smsAttachLocation: true,
  geminiKey: ""
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
  suggestions: document.querySelector("#chatSuggestions")
};

let lastCoords = null;

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
  if ([0].includes(code)) return [isDay ? "☀️" : "🌙", "Trời quang"];
  if ([1, 2].includes(code)) return [isDay ? "⛅" : "☁️", "Có mây"];
  if ([3, 45, 48].includes(code)) return ["☁️", "Nhiều mây"];
  if ([51, 53, 55, 56, 57].includes(code)) return ["🌦️", "Mưa phùn"];
  if ([61, 63, 65, 80, 81, 82].includes(code)) return ["🌧️", "Mưa rào"];
  if ([71, 73, 75, 77, 85, 86].includes(code)) return ["🌨️", "Mưa tuyết"];
  if ([95, 96, 99].includes(code)) return ["⛈️", "Dông, mưa lớn"];
  return ["🌦️", "Thời tiết thay đổi"];
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
  elements.icon.textContent = icon;
  elements.condition.textContent = label;
  elements.temperature.textContent = `${Math.round(data.current.temperature)}°C`;
  elements.humidity.textContent = `${Math.round(data.current.humidity)}%`;
  elements.wind.textContent = `${Math.round(data.current.wind)} km/h`;
  elements.rain.textContent = `${Math.round(data.current.rain)}%`;
  elements.weatherUpdated.textContent = `Cập nhật thật: ${formatTime(new Date(data.current.time))}`;

  elements.forecast.innerHTML = data.daily
    .slice(0, 3)
    .map((day) => {
      const [dayIcon, dayLabel] = weatherCodeLabel(day.code, true);
      const date = new Date(`${day.date}T00:00:00`);
      return `
        <article class="forecast-day">
          <time>${date.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" })}</time>
          <span aria-hidden="true">${dayIcon}</span>
          <strong>${Math.round(day.max)}°C / ${Math.round(day.min)}°C</strong>
          <p>${dayLabel}</p>
        </article>
      `;
    })
    .join("");
}

function renderPosts() {
  const posts = loadPosts().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const featured = posts.find((post) => post.featured) || posts[0];
  const others = posts.filter((post) => post.id !== featured?.id).slice(0, 5);

  if (!featured) {
    elements.featured.innerHTML = `
      <div class="badge">Thông báo mới</div>
      <h3>Chưa có thông báo</h3>
      <p>UBND xã sẽ cập nhật khi có thông tin mới.</p>
      <footer>UBND xã ${DEFAULT_COMMUNE}</footer>
    `;
    elements.noticeList.innerHTML = `<div class="empty-state">Chưa có thông báo khác</div>`;
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

  elements.noticeList.innerHTML = others
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
    .join("");

  renderTicker(posts);
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
    latitude: latitude.toFixed(5),
    longitude: longitude.toFixed(5),
    current: "temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,wind_gusts_10m",
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,wind_speed_10m_max",
    timezone: "auto",
    forecast_days: "4",
    wind_speed_unit: "kmh",
    temperature_unit: "celsius",
    precipitation_unit: "mm"
  });

  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`);
  if (!response.ok) throw new Error("Không lấy được dữ liệu thời tiết");
  const json = await response.json();

  return {
    current: {
      time: json.current.time,
      temperature: json.current.temperature_2m,
      humidity: json.current.relative_humidity_2m,
      wind: json.current.wind_speed_10m,
      rain: json.daily.precipitation_probability_max?.[0] ?? 0,
      code: json.current.weather_code,
      isDay: json.current.is_day === 1
    },
    daily: json.daily.time.slice(1, 4).map((date, index) => ({
      date,
      max: json.daily.temperature_2m_max[index + 1],
      min: json.daily.temperature_2m_min[index + 1],
      rain: json.daily.precipitation_probability_max[index + 1],
      code: json.daily.weather_code[index + 1]
    }))
  };
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
      placeLabel = buildPlaceLabel(geoResult, latitude, longitude, accuracy);
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

    setWeatherLoading("Đang tải thời tiết thật...");
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
    locationText = locationText.replace(" · địa danh © OpenStreetMap", "");
    messageBody = `${template}\n📍 Vị trí: ${locationText}`;
  }
  
  const smsUri = `sms:${phone}?body=${encodeURIComponent(messageBody)}`;
  window.location.href = smsUri;
}

let aiChatHistory = [];

function openAiChatModal() {
  aiModal.root.hidden = false;
  document.body.classList.add("modal-open");
  aiModal.input.focus();
  scrollToBottom();
}

function closeAiChatModal() {
  aiModal.root.hidden = true;
  document.body.classList.remove("modal-open");
}

function scrollToBottom() {
  aiModal.messages.scrollTop = aiModal.messages.scrollHeight;
}

function appendChatBubble(text, sender) {
  const bubble = document.createElement("div");
  bubble.className = `chat-bubble ${sender}`;
  bubble.textContent = text;
  aiModal.messages.appendChild(bubble);
  scrollToBottom();
  return bubble;
}

async function callGemini(userInput, apiKey) {
  const model = "gemini-2.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  
  const posts = loadPosts();
  const activeNotices = posts
    .map((p) => `- [${typeName(p.type)}] ${p.title}: ${p.body} (${p.time || "không rõ thời gian"})`)
    .join("\n");
  
  const locationLabel = elements.location.textContent || "Không rõ";
  const weatherTemp = elements.temperature.textContent || "--°C";
  const weatherCond = elements.condition.textContent || "Đang cập nhật";
  const weatherHum = elements.humidity.textContent || "--%";
  const weatherWind = elements.wind.textContent || "-- km/h";
  const weatherRain = elements.rain.textContent || "--%";
  
  const systemInstruction = `Bạn là "Trợ lý Trạm AI Đa Năng", một trợ lý thông minh thân thiện, mộc mạc và nhiệt tình tại trạm hỗ trợ người dân vùng cao.
Nhiệm vụ của bạn là giúp đỡ người dân bản địa giải đáp thắc mắc về thời tiết, thông báo của xã, nông nghiệp, y tế, đời sống hoặc hướng dẫn các kỹ năng khẩn cấp (như sạt lở, lũ quét).
Hãy sử dụng ngôn từ dễ hiểu, ngắn gọn, ấm áp, gần gũi với bà con vùng cao.

Thông tin ngữ cảnh tại Trạm AI (dùng thông tin này để trả lời chính xác):
- Vị trí của trạm/người dân: ${locationLabel.replace(" · địa danh © OpenStreetMap", "")}
- Thời tiết hiện tại: Nhiệt độ: ${weatherTemp}, Trạng thái: ${weatherCond}, Độ ẩm: ${weatherHum}, Gió: ${weatherWind}, Khả năng mưa: ${weatherRain}
- Danh sách thông báo chính thức từ Ủy ban nhân dân (UBND) xã:
${activeNotices || "Hiện chưa có thông báo mới nào từ xã."}

Nguyên tắc trả lời:
1. Luôn ưu tiên thông tin chính thức từ xã nếu câu hỏi liên quan đến lịch họp, thông báo, y tế hay hoạt động tại bản/xã.
2. Trả lời cực kỳ ngắn gọn, dễ hiểu, đi thẳng vào ý chính (khoảng 2-4 câu). Tránh viết dài dòng vì người dân có thể dùng mạng di động yếu.
3. Nếu người dân hỏi về sạt lở, thiên tai hoặc tình huống khẩn cấp, hãy ngay lập tức hướng dẫn họ cách phòng tránh, di chuyển lên cao hoặc liên hệ cứu hộ.
4. Xưng hô thân mật là "Trợ lý" và gọi người dùng là "Bà con", "Anh chị", hoặc "Cô bác". Tránh dùng thuật ngữ kỹ thuật quá phức tạp.`;

  const slicedHistory = aiChatHistory.slice(-6);
  const contents = [...slicedHistory, { role: "user", parts: [{ text: userInput }] }];
  
  const payload = {
    contents: contents,
    systemInstruction: {
      parts: [{ text: systemInstruction }]
    },
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 800
    }
  };

  const response = await fetch(url, {
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
  const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error("Không nhận được câu trả lời từ AI.");
  }
  return text;
}

async function handleAiSubmit(event) {
  if (event) event.preventDefault();
  const userInput = aiModal.input.value.trim();
  if (!userInput) return;
  
  aiModal.input.value = "";
  appendChatBubble(userInput, "user");
  
  const loadingBubble = appendChatBubble("Trợ lý đang suy nghĩ...", "assistant loading");
  
  const settings = loadSettings();
  if (!settings.geminiKey) {
    loadingBubble.classList.remove("loading");
    loadingBubble.style.color = "var(--red)";
    loadingBubble.textContent = "⚠️ Cán bộ xã chưa cấu hình API Key cho Gemini. Vui lòng truy cập trang Admin (Tài khoản: admin / Mật khẩu: xa@2026) -> Cấu hình hệ thống để thiết lập.";
    return;
  }

  try {
    const aiResponse = await callGemini(userInput, settings.geminiKey);
    
    loadingBubble.remove();
    appendChatBubble(aiResponse, "assistant");
    
    aiChatHistory.push({ role: "user", parts: [{ text: userInput }] });
    aiChatHistory.push({ role: "model", parts: [{ text: aiResponse }] });
  } catch (error) {
    loadingBubble.classList.remove("loading");
    loadingBubble.style.color = "var(--red)";
    loadingBubble.textContent = `❌ Lỗi khi gửi câu hỏi: ${error.message}. Vui lòng kiểm tra lại cấu hình API Key trong trang Admin.`;
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
aiModal.form.addEventListener("submit", handleAiSubmit);
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
