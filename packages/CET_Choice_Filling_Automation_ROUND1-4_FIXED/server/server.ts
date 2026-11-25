import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { jobManager } from './jobQueue';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

const publicDir = path.join(__dirname, '..', 'public');
const screenshotsDir = path.join(__dirname, '..', 'screenshots');
const pdfsDir = path.join(__dirname, '..', 'STUDENTS PREFERENCE LIST');

app.use(express.static(publicDir));
app.use('/screenshots', express.static(screenshotsDir));
app.use('/pdfs', express.static(pdfsDir));

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

app.get('/api/students', (req, res) => {
  res.json({
    success: true,
    students: jobManager.getStudents()
  });
});

app.post('/api/students', (req, res) => {
  try {
    console.log('[POST /api/students] body:', req.body);
    const student = jobManager.addOrUpdateStudent(req.body);
    res.json({ success: true, student });
  } catch (err: any) {
    console.error('[POST /api/students] error:', err.message);
    res.status(400).json({ success: false, error: err.message });
  }
});

app.delete('/api/students/:id', (req, res) => {
  const success = jobManager.deleteStudent(req.params.id);
  res.json({ success, message: success ? 'Student deleted' : 'Student not found' });
});

app.delete('/api/students', (req, res) => {
  jobManager.clearAllStudents();
  res.json({ success: true, message: 'All student records cleared' });
});

app.post('/api/students/:id/upload-pdf', upload.single('pdf'), async (req, res) => {
  try {
    const studentId = req.params.id;
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No PDF file uploaded.' });
    }
    jobManager.addOrUpdateStudent({
      id: studentId,
      name: req.body.name || studentId,
      email: req.body.email || `${studentId.toLowerCase()}@example.com`,
      pdfFileName: req.file.filename,
      round: req.body.round ? parseInt(req.body.round) as any : undefined
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

app.post('/api/automation/start/:id', (req, res) => {
  const round = parseInt(req.body?.round || req.query?.round || '1') as 1 | 2 | 3 | 4;
  const validRound = ([1, 2, 3, 4].includes(round) ? round : 1) as 1 | 2 | 3 | 4;
  const result = jobManager.enqueueJob(req.params.id, validRound);
  res.json(result);
});

app.post('/api/automation/start-all', (req, res) => {
  const result = jobManager.enqueueAll();
  res.json({ success: true, message: `Enqueued ${result.count} automation jobs.` });
});

app.get('/api/automation/status', (req, res) => {
  res.json({
    success: true,
    ...jobManager.getStatus()
  });
});

app.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`🚀 CET CHOICE FILLING MANAGEMENT PORTAL ACTIVE`);
  console.log(`🌐 Dashboard URL: http://localhost:${PORT}`);
  console.log(`======================================================\n`);
});
