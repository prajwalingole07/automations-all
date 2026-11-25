let studentsData = [];
let currentFilter = 'all';
let currentSearch = '';

document.addEventListener('DOMContentLoaded', () => {
  if (window.lucide) lucide.createIcons();
  setupEventListeners();
  fetchStudents();
  fetchStatus();
  setInterval(() => {
    fetchStudents();
    fetchStatus();
  }, 1200);
});

function setupEventListeners() {
  const searchInput = document.getElementById('search-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      currentSearch = e.target.value.toLowerCase();
      renderStudentsTable();
    });
  }
  const filterBtns = document.querySelectorAll('.filter-btn');
  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter;
      renderStudentsTable();
    });
  });
  const btnClearAll = document.getElementById('btn-clear-all');
  if (btnClearAll) {
    btnClearAll.addEventListener('click', async () => {
      if (confirm('Are you sure you want to clear all student records?')) {
        try {
          await fetch('/api/students', { method: 'DELETE' });
          fetchStudents();
          fetchStatus();
        } catch (e) {}
      }
    });
  }
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
  const formAdd = document.getElementById('form-add-student');
  if (formAdd) {
    formAdd.addEventListener('submit', async (e) => {
      e.preventDefault();
      const regno = document.getElementById('add-regno').value.trim();
      const name = document.getElementById('add-name').value.trim();
      const email = document.getElementById('add-email').value.trim();
      const password = document.getElementById('add-password').value.trim();
      const round = parseInt(document.getElementById('add-round').value || '1');
      const pdfFileInput = document.getElementById('add-pdf');
      if (!regno || !name || !email || !password) {
        alert('Please fill all required fields (Registration No, Name, Email, Password)');
        return;
      }
      const submitBtn = formAdd.querySelector('button[type="submit"]');
      const originalBtnHtml = submitBtn ? submitBtn.innerHTML : '';
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = `Saving...`;
      }
      try {
        const res = await fetch('/api/students', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: regno, regNo: regno, name, email, password, round })
        });
        const data = await res.json();
        if (!data.success) {
          alert('Failed to save: ' + (data.error || 'Unknown error'));
          return;
        }
        if (pdfFileInput.files.length > 0) {
          const formData = new FormData();
          formData.append('pdf', pdfFileInput.files[0]);
          formData.append('name', name);
          formData.append('email', email);
          const upRes = await fetch(`/api/students/${encodeURIComponent(regno)}/upload-pdf`, {
            method: 'POST',
            body: formData
          });
          const upData = await upRes.json();
          if (!upData.success) {
            alert('Student saved but PDF upload failed: ' + upData.error);
          }
        }
        modalAdd.classList.remove('active');
        formAdd.reset();
        await fetchStudents();
        alert('Student profile saved successfully!');
      } catch (err) {
        alert('Error saving student: ' + err.message);
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = originalBtnHtml;
          if (window.lucide) lucide.createIcons();
        }
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
      renderTerminalFeed(data.logs || []);
    }
  } catch (e) {}
}

