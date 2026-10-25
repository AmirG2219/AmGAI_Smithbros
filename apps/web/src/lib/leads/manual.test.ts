import assert from "node:assert/strict";
import { test } from "node:test";
import { missingDetails, parseManualLead, reviewReason } from "./manual";

test("only the lead source is required", () => {
  const r = parseManualLead({ lead_source: "phone" });
  assert.ok(r.ok);
  assert.equal(r.value.project_type, null);
  assert.equal(r.value.square_footage, null);
});

test("rejects a missing or unknown source and bad values", () => {
  assert.equal(parseManualLead({}).ok, false);
  assert.equal(parseManualLead({ lead_source: "fax" }).ok, false);
  assert.equal(parseManualLead({ lead_source: "phone", project_type: "roofing" }).ok, false);
  assert.equal(parseManualLead({ lead_source: "phone", timeline: "soon" }).ok, false);
  assert.equal(parseManualLead({ lead_source: "phone", square_footage: "-5" }).ok, false);
  assert.equal(parseManualLead({ lead_source: "phone", square_footage: "abc" }).ok, false);
});

test("keeps what was given", () => {
  const r = parseManualLead({ lead_source: "walk_in", project_type: "sand_refinish", square_footage: "850.456", timeline: "1_3_months", site_city: " Calgary " });
  assert.ok(r.ok);
  assert.equal(r.value.square_footage, 850.46);
  assert.equal(r.value.site_city, "Calgary");
});

test("incomplete leads list what is missing; complete ones do not", () => {
  const empty = parseManualLead({ lead_source: "phone" });
  assert.ok(empty.ok);
  assert.deepEqual(missingDetails(empty.value, false), ["a phone number or email", "project type", "square footage", "timeline", "job site address"]);
  const full = parseManualLead({ lead_source: "phone", project_type: "commercial", square_footage: "100", timeline: "asap", site_address_line1: "1 Main St" });
  assert.ok(full.ok);
  assert.deepEqual(missingDetails(full.value, true), []);
  assert.equal(reviewReason("Phone call", [], false), null);
  assert.match(reviewReason("Phone call", ["timeline"], false)!, /Still needed: timeline/);
  assert.match(reviewReason("Email", [], true)!, /differs/);
});
