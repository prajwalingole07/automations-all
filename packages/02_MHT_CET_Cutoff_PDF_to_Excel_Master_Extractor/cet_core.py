"""
CET ALL COLLEGES - EXTRACTION CORE (fixed version)

Fixes over the old version:
  1. Continuation pages: PDFs split very wide branch tables. The overflow
     category columns (EWS, ORPHANN, ORPHANI, DEFRSEBCS, ...) are printed on
     the NEXT page as a small table WITHOUT any branch code / section header.
     Old code rejected those tables (no section header) and could only carry
     ONE branch across pages, so EWS (and other trailing categories) were
     lost for many colleges (COEP, PICT, VIT, ...).
     New code: every continuation table is matched to the correct branch of
     the previous page using (a) order of appearance and (b) category-overlap
     check (a branch that already has a category never receives it twice).
  2. All categories are kept. A category found in R1 but not in R2 is still
     exported (R2 shows "--"). No category is ever dropped.
  3. Multi-row R2 tables: only Stage-I rows ("I" / "1") are extracted.
"""

import os
import re
import sys
import datetime
from openpyxl import load_workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side

# ============================== CONSTANTS ==============================

CET_CATEGORY_ORDER = [
    'GOPENH', 'GSCH', 'GSTH', 'GVJH', 'GNT1H', 'GNT2H', 'GNT3H', 'GOBCH', 'GSEBCH',
    'LOPENH', 'LSCH', 'LSTH', 'LVJH', 'LNT1H', 'LNT2H', 'LNT3H', 'LOBCH', 'LSEBCH',
    'PWDOPENH', 'PWDOBCH', 'PWDROBCH', 'PWDRSCH',
    'GOPENO', 'GSCO', 'GSTO', 'GVJO', 'GNT1O', 'GNT2O', 'GNT3O', 'GOBCO', 'GSEBCO',
    'LOPENO', 'LSCO', 'LSTO', 'LVJO', 'LNT1O', 'LNT2O', 'LNT3O', 'LOBCO', 'LSEBCO',
    'GOPENS', 'GSCS', 'GSTS', 'GVJS', 'GNT1S', 'GNT2S', 'GNT3S', 'GOBCS', 'GSEBCS',
    'LOPENS', 'LSCS', 'LSTS', 'LVJS', 'LNT2S', 'LNT3S', 'LOBCS', 'LSEBCS',
    'PWDOPENS', 'PWDOBCS', 'PWDSEBCS', 'PWDSCS', 'PWDSTS', 'PWDRVJS',
    'DEFOPENS', 'DEFOBCS', 'DEFSEBCS', 'DEFSCS', 'DEFSTS', 'DEFRVJS',
    'PWDRNT1S', 'PWDRNT2S', 'PWDRNT3S', 'PWDROBCS', 'PWDROBS', 'PWDRSCS', 'PWDRSEBCS',
    'DEFRNT1S', 'DEFRNT2S', 'DEFRNT3S', 'DEFROBCS', 'DEFRSCS', 'DEFRSEBCS',
    'ORPHAN', 'MI', 'TFWS', 'EWS'
]

CET_ALL_CATEGORIES = set(CET_CATEGORY_ORDER)

# Header tokens that normalize into a known category (ORPHANI/ORPHANN -> ORPHAN).
# Used so split headers on continuation pages are never dropped.
CATEGORY_HEADER_TOKENS = CET_ALL_CATEGORIES | {'ORPHANI', 'ORPHANN'}

CATEGORY_NORMALIZE = {
    'ORPHANI': 'ORPHAN',
    'ORPHANN': 'ORPHAN',
}

RANK_PERC_REGEX = re.compile(r'(\d+)\s*\(([\d.]+)\)')
STAGE_I_REGEX = re.compile(r'^(I|1)(\.0)?\.?$')
INST_CODE_REGEX = re.compile(r'(?<![\d])(\d{5})(?!\d)\s*-\s*([^\n]+)')
BRANCH_LINE_REGEX = re.compile(r'^(\d{9,}[A-Za-z]*)\s*-\s*(.+)$', re.MULTILINE)
BRANCH_CODE_REGEX = re.compile(r'\b(\d{9,}[A-Za-z]*)\b')

# ============================== CITY DETECTION ==============================

