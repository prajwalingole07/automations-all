import fs from 'fs';
import path from 'path';
import { parseStudentPdf } from './pdfParser';

async function testAllPdfs() {
  const studentsFolder = path.join(__dirname, '..', 'STUDENTS PREFERENCE LIST');

  const files = fs.readdirSync(studentsFolder).filter(f => f.endsWith('.pdf'));

  console.log(`\n======================================================`);
  console.log(`  MHT CET PDF PREFERENCE EXTRACTOR TEST`);
  console.log(`  Found ${files.length} student PDF files in directory.`);
  console.log(`======================================================\n`);

  for (const file of files) {
    const fullPath = path.join(studentsFolder, file);
    try {
      const data = await parseStudentPdf(fullPath);
      console.log(`------------------------------------------------------`);
      console.log(`📄 File: ${data.pdfFileName}`);
      console.log(`👤 Student Name   : ${data.studentName}`);
      console.log(`🆔 Registration No: ${data.registrationNo}`);
      console.log(`🏷️ Category       : ${data.category}`);
      console.log(`👨‍🏫 Counselor      : ${data.counselor}`);
      console.log(`📊 Total Choices   : ${data.choices.length}`);
      
      if (data.choices.length > 0) {
        console.log(`   Sample Choices:`);
        data.choices.slice(0, 5).forEach(c => {
          console.log(`    Pref #${c.prefNo}: Choice Code -> ${c.choiceCode}`);
        });
        if (data.choices.length > 5) {
          const last = data.choices[data.choices.length - 1];
          console.log(`    ...`);
          console.log(`    Pref #${last.prefNo}: Choice Code -> ${last.choiceCode}`);
        }
      } else {
        console.log(`⚠️ WARNING: No choice codes extracted!`);
      }
      console.log(`------------------------------------------------------\n`);
    } catch (err: any) {
      console.error(`❌ Error parsing ${file}:`, err.message);
    }
  }
}

testAllPdfs();
