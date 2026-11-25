import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { jobManager } from './jobQueue';
import { CapRound } from '../src/statusCheckEngine';

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '127.0.0.1';

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configure static file folders
const publicDir = path.join(__dirname, '..', 'public');
const screenshotsDir = path.join(__dirname, '..', 'screenshots');
const pdfsDir = path.join(__dirname, '..', 'STUDENTS PREFERENCE LIST');

app.use(express.static(publicDir));
app.use('/screenshots', express.static(screenshotsDir));
app.use('/pdfs', express.static(pdfsDir));

// Multer storage for PDF uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!fs.existsSync(pdfsDir)) fs.mkdirSync(pdfsDir, { recursive: true });
    cb(null, pdfsDir);
  },
  filename: (req, file, cb) => {
    const studentId = req.params.id || 'STUDENT';
    const cleanName = file.originalname.replace(/[^a-zA-Z0-9_\-\.]/g, '_');
    cb(null, `Preference List - ${studentId}_${cleanName}`);
  }
});
const upload = multer({ storage });

// Separate in-memory-backed disk storage for one-off Excel imports (not per-student).
const excelUploadDir = path.join(__dirname, '..', 'data', 'uploads');
const excelUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      if (!fs.existsSync(excelUploadDir)) fs.mkdirSync(excelUploadDir, { recursive: true });
      cb(null, excelUploadDir);
    },
    filename: (req, file, cb) => {
      cb(null, `import_${Date.now()}_${file.originalname.replace(/[^a-zA-Z0-9_\-\.]/g, '_')}`);
    }
  })
});

// API Endpoints

// 1. Get all students
app.get('/api/students', (req, res) => {
  res.json({
    success: true,
    students: jobManager.getStudents()
  });
});

// 2. Add or update student credentials
app.post('/api/students', (req, res) => {
  try {
    const student = jobManager.addOrUpdateStudent(req.body);
    res.json({ success: true, student });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// 2b. Bulk import students from an uploaded Excel file (REGNO, NAME, LOGIN ID, PASSWORD columns)
app.post('/api/students/import-excel', excelUpload.single('excel'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No Excel file uploaded.' });
    }
    const result = jobManager.importFromExcel(req.file.path);
    res.json({
      success: true,
      message: `Imported ${result.added} new + updated ${result.updated} existing students (${result.skipped} rows had missing fields) from ${result.total} rows.`,
      ...result
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Delete single student
app.delete('/api/students/:id', (req, res) => {
  const success = jobManager.deleteStudent(req.params.id);
  res.json({ success, message: success ? 'Student deleted' : 'Student not found' });
});

// 4. Clear all students
app.delete('/api/students', (req, res) => {
  jobManager.clearAllStudents();
  res.json({ success: true, message: 'All student records cleared' });
});

// 5. Upload PDF for a student
app.post('/api/students/:id/upload-pdf', upload.single('pdf'), async (req, res) => {
  try {
    const studentId = req.params.id;
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No PDF file uploaded.' });
    }

    const updated = jobManager.addOrUpdateStudent({
      id: studentId,
      name: req.body.name || studentId,
      email: req.body.email || `${studentId.toLowerCase()}@example.com`,
      pdfFileName: req.file.filename
    });

    await jobManager.refreshPdfs();

    res.json({
      success: true,
      message: 'PDF uploaded and parsed successfully!',
      student: jobManager.getStudent(studentId)
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 6. Start automation job for single student
app.post('/api/automation/start/:id', (req, res) => {
  const result = jobManager.enqueueJob(req.params.id);
  res.json(result);
});

// 7. Start automation for all pending students
app.post('/api/automation/start-all', (req, res) => {
  const result = jobManager.enqueueAll();
  res.json({ success: true, message: `Enqueued ${result.count} automation jobs.` });
});

// 8. Get queue status and activity logs
app.get('/api/automation/status', (req, res) => {
  res.json({
    success: true,
    ...jobManager.getStatus()
  });
});

// 9. Start CAP round status check for a single student
app.post('/api/status-check/start/:id', (req, res) => {
  const round: CapRound = ['I', 'II', 'III', 'IV'].includes(req.body?.round) ? req.body.round : 'III';
  const result = jobManager.enqueueStatusCheck(req.params.id, round);
  res.json(result);
});

// 10. Start CAP round status check for all students with credentials
app.post('/api/status-check/start-all', (req, res) => {
  const round: CapRound = ['I', 'II', 'III', 'IV'].includes(req.body?.round) ? req.body.round : 'III';
  const result = jobManager.enqueueStatusCheckAll(round);
  res.json({
    success: true,
    message: `Enqueued CAP Round-${round} status check for ${result.count} students (${result.skipped} skipped: missing credentials).`
  });
});

// 11. Download the selected CAP round status report as an Excel file
app.get('/api/status-check/export', (req, res) => {
  try {
    const round: CapRound = ['I', 'II', 'III', 'IV'].includes(req.query?.round as any) ? (req.query.round as CapRound) : 'III';
    const buffer = jobManager.exportStatusReportBuffer(round);
    res.setHeader('Content-Disposition', `attachment; filename="CAP_Round_${round}_Status_Report.xlsx"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(PORT, HOST, () => {
  console.log(`\n======================================================`);
  console.log(`🚀 CHOICE FILLING MANAGEMENT PORTAL ACTIVE`);
  console.log(`🌐 Dashboard URL: http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
  console.log(`======================================================\n`);
});
