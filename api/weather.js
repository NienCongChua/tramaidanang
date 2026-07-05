const fs = require("node:fs");
const path = require("node:path");

const OPENWEATHER_BASE_URL = "https://api.openweathermap.org/data/2.5";
const DEFAULT_TIMEOUT_MS = 10000;

loadEnvFile();

module.exports = async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      sendJson(res, 405, { error: "Method not allowed" });
      return;
    }

    const apiKey = (process.env.OPENWEATHER_API_KEY || process.env.OPENWEATHERMAP_API_KEY || "").trim();
    if (!apiKey) {
      sendJson(res, 500, {
        error: "OpenWeather API key is not configured. Set OPENWEATHER_API_KEY in .env."
      });
      return;
    }

    const url = new URL(req.url, "http://localhost");
    const latitude = Number(url.searchParams.get("lat"));
    const longitude = Number(url.searchParams.get("lon"));
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      sendJson(res, 400, { error: "Missing or invalid lat/lon." });
      return;
    }

    const [current, forecast] = await Promise.all([
      fetchOpenWeather("weather", { lat: latitude, lon: longitude, appid: apiKey }),
      fetchOpenWeather("forecast", { lat: latitude, lon: longitude, appid: apiKey })
    ]);

    sendJson(res, 200, normalizeWeather(current, forecast));
  } catch (error) {
    console.error("[api/weather] Unexpected error:", error);
    sendJson(res, 500, { error: "Không lấy được dữ liệu thời tiết từ OpenWeather." });
  }
};

async function fetchOpenWeather(endpoint, params) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  const query = new URLSearchParams({
    ...params,
    units: "metric",
    lang: "vi"
  });

  try {
    const response = await fetch(`${OPENWEATHER_BASE_URL}/${endpoint}?${query.toString()}`, {
      signal: controller.signal
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(json.message || `OpenWeather ${endpoint} failed with HTTP ${response.status}`);
    }
    return json;
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeWeather(current, forecast) {
  const timezoneOffset = Number(current.timezone || forecast.city?.timezone || 0);
  const forecastItems = Array.isArray(forecast.list) ? forecast.list : [];
  const daily = summarizeDailyForecast(forecastItems, timezoneOffset);
  const firstForecast = forecastItems[0] || {};

  return {
    source: "OpenWeather",
    locationName: current.name || forecast.city?.name || "",
    current: {
      time: unixToIso(current.dt),
      temperature: current.main?.temp ?? 0,
      humidity: current.main?.humidity ?? 0,
      wind: msToKmh(current.wind?.speed ?? 0),
      rain: Math.round((firstForecast.pop ?? 0) * 100),
      code: current.weather?.[0]?.id ?? 800,
      icon: current.weather?.[0]?.icon || "01d",
      label: current.weather?.[0]?.description || "",
      isDay: isOpenWeatherDayIcon(current.weather?.[0]?.icon)
    },
    daily
  };
}

function summarizeDailyForecast(items, timezoneOffset) {
  const todayKey = localDateKey(Date.now() / 1000, timezoneOffset);
  const days = new Map();

  for (const item of items) {
    const key = localDateKey(item.dt, timezoneOffset);
    if (key === todayKey) continue;
    if (!days.has(key)) {
      days.set(key, {
        date: key,
        max: Number.NEGATIVE_INFINITY,
        min: Number.POSITIVE_INFINITY,
        rain: 0,
        codeCounts: new Map(),
        representative: null
      });
    }

    const day = days.get(key);
    day.max = Math.max(day.max, item.main?.temp_max ?? item.main?.temp ?? 0);
    day.min = Math.min(day.min, item.main?.temp_min ?? item.main?.temp ?? 0);
    day.rain = Math.max(day.rain, Math.round((item.pop ?? 0) * 100));

    const code = item.weather?.[0]?.id ?? 800;
    day.codeCounts.set(code, (day.codeCounts.get(code) || 0) + 1);
    if (isBetterRepresentativeForecast(item, day.representative, timezoneOffset)) {
      day.representative = item;
    }
  }

  return Array.from(days.values())
    .slice(0, 3)
    .map((day) => ({
      date: day.date,
      max: Number.isFinite(day.max) ? day.max : 0,
      min: Number.isFinite(day.min) ? day.min : 0,
      rain: day.rain,
      code: day.representative?.weather?.[0]?.id ?? mostFrequentWeatherCode(day.codeCounts),
      icon: day.representative?.weather?.[0]?.icon || "",
      label: day.representative?.weather?.[0]?.description || ""
    }));
}

function isBetterRepresentativeForecast(next, current, timezoneOffset) {
  if (!current) return true;
  const nextHour = localHour(next.dt, timezoneOffset);
  const currentHour = localHour(current.dt, timezoneOffset);
  const nextDistance = Math.abs(nextHour - 12);
  const currentDistance = Math.abs(currentHour - 12);
  if (nextDistance !== currentDistance) return nextDistance < currentDistance;
  return (next.pop ?? 0) > (current.pop ?? 0);
}

function mostFrequentWeatherCode(codeCounts) {
  let selectedCode = 800;
  let selectedCount = -1;
  for (const [code, count] of codeCounts) {
    if (count > selectedCount) {
      selectedCode = code;
      selectedCount = count;
    }
  }
  return selectedCode;
}

function localDateKey(unixSeconds, timezoneOffset) {
  return new Date((Number(unixSeconds) + timezoneOffset) * 1000).toISOString().slice(0, 10);
}

function localHour(unixSeconds, timezoneOffset) {
  return Number(new Date((Number(unixSeconds) + timezoneOffset) * 1000).toISOString().slice(11, 13));
}

function unixToIso(unixSeconds) {
  return new Date(Number(unixSeconds) * 1000).toISOString();
}

function msToKmh(value) {
  return Number(value) * 3.6;
}

function isOpenWeatherDayIcon(icon) {
  return !String(icon || "").endsWith("n");
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

function sendJson(res, statusCode, data) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  res.end(JSON.stringify(data));
}
