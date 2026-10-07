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

// ==========================================
// Initialization & Cloud Sync
// ==========================================
function loadRatesFromStorage() {
    const savedRates = localStorage.getItem('anjum_rates');
    if (savedRates) { RATES = JSON.parse(savedRates); if (!RATES.GUIDE_MULT) RATES.GUIDE_MULT = 3; }
    updateRateLabels();
}

function updateRateLabels() {
    if (document.getElementById('lblUSD')) document.getElementById('lblUSD').textContent = `دولار ($ × ${RATES.USD})`;
    if (document.getElementById('lblEUR')) document.getElementById('lblEUR').textContent = `يورو (€ × ${RATES.EUR})`;
    if (document.getElementById('lblGBP')) document.getElementById('lblGBP').textContent = `استرليني (£ × ${RATES.GBP})`;
    if (document.getElementById('lblVISA')) document.getElementById('lblVISA').textContent = `فيزا (× ${RATES.VISA})`;
    const thHead = document.getElementById('thStockGuideHead');
    if (thHead) thHead.textContent = `الحد الأدنى للبيع (×${RATES.GUIDE_MULT || 3})`;
}

function openRatesModal() {
    if (currentUser?.role !== 'Admin') { toast('❌ متاح للأدمن فقط!', 'error'); return; }
    openModal(`
        <h3 style="text-align:center; color:#1e3c72; margin-bottom:20px; font-size:1.5rem; font-weight:800;">⚙️ إعدادات أسعار الصرف والمضاعف</h3>
        <div class="payment-grid" style="gap:15px;">
            <div class="pay-box"><label>💵 سعر الدولار (USD)</label><input type="number" id="rateUSD" value="${RATES.USD}" style="padding:12px; font-size:1.2rem;"></div>
            <div class="pay-box"><label>💶 سعر اليورو (EUR)</label><input type="number" id="rateEUR" value="${RATES.EUR}" style="padding:12px; font-size:1.2rem;"></div>
            <div class="pay-box"><label>💷 سعر الاسترليني (GBP)</label><input type="number" id="rateGBP" value="${RATES.GBP}" style="padding:12px; font-size:1.2rem;"></div>
            <div class="pay-box"><label>💳 عمولة الفيزا</label><input type="number" id="rateVISA" value="${RATES.VISA}" style="padding:12px; font-size:1.2rem;"></div>
            <div class="pay-box" style="grid-column:span 2;"><label>📈 معامل الحد الأدنى للسعر (مضاعف الجملة)</label><input type="number" id="rateGuideMult" value="${RATES.GUIDE_MULT || 3}" style="padding:12px; font-size:1.2rem; border-color:#f39c12;"></div>
        </div>
        <div style="display:flex; justify-content:center; gap:15px; margin-top:25px;">
            <button class="btn btn-green" style="padding:12px 25px; font-size:1.1rem;" onclick="saveRatesFromModal()">حفظ الإعدادات ✅</button>
            <button class="btn btn-gray" style="background:#7f8c8d; padding:12px 25px; font-size:1.1rem;" onclick="closeModal()">إلغاء</button>
        </div>
    `);
}

function saveRatesFromModal() {
    RATES.USD = parseFloat(document.getElementById('rateUSD')?.value) || RATES.USD;
    RATES.EUR = parseFloat(document.getElementById('rateEUR')?.value) || RATES.EUR;
    RATES.GBP = parseFloat(document.getElementById('rateGBP')?.value) || RATES.GBP;
    RATES.VISA = parseFloat(document.getElementById('rateVISA')?.value) || RATES.VISA;
    RATES.GUIDE_MULT = parseFloat(document.getElementById('rateGuideMult')?.value) || RATES.GUIDE_MULT;

    localStorage.setItem('anjum_rates', JSON.stringify(RATES)); updateRateLabels(); closeModal();
    if (selectedProdId) pickProduct(selectedProdId);
    renderStockTable();
    toast('✅ تم تحديث إعدادات الصرف والمضاعف!', 'success');
}

function updateAlertsBar() {
    let lowStockCount = 0, expiringCount = 0; const today = new Date();
    products.forEach(p => {
        if (p.q <= 3) lowStockCount++;
        if (p.expiry) {
            const diffDays = (new Date(p.expiry) - today) / 86400000;
            if (diffDays < 90) expiringCount++;
        }
    });
    if (document.getElementById('lowStockCountVal')) document.getElementById('lowStockCountVal').textContent = `${lowStockCount} نواقص`;
    if (document.getElementById('expiringCountVal')) document.getElementById('expiringCountVal').textContent = `${expiringCount} صلاحية قريبة`;
}

function fetchInitialUsersOnly() {
    if (!navigator.onLine) return;
    window.handleUsersOnlyResponse = function(resData) {
        if (resData && resData.status === "success" && resData.users && resData.users.length > 0) saveLocalUsers(resData.users);
    };
    const script = document.createElement('script'); script.src = GOOGLE_SCRIPT_URL + "?callback=handleUsersOnlyResponse&nocache=" + Math.random(); document.body.appendChild(script);
}

function updateOnlineStatus() {
    const ind = document.getElementById('syncIndicator'); if (!ind) return;
    if (navigator.onLine) {
        ind.className = 'sync-status status-online'; ind.textContent = '🟢 متصل بالإنترنت'; processOfflineQueue();
    } else {
        ind.className = 'sync-status status-offline'; ind.textContent = '🔴 غير متصل بالإنترنت';
    }
}

function fetchCloudInvoicesData(callbackAfter) {
    if (!navigator.onLine) { if (callbackAfter) callbackAfter(); return; }
    const oldScript = document.getElementById('cloudSyncScript'); if (oldScript) oldScript.remove();

    window.handleCloudInvoicesResponse = function(resData) {
        if (resData && resData.status === "success") {
            if (resData.users) saveLocalUsers(resData.users);
            if (resData.products && resData.products.length > 0) {
                products = resData.products.map(p => ({ id: p.id || uid(), ...p }));
                saveProductsToStorage(); renderStockTable(); updateAlertsBar();
            }
            if (resData.nextInvoiceId) {
                invoiceCounter = resData.nextInvoiceId; localStorage.setItem('anjum_counter', invoiceCounter.toString());
            }
            if (resData.invoices) {
                savedInvoices = resData.invoices; saveInvoicesToStorage(); generateReport();
            }
            if (resData.finances) {
                savedFinances = resData.finances; saveFinancesToStorage(); renderFinanceTable();
            }
            prepareNewInvoice(); if (callbackAfter) callbackAfter();
            toast('🔄 تم التحديث السحابي بنجاح!', 'success');
        }
    };

    const script = document.createElement('script'); script.id = 'cloudSyncScript';
    script.src = GOOGLE_SCRIPT_URL + "?callback=handleCloudInvoicesResponse&nocache=" + Math.random();
    document.body.appendChild(script);
}

