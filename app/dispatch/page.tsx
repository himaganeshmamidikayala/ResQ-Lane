'use client';

import React, { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { supabase } from '@/lib/supabase';
import { 
  Radio, Route, Clock, ShieldAlert, CheckCircle2, 
  AlertTriangle, Volume2, Activity, Zap, Compass, RefreshCw, MousePointerClick 
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

export default function DispatchConsole() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [activeIncident, setActiveIncident] = useState<Incident | null>(null);
  const [latency, setLatency] = useState<number>(128);

  // Dynamic metrics computed by OSRM
  const [metrics, setMetrics] = useState<{ directMin: number; detourMin: number; distanceKm: number }>({
    directMin: 6.8,
    detourMin: 21.2,
    distanceKm: 5.4,
  });

  const playDispatchSound = async () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
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
      setLatency(Date.now() - start);

      if (data && data.length > 0) {
        setIncidents(data as Incident[]);
        setActiveIncident(data[0] as Incident);
      } else {
        // Fallback default coordinate near Mangalagiri / Vignan
        setActiveIncident({
          id: 'demo-init',
          created_at: new Date().toISOString(),
          corridor: 'NH-16 Corridor',
          heading_direction: 'VIJAYAWADA',
          latitude: 16.3824,
          longitude: 80.5486,
          status: 'ACTIVE',
          is_sms_fallback: false,
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
          setIncidents((prev) => [newIncident, ...prev]);
          setActiveIncident(newIncident);
          playDispatchSound();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // When a presenter clicks on the map, simulate an incident immediately
  const handleMapClick = async (coords: [number, number]) => {
    const mockIncident: Incident = {
      id: `manual-${Date.now()}`,
      created_at: new Date().toISOString(),
      corridor: 'NH-16 Corridor (Simulated Incident)',
      heading_direction: activeIncident?.heading_direction === 'GUNTUR' ? 'GUNTUR' : 'VIJAYAWADA',
      latitude: Number(coords[0].toFixed(5)),
      longitude: Number(coords[1].toFixed(5)),
      status: 'ACTIVE',
      is_sms_fallback: false,
    };
    setActiveIncident(mockIncident);
    playDispatchSound();
  };

  const timeSaved = Math.max(0, Number((metrics.detourMin - metrics.directMin).toFixed(1)));
  const percentageFaster = Math.round((timeSaved / (metrics.detourMin || 1)) * 100);

  return (
    <main className="min-h-screen bg-[#070b14] text-slate-100 p-4 lg:p-6 flex flex-col gap-4 font-sans selection:bg-rose-500 selection:text-white">
      {/* Top Mission Control Bar */}
      <header className="flex flex-wrap items-center justify-between gap-4 bg-slate-900/80 backdrop-blur-xl border border-slate-800/90 rounded-2xl px-5 py-3.5 shadow-2xl">
        <div className="flex items-center gap-3.5">
          <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-rose-500/20 to-red-600/30 border border-rose-500/50 flex items-center justify-center text-rose-400 shadow-[0_0_20px_rgba(244,63,94,0.3)]">
            <Radio className="h-6 w-6 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-lg lg:text-xl font-black tracking-tight text-white flex items-center gap-2">
                ResQ-Lane <span className="text-slate-500 font-mono text-xs font-normal">DYNAMIC OSRM DISPATCH</span>
              </h1>
              <span className="text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5 shadow-[0_0_10px_rgba(16,185,129,0.2)]">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
                LIVE ROAD ENGINE
              </span>
            </div>
            <p className="text-xs text-slate-400 font-mono">
              NH-16 Express Corridor • Mangalagiri-Vijayawada Trauma Command
            </p>
          </div>
        </div>

        {/* Telemetry Chips */}
        <div className="flex items-center gap-3 font-mono text-xs">
          <div className="bg-slate-950/80 border border-slate-800 px-3.5 py-2 rounded-xl flex items-center gap-2.5">
            <Activity className="h-4 w-4 text-emerald-400" />
            <div>
              <span className="text-[10px] text-slate-500 block leading-tight">WS SYNC</span>
              <span className="text-emerald-400 font-bold">{latency}ms</span>
            </div>
          </div>

          <div className="bg-slate-950/80 border border-slate-800 px-3.5 py-2 rounded-xl flex items-center gap-2.5">
            <Zap className="h-4 w-4 text-cyan-400" />
            <div>
              <span className="text-[10px] text-slate-500 block leading-tight">ROUTING GRAPH</span>
              <span className="text-slate-200 font-bold">OSRM LIVE</span>
            </div>
          </div>

          <button
            onClick={playDispatchSound}
            className="bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/40 text-rose-300 px-3.5 py-2 rounded-xl text-xs font-mono font-bold transition active:scale-95 flex items-center gap-2 cursor-pointer shadow-[0_0_15px_rgba(244,63,94,0.15)]"
          >
            <Volume2 className="h-4 w-4 text-rose-400" />
            <span>TEST SIREN</span>
          </button>
        </div>
      </header>

      {/* Main Grid: Left Panel (Telemetry) + Right Panel (Dynamic Map) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 flex-1">
        {/* Left Telemetry Column */}
        <section className="lg:col-span-4 flex flex-col gap-4">
          {/* Active Ticket Card */}
          <div className="bg-slate-900/70 backdrop-blur-xl border border-slate-800 rounded-2xl p-5 shadow-2xl relative overflow-hidden">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
              <span className="text-xs font-mono text-slate-400 font-semibold flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-rose-500" />
                ACTIVE EMERGENCY VECTOR
              </span>
              <span className="text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full border bg-rose-500/20 text-rose-400 border-rose-500/40 animate-pulse">
                DISPATCH ACTIVE
              </span>
            </div>

            {activeIncident ? (
              <div className="mt-4 space-y-3.5">
                <div className="p-4 rounded-xl bg-gradient-to-r from-emerald-950/40 to-slate-950 border border-emerald-500/30">
                  <span className="text-[10px] font-mono text-emerald-400 font-bold uppercase tracking-widest block">
                    CONFIRMED CARRIAGEWAY
                  </span>
                  <div className="text-xl font-black text-white mt-1 flex items-center gap-2">
                    <Compass className="h-5 w-5 text-emerald-400" />
                    <span>TRAFFIC BOUND TOWARDS {activeIncident.heading_direction}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800">
                    <span className="text-[10px] text-slate-500 font-mono block">INCIDENT DISTANCE</span>
                    <span className="font-semibold text-slate-200">{metrics.distanceKm} km from Base</span>
                  </div>
                  <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800">
                    <span className="text-[10px] text-slate-500 font-mono block">DISPATCH MODE</span>
                    <span className="font-mono text-cyan-400 font-bold">
                      {activeIncident.is_sms_fallback ? '2G SMS FALLBACK' : 'HIGH-RES GPS'}
                    </span>
                  </div>
                </div>

                <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800 text-[11px] font-mono text-slate-400 flex items-center justify-between">
                  <span>TARGET COORDS:</span>
                  <span className="text-white font-bold">{activeIncident.latitude}, {activeIncident.longitude}</span>
                </div>
              </div>
            ) : null}
          </div>

          {/* Golden Hour Mathematical Penalty Matrix */}
          <div className="bg-slate-900/70 backdrop-blur-xl border border-slate-800 rounded-2xl p-5 shadow-2xl flex-1 flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-slate-200 flex items-center gap-2 font-mono">
                  <Route className="h-4 w-4 text-emerald-400" />
                  DYNAMIC ROUTE COMPUTATION
                </h2>
                <span className="text-[10px] font-mono text-cyan-400 flex items-center gap-1">
                  <MousePointerClick className="h-3.5 w-3.5" />
                  Live Testing Enabled
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Real-time NHAI median penalty calculated from road geometry:
              </p>
            </div>

            <div className="space-y-3">
              {/* Detour Metric */}
              <div className="p-3.5 bg-rose-950/30 border border-rose-500/30 rounded-xl space-y-1">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-rose-300 font-bold flex items-center gap-1.5">
                    <AlertTriangle className="h-4 w-4 text-rose-500" />
                    Opposing Side Detour (Standard GPS)
                  </span>
                  <span className="font-mono text-rose-400 font-black text-sm">
                    {metrics.detourMin} MIN
                  </span>
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  Trapped across continuous concrete barrier. Forced to drive to next grade-separated U-turn cut and double back.
                </p>
              </div>

              {/* Direct Metric */}
              <div className="p-3.5 bg-emerald-950/30 border border-emerald-500/30 rounded-xl space-y-1">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-emerald-300 font-bold flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    ResQ-Lane Ingress (Direct Lane)
                  </span>
                  <span className="font-mono text-emerald-400 font-black text-sm">
                    {metrics.directMin} MIN
                  </span>
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  Direct entry into confirmed carriageway with zero U-turn turnaround penalty.
                </p>
              </div>
            </div>

            {/* Calculated Golden Hour Survival Differential */}
            <div className="border-t border-slate-800/80 pt-3 flex items-center justify-between text-xs font-mono">
              <span className="text-slate-400 flex items-center gap-1.5">
                <Clock className="h-4 w-4 text-amber-400" />
                GOLDEN HOUR DELTA
              </span>
              <span className="text-emerald-400 font-black text-sm tracking-wider">
                ⚡ {timeSaved} MIN SAVED ({percentageFaster}% FASTER)
              </span>
            </div>
          </div>
        </section>

        {/* Right Tactical Map Column */}
        <section className="lg:col-span-8 flex flex-col min-h-[520px]">
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
    </main>
  );
}