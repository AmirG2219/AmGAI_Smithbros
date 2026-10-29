import { test } from "node:test";
import assert from "node:assert/strict";
import { fillTemplate, renderAgreementPdf } from "./render";
import { EMPTY_INPUTS, buildVars, financials, missingFields, parseDeposit } from "./vars";
import { sendBlockers } from "./send";

const quote = { id: "q", scope: "Install 400 sq ft", exclusions: null, subtotal: 1000, tax: 50 };
const full = { ...EMPTY_INPUTS, site_address: "1 Main St", deposit_percent: "40", start_date: "2026-11-01", completion_estimate: "2 weeks" };

test("financials split the accepted total by the deposit percentage", () => {
  assert.deepEqual(financials(1000, 50, 40), { total: 1050, deposit: 420, balance: 630 });
});

test("deposit must be a number from 0 to 100", () => {
  assert.equal(parseDeposit(""), null);
  assert.equal(parseDeposit("101"), null);
  assert.equal(parseDeposit("abc"), null);
  assert.equal(parseDeposit("0"), 0);
});

test("work contract values come from the accepted quote, not from staff input", () => {
  const v = buildVars({ type: "work_contract", today: new Date("2026-10-24T12:00:00Z"), clientName: "A B", inputs: full, quote });
  assert.equal(v.scope_of_work, "Install 400 sq ft");
  assert.equal(v.total, "$1,050.00");
  assert.equal(v.deposit_amount, "$420.00");
  assert.equal(v.balance_amount, "$630.00");
});

test("a blank deposit is flagged, never invented", () => {
  assert.ok(missingFields("work_contract", { ...full, deposit_percent: "" }).some((m) => m.startsWith("Deposit")));
  assert.deepEqual(missingFields("policy_liability", { ...EMPTY_INPUTS, site_address: "x" }), []);
});

test("a template variable with no value is an error, not a blank", () => {
  assert.throws(() => fillTemplate("Hi {{nope}}", {}), /nope/);
});

test("the PDF renders", async () => {
  const pdf = await renderAgreementPdf({ template: "# Title\n\nHello {{client_name}}", vars: { client_name: "A B" }, footerId: "T" });
  assert.equal(Buffer.from(pdf.subarray(0, 5)).toString(), "%PDF-");
});

test("sending is blocked for placeholder templates", () => {
  assert.ok(sendBlockers(["Work Contract (placeholder)"]).some((b) => /placeholder/i.test(b)));
});

import { parseCustomer, parseProject, parseQuoteEntry, phoneKey } from "./vars";

test("customer needs a first name and a sane email; email is lower-cased", () => {
  assert.equal(parseCustomer({ first_name: " " }).ok, false);
  assert.equal(parseCustomer({ first_name: "A", email: "nope" }).ok, false);
  const r = parseCustomer({ first_name: " Ann ", email: " Ann@Example.COM " });
  assert.ok(r.ok && r.value.first_name === "Ann" && r.value.email === "ann@example.com" && r.value.last_name === null);
});

test("phone numbers match on their last 10 digits regardless of formatting", () => {
  assert.equal(phoneKey("(403) 555-0100"), phoneKey("+1 403.555.0100"));
  assert.equal(phoneKey("12"), null);
});

test("a new project needs a known type and a street address", () => {
  assert.equal(parseProject({ project_type: "spaceship", site_address_line1: "1 Main" }).ok, false);
  assert.equal(parseProject({ project_type: "commercial", site_address_line1: " " }).ok, false);
  assert.equal(parseProject({ project_type: "commercial", site_address_line1: "1 Main" }).ok, true);
});

test("a typed-in quote is never defaulted: price, tax rate, scope and confirmation are all required", () => {
  const ok = { scope: "Install floor", subtotal: "1000", taxRate: "5", confirmed: true };
  assert.equal(parseQuoteEntry({ ...ok, scope: "" }).ok, false);
  assert.equal(parseQuoteEntry({ ...ok, subtotal: "" }).ok, false);
  assert.equal(parseQuoteEntry({ ...ok, subtotal: "0" }).ok, false);
  assert.equal(parseQuoteEntry({ ...ok, taxRate: "" }).ok, false);
  assert.equal(parseQuoteEntry({ ...ok, taxRate: "101" }).ok, false);
  assert.equal(parseQuoteEntry({ ...ok, confirmed: false }).ok, false);
  const r = parseQuoteEntry(ok);
  assert.ok(r.ok && r.value.subtotal === 1000 && r.value.tax === 50 && r.value.exclusions === null);
  const zero = parseQuoteEntry({ ...ok, taxRate: "0" });
  assert.ok(zero.ok && zero.value.tax === 0);
});

import { formatScope, scopeProblem, type ScopeArea } from "./vars";

const svc = (description: string, quantity = "", unit: "sqft" | "lnft" | "count" | "fixed" = "fixed", materials = "", notes = "") => ({ description, quantity, unit, materials, notes });

test("structured scope is written area by area, with quantities only where they apply", () => {
  const areas: ScopeArea[] = [
    { name: "Living Room", services: [svc("Hardwood installation", "250", "sqft", "White oak, matte finish"), svc("Remove existing carpet")] },
    { name: "Staircase", services: [svc("Stair refinishing", "14", "count")] },
    { name: "Empty", services: [svc("  ")] },
  ];
  assert.equal(
    formatScope(areas, "Furniture moved by customer."),
    "**Living Room**\n- Hardwood installation, 250 sq ft. Materials and finish: White oak, matte finish\n- Remove existing carpet\n\n**Staircase**\n- Stair refinishing, 14 units\n\n**Additional notes**\nFurniture moved by customer.",
  );
});

test("scope entry problems are named, and fixed work takes no quantity", () => {
  assert.equal(scopeProblem([{ name: "Hall", services: [svc("")] }]), "Add at least one service.");
  assert.match(scopeProblem([{ name: "Hall", services: [svc("Repair", "abc", "sqft")] }]) ?? "", /quantity/);
  assert.match(scopeProblem([{ name: "Hall", services: [svc("Repair", "5", "fixed")] }]) ?? "", /fixed work/);
  assert.match(scopeProblem([{ name: "", services: [svc("Repair")] }, { name: "B", services: [svc("Sand")] }]) ?? "", /Name each area/);
  assert.equal(scopeProblem([{ name: "", services: [svc("Repair")] }]), null);
});

test("a structured scope renders into the contract PDF text unchanged", () => {
  const scope = formatScope([{ name: "Hall", services: [svc("Sanding", "80", "sqft")] }]);
  assert.equal(fillTemplate("## Scope\n{{scope_of_work}}", { scope_of_work: scope }), "## Scope\n**Hall**\n- Sanding, 80 sq ft");
});
