# 🚀 NEXUS Automation Hub — Render.com Deployment Guide

This package is **100% clean, modernized, and ready for deployment on [Render.com](https://render.com)**.
All legacy 2026 data files, old screenshots, and cached reports have been wiped clean.
Fresh Excel templates with accurate column headers are provided.

---

## 📦 What Has Been Cleaned & Prepared

1. **Wiped all 2026 files:**
   - Removed old 2026 PDF preference lists, 2026 cutoff PDFs (`R1 2026.pdf`, `R2 2026.pdf`), and consolidated cutoff spreadsheets.
   - Removed all old `.png` screenshots from previous runs.
   - Cleaned out cached reports and state files.
   - Reset `students_db.json`, `students_choices_summary.json`, and `state.json` to clean empty state `{}`.

2. **Clean Excel Templates Included:**
   - `packages/01_MHT_CET_Option_Form_Confirmation_Status_Checker/data/LOGIN_ID___PASSWORD.xlsx`  
     Headers: `REGNO` | `NAME` | `LOGIN ID ` | `PASSWORD`
   - `packages/Student_Allotment_Result_Checker/Input/Students.xlsx`  
     Headers: `SRNO` | `NAME` | `APPLICATION NO` | `DOB`

3. **Docker & Cloud Native:**
   - Pre-configured `Dockerfile` with Node.js 20, Python 3, and Playwright Chromium headless browser.
   - `render.yaml` for 1-click blueprint deploy.

---

## 🌐 How to Deploy to Render.com (Step-by-Step)

### Option A: Deploy via GitHub (Recommended)

1. **Extract this ZIP** to a folder on your computer.
2. Initialize Git and push to your GitHub:
   ```bash
   git init
   git add .
   git commit -m "Deploy clean automation hub to Render"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/automation-hub.git
   git push -u origin main
   ```
3. Log in to **[dashboard.render.com](https://dashboard.render.com/)**.
4. Click **New +** → **Web Service**.
5. Connect your GitHub repository.
6. Render will automatically detect the **Dockerfile**:
   - **Name**: `nexus-automation-hub`
   - **Runtime**: `Docker`
   - **Instance Type**: `Free` (or Starter for 24/7 background worker)
7. Click **Create Web Service**.
8. Wait 3–5 minutes for the build to finish. Render will give you a live URL:  
   👉 `https://nexus-automation-hub.onrender.com`

---

### Option B: Deploy via Render Blueprint (1-Click)

1. Push this folder to a private or public GitHub repo.
2. In Render dashboard, click **New +** → **Blueprint**.
3. Select the repository. Render will read `render.yaml` and configure everything automatically.
4. Click **Apply**.

---

## 🎯 How to Use Once Live

1. Open your Render web link from any browser (desktop or mobile).
2. The dashboard will show:
   - **Automations Catalog** (MHT-CET status checker, choice filling, allotment checker, alerts).
   - **Clean State**: Ready for new student registrations and cutoff files.
3. To run automations:
   - Fill candidate details or upload updated Excel sheets using the clean templates provided in `packages/`.
   - Click **Run** on the dashboard.
   - Track live logs and status directly in the web UI.