CITY_MATCH_ORDER = [
    ('Chhatrapati Sambhajinagar', 'Aurangabad'),
    ('Chhatrapati Sambhaji Maharaj', 'Aurangabad'),
    ('Navi Mumbai', 'Navi Mumbai'),
    ('Ahmednagar', 'Ahmednagar'), ('Aurangabad', 'Aurangabad'),
    ('Amravati', 'Amravati'), ('Ambernath', 'Ambernath'),
    ('Ratnagiri', 'Ratnagiri'), ('Sindhudurg', 'Sindhudurg'),
    ('Chandrapur', 'Chandrapur'), ('Bhandara', 'Bhandara'),
    ('Buldhana', 'Buldhana'), ('Yavatmal', 'Yavatmal'),
    ('Parbhani', 'Parbhani'), ('Hingoli', 'Hingoli'),
    ('Nandurbar', 'Nandurbar'), ('Osmanabad', 'Osmanabad'),
    ('Gadchiroli', 'Gadchiroli'), ('Kolhapur', 'Kolhapur'),
    ('Solapur', 'Solapur'), ('Sangli', 'Sangli'),
    ('Nagpur', 'Nagpur'), ('Nashik', 'Nashik'),
    ('Mumbai', 'Mumbai'), ('Pune', 'Pune'), ('Thane', 'Thane'),
    ('Palghar', 'Palghar'), ('Raigad', 'Raigad'),
    ('Wardha', 'Wardha'), ('Washim', 'Washim'),
    ('Dhule', 'Dhule'), ('Jalgaon', 'Jalgaon'), ('Jalna', 'Jalna'),
    ('Beed', 'Beed'), ('Akola', 'Akola'), ('Latur', 'Latur'),
    ('Nanded', 'Nanded'), ('Satara', 'Satara'),
    ('Ichalkaranji', 'Ichalkaranji'), ('Pandharpur', 'Pandharpur'),
    ('Lonavala', 'Lonavala'), ('Sangamner', 'Sangamner'),
    ('Kopargaon', 'Kopargaon'), ('Shirpur', 'Shirpur'),
    ('Bhusawal', 'Bhusawal'), ('Faizpur', 'Faizpur'),
    ('Malegaon', 'Malegaon'), ('Tuljapur', 'Tuljapur'),
    ('Ambejogai', 'Ambejogai'), ('Badnera', 'Badnera'),
    ('Gadhinglaj', 'Gadhinglaj'), ('Sakoli', 'Sakoli'),
    ('Bhadrawati', 'Bhadrawati'), ('Sevagram', 'Sevagram'),
    ('Kankavli', 'Kankavli'), ('Talegaon', 'Talegaon'),
    ('Jaysingpur', 'Jaysingpur'), ('Warananagar', 'Warananagar'),
    ('Malkapur', 'Malkapur'), ('Dondaicha', 'Dondaicha'),
    ('Shahada', 'Shahada'), ('Chopda', 'Chopda'),
    ('Sangola', 'Sangola'), ('Akluj', 'Akluj'),
    ('Karad', 'Karad'), ('Barshi', 'Barshi'), ('Miraj', 'Miraj'),
    ('Ramtek', 'Ramtek'), ('Ulhasnagar', 'Ulhasnagar'),
    ('Virar', 'Virar'), ('Vasai', 'Vasai'), ('Panvel', 'Panvel'),
    ('Karjat', 'Karjat'), ('Kalyan', 'Kalyan'),
    ('Dombivali', 'Dombivali'), ('Badlapur', 'Badlapur'),
    ('Shegaon', 'Shegaon'), ('Pusad', 'Pusad'),
    ('Parli', 'Parli'), ('Ashti', 'Ashti'),
    ('Khed', 'Khed'), ('Shirol', 'Shirol'),
    ('Paniv', 'Paniv'), ('Kuran', 'Kuran'), ('Yadrav', 'Yadrav'),
    ('Lonere', 'Raigad'), ('Shevgaon', 'Shevgaon'),
    ('Baramati', 'Baramati'),
]

CITY_SPECIAL_CASE = [
    ('coep technological university', 'Pune'),
    ('savitribai phule pune university', 'Pune'),
    ('college of engineering pune', 'Pune'),
    ('anuradha college of engineering', 'Buldhana'),
    ('sardar patel college of engineering, andheri', 'Mumbai'),
    ('sardar patel college of engineering', 'Mumbai'),
    ('kalsekar technical campus', 'Navi Mumbai'),
    ('trinity college of engineering and research', 'Pune'),
    ('ashokrao mane group', 'Kolhapur'),
    ('pvg', 'Pune'),
    ('sanjeevan group', 'Kolhapur'),
    ('navsahyadri', 'Pune'),
    ('pimpri chinchwad', 'Pune'),
]

