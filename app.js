// Elements
const dashboard = document.getElementById('dashboard');
const addFormPage = document.getElementById('add-form-page');
const setupPage = document.getElementById('setup-page');
const addBtn = document.getElementById('add-btn');
const settingsBtn = document.getElementById('settings-trigger');
const cancelBtn = document.getElementById('cancel-btn');
const hoursForm = document.getElementById('hours-form');
const hoursList = document.getElementById('hours-list');
const printBtn = document.getElementById('print-btn');
const emptyState = document.getElementById('empty-state');
const loadingState = document.getElementById('loading');
const saveApiBtn = document.getElementById('save-api-btn');
const apiUrlInput = document.getElementById('api-url');
const toast = document.getElementById('toast');
const toastMsg = document.getElementById('toast-msg');
const toastIcon = document.getElementById('toast-icon');
const saveBtn = document.getElementById('save-btn');

// App State
let API_URL = localStorage.getItem('WORK_HOURS_API_URL') || '';
let hoursData = JSON.parse(localStorage.getItem('hoursCache') || '[]');
let isSyncing = false;
let currentViewMode = 'week'; // 'week' or 'month'
let selectedGroups = new Set();

// Initialize App
function init() {
    if (!API_URL) {
        showPage(setupPage);
        addBtn.style.display = 'none';
        settingsBtn.style.display = 'none';
    } else {
        showPage(dashboard);
        if (hoursData.length > 0) {
            renderHours(); // Instant render from cache
        }
        fetchHours(false); // Background sync
    }
    
    // Set today's date in form by default
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('date').value = today;
}

// Navigation
function showPage(page) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    page.classList.add('active');
    
    // Hide/Show header button
    if (page === dashboard && API_URL) {
        addBtn.style.display = 'flex';
    } else {
        addBtn.style.display = 'none';
    }
    
    if (page === dashboard && hoursData.length > 0) {
        document.getElementById('view-controls')?.classList.remove('hidden');
        document.getElementById('print-controls')?.classList.remove('hidden');
        document.getElementById('print-hint')?.classList.remove('hidden');
        document.getElementById('sticky-dashboard-header')?.classList.remove('hidden');
    } else {
        document.getElementById('view-controls')?.classList.add('hidden');
        document.getElementById('print-controls')?.classList.add('hidden');
        document.getElementById('print-hint')?.classList.add('hidden');
        document.getElementById('sticky-dashboard-header')?.classList.add('hidden');
    }
}

addBtn.addEventListener('click', () => {
    hoursForm.reset();
    document.getElementById('location').value = '';
    document.getElementById('break-val').value = '';
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('date').value = today;
    document.getElementById('live-duration').style.display = 'none';
    addFormPage.classList.add('active');
});

cancelBtn.addEventListener('click', () => {
    addFormPage.classList.remove('active');
});

settingsBtn.addEventListener('click', () => {
    apiUrlInput.value = API_URL;
    showPage(setupPage);
});

// Setup API
saveApiBtn.addEventListener('click', () => {
    const url = apiUrlInput.value.trim();
    if (url && url.startsWith('https://script.google.com/')) {
        API_URL = url;
        localStorage.setItem('WORK_HOURS_API_URL', API_URL);
        
        // Try initializing
        showToast('Koppelen...', 'info');
        fetch(API_URL, {
            method: 'POST',
            body: JSON.stringify({ action: 'init' })
        })
        .then(() => {
            showToast('Gekoppeld!', 'success');
            addBtn.style.display = 'flex';
            settingsBtn.style.display = 'flex';
            showPage(dashboard);
            fetchHours();
        })
        .catch(err => {
            showToast('Fout bij koppelen. Is de URL goed?', 'error');
            console.error(err);
        });

    } else {
        showToast('Voer een geldige Google Script URL in', 'error');
    }
});

// Fetch Data
async function fetchHours(showLoading = true) {
    if (!API_URL) return;
    
    if (hoursData.length === 0 && showLoading) {
        hoursList.classList.add('hidden');
        emptyState.classList.add('hidden');
        loadingState.classList.remove('hidden');
    }
    
    try {
        const response = await fetch(API_URL);
        const data = await response.json();
        
        if (data.status === 'success') {
            hoursData = data.data;
            localStorage.setItem('hoursCache', JSON.stringify(hoursData));
            renderHours();
            processSyncQueue(); // Probeer de wachtrij af te handelen
        }
    } catch (err) {
        console.error('Fetch error:', err);
        // We tonen geen toast omdat we de locale cache hebben
        if (hoursData.length === 0) {
            emptyState.classList.remove('hidden');
        }
    } finally {
        loadingState.classList.add('hidden');
    }
}

