import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, 
  Plus, 
  TrendingUp, 
  TrendingDown, 
  Minus, 
  ExternalLink, 
  RefreshCw, 
  Trash2, 
  ChevronRight,
  BarChart3,
  Globe,
  AlertCircle,
  Loader2,
  Map,
  Leaf,
  Sparkles,
  Home,
  FileDown,
  Building2,
  Info,
  Users,
  Cpu,
  Zap,
  Handshake,
  Server,
  Database,
  Activity,
  Cloud
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Competitor, Insight, Market } from './types';
import { searchMarketInsights, generateMarketSummary, generateRegionInsights, generateGlobalSummary, generateCompetitorProfile } from './services/gemini';
import ChatBot from './components/ChatBot';
// @ts-ignore
import html2pdf from 'html2pdf.js';

const NewsSkeleton = () => (
  <div className="animate-pulse bg-white">
    {[...Array(5)].map((_, i) => (
      <div key={i} className="grid grid-cols-[40px_1fr_120px_100px] items-center p-4 border-b border-slate-50 last:border-0">
        <div className="h-3 w-4 bg-slate-100 rounded"></div>
        <div className="space-y-2 pr-8">
          <div className="h-4 w-3/4 bg-slate-200/60 rounded"></div>
          <div className="h-3 w-1/2 bg-slate-100 rounded"></div>
        </div>
        <div className="h-3 w-16 bg-slate-100 rounded"></div>
        <div className="h-3 w-12 bg-slate-100 rounded"></div>
      </div>
    ))}
  </div>
);

const SummarySkeleton = () => (
  <div className="animate-pulse bg-white border border-[#E9ECEF] rounded-2xl p-8 space-y-6">
    <div className="flex items-center gap-2 mb-6 pb-4 border-b border-slate-100">
      <div className="h-5 w-5 bg-slate-100 rounded"></div>
      <div className="h-6 w-48 bg-slate-200 rounded"></div>
    </div>
    <div className="space-y-4">
      <div className="h-4 w-full bg-slate-100 rounded"></div>
      <div className="h-4 w-full bg-slate-100 rounded"></div>
      <div className="h-4 w-3/4 bg-slate-100 rounded"></div>
    </div>
    <div className="space-y-4 pt-4">
      <div className="h-5 w-32 bg-slate-200 rounded"></div>
      <div className="h-4 w-full bg-slate-100 rounded"></div>
      <div className="h-4 w-5/6 bg-slate-100 rounded"></div>
    </div>
  </div>
);