UNIV_CITY_FALLBACK = [
    ('mumbai university', 'Mumbai'),
    ('sndt women', 'Mumbai'),
    ('savitribai phule pune', 'Pune'),
    ('pune university', 'Pune'),
    ('shivaji university', 'Kolhapur'),
    ('sant gadge baba amravati', 'Amravati'),
    ('rashtrasant tukadoji maharaj nagpur', 'Nagpur'),
    ('dr. babasaheb ambedkar marathwada', 'Aurangabad'),
    ('ambedkar marathwada university', 'Aurangabad'),
    ('kavayitri bahinabai chaudhari', 'Jalgaon'),
    ('north maharashtra university', 'Jalgaon'),
    ('swami ramanand teerth', 'Nanded'),
    ('punyashlok ahilyadevi holkar solapur', 'Solapur'),
    ('solapur university', 'Solapur'),
    ('panjabrao deshmukh krishi', 'Akola'),
    ('gondwana university', 'Gadchiroli'),
    ('mahatma gandhi antarrashtriya hindi', 'Wardha'),
]

def extract_city_from_name(inst_name):
    if not inst_name:
        return ""
    name_lower = inst_name.lower()
    for keyword, city in CITY_SPECIAL_CASE:
        if keyword in name_lower:
            return city
    best = None
    for match_name, display in CITY_MATCH_ORDER:
        for m in re.finditer(r'(?<![a-z0-9])' + re.escape(match_name.lower()) + r'(?![a-z0-9])', name_lower):
            if best is None or m.end() > best[0] or (m.end() == best[0] and len(match_name) > best[1]):
                best = (m.end(), len(match_name), display)
    return best[2] if best else ""

def extract_city_from_status(status_text):
    if not status_text:
        return ""
    st = status_text.lower()
    for univ, city in UNIV_CITY_FALLBACK:
        if univ in st:
            return city
    return ""

# ============================== HELPERS ==============================

def clean_text(text):
    if text is None:
        return ""
    return str(text).strip().replace('\n', '').replace(' ', '')

def normalize_category(cat):
    return CATEGORY_NORMALIZE.get(cat, cat)

def get_sort_key_cet(category):
    cat_normalized = CATEGORY_NORMALIZE.get(category, category)
    if cat_normalized in CET_CATEGORY_ORDER:
        return CET_CATEGORY_ORDER.index(cat_normalized)
    return 999

def get_section_type(words_list, table_top_y):
    """Classify the section a table belongs to. Only these are extracted:
    HOME_HOME, OTHER_OTHER, STATE_LEVEL. Everything else is forbidden."""
    header_text_parts = [w['text'] for w in words_list if (table_top_y - 150) < w['top'] < (table_top_y - 2)]
    full_header = " ".join(header_text_parts).lower()
    full_header_norm = full_header.replace('university', 'univ')

    if "home univ" in full_header_norm and "seats allotted to home" in full_header_norm:
        return "HOME_HOME"
    if "other than home univ" in full_header_norm and "seats allotted to other" in full_header_norm:
        return "OTHER_OTHER"
    if "state level" in full_header_norm:
        return "STATE_LEVEL"
    return "FORBIDDEN"

