import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle, Plus } from 'lucide-react';

interface ReportModalProps {
  showReportModal: { type: 'message' | 'user' | 'sighting' | 'comment', targetId: string, content?: string } | null;
  setShowReportModal: (v: any) => void;
  submitReport: (reason: string) => void;
}

export default function ReportModal({ showReportModal, setShowReportModal, submitReport }: ReportModalProps) {
  if (!showReportModal) return null;

  return (
    <AnimatePresence>
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
    </AnimatePresence>
  );
}
