export interface PropertyResult {
    id: string;
    name: string;
    price: number;
    currency: string;
    distanceKm: number;
  }
  
  export interface SearchResponse {
    results: PropertyResult[];
    nextCursor?: string;
  }
  