def parse_table(table, is_continuation):
    """Extract a list of {category: (rank, perc)} row-dicts from a pdfplumber table.

    Main table layout:
        [None, 'GOPENS', 'GSCS', ...]               <- header (categories)
        ['I', '4148(99.04)', '13137(96.9)', ..]     <- Stage-I data row (only row used)

    Continuation table layout (overflow columns from previous page):
        ['ORPHANI', 'ORPHANN', 'EWS']               <- header
        ['53916(87.2)', '10161(97.6)', '2656(99.3)']<- data row(s) - ALL rows used.
    Returns one dict per data row (each row -> one branch on a continuation page).
    """
    data = table.extract()
    if not data:
        return []

    header_idx = -1
    for r_idx, row in enumerate(data[:4]):
        if not row:
            continue
        row_text = " ".join(str(c) for c in row if c)
        if any(tok in row_text for tok in CATEGORY_HEADER_TOKENS):
            header_idx = r_idx
            break
    if header_idx == -1:
        return []

    header_row = data[header_idx]
    next_row = data[header_idx + 1] if (header_idx + 1) < len(data) else None

    col_map = {}
    for c_idx, cell in enumerate(header_row):
        base_text = clean_text(cell)
        norm = normalize_category(base_text)
        if norm in CET_ALL_CATEGORIES:
            col_map[c_idx] = norm
            continue
        if next_row and c_idx < len(next_row):
            combined = base_text + clean_text(next_row[c_idx])
            comb_norm = normalize_category(combined)
            if comb_norm in CET_ALL_CATEGORIES:
                col_map[c_idx] = comb_norm

    if not col_map:
        return []

    rows_out = []
    for r_idx in range(header_idx + 1, len(data)):
        row = data[r_idx]
        if not row:
            continue
        if not is_continuation:
            first_cell = clean_text(row[0]) if len(row) > 0 else ""
            if not STAGE_I_REGEX.match(first_cell):
                continue
        res = {}
        for c_idx in sorted(col_map.keys()):
            if c_idx >= len(row):
                continue
            cell_content = str(row[c_idx]) if row[c_idx] is not None else ""
            m = RANK_PERC_REGEX.search(cell_content)
            if m:
                cat = col_map[c_idx]
                # first column wins when two headers normalize to one (ORPHANI/ORPHANN)
                if cat not in res:
                    res[cat] = (m.group(1), m.group(2))
        if res:
            rows_out.append(res)
    return rows_out

# ============================== PHASE 1: DISCOVER ==============================

def discover_all_institutes_and_branches(pdf_folder, on_event=None):
    """Scan all PDFs, discover institute codes/names/cities + branch codes/names."""
    all_data = {}

    pdf_files = sorted([f for f in os.listdir(pdf_folder) if f.lower().endswith('.pdf')])
    if not pdf_files:
        raise RuntimeError(f"No PDF files found in folder '{pdf_folder}'")

    total_pages = 0
    for pdf_file in pdf_files:
        try:
            import pdfplumber
            with pdfplumber.open(os.path.join(pdf_folder, pdf_file)) as pdf:
                total_pages += len(pdf.pages)
        except Exception:
            pass

    if on_event:
        on_event({'type': 'phase', 'phase': 'discover', 'total_pages': total_pages, 'files': pdf_files})

    import pdfplumber
    page_no = 0
    for pdf_file in pdf_files:
        pdf_path = os.path.join(pdf_folder, pdf_file)
        try:
            with pdfplumber.open(pdf_path) as pdf:
                for page in pdf.pages:
                    page_no += 1
                    if on_event and page_no % 10 == 0:
                        on_event({'type': 'progress', 'phase': 'discover', 'page': page_no, 'total': total_pages})
                    text = page.extract_text()
                    if not text:
                        continue
                    lines = text.split('\n')

                    # ---- institutes: 5-digit code - name (never a 10-digit branch code) ----
                    inst_matches = INST_CODE_REGEX.findall(text)
                    for inst_code, inst_name in inst_matches:
                        inst_code = inst_code.strip()
                        inst_name = inst_name.strip().rstrip(',').strip()
                        inst_name = re.sub(r'\s+', ' ', inst_name)
                        if inst_code not in all_data:
                            city = extract_city_from_name(inst_name)
                            all_data[inst_code] = {
                                "name": inst_name,
                                "branches": {},
                                "city": city,
                                "status": "",
                            }

                    # ---- status lines attach to the institute above ----
                    for i, ln in enumerate(lines):
                        if ln.lower().startswith('status:'):
                            for j in range(max(0, i - 6), i + 1):
                                im = INST_CODE_REGEX.search(lines[j]) if j < len(lines) else None
                                if im:
                                    code = im.group(1).strip()
                                    if code in all_data and not all_data[code]["status"]:
                                        all_data[code]["status"] = ln.strip()
                                    break

                    # ---- branches: 10-digit code - name, taken straight from the line ----
                    # No per-code page.search() => dramatically faster.
                    for branch_code, branch_name in BRANCH_LINE_REGEX.findall(text):
                        potential_inst_code = branch_code[:5]
                        if potential_inst_code not in all_data:
                            continue
                        if branch_code in all_data[potential_inst_code]["branches"]:
                            continue
                        branch_name = branch_name.strip()
                        branch_name = re.sub(r'[^a-zA-Z0-9\s\-\.\&\(\)]', '', branch_name)
                        branch_name = re.sub(r'\s+', ' ', branch_name).lstrip('-').strip()
                        if len(branch_name) > 80:
                            branch_name = branch_name[:80] + "..."
                        if not branch_name:
                            branch_name = "Unknown Branch"
                        all_data[potential_inst_code]["branches"][branch_code] = branch_name
                        if on_event:
                            on_event({'type': 'branch_found', 'inst': potential_inst_code,
                                      'branch': branch_code, 'branch_name': branch_name})
        except Exception as e:
            raise RuntimeError(f"Error reading {pdf_file}: {e}") from e

    for code, info in all_data.items():
        if not info.get("city"):
            info["city"] = extract_city_from_status(info.get("status", ""))

    return all_data

