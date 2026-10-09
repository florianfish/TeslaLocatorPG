export type MqttStatus = "disconnected" | "connecting" | "connected" | "error";

export interface CarLocation {
  lat: number;
  lon: number;
  timestamp: number;
  // Only sent to admins
  topic?: string;
  rawPayload?: string;
}

export interface BreadcrumbPoint {
  lat: number;
  lon: number;
  timestamp: number;
  speed: number | null;
}


export type TopicEntry = [
  string, // topic name
  {
    payload: string;
    timestamp: number;
    parsedGps?: { lat: number; lon: number };
  }
];

export interface MessageLog {
  id: string;
  topic: string;
  payload: string;
  timestamp: number;
  parsedGps?: { lat: number; lon: number };
}

export type UserRole = "admin" | "user";

export interface ShareLink {
  id: string;
  label: string;
  createdAt: number;
  expiresAt: number;
}

export interface ShareSession {
  label: string;
  expiresAt: number;
}

export interface ConfigData {
  authorized: boolean;
  role?: UserRole;
  share?: ShareSession;
  version?: string;
  ingress?: boolean;
  brokerUrl: string;
  topicConfig: string;
  // Demo simulator, only offered to admins on a local development server
  simulator?: boolean;
  defaultLocation: { lat: number; lon: number };
}

export interface ActiveRoute {
  destination: string | null;
  energy_at_arrival: number | null;
  miles_to_arrival: number | null;
  minutes_to_arrival: number | null;
  traffic_minutes_delay: number | null;
  location: {
    latitude: number;
    longitude: number;
  } | null;
  error: string | null;
}

export interface TpmsData {
  tpms_pressure_fl: number | null;
  tpms_pressure_fr: number | null;
  tpms_pressure_rl: number | null;
  tpms_pressure_rr: number | null;
  tpms_soft_warning_fl?: boolean | null;
  tpms_soft_warning_fr?: boolean | null;
  tpms_soft_warning_rl?: boolean | null;
  tpms_soft_warning_rr?: boolean | null;
}

export interface ChargingData {
  charger_power: number | null; // kW
  charger_voltage: number | null; // V
  charger_actual_current: number | null; // A
  charger_phases: number | null;
  charge_energy_added: number | null; // kWh
  time_to_full_charge: number | null; // hours
  charge_limit_soc: number | null; // %
  est_battery_range_km: number | null;
  plugged_in: boolean | null;
  charge_port_door_open: boolean | null;
}

// Lock and openings: admin only (null for read-only users)
export interface SecurityData {
  locked: boolean | null;
  doors_open: boolean | null;
  trunk_open: boolean | null;
  frunk_open: boolean | null;
  windows_open: boolean | null;
  is_user_present: boolean | null;
}

export interface CarTelemetry {
  speed: number | null;
  battery_level: number | null;
  state: string | null;
  odometer: number | null;
  outside_temp: number | null;
  shift_state: string | null;
  sentry_mode: boolean | null;
  active_route: ActiveRoute | null;
  tpms: TpmsData | null;
  charging: ChargingData | null;
  security: SecurityData | null;
}

