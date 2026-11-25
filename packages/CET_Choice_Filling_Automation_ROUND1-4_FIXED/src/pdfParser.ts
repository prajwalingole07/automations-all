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

class CustomPDFParse extends PDFParse {
  async getPageText(page: any, options: any, total: any) {
    const originalGetTextContent = page.getTextContent;
    page.getTextContent = async function(opt: any) {
      const textContent = await originalGetTextContent.call(page, opt);
      const items = textContent.items || [];
      
      // Sort items: primarily by Y coordinate (descending, top to bottom),
      // and secondarily by X coordinate (ascending, left to right).
      textContent.items = [...items].sort((a: any, b: any) => {
        const yA = a.transform[5];
        const yB = b.transform[5];
        const xA = a.transform[4];
        const xB = b.transform[4];
        
        if (Math.abs(yA - yB) < 3) {
          return xA - xB;
        }
        return yB - yA;
      });
      
      return textContent;
    };
    
    return super.getPageText(page, options, total);
  }
}

/**
 * Parses a student preference list PDF file and extracts metadata, Choice Codes, and Branch/Course Names.
 */
export async function parseStudentPdf(filePath: string): Promise<StudentPreferenceData> {
  const dataBuffer = fs.readFileSync(filePath);
  const pdfInstance = new CustomPDFParse({ data: dataBuffer });
  
  // First load document and get page items to extract table data
  const doc = await pdfInstance.load();
  const choices: ChoiceItem[] = [];
  let prefCounter = 1;

  for (let s = 1; s <= doc.numPages; s++) {
    const page = await doc.getPage(s);
    const textContent = await page.getTextContent();
    const viewport = page.getViewport({ scale: 1 });
    
    // Map text items to viewport coordinates
    const items = textContent.items
      .filter((item: any) => item.str && item.str.trim())
      .map((item: any) => {
        const [x, y] = viewport.convertToViewportPoint(item.transform[4], item.transform[5]);
        return {
          str: item.str.trim(),
          x,
          y,
          width: item.width
        };
      });
      
    // Find all choice codes on this page (X: 360 to 435 range)
    const codeItems = items.filter((item: any) => {
      const is9Digit = /^\d{9}$/.test(item.str) || /^\d{9}[A-Za-z]$/.test(item.str);
      const inColRange = item.x >= 360 && item.x <= 435;
      return is9Digit && inColRange;
    });
    
    // Sort choice codes by Y coordinate (top to bottom on page)
    codeItems.sort((a: any, b: any) => a.y - b.y);
    
    // Group all other items by assigning them to the closest choice code row
    const rowGroups = new Map<string, { instItems: any[], branchItems: any[], cityItem: string }>();
    for (const codeItem of codeItems) {
      rowGroups.set(codeItem.str, { instItems: [], branchItems: [], cityItem: '' });
    }
    
    for (const item of items) {
      // Skip header elements or choice code elements
      if (item.str === 'Institute' || item.str === 'CITY' || item.str === 'Branch Code' || item.str === 'BRANCH NAME' || item.str === 'CATEGORY' || item.str === 'Min Rank' || item.str === 'Max Perc') continue;
      
      // Filter by column X ranges
      const isInstName = item.x > 110 && item.x <= 310;
      const isBranchName = item.x > 435 && item.x <= 590;
      const isCity = item.x > 310 && item.x <= 360;
      
      if (!isInstName && !isBranchName && !isCity) continue;
      
      // Find the closest choice code vertically
      let closestCodeItem = null;
      let minDistance = Infinity;
      
      for (const codeItem of codeItems) {
        const dist = Math.abs(item.y - codeItem.y);
        if (dist < minDistance) {
          minDistance = dist;
          closestCodeItem = codeItem;
        }
      }
      
      // If it is within 18 units of the closest choice code, assign it
      if (closestCodeItem && minDistance <= 18) {
        const group = rowGroups.get(closestCodeItem.str)!;
        if (isInstName) {
          group.instItems.push(item);
        } else if (isBranchName) {
          group.branchItems.push(item);
        } else if (isCity) {
          group.cityItem = item.str;
        }
      }
    }
    
    // Build choices in order
    for (const codeItem of codeItems) {
      const group = rowGroups.get(codeItem.str)!;
      
      // Sort and join institute name parts
      group.instItems.sort((a: any, b: any) => {
        if (Math.abs(a.y - b.y) < 3) return a.x - b.x;
        return a.y - b.y;
      });
      const instituteName = group.instItems.map((item: any) => item.str).join(' ').replace(/\s+/g, ' ').trim();
      
      // Sort and join branch name parts
      group.branchItems.sort((a: any, b: any) => {
        if (Math.abs(a.y - b.y) < 3) return a.x - b.x;
        return a.y - b.y;
      });
      const branchName = group.branchItems.map((item: any) => item.str).join(' ').replace(/\s+/g, ' ').trim();
      
      choices.push({
        prefNo: prefCounter++,
        choiceCode: formatChoiceCode(codeItem.str),
        branch: branchName || 'Computer Science and Engineering', // fallback
        institute: instituteName,
        city: group.cityItem,
        rank: '',
        percentile: '',
        category: ''
      });
    }
  }

  // Next, run simple text matching for page metadata (STUDENT NAME, REGISTRATION NO, etc.)
  const pdfResult = await pdfInstance.getText();
  const text: string = pdfResult.text;

  if (choices.length === 0) {
    const textClean = text.replace(/\r/g, '').replace(/\t/g, ' ');
    const choiceCodeMatches = Array.from(textClean.matchAll(/\b(0?\d{8,9}[A-Za-z]?|\d{9,10}[A-Za-z]?)\b/g));
    for (const match of choiceCodeMatches) {
      const rawCode = match[1].trim();
      if (rawCode.length >= 8 && !rawCode.startsWith('2026') && !rawCode.startsWith('+91')) {
        const formattedCode = formatChoiceCode(rawCode);
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
          choiceCode: formattedCode,
          branch: detectedBranch,
          institute: '',
          city: '',
          rank: '',
          percentile: '',
          category: ''
        });
      }
    }
  }
  
  const studentNameMatch = text.match(/STUDENT NAME\s*[\r\n]+\s*([^\r\n]+)/i);
  const regNoMatch = text.match(/REGISTRATION NO\s*[\r\n]+\s*([^\r\n]+)/i);
  const categoryMatch = text.match(/STUDENT CATEGORY\s*[\r\n]+\s*([^\r\n]+)/i);
  const counselorMatch = text.match(/COUNSELOR IN-CHARGE\s*[\r\n]+\s*([^\r\n]+)/i);

  const studentName = studentNameMatch ? studentNameMatch[1].trim() : 'Unknown';
  const registrationNo = regNoMatch ? regNoMatch[1].trim() : 'Unknown';
  const category = categoryMatch ? categoryMatch[1].trim() : 'Unknown';
  const counselor = counselorMatch ? counselorMatch[1].trim() : 'Unknown';

  return {
    studentName,
    registrationNo,
    category,
    counselor,
    choices,
    pdfFileName: path.basename(filePath)
  };
}
