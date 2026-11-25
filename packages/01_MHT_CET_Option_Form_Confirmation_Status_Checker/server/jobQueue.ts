import fs from 'fs';
import path from 'path';
import XLSX from 'xlsx';
import { parseStudentPdf, ChoiceItem } from '../src/pdfParser';
import { runStudentAutomation } from '../src/automationEngine';
import { CapRound, CapRoundStatus, runStatusCheck } from '../src/statusCheckEngine';

export interface StudentRecord {
  id: string;
  name: string;
  regNo: string;
  email: string;
  password: string;
  category: string;
  counselor: string;
  pdfFileName?: string;
  hasPdf: boolean;
  choicesCount: number;
  choices: ChoiceItem[];
  status: 'Pending' | 'Queued' | 'Running' | 'Completed' | 'Failed';
  progress: number;
  stepName: string;
  screenshotUrl?: string;
  error?: string;
  lastUpdated: string;
  // CAP Round-III status-check result (separate from the choice-filling automation above)
  capRoundStatuses?: Partial<Record<CapRound, CapRoundStatus>>;
  capRoundStatusText?: Partial<Record<CapRound, string>>;
  capRoundCheckedAt?: Partial<Record<CapRound, string>>;
  capRoundScreenshotUrl?: Partial<Record<CapRound, string>>;
  capRound3StatusText?: string;
  capRound3CheckedAt?: string;
  capRound3ScreenshotUrl?: string;
}

export interface ActivityLog {
  timestamp: string;
  studentId?: string;
  studentName?: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
}

type JobMode = 'FILL_CHOICES' | 'CHECK_STATUS';

interface QueuedJob {
  studentId: string;
  mode: JobMode;
  round?: CapRound;
}

class StudentJobManager {
  private studentsMap = new Map<string, StudentRecord>();
  private jobQueue: QueuedJob[] = [];
  private isWorkerRunning = false;
  private logs: ActivityLog[] = [];
  private dbFilePath = path.join(__dirname, '..', 'students_db.json');
  private pdfFolder = path.join(__dirname, '..', 'STUDENTS PREFERENCE LIST');

  constructor() {
    this.initStorage();
  }

  private initStorage() {
    this.addLog('System initialized. Ready for student choice filling...', 'info');

    // Read existing database if available
    if (fs.existsSync(this.dbFilePath)) {
      try {
        const raw = fs.readFileSync(this.dbFilePath, 'utf-8');
        const existingData: Record<string, StudentRecord> = JSON.parse(raw);
        for (const [id, record] of Object.entries(existingData)) {
          this.studentsMap.set(id, record);
        }
      } catch (e) {}
    }
  }

  public async refreshPdfs() {
    for (const [id, student] of Array.from(this.studentsMap.entries())) {
      if (student.pdfFileName) {
        const pdfPath = path.join(this.pdfFolder, student.pdfFileName);
        if (fs.existsSync(pdfPath)) {
          try {
            const data = await parseStudentPdf(pdfPath);
            student.name = data.studentName;
            student.regNo = data.registrationNo;
            student.category = data.category;
            student.counselor = data.counselor;
            student.choices = data.choices;
            student.choicesCount = data.choices.length;
            student.hasPdf = true;
          } catch (err: any) {
            this.addLog(`Failed to parse PDF for ${student.name}: ${err.message}`, 'error');
          }
        }
      }
    }
    this.saveStorage();
  }

  public saveStorage() {
    const obj: Record<string, StudentRecord> = {};
    this.studentsMap.forEach((v, k) => {
      obj[k] = v;
    });
    fs.writeFileSync(this.dbFilePath, JSON.stringify(obj, null, 2));
  }

  public addLog(message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info', studentId?: string, studentName?: string) {
    const entry: ActivityLog = {
      timestamp: new Date().toLocaleTimeString(),
      studentId,
      studentName,
      message,
      type
    };
    this.logs.unshift(entry);
    if (this.logs.length > 100) this.logs.pop();
  }

  public getStudents(): StudentRecord[] {
    return Array.from(this.studentsMap.values());
  }

