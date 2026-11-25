import fs from 'fs';
import path from 'path';
const { PDFParse } = require('pdf-parse');

async function testBranchExtraction() {
  const filePath = `C:\\Users\\mrsum\\OneDrive\\Desktop\\SUMIT 30-06-2026 BACKUP\\playwright\\ENG-OPTION_FILLING_AUTO\\Students Data\\Preference List - MUGLIKAR SHALMALI SANTOSH_FINAL.pdf`;

  const dataBuffer = fs.readFileSync(filePath);
  const pdfInstance = new PDFParse({ data: dataBuffer });
  const pdfResult = await pdfInstance.getText();
  const text: string = pdfResult.text;

  console.log('--- SAMPLE PDF RAW LINES ---');
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  lines.slice(0, 40).forEach((l, idx) => console.log(`${idx + 1}: ${l}`));
}

testBranchExtraction();
