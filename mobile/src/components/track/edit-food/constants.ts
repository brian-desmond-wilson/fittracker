import { FoodLocation } from "@/src/types/track";

export type SectionKey =
  | "basic"
  | "storage"
  | "nutrition"
  | "expiration"
  | "images"
  | "notes";

export const UNITS = ["oz", "lbs", "g", "kg", "ml", "L", "count", "servings"];

// A single storage-location row for multi-location inventory items.
export interface LocationEntry {
  id: string;
  location: FoodLocation;
  quantity: string;
  isReadyToConsume: boolean;
  notes: string;
}
