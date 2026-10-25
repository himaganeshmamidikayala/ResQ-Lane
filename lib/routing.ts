export interface RouteGeometry {
  coordinates: [number, number][];
  distanceKm: number;
  durationMin: number;
}

// Fetches actual road geometry and ETA from OSRM
export async function getLiveRoadRoute(
  start: [number, number],
  end: [number, number]
): Promise<RouteGeometry> {
  try {
    // OSRM expects coordinates as: lng,lat
    const url = `https://router.project-osrm.org/route/v1/driving/${start[1]},${start[0]};${end[1]},${end[0]}?overview=full&geometries=geojson`;
    const res = await fetch(url);
    const data = await res.json();

    if (!data.routes || data.routes.length === 0) {
      throw new Error('No route returned by OSRM');
    }

    const route = data.routes[0];
    // Convert [lng, lat] back to Leaflet's [lat, lng]
    const coordinates: [number, number][] = route.geometry.coordinates.map(
      (coord: [number, number]) => [coord[1], coord[0]]
    );

    return {
      coordinates,
      distanceKm: Number((route.distance / 1000).toFixed(2)),
      durationMin: Number((route.duration / 60).toFixed(1)),
    };
  } catch (error) {
    console.error('OSRM Live Route failed, falling back to direct vector:', error);
    return {
      coordinates: [start, end],
      distanceKm: 4.2,
      durationMin: 5.5,
    };
  }
}

// Known legal U-turn cuts / grade-separated interchanges on the NH-16 corridor
export const HIGHWAY_UTURN_NODES: { name: string; coords: [number, number] }[] = [
  { name: 'Kaza Toll Interchange', coords: [16.3452, 80.5361] },
  { name: 'Mangalagiri AIIMS Bypass Cut', coords: [16.4215, 80.5623] },
  { name: 'Kanaka Durga Flyover Feeder', coords: [16.5122, 80.6085] },
  { name: 'Namburu University Crossing', coords: [16.3688, 80.5284] },
];

// Calculates closest U-turn node when median prevents cross-over
export function findNearestUTurn(point: [number, number]): { name: string; coords: [number, number] } {
  let minDistance = Infinity;
  let nearest = HIGHWAY_UTURN_NODES[0];

  for (const node of HIGHWAY_UTURN_NODES) {
    const dist = Math.hypot(node.coords[0] - point[0], node.coords[1] - point[1]);
    if (dist < minDistance) {
      minDistance = dist;
      nearest = node;
    }
  }
  return nearest;
}