  public getStudent(id: string): StudentRecord | undefined {
    return this.studentsMap.get(id);
  }

  public deleteStudent(id: string): boolean {
    const student = this.studentsMap.get(id);
    if (student) {
      this.studentsMap.delete(id);
      this.saveStorage();
      this.addLog(`Removed student ${student.name} (${id})`, 'warning', id, student.name);
      return true;
    }
    return false;
  }

  public clearAllStudents(): void {
    this.studentsMap.clear();
    this.saveStorage();
    this.addLog(`Cleared all student records from database`, 'warning');
  }

  public addOrUpdateStudent(data: Partial<StudentRecord> & { id?: string; name: string; email: string }): StudentRecord {
    const id = data.id || data.regNo || `STU_${Date.now()}`;
    const existing = this.studentsMap.get(id) || {
      id,
      name: data.name,
      regNo: data.regNo || id,
      email: data.email,
      password: data.password || 'Pass@123',
      category: 'OPEN',
      counselor: 'Sunil Govindpurkar',
      hasPdf: false,
      choicesCount: 0,
      choices: [],
      status: 'Pending',
      progress: 0,
      stepName: 'Ready',
      lastUpdated: new Date().toISOString()
    };

    if (data.email) existing.email = data.email;
    if (data.password) existing.password = data.password;
    if (data.name) existing.name = data.name;
    if (data.regNo) existing.regNo = data.regNo;
    if (data.pdfFileName) existing.pdfFileName = data.pdfFileName;

    existing.lastUpdated = new Date().toISOString();
    this.studentsMap.set(id, existing);
    this.saveStorage();
    this.addLog(`Updated credentials/profile for ${existing.name}`, 'info', id, existing.name);
    return existing;
  }

  public importFromExcel(filePath: string): { added: number; updated: number; skipped: number; total: number } {
    const wb = XLSX.readFile(filePath);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' });

    let added = 0;
    let updated = 0;
    let skipped = 0;

    for (const r of rows) {
      const regNo = String(r['REGNO'] ?? r['Reg No'] ?? r['regno'] ?? '').trim();
      const name = String(r['NAME'] ?? r['Name'] ?? '').trim();
      // Source files have been seen with a trailing space in the header: "LOGIN ID "
      const loginId = String(r['LOGIN ID '] ?? r['LOGIN ID'] ?? r['Login Id'] ?? r['EMAIL'] ?? '').trim();
      const password = String(r['PASSWORD'] ?? r['Password'] ?? '').trim();

      if (!regNo || !name) {
        skipped++;
        continue;
      }
      if (!loginId || !password) {
        // Still add the student record so they're visible in the portal, just without credentials yet.
        skipped++;
      }

      const existedBefore = this.studentsMap.has(regNo);
      this.addOrUpdateStudent({
        id: regNo,
        regNo,
        name,
        email: loginId || `${regNo.toLowerCase()}@example.com`,
        password: password || undefined
      });
      if (existedBefore) updated++; else added++;
    }

    this.addLog(`📥 Imported Excel: ${added} added, ${updated} updated, ${skipped} rows had missing/blank fields.`, 'info');
    this.saveStorage();

    return { added, updated, skipped, total: rows.length };
  }

  public enqueueJob(studentId: string): { success: boolean; message: string } {
    const student = this.studentsMap.get(studentId);
    if (!student) {
      return { success: false, message: 'Student not found.' };
    }

    if (student.status === 'Running' || student.status === 'Queued') {
      return { success: false, message: `Job for ${student.name} is already ${student.status}.` };
    }

    student.status = 'Queued';
    student.progress = 0;
    student.stepName = 'Waiting in Queue';
    student.error = undefined;
    this.jobQueue.push({ studentId, mode: 'FILL_CHOICES' });
    this.saveStorage();

    this.addLog(`Enqueued automation job for ${student.name}`, 'info', studentId, student.name);
    this.processQueue();

    return { success: true, message: `Enqueued automation job for ${student.name}` };
  }

