import type { Inquiry } from "./inquiry";

// Shape of pricing_rules.definition (placeholder values until Paul supplies the real method).
export type PricingDefinition = {
  currency: string;
  tax_basis: string;
  per_sqft: Record<string, { min: number; max: number }>;
  project_type_multiplier: Record<string, number>;
  minimum_job_charge: number;
};

export type EstimateResult =
  | {
      priced: true;
      price_min: number;
      price_max: number;
      details: Record<string, unknown>;
    }
  | { priced: false; reason: string };

// Whole cents, never floating-point noise.
const cents = (n: number) => Math.round(n * 100) / 100;

export function priceEstimate(q: Inquiry, def: PricingDefinition): EstimateResult {
  if (q.square_footage === null)
    return { priced: false, reason: "Square footage was not provided." };
  const rate = def.per_sqft[q.material];
  if (!rate)
    return { priced: false, reason: `No pricing for material "${q.material}"; staff to quote.` };
  const mult = def.project_type_multiplier[q.project_type];
  if (mult === undefined)
    return { priced: false, reason: `No pricing for project type "${q.project_type}".` };

  const raw_min = q.square_footage * rate.min * mult;
  const raw_max = q.square_footage * rate.max * mult;
  const price_min = cents(Math.max(raw_min, def.minimum_job_charge));
  const price_max = cents(Math.max(raw_max, price_min));

  return {
    priced: true,
    price_min,
    price_max,
    details: {
      square_footage: q.square_footage,
      material: q.material,
      project_type: q.project_type,
      rate_per_sqft: rate,
      multiplier: mult,
      minimum_job_charge: def.minimum_job_charge,
      minimum_applied: raw_min < def.minimum_job_charge,
    },
  };
}
