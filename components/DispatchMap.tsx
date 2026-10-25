'use client';

import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Popup, CircleMarker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { getLiveRoadRoute, findNearestUTurn } from '@/lib/routing';

const createTacticalMarkerIcon = (
  accentColor: string,
  badgeText: string,
  code: string,
  anchorWidth: number = 115
) =>
  L.divIcon({
    className: 'tactical-map-marker',
    html: `
      <div style="
        display: flex;
        flex-direction: column;
        align-items: center;
        width: ${anchorWidth}px;
        transform: translate3d(0, 0, 0);
      ">
        <div style="
          display: inline-flex;
          align-items: center;
          gap: 5px;
          background: #121215;
          border: 1px solid #27272a;
          border-left: 3px solid ${accentColor};
          border-radius: 5px;
          padding: 2.5px 6px;
          font-family: inherit;
          box-shadow: 0 4px 10px rgba(0, 0, 0, 0.7);
          white-space: nowrap;
          pointer-events: auto;
        ">
          <span style="
            display: inline-flex;
            align-items: center;
            justify-content: center;
            padding: 1px 3.5px;
            border-radius: 2px;
            background: ${accentColor}25;
            color: ${accentColor};
            font-size: 8.5px;
            font-weight: 800;
            font-family: ui-monospace, monospace;
            line-height: 1;
          ">${code}</span>
          <span style="
            color: #f4f4f5;
            font-size: 10px;
            font-weight: 600;
            line-height: 1;
          ">${badgeText}</span>
        </div>
        <div style="
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: ${accentColor};
          border: 1px solid #ffffff;
          margin-top: 2px;
          box-shadow: 0 0 5px ${accentColor};
        "></div>
      </div>
    `,
    iconSize: [anchorWidth, 24],
    iconAnchor: [anchorWidth / 2, 24],
  });

