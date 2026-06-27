(function() {
  "use strict";

  var cloak = window.cloak;
  var api = cloak.api;
  var R = cloak.R;
  var state = cloak.state;
  var helpers = cloak.helpers;
  var toast = helpers.toast;
  var esc = helpers.esc;
  var escAttr = helpers.escAttr;
  var fmt = helpers.fmt;
  var shortPath = helpers.shortPath;
  var renderChatMarkdown = helpers.renderChatMarkdown;
  var renderInlineMarkdown = helpers.renderInlineMarkdown;
  var safeCodeLanguage = helpers.safeCodeLanguage;
  var hardwareSummary = helpers.hardwareSummary;
  var shortenGpu = helpers.shortenGpu;
  var fingerprintCompleteness = helpers.fingerprintCompleteness;
  var platformIcon = helpers.platformIcon;
  var parseTagInput = helpers.parseTagInput;
  var parseListInput = helpers.parseListInput;
  var closeDialogIfOpen = helpers.closeDialogIfOpen;
  var clearSkillEditor = helpers.clearSkillEditor;
  var refreshSkillViews = helpers.refreshSkillViews;
  var skillSourceLabel = helpers.skillSourceLabel;
  var renderSkillTags = helpers.renderSkillTags;
  var renderSkillCard = helpers.renderSkillCard;
  var bindSkillCardActions = helpers.bindSkillCardActions;
  var readHardwareFields = helpers.readHardwareFields;
  var writeHardwareFields = helpers.writeHardwareFields;
  var renderProxyOptions = helpers.renderProxyOptions;
  var proxySelectionValue = helpers.proxySelectionValue;
  var profileProxySelectionValue = helpers.profileProxySelectionValue;
  var proxyDisplayLabel = helpers.proxyDisplayLabel;
  var parseProxySelection = helpers.parseProxySelection;
  var extractChromeExtensionId = helpers.extractChromeExtensionId;
  var getSyncStatus = helpers.getSyncStatus;
  var markProfileRuntime = helpers.markProfileRuntime;
  var clearProfileRuntime = helpers.clearProfileRuntime;
  var scheduleProfilesRefresh = helpers.scheduleProfilesRefresh;
  var getBrowserDisplay = helpers.getBrowserDisplay;
  var chromeOsFromPlatform = helpers.chromeOsFromPlatform;
  var uaPlatformFromPlatform = helpers.uaPlatformFromPlatform;
  var platformFromOsName = helpers.platformFromOsName;
  var normalizeCloakPlatform = helpers.normalizeCloakPlatform;
  var updateCloakStatus = helpers.updateCloakStatus;
  var renderCloakBinaryCard = helpers.renderCloakBinaryCard;

  cloak.switchTab = function (tab) {
    state.currentTab = tab;
    document.querySelectorAll('.nav-item').forEach(function (n) { n.classList.toggle('active', n.dataset.tab === tab); });
    document.querySelectorAll('.tab-content').forEach(function (c) { c.classList.toggle('active', c.id === 'tab-' + tab); });
    cloak.loadTab(tab);
  };

  cloak.loadTab = function (tab) {
    if (tab === "profiles") cloak.loadProfiles();
    else if (tab === "proxy") cloak.loadProxies();
    else if (tab === "storage") cloak.loadStorage();
    else if (tab === "sync") cloak.loadSyncConfig();
    else if (tab === "browser") cloak.loadBrowserTab();
    else if (tab === "extensions") cloak.loadExtensionsTab();
    else if (tab === "accounts") cloak.loadAccountsTab();
    else if (tab === "agent") { cloak.switchAgentSub('chat'); cloak.agentLoadConversations(); cloak.agentLoadConfig(); }
    else if (tab === "automation") cloak.loadAutomationTab();
    else if (tab === "runs") cloak.loadRunsTab();
    else if (tab === "db") cloak.loadDbTab();
    else if (tab === "activity") cloak.loadActivity();
  };

  cloak.reloadCurrentTab = function () {
    cloak.applyI18n && cloak.applyI18n();
    if (window.i18n && window.i18n.apply) window.i18n.apply();
    cloak.loadTab(state.currentTab);
  };

  cloak.applyI18n = function () {
    if (window.i18n && window.i18n.apply) { try { window.i18n.apply(); } catch (e) {} }
  };

  cloak.clearCache = function (dirId) { api.storage.clearCache(dirId).then(function (r) { toast(r.message || "Cache cleared", "success"); cloak.loadStorage(); }); };

  cloak.clearAllCaches = function () { api.storage.clearCache().then(function (r) { toast(r.message || "Caches cleared", "success"); cloak.loadStorage(); }); };

  cloak.loadStorage = function () {
    var list = document.getElementById("storage-profile-list");
    list.innerHTML = '<div class="loading">Loading...</div>';
    api.storage.info().then(function (info) {
      document.getElementById("stat-profile-total").textContent = fmt(info.totalProfileBytes || 0);
      document.getElementById("stat-disk-available").textContent = fmt(info.availableDiskBytes || 0);
      document.getElementById("stat-disk-usage").textContent = (info.diskUsagePercent || 0) + "%";
      var profiles = info.profiles || [];
      if (profiles.length === 0) {
        list.innerHTML = '<div class="empty-state">No profile storage yet.</div>';
        return;
      }
      list.innerHTML = profiles.map(function (p) {
        return '<div class="profile-card" data-dir-id="' + escAttr(p.dirId) + '">' +
          '<div class="card-header"><span class="name">' + esc(p.name) + '</span><span class="status-badge status-stopped">' + esc(p.browser) + '</span></div>' +
          '<div class="info-row"><span>Size</span><span>' + fmt(p.sizeBytes || 0) + '</span></div>' +
          '<div class="info-row"><span>Modified</span><span>' + (p.lastModified ? new Date(p.lastModified).toLocaleString() : '?') + '</span></div>' +
          '<div class="card-actions"><button class="btn btn-secondary btn-sm" data-action="clear-cache">Clear Cache</button></div>' +
        '</div>';
      }).join("");
      list.onclick = function (event) {
        var target = event.target.closest("[data-action='clear-cache']");
        if (!target || !list.contains(target)) return;
        var card = target.closest(".profile-card");
        if (card && card.dataset.dirId) cloak.clearCache(card.dataset.dirId);
      };
    }).catch(function (e) {
      list.innerHTML = '<div class="empty-state">Error: ' + esc(e.message || String(e)) + '</div>';
    });
  };
})();
