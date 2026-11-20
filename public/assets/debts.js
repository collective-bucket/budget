(function () {
  "use strict";

  var loginPrompt = document.querySelector("#login-prompt");
  var loginLink = document.querySelector("#login-link");
  var appContent = document.querySelector("#app-content");
  var pageActions = document.querySelector("#page-actions");
  var pageMessage = document.querySelector("#page-message");
  var itemList = document.querySelector("#item-list");
  var addItem = document.querySelector("#add-item");
  var itemDialog = document.querySelector("#item-dialog");
  var itemForm = document.querySelector("#item-form");
  var itemDialogTitle = document.querySelector("#item-dialog-title");
  var itemName = document.querySelector("#item-name");
  var itemKind = document.querySelector("#item-kind");
  var itemBalance = document.querySelector("#item-balance");
  var itemAsOf = document.querySelector("#item-as-of");
  var itemPriority = document.querySelector("#item-priority");
  var itemStatementDay = document.querySelector("#item-statement-day");
  var itemDueDay = document.querySelector("#item-due-day");
  var itemMinRate = document.querySelector("#item-min-rate");
  var itemMonthlyRate = document.querySelector("#item-monthly-rate");
  var itemTaxRate = document.querySelector("#item-tax-rate");
  var itemDueDate = document.querySelector("#item-due-date");
  var cardFields = document.querySelector("#card-fields");
  var onceFields = document.querySelector("#once-fields");
  var itemMessage = document.querySelector("#item-message");
  var itemDelete = document.querySelector("#item-delete");
  var itemSubmit = document.querySelector("#item-submit");
  var confirmDialog = document.querySelector("#confirm-dialog");
  var confirmTitle = document.querySelector("#confirm-title");
  var confirmText = document.querySelector("#confirm-text");
  var confirmDelete = document.querySelector("#confirm-delete");

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
    pageActions.hidden = true;
  }

  var KIND_LABELS = { card: "Kredi kartı", once: "Tek seferlik", loan: "Alınan borç" };

  function pct(value) {
    return Math.round(Number(value || 0) * 10000) / 100;
  }

  function detailLabel(row) {
    var parts = [KIND_LABELS[row.kind], row.priority === "low" ? "düşük öncelik" : "yüksek öncelik"];
    if (row.kind === "card") {
      parts.push("kesim " + row.statementDay + ", son ödeme " + row.dueDay);
      parts.push("asgari %" + pct(row.minRate) + ", faiz %" + pct(row.monthlyRate));
    } else if (row.dueDate) {
      parts.push("son ödeme " + window.BudgetStore.formatDate(row.dueDate));
    }
    return parts.join(" · ");
  }

  function syncKind() {
    var card = itemKind.value === "card";
    cardFields.hidden = !card;
    onceFields.hidden = card;
    [itemStatementDay, itemDueDay, itemMinRate, itemMonthlyRate, itemTaxRate].forEach(function (input) {
      input.required = card;
    });
  }

  function render() {
    var debts = budget.debts || [];
    if (!debts.length) {
      itemList.innerHTML = '<li class="empty">Henüz borç yok.</li>';
      return;
    }
    itemList.innerHTML = debts
      .map(function (row) {
        return (
          '<li class="list-item is-action" tabindex="0" role="button" data-open-item="' +
          window.BudgetStore.escapeHtml(row.id) +
          '"><div class="list-main"><div class="title">' +
          window.BudgetStore.escapeHtml(row.name) +
          " · " +
          window.BudgetStore.formatMoney(row.balance) +
          '</div><div class="sub">' +
          window.BudgetStore.escapeHtml(detailLabel(row)) +
          "</div></div></li>"
        );
      })
      .join("");
  }

  function resetForm() {
    editingId = null;
    itemForm.reset();
    itemDialogTitle.textContent = "Borç ekle";
    itemSubmit.textContent = "Borç ekle";
    itemDelete.hidden = true;
    itemAsOf.value = window.BudgetStore.todayIso();
    syncKind();
    window.BudgetUI.showMessage(itemMessage, "");
  }

  function openItem(row) {
    if (row) {
      editingId = row.id;
      itemName.value = row.name;
      itemKind.value = row.kind;
      itemBalance.value = row.balance;
      itemAsOf.value = row.asOf || "";
      itemPriority.value = row.priority;
      itemDueDate.value = row.dueDate || "";
      if (row.kind === "card") {
        itemStatementDay.value = row.statementDay;
        itemDueDay.value = row.dueDay;
        itemMinRate.value = pct(row.minRate);
        itemMonthlyRate.value = pct(row.monthlyRate);
        itemTaxRate.value = pct(row.taxRate);
      }
      syncKind();
      itemDialogTitle.textContent = "Borcu düzenle";
      itemSubmit.textContent = "Kaydet";
      itemDelete.hidden = false;
    } else {
      resetForm();
    }
    window.BudgetUI.openDialog(itemDialog);
    itemName.focus();
  }

  async function persist(draft) {
    session = await window.BudgetStore.requireSession();
    budget = await window.BudgetStore.saveBudget(draft, session);
    render();
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
      pageActions.hidden = false;
      render();
    } catch (error) {
      showLoggedOut();
      window.BudgetUI.showMessage(pageMessage, error.message, "error");
    }
  }

  addItem.addEventListener("click", function () {
    openItem(null);
  });

  itemForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    if (saving) return;
    saving = true;
    itemSubmit.disabled = true;
    try {
      var draft = window.BudgetStore.clone(budget);
      var name = itemName.value.trim();
      var fields = {
        name: name,
        kind: itemKind.value,
        balance: Number(itemBalance.value),
        asOf: itemAsOf.value,
        priority: itemPriority.value,
        dueDate: itemKind.value === "card" ? null : itemDueDate.value || null,
        statementDay: Number(itemStatementDay.value),
        dueDay: Number(itemDueDay.value),
        minRate: Number(itemMinRate.value) / 100,
        monthlyRate: Number(itemMonthlyRate.value) / 100,
        taxRate: Number(itemTaxRate.value) / 100
      };
      if (editingId) {
        draft.debts = (draft.debts || []).map(function (row) {
          if (row.id !== editingId) return row;
          return Object.assign({}, row, fields);
        });
      } else {
        if ((draft.debts || []).length >= window.BudgetStore.MAX_DEBTS) {
          throw new Error(
            "En fazla " + window.BudgetStore.MAX_DEBTS + " borç eklenebilir."
          );
        }
        draft.debts = (draft.debts || []).concat([
          Object.assign({ id: window.BudgetStore.createId() }, fields)
        ]);
      }
      await persist(draft);
      window.BudgetUI.closeDialog(itemDialog);
      window.BudgetUI.showMessage(
        pageMessage,
        editingId ? "Borç güncellendi." : "Borç eklendi.",
        "success"
      );
    } catch (error) {
      window.BudgetUI.showMessage(itemMessage, error.message, "error");
    } finally {
      saving = false;
      itemSubmit.disabled = false;
    }
  });

  itemDelete.addEventListener("click", function () {
    if (!editingId) return;
    var row = (budget.debts || []).find(function (item) {
      return item.id === editingId;
    });
    pendingDelete = editingId;
    confirmTitle.textContent = "Borç silinsin mi?";
    confirmText.innerHTML =
      "<strong>" +
      window.BudgetStore.escapeHtml(row ? row.name : "Bu borç") +
      "</strong> kalıcı olarak silinecek. Bu borca yapılan ödemeler normal harcama olarak kalır.";
    confirmDelete.disabled = false;
    window.BudgetUI.openDialog(confirmDialog);
  });

  confirmDelete.addEventListener("click", async function () {
    if (!pendingDelete || deleting) return;
    deleting = true;
    confirmDelete.disabled = true;
    try {
      var draft = window.BudgetStore.clone(budget);
      draft.debts = (draft.debts || []).filter(function (row) {
        return row.id !== pendingDelete;
      });
      await persist(draft);
      pendingDelete = null;
      window.BudgetUI.closeDialog(confirmDialog);
      window.BudgetUI.closeDialog(itemDialog);
      window.BudgetUI.showMessage(pageMessage, "Borç silindi.", "success");
    } catch (error) {
      window.BudgetUI.showMessage(pageMessage, error.message, "error");
      confirmDelete.disabled = false;
    } finally {
      deleting = false;
    }
  });

  function openById(id) {
    var row = (budget.debts || []).find(function (item) {
      return item.id === id;
    });
    if (row) openItem(row);
  }

  itemList.addEventListener("click", function (event) {
    var item = event.target.closest("[data-open-item]");
    if (item) openById(item.getAttribute("data-open-item"));
  });

  itemList.addEventListener("keydown", function (event) {
    if (event.key !== "Enter" && event.key !== " ") return;
    var item = event.target.closest("[data-open-item]");
    if (!item) return;
    event.preventDefault();
    openById(item.getAttribute("data-open-item"));
  });

  itemKind.addEventListener("change", syncKind);
  itemDialog.addEventListener("close", resetForm);
  confirmDialog.addEventListener("close", function () {
    pendingDelete = null;
    confirmDelete.disabled = false;
  });

  window.BudgetUI.bindDialog(itemDialog);
  window.BudgetUI.bindDialog(confirmDialog);

  window.addEventListener("cb-auth-changed", function (event) {
    boot(event.detail && event.detail.session);
  });

  boot();
})();
