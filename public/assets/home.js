(function () {
  "use strict";

  var loginPrompt = document.querySelector("#login-prompt");
  var loginLink = document.querySelector("#login-link");
  var navLinks = document.querySelector(".nav-links");
  var appContent = document.querySelector("#app-content");
  var homeActions = document.querySelector("#home-actions");
  var pageMessage = document.querySelector("#page-message");
  var monthHeading = document.querySelector("#month-heading");
  var monthLink = document.querySelector("#month-link");
  var statExpense = document.querySelector("#stat-expense");
  var statRemaining = document.querySelector("#stat-remaining");
  var statDaily = document.querySelector("#stat-daily");
  var goalList = document.querySelector("#goal-list");
  var pastMonths = document.querySelector("#past-months");
  var addExpense = document.querySelector("#add-expense");
  var expenseDialog = document.querySelector("#expense-dialog");
  var expenseForm = document.querySelector("#expense-form");
  var expenseName = document.querySelector("#expense-name");
  var expenseAmount = document.querySelector("#expense-amount");
  var expenseGoal = document.querySelector("#expense-goal");
  var expenseMessage = document.querySelector("#expense-message");

  var session = null;
  var budget = null;
  var appliedUid = undefined;
  var saving = false;
  var currentYm = window.BudgetStore.monthKey();

  function showLoggedOut() {
    session = null;
    budget = null;
    loginPrompt.hidden = false;
    loginLink.href = window.BudgetStore.loginUrl();
    appContent.hidden = true;
    homeActions.hidden = true;
    navLinks.hidden = true;
    window.BudgetUI.showMessage(pageMessage, "");
  }

  function fillGoalOptions() {
    var goals = (budget && budget.goals) || [];
    expenseGoal.innerHTML =
      '<option value="">Yok</option>' +
      goals
        .map(function (goal) {
          return (
            '<option value="' +
            window.BudgetStore.escapeHtml(goal.id) +
            '">' +
            window.BudgetStore.escapeHtml(goal.name) +
            "</option>"
          );
        })
        .join("");
  }

  function render() {
    var month = budget.months[currentYm] || { incomes: [], expenses: [] };
    var totals = window.BudgetStore.monthTotals(month);
    monthHeading.textContent = window.BudgetStore.formatMonthLabel(currentYm);
    monthLink.href = "/month?ym=" + encodeURIComponent(currentYm);
    statExpense.textContent = window.BudgetStore.formatMoney(totals.expense);
    statRemaining.textContent = window.BudgetStore.formatMoney(totals.remaining);
    statDaily.textContent = window.BudgetStore.formatMoney(
      window.BudgetStore.dailyLimit(month, currentYm)
    );

    var pinned = (budget.goals || []).filter(function (goal) {
      return goal.pinned;
    });
    if (!pinned.length) {
      goalList.innerHTML =
        '<p class="empty">Anasayfada gösterilecek hedef yok. Hedefler sayfasından sabitle.</p>';
    } else {
      goalList.innerHTML = pinned
        .map(function (goal) {
          var saved = window.BudgetStore.goalSaved(budget, goal.id);
          var left = Math.max(0, goal.targetAmount - saved);
          var pct = Math.min(100, Math.round((saved / goal.targetAmount) * 100));
          return (
            '<a class="goal-card" href="/goals">' +
            "<h3>" +
            window.BudgetStore.escapeHtml(goal.name) +
            "</h3>" +
            '<div class="progress" aria-hidden="true"><span style="width:' +
            pct +
            '%"></span></div>' +
            "<p>" +
            window.BudgetStore.formatMoney(saved) +
            " / " +
            window.BudgetStore.formatMoney(goal.targetAmount) +
            " · " +
            window.BudgetStore.formatMoney(left) +
            " kaldı</p></a>"
          );
        })
        .join("");
    }

    var past = window.BudgetStore.pastMonthKeys(budget, currentYm);
    if (!past.length) {
      pastMonths.innerHTML = '<p class="empty">Henüz geçmiş ay yok.</p>';
    } else {
      pastMonths.innerHTML = past
        .map(function (ym) {
          var totalsPast = window.BudgetStore.monthTotals(budget.months[ym]);
          return (
            '<a class="month-card" href="/month?ym=' +
            encodeURIComponent(ym) +
            '"><h3>' +
            window.BudgetStore.escapeHtml(window.BudgetStore.formatMonthLabel(ym)) +
            "</h3><p>Harcama " +
            window.BudgetStore.formatMoney(totalsPast.expense) +
            " · Kalan " +
            window.BudgetStore.formatMoney(totalsPast.remaining) +
            "</p></a>"
          );
        })
        .join("");
    }
  }

  async function boot(preferred) {
    var next = preferred && preferred.idToken ? preferred : null;
    if (!next) next = await window.BudgetStore.getOptionalSession();
    var uid = window.BudgetUI.sessionUid(next);
    if (uid === appliedUid && appContent && !appContent.hidden) return;
    appliedUid = uid;
    if (!uid) {
      showLoggedOut();
      return;
    }
    session = next;
    try {
      budget = await window.BudgetStore.loadReadyBudget(session);
      loginPrompt.hidden = true;
      appContent.hidden = false;
      homeActions.hidden = false;
      navLinks.hidden = false;
      render();
    } catch (error) {
      showLoggedOut();
      window.BudgetUI.showMessage(pageMessage, error.message, "error");
    }
  }

  addExpense.addEventListener("click", function () {
    fillGoalOptions();
    expenseForm.reset();
    window.BudgetUI.showMessage(expenseMessage, "");
    window.BudgetUI.openDialog(expenseDialog);
    expenseName.focus();
  });

  expenseForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    if (saving) return;
    saving = true;
    try {
      session = await window.BudgetStore.requireSession();
      var draft = window.BudgetStore.clone(budget);
      window.BudgetStore.ensureMonth(draft, currentYm);
      var expenses = draft.months[currentYm].expenses || [];
      if (expenses.length >= window.BudgetStore.MAX_EXPENSES) {
        throw new Error(
          "En fazla " + window.BudgetStore.MAX_EXPENSES + " harcama eklenebilir."
        );
      }
      expenses.push({
        id: window.BudgetStore.createId(),
        name: expenseName.value.trim(),
        amount: Number(expenseAmount.value),
        active: true,
        goalId: expenseGoal.value || null,
        createdAt: new Date().toISOString()
      });
      draft.months[currentYm].expenses = expenses;
      budget = await window.BudgetStore.saveBudget(draft, session);
      window.BudgetUI.closeDialog(expenseDialog);
      window.BudgetUI.showMessage(pageMessage, "Harcama eklendi.", "success");
      render();
    } catch (error) {
      window.BudgetUI.showMessage(expenseMessage, error.message, "error");
    } finally {
      saving = false;
    }
  });

  expenseDialog.addEventListener("close", function () {
    expenseForm.reset();
    window.BudgetUI.showMessage(expenseMessage, "");
  });

  window.BudgetUI.bindDialog(expenseDialog);

  window.addEventListener("cb-auth-changed", function (event) {
    boot(event.detail && event.detail.session);
  });

  boot();
})();
