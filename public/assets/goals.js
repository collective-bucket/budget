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
  var itemPinned = document.querySelector("#item-pinned");
  var itemContributions = document.querySelector("#item-contributions");
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

  function renderContributions(goalId) {
    if (!goalId) {
      itemContributions.innerHTML = "";
      return;
    }
    var rows = window.BudgetStore.goalContributions(budget, goalId);
    if (!rows.length) {
      itemContributions.innerHTML = '<p class="modal-text">Henüz katkı yok.</p>';
      return;
    }
    itemContributions.innerHTML =
      "<p class=\"modal-text\">Katkılar</p><ul class=\"list\">" +
      rows
        .map(function (row) {
          return (
            '<li class="list-item' +
            (row.active ? "" : " is-inactive") +
            '"><div class="list-main"><div class="title">' +
            window.BudgetStore.escapeHtml(row.name) +
            " · " +
            window.BudgetStore.formatMoney(row.amount) +
            '</div><div class="sub">' +
            window.BudgetStore.escapeHtml(row.label) +
            "</div></div></li>"
          );
        })
        .join("") +
      "</ul>";
  }

  function render() {
    var goals = budget.goals || [];
    if (!goals.length) {
      itemList.innerHTML = '<li class="empty">Henüz hedef yok.</li>';
      return;
    }
    itemList.innerHTML = goals
      .map(function (row) {
        var saved = window.BudgetStore.goalSaved(budget, row.id);
        var left = Math.max(0, row.targetAmount - saved);
        return (
          '<li class="list-item"><button type="button" class="btn btn-ghost btn-tiny" data-pin-goal="' +
          window.BudgetStore.escapeHtml(row.id) +
          '" aria-pressed="' +
          String(Boolean(row.pinned)) +
          '">' +
          (row.pinned ? "Sabit" : "Sabitle") +
          "</button>" +
          '<div class="list-main is-action" tabindex="0" role="button" data-open-item="' +
          window.BudgetStore.escapeHtml(row.id) +
          '"><div class="title">' +
          window.BudgetStore.escapeHtml(row.name) +
          " · " +
          window.BudgetStore.formatMoney(saved) +
          " / " +
          window.BudgetStore.formatMoney(row.targetAmount) +
          '</div><div class="sub">' +
          window.BudgetStore.formatMoney(left) +
          " kaldı</div></div></li>"
        );
      })
      .join("");
  }

  function resetForm() {
    editingId = null;
    itemForm.reset();
    itemDialogTitle.textContent = "Hedef ekle";
    itemSubmit.textContent = "Hedef ekle";
    itemDelete.hidden = true;
    itemContributions.innerHTML = "";
    window.BudgetUI.showMessage(itemMessage, "");
  }

  function openItem(row) {
    if (row) {
      editingId = row.id;
      itemName.value = row.name;
      itemAmount.value = row.targetAmount;
      itemPinned.checked = Boolean(row.pinned);
      itemDialogTitle.textContent = "Hedefi düzenle";
      itemSubmit.textContent = "Kaydet";
      itemDelete.hidden = false;
      renderContributions(row.id);
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
      var pinned = itemPinned.checked;
      if (editingId) {
        draft.goals = (draft.goals || []).map(function (row) {
          if (row.id !== editingId) return row;
          return Object.assign({}, row, {
            name: name,
            targetAmount: amount,
            pinned: pinned
          });
        });
      } else {
        if ((draft.goals || []).length >= window.BudgetStore.MAX_GOALS) {
          throw new Error(
            "En fazla " + window.BudgetStore.MAX_GOALS + " hedef eklenebilir."
          );
        }
        draft.goals = (draft.goals || []).concat([
          {
            id: window.BudgetStore.createId(),
            name: name,
            targetAmount: amount,
            pinned: pinned,
            createdAt: new Date().toISOString()
          }
        ]);
      }
      await persist(draft);
      window.BudgetUI.closeDialog(itemDialog);
      window.BudgetUI.showMessage(
        pageMessage,
        editingId ? "Hedef güncellendi." : "Hedef eklendi.",
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
    var row = (budget.goals || []).find(function (item) {
      return item.id === editingId;
    });
    pendingDelete = editingId;
    confirmTitle.textContent = "Hedef silinsin mi?";
    confirmText.innerHTML =
      "<strong>" +
      window.BudgetStore.escapeHtml(row ? row.name : "Bu hedef") +
      "</strong> kalıcı olarak silinecek. Katkı harcamaları durur, silinmez.";
    confirmDelete.disabled = false;
    window.BudgetUI.openDialog(confirmDialog);
  });

  confirmDelete.addEventListener("click", async function () {
    if (!pendingDelete || deleting) return;
    deleting = true;
    confirmDelete.disabled = true;
    try {
      var draft = window.BudgetStore.clone(budget);
      draft.goals = (draft.goals || []).filter(function (row) {
        return row.id !== pendingDelete;
      });
      await persist(draft);
      pendingDelete = null;
      window.BudgetUI.closeDialog(confirmDialog);
      window.BudgetUI.closeDialog(itemDialog);
      window.BudgetUI.showMessage(pageMessage, "Hedef silindi.", "success");
    } catch (error) {
      window.BudgetUI.showMessage(pageMessage, error.message, "error");
      confirmDelete.disabled = false;
    } finally {
      deleting = false;
    }
  });

  function openById(id) {
    var row = (budget.goals || []).find(function (item) {
      return item.id === id;
    });
    if (row) openItem(row);
  }

  itemList.addEventListener("click", async function (event) {
    var pin = event.target.closest("[data-pin-goal]");
    if (pin) {
      var pinId = pin.getAttribute("data-pin-goal");
      var draft = window.BudgetStore.clone(budget);
      draft.goals = (draft.goals || []).map(function (row) {
        if (row.id !== pinId) return row;
        return Object.assign({}, row, { pinned: !row.pinned });
      });
      try {
        await persist(draft);
      } catch (error) {
        window.BudgetUI.showMessage(pageMessage, error.message, "error");
      }
      return;
    }
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