  public enqueueAll(): { count: number } {
    let count = 0;
    for (const student of Array.from(this.studentsMap.values())) {
      if (student.hasPdf && student.status !== 'Running' && student.status !== 'Queued') {
        student.status = 'Queued';
        student.progress = 0;
        student.stepName = 'Waiting in Queue';
        student.error = undefined;
        this.jobQueue.push({ studentId: student.id, mode: 'FILL_CHOICES' });
        count++;
      }
    }
    this.saveStorage();
    this.addLog(`Enqueued batch automation for ${count} students.`, 'info');
    this.processQueue();
    return { count };
  }

  public enqueueStatusCheck(studentId: string, round: CapRound = 'III'): { success: boolean; message: string } {
    const student = this.studentsMap.get(studentId);
    if (!student) {
      return { success: false, message: 'Student not found.' };
    }
    if (!student.email || !student.password) {
      return { success: false, message: `${student.name} is missing login credentials.` };
    }
    if (student.status === 'Running' || student.status === 'Queued') {
      return { success: false, message: `Job for ${student.name} is already ${student.status}.` };
    }

    student.status = 'Queued';
    student.progress = 0;
    student.stepName = 'Waiting in Queue (Status Check)';
    student.error = undefined;
    this.jobQueue.push({ studentId, mode: 'CHECK_STATUS', round });
    this.saveStorage();

    this.addLog(`Enqueued CAP Round-${round} status check for ${student.name}`, 'info', studentId, student.name);
    this.processQueue();

    return { success: true, message: `Enqueued status check for ${student.name}` };
  }

  public enqueueStatusCheckAll(round: CapRound = 'III'): { count: number; skipped: number } {
    let count = 0;
    let skipped = 0;
    for (const student of Array.from(this.studentsMap.values())) {
      if (student.status === 'Running' || student.status === 'Queued') {
        continue;
      }
      if (!student.email || !student.password) {
        skipped++;
        continue;
      }
      student.status = 'Queued';
      student.progress = 0;
      student.stepName = 'Waiting in Queue (Status Check)';
      student.error = undefined;
      this.jobQueue.push({ studentId: student.id, mode: 'CHECK_STATUS', round });
      count++;
    }
    this.saveStorage();
    this.addLog(`Enqueued CAP Round-${round} status check for ${count} students (${skipped} skipped: missing credentials).`, 'info');
    this.processQueue();
    return { count, skipped };
  }

