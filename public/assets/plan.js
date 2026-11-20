(function (root) {
  "use strict";

  var DAY = 86400000;
  var EPS = 0.5;

  function toDay(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
    if (!m) return null;
    return Math.round(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / DAY);
  }

  function toIso(day) {
    return new Date(day * DAY).toISOString().slice(0, 10);
  }

  function parts(day) {
    var d = new Date(day * DAY);
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
  }

  function lastDayOfMonth(year, month) {
    return new Date(Date.UTC(year, month, 0)).getUTCDate();
  }

  function isMonthDay(day, wanted) {
    var p = parts(day);
    return p.day === Math.min(Math.max(1, wanted), lastDayOfMonth(p.year, p.month));
  }

  function nextMonthDay(after, wanted) {
    var d = after + 1;
    while (!isMonthDay(d, wanted)) d += 1;
    return d;
  }

  function ymOf(day) {
    return toIso(day).slice(0, 7);
  }

  function round(value) {
    return Math.round(value * 100) / 100;
  }

  function horizonOf(input, today) {
    var last = null;
    (input.goals || []).forEach(function (goal) {
      var day = toDay(goal.deadline);
      if (day !== null && day > today && (last === null || day > last)) last = day;
    });
    if (last !== null) return last;
    var p = parts(today);
    return Math.round(Date.UTC(p.year, p.month + 5, 1) / DAY);
  }

  function simulate(input, daily, collect) {
    var today = toDay(input.today);
    var start = toDay(input.startDate);
    if (start === null || start > today) start = today;
    var horizon = horizonOf(input, today);
    var cash = Number(input.startCash) || 0;
    var saved = 0;
    var bridge = 0;
    var bridges = [];
    var statements = [];
    var warnings = [];
    var months = {};
    var paidOff = {};
    var checks = [];
    var negative = null;

    var goalSaved = {};
    var debts = (input.debts || []).map(function (row) {
      return {
        src: row,
        kind: row.kind,
        balance: row.kind === "card" ? 0 : Number(row.balance) || 0,
        billed: 0,
        unbilled: row.kind === "card" ? Number(row.balance) || 0 : 0,
        asOf: toDay(row.asOf) === null ? start : toDay(row.asOf),
        due:
          row.kind === "loan" && toDay(row.dueDate) !== null && toDay(row.asOf) !== null
            ? Math.max(toDay(row.dueDate), toDay(row.asOf))
            : toDay(row.dueDate),
        statement: null
      };
    });
    var cards = debts.filter(function (d) {
      return d.kind === "card";
    });
    var spendCard =
      input.spendMethod !== "cash"
        ? cards.find(function (d) {
            return d.src.id === input.cardId;
          }) || cards[0]
        : null;

    var byDay = {};
    (input.expenses || []).forEach(function (row) {
      var day = toDay(row.date);
      if (day === null || row.active === false) return;
      if (day < start) {
        if (row.goalId && !row.debtId) {
          saved += Number(row.amount) || 0;
          goalSaved[row.goalId] = (goalSaved[row.goalId] || 0) + (Number(row.amount) || 0);
        }
        return;
      }
      (byDay[day] = byDay[day] || []).push(row);
    });

    function month(day) {
      var key = ymOf(day);
      if (!months[key]) {
        months[key] = { ym: key, income: 0, spend: 0, interest: 0, debtPayments: 0, setAside: 0 };
      }
      return months[key];
    }

    function debtById(id) {
      return debts.find(function (d) {
        return d.src.id === id;
      });
    }

    function owedTotal() {
      return debts.reduce(function (sum, d) {
        return sum + d.billed + d.unbilled + Math.max(0, d.balance);
      }, 0) + bridge;
    }

    function markPaid(d, day) {
      if (!paidOff[d.src.id] && d.billed + d.unbilled + d.balance <= EPS) paidOff[d.src.id] = toIso(day);
    }

    function pay(d, amount, day) {
      var left = amount;
      if (d.kind === "card") {
        var a = Math.min(left, d.billed);
        d.billed -= a;
        left -= a;
        if (d.statement) d.statement.paid += a;
        var b = Math.min(left, d.unbilled);
        d.unbilled -= b;
        left -= b;
      } else {
        var c = Math.min(left, d.balance);
        d.balance -= c;
        left -= c;
        if (d.kind === "once") month(day).debtPayments += c;
      }
      markPaid(d, day);
      return amount - left;
    }

    function ensureCash(need, day, reason) {
      if (cash + EPS >= need) return;
      var amount = round(need - cash);
      bridge += amount;
      cash += amount;
      bridges.push({ date: toIso(day), amount: amount, reason: reason, repaidOn: null, left: amount });
    }

    function repayBridges(day) {
      bridges.forEach(function (b) {
        if (b.left <= EPS || cash <= EPS) return;
        var p = Math.min(cash, b.left);
        b.left -= p;
        bridge -= p;
        cash -= p;
        if (b.left <= EPS) b.repaidOn = toIso(day);
      });
    }

    function spend(amount, day, method) {
      if (amount <= 0) return;
      month(day).spend += amount;
      var card = method === "card" ? spendCard || cards[0] : null;
      if (method === "card" && card) card.unbilled += amount;
      else cash -= amount;
    }

    function cardReserve() {
      return cards.reduce(function (sum, d) {
        return sum + d.billed + d.unbilled;
      }, 0);
    }

    function goalsDue(day) {
      var need = 0;
      (input.goals || []).forEach(function (goal) {
        var deadline = toDay(goal.deadline);
        if (deadline !== null && deadline <= day) need += Number(goal.targetAmount) || 0;
        else need += goalSaved[goal.id] || 0;
      });
      return need;
    }

    for (var day = start; day < horizon; day += 1) {
      var future = day >= today;

      (input.incomes || []).forEach(function (row) {
        if (row.active === false) return;
        if (input.skipIncomes && input.skipIncomes[row.id + "|" + ymOf(day)]) return;
        var hit =
          row.schedule === "once"
            ? toDay(row.date) === day
            : isMonthDay(day, Number(row.day) || 1);
        if (!hit) return;
        cash += Number(row.amount) || 0;
        month(day).income += Number(row.amount) || 0;
      });
      debts.forEach(function (d) {
        if (d.kind === "loan" && d.asOf === day && d.asOf > start) cash += d.src.balance || 0;
      });
      if (bridge > EPS) repayBridges(day);

      var spentToday = 0;
      (byDay[day] || []).forEach(function (row) {
        var amount = Number(row.amount) || 0;
        var target = row.debtId ? debtById(row.debtId) : null;
        if (target) {
          cash -= amount;
          if (day >= target.asOf) pay(target, amount, day);
        } else if (row.goalId) {
          cash -= amount;
          saved += amount;
          goalSaved[row.goalId] = (goalSaved[row.goalId] || 0) + amount;
        } else {
          spentToday += amount;
          var card = row.method === "card" ? spendCard || cards[0] : null;
          if (card && day < card.asOf) return;
          spend(amount, day, row.method);
        }
      });
      if (future) spend(Math.max(0, (day === today ? daily - spentToday : daily)), day, spendCard ? "card" : "cash");

      cards.forEach(function (d) {
        var s = d.statement;
        if (!s || toDay(s.dueDate) !== day) return;
        if (future) {
          var minLeft = Math.max(0, s.minimum - s.paid);
          ensureCash(minLeft, day, d.src.name + " asgari ödeme");
          var amount = Math.min(Math.max(cash, 0), d.billed);
          cash -= pay(d, amount, day);
        } else if (s.paid + EPS < s.minimum) {
          warnings.push(toIso(day) + ": " + d.src.name + " asgari ödemesi eksik (" + round(s.minimum - s.paid) + ")");
        }
        s.left = round(d.billed);
        d.statement = null;
      });

      cards.forEach(function (d) {
        if (!isMonthDay(day, Number(d.src.statementDay) || 1)) return;
        var interest = 0;
        if (d.billed > EPS) {
          interest = d.billed * (Number(d.src.monthlyRate) || 0) * (1 + (Number(d.src.taxRate) || 0));
          d.billed += interest;
          month(day).interest += interest;
        }
        d.billed += d.unbilled;
        d.unbilled = 0;
        if (d.billed <= EPS) {
          d.statement = null;
          return;
        }
        d.statement = {
          debtId: d.src.id,
          date: toIso(day),
          amount: round(d.billed),
          interest: round(interest),
          minimum: round(d.billed * (Number(d.src.minRate) || 0)),
          dueDate: toIso(nextMonthDay(day, Number(d.src.dueDay) || 1)),
          paid: 0,
          left: 0
        };
        statements.push(d.statement);
      });

      if (future) {
        debts
          .filter(function (d) {
            return d.kind !== "card" && d.balance > EPS && d.due === day;
          })
          .forEach(function (d) {
            ensureCash(d.balance, day, d.src.name);
            cash -= pay(d, d.balance, day);
          });

        var revolving = cards.some(function (d) {
          return d.billed > EPS;
        });
        if (!revolving && bridge <= EPS) {
          debts
            .filter(function (d) {
              return d.kind !== "card" && d.balance > EPS && d.asOf <= day;
            })
            .sort(function (a, b) {
              return (a.src.priority === "high" ? 0 : 1) - (b.src.priority === "high" ? 0 : 1);
            })
            .forEach(function (d) {
              var free = cash - cardReserve();
              if (free <= EPS) return;
              cash -= pay(d, Math.min(free, d.balance), day);
            });
        }
        if (cash < -EPS && negative === null) negative = { date: toIso(day), amount: round(-cash) };
      }

      var next = day + 1;
      (input.goals || []).forEach(function (goal) {
        if (toDay(goal.deadline) === next && next > today) {
          checks.push({ goalId: goal.id, date: toIso(next), free: round(cash + saved - owedTotal() - goalsDue(next) + (Number(goal.targetAmount) || 0)), need: Number(goal.targetAmount) || 0, gap: round(goalsDue(next) - (cash + saved - owedTotal())) });
        }
      });
    }

    cards.forEach(function (d) {
      if (d.statement) d.statement.left = round(d.billed);
    });

    var endNet = cash + saved - owedTotal();
    var ok = negative === null && checks.every(function (c) {
      return c.gap <= 1;
    });
    if (!checks.length && endNet - goalsDue(horizon) < -1) ok = false;

    var result = { ok: ok, negative: negative, checks: checks };
    if (!collect) return result;

    Object.keys(months).forEach(function (key) {
      var m = months[key];
      m.setAside = m.income - m.spend - m.interest - m.debtPayments;
      Object.keys(m).forEach(function (k) {
        if (typeof m[k] === "number") m[k] = round(m[k]);
      });
    });
    result.bridges = bridges.map(function (b) {
      return { date: b.date, amount: b.amount, reason: b.reason, repaidOn: b.repaidOn };
    });
    result.statements = statements;
    result.months = Object.keys(months).sort().map(function (k) {
      return months[k];
    });
    result.paidOff = paidOff;
    result.warnings = warnings;
    result.interest = round(result.months.reduce(function (s, m) {
      return s + m.interest;
    }, 0));
    result.end = {
      date: toIso(horizon),
      cash: round(cash + saved),
      owed: round(owedTotal()),
      free: round(endNet)
    };
    return result;
  }

  function buildPlan(input) {
    var lo = 0;
    var hi = 1;
    if (!simulate(input, 0).ok) {
      var none = simulate(input, 0, true);
      none.daily = 0;
      none.feasible = false;
      return none;
    }
    while (hi < 1e7 && simulate(input, hi).ok) hi *= 2;
    for (var i = 0; i < 40 && hi - lo > 0.5; i += 1) {
      var mid = (lo + hi) / 2;
      if (simulate(input, mid).ok) lo = mid;
      else hi = mid;
    }
    var daily = Math.floor(lo);
    var result = simulate(input, daily, true);
    result.daily = daily;
    result.feasible = true;
    return result;
  }

  var api = { buildPlan: buildPlan, simulate: simulate, toDay: toDay, toIso: toIso };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.BudgetPlan = api;
})(typeof window !== "undefined" ? window : this);
