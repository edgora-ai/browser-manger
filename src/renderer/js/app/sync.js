(function() {
  "use strict";

  var cloak = window.cloak;
  var api = cloak.api;
  var helpers = cloak.helpers;
  var toast = helpers.toast;
  var esc = helpers.esc;
  var escAttr = helpers.escAttr;

  function setButtonBusy(selector, busyText) {
    var btn = document.querySelector(selector);
    if (!btn) return null;
    var old = btn.textContent;
    btn.disabled = true;
    btn.textContent = busyText;
    return function() {
      btn.disabled = false;
      btn.textContent = old;
    };
  }

  function previewCountCard(label, value, detail) {
    var displayValue = value == null ? 0 : value;
    return '<div class="profile-card">' +
      '<div class="card-header"><span class="name">' + esc(label) + '</span><span class="status-badge status-done">' + esc(String(displayValue)) + '</span></div>' +
      '<div style="font-size:11px;color:var(--text-muted);line-height:1.35;">' + esc(detail || '') + '</div>' +
    '</div>';
  }

  function renderPreview(preview) {
    var messageEl = document.getElementById('sync-preview-message');
    var listEl = document.getElementById('sync-preview');
    if (!messageEl || !listEl) return;
    preview = preview || {};
    var running = preview.runningProfiles || [];
    messageEl.innerHTML = (preview.configured ? '✅ ' : '⚠️ ') + esc(preview.message || 'Preview unavailable');
    listEl.innerHTML = [
      previewCountCard('Profiles', preview.profiles || 0, running.length ? running.length + ' 个运行中；Pull 会跳过 localStorage/preferences' : 'Pull 无运行中跳过项'),
      previewCountCard('Proxies', preview.proxies || 0, '将随配置快照同步（敏感字段脱敏）'),
      previewCountCard('Accounts', preview.accounts || 0, '平台账号元数据；密码不展示'),
      previewCountCard('Extensions', preview.extensions || 0, '私有扩展仓库条目'),
    ].join('') + (running.length ? '<div class="profile-card" style="border-color:var(--warning);">' +
      '<div class="card-header"><span class="name">运行中 Profiles</span><span class="status-badge status-running">Pull skip</span></div>' +
      '<div style="font-family:var(--mono);font-size:11px;color:var(--text-muted);word-break:break-all;">' + running.map(esc).join('<br>') + '</div>' +
    '</div>' : '');
  }

  function fetchPreview() {
    return api.sync.preview().then(function(preview) {
      renderPreview(preview);
      return preview;
    });
  }

  cloak.loadSyncPreview = function() {
    var listEl = document.getElementById('sync-preview');
    var messageEl = document.getElementById('sync-preview-message');
    if (listEl) listEl.innerHTML = '<div class="loading">Loading...</div>';
    if (messageEl) messageEl.textContent = 'Loading...';
    return fetchPreview().catch(function(e) {
      if (listEl) listEl.innerHTML = '<div class="empty-state">Preview 加载失败: ' + esc(e.message || e) + '</div>';
      if (messageEl) messageEl.textContent = 'Preview 加载失败';
      toast('Preview 加载失败: ' + (e.message || e), 'error');
      return null;
    });
  };

  cloak.syncPush = function() {
    var reset = setButtonBusy('#tab-sync [data-cmd="syncPush"]', 'Checking...');
    fetchPreview().then(function() {
      api.sync.push().then(function(r) {
        toast(r.message, r.success ? 'success' : 'error');
        if (r.success) cloak.loadSyncConfig();
        else cloak.loadSyncPreview();
      }).catch(function(e) {
        toast('Push failed: ' + (e.message || String(e)), 'error');
      }).finally(function() {
        if (reset) reset();
      });
    }).catch(function(e) {
      toast('Preview failed: ' + (e.message || String(e)), 'error');
      if (reset) reset();
    });
  };

  cloak.syncPull = function() {
    var reset = setButtonBusy('#tab-sync [data-cmd="syncPull"]', 'Checking...');
    fetchPreview().then(function(preview) {
      var running = (preview && preview.runningProfiles) || [];
      if (running.length) {
        var ok = confirm('检测到 ' + running.length + ' 个运行中 profile。Pull 会跳过这些 profile 的 localStorage/preferences，继续?');
        if (!ok) { if (reset) reset(); return; }
      }
      api.sync.pull().then(function(r) {
        toast(r.message, r.success ? 'success' : 'error');
        if (!r.success) { cloak.loadSyncPreview(); return; }
        return api.app.reloadConfig().then(function() {
          cloak.loadSyncConfig();
        }).catch(function(e) {
          toast('Reload config failed: ' + (e.message || String(e)), 'error');
          cloak.loadSyncConfig();
        });
      }).catch(function(e) {
        toast('Pull failed: ' + (e.message || String(e)), 'error');
      }).finally(function() {
        if (reset) reset();
      });
    }).catch(function(e) {
      toast('Preview failed: ' + (e.message || String(e)), 'error');
      if (reset) reset();
    });
  };

  cloak.syncSave = function() {
    var config = {
      enabled: document.getElementById('sync-enabled').checked,
      endpoint: document.getElementById('sync-endpoint-input').value.trim(),
      bucket: document.getElementById('sync-bucket-input').value.trim(),
    };
    var accessKey = document.getElementById('sync-ak-input').value.trim();
    var secretKey = document.getElementById('sync-sk-input').value.trim();
    if (accessKey) config.accessKey = accessKey;
    if (secretKey) config.secretKey = secretKey;
    api.sync.configure(config).then(function(r) {
      if (r.success) {
        toast((window.i18n ? window.i18n.t("toast.sync.saved", "Sync config saved") : "Sync config saved"), "success");
        document.getElementById('sync-enabled-text').textContent = config.enabled && config.endpoint && config.bucket ? 'enabled' : 'disabled';
        document.getElementById('sync-endpoint').textContent = config.endpoint || '--';
        document.getElementById('sync-bucket').textContent = config.bucket || '--';
        cloak.loadSyncPreview();
      } else {
        toast(r.error || 'Save failed', 'error');
      }
    }).catch(function(e) {
      toast('Save failed: ' + (e.message || String(e)), 'error');
    });
  };

  function loadSyncConfig() {
    api.sync.status().then(function(status) {
      status = status || {};
      document.getElementById('sync-enabled-text').textContent = status.enabled ? 'enabled' : 'disabled';
      document.getElementById('sync-endpoint').textContent = status.endpoint || '--';
      document.getElementById('sync-bucket').textContent = status.bucket || '--';
      document.getElementById('sync-enabled').checked = !!status.enabled;
      document.getElementById('sync-endpoint-input').value = status.endpoint || '';
      document.getElementById('sync-bucket-input').value = status.bucket || '';
      var ak = document.getElementById('sync-ak-input');
      if (!ak.value) ak.placeholder = status.accessKeyMasked || '';
      var sk = document.getElementById('sync-sk-input');
      if (!sk.value) sk.placeholder = status.configured ? 'saved' : '';
      cloak.loadSyncPreview();
    }).catch(function(e) {
      toast((window.i18n ? window.i18n.t('toast.sync.load-failed', 'Failed to load sync config') : 'Failed to load sync config') + ': ' + e.message, 'error');
      cloak.loadSyncPreview();
    });
  }
  cloak.loadSyncConfig = loadSyncConfig;
})();
