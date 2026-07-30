import { BreadcrumbPoint } from "../types";

/**
 * Calculates the distance between two geographic coordinates using the Haversine formula.
 * @returns Distance in meters
 */
export function calculateDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Calculates total cumulative distance in kilometers for a sequence of breadcrumb points.
 */
export function calculateTotalDistanceKm(points: BreadcrumbPoint[]): number {
  if (points.length < 2) return 0;
  let totalMeters = 0;
  for (let i = 1; i < points.length; i++) {
    totalMeters += calculateDistanceMeters(
      points[i - 1].lat,
      points[i - 1].lon,
      points[i].lat,
      points[i].lon
    );
  }
  return totalMeters / 1000;
}

/**
 * Returns a sleek hex color based on vehicle speed (km/h) for map breadcrumb rendering.
 */
export function getSpeedColor(speed: number | null | undefined): string {
  if (speed === null || speed === undefined || speed < 15) {
    return "#06b6d4"; // Cyan (< 15 km/h)
  } else if (speed < 50) {
    return "#10b981"; // Emerald Green (15 - 50 km/h)
  } else if (speed < 90) {
    return "#f59e0b"; // Amber (50 - 90 km/h)
  } else {
    return "#e82127"; // Tesla Red (> 90 km/h)
  }
}
