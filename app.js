Chart.defaults.font.family = "'Cairo', system-ui, sans-serif";
Chart.defaults.color = '#333';

const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbysvvrVlCAKXa-3f40U_iCCH_cmwS3qj921RIINwemHqP2RcIgSmzvGlmKepbu14gjBlw/exec";

// ==========================================
// Utility Functions
// ==========================================
function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function uid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'id-' + Date.now() + '-' + Math.random().toString(16).slice(2);
}

async function sha256Hex(text) {
    if (!(window.crypto && crypto.subtle)) return text;
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function toast(message, type = 'info', ms = 3500) {
    const stack = document.getElementById('toastStack');
    if (!stack) return;
    const el = document.createElement('div');
    el.className = 'toast ' + (type === 'success' || type === 'error' || type === 'warn' ? type : '');
    el.innerHTML = message; 
    stack.appendChild(el);
    setTimeout(() => el.remove(), ms);
}

function openModal(innerHtml) {
    const box = document.getElementById('modalBox');
    const overlay = document.getElementById('modalOverlay');
    if (box && overlay) { box.innerHTML = innerHtml; overlay.classList.add('open'); }
}

function closeModal() {
    const overlay = document.getElementById('modalOverlay');
    const box = document.getElementById('modalBox');
    if (overlay) overlay.classList.remove('open');
    if (box) box.innerHTML = '';
}

function confirmModal(message, onYes) {
    openModal(`
        <h3 style="text-align:center; color:#c0392b; margin-bottom:15px; font-size:1.4rem;">⚠️ تأكيد الإجراء</h3>
        <p style="text-align:center; font-size:1.1rem; font-weight:bold; margin-bottom:20px;">${escapeHtml(message)}</p>
        <div style="display:flex; justify-content:center; gap:10px;">
            <button class="btn btn-red" id="modalYesBtn" style="padding:10px 20px; font-size:1.1rem;">نعم، استمر</button>
            <button class="btn btn-gray" style="background:#7f8c8d; padding:10px 20px; font-size:1.1rem;" onclick="closeModal()">إلغاء</button>
        </div>
    `);
    const btn = document.getElementById('modalYesBtn');
    if (btn) btn.onclick = () => { closeModal(); onYes(); };
}

function formatDateDisplay(dateStr) {
    if (!dateStr) return '-';
    let clean = dateStr.toString().replace('T', ' ').replace('.000Z', '');
    if (clean.length > 10 && !clean.includes(' ')) {
        let timePart = clean.slice(0, 5);
        let datePart = clean.slice(5);
        return `${datePart}${timePart}`;
    }
    return clean;
}

// ==========================================
// PDF Export
// ==========================================
async function downloadDirectPDF(elementId, titleText, isLandscape = false) {
    const element = document.getElementById(elementId);
    if (!element || element.innerText.trim() === '') return toast('⚠️ استخرج التقرير أولاً', 'warn');

    document.getElementById('reportLoader').style.display = 'flex';
    window.scrollTo({ top: 0, behavior: 'instant' });

    const noPdfElements = element.querySelectorAll('.no-pdf');
    noPdfElements.forEach(el => el.style.display = 'none');
    const headers = element.querySelectorAll('.report-title-header');
    headers.forEach(h => h.style.display = 'block');

    // إزالة class page-break-row من كل الصفوف
    document.querySelectorAll('.page-break-row').forEach(el => el.classList.remove('page-break-row'));

    // تطبيق page-break فقط إذا لم يكن Landscape (للجداول الطويلة كالمبيعات)
    if (!isLandscape) {
        let rowsPerPage = 45; // عدد الصفوف قبل كسر الصفحة لتجنب الصفحات الفارغة
        let tableId = elementId === 'reportsPrintArea' ? 'reportsTable' : (elementId === 'financePrintArea' ? 'financeTable' : 'stockTable');
        const rows = element.querySelectorAll(`#${tableId} tbody tr`);
        rows.forEach((row, index) => {
            if ((index + 1) % rowsPerPage === 0 && index !== rows.length - 1) row.classList.add('page-break-row');
        });
        element.classList.add('pdf-compact');
    }

    toast('⏳ جاري تجهيز التقرير...', 'info');
    await new Promise(r => setTimeout(r, 400));

    const fileName = `${titleText.replace(/[^a-zA-Z0-9\u0600-\u06FF]/g, '_')}_${Date.now()}.pdf`;
    const opt = {
        margin: [0.2, 0.2, 0.5, 0.2], // تقليل الهامش السفلي لتجنب صفحات فارغة زائدة
        filename: fileName,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, scrollY: 0 },
        jsPDF: { unit: 'in', format: 'a4', orientation: isLandscape ? 'landscape' : 'portrait' },
        pagebreak: { mode: ['css', 'legacy'], avoid: ['tr', '.chart-page', '.total-row'] }
    };

    try {
        if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) {
            try {
                let pdfDataUri = await html2pdf().set(opt).from(element).outputPdf('datauristring');
                let cleanBase64 = pdfDataUri.replace(/^data:application\/[a-z]+;base64,/, "");
                const savedFile = await window.Capacitor.Plugins.Filesystem.writeFile({ path: fileName, data: cleanBase64, directory: 'CACHE' });
                await window.Capacitor.Plugins.Share.share({ title: titleText, url: savedFile.uri, dialogTitle: 'حفظ التقرير 📄' });
                toast('✅ تم فتح شاشة المشاركة!', 'success');
            } catch (shareErr) { console.error('Share Plugin Failed:', shareErr); window.print(); }
        } else {
            const blob = await html2pdf().set(opt).from(element).outputPdf('blob');
            const blobUrl = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.style.display = 'none'; a.href = blobUrl; a.download = opt.filename;
            document.body.appendChild(a); a.click(); URL.revokeObjectURL(blobUrl); a.remove();
            toast('✅ تم التنزيل!', 'success');
        }
    } catch (err) {
        console.error('PDF Error:', err); window.print();
    } finally {
        if (!isLandscape) element.classList.remove('pdf-compact');
        headers.forEach(h => h.style.display = 'none');
        noPdfElements.forEach(el => el.style.display = '');
        document.getElementById('reportLoader').style.display = 'none';
    }
}

