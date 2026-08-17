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
  var itemAmount = document.querySelector("#item-amount");
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

  function render() {
    var incomes = budget.incomes || [];
    if (!incomes.length) {
      itemList.innerHTML = '<li class="empty">Henüz gelir yok.</li>';
      return;
    }
    itemList.innerHTML = incomes
      .map(function (row) {
        return (
          '<li class="list-item is-action" tabindex="0" role="button" data-open-item="' +
          window.BudgetStore.escapeHtml(row.id) +
          '"><div class="list-main"><div class="title">' +
          window.BudgetStore.escapeHtml(row.name) +
          " · " +
          window.BudgetStore.formatMoney(row.amount) +
          "</div></div></li>"
        );
      })
      .join("");
  }

  function resetForm() {
    editingId = null;
    itemForm.reset();
    itemDialogTitle.textContent = "Gelir ekle";
    itemSubmit.textContent = "Gelir ekle";
    itemDelete.hidden = true;
    window.BudgetUI.showMessage(itemMessage, "");
  }

  function openItem(row) {
    if (row) {
      editingId = row.id;
      itemName.value = row.name;
      itemAmount.value = row.amount;
      itemDialogTitle.textContent = "Geliri düzenle";
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
      var amount = Number(itemAmount.value);
      if (editingId) {
        draft.incomes = (draft.incomes || []).map(function (row) {
          if (row.id !== editingId) return row;
          return Object.assign({}, row, { name: name, amount: amount });
        });
      } else {
        if ((draft.incomes || []).length >= window.BudgetStore.MAX_INCOMES) {
          throw new Error(
            "En fazla " + window.BudgetStore.MAX_INCOMES + " gelir eklenebilir."
          );
        }
        draft.incomes = (draft.incomes || []).concat([
          {
            id: window.BudgetStore.createId(),
            name: name,
            amount: amount,
            active: true
          }
        ]);
      }
      await persist(draft);
      window.BudgetUI.closeDialog(itemDialog);
      window.BudgetUI.showMessage(
        pageMessage,
        editingId ? "Gelir güncellendi." : "Gelir eklendi.",
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
    var row = (budget.incomes || []).find(function (item) {
      return item.id === editingId;
    });
    pendingDelete = editingId;
    confirmTitle.textContent = "Gelir silinsin mi?";
    confirmText.innerHTML =
      "<strong>" +
      window.BudgetStore.escapeHtml(row ? row.name : "Bu gelir") +
      "</strong> kalıcı olarak silinecek. Mevcut ayların kopyaları etkilenmez.";
    confirmDelete.disabled = false;
    window.BudgetUI.openDialog(confirmDialog);
  });

  confirmDelete.addEventListener("click", async function () {
    if (!pendingDelete || deleting) return;
    deleting = true;
    confirmDelete.disabled = true;
    try {
      var draft = window.BudgetStore.clone(budget);
      draft.incomes = (draft.incomes || []).filter(function (row) {
        return row.id !== pendingDelete;
      });
      await persist(draft);
      pendingDelete = null;
      window.BudgetUI.closeDialog(confirmDialog);
      window.BudgetUI.closeDialog(itemDialog);
      window.BudgetUI.showMessage(pageMessage, "Gelir silindi.", "success");
    } catch (error) {
      window.BudgetUI.showMessage(pageMessage, error.message, "error");
      confirmDelete.disabled = false;
    } finally {
      deleting = false;
    }
  });

  function openById(id) {
    var row = (budget.incomes || []).find(function (item) {
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