const crashMarkerIcon = createTacticalMarkerIcon('#f43f5e', 'Crash Location', 'SOS', 110);
const ambulanceMarkerIcon = createTacticalMarkerIcon('#38bdf8', '108 Base Station', 'EMS', 116);
const uturnMarkerIcon = createTacticalMarkerIcon('#fbbf24', 'Median U-Turn Cut', 'CUT', 120);

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
      setAnimIndex(0);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incidentCoords, activeDirection]);

  // Live animation along direct path
  useEffect(() => {
    if (directPath.length === 0) return;
    const interval = setInterval(() => {
      setAnimIndex((prev) => (prev + 1) % directPath.length);
    }, 700);
    return () => clearInterval(interval);
  }, [directPath]);

  return (
    <div className="relative h-full w-full rounded-xl overflow-hidden border border-[#27272a] shadow-sm bg-[#09090b]">
      {/* Top Tactical Map HUD */}
      <div className="absolute top-2.5 left-2.5 right-2.5 sm:right-auto z-[1000] bg-[#121215]/95 backdrop-blur-md border border-[#27272a] rounded-lg px-3 py-1.5 shadow-lg flex flex-wrap items-center gap-2 text-xs font-mono">
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-emerald-400 shrink-0" />
          <span className="text-zinc-100 font-bold tracking-wide text-[11px]">
            DEMO ENVIRONMENT • NH-16 (MANGALAGIRI–VIJAYAWADA)
          </span>
        </div>
        <span className="hidden sm:inline text-zinc-600">|</span>
        <span className="text-cyan-400 text-[10px] font-medium">
          Click map to simulate coordinate
        </span>
      </div>

      <MapContainer
        center={[16.4000, 80.5500]}
        zoom={12}
        scrollWheelZoom={true}
        className="h-full w-full"
      >
        {/* High-detail OpenStreetMap basemap with tactical dark operations styling */}
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />

        <MapClickHandler onClick={onMapClick} />

        {/* 108 Base Station */}
        <Marker position={ambulanceBase} icon={ambulanceMarkerIcon}>
          <Popup>
            <div className="font-mono text-xs">
              <div className="text-sky-400 font-bold mb-1">108 TRAUMA DISPATCH BASE</div>
              <div className="text-zinc-300">Mangalagiri NH-16 Emergency Hub</div>
              <div className="text-zinc-500 text-[10px] mt-1">Coordinates: {ambulanceBase[0]}, {ambulanceBase[1]}</div>
            </div>
          </Popup>
        </Marker>

        {/* Incident Marker */}
        {incidentCoords && (
          <Marker position={incidentCoords} icon={crashMarkerIcon}>
            <Popup>
              <div className="font-mono text-xs">
                <div className="text-rose-400 font-bold mb-1">INCIDENT TELEMETRY</div>
                <div className="text-zinc-300">
                  Carriageway: <span className="font-bold text-white">{activeDirection ? `Towards ${activeDirection}` : 'Pending Orientation'}</span>
                </div>
                <div className="text-zinc-400 text-[10px] mt-1">
                  Lat: {incidentCoords[0].toFixed(5)} | Lng: {incidentCoords[1].toFixed(5)}
                </div>
              </div>
            </Popup>
          </Marker>
        )}

        {/* Nearest U-turn Interchange Marker */}
        {uturnNode && (
          <Marker position={uturnNode.coords} icon={uturnMarkerIcon}>
            <Popup>
              <div className="font-mono text-xs">
                <div className="text-amber-400 font-bold mb-1">MANDATORY MEDIAN CUT</div>
                <div className="text-zinc-300">{uturnNode.name}</div>
                <div className="text-zinc-500 text-[10px] mt-1">Grade-separated U-turn turnaround point</div>
              </div>
            </Popup>
          </Marker>
        )}

        {/* Detour Route (Opposing Carriageway - Red Dashed Line) */}
        {detourPath.length > 0 && (
          <Polyline
            positions={detourPath}
            pathOptions={{
              color: '#f43f5e',
              weight: 3.5,
              dashArray: '6, 8',
              opacity: 0.8,
              lineCap: 'round',
              lineJoin: 'round',
            }}
          />
        )}

        {/* Direct Optimal Route (Solid Emerald Green with underlay) */}
        {directPath.length > 0 && (
          <>
            <Polyline
              positions={directPath}
              pathOptions={{
                color: '#064e3b',
                weight: 7,
                opacity: 0.7,
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />
            <Polyline
              positions={directPath}
              pathOptions={{
                color: '#10b981',
                weight: 4.5,
                opacity: 0.95,
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />
          </>
        )}

        {/* Animated Ambulance Node */}
        {directPath[animIndex] && (
          <CircleMarker
            center={directPath[animIndex]}
            radius={7}
            pathOptions={{
              color: '#10b981',
              fillColor: '#ffffff',
              fillOpacity: 1,
              weight: 2.5,
            }}
          />
        )}
      </MapContainer>

      {/* Dynamic Bottom Legend Overlay */}
      <div className="absolute bottom-2.5 left-2.5 z-[1000] bg-[#121215]/95 backdrop-blur-md border border-[#27272a] rounded-lg px-3 py-2 text-[10px] font-mono shadow-lg flex flex-wrap items-center gap-x-4 gap-y-1.5 max-w-[calc(100%-1.25rem)]">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-4 bg-emerald-500 rounded-sm shrink-0" />
          <span className="text-zinc-300">
            <strong className="text-emerald-400 font-semibold">ResQ-Lane:</strong> Direct Carriageway
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="h-1.5 w-4 rounded-sm shrink-0 border border-rose-500/50"
            style={{
              backgroundImage: 'repeating-linear-gradient(90deg, #f43f5e, #f43f5e 3px, transparent 3px, transparent 6px)',
            }}
          />
          <span className="text-zinc-400">
            <strong className="text-rose-400 font-semibold">Standard Detour:</strong> Median U-Turn Penalty
          </span>
        </div>
      </div>
    </div>
  );
}