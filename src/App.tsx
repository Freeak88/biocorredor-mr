import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Map as MapIcon, Plus, MessageSquare, Navigation } from 'lucide-react';
import { pb } from './lib/pb';
import { useAuth } from './hooks/useAuth';
import { useSightings } from './hooks/useSightings';
import { useChat } from './hooks/useChat';
import { usePresence } from './hooks/usePresence';
import { useAdmin } from './hooks/useAdmin';
import { useSightingForm } from './hooks/useSightingForm';
import { Sighting } from './types';
import Header from './components/Header';
import MapView from './components/MapView';
import SightingDetail from './components/SightingDetail';
import NewSightingModal from './components/NewSightingModal';
import ChatPanel from './components/ChatPanel';
import AdminPanel from './components/AdminPanel';
import ReportModal from './components/ReportModal';
import Sidebar from './components/Sidebar';
import LoginScreen from './components/LoginScreen';
import SectionBoundary from './components/SectionBoundary';

export default function App() {
  const { user, loading, isAdmin, isAnonymous, handleLogin, handleEmailLogin, handleRegister, handleLogout, setLoading } = useAuth();
  const { sightings, filteredSightings, searchQuery, setSearchQuery, findNearbyMycelium, layerToggles, updateLayerToggle, setMapBounds } = useSightings(user?.uid);
  const { userLocation, onlineUsers, currentUserProfile, mapCentered, setMapCentered, getDistance } = usePresence(user);
  const { chatMessages, filteredMessages, showChat, setShowChat, handleSendMessage } = useChat(user, userLocation);
  const { logs, allUsers, reports, adminError, showAdminPanel, setShowAdminPanel, activeAdminTab, setActiveAdminTab, createLog, submitReport, exportToGeoJSON } = useAdmin(user, isAdmin, currentUserProfile);
  const {
    formImages, setFormImages, formMushroomName, setFormMushroomName,
    formDescription, setFormDescription, formToxicity, setFormToxicity,
    formHabitat, setFormHabitat, formFeatures, setFormFeatures,
    isAiLoading, showModal, setShowModal, isAddingMode, setIsAddingMode,
    newSightingPos, setNewSightingPos, handleImageUpload, runAiRecognition,
    handleAddNewSighting, removeFormImage, resetForm
  } = useSightingForm(user, userLocation, currentUserProfile, findNearbyMycelium, getDistance, createLog);

  const [selectedSighting, setSelectedSighting] = useState<Sighting | null>(null);
  const [showReportModal, setShowReportModal] = useState<{ type: 'message' | 'user' | 'sighting' | 'comment', targetId: string, content?: string } | null>(null);
  const [showSidebar, setShowSidebar] = useState(true);
  const [activeGalleryIndex, setActiveGalleryIndex] = useState<number | null>(null);

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
      console.error("Geofirm error", err);
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

  console.log('[FungiMap] Rendering app, user:', user?.email, 'isAdmin:', isAdmin);

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-atlas-paper relative">
      <SectionBoundary name="Header">
        <Header
          user={user}
          isAdmin={isAdmin}
          onLogout={handleLogout}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onToggleAdmin={() => setShowAdminPanel(!showAdminPanel)}
          onToggleChat={() => setShowChat(!showChat)}
          onToggleSidebar={() => setShowSidebar(!showSidebar)}
          showChat={showChat}
          showAdminPanel={showAdminPanel}
          showSidebar={showSidebar}
          userProfile={currentUserProfile}
        />
      </SectionBoundary>

      <div className="flex-1 flex overflow-hidden relative">
        <AnimatePresence>
          {showSidebar && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 320, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
              className="border-r border-atlas-ink/10 bg-atlas-paper flex flex-col overflow-hidden"
            >
              <Sidebar
                sightings={filteredSightings}
                onSightingClick={handleSightingClick}
                userLocation={userLocation}
                getDistance={getDistance}
                layerToggles={layerToggles}
                updateLayerToggle={updateLayerToggle}
                searchQuery={searchQuery}
              />
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex-1 relative">
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
        </div>

        <AnimatePresence>
          {showChat && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 320, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
              className="border-l border-atlas-ink/10 bg-atlas-paper flex flex-col overflow-hidden"
            >
              <ChatPanel
                messages={filteredMessages}
                onSendMessage={handleSendMessage}
                currentUser={user}
                onClose={() => setShowChat(false)}
                onReport={handleReport}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {selectedSighting && (
          <SightingDetail
            sighting={selectedSighting}
            onClose={() => setSelectedSighting(null)}
            onGeofirm={handleGeofirm}
            onReport={handleReport}
            currentUser={user}
            userLocation={userLocation}
            isAdmin={isAdmin}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showModal && (
          <NewSightingModal
            onClose={() => { setShowModal(false); resetForm(); }}
            onSubmit={handleAddNewSighting}
            images={formImages}
            onImageUpload={handleImageUpload}
            onRemoveImage={removeFormImage}
            mushroomName={formMushroomName}
            onMushroomNameChange={setFormMushroomName}
            description={formDescription}
            onDescriptionChange={setFormDescription}
            toxicity={formToxicity}
            onToxicityChange={setFormToxicity}
            habitat={formHabitat}
            onHabitatChange={setFormHabitat}
            features={formFeatures}
            onFeaturesChange={setFormFeatures}
            isAiLoading={isAiLoading}
            onAiRecognize={runAiRecognition}
            userLocation={userLocation}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showAdminPanel && isAdmin && (
          <AdminPanel
            logs={logs}
            users={allUsers}
            reports={reports}
            error={adminError}
            onClose={() => setShowAdminPanel(false)}
            activeTab={activeAdminTab}
            onTabChange={setActiveAdminTab}
            onExport={handleExport}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showReportModal && (
          <ReportModal
            type={showReportModal.type}
            targetId={showReportModal.targetId}
            content={showReportModal.content}
            onClose={() => setShowReportModal(null)}
            onSubmit={handleSubmitReport}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
