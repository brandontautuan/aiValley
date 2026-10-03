export type RecommendationStatus = "draft" | "approved" | "dismissed";

export interface Location {
  id: string;
  name: string;
  timezone: string;
  hourlyCapacityOrders: number;
}

export interface MenuItem {
  id: string;
  name: string;
  regularPriceCents: number;
  variableCostCents: number;
}

export interface CompetitorOfferFixture {
  id: string;
  locationId: string;
  competitorName: string;
  sourceLabel: "fixture";
  collectedAt: string;
  comparability: "comparable" | "noncomparable";
  notes: string;
}

export interface PlanningData {
  planningDate: string;
  locations: Location[];
  menu: MenuItem[];
  competitorOffers: CompetitorOfferFixture[];
  fixtureLabel: string;
}

export interface SavedPlan {
  id: string;
  recommendationId: string;
  revision: number;
  locationId: string;
  status: "approved";
  savedAt: string;
}