// Render Data
function renderHours() {
    hoursList.innerHTML = '';
    const grandTotalsContainer = document.getElementById('grand-totals');
    
    if (hoursData.length === 0) {
        emptyState.classList.remove('hidden');
        document.getElementById('view-controls')?.classList.add('hidden');
        document.getElementById('print-controls')?.classList.add('hidden');
        document.getElementById('print-hint')?.classList.add('hidden');
        document.getElementById('sticky-dashboard-header')?.classList.add('hidden');
        if (grandTotalsContainer) grandTotalsContainer.classList.add('hidden');
        return;
    }
    
    emptyState.classList.add('hidden');
    hoursList.classList.remove('hidden');
    
    if (dashboard.classList.contains('active')) {
        document.getElementById('view-controls')?.classList.remove('hidden');
        document.getElementById('print-controls')?.classList.remove('hidden');
        document.getElementById('print-hint')?.classList.remove('hidden');
        document.getElementById('sticky-dashboard-header')?.classList.remove('hidden');
    }
    
    // 1. Calculate Grand Totals and Fun Facts
    const grandTotals = {};
    const dayTotals = { 0:0, 1:0, 2:0, 3:0, 4:0, 5:0, 6:0 };
    let totalAllHours = 0;
    const uniqueWeeks = new Set();
    
    hoursData.forEach(entry => {
        const loc = entry.location || "Onbekend";
        const dur = parseFloat(calculateDuration(extractTime(entry.startTime), extractTime(entry.endTime)));
        grandTotals[loc] = (grandTotals[loc] || 0) + dur;
        totalAllHours += dur;
        
        let dateObj;
        if (String(entry.date).match(/^\d{2}-\d{2}-\d{4}$/)) {
            const parts = entry.date.split('-');
            dateObj = new Date(parts[2], parts[1] - 1, parts[0]);
        } else {
            dateObj = new Date(entry.date);
        }
        
        if (!isNaN(dateObj.getTime())) {
            dayTotals[dateObj.getDay()] += dur;
            const d = new Date(Date.UTC(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate()));
            const dayNum = d.getUTCDay() || 7;
            d.setUTCDate(d.getUTCDate() + 4 - dayNum);
            const yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
            const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1)/7);
            uniqueWeeks.add(`${d.getUTCFullYear()}-W${weekNo}`);
        }
    });
    
    let busiestDayName = "-";
    let maxDayHours = -1;
    const dayNames = ["Zondag", "Maandag", "Dinsdag", "Woensdag", "Donderdag", "Vrijdag", "Zaterdag"];
    for (const [dayIdx, hours] of Object.entries(dayTotals)) {
        if (hours > maxDayHours && hours > 0) {
            maxDayHours = hours;
            busiestDayName = dayNames[dayIdx];
        }
    }
    
    let avgPerWeek = uniqueWeeks.size > 0 ? (totalAllHours / uniqueWeeks.size).toFixed(1) : 0;

    let maxShiftHours = 0;
    let minStartInt = 9999;
    let minStartStr = "-";
    let maxEndInt = -1;
    let maxEndStr = "-";
    
    hoursData.forEach(entry => {
        const start = extractTime(entry.startTime);
        const end = extractTime(entry.endTime);
        const dur = parseFloat(calculateDuration(start, end));
        if (dur > maxShiftHours) maxShiftHours = dur;
        
        if (start && start.includes(':')) {
            const val = parseInt(start.replace(':', ''));
            if (val < minStartInt && val >= 400) { // Skip night shifts crossing 4am for "vroegste"
                minStartInt = val;
                minStartStr = start;
            }
        }
        if (end && end.includes(':')) {
            let val = parseInt(end.replace(':', ''));
            if (val < 600) val += 2400; // Next day logic for very late shifts
            if (val > maxEndInt) {
                maxEndInt = val;
                maxEndStr = end;
            }
        }
    });
    const totalShifts = hoursData.length;
    const avgShift = totalShifts > 0 ? (totalAllHours / totalShifts).toFixed(1) : 0;

    if (grandTotalsContainer) {
        let gtHtml = `<div style="display: flex; gap: 16px;">`;
        
        // Left Column (Totals)
        gtHtml += `<div style="flex: 1; border-right: 1px solid rgba(255,255,255,0.1); padding-right: 16px;">`;
        gtHtml += `<div style="font-size: 0.95rem; font-weight: 700; color: rgba(255,255,255,0.7); margin-bottom: 8px; display: flex; align-items: center; gap: 6px;"><i class="fa-solid fa-chart-pie"></i> Totalen</div>`;
        gtHtml += `<div style="display: flex; flex-direction: column; gap: 6px;">`;
        for (const [loc, total] of Object.entries(grandTotals)) {
            gtHtml += `<div style="display: flex; justify-content: space-between; font-size: 0.95rem; white-space: normal;">
                <span style="color: var(--text-muted); flex: 1;">${loc}</span>
                <strong style="color: rgba(56, 189, 248, 0.9); text-align: right; margin-left: 8px; flex-shrink: 0;">${total.toFixed(2)}u</strong>
            </div>`;
        }
        gtHtml += `</div></div>`;
        
        // Right Column (Fun Facts)
        gtHtml += `<div style="flex: 1; padding-left: 0px; min-width: 0;">`;
        gtHtml += `<div id="ff-toggle" style="font-size: 0.95rem; font-weight: 700; color: rgba(255,255,255,0.7); margin-bottom: 8px; display: flex; align-items: center; justify-content: space-between; cursor: pointer; user-select: none;">
            <span style="display:flex; align-items:center; gap:6px;"><i class="fa-solid fa-bolt" style="color:#fbbf24;"></i> Weetjes</span>
            <i class="fa-solid fa-chevron-right" style="font-size: 0.7rem; color: rgba(56, 189, 248, 0.7); padding: 4px; background: rgba(56, 189, 248, 0.1); border-radius: 4px; transition: transform 0.3s ease;"></i>
        </div>`;
        
        gtHtml += `<div style="overflow: hidden; width: 100%;">`;
        gtHtml += `<div id="ff-slider" style="display: flex; transition: transform 0.4s cubic-bezier(0.4, 0, 0.2, 1); width: 300%;">`;
        
        // PAGE 1
        gtHtml += `<div style="width: 33.333%; display: flex; flex-direction: column; gap: 6px; font-size: 0.95rem;">`;
        gtHtml += `<div style="display: flex; justify-content: space-between; white-space: normal;">
            <span style="color: var(--text-muted); flex: 1;">Drukste dag</span>
            <strong style="color: rgba(16, 185, 129, 0.9); text-align: right; margin-left: 8px;">${busiestDayName}</strong>
        </div>`;
        gtHtml += `<div style="display: flex; justify-content: space-between; white-space: normal;">
            <span style="color: var(--text-muted); flex: 1;">Gem. per week</span>
            <strong style="color: rgba(16, 185, 129, 0.9); text-align: right; margin-left: 8px;">${avgPerWeek}u</strong>
        </div>`;
        gtHtml += `</div>`;
        
        // PAGE 2
        gtHtml += `<div style="width: 33.333%; display: flex; flex-direction: column; gap: 6px; font-size: 0.95rem;">`;
        gtHtml += `<div style="display: flex; justify-content: space-between; white-space: normal;">
            <span style="color: var(--text-muted); flex: 1;">Langste dienst</span>
            <strong style="color: rgba(16, 185, 129, 0.9); text-align: right; margin-left: 8px;">${maxShiftHours.toFixed(1)}u</strong>
        </div>`;
        gtHtml += `<div style="display: flex; justify-content: space-between; white-space: normal;">
            <span style="color: var(--text-muted); flex: 1;">Gem. per dienst</span>
            <strong style="color: rgba(16, 185, 129, 0.9); text-align: right; margin-left: 8px;">${avgShift}u</strong>
        </div>`;
        gtHtml += `</div>`;
        
        // PAGE 3
        gtHtml += `<div style="width: 33.333%; display: flex; flex-direction: column; gap: 6px; font-size: 0.95rem;">`;
        gtHtml += `<div style="display: flex; justify-content: space-between; white-space: normal;">
            <span style="color: var(--text-muted); flex: 1;">Vroegste start</span>
            <strong style="color: rgba(16, 185, 129, 0.9); text-align: right; margin-left: 8px;">${minStartStr}</strong>
        </div>`;
        gtHtml += `<div style="display: flex; justify-content: space-between; white-space: normal;">
            <span style="color: var(--text-muted); flex: 1;">Latertje</span>
            <strong style="color: rgba(16, 185, 129, 0.9); text-align: right; margin-left: 8px;">${maxEndStr}</strong>
        </div>`;
        gtHtml += `</div>`;
        
        gtHtml += `</div></div></div></div>`; // End slider, overflow-wrapper, right-col, grand-totals-wrapper
        
        grandTotalsContainer.innerHTML = gtHtml;
        grandTotalsContainer.classList.remove('hidden');
        
        // Loop Toggle Logic
        const ffToggle = document.getElementById('ff-toggle');
        const ffSlider = document.getElementById('ff-slider');
        const icon = ffToggle ? ffToggle.querySelector('.fa-chevron-right') : null;
        
        if (ffToggle && ffSlider) {
            let curPage = 0;
            ffToggle.addEventListener('click', () => {
                curPage = (curPage + 1) % 3;
                // Move the slider
                ffSlider.style.transform = `translateX(-${curPage * 33.333}%)`;
                // Rotate icon (90 deg per click)
                if (icon) icon.style.transform = `rotate(${curPage * 90}deg)`;
            });
        }
    }
    
    // 2. Group into weeks or months
    const groupsMap = new Map();
    const monthNames = ["Januari", "Februari", "Maart", "April", "Mei", "Juni", "Juli", "Augustus", "September", "Oktober", "November", "December"];
    
    hoursData.forEach(entry => {
        let dateObj;
        let dateStrForDisplay = entry.date;
        
        if (String(entry.date).match(/^\d{2}-\d{2}-\d{4}$/)) {
            const parts = entry.date.split('-');
            dateObj = new Date(parts[2], parts[1] - 1, parts[0]);
            dateStrForDisplay = dateObj.toLocaleDateString('nl-NL', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
        } else {
            dateObj = new Date(entry.date);
            if (!isNaN(dateObj)) {
                dateStrForDisplay = dateObj.toLocaleDateString('nl-NL', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
            }
        }
        
        let year = dateObj.getFullYear();
        let key = "";
        let displayTitle = "";
        
        if (currentViewMode === 'week') {
            let weekNo = 0;
            if (!isNaN(dateObj)) {
                [year, weekNo] = getWeekNumber(dateObj);
            }
            key = `${year}-W${weekNo}`;
            displayTitle = `Week ${weekNo} (${year})`;
        } else {
            let month = dateObj.getMonth();
            if (isNaN(month)) month = 0; // Fallback
            key = `${year}-M${month}`;
            displayTitle = `${monthNames[month]} ${year}`;
        }
        
        if (!groupsMap.has(key)) {
            groupsMap.set(key, { displayTitle, entries: [], totals: {} });
        }
        
        const groupData = groupsMap.get(key);
        const safeStartTime = extractTime(entry.startTime);
        const safeEndTime = extractTime(entry.endTime);
        const dur = parseFloat(calculateDuration(safeStartTime, safeEndTime));
        
        groupData.entries.push({
            id: entry.id,
            dateStr: dateStrForDisplay,
            start: safeStartTime,
            end: safeEndTime,
            dur: dur,
            loc: entry.location || "",
            notes: entry.notes || ""
        });
        
        const locName = entry.location || "Onbekend";
        groupData.totals[locName] = (groupData.totals[locName] || 0) + dur;
    });
    
    // 3. Render Accordions
    groupsMap.forEach((groupData, key) => {
        const details = document.createElement('details');
        details.className = 'week-details';
        
        let totalsSubtitle = '';
        for (const [loc, total] of Object.entries(groupData.totals)) {
            totalsSubtitle += `${loc}: ${total.toFixed(2)}u | `;
        }
        totalsSubtitle = totalsSubtitle.slice(0, -3); // remove trailing separator
        
        const isChecked = selectedGroups.has(key) ? 'checked' : '';
        
        details.innerHTML = `
            <summary class="week-summary">
                <div style="display: flex; align-items: center; gap: 12px;">
                    <div class="group-select" onclick="event.stopPropagation()">
                        <label class="checkbox-container" style="margin: 0; padding-left: 20px;">
                            <input type="checkbox" class="group-select-checkbox" data-key="${key}" ${isChecked}>
                            <span class="checkmark"></span>
                        </label>
                    </div>
                    <div class="week-summary-content" style="margin: 0;">
                        <span class="week-summary-title">${groupData.displayTitle}</span>
                        <span class="week-summary-subtitle">${totalsSubtitle}</span>
                    </div>
                </div>
                <div class="week-summary-actions">
                    <i class="fa-solid fa-chevron-down week-chevron"></i>
                </div>
            </summary>
            <div class="week-content"></div>
        `;
        
        const weekContent = details.querySelector('.week-content');
        
        groupData.entries.forEach(entry => {
            const div = document.createElement('div');
            div.className = 'hour-card';
            div.innerHTML = `
                <div class="hour-card-header" style="align-items: center;">
                    <div style="display: flex; flex-direction: column; gap: 2px; flex: 1;">
                        <span style="font-weight: 700; color: var(--primary); font-size: 1.15rem;">${entry.dateStr}</span>
                        ${entry.loc ? `<span style="font-size: 0.95rem; color: #34d399;"><i class="fa-solid fa-store"></i> ${entry.loc}</span>` : ''}
                    </div>
                    <button class="delete-btn" onclick="deleteEntry('${entry.id}')"><i class="fa-solid fa-trash-can"></i></button>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div class="time-range" style="font-size: 1.05rem;">
                        <span>${entry.start}</span>
                        <i class="fa-solid fa-arrow-right"></i>
                        <span>${entry.end}</span>
                    </div>
                    <div class="total-time" style="font-weight: 700; font-size: 1.1rem; color: var(--accent);">${entry.dur.toFixed(2)} uur</div>
                </div>
                ${entry.notes ? `<div class="hour-card-notes" style="margin-left: 0; font-size: 0.95rem;">${entry.notes}</div>` : ''}
            `;
            weekContent.appendChild(div);
        });
        
        hoursList.appendChild(details);
    });
    
    renderPrintView(null); // Render full print view by default
}

function getWeekNumber(d) {
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay()||7));
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(),0,1));
    const weekNo = Math.ceil(( ( (date - yearStart) / 86400000) + 1)/7);
    return [date.getUTCFullYear(), weekNo];
}

