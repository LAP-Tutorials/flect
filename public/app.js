// Flect Frontend Logic

document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements - Status & Download
  const statusScrcpy = document.getElementById('statusScrcpy');
  const statusAdb = document.getElementById('statusAdb');
  const statusMirroring = document.getElementById('statusMirroring');
  const downloaderSection = document.getElementById('downloaderSection');
  const connectionWizardCard = document.getElementById('connectionWizardCard');
  const btnDownloadScrcpy = document.getElementById('btnDownloadScrcpy');
  const downloadProgressBar = document.getElementById('downloadProgressBar');
  const downloadProgressFill = document.getElementById('downloadProgressFill');
  const downloadProgressText = document.getElementById('downloadProgressText');
  const downloadProgressBytes = document.getElementById('downloadProgressBytes');

  // DOM Elements - Tabs & Forms
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabPanes = document.querySelectorAll('.tab-pane');
  const pairIp = document.getElementById('pairIp');
  const pairPort = document.getElementById('pairPort');
  const pairCode = document.getElementById('pairCode');
  const btnPair = document.getElementById('btnPair');
  const connectIp = document.getElementById('connectIp');
  const connectPort = document.getElementById('connectPort');
  const btnConnectModern = document.getElementById('btnConnectModern');
  const legacyIp = document.getElementById('legacyIp');
  const legacyPort = document.getElementById('legacyPort');
  const btnConnectLegacy = document.getElementById('btnConnectLegacy');
  const btnEnableTcpip = document.getElementById('btnEnableTcpip');
  
  // DOM Elements - Devices & Control
  const adbDevicesList = document.getElementById('adbDevicesList');
  const devicesCount = document.getElementById('devicesCount');
  const mirrorControlPanel = document.getElementById('mirrorControlPanel');
  const selectedDeviceName = document.getElementById('selectedDeviceName');
  const recordingIndicator = document.getElementById('recordingIndicator');
  const btnStartMirroring = document.getElementById('btnStartMirroring');
  const btnStopMirroring = document.getElementById('btnStopMirroring');
  const btnStopRecording = document.getElementById('btnStopRecording');
  const recentDevicesList = document.getElementById('recentDevicesList');

  // DOM Elements - Settings
  const btnToggleSettings = document.getElementById('btnToggleSettings');
  const settingsContent = document.getElementById('settingsContent');
  const qualityPreset = document.getElementById('qualityPreset');
  const maxSize = document.getElementById('maxSize');
  const bitRate = document.getElementById('bitRate');
  const maxFps = document.getElementById('maxFps');
  const selectTcpIp = document.getElementById('selectTcpIp');
  const stayAwake = document.getElementById('stayAwake');
  const turnScreenOff = document.getElementById('turnScreenOff');
  const alwaysOnTop = document.getElementById('alwaysOnTop');
  const noAudio = document.getElementById('noAudio');
  const showTouches = document.getElementById('showTouches');
  const recordScreen = document.getElementById('recordScreen');

  // DOM Elements - Actions & Logs
  const btnKillServer = document.getElementById('btnKillServer');
  const btnRefreshStatus = document.getElementById('btnRefreshStatus');
  const btnClearLogs = document.getElementById('btnClearLogs');
  const terminalLogs = document.getElementById('terminalLogs');

  // Global State variables
  let appState = {
    scrcpyInstalled: false,
    mirroringActive: false,
    mirroredDeviceId: null,
    recordingActive: false,
    adbRunning: false,
    devices: [],
    selectedDeviceId: null
  };
  let liveUpdateInProgress = false;
  let liveUpdatePending = false;
  let pendingLiveReason = '';
  let liveApplyTimer = null;

  // 1. TABS SYSTEM
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      tabButtons.forEach(b => b.classList.remove('active'));
      tabPanes.forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      const targetPane = document.getElementById(`pane-${btn.dataset.tab}`);
      if (targetPane) targetPane.classList.add('active');
    });
  });

  // 2. SCRCPY SETTINGS PANEL COLLAPSE
  btnToggleSettings.addEventListener('click', () => {
    btnToggleSettings.classList.toggle('collapsed');
    settingsContent.classList.toggle('collapsed');
  });

  // 3. SETTINGS PRESETS LOGIC
  const presets = {
    // Match preset labels shown in the UI.
    high: { maxSize: '1920', bitRate: '8', fps: '60' },
    ultra: { maxSize: '1920', bitRate: '16', fps: '60' },
    low: { maxSize: '768', bitRate: '4', fps: '30' }
  };

  function applyPreset() {
    const selected = qualityPreset.value;
    const customGroups = document.querySelectorAll('.custom-option-group');
    
    if (selected === 'custom') {
      customGroups.forEach(g => g.classList.remove('disabled'));
    } else {
      customGroups.forEach(g => g.classList.add('disabled'));
      const values = presets[selected];
      if (values) {
        maxSize.value = values.maxSize;
        bitRate.value = values.bitRate;
        maxFps.value = values.fps;
      }
    }
  }

  qualityPreset.addEventListener('change', applyPreset);
  applyPreset(); // run on load

  // 4. FETCH STATUS & REFRESH UI
  async function refreshStatus() {
    try {
      const res = await fetch('/api/status');
      const status = await res.json();
      
      appState.scrcpyInstalled = status.scrcpyInstalled;
      appState.mirroringActive = status.mirroringActive;
      appState.mirroredDeviceId = status.mirroredDeviceId || null;
      appState.recordingActive = !!status.recordingActive;
      appState.adbRunning = status.adbRunning;
      appState.devices = status.devices;

      // Update Scrcpy Install State UI
      if (status.scrcpyInstalled) {
        setIndicatorState(statusScrcpy, 'active', 'Installed');
        downloaderSection.classList.add('hidden');
        connectionWizardCard.classList.remove('hidden');
      } else {
        setIndicatorState(statusScrcpy, 'inactive', 'Missing');
        connectionWizardCard.classList.add('hidden');
        if (!status.downloadState.active) {
          downloaderSection.classList.remove('hidden');
        }
      }

      // Update ADB State UI
      if (status.adbRunning) {
        setIndicatorState(statusAdb, 'active', 'Running');
      } else {
        setIndicatorState(statusAdb, 'inactive', 'Stopped');
      }

      // Update Mirroring State UI
      if (status.mirroringActive) {
        setIndicatorState(statusMirroring, 'active', 'Active');
        btnStartMirroring.disabled = true;
        btnStopMirroring.classList.remove('hidden');
        if (status.recordingActive) {
          btnStopRecording.classList.remove('hidden');
        } else {
          btnStopRecording.classList.add('hidden');
        }
      } else {
        setIndicatorState(statusMirroring, 'inactive', 'Inactive');
        btnStartMirroring.disabled = false;
        btnStopMirroring.classList.add('hidden');
        btnStopRecording.classList.add('hidden');
      }

      // Render Devices list
      renderDevicesList(status.devices);
      
      // Update Download progress if active
      if (status.downloadState.active) {
        downloaderSection.classList.remove('hidden');
        btnDownloadScrcpy.classList.add('hidden');
        downloadProgressBar.classList.remove('hidden');
        updateDownloadProgressUI(status.downloadState);
      }

    } catch (e) {
      addTerminalLog(`Error fetching system status: ${e.message}`, 'error');
    }
  }

  function setIndicatorState(element, state, valueText) {
    element.className = 'indicator';
    if (state === 'active') element.classList.add('status-active');
    if (state === 'inactive') element.classList.add('status-inactive');
    if (state === 'pending') element.classList.add('status-pending');
    element.querySelector('.value').innerText = valueText;
  }

  function renderDevicesList(devices) {
    devicesCount.innerText = `${devices.length} Active`;
    
    if (devices.length === 0) {
      adbDevicesList.innerHTML = `<p class="empty-state">No devices currently connected to ADB.</p>`;
      mirrorControlPanel.classList.add('hidden');
      appState.selectedDeviceId = null;
      return;
    }

    // Auto-select first device if currently selected device is not connected or none is selected
    const stillConnected = devices.some(d => d.id === appState.selectedDeviceId);
    if (!stillConnected || !appState.selectedDeviceId) {
      appState.selectedDeviceId = devices[0].id;
    }

    let listHtml = '';
    devices.forEach(device => {
      const isSelected = appState.selectedDeviceId === device.id;
      const isMirroring = appState.mirroringActive && appState.mirroredDeviceId === device.id;
      const isRecording = isMirroring && appState.recordingActive;
      const displayName = device.name || device.id;
      
      const selectClass = isSelected ? 'selected' : '';
      const connectionType = device.id.includes('.') ? '📶 Wireless' : '🔌 USB';
      const mirroringBadge = isMirroring ? '<span class="badge">🎬 Mirroring</span>' : '';
      const recordingBadge = isRecording ? '<span class="badge">🔴 Recording</span>' : '';
      const statusDetails = device.name ? `${device.status.toUpperCase()} • ${device.id}` : device.status.toUpperCase();
      
      listHtml += `
        <div class="adb-device-item ${selectClass}" data-id="${device.id}">
          <div class="device-left">
            <span class="device-icon">${device.id.includes('.') ? '📱' : '🔌'}</span>
            <div class="device-meta">
              <span class="device-id">${displayName}</span>
              <span class="device-status">${statusDetails}</span>
            </div>
          </div>
          <div class="device-right">
            ${mirroringBadge}
            ${recordingBadge}
            <span class="badge">${connectionType}</span>
          </div>
        </div>
      `;
    });

    adbDevicesList.innerHTML = listHtml;
    
    // Add Click listeners to device items
    document.querySelectorAll('.adb-device-item').forEach(item => {
      item.addEventListener('click', () => {
        document.querySelectorAll('.adb-device-item').forEach(i => i.classList.remove('selected'));
        item.classList.add('selected');
        appState.selectedDeviceId = item.dataset.id;
        updateMirrorControlBar();
      });
    });

    updateMirrorControlBar();
  }

  function getDeviceDisplayNameById(deviceId) {
    const match = appState.devices.find(d => d.id === deviceId);
    return match?.name || deviceId || 'Unknown Device';
  }

  function updateMirrorControlBar() {
    if (appState.selectedDeviceId) {
      mirrorControlPanel.classList.remove('hidden');
      if (appState.mirroringActive && appState.mirroredDeviceId) {
        const mirroredName = getDeviceDisplayNameById(appState.mirroredDeviceId);
        selectedDeviceName.innerText = `${mirroredName} (currently mirroring)`;
      } else {
        selectedDeviceName.innerText = getDeviceDisplayNameById(appState.selectedDeviceId);
      }
      recordingIndicator.classList.toggle('hidden', !appState.recordingActive);
    } else {
      mirrorControlPanel.classList.add('hidden');
      recordingIndicator.classList.add('hidden');
    }
  }

  // 5. EVENT STREAM (SSE) CONNECTION
  function connectEventStream() {
    const eventSource = new EventSource('/api/events');

    eventSource.addEventListener('log-history', (e) => {
      const data = JSON.parse(e.data);
      terminalLogs.innerHTML = '';
      data.logs.forEach(log => {
        appendLogLine(log);
      });
      scrollToBottom();
    });

    eventSource.addEventListener('log', (e) => {
      const data = JSON.parse(e.data);
      appendLogLine(data.message);
      scrollToBottom();
    });

    eventSource.addEventListener('download-progress', (e) => {
      const data = JSON.parse(e.data);
      updateDownloadProgressUI(data);
    });

    eventSource.addEventListener('status-change', (e) => {
      refreshStatus();
    });

    eventSource.addEventListener('installed', (e) => {
      addTerminalLog('Scrcpy installed successfully!', 'success');
      btnDownloadScrcpy.classList.remove('hidden');
      downloadProgressBar.classList.add('hidden');
      refreshStatus();
    });

    eventSource.addEventListener('mirroring-started', (e) => {
      const data = JSON.parse(e.data || '{}');
      appState.mirroringActive = true;
      appState.mirroredDeviceId = data.deviceId || appState.selectedDeviceId;
      appState.recordingActive = !!data.recordingEnabled;
      addTerminalLog('Mirroring session launched.', 'scrcpy');
      refreshStatus();
    });

    eventSource.addEventListener('mirroring-ended', (e) => {
      const data = JSON.parse(e.data);
      appState.mirroringActive = false;
      appState.mirroredDeviceId = null;
      appState.recordingActive = false;
      addTerminalLog(`Mirroring session ended. Exit code: ${data.code}`, 'scrcpy');
      refreshStatus();
    });

    eventSource.onerror = (err) => {
      console.error('SSE Error:', err);
      eventSource.close();
      // Reconnect after 3 seconds
      setTimeout(connectEventStream, 3000);
    };
  }

  function appendLogLine(lineText) {
    const line = document.createElement('div');
    line.className = 'log-line';
    
    // Classify line source for color coding
    if (lineText.includes('adb pair') || lineText.includes('[ADB Pair]')) {
      line.classList.add('adb-line');
    } else if (lineText.includes('[ADB') || lineText.includes('ADB Error') || lineText.includes('Running: adb')) {
      line.classList.add('adb-line');
    } else if (lineText.includes('scrcpy:') || lineText.includes('[Scrcpy]')) {
      line.classList.add('scrcpy-line');
    } else if (lineText.includes('[System]') || lineText.includes('[Server]') || lineText.includes('[Download]')) {
      line.classList.add('system-line');
    } else if (lineText.toLowerCase().includes('error') || lineText.toLowerCase().includes('failed')) {
      line.classList.add('error-line');
    }
    
    line.innerText = lineText;
    terminalLogs.appendChild(line);
  }

  function addTerminalLog(text, type = 'system') {
    const timestamp = new Date().toLocaleTimeString();
    const line = `[${timestamp}] [Client] ${text}`;
    appendLogLine(line);
    scrollToBottom();
  }

  function collectMirroringSettings(useMirroredDevice = false) {
    const targetSerial = useMirroredDevice
      ? (appState.mirroredDeviceId || appState.selectedDeviceId)
      : appState.selectedDeviceId;

    return {
      serial: targetSerial,
      selectTcpIp: selectTcpIp.checked,
      maxSize: maxSize.value !== '0' ? maxSize.value : null,
      bitRate: bitRate.value,
      fps: maxFps.value !== '0' ? maxFps.value : null,
      stayAwake: stayAwake.checked,
      turnScreenOff: turnScreenOff.checked,
      alwaysOnTop: alwaysOnTop.checked,
      noAudio: noAudio.checked,
      showTouches: showTouches.checked,
      record: recordScreen.checked
    };
  }

  async function restartMirroringLive(reason) {
    if (!appState.mirroringActive) return;

    if (liveUpdateInProgress) {
      liveUpdatePending = true;
      pendingLiveReason = reason || 'settings change';
      return;
    }

    liveUpdateInProgress = true;
    btnStopMirroring.disabled = true;
    btnStartMirroring.disabled = true;
    addTerminalLog(`Applying live settings (${reason || 'update'})...`, 'system');

    try {
      const stopRes = await fetch('/api/stop-scrcpy', { method: 'POST' });
      const stopData = await stopRes.json();
      if (!stopRes.ok || !stopData.success) {
        throw new Error(stopData.error || stopData.message || 'Failed to stop current mirroring session.');
      }

      const settings = collectMirroringSettings(true);
      const startRes = await fetch('/api/start-scrcpy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
      const startData = await startRes.json();
      if (!startRes.ok || !startData.success) {
        throw new Error(startData.error || startData.message || 'Failed to restart mirroring with new settings.');
      }

      addTerminalLog(`Live settings applied (${reason || 'update'}).`, 'success');
    } catch (e) {
      addTerminalLog(`Live apply failed: ${e.message}`, 'error');
    } finally {
      liveUpdateInProgress = false;
      btnStopMirroring.disabled = false;
      if (!appState.mirroringActive) {
        btnStartMirroring.disabled = false;
      }

      if (liveUpdatePending) {
        const nextReason = pendingLiveReason || 'queued update';
        liveUpdatePending = false;
        pendingLiveReason = '';
        setTimeout(() => restartMirroringLive(nextReason), 100);
      }
    }
  }

  function scheduleLiveApply(reason) {
    if (!appState.mirroringActive) return;
    if (liveApplyTimer) clearTimeout(liveApplyTimer);
    liveApplyTimer = setTimeout(() => {
      restartMirroringLive(reason);
    }, 250);
  }

  function scrollToBottom() {
    terminalLogs.scrollTop = terminalLogs.scrollHeight;
  }

  function updateDownloadProgressUI(data) {
    downloadProgressFill.style.width = `${data.progress}%`;
    downloadProgressText.innerText = `Downloading: ${data.progress}%`;
    
    const downloadedMB = (data.downloaded / 1024 / 1024).toFixed(1);
    const totalMB = (data.total / 1024 / 1024).toFixed(1);
    downloadProgressBytes.innerText = `${downloadedMB} MB / ${totalMB} MB`;
  }

  // 6. ACTION HANDLERS: DOWNLOAD & CORE ACTIONS
  btnDownloadScrcpy.addEventListener('click', async () => {
    try {
      btnDownloadScrcpy.classList.add('hidden');
      downloadProgressBar.classList.remove('hidden');
      addTerminalLog('Initiating Scrcpy download...', 'system');
      
      const res = await fetch('/api/download', { method: 'POST' });
      const data = await res.json();
      if (data.error) {
        addTerminalLog(`Download failed: ${data.error}`, 'error');
        btnDownloadScrcpy.classList.remove('hidden');
        downloadProgressBar.classList.add('hidden');
      }
    } catch (e) {
      addTerminalLog(`Error starting download: ${e.message}`, 'error');
      btnDownloadScrcpy.classList.remove('hidden');
      downloadProgressBar.classList.add('hidden');
    }
  });

  btnKillServer.addEventListener('click', async () => {
    try {
      addTerminalLog('Killing ADB server...', 'adb');
      const res = await fetch('/api/kill-server', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        addTerminalLog('ADB server reset successfully.', 'success');
      } else {
        addTerminalLog(`Failed to restart ADB: ${data.error}`, 'error');
      }
      setTimeout(refreshStatus, 1000);
    } catch (e) {
      addTerminalLog(`Error restarting ADB: ${e.message}`, 'error');
    }
  });

  btnRefreshStatus.addEventListener('click', refreshStatus);
  
  btnClearLogs.addEventListener('click', () => {
    terminalLogs.innerHTML = `<div class="log-line system-line">[System] Console cleared.</div>`;
  });

  // 7. PAIRING & CONNECTING API HANDLERS
  btnPair.addEventListener('click', async () => {
    const ip = pairIp.value.trim();
    const port = pairPort.value.trim();
    const code = pairCode.value.trim();

    if (!ip || !port || !code) {
      alert('Please fill out the IP, Port, and Pairing Code.');
      return;
    }

    try {
      btnPair.disabled = true;
      btnPair.innerText = 'Pairing...';
      addTerminalLog(`Initiating pairing to ${ip}:${port} with code ${code}...`, 'system');
      
      const res = await fetch('/api/pair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip, port, code })
      });
      const data = await res.json();
      
      if (data.success) {
        addTerminalLog(`Pairing completed: ${data.message}`, 'success');
        alert('Successfully paired! Now check your phone for the connection IP/Port and click Connect.');
        
        // Auto-fill connection IP as it's usually the same as the pairing IP
        connectIp.value = ip;
      } else {
        addTerminalLog(`Pairing failed: ${data.error}`, 'error');
        alert(`Pairing failed: ${data.error}`);
      }
    } catch (e) {
      addTerminalLog(`Pairing Error: ${e.message}`, 'error');
      alert(`Pairing Error: ${e.message}`);
    } finally {
      btnPair.disabled = false;
      btnPair.innerText = 'Pair Device';
    }
  });

  async function connectDevice(ip, port) {
    if (!ip || !port) {
      alert('Please specify the Connection IP and Port.');
      return;
    }

    try {
      addTerminalLog(`Connecting to device ${ip}:${port}...`, 'system');
      
      const res = await fetch('/api/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip, port })
      });
      const data = await res.json();
      
      if (data.success) {
        addTerminalLog(`Connected to ${ip}:${port}`, 'success');

        // Refresh statuses before saving recents so we can capture resolved device name.
        await refreshStatus();
        const connectedId = `${ip}:${port}`;
        const connectedDevice = appState.devices.find(d => d.id === connectedId);

        // Save to Recents
        saveRecentDevice(ip, port, connectedDevice?.name || null);
      } else {
        addTerminalLog(`Connection failed: ${data.error}`, 'error');
        alert(`Connection failed: ${data.error}`);
      }
    } catch (e) {
      addTerminalLog(`Connect Error: ${e.message}`, 'error');
      alert(`Connect Error: ${e.message}`);
    }
  }

  btnConnectModern.addEventListener('click', () => {
    connectDevice(connectIp.value.trim(), connectPort.value.trim());
  });

  btnConnectLegacy.addEventListener('click', () => {
    connectDevice(legacyIp.value.trim(), legacyPort.value.trim());
  });

  btnEnableTcpip.addEventListener('click', async () => {
    try {
      btnEnableTcpip.disabled = true;
      btnEnableTcpip.innerText = 'Enabling...';
      addTerminalLog('Sending TCP/IP activation command (requires USB connection)...', 'system');
      
      const res = await fetch('/api/tcpip', { method: 'POST' });
      const data = await res.json();
      
      if (data.success) {
        addTerminalLog(`Wireless TCP/IP mode enabled: ${data.message}`, 'success');
        alert('TCP/IP mode enabled over port 5555. You can now unplug your phone from the USB cable, enter the IP, and connect wirelessly!');
      } else {
        addTerminalLog(`Failed to enable TCP/IP: ${data.error}`, 'error');
        alert(`Failed to enable TCP/IP: ${data.error}\nMake sure your phone is connected via USB and USB Debugging is turned on.`);
      }
    } catch (e) {
      addTerminalLog(`TCP/IP activation error: ${e.message}`, 'error');
      alert(`Error activating TCP/IP: ${e.message}`);
    } finally {
      btnEnableTcpip.disabled = false;
      btnEnableTcpip.innerText = 'Enable TCP/IP Mode over USB';
    }
  });

  // 8. MIRRORING CONTROLS HANDLERS
  btnStartMirroring.addEventListener('click', async () => {
    if (!appState.selectedDeviceId) {
      alert('Please select a device from the ADB list first.');
      return;
    }
    const settings = collectMirroringSettings(false);

    try {
      addTerminalLog(`Starting screen mirroring on ${appState.selectedDeviceId}...`, 'system');
      btnStartMirroring.disabled = true;
      
      const res = await fetch('/api/start-scrcpy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
      const data = await res.json();
      if (!data.success) {
        addTerminalLog(`Start mirroring failed: ${data.error}`, 'error');
        btnStartMirroring.disabled = false;
      }
    } catch (e) {
      addTerminalLog(`Start Mirroring Error: ${e.message}`, 'error');
      btnStartMirroring.disabled = false;
    }
  });

  btnStopMirroring.addEventListener('click', async () => {
    try {
      addTerminalLog('Requesting screen mirroring stop...', 'system');
      btnStopMirroring.disabled = true;
      const res = await fetch('/api/stop-scrcpy', { method: 'POST' });
      const data = await res.json();
      addTerminalLog(data.message || 'Stop request completed.', data.success ? 'success' : 'error');
    } catch (e) {
      addTerminalLog(`Stop Mirroring Error: ${e.message}`, 'error');
    } finally {
      btnStopMirroring.disabled = false;
    }
  });

  btnStopRecording.addEventListener('click', async () => {
    if (!appState.mirroringActive || !appState.recordingActive) return;
    btnStopRecording.disabled = true;
    recordScreen.checked = false;
    addTerminalLog('Stopping recording and applying settings live...', 'system');
    await restartMirroringLive('recording stopped');
    btnStopRecording.disabled = false;
  });

  // Live apply: Turn Phone Screen Off toggle while mirroring is active.
  turnScreenOff.addEventListener('change', async () => {
    if (!appState.mirroringActive) return;

    const desiredOff = turnScreenOff.checked;
    turnScreenOff.disabled = true;
    addTerminalLog(
      desiredOff ? 'Applying live setting: turning phone screen off...' : 'Applying live setting: waking phone screen...',
      'system'
    );

    try {
      const res = await fetch('/api/live/turn-screen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: desiredOff })
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || data.message || 'Failed to apply live screen setting.');
      }

      addTerminalLog(data.message, 'success');
    } catch (e) {
      // Revert UI state if live apply fails.
      turnScreenOff.checked = !desiredOff;
      addTerminalLog(`Live screen setting failed: ${e.message}`, 'error');
    } finally {
      turnScreenOff.disabled = false;
    }
  });

  // Live apply for all other controls by restarting active mirroring with updated args.
  qualityPreset.addEventListener('change', () => scheduleLiveApply('quality preset changed'));
  maxSize.addEventListener('change', () => scheduleLiveApply('max resolution changed'));
  bitRate.addEventListener('change', () => scheduleLiveApply('bitrate changed'));
  maxFps.addEventListener('change', () => scheduleLiveApply('fps limit changed'));
  selectTcpIp.addEventListener('change', () => scheduleLiveApply('wireless mode preference changed'));
  stayAwake.addEventListener('change', () => scheduleLiveApply('stay awake changed'));
  alwaysOnTop.addEventListener('change', () => scheduleLiveApply('always on top changed'));
  noAudio.addEventListener('change', () => scheduleLiveApply('audio forwarding changed'));
  showTouches.addEventListener('change', () => scheduleLiveApply('touch indicators changed'));
  recordScreen.addEventListener('change', () => scheduleLiveApply('recording changed'));

  // 9. LOCAL STORAGE - RECENT DEVICES PROFILE MANAGEMENT
  function getRecentDevices() {
    const list = localStorage.getItem('recentDevices');
    return list ? JSON.parse(list) : [];
  }

  function saveRecentDevice(ip, port, name = null) {
    let list = getRecentDevices();
    
    // Remove if already exists to place it at top (most recent)
    list = list.filter(item => !(item.ip === ip && item.port === port));
    
    list.unshift({
      ip,
      port,
      name: name || null,
      date: new Date().toLocaleDateString()
    });

    // Cap list at 5 items
    if (list.length > 5) list.pop();
    
    localStorage.setItem('recentDevices', JSON.stringify(list));
    renderRecentDevices();
  }

  function deleteRecentDevice(ip, port) {
    let list = getRecentDevices();
    list = list.filter(item => !(item.ip === ip && item.port === port));
    localStorage.setItem('recentDevices', JSON.stringify(list));
    renderRecentDevices();
  }

  function renderRecentDevices() {
    const devices = getRecentDevices();
    if (devices.length === 0) {
      recentDevicesList.innerHTML = `<p class="empty-state">No recent connections. Pair/connect a device to save it.</p>`;
      return;
    }

    let html = '';
    devices.forEach(dev => {
      const endpoint = `${dev.ip}:${dev.port}`;
      const title = dev.name || endpoint;
      html += `
        <div class="recent-device-item">
          <div class="recent-device-info">
            <span class="recent-device-ip">${title}</span>
            <span class="recent-device-date">Last connected: ${dev.date} • ${endpoint}</span>
          </div>
          <div class="recent-device-actions">
            <button class="btn btn-outline btn-sm btn-quick-connect" data-ip="${dev.ip}" data-port="${dev.port}">Connect</button>
            <button class="btn-icon btn-delete-recent" data-ip="${dev.ip}" data-port="${dev.port}" title="Remove Profile">
              <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
          </div>
        </div>
      `;
    });

    recentDevicesList.innerHTML = html;

    // Quick Connect Click handler
    document.querySelectorAll('.btn-quick-connect').forEach(btn => {
      btn.addEventListener('click', () => {
        const ip = btn.dataset.ip;
        const port = btn.dataset.port;
        
        // Auto fill form based on active tab or default to connectIp
        const activeTab = document.querySelector('.tab-btn.active').dataset.tab;
        if (activeTab === 'modern') {
          connectIp.value = ip;
          connectPort.value = port;
        } else {
          legacyIp.value = ip;
        }
        
        connectDevice(ip, port);
      });
    });

    // Delete Profile handler
    document.querySelectorAll('.btn-delete-recent').forEach(btn => {
      btn.addEventListener('click', () => {
        const ip = btn.dataset.ip;
        const port = btn.dataset.port;
        deleteRecentDevice(ip, port);
      });
    });
  }

  // Initial Launch Routines
  refreshStatus();
  renderRecentDevices();
  connectEventStream();
});
