/**
 * All user-visible brand and product copy for the web app. Swapping the demo
 * brand (or product type) should only require editing this file.
 */
export const brand = {
  name: "Harborline Coffee",
  product: "Revenue Planner",
  /** Decorative glyph shown before the name; hidden from screen readers. */
  logoGlyph: "◐",
  tagline: "What should each location do tomorrow, and why?",
  /** Label for an item unit in offer economics (e.g. "break-even units"). */
  itemNoun: { singular: "unit", plural: "units" },
  fixtureNotice:
    "Demo data: a fictional coffee-shop chain with fixture sales, events and competitors. Forecasts and demand responses are estimates, not measured results.",
} as const;

export const documentTitle = `${brand.name} ${brand.product}`;