function renderPrintView(forceKey = null) {
    const printContainer = document.getElementById('print-container');
    if (!printContainer) return;
    
    // Check toggle
    const includeNotes = document.getElementById('print-notes-toggle')?.checked || false;
    
    // Determine active filters
    let activeKeys = new Set();
    if (forceKey) {
        activeKeys.add(forceKey);
    } else if (selectedGroups.size > 0) {
        activeKeys = selectedGroups;
    }
    
    if (activeKeys.size > 0) {
        printContainer.innerHTML = `<h2 style="margin-bottom: 30px; text-align: center;">Urenoverzicht</h2>`;
    } else {
        printContainer.innerHTML = `<h2 style="margin-bottom: 30px; text-align: center;">Urenoverzicht</h2>`;
    }
    
    if (hoursData.length === 0) {
        printContainer.innerHTML += '<p>Geen uren geregistreerd.</p>';
        return;
    }
    
    const groupsMap = new Map();
    const monthNames = ["Januari", "Februari", "Maart", "April", "Mei", "Juni", "Juli", "Augustus", "September", "Oktober", "November", "December"];
    
    hoursData.forEach(entry => {
        let dateObj;
        let dateStrForDisplay = entry.date;
        
        if (String(entry.date).match(/^\d{2}-\d{2}-\d{4}$/)) {
            const parts = entry.date.split('-');
            dateObj = new Date(parts[2], parts[1] - 1, parts[0]);
            dateStrForDisplay = dateObj.toLocaleDateString('nl-NL', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
        } else {
            dateObj = new Date(entry.date);
            if (!isNaN(dateObj)) {
                dateStrForDisplay = dateObj.toLocaleDateString('nl-NL', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
            }
        }
        
        let year = dateObj.getFullYear();
        let key = "";
        let displayTitle = "";
        
        if (currentViewMode === 'week') {
            let weekNo = 0;
            if (!isNaN(dateObj)) {
                [year, weekNo] = getWeekNumber(dateObj);
            }
            key = `${year}-W${weekNo}`;
            displayTitle = `Week ${weekNo} (${year})`;
        } else {
            let month = dateObj.getMonth();
            if (isNaN(month)) month = 0;
            key = `${year}-M${month}`;
            displayTitle = `${monthNames[month]} ${year}`;
        }
        
        if (activeKeys.size > 0 && !activeKeys.has(key)) return;
        
        if (!groupsMap.has(key)) {
            groupsMap.set(key, { displayTitle, entries: [], totals: {} });
        }
        
        const groupData = groupsMap.get(key);
        
        const safeStartTime = extractTime(entry.startTime);
        const safeEndTime = extractTime(entry.endTime);
        const dur = parseFloat(calculateDuration(safeStartTime, safeEndTime));
        
        groupData.entries.push({
            dateStr: dateStrForDisplay,
            start: safeStartTime,
            end: safeEndTime,
            dur: dur,
            loc: entry.location || "",
            notes: entry.notes || ""
        });
        
        const locName = entry.location || "Onbekend";
        groupData.totals[locName] = (groupData.totals[locName] || 0) + dur;
    });
    
    groupsMap.forEach((groupData) => {
        const weekDiv = document.createElement('div');
        weekDiv.className = 'print-week';
        
        let html = `<div class="print-week-title">${groupData.displayTitle}</div>`;
        
        html += `<table class="print-table" style="width: 100%; text-align: left; border-collapse: collapse; margin-bottom: 10px;">
                    <thead>
                        <tr style="border-bottom: 1px solid #000;">
                            <th style="padding: 4px; width: 35%;">Datum</th>
                            <th style="padding: 4px; width: 25%;">Tijd</th>
                            <th style="padding: 4px; width: 15%;">Uren</th>
                            <th style="padding: 4px; width: 25%;">Locatie</th>
                        </tr>
                    </thead>
                    <tbody>`;
        
        groupData.entries.forEach(e => {
            html += `<tr style="border-bottom: 1px solid #ddd;">
                        <td style="padding: 4px;">${e.dateStr}</td>
                        <td style="padding: 4px;">${e.start} - ${e.end}</td>
                        <td style="padding: 4px;">${e.dur.toFixed(2)}</td>
                        <td style="padding: 4px;">${e.loc}</td>
                     </tr>`;
            if (includeNotes && e.notes) {
                html += `<tr>
                            <td colspan="4" style="padding: 2px 4px 6px 20px; font-style: italic; font-size: 0.85em; color: #555;">Opmerking: ${e.notes}</td>
                         </tr>`;
            }
        });
        
        html += `</tbody></table>`;
        
        html += `<div class="print-totals">Totalen:`;
        for (const [loc, total] of Object.entries(groupData.totals)) {
            html += `<br>${loc}: ${total.toFixed(2)} uur`;
        }
        html += `</div>`;
        
        weekDiv.innerHTML = html;
        printContainer.appendChild(weekDiv);
    });
    
    // Voeg handtekening vakken toe
    const signatureHtml = `
        <div class="print-signatures" style="display: flex; justify-content: space-between; margin-top: 30px; padding-top: 15px; border-top: 2px solid #ccc; break-inside: avoid;">
            <div style="width: 45%;">
                <p style="margin-bottom: 5px; font-weight: bold;">Naam medewerker:</p>
                <div style="border-bottom: 1px dotted #000; width: 100%; height: 20px; margin-bottom: 20px;"></div>
                <p style="margin-bottom: 30px; font-weight: bold;">Handtekening medewerker:</p>
                <div style="border-bottom: 1px solid #000; width: 100%;"></div>
            </div>
            <div style="width: 45%;">
                <p style="margin-bottom: 5px; font-weight: bold;">Naam filiaalleider/manager:</p>
                <div style="border-bottom: 1px dotted #000; width: 100%; height: 20px; margin-bottom: 20px;"></div>
                <p style="margin-bottom: 30px; font-weight: bold;">Handtekening filiaalleider/manager:</p>
                <div style="border-bottom: 1px solid #000; width: 100%;"></div>
            </div>
        </div>
    `;
    printContainer.insertAdjacentHTML('beforeend', signatureHtml);
}

function printSpecificWeek(event, weekKey) {
    event.preventDefault();
    event.stopPropagation(); // Prevent accordion toggle
    
    renderPrintView(weekKey);
    window.print();
    
    // Reset back to all after printing just in case
    setTimeout(() => {
        renderPrintView(null);
    }, 1000);
}

function extractTime(timeStr) {
    if (!timeStr) return "";
    timeStr = String(timeStr);
    if (timeStr.includes('T')) {
        const timePart = timeStr.split('T')[1];
        if (timePart) {
            const parts = timePart.split(':');
            if (parts.length >= 2) {
                return `${parts[0]}:${parts[1]}`;
            }
        }
    }
    return timeStr;
}

function calculateDuration(start, end) {
    if (!start || !end) return "0.00";
    
    const [startH, startM] = start.split(':').map(Number);
    const [endH, endM] = end.split(':').map(Number);
    
    let diffMinutes = (endH * 60 + endM) - (startH * 60 + startM);
    if (diffMinutes < 0) diffMinutes += 24 * 60; // Crosses midnight
    
    return (diffMinutes / 60).toFixed(2);
}

// Save Data
hoursForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!API_URL) return;
    
    const location = document.getElementById('location').value;
    const date = document.getElementById('date').value;
    const startTime = document.getElementById('start-time').value;
    const endTime = document.getElementById('end-time').value;
    let notes = document.getElementById('notes').value;
    const breakVal = document.getElementById('break-val').value;
    if (breakVal === 'Ja') {
        notes = notes ? `Pauze gehad | ${notes}` : `Pauze gehad`;
    }
    
    if (!location) {
        showToast('Kies een locatie aub', 'error');
        return;
    }
    if (!date) {
        showToast('Vul een datum in', 'error');
        return;
    }
    if (!startTime || !endTime) {
        showToast('Vul een start- en eindtijd in', 'error');
        return;
    }
    if (!breakVal) {
        showToast('Geef aan of u pauze heeft gehad', 'error');
        return;
    }

    // Beveiliging: Check of de tijd in de toekomst ligt
    const endDateTime = new Date(`${date}T${endTime}`);
    if (endDateTime > new Date()) {
        showToast('Fout: U kunt geen uren in de toekomst invullen!', 'error');
        return;
    }
    
    // Calculate total hours manually before sending
    const duration = calculateDuration(startTime, endTime);
    
    // Check for overlap
    const formParts = date.split('-');
    const formDateStr = `${formParts[2]}-${formParts[1]}-${formParts[0]}`;
    const newStart = parseInt(startTime.replace(':', ''));
    let newEnd = parseInt(endTime.replace(':', ''));
    if (newEnd < newStart) newEnd += 2400;
    
    let hasOverlap = false;
    for (let entry of hoursData) {
        let entryDateStr = entry.date;
        if (String(entryDateStr).includes('-') && entryDateStr.split('-')[0].length === 4) {
            const ep = entryDateStr.split('-');
            entryDateStr = `${ep[2]}-${ep[1]}-${ep[0]}`;
        }
        
        // Match dates (handles both DD-MM-YYYY and YYYY-MM-DD formats from legacy data)
        if (entryDateStr === formDateStr || entryDateStr === date) {
            const eStart = parseInt(extractTime(entry.startTime).replace(':', ''));
            let eEnd = parseInt(extractTime(entry.endTime).replace(':', ''));
            if (eEnd < eStart) eEnd += 2400;
            
            // Overlap condition
            if (newStart < eEnd && eStart < newEnd) {
                hasOverlap = true;
                break;
            }
        }
    }
    
    if (hasOverlap) {
        showToast('Deze tijden overlappen met een al ingevulde dienst!', 'error');
        return;
    }
    
    const newEntry = {
        id: generateId(), // Nu hebben we een eigen unieke ID!
        location,
        date,
        startTime,
        endTime,
        duration,
        notes
    };
    
    // 1. Lokaal opslaan (Direct Zichtbaar)
    hoursData.push(newEntry);
    
    // Sorteer Lokaal (Datum en Tijd)
    hoursData.sort((a, b) => {
        let dateA = String(a.date).match(/^\d{2}-\d{2}-\d{4}$/) ? a.date.split('-').reverse().join('-') : a.date;
        let dateB = String(b.date).match(/^\d{2}-\d{2}-\d{4}$/) ? b.date.split('-').reverse().join('-') : b.date;
        if (dateA !== dateB) return dateA.localeCompare(dateB);
        return a.startTime.localeCompare(b.startTime);
    });
    
    localStorage.setItem('hoursCache', JSON.stringify(hoursData));
    renderHours();
    showToast('Opgeslagen! (Wordt gesynchroniseerd)', 'success');
    
    // Terug naar hoofdscherm
    addFormPage.classList.remove('active');
    hoursForm.reset();
    
    // 2. In wachtrij zetten voor achtergrond-sync
    addToSyncQueue({
        action: 'add',
        entry: newEntry
    });
});

