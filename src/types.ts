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

export interface ConfigData {
  authorized: boolean;
  brokerUrl: string;
  topicConfig: string;
  defaultLocation: { lat: number; lon: number };
}

export interface CarTelemetry {
  speed: number | null;
  battery_level: number | null;
  state: string | null;
  odometer: number | null;
  outside_temp: number | null;
}
