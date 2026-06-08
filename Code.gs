/**
 * EventCheck — Google Apps Script Backend
 * 
 * INSTRUÇÕES DE INSTALAÇÃO:
 * 1. Abra sua planilha no Google Sheets
 * 2. Vá em Extensões → Apps Script
 * 3. Apague todo conteúdo e cole este código inteiro
 * 4. Clique em "Implantar" → "Nova implantação"
 * 5. Tipo: "App da Web"
 * 6. Executar como: "Eu"
 * 7. Quem tem acesso: "Qualquer pessoa"
 * 8. Clique em "Implantar" e copie a URL gerada
 * 9. Cole a URL no app EventCheck em Configurações
 *
 * FORMATO DA PLANILHA (primeira aba):
 * Coluna A: Nome
 * Coluna B: Email
 * Coluna C: Instituição
 * Coluna D: ID_Unico (gerado automaticamente)
 * Coluna E: Status (preenchido pelo app)
 * Coluna F: Data_Checkin (preenchido pelo app)
 *
 * A primeira linha deve ser o cabeçalho.
 */

// ============================================
// CONFIGURAÇÃO
// ============================================
const APP_PASSWORD = 'IFMSAFAPI123';

// ============================================
// HANDLERS HTTP
// ============================================

function doGet(e) {
  try {
    var params = e.parameter;
    
    // Verificar senha
    if (params.password !== APP_PASSWORD) {
      return jsonResponse({ status: 'unauthorized', message: 'Senha incorreta' });
    }
    
    var action = params.action || 'list';
    
    switch(action) {
      case 'list':
        return handleList();
      case 'stats':
        return handleStats();
      default:
        return jsonResponse({ status: 'error', message: 'Ação desconhecida: ' + action });
    }
    
  } catch(err) {
    return jsonResponse({ status: 'error', message: err.toString() });
  }
}

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    
    // Verificar senha
    if (data.password !== APP_PASSWORD) {
      return jsonResponse({ status: 'unauthorized', message: 'Senha incorreta' });
    }
    
    var action = data.action || '';
    
    switch(action) {
      case 'checkin':
        return handleCheckin(data.id);
      case 'generate_ids':
        return handleGenerateIds();
      default:
        return jsonResponse({ status: 'error', message: 'Ação desconhecida: ' + action });
    }
    
  } catch(err) {
    return jsonResponse({ status: 'error', message: err.toString() });
  }
}

// ============================================
// AÇÕES
// ============================================

/**
 * Lista todos os participantes
 */
function handleList() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var data = sheet.getDataRange().getValues();
  
  if (data.length <= 1) {
    return jsonResponse({ 
      status: 'success', 
      participants: [], 
      stats: { total: 0, present: 0, absent: 0, percentage: 0 } 
    });
  }
  
  var participants = [];
  var present = 0;
  var total = data.length - 1; // Exclui cabeçalho
  
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var name = row[0] || '';
    var email = row[1] || '';
    var institution = row[2] || '';
    var id = row[3] || '';
    var status = row[4] || '';
    var checkinDate = row[5] || '';
    
    // Pular linhas vazias
    if (!name && !email) continue;
    
    var isPresent = (status.toString().indexOf('Presente') > -1 || status.toString().indexOf('✅') > -1);
    if (isPresent) present++;
    
    participants.push({
      name: name.toString(),
      email: email.toString(),
      institution: institution.toString(),
      id: id.toString(),
      status: isPresent ? 'present' : 'absent',
      checkinDate: checkinDate ? checkinDate.toString() : ''
    });
  }
  
  // Recalcular total excluindo linhas vazias
  total = participants.length;
  var absent = total - present;
  var percentage = total > 0 ? Math.round((present / total) * 100) : 0;
  
  return jsonResponse({
    status: 'success',
    participants: participants,
    stats: {
      total: total,
      present: present,
      absent: absent,
      percentage: percentage
    }
  });
}

/**
 * Retorna apenas as estatísticas
 */
function handleStats() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var data = sheet.getDataRange().getValues();
  
  var total = 0;
  var present = 0;
  
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (!row[0] && !row[1]) continue; // Pular linhas vazias
    total++;
    var status = row[4] || '';
    if (status.toString().indexOf('Presente') > -1 || status.toString().indexOf('✅') > -1) {
      present++;
    }
  }
  
  return jsonResponse({
    status: 'success',
    stats: {
      total: total,
      present: present,
      absent: total - present,
      percentage: total > 0 ? Math.round((present / total) * 100) : 0
    }
  });
}

/**
 * Registra check-in de um participante
 */
function handleCheckin(participantId) {
  if (!participantId) {
    return jsonResponse({ status: 'error', message: 'ID do participante não fornecido' });
  }
  
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var data = sheet.getDataRange().getValues();
  
  for (var i = 1; i < data.length; i++) {
    var rowId = (data[i][3] || '').toString().trim();
    
    if (rowId === participantId.toString().trim()) {
      var currentStatus = (data[i][4] || '').toString();
      var name = data[i][0].toString();
      
      // Verificar se já fez check-in
      if (currentStatus.indexOf('Presente') > -1 || currentStatus.indexOf('✅') > -1) {
        var checkinDate = data[i][5] || '';
        return jsonResponse({ 
          status: 'already_checked_in', 
          name: name,
          message: 'Participante já registrado' + (checkinDate ? ' em ' + checkinDate.toString() : '')
        });
      }
      
      // Registrar presença
      var now = new Date();
      var formattedDate = Utilities.formatDate(now, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss');
      
      sheet.getRange(i + 1, 5).setValue('✅ Presente');  // Coluna E
      sheet.getRange(i + 1, 6).setValue(formattedDate);    // Coluna F
      
      return jsonResponse({ 
        status: 'success', 
        name: name,
        message: 'Check-in registrado com sucesso às ' + Utilities.formatDate(now, Session.getScriptTimeZone(), 'HH:mm')
      });
    }
  }
  
  return jsonResponse({ 
    status: 'not_found', 
    message: 'Participante não encontrado. ID: ' + participantId 
  });
}

/**
 * Gera IDs únicos para participantes que não possuem
 */
function handleGenerateIds() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var data = sheet.getDataRange().getValues();
  var count = 0;
  
  // Verificar se a primeira linha tem cabeçalho na coluna D
  if (data.length > 0 && !data[0][3]) {
    sheet.getRange(1, 4).setValue('ID_Unico');
  }
  if (data.length > 0 && !data[0][4]) {
    sheet.getRange(1, 5).setValue('Status');
  }
  if (data.length > 0 && !data[0][5]) {
    sheet.getRange(1, 6).setValue('Data_Checkin');
  }
  
  for (var i = 1; i < data.length; i++) {
    var name = data[i][0] || '';
    var existingId = (data[i][3] || '').toString().trim();
    
    // Gerar ID apenas se a linha tem nome e não tem ID
    if (name && !existingId) {
      var newId = generateUniqueId();
      sheet.getRange(i + 1, 4).setValue(newId);
      count++;
    }
  }
  
  return jsonResponse({ 
    status: 'success', 
    count: count,
    message: count + ' IDs gerados com sucesso'
  });
}

// ============================================
// UTILIDADES
// ============================================

/**
 * Gera um ID único no formato EVT-XXXXXX
 */
function generateUniqueId() {
  var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  var id = 'EVT-';
  for (var i = 0; i < 8; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
}

/**
 * Retorna uma resposta JSON formatada
 */
function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