// Delete Data
window.deleteEntry = async (id) => {
    if (!confirm('Weet je zeker dat je deze uren wilt verwijderen?')) return;
    
    // 1. Lokaal verwijderen (Direct Zichtbaar)
    hoursData = hoursData.filter(e => e.id !== id);
    localStorage.setItem('hoursCache', JSON.stringify(hoursData));
    renderHours();
    showToast('Verwijderd! (Wordt gesynchroniseerd)', 'success');
    
    // 2. In wachtrij zetten voor achtergrond-sync
    addToSyncQueue({
        action: 'delete',
        id: id
    });
};

// Sync Queue Systeem
function addToSyncQueue(task) {
    const queue = JSON.parse(localStorage.getItem('syncQueue') || '[]');
    queue.push(task);
    localStorage.setItem('syncQueue', JSON.stringify(queue));
    processSyncQueue();
}

async function processSyncQueue() {
    if (isSyncing || !navigator.onLine || !API_URL) return;
    
    let queue = JSON.parse(localStorage.getItem('syncQueue') || '[]');
    if (queue.length === 0) return;
    
    isSyncing = true;
    let queueChanged = false;
    
    for (let i = 0; i < queue.length; i++) {
        const task = queue[i];
        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                body: JSON.stringify(task)
            });
            const result = await response.json();
            if (result.status === 'success') {
                // Task succeeded, remove it from queue array
                queue.splice(i, 1);
                i--; // Adjust index after removal
                queueChanged = true;
            } else {
                console.error('Sync Fout:', result.message);
                break; // Stop en probeer later opnieuw
            }
        } catch (e) {
            console.error('Netwerk fout tijdens sync:', e);
            break; // Geen bereik, stop en probeer later opnieuw
        }
    }
    
    if (queueChanged) {
        localStorage.setItem('syncQueue', JSON.stringify(queue));
        if (queue.length === 0) {
            // Als alles verwerkt is, haal de nieuwste versie op om zeker te zijn
            fetchHours(false);
        }
    }
    isSyncing = false;
}

