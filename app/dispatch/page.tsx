'use client';

import React, { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { supabase } from '@/lib/supabase';
import {
  Radio, Route, Clock, ShieldAlert, CheckCircle2,
  AlertTriangle, Volume2, Activity, Zap, Compass, MousePointerClick,
  Send, X
} from 'lucide-react';

const DispatchMap = dynamic(() => import('@/components/DispatchMap'), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full flex flex-col items-center justify-center bg-slate-950 border border-slate-800 rounded-2xl text-slate-500 font-mono text-xs gap-3">
      <div className="h-6 w-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      <span>INITIALIZING DYNAMIC NHAI ROUTING ENGINE...</span>
    </div>
  ),
});

interface Incident {
  id: string;
  created_at: string;
  corridor: string;
  heading_direction: 'VIJAYAWADA' | 'GUNTUR';
  latitude: number;
  longitude: number;
  status: string;
  is_sms_fallback: boolean;
}

const INITIAL_DEMO_INCIDENT: Incident = {
  id: 'demo-init',
  created_at: new Date().toISOString(),
  corridor: 'NH-16 Express Corridor • Mangalagiri-Vijayawada Sector',
  heading_direction: 'VIJAYAWADA',
  latitude: 16.3824,
  longitude: 80.5486,
  status: 'ACTIVE',
  is_sms_fallback: false,
};

function formatRelativeTime(isoString: string): string {
  try {
    const timestamp = new Date(isoString).getTime();
    if (isNaN(timestamp)) return 'Recent';
    const diffSec = Math.floor((Date.now() - timestamp) / 1000);
    if (diffSec < 60) return `${Math.max(1, diffSec)}s ago`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  } catch {
    return 'Recent';
  }
}

type RealtimeStatus = 'CONNECTING' | 'SUBSCRIBED' | 'CHANNEL_ERROR' | 'TIMED_OUT' | 'CLOSED';