function syncToCloud(actionType, data) {
    if (!navigator.onLine) { queueOffline(actionType, data); return; }
    fetch(GOOGLE_SCRIPT_URL, {
        method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ action: actionType, data: data })
    })
    .then(res => { if (!res.ok) throw new Error("HTTP error " + res.status); return res.json(); })
    .catch(() => { queueOffline(actionType, data); toast('⚠️ تم وضع التحديث في طابور الانتظار لعدم توفر شبكة', 'warn'); });
}

function queueOffline(actionType, data) {
    let queue = JSON.parse(localStorage.getItem('anjum_offline_queue') || '[]');
    queue.push({ action: actionType, data: data }); localStorage.setItem('anjum_offline_queue', JSON.stringify(queue));
}

function processOfflineQueue() {
    let queue = JSON.parse(localStorage.getItem('anjum_offline_queue') || '[]');
    if (queue.length > 0) { queue.forEach(item => syncToCloud(item.action, item.data)); localStorage.removeItem('anjum_offline_queue'); }
}

function initSystem() {
    loadDataFromStorage(); loadRatesFromStorage(); prepareNewInvoice(); fetchCloudInvoicesData();
    updateOnlineStatus(); updateAlertsBar();
    const now = new Date(); now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    if (document.getElementById('finDate')) document.getElementById('finDate').value = now.toISOString().slice(0, 16);
}

function loadDataFromStorage() {
    const storedProducts = localStorage.getItem('anjum_products'); if (storedProducts) products = JSON.parse(storedProducts).map(p => ({ id: p.id || uid(), ...p }));
    const storedInvoices = localStorage.getItem('anjum_invoices'); if (storedInvoices) savedInvoices = JSON.parse(storedInvoices);
    const storedCounter = localStorage.getItem('anjum_counter'); if (storedCounter) invoiceCounter = parseInt(storedCounter);
    const storedFinances = localStorage.getItem('anjum_finances'); if (storedFinances) savedFinances = JSON.parse(storedFinances);
}

function saveProductsToStorage() { localStorage.setItem('anjum_products', JSON.stringify(products)); }
function saveInvoicesToStorage() { localStorage.setItem('anjum_invoices', JSON.stringify(savedInvoices)); localStorage.setItem('anjum_counter', invoiceCounter.toString()); }
function saveFinancesToStorage() { localStorage.setItem('anjum_finances', JSON.stringify(savedFinances)); }
function findProductById(id) { return products.find(p => String(p.id) === String(id)); }

function showTab(tabId, evt) {
    stopAllScanners();
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));

    const targetTab = document.getElementById(tabId); if (targetTab) targetTab.classList.add('active');
    
    let btnEl = evt && evt.target ? evt.target : document.querySelector(`.tab-btn[onclick*="${tabId}"]`);
    if (btnEl) btnEl.classList.add('active');

    if (tabId === 'stockTab') { isLowStockModeActive = false; renderStockTable(); }
    if (tabId === 'reportsTab') generateReport();
    if (tabId === 'financeTab') renderFinanceTable();
}

// ==========================================
// Scanner Management
// ==========================================
function toggleCameraScanner(key) {
    if (activeScannerKey === key) stopCameraScanner(key); else { stopAllScanners(); startCameraScanner(key); }
}

function startCameraScanner(key) {
    const containerId = key + 'ScannerContainer'; const readerId = key + 'CameraReader';
    const container = document.getElementById(containerId);
    if(container) container.style.display = 'block';

    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
            .then(stream => { stream.getTracks().forEach(t => t.stop()); initHtml5Scanner(key, readerId, containerId); })
            .catch(() => initHtml5Scanner(key, readerId, containerId));
    } else { initHtml5Scanner(key, readerId, containerId); }
}

function initHtml5Scanner(key, readerId, containerId) {
    try {
        scanners[key] = new Html5Qrcode(readerId);
        const config = { fps: 15, qrbox: { width: 250, height: 150 } };
        scanners[key].start(
            { facingMode: "environment" }, config,
            (decodedText) => onBarcodeScanned(key, decodedText), () => {}
        ).then(() => { activeScannerKey = key; })
         .catch(err => { toast("❌ فشل الوصول للكاميرا: " + err, 'error'); document.getElementById(containerId).style.display = 'none'; });
    } catch (e) {
        toast("❌ خطأ في تهيئة الماسح: " + e.message, 'error'); document.getElementById(containerId).style.display = 'none';
    }
}

function stopCameraScanner(key) {
    const containerId = key + 'ScannerContainer';
    if (scanners[key] && activeScannerKey === key) {
        scanners[key].stop().then(() => { activeScannerKey = null; document.getElementById(containerId).style.display = 'none'; }).catch(() => { document.getElementById(containerId).style.display = 'none'; });
    } else { const el = document.getElementById(containerId); if(el) el.style.display = 'none'; }
}

function stopAllScanners() { 
    ['sales', 'addNew', 'recharge', 'stock', 'return'].forEach(stopCameraScanner); 
    closeFloatingCamera();
}

function openFloatingCamera() {
    const overlay = document.getElementById('floatingCameraOverlay');
    if (!overlay) return;
    overlay.style.display = 'flex';
    
    setTimeout(() => {
        try {
            document.getElementById('floatingCameraReader').innerHTML = '';
            floatingScannerInstance = new Html5Qrcode('floatingCameraReader');
            floatingScannerInstance.start(
                { facingMode: "environment" },
                { fps: 15, qrbox: { width: 250, height: 150 } },
                (decodedText) => {
                    playBeepSound(); 
                    const barcodeQuery = decodedText.trim();
                    closeFloatingCamera();
                    
                    const existingBarcode = products.find(p => String(p.id) !== String(selectedStockEditProductId) && p.barcode && p.barcode.toLowerCase() === barcodeQuery.toLowerCase());
                    if (existingBarcode) { 
                        toast(`⚠️ الباركود [${barcodeQuery}] مسجل بالفعل للمنتج (${existingBarcode.n})!`, 'error'); 
                        return; 
                    }
                    
                    const prod = findProductById(selectedStockEditProductId);
                    if (prod) {
                        prod.barcode = barcodeQuery; 
                        saveProductsToStorage(); 
                        syncToCloud("updateSingleProduct", prod);
                        toast(`✅ تم تحديث باركود المنتج [${prod.n}]`, 'success'); 
                        selectedStockEditProductId = null; 
                        renderStockTable();
                    }
                }, 
                (err) => { }
            ).catch(err => {
                toast("❌ فشل تشغيل الكاميرا: تأكد من الصلاحيات", 'error');
                closeFloatingCamera();
            });
        } catch (e) {
            toast("❌ خطأ غير متوقع: " + e.message, 'error');
            closeFloatingCamera();
        }
    }, 300);
}

