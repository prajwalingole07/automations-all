import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { jobManager } from './jobQueue';

const app = express();
const PORT = process.env.PORT || 3000;

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
      pdfFileName: req.file.filename,
      courseType: req.body.courseType
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

app.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`🚀 CHOICE FILLING MANAGEMENT PORTAL ACTIVE`);
  console.log(`🌐 Dashboard URL: http://localhost:${PORT}`);
  console.log(`======================================================\n`);
});
