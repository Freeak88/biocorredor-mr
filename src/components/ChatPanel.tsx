import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MessageSquare, MapPin, Send, Plus, Flag } from 'lucide-react';
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
  chatRadius: number;
  setChatRadius: (radius: number) => void;
  chatRadiusOptions: readonly number[];
  chatError: string;
  isSendingMessage: boolean;
  handleSendMessage: (text: string) => Promise<boolean>;
  user: AuthUser | null;
  onReport: (type: 'message', targetId: string, content?: string) => void;
}

export default function ChatPanel({
  showChat,
  setShowChat,
  filteredMessages,
  chatRadius,
  setChatRadius,
  chatRadiusOptions,
  chatError,
  isSendingMessage,
  handleSendMessage,
  user,
  onReport
}: ChatPanelProps) {
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [filteredMessages.length, showChat]);

  if (!showChat) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-atlas-paper z-[2000] flex flex-col overflow-hidden"
      >
        <div className="px-5 py-4 sm:px-8 bg-atlas-ink text-atlas-paper flex justify-between items-center relative overflow-hidden shrink-0">
          <div className="absolute inset-0 dotted-bg opacity-10" />
          <div className="relative z-10">
            <h3 className="text-xs font-sans font-black uppercase tracking-[0.22em] flex items-center gap-3">
              <MessageSquare className="w-5 h-5 text-atlas-earth" />
              Chat de Campo
            </h3>
            <p className="text-[10px] opacity-50 mt-1 font-sans">
              {chatRadius === 0 ? 'Viendo toda la red' : `Viendo mensajes a ${chatRadius} km`}
            </p>
          </div>
          <button onClick={() => setShowChat(false)} className="relative z-10 p-2 hover:bg-atlas-paper/10 rounded-full transition-colors">
            <Plus className="w-6 h-6 rotate-45 text-atlas-paper" />
          </button>
        </div>

        <div className="px-5 py-3 sm:px-8 bg-atlas-paper border-b border-atlas-ink/10 shrink-0">
          <div className="max-w-3xl mx-auto flex items-center gap-2 overflow-x-auto">
            <MapPin className="w-4 h-4 shrink-0 text-atlas-earth" />
            {chatRadiusOptions.map(radius => (
              <button
                key={radius}
                type="button"
                onClick={() => setChatRadius(radius)}
                className={`shrink-0 px-3 py-2 text-[10px] font-sans font-black uppercase tracking-[0.12em] border transition-all ${
                  chatRadius === radius
                    ? 'bg-atlas-ink text-atlas-paper border-atlas-ink'
                    : 'bg-atlas-stone/20 text-atlas-ink border-atlas-ink/10 hover:border-atlas-earth'
                }`}
              >
                {radius === 0 ? 'Toda la red' : `${radius} km`}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 sm:p-8 bg-atlas-paper dotted-bg [background-size:15px_15px]">
          <div className="max-w-3xl mx-auto min-h-full flex flex-col justify-end gap-4">
            {filteredMessages.length === 0 ? (
              <div className="text-center my-20 text-atlas-ink/35 font-serif">
                <MessageSquare className="w-14 h-14 mx-auto mb-5 opacity-20" />
                <p className="text-lg italic leading-relaxed">
                  {chatRadius === 0 ? 'Todavía no hay mensajes en la red.' : `No hay mensajes dentro de ${chatRadius} km.`}
                </p>
              </div>
            ) : (
              [...filteredMessages].reverse().map(m => {
                const msgUserId = typeof m.user === 'string' ? m.user : m.userId;
                const isMine = msgUserId === user?.uid;
                return (
                  <div key={m.id} className={`group relative flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[82%] sm:max-w-[70%] ${isMine ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
                      <div className={`flex items-center gap-2 px-1 ${isMine ? 'flex-row-reverse' : ''}`}>
                        <span className="text-[10px] font-sans font-black uppercase tracking-widest text-atlas-earth">{m.userName}</span>
                        <span className="text-[9px] font-mono opacity-35">{format(parseDate(m.created || m.createdAt), 'HH:mm')}</span>
                      </div>
                      <div className={`px-4 py-3 border shadow-sm text-sm sm:text-base leading-relaxed ${
                        isMine
                          ? 'bg-atlas-ink text-atlas-paper border-atlas-ink'
                          : 'bg-atlas-paper/95 text-atlas-ink border-atlas-ink/15'
                      }`}>
                        {m.text}
                      </div>
                      {!isMine && (
                        <button
                          onClick={() => onReport('message', m.id, m.text)}
                          className="opacity-0 group-hover:opacity-45 hover:opacity-100 transition-all text-atlas-ink px-1"
                          title="Denunciar"
                        >
                          <Flag className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        <div className="p-4 sm:p-6 bg-atlas-stone/20 border-t border-atlas-ink/10 shrink-0">
          <form
            className="max-w-3xl mx-auto"
            onSubmit={async (e) => {
              e.preventDefault();
              const sent = await handleSendMessage(draft);
              if (sent) setDraft('');
            }}
          >
            {chatError && (
              <p className="mb-2 text-[11px] font-sans font-bold text-red-700">{chatError}</p>
            )}
            <div className="flex items-end gap-3 bg-atlas-paper border-2 border-atlas-ink p-2">
              <textarea
                name="msg"
                rows={1}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    e.currentTarget.form?.requestSubmit();
                  }
                }}
                placeholder="Mensaje..."
                className="flex-1 max-h-28 resize-none bg-transparent px-3 py-2 font-serif text-base focus:outline-none"
              />
              <button
                type="submit"
                disabled={isSendingMessage || draft.trim().length === 0}
                className="h-11 w-11 shrink-0 bg-atlas-ink text-atlas-paper border border-atlas-ink flex items-center justify-center hover:bg-atlas-earth transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                title="Enviar"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </form>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
