import type { SavedPlan } from "../contracts/index.ts";

/**
 * A small platform-owned interface for campaigns. This in-memory implementation
 * makes the initial shell usable; Person 1 should replace it with durable local
 * storage before the approval-survives-restart milestone.
 */
export interface PlanStore {
  list(planningDate?: string): SavedPlan[];
  save(plan: SavedPlan): SavedPlan;
}

export function createPlanStore(): PlanStore {
  const plans = new Map<string, SavedPlan>();

  return {
    list: () => [...plans.values()],
    save: (plan) => {
      plans.set(`${plan.recommendationId}:${plan.revision}`, plan);
      return plan;
    },
  };
}
