Chart.defaults.font.family = "'Cairo', system-ui, sans-serif";
Chart.defaults.color = '#333';

const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbysvvrVlCAKXa-3f40U_iCCH_cmwS3qj921RIINwemHqP2RcIgSmzvGlmKepbu14gjBlw/exec";

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

async function downloadDirectPDF(elementId, titleText, isLandscape = false) {
    const element = document.getElementById(elementId);
    if (!element || element.innerText.trim() === '') return toast('⚠️ استخرج التقرير أولاً', 'warn');

    document.getElementById('reportLoader').style.display = 'flex';
    window.scrollTo({ top: 0, behavior: 'instant' });

    const noPdfElements = element.querySelectorAll('.no-pdf');
    noPdfElements.forEach(el => el.style.display = 'none');
    const headers = element.querySelectorAll('.report-title-header');
    headers.forEach(h => h.style.display = 'block');

    if (!isLandscape) {
        let rowInput = prompt("كم عدد السجلات التي تريدها في الصفحة الواحدة؟ (أدخل رقم من 1 إلى 50)", "50");
        let rowsPerPage = parseInt(rowInput);
        if (isNaN(rowsPerPage) || rowsPerPage < 1) rowsPerPage = 50;
        if (rowsPerPage > 50) rowsPerPage = 50;

        document.querySelectorAll('.page-break-row').forEach(el => el.classList.remove('page-break-row'));
        
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
        margin: 0.2,
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
    const opts = cloudUsers.map(u => `<option value="${escapeHtml(u.username.toLowerCase())}">${escapeHtml(u.username.toUpperCase())}</option>`).join('');
    if (selectEl && cloudUsers.length > 0) selectEl.innerHTML = opts;
    if (passSelectEl && cloudUsers.length > 0) passSelectEl.innerHTML = opts;
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
        toast('❌ كلمة المرور غير صحيحة!', 'error');
    }
}

function logout() {
    if (currentUser) syncToCloud("updateUserActivity", { username: currentUser.username, isOnline: false, lastLogin: new Date().toLocaleString() });
    currentUser = null; stopAllScanners();
    document.getElementById('mainContainer').style.display = 'none';
    document.getElementById('loginOverlay').style.display = 'flex';
    if (document.getElementById('entryPassInput')) document.getElementById('entryPassInput').value = '';
}

function applyRolePermissions() {
    const adminElements = document.querySelectorAll('.admin-only');
    const managerElements = document.querySelectorAll('.manager-only');
    
    showTab('salesTab');

    const isManager = currentUser && (currentUser.username === 'admin' || currentUser.username === 'cs2' || currentUser.role === 'Admin');

    if (!isManager) {
        managerElements.forEach(el => el.style.display = 'none');
    } else {
        managerElements.forEach(el => el.style.display = '');
    }

    if (currentUser && currentUser.role !== 'Admin' && currentUser.username !== 'admin') {
        adminElements.forEach(el => el.style.display = 'none');
    } else {
        adminElements.forEach(el => el.style.display = '');
    }
}

async function createNewUserSystem() {
    if (currentUser?.role !== 'Admin') { toast("❌ متاح للأدمن فقط!", 'error'); return; }
    const uName = document.getElementById('addUserName')?.value.trim().toLowerCase();
    const uPass = document.getElementById('addUserPass')?.value.trim();
    const uRole = document.getElementById('addUserRole')?.value || 'Cashier';

    if (!uName || !uPass) { toast("يرجى إدخال اسم المستخدم وكلمة المرور!", 'warn'); return; }
    const exists = cloudUsers.find(u => u.username.toLowerCase() === uName);
    if (exists) { toast(`⚠️ المستخدم [${uName.toUpperCase()}] موجود بالفعل!`, 'error'); return; }

    const passHash = await sha256Hex(uPass);
    const newUser = { username: uName, passwordHash: passHash, role: uRole, lastLogin: '-', isOnline: 'Offline' };

    cloudUsers.push(newUser); saveLocalUsers(cloudUsers);
    syncToCloud("createUser", { username: uName, passwordHash: passHash, role: uRole });

    toast(`✅ تم إنشاء الحساب بنجاح!`, 'success');
    document.getElementById('addUserName').value = ''; document.getElementById('addUserPass').value = '';
}

async function changeUserPasswordSystem() {
    if (currentUser?.role !== 'Admin') { toast('❌ متاح للأدمن فقط!', 'error'); return; }
    const targetUser = document.getElementById('userSelectPass')?.value;
    const newPass = document.getElementById('newAccountPass')?.value.trim();
    if (!newPass) { toast('يرجى إدخال كلمة المرور الجديدة!', 'warn'); return; }

    let uObj = cloudUsers.find(u => u.username.toLowerCase() === targetUser.toLowerCase());
    if (uObj) {
        uObj.passwordHash = await sha256Hex(newPass); saveLocalUsers(cloudUsers);
        syncToCloud("updateUserPassword", { username: targetUser, newPasswordHash: uObj.passwordHash });
        toast(`✅ تم تحديث الرقم السري للمستخدم!`, 'success');
        document.getElementById('newAccountPass').value = '';
    }
}

function loadRatesFromStorage() {
    const savedRates = localStorage.getItem('anjum_rates');
    if (savedRates) { RATES = JSON
