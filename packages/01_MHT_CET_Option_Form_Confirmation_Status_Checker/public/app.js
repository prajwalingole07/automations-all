// MHT CET Choice Filling Web Portal Client App

let studentsData = [];
let currentFilter = 'all';
let currentSearch = '';

document.addEventListener('DOMContentLoaded', () => {
  // Initialize Lucide Icons
  if (window.lucide) lucide.createIcons();

  // Setup Event Listeners
  setupEventListeners();

  // Initial Fetch & Start Polling Loop
  fetchStudents();
  fetchStatus();
  setInterval(() => {
    fetchStudents();
    fetchStatus();
  }, 1200);
});

function setupEventListeners() {
  // Search Box Input
  const searchInput = document.getElementById('search-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      currentSearch = e.target.value.toLowerCase();
      renderStudentsTable();
    });
  }

  // Filter Pills
  const filterBtns = document.querySelectorAll('.filter-btn');
  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter;
      renderStudentsTable();
    });
  });

  // Clear All Button
  const btnClearAll = document.getElementById('btn-clear-all');
  if (btnClearAll) {
    btnClearAll.addEventListener('click', async () => {
      if (confirm('Are you sure you want to clear all student records from the portal list?')) {
        try {
          await fetch('/api/students', { method: 'DELETE' });
          fetchStudents();
          fetchStatus();
        } catch (e) {}
      }
    });
  }

  // Run All Button
  const btnRunAll = document.getElementById('btn-run-all');
  if (btnRunAll) {
    btnRunAll.addEventListener('click', async () => {
      try {
        const res = await fetch('/api/automation/start-all', { method: 'POST' });
        const data = await res.json();
        alert(data.message || 'Queued all pending automations!');
        fetchStudents();
        fetchStatus();
      } catch (err) {
        alert('Failed to start batch automation: ' + err.message);
      }
    });
  }

  // Import Students Excel Button
  const btnImportExcel = document.getElementById('btn-import-excel');
  const importExcelInput = document.getElementById('import-excel-input');
  const modalImportProgress = document.getElementById('modal-import-progress');
  if (btnImportExcel && importExcelInput) {
    btnImportExcel.addEventListener('click', () => importExcelInput.click());
    importExcelInput.addEventListener('change', async () => {
      if (!importExcelInput.files.length) return;
      const file = importExcelInput.files[0];
      const formData = new FormData();
      formData.append('excel', file);

      if (modalImportProgress) modalImportProgress.classList.add('active');
      try {
        const res = await fetch('/api/students/import-excel', { method: 'POST', body: formData });
        const data = await res.json();
        if (modalImportProgress) modalImportProgress.classList.remove('active');
        if (data.success) {
          alert(data.message);
          fetchStudents();
        } else {
          alert('Import failed: ' + (data.error || 'Unknown error'));
        }
      } catch (err) {
        if (modalImportProgress) modalImportProgress.classList.remove('active');
        alert('Import failed: ' + err.message);
      } finally {
        importExcelInput.value = '';
      }
    });
  }

  // Check selected CAP round status for all students.
  const btnCheckAllStatus = document.getElementById('btn-check-all-status');
  const statusRoundSelect = document.getElementById('status-round-select');
  
  function syncRoundLabels() {
    const round = statusRoundSelect?.value || 'III';
    const thCapStatus = document.getElementById('th-cap-status');
    if (thCapStatus) thCapStatus.textContent = `CAP Round-${round} Status`;
    
    const btnCheckText = document.getElementById('btn-check-status-text');
    if (btnCheckText) btnCheckText.textContent = `Check CAP Round-${round} Status (All)`;

    const btnExportText = document.getElementById('btn-export-status-text');
    if (btnExportText) btnExportText.textContent = `Export Round-${round} Report`;

    renderStudentsTable();
  }

  if (statusRoundSelect) {
    statusRoundSelect.addEventListener('change', syncRoundLabels);
    syncRoundLabels();
  }

  if (btnCheckAllStatus) {
    btnCheckAllStatus.addEventListener('click', async () => {
      const round = statusRoundSelect?.value || 'III';
      if (!confirm(`This will log in as every student with saved credentials, one by one, and check their CAP Round-${round} option form status. Continue?`)) return;
      try {
        const res = await fetch('/api/status-check/start-all', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ round })
        });
        const data = await res.json();
        alert(data.message || `Queued CAP Round-${round} status checks for all students!`);
        fetchStudents();
        fetchStatus();
      } catch (err) {
        alert('Failed to start status checks: ' + err.message);
      }
    });
  }

  // Export Status Report Button
  const btnExportStatus = document.getElementById('btn-export-status');
  if (btnExportStatus) {
    btnExportStatus.addEventListener('click', () => {
      const round = statusRoundSelect?.value || 'III';
      window.location.href = `/api/status-check/export?round=${encodeURIComponent(round)}`;
    });
  }

  // Modals
  const modalScreenshot = document.getElementById('modal-screenshot');
  const closeScreenshotModal = document.getElementById('close-screenshot-modal');
  if (closeScreenshotModal) {
    closeScreenshotModal.addEventListener('click', () => {
      modalScreenshot.classList.remove('active');
    });
  }

  const modalAdd = document.getElementById('modal-add-student');
  const btnOpenAdd = document.getElementById('btn-open-add-modal');
  const closeAddModal = document.getElementById('close-add-modal');
  
  if (btnOpenAdd) {
    btnOpenAdd.addEventListener('click', () => {
      modalAdd.classList.add('active');
    });
  }
  if (closeAddModal) {
    closeAddModal.addEventListener('click', () => {
      modalAdd.classList.remove('active');
    });
  }

  // Add Student Form Submission
  const formAdd = document.getElementById('form-add-student');
  if (formAdd) {
    formAdd.addEventListener('submit', async (e) => {
      e.preventDefault();
      const regno = document.getElementById('add-regno').value.trim();
      const name = document.getElementById('add-name').value.trim();
      const email = document.getElementById('add-email').value.trim();
      const password = document.getElementById('add-password').value.trim();
      const pdfFileInput = document.getElementById('add-pdf');

      try {
        // Save student info first
        const res = await fetch('/api/students', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: regno, regNo: regno, name, email, password })
        });
        await res.json();

        // Upload PDF if selected
        if (pdfFileInput.files.length > 0) {
          const formData = new FormData();
          formData.append('pdf', pdfFileInput.files[0]);
          formData.append('name', name);
          formData.append('email', email);

          await fetch(`/api/students/${regno}/upload-pdf`, {
            method: 'POST',
            body: formData
          });
        }

        modalAdd.classList.remove('active');
        formAdd.reset();
        fetchStudents();
      } catch (err) {
        alert('Error saving student: ' + err.message);
      }
    });
  }
}

