-- Dev seed: PLACEHOLDER scoring and pricing. Invented values, to be replaced with Paul's real rules.
-- Idempotent. Requires an active admin in app_users (settings must be written by one).

insert into public.settings (key, value, updated_by)
select 'lead_scoring_rules', $json$
{
  "version": "placeholder-v0",
  "is_placeholder": true,
  "points": {
    "square_footage": [
      { "min": 2000, "points": 30 },
      { "min": 800, "points": 20 },
      { "min": 1, "points": 10 }
    ],
    "timeline": { "asap": 30, "1_3_months": 20, "3_6_months": 10, "flexible": 5 },
    "project_type": { "new_installation": 20, "commercial": 20, "restoration": 15, "sand_refinish": 10 },
    "has_phone": 10,
    "material_specified": 10
  },
  "thresholds": { "hot": 70, "warm": 40 }
}
$json$::jsonb, id
from public.app_users where role = 'admin' and is_active order by created_at limit 1
on conflict (key) do nothing;

insert into public.pricing_rules (version, status, is_placeholder, definition)
values ('test-v0', 'test', true, $json$
{
  "notes": "PLACEHOLDER values for demos only. Not Smith Bros pricing.",
  "currency": "CAD",
  "tax_basis": "excluding_tax",
  "per_sqft": {
    "hardwood": { "min": 9, "max": 15 },
    "engineered": { "min": 7, "max": 12 },
    "laminate": { "min": 4, "max": 8 },
    "vinyl": { "min": 4, "max": 9 },
    "tile": { "min": 10, "max": 18 }
  },
  "project_type_multiplier": {
    "new_installation": 1.0,
    "sand_refinish": 0.45,
    "restoration": 0.8,
    "commercial": 1.15
  },
  "minimum_job_charge": 1500
}
$json$::jsonb)
on conflict (version) do nothing;
