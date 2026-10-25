'use client';

import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Popup, CircleMarker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { getLiveRoadRoute, findNearestUTurn } from '@/lib/routing';

const createIcon = (bg: string, label: string) =>
  L.divIcon({
    className: 'custom-radar-icon',
    html: `
      <div style="
        background: ${bg};
        color: white;
        font-family: monospace;
        font-size: 11px;
        font-weight: 700;
        padding: 4px 10px;
        border-radius: 9999px;
        box-shadow: 0 0 16px ${bg};
        border: 1px solid rgba(255,255,255,0.6);
        display: flex;
        align-items: center;
        gap: 6px;
        white-space: nowrap;
      ">
        <span style="width: 8px; height: 8px; border-radius: 50%; background: white; display: inline-block;"></span>
        ${label}
      </div>
    `,
    iconSize: [160, 26],
    iconAnchor: [80, 13],
  });

const crashMarkerIcon = createIcon('#ef4444', 'INCIDENT POINT');
const ambulanceMarkerIcon = createIcon('#3b82f6', '108 PATROL #01');
const uturnMarkerIcon = createIcon('#f59e0b', 'GRADE-SEPARATED U-TURN');

interface Props {
  incidentCoords: [number, number] | null;
  activeDirection: 'VIJAYAWADA' | 'GUNTUR' | null;
  onMapClick?: (coords: [number, number]) => void;
  onMetricsCalculated?: (directMin: number, detourMin: number, distanceKm: number) => void;
}

// Click listener inside Leaflet map
function MapClickHandler({ onClick }: { onClick?: (coords: [number, number]) => void }) {
  useMapEvents({
    click(e) {
      if (onClick) {
        onClick([e.latlng.lat, e.latlng.lng]);
      }
    },
  });
  return null;
}

export default function DispatchMap({
  incidentCoords,
  activeDirection,
  onMapClick,
  onMetricsCalculated,
}: Props) {
  // Base 108 Emergency Station (near Mangalagiri NH-16 junction)
  const ambulanceBase: [number, number] = [16.4350, 80.5650];

  const [directPath, setDirectPath] = useState<[number, number][]>([]);
  const [detourPath, setDetourPath] = useState<[number, number][]>([]);
  const [uturnNode, setUturnNode] = useState<{ name: string; coords: [number, number] } | null>(null);
  const [animIndex, setAnimIndex] = useState(0);

  // Compute live real-world road paths whenever incident changes
  useEffect(() => {
    if (!incidentCoords) return;

    const computeRoutes = async () => {
      // 1. Direct optimal route
      const direct = await getLiveRoadRoute(ambulanceBase, incidentCoords);
      setDirectPath(direct.coordinates);

      // 2. Identify required U-turn interchange if median conflict occurs
      const nearestCut = findNearestUTurn(incidentCoords);
      setUturnNode(nearestCut);

      // 3. Detour route (Base -> Past victim -> U-Turn Interchange -> Return to victim)
      const leg1 = await getLiveRoadRoute(ambulanceBase, nearestCut.coords);
      const leg2 = await getLiveRoadRoute(nearestCut.coords, incidentCoords);
      const completeDetour = [...leg1.coordinates, ...leg2.coordinates];
      setDetourPath(completeDetour);

      // 4. Report calculated metrics back to dashboard
      const detourDuration = Number((leg1.durationMin + leg2.durationMin).toFixed(1));
      if (onMetricsCalculated) {
        onMetricsCalculated(direct.durationMin, detourDuration, direct.distanceKm);
      }
    };

    computeRoutes();
  }, [incidentCoords, activeDirection]);

  // Live animation along direct path
  useEffect(() => {
    if (directPath.length === 0) return;
    setAnimIndex(0);
    const interval = setInterval(() => {
      setAnimIndex((prev) => (prev + 1) % directPath.length);
    }, 700);
    return () => clearInterval(interval);
  }, [directPath]);

  return (
    <div className="relative h-full w-full rounded-2xl overflow-hidden border border-slate-800 shadow-2xl bg-slate-950">
      {/* Top Map HUD */}
      <div className="absolute top-4 left-4 z-[1000] bg-slate-950/90 backdrop-blur-md border border-slate-700/80 rounded-xl px-4 py-2.5 shadow-2xl flex items-center gap-3 text-xs font-mono">
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 animate-ping" />
        <span className="text-white font-bold tracking-wider">LIVE ROUTING ENGINE (OSRM NHAI GRAPH)</span>
        <span className="text-slate-600">|</span>
        <span className="text-cyan-400 font-semibold">CLICK ANYWHERE ON MAP TO SIMULATE INCIDENT</span>
      </div>

      <MapContainer
        center={[16.4000, 80.5500]}
        zoom={12}
        scrollWheelZoom={true}
        className="h-full w-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <MapClickHandler onClick={onMapClick} />

        {/* 108 Base Station */}
        <Marker position={ambulanceBase} icon={ambulanceMarkerIcon}>
          <Popup>108 Emergency Trauma Response Base (Mangalagiri)</Popup>
        </Marker>

        {/* Incident Marker */}
        {incidentCoords && (
          <Marker position={incidentCoords} icon={crashMarkerIcon}>
            <Popup>
              DYNAMIC CRASH POINT<br />
              Lat: {incidentCoords[0].toFixed(4)} | Lng: {incidentCoords[1].toFixed(4)}<br />
              Carriageway: {activeDirection ? `Towards ${activeDirection}` : 'Pending Orientation'}
            </Popup>
          </Marker>
        )}

        {/* Nearest U-turn Interchange Marker */}
        {uturnNode && (
          <Marker position={uturnNode.coords} icon={uturnMarkerIcon}>
            <Popup>Mandatory Grade-Separated Cut: {uturnNode.name}</Popup>
          </Marker>
        )}

        {/* Detour Route (Red Dotted Line) */}
        {detourPath.length > 0 && (
          <Polyline
            positions={detourPath}
            pathOptions={{
              color: '#dc2626',
              weight: 5,
              dashArray: '8, 12',
              opacity: 0.85,
            }}
          />
        )}

        {/* Direct Optimal Route (Solid Emerald Green) */}
        {directPath.length > 0 && (
          <Polyline
            positions={directPath}
            pathOptions={{
              color: '#059669',
              weight: 7,
              opacity: 0.95,
            }}
          />
        )}

        {/* Animated Ambulance Node */}
        {directPath[animIndex] && (
          <CircleMarker
            center={directPath[animIndex]}
            radius={9}
            pathOptions={{
              color: '#10b981',
              fillColor: '#ffffff',
              fillOpacity: 1,
              weight: 3,
            }}
          />
        )}
      </MapContainer>

      {/* Dynamic Bottom Legend Overlay */}
      <div className="absolute bottom-4 left-4 z-[1000] bg-slate-950/95 backdrop-blur-md border border-slate-800 rounded-xl p-3 text-[11px] font-mono space-y-1.5 shadow-2xl">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-6 bg-red-600 rounded-full" />
          <span className="text-red-400 font-semibold">
            Standard GPS Detour (Trapped on Opposing Carriageway)
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-6 bg-emerald-500 rounded-full shadow-[0_0_8px_#10b981]" />
          <span className="text-emerald-300 font-semibold">
            ResQ-Lane Median-Aware Ingress (Direct Highway Access)
          </span>
        </div>
      </div>
    </div>
  );
}