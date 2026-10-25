'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import {
  Siren,
  ShieldCheck,
  ShieldAlert,
  WifiOff,
  MapPin,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Copy,
  ArrowUpRight,
  ArrowDownRight,
  Check,
} from 'lucide-react';

type LocationStatus =
  | 'idle'
  | 'acquiring'
  | 'resolved'
  | 'denied'
  | 'unavailable'
  | 'manual';

interface Coords {
  lat: number;
  lng: number;
  accuracy?: number;
}

export default function MobileSOSPage() {
  const [direction, setDirection] = useState<'VIJAYAWADA' | 'GUNTUR' | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [smsFallback, setSmsFallback] = useState(false);

  // Real location state
  const [coords, setCoords] = useState<Coords | null>(null);
  const [locationStatus, setLocationStatus] = useState<LocationStatus>('idle');
  const [locationError, setLocationError] = useState<string | null>(null);

  // Manual fallback inputs
  const [showManualInput, setShowManualInput] = useState(false);
  const [manualLat, setManualLat] = useState('');
  const [manualLng, setManualLng] = useState('');
  const [manualError, setManualError] = useState<string | null>(null);

  // Submission error & manual SMS copy state
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [copiedSms, setCopiedSms] = useState(false);

  const isValidCoordinate = (lat: number, lng: number): boolean => {
    return (
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      lat >= -90 &&
      lat <= 90 &&
      lng >= -180 &&
      lng <= 180
    );
  };

  const requestLocation = useCallback(() => {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      setLocationStatus('unavailable');
      setLocationError('Geolocation is not supported by your browser.');
      setShowManualInput(true);
      return;
    }

    setLocationStatus('acquiring');
    setLocationError(null);
    setManualError(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = Number(position.coords.latitude.toFixed(6));
        const lng = Number(position.coords.longitude.toFixed(6));
        const accuracy = position.coords.accuracy ? Math.round(position.coords.accuracy) : undefined;

        if (isValidCoordinate(lat, lng)) {
          setCoords({ lat, lng, accuracy });
          setLocationStatus('resolved');
          setShowManualInput(false);
        } else {
          setLocationStatus('unavailable');
          setLocationError('GPS returned out-of-range coordinates.');
          setShowManualInput(true);
        }
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          setLocationStatus('denied');
          setLocationError('Location access blocked. Please allow location access or enter coordinates manually.');
        } else if (error.code === error.TIMEOUT) {
          setLocationStatus('unavailable');
          setLocationError('GPS signal timed out. Please retry or enter coordinates manually.');
        } else {
          setLocationStatus('unavailable');
          setLocationError('Location signal unavailable. Please retry or enter coordinates manually.');
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }
    );
  }, []);

  // Automatic GPS acquisition on initial mount to minimize time-to-SOS
  useEffect(() => {
    if (typeof window === 'undefined' || !navigator.geolocation) return;
    const timer = setTimeout(() => {
      requestLocation();
    }, 50);
    return () => clearTimeout(timer);
  }, [requestLocation]);

  const handleApplyManualCoords = (e: React.FormEvent) => {
    e.preventDefault();
    setManualError(null);

    const lat = parseFloat(manualLat.trim());
    const lng = parseFloat(manualLng.trim());

    if (isNaN(lat) || isNaN(lng)) {
      setManualError('Please enter valid numerical latitude and longitude.');
      return;
    }

    if (lat < -90 || lat > 90) {
      setManualError('Latitude must be between -90 and 90 degrees.');
      return;
    }

    if (lng < -180 || lng > 180) {
      setManualError('Longitude must be between -180 and 180 degrees.');
      return;
    }

    setCoords({ lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) });
    setLocationStatus('manual');
    setShowManualInput(false);
    setLocationError(null);
    setSubmitError(null);
  };

  const handleFillPreset = (presetLat: number, presetLng: number) => {
    setManualLat(presetLat.toString());
    setManualLng(presetLng.toString());
    setManualError(null);
  };

  const smsPayloadString = `RESQ://NH16|${coords ? `${coords.lat},${coords.lng}` : 'LOCATION_PENDING'}|${direction || 'DIR_PENDING'}|108-AP`;

  const handleCopySmsPayload = async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(smsPayloadString);
        setCopiedSms(true);
        setTimeout(() => setCopiedSms(false), 3000);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = smsPayloadString;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        setCopiedSms(true);
        setTimeout(() => setCopiedSms(false), 3000);
      }
    } catch (err) {
      console.error('Failed to copy payload:', err);
    }
  };

  const handleSendSOS = async (selectedDir?: 'VIJAYAWADA' | 'GUNTUR') => {
    const targetDir = selectedDir || direction;

    if (!coords || !isValidCoordinate(coords.lat, coords.lng)) {
      if (locationStatus !== 'acquiring') {
        requestLocation();
      }
      setSubmitError('Acquiring your highway location... Tap "Allow" on location prompt or enter manually.');
      return;
    }

    if (!targetDir) {
      setSubmitError('Select your highway carriageway below (VIJAYAWADA or GUNTUR) to transmit SOS.');
      return;
    }

    if (loading) return;

    setLoading(true);
    setSubmitError(null);
    setDirection(targetDir);

    try {
      const { data, error } = await supabase.from('incidents').insert([
        {
          corridor: 'NH-16 (Guntur - Vijayawada Express)',
          heading_direction: targetDir,
          latitude: coords.lat,
          longitude: coords.lng,
          status: 'ACTIVE',
          is_sms_fallback: smsFallback,
        },
      ]).select('id');

      if (error) throw error;
      setSent(true);

      // Automated non-blocking responder notification
      if (data && data[0]?.id) {
        fetch('/api/sms/notify-responder', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ incidentId: data[0].id }),
        }).catch((notifyErr) => {
          // Non-blocking: SMS failure never invalidates or delays the confirmed incident
          console.warn('[SMS] Non-blocking responder alert failed to dispatch:', notifyErr);
        });
      }
    } catch (err) {
      console.error(err);
      setSubmitError('Online SOS submission failed. Dispatch notification is NOT confirmed.');
    } finally {
      setLoading(false);
    }
  };

  const isLocationReady = Boolean(coords && isValidCoordinate(coords.lat, coords.lng));

  return (
    <main className="min-h-screen bg-[#08090C] text-[#F8FAFC] flex flex-col font-sans selection:bg-[#DC2626] selection:text-white">
      {/* Mobile-constrained centered container */}
      <div className="w-full max-w-lg mx-auto flex-1 flex flex-col sm:border-x sm:border-[#272A33] sm:shadow-2xl sm:shadow-black">
        {/* 1. COMPACT BRANDED HEADER */}
        <header className="sticky top-0 z-30 bg-[#08090C]/95 backdrop-blur-md border-b border-[#272A33] px-3.5 py-2 shrink-0 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded bg-[#DC2626] flex items-center justify-center text-white shrink-0">
              <Siren className="h-3.5 w-3.5" />
            </div>
            <div className="flex items-center gap-1.5 leading-none">
              <span className="font-extrabold text-sm tracking-tight text-[#F8FAFC]">ResQ-Lane</span>
              <span className="text-[10px] text-[#A1A1AA] font-mono uppercase tracking-wider font-semibold">
                SOS
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#111319] border border-[#272A33] text-[10px] font-mono text-[#A1A1AA]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#10B981] animate-pulse" />
            <span className="font-bold text-[#F8FAFC]">NH-16 DEMO</span>
          </div>
        </header>

        {/* WORKFLOW VIEW: CONFIRMATION SCREEN vs RAPID EMERGENCY SOS CONSOLE */}
        {sent ? (
          /* DEDICATED CONFIRMATION SCREEN */
          <div className="flex-1 flex flex-col justify-center px-4 py-6">
            <div className="bg-[#111319] border border-[#10B981]/40 rounded-2xl p-6 text-center space-y-4 shadow-2xl shadow-[#10B981]/10">
              <div className="h-14 w-14 bg-[#10B981]/20 text-[#10B981] rounded-2xl flex items-center justify-center mx-auto border border-[#10B981]/40 shadow-inner">
                <ShieldCheck className="h-8 w-8 text-[#10B981]" />
              </div>

              <div className="space-y-1">
                <h1 className="text-2xl font-black text-[#F8FAFC] tracking-tight">
                  SOS Alert Submitted
                </h1>
                <p className="text-xs text-[#10B981] font-semibold tracking-wide uppercase">
                  Alert recorded by ResQ-Lane
                </p>
              </div>

              {/* Verified Telemetry Record */}
              <div className="bg-[#08090C] border border-[#272A33] rounded-xl p-3.5 text-left space-y-2 font-mono text-xs">
                <div className="flex items-center justify-between pb-2 border-b border-[#272A33]">
                  <span className="text-[#A1A1AA] text-[11px]">CORRIDOR</span>
                  <span className="text-[#F8FAFC] font-bold">NH-16 Express</span>
                </div>
                <div className="flex items-center justify-between pb-2 border-b border-[#272A33]">
                  <span className="text-[#A1A1AA] text-[11px]">CARRIAGEWAY</span>
                  <span className="text-[#10B981] font-bold uppercase">
                    Towards {direction}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#A1A1AA] text-[11px]">COORDINATES</span>
                  <span className="text-[#F8FAFC]">
                    {coords?.lat.toFixed(6)}, {coords?.lng.toFixed(6)}
                  </span>
                </div>
              </div>

              {/* Highway Safety Instruction */}
              <div className="p-3 bg-[#08090C] border border-[#272A33] rounded-xl text-left space-y-1">
                <p className="text-xs font-bold text-[#F8FAFC] flex items-center gap-1.5">
                  <ShieldAlert className="h-3.5 w-3.5 text-[#FBBF24] shrink-0" />
                  Immediate Highway Safety Rules:
                </p>
                <p className="text-[11px] text-[#A1A1AA] leading-relaxed">
                  Remain safely behind the concrete barrier or steel guardrail. Do not cross the median divider on foot.
                </p>
              </div>

              {/* Demo Mode Reset */}
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setSent(false);
                    setDirection(null);
                    setSubmitError(null);
                  }}
                  className="w-full py-2.5 px-4 rounded-xl text-xs font-mono font-medium text-[#A1A1AA] hover:text-[#F8FAFC] bg-[#181B24] hover:bg-[#202430] border border-[#272A33] transition cursor-pointer"
                >
                  Reset SOS State (Demo Mode)
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* FAST-TRACK EMERGENCY CONSOLE */
          <div className="flex-1 flex flex-col p-3.5 space-y-3">
            {/* SUBMISSION FAILURE PERSISTENT BANNER */}
            {submitError && (
              <div className="p-3 bg-[#180B0E] border border-[#DC2626] rounded-xl space-y-1.5 shadow-lg shadow-[#DC2626]/20 animate-in fade-in duration-150">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-[#DC2626] shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <p className="text-xs font-black text-[#F8FAFC] tracking-wide uppercase">
                      ONLINE SOS SUBMISSION FAILED — DISPATCH NOT CONFIRMED
                    </p>
                    <p className="text-[11px] text-[#A1A1AA] leading-snug">
                      {submitError} Check data connection and retry, or use the SMS fallback below.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 pt-0.5">
                  <button
                    type="button"
                    onClick={() => handleSendSOS()}
                    disabled={loading}
                    className="py-1 px-2.5 bg-[#DC2626] hover:bg-[#B91C1C] text-white rounded text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
                    <span>Retry SOS</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSmsFallback(true)}
                    className="py-1 px-2.5 bg-[#111319] hover:bg-[#181B24] border border-[#272A33] text-[#A1A1AA] hover:text-[#F8FAFC] rounded text-xs font-medium transition cursor-pointer"
                  >
                    View SMS Fallback
                  </button>
                </div>
              </div>
            )}

            {/* 2. MINIMAL READABLE GPS STATUS STRIP */}
            <div className="bg-[#111319] border border-[#272A33] rounded-xl px-3 py-2 flex items-center justify-between text-xs font-mono">
              <div className="flex items-center gap-2 overflow-hidden">
                <MapPin className="h-3.5 w-3.5 text-[#22D3EE] shrink-0" />
                {locationStatus === 'acquiring' ? (
                  <span className="text-[#22D3EE] flex items-center gap-1 text-[11px] truncate">
                    <RefreshCw className="h-3 w-3 animate-spin shrink-0" />
                    Acquiring GPS fix...
                  </span>
                ) : isLocationReady && coords ? (
                  <span className="text-[#F8FAFC] text-[11px] truncate">
                    <span className="text-[#22D3EE] font-bold">GPS:</span> {coords.lat.toFixed(4)}, {coords.lng.toFixed(4)}
                    {coords.accuracy !== undefined && (
                      <span className="text-[#A1A1AA] ml-1">(±{coords.accuracy}m)</span>
                    )}
                  </span>
                ) : locationStatus === 'denied' || locationStatus === 'unavailable' ? (
                  <span className="text-[#FBBF24] text-[11px] font-bold truncate" title={locationError || undefined}>
                    {locationError || 'GPS unavailable'}
                  </span>
                ) : (
                  <span className="text-[#A1A1AA] text-[11px] truncate">
                    GPS initializing...
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1.5 shrink-0 ml-2">
                <button
                  type="button"
                  onClick={requestLocation}
                  className="p-1 text-[#A1A1AA] hover:text-[#22D3EE] transition cursor-pointer"
                  title="Refresh GPS"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setShowManualInput(!showManualInput)}
                  className="text-[10px] text-[#22D3EE] hover:underline font-mono px-1 py-0.5 cursor-pointer"
                >
                  {showManualInput ? 'Hide' : 'Manual'}
                </button>
              </div>
            </div>

            {/* MANUAL RECOVERY DRAWER (ONLY VISIBLE ON DEMAND OR GPS FAILURE) */}
            {showManualInput && (
              <form
                onSubmit={handleApplyManualCoords}
                className="bg-[#111319] border border-[#272A33] rounded-xl p-3 space-y-2 animate-in fade-in duration-100"
              >
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="font-bold text-[#F8FAFC] text-[11px]">Manual Coordinate Fallback</span>
                  <button
                    type="button"
                    onClick={() => handleFillPreset(16.3824, 80.5486)}
                    className="text-[10px] text-[#22D3EE] hover:underline cursor-pointer"
                  >
                    Fill NH-16 Preset
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    step="any"
                    value={manualLat}
                    onChange={(e) => setManualLat(e.target.value)}
                    placeholder="Latitude (e.g. 16.3824)"
                    className="w-full bg-[#08090C] border border-[#272A33] focus:border-[#22D3EE] rounded px-2.5 py-1.5 text-xs font-mono text-[#F8FAFC] placeholder-zinc-600 focus:outline-none"
                  />
                  <input
                    type="number"
                    step="any"
                    value={manualLng}
                    onChange={(e) => setManualLng(e.target.value)}
                    placeholder="Longitude (e.g. 80.5486)"
                    className="w-full bg-[#08090C] border border-[#272A33] focus:border-[#22D3EE] rounded px-2.5 py-1.5 text-xs font-mono text-[#F8FAFC] placeholder-zinc-600 focus:outline-none"
                  />
                </div>

                {manualError && (
                  <p className="text-xs text-[#DC2626] font-medium flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3 shrink-0" />
                    {manualError}
                  </p>
                )}

                <button
                  type="submit"
                  className="w-full py-1.5 px-3 bg-[#22D3EE] hover:bg-[#06B6D4] text-[#08090C] rounded text-xs font-extrabold transition cursor-pointer"
                >
                  Confirm Coordinates
                </button>
              </form>
            )}

            {/* 3. PRIMARY EMERGENCY ACTION: DOMINANT RED SOS BUTTON */}
            <div className="space-y-1.5">
              <button
                type="button"
                onClick={() => handleSendSOS()}
                disabled={loading}
                className={`w-full min-h-[72px] py-4 px-6 rounded-2xl font-black text-2xl tracking-wider transition-all duration-150 flex items-center justify-center gap-3.5 shadow-2xl cursor-pointer ${
                  loading
                    ? 'bg-[#B91C1C] border border-[#DC2626] text-white cursor-wait opacity-90'
                    : 'bg-[#DC2626] hover:bg-red-500 active:bg-[#B91C1C] text-white shadow-[#DC2626]/40 ring-2 ring-[#DC2626]/40 active:scale-[0.98]'
                }`}
              >
                {loading ? (
                  <>
                    <RefreshCw className="h-7 w-7 animate-spin text-white shrink-0" />
                    <span className="uppercase font-black text-lg">TRANSMITTING SOS...</span>
                  </>
                ) : (
                  <>
                    <Siren className="h-8 w-8 text-white animate-pulse shrink-0" />
                    <div className="text-center">
                      <span className="block text-2xl uppercase font-black leading-none tracking-wider text-white">
                        SEND SOS
                      </span>
                      <span className="block text-[11px] font-normal text-red-100 font-mono mt-1 leading-none">
                        {direction
                          ? `Towards ${direction} Carriageway`
                          : 'Tap to request emergency trauma dispatch'}
                      </span>
                    </div>
                  </>
                )}
              </button>
            </div>

            {/* 4. HIGHWAY CARRIAGEWAY SELECTOR (IMMEDIATELY BELOW SOS) */}
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-[#A1A1AA] font-bold uppercase text-[11px]">
                  Highway Carriageway Orientation
                </span>
                <span className="text-[10px] text-[#22D3EE]">
                  {direction ? `CONFIRMED: ${direction}` : 'TAP DIRECTION TO LOCK'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {/* VIJAYAWADA (Northbound) */}
                <button
                  type="button"
                  onClick={() => {
                    setDirection('VIJAYAWADA');
                    setSubmitError(null);
                  }}
                  disabled={loading}
                  className={`p-3 rounded-xl border text-left transition-all duration-150 flex flex-col justify-between min-h-[92px] cursor-pointer ${
                    direction === 'VIJAYAWADA'
                      ? 'bg-[#0E1815] border-[#10B981] shadow-lg shadow-[#10B981]/20 ring-1 ring-[#10B981]'
                      : 'bg-[#111319] border-[#272A33] hover:border-[#A1A1AA] hover:bg-[#181B24]'
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#10B981]">
                      Northbound
                    </span>
                    <div
                      className={`h-5 w-5 rounded-full flex items-center justify-center border ${
                        direction === 'VIJAYAWADA'
                          ? 'bg-[#10B981] border-[#10B981] text-[#08090C]'
                          : 'border-[#272A33] bg-[#08090C] text-[#A1A1AA]'
                      }`}
                    >
                      {direction === 'VIJAYAWADA' ? (
                        <Check className="h-3 w-3 stroke-[3]" />
                      ) : (
                        <ArrowUpRight className="h-3 w-3" />
                      )}
                    </div>
                  </div>
                  <div>
                    <span className="block text-base font-black text-[#F8FAFC] tracking-tight leading-tight">
                      VIJAYAWADA
                    </span>
                    <span className="block text-[10px] text-[#A1A1AA] mt-0.5 leading-tight">
                      Mangalagiri • Krishna River
                    </span>
                  </div>
                </button>

                {/* GUNTUR (Southbound) */}
                <button
                  type="button"
                  onClick={() => {
                    setDirection('GUNTUR');
                    setSubmitError(null);
                  }}
                  disabled={loading}
                  className={`p-3 rounded-xl border text-left transition-all duration-150 flex flex-col justify-between min-h-[92px] cursor-pointer ${
                    direction === 'GUNTUR'
                      ? 'bg-[#0C171F] border-[#22D3EE] shadow-lg shadow-[#22D3EE]/20 ring-1 ring-[#22D3EE]'
                      : 'bg-[#111319] border-[#272A33] hover:border-[#A1A1AA] hover:bg-[#181B24]'
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#22D3EE]">
                      Southbound
                    </span>
                    <div
                      className={`h-5 w-5 rounded-full flex items-center justify-center border ${
                        direction === 'GUNTUR'
                          ? 'bg-[#22D3EE] border-[#22D3EE] text-[#08090C]'
                          : 'border-[#272A33] bg-[#08090C] text-[#A1A1AA]'
                      }`}
                    >
                      {direction === 'GUNTUR' ? (
                        <Check className="h-3 w-3 stroke-[3]" />
                      ) : (
                        <ArrowDownRight className="h-3 w-3" />
                      )}
                    </div>
                  </div>
                  <div>
                    <span className="block text-base font-black text-[#F8FAFC] tracking-tight leading-tight">
                      GUNTUR
                    </span>
                    <span className="block text-[10px] text-[#A1A1AA] mt-0.5 leading-tight">
                      Kaza Toll • ANU Campus
                    </span>
                  </div>
                </button>
              </div>
            </div>

            {/* 5. SECONDARY SUBORDINATE ACTIONS */}
            <div className="pt-2">
              <button
                type="button"
                onClick={() => setSmsFallback(!smsFallback)}
                className="w-full flex items-center justify-center gap-1.5 text-xs py-1.5 px-3 rounded-lg border border-[#272A33] bg-[#111319] hover:bg-[#181B24] text-[#A1A1AA] hover:text-[#F8FAFC] transition cursor-pointer"
              >
                <WifiOff className="h-3.5 w-3.5 text-[#A1A1AA]" />
                <span>
                  {smsFallback
                    ? '2G/Offline Mode Active (Tap to Hide)'
                    : 'Simulate 2G / No-Internet Mode'}
                </span>
              </button>

              {smsFallback && (
                <div className="mt-2 p-3 bg-[#18120A] border border-[#FBBF24]/40 rounded-xl text-xs space-y-2">
                  <div>
                    <p className="font-bold text-[#FBBF24] text-xs flex items-center gap-1.5">
                      <AlertTriangle className="h-3.5 w-3.5 text-[#FBBF24] shrink-0" />
                      Manual SMS Payload (Offline Fallback)
                    </p>
                    <p className="text-[11px] text-[#A1A1AA] mt-0.5 leading-snug">
                      Copy this text into your SMS app.
                      <strong className="block text-[#FBBF24] mt-0.5">
                        Note: Copying does NOT automatically transmit or dispatch an alert.
                      </strong>
                    </p>
                  </div>

                  <div className="p-2.5 bg-[#08090C] border border-[#272A33] rounded-lg font-mono text-[11px] text-[#FBBF24] select-all break-all">
                    <code>{smsPayloadString}</code>
                  </div>

                  <button
                    type="button"
                    onClick={handleCopySmsPayload}
                    className="w-full py-2 px-3 bg-[#FBBF24]/20 hover:bg-[#FBBF24]/30 border border-[#FBBF24]/40 text-[#FBBF24] rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition active:scale-[0.98] cursor-pointer"
                  >
                    {copiedSms ? (
                      <>
                        <CheckCircle2 className="h-3.5 w-3.5 text-[#10B981]" />
                        <span className="text-[#10B981]">Payload Copied to Clipboard</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5 text-[#FBBF24]" />
                        <span>Copy Payload to Clipboard</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* COMPACT FOOTER */}
        <footer className="text-center text-[10px] font-mono text-[#A1A1AA] border-t border-[#272A33] py-2 px-4 shrink-0 bg-[#08090C]">
          ResQ-Lane • Highway Emergency Response • NH-16 Sector
        </footer>
      </div>
    </main>
  );
}