function printSalesReportPDF() { downloadDirectPDF('reportsPrintArea', 'Sales_Report', true); }
function printFinanceReportPDF() { downloadDirectPDF('financePrintArea', 'Financial_Report', false); }
function printStockTable() {
    const isFilteredLow = isLowStockModeActive;
    if (isFilteredLow) {
        const uncheckedRows = document.querySelectorAll('#stockTableBody tr:not(.pdf-selected-row)');
        uncheckedRows.forEach(row => row.style.display = 'none');
    }
    
    downloadDirectPDF('stockPrintArea', 'Stock_Report', isFilteredLow ? false : true).finally(() => {
        if (isFilteredLow) {
            const allRows = document.querySelectorAll('#stockTableBody tr');
            allRows.forEach(row => row.style.display = '');
        }
    });
}

// ==========================================
// App State
// ==========================================
let currentUser = null; let cloudUsers = []; let currentNavIndex = -1;
let scanners = { sales: null, addNew: null, recharge: null, stock: null, return: null };
let activeScannerKey = null; let invoiceDiscountPercent = 0;
let floatingScannerInstance = null;
let RATES = { USD: 50, EUR: 60, GBP: 70, EGP: 1, VISA: 1, GUIDE_MULT: 3 };
let products = []; let selectedProdId = null; let selectedStockProdId = null;
let invoiceItems = []; let savedInvoices = []; let savedFinances = [];
let invoiceCounter = 1001; let activeInvoiceId = 1001;
let isLowStockModeActive = false;
let returnFoundInvoice = null;
let monthlyChartInst = null;
let topProductsChartInstance = null;

// ==========================================
// UI / Login / Users
// ==========================================
function togglePasswordVisibility() {
    const passInput = document.getElementById('entryPassInput');
    if (passInput) passInput.type = passInput.type === 'password' ? 'text' : 'password';
}

function playBeepSound() {
    try {
        let ctx = new (window.AudioContext || window.webkitAudioContext)();
        let osc = ctx.createOscillator();
        osc.type = 'sine'; osc.frequency.value = 1800; osc.connect(ctx.destination);
        osc.start(); osc.stop(ctx.currentTime + 0.12);
    } catch(e) {}
}

async function loadLocalUsers() {
    const savedUsers = localStorage.getItem('anjum_local_users');
    if (savedUsers) {
        cloudUsers = JSON.parse(savedUsers);
        let changed = false;
        for (const u of cloudUsers) {
            if (u.password && !u.passwordHash) {
                u.passwordHash = await sha256Hex(u.password); delete u.password; changed = true;
            }
        }
        if (changed) localStorage.setItem('anjum_local_users', JSON.stringify(cloudUsers));
    } else {
        cloudUsers = [
            { username: 'admin', passwordHash: await sha256Hex('852'), role: 'Admin' },
            { username: 'cashier', passwordHash: await sha256Hex('123'), role: 'Cashier' },
            { username: 'cs2', passwordHash: await sha256Hex('456'), role: 'User' }
        ];
        localStorage.setItem('anjum_local_users', JSON.stringify(cloudUsers));
    }
    renderUserDropdowns();
}

function saveLocalUsers(users) {
    if (users && users.length > 0) {
        cloudUsers = users; localStorage.setItem('anjum_local_users', JSON.stringify(users)); renderUserDropdowns();
    }
}

function renderUserDropdowns() {
    const selectEl = document.getElementById('entryUserSelect');
    const passSelectEl = document.getElementById('userSelectPass');
    
    // تأكد من وجود مستخدمين
    if (cloudUsers.length === 0) return;

    const opts = cloudUsers.map(u => `<option value="${escapeHtml(u.username.toLowerCase())}">${escapeHtml(u.username.toUpperCase())}</option>`).join('');
    if (selectEl) selectEl.innerHTML = opts;
    if (passSelectEl) passSelectEl.innerHTML = opts;
}

async function validateEntryPassword() {
    const usernameInput = document.getElementById('entryUserSelect')?.value.trim().toLowerCase();
    const passwordInput = document.getElementById('entryPassInput')?.value.trim();

    if (!usernameInput || !passwordInput) { toast('يرجى إدخال كلمة المرور!', 'warn'); return; }

    const hash = await sha256Hex(passwordInput);
    let matched = cloudUsers.find(u => u.username.toLowerCase() === usernameInput && u.passwordHash === hash);

    if (matched) {
        currentUser = matched;
        document.getElementById('loginOverlay').style.display = 'none';
        document.getElementById('mainContainer').style.display = 'block';
        
        let roleName = matched.role === 'Admin' ? 'أدمن' : (matched.role === 'Cashier' ? 'كاشير' : 'مستخدم');
        document.getElementById('userGreeting').textContent = `👤 المستخدم: ${matched.username.toUpperCase()} (${roleName})`;

        syncToCloud("updateUserActivity", { username: matched.username, isOnline: true, lastLogin: new Date().toLocaleString() });

        applyRolePermissions(); initSystem();
    } else {
