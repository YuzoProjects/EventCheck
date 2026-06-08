/**
EventCheck — Main Application Logic
Handles authentication, navigation, QR scanning, QR generation,
Google Sheets integration, and all UI interactions.
*/
(() => {
'use strict';

// ============================================
// CONFIGURATION & STATE
// ============================================
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
  app: $('#app'),
  headerEventName: $('#header-event-name'),
  statusDot: $('#status-dot'),
  statusText: $('#status-text'),
  refreshBtn: $('#refresh-btn'),
  logoutBtn: $('#logout-btn'),
  statTotal: $('#stat-total'),
  statPresent: $('#stat-present'),
  statAbsent: $('#stat-absent'),
  statPercentage: $('#stat-percentage'),
  recentList: $('#recent-list'),
  recentCount: $('#recent-count'),
  emptyRecent: $('#empty-recent'),
  scannerViewport: $('#scanner-viewport'),
  scannerPlaceholder: $('#scanner-placeholder'),
  startScanBtn: $('#start-scan-btn'),
  stopScanBtn: $('#stop-scan-btn'),
  scanResult: $('#scan-result'),
  resultIcon: $('#result-icon'),
  resultName: $('#result-name'),
  resultMessage: $('#result-message'),
  qrFileInput: $('#qr-file-input'),
  loadQrBtn: $('#load-qr-btn'),
  printQrBtn: $('#print-qr-btn'),
  qrSearchInput: $('#qr-search-input'),
  qrGrid: $('#qr-grid'),
  emptyQr: $('#empty-qr'),
  configEventName: $('#config-event-name'),
  configScriptUrl: $('#config-script-url'),
  saveConfigBtn: $('#save-config-btn'),
  testConnectionBtn: $('#test-connection-btn'),
  connectionStatus: $('#connection-status'),
  connectionIcon: $('#connection-icon'),
  connectionText: $('#connection-text'),
  generateIdsBtn: $('#generate-ids-btn'),
  clearDataBtn: $('#clear-data-btn'),
  bottomNav: $('#bottom-nav'),
  navItems: $$('.nav-item'),
  sections: $$('.section'),
  qrModal: $('#qr-modal'),
  modalName: $('#modal-name'),
  modalEmail: $('#modal-email'),
  modalQrContainer: $('#modal-qr-container'),
  modalDownloadBtn: $('#modal-download-btn'),
  modalCloseBtn: $('#modal-close-btn'),
  toastContainer: $('#toast-container'),
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
}

function loadConfig() {
  state.scriptUrl = localStorage.getItem(STORAGE_KEYS.scriptUrl) || '';
  state.eventName = localStorage.getItem(STORAGE_KEYS.eventName) || '';
  state.recentCheckins = JSON.parse(localStorage.getItem(STORAGE_KEYS.recentCheckins) || '[]');
  if (state.eventName) {
    dom.configEventName.value = state.eventName;
    dom.headerEventName.textContent = state.eventName;
  }
  if (state.scriptUrl) dom.configScriptUrl.value = state.scriptUrl;
  // Auto-connect if script URL is configured
  if (state.scriptUrl) { updateConnectionStatus(true); refreshData(); }
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
  dom.navItems.forEach(item => item.addEventListener('click', () => navigateTo(item.dataset.section)));
  dom.refreshBtn.addEventListener('click', refreshData);
  dom.logoutBtn.addEventListener('click', handleLogout);
  dom.startScanBtn.addEventListener('click', startScanner);
  dom.stopScanBtn.addEventListener('click', stopScanner);
  dom.qrFileInput.addEventListener('change', handleFileUpload);
  dom.loadQrBtn.addEventListener('click', loadAndGenerateQRCodes);
  dom.printQrBtn.addEventListener('click', () => window.print());
  dom.qrSearchInput.addEventListener('input', filterQRCodes);
  dom.saveConfigBtn.addEventListener('click', saveConfig);
  dom.testConnectionBtn.addEventListener('click', testConnection);
  dom.generateIdsBtn.addEventListener('click', generateIds);
  dom.clearDataBtn.addEventListener('click', clearLocalData);
  dom.modalCloseBtn.addEventListener('click', closeModal);
  dom.modalDownloadBtn.addEventListener('click', downloadModalQR);
  dom.qrModal.addEventListener('click', (e) => { if (e.target === dom.qrModal) closeModal(); });
}

// ============================================
// AUTHENTICATION (REMOVED - NO LOGIN REQUIRED)
// ============================================
function handleLogout() {
  // Clear local data and redirect to config for fresh setup
  if (confirm('Deseja limpar as configurações locais e desconectar?')) {
    localStorage.removeItem(STORAGE_KEYS.scriptUrl);
    localStorage.removeItem(STORAGE_KEYS.eventName);
    localStorage.removeItem(STORAGE_KEYS.recentCheckins);
    localStorage.removeItem(STORAGE_KEYS.participants);
    window.location.reload();
  }
}

// ============================================
// NAVIGATION
// ============================================
function navigateTo(sectionName) {
  if (state.isScanning && sectionName !== 'scanner') stopScanner();
  dom.navItems.forEach(item => item.classList.toggle('active', item.dataset.section === sectionName));
  dom.sections.forEach(section => {
    const isTarget = section.id === `${sectionName}-section`;
    section.classList.toggle('active', isTarget);
    if (isTarget) { section.style.animation = 'none'; section.offsetHeight; section.style.animation = ''; }
  });
}

// ============================================
// API COMMUNICATION
// ============================================
async function apiGet(action) {
  if (!state.scriptUrl) { showToast('Configure a URL do Apps Script primeiro', 'warning'); throw new Error('No script URL'); }
  const url = `${state.scriptUrl}?action=${action}&password=${encodeURIComponent()}&t=${Date.now()}`;
  const response = await fetch(url, { method: 'GET', redirect: 'follow' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function apiPost(data) {
  if (!state.scriptUrl) { showToast('Configure a URL do Apps Script primeiro', 'warning'); throw new Error('No script URL'); }
  const response = await fetch(state.scriptUrl, {
    method: 'POST', mode: 'cors',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    redirect: 'follow',
    body: JSON.stringify({ ...data, password:  })
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

// ============================================
// DATA REFRESH & DASHBOARD
// ============================================
async function refreshData() {
  if (!state.scriptUrl) { showToast('Configure a URL nas configurações', 'warning'); navigateTo('config'); return; }
  try {
    dom.refreshBtn.disabled = true; dom.refreshBtn.textContent = '⏳';
    const data = await apiGet('list');
    if (data.status === 'success') {
      state.participants = data.participants || [];
      updateDashboard(data.stats); updateConnectionStatus(true); updateRecentList();
      showToast('Dados atualizados com sucesso', 'success');
    } else if (data.status === 'unauthorized') { showToast('Senha incorreta', 'error'); updateConnectionStatus(false); }
    else showToast(data.message || 'Erro ao carregar', 'error');
  } catch (err) {
    console.error('Refresh error:', err); showToast('Erro de conexão.', 'error'); updateConnectionStatus(false);
  } finally { dom.refreshBtn.disabled = false; dom.refreshBtn.textContent = '🔄'; }
}

function updateDashboard(stats) {
  if (!stats) return;
  animateNumber(dom.statTotal, stats.total); animateNumber(dom.statPresent, stats.present);
  animateNumber(dom.statAbsent, stats.absent); animateNumber(dom.statPercentage, stats.percentage, '%');
}

function animateNumber(element, target, suffix = '') {
  const current = parseInt(element.textContent) || 0; const diff = target - current;
  if (diff === 0) { element.textContent = target + suffix; return; }
  const steps = 30; const stepValue = diff / steps; let step = 0;
  const interval = setInterval(() => {
    step++;
    if (step >= steps) { element.textContent = target + suffix; clearInterval(interval); }
    else element.textContent = Math.round(current + stepValue * step) + suffix;
  }, 600 / steps);
}

function updateRecentList() {
  const presentParticipants = state.participants.filter(p => p.status === 'present' && p.checkinDate)
    .sort((a, b) => parseDate(b.checkinDate) - parseDate(a.checkinDate)).slice(0, 20);
  if (presentParticipants.length === 0) {
    dom.emptyRecent.classList.remove('hidden'); dom.recentCount.textContent = '0 hoje';
    dom.recentList.querySelectorAll('.recent-item').forEach(i => i.remove()); return;
  }
  dom.emptyRecent.classList.add('hidden'); dom.recentCount.textContent = `${presentParticipants.length} registrados`;
  dom.recentList.querySelectorAll('.recent-item').forEach(i => i.remove());
  presentParticipants.forEach((p, index) => {
    const item = document.createElement('div'); item.className = 'recent-item'; item.style.animationDelay = `${index * 0.05}s`;
    item.innerHTML = `<div class="check-icon">✅</div><div class="item-info"><div class="item-name">${escapeHtml(p.name)}</div><div class="item-time">${p.checkinDate || 'Horário não registrado'}</div></div>`;
    dom.recentList.appendChild(item);
  });
}

function parseDate(dateStr) {
  if (!dateStr) return 0;
  const parts = dateStr.match(/(\d{2})\/(\d{2})\/(\d{4})\s*(\d{2}):(\d{2}):?(\d{2})?/);
  if (parts) return new Date(parts[3], parts[2] - 1, parts[1], parts[4], parts[5], parts[6] || 0).getTime();
  return 0;
}

// ============================================
// QR CODE SCANNER (OTIMIZADO PARA MOBILE)
// ============================================
async function startScanner() {
  if (state.isScanning) return;
  
  try {
    dom.startScanBtn.classList.add('hidden');
    dom.stopScanBtn.classList.remove('hidden');
    dom.scannerPlaceholder.classList.add('hidden');
    dom.scannerViewport.classList.add('scanning');
    
    state.scanner = new Html5Qrcode('scanner-view');

    const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.innerWidth < 768;
    const containerW = dom.scannerViewport.offsetWidth || Math.min(window.innerWidth - 40, 400);
    
    // QR Box maior no mobile para melhor captura
    const qrboxSize = isMobile ? Math.max(280, Math.floor(containerW * 0.75)) : Math.max(300, Math.floor(containerW * 0.7));

    const config = {
      fps: isMobile ? 15 : 10,
      qrbox: { width: qrboxSize, height: qrboxSize },
      disableFlip: false,
      experimentalFeatures: { useBarCodeDetectorIfSupported: true }
    };

    const started = await _startCameraWithFallback(config, isMobile);
    if (!started) throw new Error('Nenhuma câmera compatível encontrada.');

    state.isScanning = true;
    showToast('Scanner ativado. Aponte para um QR Code.', 'info');
  } catch (err) {
    console.error('Scanner error:', err);
    resetScannerUI();
    const msg = err.toString();
    if (msg.includes('Permission') || msg.includes('NotAllowed')) {
      showToast('Permissão de câmera negada. Verifique as configurações do navegador.', 'error');
    } else if (msg.includes('NotFound')) {
      showToast('Nenhuma câmera encontrada neste dispositivo.', 'error');
    } else if (msg.includes('NotReadable') || msg.includes('Could not start')) {
      showToast('Câmera já está em uso por outro aplicativo.', 'error');
    } else {
      showToast('Erro ao iniciar câmera: ' + err.message, 'error');
    }
  }
}

async function _startCameraWithFallback(config, isMobile) {
  const idealWidth = isMobile ? 1280 : 1920;
  const idealHeight = isMobile ? 720 : 1080;

  try {
    await state.scanner.start(
      { facingMode: { exact: 'environment' }, width: { ideal: idealWidth }, height: { ideal: idealHeight } },
      config, onScanSuccess, () => {}
    );
    return true;
  } catch (e1) { console.warn('Strategy 1 failed:', e1); }

  try {
    await state.scanner.start(
      { facingMode: 'environment', width: { ideal: idealWidth }, height: { ideal: idealHeight } },
      config, onScanSuccess, () => {}
    );
    return true;
  } catch (e2) { console.warn('Strategy 2 failed:', e2); }

  try {
    const cameras = await Html5Qrcode.getCameras();
    if (cameras && cameras.length > 0) {
      const backCam = cameras.find(c => /back|rear|trás|ambiente|environment|principal/i.test(c.label)) || cameras[cameras.length - 1];
      await state.scanner.start(backCam.id, config, onScanSuccess, () => {});
      return true;
    }
  } catch (e3) { console.warn('Strategy 3 failed:', e3); }

  try {
    await state.scanner.start({ facingMode: 'environment' }, config, onScanSuccess, () => {});
    return true;
  } catch (e4) { console.warn('Strategy 4 failed:', e4); }

  return false;
}

async function stopScanner() {
  if (state.scanner && state.isScanning) {
    try { await state.scanner.stop(); state.scanner.clear(); } catch (err) { console.warn('Error stopping:', err); }
  }
  state.isScanning = false; resetScannerUI();
}

function resetScannerUI() {
  dom.startScanBtn.classList.remove('hidden'); dom.stopScanBtn.classList.add('hidden');
  dom.scannerPlaceholder.classList.remove('hidden'); dom.scannerViewport.classList.remove('scanning');
  state.isScanning = false;
}

async function onScanSuccess(decodedText) {
  if (state.scanCooldown) return;
  state.scanCooldown = true;
  if (navigator.vibrate) navigator.vibrate(100);
  playBeep(true);

  try {
    showScanResult('loading', '⏳', 'Verificando...', 'Consultando a planilha...');
    const result = await apiPost({ action: 'checkin', id: decodedText.trim() });

    if (result.status === 'success') { showScanResult('success', '✅', result.name, result.message); addToRecentCheckins(result.name); playBeep(true); }
    else if (result.status === 'already_checked_in') { showScanResult('duplicate', '⚠️', result.name, result.message); playBeep(false); }
    else if (result.status === 'not_found') { showScanResult('error', '❌', 'Não encontrado', result.message); playBeep(false); }
    else if (result.status === 'unauthorized') { showScanResult('error', '🔒', 'Não autorizado', 'Senha incorreta'); playBeep(false); }
    else { showScanResult('error', '❌', 'Erro', result.message || 'Erro desconhecido'); playBeep(false); }
  } catch (err) {
    console.error('Checkin error:', err); showScanResult('error', '❌', 'Erro de conexão', 'Verifique a internet'); playBeep(false);
  }
  setTimeout(() => { state.scanCooldown = false; }, 2500);
}

function showScanResult(type, icon, name, message) {
  dom.scanResult.className = `scan-result visible ${type}`;
  dom.resultIcon.textContent = icon; dom.resultName.textContent = name; dom.resultMessage.textContent = message;
  clearTimeout(state.resultTimeout);
  state.resultTimeout = setTimeout(() => { dom.scanResult.classList.remove('visible'); }, 4000);
}

function addToRecentCheckins(name) {
  const checkin = { name: name, time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) };
  state.recentCheckins.unshift(checkin);
  if (state.recentCheckins.length > 50) state.recentCheckins = state.recentCheckins.slice(0, 50);
  localStorage.setItem(STORAGE_KEYS.recentCheckins, JSON.stringify(state.recentCheckins));
  refreshData();
}

async function handleFileUpload(event) {
  const file = event.target.files[0]; if (!file) return;
  try {
    const tempDiv = document.createElement('div'); tempDiv.id = 'temp-scan-' + Date.now(); tempDiv.style.display = 'none'; document.body.appendChild(tempDiv);
    const result = await Html5Qrcode.scanFile(file, true);
    if (result) await onScanSuccess(result); else showToast('QR Code não encontrado na imagem', 'error');
    tempDiv.remove();
  } catch (err) { console.error('File scan error:', err); showToast('Não foi possível ler o QR Code', 'error'); }
  event.target.value = '';
}

// ============================================
// QR CODE GENERATION (ALTA QUALIDADE)
// ============================================
async function loadAndGenerateQRCodes() {
  if (!state.scriptUrl) { showToast('Configure a URL primeiro', 'warning'); navigateTo('config'); return; }
  showLoading('Carregando participantes...');
  try {
    const data = await apiGet('list');
    if (data.status === 'success' && data.participants) {
      state.participants = data.participants; updateDashboard(data.stats); generateQRCards(data.participants); updateRecentList();
      showToast(`${data.participants.length} participantes carregados`, 'success');
    } else showToast(data.message || 'Erro ao carregar', 'error');
  } catch (err) { console.error(err); showToast('Erro ao carregar participantes', 'error'); }
  hideLoading();
}

function generateQRCards(participants) {
  dom.qrGrid.innerHTML = '';
  if (!participants || participants.length === 0) {
    dom.qrGrid.innerHTML = `<div class="empty-state"><div class="empty-icon">📭</div><p>Nenhum participante encontrado.</p></div>`; return;
  }
  const pWithId = participants.filter(p => p.id);
  if (pWithId.length === 0) {
    dom.qrGrid.innerHTML = `<div class="empty-state"><div class="empty-icon">🔑</div><p>Participantes sem IDs. Vá em Configurações e clique em "Gerar IDs".</p></div>`; return;
  }

  pWithId.forEach(participant => {
    const card = document.createElement('div');
    card.className = `qr-card${participant.status === 'present' ? ' checked-in' : ''}`;
    card.dataset.name = participant.name.toLowerCase(); card.dataset.email = (participant.email || '').toLowerCase(); card.dataset.id = participant.id;
    
    const qrDiv = document.createElement('div'); qrDiv.className = 'qr-canvas-wrapper'; card.appendChild(qrDiv);
    const nameEl = document.createElement('div'); nameEl.className = 'qr-name'; nameEl.textContent = participant.name; card.appendChild(nameEl);
    if (participant.email) { const emailEl = document.createElement('div'); emailEl.className = 'qr-email'; emailEl.textContent = participant.email; card.appendChild(emailEl); }

    try {
      new QRCode(qrDiv, {
        text: participant.id,
        width: 200, height: 200, // Tamanho aumentado para leitura facil
        colorDark: '#000000',    // Preto puro para maximo contraste
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.H // Nivel H (30% de correcao de erro)
      });
    } catch (err) { qrDiv.innerHTML = '<p style="padding: 20px; font-size: 0.75rem; color: var(--error);">Erro ao gerar QR</p>'; }

    card.addEventListener('click', () => openQRModal(participant));
    dom.qrGrid.appendChild(card);
  });
}

function filterQRCodes() {
  const query = dom.qrSearchInput.value.toLowerCase().trim();
  dom.qrGrid.querySelectorAll('.qr-card').forEach(card => {
    const matches = (card.dataset.name || '').includes(query) || (card.dataset.email || '').includes(query);
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
  try {
    new QRCode(dom.modalQrContainer, {
      text: participant.id,
      width: 280, height: 280, // Maior no modal
      colorDark: '#000000',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.H
    });
  } catch (err) { dom.modalQrContainer.innerHTML = '<p style="color: var(--error);">Erro ao gerar QR Code</p>'; }
  dom.qrModal.dataset.participantName = participant.name;
  dom.qrModal.classList.remove('hidden');
}

function closeModal() { dom.qrModal.classList.add('hidden'); }

function downloadModalQR() {
  const canvas = dom.modalQrContainer.querySelector('canvas');
  if (!canvas) { showToast('QR Code não disponível', 'error'); return; }
  const link = document.createElement('a');
  link.download = `QR_${(dom.qrModal.dataset.participantName || 'qrcode').replace(/\s+/g, '_')}.png`;
  link.href = canvas.toDataURL('image/png'); link.click();
  showToast('QR Code baixado com sucesso', 'success');
}

// ============================================
// CONFIGURATION
// ============================================
function saveConfig() {
  const eventName = dom.configEventName.value.trim(); const scriptUrl = dom.configScriptUrl.value.trim();
  if (!scriptUrl) { showToast('Preencha a URL do Apps Script', 'warning'); return; }
  if (!scriptUrl.includes('script.google.com')) { showToast('URL inválida.', 'error'); return; }
  state.eventName = eventName; state.scriptUrl = scriptUrl;
  localStorage.setItem(STORAGE_KEYS.eventName, eventName); localStorage.setItem(STORAGE_KEYS.scriptUrl, scriptUrl);
  dom.headerEventName.textContent = eventName || 'EventCheck';
  showToast('Configurações salvas com sucesso! ✅', 'success');
}

async function testConnection() {
  if (!state.scriptUrl) { showToast('Salve a URL primeiro', 'warning'); return; }
  dom.testConnectionBtn.disabled = true; dom.testConnectionBtn.innerHTML = '<span class="spinner"></span> Testando...';
  try {
    const data = await apiGet('stats');
    if (data.status === 'success') {
      dom.connectionStatus.classList.remove('hidden', 'fail'); dom.connectionStatus.classList.add('ok');
      dom.connectionIcon.textContent = '✅'; dom.connectionText.textContent = `Conectado! ${data.stats.total} participantes.`;
      updateConnectionStatus(true); updateDashboard(data.stats); showToast('Conexão bem-sucedida!', 'success');
    } else if (data.status === 'unauthorized') {
      dom.connectionStatus.classList.remove('hidden', 'ok'); dom.connectionStatus.classList.add('fail');
      dom.connectionIcon.textContent = '🔒'; dom.connectionText.textContent = 'Senha incorreta.'; updateConnectionStatus(false);
    } else throw new Error(data.message);
  } catch (err) {
    dom.connectionStatus.classList.remove('hidden', 'ok'); dom.connectionStatus.classList.add('fail');
    dom.connectionIcon.textContent = '❌'; dom.connectionText.textContent = 'Falha: ' + err.message; updateConnectionStatus(false);
  }
  dom.testConnectionBtn.disabled = false; dom.testConnectionBtn.textContent = '🔗 Testar Conexão';
}

function updateConnectionStatus(connected) {
  dom.statusDot.className = `status-dot${connected ? ' connected' : ''}`;
  dom.statusText.textContent = connected ? 'Conectado' : 'Desconectado';
}

async function generateIds() {
  if (!state.scriptUrl) { showToast('Configure a URL primeiro', 'warning'); return; }
  dom.generateIdsBtn.disabled = true; dom.generateIdsBtn.innerHTML = '<span class="spinner"></span> Gerando...';
  try {
    const result = await apiPost({ action: 'generate_ids' });
    if (result.status === 'success') showToast(`${result.count} IDs gerados! 🔑`, 'success');
    else showToast(result.message || 'Erro ao gerar', 'error');
  } catch (err) { showToast('Erro: ' + err.message, 'error'); }
  dom.generateIdsBtn.disabled = false; dom.generateIdsBtn.textContent = '🔑 Gerar IDs para Participantes sem ID';
}

function clearLocalData() {
  if (confirm('Tem certeza que deseja limpar os dados locais?')) {
    state.recentCheckins = []; state.participants = [];
    localStorage.removeItem(STORAGE_KEYS.recentCheckins); localStorage.removeItem(STORAGE_KEYS.participants);
    dom.statTotal.textContent = '—'; dom.statPresent.textContent = '—'; dom.statAbsent.textContent = '—'; dom.statPercentage.textContent = '—';
    updateRecentList();
    dom.qrGrid.innerHTML = `<div class="empty-state" id="empty-qr"><div class="empty-icon">📱</div><p>Carregue os participantes.</p></div>`;
    showToast('Dados locais limpos', 'success');
  }
}

// ============================================
// AUDIO & UI HELPERS
// ============================================
function playBeep(success) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)(); const osc = ctx.createOscillator(); const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    if (success) {
      osc.frequency.setValueAtTime(587, ctx.currentTime); osc.frequency.setValueAtTime(880, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.15, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.25);
    } else {
      osc.frequency.setValueAtTime(330, ctx.currentTime); osc.frequency.setValueAtTime(220, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.12, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.3);
    }
  } catch (err) {}
}

function showToast(message, type = 'info') {
  const toast = document.createElement('div'); toast.className = `toast ${type}`;
  const icons = { info: 'ℹ️', success: '✅', error: '❌', warning: '⚠️' };
  toast.innerHTML = `<span>${icons[type] || ''}</span><span>${escapeHtml(message)}</span>`;
  dom.toastContainer.appendChild(toast);
  setTimeout(() => { toast.classList.add('removing'); setTimeout(() => toast.remove(), 300); }, 3500);
}

function showLoading(text = 'Carregando...') { dom.loadingText.textContent = text; dom.loadingOverlay.classList.remove('hidden'); }
function hideLoading() { dom.loadingOverlay.classList.add('hidden'); }
function escapeHtml(text) { const div = document.createElement('div'); div.textContent = text; return div.innerHTML; }

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();