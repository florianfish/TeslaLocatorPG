// Demo mode: replays TeslaMate-like MQTT frames into the server state, for local development only.
// Frames are injected locally and never published to the broker.
import { DEMO_DRIVE_ROUTE } from "./simulatorRoute";

export type SimulatorScenario = "drive" | "charging" | "parked";

export interface SimulatorStatus {
  running: boolean;
  scenario: SimulatorScenario | null;
  // 0..1
  progress: number;
}

type Inject = (topic: string, payload: string) => void;

const TICK_MS = 1000;
// Simulated seconds of driving per tick, so a city trip lasts a few minutes
const DRIVE_TIME_SCALE = 4;
// Simulated minutes of charging per tick
const CHARGE_MINUTES_PER_TICK = 0.5;
const KM_PER_MILE = 1.609344;
const BATTERY_CAPACITY_KWH = 75;
// Average consumption, in battery % per km (~150 Wh/km on 75 kWh)
const CONSUMPTION_PERCENT_PER_KM = 0.2;

const DRIVE_WAYPOINTS = DEMO_DRIVE_ROUTE;
const DRIVE_DESTINATION = "Gare de Lyon";
const PARKED_POSITION: [number, number] = [48.85837, 2.29448];

function distanceKm([lat1, lon1]: [number, number], [lat2, lon2]: [number, number]): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

// Each scenario returns a tick function; a tick returns the progress, and 1 ends the scenario
type Scenario = (car: (field: string, value: unknown) => void, locationTopic: string, inject: Inject) => () => number;

const driveScenario: Scenario = (car, locationTopic, inject) => {
  const segmentKm = DRIVE_WAYPOINTS.slice(1).map((point, i) => distanceKm(DRIVE_WAYPOINTS[i], point));
  const totalKm = segmentKm.reduce((sum, km) => sum + km, 0);
  let travelledKm = 0;
  let battery = 72;
  let odometer = 24318.4;
  let tick = 0;

  car("state", "driving");
  car("shift_state", "D");
  car("outside_temp", 17.5);
  car("sentry_mode", false);
  car("locked", true);
  car("is_user_present", true);

  return () => {
    tick++;
    // City traffic: speed oscillates between ~25 and ~65 km/h, slowing down near the destination
    const remainingKm = totalKm - travelledKm;
    const cruise = 45 + 20 * Math.sin(tick / 6);
    const speed = Math.max(8, Math.min(cruise, remainingKm * 120));
    const stepKm = (speed / 3600) * DRIVE_TIME_SCALE;
    travelledKm = Math.min(totalKm, travelledKm + stepKm);
    battery -= stepKm * CONSUMPTION_PERCENT_PER_KM;
    odometer += stepKm;

    // Position along the waypoints
    let along = travelledKm;
    let segment = 0;
    while (segment < segmentKm.length - 1 && along > segmentKm[segment]) {
      along -= segmentKm[segment];
      segment++;
    }
    const ratio = segmentKm[segment] > 0 ? Math.min(1, along / segmentKm[segment]) : 1;
    const [fromLat, fromLon] = DRIVE_WAYPOINTS[segment];
    const [toLat, toLon] = DRIVE_WAYPOINTS[segment + 1];
    const lat = fromLat + (toLat - fromLat) * ratio;
    const lon = fromLon + (toLon - fromLon) * ratio;
    const arrived = travelledKm >= totalKm;

    inject(locationTopic, JSON.stringify({ latitude: round(lat, 6), longitude: round(lon, 6) }));
    car("speed", arrived ? 0 : Math.round(speed));
    car("battery_level", Math.round(battery));
    car("odometer", round(odometer, 1));

    if (arrived) {
      car("shift_state", "P");
      car("state", "online");
      car("active_route", { error: "No active route available" });
      return 1;
    }

    const remaining = totalKm - travelledKm;
    // Traffic slowdown on the middle part of the trip
    const trafficDelay = travelledKm / totalKm > 0.3 && travelledKm / totalKm < 0.7 ? 3 : 0;
    car("active_route", {
      destination: DRIVE_DESTINATION,
      energy_at_arrival: round(battery - remaining * CONSUMPTION_PERCENT_PER_KM, 1),
      miles_to_arrival: round(remaining / KM_PER_MILE, 3),
      // Average urban speed of 30 km/h, plus the traffic delay
      minutes_to_arrival: round((remaining / 30) * 60 + trafficDelay, 2),
      traffic_minutes_delay: trafficDelay,
      location: { latitude: DRIVE_WAYPOINTS[DRIVE_WAYPOINTS.length - 1][0], longitude: DRIVE_WAYPOINTS[DRIVE_WAYPOINTS.length - 1][1] },
      error: null,
    });
    return travelledKm / totalKm;
  };
};

