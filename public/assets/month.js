(function () {
  "use strict";

  var loginPrompt = document.querySelector("#login-prompt");
  var loginLink = document.querySelector("#login-link");
  var appContent = document.querySelector("#app-content");
  var monthActions = document.querySelector("#month-actions");
  var pageMessage = document.querySelector("#page-message");
  var monthTitle = document.querySelector("#month-title");
  var statIncome = document.querySelector("#stat-income");
  var statExpense = document.querySelector("#stat-expense");
  var statRemaining = document.querySelector("#stat-remaining");
  var dailyWrap = document.querySelector("#daily-wrap");
  var incomeList = document.querySelector("#income-list");
  var expenseList = document.querySelector("#expense-list");
  var addExpense = document.querySelector("#add-expense");
  var expenseDialog = document.querySelector("#expense-dialog");
  var expenseForm = document.querySelector("#expense-form");
  var expenseDialogTitle = document.querySelector("#expense-dialog-title");
  var expenseName = document.querySelector("#expense-name");
  var expenseAmount = document.querySelector("#expense-amount");
  var expenseGoal = document.querySelector("#expense-goal");
  var expenseMessage = document.querySelector("#expense-message");
  var expenseDelete = document.querySelector("#expense-delete");
  var expenseSubmit = document.querySelector("#expense-submit");
  var confirmDialog = document.querySelector("#confirm-dialog");
  var confirmTitle = document.querySelector("#confirm-title");
  var confirmText = document.querySelector("#confirm-text");
  var confirmDelete = document.querySelector("#confirm-delete");

  var params = new URLSearchParams(window.location.search);
  var ym = params.get("ym") || window.BudgetStore.monthKey();
  var currentYm = window.BudgetStore.monthKey();
  var session = null;
  var budget = null;
  var appliedUid = undefined;
  var editingId = null;
  var pendingDelete = null;
  var saving = false;
  var deleting = false;

  function showLoggedOut() {
    session = null;
    budget = null;
    loginPrompt.hidden = false;
    loginLink.href = window.BudgetStore.loginUrl();
    appContent.hidden = true;
    monthActions.hidden = true;
  }

  function fillGoalOptions(selected) {
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
    expenseGoal.value = selected || "";
  }

  function currentMonth() {
    window.BudgetStore.ensureMonth(budget, ym);
    return budget.months[ym];
  }

  function render() {
    var month = currentMonth();
    var totals = window.BudgetStore.monthTotals(month);
    document.title = window.BudgetStore.formatMonthLabel(ym) + " | Bütçe";
    monthTitle.textContent = window.BudgetStore.formatMonthLabel(ym);
    statIncome.textContent = window.BudgetStore.formatMoney(totals.income);
    statExpense.textContent = window.BudgetStore.formatMoney(totals.expense);
    statRemaining.textContent = window.BudgetStore.formatMoney(totals.remaining);
    if (ym === currentYm) {
      dailyWrap.hidden = false;
      dailyWrap.textContent =
        "Günlük limit: " +
        window.BudgetStore.formatMoney(window.BudgetStore.dailyLimit(month, ym));
    } else {
      dailyWrap.hidden = true;
    }

    if (!(month.incomes || []).length) {
      incomeList.innerHTML = '<li class="empty">Bu ay için gelir kopyası yok.</li>';
    } else {
      incomeList.innerHTML = month.incomes
        .map(function (row) {
          return (
            '<li class="list-item' +
            (row.active ? "" : " is-inactive") +
            '"><label class="check-row"><input type="checkbox" data-toggle-income="' +
            window.BudgetStore.escapeHtml(row.sourceId) +
            '"' +
            (row.active ? " checked" : "") +
            ' /><div class="list-main"><div class="title">' +
            window.BudgetStore.escapeHtml(row.name) +
            " · " +
            window.BudgetStore.formatMoney(row.amount) +
            "</div></div></label></li>"
          );
        })
        .join("");
    }

    var expenses = (month.expenses || []).slice().reverse();
    if (!expenses.length) {
      expenseList.innerHTML = '<li class="empty">Henüz harcama yok.</li>';
    } else {
      expenseList.innerHTML = expenses
        .map(function (row) {
          var goal = row.goalId ? window.BudgetStore.goalName(budget, row.goalId) : "";
          return (
            '<li class="list-item' +
            (row.active ? "" : " is-inactive") +
            '">' +
            '<input type="checkbox" data-toggle-expense="' +
            window.BudgetStore.escapeHtml(row.id) +
            '"' +
            (row.active ? " checked" : "") +
            " />" +
            '<div class="list-main is-action" tabindex="0" role="button" data-open-expense="' +
            window.BudgetStore.escapeHtml(row.id) +
            '"><div class="title">' +
            window.BudgetStore.escapeHtml(row.name) +
            " · " +
            window.BudgetStore.formatMoney(row.amount) +
            (goal
              ? '<span class="badge">→ ' +
                window.BudgetStore.escapeHtml(goal) +
                "</span>"
              : "") +
            "</div></div></li>"
          );
        })
        .join("");
    }
  }

  async function persist(draft) {
    session = await window.BudgetStore.requireSession();
    budget = await window.BudgetStore.saveBudget(draft, session);
    render();
  }

  function resetExpenseForm() {
    editingId = null;
    expenseForm.reset();
    expenseDialogTitle.textContent = "Harcama ekle";
    expenseSubmit.textContent = "Harcama ekle";
    expenseDelete.hidden = true;
    window.BudgetUI.showMessage(expenseMessage, "");
    fillGoalOptions("");
  }

  function openExpense(expense) {
    fillGoalOptions(expense ? expense.goalId : "");
    if (expense) {
      editingId = expense.id;
      expenseName.value = expense.name;
      expenseAmount.value = expense.amount;
      expenseDialogTitle.textContent = "Harcamayı düzenle";
      expenseSubmit.textContent = "Kaydet";
      expenseDelete.hidden = false;
    } else {
      resetExpenseForm();
    }
    window.BudgetUI.openDialog(expenseDialog);
    expenseName.focus();
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
      window.BudgetStore.ensureMonth(budget, ym);
      loginPrompt.hidden = true;
      appContent.hidden = false;
      monthActions.hidden = false;
      render();
    } catch (error) {
      showLoggedOut();
      window.BudgetUI.showMessage(pageMessage, error.message, "error");
    }
  }

  addExpense.addEventListener("click", function () {
    openExpense(null);
  });

  expenseForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    if (saving) return;
    saving = true;
    expenseSubmit.disabled = true;
    try {
      var draft = window.BudgetStore.clone(budget);
      window.BudgetStore.ensureMonth(draft, ym);
      var expenses = draft.months[ym].expenses || [];
      var payload = {
        id: editingId || window.BudgetStore.createId(),
        name: expenseName.value.trim(),
        amount: Number(expenseAmount.value),
        active: true,
        goalId: expenseGoal.value || null,
        createdAt: new Date().toISOString()
      };
      if (editingId) {
        var existing = expenses.find(function (row) {
          return row.id === editingId;
        });
        payload.active = existing ? existing.active : true;
        payload.createdAt = existing ? existing.createdAt : payload.createdAt;
        draft.months[ym].expenses = expenses.map(function (row) {
          return row.id === editingId ? payload : row;
        });
      } else {
        if (expenses.length >= window.BudgetStore.MAX_EXPENSES) {
          throw new Error(
            "En fazla " + window.BudgetStore.MAX_EXPENSES + " harcama eklenebilir."
          );
        }
        expenses.push(payload);
        draft.months[ym].expenses = expenses;
      }
      await persist(draft);
      window.BudgetUI.closeDialog(expenseDialog);
      window.BudgetUI.showMessage(
        pageMessage,
        editingId ? "Harcama güncellendi." : "Harcama eklendi.",
        "success"
      );
    } catch (error) {
      window.BudgetUI.showMessage(expenseMessage, error.message, "error");
    } finally {
      saving = false;
      expenseSubmit.disabled = false;
    }
  });

  expenseDelete.addEventListener("click", function () {
    if (!editingId) return;
    var expense = currentMonth().expenses.find(function (row) {
      return row.id === editingId;
    });
    pendingDelete = editingId;
    confirmTitle.textContent = "Harcama silinsin mi?";
    confirmText.innerHTML =
      "<strong>" +
      window.BudgetStore.escapeHtml(expense ? expense.name : "Bu harcama") +
      "</strong> kalıcı olarak silinecek. Bu işlem geri alınamaz.";
    confirmDelete.disabled = false;
    window.BudgetUI.openDialog(confirmDialog);
  });

  confirmDelete.addEventListener("click", async function () {
    if (!pendingDelete || deleting) return;
    deleting = true;
    confirmDelete.disabled = true;
    try {
      var draft = window.BudgetStore.clone(budget);
      window.BudgetStore.ensureMonth(draft, ym);
      draft.months[ym].expenses = (draft.months[ym].expenses || []).filter(
        function (row) {
          return row.id !== pendingDelete;
        }
      );
      await persist(draft);
      pendingDelete = null;
      window.BudgetUI.closeDialog(confirmDialog);
      window.BudgetUI.closeDialog(expenseDialog);
      window.BudgetUI.showMessage(pageMessage, "Harcama silindi.", "success");
    } catch (error) {
      window.BudgetUI.showMessage(pageMessage, error.message, "error");
      confirmDelete.disabled = false;
    } finally {
      deleting = false;
    }
  });

  incomeList.addEventListener("change", async function (event) {
    var input = event.target.closest("[data-toggle-income]");
    if (!input) return;
    var id = input.getAttribute("data-toggle-income");
    var draft = window.BudgetStore.clone(budget);
    window.BudgetStore.ensureMonth(draft, ym);
    draft.months[ym].incomes = (draft.months[ym].incomes || []).map(function (row) {
      if (row.sourceId !== id) return row;
      return Object.assign({}, row, { active: input.checked });
    });
    try {
      await persist(draft);
    } catch (error) {
      window.BudgetUI.showMessage(pageMessage, error.message, "error");
      render();
    }
  });

  expenseList.addEventListener("change", async function (event) {
    var input = event.target.closest("[data-toggle-expense]");
    if (!input) return;
    var id = input.getAttribute("data-toggle-expense");
    var draft = window.BudgetStore.clone(budget);
    window.BudgetStore.ensureMonth(draft, ym);
    draft.months[ym].expenses = (draft.months[ym].expenses || []).map(function (row) {
      if (row.id !== id) return row;
      return Object.assign({}, row, { active: input.checked });
    });
    try {
      await persist(draft);
    } catch (error) {
      window.BudgetUI.showMessage(pageMessage, error.message, "error");
      render();
    }
  });

  function openExpenseById(id) {
    var expense = currentMonth().expenses.find(function (row) {
      return row.id === id;
    });
    if (expense) openExpense(expense);
  }

  expenseList.addEventListener("click", function (event) {
    if (event.target.closest("[data-toggle-expense]")) return;
    var item = event.target.closest("[data-open-expense]");
    if (!item) return;
    openExpenseById(item.getAttribute("data-open-expense"));
  });

  expenseList.addEventListener("keydown", function (event) {
    if (event.key !== "Enter" && event.key !== " ") return;
    var item = event.target.closest("[data-open-expense]");
    if (!item) return;
    event.preventDefault();
    openExpenseById(item.getAttribute("data-open-expense"));
  });

  expenseDialog.addEventListener("close", resetExpenseForm);
  confirmDialog.addEventListener("close", function () {
    pendingDelete = null;
    confirmDelete.disabled = false;
  });

  window.BudgetUI.bindDialog(expenseDialog);
  window.BudgetUI.bindDialog(confirmDialog);

  window.addEventListener("cb-auth-changed", function (event) {
    boot(event.detail && event.detail.session);
  });

  boot();
})();