function closeFloatingCamera() {
    const overlay = document.getElementById('floatingCameraOverlay');
    if (overlay) overlay.style.display = 'none';
    
    if (floatingScannerInstance) {
        floatingScannerInstance.stop().then(() => {
            floatingScannerInstance.clear();
            document.getElementById('floatingCameraReader').innerHTML = '';
            floatingScannerInstance = null;
        }).catch(() => {
            document.getElementById('floatingCameraReader').innerHTML = '';
            floatingScannerInstance = null;
        });
    } else {
        document.getElementById('floatingCameraReader').innerHTML = '';
    }
}

let selectedStockEditProductId = null;

function onBarcodeScanned(key, decodedText) {
    playBeepSound(); const barcodeQuery = decodedText.trim();
    stopCameraScanner(key);

    if (key === 'sales') {
        document.getElementById('searchInput').value = barcodeQuery;
        const matched = products.find(p => p.barcode && p.barcode.toString().trim() === barcodeQuery);
        if (matched) pickProduct(matched.id); else toast("⚠️ لم يتم العثور على منتج بهذا الباركود [" + barcodeQuery + "]!", 'warn');
    } else if (key === 'addNew') {
        const existingBarcode = products.find(p => p.barcode && p.barcode.toLowerCase() === barcodeQuery.toLowerCase());
        if (existingBarcode) { toast(`⚠️ الباركود [${barcodeQuery}] مسجل بالفعل للمنتج (${existingBarcode.n})!`, 'error'); return; }
        document.getElementById('newProdBarcode').value = barcodeQuery; toast("✅ تم قراءة الباركود: " + barcodeQuery, 'success');
    } else if (key === 'recharge') {
        document.getElementById('addStockSearch').value = barcodeQuery; searchAddStockProduct();
    } else if (key === 'stock') {
        const existingBarcode = products.find(p => p.barcode && p.barcode.toLowerCase() === barcodeQuery.toLowerCase());
        if (existingBarcode) {
            document.getElementById('stockFilterInput').value = barcodeQuery;
            filterStockTable(barcodeQuery);
            toast(`✅ تم العثور على: ${existingBarcode.n}`, 'success');
        } else {
            toast("⚠️ لم يتم العثور على منتج!", 'warn');
        }
    } else if (key === 'return') {
        let cleanId = barcodeQuery.replace(/[^0-9]/g, '');
        document.getElementById('returnSearchInput').value = cleanId;
        searchInvoiceForReturn();
    }
}

// ==========================================
// Sales & Invoices
// ==========================================

function printCustomerReceiptBridge() {
    if (invoiceItems.length === 0) {
        toast("⚠️ الفاتورة فارغة! أضف أصناف أولاً", "warn");
        return;
    }

    let textReceipt = "<C>Anjum Green Pharmacy</C>\n";
    textReceipt += "<C>رقم الفاتورة: #" + activeInvoiceId + "</C>\n";
    textReceipt += "--------------------------------\n";

    let totalQtyCount = 0;
    let totalSellPriceSum = 0;

    invoiceItems.forEach(item => {
        totalQtyCount += item.qty;
        totalSellPriceSum += item.sellTotal;
        textReceipt += `${item.name}\nكمية: ${item.qty}   السعر: ${item.sellTotal.toFixed(2)} ج.م\n`;
    });

    textReceipt += "--------------------------------\n";
    textReceipt += `إجمالي الأصناف: ${totalQtyCount}\n`;
    textReceipt += `إجمالي السعر: ${totalSellPriceSum.toFixed(2)} ج.م\n`;
    textReceipt += "--------------------------------\n";
    textReceipt += `<BC>${activeInvoiceId}</BC>\n`;
    textReceipt += "<C>نتمنى لكم الشفاء العاجل 🌿</C>\n";

    let encodedText = encodeURIComponent(textReceipt);
    window.location.href = "printbridge://print?type=receipt&text=" + encodedText;
    
    toast("✅ تم إرسال فاتورة العميل للطابعة!", "success");
}

function genericProductSearch(query, listEl, onPick, beepOnBarcodeMatch = true) {
    const q = query.toLowerCase().trim(); if (!q) { listEl.style.display = 'none'; return; }
    const barcodeMatched = products.find(p => p.barcode && p.barcode.toLowerCase() === q);
    if (barcodeMatched) { if (beepOnBarcodeMatch) playBeepSound(); onPick(barcodeMatched); return; }

    const matched = products.filter(p => p.n && p.n.toLowerCase().includes(q));
    if (matched.length > 0) {
        listEl.innerHTML = matched.map(p => `
            <div class="result-item" data-pid="${escapeHtml(p.id)}">
                <span style="color:#1e3c72; font-weight:bold;">${escapeHtml(p.n)}</span>
                <span style="color:${p.q > 3 ? '#27ae60' : '#e74c3c'}; font-size:0.95rem;">(المخزون: ${p.q})</span>
            </div>
        `).join('');
        listEl.querySelectorAll('.result-item').forEach(el => { el.addEventListener('click', () => onPick(findProductById(el.getAttribute('data-pid')))); });
        listEl.style.display = 'block';
    } else { listEl.style.display = 'none'; }
}

function searchProduct() { genericProductSearch(document.getElementById('searchInput')?.value || '', document.getElementById('searchResults'), (p) => pickProduct(p.id)); }

function pickProduct(prodId) {
    const p = findProductById(prodId); if (!p) return;
    const guideMult = RATES.GUIDE_MULT || 3; selectedProdId = p.id;
    document.getElementById('searchResults').style.display = 'none';
    document.getElementById('searchInput').value = p.n;
    document.getElementById('prodName').textContent = p.n;
    document.getElementById('stockQty').textContent = p.q;
    document.getElementById('commPrice').textContent = (p.p || 0).toFixed(2);
    document.getElementById('guidePrice').textContent = ((p.p || 0) * guideMult).toFixed(2);
    document.getElementById('sellQty').value = 1;

    ['pUSD', 'pEUR', 'pGBP', 'pEGP', 'pVISA'].forEach(id => { const input = document.getElementById(id); if (input) input.value = 0; });
    document.getElementById('productCard').style.display = 'block'; checkPriceAlert();
}

