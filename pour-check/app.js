/* ============================================
   POURCHECK™ — Concrete Pour Weather Intelligence
   ============================================ */

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// DOM refs
const locationInput = $('#locationInput');
const checkBtn = $('#checkBtn');
const geoBtn = $('#geoBtn');
const searchSuggestions = $('#searchSuggestions');
const errorMsg = $('#errorMsg');
const loadingSection = $('#loadingSection');
const resultsSection = $('#resultsSection');
const heroSection = document.querySelector('.hero');

let debounceTimer = null;
let selectedCoords = null;

// ================ GEOCODING ================

async function geocodeLocation(query) {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&addressdetails=1`;
  const res = await fetch(url, { headers: { 'User-Agent': 'PourCheck/1.0' } });
  if (!res.ok) throw new Error('Geocoding failed');
  return res.json();
}

async function reverseGeocode(lat, lon) {
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&addressdetails=1`;
  const res = await fetch(url, { headers: { 'User-Agent': 'PourCheck/1.0' } });
  if (!res.ok) throw new Error('Reverse geocoding failed');
  return res.json();
}

// ================ WEATHER API ================

async function fetchWeather(lat, lon) {
  const params = new URLSearchParams({
    latitude: lat,
    longitude: lon,
    hourly: [
      'temperature_2m', 'relative_humidity_2m', 'dew_point_2m',
      'precipitation_probability', 'precipitation', 'wind_speed_10m',
      'weather_code'
    ].join(','),
    current: [
      'temperature_2m', 'relative_humidity_2m', 'wind_speed_10m',
      'precipitation', 'weather_code', 'dew_point_2m'
    ].join(','),
    temperature_unit: 'fahrenheit',
    wind_speed_unit: 'mph',
    precipitation_unit: 'inch',
    timezone: 'auto',
    forecast_days: 1
  });
  const url = `https://api.open-meteo.com/v1/forecast?${params}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Weather data unavailable');
  return res.json();
}

// ================ POUR QUALITY ALGORITHM ================

function calculatePourQuality(current, hourly) {
  const temp = current.temperature_2m;
  const humidity = current.relative_humidity_2m;
  const wind = current.wind_speed_10m;
  const precip = current.precipitation;
  const dewPoint = current.dew_point_2m;

  // Get max rain chance in next 8 hours
  const now = new Date();
  const currentHourIndex = hourly.time.findIndex(t => new Date(t) >= now);
  const next8Hours = hourly.precipitation_probability.slice(
    Math.max(0, currentHourIndex), currentHourIndex + 8
  );
  const maxRainChance = Math.max(...next8Hours, 0);
  const avgRainChance = next8Hours.length > 0
    ? next8Hours.reduce((a, b) => a + b, 0) / next8Hours.length
    : 0;

  let score = 100;
  const risks = [];
  const tips = [];

  // --- Temperature scoring (ideal: 50-85°F) ---
  let tempScore, tempStatus;
  if (temp >= 50 && temp <= 85) {
    tempScore = 100;
    tempStatus = { text: 'Ideal range', color: 'green' };
  } else if (temp >= 40 && temp < 50) {
    tempScore = 60;
    tempStatus = { text: 'Cold — use precautions', color: 'orange' };
    risks.push({
      level: 'medium',
      title: 'Cold Weather Conditions',
      desc: `At ${temp}°F, concrete will set slower. Consider using Type III cement or heated water. Protect the pour from freezing for at least 48 hours.`
    });
    tips.push({ icon: '🔥', text: '<strong>Cold weather tip:</strong> Use insulating blankets or heated enclosures. Never pour on frozen ground.' });
  } else if (temp > 85 && temp <= 100) {
    tempScore = 55;
    tempStatus = { text: 'Hot — risk of cracking', color: 'orange' };
    risks.push({
      level: 'medium',
      title: 'Hot Weather Conditions',
      desc: `At ${temp}°F, concrete may set too fast causing cracking. Use ice in the mix water, schedule pours for early morning, and have extra finishers ready.`
    });
    tips.push({ icon: '❄️', text: '<strong>Hot weather tip:</strong> Dampen subgrade and forms before pour. Use retarding admixtures and start curing immediately.' });
  } else if (temp < 40) {
    tempScore = 20;
    tempStatus = { text: 'Too cold — high risk', color: 'red' };
    risks.push({
      level: 'high',
      title: 'Freezing Risk',
      desc: `At ${temp}°F, fresh concrete can freeze and lose 50%+ of its strength permanently. Strongly consider postponing unless cold-weather measures are in place.`
    });
    tips.push({ icon: '⛔', text: '<strong>Critical:</strong> Below 40°F, concrete should not be poured without hot water, accelerators, and heated enclosures.' });
  } else {
    tempScore = 15;
    tempStatus = { text: 'Extreme heat — postpone', color: 'red' };
    risks.push({
      level: 'high',
      title: 'Extreme Heat',
      desc: `At ${temp}°F, rapid moisture loss will cause plastic shrinkage cracking. Consider postponing or pouring at night.`
    });
  }
  score -= (100 - tempScore) * 0.25;

  // --- Humidity scoring (ideal: 40-70%) ---
  let humidityScore, humidityStatus;
  if (humidity >= 40 && humidity <= 70) {
    humidityScore = 100;
    humidityStatus = { text: 'Ideal range', color: 'green' };
  } else if (humidity > 70 && humidity <= 85) {
    humidityScore = 75;
    humidityStatus = { text: 'High — slower cure', color: 'orange' };
    risks.push({
      level: 'low',
      title: 'High Humidity',
      desc: `Humidity at ${humidity}% will slow evaporation and curing. Allow extra finishing time and delay troweling until bleed water disappears.`
    });
  } else if (humidity > 85) {
    humidityScore = 50;
    humidityStatus = { text: 'Very high — extended cure', color: 'orange' };
    risks.push({
      level: 'medium',
      title: 'Very High Humidity',
      desc: `At ${humidity}%, expect significantly longer bleed water evaporation and finishing windows. Plan for extended cure times.`
    });
    tips.push({ icon: '💧', text: '<strong>High humidity:</strong> Don\'t start finishing until bleed water sheen disappears. Rushing causes surface defects.' });
  } else if (humidity >= 20) {
    humidityScore = 60;
    humidityStatus = { text: 'Low — rapid drying risk', color: 'orange' };
    risks.push({
      level: 'medium',
      title: 'Low Humidity',
      desc: `At ${humidity}%, concrete surface will dry rapidly. Apply curing compound immediately after finishing or use fog spraying.`
    });
    tips.push({ icon: '💨', text: '<strong>Low humidity:</strong> Use evaporation retarders and apply curing membrane as soon as finishing is done.' });
  } else {
    humidityScore = 35;
    humidityStatus = { text: 'Very low — cracking risk', color: 'red' };
    risks.push({
      level: 'high',
      title: 'Extremely Low Humidity',
      desc: `At ${humidity}%, surface moisture will flash off. High risk of plastic shrinkage cracking without immediate mitigation.`
    });
  }
  score -= (100 - humidityScore) * 0.20;

  // --- Wind scoring (ideal: <15 mph) ---
  let windScore, windStatus;
  if (wind < 10) {
    windScore = 100;
    windStatus = { text: 'Calm conditions', color: 'green' };
  } else if (wind < 15) {
    windScore = 80;
    windStatus = { text: 'Light breeze', color: 'green' };
  } else if (wind < 25) {
    windScore = 50;
    windStatus = { text: 'Moderate — increased drying', color: 'orange' };
    risks.push({
      level: 'medium',
      title: 'Windy Conditions',
      desc: `Wind at ${wind} mph will accelerate surface evaporation, especially combined with low humidity. Use windbreaks and fog spray.`
    });
    tips.push({ icon: '🌬️', text: '<strong>Wind protection:</strong> Set up temporary windscreens. Wind + low humidity + heat = guaranteed plastic shrinkage cracks.' });
  } else {
    windScore = 20;
    windStatus = { text: 'High wind — consider postponing', color: 'red' };
    risks.push({
      level: 'high',
      title: 'High Wind Warning',
      desc: `At ${wind} mph, surface moisture will evaporate rapidly. Extremely high crack risk. Consider postponing the pour.`
    });
  }
  score -= (100 - windScore) * 0.15;

  // --- Rain scoring ---
  let rainScore, rainStatus;
  if (maxRainChance < 20) {
    rainScore = 100;
    rainStatus = { text: 'Clear skies ahead', color: 'green' };
  } else if (maxRainChance < 40) {
    rainScore = 75;
    rainStatus = { text: 'Slight chance — monitor', color: 'green' };
  } else if (maxRainChance < 60) {
    rainScore = 45;
    rainStatus = { text: 'Possible rain — have tarps', color: 'orange' };
    risks.push({
      level: 'medium',
      title: 'Rain Risk',
      desc: `Up to ${maxRainChance}% chance of rain in the next 8 hours. Have plastic sheeting and tarps ready to cover fresh concrete immediately.`
    });
    tips.push({ icon: '🛡️', text: '<strong>Rain prep:</strong> Stage poly sheeting and tent frames at the pour site. Rain on fresh concrete washes out cement paste and ruins the surface.' });
  } else {
    rainScore = 10;
    rainStatus = { text: 'Rain likely — high risk', color: 'red' };
    risks.push({
      level: 'high',
      title: 'Rain Expected',
      desc: `${maxRainChance}% chance of rain. Rain on fresh concrete can cause scaling, dusting, and permanent surface damage. Strongly consider rescheduling.`
    });
    tips.push({ icon: '☔', text: '<strong>Critical:</strong> If you must pour with rain forecast, have full coverage tarps and be prepared to protect immediately. Never work rain water into the surface.' });
  }
  score -= (100 - rainScore) * 0.30;

  // --- Precipitation amount ---
  let precipStatus;
  if (precip <= 0) {
    precipStatus = { text: 'No precipitation', color: 'green' };
  } else if (precip < 0.1) {
    precipStatus = { text: 'Trace amounts', color: 'orange' };
  } else {
    precipStatus = { text: 'Active precipitation', color: 'red' };
    score -= 15;
  }

  // --- Dew point ---
  let dewStatus;
  const surfaceDewRisk = temp - dewPoint;
  if (surfaceDewRisk > 10) {
    dewStatus = { text: 'Good separation', color: 'green' };
  } else if (surfaceDewRisk > 5) {
    dewStatus = { text: 'Monitor closely', color: 'orange' };
    tips.push({ icon: '🌡️', text: '<strong>Dew point close:</strong> If slab temperature drops near dew point, condensation can form on the surface. Check again before final finish.' });
  } else {
    dewStatus = { text: 'Condensation risk', color: 'red' };
    risks.push({
      level: 'medium',
      title: 'Dew Point Warning',
      desc: `Only ${surfaceDewRisk.toFixed(1)}°F between temp and dew point. Moisture may condense on the concrete surface, weakening the finish.`
    });
    score -= 10;
  }

  // --- Evaporation rate risk (simplified ACI 308 check) ---
  // Combines temp, humidity, wind
  if (temp > 75 && humidity < 50 && wind > 10) {
    risks.push({
      level: 'high',
      title: 'High Evaporation Rate',
      desc: 'The combination of heat, low humidity, and wind creates a high evaporation rate. Plastic shrinkage cracking is very likely without fog curing or evaporation retarder.'
    });
    score -= 10;
    tips.push({ icon: '⚠️', text: '<strong>Evaporation alert:</strong> When evaporation exceeds 0.2 lb/ft²/hr, fog the surface continuously. ACI 305 recommends evaporation retarders in these conditions.' });
  }

  // Default tips
  if (tips.length === 0) {
    tips.push(
      { icon: '✅', text: '<strong>Good conditions!</strong> Standard curing procedures should work well today. Apply curing compound after finishing.' },
      { icon: '📏', text: '<strong>Reminder:</strong> Maintain proper water-cement ratio. Extra water weakens concrete — add superplasticizer for workability instead.' }
    );
  }
  tips.push(
    { icon: '🧪', text: '<strong>Always test:</strong> Perform slump tests on delivery. Reject loads outside your spec. Document everything.' },
    { icon: '⏱️', text: '<strong>Timing:</strong> Start curing within 20 minutes of final finish. Every minute of delay increases surface defect risk.' }
  );

  // If no risks found
  if (risks.length === 0) {
    risks.push({
      level: 'low',
      title: 'No Major Risks Detected',
      desc: 'Weather conditions look favorable for a concrete pour. Follow standard procedures and monitor conditions throughout the day.'
    });
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  return {
    score,
    temp: { value: temp, ...tempStatus },
    humidity: { value: humidity, ...humidityStatus },
    wind: { value: wind, ...windStatus },
    rain: { value: maxRainChance, ...rainStatus },
    precip: { value: precip, ...precipStatus },
    dew: { value: dewPoint, ...dewStatus },
    risks,
    tips,
    surfaceDewRisk
  };
}

function getVerdict(score) {
  if (score >= 85) return {
    text: 'POUR IT',
    icon: '🟢',
    detail: 'Conditions are excellent for concrete placement. Standard procedures apply. Get that mud flowing!',
    color: '#43A047',
    bg: 'rgba(67, 160, 71, 0.15)'
  };
  if (score >= 70) return {
    text: 'GOOD TO GO',
    icon: '👍',
    detail: 'Conditions are favorable with minor concerns. Review the risk factors below and take standard precautions.',
    color: '#7CB342',
    bg: 'rgba(124, 179, 66, 0.15)'
  };
  if (score >= 50) return {
    text: 'PROCEED WITH CAUTION',
    icon: '⚠️',
    detail: 'Conditions are marginal. Address the risk factors below before proceeding. Extra precautions and monitoring required.',
    color: '#FF9800',
    bg: 'rgba(255, 152, 0, 0.15)'
  };
  if (score >= 30) return {
    text: 'HIGH RISK',
    icon: '🔶',
    detail: 'Multiple weather factors are working against you. Seriously consider postponing unless you have mitigation measures in place for every risk factor.',
    color: '#F4511E',
    bg: 'rgba(244, 81, 30, 0.15)'
  };
  return {
    text: 'DO NOT POUR',
    icon: '🛑',
    detail: 'Conditions are too dangerous for concrete placement. Pouring today risks permanent structural damage and surface defects. Reschedule.',
    color: '#E53935',
    bg: 'rgba(229, 57, 53, 0.15)'
  };
}

// ================ HOURLY ANALYSIS ================

function calculateHourlyScores(hourly) {
  const now = new Date();
  const cards = [];
  const currentHour = now.getHours();

  for (let i = 0; i < hourly.time.length; i++) {
    const hourDate = new Date(hourly.time[i]);
    const hour = hourDate.getHours();

    // Only show 5 AM to 10 PM (typical pour hours)
    if (hour < 5 || hour > 22) continue;

    const temp = hourly.temperature_2m[i];
    const humidity = hourly.relative_humidity_2m[i];
    const wind = hourly.wind_speed_10m[i];
    const rainChance = hourly.precipitation_probability[i];

    // Simplified score
    let hScore = 100;
    if (temp < 40 || temp > 100) hScore -= 40;
    else if (temp < 50 || temp > 85) hScore -= 15;
    if (humidity > 85) hScore -= 15;
    else if (humidity < 30) hScore -= 20;
    if (wind > 25) hScore -= 30;
    else if (wind > 15) hScore -= 15;
    if (rainChance > 60) hScore -= 35;
    else if (rainChance > 40) hScore -= 20;
    else if (rainChance > 20) hScore -= 10;

    hScore = Math.max(0, Math.min(100, hScore));

    let scoreColor, scoreLabel;
    if (hScore >= 80) { scoreColor = 'var(--green)'; scoreLabel = 'GOOD'; }
    else if (hScore >= 55) { scoreColor = 'var(--orange)'; scoreLabel = 'FAIR'; }
    else { scoreColor = 'var(--red)'; scoreLabel = 'POOR'; }

    let rainLevel;
    if (rainChance < 30) rainLevel = 'low';
    else if (rainChance < 60) rainLevel = 'medium';
    else rainLevel = 'high';

    cards.push({
      time: hourDate.toLocaleTimeString('en-US', { hour: 'numeric', hour12: true }),
      temp: Math.round(temp),
      humidity: Math.round(humidity),
      rainChance: Math.round(rainChance),
      rainLevel,
      score: hScore,
      scoreColor,
      scoreLabel,
      isCurrent: hour === currentHour
    });
  }

  return cards;
}

// ================ RENDERING ================

function showError(msg) {
  errorMsg.textContent = msg;
  errorMsg.classList.remove('hidden');
  setTimeout(() => errorMsg.classList.add('hidden'), 5000);
}

function showLoading() {
  loadingSection.classList.remove('hidden');
  resultsSection.classList.add('hidden');
}

function hideLoading() {
  loadingSection.classList.add('hidden');
}

function renderResults(locationName, weather) {
  const result = calculatePourQuality(weather.current, weather.hourly);
  const verdict = getVerdict(result.score);

  // Location & date
  $('#locationName').textContent = locationName;
  $('#scoreDate').textContent = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  // Gauge animation
  const circumference = 2 * Math.PI * 85; // ~534
  const offset = circumference - (result.score / 100) * circumference;
  const gaugeCircle = $('#gaugeCircle');
  gaugeCircle.style.stroke = verdict.color;
  // Trigger animation
  requestAnimationFrame(() => {
    gaugeCircle.style.strokeDashoffset = offset;
  });
  $('#gaugeScore').textContent = result.score;

  // Verdict
  const verdictBadge = $('#verdictBadge');
  verdictBadge.style.background = verdict.bg;
  verdictBadge.style.color = verdict.color;
  $('#verdictIcon').textContent = verdict.icon;
  $('#verdictText').textContent = verdict.text;
  $('#verdictDetail').textContent = verdict.detail;

  // Conditions
  setCondition('temp', `${Math.round(result.temp.value)}°F`, result.temp);
  setCondition('humidity', `${Math.round(result.humidity.value)}%`, result.humidity);
  setCondition('wind', `${Math.round(result.wind.value)} mph`, result.wind);
  setCondition('rain', `${Math.round(result.rain.value)}%`, result.rain);
  setCondition('precip', `${result.precip.value.toFixed(2)}"`, result.precip);
  setCondition('dew', `${Math.round(result.dew.value)}°F`, result.dew);

  // Risks
  const riskList = $('#riskList');
  riskList.innerHTML = result.risks.map(r => `
    <div class="risk-item ${r.level}">
      <span class="risk-icon">${r.level === 'high' ? '🔴' : r.level === 'medium' ? '🟡' : '🟢'}</span>
      <div class="risk-content">
        <div class="risk-title">${r.title}</div>
        <div class="risk-desc">${r.desc}</div>
      </div>
    </div>
  `).join('');

  // Hourly
  const hourlyData = calculateHourlyScores(weather.hourly);
  const hourlyCards = $('#hourlyCards');
  hourlyCards.innerHTML = hourlyData.map(h => `
    <div class="hourly-card ${h.isCurrent ? 'current' : ''}">
      <span class="hourly-time">${h.isCurrent ? 'NOW' : h.time}</span>
      <span class="hourly-temp">${h.temp}°</span>
      <span class="hourly-humidity">💧 ${h.humidity}%</span>
      <span class="hourly-rain ${h.rainLevel}">☔ ${h.rainChance}%</span>
      <span class="hourly-score" style="background: ${h.scoreColor}22; color: ${h.scoreColor}">${h.scoreLabel}</span>
    </div>
  `).join('');

  // Tips
  const tipsList = $('#tipsList');
  tipsList.innerHTML = result.tips.map(t => `
    <div class="tip-item">
      <span class="tip-icon">${t.icon}</span>
      <span class="tip-text">${t.text}</span>
    </div>
  `).join('');

  // Show results
  hideLoading();
  resultsSection.classList.remove('hidden');
  resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function setCondition(id, value, data) {
  $(`#${id}Value`).textContent = value;
  const status = $(`#${id}Status`);
  status.textContent = data.text;

  const colorMap = { green: 'var(--green)', orange: 'var(--orange)', red: 'var(--red)' };
  const c = colorMap[data.color] || 'var(--gray)';
  status.style.color = c;
  $(`#${id}Indicator`).style.background = c;
}

// ================ MAIN FLOW ================

async function checkConditions(lat, lon, displayName) {
  showLoading();
  errorMsg.classList.add('hidden');
  searchSuggestions.classList.add('hidden');

  try {
    const weather = await fetchWeather(lat, lon);
    renderResults(displayName, weather);
  } catch (err) {
    hideLoading();
    showError('Failed to fetch weather data. Please try again.');
    console.error(err);
  }
}

// ================ EVENT HANDLERS ================

// Location input autocomplete
locationInput.addEventListener('input', () => {
  clearTimeout(debounceTimer);
  const query = locationInput.value.trim();

  if (query.length < 3) {
    searchSuggestions.classList.add('hidden');
    return;
  }

  debounceTimer = setTimeout(async () => {
    try {
      const results = await geocodeLocation(query);
      if (results.length === 0) {
        searchSuggestions.classList.add('hidden');
        return;
      }

      searchSuggestions.innerHTML = results.map((r, i) => `
        <div class="suggestion-item" data-index="${i}"
          data-lat="${r.lat}" data-lon="${r.lon}" data-name="${r.display_name}">
          📍 ${highlightMatch(r.display_name, query)}
        </div>
      `).join('');
      searchSuggestions.classList.remove('hidden');

      searchSuggestions.querySelectorAll('.suggestion-item').forEach(item => {
        item.addEventListener('click', () => {
          const lat = parseFloat(item.dataset.lat);
          const lon = parseFloat(item.dataset.lon);
          const name = item.dataset.name;
          locationInput.value = name;
          selectedCoords = { lat, lon, name };
          searchSuggestions.classList.add('hidden');
        });
      });
    } catch (err) {
      console.error('Geocoding error:', err);
    }
  }, 400);
});

function highlightMatch(text, query) {
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return text.slice(0, idx) + '<strong>' + text.slice(idx, idx + query.length) + '</strong>' + text.slice(idx + query.length);
}

// Check button
checkBtn.addEventListener('click', handleCheck);
locationInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') handleCheck();
});