// Triggers voor de wachtrij
window.addEventListener('online', processSyncQueue);
document.addEventListener('visibilitychange', () => {
    if (!document.hidden && API_URL) {
        fetchHours(false); // Haalt nieuwste op EN triggert de queue
    }
});

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// Toast Notifications
function showToast(message, type) {
    toastMsg.textContent = message;
    
    toast.classList.remove('hidden');
    
    if (type === 'success') {
        toastIcon.className = 'fa-solid fa-circle-check';
        toastIcon.style.color = 'var(--accent)';
        if (window.navigator && window.navigator.vibrate) window.navigator.vibrate(50);
    } else if (type === 'error') {
        toastIcon.className = 'fa-solid fa-circle-exclamation';
        toastIcon.style.color = 'var(--danger)';
        if (window.navigator && window.navigator.vibrate) window.navigator.vibrate([50, 50, 50]);
    } else {
        toastIcon.className = 'fa-solid fa-circle-info';
        toastIcon.style.color = 'var(--primary)';
    }
    
    // Trigger reflow
    void toast.offsetWidth;
    
    toast.classList.add('show');
    
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.classList.add('hidden'), 400); // Wait for transition
    }, 3000);
}

// Print Feature & Modal
const printBtnControl = document.getElementById('print-btn');
const printModal = document.getElementById('print-modal');
const printCancelBtn = document.getElementById('print-cancel-btn');
const printYesBtn = document.getElementById('print-yes-btn');
const printNoBtn = document.getElementById('print-no-btn');
const hiddenNotesToggle = document.getElementById('print-notes-toggle');

