import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Polygon, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';

// ---------------------------------------------------------------------------
// Fix for a common Leaflet + bundler gotcha: the default marker icon images
// don't load correctly with Vite/webpack unless we point Leaflet at the
// image URLs ourselves. Without this, markers render as broken images.
// ---------------------------------------------------------------------------
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

const MAX_POINTS = 4;

/**
 * Numbered "arrow" marker: a circle badge with the point number, sitting
 * on top of a downward-pointing arrowhead whose TIP lands exactly on the
 * clicked coordinate (iconAnchor points at the tip, not the badge center).
 */
function createArrowIcon(number) {
  const html = `
    <svg width="36" height="46" viewBox="0 0 36 46" xmlns="http://www.w3.org/2000/svg">
      <circle cx="18" cy="14" r="13" fill="#2f6b3a" stroke="#ffffff" stroke-width="2.5"/>
      <text x="18" y="19" text-anchor="middle" font-size="13" font-weight="700" fill="#ffffff" font-family="sans-serif">${number}</text>
      <path d="M18 27 L27 42 L9 42 Z" fill="#2f6b3a" stroke="#ffffff" stroke-width="1.5"/>
    </svg>
  `;
  return L.divIcon({
    html,
    className: 'arrow-marker-icon', // empty class needed to strip Leaflet's default white-box styling
    iconSize: [36, 46],
    iconAnchor: [18, 42], // tip of the arrow = the actual clicked point
  });
}

/**
 * Small helper component: react-leaflet requires map click handlers to be
 * registered via this hook, used *inside* the <MapContainer>.
 */
function ClickHandler({ onMapClick }) {
  useMapEvents({
    click(e) {
      onMapClick([e.latlng.lat, e.latlng.lng]);
    },
  });
  return null;
}

/**
 * Once all 4 points are placed, zoom/pan the map to fit the polygon
 * neatly in view instead of leaving the user zoomed on their last click.
 */
function FitBoundsOnComplete({ points }) {
  const map = useMap();

  useEffect(() => {
    if (points.length === MAX_POINTS) {
      const bounds = L.latLngBounds(points);
      map.fitBounds(bounds, { padding: [30, 30] });
    }
  }, [points, map]);

  return null;
}

/**
 * FieldMap
 * --------
 * Props:
 *   points        - array of [lat, lng] pairs already placed (0 to 4)
 *   onPointsChange - callback(newPointsArray) called whenever a point is added
 *   center         - [lat, lng] initial map center
 */
export default function FieldMap({ points, onPointsChange, center }) {
  const [mapType, setMapType] = useState('street'); // 'street' | 'satellite'

  function handleMapClick(newPoint) {
    if (points.length >= MAX_POINTS) return; // already have 4 corners
    onPointsChange([...points, newPoint]);
  }

  return (
    <div style={{ position: 'relative', height: '100%', width: '100%' }}>
      {/* Plainly visible Street/Satellite toggle, overlaid top-right on
          the map. (Replaces Leaflet's default LayersControl icon, which
          is a small corner icon that's easy to miss — especially on
          mobile.) */}
      <div className="map-type-toggle">
        <button
          type="button"
          className={mapType === 'street' ? 'active' : ''}
          onClick={() => setMapType('street')}
        >
          Street
        </button>
        <button
          type="button"
          className={mapType === 'satellite' ? 'active' : ''}
          onClick={() => setMapType('satellite')}
        >
          Satellite
        </button>
      </div>

      <MapContainer
        center={center}
        zoom={13}
        style={{ height: '100%', width: '100%' }}
      >
        {mapType === 'street' ? (
          <TileLayer
            attribution='&copy; OpenStreetMap contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
        ) : (
          <TileLayer
            attribution='Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics'
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          />
        )}

        <ClickHandler onMapClick={handleMapClick} />
        <FitBoundsOnComplete points={points} />

        {/* One numbered arrow marker per clicked point */}
        {points.map((point, index) => (
          <Marker key={index} position={point} icon={createArrowIcon(index + 1)} />
        ))}

        {/* Only draw the outline once all 4 corners are known —
            this avoids drawing a partial/wrong shape while the user
            is still clicking. */}
        {points.length === MAX_POINTS && (
          <Polygon
            positions={points}
            pathOptions={{ color: '#2f6b3a', weight: 3, fillOpacity: 0.15 }}
          />
        )}
      </MapContainer>
    </div>
  );
}
