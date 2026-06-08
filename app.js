/**
 * EventCheck — Main Application Logic
 * Handles authentication, navigation, QR scanning, QR generation,
 * Google Sheets integration, and all UI interactions.
 */

(() => {
  'use strict';

  // ============================================
  // CONFIGURATION & STATE
  // ============================================
  const APP_PASSWORD = 'IFMSAFAPI123';
  const STORAGE_KEYS = {
    scriptUrl: 'eventcheck_script_url',
    eventName: 'eventcheck_event_name',
    recentCheckins: 'eventcheck_recent',
    participants: 'eventcheck_participants'
  };

  let state = {
    isAuthenticated: false,
    scriptUrl: '',
    eventName: '',
    participants: [],
    recentCheckins: [],
    scanner: null,
    isScanning: false,
    scanCooldown: false
  };

  // ============================================
  // DOM ELEMENTS
  // ============================================
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const dom = {
    // Login
    loginScreen: $('#login-screen'),
    passwordInput: $('#password-input'),
    loginBtn: $('#login-btn'),
    loginError: $('#login-error'),

    // App
    app: $('#app'),
    headerEventName: $('#header-event-name'),
    statusDot: $('#status-dot'),
    statusText: $('#status-text'),
    refreshBtn: $('#refresh-btn'),
    logoutBtn: $('#logout-btn'),

    // Dashboard
    statTotal: $('#stat-total'),
    statPresent: $('#stat-present'),
    statAbsent: $('#stat-absent'),
    statPercentage: $('#stat-percentage'),
    recentList: $('#recent-list'),
    recentCount: $('#recent-count'),
    emptyRecent: $('#empty-recent'),

    // Scanner
    scannerViewport: $('#scanner-viewport'),
    scannerPlaceholder: $('#scanner-placeholder'),
    startScanBtn: $('#start-scan-btn'),
    stopScanBtn: $('#stop-scan-btn'),
    scanResult: $('#scan-result'),
    resultIcon: $('#result-icon'),
    resultName: $('#result-name'),
    resultMessage: $('#result-message'),
    qrFileInput: $('#qr-file-input'),

    // QR Codes
    loadQrBtn: $('#load-qr-btn'),
    printQrBtn: $('#print-qr-btn'),
    qrSearchInput: $('#qr-search-input'),
    qrGrid: $('#qr-grid'),
    emptyQr: $('#empty-qr'),

    // Config
    configEventName: $('#config-event-name'),
    configScriptUrl: $('#config-script-url'),
    saveConfigBtn: $('#save-config-btn'),
    testConnectionBtn: $('#test-connection-btn'),
    connectionStatus: $('#connection-status'),
    connectionIcon: $('#connection-icon'),
    connectionText: $('#connection-text'),
    generateIdsBtn: $('#generate-ids-btn'),
    clearDataBtn: $('#clear-data-btn'),

    // Navigation
    bottomNav: $('#bottom-nav'),
    navItems: $$('.nav-item'),
    sections: $$('.section'),

    // Modal
    qrModal: $('#qr-modal'),
    modalName: $('#modal-name'),
    modalEmail: $('#modal-email'),
    modalQrContainer: $('#modal-qr-container'),
    modalDownloadBtn: $('#modal-download-btn'),
    modalCloseBtn: $('#modal-close-btn'),

    // Toast
    toastContainer: $('#toast-container'),

    // Loading
    loadingOverlay: $('#loading-overlay'),
    loadingText: $('#loading-text')
  };

  // ============================================
  // INITIALIZATION
  // ============================================
  function init() {
    loadConfig();
    bindEvents();
    registerServiceWorker();

    // Handle Enter key on password input
    dom.passwordInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleLogin();
    });

    // Focus password input
    setTimeout(() => dom.passwordInput.focus(), 500);
  }

  function loadConfig() {
    state.scriptUrl = localStorage.getItem(STORAGE_KEYS.scriptUrl) || '';
    state.eventName = localStorage.getItem(STORAGE_KEYS.eventName) || '';
    state.recentCheckins = JSON.parse(localStorage.getItem(STORAGE_KEYS.recentCheckins) || '[]');

    if (state.eventName) {
      dom.configEventName.value = state.eventName;
      dom.headerEventName.textContent = state.eventName;
    }
    if (state.scriptUrl) {
      dom.configScriptUrl.value = state.scriptUrl;
    }
  }

  function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js')
        .then(() => console.log('ServiceWorker registered'))
        .catch((err) => console.warn('SW registration failed:', err));
    }
  }

  // ============================================
  // EVENT BINDING
  // ============================================
  function bindEvents() {
    // Login
    dom.loginBtn.addEventListener('click', handleLogin);

    // Navigation
    dom.navItems.forEach(item => {
      item.addEventListener('click', () => navigateTo(item.dataset.section));
    });

    // Header actions
    dom.refreshBtn.addEventListener('click', refreshData);
    dom.logoutBtn.addEventListener('click', handleLogout);

    // Scanner
    dom.startScanBtn.addEventListener('click', startScanner);
    dom.stopScanBtn.addEventListener('click', stopScanner);
    dom.qrFileInput.addEventListener('change', handleFileUpload);

    // QR Codes
    dom.loadQrBtn.addEventListener('click', loadAndGenerateQRCodes);
    dom.printQrBtn.addEventListener('click', () => window.print());
    dom.qrSearchInput.addEventListener('input', filterQRCodes);

    // Config
    dom.saveConfigBtn.addEventListener('click', saveConfig);
    dom.testConnectionBtn.addEventListener('click', testConnection);
    dom.generateIdsBtn.addEventListener('click', generateIds);
    dom.clearDataBtn.addEventListener('click', clearLocalData);

    // Modal
    dom.modalCloseBtn.addEventListener('click', closeModal);
    dom.modalDownloadBtn.addEventListener('click', downloadModalQR);
    dom.qrModal.addEventListener('click', (e) => {
      if (e.target === dom.qrModal) closeModal();
    });
  }

  // ============================================
  // AUTHENTICATION
  // ============================================
  function handleLogin() {
    const password = dom.passwordInput.value.trim();

    if (password === APP_PASSWORD) {
      state.isAuthenticated = true;
      dom.loginScreen.classList.add('hidden');
      dom.app.classList.remove('hidden');
      dom.loginError.classList.remove('visible');

      // Load data if configured
      if (state.scriptUrl) {
        updateConnectionStatus(true);
        refreshData();
      }

      showToast('Bem-vindo ao EventCheck! 🎓', 'success');
    } else {
      dom.loginError.classList.add('visible');
      dom.passwordInput.value = '';
      dom.passwordInput.focus();
      // Shake animation
      dom.loginError.style.animation = 'none';
      dom.loginError.offsetHeight; // Trigger reflow
      dom.loginError.style.animation = '';
    }
  }

  function handleLogout() {
    state.isAuthenticated = false;
    stopScanner();
    dom.app.classList.add('hidden');
    dom.loginScreen.classList.remove('hidden');
    dom.passwordInput.value = '';
    dom.passwordInput.focus();
  }

  // ============================================
  // NAVIGATION
  // ============================================
  function navigateTo(sectionName) {
    // Stop scanner when leaving scanner section
    if (state.isScanning && sectionName !== 'scanner') {
      stopScanner();
    }

    // Update nav items
    dom.navItems.forEach(item => {
      item.classList.toggle('active', item.dataset.section === sectionName);
    });

    // Update sections
    dom.sections.forEach(section => {
      const isTarget = section.id === `${sectionName}-section`;
      section.classList.toggle('active', isTarget);
      if (isTarget) {
        section.style.animation = 'none';
        section.offsetHeight;
        section.style.animation = '';
      }
    });
  }

  // ============================================
  // API COMMUNICATION
  // ============================================
  async function apiGet(action) {
    if (!state.scriptUrl) {
      showToast('Configure a URL do Apps Script primeiro', 'warning');
      throw new Error('No script URL configured');
    }

    const url = `${state.scriptUrl}?action=${action}&password=${encodeURIComponent(APP_PASSWORD)}&t=${Date.now()}`;

    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow'
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return response.json();
  }

  async function apiPost(data) {
    if (!state.scriptUrl) {
      showToast('Configure a URL do Apps Script primeiro', 'warning');
      throw new Error('No script URL configured');
    }

    const response = await fetch(state.scriptUrl, {
      method: 'POST',
      mode: 'cors',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      redirect: 'follow',
      body: JSON.stringify({ ...data, password: APP_PASSWORD })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return response.json();
  }

  // ============================================
  // DATA REFRESH
  // ============================================
  async function refreshData() {
    if (!state.scriptUrl) {
      showToast('Configure a URL do Apps Script nas configurações', 'warning');
      navigateTo('config');
      return;
    }

    try {
      dom.refreshBtn.disabled = true;
      dom.refreshBtn.textContent = '⏳';

      const data = await apiGet('list');

      if (data.status === 'success') {
        state.participants = data.participants || [];
        updateDashboard(data.stats);
        updateConnectionStatus(true);
        updateRecentList();
        showToast('Dados atualizados com sucesso', 'success');
      } else if (data.status === 'unauthorized') {
        showToast('Senha do Apps Script incorreta', 'error');
        updateConnectionStatus(false);
      } else {
        showToast(data.message || 'Erro ao carregar dados', 'error');
      }
    } catch (err) {
      console.error('Refresh error:', err);
      showToast('Erro de conexão. Verifique a URL e a internet.', 'error');
      updateConnectionStatus(false);
    } finally {
      dom.refreshBtn.disabled = false;
      dom.refreshBtn.textContent = '🔄';
    }
  }

  // ============================================
  // DASHBOARD
  // ============================================
  function updateDashboard(stats) {
    if (!stats) return;

    animateNumber(dom.statTotal, stats.total);
    animateNumber(dom.statPresent, stats.present);
    animateNumber(dom.statAbsent, stats.absent);
    animateNumber(dom.statPercentage, stats.percentage, '%');
  }

  function animateNumber(element, target, suffix = '') {
    const current = parseInt(element.textContent) || 0;
    const diff = target - current;
    const duration = 600;
    const steps = 30;
    const stepValue = diff / steps;
    let step = 0;

    if (diff === 0) {
      element.textContent = target + suffix;
      return;
    }

    const interval = setInterval(() => {
      step++;
      if (step >= steps) {
        element.textContent = target + suffix;
        clearInterval(interval);
      } else {
        element.textContent = Math.round(current + stepValue * step) + suffix;
      }
    }, duration / steps);
  }

  function updateRecentList() {
    // Merge server data with local recent check-ins
    const presentParticipants = state.participants
      .filter(p => p.status === 'present' && p.checkinDate)
      .sort((a, b) => {
        // Sort by check-in date descending (most recent first)
        return parseDate(b.checkinDate) - parseDate(a.checkinDate);
      })
      .slice(0, 20);

    if (presentParticipants.length === 0) {
      dom.emptyRecent.classList.remove('hidden');
      dom.recentCount.textContent = '0 hoje';
      // Clear previous items except empty state
      const items = dom.recentList.querySelectorAll('.recent-item');
      items.forEach(item => item.remove());
      return;
    }

    dom.emptyRecent.classList.add('hidden');
    dom.recentCount.textContent = `${presentParticipants.length} registrados`;

    // Clear previous items
    const items = dom.recentList.querySelectorAll('.recent-item');
    items.forEach(item => item.remove());

    presentParticipants.forEach((p, index) => {
      const item = document.createElement('div');
      item.className = 'recent-item';
      item.style.animationDelay = `${index * 0.05}s`;
      item.innerHTML = `
        <div class="check-icon">✅</div>
        <div class="item-info">
          <div class="item-name">${escapeHtml(p.name)}</div>
          <div class="item-time">${p.checkinDate || 'Horário não registrado'}</div>
        </div>
      `;
      dom.recentList.appendChild(item);
    });
  }

  function parseDate(dateStr) {
    if (!dateStr) return 0;
    // Format: dd/MM/yyyy HH:mm:ss
    const parts = dateStr.match(/(\d{2})\/(\d{2})\/(\d{4})\s*(\d{2}):(\d{2}):?(\d{2})?/);
    if (parts) {
      return new Date(parts[3], parts[2] - 1, parts[1], parts[4], parts[5], parts[6] || 0).getTime();
    }
    return 0;
  }

  // ============================================
  // QR CODE SCANNER
  // ============================================
  async function startScanner() {
    try {
      dom.startScanBtn.classList.add('hidden');
      dom.stopScanBtn.classList.remove('hidden');
      dom.scannerPlaceholder.classList.add('hidden');
      dom.scannerViewport.classList.add('scanning');

      state.scanner = new Html5Qrcode('scanner-view');

      // Detect mobile devices for adaptive configuration
      const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.innerWidth < 768;

      // Calculate a safe fixed qrbox size — avoids timing issues on mobile
      // where the container may not yet have computed dimensions
      const containerW = dom.scannerViewport.offsetWidth || Math.min(window.innerWidth, 400);
      const qrboxSize = Math.max(200, Math.floor(containerW * 0.70));

      const config = {
        fps: isMobile ? 15 : 10,
        // Fixed size is more reliable than a callback on mobile
        qrbox: { width: qrboxSize, height: qrboxSize },
        // aspectRatio: 1.0 removed — causes camera stream failures on mobile browsers
        disableFlip: false,
        experimentalFeatures: {
          // BarcodeDetector API is unstable on many Android devices; disable on mobile
          useBarCodeDetectorIfSupported: !isMobile
        }
      };

      // Three-tier camera start strategy for maximum mobile compatibility
      const started = await _startCameraWithFallback(config);
      if (!started) throw new Error('Nenhuma câmera compatível encontrada.');

      state.isScanning = true;
      showToast('Scanner ativado. Aponte para um QR Code.', 'info');
    } catch (err) {
      console.error('Scanner error:', err);
      resetScannerUI();

      const msg = err.toString();
      if (msg.includes('Permission') || msg.includes('NotAllowed')) {
        showToast('Permissão de câmera negada. Permita o acesso nas configurações do navegador.', 'error');
      } else if (msg.includes('NotFound') || msg.includes('DevicesNotFound')) {
        showToast('Nenhuma câmera encontrada. Use a opção de enviar imagem.', 'error');
      } else {
        showToast('Erro ao iniciar câmera: ' + msg, 'error');
      }
    }
  }

  // Tries multiple camera constraint strategies; returns true on success.
  async function _startCameraWithFallback(config) {
    // Strategy 1: Exact environment camera with ideal resolution
    try {
      await state.scanner.start(
        { facingMode: { exact: 'environment' } },
        config, onScanSuccess, () => {}
      );
      return true;
    } catch (e1) {
      console.warn('Camera strategy 1 failed:', e1.message || e1);
    }

    // Strategy 2: Non-exact environment (lets browser pick closest match)
    try {
      await state.scanner.start(
        { facingMode: 'environment' },
        config, onScanSuccess, () => {}
      );
      return true;
    } catch (e2) {
      console.warn('Camera strategy 2 failed:', e2.message || e2);
    }

    // Strategy 3: Enumerate cameras and pick the rear-facing one by label
    try {
      const cameras = await Html5Qrcode.getCameras();
      if (cameras && cameras.length > 0) {
        const backCam = cameras.find(c => /back|rear|trás|environment/i.test(c.label))
          || cameras[cameras.length - 1]; // Last device is usually rear on Android
        await state.scanner.start(
          backCam.id, config, onScanSuccess, () => {}
        );
        return true;
      }
    } catch (e3) {
      console.warn('Camera strategy 3 failed:', e3.message || e3);
    }

    return false;
  }

  async function stopScanner() {
    if (state.scanner && state.isScanning) {
      try {
        await state.scanner.stop();
        state.scanner.clear();
      } catch (err) {
        console.warn('Error stopping scanner:', err);
      }
    }
    state.isScanning = false;
    resetScannerUI();
  }

  function resetScannerUI() {
    dom.startScanBtn.classList.remove('hidden');
    dom.stopScanBtn.classList.add('hidden');
    dom.scannerPlaceholder.classList.remove('hidden');
    dom.scannerViewport.classList.remove('scanning');
    state.isScanning = false;
  }

  async function onScanSuccess(decodedText) {
    // Prevent rapid duplicate scans
    if (state.scanCooldown) return;
    state.scanCooldown = true;

    // Vibrate feedback
    if (navigator.vibrate) {
      navigator.vibrate(100);
    }

    // Play scan sound
    playBeep(true);

    try {
      showScanResult('loading', '⏳', 'Verificando...', 'Consultando a planilha...');

      const result = await apiPost({
        action: 'checkin',
        id: decodedText.trim()
      });

      if (result.status === 'success') {
        showScanResult('success', '✅', result.name, result.message);
        addToRecentCheckins(result.name);
        playBeep(true);
      } else if (result.status === 'already_checked_in') {
        showScanResult('duplicate', '⚠️', result.name, result.message);
        playBeep(false);
      } else if (result.status === 'not_found') {
        showScanResult('error', '❌', 'Não encontrado', result.message);
        playBeep(false);
      } else if (result.status === 'unauthorized') {
        showScanResult('error', '🔒', 'Não autorizado', 'Senha do servidor incorreta');
        playBeep(false);
      } else {
        showScanResult('error', '❌', 'Erro', result.message || 'Erro desconhecido');
        playBeep(false);
      }
    } catch (err) {
      console.error('Checkin error:', err);
      showScanResult('error', '❌', 'Erro de conexão', 'Verifique a internet e a URL do script');
      playBeep(false);
    }

    // Reset cooldown after delay
    setTimeout(() => {
      state.scanCooldown = false;
    }, 2500);
  }

  function showScanResult(type, icon, name, message) {
    dom.scanResult.className = `scan-result visible ${type}`;
    dom.resultIcon.textContent = icon;
    dom.resultName.textContent = name;
    dom.resultMessage.textContent = message;

    // Auto-hide after 4 seconds
    clearTimeout(state.resultTimeout);
    state.resultTimeout = setTimeout(() => {
      dom.scanResult.classList.remove('visible');
    }, 4000);
  }

  function addToRecentCheckins(name) {
    const checkin = {
      name: name,
      time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    };

    state.recentCheckins.unshift(checkin);
    if (state.recentCheckins.length > 50) {
      state.recentCheckins = state.recentCheckins.slice(0, 50);
    }

    localStorage.setItem(STORAGE_KEYS.recentCheckins, JSON.stringify(state.recentCheckins));

    // Refresh dashboard data in background
    refreshData();
  }

  // File upload fallback for QR scanning
  async function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    try {
      const scanner = new Html5Qrcode('scanner-view-temp-' + Date.now());

      // Create temporary div
      const tempDiv = document.createElement('div');
      tempDiv.id = scanner._elementId || 'temp-scan';
      tempDiv.style.display = 'none';
      document.body.appendChild(tempDiv);

      const result = await Html5Qrcode.scanFile(file, true);

      if (result) {
        await onScanSuccess(result);
      } else {
        showToast('QR Code não encontrado na imagem', 'error');
      }

      tempDiv.remove();
    } catch (err) {
      console.error('File scan error:', err);
      showToast('Não foi possível ler o QR Code da imagem', 'error');
    }

    // Reset file input
    event.target.value = '';
  }

  // ============================================
  // QR CODE GENERATION
  // ============================================
  async function loadAndGenerateQRCodes() {
    if (!state.scriptUrl) {
      showToast('Configure a URL do Apps Script primeiro', 'warning');
      navigateTo('config');
      return;
    }

    showLoading('Carregando participantes...');

    try {
      const data = await apiGet('list');

      if (data.status === 'success' && data.participants) {
        state.participants = data.participants;
        updateDashboard(data.stats);
        generateQRCards(data.participants);
        updateRecentList();
        showToast(`${data.participants.length} participantes carregados`, 'success');
      } else {
        showToast(data.message || 'Erro ao carregar', 'error');
      }
    } catch (err) {
      console.error('Load participants error:', err);
      showToast('Erro ao carregar participantes', 'error');
    }

    hideLoading();
  }

  function generateQRCards(participants) {
    // Clear grid
    dom.qrGrid.innerHTML = '';

    if (!participants || participants.length === 0) {
      dom.qrGrid.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📭</div>
          <p>Nenhum participante encontrado na planilha. Adicione participantes e tente novamente.</p>
        </div>
      `;
      return;
    }

    const participantsWithId = participants.filter(p => p.id);

    if (participantsWithId.length === 0) {
      dom.qrGrid.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🔑</div>
          <p>Participantes encontrados mas sem IDs. Vá em Configurações e clique em "Gerar IDs".</p>
        </div>
      `;
      return;
    }

    participantsWithId.forEach(participant => {
      const card = document.createElement('div');
      card.className = `qr-card${participant.status === 'present' ? ' checked-in' : ''}`;
      card.dataset.name = participant.name.toLowerCase();
      card.dataset.email = (participant.email || '').toLowerCase();
      card.dataset.id = participant.id;

      const qrDiv = document.createElement('div');
      qrDiv.className = 'qr-canvas-wrapper';
      card.appendChild(qrDiv);

      const nameEl = document.createElement('div');
      nameEl.className = 'qr-name';
      nameEl.textContent = participant.name;
      card.appendChild(nameEl);

      if (participant.email) {
        const emailEl = document.createElement('div');
        emailEl.className = 'qr-email';
        emailEl.textContent = participant.email;
        card.appendChild(emailEl);
      }

      // Generate QR code
      try {
        new QRCode(qrDiv, {
          text: participant.id,
          width: 140,
          height: 140,
          colorDark: '#0a1628',
          colorLight: '#ffffff',
          correctLevel: QRCode.CorrectLevel.M
        });
      } catch (err) {
        console.warn('QR generation failed for:', participant.name, err);
        qrDiv.innerHTML = '<p style="padding: 20px; font-size: 0.75rem; color: var(--error);">Erro ao gerar QR</p>';
      }

      // Click to expand
      card.addEventListener('click', () => openQRModal(participant));

      dom.qrGrid.appendChild(card);
    });
  }

  function filterQRCodes() {
    const query = dom.qrSearchInput.value.toLowerCase().trim();
    const cards = dom.qrGrid.querySelectorAll('.qr-card');

    cards.forEach(card => {
      const name = card.dataset.name || '';
      const email = card.dataset.email || '';
      const matches = name.includes(query) || email.includes(query);
      card.style.display = matches ? '' : 'none';
    });
  }

  // ============================================
  // QR MODAL
  // ============================================
  function openQRModal(participant) {
    dom.modalName.textContent = participant.name;
    dom.modalEmail.textContent = participant.email || participant.institution || '';
    dom.modalQrContainer.innerHTML = '';

    // Generate larger QR code
    try {
      new QRCode(dom.modalQrContainer, {
        text: participant.id,
        width: 250,
        height: 250,
        colorDark: '#0a1628',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.H
      });
    } catch (err) {
      dom.modalQrContainer.innerHTML = '<p style="color: var(--error);">Erro ao gerar QR Code</p>';
    }

    dom.qrModal.dataset.participantName = participant.name;
    dom.qrModal.classList.remove('hidden');
  }

  function closeModal() {
    dom.qrModal.classList.add('hidden');
  }

  function downloadModalQR() {
    const canvas = dom.modalQrContainer.querySelector('canvas');
    if (!canvas) {
      showToast('QR Code não disponível', 'error');
      return;
    }

    const name = dom.qrModal.dataset.participantName || 'qrcode';
    const link = document.createElement('a');
    link.download = `QR_${name.replace(/\s+/g, '_')}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();

    showToast('QR Code baixado com sucesso', 'success');
  }

  // ============================================
  // CONFIGURATION
  // ============================================
  function saveConfig() {
    const eventName = dom.configEventName.value.trim();
    const scriptUrl = dom.configScriptUrl.value.trim();

    if (!scriptUrl) {
      showToast('Preencha a URL do Google Apps Script', 'warning');
      return;
    }

    if (!scriptUrl.includes('script.google.com')) {
      showToast('URL inválida. Deve ser do Google Apps Script.', 'error');
      return;
    }

    state.eventName = eventName;
    state.scriptUrl = scriptUrl;

    localStorage.setItem(STORAGE_KEYS.eventName, eventName);
    localStorage.setItem(STORAGE_KEYS.scriptUrl, scriptUrl);

    dom.headerEventName.textContent = eventName || 'EventCheck';

    showToast('Configurações salvas com sucesso! ✅', 'success');
  }

  async function testConnection() {
    if (!state.scriptUrl) {
      showToast('Salve a URL do script primeiro', 'warning');
      return;
    }

    dom.testConnectionBtn.disabled = true;
    dom.testConnectionBtn.innerHTML = '<span class="spinner"></span> Testando...';

    try {
      const data = await apiGet('stats');

      if (data.status === 'success') {
        dom.connectionStatus.classList.remove('hidden', 'fail');
        dom.connectionStatus.classList.add('ok');
        dom.connectionIcon.textContent = '✅';
        dom.connectionText.textContent = `Conectado! ${data.stats.total} participantes na planilha.`;
        updateConnectionStatus(true);
        updateDashboard(data.stats);
        showToast('Conexão bem-sucedida!', 'success');
      } else if (data.status === 'unauthorized') {
        dom.connectionStatus.classList.remove('hidden', 'ok');
        dom.connectionStatus.classList.add('fail');
        dom.connectionIcon.textContent = '🔒';
        dom.connectionText.textContent = 'Senha do Apps Script não confere.';
        updateConnectionStatus(false);
      } else {
        throw new Error(data.message);
      }
    } catch (err) {
      dom.connectionStatus.classList.remove('hidden', 'ok');
      dom.connectionStatus.classList.add('fail');
      dom.connectionIcon.textContent = '❌';
      dom.connectionText.textContent = 'Falha na conexão: ' + err.message;
      updateConnectionStatus(false);
    }

    dom.testConnectionBtn.disabled = false;
    dom.testConnectionBtn.textContent = '🔗 Testar Conexão';
  }

  function updateConnectionStatus(connected) {
    dom.statusDot.className = `status-dot${connected ? ' connected' : ''}`;
    dom.statusText.textContent = connected ? 'Conectado' : 'Desconectado';
  }

  async function generateIds() {
    if (!state.scriptUrl) {
      showToast('Configure a URL do Apps Script primeiro', 'warning');
      return;
    }

    dom.generateIdsBtn.disabled = true;
    dom.generateIdsBtn.innerHTML = '<span class="spinner"></span> Gerando...';

    try {
      const result = await apiPost({ action: 'generate_ids' });

      if (result.status === 'success') {
        showToast(`${result.count} IDs gerados com sucesso! 🔑`, 'success');
      } else {
        showToast(result.message || 'Erro ao gerar IDs', 'error');
      }
    } catch (err) {
      showToast('Erro de conexão: ' + err.message, 'error');
    }

    dom.generateIdsBtn.disabled = false;
    dom.generateIdsBtn.textContent = '🔑 Gerar IDs para Participantes sem ID';
  }

  function clearLocalData() {
    if (confirm('Tem certeza que deseja limpar todos os dados locais? (As configurações serão mantidas)')) {
      state.recentCheckins = [];
      state.participants = [];
      localStorage.removeItem(STORAGE_KEYS.recentCheckins);
      localStorage.removeItem(STORAGE_KEYS.participants);

      // Reset dashboard
      dom.statTotal.textContent = '—';
      dom.statPresent.textContent = '—';
      dom.statAbsent.textContent = '—';
      dom.statPercentage.textContent = '—';
      updateRecentList();

      // Reset QR grid
      dom.qrGrid.innerHTML = `
        <div class="empty-state" id="empty-qr">
          <div class="empty-icon">📱</div>
          <p>Carregue os participantes da planilha para gerar os QR Codes.</p>
        </div>
      `;

      showToast('Dados locais limpos com sucesso', 'success');
    }
  }

  // ============================================
  // AUDIO FEEDBACK
  // ============================================
  function playBeep(success) {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      if (success) {
        // Pleasant ascending tone
        oscillator.frequency.setValueAtTime(587, ctx.currentTime); // D5
        oscillator.frequency.setValueAtTime(880, ctx.currentTime + 0.1); // A5
        gainNode.gain.setValueAtTime(0.15, ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
        oscillator.start(ctx.currentTime);
        oscillator.stop(ctx.currentTime + 0.25);
      } else {
        // Low warning tone
        oscillator.frequency.setValueAtTime(330, ctx.currentTime);
        oscillator.frequency.setValueAtTime(220, ctx.currentTime + 0.15);
        gainNode.gain.setValueAtTime(0.12, ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
        oscillator.start(ctx.currentTime);
        oscillator.stop(ctx.currentTime + 0.3);
      }
    } catch (err) {
      // Audio not supported — silent fallback
    }
  }

  // ============================================
  // UI HELPERS
  // ============================================
  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icons = {
      info: 'ℹ️',
      success: '✅',
      error: '❌',
      warning: '⚠️'
    };

    toast.innerHTML = `<span>${icons[type] || ''}</span><span>${escapeHtml(message)}</span>`;
    dom.toastContainer.appendChild(toast);

    // Auto remove
    setTimeout(() => {
      toast.classList.add('removing');
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  function showLoading(text = 'Carregando...') {
    dom.loadingText.textContent = text;
    dom.loadingOverlay.classList.remove('hidden');
  }

  function hideLoading() {
    dom.loadingOverlay.classList.add('hidden');
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ============================================
  // LAUNCH
  // ============================================
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