async function fetchStudents() {
  try {
    const res = await fetch('/api/students');
    const data = await res.json();
    if (data.success) {
      studentsData = data.students;
      updateMetrics();
      renderStudentsTable();
    }
  } catch (e) {}
}

async function fetchStatus() {
  try {
    const res = await fetch('/api/automation/status');
    const data = await res.json();
    if (data.success) {
      // Update Header Engine Badge
      const statusText = document.getElementById('engine-status-text');
      if (statusText) {
        if (data.isWorkerRunning) {
          statusText.textContent = `Automation Worker Active (${data.queueLength} Queued)`;
        } else if (data.queueLength > 0) {
          statusText.textContent = `Queue Pending (${data.queueLength} Jobs)`;
        } else {
          statusText.textContent = `Automation Queue Idle`;
        }
      }

      // Update Terminal Feed
      renderTerminalFeed(data.logs || []);
    }
  } catch (e) {}
}

function updateMetrics() {
  const totalStudents = studentsData.length;
  const readyStudents = studentsData.filter(s => s.hasPdf).length;
  const completedCount = studentsData.filter(s => s.status === 'Completed').length;
  const failedCount = studentsData.filter(s => s.status === 'Failed').length;

  const elemTotal = document.getElementById('stat-total-students');
  const elemReady = document.getElementById('stat-ready-students');
  const elemCompleted = document.getElementById('stat-completed-count');
  const elemFailed = document.getElementById('stat-failed-count');

  if (elemTotal) elemTotal.textContent = totalStudents;
  if (elemReady) elemReady.textContent = readyStudents;
  if (elemCompleted) elemCompleted.textContent = completedCount;

  if (elemFailed) {
    elemFailed.textContent = failedCount;
    if (failedCount > 0) {
      elemFailed.style.color = 'var(--crimson-danger)';
    } else {
      elemFailed.style.color = 'var(--text-main)';
    }
  }
}

function capStatusClass(status) {
  if (status === 'Confirmed') return 'status-completed';
  if (status === 'Not Confirmed') return 'status-failed';
  if (status === 'Login Failed' || status === 'Error') return 'status-failed';
  return 'status-pending';
}