async function handleCheck() {
  const query = locationInput.value.trim();
  if (!query) {
    showError('Enter a city, zip code, or address to check conditions.');
    return;
  }

  // If user selected from suggestions, use those coords
  if (selectedCoords && locationInput.value === selectedCoords.name) {
    const shortName = shortenName(selectedCoords.name);
    checkConditions(selectedCoords.lat, selectedCoords.lon, shortName);
    return;
  }

  // Otherwise geocode the input
  try {
    const results = await geocodeLocation(query);
    if (results.length === 0) {
      showError('Location not found. Try a different city or zip code.');
      return;
    }
    const r = results[0];
    const shortName = shortenName(r.display_name);
    checkConditions(parseFloat(r.lat), parseFloat(r.lon), shortName);
  } catch (err) {
    showError('Could not find that location. Please try again.');
  }
}

function shortenName(fullName) {
  const parts = fullName.split(',').map(s => s.trim());
  if (parts.length >= 3) {
    return `${parts[0]}, ${parts[1]}, ${parts[parts.length - 1]}`;
  }
  return fullName;
}

// Geolocation button
geoBtn.addEventListener('click', () => {
  if (!navigator.geolocation) {
    showError('Geolocation is not supported by your browser.');
    return;
  }

  geoBtn.style.color = 'var(--yellow)';
  locationInput.value = 'Detecting location...';

  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const { latitude, longitude } = pos.coords;
      try {
        const geo = await reverseGeocode(latitude, longitude);
        const name = shortenName(geo.display_name);
        locationInput.value = name;
        selectedCoords = { lat: latitude, lon: longitude, name };
        geoBtn.style.color = '';
        checkConditions(latitude, longitude, name);
      } catch {
        locationInput.value = '';
        geoBtn.style.color = '';
        showError('Could not determine your location name.');
      }
    },
    () => {
      locationInput.value = '';
      geoBtn.style.color = '';
      showError('Location access denied. Please enter your location manually.');
    },
    { timeout: 10000 }
  );
});

// New check button
$('#newCheckBtn').addEventListener('click', () => {
  resultsSection.classList.add('hidden');
  locationInput.value = '';
  selectedCoords = null;
  // Reset gauge
  $('#gaugeCircle').style.strokeDashoffset = 534;
  heroSection.scrollIntoView({ behavior: 'smooth' });
  locationInput.focus();
});

// Close suggestions on outside click
document.addEventListener('click', (e) => {
  if (!e.target.closest('.search-box') && !e.target.closest('.search-suggestions')) {
    searchSuggestions.classList.add('hidden');
  }
});

// Set initial date
$('#scoreDate').textContent = new Date().toLocaleDateString('en-US', {
  weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
});
