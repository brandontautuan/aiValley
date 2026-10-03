import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Recommendation, SavedPlan, StrategyRun } from "../contracts/index.ts";

export interface StoreState {
  recommendations: Record<string, Recommendation>;
  plans: SavedPlan[];
  strategyRuns: Record<string, StrategyRun>;
}

export interface Store {
  read(): StoreState;
  write(update: (state: StoreState) => void): StoreState;
  reset(): void;
}

const empty = (): StoreState => ({ recommendations: {}, plans: [], strategyRuns: {} });

/**
 * Small durable store: one JSON file per local instance (gitignored), written
 * atomically after every change so approvals survive reload and restart.
 */
export function createFileStore(dataDir: string): Store {
  const file = join(dataDir, "store.json");
  let state: StoreState;
  try {
    const saved = JSON.parse(readFileSync(file, "utf8")) as Partial<StoreState>;
    state = {
      recommendations: saved.recommendations ?? {},
      plans: saved.plans ?? [],
      strategyRuns: saved.strategyRuns ?? {},
    };
  } catch {
    state = empty();
  }

  const persist = () => {
    mkdirSync(dirname(file), { recursive: true });
    const temp = `${file}.tmp`;
    writeFileSync(temp, JSON.stringify(state, null, 2));
    renameSync(temp, file);
  };

  return {
    read: () => structuredClone(state),
    write: (update) => {
      const next = structuredClone(state);
      update(next);
      state = next;
      persist();
      return structuredClone(state);
    },
    reset: () => {
      state = empty();
      rmSync(file, { force: true });
    },
  };
}
