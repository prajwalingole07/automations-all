import fs from 'fs';
import path from 'path';
import { parseStudentPdf, ChoiceItem } from '../src/pdfParser';
import { runStudentAutomation } from '../src/automationEngine';

export type StudentStatus = 'Pending' | 'Queued' | 'Running' | 'Completed' | 'Completed (Partial)' | 'Failed';

export interface StudentRecord {
  id: string;
  name: string;
  regNo: string;
  email: string;
  password: string;
  category: string;
  counselor: string;
  note?: string;
  failedChoices?: string[];
  pdfFileName?: string;
  hasPdf: boolean;
  choicesCount: number;
  choices: ChoiceItem[];
  status: StudentStatus;
  progress: number;
  stepName: string;
  screenshotUrl?: string;
  error?: string;
  lastUpdated: string;
  courseType?: 'Bachelor of Engineering' | 'Direct Second Year Degree in Engineering';
}

export interface ActivityLog {
  timestamp: string;
  studentId?: string;
  studentName?: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
}

class StudentJobManager {
  private studentsMap = new Map<string, StudentRecord>();
  private jobQueue: string[] = [];
  private isWorkerRunning = false;
  private logs: ActivityLog[] = [];
  private dbFilePath = path.join(__dirname, '..', 'students_db.json');
  private pdfFolder = process.env.PDF_FOLDER_PATH || path.join(__dirname, '..', 'STUDENTS PREFERENCE LIST');

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
      courseType: data.courseType || 'Direct Second Year Degree in Engineering',
      lastUpdated: new Date().toISOString()
    };

    if (data.email) existing.email = data.email;
    if (data.password) existing.password = data.password;
    if (data.name) existing.name = data.name;
    if (data.regNo) existing.regNo = data.regNo;
    if (data.pdfFileName) existing.pdfFileName = data.pdfFileName;
    if (data.courseType) existing.courseType = data.courseType;
    if (data.note !== undefined) existing.note = data.note;
    if (data.failedChoices !== undefined) existing.failedChoices = data.failedChoices;

    existing.lastUpdated = new Date().toISOString();
    this.studentsMap.set(id, existing);
    this.saveStorage();
    this.addLog(`Updated credentials/profile for ${existing.name}`, 'info', id, existing.name);
    return existing;
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
    this.jobQueue.push(studentId);
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
        this.jobQueue.push(student.id);
        count++;
      }
    }
    this.saveStorage();
    this.addLog(`Enqueued batch automation for ${count} students.`, 'info');
    this.processQueue();
    return { count };
  }

  private async processQueue() {
    if (this.isWorkerRunning || this.jobQueue.length === 0) return;

    this.isWorkerRunning = true;
    const studentId = this.jobQueue.shift()!;
    const student = this.studentsMap.get(studentId);

    if (!student) {
      this.isWorkerRunning = false;
      this.processQueue();
      return;
    }

    student.status = 'Running';
    student.progress = 5;
    student.stepName = 'Starting Worker';
    this.saveStorage();
    this.addLog(`▶ Started Playwright automation worker for ${student.name}`, 'info', student.id, student.name);

    try {
      const result = await runStudentAutomation(
        {
          studentId: student.id,
          studentName: student.name,
          email: student.email,
          password: student.password,
          choices: student.choices,
          courseType: student.courseType
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
        student.failedChoices = result.failedChoices || [];
        student.progress = 100;
        student.screenshotUrl = result.screenshotUrl;
        student.error = undefined;

        if (student.failedChoices.length > 0) {
          student.status = 'Completed (Partial)';
          student.stepName = 'Completed (Partial)';
          this.addLog(`⚠️ Automation COMPLETED (PARTIAL) for ${student.name}! ${student.failedChoices.length} choice(s) failed.`, 'warning', student.id, student.name);
        } else {
          student.status = 'Completed';
          student.stepName = 'Dashboard Reached & Proof Saved';
          this.addLog(`🎉 Automation COMPLETED for ${student.name}!`, 'success', student.id, student.name);
        }
      } else {
        student.status = 'Failed';
        student.progress = 0;
        student.stepName = 'Failed';
        student.error = result.error || 'Automation failed';
        if (result.screenshotUrl) student.screenshotUrl = result.screenshotUrl;
        this.addLog(`❌ Automation FAILED for ${student.name}: ${student.error}`, 'error', student.id, student.name);
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

  public getStatus() {
    return {
      queueLength: this.jobQueue.length,
      isWorkerRunning: this.isWorkerRunning,
      totalStudents: this.studentsMap.size,
      completedCount: Array.from(this.studentsMap.values()).filter(s => s.status === 'Completed' || s.status === 'Completed (Partial)').length,
      failedCount: Array.from(this.studentsMap.values()).filter(s => s.status === 'Failed').length,
      logs: this.logs.slice(0, 30)
    };
  }
}

export const jobManager = new StudentJobManager();