# ============================== PHASE 2: EXTRACT ==============================

def _detect_round(pdf_file):
    fname_lower = pdf_file.lower()
    if "round1" in fname_lower or fname_lower.startswith("r1"):
        return 1
    if "round2" in fname_lower or fname_lower.startswith("r2"):
        return 2
    if "round3" in fname_lower or fname_lower.startswith("r3"):
        return 3
    if "round4" in fname_lower or fname_lower.startswith("r4"):
        return 4
    return 1

def _find_branch_lines(page, text=None, words=None):
    """Return ordered list of (top, inst_code, branch_code) for branch lines on a page.
    Pass pre-extracted text/words to avoid re-extraction (expensive)."""
    text = text if text is not None else (page.extract_text() or "")
    if not text:
        return []
    words = words if words is not None else page.extract_words()
    result = []
    for ln in text.split('\n'):
        m = BRANCH_LINE_REGEX.match(ln.strip())
        if not m:
            continue
        branch_code = m.group(1)
        top = None
        for w in words:
            if w['text'] == branch_code:
                top = w['top']
                break
        if top is None:
            continue
        result.append((top, branch_code[:5], branch_code))
    result.sort(key=lambda x: x[0])
    return result

def extract_all_data(pdf_folder, all_institutes=None, on_event=None):
    """Single-pass discovery + extraction for ALL institutes/branches/categories.

    Discovery and cutoff extraction happen in ONE pass over the PDFs (much faster
    than the old two-pass approach). Returns (master_data, all_institutes).

    master_data[inst_code][branch_code][category][round_num] = (rank, perc)
    """
    import pdfplumber

    if all_institutes is None:
        all_institutes = {}
    master_data = {}
    for inst_code, inst_info in all_institutes.items():
        master_data[inst_code] = {}
        for branch_code in inst_info["branches"]:
            master_data[inst_code][branch_code] = {}

    pdf_files = sorted([f for f in os.listdir(pdf_folder) if f.lower().endswith('.pdf')])
    if not pdf_files:
        raise RuntimeError(f"No PDF files found in folder '{pdf_folder}'")

    total_pages = 0
    for pdf_file in pdf_files:
        try:
            with pdfplumber.open(os.path.join(pdf_folder, pdf_file)) as pdf:
                total_pages += len(pdf.pages)
        except Exception:
            pass

    if on_event:
        on_event({'type': 'phase', 'phase': 'discover', 'total_pages': total_pages, 'files': pdf_files})

    page_no = 0
    for pdf_file in pdf_files:
        round_num = _detect_round(pdf_file)
        if on_event:
            on_event({'type': 'phase', 'phase': 'extract', 'round': round_num, 'file': pdf_file})
            on_event({'type': 'round_start', 'round': round_num})

        pdf_path = os.path.join(pdf_folder, pdf_file)
        try:
            with pdfplumber.open(pdf_path) as pdf:
                prev_page_records = []

                for page in pdf.pages:
                    page_no += 1
                    if on_event and page_no % 5 == 0:
                        on_event({'type': 'progress', 'phase': 'discover',
                                  'page': page_no, 'total': total_pages})

                    text = page.extract_text()
                    if not text:
                        continue
                    words = page.extract_words()
                    if not words:
                        continue
                    lines = text.split('\n')

                    # ---------- DISCOVER institutes / branches on this page ----------
                    inst_matches = INST_CODE_REGEX.findall(text)
                    for inst_code, inst_name in inst_matches:
                        inst_code = inst_code.strip()
                        inst_name = re.sub(r'\s+', ' ', inst_name.strip().rstrip(',').strip())
                        if inst_code not in all_institutes:
                            all_institutes[inst_code] = {
                                "name": inst_name, "branches": {},
                                "city": extract_city_from_name(inst_name), "status": "",
                            }
                            master_data.setdefault(inst_code, {})

                    for i, ln in enumerate(lines):
                        if ln.lower().startswith('status:'):
                            for j in range(max(0, i - 6), i + 1):
                                im = INST_CODE_REGEX.search(lines[j]) if j < len(lines) else None
                                if im:
                                    code = im.group(1).strip()
                                    if code in all_institutes and not all_institutes[code]["status"]:
                                        all_institutes[code]["status"] = ln.strip()
                                    break

                    branch_matches = BRANCH_LINE_REGEX.findall(text)
                    for branch_code, branch_name in branch_matches:
                        potential_inst_code = branch_code[:5]
                        if potential_inst_code not in all_institutes:
                            continue
                        branch_name = re.sub(r'\s+', ' ', branch_name.strip())
                        branch_name = re.sub(r'[^a-zA-Z0-9\s\-\.\&\(\)]', '', branch_name).lstrip('-').strip()
                        if len(branch_name) > 80:
                            branch_name = branch_name[:80] + "..."
                        if not branch_name:
                            branch_name = "Unknown Branch"
                        all_institutes[potential_inst_code]["branches"].setdefault(branch_code, branch_name)
                        master_data.setdefault(potential_inst_code, {}).setdefault(branch_code, {})
                        if on_event:
                            on_event({'type': 'branch_found', 'inst': potential_inst_code,
                                      'branch': branch_code, 'branch_name': branch_name})

                    branch_lines = _find_branch_lines(page, text, words)
                    tables = page.find_tables()
                    if not tables:
                        continue

                    # ---------- Continuation page (overflow columns of previous page) ----------
                    if not branch_lines:
                        claimed = set()
                        for table_obj in sorted(tables, key=lambda t: t.bbox[1]):
                            t_top = table_obj.bbox[1]
                            cont_rows = parse_table(table_obj, is_continuation=True)
                            if not cont_rows:
                                continue
                            for cont in cont_rows:
                                _merge_continuation(cont, prev_page_records, claimed, round_num,
                                                    master_data, on_event, t_top)
                        continue

                    # ---------- Normal page: associate tables with the branch line above ----------
                    branch_idx = 0
                    current_records = []
                    record_by_key = {}

                    for table_obj in sorted(tables, key=lambda t: t.bbox[1]):
                        t_top = table_obj.bbox[1]
                        while (branch_idx < len(branch_lines) - 1 and
                               branch_lines[branch_idx + 1][0] < t_top):
                            branch_idx += 1
                        if branch_idx >= len(branch_lines) or branch_lines[branch_idx][0] > t_top:
                            continue
                        _, inst_code, branch_code = branch_lines[branch_idx]

                        if inst_code not in master_data or branch_code not in master_data[inst_code]:
                            continue

                        sec_type = get_section_type(words, t_top)
                        if sec_type == "FORBIDDEN":
                            continue

                        table_results_list = parse_table(table_obj, is_continuation=False)
                        if not table_results_list:
                            continue

                        key = (inst_code, branch_code)
                        if key not in record_by_key:
                            rec = {
                                'inst': inst_code,
                                'branch': branch_code,
                                'cats': set(),
                                'data': master_data[inst_code][branch_code],
                                'top': t_top,
                            }
                            record_by_key[key] = rec
                            current_records.append(rec)
                        rec = record_by_key[key]

                        for table_results in table_results_list:
                            for category, (rank, perc) in table_results.items():
                                if category not in rec['data']:
                                    rec['data'][category] = {}
                                rec['data'][category][round_num] = (rank, perc)
                                rec['cats'].add(category)
                                if on_event:
                                    inst_name = all_institutes.get(inst_code, {}).get("name", inst_code)
                                    branch_name = all_institutes[inst_code]["branches"].get(branch_code, branch_code)
                                    on_event({'type': 'item', 'round': round_num,
                                              'inst': inst_code, 'inst_name': inst_name,
                                              'branch': branch_code, 'branch_name': branch_name,
                                              'category': category, 'rank': rank, 'perc': perc})

                    prev_page_records = current_records
        except Exception as e:
            raise RuntimeError(f"Error processing {pdf_file}: {e}") from e

    for code, info in all_institutes.items():
        if not info.get("city"):
            info["city"] = extract_city_from_status(info.get("status", ""))

    return master_data, all_institutes