export default function App() {
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [selectedCompetitor, setSelectedCompetitor] = useState<Competitor | null>(null);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [newCompetitor, setNewCompetitor] = useState({ name: '', industry: '' });
  const [executiveSummary, setExecutiveSummary] = useState<string | null>(null);
  const [globalSummary, setGlobalSummary] = useState<{content: string, updated_at: string} | null>(null);
  
  const [markets, setMarkets] = useState<Market[]>([]);
  const [newMarket, setNewMarket] = useState({ name: '' });
  
  const [currentView, setCurrentView] = useState<'welcome' | 'market_intelligence' | 'competitor' | 'global_summary'>('welcome');
  
  // Clear executive summary when switching to non-competitor views
  useEffect(() => {
    if (currentView !== 'competitor') {
      setExecutiveSummary(null);
    }
  }, [currentView]);

  const [marketInsights, setMarketInsights] = useState<Insight[]>([]);
  const [marketRegion, setMarketRegion] = useState<string>('canada');
  const summaryRef = useRef<HTMLDivElement>(null);

  const isBackgroundRefreshingInsightsRef = useRef(false);
  const isBackgroundRefreshingMarketRef = useRef(false);

  const [isExporting, setIsExporting] = useState(false);

  const exportToDoc = async () => {
    if (!summaryRef.current) return;
    
    setIsExporting(true);
    try {
      const preHtml = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head><meta charset='utf-8'><title>Weekly Market Overview</title>
      <style>
        body { font-family: 'Inter', sans-serif; color: #1A1D21; }
        h1, h2, h3, h4, h5, h6 { color: #4B286D; }
        table { border-collapse: collapse; width: 100%; margin-top: 1em; margin-bottom: 1em; }
        th, td { border: 1px solid #E9ECEF; padding: 8px; text-align: left; }
        th { background-color: #F1F3F5; }
      </style>
      </head><body>`;
      const postHtml = "</body></html>";
      const html = preHtml + summaryRef.current.innerHTML + postHtml;

      const response = await fetch('/api/export/google-doc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          html,
          title: `Weekly_Market_Overview_${new Date().toISOString().split('T')[0]}`
        })
      });

      if (response.status === 401) {
        // Not authenticated, start OAuth flow
        const redirectUri = `${window.location.origin}/auth/callback`;
        const authUrlResponse = await fetch(`/api/auth/google/url?redirectUri=${encodeURIComponent(redirectUri)}`);
        const { url } = await authUrlResponse.json();
        
        const authWindow = window.open(url, 'oauth_popup', 'width=600,height=700');
        if (!authWindow) {
          alert('Please allow popups for this site to connect your Google account.');
          setIsExporting(false);
          return;
        }

        // Wait for authentication success
        const handleMessage = async (event: MessageEvent) => {
          if (!event.origin.endsWith('.run.app') && !event.origin.includes('localhost')) {
            return;
          }
          if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
            window.removeEventListener('message', handleMessage);
            // Retry export
            const retryResponse = await fetch('/api/export/google-doc', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                html,
                title: `Weekly_Market_Overview_${new Date().toISOString().split('T')[0]}`
              })
            });
            
            if (retryResponse.ok) {
              const data = await retryResponse.json();
              window.open(data.url, '_blank');
            } else {
              alert('Failed to export to Google Docs.');
            }
            setIsExporting(false);
          }
        };
        window.addEventListener('message', handleMessage);
      } else if (response.ok) {
        const data = await response.json();
        window.open(data.url, '_blank');
        setIsExporting(false);
      } else {
        alert('Failed to export to Google Docs.');
        setIsExporting(false);
      }
    } catch (error) {
      console.error('Export error:', error);
      alert('An error occurred during export.');
      setIsExporting(false);
    }
  };

  useEffect(() => {
    fetchCompetitors();
    fetchMarkets();
    fetchGlobalSummary();
  }, []);

  useEffect(() => {
    if (selectedCompetitor) {
      fetchInsights(selectedCompetitor.id);
      setExecutiveSummary(selectedCompetitor.executive_summary || null);
    } else {
      setInsights([]);
      setExecutiveSummary(null);
    }
  }, [selectedCompetitor]);

  const fetchGlobalSummary = async () => {
    const res = await fetch('/api/reports/global_summary');
    const data = await res.json();
    if (data.content) {
      setGlobalSummary(data);
    } else {
      setGlobalSummary(null);
    }
  };

  const refreshGlobalSummary = async () => {
    setRefreshing(true);
    try {
      // Ensure we have the latest insights for Canada and Global
      await Promise.all([
        refreshMarketInsights('canada', true),
        refreshMarketInsights('global', true)
      ]);

      // Fetch both Canada and Global insights for a comprehensive overview
      const [canadaRes, globalRes] = await Promise.all([
        fetch('/api/market-insights?region=canada'),
        fetch('/api/market-insights?region=global')
      ]);
      
      let canadaInsights = await canadaRes.json();
      let globalInsights = await globalRes.json();
      
      // If no insights, trigger a refresh for global at least
      if (globalInsights.length === 0) {
        const query = "Global AI infrastructure, Sovereign Cloud, AI Datacentres news last 7 days";
        const results = await searchMarketInsights(query);
        for (const result of results) {
          await fetch('/api/market-insights', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...result, region: 'global' }),
          });
        }
        const freshRes = await fetch('/api/market-insights?region=global');
        globalInsights = await freshRes.json();
      }

      // Combine insights, tagging them for the AI
      const combinedInsights = [
        ...canadaInsights.map((i: any) => ({ ...i, region: 'Canada' })),
        ...globalInsights.map((i: any) => ({ ...i, region: 'Global' }))
      ];
      
      const compNames = competitors.map(c => c.name);
      const summary = await generateGlobalSummary(compNames, combinedInsights.slice(0, 30));
      
      if (summary) {
        await fetch('/api/reports/global_summary', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: summary }),
        });
        await fetchGlobalSummary();
      }
    } catch (error) {
      console.error("Global summary refresh failed", error);
    } finally {
      setRefreshing(false);
    }
  };

  const sortCompetitors = (data: Competitor[]) => {
    return [...data].sort((a, b) => {
      const priority: Record<string, number> = {
        'TELUS AI Factory': 1,
        'Bell AI Fabric': 2
      };
      
      const aPriority = priority[a.name] || 999;
      const bPriority = priority[b.name] || 999;
      
      if (aPriority !== bPriority) {
        return aPriority - bPriority;
      }
      
      return a.name.localeCompare(b.name);
    });
  };

  const fetchCompetitors = async () => {
    const res = await fetch('/api/competitors');
    const data = await res.json();
    setCompetitors(sortCompetitors(data));
  };

  const fetchMarkets = async () => {
    const res = await fetch('/api/markets');
    const data = await res.json();
    setMarkets(data);
  };

  const fetchMarketInsights = async (region: string = 'canada', silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch(`/api/market-insights?region=${region}`);
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      const data = await res.json();
      const sortedData = Array.isArray(data) ? [...data].sort((a, b) => {
        return new Date(b.published_date).getTime() - new Date(a.published_date).getTime();
      }) : [];
      setMarketInsights(sortedData);
      
      // Auto-refresh in background
      if (!silent) {
        refreshMarketInsights(region, true);
      }
    } catch (error) {
      console.error("Failed to fetch market insights", error);
      setMarketInsights([]);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const fetchInsights = async (id: number, silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch(`/api/insights/${id}`);
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      const data = await res.json();
      // Ensure descending order by date
      const sortedData = Array.isArray(data) ? [...data].sort((a, b) => {
        return new Date(b.published_date).getTime() - new Date(a.published_date).getTime();
      }) : [];
      setInsights(sortedData);

      // Auto-refresh in background
      if (!silent) {
        const comp = competitors.find(c => c.id === id);
        if (comp) refreshInsights(comp, true);
      }
    } catch (error) {
      console.error("Failed to fetch insights", error);
      setInsights([]);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const addCompetitor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCompetitor.name) return;

    const res = await fetch('/api/competitors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newCompetitor),
    });
    
    if (res.ok) {
      const data = await res.json();
      setCompetitors(sortCompetitors([...competitors, data]));
      setNewCompetitor({ name: '', industry: '' });
      setSelectedCompetitor(data);
      setCurrentView('competitor');
    }
  };

  const deleteCompetitor = async (id: number) => {
    await fetch(`/api/competitors/${id}`, { method: 'DELETE' });
    setCompetitors(competitors.filter(c => c.id !== id));
    if (selectedCompetitor?.id === id) {
      setSelectedCompetitor(null);
      setCurrentView('welcome');
    }
  };

  const addMarket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMarket.name) return;

    const res = await fetch('/api/markets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newMarket),
    });
    
    if (res.ok) {
      const data = await res.json();
      setMarkets([...markets, data]);
      setNewMarket({ name: '' });
      setMarketRegion(data.region_code);
      setCurrentView('market_intelligence');
      fetchMarketInsights(data.region_code);
    }
  };

  const deleteMarket = async (id: number) => {
    await fetch(`/api/markets/${id}`, { method: 'DELETE' });
    const marketToDelete = markets.find(m => m.id === id);
    setMarkets(markets.filter(m => m.id !== id));
    if (marketRegion === marketToDelete?.region_code) {
      setMarketRegion('canada');
      fetchMarketInsights('canada');
    }
  };

  const refreshInsights = async (competitorOverride?: Competitor, silent = false) => {
    const target = competitorOverride || selectedCompetitor;
    if (!target) return;
    if (silent) {
      if (isBackgroundRefreshingInsightsRef.current) return;
      isBackgroundRefreshingInsightsRef.current = true;
    } else {
      setRefreshing(true);
    }
    try {
      // Fetch news results
      const results = await searchMarketInsights(target.name, target.domain);
      
      for (const result of results) {
        await fetch('/api/insights', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            competitor_id: target.id,
            ...result
          }),
        });
      }
      
      await fetchInsights(target.id, true);
      
      // Generate summary and profile simultaneously
      const [summary, profile] = await Promise.all([
        generateMarketSummary(target.name, results),
        generateCompetitorProfile(target.name, target.domain)
      ]);

      if (profile) {
        await fetch(`/api/competitors/${target.id}/profile`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(profile),
        });
      }

      if (summary) {
        await fetch(`/api/competitors/${target.id}/summary`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ executive_summary: summary }),
        });
      }

      // Refresh competitors list and selected competitor
      const updatedCompetitorRes = await fetch('/api/competitors');
      const updatedCompetitors = await updatedCompetitorRes.json();
      const sorted = sortCompetitors(updatedCompetitors);
      setCompetitors(sorted);

      if (selectedCompetitor?.id === target.id) {
        const fresh = sorted.find((c: Competitor) => c.id === target.id);
        if (fresh) {
          setSelectedCompetitor(fresh);
          setExecutiveSummary(fresh.executive_summary || null);
        }
      }
    } catch (error) {
      console.error("Refresh failed", error);
    } finally {
      if (silent) {
        isBackgroundRefreshingInsightsRef.current = false;
      } else {
        setRefreshing(false);
      }
    }
  };

  const refreshMarketInsights = async (regionOverride?: string, silent = false) => {
    const targetRegion = regionOverride || marketRegion;
    if (silent) {
      if (isBackgroundRefreshingMarketRef.current) return;
      isBackgroundRefreshingMarketRef.current = true;
    } else {
      setRefreshing(true);
    }
    try {
      const marketName = markets.find(m => m.region_code === targetRegion)?.name || targetRegion;
      const query = `${marketName} AI infrastructure, Sovereign Cloud, AI Datacentres news last 7 days`;
        
      const results = await searchMarketInsights(query);
      for (const result of results) {
        await fetch('/api/market-insights', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...result, region: targetRegion }),
        });
      }
      await fetchMarketInsights(targetRegion, true);
    } catch (error) {
      console.error("Refresh failed", error);
    } finally {
      if (silent) {
        isBackgroundRefreshingMarketRef.current = false;
      } else {
        setRefreshing(false);
      }
    }
  };

  const getSentimentIcon = (sentiment: string) => {
    switch (sentiment) {
      case 'positive': return <TrendingUp className="w-4 h-4 text-emerald-500" />;
      case 'negative': return <TrendingDown className="w-4 h-4 text-rose-500" />;
      default: return <Minus className="w-4 h-4 text-slate-400" />;
    }
  };

  return (
    <>
    <div className="flex h-screen overflow-hidden bg-gradient-to-br from-[#F8F9FA] via-white to-purple-50/50">
      {/* Sidebar */}
      <aside className="w-72 border-r border-[#3a1f54]/50 bg-gradient-to-b from-[#4B286D] to-[#2A163D] text-white flex flex-col shadow-[4px_0_24px_rgba(0,0,0,0.1)] z-20 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -mr-32 -mt-32 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-purple-500/10 rounded-full -ml-24 -mb-24 blur-2xl pointer-events-none" />
        
        <div className="p-6 border-b border-white/10 flex items-center gap-3 relative z-10">
          <div className="w-10 h-10 bg-white rounded-lg p-1.5 flex items-center justify-center shadow-sm">
            <img src="/Logos/telus.png" alt="Telus Logo" className="w-full h-full object-contain" />
          </div>
          <div className="flex flex-col">
            <h1 className="text-xs font-bold tracking-widest text-[#BEF264] uppercase opacity-80">TELUS AI Factory</h1>
            <h1 className="text-xl font-black tracking-tight text-white uppercase leading-none">MarketIntel</h1>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-2">
          <div className="text-[10px] font-bold text-white/50 uppercase tracking-widest px-3 mb-2 mt-2">Executive Summary</div>
          <div 
            onClick={() => { setCurrentView('global_summary'); setSelectedCompetitor(null); }}
            className={`group flex items-center justify-between px-3 py-1.5 rounded-lg cursor-pointer transition-all mb-2 ${
              currentView === 'global_summary' ? 'bg-white/10 text-white' : 'hover:bg-white/5 text-white/70'
            }`}
          >
            <div className="flex items-center gap-3">
              <Globe className={`w-4 h-4 ${currentView === 'global_summary' ? 'text-[#66CC00]' : 'text-white/50'}`} />
              <span className="text-sm font-medium">Weekly Market Overview</span>
            </div>
          </div>

          <div className="h-px bg-white/10 mx-3 my-3" />

          <div className="text-[10px] font-bold text-white/50 uppercase tracking-widest px-3 mb-2">News & Updates</div>
          
          <div className="px-3 mb-2">
            <form onSubmit={addMarket} className="space-y-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/50" />
                <input 
                  type="text" 
                  placeholder="Add market..."
                  className="w-full pl-9 pr-3 py-1.5 bg-white/10 border-none rounded-lg text-xs text-white placeholder-white/50 focus:ring-1 focus:ring-[#66CC00] outline-none"
                  value={newMarket.name}
                  onChange={e => setNewMarket({ ...newMarket, name: e.target.value })}
                />
              </div>
              <button 
                type="submit"
                className="w-full py-1.5 bg-[#D9F99D] text-[#4B286D] rounded-lg text-xs font-bold hover:bg-[#C8E696] transition-colors flex items-center justify-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" /> Add New
              </button>
            </form>
          </div>

          {markets.map(m => (
            <div 
              key={m.id}
              onClick={() => { setCurrentView('market_intelligence'); setMarketRegion(m.region_code); setSelectedCompetitor(null); fetchMarketInsights(m.region_code); }}
              className={`group flex items-center justify-between px-3 py-1.5 rounded-lg cursor-pointer transition-all mb-0.5 ${
                currentView === 'market_intelligence' && marketRegion === m.region_code ? 'bg-white/10 text-white' : 'hover:bg-white/5 text-white/70'
              }`}
            >
              <div className="flex items-center gap-3">
                <BarChart3 className={`w-4 h-4 ${currentView === 'market_intelligence' && marketRegion === m.region_code ? 'text-[#66CC00]' : 'text-white/50'}`} />
                <span className="text-sm font-medium">{m.name}</span>
              </div>
              <button 
                onClick={(e) => { e.stopPropagation(); deleteMarket(m.id); }}
                className="opacity-0 group-hover:opacity-100 p-1 hover:bg-white/20 rounded text-white/50 hover:text-rose-400 transition-all"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}

          <div className="h-px bg-white/10 mx-3 my-3" />

          <div className="text-[10px] font-bold text-white/50 uppercase tracking-widest px-3 mb-2">Competitor View</div>
          
          <div className="px-3 mb-2">
            <form onSubmit={addCompetitor} className="space-y-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/50" />
                <input 
                  type="text" 
                  placeholder="Add competitor..."
                  className="w-full pl-9 pr-3 py-1.5 bg-white/10 border-none rounded-lg text-xs text-white placeholder-white/50 focus:ring-1 focus:ring-[#66CC00] outline-none"
                  value={newCompetitor.name}
                  onChange={e => setNewCompetitor({ ...newCompetitor, name: e.target.value })}
                />
              </div>
              <button 
                type="submit"
                className="w-full py-1.5 bg-[#D9F99D] text-[#4B286D] rounded-lg text-xs font-bold hover:bg-[#C8E696] transition-colors flex items-center justify-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" /> Add New
              </button>
            </form>
          </div>

          {competitors.map(c => (
            <div 
              key={c.id}
              onClick={() => { setCurrentView('competitor'); setSelectedCompetitor(c); }}
              className={`group flex items-center justify-between px-3 py-1.5 rounded-lg cursor-pointer transition-all mb-0.5 ${
                currentView === 'competitor' && selectedCompetitor?.id === c.id ? 'bg-white/10 text-white' : 'hover:bg-white/5 text-white/70'
              }`}
            >
              <div className="flex items-center gap-3">
                <Building2 className={`w-4 h-4 ${currentView === 'competitor' && selectedCompetitor?.id === c.id ? 'text-[#66CC00]' : 'text-white/50'}`} />
                <span className="text-sm font-medium">{c.name}</span>
              </div>
              <button 
                onClick={(e) => { e.stopPropagation(); deleteCompetitor(c.id); }}
                className="opacity-0 group-hover:opacity-100 p-1 hover:bg-white/20 rounded text-white/50 hover:text-rose-400 transition-all"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </nav>

        <div className="p-4 border-t border-white/10">
          <div className="flex items-center gap-3 p-3 bg-white/5 rounded-xl">
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-xs font-bold text-white">JM</div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold truncate text-white">Jeffrey Mathew</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        {/* Top Navigation Header */}
        <div className="w-full bg-white/70 backdrop-blur-xl border-b border-white/50 px-8 py-3 flex justify-center items-center flex-shrink-0 z-20 shadow-[0_4px_20px_rgba(0,0,0,0.02)]">
          <div className="bg-white/80 backdrop-blur-md border border-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-full px-2 py-1.5 flex items-center gap-1">
            <button 
              onClick={() => { setCurrentView('welcome'); setSelectedCompetitor(null); }}
              className={`px-4 py-2 rounded-full flex items-center gap-2 transition-all ${currentView === 'welcome' ? 'bg-gradient-to-r from-[#4B286D] to-[#6a399c] text-white shadow-[0_4px_15px_rgba(75,40,109,0.3)]' : 'text-slate-600 hover:bg-slate-100/80'}`}
            >
              <Home className="w-4 h-4" />
              <span className="text-xs font-bold">Home</span>
            </button>
            <button 
              onClick={() => { setCurrentView('global_summary'); setSelectedCompetitor(null); }}
              className={`px-4 py-2 rounded-full flex items-center gap-2 transition-all ${currentView === 'global_summary' ? 'bg-gradient-to-r from-[#4B286D] to-[#6a399c] text-white shadow-[0_4px_15px_rgba(75,40,109,0.3)]' : 'text-slate-600 hover:bg-slate-100/80'}`}
            >
              <Globe className="w-4 h-4" />
              <span className="text-xs font-bold">Market Overview</span>
            </button>
            <button 
              onClick={() => { setCurrentView('market_intelligence'); setSelectedCompetitor(null); }}
              className={`px-4 py-2 rounded-full flex items-center gap-2 transition-all ${currentView === 'market_intelligence' ? 'bg-gradient-to-r from-[#4B286D] to-[#6a399c] text-white shadow-[0_4px_15px_rgba(75,40,109,0.3)]' : 'text-slate-600 hover:bg-slate-100/80'}`}
            >
              <BarChart3 className="w-4 h-4" />
              <span className="text-xs font-bold">News & Updates</span>
            </button>
            <button 
              onClick={() => { 
                setCurrentView('competitor');
                if (!selectedCompetitor && competitors.length > 0) {
                  setSelectedCompetitor(competitors[0]);
                }
              }}
              className={`px-4 py-2 rounded-full flex items-center gap-2 transition-all ${currentView === 'competitor' ? 'bg-gradient-to-r from-[#4B286D] to-[#6a399c] text-white shadow-[0_4px_15px_rgba(75,40,109,0.3)]' : 'text-slate-600 hover:bg-slate-100/80'}`}
            >
              <Building2 className="w-4 h-4" />
              <span className="text-xs font-bold">Competitor View</span>
            </button>
          </div>
        </div>

        {currentView === 'global_summary' ? (
          <>
            <header className="h-16 border-b border-white/60 bg-white/40 backdrop-blur-md flex items-center justify-between px-8 shadow-[0_4px_20px_rgba(0,0,0,0.01)]">
              <div className="flex items-center gap-4">
                <h2 className="text-lg font-semibold text-telus-purple">Weekly Market Overview</h2>
                <span className="px-2 py-0.5 bg-slate-100 text-telus-purple text-[10px] font-bold rounded uppercase tracking-wider">
                  Last 7 Days Analysis
                </span>
              </div>
              <div className="flex items-center gap-3">
                {globalSummary && (
                  <button 
                    onClick={exportToDoc}
                    disabled={isExporting}
                    className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#76B833] to-[#5c9126] text-white rounded-xl text-sm font-semibold hover:shadow-[0_8px_20px_rgba(118,184,51,0.3)] hover:-translate-y-0.5 transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:transform-none"
                  >
                    {isExporting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <FileDown className="w-4 h-4" />
                    )}
                    {isExporting ? 'Exporting...' : 'Export to Google Docs'}
                  </button>
                )}
                <button 
                  onClick={() => refreshGlobalSummary()}
                  disabled={refreshing}
                  className="flex items-center gap-2 px-4 py-2 bg-white/90 backdrop-blur-sm border border-white/50 rounded-xl text-sm font-medium hover:bg-white hover:shadow-md hover:-translate-y-0.5 transition-all shadow-sm disabled:opacity-50 disabled:hover:transform-none"
                >
                  {refreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  {refreshing ? 'Analyzing Last 7 Days...' : 'Refresh Summary'}
                </button>
              </div>
            </header>

            <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
              <div className="flex flex-col lg:flex-row gap-8 max-w-[1600px] mx-auto">
                {/* Main Content (Left) */}
                <div className="flex-1 space-y-8">
                  {(loading || refreshing) && !globalSummary ? (
                    <SummarySkeleton />
                  ) : globalSummary?.content ? (
                    <motion.section 
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-white/80 backdrop-blur-lg border border-white/60 rounded-3xl p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_8px_30px_rgb(75,40,109,0.08)] transition-all duration-300"
                      ref={summaryRef}
                    >
                      <div className="markdown-body weekly-overview">
                        <Markdown remarkPlugins={[remarkGfm]}>{globalSummary.content.replace(/<br\s*\/?>/gi, ' ')}</Markdown>
                      </div>
                      {globalSummary.updated_at && (
                        <div className="mt-8 pt-4 border-t border-slate-100 text-xs text-slate-400">
                          Last updated: {new Date(globalSummary.updated_at).toLocaleString()}
                        </div>
                      )}
                    </motion.section>
                  ) : (
                    <div className="bg-white/80 backdrop-blur-lg p-12 flex flex-col items-center justify-center gap-4 text-slate-400 rounded-3xl border border-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
                      <Globe className="w-8 h-8" />
                      <p className="text-sm">No summary available. Click "Refresh Summary" to generate a strategic overview.</p>
                    </div>
                  )}
                </div>

                {/* Right Panel (Infographic) */}
                <div className="w-full lg:w-80 xl:w-96 flex-shrink-0 space-y-6">
                  <div className="bg-gradient-to-br from-[#4B286D] to-[#2A163D] rounded-3xl p-6 text-white shadow-xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-16 -mt-16 blur-2xl" />
                    <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full -ml-12 -mb-12 blur-xl" />
                    
                    <div className="relative z-10">
                      <h3 className="text-xs font-black tracking-widest text-[#BEF264] uppercase mb-6 flex items-center gap-2">
                        <Leaf className="w-4 h-4" />
                        Canada Market At A Glance
                      </h3>
                      
                      <div className="space-y-5">
                        {/* TAM */}
                        <div>
                          <p className="text-white/60 text-[10px] uppercase tracking-wider font-bold mb-1">Canadian AI TAM</p>
                          <div className="flex items-end gap-2">
                            <span className="text-3xl font-black tracking-tighter">$5.5B+</span>
                            <span className="text-[#BEF264] text-xs font-bold mb-1.5 flex items-center"><TrendingUp className="w-3 h-3 mr-0.5" /> 28% CAGR</span>
                          </div>
                        </div>

                        <div className="h-px w-full bg-white/10" />

                        {/* Funding */}
                        <div>
                          <p className="text-white/60 text-[10px] uppercase tracking-wider font-bold mb-1">Federal AI Compute Fund</p>
                          <div className="flex items-end gap-2">
                            <span className="text-3xl font-black tracking-tighter">$2.4B</span>
                            <span className="text-white/80 text-xs font-medium mb-1.5">CAD</span>
                          </div>
                        </div>

                        <div className="h-px w-full bg-white/10" />

                        {/* Key Players */}
                        <div>
                          <p className="text-white/60 text-[10px] uppercase tracking-wider font-bold mb-3">Key Ecosystem Players</p>
                          <div className="flex flex-wrap gap-2">
                            {['TELUS', 'Bell', 'Cohere', 'Hypertec', 'ThinkOn'].map(player => (
                              <span key={player} className="px-2.5 py-1 bg-white/10 rounded-lg text-[10px] font-bold border border-white/5">
                                {player}
                              </span>
                            ))}
                          </div>
                        </div>

                        <div className="h-px w-full bg-white/10" />

                        {/* Infrastructure */}
                        <div>
                          <p className="text-white/60 text-[10px] uppercase tracking-wider font-bold mb-3">Infrastructure & Power</p>
                          <div className="space-y-2">
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-white/80">High-Density Power</span>
                              <span className="font-bold">100MW+ Targets</span>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-white/80">GPU Clusters</span>
                              <span className="font-bold">H100 / B200</span>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-white/80">Data Residency</span>
                              <span className="font-bold text-[#BEF264]">100% Sovereign</span>
                            </div>
                          </div>
                        </div>

                        <div className="h-px w-full bg-white/10" />

                        {/* Industry Use Cases */}
                        <div>
                          <p className="text-white/60 text-[10px] uppercase tracking-wider font-bold mb-3">Industry Use Cases</p>
                          <div className="flex flex-wrap gap-2">
                            {['Healthcare', 'Financial Services', 'Public Sector', 'Telecommunications', 'Retail'].map(useCase => (
                              <span key={useCase} className="px-2.5 py-1 bg-white/10 rounded-lg text-[10px] font-bold border border-white/5">
                                {useCase}
                              </span>
                            ))}
                          </div>
                        </div>

                        <div className="h-px w-full bg-white/10" />

                        {/* Academic & Research */}
                        <div>
                          <p className="text-white/60 text-[10px] uppercase tracking-wider font-bold mb-3">Academic & Research</p>
                          <div className="flex flex-wrap gap-2">
                            {['Mila', 'Vector Institute', 'Amii', 'UofT', 'McGill'].map(inst => (
                              <span key={inst} className="px-2.5 py-1 bg-white/10 rounded-lg text-[10px] font-bold border border-white/5">
                                {inst}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-3xl p-6 text-white shadow-xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-16 -mt-16 blur-2xl" />
                    <div className="absolute bottom-0 left-0 w-24 h-24 bg-[#4B286D]/40 rounded-full -ml-12 -mb-12 blur-xl" />
                    
                    <div className="relative z-10">
                      <h3 className="text-xs font-black tracking-widest text-[#BEF264] uppercase mb-6 flex items-center gap-2">
                        <Activity className="w-4 h-4" />
                        Global Market At A Glance
                      </h3>
                      
                      <div className="space-y-6">
                        {/* Stat 1 */}
                        <div>
                          <p className="text-white/60 text-[10px] uppercase tracking-wider font-bold mb-1">Global AI Infrastructure TAM</p>
                          <div className="flex items-end gap-2">
                            <span className="text-4xl font-black tracking-tighter">$150B+</span>
                            <span className="text-[#BEF264] text-xs font-bold mb-1.5 flex items-center"><TrendingUp className="w-3 h-3 mr-0.5" /> 35% CAGR</span>
                          </div>
                        </div>

                        <div className="h-px w-full bg-white/10" />

                        {/* Stat 2 */}
                        <div>
                          <p className="text-white/60 text-[10px] uppercase tracking-wider font-bold mb-3">Key Growth Drivers</p>
                          <div className="space-y-2">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0">
                                <Cpu className="w-4 h-4 text-[#BEF264]" />
                              </div>
                              <span className="text-sm font-medium">LLM Training & Inference</span>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0">
                                <Globe className="w-4 h-4 text-[#BEF264]" />
                              </div>
                              <span className="text-sm font-medium">Sovereign AI Initiatives</span>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0">
                                <Server className="w-4 h-4 text-[#BEF264]" />
                              </div>
                              <span className="text-sm font-medium">High-Density Data Centers</span>
                            </div>
                          </div>
                        </div>

                        <div className="h-px w-full bg-white/10" />

                        {/* Stat 3 */}
                        <div>
                          <p className="text-white/60 text-[10px] uppercase tracking-wider font-bold mb-3">Market Share (Accelerators)</p>
                          <div className="space-y-3">
                            <div>
                              <div className="flex justify-between text-xs mb-1">
                                <span className="font-bold">NVIDIA</span>
                                <span className="text-white/60">~85%</span>
                              </div>
                              <div className="w-full bg-white/10 rounded-full h-1.5">
                                <div className="bg-[#BEF264] h-1.5 rounded-full" style={{ width: '85%' }}></div>
                              </div>
                            </div>
                            <div>
                              <div className="flex justify-between text-xs mb-1">
                                <span className="font-bold">AMD</span>
                                <span className="text-white/60">~10%</span>
                              </div>
                              <div className="w-full bg-white/10 rounded-full h-1.5">
                                <div className="bg-white/40 h-1.5 rounded-full" style={{ width: '10%' }}></div>
                              </div>
                            </div>
                            <div>
                              <div className="flex justify-between text-xs mb-1">
                                <span className="font-bold">Custom Silicon (TPU, Trainium)</span>
                                <span className="text-white/60">~5%</span>
                              </div>
                              <div className="w-full bg-white/10 rounded-full h-1.5">
                                <div className="bg-white/20 h-1.5 rounded-full" style={{ width: '5%' }}></div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white/80 backdrop-blur-lg rounded-3xl p-6 border border-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
                    <h3 className="text-xs font-black tracking-widest text-[#4B286D] uppercase mb-4 flex items-center gap-2">
                      <Cloud className="w-4 h-4" />
                      Emerging Trends
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {['Liquid Cooling', 'Edge AI', 'Hybrid Cloud', 'Silicon Photonics', 'AI PCs'].map(tag => (
                        <span key={tag} className="px-3 py-1.5 bg-slate-100 text-slate-600 rounded-xl text-[10px] font-bold">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : currentView === 'market_intelligence' ? (
          <>
            <header className="h-16 border-b border-white/60 bg-white/40 backdrop-blur-md flex items-center justify-between px-8 shadow-[0_4px_20px_rgba(0,0,0,0.01)]">
              <div className="flex items-center gap-4">
                <h2 className="text-lg font-semibold">News & Updates</h2>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => refreshMarketInsights()}
                  disabled={refreshing}
                  className="flex items-center gap-2 px-4 py-2 bg-white/90 backdrop-blur-sm border border-white/50 rounded-xl text-sm font-medium hover:bg-white hover:shadow-md hover:-translate-y-0.5 transition-all shadow-sm disabled:opacity-50 disabled:hover:transform-none"
                >
                  {refreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  {refreshing ? 'Scanning Web...' : 'Refresh Insights'}
                </button>
              </div>
            </header>

            <div className="flex-1 overflow-y-auto p-8 space-y-8">
              <section>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-slate-900">{markets.find(m => m.region_code === marketRegion)?.name || marketRegion}</h3>
                    <span className="px-2 py-0.5 bg-slate-100 text-slate-500 text-[10px] font-bold rounded uppercase tracking-wider">
                      {markets.find(m => m.region_code === marketRegion)?.name || marketRegion} AI & Cloud
                    </span>
                  </div>
                  <span className="text-xs text-slate-400">{marketInsights.length} reports found</span>
                </div>

                <div className="data-grid rounded-xl overflow-hidden">
                  <div className="grid grid-cols-[40px_1fr_120px_100px] col-header">
                    <div></div>
                    <div>News & Insight</div>
                    <div>Published</div>
                    <div>Source</div>
                  </div>
                  
                  <AnimatePresence mode="popLayout">
                    {loading && marketInsights.length === 0 ? (
                      <NewsSkeleton />
                    ) : marketInsights.length > 0 ? (
                      marketInsights.map((insight, idx) => (
                        <motion.div 
                          key={insight.id}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: idx * 0.05 }}
                          className="grid grid-cols-[40px_1fr_120px_100px] items-center data-row"
                        >
                          <div className="text-xs font-mono text-slate-300">{(idx + 1).toString().padStart(2, '0')}</div>
                          <div>
                            <h4 className="text-sm font-semibold text-slate-900">
                              {insight.title}
                            </h4>
                            <p className="text-xs text-slate-500 mt-1 line-clamp-2">{insight.summary}</p>
                          </div>
                          <div className="text-xs font-mono text-slate-500">{insight.published_date}</div>
                          <div className="text-xs">
                            <a href={insight.url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline flex items-center gap-1">
                              Link <ExternalLink className="w-3 h-3" />
                            </a>
                          </div>
                        </motion.div>
                      ))
                    ) : (
                      <div className="bg-white/80 backdrop-blur-lg p-12 flex flex-col items-center justify-center gap-4 text-slate-400 rounded-3xl border border-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
                        <AlertCircle className="w-8 h-8" />
                        <p className="text-sm">No insights available. {refreshing ? 'Scanning the web now...' : 'Click "Refresh Insights" to scan the web.'}</p>
                      </div>
                    )}
                  </AnimatePresence>
                </div>
              </section>
            </div>
          </>
        ) : currentView === 'competitor' && selectedCompetitor ? (
          <>
            <header className="h-16 border-b border-[#685e91] bg-white/40 backdrop-blur-md flex items-center justify-between px-8 shadow-[0_4px_20px_rgba(0,0,0,0.01)]">
              <div className="flex items-center gap-4">
                <h2 className="text-lg font-semibold">{selectedCompetitor.name}</h2>
                <span className="px-2 py-0.5 bg-slate-100 text-slate-500 text-[10px] font-bold rounded uppercase tracking-wider">
                  {selectedCompetitor.industry || 'General'}
                </span>
              </div>
              <button 
                onClick={() => refreshInsights()}
                disabled={refreshing}
                className="flex items-center gap-2 px-4 py-2 bg-white/90 backdrop-blur-sm border border-white/50 rounded-xl text-sm font-medium hover:bg-white hover:shadow-md hover:-translate-y-0.5 transition-all shadow-sm disabled:opacity-50 disabled:hover:transform-none"
              >
                {refreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                {refreshing ? 'Scanning Web...' : 'Refresh Insights'}
              </button>
            </header>

            <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
              <div className="flex flex-col lg:flex-row gap-8 max-w-[1600px] mx-auto">
                <div className="flex-1 space-y-8">
                  {/* Executive Summary */}
                  {refreshing && !executiveSummary ? (
                    <SummarySkeleton />
                  ) : executiveSummary ? (
                    <motion.section 
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-white/80 backdrop-blur-lg border border-white/60 rounded-3xl p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_8px_30px_rgb(75,40,109,0.08)] transition-all duration-300"
                    >
                      <div className="flex items-center gap-2 mb-6 pb-4 border-b border-slate-100">
                        <BarChart3 className="w-5 h-5 text-[#4B286D]" />
                        <h3 className="font-bold text-lg text-slate-900">Executive Summary</h3>
                      </div>
                      <div className="markdown-body">
                        <Markdown remarkPlugins={[remarkGfm]}>{executiveSummary.replace(/<br\s*\/?>/gi, ' ')}</Markdown>
                      </div>
                    </motion.section>
                  ) : null}

                  {/* Insights List */}
                  <section>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-semibold text-slate-900">News & Updates</h3>
                      <span className="text-xs text-slate-400">{insights.length} reports found</span>
                    </div>

                    <div className="data-grid rounded-xl overflow-hidden">
                      <div className="grid grid-cols-[40px_1fr_120px_100px] col-header">
                        <div></div>
                        <div>News & Insight</div>
                        <div>Published</div>
                        <div>Source</div>
                      </div>
                      
                      <AnimatePresence mode="popLayout">
                        {loading && insights.length === 0 ? (
                          <NewsSkeleton />
                        ) : insights.length > 0 ? (
                          insights.map((insight, idx) => (
                            <motion.div 
                              key={insight.id}
                              initial={{ opacity: 0, x: -10 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: idx * 0.05 }}
                              className="grid grid-cols-[40px_1fr_120px_100px] items-center data-row"
                            >
                              <div className="text-xs font-mono text-slate-300">{(idx + 1).toString().padStart(2, '0')}</div>
                              <div>
                                <h4 className="text-sm font-semibold text-slate-900">
                                  {insight.title}
                                </h4>
                                <p className="text-xs text-slate-500 mt-1 line-clamp-2">{insight.summary}</p>
                              </div>
                              <div className="text-xs font-mono text-slate-500">{insight.published_date}</div>
                              <div className="text-xs">
                                <a href={insight.url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline flex items-center gap-1">
                                  Link <ExternalLink className="w-3 h-3" />
                                </a>
                              </div>
                            </motion.div>
                          ))
                        ) : (
                          <div className="bg-white/80 backdrop-blur-lg p-12 flex flex-col items-center justify-center gap-4 text-slate-400 rounded-3xl border border-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
                            <AlertCircle className="w-8 h-8" />
                            <p className="text-sm">No insights available. {refreshing ? 'Scanning the web now...' : 'Click "Refresh Insights" to scan the web.'}</p>
                          </div>
                        )}
                      </AnimatePresence>
                    </div>
                  </section>
                </div>

                {/* Right Sidebar - Competitor Profile Infographic */}
                <aside className="w-full lg:w-80 xl:w-96 flex-shrink-0 space-y-6">
                  {/* Card 1: Core Profile & Stats (Purple Gradient) */}
                  <motion.div 
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="bg-gradient-to-br from-[#4B286D] to-[#2A163D] rounded-3xl p-6 text-white shadow-xl relative overflow-hidden"
                  >
                    <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-16 -mt-16 blur-2xl" />
                    <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full -ml-12 -mb-12 blur-xl" />
                    
                    <div className="relative z-10 flex flex-col items-center text-center mb-6">
                      <div className="w-20 h-20 bg-white backdrop-blur-sm rounded-2xl p-3 flex items-center justify-center shadow-xl mb-4 transform -rotate-3 hover:rotate-0 transition-transform duration-300 border border-white/20">
                        {(() => {
                          const logoMap: Record<string, string> = {
                            'Bell AI Fabric': '/Logos/bell-canada.png',
                            'TELUS AI Factory': '/Logos/telus.png',
                            'Cohere': '/Logos/cohere.png',
                            'ThinkOn': '/Logos/thinkon-inc.png',
                            'Hypertec': '/Logos/hypertec-group.png',
                            'Microsoft': '/Logos/microsoft.png'
                          };
                          const localLogo = logoMap[selectedCompetitor.name];
                          
                          if (localLogo) {
                            return (
                              <img 
                                src={localLogo}
                                alt={selectedCompetitor.name} 
                                className="max-w-full max-h-full object-contain"
                                referrerPolicy="no-referrer"
                              />
                            );
                          }
                          
                          if (selectedCompetitor.logo_url) {
                            return (
                              <img 
                                src={(() => {
                                  let url = selectedCompetitor.logo_url;
                                  if (url.includes('logo.dev')) {
                                    const token = import.meta.env.VITE_LOGO_DEV_TOKEN;
                                    if (token && token !== 'pk_YOUR_TOKEN') {
                                      if (url.includes('pk_YOUR_TOKEN')) {
                                        url = url.replace('pk_YOUR_TOKEN', token);
                                      } else if (!url.includes('token=')) {
                                        url = url.includes('?') ? `${url}&token=${token}` : `${url}?token=${token}`;
                                      }
                                    }
                                  }
                                  return url;
                                })()}
                                alt={selectedCompetitor.name} 
                                className="max-w-full max-h-full object-contain"
                                referrerPolicy="no-referrer"
                                onError={(e) => {
                                  e.currentTarget.style.display = 'none';
                                  const nextSibling = e.currentTarget.nextElementSibling;
                                  if (nextSibling) {
                                    nextSibling.classList.remove('hidden');
                                  }
                                }}
                              />
                            );
                          }
                          
                          return <Building2 className="w-10 h-10 text-white/50" />;
                        })()}
                        {selectedCompetitor.logo_url && !Object.keys({
                            'Bell AI Fabric': '/Logos/bell-canada.png',
                            'TELUS AI Factory': '/Logos/telus.png',
                            'Cohere': '/Logos/cohere.png',
                            'ThinkOn': '/Logos/thinkon-inc.png',
                            'Hypertec': '/Logos/hypertec-group.png',
                            'Microsoft': '/Logos/microsoft.png'
                          }).includes(selectedCompetitor.name) && (
                          <Building2 className="w-10 h-10 text-white/50 hidden" />
                        )}
                      </div>
                      <h3 className="text-xl font-black tracking-tight leading-none">{selectedCompetitor.name}</h3>
                      <div className="mt-2 px-3 py-1 bg-white/10 backdrop-blur-md rounded-full border border-white/10">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-[#BEF264]">{selectedCompetitor.industry}</p>
                      </div>
                    </div>

                    {/* Infographic Description */}
                    {selectedCompetitor.description && (
                      <div className="mb-6">
                        <p className="text-xs text-white/80 leading-relaxed italic text-center">
                          "{selectedCompetitor.description}"
                        </p>
                      </div>
                    )}

                    <div className="h-px w-full bg-white/10 mb-6" />

                    {/* Infographic Stats Grid */}
                    <div className="grid grid-cols-2 gap-3">
                      {/* Size Stat */}
                      <div className="p-4 bg-white/5 rounded-2xl border border-white/10 flex flex-col items-center text-center">
                        <div className="p-2 bg-white/10 rounded-xl text-white mb-2">
                          <Users className="w-4 h-4" />
                        </div>
                        <p className="text-[9px] font-black text-white/60 uppercase tracking-tighter">Scale & Size</p>
                        <p className="text-[11px] font-bold text-white mt-1">{selectedCompetitor.size || 'N/A'}</p>
                      </div>

                      {/* Power Stat */}
                      <div className="p-4 bg-white/5 rounded-2xl border border-white/10 flex flex-col items-center text-center">
                        <div className="p-2 bg-white/10 rounded-xl text-[#BEF264] mb-2">
                          <Zap className="w-4 h-4" />
                        </div>
                        <p className="text-[9px] font-black text-white/60 uppercase tracking-tighter">Power Capacity</p>
                        <p className="text-[11px] font-bold text-white mt-1">{selectedCompetitor.power_capacity || 'N/A'}</p>
                      </div>

                      {/* GPU Stat */}
                      <div className="p-4 bg-white/5 rounded-2xl border border-white/10 flex flex-col items-center text-center col-span-2">
                        <div className="flex items-center gap-3 w-full">
                          <div className="p-2 bg-white/10 rounded-xl text-[#BEF264]">
                            <Cpu className="w-4 h-4" />
                          </div>
                          <div className="text-left flex-1 min-w-0">
                            <p className="text-[9px] font-black text-white/60 uppercase tracking-tighter">Computing Power (GPU)</p>
                            <p className="text-xs font-bold text-white mt-0.5">{selectedCompetitor.gpu_type || 'N/A'}</p>
                          </div>
                        </div>
                      </div>

                      {/* Location Stat */}
                      <div className="p-4 bg-white/5 rounded-2xl border border-white/10 flex items-center gap-3 col-span-2">
                        <div className="p-2 bg-white/10 rounded-xl text-white">
                          <Map className="w-4 h-4" />
                        </div>
                        <div className="text-left flex-1 min-w-0">
                          <p className="text-[9px] font-black text-white/60 uppercase tracking-tighter">Global Footprint</p>
                          <p className="text-xs font-bold text-white mt-0.5">{selectedCompetitor.location || selectedCompetitor.head_office || 'N/A'}</p>
                        </div>
                      </div>
                    </div>
                  </motion.div>

                  {/* Card 2: Strategic Info & Links (Slate Gradient) */}
                  <motion.div 
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 }}
                    className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-3xl p-6 text-white shadow-xl relative overflow-hidden"
                  >
                    <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-16 -mt-16 blur-2xl" />
                    <div className="absolute bottom-0 left-0 w-24 h-24 bg-[#4B286D]/40 rounded-full -ml-12 -mb-12 blur-xl" />
                    
                    <div className="relative z-10">
                      <h3 className="text-xs font-black tracking-widest text-[#BEF264] uppercase mb-6 flex items-center gap-2">
                        <Activity className="w-4 h-4" />
                        Strategic Positioning
                      </h3>

                      {/* Partnerships & Customers Section */}
                      <div className="space-y-6 mb-6">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <Handshake className="w-4 h-4 text-white" />
                            <h4 className="text-[10px] font-black text-white/60 uppercase tracking-widest">Strategic Alliances</h4>
                          </div>
                          <p className="text-xs text-white/80 leading-relaxed bg-white/5 p-3 rounded-xl border border-white/10">
                            {selectedCompetitor.partnerships || 'No major partnerships documented.'}
                          </p>
                        </div>

                        <div className="h-px w-full bg-white/10" />

                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <Users className="w-4 h-4 text-white" />
                            <h4 className="text-[10px] font-black text-white/60 uppercase tracking-widest">Key Customers</h4>
                          </div>
                          <p className="text-xs text-white/80 leading-relaxed bg-white/5 p-3 rounded-xl border border-white/10">
                            {selectedCompetitor.customers || 'Enterprise and government client list pending.'}
                          </p>
                        </div>
                      </div>

                      {/* Website Link */}
                      <div className="pt-2 border-t border-white/10">
                        {selectedCompetitor.website && (
                          <a 
                            href={selectedCompetitor.website} 
                            target="_blank" 
                            rel="noreferrer"
                            className="w-full flex items-center justify-center gap-2 py-3 mt-4 bg-[#BEF264] text-[#4B286D] rounded-xl text-xs font-bold hover:bg-[#C8E696] transition-colors shadow-lg shadow-[#BEF264]/20"
                          >
                            Explore {selectedCompetitor.domain || 'Official Site'}
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    </div>
                  </motion.div>

                  {/* Strategic Focus Tags */}
                  <div className="bg-[#4B286D]/5 border border-[#4B286D]/10 rounded-3xl p-8">
                    <h4 className="text-[10px] font-black text-[#4B286D] uppercase tracking-[0.2em] mb-6 text-center">Core Strategic Pillars</h4>
                    <div className="flex flex-wrap justify-center gap-2">
                      {['AI Infrastructure', 'Sovereign Cloud', 'HPC', 'Edge Computing'].map(tag => (
                        <span key={tag} className="px-4 py-2 bg-white/80 backdrop-blur-sm border border-[#4B286D]/10 rounded-2xl text-[10px] font-bold text-[#4B286D] shadow-sm">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </aside>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center overflow-y-auto">
            {/* Hero Banner */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="w-full max-w-4xl mb-12 rounded-[2.5rem] overflow-hidden shadow-[0_20px_50px_rgba(75,40,109,0.2)] border border-white/20 relative group h-[360px]"
              style={{
                backgroundImage: 'url("/Gemini_Generated_Image_qf8z9yqf8z9yqf8z.jpg")',
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }}
            >
              <div className="absolute inset-0 bg-gradient-to-t from-[#4B286D]/95 via-[#4B286D]/40 to-transparent flex items-end p-10">
                <div className="text-left">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#D9F99D] text-[#4B286D] text-[10px] font-bold uppercase tracking-wider mb-4">
                    <Sparkles className="w-3 h-3" />
                    Sovereign Canadian AI Infrastructure
                  </div>
                  <h1 className="text-4xl font-black text-white tracking-tight mb-2">TELUS AI Factory</h1>
                  <p className="text-white/80 text-sm max-w-md">
                    Empowering Canada's digital future with high-performance compute and secure sovereign cloud solutions.
                  </p>
                </div>
              </div>
            </motion.div>

            <h2 className="text-2xl font-bold text-slate-900 mb-2">MarketIntel</h2>
            <p className="text-slate-500 max-w-xl mb-10">
              Monitor the competitive landscape, track emerging trends, and gain strategic insights into the Canadian and Global AI infrastructure market.
            </p>
            <div className="grid grid-cols-3 gap-6 w-full max-w-3xl">
              {[
                { icon: <TrendingUp className="w-9 h-9" />, title: 'Trend Analysis', desc: 'Identify emerging global and local market shifts' },
                { icon: <BarChart3 className="w-9 h-9" />, title: 'Competitor Tracking', desc: 'Monitor competitor strategic moves and announcements' },
                { icon: <RefreshCw className="w-9 h-9" />, title: 'Real-time Updates', desc: 'Stay ahead with live updates and insights' },
              ].map((item, i) => (
                <div key={i} className="bg-white/80 backdrop-blur-lg p-6 rounded-3xl border border-[#685e91] shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_8px_30px_rgb(75,40,109,0.08)] hover:-translate-y-1 transition-all duration-300 flex flex-col items-center text-center">
                  <div className="w-16 h-16 bg-gradient-to-br from-slate-50 to-slate-100 rounded-2xl flex items-center justify-center text-[#4B286D] mb-4 shadow-inner border border-white">
                    {item.icon}
                  </div>
                  <h3 className="text-base font-bold mb-1">{item.title}</h3>
                  <p className="text-[13px] text-slate-500 leading-tight">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      <ChatBot competitors={competitors} marketInsights={marketInsights} />
    </div>
    </>
  );
}