function checkPriceAlert() {
    const p = findProductById(selectedProdId); if (!p) return;
    const guideMult = RATES.GUIDE_MULT || 3; const qty = parseInt(document.getElementById('sellQty')?.value) || 1;
    const u = parseFloat(document.getElementById('pUSD')?.value) || 0; const eu = parseFloat(document.getElementById('pEUR')?.value) || 0; const g = parseFloat(document.getElementById('pGBP')?.value) || 0; const eg = parseFloat(document.getElementById('pEGP')?.value) || 0; const v = parseFloat(document.getElementById('pVISA')?.value) || 0;
    const enteredTotalEGP = (u * RATES.USD) + (eu * RATES.EUR) + (g * RATES.GBP) + (eg * RATES.EGP) + (v * RATES.VISA);
    const minRequiredTotal = (p.p * guideMult) * qty;
    const warnBox = document.getElementById('priceWarningBox');

    if (document.getElementById('enteredTotalVal')) document.getElementById('enteredTotalVal').textContent = enteredTotalEGP.toFixed(2);
    if (document.getElementById('requiredMinVal')) document.getElementById('requiredMinVal').textContent = minRequiredTotal.toFixed(2);
    if (warnBox) warnBox.style.display = enteredTotalEGP < minRequiredTotal ? 'block' : 'none';
}

function addToInvoice() {
    const p = findProductById(selectedProdId); if (!p) return;
    const qty = parseInt(document.getElementById('sellQty')?.value) || 1;
    if (qty > p.q) { toast('⚠️ الكمية غير متوفرة في المخزون! المتاح: ' + p.q, 'warn'); return; }

    playBeepSound();
    const u = parseFloat(document.getElementById('pUSD')?.value) || 0; const eu = parseFloat(document.getElementById('pEUR')?.value) || 0; const g = parseFloat(document.getElementById('pGBP')?.value) || 0; const eg = parseFloat(document.getElementById('pEGP')?.value) || 0; const v = parseFloat(document.getElementById('pVISA')?.value) || 0;
    const itemTotalEGP = (u * RATES.USD) + (eu * RATES.EUR) + (g * RATES.GBP) + (eg * RATES.EGP) + (v * RATES.VISA);

    p.q -= qty; saveProductsToStorage(); updateAlertsBar();
    const commTotal = p.p * qty; const sellTotal = itemTotalEGP; const netProfit = sellTotal - commTotal;

    invoiceItems.push({
        productId: p.id, name: p.n, qty: qty, commUnitPrice: p.p, sellUnitPrice: qty > 0 ? (sellTotal / qty) : 0,
        commTotal, sellTotal, netProfit, usd: u, eur: eu, gbp: g, egp: eg, visa: v
    });
    renderInvoice(); document.getElementById('productCard').style.display = 'none'; document.getElementById('searchInput').value = '';
}

function prepareNewInvoice() {
    activeInvoiceId = invoiceCounter; currentNavIndex = -1;
    if (document.getElementById('invNum')) document.getElementById('invNum').textContent = activeInvoiceId;
    const now = new Date(); now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    if (document.getElementById('invoiceDate')) document.getElementById('invoiceDate').value = now.toISOString().slice(0, 16);
    invoiceItems = []; invoiceDiscountPercent = 0;
    if (document.getElementById('invoiceDiscountInput')) document.getElementById('invoiceDiscountInput').value = 0;
    renderInvoice();
}

function clearCurrentInvoice() {
    if (document.getElementById('searchInput')) document.getElementById('searchInput').value = '';
    if (document.getElementById('searchResults')) document.getElementById('searchResults').style.display = 'none';
    if (document.getElementById('productCard')) document.getElementById('productCard').style.display = 'none';
    selectedProdId = null;

    if (invoiceItems.length > 0) {
        invoiceItems.forEach(item => { const p = findProductById(item.productId) || products.find(p2 => p2.n === item.name); if (p) p.q += item.qty; });
        saveProductsToStorage(); renderStockTable(); updateAlertsBar();
    }
    invoiceItems = []; invoiceDiscountPercent = 0;
    if (document.getElementById('invoiceDiscountInput')) document.getElementById('invoiceDiscountInput').value = 0;
    renderInvoice();
}

function loadInvoiceIntoForm(inv) {
    if (!inv) return;
    activeInvoiceId = inv.id;
    if (document.getElementById('invNum')) document.getElementById('invNum').textContent = inv.id;
    if (inv.date && document.getElementById('invoiceDate')) document.getElementById('invoiceDate').value = inv.date.replace(' ', 'T').slice(0, 16);

    if (Array.isArray(inv.items)) { invoiceItems = JSON.parse(JSON.stringify(inv.items)); } 
    else {
        invoiceItems = [{ name: cleanItemSummaryText(inv.itemsText), qty: 1, commUnitPrice: inv.totalComm || 0, sellUnitPrice: inv.totalEGP || 0, commTotal: inv.totalComm || 0, sellTotal: inv.totalEGP || 0, netProfit: inv.netProfit || 0, usd: inv.usd || 0, eur: inv.eur || 0, gbp: inv.gbp || 0, egp: inv.egp || 0, visa: inv.visa || 0 }];
    }
    invoiceDiscountPercent = inv.discount || 0;
    if (document.getElementById('invoiceDiscountInput')) document.getElementById('invoiceDiscountInput').value = invoiceDiscountPercent;
    renderInvoice();
}

function cleanItemSummaryText(rawText) { if (!rawText) return "عنصر محفوظ"; return rawText.toString().trim(); }

function navigateInvoice(direction) {
    if (savedInvoices.length === 0) { toast('لا توجد فواتير مسجلة!', 'warn'); return; }
    if (direction === 'first') currentNavIndex = 0;
    else if (direction === 'last') currentNavIndex = savedInvoices.length - 1;
    else if (direction === 'prev') currentNavIndex = Math.max(0, currentNavIndex <= 0 ? 0 : currentNavIndex - 1);
    else if (direction === 'next') currentNavIndex = currentNavIndex >= savedInvoices.length - 1 ? savedInvoices.length - 1 : currentNavIndex + 1;
    loadInvoiceIntoForm(savedInvoices[currentNavIndex]);
}

function handleDiscountChange(elem) {
    let val = parseFloat(elem.value) || 0;
    if (val > 25) { toast("الحد الأقصى للخصم هو 25%!", 'warn'); elem.value = 25; invoiceDiscountPercent = 25; }
    else if (val < 0) { elem.value = 0; invoiceDiscountPercent = 0; }
    else invoiceDiscountPercent = val; renderInvoice();
}

function removeInvoiceItem(index) {
    const item = invoiceItems[index];
    if (item) {
        const p = findProductById(item.productId) || products.find(p2 => p2.n === item.name);
        if (p) { p.q += item.qty; saveProductsToStorage(); syncToCloud("updateSingleProduct", p); updateAlertsBar(); }
    }
    invoiceItems.splice(index, 1); renderInvoice();
}

