/*
 * FAU Weather — a small, dependency-free weather app powered by Open-Meteo.
 * Open-Meteo is free for non-commercial use and needs no API key.
 *   Forecast API:  https://open-meteo.com/en/docs
 *   Geocoding API: https://open-meteo.com/en/docs/geocoding-api
 */
(() => {
  "use strict";

  const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
  const GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search";
  const STORAGE_KEY = "fau-weather:v1";
  const USER_NAME = "Moniki";
  const THEMES = ["system", "light", "white", "dark"];

  // FAU Boca Raton campus (777 Glades Rd)
  const DEFAULT_LOCATION = {
    name: "Boca Raton",
    region: "Florida, United States",
    detail: "FAU Boca Raton Campus",
    latitude: 26.3705,
    longitude: -80.1024,
  };

  const UNITS = {
    imperial: { temperature: "fahrenheit", wind: "mph", precipitation: "inch", tempLabel: "°F", windLabel: "mph" },
    metric: { temperature: "celsius", wind: "kmh", precipitation: "mm", tempLabel: "°C", windLabel: "km/h" },
  };

  // WMO weather interpretation codes -> label + icon type
  const WEATHER_CODES = {
    0: ["Clear sky", "clear"],
    1: ["Mainly clear", "clear"],
    2: ["Partly cloudy", "partly"],
    3: ["Overcast", "cloudy"],
    45: ["Fog", "fog"],
    48: ["Depositing rime fog", "fog"],
    51: ["Light drizzle", "drizzle"],
    53: ["Drizzle", "drizzle"],
    55: ["Heavy drizzle", "drizzle"],
    56: ["Light freezing drizzle", "drizzle"],
    57: ["Freezing drizzle", "drizzle"],
    61: ["Light rain", "rain"],
    63: ["Rain", "rain"],
    65: ["Heavy rain", "rain"],
    66: ["Light freezing rain", "rain"],
    67: ["Freezing rain", "rain"],
    71: ["Light snow", "snow"],
    73: ["Snow", "snow"],
    75: ["Heavy snow", "snow"],
    77: ["Snow grains", "snow"],
    80: ["Light showers", "showers"],
    81: ["Showers", "showers"],
    82: ["Violent showers", "showers"],
    85: ["Light snow showers", "snow"],
    86: ["Snow showers", "snow"],
    95: ["Thunderstorm", "storm"],
    96: ["Thunderstorm with hail", "storm"],
    99: ["Severe thunderstorm with hail", "storm"],
  };

  const $ = (id) => document.getElementById(id);

  const state = loadState();
  let searchTimer = null;
  let searchAbort = null;
  let forecastAbort = null;

  /* ---------------- Persistence ---------------- */

  function loadState() {
    const fallback = { location: DEFAULT_LOCATION, units: "imperial", theme: "system" };
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (!saved) return fallback;
      const loc = saved.location;
      const validLoc = loc && Number.isFinite(loc.latitude) && Number.isFinite(loc.longitude) && typeof loc.name === "string";
      return {
        location: validLoc ? loc : DEFAULT_LOCATION,
        units: UNITS[saved.units] ? saved.units : "imperial",
        theme: THEMES.includes(saved.theme) ? saved.theme : "system",
      };
    } catch {
      return fallback;
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* storage unavailable (private mode etc.) — ignore */
    }
  }

  /* ---------------- API ---------------- */

  async function fetchForecast(location, unitsKey) {
    const u = UNITS[unitsKey];
    const params = new URLSearchParams({
      latitude: location.latitude,
      longitude: location.longitude,
      current: [
        "temperature_2m", "relative_humidity_2m", "apparent_temperature", "is_day",
        "precipitation", "weather_code", "pressure_msl", "wind_speed_10m",
        "wind_direction_10m", "wind_gusts_10m",
      ].join(","),
      hourly: ["temperature_2m", "precipitation_probability", "weather_code", "is_day"].join(","),
      daily: [
        "weather_code", "temperature_2m_max", "temperature_2m_min", "sunrise", "sunset",
        "precipitation_probability_max", "uv_index_max",
      ].join(","),
      temperature_unit: u.temperature,
      wind_speed_unit: u.wind,
      precipitation_unit: u.precipitation,
      timezone: "auto",
      forecast_days: 7,
    });

    if (forecastAbort) forecastAbort.abort();
    forecastAbort = new AbortController();

    const res = await fetch(`${FORECAST_URL}?${params}`, { signal: forecastAbort.signal });
    if (!res.ok) {
      let reason = `HTTP ${res.status}`;
      try { reason = (await res.json()).reason || reason; } catch { /* ignore */ }
      throw new Error(`Forecast request failed (${reason})`);
    }
    return res.json();
  }

  async function searchPlaces(query) {
    if (searchAbort) searchAbort.abort();
    searchAbort = new AbortController();
    const params = new URLSearchParams({ name: query, count: 8, language: "en", format: "json" });
    const res = await fetch(`${GEOCODE_URL}?${params}`, { signal: searchAbort.signal });
    if (!res.ok) throw new Error(`Search failed (HTTP ${res.status})`);
    const data = await res.json();
    return (data.results || []).map((r) => ({
      name: r.name,
      region: [r.admin1, r.country].filter(Boolean).join(", "),
      detail: "",
      latitude: r.latitude,
      longitude: r.longitude,
    }));
  }

  /* ---------------- Formatting helpers ---------------- */

  // Open-Meteo returns local times like "2026-09-28T14:00" (timezone=auto).
  // Parse them as wall-clock values so the viewer's own timezone never shifts them.
  function parseLocal(iso) {
    const [date, time = "00:00"] = iso.split("T");
    const [y, m, d] = date.split("-").map(Number);
    const [hh, mm] = time.split(":").map(Number);
    return { y, m, d, hh, mm };
  }

  function fmtClock(iso) {
    const { hh, mm } = parseLocal(iso);
    const h12 = hh % 12 || 12;
    return `${h12}:${String(mm).padStart(2, "0")} ${hh < 12 ? "AM" : "PM"}`;
  }

  function fmtHour(iso) {
    const { hh } = parseLocal(iso);
    return `${hh % 12 || 12} ${hh < 12 ? "AM" : "PM"}`;
  }

  function fmtDay(iso, style) {
    const { y, m, d } = parseLocal(iso);
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { timeZone: "UTC", ...style });
  }

  const round = (n) => (Number.isFinite(n) ? Math.round(n) : "--");

  function compass(deg) {
    if (!Number.isFinite(deg)) return "";
    const dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
    return dirs[Math.round(deg / 22.5) % 16];
  }

  function uvLabel(uv) {
    if (!Number.isFinite(uv)) return "--";
    const v = Math.round(uv);
    const level = v <= 2 ? "Low" : v <= 5 ? "Moderate" : v <= 7 ? "High" : v <= 10 ? "Very high" : "Extreme";
    return `${v} · ${level}`;
  }

  function describe(code) {
    return WEATHER_CODES[code] || ["Unknown", "cloudy"];
  }

  /* ---------------- Icons (inline SVG) ---------------- */

  const SVG = {
    sun: '<circle class="wx-sun" cx="32" cy="32" r="12"/><g class="wx-sun">' +
      [0, 45, 90, 135, 180, 225, 270, 315].map((a) =>
        `<rect x="30" y="6" width="4" height="9" rx="2" transform="rotate(${a} 32 32)"/>`).join("") + "</g>",
    moon: '<path class="wx-moon" d="M40 12a20 20 0 1 0 12 30 16 16 0 0 1-12-30z"/>',
    sunSmall: '<g transform="translate(-8 -8) scale(0.8)"><circle class="wx-sun" cx="32" cy="32" r="12"/><g class="wx-sun">' +
      [0, 45, 90, 135, 180, 225, 270, 315].map((a) =>
        `<rect x="30" y="6" width="4" height="9" rx="2" transform="rotate(${a} 32 32)"/>`).join("") + "</g></g>",
    moonSmall: '<g transform="translate(-6 -6) scale(0.75)"><path class="wx-moon" d="M40 12a20 20 0 1 0 12 30 16 16 0 0 1-12-30z"/></g>',
    cloud: (cls = "wx-cloud", dy = 0) =>
      `<path class="${cls}" transform="translate(0 ${dy})" d="M20 48h26a10 10 0 0 0 0-20 14 14 0 0 0-27-3 11 11 0 0 0 1 23z"/>`,
    rain: '<g class="wx-rain"><path d="M24 50l-3 7"/><path d="M33 50l-3 7"/><path d="M42 50l-3 7"/></g>',
    drizzle: '<g class="wx-rain"><path d="M26 51l-1.5 4"/><path d="M34 51l-1.5 4"/><path d="M42 51l-1.5 4"/></g>',
    snow: '<g class="wx-snow"><circle cx="24" cy="54" r="3"/><circle cx="33" cy="58" r="3"/><circle cx="42" cy="54" r="3"/></g>',
    bolt: '<path class="wx-bolt" d="M34 42l-8 12h6l-3 9 10-13h-6l4-8z"/>',
    fog: '<g class="wx-fog"><path d="M14 40h36"/><path d="M18 48h32"/><path d="M14 56h30"/></g>',
  };

  function icon(code, isDay = 1) {
    const [, type] = describe(code);
    const day = isDay !== 0;
    let body;
    switch (type) {
      case "clear": body = day ? SVG.sun : SVG.moon; break;
      case "partly": body = (day ? SVG.sunSmall : SVG.moonSmall) + SVG.cloud("wx-cloud", 4); break;
      case "cloudy": body = SVG.cloud("wx-cloud-dark", -2); break;
      case "fog": body = SVG.cloud("wx-cloud", -12) + SVG.fog; break;
      case "drizzle": body = SVG.cloud("wx-cloud", -4) + SVG.drizzle; break;
      case "rain": body = SVG.cloud("wx-cloud-dark", -4) + SVG.rain; break;
      case "showers": body = (day ? SVG.sunSmall : SVG.moonSmall) + SVG.cloud("wx-cloud", -2) + SVG.rain; break;
      case "snow": body = SVG.cloud("wx-cloud", -6) + SVG.snow; break;
      case "storm": body = SVG.cloud("wx-cloud-dark", -6) + SVG.bolt; break;
      default: body = SVG.cloud();
    }
    return `<svg viewBox="0 0 64 64" role="img" aria-label="${describe(code)[0]}">${body}</svg>`;
  }

  function skyFor(code, isDay) {
    const [, type] = describe(code);
    if (type === "storm") return "storm";
    if (type === "rain" || type === "showers" || type === "drizzle") return "rain";
    if (type === "snow") return "snow";
    if (type === "fog") return "fog";
    if (!isDay) return "night";
    return type === "cloudy" ? "cloudy-day" : "clear-day";
  }

  /* ---------------- Rendering ---------------- */

  function renderLocation(loc) {
    $("location-name").textContent = loc.name;
    $("location-region").textContent = loc.region || "";
    $("location-detail").textContent = loc.detail || "Current conditions";
    document.title = `FAU Weather | ${loc.name}`;
  }

  function render(data) {
    const u = UNITS[state.units];
    const c = data.current;
    const d = data.daily;
    const [summary] = describe(c.weather_code);

    // Current
    $("now-icon").innerHTML = icon(c.weather_code, c.is_day);
    $("now-temp").textContent = round(c.temperature_2m);
    $("now-unit").textContent = u.tempLabel;
    $("now-summary").textContent = summary;
    $("now-feels").textContent = `${round(c.apparent_temperature)}°`;
    $("today-high").textContent = `${round(d.temperature_2m_max[0])}°`;
    $("today-low").textContent = `${round(d.temperature_2m_min[0])}°`;
    $("updated").textContent = `Updated ${fmtClock(c.time)} ${data.timezone_abbreviation || ""}`.trim();
    document.body.dataset.sky = skyFor(c.weather_code, c.is_day);

    // Details
    $("d-humidity").textContent = `${round(c.relative_humidity_2m)}%`;
    $("d-wind").textContent = `${round(c.wind_speed_10m)} ${u.windLabel} ${compass(c.wind_direction_10m)}`.trim();
    $("d-gusts").textContent = `${round(c.wind_gusts_10m)} ${u.windLabel}`;
    $("d-precip-prob").textContent = `${round(d.precipitation_probability_max[0])}%`;
    $("d-uv").textContent = uvLabel(d.uv_index_max[0]);
    $("d-pressure").textContent = state.units === "imperial"
      ? `${(c.pressure_msl * 0.02953).toFixed(2)} inHg`
      : `${round(c.pressure_msl)} hPa`;
    $("d-sunrise").textContent = fmtClock(d.sunrise[0]);
    $("d-sunset").textContent = fmtClock(d.sunset[0]);

    renderWelcome(c, d);
    renderHourly(data.hourly, c);
    renderDaily(d);
  }

  function renderHourly(h, current) {
    const nowHour = current.time.slice(0, 13); // "YYYY-MM-DDTHH"
    let start = h.time.findIndex((t) => t.slice(0, 13) >= nowHour);
    if (start < 0) start = 0;

    const items = [];
    for (let i = start; i < Math.min(start + 24, h.time.length); i++) {
      const pop = h.precipitation_probability ? h.precipitation_probability[i] : null;
      const isNow = i === start;
      // The "Now" tile shows live current conditions so it matches the hero card.
      const code = isNow ? current.weather_code : h.weather_code[i];
      const isDay = isNow ? current.is_day : (h.is_day ? h.is_day[i] : 1);
      const temp = isNow ? current.temperature_2m : h.temperature_2m[i];
      items.push(`
        <li class="hour${isNow ? " is-now" : ""}">
          <div class="hour-time">${isNow ? "Now" : fmtHour(h.time[i])}</div>
          ${icon(code, isDay)}
          <div class="hour-temp">${round(temp)}°</div>
          <div class="hour-pop">${Number.isFinite(pop) && pop >= 10 ? `${pop}%` : ""}</div>
        </li>`);
    }
    $("hourly").innerHTML = items.join("");
    $("hourly").scrollLeft = 0;
  }

  function renderDaily(d) {
    const lows = d.temperature_2m_min.filter(Number.isFinite);
    const highs = d.temperature_2m_max.filter(Number.isFinite);
    const min = Math.min(...lows);
    const max = Math.max(...highs);
    const span = Math.max(max - min, 1);

    $("daily").innerHTML = d.time.map((t, i) => {
      const lo = d.temperature_2m_min[i];
      const hi = d.temperature_2m_max[i];
      const left = ((lo - min) / span) * 100;
      const width = Math.max(((hi - lo) / span) * 100, 4);
      const pop = d.precipitation_probability_max ? d.precipitation_probability_max[i] : null;
      const name = i === 0 ? "Today" : fmtDay(t, { weekday: "short" });
      return `
        <li class="day">
          <div class="day-name">${name}<small>${fmtDay(t, { month: "short", day: "numeric" })}</small></div>
          ${icon(d.weather_code[i], 1)}
          <div class="day-pop">${Number.isFinite(pop) && pop >= 10 ? `💧${pop}%` : ""}</div>
          <div class="day-range">
            <span class="lo">${round(lo)}°</span>
            <span class="range-track" aria-hidden="true"><span class="range-fill" data-left="${left}" data-width="${width}"></span></span>
            <span class="hi">${round(hi)}°</span>
          </div>
        </li>`;
    }).join("");

    // Positioned via CSSOM (not inline style attributes) so the strict CSP stays intact.
    $("daily").querySelectorAll(".range-fill").forEach((el) => {
      el.style.left = `${el.dataset.left}%`;
      el.style.width = `${el.dataset.width}%`;
    });
  }

  function greeting() {
    const h = new Date().getHours(); // the viewer's own local time
    if (h < 5) return "Burning the midnight oil";
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  }

  function weatherTip(c, d) {
    const hot = state.units === "imperial" ? 90 : 32;
    const cold = state.units === "imperial" ? 55 : 13;
    const [, type] = describe(c.weather_code);
    if (type === "storm") return "Thunderstorms around. Stay indoors when you hear thunder.";
    if (type === "rain" || type === "showers" || type === "drizzle") return "It's wet out there. Grab an umbrella on your way to class! ☔";
    if (d.precipitation_probability_max[0] >= 50) return `${round(d.precipitation_probability_max[0])}% chance of rain today. Pack an umbrella just in case. ☔`;
    if (c.apparent_temperature >= hot) return "It's a scorcher. Stay hydrated and find some shade. 🥤";
    if (d.uv_index_max[0] >= 8) return "UV is high today. Don't forget the sunscreen! 🧴";
    if (c.apparent_temperature <= cold) return "Chilly by Florida standards. Bring a hoodie! 🧥";
    return "Looks like a great day to be an Owl. Go Owls! 🦉";
  }

  function renderWelcome(c, d) {
    $("welcome-title").textContent = `${greeting()}, ${USER_NAME}! 🦉`;
    $("welcome-tip").textContent = weatherTip(c, d);
  }

  function setStatus(message, kind = "error") {
    const el = $("status");
    el.textContent = message || "";
    el.className = `status${kind === "info" ? " info" : ""}`;
  }

  /* ---------------- Controller ---------------- */

  async function load() {
    renderLocation(state.location);
    updateUnitButtons();
    document.body.classList.add("loading");
    setStatus("");
    try {
      const data = await fetchForecast(state.location, state.units);
      render(data);
    } catch (err) {
      if (err.name === "AbortError") return;
      console.error(err);
      setStatus(`Couldn't load the forecast. ${navigator.onLine === false ? "You appear to be offline." : err.message}`);
    } finally {
      document.body.classList.remove("loading");
    }
  }

  function setLocation(loc) {
    state.location = loc;
    saveState();
    load();
  }

  function updateUnitButtons() {
    document.querySelectorAll(".unit-toggle button").forEach((btn) => {
      btn.setAttribute("aria-pressed", String(btn.dataset.units === state.units));
    });
  }

  /* ---------------- Search UI ---------------- */

  const input = $("search-input");
  const list = $("search-results");

  function closeResults() {
    list.hidden = true;
    list.innerHTML = "";
    input.setAttribute("aria-expanded", "false");
  }

  function showResults(results) {
    list.innerHTML = "";
    if (!results.length) {
      const li = document.createElement("li");
      li.className = "empty";
      li.textContent = "No places found.";
      list.appendChild(li);
    }
    results.forEach((place) => {
      const li = document.createElement("li");
      li.setAttribute("role", "option");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = place.name;
      const sub = document.createElement("span");
      sub.className = "sub";
      sub.textContent = place.region;
      btn.appendChild(sub);
      btn.addEventListener("click", () => {
        closeResults();
        input.value = "";
        input.blur();
        setLocation(place);
      });
      li.appendChild(btn);
      list.appendChild(li);
    });
    list.hidden = false;
    input.setAttribute("aria-expanded", "true");
  }

  async function runSearch(query, { pickFirst = false } = {}) {
    const q = query.trim();
    if (q.length < 2) { closeResults(); return; }
    try {
      const results = await searchPlaces(q);
      if (pickFirst && results.length) {
        closeResults();
        input.value = "";
        input.blur();
        setLocation(results[0]);
      } else {
        showResults(results);
      }
    } catch (err) {
      if (err.name !== "AbortError") setStatus(err.message);
    }
  }

  input.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => runSearch(input.value), 300);
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeResults();
    if (e.key === "ArrowDown" && !list.hidden) {
      e.preventDefault();
      const first = list.querySelector("button");
      if (first) first.focus();
    }
  });

  list.addEventListener("keydown", (e) => {
    const buttons = [...list.querySelectorAll("button")];
    const i = buttons.indexOf(document.activeElement);
    if (e.key === "ArrowDown" && i < buttons.length - 1) { e.preventDefault(); buttons[i + 1].focus(); }
    if (e.key === "ArrowUp") { e.preventDefault(); (i > 0 ? buttons[i - 1] : input).focus(); }
    if (e.key === "Escape") { closeResults(); input.focus(); }
  });

  $("search-form").addEventListener("submit", (e) => {
    e.preventDefault();
    clearTimeout(searchTimer);
    runSearch(input.value, { pickFirst: true });
  });

  document.addEventListener("click", (e) => {
    if (!$("search-form").contains(e.target)) closeResults();
  });

  /* ---------------- Theme ---------------- */

  const darkQuery = window.matchMedia ? matchMedia("(prefers-color-scheme: dark)") : null;

  function applyTheme() {
    const resolved = state.theme === "system" ? (darkQuery && darkQuery.matches ? "dark" : "light") : state.theme;
    document.documentElement.dataset.theme = resolved;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = resolved === "dark" ? "#2a0f52" : "#4b1d8f";
    $("theme-select").value = state.theme;
  }

  $("theme-select").addEventListener("change", (e) => {
    state.theme = THEMES.includes(e.target.value) ? e.target.value : "system";
    saveState();
    applyTheme();
  });

  // Follow the OS setting live while "System" is selected
  if (darkQuery) {
    darkQuery.addEventListener("change", () => { if (state.theme === "system") applyTheme(); });
  }

  applyTheme();

  /* ---------------- Logo ---------------- */

  // Official FAU owl head is loaded from fau.edu; fall back to a local owl if it can't load.
  document.querySelectorAll("img.fau-owl").forEach((img) => {
    const useFallback = () => {
      if (img.dataset.fallback && !img.src.endsWith(img.dataset.fallback)) img.src = img.dataset.fallback;
    };
    img.addEventListener("error", useFallback, { once: true });
    if (img.complete && img.naturalWidth === 0) useFallback();
  });

  /* ---------------- Other controls ---------------- */

  document.querySelectorAll(".unit-toggle button").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.dataset.units === state.units) return;
      state.units = btn.dataset.units;
      saveState();
      load();
    });
  });

  $("home-btn").addEventListener("click", () => setLocation(DEFAULT_LOCATION));

  $("locate-btn").addEventListener("click", () => {
    if (!("geolocation" in navigator)) {
      setStatus("Your browser doesn't support location access.");
      return;
    }
    setStatus("Finding your location…", "info");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({
          name: "My location",
          region: `${pos.coords.latitude.toFixed(3)}°, ${pos.coords.longitude.toFixed(3)}°`,
          detail: "Based on your device",
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        });
      },
      (err) => setStatus(err.code === err.PERMISSION_DENIED
        ? "Location permission was denied. Search for a city instead."
        : "Couldn't determine your location."),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 }
    );
  });

  $("welcome-title").textContent = `${greeting()}, ${USER_NAME}! 🦉`;

  // Refresh every 15 minutes while the tab is open
  setInterval(() => { if (!document.hidden) load(); }, 15 * 60 * 1000);

  load();
})();
