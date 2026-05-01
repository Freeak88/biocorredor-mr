import React, { useMemo, useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import L from 'leaflet';
import { getFileURL } from '../lib/pb';
import { Sighting, UserProfile } from '../types';
import WeatherBadge from './WeatherBadge';
import type { ViewportBounds } from '../hooks/useGeoQuery';

const DefaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

// ── Layer toggles type ──
interface LayerToggles {
  showGbif: boolean;
  showMine: boolean;
  showOthers: boolean;
}

// ── Islas Malvinas overlay — covers colonial name with Argentine toponym ──
function MalvinasOverlay() {
  const map = useMapEvents({});
  const [zoom, setZoom] = useState(map.getZoom());

  useEffect(() => {
    const onZoom = () => setZoom(map.getZoom());
    map.on('zoomend', onZoom);
    return () => { map.off('zoomend', onZoom); };
  }, [map]);

  // Only show when zoomed in enough to see the islands (zoom >= 5)
  if (zoom < 5) return null;

  // Scale label size with zoom
  const fontSize = zoom <= 6 ? 11 : zoom <= 8 ? 13 : zoom <= 10 ? 15 : 17;
  const bgWidth = zoom <= 6 ? 120 : zoom <= 8 ? 150 : zoom <= 10 ? 180 : 200;
  const bgHeight = fontSize + 10;

  // The colonial text appears at ~[-51.7, -59.0] at various zoom levels
  // Cover with a rectangle + label
  const center: [number, number] = [-51.75, -59.0];

  return (
    <>
      {/* Background rectangle to cover colonial text */}
      <Marker
        position={center}
        icon={L.divIcon({
          className: 'malvinas-cover',
          html: `<div style="
            width:${bgWidth}px;
            height:${bgHeight}px;
            background:#f5f0e8;
            border-radius:3px;
            border:1px solid #d4d0c8;
            display:flex;
            align-items:center;
            justify-content:center;
            font-family:serif;
            font-style:italic;
            font-weight:700;
            font-size:${fontSize}px;
            color:#2c2c2c;
            white-space:nowrap;
            box-shadow:0 1px 4px rgba(0,0,0,0.1);
          ">Islas Malvinas</div>`,
          iconSize: [bgWidth, bgHeight],
          iconAnchor: [bgWidth / 2, bgHeight / 2]
        })}
        interactive={false}
        keyboard={false}
      />
    </>
  );
}

interface MapViewProps {
  filteredSightings: Sighting[];
  onlineUsers: UserProfile[];
  isAddingMode: boolean;
  setIsAddingMode: (v: boolean) => void;
  setNewSightingPos: (pos: [number, number] | null) => void;
  setShowModal: (v: boolean) => void;
  userLocation: [number, number] | null;
  mapCentered: boolean;
  setMapCentered: (v: boolean) => void;
  newSightingPos: [number, number] | null;
  onSightingClick: (s: Sighting) => void;
  layerToggles: LayerToggles;
  updateLayerToggle: <K extends keyof LayerToggles>(key: K, value: LayerToggles[K]) => void;
  onBoundsChange: (bounds: ViewportBounds | null) => void;
}

// ── Global click handler for popup buttons (Leaflet popups break React event delegation) ──
let globalClickInstalled = false;
let globalClickCallback: ((s: Sighting) => void) | null = null;

function installGlobalPopupClick() {
  if (globalClickInstalled) return;
  globalClickInstalled = true;
  document.addEventListener('click', (e: MouseEvent) => {
    const target = (e.target as HTMLElement)?.closest('.sighting-action-btn');
    if (!target) return;
    e.stopPropagation();
    e.preventDefault();
    const raw = target.getAttribute('data-sighting');
    if (raw && globalClickCallback) {
      try {
        const sighting = JSON.parse(raw);
        globalClickCallback(sighting);
      } catch (err) {
        console.error('PopupClick parse error', err);
      }
    }
  }, true); // capture phase to beat Leaflet's handler
}

function PopupClickHandler({ onSightingClick }: { onSightingClick: (s: Sighting) => void }) {
  useEffect(() => {
    globalClickCallback = onSightingClick;
    installGlobalPopupClick();
    return () => { globalClickCallback = null; };
  }, [onSightingClick]);
  return null;
}

function LocationMarker({
  isAddingMode,
  setIsAddingMode,
  setNewSightingPos,
  setShowModal,
  userLocation,
  mapCentered,
  setMapCentered,
  newSightingPos,
  onBoundsChange
}: {
  isAddingMode: boolean;
  setIsAddingMode: (v: boolean) => void;
  setNewSightingPos: (pos: [number, number] | null) => void;
  setShowModal: (v: boolean) => void;
  userLocation: [number, number] | null;
  mapCentered: boolean;
  setMapCentered: (v: boolean) => void;
  newSightingPos: [number, number] | null;
  onBoundsChange: (bounds: ViewportBounds | null) => void;
}) {
  const publishBounds = (map: L.Map) => {
    const bounds = map.getBounds();
    onBoundsChange({
      northEast: { lat: bounds.getNorthEast().lat, lng: bounds.getNorthEast().lng },
      southWest: { lat: bounds.getSouthWest().lat, lng: bounds.getSouthWest().lng },
    });
  };

  const map = useMapEvents({
    click(e) {
      if (isAddingMode) {
        setNewSightingPos([e.latlng.lat, e.latlng.lng]);
        setIsAddingMode(false);
        setShowModal(true);
      }
    },
    moveend() {
      publishBounds(map);
    },
    zoomend() {
      publishBounds(map);
    },
  });

  useEffect(() => {
    publishBounds(map);
  }, [map]);

  useEffect(() => {
    if (userLocation && !mapCentered) {
      map.setView(userLocation, 15);
      setMapCentered(true);
    }
  }, [userLocation, map, mapCentered, setMapCentered]);

  return (
    <>
      {newSightingPos && (
        <Marker position={newSightingPos}>
          <Popup autoPan={false}>Ubicación seleccionada</Popup>
        </Marker>
      )}
      {userLocation && (
        <Marker
          position={userLocation}
          icon={L.divIcon({
            className: 'user-marker-icon',
            html: `<div class="user-location-pulse"></div>`,
            iconSize: [20, 20],
            iconAnchor: [10, 10]
          })}
        />
      )}
    </>
  );
}

// ── Layer toggle panel ──
function LayerTogglePanel({
  toggles,
  onChange,
}: {
  toggles: LayerToggles;
  onChange: <K extends keyof LayerToggles>(key: K, value: LayerToggles[K]) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="layer-toggle-panel">
      <button
        className="layer-toggle-btn"
        onClick={() => setOpen(!open)}
        title="Capas del mapa"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
          <polygon points="12 2 2 7 12 12 22 7 12 2" />
          <polyline points="2 17 12 22 22 17" />
          <polyline points="2 12 12 17 22 12" />
        </svg>
      </button>
      {open && (
        <div className="layer-toggle-menu">
          <p className="layer-toggle-title">CAPAS</p>
          <label className="layer-toggle-item">
            <input
              type="checkbox"
              checked={toggles.showGbif}
              onChange={e => onChange('showGbif', e.target.checked)}
            />
            <span className="layer-toggle-label">Registros GBIF</span>
            <span className="layer-toggle-dot gbif-dot" />
          </label>
          <label className="layer-toggle-item">
            <input
              type="checkbox"
              checked={toggles.showMine}
              onChange={e => onChange('showMine', e.target.checked)}
            />
            <span className="layer-toggle-label">Mis avistamientos</span>
            <span className="layer-toggle-dot mine-dot" />
          </label>
          <label className="layer-toggle-item">
            <input
              type="checkbox"
              checked={toggles.showOthers}
              onChange={e => onChange('showOthers', e.target.checked)}
            />
            <span className="layer-toggle-label">De otros</span>
            <span className="layer-toggle-dot other-dot" />
          </label>
        </div>
      )}
    </div>
  );
}

export default function MapView({
  filteredSightings,
  onlineUsers,
  isAddingMode,
  setIsAddingMode,
  setNewSightingPos,
  setShowModal,
  userLocation,
  mapCentered,
  setMapCentered,
  newSightingPos,
  onSightingClick,
  layerToggles,
  updateLayerToggle,
  onBoundsChange,
}: MapViewProps) {
  // ── Separate GBIF vs user markers ──
  const { gbif: gbifMarkers, user: sightingUserMarkers } = useMemo(() => {
    const gbif: Sighting[] = [];
    const user: Sighting[] = [];
    for (const s of filteredSightings) {
      if (s.isGbif) gbif.push(s);
      else user.push(s);
    }
    return { gbif, user };
  }, [filteredSightings]);

  // ── Unified marker renderer ──
  const renderSightingMarker = (s: Sighting, isGbif: boolean) => {
    const name = s.mushroomName || s.mushroom_name || '';
    const species = s.species || '';
    const imgUrl = s.imageUrl || s.gbif_image_url || '';
    const dateStr = s.event_date
      ? new Date(s.event_date).toLocaleDateString('es-AR')
      : (s.created ? new Date(s.created).toLocaleDateString('es-AR') : '');
    const observer = s.recorded_by || s.userName || '';
    const locality = [s.locality, s.state_province, s.country].filter(Boolean).join(', ');
    const taxonomy = [s.phylum, s.taxon_class, s.taxon_order, s.family, s.genus].filter(Boolean).join(' › ');

    // Marker icon — same mushroom style, GBIF gets a subtle badge
    const markerIcon = L.divIcon({
      className: 'mushroom-marker',
      html: `
        <div class="relative flex items-center justify-center">
          <div class="absolute w-8 h-8 rounded-full border-2 ${isGbif ? 'border-atlas-earth' : 'border-atlas-ink'} bg-atlas-paper shadow-md flex items-center justify-center overflow-hidden">
            ${imgUrl
              ? `<img src="${imgUrl}" class="w-full h-full object-cover" referrerpolicy="no-referrer" onerror="this.style.display='none';this.nextElementSibling.style.display='block'" /><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4 text-atlas-ink" style="display:none"><path d="M7 20h10a2 2 0 0 0 2-2c0-3.31-2.69-6-6-6s-6 2.69-6 6a2 2 0 0 0 2 2z"/><path d="M12 12V4"/></svg>`
              : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4 text-atlas-ink"><path d="M7 20h10a2 2 0 0 0 2-2c0-3.31-2.69-6-6-6s-6 2.69-6 6a2 2 0 0 0 2 2z"/><path d="M12 12V4"/></svg>`
            }
          </div>
          ${isGbif ? '<div class="absolute -top-1 -right-1 w-3 h-3 bg-atlas-earth rounded-full border border-atlas-paper" title="GBIF"></div>' : ''}
        </div>
      `,
      iconSize: [32, 32],
      iconAnchor: [16, 16]
    });

    return (
      <Marker key={s.id} position={[s.lat, s.lng]} icon={markerIcon}>
        <Popup autoPan={false}>
          <div className="w-56 font-serif p-2">
            {/* GBIF badge */}
            {isGbif && (
              <p className="text-[8px] font-sans font-black text-atlas-earth uppercase tracking-widest mb-1">{s.sourceName || 'Registro GBIF'}</p>
            )}

            {/* Photo */}
            {imgUrl && (
              <img
                src={imgUrl}
                alt={species || name}
                className="w-full h-32 object-cover rounded-sm mb-2"
                referrerPolicy="no-referrer"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            )}

            {/* Name */}
            <h3 className="text-sm italic font-bold text-atlas-ink m-0 leading-tight border-b border-atlas-ink/10 pb-2">
              {species || name}
            </h3>

            {/* Details */}
            <div className="mt-2 space-y-1">
              {taxonomy && (
                <p className="text-[10px] font-sans text-atlas-ink/60 m-0">
                  <span className="font-bold">Taxonomía:</span> {taxonomy}
                </p>
              )}
              {locality && (
                <p className="text-[10px] font-sans text-atlas-ink/60 m-0">
                  <span className="font-bold">Ubicación:</span> {locality}
                </p>
              )}
              {dateStr && (
                <p className="text-[10px] font-sans text-atlas-ink/60 m-0">
                  <span className="font-bold">Fecha:</span> {dateStr}
                </p>
              )}
              {observer && (
                <p className="text-[10px] font-sans text-atlas-ink/60 m-0">
                  <span className="font-bold">Observador:</span> {observer}
                </p>
              )}
              {s.toxicity && s.toxicity !== 'Desconocido' && (
                <p className="text-[10px] font-sans text-atlas-ink/60 m-0">
                  <span className="font-bold">Toxicidad:</span> {s.toxicity}
                </p>
              )}
            </div>

            {/* Weather context */}
            <WeatherBadge weather={s.weather_context} />

            {/* Action buttons */}
            <div className="mt-2 space-y-1">
              {!isGbif && (
                <button
                  className="sighting-action-btn w-full text-center py-2 text-[10px] font-sans font-black uppercase tracking-widest border border-atlas-ink/10 bg-atlas-paper hover:bg-atlas-stone transition-colors"
                  data-sighting-id={s.id}
                  data-lat={s.lat}
                  data-lng={s.lng}
                  data-sighting={JSON.stringify({ id: s.id, mushroom_name: s.mushroom_name, mushroomName: s.mushroomName, description: s.description, toxicity: s.toxicity, lat: s.lat, lng: s.lng, habitat: s.habitat, features: s.features, images: s.images, status: s.status, user: typeof s.user === 'string' ? s.user : s.userId, isGbif: false, weather_context: s.weather_context, elevation: s.elevation, phylum: s.phylum, taxon_class: s.taxon_class, taxon_order: s.taxon_order, family: s.family, genus: s.genus, species: s.species, event_date: s.event_date, locality: s.locality, state_province: s.state_province, country: s.country, recorded_by: s.recorded_by, created: s.created, network_id: s.network_id, imageUrl: s.imageUrl, userName: s.userName, userId: s.userId })}
                >
                  Consultar Archivo
                </button>
              )}
              {isGbif && (s.gbifUrl || s.moUrl) && (
                <a
                  href={s.moUrl || s.gbifUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full text-center py-2 text-[9px] font-sans font-black uppercase tracking-widest border border-atlas-ink/10 bg-atlas-stone hover:bg-atlas-ink hover:text-atlas-paper transition-colors"
                >
                  {s.sourceName ? `Ver en ${s.sourceName} →` : 'Ver en GBIF →'}
                </a>
              )}
            </div>
          </div>
        </Popup>
      </Marker>
    );
  };

  const sightingMarkers = useMemo(() => (
    sightingUserMarkers.map(s => renderSightingMarker(s, false))
  ), [sightingUserMarkers, onSightingClick]);

  const gbifMarkerElements = useMemo(() => (
    gbifMarkers.map(s => renderSightingMarker(s, true))
  ), [gbifMarkers]);



  const onlineUserMarkers = useMemo(() => (
    onlineUsers.map(u => {
      const lat = u.location?.lat ?? u.last_lat;
      const lng = u.location?.lng ?? u.last_lng;
      if (lat == null || lng == null) return null;
      const displayName = u.displayName || u.name;
      const avatarUrl = u.avatar ? getFileURL(u as any, u.avatar) : u.photoURL;
      return (
        <Marker
          key={u.id}
          position={[lat, lng]}
          icon={L.divIcon({
            className: 'user-marker-icon',
            html: `
              <div class="user-avatar-marker border-2 border-atlas-ink shadow-atlas">
                <img src="${avatarUrl || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + displayName}" referrerPolicy="no-referrer" />
                <div class="online-dot !bg-atlas-earth shadow-none"></div>
              </div>
            `,
            iconSize: [44, 44],
            iconAnchor: [22, 44]
          })}
        >
          <Popup autoPan={false}>
            <div className="text-center font-serif p-2">
              <p className="text-[9px] font-sans font-black text-atlas-ink/40 uppercase tracking-widest mb-1">Explorador Activo</p>
              <p className="font-bold italic text-atlas-ink text-sm leading-tight">{displayName}</p>
              <div className="w-8 h-[1px] bg-atlas-earth mx-auto mt-2" />
            </div>
          </Popup>
        </Marker>
      );
    }).filter(Boolean)
  ), [onlineUsers]);

  return (
    <div className="absolute inset-0 z-0">
      <MapContainer center={[-34.6037, -58.3816]} zoom={13} scrollWheelZoom={true} zoomControl={false} attributionControl={false} className="h-full w-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MalvinasOverlay />
        <PopupClickHandler onSightingClick={onSightingClick} />
        <MarkerClusterGroup
          chunkedLoading
          spiderfyOnMaxZoom={true}
          showCoverageOnHover={false}
          zoomToBoundsOnClick={true}
          maxClusterRadius={40}
          disableClusteringAtZoom={18}
          spiderfyDistanceMultiplier={2}
          animate={true}
        >
          {sightingMarkers}
          {gbifMarkerElements}
        </MarkerClusterGroup>
        {onlineUserMarkers}
        <LocationMarker
          isAddingMode={isAddingMode}
          setIsAddingMode={setIsAddingMode}
          setNewSightingPos={setNewSightingPos}
          setShowModal={setShowModal}
          userLocation={userLocation}
          mapCentered={mapCentered}
          setMapCentered={setMapCentered}
          newSightingPos={newSightingPos}
          onBoundsChange={onBoundsChange}
        />
      </MapContainer>
      {/* Layer toggle control */}
      <LayerTogglePanel toggles={layerToggles} onChange={updateLayerToggle} />
    </div>
  );
}