function renderInvoice() {
    const tbody = document.getElementById('invoiceTableBody'); if (!tbody) return;
    let sumUSD = 0, sumEUR = 0, sumGBP = 0, sumEGP = 0, sumVISA = 0, totalSellEGP = 0;

    if (invoiceItems.length === 0) { tbody.innerHTML = '<tr><td colspan="7" style="color: #7f8c8d; padding:25px; font-size:1.1rem;">الفاتورة فارغة</td></tr>'; } 
    else {
        tbody.innerHTML = invoiceItems.map((item, index) => {
            sumUSD += parseFloat(item.usd || 0); sumEUR += parseFloat(item.eur || 0); sumGBP += parseFloat(item.gbp || 0); sumEGP += parseFloat(item.egp || 0); sumVISA += parseFloat(item.visa || 0); totalSellEGP += parseFloat(item.sellTotal || 0);
            
            let payStr = ``;
            if(item.usd > 0) payStr += `$ ${item.usd} | `;
            if(item.eur > 0) payStr += `€ ${item.eur} | `;
            if(item.gbp > 0) payStr += `£ ${item.gbp} | `;
            if(item.visa > 0) payStr += `💳 ${item.visa} | `;
            payStr += `${item.egp||0} ج.م`;
            
            return `
            <tr>
                <td style="font-weight:bold; font-size:1.05rem;">${index + 1}</td>
                <td style="font-weight:bold; text-align:right; font-size:1.05rem;">${escapeHtml(item.name)}</td>
                <td style="font-weight:bold; font-size:1.2rem; color:#1e3c72;">${item.qty}</td>
                <td style="font-weight:bold;">${(item.commTotal || 0).toFixed(2)}</td>
                <td style="direction:rtl;">${payStr}</td>
                <td style="color:#27ae60; font-weight:bold; font-size:1.1rem;">${(item.sellTotal || 0).toFixed(2)}</td>
                <td><button class="btn btn-red" style="padding:6px 12px; font-size:0.9rem; margin:0;" onclick="removeInvoiceItem(${index})">حذف 🗑️</button></td>
            </tr>`;
        }).join('');
    }

    const discountVal = (totalSellEGP * invoiceDiscountPercent) / 100;
    const finalPayable = totalSellEGP - discountVal;

    if (document.getElementById('liveUSD')) document.getElementById('liveUSD').textContent = '$' + sumUSD.toFixed(2);
    if (document.getElementById('liveEUR')) document.getElementById('liveEUR').textContent = '€' + sumEUR.toFixed(2);
    if (document.getElementById('liveGBP')) document.getElementById('liveGBP').textContent = '£' + sumGBP.toFixed(2);
    if (document.getElementById('liveEGP')) document.getElementById('liveEGP').textContent = sumEGP.toFixed(2) + ' ج.م';
    if (document.getElementById('liveVISA')) document.getElementById('liveVISA').textContent = sumVISA.toFixed(2) + ' ج.م';
    if (document.getElementById('liveTotalEGP')) document.getElementById('liveTotalEGP').textContent = finalPayable.toFixed(2) + ' ج.م';
}

function getItemPaidText(item) {
    if (!item) return ''; 
    return `صنف: ${escapeHtml(item.name)} - كمية: ${item.qty}`;
}

function saveInvoice() {
    if (invoiceItems.length === 0) { toast('أضف منتجات للفاتورة أولاً!', 'warn'); return; }
    
    const invDateRaw = document.getElementById('invoiceDate')?.value; 
    let finalDateStr = "";
    if(invDateRaw) {
        finalDateStr = invDateRaw.replace('T', ' ');
    } else {
        const d = new Date();
        let yyyy = d.getFullYear(); let mm = String(d.getMonth() + 1).padStart(2, '0'); let dd = String(d.getDate()).padStart(2, '0');
        let hh = String(d.getHours()).padStart(2, '0'); let min = String(d.getMinutes()).padStart(2, '0');
        finalDateStr = `${yyyy}-${mm}-${dd} ${hh}:${min}`;
    }
    
    let totalSell = 0, totalComm = 0, totalProfit = 0; const itemsSummaryText = [];

    invoiceItems.forEach(i => {
        totalSell += i.sellTotal; totalComm += i.commTotal; totalProfit += i.netProfit; 
        itemsSummaryText.push(getItemPaidText(i));
        const p = findProductById(i.productId) || products.find(p2 => p2.n === i.name); if (p) syncToCloud("updateSingleProduct", p);
    });

    const finalTotalAfterDiscount = totalSell - ((totalSell * invoiceDiscountPercent) / 100);
    const finalItemsHtml = itemsSummaryText.join("<br>");

    const savedInv = { id: activeInvoiceId, date: finalDateStr, status: 'Active', items: JSON.parse(JSON.stringify(invoiceItems)), itemsText: finalItemsHtml, discount: invoiceDiscountPercent, totalComm: totalComm, totalEGP: finalTotalAfterDiscount, netProfit: totalProfit - ((totalSell * invoiceDiscountPercent) / 100) };
    const existingIndex = savedInvoices.findIndex(i => i.id === activeInvoiceId);
    if (existingIndex > -1) savedInvoices[existingIndex] = savedInv; else { savedInvoices.push(savedInv); if (activeInvoiceId === invoiceCounter) invoiceCounter++; }

    saveInvoicesToStorage(); syncToCloud("saveInvoice", savedInv);
    toast(`✅ تم حفظ الفاتورة #${activeInvoiceId} بنجاح!`, 'success');
    prepareNewInvoice(); generateReport();
}

// ==========================================
// Returns Module
// ==========================================
function searchInvoiceForReturn() {
    const inputVal = document.getElementById('returnSearchInput')?.value.trim();
    if (!inputVal) { toast("أدخل رقم الفاتورة للبحث!", "warn"); return; }

    let invId = parseInt(inputVal.replace(/[^0-9]/g, ''));
    const inv = savedInvoices.find(i => i.id === invId);

    if (!inv) {
        toast(`❌ لم يتم العثور على فاتورة برقم #${invId}`, "error");
        document.getElementById('returnInvoiceDisplay').style.display = 'none';
        returnFoundInvoice = null;
        return;
    }

    returnFoundInvoice = inv;
    let itemsStr = "";
    if (inv.items && Array.isArray(inv.items)) {
        itemsStr = inv.items.map(i => `• ${i.name} (كمية: ${i.qty}) -${i.sellTotal.toFixed(2)} ج.م`).join("<br>");
    } else {
        itemsStr = inv.itemsText || "عنصر محفوظ";
    }

    document.getElementById('returnInvoiceDetails').innerHTML = `
        <b>رقم الفاتورة:</b> #${inv.id}<br>
        <b>تاريخ الفاتورة:</b> ${formatDateDisplay(inv.date)}<br>
        <b>الإجمالي المدفوع:</b> ${inv.totalEGP.toFixed(2)} ج.م<br>
        <b>الأصناف:</b><br>${itemsStr}
    `;

    document.getElementById('returnInvoiceDisplay').style.display = 'block';
    toast(`✅ تم العثور على الفاتورة #${inv.id}`, "success");
}