if (printBtnControl) {
    printBtnControl.addEventListener('click', () => {
        printModal.classList.remove('hidden');
    });
}

if (printCancelBtn) {
    printCancelBtn.addEventListener('click', () => {
        printModal.classList.add('hidden');
    });
}

if (printYesBtn) {
    printYesBtn.addEventListener('click', () => {
        if (hiddenNotesToggle) hiddenNotesToggle.checked = true;
        printModal.classList.add('hidden');
        renderPrintView(null); 
        window.print();
    });
}

if (printNoBtn) {
    printNoBtn.addEventListener('click', () => {
        if (hiddenNotesToggle) hiddenNotesToggle.checked = false;
        printModal.classList.add('hidden');
        renderPrintView(null); 
        window.print();
    });
}

// View Controls Toggle
document.querySelectorAll('.view-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        currentViewMode = e.target.dataset.view;
        selectedGroups.clear();
        updatePrintButtonText();
        renderHours();
    });
});

function updatePrintButtonText() {
    const btnText = document.getElementById('print-btn-text');
    if (!btnText) return;
    if (selectedGroups.size === 0) {
        btnText.textContent = 'Alles Printen';
    } else {
        const typeStr = currentViewMode === 'week' ? (selectedGroups.size === 1 ? 'week' : 'weken') : (selectedGroups.size === 1 ? 'maand' : 'maanden');
        btnText.textContent = `Print ${selectedGroups.size} geselecteerde ${typeStr}`;
    }
}

// Checkbox event delegation (since accordions are re-rendered dynamically)
document.addEventListener('change', (e) => {
    if (e.target && e.target.classList.contains('group-select-checkbox')) {
        const key = e.target.dataset.key;
        if (e.target.checked) {
            selectedGroups.add(key);
        } else {
            selectedGroups.delete(key);
        }
        updatePrintButtonText();
    }
    
    if (e.target && e.target.id === 'print-notes-toggle') {
        // Toggle notes in print view - will re-render just before print anyway
    }
});

// Boot
init();

// Live Duration Calculator
const startTimeInput = document.getElementById('start-time');
const endTimeInput = document.getElementById('end-time');
const liveDurationDisplay = document.getElementById('live-duration');

function updateLiveDuration() {
    if (startTimeInput.value && endTimeInput.value) {
        const start = parseInt(startTimeInput.value.replace(':', ''));
        let end = parseInt(endTimeInput.value.replace(':', ''));
        if (end < start) end += 2400; // Next day
        
        const sH = Math.floor(start / 100);
        const sM = start % 100;
        const eH = Math.floor(end / 100);
        const eM = end % 100;
        
        let diffM = (eH * 60 + eM) - (sH * 60 + sM);
        const dur = diffM / 60;
        
        liveDurationDisplay.style.display = 'block';
        liveDurationDisplay.textContent = dur.toFixed(2).replace('.', ',') + ' uur';
    } else {
        liveDurationDisplay.style.display = 'none';
    }
}

startTimeInput.addEventListener('input', updateLiveDuration);
endTimeInput.addEventListener('input', updateLiveDuration);

// Radio button sync for location
document.querySelectorAll('input[name="location_radio"]').forEach(radio => {
    radio.addEventListener('click', function(e) {
        const hiddenInput = document.getElementById('location');
        if (hiddenInput.value === this.value) {
            this.checked = false;
            hiddenInput.value = '';
        } else {
            hiddenInput.value = this.value;
        }
    });
});