const chargingScenario: Scenario = (car, locationTopic, inject) => {
  const startLevel = 18;
  const limit = 80;
  let level = startLevel;
  let energyAdded = 0;

  inject(locationTopic, JSON.stringify({ latitude: 48.81233, longitude: 2.38544 }));
  car("state", "charging");
  car("shift_state", "P");
  car("speed", 0);
  car("active_route", { error: "No active route available" });
  car("plugged_in", true);
  car("charge_port_door_open", true);
  car("charge_limit_soc", limit);
  car("charger_phases", "");

  return () => {
    // DC fast charging curve: ~170 kW at low charge, tapering above 50 %
    const power = level < 50 ? 170 - level : Math.max(40, 170 - (level - 50) * 4);
    const minutes = CHARGE_MINUTES_PER_TICK;
    const addedKwh = (power * minutes) / 60;
    energyAdded += addedKwh;
    level = Math.min(limit, level + (addedKwh / BATTERY_CAPACITY_KWH) * 100);
    const done = level >= limit;

    // Remaining time with the current power, in decimal hours like TeslaMate
    const remainingKwh = ((limit - level) / 100) * BATTERY_CAPACITY_KWH;
    const voltage = 390 + Math.round(level / 2);

    car("battery_level", Math.floor(level));
    car("charge_energy_added", round(energyAdded, 2));
    car("est_battery_range_km", round(level * 5.1, 1));

    if (done) {
      car("state", "online");
      car("charger_power", 0);
      car("charger_voltage", "");
      car("charger_actual_current", "");
      car("time_to_full_charge", "");
      return 1;
    }

    car("charger_power", Math.round(power));
    car("charger_voltage", voltage);
    car("charger_actual_current", Math.round((power * 1000) / voltage));
    car("time_to_full_charge", round(remainingKwh / power, 2));
    return (level - startLevel) / (limit - startLevel);
  };
};

// Snapshot of a parked car, guarded by Sentry, with one under-inflated tyre to show the TPMS alert
const parkedScenario: Scenario = (car, locationTopic, inject) => () => {
  inject(locationTopic, JSON.stringify({ latitude: PARKED_POSITION[0], longitude: PARKED_POSITION[1] }));
  car("state", "online");
  car("shift_state", "P");
  car("speed", 0);
  car("battery_level", 64);
  car("outside_temp", 12.5);
  car("odometer", 24325.1);
  car("sentry_mode", true);
  car("active_route", { error: "No active route available" });
  car("plugged_in", false);
  car("charge_port_door_open", false);
  car("locked", true);
  car("doors_open", false);
  car("trunk_open", false);
  car("frunk_open", false);
  car("windows_open", false);
  car("is_user_present", false);
  car("tpms_pressure_fl", 2.9);
  car("tpms_pressure_fr", 2.9);
  car("tpms_pressure_rl", 2.1);
  car("tpms_pressure_rr", 2.9);
  return 1;
};

const SCENARIOS: Record<SimulatorScenario, Scenario> = {
  drive: driveScenario,
  charging: chargingScenario,
  parked: parkedScenario,
};

export function isSimulatorScenario(value: unknown): value is SimulatorScenario {
  return typeof value === "string" && value in SCENARIOS;
}

export function createSimulator(inject: Inject, locationTopic: string, carId = "1") {
  let timer: ReturnType<typeof setInterval> | null = null;
  let status: SimulatorStatus = { running: false, scenario: null, progress: 0 };

  const car = (field: string, value: unknown) => {
    const payload = typeof value === "object" && value !== null ? JSON.stringify(value) : String(value);
    inject(`teslamate/cars/${carId}/${field}`, payload);
  };

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
    status = { ...status, running: false };
  }

  function start(scenario: SimulatorScenario) {
    stop();
    status = { running: true, scenario, progress: 0 };
    const tick = SCENARIOS[scenario](car, locationTopic, inject);
    const runTick = () => {
      const progress = tick();
      status = { ...status, progress: Math.min(1, progress) };
      if (progress >= 1) stop();
    };
    runTick();
    if (status.running) timer = setInterval(runTick, TICK_MS);
  }

  return { start, stop, getStatus: () => status };
}