def _merge_continuation(cont_results, prev_page_records, claimed, round_num, master_data, on_event, t_top):
    """Attach a continuation table (overflow columns) to the correct branch of the
    previous page. Matching strategy (covers EWS / ORPHAN / trailing categories
    spilled onto a following page for EVERY branch, incl. COEP, PICT, VIT):
      1. Position: a continuation table sits at the same vertical band (top) as
         exactly ONE branch table on the previous page -> assign to that branch.
      2. Otherwise walk the previous page's branches in order of appearance and
         pick the first branch that does NOT already contain any of the
         continuation's categories (a split table never repeats a category).
      3. Fallback: first branch not yet claimed on this continuation page.
    A continuation category is ALWAYS attached (never dropped): the branch's own
    R1 value wins; a "--" is never copied onto a branch that already has a value.
    """
    cont_cats = set(cont_results.keys())

    matched = None
    # 1) vertical-band match (robust, unambiguous)
    if prev_page_records and t_top is not None:
        same_band = [r for r in prev_page_records if abs(r.get('top', -1) - t_top) < 60]
        if len(same_band) == 1:
            matched = same_band[0]
    # 2) no-category-overlap walk
    if matched is None:
        for rec in prev_page_records:
            if id(rec) in claimed:
                continue
            if not (rec['cats'] & cont_cats):
                matched = rec
                break
    # 3) fallback
    if matched is None:
        for rec in prev_page_records:
            if id(rec) not in claimed:
                matched = rec
                break
    if matched is None:
        return

    claimed.add(id(matched))
    for category, (rank, perc) in cont_results.items():
        cat_rounds = matched['data'].setdefault(category, {})
        # R1 value wins; a "--"/empty placeholder never overwrites a real value
        if round_num not in cat_rounds:
            cat_rounds[round_num] = (rank, perc)
        matched['cats'].add(category)
        if on_event:
            on_event({'type': 'item', 'round': round_num,
                      'inst': matched['inst'], 'inst_name': "",
                      'branch': matched['branch'], 'branch_name': "",
                      'category': category, 'rank': rank, 'perc': perc})

