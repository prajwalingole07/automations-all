import fs from 'fs';
import path from 'path';

// pdf-parse v2.x exports { PDFParse } class
const { PDFParse } = require('pdf-parse');

export interface ChoiceItem {
  prefNo: number;
  institute: string;
  branch: string;
  city: string;
  rank: string;
  percentile: string;
  category: string;
  choiceCode: string;
}

export interface StudentPreferenceData {
  studentName: string;
  registrationNo: string;
  category: string;
  counselor: string;
  choices: ChoiceItem[];
  pdfFileName: string;
}

/**
 * Formats choice codes: Every choice code with 9 digits (or 9 digits + suffix letter)
 * is automatically formatted with a leading '0' (e.g., 317524610 -> 0317524610).
 */
export function formatChoiceCode(code: string): string {
  if (!code) return '';
  const clean = code.trim();
  // 9 digits only (e.g. 317524610 -> 0317524610)
  if (/^\d{9}$/.test(clean)) {
    return '0' + clean;
  }
  // 9 digits + 1 suffix letter (e.g. 627624550F -> 0627624550F)
  if (/^\d{9}[A-Za-z]$/.test(clean)) {
    return '0' + clean;
  }
  return clean;
}

const KNOWN_BRANCHES = [
  'Computer Science and Engineering(Artificial Intelligence and Machine Learning)',
  'Computer Science and Engineering (Artificial Intelligence)',
  'Computer Science and Engineering(Data Science)',
  'Computer Science and Engineering (Internet of Things and Cyber Security Including Block Chain Technology)',
  'Computer Science and Business Systems',
  'Computer Science and Engineering',
  'Computer Engineering (Software Engineering)',
  'Computer Engineering (RL)',
  'Computer Engineering',
  'Information Technology',
  'Artificial Intelligence (AI) and Data Science',
  'Artificial Intelligence and Machine Learning',
  'Artificial Intelligence and Data Science',
  'Artificial Intelligence',
  'Electronics and Telecommunication Engg',
  'Electronics and Telecommunication Engineering',
  'Electronics and Computer Engineering',
  'Electronics Engineering',
  'Electrical Engineering',
  'Chemical Engineering',
  'Civil Engineering',
  'Mechanical Engineering',
  'Pharmaceuticals Chemistry and Technology',
  'Polymer Engineering and Technology',
  'Surface Coating Technology',
  'Dyestuff Technology'
];

/**
 * Parses a student preference list PDF file and extracts metadata, Choice Codes, and Branch/Course Names.
 */
export async function parseStudentPdf(filePath: string): Promise<StudentPreferenceData> {
  const dataBuffer = fs.readFileSync(filePath);
  const pdfInstance = new PDFParse({ data: dataBuffer });
  const pdfResult = await pdfInstance.getText();
  const text: string = pdfResult.text;

  // Extract Metadata
  const studentNameMatch = text.match(/STUDENT NAME\s*[\r\n]+\s*([^\r\n]+)/i);
  const regNoMatch = text.match(/REGISTRATION NO\s*[\r\n]+\s*([^\r\n]+)/i);
  const categoryMatch = text.match(/STUDENT CATEGORY\s*[\r\n]+\s*([^\r\n]+)/i);
  const counselorMatch = text.match(/COUNSELOR IN-CHARGE\s*[\r\n]+\s*([^\r\n]+)/i);

  const studentName = studentNameMatch ? studentNameMatch[1].trim() : 'Unknown';
  const registrationNo = regNoMatch ? regNoMatch[1].trim() : 'Unknown';
  const category = categoryMatch ? categoryMatch[1].trim() : 'Unknown';
  const counselor = counselorMatch ? counselorMatch[1].trim() : 'Unknown';

  const choices: ChoiceItem[] = [];
  
  // Clean multiline blocks
  const textClean = text.replace(/\r/g, '').replace(/\t/g, ' ');
  const choiceCodeMatches = Array.from(textClean.matchAll(/\b(0?\d{8,9}[A-Za-z]?|\d{9,10}[A-Za-z]?)\b/g));
  
  let prefCounter = 1;

  for (const match of choiceCodeMatches) {
    const rawCode = match[1].trim();
    if (rawCode.length >= 8 && !rawCode.startsWith('2026') && !rawCode.startsWith('+91')) {
      const formattedCode = formatChoiceCode(rawCode);

      // Find context snippet around choice code
      const index = match.index || 0;
      const snippet = textClean.substring(Math.max(0, index - 250), index);
      
      let detectedBranch = 'Computer Science and Engineering'; // Fallback
      for (const branchName of KNOWN_BRANCHES) {
        if (snippet.toLowerCase().includes(branchName.toLowerCase())) {
          detectedBranch = branchName;
          break;
        }
      }

      choices.push({
        prefNo: prefCounter++,
        institute: '',
        branch: detectedBranch,
        city: '',
        rank: '',
        percentile: '',
        category: '',
        choiceCode: formattedCode
      });
    }
  }

  return {
    studentName,
    registrationNo,
    category,
    counselor,
    choices,
    pdfFileName: path.basename(filePath)
  };
}
