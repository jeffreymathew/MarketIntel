import React, { useState, useEffect } from 'react';
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
  Map
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Competitor, Insight } from './types';
import { searchMarketInsights, generateMarketSummary, generateRegionInsights, generateGlobalSummary } from './services/gemini';
import ChatBot from './components/ChatBot';

export default function App() {
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [selectedCompetitor, setSelectedCompetitor] = useState<Competitor | null>(null);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [newCompetitor, setNewCompetitor] = useState({ name: '', industry: '' });
  const [executiveSummary, setExecutiveSummary] = useState<string | null>(null);
  const [globalSummary, setGlobalSummary] = useState<{content: string, updated_at: string} | null>(null);
  
  const [currentView, setCurrentView] = useState<'welcome' | 'region' | 'market_intelligence' | 'competitor' | 'global_summary'>('welcome');
  
  // Clear executive summary when switching to non-competitor views
  useEffect(() => {
    if (currentView !== 'competitor') {
      setExecutiveSummary(null);
    }
  }, [currentView]);

  const [geographies, setGeographies] = useState<{id: number, name: string}[]>([]);
  const [selectedRegion, setSelectedRegion] = useState<string>('Canada');
  const [newGeography, setNewGeography] = useState('');
  const [regionReport, setRegionReport] = useState<{content: string, updated_at: string} | null>(null);
  const [marketInsights, setMarketInsights] = useState<Insight[]>([]);
  const [marketRegion, setMarketRegion] = useState<'canada' | 'global'>('canada');

  useEffect(() => {
    fetchCompetitors();
    fetchGeographies();
    fetchRegionReport('Canada');
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
      // Get some market insights to provide context
      let currentMarketInsights = marketInsights;
      if (currentMarketInsights.length === 0) {
        const res = await fetch('/api/market-insights?region=global');
        currentMarketInsights = await res.json();
      }
      
      const compNames = competitors.map(c => c.name);
      const summary = await generateGlobalSummary(compNames, currentMarketInsights.slice(0, 15));
      
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

  const fetchCompetitors = async () => {
    const res = await fetch('/api/competitors');
    const data = await res.json();
    setCompetitors(data);
  };

  const fetchGeographies = async () => {
    const res = await fetch('/api/geographies');
    const data = await res.json();
    setGeographies(data);
  };

  const fetchRegionReport = async (region: string, silent = false) => {
    if (!silent) setLoading(true);
    const res = await fetch(`/api/reports/${region.toLowerCase()}`);
    const data = await res.json();
    if (data.content) {
      setRegionReport(data);
    } else {
      setRegionReport(null);
      // Auto-refresh if empty
      if (!silent) refreshRegionInsights(region);
    }
    if (!silent) setLoading(false);
  };

  const fetchMarketInsights = async (region: 'canada' | 'global' = 'canada', silent = false) => {
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
      setCompetitors([...competitors, data]);
      setNewCompetitor({ name: '', industry: '' });
      setSelectedCompetitor(data);
      setCurrentView('competitor');
    }
  };

  const addGeography = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGeography) return;

    const res = await fetch('/api/geographies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newGeography }),
    });
    
    if (res.ok) {
      const data = await res.json();
      setGeographies([...geographies, data]);
      setNewGeography('');
      setSelectedRegion(data.name);
      setCurrentView('region');
      fetchRegionReport(data.name);
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

  const deleteGeography = async (id: number) => {
    const geo = geographies.find(g => g.id === id);
    await fetch(`/api/geographies/${id}`, { method: 'DELETE' });
    setGeographies(geographies.filter(g => g.id !== id));
    if (selectedRegion === geo?.name) {
      setSelectedRegion('Canada');
      setCurrentView('welcome');
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

  const refreshRegionInsights = async (regionOverride?: string) => {
    const target = regionOverride || selectedRegion;
    setRefreshing(true);
    try {
      const content = await generateRegionInsights(target);
      await fetch(`/api/reports/${target.toLowerCase()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      await fetchRegionReport(target, true);
    } catch (error) {
      console.error("Refresh failed", error);
    } finally {
      setRefreshing(false);
    }
  };

  const refreshMarketInsights = async (regionOverride?: 'canada' | 'global') => {
    const targetRegion = regionOverride || marketRegion;
    setRefreshing(true);
    try {
      const query = targetRegion === 'canada' 
        ? "Canada AI, Sovereign Cloud, AI Compute, Datacentres Canada"
        : "Global AI, Sovereign Cloud, AI Compute, Datacentres";
        
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
        <div className="p-6 border-b border-white/10">
          <div className="flex flex-col">
            <h1 className="text-xs font-bold tracking-widest text-[#BEF264] uppercase opacity-80">TELUS AI Factory</h1>
            <h1 className="text-xl font-black tracking-tight text-white uppercase leading-none">MarketIntel</h1>
          </div>
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
              <span className="text-sm font-medium">Monthly Market Overview</span>
            </div>
          </div>

          <div className="text-[10px] font-bold text-white/50 uppercase tracking-widest px-3 mb-2 mt-2">Market Insights</div>
          <div 
            onClick={() => { setCurrentView('market_intelligence'); setMarketRegion('canada'); setSelectedCompetitor(null); fetchMarketInsights('canada'); }}
            className={`group flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer transition-all mb-1 ${
              currentView === 'market_intelligence' && marketRegion === 'canada' ? 'bg-white/10 text-white' : 'hover:bg-white/5 text-white/70'
            }`}
          >
            <div className="flex items-center gap-3">
              <Globe className={`w-4 h-4 ${currentView === 'market_intelligence' && marketRegion === 'canada' ? 'text-[#66CC00]' : 'text-white/50'}`} />
              <span className="text-sm font-medium">News & Updates - Canada</span>
            </div>
          </div>
          <div 
            onClick={() => { setCurrentView('market_intelligence'); setMarketRegion('global'); setSelectedCompetitor(null); fetchMarketInsights('global'); }}
            className={`group flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer transition-all mb-4 ${
              currentView === 'market_intelligence' && marketRegion === 'global' ? 'bg-white/10 text-white' : 'hover:bg-white/5 text-white/70'
            }`}
          >
            <div className="flex items-center gap-3">
              <Globe className={`w-4 h-4 ${currentView === 'market_intelligence' && marketRegion === 'global' ? 'text-[#66CC00]' : 'text-white/50'}`} />
              <span className="text-sm font-medium">News & Updates - Global</span>
            </div>
          </div>

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
                className="w-full py-1.5 bg-[#BEF264] text-[#4B286D] rounded-lg text-xs font-bold hover:bg-[#A2E635] transition-colors flex items-center justify-center gap-1.5"
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

          <div className="text-[10px] font-bold text-white/50 uppercase tracking-widest px-3 mb-2 mt-6">Market Overviews</div>
          
          <div className="px-3 mb-4">
            <form onSubmit={addGeography} className="space-y-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/50" />
                <input 
                  type="text" 
                  placeholder="Add market..."
                  className="w-full pl-9 pr-3 py-1.5 bg-white/10 border-none rounded-lg text-xs text-white placeholder-white/50 focus:ring-1 focus:ring-[#66CC00] outline-none"
                  value={newGeography}
                  onChange={e => setNewGeography(e.target.value)}
                />
              </div>
              <button 
                type="submit"
                className="w-full py-1.5 bg-[#BEF264] text-[#4B286D] rounded-lg text-xs font-bold hover:bg-[#A2E635] transition-colors flex items-center justify-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" /> Add New
              </button>
            </form>
          </div>

          {geographies.map(g => (
            <div 
              key={g.id}
              onClick={() => { setCurrentView('region'); setSelectedRegion(g.name); setSelectedCompetitor(null); fetchRegionReport(g.name); }}
              className={`group flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer transition-all mb-1 ${
                currentView === 'region' && selectedRegion === g.name ? 'bg-white/10 text-white' : 'hover:bg-white/5 text-white/70'
              }`}
            >
              <div className="flex items-center gap-3">
                <Map className={`w-4 h-4 ${currentView === 'region' && selectedRegion === g.name ? 'text-[#66CC00]' : 'text-white/50'}`} />
                <span className="text-sm font-medium">{g.name}</span>
              </div>
              <button 
                onClick={(e) => { e.stopPropagation(); deleteGeography(g.id); }}
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
                <h2 className="text-lg font-semibold">Monthly Market Overview</h2>
                <span className="px-2 py-0.5 bg-slate-100 text-slate-500 text-[10px] font-bold rounded uppercase tracking-wider">
                  Previous Month Analysis
                </span>
              </div>
              <button 
                onClick={() => refreshGlobalSummary()}
                disabled={refreshing}
                className="flex items-center gap-2 px-4 py-2 bg-white border border-[#CED4DA] rounded-lg text-sm font-medium hover:bg-slate-50 transition-all disabled:opacity-50"
              >
                {refreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                {refreshing ? 'Analyzing Previous Month...' : 'Refresh Summary'}
              </button>
            </header>

            <div className="flex-1 overflow-y-auto p-8 space-y-8">
              {(loading || refreshing) && !globalSummary ? (
                <div className="bg-white p-12 flex flex-col items-center justify-center gap-4 text-slate-400 rounded-2xl border border-[#E9ECEF]">
                  <Loader2 className="w-8 h-8 animate-spin" />
                  <p className="text-sm">{refreshing ? 'Synthesizing market insights and competitor landscape...' : 'Loading summary...'}</p>
                </div>
              ) : globalSummary?.content ? (
                <motion.section 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white border border-[#E9ECEF] rounded-2xl p-8 shadow-sm"
                >
                  <div className="markdown-body">
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
        ) : currentView === 'region' ? (
          <>
            <header className="h-16 border-b border-[#E9ECEF] bg-white flex items-center justify-between px-8">
              <div className="flex items-center gap-4">
                <h2 className="text-lg font-semibold">{selectedRegion} AI & Sovereign Cloud</h2>
                <span className="px-2 py-0.5 bg-slate-100 text-slate-500 text-[10px] font-bold rounded uppercase tracking-wider">
                  Macro Overview
                </span>
              </div>
              <button 
                onClick={() => refreshRegionInsights()}
                disabled={refreshing}
                className="flex items-center gap-2 px-4 py-2 bg-white border border-[#CED4DA] rounded-lg text-sm font-medium hover:bg-slate-50 transition-all disabled:opacity-50"
              >
                {refreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                {refreshing ? 'Scanning Web...' : 'Refresh Insights'}
              </button>
            </header>

            <div className="flex-1 overflow-y-auto p-8 space-y-8">
              {(loading || refreshing) && !regionReport ? (
                <div className="bg-white p-12 flex flex-col items-center justify-center gap-4 text-slate-400 rounded-2xl border border-[#E9ECEF]">
                  <Loader2 className="w-8 h-8 animate-spin" />
                  <p className="text-sm">{refreshing ? `Generating comprehensive ${selectedRegion} AI report...` : 'Loading report...'}</p>
                </div>
              ) : regionReport?.content ? (
                <motion.section 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white border border-[#E9ECEF] rounded-2xl p-8 shadow-sm"
                >
                  <div className="markdown-body">
                    <Markdown remarkPlugins={[remarkGfm]}>{regionReport.content}</Markdown>
                  </div>
                  {regionReport.updated_at && (
                    <div className="mt-8 pt-4 border-t border-slate-100 text-xs text-slate-400">
                      Last updated: {new Date(regionReport.updated_at).toLocaleString()}
                    </div>
                  )}
                </motion.section>
              ) : (
                <div className="bg-white p-12 flex flex-col items-center justify-center gap-4 text-slate-400 rounded-2xl border border-[#E9ECEF]">
                  <Map className="w-8 h-8" />
                  <p className="text-sm">No insights available. Click "Refresh Insights" to generate the latest report.</p>
                </div>
              )}
            </div>
          </>
        ) : currentView === 'market_intelligence' ? (
          <>
            <header className="h-16 border-b border-[#E9ECEF] bg-white flex items-center justify-between px-8">
              <div className="flex items-center gap-4">
                <h2 className="text-lg font-semibold">News & Updates - {marketRegion === 'canada' ? 'Canada' : 'Global'}</h2>
                <span className="px-2 py-0.5 bg-slate-100 text-slate-500 text-[10px] font-bold rounded uppercase tracking-wider">
                  {marketRegion === 'canada' ? 'Canada AI & Cloud' : 'Global AI & Cloud'}
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
                  <h3 className="font-semibold text-slate-900">News & Updates - {marketRegion === 'canada' ? 'Canada' : 'Global'}</h3>
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
                      <div className="bg-white p-12 flex flex-col items-center justify-center gap-4 text-slate-400">
                        <Loader2 className="w-8 h-8 animate-spin" />
                        <p className="text-sm">Loading intelligence reports...</p>
                      </div>
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

            <div className="flex-1 overflow-y-auto p-8 space-y-8">
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
                      <div className="bg-white p-12 flex flex-col items-center justify-center gap-4 text-slate-400">
                        <Loader2 className="w-8 h-8 animate-spin" />
                        <p className="text-sm">Loading intelligence reports...</p>
                      </div>
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
              {executiveSummary && (
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
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
            <div className="w-24 h-24 bg-slate-50 rounded-3xl flex items-center justify-center mb-8">
              <Globe className="w-12 h-12 text-[#4B286D]" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2">Welcome to TELUS AI Factory MarketIntel</h2>
            <p className="text-slate-500 max-w-md mb-8">
              Select a competitor from the sidebar or add a new one to start monitoring market trends, financial news, and competitive intelligence.
            </p>
            <div className="grid grid-cols-3 gap-6 w-full max-w-2xl">
              {[
                { icon: <TrendingUp className="w-5 h-5" />, title: 'Trend Analysis', desc: 'Identify emerging market shifts' },
                { icon: <BarChart3 className="w-5 h-5" />, title: 'Competitor Tracking', desc: 'Monitor rival strategic moves' },
                { icon: <RefreshCw className="w-5 h-5" />, title: 'Real-time Updates', desc: 'Stay ahead with live web scanning' },
              ].map((item, i) => (
                <div key={i} className="bg-white p-6 rounded-2xl border border-[#E9ECEF] shadow-sm">
                  <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center text-[#4B286D] mb-4 mx-auto">
                    {item.icon}
                  </div>
                  <h3 className="text-sm font-bold mb-1">{item.title}</h3>
                  <p className="text-[11px] text-slate-500">{item.desc}</p>
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
