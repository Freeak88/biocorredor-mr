import React, { useState, useCallback, useRef, useEffect } from 'react';
import { fetchWeatherContext } from '../lib/weather';
import { encodeGeohash } from '../utils/geohash';
import { compressImage, fileToDataUrl } from '../services/imagesService';
import { createSighting, updateSighting } from '../services/sightingsService';
import { updateUserProfile } from '../services/usersService';
import type { AuthUser, UserProfile } from '../types';
import type { MushroomIdentification } from '../lib/gemini';

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
  const [aiResult, setAiResult] = useState<MushroomIdentification | null>(null);
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

  const prefillFromCapture = useCallback(async (file: File, lat: number, lng: number) => {
    try {
      const compressed = await compressImage(file);
      const dataUrl = await fileToDataUrl(compressed);
      setFormImages([dataUrl]);
      setFormImageFiles([compressed]);
      setNewSightingPos([lat, lng]);
      setShowModal(true);
      saveDraft({
        images: [dataUrl],
        mushroomName: '',
        description: '',
        toxicity: 'Desconocido',
        habitat: '',
        features: '',
        lat,
        lng,
      });
    } catch (err) {
      console.error("Camera capture error", err);
      alert('No se pudo procesar la foto de la cámara.');
    }
  }, []);

  const DRAFT_KEY = user ? `biocorredor_mr_draft_${user.uid}` : 'biocorredor_mr_draft_guest';

  interface DraftData {
    images: string[];
    mushroomName: string;
    description: string;
    toxicity: string;
    habitat: string;
    features: string;
    lat: number;
    lng: number;
    timestamp: number;
  }

  const saveDraft = useCallback((partial: Partial<DraftData>) => {
    try {
      const existing = localStorage.getItem(DRAFT_KEY);
      const draft: DraftData = existing ? JSON.parse(existing) : {
        images: [], mushroomName: '', description: '',
        toxicity: 'Desconocido', habitat: '', features: '',
        lat: 0, lng: 0, timestamp: Date.now(),
      };
      const updated = { ...draft, ...partial, timestamp: Date.now() };
      localStorage.setItem(DRAFT_KEY, JSON.stringify(updated));
    } catch (e) {
      console.warn('Failed to save draft', e);
    }
  }, [DRAFT_KEY]);

  const loadDraft = useCallback((): DraftData | null => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return null;
      const draft = JSON.parse(raw) as DraftData;
      if (Date.now() - draft.timestamp > 24 * 60 * 60 * 1000) {
        localStorage.removeItem(DRAFT_KEY);
        return null;
      }
      return draft;
    } catch (e) {
      return null;
    }
  }, [DRAFT_KEY]);

  const clearDraft = useCallback(() => {
    localStorage.removeItem(DRAFT_KEY);
  }, [DRAFT_KEY]);

  useEffect(() => {
    if (!showModal) return;
    const timeout = setTimeout(() => {
      saveDraft({
        images: formImages,
        mushroomName: formMushroomName,
        description: formDescription,
        toxicity: formToxicity,
        habitat: formHabitat,
        features: formFeatures,
        lat: newSightingPos?.[0] ?? userLocation?.[0] ?? 0,
        lng: newSightingPos?.[1] ?? userLocation?.[1] ?? 0,
      });
    }, 3000);
    return () => clearTimeout(timeout);
  }, [formImages, formMushroomName, formDescription, formToxicity, formHabitat, formFeatures, newSightingPos, userLocation, showModal, saveDraft]);

  useEffect(() => {
    if (!showModal) return;
    const draft = loadDraft();
    if (draft && formImages.length === 0 && !formMushroomName) {
      if (draft.images.length > 0 || draft.mushroomName || draft.description) {
        const shouldRestore = window.confirm('Tenés un borrador guardado. ¿Continuar donde lo dejaste?');
        if (shouldRestore) {
          setFormImages(draft.images);
          setFormMushroomName(draft.mushroomName);
          setFormDescription(draft.description);
          setFormToxicity(draft.toxicity);
          setFormHabitat(draft.habitat);
          setFormFeatures(draft.features);
          if (draft.lat && draft.lng) {
            setNewSightingPos([draft.lat, draft.lng]);
          }
        } else {
          clearDraft();
        }
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showModal]);

  const removeFormImage = useCallback((index: number) => {
    setFormImages(prev => prev.filter((_, i) => i !== index));
    setFormImageFiles(prev => prev.filter((_, i) => i !== index));
  }, []);

  const runAiRecognition = useCallback(async () => {
    if (formImages.length === 0) return;
    try {
      setIsAiLoading(true);
      setAiResult(null);
      const dataUrl = formImages[0];
      const base64 = dataUrl.split(',')[1];
      const mimeType = /data:(.*?);base64/.exec(dataUrl)?.[1] || "image/jpeg";

      const { identifyMushroomFromImage } = await import('../lib/gemini');
      const analysis = await identifyMushroomFromImage(base64, mimeType);
      setAiResult(analysis);

      if (analysis.status === 'unidentifiable') {
        setFormMushroomName('');
        setFormDescription(
          (analysis.warnings?.[0] || 'La foto no permite identificación. ') +
          'Tips: usá buena luz, que se vea el pie, las láminas y el sombrero completos.'
        );
        setFormToxicity('Desconocido');
        setFormHabitat('');
        setFormFeatures('');
        return;
      }

      if (analysis.status === 'unknown') {
        setFormMushroomName(analysis.displayName);
        setFormDescription(
          (analysis.description || '') +
          '\n\n[IA] Este hongo no fue reconocido en la base de datos. ' +
          'Si sos experto, ayudanos a identificarlo.'
        );
        setFormToxicity(analysis.toxicity || 'Desconocido');
        setFormHabitat(analysis.habitat || '');
        setFormFeatures(analysis.features || '');
        return;
      }

      const display = analysis.taxonomy.species
        ? `${analysis.taxonomy.species} (${analysis.commonName || analysis.displayName})`
        : analysis.displayName;

      setFormMushroomName(display);
      setFormDescription(
        (analysis.description || '') +
        (analysis.confidence < 80 && analysis.candidates
          ? `\n\n[IA] Identificación con ${analysis.confidence}% de confianza. ` +
            `Otras posibilidades: ${analysis.candidates.slice(0, 3).map(c => `${c.taxon} (${c.confidence}%)`).join(', ')}.`
          : '')
      );
      setFormToxicity(analysis.toxicity || 'Desconocido');
      setFormHabitat(analysis.habitat || '');
      setFormFeatures(analysis.features || '');

    } catch (err) {
      console.error("AI Analysis error", err);
      alert("Error en el reconocimiento. Verificá tu conexión.");
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
    setAiResult(null);
    clearDraft();
  }, [clearDraft]);

  const handleAddNewSighting = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitInFlightRef.current) return;

    const form = e.target as HTMLFormElement;
    const mushroomName = (form.elements.namedItem('mushroomName') as HTMLInputElement).value;
    const description = (form.elements.namedItem('description') as HTMLTextAreaElement).value;

    if (!user) return;

    const pos = newSightingPos || userLocation;
    if (!pos) {
      alert("No se ha podido determinar su ubicación actual. Inicie la geolocalización o seleccione un punto en el mapa.");
      return;
    }

    const isRemote = newSightingPos !== null && userLocation && getDistance(userLocation[0], userLocation[1], pos[0], pos[1]) > 0.1;
    const initialStatus = isRemote ? 'draft' : 'unconfirmed';

    try {
      submitInFlightRef.current = true;
      setIsSubmittingSighting(true);

      const points = initialStatus === 'draft' ? 5 : 25;
      const networkId = findNearbyMycelium(pos[0], pos[1], mushroomName);

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

      formImageFiles.forEach(file => {
        formData.append('images', file);
      });

      const record = await createSighting(formData);

      if (record && record.id) {
        const sightingLat = pos[0];
        const sightingLng = pos[1];
        const sightingDate = new Date().toISOString().split('T')[0];
        
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

      if (currentUserProfile) {
        const newMerits = [...(currentUserProfile.merits || [])];
        await updateUserProfile(user.uid, {
          points: (currentUserProfile.points || 0) + points,
          merits: newMerits,
        });
      }

      await createLog('sighting_add', `Registró "${mushroomName}" como ${initialStatus === 'draft' ? 'Borrador remoto' : 'Hallazgo local'}`);
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
    aiResult,
    handleImageUpload,
    removeFormImage,
    runAiRecognition,
    handleAddNewSighting,
    resetForm,
    prefillFromCapture,
    loadDraft,
    clearDraft,
  };
}