function renderStudentsTable() {
  const selectedRound = document.getElementById('status-round-select')?.value || 'III';
  const tbody = document.getElementById('students-table-body');
  if (!tbody) return;

  // Track currently focused element before DOM updates
  const activeElem = document.activeElement;
  const focusedStudentId = activeElem?.dataset?.studentId;
  const focusedField = activeElem?.dataset?.field;
  const selectionStart = activeElem?.selectionStart;
  const selectionEnd = activeElem?.selectionEnd;

  const filtered = studentsData.filter(s => {
    const matchesFilter = currentFilter === 'all' || s.status === currentFilter;
    const matchesSearch = !currentSearch || 
      s.name.toLowerCase().includes(currentSearch) || 
      s.regNo.toLowerCase().includes(currentSearch) ||
      s.email.toLowerCase().includes(currentSearch);
    return matchesFilter && matchesSearch;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; padding: 40px; color: var(--text-muted);">
          No student records found in database. Click <strong>+ Add Student / PDF</strong> to add new candidate details.
        </td>
      </tr>
    `;
    return;
  }

  // Update existing rows or rebuild
  filtered.forEach(student => {
    let tr = tbody.querySelector(`tr[data-student-id="${student.id}"]`);
    const initials = student.name.split(' ').map(n => n[0]).slice(0, 2).join('');

    let statusClass = 'status-pending';
    if (student.status === 'Queued') statusClass = 'status-queued';
    if (student.status === 'Running') statusClass = 'status-running';
    if (student.status === 'Completed') statusClass = 'status-completed';
    if (student.status === 'Failed') statusClass = 'status-failed';

    const pdfBadge = student.hasPdf 
      ? `<span class="status-pill status-completed">✅ ${student.choicesCount} Choices Extracted</span>`
      : `<span class="status-pill status-pending">⚠️ PDF Needed</span>`;

    if (tr) {
      // Row already exists - update elements selectively without destroying inputs
      const emailInput = tr.querySelector(`input[data-field="email"]`);
      const passwordInput = tr.querySelector(`input[data-field="password"]`);
      
      // Update email/password value ONLY if not actively being focused/edited
      if (emailInput && document.activeElement !== emailInput) {
        if (emailInput.value !== student.email) emailInput.value = student.email;
      }
      if (passwordInput && document.activeElement !== passwordInput) {
        if (passwordInput.value !== student.password) passwordInput.value = student.password;
      }

      // Update progress bar
      const progressFill = tr.querySelector('.progress-fill');
      if (progressFill) progressFill.style.width = `${student.progress}%`;

      const progressLabel = tr.querySelector('.progress-label');
      if (progressLabel) {
        progressLabel.innerHTML = `<span>${student.stepName || 'Ready'}</span><span>${student.progress}%</span>`;
      }

      // Update status pill
      const statusCell = tr.querySelector('.status-cell');
      if (statusCell) {
        statusCell.innerHTML = `<span class="status-pill ${statusClass}">${student.status}</span>`;
      }

      // Update the selected CAP round status pill
      const capStatusCell = tr.querySelector('.cap-status-cell');
      if (capStatusCell) {
        const capStatus = student.capRoundStatuses?.[selectedRound] || 'Not Checked';
        const capStatusText = student.capRoundStatusText?.[selectedRound] || '';
        capStatusCell.innerHTML = `<span class="status-pill ${capStatusClass(capStatus)}" title="${capStatusText.replace(/"/g, '&quot;')}">${capStatus}</span>`;
      }

      // Update pdf badge
      const pdfCell = tr.querySelector('.pdf-cell');
      if (pdfCell) {
        pdfCell.innerHTML = pdfBadge;
      }

    } else {
      // Row doesn't exist, create it
      const newTr = document.createElement('tr');
      newTr.setAttribute('data-student-id', student.id);
      newTr.innerHTML = `
        <td>
          <div class="student-cell">
            <div class="student-avatar">${initials}</div>
            <div>
              <div class="student-name">${student.name}</div>
              <div class="student-reg">${student.regNo} • ${student.category || 'OPEN'}</div>
            </div>
          </div>
        </td>
        <td>
          <div style="display: flex; flex-direction: column; gap: 4px;">
            <input type="email" class="editable-input" 
                   data-student-id="${student.id}" 
                   data-field="email" 
                   value="${student.email}" 
                   onchange="updateStudentField('${student.id}', 'email', this.value)" 
                   placeholder="Email ID">
            <input type="text" class="editable-input" 
                   data-student-id="${student.id}" 
                   data-field="password" 
                   value="${student.password}" 
                   onchange="updateStudentField('${student.id}', 'password', this.value)" 
                   placeholder="Password">
          </div>
        </td>
        <td class="pdf-cell">
          ${pdfBadge}
        </td>
        <td>
          <div class="progress-container">
            <div class="progress-track">
              <div class="progress-fill" style="width: ${student.progress}%;"></div>
            </div>
            <div class="progress-label">
              <span>${student.stepName || 'Ready'}</span>
              <span>${student.progress}%</span>
            </div>
          </div>
        </td>
        <td class="status-cell">
          <span class="status-pill ${statusClass}">${student.status}</span>
        </td>
        <td class="cap-status-cell">
          <span class="status-pill ${capStatusClass(student.capRoundStatuses?.[selectedRound])}" title="${(student.capRoundStatusText?.[selectedRound] || '').replace(/"/g, '&quot;')}">${student.capRoundStatuses?.[selectedRound] || 'Not Checked'}</span>
        </td>
        <td style="text-align: right;">
          <div class="action-buttons" style="justify-content: flex-end;">
            <button class="icon-btn" title="Start Choice-Filling Automation" onclick="startSingleJob('${student.id}')">
              <i data-lucide="play"></i>
            </button>
            <button class="icon-btn" title="Check selected CAP round status" onclick="startSingleStatusCheck('${student.id}')">
              <i data-lucide="shield-check"></i>
            </button>
            ${student.screenshotUrl ? `
              <button class="icon-btn btn-screenshot" title="View Screenshot Proof" onclick="openScreenshot('${student.screenshotUrl}', '${student.name}')">
                <i data-lucide="image"></i>
              </button>
            ` : ''}
            <button class="icon-btn" title="Delete Student" style="color: var(--crimson-danger);" onclick="deleteSingleStudent('${student.id}')">
              <i data-lucide="trash-2"></i>
            </button>
          </div>
        </td>
      `;
      tbody.appendChild(newTr);
    }
  });

  // Remove rows that no longer exist in filtered
  const filteredIds = new Set(filtered.map(s => s.id));
  const currentRows = tbody.querySelectorAll('tr[data-student-id]');
  currentRows.forEach(row => {
    if (!filteredIds.has(row.dataset.studentId)) {
      row.remove();
    }
  });

  if (window.lucide) lucide.createIcons();

  // Restore focus if it was lost
  if (focusedStudentId && focusedField) {
    const targetInput = tbody.querySelector(`input[data-student-id="${focusedStudentId}"][data-field="${focusedField}"]`);
    if (targetInput && document.activeElement !== targetInput) {
      targetInput.focus();
      if (typeof selectionStart === 'number' && typeof selectionEnd === 'number') {
        try { targetInput.setSelectionRange(selectionStart, selectionEnd); } catch (e) {}
      }
    }
  }
}

