# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The primary user is a restaurant-chain operator or manager planning the next day's action for each location. They need to decide whether to keep regular pricing or run a narrowly scoped offer, and they need to understand the reason and economics before saving the plan.

## Product Purpose

Project Northstar helps a small coffee-shop chain turn historical orders and local signals into a daily, location-specific revenue plan. Success means an operator can compare forecasts and offers, review the evidence and trade-offs, and save a confident action plan for each store.

## Positioning

The product combines local demand context with transparent offer economics and a human review step. It produces a proposed plan rather than autonomously changing a menu or publishing social content.

## Operating Context

The planning workflow is: historical orders and local signals → demand outlook → offer comparison → explanation and social draft → manager review → saved action plan. Operators plan for a selected local date and scenario across three fictional locations, inspecting hourly outlooks, capacity constraints, evidence, and price-response assumptions.

## Capabilities and Constraints

- Show chain and location outlooks, with distinct order counts and item-unit forecasts.
- Compare regular price with predefined discount offers and optionally a bundle; the backend owns all pricing calculations.
- Present curated local event, holiday, weather, and competitor evidence; public-web competitor research is optional and requires manager review.
- Allow managers to edit terms, recalculate, approve, dismiss, and persist revisions of a plan.
- Generate an explanation and social draft that match the current terms; use a labeled fallback when AI output is unavailable.
- All demo data is fictional fixtures. Approval saves a plan only: it does not change a live menu, charge customers, or publish a post.
- Money is represented in integer cents; order counts and item units remain distinct; forecasts and response scenarios are clearly labeled assumptions where applicable.

## Evidence on Hand

- Deterministic fictional fixtures and API contracts in the repository.
- A runnable React/Vite web interface under `web/` and a Node API under `server/`.
- A three-minute demo script in `README.md` covering Downtown's discount trial, Arena's capacity-led no-change recommendation, review, generated copy, and persisted saved plans.
- No customer testimonials, live integrations, or verified external performance claims are present; future work must not fabricate them.

## Brand Commitments

The current fictional hackathon demo is named Project Northstar. It is not a live or monetized café. The interface should be straightforward first, with a consistent, restrained visual language and brief, smooth interactions.

## Product Principles

1. Make the next action clear, but keep the operator in control.
2. Show the evidence, assumptions, and economics behind every recommendation.
3. Treat capacity and operational constraints as first-class decision inputs.
4. Preserve revision integrity so saved terms, rationale, and copy never become mismatched.
5. Keep the deterministic fixture path useful even when optional AI or research integrations fail.
