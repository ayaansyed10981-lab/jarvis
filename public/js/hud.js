let ws = null;
let isVoiceListening = false;
let speechRecognizer = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  setupTabs();
  initWebSocket();
  initTelemetryPolling();
  initWebSpeech();
  loadSqlSchema();
});

// Tab Switcher
function setupTabs() {
  const tabs = document.querySelectorAll('.tab-btn');
  tabs.forEach(btn => {
    btn.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      const target = document.getElementById(btn.dataset.tab);
      if (target) target.classList.add('active');
    });
  });
}

// WebSocket Connection
function initWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}`;
  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    console.log('[HUD] Connected to Jarvis core');
    document.getElementById('wsStatus').textContent = 'ONLINE (24/7)';
    document.getElementById('wsStatusDot').style.background = '#00ff88';
  };

  ws.onclose = () => {
    console.warn('[HUD] Disconnected. Reconnecting in 3s...');
    document.getElementById('wsStatus').textContent = 'RECONNECTING...';
    document.getElementById('wsStatusDot').style.background = '#ffb700';
    setTimeout(initWebSocket, 3000);
  };

  ws.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      handleWsMessage(msg);
    } catch (err) {}
  };
}

function handleWsMessage(msg) {
  if (msg.type === 'assistant_reply') {
    appendChatMessage('Jarvis', msg.reply);
    animateArcPulse();
  } else if (msg.type === 'wake') {
    appendChatMessage('System', `Wake word heard: "${msg.phrase}"`);
    triggerListeningState(true);
  }
}

// Telemetry Polling (every 5 seconds)
async function initTelemetryPolling() {
  async function poll() {
    try {
      const res = await fetch('/api/telemetry');
      if (res.ok) {
        const data = await res.json();
        document.getElementById('cpuBadge').textContent = `${data.cpuModel || 'Intel Core i5'} (${data.cpuCores} cores)`;
        document.getElementById('ramBadge').textContent = `RAM: ${data.memory.usedGB} / ${data.memory.totalGB} GB (${data.memory.percent}%)`;
        document.getElementById('uptimeBadge').textContent = `Uptime: ${data.uptimeMinutes}m`;
      }
    } catch (e) {}
  }
  poll();
  setInterval(poll, 5000);
}

// Web Speech API for Browser-based Voice
function initWebSpeech() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    console.log('Web Speech API not supported in this browser.');
    return;
  }

  speechRecognizer = new SpeechRecognition();
  speechRecognizer.continuous = false;
  speechRecognizer.interimResults = false;
  speechRecognizer.lang = 'en-US';

  speechRecognizer.onstart = () => {
    triggerListeningState(true);
  };

  speechRecognizer.onresult = (e) => {
    const transcript = e.results[0][0].transcript;
    triggerListeningState(false);
    appendChatMessage('You', transcript);
    sendTextCommand(transcript);
  };

  speechRecognizer.onerror = (e) => {
    triggerListeningState(false);
  };

  speechRecognizer.onend = () => {
    triggerListeningState(false);
  };
}

function toggleVoiceListen() {
  if (!speechRecognizer) {
    alert('Voice recognition is best experienced on Chrome/Edge or via native Windows microphone.');
    return;
  }
  if (isVoiceListening) {
    speechRecognizer.stop();
  } else {
    try { speechRecognizer.start(); } catch (e) {}
  }
}

function triggerListeningState(listening) {
  isVoiceListening = listening;
  const core = document.getElementById('arcCore');
  const label = document.getElementById('listeningStatus');
  if (listening) {
    core.classList.add('listening');
    label.textContent = 'Listening for your command...';
    label.style.color = '#ffb700';
  } else {
    core.classList.remove('listening');
    label.textContent = 'Say "Jarvis" or click the core to speak';
    label.style.color = '#7f9bb3';
  }
}

function animateArcPulse() {
  const core = document.getElementById('arcCore');
  core.style.transform = 'scale(1.15)';
  setTimeout(() => { core.style.transform = 'scale(1)'; }, 400);
}

// Chat UI
function appendChatMessage(sender, text) {
  const box = document.getElementById('chatMessages');
  const div = document.createElement('div');
  div.className = `msg ${sender === 'You' ? 'user' : 'jarvis'}`;
  div.innerHTML = `<strong>${sender}:</strong> ${formatText(text)}`;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

function formatText(t) {
  return t
    .replace(/\n/g, '<br>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

function handleChatSubmit(e) {
  e.preventDefault();
  const input = document.getElementById('chatInput');
  const val = input.value.trim();
  if (!val) return;
  appendChatMessage('You', val);
  input.value = '';
  sendTextCommand(val);
}

function sendTextCommand(text) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ action: 'text_command', text }));
  } else {
    appendChatMessage('System', 'Offline: Unable to send command to Jarvis core.');
  }
}

// Computer Control API Calls
async function sendSystemControl(action, params = {}) {
  try {
    const res = await fetch('/api/control', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...params })
    });
    const data = await res.json();
    if (action === 'screenshot' && data.success) {
      appendChatMessage('Jarvis', `Screenshot saved: ${data.filename}`);
    }
  } catch (err) {
    alert('Failed to send control command: ' + err.message);
  }
}

function adjustVolume(val) {
  document.getElementById('volValue').textContent = `${val}%`;
  sendSystemControl('volume', { level: parseInt(val, 10) });
}

// Coding Studio Actions
async function generateCode() {
  const task = document.getElementById('codeTaskInput').value.trim();
  const lang = document.getElementById('codeLangSelect').value;
  if (!task) return alert('Please enter a coding task or feature description.');

  document.getElementById('codeOutput').textContent = 'Jarvis is generating solution...';
  try {
    const res = await fetch('/api/code/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task, language: lang })
    });
    const data = await res.json();
    document.getElementById('codeOutput').textContent = data.code || data.error;
    document.getElementById('codePathLabel').textContent = `Saved to: ${data.filePath || 'None'}`;
    window.currentScriptPath = data.filePath;
  } catch (e) {
    document.getElementById('codeOutput').textContent = 'Error: ' + e.message;
  }
}

async function runCurrentScript() {
  if (!window.currentScriptPath) return alert('Generate code first or enter a script path.');
  document.getElementById('codeRunLogs').textContent = 'Running script on Intel Core i5...';
  try {
    const res = await fetch('/api/code/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filePath: window.currentScriptPath })
    });
    const data = await res.json();
    document.getElementById('codeRunLogs').textContent = 
      `Exit Code: ${data.exitCode} (${data.durationMs}ms)\n\n[STDOUT]\n${data.stdout || '(none)'}\n\n[STDERR]\n${data.stderr || '(none)'}`;
  } catch (e) {
    document.getElementById('codeRunLogs').textContent = 'Run error: ' + e.message;
  }
}

async function inspectCodeBugs() {
  const code = document.getElementById('bugCodeInput').value.trim();
  if (!code) return alert('Please paste some code to inspect.');

  document.getElementById('bugReportOutput').textContent = 'Scanning code for bugs and security vulnerabilities...';
  try {
    const res = await fetch('/api/code/debug', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code })
    });
    const data = await res.json();
    document.getElementById('bugReportOutput').textContent = data.analysis;
  } catch (e) {
    document.getElementById('bugReportOutput').textContent = 'Error: ' + e.message;
  }
}

// SQL Studio Actions
async function runCustomSql() {
  const sql = document.getElementById('sqlQueryInput').value.trim();
  if (!sql) return;

  document.getElementById('sqlResultText').textContent = 'Executing SQL...';
  try {
    const res = await fetch('/api/sql/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql })
    });
    const data = await res.json();
    if (data.success && data.type === 'SELECT') {
      document.getElementById('sqlResultText').textContent = `${data.rowCount} rows retrieved in ${data.durationMs}ms`;
      renderSqlTable(data.columns, data.rows);
    } else if (data.success) {
      document.getElementById('sqlResultText').textContent = `Success: ${data.message} (${data.durationMs}ms)`;
      document.getElementById('sqlTableContainer').innerHTML = '';
    } else {
      document.getElementById('sqlResultText').textContent = `SQL Error: ${data.error}`;
      document.getElementById('sqlTableContainer').innerHTML = '';
    }
  } catch (e) {
    document.getElementById('sqlResultText').textContent = 'Error: ' + e.message;
  }
}

async function solveNaturalSql() {
  const query = document.getElementById('sqlNaturalInput').value.trim();
  if (!query) return;

  document.getElementById('sqlResultText').textContent = 'Jarvis is formulating SQL query...';
  try {
    const res = await fetch('/api/sql/solve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query })
    });
    const data = await res.json();
    document.getElementById('sqlQueryInput').value = data.sql;
    document.getElementById('sqlResultText').textContent = `Generated SQL: ${data.sql}\n\nExplanation: ${data.explanation}`;
    if (data.execution && data.execution.success && data.execution.rows) {
      renderSqlTable(data.execution.columns, data.execution.rows);
    }
  } catch (e) {
    document.getElementById('sqlResultText').textContent = 'Error: ' + e.message;
  }
}

function renderSqlTable(columns, rows) {
  const container = document.getElementById('sqlTableContainer');
  if (!rows || rows.length === 0) {
    container.innerHTML = '<p style="color:#7f9bb3; padding:10px;">(0 rows returned)</p>';
    return;
  }

  let html = '<table><thead><tr>';
  columns.forEach(c => { html += `<th>${c}</th>`; });
  html += '</tr></thead><tbody>';

  rows.forEach(r => {
    html += '<tr>';
    columns.forEach(c => { html += `<td>${r[c] !== null ? r[c] : 'NULL'}</td>`; });
    html += '</tr>';
  });

  html += '</tbody></table>';
  container.innerHTML = html;
}

async function loadSqlSchema() {
  try {
    const res = await fetch('/api/sql/schema');
    const data = await res.json();
    const tree = document.getElementById('schemaTree');
    let str = '';
    for (const [table, cols] of Object.entries(data.schema || {})) {
      str += `<strong>${table}</strong>:\n`;
      cols.forEach(c => {
        str += `  • ${c.column} (${c.type})${c.primaryKey ? ' [PK]' : ''}\n`;
      });
      str += '\n';
    }
    tree.textContent = str;
  } catch (e) {}
}

// Video & Animation Studio
async function createAnimatedCharacter() {
  const name = document.getElementById('charNameInput').value.trim() || 'Jarvis Robot';
  const dialogue = document.getElementById('charDialogueInput').value.trim() || 'Ready for operations, sir.';

  try {
    const res = await fetch('/api/characters/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, dialogue })
    });
    const data = await res.json();
    document.getElementById('characterResult').innerHTML = 
      `<p style="color:#00ff88; margin-top:10px;">Character Package Generated: <strong>${data.name}</strong></p>
       <p style="color:#7f9bb3; font-size:12px;">Saved at: ${data.htmlFile}</p>
       <a href="/characters/${encodeURIComponent(data.name.toLowerCase().replace(/[^a-z0-9]/g, '_'))}.html" target="_blank" style="color:#00f0ff; text-decoration:underline; display:inline-block; margin-top:8px;">Open Interactive Character in New Tab</a>`;
  } catch (e) {
    alert('Failed: ' + e.message);
  }
}
