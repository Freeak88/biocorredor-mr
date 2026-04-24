import React, { useState, useEffect } from 'react';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut,
  User
} from 'firebase/auth';
import { 
  collection, 
  query, 
  onSnapshot, 
  orderBy,
  addDoc,
  serverTimestamp,
  doc,
  setDoc
} from 'firebase/firestore';
import { auth, db } from './lib/firebase';
import { 
  Sprout, 
  Map as MapIcon, 
  Plus, 
  LogOut, 
  User as UserIcon,
  MessageSquare,
  Search,
  Info,
  Download,
  Database,
  Users,
  Wind,
  Award,
  Navigation,
  MapPin,
  Send,
  ShieldCheck,
  Smartphone,
  Trash2,
  Bell,
  Flag,
  AlertTriangle,
  LeafyGreen
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import L from 'leaflet';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

// Fix Leaflet icon issue by using CDN URLs to avoid module resolution errors in some environments
const DefaultIcon = L.icon({
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

interface Sighting {
  id: string;
  userId: string;
  userName: string;
  userPhoto?: string;
  mushroomName: string;
  description: string;
  toxicity?: string;
  lat: number;
  lng: number;
  imageUrl?: string; // Keep for backward compatibility/primary thumb
  images?: { url: string; createdAt: any; isPrimary?: boolean; aiScore?: number }[];
  networkId?: string; // Links sightings part of the same mycelium/colony
  status: 'identified' | 'unconfirmed' | 'expert_verified' | 'draft';
  habitat?: string;
  features?: string;
  createdAt: any;
  lastGeofirmedAt?: any;
  geofirmedBy?: string;
}

interface ChatMessage {
  id: string;
  userId: string;
  userName: string;
  userPhoto?: string;
  text: string;
  lat: number;
  lng: number;
  createdAt: any;
}

interface UserProfile {
  id: string;
  displayName: string;
  photoURL?: string;
  points: number;
  merits: string[];
  lastSeen: any;
  location: { lat: number; lng: number };
  email: string;
}

interface ActionLog {
  id: string;
  userId: string;
  userName: string;
  action: string;
  details: string;
  createdAt: any;
}

interface Report {
  id: string;
  reporterId: string;
  reporterName: string;
  type: 'message' | 'user' | 'sighting' | 'comment';
  targetId: string;
  reason: string;
  content?: string;
  status: 'pending' | 'reviewed' | 'dismissed';
  createdAt: any;
}

interface Comment {
  id: string;
  userId: string;
  userName: string;
  userPhoto?: string;
  text: string;
  createdAt: any;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [sightings, setSightings] = useState<Sighting[]>([]);
  const [isAddingMode, setIsAddingMode] = useState(false);
  const [newSightingPos, setNewSightingPos] = useState<[number, number] | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [selectedSighting, setSelectedSighting] = useState<Sighting | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [analyzingColors, setAnalyzingColors] = useState(false);
  const [loading, setLoading] = useState(true);
  const [onlineUsers, setOnlineUsers] = useState<UserProfile[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatRadius, setChatRadius] = useState(20); // Default 20km
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [showChat, setShowChat] = useState(false);
  const [currentUserProfile, setCurrentUserProfile] = useState<UserProfile | null>(null);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [logs, setLogs] = useState<ActionLog[]>([]);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [showReportModal, setShowReportModal] = useState<{ type: 'message' | 'user' | 'sighting' | 'comment', targetId: string, content?: string } | null>(null);
  const [activeAdminTab, setActiveAdminTab] = useState<'logs' | 'reports'>('logs');
  const [searchQuery, setSearchQuery] = useState('');
  const [sightingComments, setSightingComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');

  // New states for Image-First Registration
  const [uploadingImage, setUploadingImage] = useState(false);
  const [formImages, setFormImages] = useState<string[]>([]);
  const [formMushroomName, setFormMushroomName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formToxicity, setFormToxicity] = useState('Desconocido');
  const [formHabitat, setFormHabitat] = useState('');
  const [formFeatures, setFormFeatures] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [activeGalleryIndex, setActiveGalleryIndex] = useState<number | null>(null);

  const fileToDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleImageUpload = async (file: File) => {
    try {
      const dataUrl = await fileToDataUrl(file);
      setFormImages(prev => [...prev, dataUrl]);
    } catch (err) {
      console.error("Image upload error", err);
    }
  };

  const runAiRecognition = async () => {
    if (formImages.length === 0) return;
    
    try {
      setIsAiLoading(true);
      const dataUrl = formImages[0];
      const base64 = dataUrl.split(',')[1];
      const mimeType = "image/jpeg"; // Simplified for now or could extract from dataUrl

      const { identifyMushroomFromImage } = await import('./lib/gemini');
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
      alert("Error en el reconocimiento. Verifique su conexión.");
    } finally {
      setIsAiLoading(false);
    }
  };

  const findNearbyMycelium = (lat: number, lng: number, speciesName: string) => {
    const RADIUS_THRESHOLD = 0.0001; // ~10m
    const match = sightings.find(s => {
      const dist = Math.sqrt(Math.pow(s.lat - lat, 2) + Math.pow(s.lng - lng, 2));
      const sameSpecies = s.mushroomName.toLowerCase().includes(speciesName.split(' ')[0].toLowerCase());
      return dist < RADIUS_THRESHOLD && sameSpecies;
    });
    return match ? (match.networkId || match.id) : null;
  };
  const [mapCentered, setMapCentered] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);

  const isAdmin = user?.email === 'DamianFerraro@gmail.com';

  const filteredSightings = React.useMemo(() => {
    if (!searchQuery.trim()) return sightings;
    const q = searchQuery.toLowerCase();
    return sightings.filter(s => 
      s.mushroomName.toLowerCase().includes(q) || 
      s.description.toLowerCase().includes(q)
    );
  }, [sightings, searchQuery]);

  // Memoized markers to prevent MarkerClusterGroup from re-calculating on every App render
  const sightingMarkers = React.useMemo(() => (
    filteredSightings.map(s => (
      <Marker 
        key={s.id} 
        position={[s.lat, s.lng]}
        opacity={s.status === 'draft' ? 0.6 : 1}
        icon={L.divIcon({
          className: 'mushroom-marker',
          html: `
            <div class="relative flex items-center justify-center">
              <div class="absolute w-8 h-8 rounded-full border-2 border-atlas-ink bg-atlas-paper shadow-md flex items-center justify-center ${s.status === 'draft' ? 'opacity-50 grayscale' : 'opacity-100'}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4 text-atlas-ink">
                  <path d="M7 20h10a2 2 0 0 0 2-2c0-3.31-2.69-6-6-6s-6 2.69-6 6a2 2 0 0 0 2 2z"/>
                  <path d="M12 12V4"/>
                </svg>
              </div>
              ${s.status === 'draft' ? '<div class="absolute -top-1 -right-1 w-3 h-3 bg-atlas-earth rounded-full border border-atlas-paper animate-pulse"></div>' : ''}
            </div>
          `,
          iconSize: [32, 32],
          iconAnchor: [16, 16]
        })}
      >
        <Popup autoPan={false}>
          <div className="w-56 font-serif p-2">
            <h3 className="text-lg italic font-bold text-atlas-ink m-0 leading-tight border-b border-atlas-ink/10 pb-2">{s.mushroomName}</h3>
            <p className="text-xs text-atlas-ink/70 my-3 leading-relaxed italic line-clamp-2">"{s.description.slice(0, 60)}..."</p>
            <button 
              onClick={() => handleSightingClick(s)}
              className="w-full text-center py-2 text-[10px] font-sans font-black uppercase tracking-widest border border-atlas-ink/10 bg-atlas-paper hover:bg-atlas-stone transition-colors"
            >
              Consultar Archivo
            </button>
          </div>
        </Popup>
      </Marker>
    ))
  ), [filteredSightings]);

  const userMarkers = React.useMemo(() => (
    onlineUsers.map(u => (
      <Marker 
        key={u.id} 
        position={[u.location.lat, u.location.lng]}
        icon={L.divIcon({
          className: 'user-marker-icon',
          html: `
            <div class="user-avatar-marker border-2 border-atlas-ink shadow-atlas">
              <img src="${u.photoURL || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + u.displayName}" referrerPolicy="no-referrer" />
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
            <p className="font-bold italic text-atlas-ink text-sm leading-tight">{u.displayName}</p>
            <div className="w-8 h-[1px] bg-atlas-earth mx-auto mt-2" />
          </div>
        </Popup>
      </Marker>
    ))
  ), [onlineUsers]);

  useEffect(() => {
    if (!selectedSighting) {
      setSightingComments([]);
      return;
    }

    const q = query(
      collection(db, 'sightings', selectedSighting.id, 'comments'),
      orderBy('createdAt', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setSightingComments(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Comment)));
    });

    return () => unsubscribe();
  }, [selectedSighting]);

  const handleSightingClick = async (s: Sighting) => {
    setSelectedSighting(s);
    setAiAnalysis(null);
    setAnalyzingColors(true);
    
    try {
      // Logic for existing sightings: if we have an imageUrl, we could re-analyze it,
      // but for now we just show the recorded description.
      // We keep the loading state for UX consistency if needed, but we don't break with non-existent imports.
    } catch (err) {
      console.error("AI Context Error", err);
    } finally {
      setAnalyzingColors(false);
    }
  };

  const handleGeofirm = async (s: Sighting) => {
    if (!user || !userLocation) {
      alert("Es necesario activar la geolocalización para validar el hallazgo.");
      return;
    }
    const dist = getDistance(userLocation[0], userLocation[1], s.lat, s.lng);
    
    if (dist > 0.05) { // 50 meters
      alert(`Debe estar físicamente en el lugar para geofirmar el hallazgo. Distancia actual: ${(dist * 1000).toFixed(0)}m (Máximo permitido: 50m)`);
      return;
    }

    try {
      await setDoc(doc(db, 'sightings', s.id), {
        status: 'unconfirmed',
        updatedAt: serverTimestamp(),
        // Note: In a real app, we'd upload the photo to Storage here
        lastGeofirmedAt: serverTimestamp(),
        geofirmedBy: user.uid
      }, { merge: true });

      if (currentUserProfile) {
        await setDoc(doc(db, 'users', user.uid), {
          points: (currentUserProfile.points || 0) + 50,
          merits: [...(currentUserProfile.merits || []), 'Geofirmador Oficial'].filter((v, i, a) => a.indexOf(v) === i)
        }, { merge: true });
      }

      setSelectedSighting({ ...s, status: 'unconfirmed' });
      createLog('geofirm', `Geofirmó hallazgo de "${s.mushroomName}" in situ`);
    } catch (err) {
      console.error("Geofirm error", err);
    }
  };

  const exportToGeoJSON = () => {
    const geojson = {
      type: 'FeatureCollection',
      features: sightings.map(s => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [s.lng, s.lat]
        },
        properties: {
          id: s.id,
          name: s.mushroomName,
          description: s.description,
          userName: s.userName,
          status: s.status,
          date: s.createdAt ? s.createdAt.toDate().toISOString() : null
        }
      }))
    };

    const blob = new Blob([JSON.stringify(geojson, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `fungimap_qgis_export_${format(new Date(), 'yyyy-MM-dd')}.geojson`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    createLog('export_data', `Exportó ${sightings.length} puntos a GeoJSON`);
  };

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // Safety timeout to clear loading if auth takes too long
    const safetyTimeout = setTimeout(() => {
      setLoading(false);
    }, 5000);

    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      clearTimeout(safetyTimeout);
      setUser(u);
      
      if (!u) {
        setLoading(false);
        return;
      }

      try {
        // Initial profile sync - don't block loading on this
        const profileRef = doc(db, 'users', u.uid);
        setDoc(profileRef, {
          displayName: u.displayName,
          email: u.email,
          photoURL: u.photoURL,
          updatedAt: serverTimestamp(),
          lastSeen: serverTimestamp()
        }, { merge: true }).catch(err => console.error("Profile sync error", err));

        createLog('login', 'Usuario ingresó a la plataforma').catch(() => {});

        // Watch Location and Update Presence
        const watchId = navigator.geolocation.watchPosition(
          async (pos) => {
            const loc = [pos.coords.latitude, pos.coords.longitude] as [number, number];
            setUserLocation(loc);
            setDoc(profileRef, {
              location: { lat: loc[0], lng: loc[1] },
              lastSeen: serverTimestamp()
            }, { merge: true }).catch(() => {});
          },
          (err) => console.error("Geo error", err),
          { enableHighAccuracy: true }
        );

        // Listen to own profile
        const unsubProfile = onSnapshot(profileRef, (snap) => {
          if (snap.exists()) {
            setCurrentUserProfile({ id: snap.id, ...snap.data() } as UserProfile);
          }
        });

        // We can stop loading now that we have the user state
        setLoading(false);

        // Store cleanup functions for when auth changes or component unmounts
        // (Though App is unlikely to unmount, we should be clean)
        return () => {
          navigator.geolocation.clearWatch(watchId);
          unsubProfile();
        };
      } catch (err) {
        console.error("Auth helper error", err);
        setLoading(false);
      }
    });

    return () => {
      unsubscribe();
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  // Admin Data Listener
  useEffect(() => {
    if (!isAdmin) return;
    
    // Listen to all users
    const unsubUsers = onSnapshot(query(collection(db, 'users'), orderBy('lastSeen', 'desc')), (snap) => {
      setAllUsers(snap.docs.map(d => ({ id: d.id, ...d.data() } as UserProfile)));
    });

    // Listen to logs
    const unsubLogs = onSnapshot(query(collection(db, 'logs'), orderBy('createdAt', 'desc')), (snap) => {
      setLogs(snap.docs.map(d => ({ id: d.id, ...d.data() } as ActionLog)));
    });

    // Listen to reports
    const unsubReports = onSnapshot(query(collection(db, 'reports'), orderBy('createdAt', 'desc')), (snap) => {
      setReports(snap.docs.map(d => ({ id: d.id, ...d.data() } as Report)));
    });

    return () => {
      unsubUsers();
      unsubLogs();
      unsubReports();
    };
  }, [isAdmin]);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
    }
  };

  // Online Users (Presence)
  useEffect(() => {
    const q = query(collection(db, 'users'), orderBy('lastSeen', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const activeThreshold = Date.now() - 5 * 60 * 1000; // 5 mins
      const users = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as UserProfile))
        .filter(u => u.lastSeen?.toMillis() > activeThreshold && u.id !== user?.uid && u.location);
      setOnlineUsers(users);
    });
    return () => unsubscribe();
  }, [user]);

  // Chat Feed
  useEffect(() => {
    const q = query(collection(db, 'chat_messages'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ChatMessage));
      setChatMessages(msgs);
    });
    return () => unsubscribe();
  }, []);

  const getDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371; // km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  const filteredMessages = chatMessages;

  const handleSendMessage = async (text: string) => {
    if (!user || !userLocation || !text.trim()) return;
    await addDoc(collection(db, 'chat_messages'), {
      userId: user.uid,
      userName: user.displayName,
      userPhoto: user.photoURL,
      text,
      lat: userLocation[0],
      lng: userLocation[1],
      createdAt: serverTimestamp()
    });
    createLog('chat_message', `Envió mensaje global`);
  };

  // Sightings Feed
  useEffect(() => {
    const q = query(collection(db, 'sightings'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Sighting[];
      setSightings(data);
    });
    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login failed", error);
    }
  };

  const handleLogout = () => signOut(auth);

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedSighting || !newComment.trim()) return;

    try {
      await addDoc(collection(db, 'sightings', selectedSighting.id, 'comments'), {
        userId: user.uid,
        userName: user.displayName,
        userPhoto: user.photoURL,
        text: newComment.trim(),
        createdAt: serverTimestamp()
      });
      
      if (currentUserProfile) {
        await setDoc(doc(db, 'users', user.uid), {
          points: (currentUserProfile.points || 0) + 2
        }, { merge: true });
      }

      setNewComment('');
      createLog('comment_add', `Comentó en el hallazgo "${selectedSighting.mushroomName}"`);
    } catch (err) {
      console.error("Error adding comment", err);
    }
  };

  const createLog = async (action: string, details: string) => {
    if (!user) return;
    try {
      await addDoc(collection(db, 'logs'), {
        userId: user.uid,
        userName: user.displayName,
        action,
        details,
        createdAt: serverTimestamp()
      });
    } catch (e) {
      console.error("Log error", e);
    }
  };

  const submitReport = async (reason: string) => {
    if (!user || !showReportModal) return;
    try {
      await addDoc(collection(db, 'reports'), {
        reporterId: user.uid,
        reporterName: user.displayName,
        type: showReportModal.type,
        targetId: showReportModal.targetId,
        content: showReportModal.content || '',
        reason,
        status: 'pending',
        createdAt: serverTimestamp()
      });
      createLog('report_submitted', `Denunció ${showReportModal.type} (${showReportModal.targetId}) por ${reason}`);
      setShowReportModal(null);
    } catch (e) {
      console.error("Report error", e);
    }
  };

  // Add Sighting Handler Update
  const handleAddNewSighting = async (e: React.FormEvent) => {
    e.preventDefault();
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
      const points = initialStatus === 'draft' ? 5 : 25;
      const newMerits = [...(currentUserProfile?.merits || [])];
      
      const networkId = findNearbyMycelium(pos[0], pos[1], mushroomName);

      await addDoc(collection(db, 'sightings'), {
        userId: user.uid,
        userName: user.displayName || 'Explorador',
        userPhoto: user.photoURL || '',
        mushroomName,
        description,
        toxicity: formToxicity,
        habitat: formHabitat,
        features: formFeatures,
        lat: pos[0],
        lng: pos[1],
        status: initialStatus,
        imageUrl: formImages[0] || '',
        images: formImages.map((url, i) => ({ url, createdAt: new Date(), isPrimary: i === 0 })),
        networkId: networkId || null,
        createdAt: serverTimestamp()
      });

      await setDoc(doc(db, 'users', user.uid), {
        points: (currentUserProfile?.points || 0) + points,
        merits: newMerits
      }, { merge: true });

      createLog('sighting_add', `Registró "${mushroomName}" como ${initialStatus === 'draft' ? 'Borrador remoto' : 'Hallazgo local'}`);
      
      // Reset form states
      setFormMushroomName('');
      setFormDescription('');
      setFormToxicity('Desconocido');
      setFormHabitat('');
      setFormFeatures('');
      setFormImages([]);
      setShowModal(false);
      setIsAddingMode(false);
      setNewSightingPos(null);
    } catch (err) {
      console.error("Error saving sighting", err);
    }
  };

  if (loading) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-atlas-paper">
        <div className="relative">
          <div className="w-32 h-32 border-2 border-dashed border-atlas-ink rounded-full animate-[spin_10s_linear_infinite] flex items-center justify-center" />
          <Sprout className="w-12 h-12 text-atlas-ink absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
        </div>
        <p className="text-atlas-ink font-serif italic mt-8 text-xl animate-pulse">Consultando el Atlas...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-atlas-paper relative">
      
      {/* Header */}
      <header className="bg-atlas-paper text-atlas-ink p-3 flex justify-between items-center border-b border-atlas-ink z-50 relative shrink-0">
        <div className="flex items-center gap-3">
          <Sprout className="w-6 h-6 text-atlas-ink" />
          <h1 className="text-xl italic font-serif tracking-tight">Fungi Atlas <span className="text-[10px] opacity-50">.03</span></h1>
        </div>

        <div className="flex items-center gap-6">
          {user && (
            <button 
              onClick={() => setShowSidebar(!showSidebar)}
              className={`p-2 transition-all ${showSidebar ? 'text-atlas-earth' : 'text-atlas-ink opacity-40 hover:opacity-100'}`}
              title="Buscar / Filtros"
            >
              <Search className="w-5 h-5" />
            </button>
          )}
          {user ? (
            <div className="flex items-center gap-4 font-sans font-black uppercase tracking-widest text-[9px]">
              <span className="hidden sm:inline-block border-b border-atlas-ink/20">{user.displayName}</span>
              
              <div className="flex items-center gap-4 border-l border-atlas-ink/10 pl-4">
                <button 
                  onClick={() => setShowChat(!showChat)}
                  className={`transition-all ${showChat ? 'text-atlas-ink underline underline-offset-4' : 'text-atlas-ink opacity-40 hover:opacity-100'}`}
                >
                  Chat
                </button>
                {isAdmin && (
                  <button 
                    onClick={() => setShowAdminPanel(!showAdminPanel)}
                    className={`transition-all ${showAdminPanel ? 'text-atlas-earth font-black' : 'text-atlas-ink opacity-40 hover:opacity-100'}`}
                  >
                    Admin
                  </button>
                )}
                <button 
                  onClick={handleLogout}
                  className="text-atlas-ink opacity-40 hover:opacity-100"
                >
                  Salir
                </button>
              </div>
            </div>
          ) : (
            <button 
              onClick={handleLogin}
              className="atlas-button !py-1 text-[9px]"
            >
              Identificarse
            </button>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 relative overflow-hidden">
        {/* Map as Background */}
        <div className="absolute inset-0 z-0">
          <MapContainer center={[-34.6037, -58.3816]} zoom={13} scrollWheelZoom={true} zoomControl={false} attributionControl={false} className="h-full w-full">
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            
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
            </MarkerClusterGroup>

            {userMarkers}
            <LocationMarker 
              isAddingMode={isAddingMode}
              setIsAddingMode={setIsAddingMode}
              setNewSightingPos={setNewSightingPos}
              setShowModal={setShowModal}
              userLocation={userLocation}
              mapCentered={mapCentered}
              setMapCentered={setMapCentered}
              newSightingPos={newSightingPos}
            />
          </MapContainer>
        </div>

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

        {/* Action Controls - Bottom Toolbar */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-[1001] w-full max-w-lg px-6">
           {user ? (
             <motion.div 
               initial={{ y: 50, opacity: 0 }}
               animate={{ y: 0, opacity: 1 }}
               className="flex items-center justify-between gap-4"
             >
                {/* Left: Toggles */}
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

                {/* Center: Main Action */}
                <button 
                  onClick={() => {
                    setNewSightingPos(null);
                    setShowModal(true);
                  }}
                  className="flex-1 bg-atlas-ink text-atlas-paper py-4 border-2 border-atlas-ink shadow-atlas hover:bg-atlas-earth transition-all flex items-center justify-center gap-3"
                >
                  <Plus className="w-5 h-5" />
                  <span className="text-[10px] font-sans font-black uppercase tracking-[0.2em]">Añadir Hallazgo</span>
                </button>

                {/* Right: GPS */}
                <button 
                  onClick={() => {
                    if (userLocation) {
                      setMapCentered(false);
                    } else {
                      alert("Buscando señal de satélite...");
                    }
                  }}
                  className="bg-atlas-paper p-4 border-2 border-atlas-ink shadow-atlas hover:bg-atlas-stone transition-all"
                  title="Mi Ubicación"
                >
                  <Navigation className="w-5 h-5 text-atlas-ink" />
                </button>
             </motion.div>
           ) : (
             <div className="bg-atlas-paper px-12 py-6 border-2 border-atlas-ink shadow-atlas text-center">
                <p className="font-serif italic text-lg mb-4">Ingresa para expandir el Atlas micológico</p>
                <button onClick={handleLogin} className="atlas-button !px-12">Identificarse</button>
             </div>
           )}
        </div>

        {/* Floating Sidebar (Filter) */}
        <AnimatePresence>
          {showSidebar && (
            <motion.aside 
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -20, opacity: 0 }}
              className="absolute top-6 left-6 w-[280px] bg-atlas-paper border-2 border-atlas-ink shadow-atlas flex flex-col z-[1001]"
            >
              <div className="p-4 flex items-center gap-3 bg-atlas-paper">
                <Search className="w-4 h-4 text-atlas-ink opacity-40 shrink-0" />
                <input 
                  type="text" 
                  placeholder="Filtro rápido..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-transparent border-none py-1 text-xs font-sans focus:outline-none placeholder:opacity-40 flex-1"
                />
              </div>
              
              {searchQuery.trim().length > 0 && (
                <div className="max-h-[300px] overflow-y-auto p-4 pt-0 space-y-3 border-t border-atlas-ink/10">
                  <h2 className="text-[8px] font-sans font-black uppercase tracking-widest opacity-40 mt-3 mb-2">Hallazgos</h2>
                  {filteredSightings.map(s => (
                    <div 
                      key={s.id}
                      onClick={() => handleSightingClick(s)}
                      className={`group cursor-pointer border-b border-atlas-ink/5 pb-2 last:border-0 hover:bg-atlas-stone/20 transition-all ${s.status === 'draft' ? 'opacity-60' : ''}`}
                    >
                      <div className="flex justify-between items-start mb-1">
                         <h4 className="text-sm italic font-serif leading-tight group-hover:text-atlas-earth">{s.mushroomName}</h4>
                      </div>
                      <p className="text-[8px] opacity-40 font-sans font-black uppercase tracking-widest">{s.userName}</p>
                    </div>
                  ))}
                  {filteredSightings.length === 0 && (
                    <p className="text-[10px] italic opacity-40 font-serif pb-2">Sin coincidencias.</p>
                  )}
                </div>
              )}
              
              {isAdmin && (
                <div className="p-3 border-t border-atlas-ink/10 bg-atlas-stone/20">
                   <button onClick={exportToGeoJSON} className="w-full text-left flex items-center gap-2 text-[9px] font-sans font-black uppercase tracking-widest opacity-40 hover:opacity-100 transition-opacity">
                     <Download className="w-3 h-3" /> Exportar a QGIS
                   </button>
                </div>
              )}
            </motion.aside>
          )}
        </AnimatePresence>

          <AnimatePresence>
            {showChat && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-atlas-paper z-[2000] flex flex-col overflow-hidden"
              >
                 <div className="p-8 bg-atlas-ink text-atlas-paper flex justify-between items-center relative overflow-hidden shrink-0">
                    <div className="absolute inset-0 dotted-bg opacity-10" />
                    <h3 className="text-xs font-sans font-black uppercase tracking-[0.3em] flex items-center gap-3 relative z-10">
                      <MessageSquare className="w-5 h-5 text-atlas-earth" />
                      Mesa de Diálogo Global
                    </h3>
                    <button 
                      onClick={() => setShowChat(false)}
                      className="relative z-10 p-2 hover:bg-atlas-paper/10 rounded-full transition-colors"
                    >
                      <Plus className="w-6 h-6 rotate-45 text-atlas-paper" />
                    </button>
                 </div>

                 <div className="flex-1 overflow-y-auto p-8 sm:p-12 space-y-8 bg-atlas-paper dotted-bg [background-size:15px_15px]">
                    <div className="max-w-3xl mx-auto space-y-8">
                      {filteredMessages.length === 0 ? (
                        <div className="text-center mt-20 text-atlas-ink/30 italic font-serif">
                          <Wind className="w-16 h-16 mx-auto mb-6 opacity-20" />
                          <p className="text-xl leading-relaxed">Solo el viento susurra entre los pinos...<br/>Inicie una conversación trascendental.</p>
                        </div>
                      ) : (
                        filteredMessages.map(m => (
                          <div key={m.id} className="group relative flex flex-col pl-6 border-l-2 border-atlas-earth/20">
                             <div className="flex justify-between items-baseline mb-2">
                                <div className="flex items-center gap-3">
                                  <span className="text-[10px] font-sans font-black uppercase tracking-widest text-atlas-earth">{m.userName}</span>
                                  <span className="text-[8px] font-sans font-black uppercase tracking-widest px-2 py-0.5 bg-atlas-stone rounded-sm opacity-60">Global</span>
                                </div>
                                <span className="text-[9px] font-mono opacity-30">{format(m.createdAt?.toDate() || new Date(), 'HH:mm dd MMM')}</span>
                             </div>
                             <p className="text-lg font-serif text-atlas-ink leading-relaxed italic">
                                "{m.text}"
                             </p>
                             {m.userId !== user?.uid && (
                               <button 
                                 onClick={() => setShowReportModal({ type: 'message', targetId: m.id, content: m.text })}
                                 className="absolute -left-3 top-0 opacity-0 group-hover:opacity-40 hover:opacity-100 transition-all text-atlas-ink bg-atlas-paper p-1.5 rounded-full border border-atlas-ink shadow-sm"
                                 title="Denunciar"
                                >
                                 <Flag className="w-3 h-3" />
                               </button>
                             )}
                          </div>
                        ))
                      )}
                    </div>
                 </div>

                 <div className="p-8 bg-atlas-stone/20 border-t border-atlas-ink/10 shrink-0">
                    <form 
                      className="max-w-3xl mx-auto flex flex-col sm:flex-row gap-4"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const input = e.currentTarget.elements.namedItem('msg') as HTMLInputElement;
                        handleSendMessage(input.value);
                        input.value = '';
                      }}
                    >
                      <input 
                        name="msg"
                        placeholder="Comparta sus hallazgos con el mundo..."
                        className="flex-1 bg-atlas-paper border-2 border-atlas-ink p-4 font-serif italic text-lg focus:outline-none focus:border-atlas-earth transition-all"
                      />
                      <button type="submit" className="bg-atlas-ink text-atlas-paper px-10 py-4 font-sans font-black uppercase tracking-widest hover:bg-atlas-earth transition-all flex items-center justify-center gap-3">
                        Emitir <Send className="w-4 h-4" />
                      </button>
                    </form>
                 </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Sighting Detail Overlay */}
          <AnimatePresence>
            {showAdminPanel && isAdmin && (
              <motion.div 
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="absolute inset-12 bg-atlas-paper z-[2000] shadow-atlas border border-atlas-ink flex flex-col overflow-hidden"
              >
                 <div className="p-8 bg-atlas-ink text-atlas-paper flex justify-between items-center relative overflow-hidden">
                    <div className="absolute inset-0 dotted-bg opacity-10" />
                    <div className="flex items-center gap-4 relative z-10">
                       <ShieldCheck className="w-10 h-10 text-atlas-earth" />
                       <div>
                          <h2 className="text-2xl italic font-serif tracking-tight">Estación de Control</h2>
                          <p className="text-[10px] font-sans font-black uppercase tracking-[0.3em] opacity-40 leading-none mt-1 italic">Vigilancia del Atlas .03</p>
                       </div>
                    </div>
                    <button 
                      onClick={() => setShowAdminPanel(false)}
                      className="p-2 hover:bg-atlas-paper/20 rounded-full transition-colors relative z-10"
                    >
                      <Plus className="w-6 h-6 rotate-45" />
                    </button>
                 </div>

                 <div className="flex-1 overflow-hidden flex">
                    {/* Admin Stats & Stats */}
                    <div className="w-full md:w-[320px] border-r border-atlas-ink/10 p-8 space-y-8 overflow-y-auto bg-atlas-paper">
                       <div className="flex flex-col gap-4">
                          <div className="atlas-card !p-6 border-l-4 border-l-atlas-ink">
                             <p className="text-[10px] font-sans font-black text-atlas-ink/40 uppercase mb-2 tracking-widest">Colaboradores</p>
                             <p className="text-4xl italic font-serif">{allUsers.length}</p>
                          </div>
                          <div className="atlas-card !p-6 border-l-4 border-l-atlas-earth">
                             <p className="text-[10px] font-sans font-black text-atlas-ink/40 uppercase mb-2 tracking-widest">Almas en Línea</p>
                             <p className="text-4xl italic font-serif">{onlineUsers.length}</p>
                          </div>
                       </div>

                       <section>
                          <h4 className="text-[10px] font-sans font-black text-atlas-ink uppercase mb-4 tracking-[0.3em] flex items-center gap-3">
                            <div className="w-2 h-2 bg-atlas-earth rounded-full" /> Cartógrafos
                          </h4>
                          <div className="space-y-4">
                             {allUsers.slice(0, 5).map(u => (
                               <div key={u.id} className="group flex items-center gap-3 p-3 hover:bg-atlas-stone transition-colors border-b border-atlas-ink/5">
                                  {u.photoURL ? <img src={u.photoURL} alt="" className="w-8 h-8 grayscale opacity-70 group-hover:grayscale-0 group-hover:opacity-100 transition-all border border-atlas-ink rounded-full" referrerPolicy="no-referrer" /> : <div className="w-8 h-8 rounded-full bg-atlas-stone border border-atlas-ink" />}
                                  <div className="flex-1 min-w-0">
                                     <p className="text-sm font-serif italic truncate">{u.displayName}</p>
                                     <p className="text-[9px] font-mono opacity-30 truncate">{u.email}</p>
                                  </div>
                               </div>
                             ))}
                          </div>
                       </section>

                       <section className="bg-atlas-ink text-atlas-paper p-8 mt-auto rounded-tl-[60px]">
                          <h4 className="text-[10px] font-sans font-black uppercase mb-4 tracking-[0.3em] flex items-center gap-2">
                             <Bell className="w-3 h-3 opacity-40" /> Boletín del Atlas
                          </h4>
                          <p className="text-[11px] font-serif italic opacity-60 mb-4 leading-relaxed">Emita una directiva global para todos los inspectores en campo.</p>
                          <form className="flex flex-col gap-4" onSubmit={(e) => {
                             e.preventDefault();
                             const input = (e.target as any).elements.namedItem('note') as HTMLInputElement;
                             if (input.value.trim()) {
                                handleSendMessage(`[DIRECTIVA ATLAS]: ${input.value}`);
                                createLog('admin_broadcast', input.value);
                                input.value = '';
                             }
                          }}>
                             <input 
                               name="note"
                               placeholder="Contenido de la directiva..." 
                               className="bg-transparent border-b border-atlas-paper/20 py-2 text-xs font-sans focus:outline-none focus:border-atlas-paper"
                             />
                             <button type="submit" className="border border-atlas-paper py-2 text-[10px] font-sans font-black uppercase tracking-[0.2em] hover:bg-atlas-paper hover:text-atlas-ink transition-colors">Confirmar Aviso</button>
                          </form>
                       </section>
                    </div>

                    {/* Logs & Reports Feed */}
                    <div className="hidden md:flex flex-1 flex-col overflow-hidden bg-atlas-paper">
                       <div className="flex border-b border-atlas-ink/10 p-8 gap-12">
                          <button 
                            onClick={() => setActiveAdminTab('logs')}
                            className={`text-[11px] font-sans font-black uppercase tracking-[0.3em] pb-2 transition-all ${activeAdminTab === 'logs' ? 'text-atlas-ink border-b border-atlas-ink' : 'text-atlas-ink/30 hover:text-atlas-ink'}`}
                          >
                            REGISTRO DE ACTIVIDAD
                          </button>
                          <button 
                            onClick={() => setActiveAdminTab('reports')}
                            className={`text-[11px] font-sans font-black uppercase tracking-[0.3em] pb-2 transition-all flex items-center gap-3 ${activeAdminTab === 'reports' ? 'text-atlas-earth border-b border-atlas-earth' : 'text-atlas-ink/30 hover:text-atlas-ink'}`}
                          >
                            INCIDENCIAS {reports.length > 0 && <span className="text-[10px] italic">({reports.length})</span>}
                          </button>
                       </div>
                       
                       <div className="flex-1 p-8 overflow-y-auto space-y-4 font-serif">
                          {activeAdminTab === 'logs' ? (
                             logs.map(l => (
                               <div key={l.id} className="p-4 border-b border-atlas-ink/5 flex items-start gap-4 transition-all hover:bg-atlas-stone">
                                  <div className="w-8 h-8 flex items-center justify-center border border-atlas-ink/20 opacity-30">
                                     {l.action === 'login' && <UserIcon className="w-3.5 h-3.5" />}
                                     {l.action === 'chat_message' && <MessageSquare className="w-3.5 h-3.5" />}
                                     {l.action === 'admin_broadcast' && <AlertTriangle className="w-3.5 h-3.5" />}
                                     {l.action === 'sighting_add' && <Sprout className="w-3.5 h-3.5" />}
                                     {!['login', 'chat_message', 'admin_broadcast', 'sighting_add'].includes(l.action) && <Navigation className="w-3.5 h-3.5" />}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                     <div className="flex justify-between items-baseline mb-1">
                                        <p className="text-sm italic font-bold text-atlas-ink">{l.userName}</p>
                                        <span className="text-[9px] font-mono opacity-30 uppercase">{l.createdAt ? format(l.createdAt.toDate(), 'HH:mm:ss dd.MM') : 'Hoy'}</span>
                                     </div>
                                     <p className="text-[8px] font-sans font-black uppercase tracking-widest text-atlas-earth mb-1">{l.action}</p>
                                     <p className="text-sm text-atlas-ink/70 leading-relaxed italic">{l.details}</p>
                                  </div>
                               </div>
                             ))
                          ) : (
                             reports.map(r => (
                               <div key={r.id} className="atlas-card !p-8 border-l-4 border-l-red-600 flex flex-col gap-6">
                                  <div className="flex justify-between items-center">
                                     <div className="flex items-center gap-3">
                                        <AlertTriangle className="w-5 h-5 text-red-600" />
                                        <span className="text-[10px] font-sans font-black uppercase tracking-[0.3em] text-red-600">Alerta de {r.type}</span>
                                     </div>
                                     <span className="text-[9px] font-mono opacity-40">{format(r.createdAt?.toDate() || new Date(), 'HH:mm')}</span>
                                  </div>
                                  <div className="border-l-2 border-red-100 pl-6 text-sm italic font-serif text-red-900 leading-relaxed">
                                     "{r.content}"
                                  </div>
                                  <div className="flex items-center justify-between">
                                     <div className="text-[10px] font-sans font-black uppercase tracking-widest opacity-40 leading-loose">
                                        Informante: {r.reporterName}<br/>
                                        Causa: {r.reason}
                                     </div>
                                     <div className="flex gap-4">
                                        <button className="text-[10px] font-sans font-black uppercase tracking-widest text-red-600 underline">Extirpar</button>
                                        <button className="text-[10px] font-sans font-black uppercase tracking-widest opacity-30 hover:opacity-100 transition-opacity">Archivar</button>
                                     </div>
                                  </div>
                               </div>
                             ))
                          )}
                       </div>
                    </div>
                 </div>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {selectedSighting && (
              <>
                <div 
                  className="fixed inset-0 bg-atlas-ink/40 backdrop-blur-sm z-[1000] md:hidden" 
                  onClick={() => setSelectedSighting(null)} 
                />
                <motion.div 
                  initial={{ x: '100%', opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  exit={{ x: '100%', opacity: 0 }}
                  transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                  className="fixed md:absolute top-0 right-0 bottom-0 w-full md:w-[420px] bg-atlas-paper z-[1001] shadow-2xl border-l border-atlas-ink flex flex-col overflow-hidden"
                >
                  <div className="relative h-64 bg-atlas-stone flex flex-col items-center justify-center border-b border-atlas-ink overflow-hidden group shrink-0">
                    {selectedSighting.imageUrl ? (
                      <img 
                        src={selectedSighting.imageUrl} 
                        alt={selectedSighting.mushroomName} 
                        className="absolute inset-0 w-full h-full object-cover opacity-60 group-hover:scale-105 transition-transform duration-700"
                      />
                    ) : (
                      <div className="absolute inset-0 dotted-bg [background-size:10px_10px]" />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-atlas-paper via-atlas-paper/20 to-transparent" />
                    
                    <button 
                      onClick={() => setSelectedSighting(null)}
                      className="absolute top-4 right-4 z-20 p-2 bg-atlas-paper/80 backdrop-blur hover:bg-atlas-ink hover:text-atlas-paper rounded-full text-atlas-ink transition-all shadow-md"
                    >
                      <Plus className="w-5 h-5 rotate-45" />
                    </button>

                    <div className="relative z-10 flex flex-col items-center gap-3 mt-12">
                        <div 
                          onClick={() => (selectedSighting.images || selectedSighting.imageUrl) && setActiveGalleryIndex(0)}
                          className="w-24 h-24 border-4 border-atlas-paper rounded-full flex items-center justify-center bg-atlas-paper shadow-xl overflow-hidden cursor-pointer hover:scale-110 transition-transform"
                        >
                          {selectedSighting.imageUrl ? (
                            <img src={selectedSighting.imageUrl} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <Sprout className="w-10 h-10 opacity-40 text-atlas-ink" />
                          )}
                        </div>
                        <div className="px-6 text-center">
                          <div className="flex items-center justify-center gap-2 mb-2">
                            <span className={`px-2 py-0.5 rounded-full text-[8px] font-sans font-black uppercase tracking-widest border ${
                              selectedSighting.status === 'expert_verified' ? 'bg-atlas-earth text-atlas-paper border-atlas-earth' :
                              selectedSighting.status === 'identified' ? 'bg-atlas-stone text-atlas-ink border-atlas-ink/20' :
                              'bg-atlas-paper text-atlas-ink/40 border-atlas-ink/10'
                            }`}>
                              {selectedSighting.status === 'expert_verified' ? 'Verificado por Experto' : 
                               selectedSighting.status === 'identified' ? 'Identificado' : 'Encuentro Fugaz'}
                            </span>
                            {selectedSighting.toxicity && (
                              <span className={`px-2 py-0.5 rounded-full text-[8px] font-sans font-black uppercase tracking-widest border ${
                                selectedSighting.toxicity === 'Comestible' ? 'bg-green-100 text-green-800 border-green-200' :
                                selectedSighting.toxicity === 'Tóxico' ? 'bg-orange-100 text-orange-800 border-orange-200' :
                                selectedSighting.toxicity === 'Mortal' ? 'bg-red-100 text-red-800 border-red-200' :
                                'bg-stone-100 text-stone-800 border-stone-200'
                              }`}>
                                {selectedSighting.toxicity}
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] font-sans font-black uppercase tracking-[0.3em] text-atlas-earth mb-1">Registro de Campo</p>
                          <h2 className="text-2xl md:text-3xl italic font-serif leading-tight text-atlas-ink">{selectedSighting.mushroomName}</h2>
                          <p className="text-[9px] font-sans opacity-40 uppercase tracking-widest mt-2">{selectedSighting.userName} • {selectedSighting.createdAt ? format(selectedSighting.createdAt.toDate(), 'yyyy', { locale: es }) : '2026'} ATLAS</p>
                        </div>
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto p-8 md:p-10 space-y-10 font-serif">
                    {/* Photo Gallery */}
                    {(selectedSighting.images && selectedSighting.images.length > 1) && (
                      <section>
                          <h4 className="text-[10px] font-sans font-black text-atlas-ink uppercase mb-4 tracking-[0.2em] flex items-center gap-3">
                            <Wind className="w-4 h-4 opacity-40" /> Archivo Fotográfico ({selectedSighting.images.length})
                          </h4>
                          <div className="flex gap-3 overflow-x-auto pb-4 scrollbar-hide">
                            {selectedSighting.images.map((img, idx) => (
                              <div 
                                key={idx} 
                                onClick={() => setActiveGalleryIndex(idx)}
                                className="shrink-0 w-24 h-24 border border-atlas-ink/10 rounded overflow-hidden cursor-pointer hover:border-atlas-earth transition-all shadow-sm"
                              >
                                <img src={img.url} alt="" className="w-full h-full object-cover" />
                              </div>
                            ))}
                          </div>
                      </section>
                    )}

                   {/* Mycelium History / Seasonal Cycles */}
                   {selectedSighting.networkId && (
                     <section className="bg-atlas-stone/10 p-6 border border-atlas-ink/5 rounded-lg">
                        <h4 className="text-[10px] font-sans font-black text-atlas-ink uppercase mb-4 tracking-[0.2em] flex items-center gap-3">
                          <Database className="w-4 h-4 opacity-40" /> Ciclos del Micelio
                        </h4>
                        <div className="space-y-4">
                           <p className="text-[11px] italic opacity-60 leading-relaxed">
                             Este espécimen pertenece a una colonia registrada anteriormente. El Atlas reconoce su recurrencia estacional.
                           </p>
                           <div className="space-y-2">
                              {sightings
                                .filter(s => (s.networkId === selectedSighting.networkId || s.id === selectedSighting.networkId) && s.id !== selectedSighting.id)
                                .map(hist => (
                                  <div key={hist.id} className="flex items-center gap-3 p-2 hover:bg-atlas-stone transition-all cursor-pointer rounded">
                                     <div className="w-10 h-10 rounded border border-atlas-ink/10 overflow-hidden shrink-0">
                                        <img src={hist.imageUrl} alt="" className="w-full h-full object-cover" />
                                     </div>
                                     <div className="flex-1 min-w-0">
                                        <p className="text-[10px] italic font-bold truncate">{format(hist.createdAt?.toDate() || new Date(), 'MMMM yyyy', { locale: es })}</p>
                                        <p className="text-[8px] opacity-40 uppercase truncate">ID: {hist.id.slice(0, 8)}</p>
                                     </div>
                                  </div>
                                ))}
                           </div>
                        </div>
                     </section>
                   )}
                   {/* Archive Metadata */}
                   <section className="bg-atlas-stone/20 p-6 space-y-4 border border-atlas-ink/5 rounded-lg shrink-0">
                      <h4 className="text-[10px] font-sans font-black text-atlas-ink uppercase tracking-[0.2em] flex items-center gap-3">
                        <Info className="w-4 h-4 opacity-40" /> Metadatos del Archivo
                      </h4>
                      <div className="grid grid-cols-2 gap-6 font-mono text-[9px] uppercase tracking-wider opacity-60">
                         <div>
                            <p className="opacity-40 mb-1">Coordenadas</p>
                            <p>{selectedSighting.lat.toFixed(5)}, {selectedSighting.lng.toFixed(5)}</p>
                         </div>
                         <div>
                            <p className="opacity-40 mb-1">Fecha Registro</p>
                            <p>{selectedSighting.createdAt ? format(selectedSighting.createdAt.toDate(), 'dd/MM/yyyy HH:mm') : '...'}</p>
                         </div>
                         <div>
                            <p className="opacity-40 mb-1">Toxicidad</p>
                            <p className={selectedSighting.toxicity === 'Mortal' ? 'text-red-600 font-black' : ''}>{selectedSighting.toxicity || 'Desconocida'}</p>
                         </div>
                         <div>
                            <p className="opacity-40 mb-1">Estado</p>
                            <p className="lowercase">{selectedSighting.status}</p>
                         </div>
                      </div>
                      {selectedSighting.lastGeofirmedAt && (
                        <div className="pt-4 border-t border-atlas-ink/5 flex items-center gap-3 text-[9px] italic opacity-40">
                          <ShieldCheck className="w-3 h-3 text-atlas-earth" />
                          Geofirmado in situ el {format(selectedSighting.lastGeofirmedAt.toDate(), 'dd/MM/yy')}
                        </div>
                      )}
                   </section>

                   <section>
                     <h4 className="text-[10px] font-sans font-black text-atlas-ink uppercase mb-4 tracking-[0.2em] flex items-center gap-3">
                       <div className="w-2 h-2 bg-atlas-earth rounded-full" /> Observaciones de Sujeto
                     </h4>
                     <p className="text-lg text-atlas-ink leading-relaxed italic border-l-2 border-atlas-stone pl-6 py-2">
                       "{selectedSighting.description}"
                     </p>
                     {selectedSighting.userId !== user?.uid && (
                       <button 
                         onClick={() => setShowReportModal({ type: 'sighting', targetId: selectedSighting.id, content: selectedSighting.description })}
                         className="mt-6 inline-flex items-center gap-2 text-[9px] font-sans font-black text-atlas-ink/40 hover:text-red-600 transition-colors uppercase tracking-[0.2em]"
                       >
                         <Flag className="w-3 h-3" /> Reportar Inexactitud o Abuso
                       </button>
                     )}
                   </section>

                   {/* Botanical Details */}
                   {(selectedSighting.habitat || selectedSighting.features) && (
                     <section className="space-y-6">
                       <h4 className="text-[10px] font-sans font-black text-atlas-ink uppercase mb-2 tracking-[0.2em] flex items-center gap-3">
                         <LeafyGreen className="w-4 h-4 opacity-40" /> Detalles Botánicos
                       </h4>
                       <div className="grid gap-6">
                         {selectedSighting.habitat && (
                           <div className="bg-atlas-stone/10 p-4 border-l-2 border-atlas-earth">
                             <p className="text-[9px] font-sans font-black uppercase tracking-widest opacity-40 mb-1">Hábitat Sugerido</p>
                             <p className="text-xs italic leading-relaxed opacity-80">{selectedSighting.habitat}</p>
                           </div>
                         )}
                         {selectedSighting.features && (
                           <div className="bg-atlas-stone/10 p-4 border-l-2 border-atlas-earth">
                             <p className="text-[9px] font-sans font-black uppercase tracking-widest opacity-40 mb-1">Rasgos Distintivos</p>
                             <p className="text-xs italic leading-relaxed opacity-80">{selectedSighting.features}</p>
                           </div>
                         )}
                       </div>
                     </section>
                   )}

                   <section className="relative">
                     <div className="flex items-center justify-between mb-4 border-b border-atlas-ink/10 pb-2">
                       <h4 className="text-[10px] font-sans font-black text-atlas-ink uppercase tracking-[0.2em]">
                         Conclusiones del Herbario (AI)
                       </h4>
                       {analyzingColors && (
                         <div className="flex gap-1">
                            <div className="w-1 h-1 bg-atlas-earth rounded-full animate-bounce" />
                            <div className="w-1 h-1 bg-atlas-earth rounded-full animate-bounce [animation-delay:0.2s]" />
                            <div className="w-1 h-1 bg-atlas-earth rounded-full animate-bounce [animation-delay:0.4s]" />
                         </div>
                       )}
                     </div>
                     
                     <div className={`text-sm leading-relaxed transition-all ${analyzingColors ? 'opacity-30' : 'opacity-100'}`}>
                        {aiAnalysis ? (
                          <div className="prose prose-sm prose-slate italic opacity-80 leading-loose">
                            {aiAnalysis}
                          </div>
                        ) : (
                          <p className="text-center italic opacity-40 py-10">Consultando archivos antiguos...</p>
                        )}
                     </div>
                   </section>
                    <section className="pt-8 border-t border-atlas-ink/10">
                       <h4 className="text-[10px] font-sans font-black text-atlas-ink uppercase mb-6 tracking-[0.2em] flex items-center gap-3">
                         <MessageSquare className="w-4 h-4 opacity-40" /> Comunidad y Diálogo
                       </h4>
                       
                       {selectedSighting.status === 'draft' && (
                         <div className="mb-8 p-6 bg-atlas-earth/5 border-2 border-dashed border-atlas-earth/40 rounded-lg">
                            <h5 className="text-sm font-serif italic mb-2">Protocolo de Geofirmación</h5>
                            <p className="text-[10px] text-atlas-ink/60 mb-6 leading-relaxed">Este ejemplar fue registrado de forma remota. Para validarlo, acérquese a las coordenadas y documente el espécimen nuevamente.</p>
                            
                            <div className="space-y-4">
                               <div className="bg-atlas-paper border border-atlas-ink/10 p-4 text-center cursor-pointer hover:bg-atlas-stone transition-all relative overflow-hidden group">
                                  <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" />
                                  <div className="flex flex-col items-center gap-2 py-2">
                                     <Plus className="w-5 h-5 text-atlas-earth group-hover:scale-110 transition-transform" />
                                     <span className="text-[9px] font-sans font-black uppercase tracking-widest opacity-60">Subir Fotografía de Campo</span>
                                  </div>
                               </div>
                               <button 
                                 onClick={() => handleGeofirm(selectedSighting)}
                                 className="w-full atlas-button bg-atlas-earth text-atlas-paper border-atlas-earth hover:bg-atlas-ink py-4"
                               >
                                 Geofirmar (Detección In Situ)
                               </button>
                            </div>
                         </div>
                       )}

                       <div className="space-y-6">
                          {sightingComments.length === 0 ? (
                            <p className="text-center italic opacity-40 text-xs py-4">Aún no hay archivos de discusión para este ejemplar.</p>
                          ) : (
                            sightingComments.map(c => (
                              <div key={c.id} className="space-y-2 group">
                                <div className="flex justify-between items-start">
                                   <div className="flex items-center gap-2">
                                      {c.userPhoto ? (
                                        <img src={c.userPhoto} alt="" className="w-4 h-4 rounded-full border border-atlas-ink/10" referrerPolicy="no-referrer" />
                                      ) : (
                                        <div className="w-4 h-4 rounded-full bg-atlas-stone border border-atlas-ink/10 flex items-center justify-center">
                                          <UserIcon className="w-2 h-2" />
                                        </div>
                                      )}
                                      <span className="text-[9px] font-sans font-black uppercase tracking-widest text-atlas-ink/60">{c.userName}</span>
                                   </div>
                                   <div className="flex items-center gap-3">
                                      <span className="text-[8px] font-mono opacity-30">
                                        {c.createdAt ? format(c.createdAt.toDate(), 'HH:mm', { locale: es }) : '...'}
                                      </span>
                                      {c.userId !== user?.uid && (
                                        <button 
                                          onClick={() => setShowReportModal({ type: 'comment', targetId: c.id, content: c.text })}
                                          className="opacity-0 group-hover:opacity-100 transition-opacity text-[8px] font-sans font-black text-red-800 uppercase tracking-widest"
                                        >
                                          Denunciar
                                        </button>
                                      )}
                                   </div>
                                </div>
                                <p className="text-[13px] text-atlas-ink opacity-80 pl-6 border-l border-atlas-earth/20 leading-relaxed italic">
                                  "{c.text}"
                                </p>
                              </div>
                            ))
                          )}
                       </div>

                       {user && (
                         <form onSubmit={handleAddComment} className="mt-8 relative mb-12">
                           <input 
                             type="text"
                             value={newComment}
                             onChange={(e) => setNewComment(e.target.value)}
                             placeholder="Agregar observación..."
                             className="w-full bg-atlas-stone/30 border-b border-atlas-ink/10 py-3 pr-10 text-xs italic focus:outline-none focus:border-atlas-earth transition-all placeholder:opacity-30"
                           />
                           <button 
                             type="submit"
                             disabled={!newComment.trim()}
                             className="absolute right-0 top-1/2 -translate-y-1/2 text-atlas-earth hover:text-atlas-ink disabled:opacity-20 transition-all p-2"
                           >
                             <Send className="w-4 h-4" />
                           </button>
                         </form>
                       )}
                    </section>
                </div>
              </motion.div>
            </>
            )}
          </AnimatePresence>

      </main>

      {/* Report Modal */}
      <AnimatePresence>
        {showReportModal && (
          <div className="fixed inset-0 z-[3000] flex items-center justify-center p-4 bg-atlas-ink/40 backdrop-blur-md">
             <motion.div 
               initial={{ opacity: 0, y: 30 }}
               animate={{ opacity: 1, y: 0 }}
               exit={{ opacity: 0, y: 30 }}
               className="bg-atlas-paper w-full max-w-sm shadow-atlas border border-atlas-ink overflow-hidden"
             >
                <div className="bg-red-900 p-8 text-atlas-paper text-center relative overflow-hidden">
                   <div className="absolute inset-0 dotted-bg opacity-10" />
                   <AlertTriangle className="w-10 h-10 mx-auto mb-4 text-red-200 relative z-10" />
                   <h2 className="text-lg italic font-serif relative z-10">Instancia de Denuncia</h2>
                   <p className="text-[10px] font-sans font-black uppercase tracking-[0.2em] opacity-40 relative z-10 mt-1">Preservación del Bien Común</p>
                </div>
                <div className="p-8 space-y-6 font-serif">
                   <p className="text-xs italic opacity-60 bg-atlas-stone/30 p-4 border-l-2 border-atlas-ink line-clamp-3">
                     "{showReportModal.content}"
                   </p>
                   <div className="space-y-3">
                      <p className="text-[10px] font-sans font-black text-atlas-ink opacity-40 uppercase tracking-widest">Naturaleza de la Infracción</p>
                      {['Lenguaje ofensivo', 'Spam / Irrelevante', 'Información falsa / Peligrosa', 'Acoso', 'Otro'].map(reason => (
                        <button 
                          key={reason}
                          onClick={() => submitReport(reason)}
                          className="w-full text-left py-3 px-2 border-b border-atlas-ink/10 text-sm hover:bg-atlas-stone transition-all italic hover:pl-4"
                        >
                          {reason}
                        </button>
                      ))}
                   </div>
                   <button 
                    onClick={() => setShowReportModal(null)}
                    className="w-full py-4 text-[10px] font-sans font-black uppercase tracking-widest opacity-40 hover:opacity-100 transition-opacity"
                   >
                     Desistir
                   </button>
                </div>
             </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* New Sighting Modal */}
      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-atlas-ink/40 backdrop-blur-md">
            <motion.div 
               initial={{ opacity: 0, y: 50 }}
               animate={{ opacity: 1, y: 0 }}
               exit={{ opacity: 0, y: 50 }}
               className="bg-atlas-paper w-full max-w-lg shadow-atlas border border-atlas-ink flex flex-col max-h-[90vh]"
            >
              <div className="bg-atlas-ink p-8 text-atlas-paper relative overflow-hidden">
                <div className="absolute inset-0 dotted-bg opacity-10" />
                <h2 className="text-3xl italic font-serif relative z-10">Nuevo Registro de Campo</h2>
                <p className="text-[10px] font-sans font-black uppercase tracking-[0.3em] opacity-40 relative z-10 mt-1">Coordenadas: {newSightingPos?.[0].toFixed(4)}, {newSightingPos?.[1].toFixed(4)}</p>
              </div>

              <form 
                className="p-10 space-y-8 font-serif overflow-y-auto flex-1"
                onSubmit={handleAddNewSighting}
              >
                {/* Image Upload First */}
                <div className="space-y-4">
                  <label className="text-[10px] font-sans font-black text-atlas-ink opacity-40 uppercase tracking-widest">Documentación Visual ({formImages.length})</label>
                  
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {formImages.map((img, idx) => (
                      <div key={idx} className="relative aspect-square border-2 border-atlas-ink overflow-hidden shadow-atlas group">
                        <img src={img} alt="Preview" className="w-full h-full object-cover" />
                        <button 
                          type="button"
                          onClick={() => setFormImages(prev => prev.filter((_, i) => i !== idx))}
                          className="absolute top-1 right-1 bg-red-600 text-white p-1 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Plus className="w-3 h-3 rotate-45" />
                        </button>
                      </div>
                    ))}
                    
                    <div className="aspect-square border-2 border-dashed border-atlas-ink/30 flex flex-col items-center justify-center gap-2 bg-atlas-stone/10 hover:border-atlas-ink transition-all cursor-pointer relative overflow-hidden group">
                      <input 
                        type="file" 
                        accept="image/*"
                        className="absolute inset-0 opacity-0 cursor-pointer z-10"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleImageUpload(file);
                        }}
                      />
                      <Plus className="w-6 h-6 text-atlas-earth group-hover:scale-110 transition-transform" />
                      <p className="text-[8px] font-sans font-black uppercase tracking-widest opacity-40 text-center px-2">Añadir Toma</p>
                    </div>
                  </div>
                  
                  {formImages.length > 0 && !isAiLoading && (
                    <button 
                      type="button"
                      onClick={runAiRecognition}
                      className="w-full py-3 bg-atlas-earth text-atlas-paper font-sans font-black text-[10px] uppercase tracking-[0.2em] hover:bg-atlas-ink transition-all flex items-center justify-center gap-2 shadow-sm"
                    >
                      <Smartphone className="w-4 h-4" /> Reconocer con IA
                    </button>
                  )}

                  {isAiLoading && (
                    <div className="bg-atlas-paper/80 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center border-2 border-dashed border-atlas-earth/40 animate-pulse">
                      <div className="w-8 h-8 border-2 border-atlas-earth border-t-transparent rounded-full animate-spin mb-3"></div>
                      <p className="font-serif italic text-sm">RECONOCIENDO...</p>
                      <p className="text-[9px] font-sans font-black uppercase tracking-widest opacity-40 mt-2">Consultando archivos taxonómicos</p>
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-4 p-6 bg-atlas-stone/20 border border-atlas-ink/10 relative">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-[10px] font-sans font-black uppercase tracking-widest opacity-40 mb-1">Protocolo de Registro</p>
                      <p className="text-sm italic">
                        {newSightingPos 
                          ? "Ubicación remota seleccionada. El hallazgo quedará como 'Borrador' hasta su validación física."
                          : "Se utilizará su ubicación física actual. El hallazgo será validado como 'Hallazgo Local'."}
                      </p>
                    </div>
                    <button 
                      type="button"
                      onClick={() => {
                        setShowModal(false);
                        setIsAddingMode(true);
                      }}
                      className="shrink-0 p-3 bg-atlas-paper border border-atlas-ink hover:bg-atlas-stone transition-all group"
                      title="Cambiar ubicación en el mapa"
                    >
                      <MapPin className="w-5 h-5 text-atlas-ink group-hover:scale-110 transition-transform" />
                    </button>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-2">
                    <label className="text-[10px] font-sans font-black text-atlas-ink opacity-40 uppercase tracking-widest">Identificación Probable</label>
                    <input 
                      name="mushroomName" 
                      required 
                      value={formMushroomName}
                      onChange={(e) => setFormMushroomName(e.target.value)}
                      className="w-full atlas-input !text-xl italic" 
                      placeholder="Identificando..."
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-sans font-black text-atlas-ink opacity-40 uppercase tracking-widest">Nivel de Toxicidad</label>
                    <select 
                      value={formToxicity}
                      onChange={(e) => setFormToxicity(e.target.value)}
                      className="w-full atlas-input !text-base italic appearance-none"
                    >
                      <option value="Desconocido">Desconocido</option>
                      <option value="Comestible">Comestible</option>
                      <option value="Tóxico">Tóxico</option>
                      <option value="Mortal">Mortal</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-sans font-black text-atlas-ink opacity-40 uppercase tracking-widest">Observaciones de Campo</label>
                  <textarea 
                    name="description" 
                    required 
                    rows={4}
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    className="w-full bg-atlas-stone/30 border border-atlas-ink/10 p-6 text-base italic focus:outline-none focus:border-atlas-ink transition-all resize-none" 
                    placeholder="Contanos sobre el entorno, el sustrato o detalles específicos del ejemplar..."
                  />
                </div>
                
                <div className="pt-6 flex gap-6">
                  <button 
                    type="button" 
                    onClick={() => {
                      setShowModal(false);
                      setNewSightingPos(null);
                    }}
                    className="flex-1 py-4 text-[10px] font-sans font-black uppercase tracking-[0.3em] opacity-40 hover:opacity-100 transition-opacity"
                  >
                    Anular Registro
                  </button>
                  <button 
                    type="submit"
                    className="flex-[2] atlas-button !py-4 !text-sm"
                  >
                    Archivar en el Atlas
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Full Screen Gallery Overlay */}
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
                  src={selectedSighting.images[activeGalleryIndex].url} 
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

      {/* Mobile Feed Toggle Button */}
      <div className="lg:hidden fixed bottom-4 left-4 z-[1000]">
         <div className="bg-white/90 backdrop-blur p-2 rounded-2xl shadow-xl flex gap-2 border border-forest-100">
           <button className="p-3 bg-forest-100 text-forest-700 rounded-xl">
             <MapIcon className="w-6 h-6" />
           </button>
           <button className="p-3 text-forest-400 hover:text-forest-600">
             <MessageSquare className="w-6 h-6" />
           </button>
         </div>
      </div>
    </div>
  );
}

// Sub-components moved outside to prevent re-creation and flickering
function LocationMarker({ 
  isAddingMode, 
  setIsAddingMode,
  setNewSightingPos, 
  setShowModal, 
  userLocation, 
  mapCentered, 
  setMapCentered,
  newSightingPos
}: {
  isAddingMode: boolean;
  setIsAddingMode: (val: boolean) => void;
  setNewSightingPos: (pos: [number, number] | null) => void;
  setShowModal: (show: boolean) => void;
  userLocation: [number, number] | null;
  mapCentered: boolean;
  setMapCentered: (val: boolean) => void;
  newSightingPos: [number, number] | null;
}) {
  const map = useMapEvents({
    click(e) {
      if (isAddingMode) {
        setNewSightingPos([e.latlng.lat, e.latlng.lng]);
        setIsAddingMode(false);
        setShowModal(true);
      }
    },
  });

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
