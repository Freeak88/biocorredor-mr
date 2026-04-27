import { vi } from 'vitest';
import type { MapOptions, MarkerOptions, TileLayerOptions, LatLngExpression, LatLngBounds, Point, LatLng } from 'leaflet';

// ─── Leaflet Core Mocks ──────────────────────────────────────

class MockMap {
  private center: LatLngExpression = [0, 0];
  private zoom = 13;
  private eventHandlers: Record<string, Function[]> = {};

  setView(center: LatLngExpression, zoom?: number) {
    this.center = center;
    if (zoom !== undefined) this.zoom = zoom;
    return this;
  }

  getCenter() {
    return this.center;
  }

  getZoom() {
    return this.zoom;
  }

  addLayer(_layer: any) {
    return this;
  }

  removeLayer(_layer: any) {
    return this;
  }

  on(event: string, handler: Function) {
    if (!this.eventHandlers[event]) this.eventHandlers[event] = [];
    this.eventHandlers[event].push(handler);
    return this;
  }

  off(event: string, handler: Function) {
    if (this.eventHandlers[event]) {
      this.eventHandlers[event] = this.eventHandlers[event].filter(h => h !== handler);
    }
    return this;
  }

  fire(event: string, data?: any) {
    this.eventHandlers[event]?.forEach(h => h(data));
    return this;
  }

  fitBounds(_bounds: LatLngBounds) {
    return this;
  }

  invalidateSize() {
    return this;
  }

  remove() {
    return this;
  }
}

class MockMarker {
  private latlng: LatLngExpression;
  private options: MarkerOptions;
  private popupContent: string | null = null;
  private eventHandlers: Record<string, Function[]> = {};

  constructor(latlng: LatLngExpression, options?: MarkerOptions) {
    this.latlng = latlng;
    this.options = options || {};
  }

  addTo(_map: any) {
    return this;
  }

  removeFrom(_map: any) {
    return this;
  }

  bindPopup(content: string | HTMLElement) {
    this.popupContent = typeof content === 'string' ? content : content.outerHTML;
    return this;
  }

  openPopup() {
    return this;
  }

  closePopup() {
    return this;
  }

  setLatLng(latlng: LatLngExpression) {
    this.latlng = latlng;
    return this;
  }

  getLatLng() {
    return this.latlng;
  }

  on(event: string, handler: Function) {
    if (!this.eventHandlers[event]) this.eventHandlers[event] = [];
    this.eventHandlers[event].push(handler);
    return this;
  }

  off(event: string, handler: Function) {
    if (this.eventHandlers[event]) {
      this.eventHandlers[event] = this.eventHandlers[event].filter(h => h !== handler);
    }
    return this;
  }

  fire(event: string, data?: any) {
    this.eventHandlers[event]?.forEach(h => h(data));
    return this;
  }
}

class MockTileLayer {
  private url: string;
  private options: TileLayerOptions;

  constructor(url: string, options?: TileLayerOptions) {
    this.url = url;
    this.options = options || {};
  }

  addTo(_map: any) {
    return this;
  }

  removeFrom(_map: any) {
    return this;
  }
}

class MockDivIcon {
  options: any;

  constructor(options?: any) {
    this.options = options || {};
  }
}

class MockIcon {
  options: any;

  constructor(options?: any) {
    this.options = options || {};
  }
}

class MockLatLng {
  lat: number;
  lng: number;

  constructor(lat: number, lng: number) {
    this.lat = lat;
    this.lng = lng;
  }
}

class MockLatLngBounds {
  private corners: LatLngExpression[];

  constructor(corners: LatLngExpression[]) {
    this.corners = corners;
  }

  getCenter() {
    return this.corners[0];
  }

  contains(_latlng: LatLngExpression) {
    return true;
  }
}

// ─── Mock Leaflet Module ───────────────────────────────────

