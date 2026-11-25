import fs from 'fs';
import path from 'path';
import { parseStudentPdf, StudentPreferenceData } from './pdfParser';

async function runStudentBatchExtraction() {
  const studentsFolder = path.join(__dirname, '..', 'STUDENTS PREFERENCE LIST');
  const outputJsonPath = path.join(__dirname, '..', 'students_choices_summary.json');

  if (!fs.existsSync(studentsFolder)) {
    console.error(`❌ Folder not found: ${studentsFolder}`);
    return;
  }

  const pdfFiles = fs.readdirSync(studentsFolder).filter(file => file.endsWith('.pdf'));
  console.log(`\n==================================================================`);
  console.log(`  MHT CET BATCH STUDENT PDF PREFERENCE EXTRACTOR`);
  console.log(`  Processing ${pdfFiles.length} student preference list PDFs...`);
  console.log(`==================================================================\n`);

  const allStudentsData: StudentPreferenceData[] = [];

  for (let i = 0; i < pdfFiles.length; i++) {
    const fileName = pdfFiles[i];
    const fullPath = path.join(studentsFolder, fileName);
    
    console.log(`[Student ${i + 1}/${pdfFiles.length}] Processing PDF: ${fileName}...`);
    try {
      const studentData = await parseStudentPdf(fullPath);
      allStudentsData.push(studentData);
      
      console.log(`   ✅ Name         : ${studentData.studentName}`);
      console.log(`   ✅ Reg No       : ${studentData.registrationNo}`);
      console.log(`   ✅ Category     : ${studentData.category}`);
      console.log(`   ✅ Total Choices : ${studentData.choices.length}`);
      console.log(`   🎯 First Choice  : ${studentData.choices[0]?.choiceCode || 'N/A'}`);
      console.log(`   🎯 Last Choice   : ${studentData.choices[studentData.choices.length - 1]?.choiceCode || 'N/A'}\n`);
    } catch (err: any) {
      console.error(`   ❌ Failed to parse ${fileName}:`, err.message);
    }
  }

  // Write out structured JSON file for automation consumption
  fs.writeFileSync(outputJsonPath, JSON.stringify(allStudentsData, null, 2));

  console.log(`==================================================================`);
  console.log(`🎉 EXTRACTION COMPLETE!`);
  console.log(`💾 Structured JSON Summary saved to:`);
  console.log(`   ${outputJsonPath}`);
  console.log(`==================================================================\n`);
}

runStudentBatchExtraction();
