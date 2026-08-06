import React, { useState, useCallback, useEffect, useRef, Suspense, lazy } from 'react';
import { pb, getFileURL } from './lib/pb';
import { logError } from './lib/logger';
import { useAuth } from './hooks/useAuth';
import { useSightings } from './hooks/useSightings';
import { useChat } from './hooks/useChat';
import { usePresence } from './hooks/usePresence';
import { useAdmin } from './hooks/useAdmin';
import { useSightingForm } from './hooks/useSightingForm';
import { Sighting } from './types';
import Header from './components/Header';
import LoginScreen from './components/LoginScreen';

// Lazy load heavy components
const MapView = lazy(() => import('./components/MapView'));
const Sidebar = lazy(() => import('./components/Sidebar'));
const ChatPanel = lazy(() => import('./components/ChatPanel'));
const AdminPanel = lazy(() => import('./components/AdminPanel'));
const SightingDetail = lazy(() => import('./components/SightingDetail'));
const NewSightingModal = lazy(() => import('./components/NewSightingModal'));
const ReportModal = lazy(() => import('./components/ReportModal'));
const FieldSurveyPanel = lazy(() => import('./components/FieldSurveyPanel'));
const CoordinatorPanel = lazy(() => import('./components/CoordinatorPanel'));
const FieldJourneyPanel = lazy(() => import('./components/FieldJourneyPanel'));

import { motion, AnimatePresence } from 'motion/react';
import { Map as MapIcon, Plus, MessageSquare, Navigation } from 'lucide-react';
import SectionBoundary from './components/SectionBoundary';

// Minimal loading fallback for lazy components
function LazyFallback() {
  return (
    <div className="flex items-center justify-center w-full h-full bg-atlas-paper">
      <div className="w-6 h-6 border-2 border-atlas-earth/30 border-t-atlas-earth rounded-full animate-spin" />
    </div>
  );
}