const mockLeaflet = {
  Map: MockMap,
  map: vi.fn((id: string | HTMLElement, options?: MapOptions) => new MockMap()),
  Marker: MockMarker,
  marker: vi.fn((latlng: LatLngExpression, options?: MarkerOptions) => new MockMarker(latlng, options)),
  TileLayer: MockTileLayer,
  tileLayer: vi.fn((url: string, options?: TileLayerOptions) => new MockTileLayer(url, options)),
  DivIcon: MockDivIcon,
  divIcon: vi.fn((options?: any) => new MockDivIcon(options)),
  Icon: MockIcon,
  icon: vi.fn((options?: any) => new MockIcon(options)),
  LatLng: MockLatLng,
  latLng: vi.fn((lat: number, lng: number) => new MockLatLng(lat, lng)),
  LatLngBounds: MockLatLngBounds,
  latLngBounds: vi.fn((corners: LatLngExpression[]) => new MockLatLngBounds(corners)),
  Point: vi.fn((x: number, y: number) => ({ x, y })),
  CRS: {
    Simple: {
      latLngToPoint: vi.fn(() => ({ x: 0, y: 0 })),
      pointToLatLng: vi.fn(() => ({ lat: 0, lng: 0 })),
    },
  },
  DomEvent: {
    on: vi.fn(),
    off: vi.fn(),
    stopPropagation: vi.fn(),
    preventDefault: vi.fn(),
  },
  DomUtil: {
    create: vi.fn((tag: string) => document.createElement(tag)),
    remove: vi.fn(),
    empty: vi.fn(),
    hasClass: vi.fn(),
    addClass: vi.fn(),
    removeClass: vi.fn(),
  },
  Control: {
    Zoom: vi.fn(),
    Attribution: vi.fn(),
  },
  Layer: vi.fn(),
  LayerGroup: vi.fn(() => ({
    addLayer: vi.fn(),
    removeLayer: vi.fn(),
    clearLayers: vi.fn(),
    eachLayer: vi.fn(),
  })),
  FeatureGroup: vi.fn(() => ({
    addLayer: vi.fn(),
    removeLayer: vi.fn(),
    clearLayers: vi.fn(),
    eachLayer: vi.fn(),
    setStyle: vi.fn(),
    bringToFront: vi.fn(),
    bringToBack: vi.fn(),
    getBounds: vi.fn(() => new MockLatLngBounds([[0, 0], [1, 1]])),
  })),
  GeoJSON: vi.fn(() => ({
    addTo: vi.fn(),
    addData: vi.fn(),
    resetStyle: vi.fn(),
    setStyle: vi.fn(),
  })),
  Popup: vi.fn(() => ({
    setLatLng: vi.fn(),
    setContent: vi.fn(),
    openOn: vi.fn(),
    close: vi.fn(),
  })),
  Tooltip: vi.fn(() => ({
    setLatLng: vi.fn(),
    setContent: vi.fn(),
    openOn: vi.fn(),
    close: vi.fn(),
  })),
  Circle: vi.fn(() => ({
    addTo: vi.fn(),
    setLatLng: vi.fn(),
    setRadius: vi.fn(),
    setStyle: vi.fn(),
    bindPopup: vi.fn(),
  })),
  CircleMarker: vi.fn(() => ({
    addTo: vi.fn(),
    setLatLng: vi.fn(),
    setRadius: vi.fn(),
    setStyle: vi.fn(),
    bindPopup: vi.fn(),
  })),
  Polyline: vi.fn(() => ({
    addTo: vi.fn(),
    setLatLngs: vi.fn(),
    setStyle: vi.fn(),
    bindPopup: vi.fn(),
  })),
  Polygon: vi.fn(() => ({
    addTo: vi.fn(),
    setLatLngs: vi.fn(),
    setStyle: vi.fn(),
    bindPopup: vi.fn(),
  })),
  Rectangle: vi.fn(() => ({
    addTo: vi.fn(),
    setBounds: vi.fn(),
    setStyle: vi.fn(),
    bindPopup: vi.fn(),
  })),
  geoJson: vi.fn(() => ({
    addTo: vi.fn(),
    addData: vi.fn(),
    resetStyle: vi.fn(),
    setStyle: vi.fn(),
  })),
};

// Apply marker prototype options for react-leaflet compatibility
(mockLeaflet.Marker as any).prototype = {
  options: {
    icon: mockLeaflet.divIcon({
      className: 'default-marker',
      html: '<div></div>',
    }),
  },
};

vi.mock('leaflet', async () => mockLeaflet);
vi.mock('leaflet.markercluster', () => ({
  __esModule: true,
  default: vi.fn(() => ({
    addTo: vi.fn(),
    addLayer: vi.fn(),
    removeLayer: vi.fn(),
    clearLayers: vi.fn(),
    getBounds: vi.fn(),
  })),
}));

export { mockLeaflet, MockMap, MockMarker, MockTileLayer, MockDivIcon };
