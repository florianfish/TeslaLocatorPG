export type MqttStatus = "disconnected" | "connecting" | "connected" | "error";

export interface CarLocation {
  lat: number;
  lon: number;
  timestamp: number;
  topic: string;
  rawPayload: string;
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

export interface CarTelemetry {
  speed: number | null;
  battery_level: number | null;
  state: string | null;
  odometer: number | null;
  outside_temp: number | null;
  shift_state: string | null;
  active_route: ActiveRoute | null;
}
