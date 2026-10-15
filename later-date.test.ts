import assert from "node:assert/strict";
import test from "node:test";
import { dueOrderIds, earliestRemindOn, laterReminderText, remindOnDate } from "./src/later-date";

test("reminds the day before validity and not in the past", () => {
  assert.equal(remindOnDate("2026-10-25", "2026-10-15"), "2026-10-24");
  assert.equal(remindOnDate("2026-10-16", "2026-10-15"), "2026-10-15");
  assert.equal(remindOnDate("2026-10-10", "2026-10-15"), "2026-10-15");
  assert.equal(remindOnDate(null, "2026-10-15"), "2026-10-15");
});

test("uses the earliest validity in a batch", () => {
  assert.equal(earliestRemindOn(["2026-10-25", "2026-10-18"], "2026-10-15"), "2026-10-17");
});

test("sends one reminder per order when its earliest date is due", () => {
  const due = dueOrderIds([
    { orderId: "a", remindOn: "2026-10-20" },
    { orderId: "a", remindOn: "2026-10-15" },
    { orderId: "b", remindOn: "2026-10-18" },
  ], "2026-10-15");
  assert.deepEqual(due, ["a"]);
});

test("writes a Czech ntfy body", () => {
  const text = laterReminderText("1AB2345", [
    { label: "CZ roční", validOn: "2026-10-25" },
    { label: "SK 10denní", validOn: "2026-10-18" },
  ]);
  assert.match(text, /1AB2345/);
  assert.match(text, /Čeká na vyřízení/);
  assert.match(text, /18\. 10\. 2026/);
  assert.match(text, /CZ roční/);
});
