import assert from "node:assert/strict";
import test from "node:test";
import { cardHalves, deferredDashboardStatus, deferredProductName, deferredStatusLabel, mapDeferredToll, minorToEuros } from "./src/deferred-tolls";

test("maps deferred toll cents and keeps the growing debt separate from the checkout estimate", () => {
  const item = mapDeferredToll({
    id: "11111111-1111-1111-1111-111111111111",
    order_id: "22222222-2222-2222-2222-222222222222",
    country_code: "FR",
    product_code: "fr-free-flow",
    travel_date: "2026-10-12",
    section_ids: ["a13", "a14"],
    estimated_eur_minor: 1450,
    actual_debt_eur_minor: 1820,
    status: "debt_found",
  }, "free_flow");

  assert.equal(item.product, "Francie Free-Flow");
  assert.equal(item.source, "order_free_flow_items");
  assert.equal(item.estimate, 14.5);
  assert.equal(item.accrued, 18.2);
  assert.equal(item.price, 18.2);
  assert.equal(item.status, "processing");
  assert.equal(item.deferredLabel, "Čeká se na dluh");
  assert.equal(item.sectionCount, 2);
});

test("names Norway and Sweden as EPASS24 and treats an open account as waiting", () => {
  assert.equal(deferredProductName("epass24", "NO"), "Norsko EPASS24");
  assert.equal(deferredProductName("epass24", "se"), "Švédsko EPASS24");
  assert.equal(deferredDashboardStatus("awaiting_debt"), "waiting");
  assert.equal(deferredStatusLabel("charge_failed"), "Stržení selhalo");
  assert.equal(deferredStatusLabel("debt_found"), "Čeká se na dluh");
  assert.equal(deferredStatusLabel("charging"), "Čeká se na dluh");
  assert.equal(deferredStatusLabel("fulfilled"), "Hotovo");
  assert.equal(deferredDashboardStatus("debt_zero"), "fulfilled");
  assert.equal(deferredDashboardStatus("epass24_pay_failed"), "failed");
  assert.equal(minorToEuros(null), null);
});

test("splits a card into a vignette half and a Free-Flow half", () => {
  assert.deepEqual(cardHalves([{ deferred: true, status: "processing" }]), { classic: null, account: "deferred" });
  assert.deepEqual(cardHalves([{ deferred: true, status: "fulfilled" }]), { classic: null, account: "fulfilled" });
  assert.deepEqual(cardHalves([{ deferred: true, status: "failed" }]), { classic: null, account: "failed" });
  assert.deepEqual(cardHalves([
    { deferred: false, status: "fulfilled" },
    { deferred: true, status: "waiting" },
  ]), { classic: "fulfilled", account: "deferred" });
  assert.deepEqual(cardHalves([
    { deferred: false, status: "processing" },
    { deferred: true, status: "failed" },
  ]), { classic: "processing", account: "failed" });
  assert.deepEqual(cardHalves([
    { deferred: false, status: "fulfilled" },
    { deferred: true, status: "fulfilled" },
    { deferred: true, status: "waiting" },
  ]), { classic: "fulfilled", account: "deferred" });
});

test("uses the charged total once the customer card has been debited", () => {
  const item = mapDeferredToll({
    id: "33333333-3333-3333-3333-333333333333",
    order_id: "22222222-2222-2222-2222-222222222222",
    country_code: "NO",
    estimated_eur_minor: 900,
    actual_debt_eur_minor: 1000,
    processing_fee_eur_minor: 100,
    charged_total_eur_minor: 1100,
    status: "fulfilled",
    epass24_paid_at: "2026-10-14T10:00:00.000Z",
  }, "epass24");

  assert.equal(item.price, 11);
  assert.equal(item.chargedTotal, 11);
  assert.equal(item.fee, 1);
  assert.equal(item.status, "fulfilled");
  assert.equal(item.fulfilledAt, "2026-10-14T10:00:00.000Z");
});
