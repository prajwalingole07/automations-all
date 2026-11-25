import AdmZip from 'adm-zip';
import path from 'path';

export interface ScanResult {
  safe: boolean;
  issues: string[];
  fileCount: number;
  detectedLanguage: string;
  entryPoint: string;
  dependencies: string[];
  requiredBrowsers: string[];
  portsFound: number[];
  categorySuggestion: string;
}

export function scanZipBuffer(buffer: Buffer, fileName: string): ScanResult {
  const issues: string[] = [];
  const ports = new Set<number>();
  const dependencies = new Set<string>();
  const browsers = new Set<string>();
  let languages = new Set<string>();
  let entryPoints: string[] = [];

  let zip: AdmZip;
  try {
    zip = new AdmZip(buffer);
  } catch (err: any) {
    return {
      safe: false,
      issues: [`Invalid or corrupted ZIP archive: ${err.message}`],
      fileCount: 0,
      detectedLanguage: 'Unknown',
      entryPoint: '',
      dependencies: [],
      requiredBrowsers: [],
      portsFound: [],
      categorySuggestion: 'General'
    };
  }

  const zipEntries = zip.getEntries();
  const fileCount = zipEntries.length;

  if (fileCount === 0) {
    issues.push('Archive is empty.');
  }

  if (fileCount > 10000) {
    issues.push(`Suspicious file count (${fileCount} files). Potential ZIP bomb.`);
  }

  let totalUncompressedSize = 0;

  for (const entry of zipEntries) {
    totalUncompressedSize += entry.header.size;

    // Path traversal check
    const normalizedName = entry.entryName.replace(/\\/g, '/');
    if (normalizedName.startsWith('/') || normalizedName.includes('../') || normalizedName.includes('..\\')) {
      issues.push(`Malicious path traversal detected: ${entry.entryName}`);
      break;
    }

    if (entry.isDirectory) continue;

    const ext = path.extname(entry.name).toLowerCase();
    const baseName = path.basename(entry.name).toLowerCase();

    // Language detection
    if (ext === '.py') languages.add('Python');
    if (ext === '.ts' || ext === '.tsx') languages.add('TypeScript');
    if (ext === '.js' || ext === '.mjs') languages.add('JavaScript');
    if (ext === '.bat' || ext === '.cmd') languages.add('Batch');

    // Entry point detection
    if (['main.py', 'app.py', 'index.js', 'server.js', 'start.bat', 'run.py'].includes(baseName)) {
      entryPoints.push(entry.entryName);
    }

    // Inspect text files under 1MB for dependencies & ports
    if (entry.header.size < 1024 * 1024 && ['.py', '.js', '.ts', '.json', '.txt', '.env', '.bat'].includes(ext)) {
      try {
        const text = entry.getData().toString('utf8');

        // Check package.json
        if (baseName === 'package.json') {
          try {
            const pj = JSON.parse(text);
            if (pj.dependencies) Object.keys(pj.dependencies).forEach(d => dependencies.add(d));
            if (pj.main) entryPoints.unshift(pj.main);
          } catch {}
        }

        // Check requirements.txt
        if (baseName === 'requirements.txt') {
          text.split('\n').forEach(line => {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith('#')) dependencies.add(trimmed);
          });
        }

        // Port scanning
        const portMatches = text.match(/(?:port|PORT)\s*[:=]\s*(\d{2,5})|localhost:(\d{2,5})|127\.0\.0\.1:(\d{2,5})/g);
        if (portMatches) {
          portMatches.forEach(m => {
            const num = m.match(/\d{2,5}/);
            if (num) {
              const p = parseInt(num[0], 10);
              if (p >= 1000 && p <= 65535) ports.add(p);
            }
          });
        }

        // Browser tool detection
        const textLow = text.toLowerCase();
        if (textLow.includes('playwright')) browsers.add('Playwright');
        if (textLow.includes('selenium')) browsers.add('Selenium');
        if (textLow.includes('chromium') || textLow.includes('chrome')) browsers.add('Chrome/Chromium');
        if (textLow.includes('edge')) browsers.add('Microsoft Edge');
      } catch {}
    }
  }

  // Check compression ratio (Zip bomb protection)
  const ratio = totalUncompressedSize / Math.max(1, buffer.length);
  if (ratio > 100) {
    issues.push(`Abnormally high compression ratio (${ratio.toFixed(1)}:1). Archive rejected as potential Zip bomb.`);
  }

  const safe = issues.length === 0;

  // Primary language
  let primaryLang = 'TypeScript/Node.js';
  if (languages.has('Python') && !languages.has('TypeScript')) {
    primaryLang = 'Python';
  } else if (languages.has('Batch') && languages.size === 1) {
    primaryLang = 'Batch/CLI';
  }

  // Category suggestion
  let category = 'Engineering Admissions';
  if (fileName.toLowerCase().includes('extractor') || fileName.toLowerCase().includes('pdf')) {
    category = 'Data Extraction';
  } else if (fileName.toLowerCase().includes('choice') || fileName.toLowerCase().includes('option')) {
    category = 'Choice Filling';
  } else if (fileName.toLowerCase().includes('alert') || fileName.toLowerCase().includes('live')) {
    category = 'Alerts & Monitoring';
  }

  return {
    safe,
    issues,
    fileCount,
    detectedLanguage: primaryLang,
    entryPoint: entryPoints[0] || 'START.bat',
    dependencies: Array.from(dependencies).slice(0, 15),
    requiredBrowsers: Array.from(browsers),
    portsFound: Array.from(ports),
    categorySuggestion: category
  };
}
