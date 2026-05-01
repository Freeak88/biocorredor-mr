import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    user: null,
    loading: false,
    isAdmin: false,
    isAnonymous: false,
    handleLogin: vi.fn(),
    handleEmailLogin: vi.fn(),
    handleRegister: vi.fn(),
    handleLogout: vi.fn(),
    setLoading: vi.fn(),
  }),
}));

vi.mock('../components/LoginScreen', () => ({
  default: () => <div>Login FungiMap</div>,
}));

vi.mock('../hooks/useSightings', () => ({
  useSightings: () => ({
    sightings: [],
    filteredSightings: [],
    searchQuery: '',
    setSearchQuery: vi.fn(),
    findNearbyMycelium: vi.fn(),
    layerToggles: { showGbif: true, showMine: true, showOthers: true },
    updateLayerToggle: vi.fn(),
    setMapBounds: vi.fn(),
  }),
}));

vi.mock('../hooks/usePresence', () => ({
  usePresence: () => ({
    userLocation: null,
    onlineUsers: [],
    currentUserProfile: null,
    mapCentered: false,
    setMapCentered: vi.fn(),
    getDistance: vi.fn(),
  }),
}));

vi.mock('../hooks/useChat', () => ({
  useChat: () => ({
    chatMessages: [],
    filteredMessages: [],
    showChat: false,
    setShowChat: vi.fn(),
    handleSendMessage: vi.fn(),
  }),
}));

vi.mock('../hooks/useAdmin', () => ({
  useAdmin: () => ({
    logs: [],
    allUsers: [],
    reports: [],
    adminError: null,
    showAdminPanel: false,
    setShowAdminPanel: vi.fn(),
    activeAdminTab: 'logs',
    setActiveAdminTab: vi.fn(),
    createLog: vi.fn(),
    submitReport: vi.fn(),
    exportToGeoJSON: vi.fn(),
  }),
}));

vi.mock('../hooks/useSightingForm', () => ({
  useSightingForm: () => ({
    formImages: [],
    setFormImages: vi.fn(),
    formMushroomName: '',
    setFormMushroomName: vi.fn(),
    formDescription: '',
    setFormDescription: vi.fn(),
    formToxicity: 'Desconocido',
    setFormToxicity: vi.fn(),
    formHabitat: '',
    setFormHabitat: vi.fn(),
    formFeatures: '',
    setFormFeatures: vi.fn(),
    isAiLoading: false,
    showModal: false,
    setShowModal: vi.fn(),
    isAddingMode: false,
    setIsAddingMode: vi.fn(),
    newSightingPos: null,
    setNewSightingPos: vi.fn(),
    handleImageUpload: vi.fn(),
    removeFormImage: vi.fn(),
    runAiRecognition: vi.fn(),
    handleAddNewSighting: vi.fn(),
    resetForm: vi.fn(),
  }),
}));

import App from '../App';

describe('App', () => {
  it('renders login screen when no PocketBase user is authenticated', () => {
    render(<App />);
    expect(screen.getByText('Login FungiMap')).toBeInTheDocument();
  });
});