# ============================== PHASE 3: EXCEL ==============================

EXCEL_COLS = [
    "Institute CODE", "INSTITUTE", "CITY", "Branch Code", "BRANCH NAME", "CATEGORY",
    "R1 RANK", "R1 PERCENTILE", "R2 RANK", "R2 PERCENTILE",
    "R3 RANK", "R3 PERCENTILE", "R4 RANK", "R4 PERCENTILE",
]

def generate_excel(all_institutes, master_data, output_dir="CET DATA"):
    """Build the master Excel from extracted data (union of categories across rounds)."""
    import pandas as pd

    output_rows = []

    for inst_code in sorted(all_institutes.keys()):
        inst_info = all_institutes[inst_code]
        inst_name = inst_info["name"]
        city = inst_info.get("city", "")
        branches = inst_info["branches"]

        if inst_code not in master_data or not master_data[inst_code]:
            for branch_code in sorted(branches.keys()):
                row = {
                    "Institute CODE": inst_code,
                    "INSTITUTE": inst_name,
                    "CITY": city,
                    "Branch Code": branch_code,
                    "BRANCH NAME": branches[branch_code],
                    "CATEGORY": "NO STAGE I DATA",
                }
                for r in range(1, 5):
                    row[f"R{r} RANK"] = "--"
                    row[f"R{r} PERCENTILE"] = "--"
                output_rows.append(row)
            continue

        branch_data = master_data[inst_code]
        for branch_code in sorted(branches.keys()):
            branch_name = branches[branch_code]

            if branch_code not in branch_data or not branch_data[branch_code]:
                row = {
                    "Institute CODE": inst_code,
                    "INSTITUTE": inst_name,
                    "CITY": city,
                    "Branch Code": branch_code,
                    "BRANCH NAME": branch_name,
                    "CATEGORY": "--",
                }
                for r in range(1, 5):
                    row[f"R{r} RANK"] = "--"
                    row[f"R{r} PERCENTILE"] = "--"
                output_rows.append(row)
                continue

            # UNION of categories across all rounds -> nothing is ever dropped
            cats_found = set()
            for cat, rounds in branch_data[branch_code].items():
                if cat and rounds:
                    cats_found.add(cat)
            sorted_cats = sorted(cats_found, key=get_sort_key_cet)

            for cat in sorted_cats:
                row = {
                    "Institute CODE": inst_code,
                    "INSTITUTE": inst_name,
                    "CITY": city,
                    "Branch Code": branch_code,
                    "BRANCH NAME": branch_name,
                    "CATEGORY": cat,
                }
                for r in range(1, 5):
                    rank_val, perc_val = "--", "--"
                    if r in branch_data[branch_code][cat]:
                        rank_val, perc_val = branch_data[branch_code][cat][r]
                    row[f"R{r} RANK"] = rank_val
                    row[f"R{r} PERCENTILE"] = perc_val
                output_rows.append(row)

    if not output_rows:
        raise RuntimeError("No data to write.")

    df = pd.DataFrame(output_rows)
    for c in EXCEL_COLS:
        if c not in df.columns:
            df[c] = ""
    df = df[EXCEL_COLS]

    os.makedirs(output_dir, exist_ok=True)
    date_str = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    output_filename = f"ALL_COLLEGES_CONSOLIDATED_{date_str}.xlsx"
    output_path = os.path.join(output_dir, output_filename)

    try:
        df.to_excel(output_path, index=False)
    except PermissionError:
        output_filename = f"ALL_COLLEGES_BACKUP_{date_str}.xlsx"
        output_path = os.path.join(output_dir, output_filename)
        df.to_excel(output_path, index=False)

    format_excel(output_path)

    return output_path, len(df)

