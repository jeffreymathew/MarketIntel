import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, Send, X, Loader2, User, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Markdown from 'react-markdown';
import { chatWithMarketIntel } from '../services/gemini';
import { Competitor, Insight } from '../types';

const GeminiIcon = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <path
      d="M12 3C12 3 12.5 8.5 18 11.5C12.5 14.5 12 20 12 20C12 20 11.5 14.5 6 11.5C11.5 8.5 12 3 12 3Z"
      fill="currentColor"
    />
    <path
      d="M18 4C18 4 18.25 6.25 20.5 7.5C18.25 8.75 18 11 18 11C18 11 17.75 8.75 15.5 7.5C17.75 6.25 18 4 18 4Z"
      fill="currentColor"
      opacity="0.8"
    />
  </svg>
);

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface ChatBotProps {
  competitors: Competitor[];
  marketInsights: Insight[];
}

export default function ChatBot({ competitors, marketInsights }: ChatBotProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: 'Hello! I am your TELUS AI Factory Market Intelligence Assistant. How can I help you today?'
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const context = {
        competitors: competitors.map(c => c.name),
        currentInsights: marketInsights.slice(0, 10)
      };
      
      const response = await chatWithMarketIntel(userMessage.content, context);
      
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response || 'I am sorry, I could not process that request.'
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Chat error:', error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'I encountered an error while processing your request. Please try again later.'
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="mb-4 w-[400px] max-w-[calc(100vw-48px)] h-[600px] max-h-[calc(100vh-120px)] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="p-4 bg-[#4B286D] text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 via-purple-400 to-pink-400 flex items-center justify-center shadow-lg">
                  <GeminiIcon className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-sm">MarketIntel Assistant</h3>
                  <div className="flex items-center gap-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-[10px] opacity-80">Online</span>
                  </div>
                </div>
              </div>
              <button 
                onClick={() => setIsOpen(false)}
                className="p-1 hover:bg-white/10 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50">
              {messages.map((msg) => (
                <div 
                  key={msg.id}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`flex gap-2 max-w-[85%] ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                    <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center ${
                      msg.role === 'user' ? 'bg-[#4B286D] text-white' : 'bg-white border border-slate-200 text-slate-600'
                    }`}>
                      {msg.role === 'user' ? <User className="w-4 h-4" /> : <GeminiIcon className="w-5 h-5 text-purple-500" />}
                    </div>
                    <div className={`p-3 rounded-2xl text-sm ${
                      msg.role === 'user' 
                        ? 'bg-[#4B286D] text-white rounded-tr-none' 
                        : 'bg-white border border-slate-200 text-slate-800 rounded-tl-none shadow-sm'
                    }`}>
                      <div className="prose prose-sm max-w-none prose-p:leading-relaxed prose-pre:bg-slate-800 prose-pre:text-slate-100">
                        <Markdown>
                          {msg.content}
                        </Markdown>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="flex gap-2 max-w-[85%]">
                    <div className="w-8 h-8 rounded-full bg-white border border-slate-200 text-slate-600 flex items-center justify-center">
                      <GeminiIcon className="w-5 h-5 text-purple-500 animate-pulse" />
                    </div>
                    <div className="p-3 bg-white border border-slate-200 rounded-2xl rounded-tl-none shadow-sm flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-[#4B286D]" />
                      <span className="text-xs text-slate-500 italic">Thinking...</span>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="p-4 bg-white border-t border-slate-100">
              <div className="relative">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                  placeholder="Ask about competitors, market trends..."
                  className="w-full pl-4 pr-12 py-3 bg-slate-100 border-none rounded-xl text-sm focus:ring-2 focus:ring-[#4B286D] transition-all"
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || isLoading}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-[#4B286D] text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:bg-[#3a1f54]"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
              <p className="mt-2 text-[10px] text-center text-slate-400">
                Powered by Gemini 3 Flash Intelligence
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsOpen(!isOpen)}
        className={`shadow-2xl flex items-center justify-center transition-all gap-2 ${
          isOpen 
            ? 'w-14 h-14 rounded-full bg-white text-[#4B286D] rotate-90' 
            : 'px-6 h-14 rounded-full bg-[#4B286D] text-white'
        }`}
      >
        {isOpen ? (
          <X className="w-6 h-6" />
        ) : (
          <>
            <GeminiIcon className="w-6 h-6" />
            <span className="font-bold text-sm whitespace-nowrap">Ask MarketIntel AI</span>
          </>
        )}
      </motion.button>
    </div>
  );
}
