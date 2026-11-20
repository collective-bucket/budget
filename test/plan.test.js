"use strict";

var test = require("node:test");
var assert = require("node:assert");
var plan = require("../public/assets/plan.js");

function scenario(extra) {
  return Object.assign(
    {
      today: "2026-11-21",
      startDate: "2026-11-21",
      startCash: 0,
      spendMethod: "card",
      incomes: [
        { id: "maas", name: "Maaş", amount: 72000, schedule: "monthly", day: 21 },
        { id: "kira", name: "Kira", amount: 48000, schedule: "monthly", day: 5 },
        { id: "depo", name: "Depozito", amount: 20000, schedule: "once", date: "2026-12-31" }
      ],
      debts: [
        {
          id: "kart",
          name: "Kart",
          kind: "card",
          balance: 190000,
          asOf: "2026-11-20",
          priority: "high",
          statementDay: 24,
          dueDay: 2,
          minRate: 0.4,
          monthlyRate: 0.0375,
          taxRate: 0.3
        },
        { id: "ceza", name: "Trafik cezaları", kind: "once", balance: 8500, asOf: "2026-11-20", priority: "low" }
      ],
      goals: [{ id: "araba", name: "Araba", targetAmount: 200000, deadline: "2027-05-01" }],
      expenses: []
    },
    extra || {}
  );
}

test("user scenario: card spending, 40% minimum, 3.75% + tax interest", function () {
  var r = plan.buildPlan(scenario());
  assert.strictEqual(r.feasible, true);
  assert.ok(Math.abs(r.daily - 1773) <= 2, "daily " + r.daily);
  assert.strictEqual(r.statements[0].date, "2026-11-24");
  assert.strictEqual(r.statements[0].dueDate, "2026-12-02");
  assert.ok(Math.abs(r.statements[0].minimum - 0.4 * r.statements[0].amount) < 1);
  assert.strictEqual(r.bridges.length, 1);
  assert.strictEqual(r.bridges[0].date, "2026-12-02");
  assert.strictEqual(r.bridges[0].repaidOn, "2026-12-05");
  assert.ok(Math.abs(r.bridges[0].amount - (4000 + 1.6 * r.daily)) < 2);
  assert.strictEqual(r.paidOff.kart, undefined);
  assert.ok(r.paidOff.ceza >= "2027-02-01" && r.paidOff.ceza < "2027-03-01", r.paidOff.ceza);
  assert.ok(Math.abs(r.interest - 7912) < 50, "interest " + r.interest);
  assert.ok(r.checks[0].free >= 199999);
  assert.ok(r.end.free >= 199999 && r.end.owed > 0);
});

test("without tax the limit is higher", function () {
  var s = scenario();
  s.debts[0].taxRate = 0;
  assert.ok(Math.abs(plan.buildPlan(s).daily - 1785) <= 2);
});

test("cash spending needs cash every day", function () {
  var r = plan.buildPlan(scenario({ spendMethod: "cash" }));
  assert.strictEqual(r.feasible, true);
  assert.strictEqual(r.negative, null);
  assert.ok(r.daily < 1773);
});

test("recorded card payment counts toward the minimum", function () {
  var s = scenario({
    today: "2026-12-03",
    expenses: [
      { date: "2026-12-02", amount: 80000, debtId: "kart" },
      { date: "2026-12-05", amount: 1, method: "cash" }
    ]
  });
  s.debts[0].balance = 190000;
  var r = plan.buildPlan(s);
  assert.deepStrictEqual(r.warnings, []);
});

test("missed minimum in the past is reported", function () {
  var r = plan.buildPlan(scenario({ today: "2026-12-03" }));
  assert.strictEqual(r.warnings.length, 1);
  assert.match(r.warnings[0], /2026-12-02/);
});

test("unreachable goal reports infeasible", function () {
  var s = scenario();
  s.goals[0].targetAmount = 900000;
  var r = plan.buildPlan(s);
  assert.strictEqual(r.feasible, false);
  assert.ok(r.checks[0].gap > 0);
});

test("month-end days clamp to short months", function () {
  var r = plan.buildPlan({
    today: "2027-02-01",
    startCash: 0,
    incomes: [{ id: "a", name: "A", amount: 3100, schedule: "monthly", day: 31 }],
    debts: [],
    goals: [{ id: "g", name: "G", targetAmount: 0.01, deadline: "2027-03-01" }],
    expenses: []
  });
  assert.strictEqual(r.months[0].income, 3100);
});

test("loan received after start adds cash and is repaid by its due date", function () {
  var s = scenario({
    debts: scenario().debts.concat([
      { id: "kopru", name: "Köprü", kind: "loan", balance: 10000, asOf: "2026-12-01", dueDate: "2026-12-06", priority: "high" }
    ])
  });
  var r = plan.buildPlan(s);
  assert.strictEqual(r.bridges.length, 0);
  assert.ok(r.paidOff.kopru <= "2026-12-06");
});
