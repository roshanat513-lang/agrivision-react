import { useState } from 'react';
import FieldMap from './components/FieldMap.jsx';

/* =============================================================
   CONFIG — this is your deployed AWS backend, not a local file.
   =============================================================
   Open http://13.49.238.72:8000/docs, expand
   POST /api/crop-health/analyze, and click "Try it out" to see
   the exact JSON keys it expects. The code below assumes it
   wants the field polygon as a list of [lat, lng] pairs under
   the key "polygon" — rename that key in buildRequestBody()
   below if your live schema uses something else.
============================================================= */
const API_BASE_URL = 'http://13.49.238.72:8000';
const ANALYZE_ENDPOINT = '/api/crop-health/analyze';

const MAX_POINTS = 4;
const DEFAULT_CENTER = [13.0827, 80.2707]; // Chennai — change to your area

function buildRequestBody(points, startDate, endDate) {
  const body = {
    // Confirmed against the live Swagger "Try it out" example — each
    // corner is an object with latitude/longitude, not a [lat, lng] pair.
    polygon: points.map(([lat, lng]) => ({ latitude: lat, longitude: lng })),
  };

  // The backend now takes only an explicit start_date/end_date pair —
  // there is no other date field anywhere in the API. Only include a
  // key when the user actually picked that date, so an empty field
  // doesn't send an invalid empty string.
  if (startDate) {
    body.start_date = startDate;
  }
  if (endDate) {
    body.end_date = endDate;
  }

  return body;
}
function fieldCenter(points) {
  const lat = points.reduce((sum, p) => sum + p[0], 0) / points.length;
  const lng = points.reduce((sum, p) => sum + p[1], 0) / points.length;
  return { lat, lng };
}
function generateWeatherAdvisory(pastDays, current, futureDays) {
  if (!Array.isArray(pastDays) || pastDays.length === 0 || !current || !Array.isArray(futureDays) || futureDays.length === 0) {
    return null;
  }

  const sum = (arr, key) => arr.reduce((s, d) => s + (Number(d[key]) || 0), 0);
  const avg = (arr, key) => sum(arr, key) / arr.length;

  const pastRainTotal = sum(pastDays, 'precipitation_mm');
  const futureRainTotal = sum(futureDays, 'precipitation_mm');
  const pastAvgMax = avg(pastDays, 'temperature_max_c');
  const futureAvgMax = avg(futureDays, 'temperature_max_c');

  const lines = [];
  lines.push(
    `Past 3 days total rainfall: ${pastRainTotal.toFixed(1)} mm. Next 3 days expected: ${futureRainTotal.toFixed(1)} mm.`
  );

  if (futureRainTotal >= 20) {
    lines.push(
      'Significant rain expected in the next 3 days — consider delaying irrigation, fertilizer, or pesticide application until after it passes.'
    );
  } else if (pastRainTotal < 5 && futureRainTotal < 5) {
    lines.push(
      'Little rain in the past 3 days and little expected ahead — the field may be entering a dry spell; consider irrigating soon.'
    );
  } else {
    lines.push('Rainfall levels look moderate; maintain your normal irrigation schedule.');
  }

  if (futureAvgMax >= 38) {
    lines.push(
      `High temperatures expected ahead (avg max ${futureAvgMax.toFixed(1)}°C) — watch for heat stress, especially if soil moisture is also low.`
    );
  }

  if (futureAvgMax - pastAvgMax >= 4) {
    lines.push('Temperatures are trending noticeably warmer over the next 3 days compared to the past 3.');
  } else if (pastAvgMax - futureAvgMax >= 4) {
    lines.push('Temperatures are trending noticeably cooler over the next 3 days compared to the past 3.');
  }

  return lines.join('\n');
}
export default function App() {
  const [points, setPoints] = useState([]);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [status, setStatus] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState(null);

  const readyToAnalyze = points.length === MAX_POINTS;

  function handlePointsChange(newPoints) {
    setPoints(newPoints);
    setResult(null);
    if (newPoints.length < MAX_POINTS) {
      setStatus(`${newPoints.length} of ${MAX_POINTS} points placed.`);
    } else {
      setStatus('Field marked. Ready to analyze.');
    }
  }

  function handleReset() {
    setPoints([]);
    setResult(null);
    setStatus('');
  }

  async function handleAnalyze() {
    setIsLoading(true);
    setStatus('Analyzing... this can take a few seconds.');
    setResult(null);

    try {
      const response = await fetch(API_BASE_URL + ANALYZE_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildRequestBody(points, startDate, endDate)),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        // FastAPI validation errors (422) include a "detail" array telling
        // you exactly which field was missing/invalid — show it instead of
        // just the status code.
        const detail = data ? JSON.stringify(data.detail ?? data, null, 2) : '(no response body)';
        setStatus(`Server responded with status ${response.status}. See details below.`);
        setResult(data);
        console.error('API error response:', data);
        return;
      }
            // Bonus: fetch the last 3 days of weather too, using the confirmed
      // separate GET /api/weather endpoint (supports an explicit
      // start_date/end_date range, including past dates — unlike
      // /api/crop-health/analyze, which only ever returns today + future
      // days). There is no separate "forecast_days" field anymore — the
      // range is just start_date..end_date.
      try {
        const { lat, lng } = fieldCenter(points);
        const threeDaysAgo = new Date();
        threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
        const pastStart = threeDaysAgo.toISOString().slice(0, 10);
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const pastEnd = yesterday.toISOString().slice(0, 10);
        const pastRes = await fetch(
          `${API_BASE_URL}/api/weather?latitude=${lat}&longitude=${lng}&start_date=${pastStart}&end_date=${pastEnd}`
        );
        const pastData = await pastRes.json().catch(() => null);
        if (pastRes.ok && Array.isArray(pastData?.days)) {
          data.weather_past = pastData.days;
        }
      } catch (err) {
        console.warn('Past weather fetch failed (non-fatal):', err);
      }
   
      setResult(data);
      setStatus('Done.');
    } catch (err) {
      // Common beginner causes:
      // 1. CORS — the FastAPI backend must allow this page's origin
      //    (add CORSMiddleware with allow_origins=["*"] for testing).
      // 2. The "polygon" key doesn't match the real request schema.
      // 3. The EC2 instance/server isn't running right now.
      setStatus('Something went wrong: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>AgriVision AI — Crop Health Monitor</h1>
        <p>Mark a field on the map, then run the health check.</p>
      </header>

      <div className="layout">
        <div className="map-wrapper">
          <FieldMap
            points={points}
            onPointsChange={handlePointsChange}
            center={DEFAULT_CENTER}
          />
        </div>

        <aside className="panel">
          <h2>1. Mark your field</h2>
          <p className="instructions">
            Click on the map to drop <strong>4 corner points</strong> around
            your field. The outline is drawn once all 4 are placed.
          </p>
          <ol className="point-list">
            {points.map((p, i) => (
              <li key={i}>
                Lat {p[0].toFixed(5)}, Lng {p[1].toFixed(5)}
              </li>
            ))}
          </ol>
          <button className="btn btn-primary" onClick={handleReset}>
            Draw 4-point area
          </button>
          <button className="btn btn-secondary" onClick={handleReset}>
            Clear area
          </button>

          <h2 style={{ marginTop: 24 }}>2. Analysis Controls</h2>
          <p className="instructions">Optional — leave blank to use the most recent cloud-free scene.</p>

          <label>Start date</label>
          <input
            type="date"
            className="date-input"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            max={new Date().toISOString().slice(0, 10)}
          />

          <label style={{ marginTop: 12, display: 'block' }}>End date</label>
          <input
            type="date"
            className="date-input"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            max={new Date().toISOString().slice(0, 10)}
          />

          <h2 style={{ marginTop: 24 }}>3. Run analysis</h2>
          <button
            className="btn btn-primary"
            onClick={handleAnalyze}
            disabled={!readyToAnalyze || isLoading}
          >
            {isLoading ? 'Analyzing…' : 'Analyze Crop Health'}
          </button>

          {status && <p className="status">{status}</p>}

          {result && <ResultsPanel data={result} />}
        </aside>
      </div>
    </div>
  );
}

/**
 * Shows the API response, matching the CONFIRMED real response shape:
 * polygon, area_acres, average_ndvi, min_ndvi, max_ndvi,
 * valid_pixel_fraction, health_status, vegetation_density, confidence,
 * ndvi_image, scene_date, cloud_coverage_pct, next_expected_pass,
 * llm_analysis, weather. (field_name has been removed from the API.)
 */
function ResultsPanel({ data }) {
  // ndvi_image comes back as a path RELATIVE to the backend server, e.g.
  // "outputs/ndvi_images/ndvi_map_....png" — not a full URL. This assumes
  // the FastAPI server serves that "outputs/" folder as static files at
  // the same path (e.g. via StaticFiles). If the image below shows a
  // broken-image message instead of the heatmap, that means the backend
  // isn't serving that folder yet — it needs a line roughly like:
  //   app.mount("/outputs", StaticFiles(directory="outputs"), name="outputs")
  const ndviImageUrl = data.ndvi_image ? `${API_BASE_URL}/${data.ndvi_image}` : null;

  return (
    <div className="results">
      {data.llm_analysis && (
  <>
    <h3>Advisory</h3>
    {data.area_acres !== undefined && (
      <p><strong>Field Area:</strong> {data.area_acres} acres</p>
    )}
    <p style={{ whiteSpace: 'pre-wrap' }}>{data.llm_analysis}</p>
  </>
)}

      <h3>NDVI Summary</h3>
      <dl className="stat-grid">
        {data.health_status !== undefined && (
          <>
            <dt>Health status</dt>
            <dd>{data.health_status}</dd>
          </>
        )}
        {data.average_ndvi !== undefined && (
          <>
            <dt>Average NDVI</dt>
            <dd>{data.average_ndvi}</dd>
          </>
        )}
        {data.vegetation_density !== undefined && (
          <>
            <dt>Vegetation density</dt>
            <dd>{data.vegetation_density}</dd>
          </>
        )}
        {data.area_acres !== undefined && (
          <>
            <dt>Area</dt>
            <dd>{data.area_acres} acres</dd>
          </>
        )}
        {data.confidence !== undefined && (
          <>
            <dt>Confidence</dt>
            <dd>{data.confidence}</dd>
          </>
        )}
        {data.scene_date && (
          <>
            <dt>Scene date</dt>
            <dd>{data.scene_date}</dd>
          </>
        )}
        {data.cloud_coverage_pct !== undefined && (
          <>
            <dt>Cloud cover</dt>
            <dd>{data.cloud_coverage_pct}%</dd>
          </>
        )}
        {data.next_expected_pass && (
          <>
            <dt>Next pass</dt>
            <dd>{data.next_expected_pass}</dd>
          </>
        )}
      </dl>

      {ndviImageUrl && (
        <>
          <h3>NDVI Heatmap</h3>
          <NdviImage src={ndviImageUrl} />
        </>
      )}

     {data.weather && (
    <>
    <h3>Current Weather ({data.weather.date})</h3>
    <table className="weather-table">
      <tbody>
        <tr><td>Condition</td><td>{data.weather.weather_condition ?? '-'}</td></tr>
        <tr><td>Max Temp</td><td>{data.weather.temperature_max_c}°C</td></tr>
        <tr><td>Min Temp</td><td>{data.weather.temperature_min_c}°C</td></tr>
        <tr><td>Humidity</td><td>{data.weather.humidity_pct}%</td></tr>
        <tr><td>Precipitation</td><td>{data.weather.precipitation_mm} mm</td></tr>
        <tr><td>Wind Speed</td><td>{data.weather.wind_speed_max_kmh} km/h</td></tr>
      </tbody>
    </table>
  </>
)}

{Array.isArray(data.weather_forecast) && data.weather_forecast.length > 0 && (
  <>
    <h3>Weather Forecast (next 3 days)</h3>
    <div style={{ overflowX: 'auto' }}>
      <table className="weather-table">
        <thead>
          <tr>
            <th>Date</th>
            {data.weather_forecast.slice(0, 3).map((day) => <th key={day.date}>{day.date}</th>)}
          </tr>
        </thead>
        <tbody>
          <tr><td>Max Temp (°C)</td>{data.weather_forecast.slice(0, 3).map((day) => <td key={day.date}>{day.temperature_max_c}</td>)}</tr>
          <tr><td>Min Temp (°C)</td>{data.weather_forecast.slice(0, 3).map((day) => <td key={day.date}>{day.temperature_min_c}</td>)}</tr>
          <tr><td>Precipitation (mm)</td>{data.weather_forecast.slice(0, 3).map((day) => <td key={day.date}>{day.precipitation_mm}</td>)}</tr>
          <tr><td>Humidity (%)</td>{data.weather_forecast.slice(0, 3).map((day) => <td key={day.date}>{day.humidity_pct}</td>)}</tr>
          <tr><td>Condition</td>{data.weather_forecast.slice(0, 3).map((day) => <td key={day.date}>{day.weather_condition ?? '-'}</td>)}</tr>
        </tbody>
      </table>
    </div>
  </>
)}
{Array.isArray(data.weather_past) && data.weather_past.length > 0 && (
  <>
    <h3>Past 3 Days Weather</h3>
    <div style={{ overflowX: 'auto' }}>
      <table className="weather-table">
        <thead>
          <tr>
            <th>Date</th>
            {data.weather_past.map((day) => <th key={day.date}>{day.date}</th>)}
          </tr>
        </thead>
        <tbody>
          <tr><td>Max Temp (°C)</td>{data.weather_past.map((day) => <td key={day.date}>{day.temperature_max_c}</td>)}</tr>
          <tr><td>Min Temp (°C)</td>{data.weather_past.map((day) => <td key={day.date}>{day.temperature_min_c}</td>)}</tr>
          <tr><td>Precipitation (mm)</td>{data.weather_past.map((day) => <td key={day.date}>{day.precipitation_mm}</td>)}</tr>
          <tr><td>Humidity (%)</td>{data.weather_past.map((day) => <td key={day.date}>{day.humidity_pct}</td>)}</tr>
          <tr><td>Condition</td>{data.weather_past.map((day) => <td key={day.date}>{day.weather_condition ?? '-'}</td>)}</tr>
        </tbody>
      </table>
    </div>
  </>
)}
{Array.isArray(data.soil_layers) && data.soil_layers.length > 0 && (
  <>
    <h3>Soil Information (by depth)</h3>
    <div style={{ overflowX: 'auto' }}>
      <table className="weather-table">
        <thead>
          <tr>
            <th>Depth</th>
            {data.soil_layers.map((layer) => <th key={layer.depth_cm}>{layer.depth_cm}</th>)}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Moisture (m³/m³)</td>
            {data.soil_layers.map((layer) => <td key={layer.depth_cm}>{layer.soil_moisture_m3m3}</td>)}
          </tr>
          <tr>
            <td>Temperature (°C)</td>
            {data.soil_layers.map((layer) => <td key={layer.depth_cm}>{layer.soil_temperature_c ?? '-'}</td>)}
          </tr>
        </tbody>
      </table>
    </div>
  </>
)}

      <h3>Full raw response</h3>
      <pre>{JSON.stringify(data, null, 2)}</pre>
    </div>
  );
}

/** Renders the NDVI heatmap, with a clear message if the backend
 * isn't serving that path yet (rather than a silent broken-image icon). */
function NdviImage({ src }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <p className="ndvi-image-error">
        Couldn't load the NDVI image from {src} — the backend likely isn't
        serving its "outputs" folder as static files yet.
      </p>
    );
  }

  return (
    <img
      src={src}
      alt="NDVI heatmap"
      className="ndvi-image"
      onError={() => setFailed(true)}
    />
  );
}
