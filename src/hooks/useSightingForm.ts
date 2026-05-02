import React, { useState, useCallback, useRef } from 'react';
import { fetchWeatherContext } from '../lib/weather';
import { encodeGeohash } from '../utils/geohash';
import { compressImage, fileToDataUrl } from '../services/imagesService';
import { createSighting, updateSighting } from '../services/sightingsService';
import { updateUserProfile } from '../services/usersService';
import type { AuthUser, UserProfile } from '../types';

export function useSightingForm(
  user: AuthUser | null,
  userLocation: [number, number] | null,
  currentUserProfile: UserProfile | null,
  findNearbyMycelium: (lat: number, lng: number, speciesName: string) => string | null,
  getDistance: (lat1: number, lon1: number, lat2: number, lon2: number) => number,
  createLog: (action: string, details: string) => Promise<void>
) {
  const [formImages, setFormImages] = useState<string[]>([]);
  const [formImageFiles, setFormImageFiles] = useState<File[]>([]);
  const [formMushroomName, setFormMushroomName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formToxicity, setFormToxicity] = useState('Desconocido');
  const [formHabitat, setFormHabitat] = useState('');
  const [formFeatures, setFormFeatures] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [isSubmittingSighting, setIsSubmittingSighting] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [isAddingMode, setIsAddingMode] = useState(false);
  const [newSightingPos, setNewSightingPos] = useState<[number, number] | null>(null);
  const submitInFlightRef = useRef(false);

  const handleImageUpload = useCallback(async (file: File) => {
    try {
      const compressed = await compressImage(file);
      const dataUrl = await fileToDataUrl(compressed);
      setFormImages(prev => [...prev, dataUrl]);
      setFormImageFiles(prev => [...prev, compressed]);
    } catch (err) {
      console.error("Image upload error", err);
      alert(err instanceof Error ? err.message : 'No se pudo procesar la imagen.');
    }
  }, []);

  const removeFormImage = useCallback((index: number) => {
    setFormImages(prev => prev.filter((_, i) => i !== index));
    setFormImageFiles(prev => prev.filter((_, i) => i !== index));
  }, []);

  const runAiRecognition = useCallback(async () => {
    if (formImages.length === 0) return;
    try {
      setIsAiLoading(true);
      const dataUrl = formImages[0];
      const base64 = dataUrl.split(',')[1];
      const mimeType = /data:(.*?);base64/.exec(dataUrl)?.[1] || "image/jpeg";

      const { identifyMushroomFromImage } = await import('../lib/gemini');
      const analysis = await identifyMushroomFromImage(base64, mimeType);

      if (analysis) {
        setFormMushroomName(`${analysis.scientificName} (${analysis.commonName})`);
        setFormDescription(analysis.description);
        setFormToxicity(analysis.toxicity);
        setFormHabitat(analysis.habitat);
        setFormFeatures(analysis.features);
      } else {
        alert("La IA no pudo identificar este ejemplar. Intente con otra foto.");
      }
    } catch (err) {
      console.error("AI Analysis error", err);
      alert("Error en el reconocimiento. Verifique su conexi\u00f3n.");
    } finally {
      setIsAiLoading(false);
    }
  }, [formImages]);

  const resetForm = useCallback(() => {
    setFormMushroomName('');
    setFormDescription('');
    setFormToxicity('Desconocido');
    setFormHabitat('');
    setFormFeatures('');
    setFormImages([]);
    setFormImageFiles([]);
    setShowModal(false);
    setIsAddingMode(false);
    setNewSightingPos(null);
  }, []);

  const handleAddNewSighting = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitInFlightRef.current) return;

    const form = e.target as HTMLFormElement;
    const mushroomName = (form.elements.namedItem('mushroomName') as HTMLInputElement).value;
    const description = (form.elements.namedItem('description') as HTMLTextAreaElement).value;

    if (!user) return;

    const pos = newSightingPos || userLocation;
    if (!pos) {
      alert("No se ha podido determinar su ubicaci\u00f3n actual. Inicie la geolocalizaci\u00f3n o seleccione un punto en el mapa.");
      return;
    }

    const isRemote = newSightingPos !== null && userLocation && getDistance(userLocation[0], userLocation[1], pos[0], pos[1]) > 0.1;
    const initialStatus = isRemote ? 'draft' : 'unconfirmed';

    try {
      submitInFlightRef.current = true;
      setIsSubmittingSighting(true);

      const points = initialStatus === 'draft' ? 5 : 25;
      const networkId = findNearbyMycelium(pos[0], pos[1], mushroomName);

      // Build FormData for file uploads
      const formData = new FormData();
      formData.append('user', user.uid);
      formData.append('mushroom_name', mushroomName);
      formData.append('description', description);
      formData.append('toxicity', formToxicity);
      formData.append('habitat', formHabitat || '');
      formData.append('features', formFeatures || '');
      formData.append('lat', String(pos[0]));
      formData.append('lng', String(pos[1]));
      formData.append('geohash', encodeGeohash(pos[0], pos[1], 9));
      formData.append('status', initialStatus);
      formData.append('network_id', networkId || '');

      // Append all image files
      formImageFiles.forEach(file => {
        formData.append('images', file);
      });

      const record = await createSighting(formData);

      // Fetch weather context for the sighting
      if (record && record.id) {
        const sightingLat = pos[0];
        const sightingLng = pos[1];
        const sightingDate = new Date().toISOString().split('T')[0]; // Today
        
        const weatherContext = await fetchWeatherContext(sightingLat, sightingLng, sightingDate, 10);
        if (weatherContext) {
          try {
            await updateSighting(record.id, {
              weather_context: weatherContext as any,
              elevation: weatherContext.location.elevation,
            });
          } catch (weatherErr) {
            console.error('Weather context update failed:', weatherErr);
          }
        }
      }

      // Update user points
      if (currentUserProfile) {
        const newMerits = [...(currentUserProfile.merits || [])];
        await updateUserProfile(user.uid, {
          points: (currentUserProfile.points || 0) + points,
          merits: newMerits,
        });
      }

      await createLog('sighting_add', `Registr\u00f3 "${mushroomName}" como ${initialStatus === 'draft' ? 'Borrador remoto' : 'Hallazgo local'}`);
      alert('Hallazgo archivado en el Atlas.');
      resetForm();
    } catch (err) {
      console.error("Error saving sighting", err);
      alert(`Error al archivar: ${err instanceof Error ? err.message : JSON.stringify(err)}`);
    } finally {
      submitInFlightRef.current = false;
      setIsSubmittingSighting(false);
    }
  }, [user, userLocation, newSightingPos, currentUserProfile, formToxicity, formHabitat, formFeatures, formImageFiles, findNearbyMycelium, getDistance, createLog, resetForm]);

  return {
    formImages,
    setFormImages,
    formMushroomName,
    setFormMushroomName,
    formDescription,
    setFormDescription,
    formToxicity,
    setFormToxicity,
    formHabitat,
    setFormHabitat,
    formFeatures,
    setFormFeatures,
    isAiLoading,
    isSubmittingSighting,
    showModal,
    setShowModal,
    isAddingMode,
    setIsAddingMode,
    newSightingPos,
    setNewSightingPos,
    handleImageUpload,
    removeFormImage,
    runAiRecognition,
    handleAddNewSighting,
    resetForm,
  };
}
