const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

async function run() {
  const sourceFolder = 'C:\\Users\\mrsum\\Downloads\\ENGG CHOICE FILLING\\40 pdfs';
  const excelPath = path.join(sourceFolder, 'ENGG DATA.xlsx');

  console.log('Loading Excel File...');
  const workbook = xlsx.readFile(excelPath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const data = xlsx.utils.sheet_to_json(sheet);

  // Build lookup map (key: upper-cased name, value: { email, password })
  const lookup = new Map();
  for (const row of data) {
    const rawName = row['SURNAME - STUDENT NAME - FATHER NAME'];
    if (rawName && typeof rawName === 'string') {
      const cleanName = rawName.trim().toUpperCase().replace(/\s+/g, ' ');
      lookup.set(cleanName, {
        email: row['CET USER ID'] ? String(row['CET USER ID']).trim() : '',
        password: row['PASSWORD'] ? String(row['PASSWORD']).trim() : ''
      });
    }
  }
  console.log(`Loaded ${lookup.size} valid student rows from Excel.`);

  const files = fs.readdirSync(sourceFolder);
  let successCount = 0;

  for (const file of files) {
    if (!file.toLowerCase().endsWith('.pdf')) continue;

    // Extract name from filename
    // e.g. 'Preference List - ADLING MANAS OMPRAKASH.pdf'
    // or 'FINAL - Preference List - SURYAWANSHI ADARSH SANTOSH.pdf'
    let studentName = file.replace(/\.pdf$/i, '');
    if (studentName.includes('Preference List - ')) {
      studentName = studentName.split('Preference List - ')[1];
    }
    studentName = studentName.trim().toUpperCase().replace(/\s+/g, ' ');

    const rowData = lookup.get(studentName);
    if (!rowData) {
      console.log(`⚠️ No excel data found for PDF: ${studentName}`);
      continue;
    }

    if (rowData.email === 'NO PROCESS' || !rowData.email) {
      console.log(`⏭️ Skipping ${studentName} (NO PROCESS or missing email)`);
      continue;
    }

    // Prepare HTTP Request
    const pdfPath = path.join(sourceFolder, file);
    const fileBuffer = fs.readFileSync(pdfPath);
    
    // In Node 18+ we can use global File and FormData
    const pdfBlob = new Blob([fileBuffer], { type: 'application/pdf' });
    const formData = new FormData();
    formData.append('pdf', pdfBlob, file);
    formData.append('name', studentName);
    formData.append('email', rowData.email);
    formData.append('password', rowData.password);

    // Generate a simple ID
    const studentId = 'ENGG' + Math.random().toString(36).substr(2, 6).toUpperCase();

    try {
      const res = await fetch(`http://localhost:3000/api/students/${studentId}/upload-pdf`, {
        method: 'POST',
        body: formData
      });
      const resData = await res.json();
      if (resData.success) {
        console.log(`✅ Loaded ${studentName} -> Email: ${rowData.email}`);
        successCount++;
      } else {
        console.log(`❌ API Error for ${studentName}: ${resData.error}`);
      }
    } catch (e) {
      console.log(`💥 Fetch Failed for ${studentName}: ${e.message}`);
    }
  }

  console.log(`\n🎉 Successfully loaded ${successCount} students into the system!`);
}

run();
