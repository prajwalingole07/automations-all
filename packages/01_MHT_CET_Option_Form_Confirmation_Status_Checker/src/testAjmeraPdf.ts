import path from 'path';
import { parseStudentPdf } from './pdfParser';

async function testAjmera() {
  const pdfPath = `C:\\Users\\mrsum\\Downloads\\Preference List - AJMERA RAUNAK ATISHKUMAR.pdf`;
  const result = await parseStudentPdf(pdfPath);

  console.log('--- PARSED AJMERA RAUNAK ATISHKUMAR PDF ---');
  console.log('Student Name  :', result.studentName);
  console.log('Registration  :', result.registrationNo);
  console.log('Category      :', result.category);
  console.log('Counselor     :', result.counselor);
  console.log('Total Choices :', result.choices.length);

  console.log('\n--- TOP 5 CHOICES TO FILL ---');
  result.choices.slice(0, 5).forEach((c, i) => {
    console.log(`Choice #${i + 1}: Code = ${c.choiceCode} | Branch = ${c.branch}`);
  });
}

testAjmera();
