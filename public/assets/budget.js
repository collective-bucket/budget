(function () {
  "use strict";

  var MAX_INCOMES = 40;
  var MAX_GOALS = 40;
  var MAX_EXPENSES = 200;
  var MAX_DEBTS = 40;
  var DEBT_KINDS = ["card", "once", "loan"];
  var MONTH_NAMES = [
    "Ocak",
    "Şubat",
    "Mart",
    "Nisan",
    "Mayıs",
    "Haziran",
    "Temmuz",
    "Ağustos",
    "Eylül",
    "Ekim",
    "Kasım",
    "Aralık"
  ];

  function nowIso() {
    return new Date().toISOString();
  }

  function createId() {
    if (window.crypto && crypto.randomUUID) {
      return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
    }
    return Math.random().toString(36).slice(2, 14);
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function roundMoney(amount) {
    return Math.round((Number(amount) || 0) * 100) / 100;
  }

  function formatMoney(amount) {
    var value = Math.round(Number(amount) || 0);
    return value.toLocaleString("tr-TR") + " ₺";
  }

  function isoDate(value) {
    var text = String(value || "").slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
  }

  function todayIso(date) {
    var d = date || new Date();
    return monthKey(d) + "-" + String(d.getDate()).padStart(2, "0");
  }

  function clampNumber(value, min, max, fallback) {
    var n = Number(value);
    if (!isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  }

  function monthKey(date) {
    var d = date || new Date();
    var month = String(d.getMonth() + 1).padStart(2, "0");
    return d.getFullYear() + "-" + month;
  }

  function parseMonthKey(ym) {
    var parts = String(ym || "").split("-");
    var year = Number(parts[0]);
    var month = Number(parts[1]);
    if (!year || month < 1 || month > 12) return null;
    return { year: year, month: month };
  }

  function formatMonthLabel(ym) {
    var parsed = parseMonthKey(ym);
    if (!parsed) return ym || "";
    return MONTH_NAMES[parsed.month - 1] + " " + parsed.year;
  }

  function daysInMonth(ym) {
    var parsed = parseMonthKey(ym);
    if (!parsed) return 30;
    return new Date(parsed.year, parsed.month, 0).getDate();
  }

  function remainingDays(ym, today) {
    var parsed = parseMonthKey(ym);
    var now = today || new Date();
    if (!parsed) return 1;
    if (monthKey(now) !== ym) return 0;
    return daysInMonth(ym) - now.getDate() + 1;
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function emptyBudget(uid) {
    return {
      ownerUid: uid,
      incomes: [],
      goals: [],
      debts: [],
      plan: normalizePlan(null),
      months: {},
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
  }

  function normalizeIncomes(list) {
    if (!Array.isArray(list)) return [];
    return list
      .map(function (row) {
        var id = String((row && row.id) || "").trim().slice(0, 40);
        var name = String((row && row.name) || "").trim().slice(0, 80);
        var amount = roundMoney(row && row.amount);
        if (!id || !name || !(amount >= 0)) return null;
        var once = row && row.schedule === "once" && isoDate(row.date);
        return {
          id: id,
          name: name,
          amount: amount,
          active: Boolean(row && row.active !== false),
          schedule: once ? "once" : "monthly",
          day: Math.round(clampNumber(row && row.day, 1, 31, 1)),
          date: once ? isoDate(row.date) : null
        };
      })
      .filter(Boolean)
      .slice(0, MAX_INCOMES);
  }

  function normalizeGoals(list) {
    if (!Array.isArray(list)) return [];
    return list
      .map(function (row) {
        var id = String((row && row.id) || "").trim().slice(0, 40);
        var name = String((row && row.name) || "").trim().slice(0, 80);
        var targetAmount = roundMoney(row && row.targetAmount);
        if (!id || !name || !(targetAmount > 0)) return null;
        return {
          id: id,
          name: name,
          targetAmount: targetAmount,
          pinned: Boolean(row && row.pinned),
          deadline: isoDate(row && row.deadline),
          createdAt: String((row && row.createdAt) || nowIso())
        };
      })
      .filter(Boolean)
      .slice(0, MAX_GOALS);
  }

  function normalizeDebts(list) {
    if (!Array.isArray(list)) return [];
    return list
      .map(function (row) {
        var id = String((row && row.id) || "").trim().slice(0, 40);
        var name = String((row && row.name) || "").trim().slice(0, 80);
        var balance = roundMoney(row && row.balance);
        var kind = DEBT_KINDS.indexOf(row && row.kind) >= 0 ? row.kind : "once";
        if (!id || !name || !(balance >= 0)) return null;
        var debt = {
          id: id,
          name: name,
          kind: kind,
          balance: balance,
          asOf: isoDate(row.asOf) || todayIso(),
          priority: row.priority === "low" ? "low" : "high",
          dueDate: kind === "card" ? null : isoDate(row.dueDate)
        };
        if (kind === "card") {
          debt.statementDay = Math.round(clampNumber(row.statementDay, 1, 31, 1));
          debt.dueDay = Math.round(clampNumber(row.dueDay, 1, 31, 10));
          debt.minRate = clampNumber(row.minRate, 0, 1, 0.4);
          debt.monthlyRate = clampNumber(row.monthlyRate, 0, 1, 0);
          debt.taxRate = clampNumber(row.taxRate, 0, 1, 0.3);
        }
        return debt;
      })
      .filter(Boolean)
      .slice(0, MAX_DEBTS);
  }

  function normalizePlan(plan) {
    return {
      startDate: isoDate(plan && plan.startDate) || todayIso(),
      startCash: roundMoney(plan && plan.startCash),
      spendMethod: plan && plan.spendMethod === "cash" ? "cash" : "card"
    };
  }

  function normalizeMonthIncomes(list) {
    if (!Array.isArray(list)) return [];
    return list
      .map(function (row) {
        var sourceId = String((row && row.sourceId) || "").trim().slice(0, 40);
        var name = String((row && row.name) || "").trim().slice(0, 80);
        var amount = roundMoney(row && row.amount);
        if (!sourceId || !name || !(amount >= 0)) return null;
        return {
          sourceId: sourceId,
          name: name,
          amount: amount,
          active: Boolean(row && row.active !== false)
        };
      })
      .filter(Boolean)
      .slice(0, MAX_INCOMES);
  }

  function normalizeExpenses(list, goalIds, debtIds) {
    if (!Array.isArray(list)) return [];
    return list
      .map(function (row) {
        var id = String((row && row.id) || "").trim().slice(0, 40);
        var name = String((row && row.name) || "").trim().slice(0, 80);
        var amount = roundMoney(row && row.amount);
        var goalId = String((row && row.goalId) || "").trim();
        if (!id || !name || !(amount > 0)) return null;
        var debtId = String((row && row.debtId) || "").trim();
        if (goalId && !goalIds[goalId]) goalId = "";
        if (debtId && !debtIds[debtId]) debtId = "";
        var createdAt = String((row && row.createdAt) || nowIso());
        return {
          id: id,
          name: name,
          amount: amount,
          active: Boolean(row && row.active !== false),
          goalId: debtId ? null : goalId || null,
          debtId: debtId || null,
          method: row && row.method === "card" && !debtId ? "card" : "cash",
          date: isoDate(row && row.date) || isoDate(createdAt) || todayIso(),
          createdAt: createdAt
        };
      })
      .filter(Boolean)
      .slice(0, MAX_EXPENSES);
  }

  function normalizeBudget(input, uid, existing) {
    var goals = normalizeGoals(input && input.goals);
    var goalIds = {};
    goals.forEach(function (goal) {
      goalIds[goal.id] = true;
    });
    var debts = normalizeDebts(input && input.debts);
    var debtIds = {};
    debts.forEach(function (debt) {
      debtIds[debt.id] = true;
    });

    var monthsIn = (input && input.months) || {};
    var months = {};
    Object.keys(monthsIn).forEach(function (ym) {
      if (!parseMonthKey(ym)) return;
      var month = monthsIn[ym] || {};
      months[ym] = {
        incomes: normalizeMonthIncomes(month.incomes),
        expenses: normalizeExpenses(month.expenses, goalIds, debtIds)
      };
    });

    return {
      ownerUid: existing && existing.ownerUid ? existing.ownerUid : uid,
      incomes: normalizeIncomes(input && input.incomes),
      goals: goals,
      debts: debts,
      plan: normalizePlan(input && input.plan),
      months: months,
      createdAt: existing && existing.createdAt ? existing.createdAt : nowIso(),
      updatedAt: nowIso()
    };
  }

  function snapshotIncomes(incomes, ym) {
    return normalizeIncomes(incomes)
      .filter(function (row) {
        return row.schedule !== "once" || row.date.slice(0, 7) === ym;
      })
      .map(function (row) {
        return {
          sourceId: row.id,
          name: row.name,
          amount: row.amount,
          active: row.active
        };
      });
  }

  function ensureMonth(budget, ym) {
    var key = ym || monthKey();
    if (!budget.months) budget.months = {};
    if (!budget.months[key]) {
      budget.months[key] = {
        incomes: snapshotIncomes(budget.incomes, key),
        expenses: []
      };
      return true;
    }
    return false;
  }

  function monthTotals(month) {
    var incomes = ((month && month.incomes) || []).filter(function (row) {
      return row.active;
    });
    var expenses = ((month && month.expenses) || []).filter(function (row) {
      return row.active;
    });
    var incomeTotal = incomes.reduce(function (sum, row) {
      return sum + Number(row.amount || 0);
    }, 0);
    var expenseTotal = expenses.reduce(function (sum, row) {
      return sum + Number(row.amount || 0);
    }, 0);
    return {
      income: roundMoney(incomeTotal),
      expense: roundMoney(expenseTotal),
      remaining: roundMoney(incomeTotal - expenseTotal)
    };
  }

  function dailyLimit(month, ym) {
    var days = remainingDays(ym);
    if (days <= 0) return 0;
    var remaining = monthTotals(month).remaining;
    if (remaining <= 0) return 0;
    return roundMoney(remaining / days);
  }

  function goalSaved(budget, goalId) {
    var months = (budget && budget.months) || {};
    var total = 0;
    Object.keys(months).forEach(function (ym) {
      ((months[ym] && months[ym].expenses) || []).forEach(function (expense) {
        if (expense.active && expense.goalId === goalId) {
          total += Number(expense.amount || 0);
        }
      });
    });
    return roundMoney(total);
  }

  function planInput(budget, today) {
    var expenses = [];
    var months = (budget && budget.months) || {};
    Object.keys(months).forEach(function (ym) {
      ((months[ym] && months[ym].expenses) || []).forEach(function (row) {
        expenses.push(row);
      });
    });
    var plan = normalizePlan(budget && budget.plan);
    return {
      today: today || todayIso(),
      startDate: plan.startDate,
      startCash: plan.startCash,
      spendMethod: plan.spendMethod,
      incomes: (budget && budget.incomes) || [],
      debts: (budget && budget.debts) || [],
      goals: (budget && budget.goals) || [],
      expenses: expenses
    };
  }

  function buildPlan(budget, today) {
    return window.BudgetPlan.buildPlan(planInput(budget, today));
  }

  function formatDate(iso) {
    var text = isoDate(iso);
    if (!text) return "";
    var parts = text.split("-");
    return Number(parts[2]) + " " + MONTH_NAMES[Number(parts[1]) - 1] + " " + parts[0];
  }

  function debtName(budget, debtId) {
    var debt = ((budget && budget.debts) || []).find(function (row) {
      return row.id === debtId;
    });
    return debt ? debt.name : "";
  }

  function goalContributions(budget, goalId) {
    var months = (budget && budget.months) || {};
    var rows = [];
    Object.keys(months)
      .sort()
      .reverse()
      .forEach(function (ym) {
        ((months[ym] && months[ym].expenses) || []).forEach(function (expense) {
          if (expense.goalId === goalId) {
            rows.push({
              ym: ym,
              label: formatMonthLabel(ym),
              name: expense.name,
              amount: expense.amount,
              active: expense.active
            });
          }
        });
      });
    return rows;
  }

  function goalName(budget, goalId) {
    var goal = ((budget && budget.goals) || []).find(function (row) {
      return row.id === goalId;
    });
    return goal ? goal.name : "";
  }

  function pastMonthKeys(budget, currentYm) {
    return Object.keys((budget && budget.months) || {})
      .filter(function (ym) {
        return ym !== currentYm;
      })
      .sort()
      .reverse();
  }

  async function waitForAuth() {
    var deadline = Date.now() + 10000;
    while (!window.CollectiveBucketAuth) {
      if (Date.now() > deadline) {
        throw new Error("Oturum servisi yüklenemedi.");
      }
      await new Promise(function (resolve) {
        setTimeout(resolve, 50);
      });
    }
    return window.CollectiveBucketAuth;
  }

  async function requireSession() {
    var client = await waitForAuth();
    var session = await client.getSession({ forceRefresh: true });
    if (!session || !session.idToken) {
      throw new Error("Kaydetmek için giriş yap.");
    }
    return session;
  }

  async function getOptionalSession() {
    try {
      var client = await waitForAuth();
      var current = client.getCurrentSession && client.getCurrentSession();
      if (current && current.idToken) return current;
      return await client.getSession({ forceRefresh: false });
    } catch {
      return null;
    }
  }

  function loginUrl() {
    return (
      window.BudgetConfig.authOrigin +
      "/?returnTo=" +
      encodeURIComponent(window.location.href)
    );
  }

  async function getBudget(session) {
    var doc = await window.BudgetFirestore.getDocument(
      "budgets",
      session.uid,
      session.idToken
    );
    if (!doc) return emptyBudget(session.uid);
    var normalized = normalizeBudget(doc, session.uid, doc);
    normalized.id = doc.id;
    return normalized;
  }

  async function saveBudget(budget, session) {
    if (!session || !session.uid) throw new Error("Kaydetmek için giriş yap.");
    var payload = normalizeBudget(budget, session.uid, budget);
    payload.ownerUid = session.uid;
    var existing = await window.BudgetFirestore.getDocument(
      "budgets",
      session.uid,
      session.idToken
    );
    var saved;
    if (existing) {
      saved = await window.BudgetFirestore.updateDocument(
        "budgets",
        session.uid,
        payload,
        session.idToken
      );
    } else {
      saved = await window.BudgetFirestore.createDocument(
        "budgets",
        session.uid,
        payload,
        session.idToken
      );
    }
    var normalized = normalizeBudget(saved, session.uid, saved);
    normalized.id = saved && saved.id ? saved.id : session.uid;
    return normalized;
  }

  async function loadReadyBudget(session) {
    var budget = await getBudget(session);
    var created = ensureMonth(budget, monthKey());
    if (created || !budget.id) {
      budget = await saveBudget(budget, session);
    }
    return budget;
  }

  window.BudgetStore = {
    MAX_INCOMES: MAX_INCOMES,
    MAX_GOALS: MAX_GOALS,
    MAX_EXPENSES: MAX_EXPENSES,
    MAX_DEBTS: MAX_DEBTS,
    todayIso: todayIso,
    formatDate: formatDate,
    debtName: debtName,
    planInput: planInput,
    buildPlan: buildPlan,
    createId: createId,
    clone: clone,
    escapeHtml: escapeHtml,
    formatMoney: formatMoney,
    monthKey: monthKey,
    formatMonthLabel: formatMonthLabel,
    remainingDays: remainingDays,
    ensureMonth: ensureMonth,
    monthTotals: monthTotals,
    dailyLimit: dailyLimit,
    goalSaved: goalSaved,
    goalContributions: goalContributions,
    goalName: goalName,
    pastMonthKeys: pastMonthKeys,
    waitForAuth: waitForAuth,
    requireSession: requireSession,
    getOptionalSession: getOptionalSession,
    loginUrl: loginUrl,
    getBudget: getBudget,
    saveBudget: saveBudget,
    loadReadyBudget: loadReadyBudget
  };
})();
