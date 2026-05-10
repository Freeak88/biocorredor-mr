import React, { useState, useRef, useCallback } from 'react';
import { Camera, ImageIcon, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface CaptureButtonProps {
  onCapture: (file: File, lat: number, lng: number) => void;
  onGallerySelect: (file: File) => void;
}

export default function CaptureButton({ onCapture, onGallerySelect }: CaptureButtonProps) {
  const [showSheet, setShowSheet] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const handleCameraClick = useCallback(() => {
    // Capture GPS before opening camera (user might move while taking photo)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        // Store coordinates temporarily
        (window as any).__captureCoords = { lat, lng };
        cameraInputRef.current?.click();
      },
      (error) => {
        console.warn('GPS not available for capture, will use current location:', error);
        // Still open camera, will fallback to userLocation in App
        cameraInputRef.current?.click();
      },
      { enableHighAccuracy: true, timeout: 5000 }
    );
  }, []);

  const handleCameraFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const coords = (window as any).__captureCoords;
    const lat = coords?.lat;
    const lng = coords?.lng;

    // Clean up temp storage
    delete (window as any).__captureCoords;

    if (lat != null && lng != null) {
      onCapture(file, lat, lng);
    } else {
      // Fallback: get current position
      navigator.geolocation.getCurrentPosition(
        (position) => {
          onCapture(file, position.coords.latitude, position.coords.longitude);
        },
        () => {
          // Ultimate fallback: use default or alert
          alert('No se pudo obtener la ubicación. Asegurate de tener el GPS activado.');
        }
      );
    }

    setShowSheet(false);
    // Reset input
    e.target.value = '';
  }, [onCapture]);

  const handleGalleryFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onGallerySelect(file);
    }
    setShowSheet(false);
    e.target.value = '';
  }, [onGallerySelect]);

  return (
    <>
      {/* Floating action button */}
      <button
        onClick={() => setShowSheet(true)}
        className="absolute bottom-24 left-1/2 -translate-x-1/2 z-[1002] w-14 h-14 bg-atlas-earth text-atlas-paper rounded-full shadow-atlas border-2 border-atlas-paper flex items-center justify-center hover:scale-110 transition-transform"
        aria-label="Añadir hallazgo"
      >
        <Camera className="w-6 h-6" />
      </button>

      {/* Hidden inputs */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleCameraFile}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleGalleryFile}
      />

      {/* Bottom Sheet */}
      <AnimatePresence>
        {showSheet && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSheet(false)}
              className="fixed inset-0 z-[3000] bg-atlas-ink/40 backdrop-blur-sm"
            />

            {/* Sheet */}
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 z-[3001] bg-atlas-paper border-t-2 border-atlas-ink shadow-atlas"
            >
              <div className="p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-sans font-black uppercase tracking-widest opacity-40">
                    Nuevo Registro
                  </p>
                  <button
                    onClick={() => setShowSheet(false)}
                    className="p-2 hover:bg-atlas-stone transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <button
                  onClick={handleCameraClick}
                  className="w-full flex items-center gap-4 p-4 border-2 border-atlas-ink hover:bg-atlas-stone transition-colors"
                >
                  <div className="w-12 h-12 bg-atlas-earth text-atlas-paper rounded-full flex items-center justify-center">
                    <Camera className="w-6 h-6" />
                  </div>
                  <div className="text-left">
                    <p className="font-serif italic font-bold">Cámara</p>
                    <p className="text-[9px] font-sans opacity-50">Sacá una foto directamente desde el mapa</p>
                  </div>
                </button>

                <button
                  onClick={() => galleryInputRef.current?.click()}
                  className="w-full flex items-center gap-4 p-4 border-2 border-atlas-ink hover:bg-atlas-stone transition-colors"
                >
                  <div className="w-12 h-12 bg-atlas-ink text-atlas-paper rounded-full flex items-center justify-center">
                    <ImageIcon className="w-6 h-6" />
                  </div>
                  <div className="text-left">
                    <p className="font-serif italic font-bold">Galería</p>
                    <p className="text-[9px] font-sans opacity-50">Elegí una foto que ya tengas</p>
                  </div>
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