// --- Statistics & Charts ---
const statsBtn = document.getElementById('stats-btn');
const statsPage = document.getElementById('stats-page');
const closeStatsBtn = document.getElementById('close-stats-btn');
let weekChartInstance = null;
let monthChartInstance = null;

if (statsBtn && statsPage) {
    statsBtn.addEventListener('click', () => {
        statsPage.classList.add('active');
        renderCharts();
    });
    
    closeStatsBtn.addEventListener('click', () => {
        statsPage.classList.remove('active');
    });
}

function renderCharts() {
    // 1. Prepare Data
    const weekMap = {};
    const monthMap = {};
    
    hoursData.forEach(entry => {
        const safeStartTime = extractTime(entry.startTime);
        const safeEndTime = extractTime(entry.endTime);
        const dur = parseFloat(calculateDuration(safeStartTime, safeEndTime));
        
        let dateObj;
        if (String(entry.date).match(/^\d{2}-\d{2}-\d{4}$/)) {
            const parts = entry.date.split('-');
            dateObj = new Date(parts[2], parts[1] - 1, parts[0]);
        } else {
            dateObj = new Date(entry.date);
        }
        
        // Week grouping
        const wNo = getWeekNumber(dateObj);
        const y = dateObj.getFullYear();
        const m = dateObj.getMonth();
        
        const sortWeek = `${y}-${String(wNo).padStart(2, '0')}`;
        const sortMonth = `${y}-${String(m + 1).padStart(2, '0')}`;
        
        if (!weekMap[sortWeek]) weekMap[sortWeek] = { label: `Wk ${wNo}`, total: 0 };
        weekMap[sortWeek].total += dur;
        
        if (!monthMap[sortMonth]) monthMap[sortMonth] = { label: dateObj.toLocaleDateString('nl-NL', { month: 'short', year: '2-digit' }), total: 0 };
        monthMap[sortMonth].total += dur;
    });
    
    // Sort chronological and take the most recent ones to prevent crowding
    const sortedWeeks = Object.keys(weekMap).sort().slice(-8); // Last 8 weeks
    const sortedMonths = Object.keys(monthMap).sort().slice(-6); // Last 6 months
    
    const weekLabels = sortedWeeks.map(k => weekMap[k].label);
    const weekData = sortedWeeks.map(k => weekMap[k].total);
    
    const monthLabels = sortedMonths.map(k => monthMap[k].label);
    const monthData = sortedMonths.map(k => monthMap[k].total);
    
    // Render Week Chart
    const ctxW = document.getElementById('weekChart').getContext('2d');
    if(weekChartInstance) weekChartInstance.destroy();
    weekChartInstance = new Chart(ctxW, {
        type: 'bar',
        data: {
            labels: weekLabels,
            datasets: [{
                label: 'Uren',
                data: weekData,
                backgroundColor: 'rgba(56, 189, 248, 0.6)',
                borderColor: 'rgba(56, 189, 248, 1)',
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            scales: { y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { color: '#94a3b8' } }, x: { grid: { display: false }, ticks: { color: '#94a3b8' } } },
            plugins: { legend: { display: false } }
        }
    });

    // Render Month Chart
    const ctxM = document.getElementById('monthChart').getContext('2d');
    if(monthChartInstance) monthChartInstance.destroy();
    monthChartInstance = new Chart(ctxM, {
        type: 'bar',
        data: {
            labels: monthLabels,
            datasets: [{
                label: 'Uren',
                data: monthData,
                backgroundColor: 'rgba(16, 185, 129, 0.6)',
                borderColor: 'rgba(16, 185, 129, 1)',
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            scales: { y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { color: '#94a3b8' } }, x: { grid: { display: false }, ticks: { color: '#94a3b8' } } },
            plugins: { legend: { display: false } }
        }
    });
}

// Radio button sync for break
document.querySelectorAll('input[name="break_radio"]').forEach(radio => {
    radio.addEventListener('click', function(e) {
        const hiddenInput = document.getElementById('break-val');
        if (hiddenInput.value === this.value) {
            this.checked = false;
            hiddenInput.value = '';
        } else {
            hiddenInput.value = this.value;
        }
    });
});

// --- Haptic Feedback ---
function hapticFeedback(pattern) {
    if (window.navigator && window.navigator.vibrate) {
        window.navigator.vibrate(pattern);
    }
}

// Global click listener for UI elements
document.addEventListener('click', (e) => {
    if (e.target.closest('.btn, .icon-btn, .view-btn, .add-btn-header, .loc-chip, #settings-trigger')) {
        hapticFeedback(15);
    }
});


// Focus input when clicking its wrapper
document.querySelectorAll('.input-wrapper, .time-row .form-group > div').forEach(wrapper => {
    wrapper.addEventListener('click', (e) => {
        const input = wrapper.querySelector('input, textarea');
        if (input && e.target !== input) {
            input.focus();
            if(input.type === 'time' || input.type === 'date') input.showPicker && input.showPicker();
        }
    });
});

// Export and Share Logic
const exportExcelBtn = document.getElementById('export-excel-btn');
const exportPdfBtn = document.getElementById('export-pdf-btn');
const exportPrintBtn = document.getElementById('export-print-btn');
const exportNotesToggle = document.getElementById('export-notes-toggle');

function getFilteredData() {
    // If specific groups are selected, filter. Otherwise return all.
    if (selectedGroups.size === 0) return hoursData;
    
    return hoursData.filter(entry => {
        let dateObj;
        if (String(entry.date).match(/^\d{2}-\d{2}-\d{4}$/)) {
            const parts = entry.date.split('-');
            dateObj = new Date(parts[2], parts[1] - 1, parts[0]);
        } else {
            dateObj = new Date(entry.date);
        }
        
        let key;
        if (currentViewMode === 'week') {
            const [y, wNo] = getWeekNumber(dateObj);
            key = `${y}-W${wNo}`;
        } else {
            const y = dateObj.getFullYear();
            const m = dateObj.getMonth();
            key = `${y}-M${m}`;
        }
        return selectedGroups.has(key);
    });
}

function generateCSV() {
    const data = getFilteredData();
    const includeNotes = exportNotesToggle.checked;
    
    let csv = "Datum,Locatie,Starttijd,Eindtijd,Uren";
    if (includeNotes) csv += ",Opmerkingen";
    csv += "\n";
    
    data.forEach(entry => {
        const dur = calculateDuration(extractTime(entry.startTime), extractTime(entry.endTime));
        const dateStr = entry.date; // already nicely formatted
        let row = `"${dateStr}","${entry.location}","${entry.startTime}","${entry.endTime}","${dur}"`;
        
        if (includeNotes) {
            const safeNotes = (entry.notes || "").replace(/"/g, '""'); // escape quotes for CSV
            row += `,"${safeNotes}"`;
        }
        csv += row + "\n";
    });
    
    return csv;
}

if (exportExcelBtn) {
    exportExcelBtn.addEventListener('click', async () => {
        const csvString = generateCSV();
        const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
        const file = new File([blob], 'uren.csv', { type: 'text/csv' });
        
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
            try {
                await navigator.share({
                    title: 'Urenregistratie',
                    text: 'Hierbij mijn urenoverzicht.',
                    files: [file]
                });
            } catch(e) { console.error('Share failed', e); }
        } else {
            // Fallback for desktop: download file
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'uren.csv';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }
        document.getElementById('print-modal').classList.add('hidden');
    });
}

if (exportPdfBtn) {
    exportPdfBtn.addEventListener('click', async () => {
        // Sync the notes toggle to the hidden one used by renderPrintView
        const hiddenNotesToggle = document.getElementById('print-notes-toggle');
        if (hiddenNotesToggle) hiddenNotesToggle.checked = exportNotesToggle ? exportNotesToggle.checked : false;
        
        renderPrintView(null);
        const element = document.getElementById('print-container');
        
        // Save current scroll position and overflow
        const scrollY = window.scrollY;
        const originalBodyOverflow = document.body.style.overflow;
        const originalHtmlOverflow = document.documentElement.style.overflow;
        
        window.scrollTo(0, 0);
        document.body.style.overflow = 'visible';
        document.documentElement.style.overflow = 'visible';
        
        // Temporarily remove print-only class to avoid html2canvas cloning it as display: none
        element.classList.remove('print-only');
        
        // We use absolute positioning at the top of the document.
        element.style.cssText = 'display:block; position:absolute; top:0; left:0; width:100%; min-width:800px; background:white; color:black; padding:20px; z-index:9999;';
        
        // Wait for browser to paint the content
        await new Promise(resolve => setTimeout(resolve, 300));
        
        const opt = {
            margin:       10,
            filename:     'uren.pdf',
            image:        { type: 'jpeg', quality: 0.98 },
            html2canvas:  { scale: 2, scrollY: 0, windowWidth: 800, useCORS: true },
            jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
        };
        
        // Helper to hide element again
        function hideElement() {
            element.classList.add('print-only');
            element.style.cssText = '';
            document.body.style.overflow = originalBodyOverflow;
            document.documentElement.style.overflow = originalHtmlOverflow;
            window.scrollTo(0, scrollY);
        }
        
        if (window.html2canvas && window.jspdf) {
            try {
                const canvas = await html2canvas(element, { scale: 2, useCORS: true, windowWidth: 800 });
                const imgData = canvas.toDataURL('image/jpeg', 0.98);
                
                const { jsPDF } = window.jspdf;
                const pdf = new jsPDF('p', 'mm', 'a4');
                const pdfWidth = pdf.internal.pageSize.getWidth();
                const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
                
                pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
                const pdfBlob = pdf.output('blob');
                const file = new File([pdfBlob], 'uren.pdf', { type: 'application/pdf' });
                
                // Try native share (mobile)
                if (navigator.canShare && navigator.canShare({ files: [file] })) {
                    await navigator.share({
                        title: 'Urenregistratie PDF',
                        text: 'Hierbij mijn urenoverzicht in PDF.',
                        files: [file]
                    });
                    hideElement();
                    document.getElementById('print-modal').classList.add('hidden');
                    return;
                }
                
                // Fallback: download
                pdf.save('uren.pdf');
                hideElement();
            } catch(e) {
                console.error('PDF generation failed', e);
                hideElement();
            }
        } else {
            alert("PDF engine is nog aan het laden. Probeer het over een seconde nog eens.");
            hideElement();
        }
        
        document.getElementById('print-modal').classList.add('hidden');
    });
}

if (exportPrintBtn) {
    exportPrintBtn.addEventListener('click', () => {
        const hiddenNotesToggle = document.getElementById('print-notes-toggle');
        if (hiddenNotesToggle) hiddenNotesToggle.checked = exportNotesToggle.checked;
        
        document.getElementById('print-modal').classList.add('hidden');
        renderPrintView(null);
        window.print();
    });
}

// Update the print button text logic
function updatePrintButtonText() {
    const btnText = document.getElementById('print-btn-text');
    if (!btnText) return;
    if (selectedGroups.size === 0) {
        btnText.textContent = 'Alles Exporteren / Delen';
    } else {
        const typeStr = currentViewMode === 'week' ? (selectedGroups.size === 1 ? 'week' : 'weken') : (selectedGroups.size === 1 ? 'maand' : 'maanden');
        btnText.textContent = `Deel ${selectedGroups.size} ${typeStr}`;
    }
}


document.addEventListener('DOMContentLoaded', () => {
    const selectModeBtn = document.getElementById('select-mode-btn');
    if (selectModeBtn) {
        selectModeBtn.addEventListener('click', () => {
            const isActive = document.body.classList.toggle('select-mode');
            if (isActive) {
                selectModeBtn.innerHTML = '<i class="fa-solid fa-times"></i> Annuleer';
                selectModeBtn.style.background = 'rgba(239, 68, 68, 0.2)';
                selectModeBtn.style.color = '#f87171';
                selectModeBtn.style.borderColor = 'rgba(239, 68, 68, 0.4)';
            } else {
                selectModeBtn.innerHTML = '<i class="fa-solid fa-share-from-square"></i> Delen...';
                selectModeBtn.style.background = 'rgba(59, 130, 246, 0.1)';
                selectModeBtn.style.color = 'var(--primary)';
                selectModeBtn.style.borderColor = 'var(--primary)';
                
                // Clear selection when cancelling
                if (typeof selectedGroups !== 'undefined') {
                    selectedGroups.clear();
                    // Uncheck all visible checkboxes
                    document.querySelectorAll('.group-select-checkbox').forEach(cb => cb.checked = false);
                    updatePrintButtonText();
                }
            }
        });
    }
});