export default function DispatchConsole() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [activeIncident, setActiveIncident] = useState<Incident | null>(INITIAL_DEMO_INCIDENT);
  const [isDemoLocked, setIsDemoLocked] = useState(false);
  const [liveIncidentIds, setLiveIncidentIds] = useState<string[]>([]);
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus>('CONNECTING');
  const [fetchLatency, setFetchLatency] = useState<number | null>(null);

  // Dynamic metrics computed by OSRM
  const [metrics, setMetrics] = useState<{ directMin: number; detourMin: number; distanceKm: number }>({
    directMin: 6.8,
    detourMin: 21.2,
    distanceKm: 5.4,
  });

  // Operator SMS modal state
  const [isSmsModalOpen, setIsSmsModalOpen] = useState(false);
  const [smsPhoneInput, setSmsPhoneInput] = useState('');
  const [smsSending, setSmsSending] = useState(false);
  const [smsFeedback, setSmsFeedback] = useState<{
    type: 'success' | 'warning' | 'error';
    title: string;
    description: string;
  } | null>(null);

  const handleSendOperatorSms = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!smsPhoneInput.trim()) return;

    setSmsSending(true);
    setSmsFeedback(null);

    try {
      const res = await fetch('/api/sms/send-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: smsPhoneInput.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        setSmsFeedback({
          type: 'error',
          title: 'Request Rejected',
          description: data.error || 'Failed to dispatch SMS request.',
        });
      } else if (data.status === 'CONFIG_MISSING') {
        setSmsFeedback({
          type: 'warning',
          title: 'Simulation Mode (Unconfigured)',
          description: data.error || 'No live SMS provider credentials configured. Simulation logged.',
        });
      } else if (data.status === 'ACCEPTED_BY_PROVIDER') {
        setSmsFeedback({
          type: 'success',
          title: 'SMS Queued by Provider',
          description: `SOS link accepted by ${data.provider} for ${data.maskedRecipient || 'recipient'}.`,
        });
        setSmsPhoneInput('');
      } else {
        setSmsFeedback({
          type: 'warning',
          title: data.status || 'Notice',
          description: data.error || data.message || 'Processed with advisory.',
        });
      }
    } catch (err: unknown) {
      setSmsFeedback({
        type: 'error',
        title: 'Network Error',
        description: err instanceof Error ? err.message : 'Could not contact SMS dispatch service.',
      });
    } finally {
      setSmsSending(false);
    }
  };

  const playDispatchSound = async () => {
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const audioCtx = new AudioCtx();
      if (audioCtx.state === 'suspended') await audioCtx.resume();
      const now = audioCtx.currentTime;

      const osc1 = audioCtx.createOscillator();
      const gain1 = audioCtx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(880, now);
      gain1.gain.setValueAtTime(0.3, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      osc1.connect(gain1);
      gain1.connect(audioCtx.destination);
      osc1.start(now);
      osc1.stop(now + 0.25);

      setTimeout(() => {
        const osc2 = audioCtx.createOscillator();
        const gain2 = audioCtx.createGain();
        osc2.type = 'triangle';
        osc2.frequency.setValueAtTime(1174.66, audioCtx.currentTime);
        gain2.gain.setValueAtTime(0.35, audioCtx.currentTime);
        gain2.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4);
        osc2.connect(gain2);
        gain2.connect(audioCtx.destination);
        osc2.start();
        osc2.stop(audioCtx.currentTime + 0.4);
      }, 120);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    const fetchIncidents = async () => {
      const start = Date.now();
      const { data } = await supabase
        .from('incidents')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);
      setFetchLatency(Date.now() - start);

      if (data && data.length > 0) {
        const fetched = data as Incident[];
        setIncidents((prev) => {
          const prevIds = new Set(prev.map((inc) => inc.id));
          const uniqueFetched = fetched.filter((inc) => !prevIds.has(inc.id));
          return [...prev, ...uniqueFetched];
        });
      }
    };

    fetchIncidents();

    const channel = supabase
      .channel('tactical-feed')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'incidents' },
        (payload) => {
          const newIncident = payload.new as Incident;
          if (!newIncident || !newIncident.id) return;

          setIncidents((prev) => [newIncident, ...prev.filter((inc) => inc.id !== newIncident.id)]);
          setLiveIncidentIds((prev) => [newIncident.id, ...prev.filter((id) => id !== newIncident.id)]);
          setActiveIncident(newIncident);
          setIsDemoLocked(true);
          playDispatchSound();
        }
      )
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          setRealtimeStatus('SUBSCRIBED');
        } else if (status === 'CHANNEL_ERROR') {
          setRealtimeStatus('CHANNEL_ERROR');
          if (err) console.error('[Realtime] Channel error:', err.message || 'Subscription error');
        } else if (status === 'TIMED_OUT') {
          setRealtimeStatus('TIMED_OUT');
          if (err) console.error('[Realtime] Subscription timed out');
        } else if (status === 'CLOSED') {
          setRealtimeStatus('CLOSED');
        } else {
          setRealtimeStatus('CONNECTING');
        }
      });

    return () => {
      setRealtimeStatus('CLOSED');
      supabase.removeChannel(channel);
    };
  }, []);

  // Allow interactive route testing only during initial demo mode; permanently lock after real incident
  const handleMapClick = async (coords: [number, number]) => {
    // Lock simulation permanently once a genuine Realtime incident arrives during this session
    if (isDemoLocked) {
      return;
    }

    // Only allow map clicks when currently inspecting a demo vector
    const isCurrentDemo = Boolean(
      activeIncident && (activeIncident.id === 'demo-init' || activeIncident.id.startsWith('demo-'))
    );
    if (!isCurrentDemo) {
      return;
    }

    const mockIncident: Incident = {
      id: 'demo-simulated',
      created_at: new Date().toISOString(),
      corridor: 'NH-16 Corridor (Simulated Incident)',
      heading_direction: activeIncident?.heading_direction === 'GUNTUR' ? 'GUNTUR' : 'VIJAYAWADA',
      latitude: Number(coords[0].toFixed(5)),
      longitude: Number(coords[1].toFixed(5)),
      status: 'ACTIVE',
      is_sms_fallback: false,
    };
    setActiveIncident(mockIncident);
  };

  const handleSelectIncident = (selected: Incident) => {
    setActiveIncident(selected);
  };

  const timeSaved = Math.max(0, Number((metrics.detourMin - metrics.directMin).toFixed(1)));
  const percentageFaster = Math.round((timeSaved / (metrics.detourMin || 1)) * 100);

  // Active classification flags
  const isSelectedDemo = Boolean(activeIncident && (activeIncident.id === 'demo-init' || activeIncident.id.startsWith('demo-')));
  const isSelectedLive = Boolean(activeIncident && liveIncidentIds.includes(activeIncident.id));

  // The active demo entry (preserves whatever coordinate was clicked in simulation)
  const currentDemoEntry: Incident = isSelectedDemo && activeIncident ? activeIncident : INITIAL_DEMO_INCIDENT;

  // Combined queue list: Interactive simulation entry + fetched & live incidents
  const queueItems: Incident[] = [currentDemoEntry, ...incidents];

  return (
    <main className="min-h-screen bg-[#09090b] text-zinc-100 p-3 sm:p-4 flex flex-col gap-3 font-sans selection:bg-rose-500 selection:text-white">
      {/* Top Mission Control Bar */}
      <header className="flex flex-wrap items-center justify-between gap-3 bg-[#121215] border border-[#27272a] rounded-xl px-4 py-2.5 shadow-sm shrink-0">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-zinc-900 border border-[#27272a] flex items-center justify-center text-rose-500 shrink-0">
            <Radio className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-bold tracking-tight text-white flex items-center gap-2">
                ResQ-Lane <span className="text-zinc-500 font-normal text-xs sm:text-sm tracking-normal">| Operations Console</span>
              </h1>
              <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded bg-zinc-900 text-zinc-300 border border-[#27272a] hidden sm:inline-flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                Demo Sector: NH-16 (AP)
              </span>
            </div>
            <p className="text-xs text-zinc-400 leading-tight mt-0.5">
              Highway Emergency Response &amp; Dispatch Platform
            </p>
          </div>
        </div>

        {/* Telemetry Status Bar */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {/* Realtime Channel Subscription Status */}
          <div className="h-9 bg-[#18181b] border border-[#27272a] px-3 rounded-lg flex items-center gap-2 font-mono">
            <Radio
              className={`h-3.5 w-3.5 shrink-0 ${
                realtimeStatus === 'SUBSCRIBED'
                  ? 'text-emerald-400'
                  : realtimeStatus === 'CONNECTING'
                  ? 'text-amber-400 animate-spin'
                  : 'text-rose-400'
              }`}
            />
            <span className="text-zinc-400 text-xs font-sans">Realtime:</span>
            <span
              className={`text-xs font-bold ${
                realtimeStatus === 'SUBSCRIBED'
                  ? 'text-emerald-400'
                  : realtimeStatus === 'CONNECTING'
                  ? 'text-amber-400'
                  : 'text-rose-400'
              }`}
            >
              {realtimeStatus === 'SUBSCRIBED'
                ? 'Subscribed'
                : realtimeStatus === 'CONNECTING'
                ? 'Connecting...'
                : realtimeStatus === 'CHANNEL_ERROR'
                ? 'Error'
                : realtimeStatus === 'TIMED_OUT'
                ? 'Timed Out'
                : 'Closed'}
            </span>
          </div>

          {/* HTTP REST Query Latency */}
          <div className="h-9 bg-[#18181b] border border-[#27272a] px-3 rounded-lg flex items-center gap-2 font-mono">
            <Activity className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
            <span className="text-zinc-400 text-xs font-sans">Fetch:</span>
            <span className="text-cyan-400 text-xs font-bold">
              {fetchLatency !== null ? `${fetchLatency}ms` : 'Measuring...'}
            </span>
          </div>

          {/* Routing Graph Status */}
          <div className="h-9 bg-[#18181b] border border-[#27272a] px-3 rounded-lg flex items-center gap-2 font-mono">
            <Zap className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
            <span className="text-zinc-400 text-xs font-sans">OSRM:</span>
            <span className="text-zinc-200 text-xs font-bold">Live</span>
          </div>

          {/* Test Siren Button */}
          <button
            onClick={playDispatchSound}
            className="h-9 bg-[#18181b] hover:bg-rose-950/40 border border-[#27272a] hover:border-rose-500/40 text-zinc-200 hover:text-rose-300 px-3.5 rounded-lg text-xs font-medium transition active:scale-95 flex items-center gap-2 cursor-pointer font-sans"
          >
            <Volume2 className="h-3.5 w-3.5 text-rose-400 shrink-0" />
            <span>Test Siren</span>
          </button>

          {/* Send SOS Link Button */}
          <button
            onClick={() => {
              setIsSmsModalOpen(true);
              setSmsFeedback(null);
            }}
            className="h-9 bg-[#18181b] hover:bg-[#202026] border border-[#27272a] hover:border-cyan-500/40 text-zinc-200 hover:text-cyan-300 px-3.5 rounded-lg text-xs font-medium transition active:scale-95 flex items-center gap-2 cursor-pointer font-sans"
          >
            <Send className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
            <span>Send SOS Link</span>
          </button>
        </div>
      </header>

      {/* Main Grid: Left Telemetry Column + Right Tactical Map */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 flex-1 items-start">
        {/* Left Telemetry Column */}
        <div className="lg:col-span-5 xl:col-span-4 flex flex-col gap-3">
          {/* Active Incident Ticket */}
          <section
            className={`border rounded-xl p-3.5 sm:p-4 transition-colors ${
              isSelectedLive
                ? 'bg-[#161012] border-rose-500/60 ring-1 ring-rose-500/20'
                : isSelectedDemo
                  ? 'bg-[#10151d] border-cyan-500/50 ring-1 ring-cyan-500/20'
                  : 'bg-[#121215] border-[#27272a]'
            }`}
          >
            {/* Ticket Header */}
            <div className="flex items-center justify-between pb-2.5 border-b border-[#27272a]/70">
              <div className="flex items-center gap-2.5 min-w-0">
                <ShieldAlert
                  className={`h-4 w-4 shrink-0 ${
                    isSelectedLive ? 'text-rose-500' : isSelectedDemo ? 'text-cyan-400' : 'text-zinc-400'
                  }`}
                />
                <h2 className="text-xs font-semibold tracking-wider text-zinc-300 uppercase">
                  {isSelectedLive
                    ? 'Live Emergency Dispatch'
                    : isSelectedDemo
                      ? 'Simulated Incident Ticket'
                      : 'Archived Incident Record'}
                </h2>
              </div>
              <span
                className={`text-xs font-mono font-medium px-2.5 py-0.5 rounded-full border shrink-0 ${
                  isSelectedLive
                    ? 'bg-rose-950/60 text-rose-300 border-rose-500/50 animate-pulse'
                    : isSelectedDemo
                      ? 'bg-cyan-950/60 text-cyan-300 border-cyan-500/40'
                      : 'bg-zinc-800 text-zinc-300 border-zinc-700'
                }`}
              >
                {isSelectedLive ? 'Live Alert' : isSelectedDemo ? 'Simulation' : 'Archived'}
              </span>
            </div>

            {activeIncident ? (
              <div className="mt-3 space-y-3">
                {/* Primary Highway Direction Hero */}
                <div>
                  <div className="text-xs text-zinc-400 font-medium flex items-center justify-between">
                    <span>Confirmed Carriageway</span>
                    <span className="text-emerald-400 font-mono text-[11px] flex items-center gap-1 font-semibold">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                      Direct Ingress Verified
                    </span>
                  </div>
                  <div className="text-base sm:text-lg font-bold text-white tracking-tight flex items-center gap-2 mt-0.5">
                    <Compass className="h-4.5 w-4.5 text-emerald-400 shrink-0" />
                    <span>Bound Towards {activeIncident.heading_direction}</span>
                  </div>
                  <div className="text-xs text-zinc-400 mt-0.5">
                    {activeIncident.corridor}
                  </div>
                </div>

                {/* Primary Key Telemetry Metrics */}
                <div className="grid grid-cols-3 gap-2 pt-2.5 border-t border-[#27272a]/70">
                  <div>
                    <span className="text-[11px] text-zinc-400 block">Direct ETA</span>
                    <span className="text-xl sm:text-2xl font-bold font-mono text-emerald-400 leading-tight">
                      {metrics.directMin}
                      <span className="text-xs font-normal text-zinc-400 ml-1">min</span>
                    </span>
                  </div>
                  <div>
                    <span className="text-[11px] text-zinc-400 block">Distance</span>
                    <span className="text-xl sm:text-2xl font-bold font-mono text-white leading-tight">
                      {metrics.distanceKm}
                      <span className="text-xs font-normal text-zinc-400 ml-1">km</span>
                    </span>
                  </div>
                  <div>
                    <span className="text-[11px] text-zinc-400 block">Dispatch Mode</span>
                    <span className="text-sm sm:text-base font-semibold font-mono text-cyan-300 leading-tight block mt-1">
                      {activeIncident.is_sms_fallback ? '2G SMS' : 'GPS Fix'}
                    </span>
                  </div>
                </div>

                {/* Target Coordinates */}
                <div className="pt-2.5 border-t border-[#27272a]/70 flex items-center justify-between text-xs font-mono">
                  <span className="text-zinc-400">Target Coordinates</span>
                  <span className="text-zinc-200 font-semibold">
                    {activeIncident.latitude.toFixed(5)}, {activeIncident.longitude.toFixed(5)}
                  </span>
                </div>
              </div>
            ) : null}
          </section>

          {/* Incident Queue Card */}
          <section className="bg-[#121215] border border-[#27272a] rounded-xl p-3.5 sm:p-4 flex flex-col gap-2.5">
            <div className="flex items-center justify-between pb-2 border-b border-[#27272a]/70">
              <div className="flex items-center gap-2">
                <Radio className="h-4 w-4 text-cyan-400 shrink-0" />
                <h2 className="text-xs font-semibold tracking-wider text-zinc-300 uppercase">
                  Incident Queue
                </h2>
              </div>
              <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-[#18181b] border border-[#27272a] text-zinc-400">
                {queueItems.length} {queueItems.length === 1 ? 'incident' : 'incidents'}
              </span>
            </div>

            <div className="max-h-36 sm:max-h-40 xl:max-h-44 overflow-y-auto space-y-1.5 pr-1 tactical-scrollbar">
              {queueItems.map((inc) => {
                const isSelected = activeIncident?.id === inc.id;
                const isDemo = inc.id === 'demo-init' || inc.id.startsWith('demo-');
                const isLive = liveIncidentIds.includes(inc.id);

                return (
                  <button
                    key={inc.id}
                    type="button"
                    onClick={() => handleSelectIncident(inc)}
                    className={`w-full text-left p-2.5 rounded-lg transition border cursor-pointer block ${
                      isSelected
                        ? isLive
                          ? 'bg-[#1a1114] border-l-4 border-l-rose-500 border-rose-500/60'
                          : isDemo
                            ? 'bg-[#0f151e] border-l-4 border-l-cyan-500 border-cyan-500/60'
                            : 'bg-[#18181c] border-l-4 border-l-zinc-400 border-zinc-600/60'
                        : 'bg-[#18181b] border-[#27272a] hover:border-zinc-700 hover:bg-[#1f1f23]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <div className="flex items-center gap-2 min-w-0">
                        {isLive && (
                          <span className="h-2 w-2 rounded-full bg-rose-500 shrink-0" />
                        )}
                        <span
                          className={`text-[10px] font-mono font-medium px-2 py-0.5 rounded border shrink-0 ${
                            isLive
                              ? 'bg-rose-950/60 text-rose-300 border-rose-500/50'
                              : isDemo
                                ? 'bg-cyan-950/60 text-cyan-300 border-cyan-500/40'
                                : 'bg-zinc-800 text-zinc-300 border-zinc-700'
                          }`}
                        >
                          {isLive ? 'Live Alert' : isDemo ? 'Simulation' : 'Archived'}
                        </span>
                        <span className="text-xs font-medium text-zinc-200 truncate">
                          {isDemo ? 'Interactive NH-16 Pitch Vector' : inc.corridor.split('(')[0].trim()}
                        </span>
                      </div>
                      <span className="text-xs text-zinc-400 shrink-0 tabular-nums font-mono">
                        {isDemo ? 'Interactive' : formatRelativeTime(inc.created_at)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2 text-xs font-mono text-zinc-400">
                      <span
                        className={`font-semibold ${
                          inc.heading_direction === 'VIJAYAWADA' ? 'text-emerald-400' : 'text-cyan-400'
                        }`}
                      >
                        Bound: {inc.heading_direction}
                      </span>
                      <span>
                        {inc.latitude.toFixed(4)}, {inc.longitude.toFixed(4)}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-300">
                        {inc.is_sms_fallback ? '2G SMS' : 'GPS'}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Golden Hour Route Differential Comparison */}
          <section className="bg-[#121215] border border-[#27272a] rounded-xl p-3.5 sm:p-4 flex flex-col gap-2.5">
            <div className="flex items-center justify-between pb-2 border-b border-[#27272a]/70">
              <div className="flex items-center gap-2">
                <Route className="h-4 w-4 text-emerald-400 shrink-0" />
                <h2 className="text-xs font-semibold tracking-wider text-zinc-300 uppercase">
                  Route Comparison & Differential
                </h2>
              </div>
              <span className="text-xs text-cyan-400 font-mono flex items-center gap-1">
                <MousePointerClick className="h-3.5 w-3.5" />
                Interactive
              </span>
            </div>

            {/* Side-by-side direct route metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {/* ResQ-Lane Direct Lane */}
              <div className="p-2.5 bg-emerald-950/20 border border-emerald-500/40 rounded-lg flex flex-col justify-between">
                <div className="flex items-center justify-between gap-1 mb-1">
                  <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                    ResQ-Lane Ingress
                  </span>
                  <span className="text-base font-bold font-mono text-emerald-400">
                    {metrics.directMin} min
                  </span>
                </div>
                <p className="text-[11px] text-zinc-300 leading-normal">
                  Confirmed carriageway entry. Zero turnaround delay.
                </p>
              </div>

              {/* Opposing Detour Standard GPS */}
              <div className="p-2.5 bg-rose-950/20 border border-rose-500/40 rounded-lg flex flex-col justify-between">
                <div className="flex items-center justify-between gap-1 mb-1">
                  <span className="text-xs font-semibold text-rose-400 flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-rose-400" />
                    Opposing Detour (GPS)
                  </span>
                  <span className="text-base font-bold font-mono text-rose-400">
                    {metrics.detourMin} min
                  </span>
                </div>
                <p className="text-[11px] text-zinc-300 leading-normal">
                  Blocked by median barrier. Forced U-turn cut.
                </p>
              </div>
            </div>

            {/* Survival Advantage Strip */}
            <div className="pt-2 border-t border-[#27272a]/70 flex items-center justify-between text-xs">
              <span className="text-zinc-400 flex items-center gap-1.5 font-medium">
                <Clock className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                Golden Hour Differential
              </span>
              <span className="text-emerald-400 font-bold font-mono text-xs sm:text-sm bg-emerald-950/60 border border-emerald-500/40 px-2.5 py-1 rounded-md shadow-sm">
                ⚡ {timeSaved} min saved ({percentageFaster}% faster)
              </span>
            </div>
          </section>
        </div>

        {/* Right Tactical Map Column */}
        <section className="lg:col-span-7 xl:col-span-8 flex flex-col h-[480px] lg:h-[calc(100vh-100px)] min-h-[460px] lg:sticky lg:top-3">
          <DispatchMap
            incidentCoords={activeIncident ? [activeIncident.latitude, activeIncident.longitude] : null}
            activeDirection={activeIncident ? activeIncident.heading_direction : null}
            onMapClick={handleMapClick}
            onMetricsCalculated={(directMin, detourMin, distanceKm) => {
              setMetrics({ directMin, detourMin, distanceKm });
            }}
          />
        </section>
      </div>

      {/* Operator Send SOS Link Modal */}
      {isSmsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-[#121215] border border-[#27272a] rounded-2xl w-full max-w-sm p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#27272a]">
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded bg-cyan-950/60 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                  <Send className="h-3.5 w-3.5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white leading-tight">Send SOS Link</h3>
                  <p className="text-[10px] text-zinc-400 leading-tight mt-0.5">Direct SMS to Highway Caller</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsSmsModalOpen(false)}
                className="text-zinc-400 hover:text-white p-1 rounded transition cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSendOperatorSms} className="space-y-3">
              <div>
                <label className="block text-xs font-mono text-zinc-300 mb-1">
                  Recipient Phone Number
                </label>
                <input
                  type="tel"
                  value={smsPhoneInput}
                  onChange={(e) => setSmsPhoneInput(e.target.value)}
                  placeholder="e.g. 9876543210 or +91..."
                  disabled={smsSending}
                  className="w-full bg-[#18181b] border border-[#27272a] focus:border-cyan-400 rounded-lg px-3 py-2 text-xs font-mono text-white placeholder-zinc-600 focus:outline-none"
                />
                <p className="text-[10px] text-zinc-400 mt-1 leading-normal">
                  Transmits public /sos incident link for immediate GPS &amp; carriageway reporting.
                </p>
              </div>

              {smsFeedback && (
                <div
                  className={`p-3 rounded-lg border text-xs space-y-0.5 ${
                    smsFeedback.type === 'success'
                      ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
                      : smsFeedback.type === 'warning'
                      ? 'bg-amber-950/40 border-amber-500/40 text-amber-200'
                      : 'bg-rose-950/40 border-rose-500/40 text-rose-200'
                  }`}
                >
                  <p className="font-bold flex items-center gap-1.5">
                    {smsFeedback.type === 'success' ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                    ) : (
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    )}
                    {smsFeedback.title}
                  </p>
                  <p className="text-[11px] opacity-90 leading-relaxed">{smsFeedback.description}</p>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#27272a]">
                <button
                  type="button"
                  onClick={() => setIsSmsModalOpen(false)}
                  disabled={smsSending}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-400 hover:text-white bg-[#18181b] hover:bg-[#222226] border border-[#27272a] transition cursor-pointer"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={smsSending || !smsPhoneInput.trim()}
                  className="px-4 py-1.5 rounded-lg text-xs font-bold text-zinc-950 bg-cyan-400 hover:bg-cyan-300 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center gap-1.5 shadow-md shadow-cyan-950/50 cursor-pointer"
                >
                  {smsSending ? (
                    <>
                      <div className="h-3 w-3 border-2 border-zinc-950 border-t-transparent rounded-full animate-spin" />
                      <span>Sending...</span>
                    </>
                  ) : (
                    <>
                      <Send className="h-3 w-3" />
                      <span>Send Link</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}