async function updateStudentField(id, field, value) {
  try {
    const student = studentsData.find(s => s.id === id);
    if (!student) return;
    const body = { id: student.id, name: student.name, email: student.email, password: student.password };
    body[field] = value;
    await fetch('/api/students', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    student[field] = value;
  } catch (e) {}
}

async function deleteSingleStudent(id) {
  if (confirm('Are you sure you want to delete this student profile?')) {
    try {
      await fetch(`/api/students/${id}`, { method: 'DELETE' });
      fetchStudents();
      fetchStatus();
    } catch (e) {}
  }
}

async function startSingleJob(id) {
  try {
    const res = await fetch(`/api/automation/start/${id}`, { method: 'POST' });
    const data = await res.json();
    if (!data.success) alert(data.message);
    fetchStudents();
    fetchStatus();
  } catch (e) {
    alert('Failed to start job: ' + e.message);
  }
}

async function startSingleStatusCheck(id) {
  try {
    const round = document.getElementById('status-round-select')?.value || 'III';
    const res = await fetch(`/api/status-check/start/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ round })
    });
    const data = await res.json();
    if (!data.success) alert(data.message);
    fetchStudents();
    fetchStatus();
  } catch (e) {
    alert('Failed to start status check: ' + e.message);
  }
}

function openScreenshot(url, name) {
  const modal = document.getElementById('modal-screenshot');
  const img = document.getElementById('screenshot-img');
  const title = document.getElementById('screenshot-modal-title');
  if (modal && img) {
    img.src = url;
    if (title) title.textContent = `Verification Proof: ${name}`;
    modal.classList.add('active');
  }
}

function renderTerminalFeed(logs) {
  const feed = document.getElementById('terminal-feed');
  if (!feed) return;

  if (logs.length === 0) {
    feed.innerHTML = `<div class="terminal-line info"><span class="timestamp">[${new Date().toLocaleTimeString()}]</span> System ready. Waiting for jobs...</div>`;
    return;
  }

  feed.innerHTML = logs.map(log => {
    let logClass = 'info';
    if (log.type === 'error') logClass = 'error';
    if (log.type === 'success') logClass = 'success';
    return `<div class="terminal-line ${logClass}"><span class="timestamp">[${log.timestamp}]</span> ${log.message}</div>`;
  }).join('');
}
