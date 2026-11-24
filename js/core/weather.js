/* Clima de General Rodríguez (Open-Meteo, sin clave). */
const LAT = -34.61;
const LON = -58.95;
const CACHE_KEY = 'zuma.gr.weather.v1';
const CACHE_MS = 15 * 60 * 1000;

const WEATHER = {
  0: ['Despejado', 'sun'], 1: ['Mayormente despejado', 'sun'], 2: ['Parcialmente nublado', 'cloud-sun'],
  3: ['Nublado', 'cloud'], 45: ['Neblina', 'cloud'], 48: ['Niebla', 'cloud'],
  51: ['Llovizna leve', 'rain'], 53: ['Llovizna', 'rain'], 55: ['Llovizna intensa', 'rain'],
  61: ['Lluvia leve', 'rain'], 63: ['Lluvia', 'rain'], 65: ['Lluvia fuerte', 'rain'],
  71: ['Nieve leve', 'snow'], 73: ['Nieve', 'snow'], 75: ['Nieve fuerte', 'snow'],
  80: ['Chaparrones', 'rain'], 81: ['Chaparrones', 'rain'], 82: ['Chaparrones fuertes', 'rain'],
  95: ['Tormenta', 'storm'], 96: ['Tormenta con granizo', 'storm'], 99: ['Tormenta fuerte', 'storm'],
};

function describe(code) {
  return WEATHER[code] || ['Clima variable', 'cloud-sun'];
}

export async function fetchGeneralRodriguezWeather() {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (raw) {
      const cached = JSON.parse(raw);
      if (Date.now() - cached.at < CACHE_MS && cached.data) return cached.data;
    }
  } catch { /* noop */ }

  const url = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}`
    + '&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m'
    + '&daily=temperature_2m_max,temperature_2m_min,weather_code,sunrise,sunset'
    + '&timezone=America%2FArgentina%2FBuenos_Aires&forecast_days=1';
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error('clima');
  const json = await res.json();
  const current = json.current || {};
  const daily = json.daily || {};
  const [label, icon] = describe(Number(current.weather_code));
  const data = {
    temp: Math.round(Number(current.temperature_2m)),
    feels: Math.round(Number(current.apparent_temperature)),
    humidity: Math.round(Number(current.relative_humidity_2m)),
    wind: Math.round(Number(current.wind_speed_10m)),
    precipitation: Number(current.precipitation) || 0,
    isDay: Boolean(current.is_day),
    code: Number(current.weather_code),
    label,
    icon,
    max: Math.round(Number(daily.temperature_2m_max?.[0])),
    min: Math.round(Number(daily.temperature_2m_min?.[0])),
    sunrise: daily.sunrise?.[0] || '',
    sunset: daily.sunset?.[0] || '',
    updated: new Date().toISOString(),
  };
  try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), data })); } catch { /* noop */ }
  return data;
}
