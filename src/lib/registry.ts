import { Automation } from './types';

export const AUTOMATION_PORTS: Record<string, number> = {
  'mhtcet-status-checker': 3000,
  'cutoff-pdf-extractor': 5000,
  'dse-choice-filling': 3000,
  'cap-links-live-alert': 8577,
  'cet-choice-filling-r1-r4': 3000,
  'allotment-result-checker': 5000,
  'cutoff-book-maker': 5000,
};

export function getAutomationPort(id: string): number {
  return AUTOMATION_PORTS[id] || 3000;
}

export const INITIAL_AUTOMATIONS: Automation[] = [
  {
    id: 'mhtcet-status-checker',
    name: 'MHT-CET Option Form Confirmation Status Checker',
    description: 'Automated status verification engine for MHT-CET CAP Rounds option form confirmation across multiple student records using Playwright.',
    category: 'Engineering Admissions',
    originalZip: '01_MHT_CET_Option_Form_Confirmation_Status_Checker.zip',
    packageDir: '01_MHT_CET_Option_Form_Confirmation_Status_Checker',
    entryPoint: 'src/checkCapRound2Status.ts',
    commandTemplate: 'npx tsx src/checkCapRound2Status.ts --round={{round}}',
    language: 'TypeScript/Node.js',
    dependencies: ['@playwright/test', 'express', 'cors', 'multer', 'dotenv'],
    requiredInputs: [
      {
        name: 'round',
        label: 'CAP Round',
        type: 'select',
        required: true,
        defaultValue: 'II',
        options: ['I', 'II', 'III', 'IV'],
        description: 'Target CAP Round to verify candidate option form status'
      },
      {
        name: 'headless',
        label: 'Run Headless',
        type: 'boolean',
        required: false,
        defaultValue: false,
        description: 'Uncheck to watch the browser in a new tab/window live'
      }
    ],
    requiredBrowser: 'Chrome/Chromium',
    executionRequirements: 'Node.js 18+, Chrome/Chromium installed, valid student database or credentials',
    status: 'ready',
    version: '1.2.0',
    lastUpdated: '2026-10-09',
    requiresLocalServer: false,
    defaultPort: 3000
  },
  {
    id: 'cutoff-pdf-extractor',
    name: 'MHT-CET Cutoff PDF to Excel Master Extractor',
    description: 'High-speed tabular parser extracting cutoff percentiles, merit numbers, categories, and quotas from official Maharashtra CET cutoff PDFs directly into structured Excel reports.',
    category: 'Data Extraction',
    originalZip: '02_MHT_CET_Cutoff_PDF_to_Excel_Master_Extractor.zip',
    packageDir: '02_MHT_CET_Cutoff_PDF_to_Excel_Master_Extractor',
    entryPoint: 'CET_ALLCLGS.py',
    commandTemplate: 'python CET_ALLCLGS.py --input "{{pdf_path}}"',
    language: 'Python',
    dependencies: ['pdfplumber>=0.11', 'pandas>=2.0', 'openpyxl>=3.1', 'flask>=3.0', 'tqdm>=4.60'],
    requiredInputs: [
      {
        name: 'pdf_path',
        label: 'Cutoff PDF Path / Filename',
        type: 'text',
        required: true,
        defaultValue: 'cutoff.pdf',
        description: 'Path to official CAP Round Cutoff PDF document'
      },
      {
        name: 'output_format',
        label: 'Output Format',
        type: 'select',
        required: true,
        defaultValue: 'xlsx',
        options: ['xlsx', 'csv', 'json'],
        description: 'Generated spreadsheet format'
      }
    ],
    requiredBrowser: 'None',
    executionRequirements: 'Python 3.9+, pandas, openpyxl, pdfplumber',
    status: 'ready',
    version: '2.0.1',
    lastUpdated: '2026-10-09',
    requiresLocalServer: false,
    defaultPort: 5000
  },
  {
    id: 'dse-choice-filling',
    name: 'DSE Engineering Option Form Choice Filling Automation',
    description: 'Direct Second Year Engineering (DSE) automated option form choice filling. Reads student preference lists, logs into the state admission portal, matches branch codes, and fills options automatically in isolated browser tabs.',
    category: 'Choice Filling',
    originalZip: '03_DSE_Engineering_Option_Form_Choice_Filling_Automation.zip',
    packageDir: '03_DSE_Engineering_Option_Form_Choice_Filling_Automation',
    entryPoint: 'src/automationEngine.ts',
    commandTemplate: 'npx tsx src/automationEngine.ts --studentId={{student_id}} --round={{round}}',
    language: 'TypeScript/Node.js',
    dependencies: ['@playwright/test', 'express', 'cors', 'dotenv', 'multer'],
    requiredInputs: [
      {
        name: 'student_id',
        label: 'Student Application ID',
        type: 'text',
        required: true,
        defaultValue: 'DSE24100123',
        description: 'DSE Candidate Application ID'
      },
      {
        name: 'round',
        label: 'CAP Round',
        type: 'select',
        required: true,
        defaultValue: '1',
        options: ['1', '2', '3'],
        description: 'CAP Round choice submission round'
      },
      {
        name: 'auto_confirm',
        label: 'Auto Confirm Option Form',
        type: 'boolean',
        required: false,
        defaultValue: false,
        description: 'Require manual password confirmation review or auto-confirm'
      }
    ],
    requiredBrowser: 'Chrome/Chromium',
    executionRequirements: 'Node.js 18+, Chrome/Edge, Playwright with modern browser context',
    status: 'ready',
    version: '1.4.0',
    lastUpdated: '2026-10-09',
    requiresLocalServer: false,
    defaultPort: 3000
  },
  {
    id: 'cap-links-live-alert',
    name: 'MHT-CET CAP Round Links Live Alert Server',
    description: 'Background polling and web scraping engine monitoring the official State CET Cell portal for newly published CAP Round allotment links, merit lists, and circulars with real-time audio/visual alerts.',
    category: 'Alerts & Monitoring',
    originalZip: '07_MHT_CET_CAP_Round_Links_Live_Alert_Server.zip',
    packageDir: '07_MHT_CET_CAP_Round_Links_Live_Alert_Server',
    entryPoint: 'server.py',
    commandTemplate: 'python server.py --port={{port}}',
    language: 'Python',
    dependencies: ['requests', 'beautifulsoup4', 'flask'],
    requiredInputs: [
      {
        name: 'check_interval',
        label: 'Check Interval (seconds)',
        type: 'number',
        required: true,
        defaultValue: 30,
        description: 'Polling interval in seconds between portal checks'
      }
    ],
    requiredBrowser: 'None',
    executionRequirements: 'Python 3.8+, internet access to mahacet.org',
    status: 'ready',
    version: '1.0.5',
    lastUpdated: '2026-10-09',
    requiresLocalServer: true,
    defaultPort: 8577
  },
  {
    id: 'cet-choice-filling-r1-r4',
    name: 'MHT-CET Choice Filling Automation (Rounds 1 to 4)',
    description: 'First Year Engineering choice filling engine supporting Rounds 1 through 4. Eliminates manual choice ordering errors with validation, quota checking, and browser tab isolation.',
    category: 'Choice Filling',
    originalZip: 'CET_Choice_Filling_Automation_ROUND1-4_FIXED.zip',
    packageDir: 'CET_Choice_Filling_Automation_ROUND1-4_FIXED',
    entryPoint: 'src/automationEngine.ts',
    commandTemplate: 'npx tsx src/automationEngine.ts --studentId={{student_id}} --round={{round}}',
    language: 'TypeScript/Node.js',
    dependencies: ['@playwright/test', 'express', 'cors', 'dotenv', 'multer'],
    requiredInputs: [
      {
        name: 'student_id',
        label: 'Candidate Application ID',
        type: 'text',
        required: true,
        defaultValue: 'EN24108899',
        description: 'Candidate EN Application ID'
      },
      {
        name: 'round',
        label: 'CAP Round Selection',
        type: 'select',
        required: true,
        defaultValue: '1',
        options: ['1', '2', '3', '4'],
        description: 'Round 1, 2, 3 or 4'
      }
    ],
    requiredBrowser: 'Chrome/Chromium',
    executionRequirements: 'Node.js 18+, Playwright browsers, isolated tab context',
    status: 'ready',
    version: '2.1.0',
    lastUpdated: '2026-10-09',
    requiresLocalServer: false,
    defaultPort: 3000
  },
  {
    id: 'allotment-result-checker',
    name: 'Student Allotment Result Batch Checker',
    description: 'Batch automated verification tool that checks individual student allotment results from Excel rosters, parses college and branch allocations, and saves updated status logs with screenshots.',
    category: 'Engineering Admissions',
    originalZip: 'Student_Allotment_Result_Checker.zip',
    packageDir: 'Student_Allotment_Result_Checker',
    entryPoint: 'main.py',
    commandTemplate: 'python main.py --file="{{excel_file}}"',
    language: 'Python',
    dependencies: ['playwright>=1.40.0', 'pandas>=2.0.0', 'openpyxl>=3.1.0', 'loguru>=0.7.0'],
    requiredInputs: [
      {
        name: 'excel_file',
        label: 'Students Excel File',
        type: 'text',
        required: true,
        defaultValue: 'students.xlsx',
        description: 'Excel file containing Application IDs and DOBs'
      },
      {
        name: 'round',
        label: 'CAP Round',
        type: 'select',
        required: true,
        defaultValue: 'CAP Round 1',
        options: ['CAP Round 1', 'CAP Round 2', 'CAP Round 3'],
        description: 'Target CAP Round'
      }
    ],
    requiredBrowser: 'Playwright Headless/Headed',
    executionRequirements: 'Python 3.9+, Playwright browser binaries',
    status: 'ready',
    version: '1.1.2',
    lastUpdated: '2026-10-09',
    requiresLocalServer: false,
    defaultPort: 5000
  },
  {
    id: 'cutoff-book-maker',
    name: 'AME Cutoff Book & Comparison Table Maker',
    description: 'Admissions counseling book generation engine: compiles multi-year cutoff analysis, institute rank matrices, and branch distribution into professional reference books and printable tables.',
    category: 'Document Processing',
    originalZip: 'book works.zip',
    packageDir: 'book works/BOOK TABLE MAKER CET',
    entryPoint: 'app.py',
    commandTemplate: 'python app.py --port={{port}}',
    language: 'Python',
    dependencies: ['flask>=3.0', 'pandas>=2.0', 'openpyxl>=3.1', 'pdfplumber>=0.11', 'python-docx>=1.1', 'requests>=2.31'],
    requiredInputs: [
      {
        name: 'district',
        label: 'Filter District',
        type: 'select',
        required: false,
        defaultValue: 'All',
        options: ['All', 'Pune', 'Mumbai', 'Nagpur', 'Aurangabad', 'Nashik', 'Latur'],
        description: 'Select geographical cluster'
      },
      {
        name: 'export_format',
        label: 'Export Document Type',
        type: 'select',
        required: true,
        defaultValue: 'Excel & Word',
        options: ['Excel & Word', 'Excel Only', 'Word Document Only'],
        description: 'Format for output counselling book'
      }
    ],
    requiredBrowser: 'Chrome/Chromium',
    executionRequirements: 'Python 3.10+, flask, pandas, openpyxl, python-docx',
    status: 'ready',
    version: '3.0.0',
    lastUpdated: '2026-10-09',
    requiresLocalServer: true,
    defaultPort: 5000
  }
];