function updateMetrics() {
  const totalStudents = studentsData.length;
  const readyStudents = studentsData.filter(s => s.hasPdf).length;
  const completedCount = studentsData.filter(s => s.status === 'Completed' || s.status === 'Completed (Partial)').length;
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

function renderStudentsTable() {
  const tbody = document.getElementById('students-table-body');
  if (!tbody) return;
  const activeElem = document.activeElement;
  const focusedStudentId = activeElem?.dataset?.studentId;
  const focusedField = activeElem?.dataset?.field;
  const selectionStart = activeElem?.selectionStart;
  const selectionEnd = activeElem?.selectionEnd;
  const filtered = studentsData.filter(s => {
    const matchesFilter = currentFilter === 'all' || s.status === currentFilter || (currentFilter === 'Completed' && s.status === 'Completed (Partial)');
    const matchesSearch = !currentSearch || s.name.toLowerCase().includes(currentSearch) || s.regNo.toLowerCase().includes(currentSearch) || s.email.toLowerCase().includes(currentSearch);
    return matchesFilter && matchesSearch;
  });
  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 40px; color: var(--text-muted);">No student records found. Click <strong>+ Add Student / PDF</strong> to add new candidate.</td></tr>`;
    return;
  }
  filtered.forEach(student => {
    let tr = tbody.querySelector(`tr[data-student-id="${student.id}"]`);
    const initials = student.name.split(' ').map(n => n[0]).slice(0, 2).join('');
    let statusClass = 'status-pending';
    if (student.status === 'Queued') statusClass = 'status-queued';
    if (student.status === 'Running') statusClass = 'status-running';
    if (student.status === 'Completed') statusClass = 'status-completed';
    if (student.status === 'Completed (Partial)') statusClass = 'status-partial';
    if (student.status === 'Failed') statusClass = 'status-failed';
    const pdfBadge = student.hasPdf ? `<span class="status-pill status-completed">✅ ${student.choicesCount} Choices</span>` : `<span class="status-pill status-pending">⚠️ PDF Needed</span>`;
    const currentRound = student.round || 1;
    const roundColors = {1:'#4ade80',2:'#60a5fa',3:'#f59e0b',4:'#a78bfa'};
    const roundColor = roundColors[currentRound] || '#4ade80';
    if (tr) {
      const emailInput = tr.querySelector(`input[data-field="email"]`);
      const passwordInput = tr.querySelector(`input[data-field="password"]`);
      const roundSelect = tr.querySelector(`select[data-field="round"]`);
      if (emailInput && document.activeElement !== emailInput) {
        if (emailInput.value !== student.email) emailInput.value = student.email;
      }
      if (passwordInput && document.activeElement !== passwordInput) {
        if (passwordInput.value !== student.password) passwordInput.value = student.password;
      }
      if (roundSelect && document.activeElement !== roundSelect) {
        if (parseInt(roundSelect.value) !== currentRound) roundSelect.value = String(currentRound);
      }
      const progressFill = tr.querySelector('.progress-fill');
      if (progressFill) progressFill.style.width = `${student.progress}%`;
      const progressLabel = tr.querySelector('.progress-label');
      if (progressLabel) {
        progressLabel.innerHTML = `<span>${student.stepName || 'Ready'}</span><span>${student.progress}%</span>`;
      }
      const statusCell = tr.querySelector('.status-cell');
      if (statusCell) {
        statusCell.innerHTML = `<span class="status-pill ${statusClass}">${student.status}</span>`;
      }
      const pdfCell = tr.querySelector('.pdf-cell');
      if (pdfCell) {
        pdfCell.innerHTML = pdfBadge;
      }
    } else {
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
            <input type="email" class="editable-input" data-student-id="${student.id}" data-field="email" value="${student.email}" onchange="updateStudentField('${student.id}', 'email', this.value)" placeholder="Email ID">
            <input type="text" class="editable-input" data-student-id="${student.id}" data-field="password" value="${student.password}" onchange="updateStudentField('${student.id}', 'password', this.value)" placeholder="Password">
          </div>
        </td>
        <td>
          <select class="editable-input" data-student-id="${student.id}" data-field="round" style="min-width: 110px; border-color: ${roundColor}44; color: ${roundColor};" onchange="updateStudentField('${student.id}', 'round', parseInt(this.value))">
            <option value="1" ${currentRound === 1 ? 'selected' : ''}>Round 1</option>
            <option value="2" ${currentRound === 2 ? 'selected' : ''}>Round 2</option>
            <option value="3" ${currentRound === 3 ? 'selected' : ''}>Round 3</option>
            <option value="4" ${currentRound === 4 ? 'selected' : ''}>Round 4</option>
          </select>
        </td>
        <td class="pdf-cell">${pdfBadge}</td>
        <td>
          <div class="progress-container">
            <div class="progress-track"><div class="progress-fill" style="width: ${student.progress}%;"></div></div>
            <div class="progress-label"><span>${student.stepName || 'Ready'}</span><span>${student.progress}%</span></div>
          </div>
        </td>
        <td class="status-cell"><span class="status-pill ${statusClass}">${student.status}</span></td>
        <td style="text-align: right;">
          <div class="action-buttons" style="justify-content: flex-end;">
            <button class="icon-btn" title="Start Automation (Round ${currentRound})" onclick="startSingleJob('${student.id}')"><i data-lucide="play"></i></button>
            ${student.screenshotUrl ? `<button class="icon-btn btn-screenshot" title="View Screenshot" onclick="openScreenshot('${student.screenshotUrl}', '${student.name}')"><i data-lucide="image"></i></button>` : ''}
            <button class="icon-btn" title="Delete Student" style="color: var(--crimson-danger);" onclick="deleteSingleStudent('${student.id}')"><i data-lucide="trash-2"></i></button>
          </div>
        </td>
      `;
      tbody.appendChild(newTr);
    }
  });
  const filteredIds = new Set(filtered.map(s => s.id));
  const currentRows = tbody.querySelectorAll('tr[data-student-id]');
  currentRows.forEach(row => {
    if (!filteredIds.has(row.dataset.studentId)) {
      row.remove();
    }
  });
  if (window.lucide) lucide.createIcons();
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
    const body = { id: student.id, name: student.name, email: student.email, password: student.password, round: student.round };
    body[field] = value;
    const res = await fetch('/api/students', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!data.success) alert('Update failed: ' + data.error);
    else student[field] = value;
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
    const tbody = document.getElementById('students-table-body');
    const tr = tbody ? tbody.querySelector(`tr[data-student-id="${id}"]`) : null;
    const roundSelect = tr ? tr.querySelector('select[data-field="round"]') : null;
    const round = roundSelect ? parseInt(roundSelect.value) : 1;
    const res = await fetch(`/api/automation/start/${encodeURIComponent(id)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ round })
    });
    const data = await res.json();
    if (!data.success) alert(data.message);
    fetchStudents();
    fetchStatus();
  } catch (e) {
    alert('Failed to start job: ' + e.message);
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
  const reversedLogs = [...logs].reverse();
  const isScrolledToBottom = feed.scrollHeight - feed.clientHeight <= feed.scrollTop + 10;
  feed.innerHTML = reversedLogs.map(log => {
    let logClass = 'info';
    if (log.type === 'error') logClass = 'error';
    if (log.type === 'success') logClass = 'success';
    return `<div class="terminal-line ${logClass}"><span class="timestamp">[${log.timestamp}]</span> ${log.message}</div>`;
  }).join('');
  if (isScrolledToBottom) {
    feed.scrollTop = feed.scrollHeight;
  }
}
