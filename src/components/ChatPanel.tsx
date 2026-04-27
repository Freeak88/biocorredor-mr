import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MessageSquare, Wind, Send, Plus, Flag } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ChatMessage, AuthUser } from '../types';

function parseDate(d: any): Date {
  if (!d) return new Date();
  if (d instanceof Date) return d;
  if (typeof d === 'string') return parseISO(d);
  if (typeof d.toDate === 'function') return d.toDate();
  return new Date(d);
}

interface ChatPanelProps {
  showChat: boolean;
  setShowChat: (v: boolean) => void;
  filteredMessages: ChatMessage[];
  handleSendMessage: (text: string) => void;
  user: AuthUser | null;
  onReport: (type: 'message', targetId: string, content?: string) => void;
}

export default function ChatPanel({
  showChat,
  setShowChat,
  filteredMessages,
  handleSendMessage,
  user,
  onReport
}: ChatPanelProps) {
  if (!showChat) return null;

  return (
    <AnimatePresence>
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
          <button onClick={() => setShowChat(false)} className="relative z-10 p-2 hover:bg-atlas-paper/10 rounded-full transition-colors">
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
              filteredMessages.map(m => {
                const msgUserId = typeof m.user === 'string' ? m.user : m.userId;
                return (
                  <div key={m.id} className="group relative flex flex-col pl-6 border-l-2 border-atlas-earth/20">
                    <div className="flex justify-between items-baseline mb-2">
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] font-sans font-black uppercase tracking-widest text-atlas-earth">{m.userName}</span>
                        <span className="text-[8px] font-sans font-black uppercase tracking-widest px-2 py-0.5 bg-atlas-stone rounded-sm opacity-60">Global</span>
                      </div>
                      <span className="text-[9px] font-mono opacity-30">{format(parseDate(m.created || m.createdAt), 'HH:mm dd MMM')}</span>
                    </div>
                    <p className="text-lg font-serif text-atlas-ink leading-relaxed italic">"{m.text}"</p>
                    {msgUserId !== user?.uid && (
                      <button
                        onClick={() => onReport('message', m.id, m.text)}
                        className="absolute -left-3 top-0 opacity-0 group-hover:opacity-40 hover:opacity-100 transition-all text-atlas-ink bg-atlas-paper p-1.5 rounded-full border border-atlas-ink shadow-sm"
                        title="Denunciar"
                      >
                        <Flag className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                );
              })
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
    </AnimatePresence>
  );
}
