(function () {
  "use strict";

  function openDialog(dialog) {
    if (dialog && !dialog.open) dialog.showModal();
  }

  function closeDialog(dialog) {
    if (dialog && dialog.open) dialog.close();
  }

  function bindDialog(dialog) {
    if (!dialog) return;
    dialog.addEventListener("click", function (event) {
      if (event.target === dialog) closeDialog(dialog);
    });
    dialog.querySelectorAll("[data-close-dialog]").forEach(function (button) {
      button.addEventListener("click", function () {
        closeDialog(dialog);
      });
    });
  }

  function focusFirstField(root) {
    var field = root.querySelector(
      'input:not([type="hidden"]):not([disabled]), select, textarea'
    );
    if (field) field.focus();
  }

  function fillDebtOptions(select, budget, selected) {
    var debts = (budget && budget.debts) || [];
    select.innerHTML =
      '<option value="">Yok</option>' +
      debts
        .map(function (debt) {
          return (
            '<option value="' +
            window.BudgetStore.escapeHtml(debt.id) +
            '">' +
            window.BudgetStore.escapeHtml(debt.name) +
            "</option>"
          );
        })
        .join("");
    select.value = selected || "";
  }

  function expenseFields(form, budget, expense, fallbackDate) {
    var method = form.querySelector("#expense-method");
    var debt = form.querySelector("#expense-debt");
    var goal = form.querySelector("#expense-goal");
    fillDebtOptions(debt, budget, expense ? expense.debtId : "");
    form.querySelector("#expense-date").value =
      (expense && expense.date) || fallbackDate || window.BudgetStore.todayIso();
    method.value = expense
      ? expense.method || "cash"
      : (budget && budget.plan && budget.plan.spendMethod) || "card";
    function sync() {
      var paying = Boolean(debt.value);
      method.disabled = paying;
      if (paying) method.value = "cash";
      goal.disabled = paying;
      if (paying) goal.value = "";
    }
    debt.onchange = sync;
    sync();
  }

  function readExpenseFields(form) {
    var debtId = form.querySelector("#expense-debt").value || null;
    return {
      date: form.querySelector("#expense-date").value,
      method: debtId ? "cash" : form.querySelector("#expense-method").value,
      debtId: debtId,
      goalId: debtId ? null : form.querySelector("#expense-goal").value || null
    };
  }

  function sessionUid(value) {
    return value && value.idToken ? value.uid : null;
  }

  function showMessage(el, text, type) {
    if (!el) return;
    el.textContent = text || "";
    el.className = "message" + (type ? " message-" + type : "");
  }

  window.BudgetUI = {
    ICONS: {
      plus:
        '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
      close:
        '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>'
    },
    openDialog: openDialog,
    closeDialog: closeDialog,
    bindDialog: bindDialog,
    focusFirstField: focusFirstField,
    fillDebtOptions: fillDebtOptions,
    expenseFields: expenseFields,
    readExpenseFields: readExpenseFields,
    sessionUid: sessionUid,
    showMessage: showMessage
  };
})();
