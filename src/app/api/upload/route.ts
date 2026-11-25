import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { scanZipBuffer } from '@/lib/zipScanner';
import { isServerlessRuntime } from '@/lib/runnerAuth';
import { UploadedPackage, Automation } from '@/lib/types';
import path from 'path';
import fs from 'fs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const autoApprove = formData.get('autoApprove') === 'true';
    const userName = (formData.get('userName') as string) || 'Operator';

    if (!file) {
      return NextResponse.json({ success: false, error: 'No ZIP file provided.' }, { status: 400 });
    }
    if (!file.name.toLowerCase().endsWith('.zip')) {
      return NextResponse.json({ success: false, error: 'Only .zip archives are supported.' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const scanReport = scanZipBuffer(buffer, file.name);

    if (!scanReport.safe) {
      return NextResponse.json(
        {
          success: false,
          error: 'ZIP file failed security screening.',
          issues: scanReport.issues,
        },
        { status: 422 }
      );
    }

    const pkgId = `pkg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const uploadedPackage: UploadedPackage = {
      id: pkgId,
      fileName: file.name,
      fileSize: buffer.length,
      uploadedAt: new Date().toISOString(),
      uploadedBy: userName,
      status: autoApprove ? 'approved' : 'pending_review',
      detectedLanguage: scanReport.detectedLanguage,
      entryPoint: scanReport.entryPoint,
      dependencies: scanReport.dependencies,
      requiredBrowsers: scanReport.requiredBrowsers,
      portsFound: scanReport.portsFound,
      scanReport: {
        safe: scanReport.safe,
        issues: scanReport.issues,
        fileCount: scanReport.fileCount,
      },
    };

    await db.addUploadedPackage(uploadedPackage);

    const serverless = isServerlessRuntime();
    let warning: string | undefined;

    if (!serverless) {
      try {
        const uploadDir = path.join(process.cwd(), 'data', 'uploads');
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
        fs.writeFileSync(path.join(uploadDir, `${pkgId}_${file.name}`), buffer);
      } catch (err) {
        warning = `Metadata saved, but the ZIP could not be written to disk: ${(err as Error).message}`;
      }
    } else {
      warning =
        'Cloud deployment detected: only the scan report and metadata were saved. Extract the ZIP into the packages/ folder on the runner PC so it can be executed locally.';
    }

    if (autoApprove) {
      const autoId = `auto_${path.basename(file.name, '.zip').toLowerCase().replace(/[^a-z0-9_-]/g, '_')}`;
      const newAuto: Automation = {
        id: autoId,
        name: file.name.replace('.zip', '').replace(/_/g, ' '),
        description: `Uploaded package from ${userName}. Detected entry point: ${scanReport.entryPoint}`,
        category: (scanReport.categorySuggestion as any) || 'General',
        originalZip: file.name,
        packageDir: `packages/uploaded/${pkgId}`,
        entryPoint: scanReport.entryPoint,
        commandTemplate: scanReport.detectedLanguage.includes('Python')
          ? `python ${scanReport.entryPoint}`
          : `npm start`,
        language: scanReport.detectedLanguage as any,
        dependencies: scanReport.dependencies,
        requiredInputs: [],
        requiredBrowser: scanReport.requiredBrowsers.includes('Playwright')
          ? 'Playwright Headless/Headed'
          : scanReport.requiredBrowsers.includes('Chrome/Chromium')
            ? 'Chrome/Chromium'
            : 'None',
        executionRequirements: `${scanReport.detectedLanguage}; dependencies: ${
          scanReport.dependencies.slice(0, 3).join(', ') || 'standard runtime'
        }`,
        status: 'ready',
        version: '1.0.0',
        lastUpdated: new Date().toISOString().split('T')[0],
        requiresLocalServer: scanReport.portsFound.length > 0,
        defaultPort: scanReport.portsFound[0] || 3000,
      };

      await db.addAutomation(newAuto);
    }

    return NextResponse.json({
      success: true,
      message: autoApprove
        ? 'Package scanned and registered in the catalog'
        : 'Package scanned and waiting review',
      package: uploadedPackage,
      scanReport,
      warning,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
