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
  Sparkles,
  Home,
  FileDown,
  Building2,
  Info
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Competitor, Insight, Market } from './types';
import { searchMarketInsights, generateMarketSummary, generateRegionInsights, generateGlobalSummary } from './services/gemini';
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

  const exportToPDF = () => {
    if (!summaryRef.current) return;
    
    const element = summaryRef.current;
    const opt = {
      margin: 10,
      filename: `Weekly_Market_Overview_${new Date().toISOString().split('T')[0]}.pdf`,
      image: { type: 'jpeg' as const, quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, logging: false },
      jsPDF: { unit: 'mm' as const, format: 'a4' as const, orientation: 'portrait' as const }
    };

    html2pdf().from(element).set(opt).save();
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
      
      // Auto-refresh if empty
      if (sortedData.length === 0 && !silent) {
        refreshMarketInsights(region);
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

      // Auto-refresh if empty
      if (sortedData.length === 0 && !silent) {
        const comp = competitors.find(c => c.id === id);
        if (comp) refreshInsights(comp);
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

  const refreshInsights = async (competitorOverride?: Competitor) => {
    const target = competitorOverride || selectedCompetitor;
    if (!target) return;
    setRefreshing(true);
    try {
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
      
      // Generate summary
      const summary = await generateMarketSummary(target.name, results);
      if (summary) {
        await fetch(`/api/competitors/${target.id}/summary`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ executive_summary: summary }),
        });
        
        // Update local state for the selected competitor if it's the one we just refreshed
        if (selectedCompetitor?.id === target.id) {
          setExecutiveSummary(summary);
          setSelectedCompetitor({ ...selectedCompetitor, executive_summary: summary });
        }
        
        // Update the competitors list so it has the new summary
        setCompetitors(prev => prev.map(c => c.id === target.id ? { ...c, executive_summary: summary } : c));
      }
    } catch (error) {
      console.error("Refresh failed", error);
    } finally {
      setRefreshing(false);
    }
  };

  const refreshMarketInsights = async (regionOverride?: string) => {
    const targetRegion = regionOverride || marketRegion;
    setRefreshing(true);
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
      setRefreshing(false);
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
    <div className="flex h-screen overflow-hidden bg-[#F8F9FA]">
      {/* Sidebar */}
      <aside className="w-72 border-r border-[#3a1f54] bg-[#4B286D] text-white flex flex-col">
        <div className="p-6 border-b border-white/10 flex items-center justify-between">
          <div className="flex flex-col">
            <h1 className="text-xs font-bold tracking-widest text-[#BEF264] uppercase opacity-80">TELUS AI Factory</h1>
            <h1 className="text-xl font-black tracking-tight text-white uppercase leading-none">MarketIntel</h1>
          </div>
          <button 
            onClick={() => { setCurrentView('welcome'); setSelectedCompetitor(null); setMarketRegion('canada'); }}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors group"
            title="Home"
          >
            <Home className="w-5 h-5 text-[#D9F99D] group-hover:text-white transition-colors" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-2">
          <div className="text-[10px] font-bold text-white/50 uppercase tracking-widest px-3 mb-2 mt-2">Executive Summary</div>
          <div 
            onClick={() => { setCurrentView('global_summary'); setSelectedCompetitor(null); }}
            className={`group flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer transition-all mb-4 ${
              currentView === 'global_summary' ? 'bg-white/10 text-white' : 'hover:bg-white/5 text-white/70'
            }`}
          >
            <div className="flex items-center gap-3">
              <BarChart3 className={`w-4 h-4 ${currentView === 'global_summary' ? 'text-[#66CC00]' : 'text-white/50'}`} />
              <span className="text-sm font-medium">Weekly Market Overview</span>
            </div>
          </div>

          <div className="text-[10px] font-bold text-white/50 uppercase tracking-widest px-3 mb-2 mt-2">Market Insights</div>
          
          <div className="px-3 mb-4">
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
              className={`group flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer transition-all mb-1 ${
                currentView === 'market_intelligence' && marketRegion === m.region_code ? 'bg-white/10 text-white' : 'hover:bg-white/5 text-white/70'
              }`}
            >
              <div className="flex items-center gap-3">
                <Globe className={`w-4 h-4 ${currentView === 'market_intelligence' && marketRegion === m.region_code ? 'text-[#66CC00]' : 'text-white/50'}`} />
                <span className="text-sm font-medium">News & Updates - {m.name}</span>
              </div>
              <button 
                onClick={(e) => { e.stopPropagation(); deleteMarket(m.id); }}
                className="opacity-0 group-hover:opacity-100 p-1 hover:bg-white/20 rounded text-white/50 hover:text-rose-400 transition-all"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}

          <div className="text-[10px] font-bold text-white/50 uppercase tracking-widest px-3 mb-2 mt-6">Competitor Landscape</div>
          
          <div className="px-3 mb-4">
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
              className={`group flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer transition-all mb-1 ${
                currentView === 'competitor' && selectedCompetitor?.id === c.id ? 'bg-white/10 text-white' : 'hover:bg-white/5 text-white/70'
              }`}
            >
              <div className="flex items-center gap-3">
                <BarChart3 className={`w-4 h-4 ${currentView === 'competitor' && selectedCompetitor?.id === c.id ? 'text-[#66CC00]' : 'text-white/50'}`} />
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
      <main className="flex-1 flex flex-col overflow-hidden">
        {currentView === 'global_summary' ? (
          <>
            <header className="h-16 border-b border-[#E9ECEF] bg-white flex items-center justify-between px-8">
              <div className="flex items-center gap-4">
                <h2 className="text-lg font-semibold text-telus-purple">Weekly Market Overview</h2>
                <span className="px-2 py-0.5 bg-slate-100 text-telus-purple text-[10px] font-bold rounded uppercase tracking-wider">
                  Last 7 Days Analysis
                </span>
              </div>
              <div className="flex items-center gap-3">
                {globalSummary && (
                  <button 
                    onClick={exportToPDF}
                    className="flex items-center gap-2 px-4 py-2 bg-[#76B833] text-white rounded-lg text-sm font-semibold hover:bg-[#66992B] transition-all shadow-sm hover:shadow-md"
                  >
                    <FileDown className="w-4 h-4" />
                    Export to PDF
                  </button>
                )}
                <button 
                  onClick={() => refreshGlobalSummary()}
                  disabled={refreshing}
                  className="flex items-center gap-2 px-4 py-2 bg-white border border-[#CED4DA] rounded-lg text-sm font-medium hover:bg-slate-50 transition-all disabled:opacity-50"
                >
                  {refreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  {refreshing ? 'Analyzing Last 7 Days...' : 'Refresh Summary'}
                </button>
              </div>
            </header>

            <div className="flex-1 overflow-y-auto p-8 space-y-8">
              {(loading || refreshing) && !globalSummary ? (
                <SummarySkeleton />
              ) : globalSummary?.content ? (
                <motion.section 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white border border-[#E9ECEF] rounded-2xl p-8 shadow-sm"
                  ref={summaryRef}
                >
                  <div className="markdown-body weekly-overview">
                    <Markdown remarkPlugins={[remarkGfm]}>{globalSummary.content}</Markdown>
                  </div>
                  {globalSummary.updated_at && (
                    <div className="mt-8 pt-4 border-t border-slate-100 text-xs text-slate-400">
                      Last updated: {new Date(globalSummary.updated_at).toLocaleString()}
                    </div>
                  )}
                </motion.section>
              ) : (
                <div className="bg-white p-12 flex flex-col items-center justify-center gap-4 text-slate-400 rounded-2xl border border-[#E9ECEF]">
                  <Globe className="w-8 h-8" />
                  <p className="text-sm">No summary available. Click "Refresh Summary" to generate a strategic overview.</p>
                </div>
              )}
            </div>
          </>
        ) : currentView === 'market_intelligence' ? (
          <>
            <header className="h-16 border-b border-[#E9ECEF] bg-white flex items-center justify-between px-8">
              <div className="flex items-center gap-4">
                <h2 className="text-lg font-semibold">News & Updates - {markets.find(m => m.region_code === marketRegion)?.name || marketRegion}</h2>
                <span className="px-2 py-0.5 bg-slate-100 text-slate-500 text-[10px] font-bold rounded uppercase tracking-wider">
                  {markets.find(m => m.region_code === marketRegion)?.name || marketRegion} AI & Cloud
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => refreshMarketInsights()}
                  disabled={refreshing}
                  className="flex items-center gap-2 px-4 py-2 bg-white border border-[#CED4DA] rounded-lg text-sm font-medium hover:bg-slate-50 transition-all disabled:opacity-50"
                >
                  {refreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  {refreshing ? 'Scanning Web...' : 'Refresh Insights'}
                </button>
              </div>
            </header>

            <div className="flex-1 overflow-y-auto p-8 space-y-8">
              <section>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-slate-900">News & Updates - {markets.find(m => m.region_code === marketRegion)?.name || marketRegion}</h3>
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
                      <div className="bg-white p-12 flex flex-col items-center justify-center gap-4 text-slate-400">
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
            <header className="h-16 border-b border-[#E9ECEF] bg-white flex items-center justify-between px-8">
              <div className="flex items-center gap-4">
                <h2 className="text-lg font-semibold">{selectedCompetitor.name}</h2>
                <span className="px-2 py-0.5 bg-slate-100 text-slate-500 text-[10px] font-bold rounded uppercase tracking-wider">
                  {selectedCompetitor.industry || 'General'}
                </span>
              </div>
              <button 
                onClick={() => refreshInsights()}
                disabled={refreshing}
                className="flex items-center gap-2 px-4 py-2 bg-white border border-[#CED4DA] rounded-lg text-sm font-medium hover:bg-slate-50 transition-all disabled:opacity-50"
              >
                {refreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                {refreshing ? 'Scanning Web...' : 'Refresh Insights'}
              </button>
            </header>

            <div className="flex-1 overflow-y-auto p-8">
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-8">
                <div className="space-y-8">
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
                          <div className="bg-white p-12 flex flex-col items-center justify-center gap-4 text-slate-400">
                            <AlertCircle className="w-8 h-8" />
                            <p className="text-sm">No insights available. {refreshing ? 'Scanning the web now...' : 'Click "Refresh Insights" to scan the web.'}</p>
                          </div>
                        )}
                      </AnimatePresence>
                    </div>
                  </section>

                  {/* Executive Summary */}
                  {refreshing && !executiveSummary ? (
                    <SummarySkeleton />
                  ) : executiveSummary ? (
                    <motion.section 
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-white border border-[#E9ECEF] rounded-2xl p-8 shadow-sm"
                    >
                      <div className="flex items-center gap-2 mb-6 pb-4 border-b border-slate-100">
                        <BarChart3 className="w-5 h-5 text-[#4B286D]" />
                        <h3 className="font-bold text-lg text-slate-900">Executive Summary</h3>
                      </div>
                      <div className="markdown-body">
                        <Markdown remarkPlugins={[remarkGfm]}>{executiveSummary}</Markdown>
                      </div>
                    </motion.section>
                  ) : null}
                </div>

                {/* Right Sidebar - Competitor Profile */}
                <aside className="space-y-6">
                  <motion.div 
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="bg-white border border-[#E9ECEF] rounded-2xl overflow-hidden shadow-sm"
                  >
                    <div className="p-6 border-b border-slate-50 bg-slate-50/50">
                      <div className="flex items-center gap-4 mb-4">
                        <div className="w-16 h-16 bg-white rounded-xl border border-slate-100 p-2 flex items-center justify-center shadow-sm">
                          {selectedCompetitor.logo_url ? (
                            <img 
                              src={selectedCompetitor.logo_url} 
                              alt={selectedCompetitor.name} 
                              className="max-w-full max-h-full object-contain"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <Building2 className="w-8 h-8 text-slate-300" />
                          )}
                        </div>
                        <div>
                          <h3 className="font-bold text-slate-900 leading-tight">{selectedCompetitor.name}</h3>
                          <p className="text-xs text-slate-500 mt-1">{selectedCompetitor.industry}</p>
                        </div>
                      </div>
                      
                      {selectedCompetitor.description && (
                        <p className="text-xs text-slate-600 leading-relaxed line-clamp-4">
                          {selectedCompetitor.description}
                        </p>
                      )}
                    </div>

                    <div className="p-6 space-y-4">
                      <div className="flex items-start gap-3">
                        <div className="p-1.5 bg-slate-100 rounded-lg text-slate-500">
                          <Map className="w-3.5 h-3.5" />
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Head Office</p>
                          <p className="text-xs text-slate-700 font-medium">{selectedCompetitor.head_office || 'N/A'}</p>
                        </div>
                      </div>

                      <div className="flex items-start gap-3">
                        <div className="p-1.5 bg-slate-100 rounded-lg text-slate-500">
                          <Globe className="w-3.5 h-3.5" />
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Website</p>
                          {selectedCompetitor.website ? (
                            <a 
                              href={selectedCompetitor.website} 
                              target="_blank" 
                              rel="noreferrer"
                              className="text-xs text-blue-600 font-medium hover:underline flex items-center gap-1"
                            >
                              {selectedCompetitor.domain || 'Visit Site'}
                              <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          ) : (
                            <p className="text-xs text-slate-700 font-medium">N/A</p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-start gap-3">
                        <div className="p-1.5 bg-slate-100 rounded-lg text-slate-500">
                          <Info className="w-3.5 h-3.5" />
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Industry</p>
                          <p className="text-xs text-slate-700 font-medium">{selectedCompetitor.industry}</p>
                        </div>
                      </div>
                    </div>
                  </motion.div>

                  {/* Quick Stats or Tags */}
                  <div className="bg-[#4B286D]/5 border border-[#4B286D]/10 rounded-2xl p-6">
                    <h4 className="text-xs font-bold text-[#4B286D] uppercase tracking-widest mb-4">Strategic Focus</h4>
                    <div className="flex flex-wrap gap-2">
                      {['AI Infrastructure', 'Sovereign Cloud', 'HPC', 'Edge Computing'].map(tag => (
                        <span key={tag} className="px-2.5 py-1 bg-white border border-[#4B286D]/10 rounded-full text-[10px] font-medium text-[#4B286D]">
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
              className="w-full max-w-4xl mb-12 rounded-3xl overflow-hidden shadow-2xl border border-slate-200 relative group h-[350px]"
              style={{
                backgroundImage: 'url("https://images.unsplash.com/photo-1544197150-b99a580bb7a8?auto=format&fit=crop&w=2000&q=80")',
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
                  <h1 className="text-4xl font-black text-white tracking-tight mb-2">TELUS AI Factory MarketIntel</h1>
                  <p className="text-white/80 text-sm max-w-md">
                    Empowering Canada's digital future with high-performance compute and secure sovereign cloud solutions.
                  </p>
                </div>
              </div>
            </motion.div>

            <h2 className="text-2xl font-bold text-slate-900 mb-2">Market Intelligence Dashboard</h2>
            <p className="text-slate-500 max-w-xl mb-10">
              Monitor the competitive landscape, track emerging trends, and gain strategic insights into the Canadian and Global AI infrastructure market.
            </p>
            <div className="grid grid-cols-3 gap-6 w-full max-w-3xl">
              {[
                { icon: <TrendingUp className="w-9 h-9" />, title: 'Trend Analysis', desc: 'Identify emerging global and local market shifts' },
                { icon: <BarChart3 className="w-9 h-9" />, title: 'Competitor Tracking', desc: 'Monitor competitor strategic moves' },
                { icon: <RefreshCw className="w-9 h-9" />, title: 'Real-time Updates', desc: 'Stay ahead with live updates and insights' },
              ].map((item, i) => (
                <div key={i} className="bg-white p-6 rounded-2xl border border-[#E9ECEF] shadow-sm flex flex-col items-center text-center">
                  <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center text-[#4B286D] mb-4">
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