  private async processQueue() {
    if (this.isWorkerRunning || this.jobQueue.length === 0) return;

    this.isWorkerRunning = true;
    const job = this.jobQueue.shift()!;
    const student = this.studentsMap.get(job.studentId);

    if (!student) {
      this.isWorkerRunning = false;
      this.processQueue();
      return;
    }

    student.status = 'Running';
    student.progress = 5;
    student.stepName = job.mode === 'CHECK_STATUS' ? 'Starting Status-Check Worker' : 'Starting Worker';
    this.saveStorage();
    this.addLog(
      job.mode === 'CHECK_STATUS'
        ? `▶ Started status-check worker for ${student.name}`
        : `▶ Started Playwright automation worker for ${student.name}`,
      'info',
      student.id,
      student.name
    );

    try {
      if (job.mode === 'CHECK_STATUS') {
        const round = job.round || 'III';
        const result = await runStatusCheck(
          {
            studentId: student.id,
            studentName: student.name,
            email: student.email,
            password: student.password,
            round
          },
          {
            onProgress: (percent, stepName) => {
              student.progress = percent;
              student.stepName = stepName;
              this.saveStorage();
            },
            onLog: (msg) => {
              const isError = msg.includes('❌');
              const isSuccess = msg.includes('✅') || msg.includes('🎉');
              const type = isError ? 'error' : isSuccess ? 'success' : 'info';
              this.addLog(msg, type, student.id, student.name);
            }
          }
        );

        student.capRoundStatusText = student.capRoundStatusText || {};
        student.capRoundCheckedAt = student.capRoundCheckedAt || {};
        student.capRoundScreenshotUrl = student.capRoundScreenshotUrl || {};
        student.capRoundStatuses = student.capRoundStatuses || {};
        student.capRoundStatusText[round] = result.statusText || '';
        student.capRoundCheckedAt[round] = new Date().toISOString();
        if (result.screenshotUrl) student.capRoundScreenshotUrl[round] = result.screenshotUrl;

        if (result.success) {
          student.capRoundStatuses[round] = result.capStatus;
          student.status = 'Completed';
          student.progress = 100;
          student.stepName = `CAP Round-${round}: ${result.capStatus}`;
          student.error = undefined;
          this.addLog(`🎉 Status check COMPLETED for ${student.name}: ${result.capStatus}`, 'success', student.id, student.name);
        } else {
          student.capRoundStatuses[round] = result.capStatus === 'Login Failed' ? 'Login Failed' : 'Error';
          student.status = 'Failed';
          student.progress = 0;
          student.stepName = 'Failed';
          student.error = result.error || 'Status check failed';
          this.addLog(`❌ Status check FAILED for ${student.name}: ${student.error}`, 'error', student.id, student.name);
        }
      } else {
        const result = await runStudentAutomation(
          {
            studentId: student.id,
            studentName: student.name,
            email: student.email,
            password: student.password,
            choices: student.choices
          },
          {
            onProgress: (percent, stepName) => {
              student.progress = percent;
              student.stepName = stepName;
              this.saveStorage();
            },
            onLog: (msg) => {
              const isError = msg.includes('❌');
              const isSuccess = msg.includes('✅') || msg.includes('🎉');
              const type = isError ? 'error' : isSuccess ? 'success' : 'info';
              this.addLog(msg, type, student.id, student.name);
            }
          }
        );

        if (result.success) {
          student.status = 'Completed';
          student.progress = 100;
          student.stepName = 'Dashboard Reached & Proof Saved';
          student.screenshotUrl = result.screenshotUrl;
          student.error = undefined;
          this.addLog(`🎉 Automation COMPLETED for ${student.name}!`, 'success', student.id, student.name);
        } else {
          student.status = 'Failed';
          student.progress = 0;
          student.stepName = 'Failed';
          student.error = result.error || 'Automation failed';
          if (result.screenshotUrl) student.screenshotUrl = result.screenshotUrl;
          this.addLog(`❌ Automation FAILED for ${student.name}: ${student.error}`, 'error', student.id, student.name);
        }
      }
    } catch (err: any) {
      student.status = 'Failed';
      student.progress = 0;
      student.stepName = 'Failed';
      student.error = err.message;
      this.addLog(`❌ Unexpected Exception for ${student.name}: ${err.message}`, 'error', student.id, student.name);
    } finally {
      this.saveStorage();
      this.isWorkerRunning = false;
      // Process next job in queue
      setTimeout(() => this.processQueue(), 1000);
    }
  }

  public exportStatusReportBuffer(round: CapRound = 'III'): Buffer {
    const rows = Array.from(this.studentsMap.values()).map((s) => ({
      REGNO: s.regNo,
      NAME: s.name,
      'LOGIN ID': s.email,
      [`CAP ROUND-${round} STATUS`]: s.capRoundStatuses?.[round] || 'Not Checked Yet',
      'RAW STATUS TEXT': s.capRoundStatusText?.[round] || '',
      'CHECKED AT': s.capRoundCheckedAt?.[round] || ''
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [
      { wch: 12 },
      { wch: 32 },
      { wch: 30 },
      { wch: 20 },
      { wch: 50 },
      { wch: 22 }
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `CAP Round-${round} Status`);
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }

  public getStatus() {
    return {
      queueLength: this.jobQueue.length,
      isWorkerRunning: this.isWorkerRunning,
      totalStudents: this.studentsMap.size,
      completedCount: Array.from(this.studentsMap.values()).filter(s => s.status === 'Completed').length,
      failedCount: Array.from(this.studentsMap.values()).filter(s => s.status === 'Failed').length,
      logs: this.logs.slice(0, 30)
    };
  }
}

export const jobManager = new StudentJobManager();
