export type MqttStatus = "disconnected" | "connecting" | "connected" | "error";

export interface CarLocation {
  lat: number;
  lon: number;
  timestamp: number;
  topic: string;
  rawPayload: string;
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

export interface ConfigData {
  authorized: boolean;
  role?: UserRole;
  version?: string;
  ingress?: boolean;
  brokerUrl: string;
  topicConfig: string;
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
}

