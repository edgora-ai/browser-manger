// Approval gate UI — when the agent tries a risky operation (DROP/DELETE/etc.),
// the main process emits agent:approval-request; we show a dialog and resolve it.
(function() {
  "use strict";
  var cloak = window.cloak;
  var api = cloak.api;
  var helpers = cloak.helpers;
  var toast = helpers.toast;
  var esc = helpers.esc;

  var currentRequest = null;

  function show(req) {
    currentRequest = req;
    document.getElementById("approval-desc").textContent = req.description || "";
    document.getElementById("approval-detail").textContent = req.detail ? "签名: " + req.detail : "";
    var dlg = document.getElementById("dlg-approval");
    if (!dlg.open) dlg.showModal();
  }

  function close() {
    var dlg = document.getElementById("dlg-approval");
    if (dlg.open) dlg.close();
    currentRequest = null;
  }

  cloak.approvalAllow = function(mode) {
    if (!currentRequest) return;
    var id = currentRequest.id;
    close();
    api.approval.resolve(id, mode === "always" ? "always" : "once").then(function() {
      toast(mode === "always" ? "已允许(永久)" : "已允许", "success");
    });
  };

  cloak.approvalDeny = function(arg) {
    // arg may be "deny" (reject) or "close" (just close dialog, treat as deny)
    if (!currentRequest && arg !== "close") return;
    if (currentRequest) {
      var id = currentRequest.id;
      close();
      api.approval.resolve(id, "deny").then(function() {
        toast("已拒绝", "info");
      });
    } else {
      close();
    }
  };

  function bind() {
    if (cloak.state.approvalBound) return;
    cloak.state.approvalBound = true;
    api.on("agent:approval-request", function(req) {
      show(req);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind);
  } else {
    bind();
  }
})();