function executeReturnInvoice() {
    if (!returnFoundInvoice) return;
    cancelInvoiceSystem(returnFoundInvoice.id);
    document.getElementById('returnInvoiceDisplay').style.display = 'none';
    document.getElementById('returnSearchInput').value = '';
    returnFoundInvoice = null;
}

// ==========================================
// Finance Module
// ==========================================
function saveFinanceEntry() {
    const type = document.getElementById('finType')?.value; const category = document.getElementById('finCategory')?.value.trim(); const amount = parseFloat(document.getElementById('finAmount')?.value) || 0; const dateRaw = document.getElementById('finDate')?.value; const notes = document.getElementById('finNotes')?.value.trim();
    if (!category) { toast('أدخل التصنيف!', 'warn'); return; } if (amount <= 0) { toast('أدخل مبلغ صحيح!', 'warn'); return; }

    let finalDateStr = "";
    if(dateRaw) { finalDateStr = dateRaw.replace('T', ' '); } 
    else {
        const d = new Date(); let yyyy = d.getFullYear(); let mm = String(d.getMonth() + 1).padStart(2, '0'); let dd = String(d.getDate()).padStart(2, '0');
        let hh = String(d.getHours()).padStart(2, '0'); let min = String(d.getMinutes()).padStart(2, '0'); finalDateStr = `${yyyy}-${mm}-${dd} ${hh}:${min}`;
    }
    
    const fEntry = { id: Date.now(), date: finalDateStr, type, category, amount, notes };
    savedFinances.push(fEntry); saveFinancesToStorage(); syncToCloud("saveFinance", fEntry);

    toast(`✅ تم حفظ المعاملة بنجاح!`, 'success');
    if (document.getElementById('finCategory')) document.getElementById('finCategory').value = ''; if (document.getElementById('finAmount')) document.getElementById('finAmount').value = ''; if (document.getElementById('finNotes')) document.getElementById('finNotes').value = '';
    renderFinanceTable();
}

function deleteFinanceEntry(id) {
    if (currentUser?.role !== 'Admin') { toast("❌ متاح للأدمن فقط!", 'error'); return; }
    confirmModal("هل أنت متأكد من حذف هذه العملية المالية؟", () => {
        savedFinances = savedFinances.filter(f => f.id !== id); saveFinancesToStorage(); syncToCloud("deleteFinance", { id });
        renderFinanceTable(); toast('🗑️ تم الحذف', 'success');
    });
}

function renderFinanceTable() {
    const fromD = document.getElementById('finFromDate')?.value || ''; const toD = document.getElementById('finToDate')?.value || ''; const includeSales = document.getElementById('includeSalesIncomeToggle')?.checked || false;
    const filtered = savedFinances.filter(f => {
        if (!f.date) return true; const fD = f.date.slice(0, 10); if (fromD && fD < fromD) return false; if (toD && fD > toD) return false; return true;
    });

    let totRev = 0, totExp = 0; const tbody = document.getElementById('financeTableBody'); if (!tbody) return;
    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="color:#7f8c8d; padding:20px; font-weight:bold; font-size:1.1rem;">لا توجد سجلات مالية</td></tr>';
    } else {
        tbody.innerHTML = filtered.map((f, idx) => {
            if (f.type === 'Revenue') totRev += f.amount; else totExp += f.amount;
            return `
            <tr style="background:${f.type === 'Revenue' ? '#eafaf1' : '#fdedec'};">
                <td style="font-weight:bold;">${idx + 1}</td>
                <td style="white-space:nowrap; direction:ltr; font-weight:bold;">${formatDateDisplay(f.date)}</td>
                <td style="font-weight:bold; color:${f.type === 'Revenue' ? '#27ae60' : '#c0392b'};">${f.type === 'Revenue' ? 'إيراد' : 'مصروف'}</td>
                <td style="text-align:right; font-weight:bold;">${escapeHtml(f.category)}</td>
                <td style="font-weight:bold; font-size:1.1rem;">${f.amount.toFixed(2)}</td>
                <td style="text-align:right;">${escapeHtml(f.notes || '-')}</td>
                <td class="no-pdf"><button class="btn btn-red" style="padding:4px 8px; font-size:0.9rem; margin:0;" onclick="deleteFinanceEntry(${f.id})">حذف 🗑️</button></td>
            </tr>`;
        }).join('');
    }

    if (includeSales) {
        savedInvoices.forEach(inv => {
            if (!inv.date) return; const invD = inv.date.slice(0, 10); if (fromD && invD < fromD) return; if (toD && invD > toD) return; totRev += (parseFloat(inv.netProfit) || 0);
        });
    }

    const net = totRev - totExp;
    const totalRowHtml = `
    <tr class="total-row">
        <td colspan="4" style="text-align: right; color: #1e3c72; padding: 12px; font-weight:900;">إجماليات الحركة المالية:</td>
        <td style="color: #27ae60; font-weight:900; font-size:1.2rem;">إيرادات: ${totRev.toFixed(2)}<br><span style="color:#c0392b;">مصروفات: ${totExp.toFixed(2)}</span></td>
        <td style="color: ${net >= 0 ? '#27ae60' : '#c0392b'}; font-weight:900; font-size:1.2rem;">الصافي: ${net.toFixed(2)} ج.م</td>
        <td class="no-pdf"></td>
    </tr>`;

    tbody.innerHTML += totalRowHtml;

    if (document.getElementById('sumRevenues')) document.getElementById('sumRevenues').textContent = totRev.toFixed(2) + ' EGP';
    if (document.getElementById('sumExpenses')) document.getElementById('sumExpenses').textContent = totExp.toFixed(2) + ' EGP';
    const netEl = document.getElementById('netBalance');
    if (netEl) { netEl.textContent = net.toFixed(2) + ' EGP'; netEl.style.color = net >= 0 ? '#27ae60' : '#c0392b'; }
}

