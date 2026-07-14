import React, { useState, useEffect } from "react";
import { 
  HeartPulse, 
  Activity, 
  CheckCircle, 
  AlertTriangle, 
  Stethoscope, 
  Terminal, 
  Sparkles, 
  RefreshCw, 
  ShieldAlert, 
  Check, 
  Cpu, 
  ArrowRight, 
  MessageSquare, 
  Info,
  Clock,
  BookOpen,
  Menu,
  X,
  Send,
  Plus,
  Trash2,
  ChevronRight
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Diagnosis, SymptomAnalysis, OrchestrateTrace, OrchestrateStatus } from "./types";

export default function App() {
  // States
  const [symptoms, setSymptoms] = useState("");
  const [loading, setLoading] = useState(false);
  const [useOrchestrate, setUseOrchestrate] = useState(true);
  
  const [dailyTip, setDailyTip] = useState("");
  const [tipLoading, setTipLoading] = useState(false);
  
  const [orchestrateStatus, setOrchestrateStatus] = useState<OrchestrateStatus | null>(null);
  const [analysisResult, setAnalysisResult] = useState<SymptomAnalysis | null>(null);
  const [trace, setTrace] = useState<OrchestrateTrace[] | null>(null);
  const [orchestrateKeyMasked, setOrchestrateKeyMasked] = useState("");
  const [error, setError] = useState<string | null>(null);
  
  // Interactive checklist for home remedies
  const [checkedRemedies, setCheckedRemedies] = useState<Record<string, boolean>>({});
  
  // Conversational follow-up chat state
  const [chatInput, setChatInput] = useState("");
  const [chatHistory, setChatHistory] = useState<Array<{ role: 'user' | 'model'; text: string }>>([]);
  const [chatLoading, setChatLoading] = useState(false);

  // Gemini UI States
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<"overview" | "conditions" | "remedies">("overview");

  // Progressive loading simulation messages
  const [loadingStep, setLoadingStep] = useState(0);
  const loadingMessages = [
    "Analyzing patient symptoms...",
    "Evaluating clinical indications...",
    "Matching potential health conditions...",
    "Formulating safe home comfort remedies...",
    "Compiling daily preventative advice...",
    "Generating final clinical report summary..."
  ];

  // Quick symptom suggestion presets
  const presets = [
    { label: "🤒 Sore Throat & Mild Fever", text: "I have had a scratchy sore throat, low-grade fever, and mild nasal congestion for the past 2 days. It feels dry and a bit hard to swallow." },
    { label: "🤢 Indigestion & Acid Burn", text: "I am feeling a sharp burning sensation in my upper stomach and lower chest area after eating dinner, accompanied by bloating and a sour taste." },
    { label: "🤕 Migraine & Sensitivity", text: "I have a throbbing, intense headache on the left side of my head, with extreme sensitivity to bright lights and nausea." },
    { label: "🤧 Sneezing & Allergies", text: "I am sneezing constantly, have watery itchy eyes, and a clear runny nose since the pollen count went up this morning." }
  ];

  // Load initial data: Daily tip and Watson status
  useEffect(() => {
    fetchDailyTip();
    fetchOrchestrateStatus();
  }, []);

  // Fetch proactive daily health tip
  const fetchDailyTip = async () => {
    setTipLoading(true);
    try {
      const res = await fetch("/api/daily-tip");
      const data = await res.json();
      setDailyTip(data.tip);
    } catch (e) {
      setDailyTip("Stay active: Aim for at least 30 minutes of moderate cardiovascular activity daily to boost heart health and overall longevity.");
    } finally {
      setTipLoading(false);
    }
  };

  // Fetch status of Watson API key configuration
  const fetchOrchestrateStatus = async () => {
    try {
      const res = await fetch("/api/orchestrate-status");
      const data: OrchestrateStatus = await res.json();
      setOrchestrateStatus(data);
      setOrchestrateKeyMasked(data.maskedKey);
    } catch (e) {
      console.error("Failed to fetch Orchestrate status:", e);
    }
  };

  // Staggered loading simulation effect
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (loading) {
      setLoadingStep(0);
      interval = setInterval(() => {
        setLoadingStep((prev) => {
          if (prev < loadingMessages.length - 1) {
            return prev + 1;
          }
          return prev;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [loading]);

  // Handle prime symptoms submission
  const handleAnalyze = async (e?: React.FormEvent, inputText?: string) => {
    if (e) e.preventDefault();
    
    const textToSubmit = inputText || symptoms;
    if (!textToSubmit.trim()) return;

    setLoading(true);
    setError(null);
    setAnalysisResult(null);
    setTrace(null);
    setChatHistory([]); // Reset chat history for a new diagnostic session
    setCheckedRemedies({});

    try {
      const res = await fetch("/api/analyze-symptoms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symptoms: textToSubmit,
          useOrchestrate
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setAnalysisResult(data.analysis);
        setTrace(data.orchestrateTrace);
        if (data.orchestrateKeyMasked) {
          setOrchestrateKeyMasked(data.orchestrateKeyMasked);
        }
        // Seed first message of chat history
        setChatHistory([
          { role: 'user', text: textToSubmit },
          { role: 'model', text: `${data.analysis.symptomsAnalysis}\n\nI have identified potential matches. Feel free to ask me follow-up questions about these findings, home remedies, or preventative care!` }
        ]);
      } else {
        setError(data.error || "An error occurred while analyzing symptoms. Please try again.");
      }
    } catch (err: any) {
      setError("Unable to connect to the server. Please verify the backend is running.");
    } finally {
      setLoading(false);
    }
  };

  // Quick Preset trigger
  const handlePresetClick = (presetText: string) => {
    setChatInput("");
    setSymptoms(presetText);
    handleAnalyze(undefined, presetText);
  };

  // Submit conversational chat follow-up query
  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || chatLoading || !analysisResult) return;

    const userMessage = chatInput;
    setChatInput("");
    
    // Optimistic local state update
    const updatedHistory = [...chatHistory, { role: 'user' as const, text: userMessage }];
    setChatHistory(updatedHistory);
    setChatLoading(true);

    try {
      const res = await fetch("/api/analyze-symptoms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symptoms: `The patient is asking a follow-up question related to their current symptoms or condition: "${userMessage}". Please answer their question directly. Do not overwrite previous diagnostic context, but provide safe wellness answers, suggestions, remedies, or clinical advice matching their query.`,
          history: updatedHistory,
          useOrchestrate
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setChatHistory(prev => [
          ...prev, 
          { role: 'model' as const, text: data.analysis.symptomsAnalysis }
        ]);
        // Merge or update newly generated remedies if any are added, or just keep them updated
        if (data.analysis.remedies && data.analysis.remedies.length > 0) {
          setAnalysisResult(prev => {
            if (!prev) return prev;
            return {
              ...prev,
              remedies: Array.from(new Set([...prev.remedies, ...data.analysis.remedies])),
              healthTips: Array.from(new Set([...prev.healthTips, ...data.analysis.healthTips])),
            };
          });
        }
      } else {
        setChatHistory(prev => [
          ...prev,
          { role: 'model' as const, text: "I'm sorry, I ran into an issue communicating with the clinical analyzer. Please ask again." }
        ]);
      }
    } catch (e) {
      setChatHistory(prev => [
        ...prev,
        { role: 'model' as const, text: "I'm sorry, I'm having trouble connecting to the server. Please try again in a moment." }
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  // Toggle checklist remedies
  const toggleRemedy = (remedy: string) => {
    setCheckedRemedies(prev => ({
      ...prev,
      [remedy]: !prev[remedy]
    }));
  };

  const handleNewChat = () => {
    setSymptoms("");
    setLoading(false);
    setAnalysisResult(null);
    setTrace(null);
    setChatHistory([]);
    setError(null);
    setCheckedRemedies({});
    setActiveTab("overview");
  };

  const handlePromptSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const promptValue = chatInput;
    if (!promptValue.trim()) return;

    if (chatHistory.length === 0) {
      setSymptoms(promptValue);
      setChatInput("");
      handleAnalyze(undefined, promptValue);
    } else {
      handleChatSubmit(e);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex overflow-hidden selection:bg-neonblue/20 selection:text-neonblue">
      
      {/* Mobile Drawer Overlay Background Dimmer */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSidebarOpen(false)}
            className="md:hidden fixed inset-0 z-40 bg-black/70 backdrop-blur-xs"
          />
        )}
      </AnimatePresence>

      {/* LEFT SIDEBAR (Gemini-style Workspace Navigation & Details) */}
      <aside 
        className={`bg-slate-900 border-r border-slate-800/65 w-72 h-screen flex flex-col justify-between flex-shrink-0 transition-all duration-300 ease-in-out fixed md:static z-50 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full md:hidden'
        }`}
      >
        {/* Sidebar Header */}
        <div className="p-5 border-b border-slate-800/80 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="bg-neonblue/10 text-neonblue p-2 rounded-xl border border-neonblue/25 shadow-inner" id="app_logo_container">
              <HeartPulse className="h-5 w-5 animate-pulse" />
            </div>
            <div>
              <h1 className="text-base font-black text-slate-100 tracking-tight" id="main_title">
                MediSense <span className="text-neonblue">AI</span>
              </h1>
              <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest" id="sub_title">AI Health Agent</p>
            </div>
          </div>
          {/* Mobile Close Button */}
          <button 
            onClick={() => setSidebarOpen(false)} 
            className="md:hidden p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-200 transition"
          >
            <X className="h-4.5 w-4.5" />
          </button>
        </div>

        {/* Sidebar Scrollable Body */}
        <div className="flex-1 overflow-y-auto py-4 space-y-5">
          {/* New Chat Button */}
          <div className="px-4">
            <button 
              onClick={handleNewChat}
              className="w-full flex items-center justify-center space-x-2 bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-200 font-bold py-3 px-4 rounded-2xl transition shadow-sm group cursor-pointer text-xs uppercase tracking-wider"
              id="new_consult_btn"
            >
              <Plus className="h-4 w-4 text-neonblue group-hover:rotate-90 transition-transform duration-200" />
              <span>New Consult</span>
            </button>
          </div>

          {/* Daily preventative health tips bar */}
          <div className="px-4">
            <div className="bg-gradient-to-br from-slate-950 to-slate-900 border border-slate-800/80 rounded-2xl p-4 space-y-3 shadow-md shadow-black/10">
              <div className="flex items-center justify-between border-b border-slate-900 pb-2">
                <div className="flex items-center space-x-1.5 text-slate-300">
                  <Sparkles className="h-3.5 w-3.5 text-neonblue" />
                  <span className="text-[10px] font-bold uppercase tracking-wider">Daily Health Tip</span>
                </div>
                <button 
                  onClick={fetchDailyTip} 
                  disabled={tipLoading}
                  className="p-1 hover:bg-slate-850 rounded text-slate-400 hover:text-slate-200 transition cursor-pointer"
                  id="refresh_tip_btn"
                >
                  <RefreshCw className={`h-3 w-3 ${tipLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed font-semibold">
                {tipLoading ? "Generating diagnostic advice..." : dailyTip || "Load optimal daily hydration and preventative diet recommendations."}
              </p>
            </div>
          </div>

          {/* Clinical Disclaimer */}
          <div className="px-4">
            <div className="bg-slate-950/40 border border-slate-900 rounded-2xl p-3.5 flex items-start space-x-2">
              <Info className="h-4 w-4 text-slate-500 mt-0.5 flex-shrink-0" />
              <p className="text-[10px] text-slate-500 leading-relaxed font-semibold">
                MediSense AI is for informational purposes only. Do not use for emergency or acute conditions.
              </p>
            </div>
          </div>
        </div>

        {/* Sidebar Footer */}
        <div className="p-4 border-t border-slate-800/60 bg-slate-950/40 text-[9px] font-bold text-slate-500 uppercase tracking-widest space-y-1.5">
          <div className="flex items-center justify-between">
            <span>PROTOCOL</span>
            <span className="text-blue-400">HIPAA Compliant</span>
          </div>
          <div className="flex items-center justify-between">
            <span>PLATFORM</span>
            <span className="text-neonblue">MediSense Core</span>
          </div>
        </div>
      </aside>

      {/* MAIN CHAT WORKSPACE (Gemini-style Chat flow) */}
      <main className="flex-1 h-screen flex flex-col bg-slate-950 overflow-hidden relative">
        
        {/* Workspace Top Header */}
        <header className="h-16 border-b border-slate-800/40 bg-slate-950/65 backdrop-blur-md flex items-center justify-between px-6 z-30 flex-shrink-0">
          <div className="flex items-center space-x-4">
            <button 
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 hover:bg-slate-900 rounded-xl border border-slate-800/60 text-slate-300 hover:text-slate-100 transition shadow-inner cursor-pointer"
              id="sidebar_toggle_btn"
              title="Toggle Workspace Sidebar"
            >
              <Menu className="h-4.5 w-4.5" />
            </button>
            <div className="flex items-center space-x-2">
              <span className="text-sm font-black uppercase tracking-widest text-slate-200">
                MediSense <span className="text-neonblue">AI</span>
              </span>
            </div>
          </div>
          
          <div className="flex items-center space-x-3">
            {chatHistory.length > 0 && (
              <button 
                onClick={handleNewChat}
                className="flex items-center space-x-1.5 text-xs font-bold text-slate-400 hover:text-neonblue border border-slate-850 bg-slate-900/40 hover:bg-slate-900 px-3 py-1.5 rounded-xl transition cursor-pointer"
                id="reset_chat_header_btn"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Reset Consult</span>
              </button>
            )}
            <div className="hidden sm:flex items-center space-x-1.5 bg-slate-900 border border-slate-800 px-3 py-1 rounded-full">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping"></span>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Live Support Active</span>
            </div>
          </div>
        </header>

        {/* Scrollable Conversation feed */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 flex flex-col">
          
          {chatHistory.length === 0 ? (
            /* CASE A: Empty Landing State (Google Gemini Welcome) */
            <div className="flex-1 flex flex-col justify-center items-center max-w-2xl mx-auto w-full text-center space-y-10 py-12 animate-fadeIn" id="empty_landing_view">
              <div className="space-y-4">
                <div className="mx-auto bg-gradient-to-tr from-neonblue/20 to-blue-500/20 text-neonblue border border-neonblue/20 p-5 rounded-3xl w-16 h-16 flex items-center justify-center shadow-lg shadow-neonblue/5 animate-pulse">
                  <HeartPulse className="h-8 w-8" />
                </div>
                <h2 className="text-3xl sm:text-4xl font-black text-slate-100 tracking-tight leading-tight">
                  Hello! I am <span className="bg-gradient-to-r from-neonblue via-blue-400 to-cyan-500 bg-clip-text text-transparent">MediSense AI</span>
                </h2>
                <p className="text-slate-450 text-xs sm:text-sm font-semibold max-w-md mx-auto leading-relaxed">
                  Your personalized clinical assistant. Enter symptoms or check clinical details. Guided by HIPAA compliant processes.
                </p>
              </div>

              {/* Symptom Preset grid */}
              <div className="w-full space-y-3">
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest text-left pl-1 flex items-center space-x-1">
                  <Sparkles className="h-3 w-3 text-neonblue" />
                  <span>Interactive Symptoms Presets:</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" id="preset_grid">
                  {presets.map((preset, idx) => (
                    <button
                      key={idx}
                      onClick={() => handlePresetClick(preset.text)}
                      className="text-left bg-slate-900 hover:bg-slate-850 border border-slate-800/80 hover:border-neonblue/30 active:scale-[0.99] rounded-2xl p-4 transition-all duration-200 shadow-md group cursor-pointer"
                    >
                      <h4 className="font-bold text-slate-200 text-xs group-hover:text-neonblue transition-colors">
                        {preset.label}
                      </h4>
                      <p className="text-[10px] text-slate-500 mt-1 font-semibold truncate">
                        {preset.text}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            /* CASE B: Active Chat Conversation View */
            <div className="max-w-3xl mx-auto w-full space-y-8 pb-28" id="active_chat_feed">
              {chatHistory.map((msg, idx) => {
                const isUser = msg.role === 'user';
                return (
                  <div key={idx} className="space-y-6">
                    {/* Message Bubble Container */}
                    <div className={`flex items-start space-x-4 ${isUser ? 'justify-end' : 'justify-start'}`}>
                      {/* Left Avatar for Assistant */}
                      {!isUser && (
                        <div className="bg-slate-900 border border-slate-800 text-neonblue p-2.5 rounded-2xl h-10 w-10 flex items-center justify-center flex-shrink-0 shadow-lg shadow-black/25">
                          <HeartPulse className="h-5 w-5" />
                        </div>
                      )}
                      
                      {/* Bubble itself */}
                      <div className={`max-w-[85%] sm:max-w-[78%] rounded-3xl px-5 py-4 text-xs sm:text-sm leading-relaxed font-semibold ${
                        isUser 
                          ? 'bg-neonblue text-slate-950 rounded-tr-none shadow-lg shadow-neonblue/10 font-bold' 
                          : 'bg-slate-900 border border-slate-800/80 text-slate-250 rounded-tl-none shadow-md'
                      }`}>
                        <p className="whitespace-pre-wrap">{msg.text}</p>
                      </div>

                      {/* Right Avatar for User */}
                      {isUser && (
                        <div className="bg-slate-850 border border-slate-750 text-slate-300 p-2.5 rounded-2xl h-10 w-10 flex items-center justify-center flex-shrink-0 font-black text-xs uppercase shadow-inner">
                          U
                        </div>
                      )}
                    </div>

                    {/* Rich Clinical Diagnostic Report Widget (Anchored after the first model output, index 1) */}
                    {idx === 1 && analysisResult && (
                      <div className="pl-0 md:pl-14 animate-fadeIn" id="results_panel">
                        <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl shadow-black/40">
                          
                          {/* Widget Navigation Header */}
                          <div className="bg-slate-950 border-b border-slate-800/60 p-4 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="flex items-center space-x-2.5">
                              <div className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-neonblue opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-neonblue"></span>
                              </div>
                              <h3 className="font-mono text-xs font-black uppercase tracking-widest text-slate-300">
                                Clinical Diagnostic Report
                              </h3>
                            </div>
                            
                            {/* Tab selection pill buttons */}
                            <div className="flex flex-wrap gap-1 bg-slate-900 border border-slate-800 p-1 rounded-xl">
                              {(['overview', 'conditions', 'remedies'] as const).map((tab) => (
                                <button
                                  key={tab}
                                  onClick={() => setActiveTab(tab)}
                                  className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition cursor-pointer ${
                                    activeTab === tab 
                                      ? 'bg-neonblue text-slate-950 shadow-md shadow-neonblue/10' 
                                      : 'text-slate-400 hover:text-slate-200'
                                  }`}
                                >
                                  {tab}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Widget Tabs Body */}
                          <div className="p-5 sm:p-6 min-h-[220px]">
                            
                            {/* TAB 1: OVERVIEW */}
                            {activeTab === 'overview' && (
                              <div className="space-y-4 animate-fadeIn" id="tab_overview_content">
                                <div className="bg-slate-950 border border-slate-850 p-4 rounded-2xl">
                                  <h4 className="text-[10px] font-black text-neonblue uppercase tracking-widest mb-1.5 flex items-center space-x-1">
                                    <Activity className="h-3.5 w-3.5" />
                                    <span>Symptoms Diagnosis</span>
                                  </h4>
                                  <p className="text-slate-200 text-xs sm:text-sm leading-relaxed font-bold">
                                    {analysisResult.symptomsAnalysis}
                                  </p>
                                </div>

                                {/* Warnings if exist */}
                                {analysisResult.whenToConsult && analysisResult.whenToConsult.length > 0 && (
                                  <div className="bg-red-950/10 border border-red-500/25 rounded-2xl p-4 space-y-2">
                                    <div className="flex items-center space-x-2 border-b border-red-500/15 pb-1.5">
                                      <ShieldAlert className="h-4.5 w-4.5 text-red-400 animate-pulse" />
                                      <h5 className="font-bold text-red-400 text-xs uppercase tracking-wider">Clinical Alert: Seek Medical Care If</h5>
                                    </div>
                                    <ul className="space-y-1.5" id="doctor_warnings_list">
                                      {analysisResult.whenToConsult.map((warning, wIdx) => (
                                        <li key={wIdx} className="flex items-start space-x-2 text-xs text-red-350 leading-relaxed font-semibold">
                                          <span className="text-red-500 font-bold select-none mt-0.5">•</span>
                                          <span>{warning}</span>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* TAB 2: POTENTIAL CONDITIONS */}
                            {activeTab === 'conditions' && (
                              <div className="space-y-3.5 animate-fadeIn" id="conditions_list">
                                {analysisResult.diagnoses.map((cond, cIdx) => {
                                  const isHigh = cond.likelihood === 'High';
                                  const isMedium = cond.likelihood === 'Medium';
                                  const badgeColor = isHigh 
                                    ? "bg-red-950/40 text-red-400 border-red-500/25" 
                                    : isMedium 
                                      ? "bg-amber-950/40 text-amber-400 border-amber-500/25" 
                                      : "bg-emerald-950/40 text-emerald-400 border-emerald-500/25";

                                  return (
                                    <div key={cIdx} className="bg-slate-950 border border-slate-850 rounded-2xl p-4 space-y-2.5">
                                      <div className="flex items-center justify-between border-b border-slate-900 pb-2">
                                        <h4 className="font-bold text-slate-100 text-xs sm:text-sm">{cond.name}</h4>
                                        <span className={`px-2 py-0.5 rounded-full border text-[9px] font-bold uppercase tracking-widest ${badgeColor}`}>
                                          {cond.likelihood} Likelihood
                                        </span>
                                      </div>
                                      <p className="text-xs text-slate-350 leading-relaxed font-semibold">
                                        {cond.explanation}
                                      </p>

                                      {/* Symptom matched labels */}
                                      {cond.matchedSymptoms && cond.matchedSymptoms.length > 0 && (
                                        <div className="flex flex-wrap items-center gap-1 pt-1.5 border-t border-slate-900">
                                          <span className="text-[8px] font-bold text-slate-550 uppercase tracking-widest mr-1.5">Matched Signals:</span>
                                          {cond.matchedSymptoms.map((sym, sIdx) => (
                                            <span key={sIdx} className="bg-slate-900 border border-slate-800 text-slate-300 text-[9px] px-2.5 py-0.5 rounded-lg font-semibold">
                                              {sym}
                                            </span>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}

                            {/* TAB 3: REMEDIES & PREVENTATIVE TIPS */}
                            {activeTab === 'remedies' && (
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 animate-fadeIn">
                                {/* Checklist */}
                                <div className="space-y-3">
                                  <div className="flex items-center space-x-1.5 border-b border-slate-850 pb-2">
                                    <CheckCircle className="h-4 w-4 text-neonblue" />
                                    <h4 className="font-bold text-slate-200 text-xs uppercase tracking-tight">Suggested Care Measures</h4>
                                  </div>
                                  <ul className="space-y-2" id="remedies_checklist">
                                    {analysisResult.remedies.map((remedy, rIdx) => (
                                      <li 
                                        key={rIdx} 
                                        onClick={() => toggleRemedy(remedy)}
                                        className={`flex items-start space-x-2.5 p-2.5 rounded-xl border transition-all cursor-pointer select-none ${
                                          checkedRemedies[remedy] 
                                            ? 'bg-slate-950/50 border-slate-900/60 text-slate-500 line-through' 
                                            : 'bg-slate-950 border border-slate-850 hover:border-neonblue/20 text-slate-300 font-medium'
                                        }`}
                                      >
                                        <span className={`h-4.5 w-4.5 flex-shrink-0 mt-0.5 rounded border flex items-center justify-center transition-all ${
                                          checkedRemedies[remedy] 
                                            ? 'bg-neonblue border-neonblue text-slate-950' 
                                            : 'bg-slate-900 border-slate-700'
                                        }`}>
                                          {checkedRemedies[remedy] && <Check className="h-3 w-3 stroke-[3]" />}
                                        </span>
                                        <span className="text-[11px] leading-relaxed font-semibold">{remedy}</span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>

                                {/* Tips */}
                                <div className="space-y-3">
                                  <div className="flex items-center space-x-1.5 border-b border-slate-850 pb-2">
                                    <Sparkles className="h-4 w-4 text-neonblue" />
                                    <h4 className="font-bold text-slate-200 text-xs uppercase tracking-tight">Clinical Wellness Advice</h4>
                                  </div>
                                  <ul className="space-y-2" id="health_tips_list">
                                    {analysisResult.healthTips.map((tip, tIdx) => (
                                      <li key={tIdx} className="bg-slate-950 border border-slate-850 p-3 rounded-xl flex items-start space-x-2 border-slate-900/40">
                                        <Check className="h-3.5 w-3.5 text-neonblue mt-0.5 flex-shrink-0" />
                                        <span className="text-[11px] text-slate-300 leading-relaxed font-semibold">{tip}</span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              </div>
                            )}

                            {/* TAB 4: HIPPOCRATIC DISCLAIMER (Hidden) */}

                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* CASE C: PROGRESSIVE PIPELINE LOADING BLOCK (INSIDE CHAT FEED) */}
              {loading && (
                <div className="space-y-4 animate-fadeIn" id="telemetry_panel">
                  <div className="flex items-start space-x-4">
                    <div className="bg-slate-900 border border-slate-800 text-neonblue p-2.5 rounded-2xl h-10 w-10 flex items-center justify-center flex-shrink-0 shadow-lg shadow-black/25">
                      <HeartPulse className="h-5 w-5 animate-pulse" />
                    </div>
                    
                    <div className="bg-slate-900 border border-slate-800/85 rounded-3xl p-5 max-w-[85%] sm:max-w-[78%] w-full space-y-4 shadow-xl">
                      <div className="flex items-center space-x-3 text-xs sm:text-sm text-slate-200">
                        <span className="h-2.5 w-2.5 rounded-full bg-neonblue animate-ping"></span>
                        <span className="font-bold text-slate-100 uppercase tracking-wider">Analyzing Symptoms...</span>
                      </div>

                      {/* Progressive Steps */}
                      <div className="border border-slate-850 bg-slate-950 rounded-2xl p-4 text-[11px] font-mono text-slate-400 space-y-2 shadow-inner">
                        <div className="flex items-center justify-between border-b border-slate-900 pb-2 mb-2">
                          <span className="font-black text-neonblue text-[9px] uppercase tracking-wider">Analysis Progress</span>
                          <span className="text-[9px] text-neonblue font-bold">Step {loadingStep + 1} of {loadingMessages.length}</span>
                        </div>
                        {loadingMessages.map((msg, idx) => {
                          const isPast = idx < loadingStep;
                          const isCurrent = idx === loadingStep;
                          return (
                            <div key={idx} className="flex items-center space-x-2">
                              <span className="w-4 flex-shrink-0 flex items-center justify-center">
                                {isPast && <Check className="h-3 w-3 text-neonblue" />}
                                {isCurrent && <span className="h-1.5 w-1.5 rounded-full bg-neonblue animate-pulse" />}
                                {!isPast && !isCurrent && <span className="h-1.5 w-1.5 rounded-full bg-slate-850" />}
                              </span>
                              <span className={`${isCurrent ? "text-slate-100 font-bold animate-pulse" : isPast ? "text-slate-500" : "text-slate-750"}`}>
                                {msg}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* CASE D: CHAT FOLLOW-UP ACTIVE PROCESSING */}
              {chatLoading && (
                <div className="flex items-start space-x-4 animate-pulse">
                  <div className="bg-slate-900 border border-slate-800 text-neonblue p-2.5 rounded-2xl h-10 w-10 flex items-center justify-center flex-shrink-0 shadow-lg shadow-black/25">
                    <HeartPulse className="h-5 w-5" />
                  </div>
                  <div className="bg-slate-900 border border-slate-800 text-slate-400 rounded-3xl rounded-tl-none px-5 py-4 text-xs font-mono flex items-center space-x-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-neonblue animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="h-1.5 w-1.5 rounded-full bg-neonblue animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="h-1.5 w-1.5 rounded-full bg-neonblue animate-bounce" style={{ animationDelay: '300ms' }} />
                    <span className="font-bold text-neonblue uppercase tracking-widest text-[9px] ml-1.5">AI assistant reply active...</span>
                  </div>
                </div>
              )}

              {/* CASE E: COMPILATION ERROR EXCEPTION */}
              {error && (
                <div className="max-w-2xl mx-auto w-full p-4 bg-red-950/20 border border-red-500/25 rounded-2xl flex items-start space-x-3 text-red-300">
                  <AlertTriangle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5 animate-bounce" />
                  <div>
                    <h4 className="font-bold text-xs uppercase tracking-wider text-red-400">Clinical Integration Error</h4>
                    <p className="text-xs leading-relaxed font-semibold mt-1">{error}</p>
                    <button onClick={() => setError(null)} className="mt-2 text-[10px] font-black uppercase text-slate-300 hover:text-white underline">
                      Dismiss Dialog
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

        </div>

        {/* BOTTOM FIXED CHAT PROMPT CONTROLLER (Google Gemini Layout) */}
        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-slate-950 via-slate-950/95 to-transparent pt-12 pb-4 px-4 sm:px-6 lg:px-8 z-20 flex-shrink-0">
          <div className="max-w-3xl mx-auto w-full">
            
            {/* The Unified Input Prompt Bar */}
            <form onSubmit={handlePromptSubmit} className="bg-slate-900 border border-slate-800 focus-within:border-neonblue/45 focus-within:ring-2 focus-within:ring-neonblue/5 rounded-3xl p-1.5 flex items-center gap-2 transition-all duration-300 shadow-xl shadow-black/40">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder={chatHistory.length === 0 ? "Describe symptoms or ask clinical questions..." : "Ask a follow-up query..."}
                className="flex-1 bg-transparent border-none focus:outline-none focus:ring-0 px-4 text-xs sm:text-sm text-slate-100 placeholder:text-slate-550 font-semibold"
                disabled={loading || chatLoading}
                id="chat_input_field"
              />
              
              <button
                type="submit"
                disabled={loading || chatLoading || !chatInput.trim()}
                className="bg-neonblue hover:bg-cyan-400 active:scale-[0.96] text-slate-950 h-10 w-10 sm:h-11 sm:w-11 rounded-2xl disabled:bg-slate-800 disabled:text-slate-650 font-bold transition flex items-center justify-center shadow-lg shadow-neonblue/10 cursor-pointer flex-shrink-0"
                id="send_chat_btn"
              >
                <Send className="h-4.5 w-4.5" />
              </button>
            </form>

            {/* Bottom metadata tags */}
            <p className="text-[10px] text-slate-600 text-center mt-2.5 font-bold uppercase tracking-wider">
              MediSense AI v1.4 • Clinical Decision Support • End-to-end Encrypted
            </p>
          </div>
        </div>

      </main>
    </div>
  );
}