export default function App() {
  const { user, loading, isAdmin, isCoordinator, isAnonymous, handleLogin, handleEmailLogin, handleRegister, handleLogout, setLoading } = useAuth();
  const { sightings, filteredSightings, searchQuery, setSearchQuery, findNearbyMycelium, layerToggles, updateLayerToggle, setMapBounds } = useSightings(user?.uid);
  const { userLocation, onlineUsers, currentUserProfile, mapCentered, setMapCentered, requestUserLocation, getDistance } = usePresence(user);
  const {
    chatMessages, filteredMessages, chatRadius, setChatRadius, chatRadiusOptions,
    chatError, isSendingMessage, showChat, setShowChat, handleSendMessage
  } = useChat(user, userLocation);
  const { logs, allUsers, reports, adminError, showAdminPanel, setShowAdminPanel, activeAdminTab, setActiveAdminTab, createLog, submitReport, exportToGeoJSON } = useAdmin(user, isAdmin, currentUserProfile);
  const {
    formImages, setFormImages, formMushroomName, setFormMushroomName,
    formDescription, setFormDescription, formToxicity, setFormToxicity,
    formHabitat, setFormHabitat, formFeatures, setFormFeatures,
    isAiLoading, isSubmittingSighting, showModal, setShowModal, isAddingMode, setIsAddingMode,
    newSightingPos, setNewSightingPos, aiResult, handleImageUpload, runAiRecognition,
    handleAddNewSighting, removeFormImage, resetForm, prefillFromCapture
  } = useSightingForm(user, userLocation, currentUserProfile, findNearbyMycelium, getDistance, createLog);

  const [selectedSighting, setSelectedSighting] = useState<Sighting | null>(null);
  const [showReportModal, setShowReportModal] = useState<{ type: 'message' | 'user' | 'sighting' | 'comment', targetId: string, content?: string } | null>(null);
  const [showSidebar, setShowSidebar] = useState(true);
  const [activeGalleryIndex, setActiveGalleryIndex] = useState<number | null>(null);
  const [showFieldSurvey, setShowFieldSurvey] = useState(false);
  const [showCoordinator, setShowCoordinator] = useState(false);
  const [showJourney, setShowJourney] = useState(false);
  const journeyAutoOpenedRef = useRef(false);

  useEffect(() => {
    if (!user) {
      journeyAutoOpenedRef.current = false;
      return;
    }
    if (user.role === 'observador' && !journeyAutoOpenedRef.current) {
      journeyAutoOpenedRef.current = true;
      setShowJourney(true);
    }
  }, [user]);

  const handleSightingClick = useCallback((s: Sighting) => {
    setSelectedSighting(s);
  }, []);

  const handleGeofirm = useCallback(async (s: Sighting) => {
    if (!user || !userLocation) {
      alert("Es necesario activar la geolocalización para validar el hallazgo.");
      return;
    }
    const dist = getDistance(userLocation[0], userLocation[1], s.lat, s.lng);
    if (dist > 0.05) {
      alert(`Debe estar físicamente en el lugar para geofirmar el hallazgo. Distancia actual: ${(dist * 1000).toFixed(0)}m (Máximo permitido: 50m)`);
      return;
    }
    try {
      await pb.collection('sightings').update(s.id, {
        status: 'unconfirmed',
        geofirmed_by: user.uid,
        geofirmed_at: new Date().toISOString(),
      });

      if (currentUserProfile) {
        const newMerits = [...(currentUserProfile.merits || []), 'Geofirmador Oficial'].filter((v, i, a) => a.indexOf(v) === i);
        await pb.collection('users').update(user.uid, {
          points: (currentUserProfile.points || 0) + 50,
          merits: newMerits,
        });
      }

      setSelectedSighting({ ...s, status: 'unconfirmed' });
      await createLog('geofirm', `Geofirmó hallazgo de "${s.mushroomName || s.mushroom_name}" in situ`);
    } catch (err) {
      logError('geofirm', 'No se pudo geofirmar el hallazgo', err, { sightingId: s.id });
    }
  }, [user, userLocation, currentUserProfile, getDistance, createLog]);

  const handleReport = useCallback((type: 'message' | 'user' | 'sighting' | 'comment', targetId: string, content?: string) => {
    setShowReportModal({ type, targetId, content });
  }, []);

  const handleSubmitReport = useCallback((reason: string) => {
    submitReport(reason, showReportModal);
    setShowReportModal(null);
  }, [submitReport, showReportModal]);

  const handleExport = useCallback(() => {
    exportToGeoJSON(sightings);
  }, [exportToGeoJSON, sightings]);

  if (!user) {
    return <LoginScreen onLogin={handleLogin} onEmailLogin={handleEmailLogin} onRegister={handleRegister} />;
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-atlas-paper relative">
      <SectionBoundary name="Header">
      <Header
        user={user}
        isAdmin={isAdmin}
        showSidebar={showSidebar}
        setShowSidebar={setShowSidebar}
        showChat={showChat}
        setShowChat={setShowChat}
        showAdminPanel={showAdminPanel}
        setShowAdminPanel={setShowAdminPanel}
        handleLogin={handleLogin}
        handleLogout={handleLogout}
        onOpenFieldSurvey={() => setShowFieldSurvey(true)}
        canCoordinate={isCoordinator}
        onOpenCoordinator={() => setShowCoordinator(true)}
        onOpenJourney={() => setShowJourney(true)}
      />
      </SectionBoundary>

      {showFieldSurvey && <Suspense fallback={<LazyFallback />}><FieldSurveyPanel user={user} onClose={() => setShowFieldSurvey(false)} /></Suspense>}
      {showCoordinator && <Suspense fallback={<LazyFallback />}><CoordinatorPanel user={user} onClose={() => setShowCoordinator(false)} /></Suspense>}
      {showJourney && <Suspense fallback={<LazyFallback />}><FieldJourneyPanel user={user} onClose={() => setShowJourney(false)} onOpenSurvey={() => { setShowJourney(false); setShowFieldSurvey(true); }} onOpenMap={() => setShowJourney(false)} /></Suspense>}

      <main className="flex-1 relative overflow-hidden">
        <SectionBoundary name="MapView">
        <Suspense fallback={<LazyFallback />}>
        <MapView
          filteredSightings={filteredSightings}
          onlineUsers={onlineUsers}
          isAddingMode={isAddingMode}
          setIsAddingMode={setIsAddingMode}
          setNewSightingPos={setNewSightingPos}
          setShowModal={setShowModal}
          userLocation={userLocation}
          mapCentered={mapCentered}
          setMapCentered={setMapCentered}
          newSightingPos={newSightingPos}
          onSightingClick={handleSightingClick}
          layerToggles={layerToggles}
          updateLayerToggle={updateLayerToggle}
          onBoundsChange={setMapBounds}
        />
        </Suspense>
        </SectionBoundary>

        {isAddingMode && !newSightingPos && (
          <div className="absolute top-24 left-1/2 -translate-x-1/2 z-[2000] pointer-events-none">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-atlas-ink text-atlas-paper px-8 py-3 shadow-atlas border border-atlas-ink text-[9px] font-sans font-black uppercase tracking-[0.3em] flex items-center gap-3"
            >
              <div className="w-2 h-2 bg-atlas-earth rounded-full animate-pulse" />
              Seleccione punto en el Mapa
            </motion.div>
          </div>
        )}

        <div className="absolute left-1/2 -translate-x-1/2 z-[1001] w-full max-w-lg px-6" style={{ bottom: 'max(32px, env(safe-area-inset-bottom))' }}>
          <motion.div
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="flex items-center justify-between gap-4"
          >
            <div className="flex bg-atlas-paper border-2 border-atlas-ink shadow-atlas overflow-hidden">
              <button
                onClick={() => setShowSidebar(!showSidebar)}
                className={`p-4 border-r border-atlas-ink transition-all hover:bg-atlas-stone ${showSidebar ? 'text-atlas-earth' : 'text-atlas-ink opacity-40'}`}
                title="Feed / Búsqueda"
              >
                <MapIcon className="w-5 h-5" />
              </button>
              <button
                onClick={() => setShowChat(!showChat)}
                className={`p-4 transition-all hover:bg-atlas-stone ${showChat ? 'text-atlas-earth' : 'text-atlas-ink opacity-40'}`}
                title="Chat Global"
              >
                <MessageSquare className="w-5 h-5" />
              </button>
            </div>
            <button
              onClick={() => { setNewSightingPos(null); setShowModal(true); }}
              className="flex-1 bg-atlas-ink text-atlas-paper py-4 border-2 border-atlas-ink shadow-atlas hover:bg-atlas-earth transition-all flex items-center justify-center gap-3"
            >
              <Plus className="w-5 h-5" />
              <span className="text-[10px] font-sans font-black uppercase tracking-[0.2em]">Añadir Hallazgo</span>
            </button>
            <button
              onClick={() => { if (userLocation) { setMapCentered(false); } else { requestUserLocation(); } }}
              className="bg-atlas-paper p-4 border-2 border-atlas-ink shadow-atlas hover:bg-atlas-stone transition-all"
              title="Mi Ubicación"
            >
              <Navigation className="w-5 h-5 text-atlas-ink" />
            </button>
          </motion.div>
        </div>

        <SectionBoundary name="Sidebar">
        <Suspense fallback={<LazyFallback />}>
        <Sidebar
          showSidebar={showSidebar}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          filteredSightings={filteredSightings}
          onSightingClick={handleSightingClick}
          isAdmin={isAdmin}
          onExport={handleExport}
        />
        </Suspense>
        </SectionBoundary>

        <SectionBoundary name="ChatPanel">
        <Suspense fallback={<LazyFallback />}>
        <ChatPanel
          showChat={showChat}
          setShowChat={setShowChat}
          filteredMessages={filteredMessages}
          chatRadius={chatRadius}
          setChatRadius={setChatRadius}
          chatRadiusOptions={chatRadiusOptions}
          chatError={chatError}
          isSendingMessage={isSendingMessage}
          handleSendMessage={handleSendMessage}
          user={user}
          onReport={handleReport}
        />
        </Suspense>
        </SectionBoundary>

        <SectionBoundary name="AdminPanel">
        <Suspense fallback={<LazyFallback />}>
        <AdminPanel
          showAdminPanel={showAdminPanel}
          setShowAdminPanel={setShowAdminPanel}
          isAdmin={isAdmin}
          logs={logs}
          reports={reports}
          adminError={adminError}
          allUsers={allUsers}
          onlineUsers={onlineUsers}
          activeAdminTab={activeAdminTab}
          setActiveAdminTab={setActiveAdminTab}
          handleSendMessage={handleSendMessage}
          createLog={createLog}
        />
        </Suspense>
        </SectionBoundary>

        <SectionBoundary name="SightingDetail">
        <Suspense fallback={<LazyFallback />}>
        <SightingDetail
          selectedSighting={selectedSighting}
          onClose={() => setSelectedSighting(null)}
          user={user}
          userLocation={userLocation}
          currentUserProfile={currentUserProfile}
          sightings={sightings}
          onReport={handleReport}
          onGeofirm={handleGeofirm}
          createLog={createLog}
          activeGalleryIndex={activeGalleryIndex}
          setActiveGalleryIndex={setActiveGalleryIndex}
        />
        </Suspense>
        </SectionBoundary>
      </main>

      <Suspense fallback={<div className="fixed inset-0 z-[3000] bg-atlas-paper/80 flex items-center justify-center"><div className="w-6 h-6 border-2 border-atlas-earth/30 border-t-atlas-earth rounded-full animate-spin" /></div>}>
      <NewSightingModal
        showModal={showModal}
        setShowModal={setShowModal}
        isAddingMode={isAddingMode}
        setIsAddingMode={setIsAddingMode}
        newSightingPos={newSightingPos}
        setNewSightingPos={setNewSightingPos}
        formImages={formImages}
        setFormImages={setFormImages}
        formMushroomName={formMushroomName}
        setFormMushroomName={setFormMushroomName}
        formDescription={formDescription}
        setFormDescription={setFormDescription}
        formToxicity={formToxicity}
        setFormToxicity={setFormToxicity}
        formHabitat={formHabitat}
        setFormHabitat={setFormHabitat}
        formFeatures={formFeatures}
        setFormFeatures={setFormFeatures}
        isAiLoading={isAiLoading}
        isSubmittingSighting={isSubmittingSighting}
        handleImageUpload={handleImageUpload}
        removeFormImage={removeFormImage}
        runAiRecognition={runAiRecognition}
        handleAddNewSighting={handleAddNewSighting}
        resetForm={resetForm}
        prefillFromCapture={prefillFromCapture}
        aiResult={aiResult}
      />
      </Suspense>

      <Suspense fallback={null}>
      <ReportModal
        showReportModal={showReportModal}
        setShowReportModal={setShowReportModal}
        submitReport={handleSubmitReport}
      />
      </Suspense>

      <AnimatePresence>
        {activeGalleryIndex !== null && selectedSighting?.images && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[5000] bg-atlas-ink flex flex-col items-center justify-center p-4 md:p-20"
          >
            <button
              onClick={() => setActiveGalleryIndex(null)}
              className="absolute top-8 right-8 text-atlas-paper hover:scale-110 transition-transform z-10"
            >
              <Plus className="w-10 h-10 rotate-45" />
            </button>
            <motion.div
              key={activeGalleryIndex}
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="relative w-full h-full flex items-center justify-center"
            >
              <img
                src={(() => {
                  const fn = selectedSighting.images![activeGalleryIndex];
                  if (fn.startsWith('data:') || fn.startsWith('http')) return fn;
                  return getFileURL(selectedSighting as any, fn);
                })()}
                alt=""
                className="max-w-full max-h-full object-contain shadow-2xl border-4 border-atlas-paper"
              />
              <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex gap-4 bg-atlas-ink/40 p-4 backdrop-blur rounded-full border border-atlas-paper/10">
                {selectedSighting.images.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setActiveGalleryIndex(i)}
                    className={`w-3 h-3 rounded-full transition-all ${i === activeGalleryIndex ? 'bg-atlas-earth scale-125' : 'bg-atlas-paper/40 hover:bg-atlas-paper'}`}
                  />
                ))}
              </div>
            </motion.div>
            <div className="absolute top-1/2 -translate-y-1/2 left-4 md:left-10">
              <button
                onClick={() => setActiveGalleryIndex(prev => prev! > 0 ? prev! - 1 : selectedSighting.images!.length - 1)}
                className="p-4 text-atlas-paper opacity-40 hover:opacity-100 transition-opacity"
              >
                <Navigation className="w-8 h-8 -rotate-90" />
              </button>
            </div>
            <div className="absolute top-1/2 -translate-y-1/2 right-4 md:right-10">
              <button
                onClick={() => setActiveGalleryIndex(prev => prev! < selectedSighting.images!.length - 1 ? prev! + 1 : 0)}
                className="p-4 text-atlas-paper opacity-40 hover:opacity-100 transition-opacity"
              >
                <Navigation className="w-8 h-8 rotate-90" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
