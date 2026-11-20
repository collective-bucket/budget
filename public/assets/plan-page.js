(function () {
  "use strict";

  var loginPrompt = document.querySelector("#login-prompt");
  var loginLink = document.querySelector("#login-link");
  var appContent = document.querySelector("#app-content");
  var pageMessage = document.querySelector("#page-message");
  var statDaily = document.querySelector("#stat-daily");
  var statInterest = document.querySelector("#stat-interest");
  var statFree = document.querySelector("#stat-free");
  var statFreeLabel = document.querySelector("#stat-free-label");
  var planAlerts = document.querySelector("#plan-alerts");
  var settingsForm = document.querySelector("#settings-form");
  var startDate = document.querySelector("#plan-start-date");
  var startCash = document.querySelector("#plan-start-cash");
  var spendMethod = document.querySelector("#plan-spend-method");
  var settingsSubmit = document.querySelector("#settings-submit");
  var statementTable = document.querySelector("#statement-table");
  var monthTable = document.querySelector("#month-table");

  var store = window.BudgetStore;
  var session = null;
  var budget = null;
  var appliedUid = undefined;
  var saving = false;

  function money(value) {
    return store.formatMoney(value);
  }

  function date(value) {
    return store.escapeHtml(store.formatDate(value));
  }

  function showLoggedOut() {
    session = null;
    budget = null;
    loginPrompt.hidden = false;
    loginLink.href = store.loginUrl();
    appContent.hidden = true;
  }

  function alertItem(text, type) {
    return (
      '<li class="list-item"><div class="list-main"><div class="title' +
      (type ? " text-" + type : "") +
      '">' +
      text +
      "</div></div></li>"
    );
  }

  function render() {
    var plan = store.buildPlan(budget);
    statDaily.textContent = money(plan.daily);
    statInterest.textContent = money(plan.interest);
    statFreeLabel.textContent = "Serbest · " + store.formatDate(plan.end.date);
    statFree.textContent = money(plan.end.free);

    var alerts = [];
    if (!plan.feasible) {
      (plan.checks || []).forEach(function (check) {
        if (check.gap > 1) {
          alerts.push(
            alertItem(
              store.escapeHtml(store.goalName(budget, check.goalId)) +
                ": " +
                date(check.date) +
                " tarihinde " +
                money(check.gap) +
                " eksik.",
              "danger"
            )
          );
        }
      });
      if (plan.negative) {
        alerts.push(
          alertItem(date(plan.negative.date) + " tarihinde kasa " + money(plan.negative.amount) + " eksiye düşüyor.", "danger")
        );
      }
      if (!alerts.length) alerts.push(alertItem("Plan tutmuyor: borçlar hedef tarihine kadar kapanmıyor.", "danger"));
    }
    plan.bridges.forEach(function (b) {
      alerts.push(
        alertItem(
          "Köprü borç: " +
            date(b.date) +
            " · " +
            money(b.amount) +
            " (" +
            store.escapeHtml(b.reason) +
            ")" +
            (b.repaidOn ? " · geri ödeme " + date(b.repaidOn) : " · geri ödenemiyor"),
          "warning"
        )
      );
    });
    plan.warnings.forEach(function (text) {
      alerts.push(alertItem(store.escapeHtml(text), "danger"));
    });
    Object.keys(plan.paidOff).forEach(function (id) {
      alerts.push(alertItem(store.escapeHtml(store.debtName(budget, id)) + " kapanıyor: " + date(plan.paidOff[id])));
    });
    planAlerts.innerHTML = alerts.join("");

    statementTable.innerHTML = plan.statements.length
      ? "<thead><tr><th>Kesim</th><th>Ekstre</th><th>Asgari</th><th>Son ödeme</th><th>Ödeme</th><th>Kalan</th></tr></thead><tbody>" +
        plan.statements
          .map(function (s) {
            return (
              "<tr><td>" + date(s.date) + "</td><td>" + money(s.amount) +
              (s.interest ? '<small> faiz ' + money(s.interest) + "</small>" : "") +
              "</td><td>" + money(s.minimum) + "</td><td>" + date(s.dueDate) +
              "</td><td>" + money(s.paid) + "</td><td>" + money(s.left) + "</td></tr>"
            );
          })
          .join("") +
        "</tbody>"
      : '<tbody><tr><td class="empty">Kredi kartı yok.</td></tr></tbody>';

    monthTable.innerHTML =
      "<thead><tr><th>Ay</th><th>Gelir</th><th>Harcama</th><th>Faiz</th><th>Borç ödemesi</th><th>Kenara</th></tr></thead><tbody>" +
      plan.months
        .map(function (m) {
          return (
            "<tr><td>" + store.escapeHtml(store.formatMonthLabel(m.ym)) + "</td><td>" + money(m.income) +
            "</td><td>" + money(m.spend) + "</td><td>" + money(m.interest) + "</td><td>" +
            money(m.debtPayments) + "</td><td>" + money(m.setAside) + "</td></tr>"
          );
        })
        .join("") +
      "</tbody>";
  }

  function fillSettings() {
    var plan = budget.plan || {};
    startDate.value = plan.startDate || store.todayIso();
    startCash.value = plan.startCash || 0;
    spendMethod.value = plan.spendMethod || "card";
  }

  async function boot(preferred) {
    var next = preferred && preferred.idToken ? preferred : null;
    if (!next) next = await store.getOptionalSession();
    var uid = window.BudgetUI.sessionUid(next);
    if (uid === appliedUid && appContent && !appContent.hidden) return;
    appliedUid = uid;
    if (!uid) {
      showLoggedOut();
      return;
    }
    session = next;
    try {
      budget = await store.loadReadyBudget(session);
      loginPrompt.hidden = true;
      appContent.hidden = false;
      fillSettings();
      render();
    } catch (error) {
      showLoggedOut();
      window.BudgetUI.showMessage(pageMessage, error.message, "error");
    }
  }

  settingsForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    if (saving) return;
    saving = true;
    settingsSubmit.disabled = true;
    try {
      var draft = store.clone(budget);
      draft.plan = {
        startDate: startDate.value,
        startCash: Number(startCash.value),
        spendMethod: spendMethod.value
      };
      session = await store.requireSession();
      budget = await store.saveBudget(draft, session);
      fillSettings();
      render();
      window.BudgetUI.showMessage(pageMessage, "Plan güncellendi.", "success");
    } catch (error) {
      window.BudgetUI.showMessage(pageMessage, error.message, "error");
    } finally {
      saving = false;
      settingsSubmit.disabled = false;
    }
  });

  window.addEventListener("cb-auth-changed", function (event) {
    boot(event.detail && event.detail.session);
  });

  boot();
})();
