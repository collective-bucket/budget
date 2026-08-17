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
    sessionUid: sessionUid,
    showMessage: showMessage
  };
})();