function exportFinanceExcel() {
    const fromD = document.getElementById('finFromDate')?.value || ''; const toD = document.getElementById('finToDate')?.value || '';
    const filtered = savedFinances.filter(f => {
        if (!f.date) return true; const fD = f.date.slice(0, 10); if (fromD && fD < fromD) return false; if (toD && fD > toD) return false; return true;
    });
    const excelData = filtered.map((f, i) => ({ "#": i + 1, "التاريخ": f.date, "النوع": f.type === 'Revenue'?'إيراد':'مصروف', "التصنيف": f.category, "المبلغ (EGP)": f.amount, "ملاحظات": f.notes || "" }));
    const ws = XLSX.utils.json_to_sheet(excelData); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "المالية"); XLSX.writeFile(wb, `Finance_Report_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

// ==========================================
// Stock Module
// ==========================================
function addNewProductToSystem() {
    const name = document.getElementById('newProdName')?.value.trim(); const price = parseFloat(document.getElementById('newProdPrice')?.value) || 0; const qty = parseInt(document.getElementById('newProdQty')?.value) || 0; const barcode = document.getElementById('newProdBarcode')?.value.trim(); const expiry = document.getElementById('newProdExpiry')?.value;
    if (!name) { toast('أدخل اسم المنتج!', 'warn'); return; }
    if (products.find(p => p.n.toLowerCase() === name.toLowerCase())) { toast(`⚠️ اسم المنتج [${name}] مسجل بالفعل!`, 'error'); return; }
    if (barcode && products.find(p => p.barcode && p.barcode.toLowerCase() === barcode.toLowerCase())) { toast(`⚠️ الباركود [${barcode}] مسجل بالفعل!`, 'error'); return; }

    const productToSync = { id: uid(), n: name, p: price, q: qty, barcode, expiry };
    products.push(productToSync); saveProductsToStorage(); syncToCloud("updateSingleProduct", productToSync); updateAlertsBar();

    toast(`✅ تم حفظ المنتج (${name}) بنجاح!`, 'success');
    if (document.getElementById('newProdName')) document.getElementById('newProdName').value = ''; if (document.getElementById('newProdBarcode')) document.getElementById('newProdBarcode').value = '';
}

function searchAddStockProduct() { genericProductSearch(document.getElementById('addStockSearch')?.value || '', document.getElementById('addStockResults'), (p) => pickAddStockProduct(p.id)); }

function pickAddStockProduct(prodId) {
    const p = findProductById(prodId); if (!p) return; selectedStockProdId = p.id;
    document.getElementById('addStockResults').style.display = 'none'; document.getElementById('addStockSearch').value = p.n; document.getElementById('addStockName').textContent = p.n; document.getElementById('currentStockVal').textContent = p.q; document.getElementById('addStockCard').style.display = 'block';
}

function saveStockAddition() {
    const p = findProductById(selectedStockProdId); if (!p) return;
    const addQty = parseInt(document.getElementById('newStockQty')?.value) || 0; p.q += addQty;
    saveProductsToStorage(); syncToCloud("updateSingleProduct", p); updateAlertsBar();

    toast(`✅ تم التزويد (${p.n}) بـ ${addQty} وحدة! الإجمالي: ${p.q}`, 'success');
    document.getElementById('addStockCard').style.display = 'none'; document.getElementById('addStockSearch').value = ''; renderStockTable();
}

function isManagerUser() { return currentUser && (currentUser.username === 'admin' || currentUser.username === 'cs2' || currentUser.role === 'Admin'); }

function editProductSystem(prodId) {
    if (!isManagerUser()) { toast("❌ متاح للمديرين فقط!", 'error'); return; }
    const prod = findProductById(prodId); if (!prod) return;

    openModal(`
        <h3 style="text-align:center; color:#1e3c72; margin-bottom:15px; font-size:1.4rem; font-weight:800;">✏️ تعديل بيانات المنتج</h3>
        <div class="payment-grid">
            <div class="pay-box" style="grid-column:span 2;"><label>اسم المنتج</label><input type="text" id="editName" value="${escapeHtml(prod.n)}" style="padding:12px; font-size:1.1rem;"></div>
            <div class="pay-box"><label>سعر الجملة (EGP)</label><input type="number" id="editPrice" value="${prod.p}" style="padding:12px; font-size:1.1rem;"></div>
            <div class="pay-box"><label>الكمية المتاحة</label><input type="number" id="editQty" value="${prod.q}" style="padding:12px; font-size:1.1rem;"></div>
            <div class="pay-box"><label>الباركود</label><input type="text" id="editBarcode" value="${escapeHtml(prod.barcode || '')}" style="padding:12px; font-size:1.1rem;"></div>
            <div class="pay-box"><label>تاريخ الصلاحية</label><input type="date" id="editExpiry" value="${escapeHtml(prod.expiry || '')}" style="padding:12px; font-size:1.1rem;"></div>
        </div>
        <div style="display:flex; justify-content:center; gap:10px; margin-top:20px;">
            <button class="btn btn-green" style="padding:10px 20px; font-size:1.1rem;" onclick="saveProductEdit('${prodId}')">حفظ التعديل ✅</button>
            <button class="btn btn-gray" style="background:#7f8c8d; padding:10px 20px; font-size:1.1rem;" onclick="closeModal()">إلغاء</button>
        </div>
    `);
}

function saveProductEdit(prodId) {
    const prod = findProductById(prodId); if (!prod) return;
    const newName = document.getElementById('editName')?.value.trim(); const newBarcode = document.getElementById('editBarcode')?.value.trim();

    if (newName && newName.toLowerCase() !== prod.n.toLowerCase() && products.find(p => p.id !== prodId && p.n.toLowerCase() === newName.toLowerCase())) { toast(`⚠️ الاسم [${newName}] مكرر!`, 'error'); return; }
    if (newBarcode && newBarcode.toLowerCase() !== (prod.barcode || '').toLowerCase() && products.find(p => p.id !== prodId && p.barcode && p.barcode.toLowerCase() === newBarcode.toLowerCase())) { toast(`⚠️ الباركود [${newBarcode}] مكرر!`, 'error'); return; }

    prod.n = newName || prod.n; prod.p = parseFloat(document.getElementById('editPrice')?.value) || prod.p; prod.q = parseInt(document.getElementById('editQty')?.value); if (isNaN(prod.q)) prod.q = 0; prod.barcode = newBarcode; prod.expiry = document.getElementById('editExpiry')?.value.trim();
    saveProductsToStorage(); syncToCloud("updateSingleProduct", prod); updateAlertsBar(); closeModal();
    toast(`✅ تم التحديث (${prod.n})!`, 'success'); renderStockTable();
}

function scanAndEditProductBarcode(prodId) {
    if (!findProductById(prodId)) return; 
    selectedStockEditProductId = prodId; 
    openFloatingCamera();
}

function deleteProductSystem(prodId) {
    if (!isManagerUser()) { toast("❌ متاح للمديرين فقط!", 'error'); return; }
    const prod = findProductById(prodId); if (!prod) return;
    confirmModal(`هل أنت متأكد من حذف المنتج (${prod.n}) بالكامل؟`, () => {
        syncToCloud("deleteProduct", { id: prod.id, name: prod.n }); products = products.filter(p => p.id !== prodId);
        saveProductsToStorage(); updateAlertsBar(); toast(`🗑️ تم الحذف!`, 'success'); renderStockTable();
    });
}

function toggleSelectAllLowStock(checkboxEl) {
    const isChecked = checkboxEl.checked;
    const itemCheckboxes = document.querySelectorAll('.low-stock-check');
    itemCheckboxes.forEach(cb => {
        cb.checked = isChecked;
        toggleLowStockRowSelection(cb);
    });
}

function toggleLowStockRowSelection(cb) {
    const tr = cb.closest('tr');
    if (!tr) return;
    if (cb.checked) {
        tr.classList.add('pdf-selected-row');
    } else {
        tr.classList.remove('pdf-selected-row');
    }
}

function stockRowHtml(p, index, rowClass, statusSuffix) {
    const guideMult = RATES.GUIDE_MULT || 3;
    const isFilteredLow = isLowStockModeActive;
    
    if (isFilteredLow) {
        return `
        <tr class="low-stock-row pdf-selected-row">
            <td class="no-pdf"><input type="checkbox" class="low-stock-check" checked onchange="toggleLowStockRowSelection(this)"></td>
            <td style="font-weight:bold;">${p.id}</td>
            <td style="text-align:right; font-weight:bold; white-space:normal; font-size:1.05rem;">${escapeHtml(p.n)}</td>
            <td style="font-weight:bold; font-size:1.1rem; color:#c0392b;">${(p.p || 0).toFixed(2)} ج.م</td>
            <td><input type="number" placeholder="الكمية المطلوبة..." style="width:100%; padding:5px; border:1px solid #ccc; border-radius:5px; text-align:center;"></td>
        </tr>`;
    }

    return `
    <tr class="${rowClass}">
        <td style="font-weight:bold;">${index + 1}</td>
        <td style="text-align:right; font-weight:bold; white-space:normal; font-size:1.05rem;">${escapeHtml(p.n)}${statusSuffix}</td>
        <td style="font-weight:bold; font-size:1.2rem; color:#1e3c72;">${p.q}</td>
        <td style="font-weight:bold;">${p.p.toFixed(2)}</td>
        <td style="color:#27ae60; font-weight:bold; font-size:1.1rem;">${(p.p * guideMult).toFixed(2)}</td>
        <td style="font-family:monospace; font-weight:bold; color:#e67e22; direction:ltr; font-size:1.05rem;">${escapeHtml(p.barcode || '-')}</td>
        <td style="direction:ltr; font-weight:bold;">${escapeHtml(p.expiry || '-')}</td>
        <td class="no-pdf">
            <button class="btn btn-blue" style="padding: 6px 12px; font-size: 0.9rem; margin: 2px;" onclick="editProductSystem('${p.id}')">تعديل ✏️</button>
            <button class="btn btn-purple" style="padding: 6px 12px; font-size: 0.9rem; margin: 2px;" onclick="scanAndEditProductBarcode('${p.id}')">باركود 📷</button>
            <button class="btn btn-red" style="padding: 6px 12px; font-size: 0.9rem; margin: 2px;" onclick="deleteProductSystem('${p.id}')">حذف 🗑️</button>
        </td>
    </tr>`;
}

function renderStockTable(filter = '') {
    const tbody = document.getElementById('stockTableBody'); if (!tbody) return;
    const thead = document.getElementById('stockTableHead');
    if (thead) {
        thead.innerHTML = `
            <tr>
                <th style="width:40px;">#</th>
                <th>المنتج</th>
                <th>الكمية</th>
                <th>سعر الجملة</th>
                <th id="thStockGuideHead">الحد الأدنى (×${RATES.GUIDE_MULT || 3})</th>
                <th>الباركود</th>
                <th>الصلاحية</th>
                <th class="no-pdf" style="width:220px;">الإجراءات</th>
            </tr>`;
    }

    if(document.getElementById('stockReportSubtitle')) document.getElementById('stockReportSubtitle').textContent = "تقرير المخزون الشامل";

    const f = filter.toLowerCase(); const matched = products.filter(p => (p.n && p.n.toLowerCase().includes(f)) || (p.barcode && p.barcode.toLowerCase().includes(f))); const today = new Date();

    tbody.innerHTML = matched.map((p, index) => {
        let expRowClass = '', expStatusText = '';
        if (p.expiry) {
            const diffDays = (new Date(p.expiry) - today) / 86400000;
            if (diffDays < 0) { expRowClass = 'exp-expired-row'; expStatusText = ' 🔴 (منتهي)'; } else if (diffDays <= 90) { expRowClass = 'exp-warning-row'; expStatusText = ' 🟡 (قريب الانتهاء)'; }
        }
        const rowStyle = p.q <= 3 ? 'low-stock-row' : expRowClass; const suffix = (p.q <= 3 ? ' ⚠️ (نواقص)' : '') + expStatusText;
        return stockRowHtml(p, index, rowStyle, suffix);
    }).join('');
}

function filterStockTable(val) { renderStockTable(val); }

function filterLowStock() {
    isLowStockModeActive = true;
    if (document.getElementById('stockFilterInput')) document.getElementById('stockFilterInput').value = '';
    
    const thead = document.getElementById('stockTableHead');
    if (thead) {
        thead.innerHTML = `
            <tr>
                <th id="thSelectHead" style="width:40px;" class="no-pdf"><input type="checkbox" id="selectAllLowStockToggle" checked onchange="toggleSelectAllLowStock(this)"></th>
                <th style="width:50px;">رقم الصنف</th>
                <th>اسم الصنف</th>
                <th>السعر التجاري</th>
                <th>الكمية المطلوبة</th>
            </tr>`;
    }

    if(document.getElementById('stockReportSubtitle')) document.getElementById('stockReportSubtitle').textContent = "تقرير النواقص والأصناف المطلوبة";

    const matched = products.filter(p => p.q <= 3).sort((a, b) => a.n.localeCompare(b.n, 'ar'));
    let sumTradePrice = 0;

    const tbody = document.getElementById('stockTableBody');
    if (tbody) {
        tbody.innerHTML = matched.map((p, index) => {
            sumTradePrice += (p.p || 0);
            return stockRowHtml(p, index, 'low-stock-row', '');
        }).join('');

        tbody.innerHTML += `
            <tr class="total-row">
                <td colspan="3" style="text-align:right; font-weight:900;">إجمالي عدد الأصناف: ${matched.length} صنف</td>
                <td colspan="2" style="text-align:right; color:#27ae60; font-weight:900; font-size:1.2rem;">الإجمالي التجاري: ${sum
