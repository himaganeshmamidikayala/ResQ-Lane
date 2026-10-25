'use client';

import React, { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Radio, ShieldCheck, Navigation, WifiOff } from 'lucide-react';

export default function MobileSOSPage() {
  const [direction, setDirection] = useState<'VIJAYAWADA' | 'GUNTUR' | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [smsFallback, setSmsFallback] = useState(false);

  // Default coordinate: NH 16 outside Vignan University / Mangalagiri bypass
  const defaultCoords = { lat: 16.3824, lng: 80.5486 };

  const handleSendSOS = async (selectedDir: 'VIJAYAWADA' | 'GUNTUR') => {
    setLoading(true);
    setDirection(selectedDir);

    try {
      const { error } = await supabase.from('incidents').insert([
        {
          corridor: 'NH-16 (Guntur - Vijayawada Express)',
          heading_direction: selectedDir,
          latitude: defaultCoords.lat,
          longitude: defaultCoords.lng,
          status: 'ACTIVE',
          is_sms_fallback: smsFallback,
        },
      ]);

      if (error) throw error;
      setSent(true);
    } catch (err) {
      console.error(err);
      alert('Network packet failed. Defaulting to cellular SMS Gateway.');
      setSmsFallback(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 text-white p-5 flex flex-col justify-between max-w-md mx-auto border-x border-slate-800">
      {/* Top Banner */}
      <header className="space-y-3">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-rose-500 animate-ping" />
            <h1 className="font-mono text-sm tracking-widest text-rose-400 font-bold uppercase">
              108 Emergency SOS Link
            </h1>
          </div>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
            SECURE TOKEN: #TK-892
          </span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center gap-2 text-amber-400 text-xs font-semibold mb-1">
            <Radio className="h-4 w-4 animate-pulse" />
            <span>GEO-LOCATION RESOLVED (5m accuracy)</span>
          </div>
          <p className="text-sm font-medium text-slate-200">NH-16: Guntur ⇄ Vijayawada Corridor</p>
          <p className="text-[11px] font-mono text-slate-400 mt-1">
            Lat: {defaultCoords.lat} | Lng: {defaultCoords.lng}
          </p>
        </div>
      </header>

      {/* Main Core Action */}
      {!sent ? (
        <section className="my-auto space-y-4">
          <div className="text-center space-y-1">
            <h2 className="text-xl font-bold text-slate-100">Which side of the road are you on?</h2>
            <p className="text-xs text-slate-400">
              Look at moving vehicles next to you. Tap the direction traffic is flowing:
            </p>
          </div>

          <div className="space-y-3">
            <button
              onClick={() => handleSendSOS('VIJAYAWADA')}
              disabled={loading}
              className="w-full py-5 px-4 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 text-white rounded-2xl font-bold text-lg shadow-lg shadow-emerald-950/50 active:scale-95 transition flex items-center justify-between"
            >
              <div className="text-left">
                <span className="block text-xs uppercase text-emerald-200 tracking-wider">Heading North</span>
                <span>Towards VIJAYAWADA</span>
              </div>
              <Navigation className="h-6 w-6 rotate-45 text-emerald-200" />
            </button>

            <button
              onClick={() => handleSendSOS('GUNTUR')}
              disabled={loading}
              className="w-full py-5 px-4 bg-gradient-to-r from-rose-600 to-red-700 hover:from-rose-500 hover:to-red-600 text-white rounded-2xl font-bold text-lg shadow-lg shadow-rose-950/50 active:scale-95 transition flex items-center justify-between"
            >
              <div className="text-left">
                <span className="block text-xs uppercase text-rose-200 tracking-wider">Heading South</span>
                <span>Towards GUNTUR</span>
              </div>
              <Navigation className="h-6 w-6 rotate-180 text-rose-200" />
            </button>
          </div>

          {/* Fallback Simulator */}
          <div className="pt-2">
            <button
              type="button"
              onClick={() => setSmsFallback(!smsFallback)}
              className="w-full flex items-center justify-center gap-2 text-xs py-2 px-3 rounded-lg border border-slate-800 bg-slate-900/60 text-slate-400 hover:text-slate-200 transition"
            >
              <WifiOff className="h-3.5 w-3.5" />
              <span>{smsFallback ? 'Cellular Fallback Mode: ACTIVE' : 'Simulate 2G / No-Internet Mode'}</span>
            </button>

            {smsFallback && (
              <div className="mt-2 p-3 bg-amber-950/30 border border-amber-800/40 rounded-lg text-[11px] font-mono text-amber-300">
                <p className="font-bold text-amber-200 mb-1">Pre-Generated SMS String (Zero Data):</p>
                <code>RESQ://NH16|16.3824,80.5486|DIR_PENDING|108-AP</code>
              </div>
            )}
          </div>
        </section>
      ) : (
        /* Sent Confirmation Screen */
        <section className="my-auto text-center space-y-4 p-6 bg-slate-900 border border-emerald-500/30 rounded-2xl">
          <div className="h-16 w-16 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto">
            <ShieldCheck className="h-10 w-10 animate-pulse" />
          </div>
          <h2 className="text-2xl font-bold text-emerald-400">Dispatch Unit Notified</h2>
          <p className="text-sm text-slate-300">
            Lane confirmed: <strong className="text-white underline">Towards {direction}</strong>.
          </p>
          <p className="text-xs text-slate-400">
            108 Highway Trauma Unit routed directly to your carriageway. Do not move the patient unless in immediate fire danger.
          </p>
          <button
            onClick={() => setSent(false)}
            className="text-xs text-slate-500 underline pt-4"
          >
            Reset SOS State (Demo Mode)
          </button>
        </section>
      )}

      {/* Footer Branding */}
      <footer className="text-center text-[10px] font-mono text-slate-600 border-t border-slate-900 pt-3">
        ResQ-Lane • Vignan Innovators Ideathon • Zero-Install Protocol
      </footer>
    </main>
  );
}