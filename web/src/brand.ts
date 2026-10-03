/**
 * All user-visible brand and product copy for the web app. Swapping the demo
 * brand (or product type) should only require editing this file.
 */
export const brand = {
  name: "Disney Cafe",
  product: "Daily Planner",
  tagline: "What should each location do tomorrow, and why?",
  /** Label for an item unit in offer economics (e.g. "break-even units"). */
  itemNoun: { singular: "unit", plural: "units" },
  fixtureNotice:
    "Demo · Fictional stores and sample data. Sales forecasts are estimates, not guaranteed results.",
} as const;

export const documentTitle = `${brand.name} ${brand.product}`;
