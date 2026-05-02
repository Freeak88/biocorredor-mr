import { useState, useEffect, type FormEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, MapPin, Smartphone } from 'lucide-react';
import { useITISValidation } from '../hooks/useITISValidation';
import { fetchIUCNStatus, iucnCategoryText, parseBinomial } from '../lib/iucn';

interface NewSightingModalProps {
  showModal: boolean;
  setShowModal: (v: boolean) => void;
  isAddingMode: boolean;
  setIsAddingMode: (v: boolean) => void;
  newSightingPos: [number, number] | null;
  setNewSightingPos: (v: [number, number] | null) => void;
  formImages: string[];
  setFormImages: (imgs: string[]) => void;
  formMushroomName: string;
  setFormMushroomName: (v: string) => void;
  formDescription: string;
  setFormDescription: (v: string) => void;
  formToxicity: string;
  setFormToxicity: (v: string) => void;
  formHabitat: string;
  setFormHabitat: (v: string) => void;
  formFeatures: string;
  setFormFeatures: (v: string) => void;
  isAiLoading: boolean;
  isSubmittingSighting: boolean;
  handleImageUpload: (file: File) => void;
  removeFormImage: (index: number) => void;
  runAiRecognition: () => void;
  handleAddNewSighting: (e: FormEvent) => void;
  resetForm: () => void;
}

export default function NewSightingModal({
  showModal,
  setShowModal,
  isAddingMode,
  setIsAddingMode,
  newSightingPos,
  setNewSightingPos,
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
  handleImageUpload,
  removeFormImage,
  runAiRecognition,
  handleAddNewSighting,
  resetForm
}: NewSightingModalProps) {
  const { validation, isValidating, isValid, kingdom, phylum, class: class_, order, family, genus, species, suggestions, error } = useITISValidation(formMushroomName);

  // IUCN conservation status
  const [iucnStatus, setIucnStatus] = useState<{ category: string; label: string; emoji: string; url: string } | null>(null);
  const [iucnLoading, setIucnLoading] = useState(false);

  useEffect(() => {
    if (!isValid || !formMushroomName || formMushroomName.length < 3) {
      setIucnStatus(null);
      return;
    }
    const binomial = parseBinomial(formMushroomName);
    if (!binomial) return;
    const timer = setTimeout(async () => {
      setIucnLoading(true);
      const result = await fetchIUCNStatus(binomial.genus, binomial.species);
      if (result?.latest_category) {
        const cat = iucnCategoryText(result.latest_category);
        setIucnStatus({ category: result.latest_category, label: cat.label, emoji: cat.emoji, url: result.latest_url || '' });
      } else {
        setIucnStatus(null);
      }
      setIucnLoading(false);
    }, 800);
    return () => clearTimeout(timer);
  }, [isValid, formMushroomName]);

  if (!showModal) return null;

  return (
    <AnimatePresence>
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

          <form className="p-10 space-y-8 font-serif overflow-y-auto flex-1" onSubmit={handleAddNewSighting}>
            <div className="space-y-4">
              <label className="text-[10px] font-sans font-black text-atlas-ink opacity-40 uppercase tracking-widest">Documentación Visual ({formImages.length})</label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {formImages.map((img, idx) => (
                  <div key={idx} className="relative aspect-square border-2 border-atlas-ink overflow-hidden shadow-atlas group">
                    <img src={img} alt="Preview" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removeFormImage(idx)}
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
                  onClick={() => { setShowModal(false); setIsAddingMode(true); }}
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
                
                {/* ITIS Validation */}
                {formMushroomName && formMushroomName.length >= 3 && (
                  <div className="mt-2 p-2 rounded border text-[10px] font-sans">
                    {isValidating ? (
                      <div className="flex items-center gap-2 text-atlas-ink">
                        <div className="animate-spin w-3 h-3 border-2 border-atlas-ink border-t-transparent rounded-full" />
                        <span>Validando con ITIS...</span>
                      </div>
                    ) : isValid && kingdom ? (
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-emerald-600 font-bold">
                          <span className="text-xs">✓</span>
                          <span>Nombre válido</span>
                        </div>
                        <div className="text-[9px] opacity-70 mt-1 space-y-0.5">
                          {kingdom && <div><span className="font-bold">Reino:</span> {kingdom}</div>}
                          {phylum && <div><span className="font-bold">Filo:</span> {phylum}</div>}
                          {class_ && <div><span className="font-bold">Clase:</span> {class_}</div>}
                          {order && <div><span className="font-bold">Orden:</span> {order}</div>}
                          {family && <div><span className="font-bold">Familia:</span> {family}</div>}
                          {genus && <div><span className="font-bold">Género:</span> {genus}</div>}
                          {species && <div><span className="font-bold">Especie:</span> {species}</div>}
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-amber-600 font-bold">
                          <span className="text-xs">⚠</span>
                          <span>{error || 'No se encontró en ITIS'}</span>
                        </div>
                        {suggestions && suggestions.length > 0 && (
                          <div className="mt-1">
                            <div className="font-bold text-[9px] opacity-70 mb-1">Sugerencias:</div>
                            <ul className="text-[9px] opacity-70 space-y-0.5">
                              {suggestions.slice(0, 3).map((s: any, i: number) => (
                                <li key={i}>
                                  <button
                                    type="button"
                                    onClick={() => setFormMushroomName(s.full || s.acceptedNameUsage)}
                                    className="text-emerald-600 hover:underline"
                                  >
                                    {s.full || s.acceptedNameUsage}
                                  </button>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
                
                {/* IUCN Conservation Status */}
                {iucnLoading && (
                  <div className="text-[10px] font-sans text-atlas-ink/50 mt-1">
                    <span className="animate-pulse">Consultando IUCN...</span>
                  </div>
                )}
                {iucnStatus && !iucnLoading && (
                  <div className="mt-1 px-2 py-1 rounded text-[10px] font-sans bg-atlas-ink/5 flex items-center gap-2">
                    <span>{iucnStatus.emoji}</span>
                    <span className="font-bold">IUCN: {iucnStatus.category}</span>
                    <span className="text-atlas-ink/60">{iucnStatus.label}</span>
                    {iucnStatus.url && (
                      <a href={iucnStatus.url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline ml-auto">Ver</a>
                    )}
                  </div>
                )}
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
                disabled={isSubmittingSighting}
                onClick={() => { setShowModal(false); setNewSightingPos(null); }}
                className="flex-1 py-4 text-[10px] font-sans font-black uppercase tracking-[0.3em] opacity-40 hover:opacity-100 transition-opacity disabled:pointer-events-none disabled:opacity-20"
              >
                Anular Registro
              </button>
              <button
                type="submit"
                disabled={isSubmittingSighting}
                className="flex-[2] atlas-button !py-4 !text-sm disabled:pointer-events-none disabled:cursor-wait disabled:opacity-70"
              >
                {isSubmittingSighting ? 'Archivando...' : 'Archivar en el Atlas'}
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
