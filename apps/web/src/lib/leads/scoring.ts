import type { Inquiry } from "./inquiry";

// Shape of settings.lead_scoring_rules (data, so Paul's real rules replace the placeholders without code changes).
export type ScoringRules = {
  version: string;
  is_placeholder?: boolean;
  points: {
    square_footage: { min: number; points: number }[];
    timeline: Record<string, number>;
    project_type: Record<string, number>;
    has_phone: number;
    material_specified: number;
  };
  thresholds: { hot: number; warm: number };
};

export type ScoreResult = {
  score: number;
  classification: "hot" | "warm" | "cold";
  factors: Record<string, number>;
};

export function scoreLead(q: Inquiry, rules: ScoringRules): ScoreResult {
  const p = rules.points;
  const sqft =
    q.square_footage === null
      ? 0
      : ([...p.square_footage]
          .sort((a, b) => b.min - a.min)
          .find((t) => q.square_footage! >= t.min)?.points ?? 0);

  const factors = {
    square_footage: sqft,
    timeline: p.timeline[q.timeline] ?? 0,
    project_type: p.project_type[q.project_type] ?? 0,
    has_phone: q.phone ? p.has_phone : 0,
    material_specified: q.material !== "unsure" ? p.material_specified : 0,
  };
  const score = Math.min(
    100,
    Object.values(factors).reduce((a, b) => a + b, 0),
  );
  const classification =
    score >= rules.thresholds.hot ? "hot" : score >= rules.thresholds.warm ? "warm" : "cold";
  return { score, classification, factors };
}