def format_excel(file_path):
    try:
        wb = load_workbook(file_path)
        ws = wb.active
        header_font = Font(bold=True, color="FFFFFF")
        header_fill = PatternFill(start_color="4F81BD", end_color="4F81BD", fill_type="solid")
        center_align = Alignment(horizontal='center', vertical='center', wrap_text=True)
        thin_border = Border(left=Side(style='thin'), right=Side(style='thin'),
                             top=Side(style='thin'), bottom=Side(style='thin'))

        for cell in ws[1]:
            cell.font = header_font
            cell.fill = header_fill
            cell.alignment = center_align
            cell.border = thin_border

        for row in ws.iter_rows(min_row=2):
            for cell in row:
                cell.alignment = center_align
                cell.border = thin_border

        for col in ws.columns:
            max_length = 0
            column = col[0].column_letter
            for cell in col:
                try:
                    if len(str(cell.value)) > max_length:
                        max_length = len(str(cell.value))
                except Exception:
                    pass
            adjusted_width = (max_length + 2) * 1.2
            ws.column_dimensions[column].width = max(adjusted_width, 12)

        ws.freeze_panes = 'A2'
        wb.save(file_path)
        return True
    except PermissionError:
        return False
    except Exception:
        return False

# ============================== FULL WORKFLOW ==============================

def run_workflow(pdf_folder="PDFs", output_dir="CET DATA", on_event=None):
    """Complete pipeline: discover+extract (single pass) -> excel. Returns output path."""
    if not os.path.exists(pdf_folder):
        raise RuntimeError(f"Folder '{pdf_folder}' not found! Create it and add CET PDF files.")

    if on_event:
        on_event({'type': 'banner', 'msg': 'CET CUTOFF DATA EXTRACTOR - ALL COLLEGES AT ONCE'})

    master_data, all_institutes = extract_all_data(pdf_folder, None, on_event)
    if not all_institutes:
        raise RuntimeError("No institutes found in the PDFs!")

    total_branches = sum(len(info["branches"]) for info in all_institutes.values())
    if on_event:
        on_event({'type': 'discovered', 'institutes': len(all_institutes), 'branches': total_branches,
                  'institute_list': [{'code': c, 'name': i['name'], 'city': i.get('city', ''),
                                      'branches': len(i['branches'])} for c, i in sorted(all_institutes.items())]})

    if on_event:
        on_event({'type': 'phase', 'phase': 'excel'})

    output_path, row_count = generate_excel(all_institutes, master_data, output_dir)

    if on_event:
        on_event({'type': 'done', 'file': output_path, 'rows': row_count,
                  'institutes': len(all_institutes), 'branches': total_branches})

    return output_path