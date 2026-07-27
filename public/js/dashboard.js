let globalSchedules = [];
let globalDefaultRoutine = null;
let currentRank = "Beginner";
let activeDefaultPath = "Gym"; // Gym or Calisthenics
let activeScheduleIndex = 0;
let allRawFlexes = [];

document.addEventListener('DOMContentLoaded', () => {
    fetchDashboardData();

    // Global Keydown & Click Listeners for Modals
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeAddFlexModal();
            closeEditFlexModal();
            closeDeleteFlexModal();
            closeGraphModal();
            closeAddScheduleModal();
            closeRenameScheduleModal();
            closeAddExerciseModal();
            closeEditExerciseModal();
            closeDeleteScheduleModal();
        }
    });

    document.addEventListener('click', (e) => {
        const modalIds = [
            'addFlexModal', 'editFlexModal', 'deleteFlexModal', 'graphModal',
            'addScheduleModal', 'renameScheduleModal', 'addExerciseModal',
            'editExerciseModal', 'deleteScheduleModal'
        ];
        modalIds.forEach(id => {
            const modal = document.getElementById(id);
            if (modal && e.target === modal) {
                modal.classList.add('hidden');
            }
        });
    });
});

async function fetchDashboardData() {
    try {
        const response = await fetch('/api/dashboard');

        if (response.status === 401) {
            window.location.href = '/';
            return;
        }

        const data = await response.json();

        // 1. Render Profile Header
        currentRank = data.user?.rank || 'Beginner';
        renderUserStats(data.user);

        // Store raw flexes globally for graphs
        const activeFlexes = data.activeFlexes || [];
        const archivedFlexes = data.archivedFlexes || [];
        allRawFlexes = [...activeFlexes, ...archivedFlexes];

        // 2. Render Active & Archived Flex Progress Logs
        renderFlexLogs('activeFlexLogsContainer', activeFlexes, false);
        renderFlexLogs('archivedFlexLogsContainer', archivedFlexes, true);

        // 3. Render Default Gladiator V Workout Plan
        globalDefaultRoutine = data.defaultRoutine;
        renderDefaultSchedule();

        // 4. Render Custom Workout Schedule with Tabs & Controls
        globalSchedules = data.schedules || [];
        renderScheduleSection();

        // 5. Render Diet Table
        renderDietTable(data.diet);

    } catch (error) {
        console.error('Error loading dashboard data:', error);
    }
}

function renderUserStats(user) {
    if (!user) return;
    
    const usernameEl = document.getElementById('username');
    const flexCountEl = document.getElementById('flexCount');
    const userRankEl = document.getElementById('userRank');
    const avatarImg = document.getElementById('userAvatar');

    if (usernameEl) usernameEl.textContent = user.username || 'Gladiator';
    if (flexCountEl) flexCountEl.textContent = user.flexes || 0;
    if (userRankEl) userRankEl.textContent = user.rank || 'Beginner';

    if (user.avatar && avatarImg) {
        avatarImg.src = user.avatar;
        avatarImg.classList.remove('hidden');
    }
}

// -------------------------------------------------------------------------
// TOAST NOTIFICATION UTILITY
// -------------------------------------------------------------------------
function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    const bgClass = type === 'error' ? 'bg-red-950 border-red-800 text-red-200 shadow-red-950/50' : 'bg-emerald-950 border-emerald-800 text-emerald-200 shadow-emerald-950/50';
    const icon = type === 'error' ? 'fa-circle-xmark text-red-400' : 'fa-circle-check text-emerald-400';

    toast.className = `pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-2xl border shadow-xl text-sm font-semibold transition-all transform translate-y-2 opacity-0 ${bgClass}`;
    toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${message}</span>`;

    container.appendChild(toast);

    requestAnimationFrame(() => {
        toast.classList.remove('translate-y-2', 'opacity-0');
    });

    setTimeout(() => {
        toast.classList.add('opacity-0', 'translate-y-2');
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

// -------------------------------------------------------------------------
// FLEX LOGS RENDERER & ACTIONS
// -------------------------------------------------------------------------

function renderFlexLogs(containerId, flexLogs, isArchivedList) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!flexLogs || flexLogs.length === 0) {
        const emptyMessage = isArchivedList 
            ? 'No archived flexes yet.' 
            : 'No active flexes logged yet! Click "Log New Flex" above or use <code class="text-red-400 font-mono">/flex</code> on Discord.';

        container.innerHTML = `
            <div class="col-span-full text-center py-8 text-gray-500 text-sm border border-dashed border-gray-800/80 rounded-2xl">
                ${emptyMessage}
            </div>
        `;
        return;
    }

    container.innerHTML = flexLogs.map((flex, index) => {
        const cleanName = flex.exercise ? flex.exercise.replace('(archived)', '').trim() : 'Exercise';
        const cardBg = isArchivedList 
            ? 'bg-[#0d0d10] border-gray-800/60 opacity-70 hover:opacity-100 transition' 
            : 'bg-[#15151b] border-red-900/40 hover:border-red-600/60 shadow-lg shadow-red-950/20';

        const badge = isArchivedList 
            ? '<span class="text-[10px] bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full uppercase font-bold">Archived</span>' 
            : '<span class="text-[10px] bg-red-950 text-red-400 border border-red-800/50 px-2 py-0.5 rounded-full uppercase font-bold">Active PR</span>';

        const flexJsonString = JSON.stringify(flex).replace(/"/g, '&quot;');

        const archiveActionBtn = isArchivedList
            ? `<button onclick="unarchiveFlex(${flexJsonString})" class="text-xs text-emerald-400 hover:text-emerald-300 px-2 py-1 rounded-lg bg-emerald-950/40 hover:bg-emerald-900/60 border border-emerald-800/40 transition" title="Restore to Active">
                <i class="fa-solid fa-rotate-left"></i>
               </button>`
            : `<button onclick="archiveFlex(${flexJsonString})" class="text-xs text-amber-400 hover:text-amber-300 px-2 py-1 rounded-lg bg-amber-950/40 hover:bg-amber-900/60 border border-amber-800/40 transition" title="Archive Flex">
                <i class="fa-solid fa-box-archive"></i>
               </button>`;

        return `
            <div class="p-5 rounded-2xl border transition relative flex flex-col justify-between ${cardBg}">
                <div>
                    <div class="flex items-center justify-between mb-2">
                        <span class="text-xs font-bold uppercase tracking-wider text-gray-400 truncate max-w-[140px]" title="${cleanName}">
                            #${index + 1} ${cleanName}
                        </span>
                        ${badge}
                    </div>
                    <div class="text-xl font-black text-white mb-3">${flex.stat || 'N/A'}</div>
                </div>

                <div class="pt-3 border-t border-gray-800/50 flex items-center justify-between text-xs text-gray-500">
                    <span class="flex items-center gap-1 text-[11px]">
                        <i class="fa-regular fa-calendar text-gray-600"></i> ${flex.timestamp || 'Recorded'}
                    </span>
                    
                    <!-- Interactive Action Buttons -->
                    <div class="flex items-center gap-1.5">
                        <button onclick="openEditFlexModal(${flexJsonString})" class="text-xs text-gray-400 hover:text-white px-2 py-1 rounded-lg bg-gray-800/80 hover:bg-gray-700 transition" title="Edit Flex">
                            <i class="fa-solid fa-pen-to-square"></i>
                        </button>
                        ${archiveActionBtn}
                        <button onclick="openDeleteFlexModal(${flexJsonString})" class="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded-lg bg-red-950/40 hover:bg-red-900/60 border border-red-800/40 transition" title="Delete">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// 1. ADD FLEX MODAL HANDLERS
function openAddFlexModal() {
    const modal = document.getElementById('addFlexModal');
    if (modal) {
        modal.classList.remove('hidden');
        document.getElementById('flexExerciseInput')?.focus();
    }
}

function closeAddFlexModal() {
    const modal = document.getElementById('addFlexModal');
    if (modal) modal.classList.add('hidden');
    const form = document.getElementById('addFlexForm');
    if (form) form.reset();
}

async function handleAddFlex(event) {
    event.preventDefault();
    const exercise = document.getElementById('flexExerciseInput')?.value?.trim();
    const stat = document.getElementById('flexStatInput')?.value?.trim();

    if (!exercise || !stat) return showToast('Please enter exercise and result.', 'error');

    try {
        const res = await fetch('/api/flex/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ exercise, stat })
        });
        const result = await res.json();
        if (result.success) {
            closeAddFlexModal();
            showToast(`💪 Recorded: ${exercise}!`);
            fetchDashboardData();
        } else {
            showToast(result.error || 'Failed to add flex.', 'error');
        }
    } catch (err) {
        console.error('Error adding flex:', err);
        showToast('Error connecting to server.', 'error');
    }
}

// 2. EDIT FLEX MODAL HANDLERS
function openEditFlexModal(flexObj) {
    const modal = document.getElementById('editFlexModal');
    if (!modal) return;

    const rawTsInput = document.getElementById('editFlexRawTs');
    const origExInput = document.getElementById('editFlexOrigExercise');
    const exInput = document.getElementById('editFlexExerciseInput');
    const statInput = document.getElementById('editFlexStatInput');

    const cleanName = flexObj.exercise ? flexObj.exercise.replace('(archived)', '').trim() : '';

    if (rawTsInput) rawTsInput.value = flexObj.raw_ts || '';
    if (origExInput) origExInput.value = flexObj.exercise || '';
    if (exInput) exInput.value = cleanName;
    if (statInput) statInput.value = flexObj.stat || '';

    modal.classList.remove('hidden');
    exInput?.focus();
}

function closeEditFlexModal() {
    const modal = document.getElementById('editFlexModal');
    if (modal) modal.classList.add('hidden');
    const form = document.getElementById('editFlexForm');
    if (form) form.reset();
}

async function handleEditFlex(event) {
    event.preventDefault();
    const raw_ts = document.getElementById('editFlexRawTs')?.value;
    const exercise = document.getElementById('editFlexOrigExercise')?.value;
    const newExercise = document.getElementById('editFlexExerciseInput')?.value?.trim();
    const newStat = document.getElementById('editFlexStatInput')?.value?.trim();

    if (!newExercise || !newStat) {
        return showToast('Exercise and result are required.', 'error');
    }

    try {
        const res = await fetch('/api/flex/edit', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                exercise,
                raw_ts,
                newExercise,
                newStat
            })
        });
        const result = await res.json();
        if (result.success) {
            closeEditFlexModal();
            showToast('Flex updated successfully!');
            fetchDashboardData();
        } else {
            showToast(result.error || 'Failed to update flex.', 'error');
        }
    } catch (err) {
        console.error('Error updating flex:', err);
        showToast('Error connecting to server.', 'error');
    }
}

// 3. ARCHIVE & UNARCHIVE FLEX
async function archiveFlex(flexObj) {
    try {
        const res = await fetch('/api/flex/archive', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ exercise: flexObj.exercise, raw_ts: flexObj.raw_ts })
        });
        const result = await res.json();
        if (result.success) {
            showToast('Flex moved to archives.');
            fetchDashboardData();
        } else {
            showToast(result.error || 'Failed to archive flex.', 'error');
        }
    } catch (err) {
        console.error('Error archiving flex:', err);
        showToast('Error archiving flex.', 'error');
    }
}

async function unarchiveFlex(flexObj) {
    try {
        const res = await fetch('/api/flex/unarchive', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ exercise: flexObj.exercise, raw_ts: flexObj.raw_ts })
        });
        const result = await res.json();
        if (result.success) {
            showToast('Flex restored to Active PRs!');
            fetchDashboardData();
        } else {
            showToast(result.error || 'Failed to unarchive flex.', 'error');
        }
    } catch (err) {
        console.error('Error unarchiving flex:', err);
        showToast('Error unarchiving flex.', 'error');
    }
}

// 4. DELETE & CLEAR ALL FLEX MODAL HANDLERS
let pendingDeleteTarget = null;
let isPendingClearAll = false;

function openDeleteFlexModal(flexObj, isClearAll = false) {
    pendingDeleteTarget = flexObj;
    isPendingClearAll = isClearAll;

    const modal = document.getElementById('deleteFlexModal');
    const titleEl = document.getElementById('deleteModalTitle');
    const descEl = document.getElementById('deleteModalDesc');

    if (!modal) return;

    if (isClearAll) {
        if (titleEl) titleEl.textContent = 'Clear All Flexes?';
        if (descEl) descEl.textContent = 'Are you sure you want to delete ALL logged flexes? This cannot be undone.';
    } else {
        const cleanName = flexObj?.exercise ? flexObj.exercise.replace('(archived)', '').trim() : 'this flex';
        if (titleEl) titleEl.textContent = `Delete "${cleanName}"?`;
        if (descEl) descEl.textContent = `This will permanently remove the record for "${cleanName}" (${flexObj?.stat || ''}).`;
    }

    modal.classList.remove('hidden');
}

function closeDeleteFlexModal() {
    const modal = document.getElementById('deleteFlexModal');
    if (modal) modal.classList.add('hidden');
    pendingDeleteTarget = null;
    isPendingClearAll = false;
}

async function confirmDeleteFlex() {
    if (isPendingClearAll) {
        try {
            const res = await fetch('/api/flex/clear-all', { method: 'DELETE' });
            const result = await res.json();
            if (result.success) {
                closeDeleteFlexModal();
                showToast('All flexes cleared.');
                fetchDashboardData();
            } else {
                showToast(result.error || 'Failed to clear flexes.', 'error');
            }
        } catch (err) {
            console.error('Error clearing flexes:', err);
            showToast('Error clearing flexes.', 'error');
        }
    } else if (pendingDeleteTarget) {
        try {
            const res = await fetch('/api/flex/delete', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    exercise: pendingDeleteTarget.exercise,
                    raw_ts: pendingDeleteTarget.raw_ts
                })
            });
            const result = await res.json();
            if (result.success) {
                closeDeleteFlexModal();
                showToast('Flex deleted.');
                fetchDashboardData();
            } else {
                showToast(result.error || 'Failed to delete flex.', 'error');
            }
        } catch (err) {
            console.error('Error deleting flex:', err);
            showToast('Error deleting flex.', 'error');
        }
    }
}

// -------------------------------------------------------------------------
// PROGRESS GRAPH ANALYTICS
// -------------------------------------------------------------------------

function extractNumber(statStr) {
    if (!statStr) return 0;
    const match = statStr.match(/(\d+\.?\d*)/);
    return match ? parseFloat(match[1]) : 0;
}

function normalizeName(name) {
    if (!name) return '';
    return name.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
}

let flexChartInstance = null;

function openGraphModal() {
    const modal = document.getElementById('graphModal');
    const select = document.getElementById('graphExerciseSelect');
    if (!modal || !select) return;

    const uniqueExercises = [];
    const seen = new Set();

    allRawFlexes.forEach(f => {
        if (!f.exercise) return;
        const clean = f.exercise.replace('(archived)', '').trim();
        const norm = normalizeName(clean);
        if (!seen.has(norm)) {
            seen.add(norm);
            uniqueExercises.push(clean);
        }
    });

    if (uniqueExercises.length === 0) {
        select.innerHTML = '<option value="">No flex data available</option>';
    } else {
        select.innerHTML = uniqueExercises.map(ex => 
            `<option value="${normalizeName(ex)}">${ex}</option>`
        ).join('');
    }

    modal.classList.remove('hidden');
    renderFlexChart();
}

function closeGraphModal() {
    const modal = document.getElementById('graphModal');
    if (modal) modal.classList.add('hidden');
}

function renderFlexChart() {
    const select = document.getElementById('graphExerciseSelect');
    const canvas = document.getElementById('flexChartCanvas');
    const msg = document.getElementById('noGraphDataMsg');

    if (!select || !canvas) return;

    const targetNorm = select.value;
    if (!targetNorm) {
        canvas.classList.add('hidden');
        if (msg) msg.classList.remove('hidden');
        return;
    }

    const history = allRawFlexes.filter(f => {
        const clean = (f.exercise || '').replace('(archived)', '').trim();
        return normalizeName(clean) === targetNorm;
    });

    history.sort((a, b) => new Date(a.raw_ts || 0) - new Date(b.raw_ts || 0));

    if (history.length < 2) {
        canvas.classList.add('hidden');
        if (msg) {
            msg.textContent = 'Log at least 2 entries for this exercise to view history chart.';
            msg.classList.remove('hidden');
        }
        if (flexChartInstance) {
            flexChartInstance.destroy();
            flexChartInstance = null;
        }
        return;
    }

    canvas.classList.remove('hidden');
    if (msg) msg.classList.add('hidden');

    const labels = history.map(f => f.graph_date || f.timestamp || 'N/A');
    const stats = history.map(f => extractNumber(f.stat));
    const exerciseTitle = history[history.length - 1].exercise.replace('(archived)', '').trim();

    const ctx = canvas.getContext('2d');
    if (flexChartInstance) {
        flexChartInstance.destroy();
    }

    const gradient = ctx.createLinearGradient(0, 0, 0, 300);
    gradient.addColorStop(0, 'rgba(139, 92, 246, 0.4)');
    gradient.addColorStop(1, 'rgba(139, 92, 246, 0.0)');

    flexChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: `${exerciseTitle} Result`,
                data: stats,
                borderColor: '#8b5cf6',
                backgroundColor: gradient,
                borderWidth: 3,
                tension: 0.35,
                fill: true,
                pointBackgroundColor: '#ef4444',
                pointBorderColor: '#ffffff',
                pointBorderWidth: 2,
                pointRadius: 5,
                pointHoverRadius: 7
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: { color: '#e5e7eb', font: { weight: 'bold' } }
                },
                tooltip: {
                    backgroundColor: '#111116',
                    borderColor: '#374151',
                    borderWidth: 1,
                    titleColor: '#ffffff',
                    bodyColor: '#a78bfa'
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#9ca3af' }
                },
                y: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#9ca3af' }
                }
            }
        }
    });
}

// -------------------------------------------------------------------------
// DEFAULT & CUSTOM SCHEDULE ROUTINES
// -------------------------------------------------------------------------

function switchDefaultPath(path) {
    activeDefaultPath = path;

    const gymBtn = document.getElementById('gymToggleBtn');
    const caliBtn = document.getElementById('caliToggleBtn');

    if (gymBtn && caliBtn) {
        const activeClass = "px-4 py-1.5 text-xs font-bold rounded-lg transition bg-red-600 text-white shadow";
        const inactiveClass = "px-4 py-1.5 text-xs font-bold rounded-lg transition text-gray-400 hover:text-white";

        gymBtn.className = path === 'Gym' ? activeClass : inactiveClass;
        caliBtn.className = path === 'Calisthenics' ? activeClass : inactiveClass;
    }

    renderDefaultSchedule();
}

function renderDefaultSchedule() {
    const container = document.getElementById('defaultScheduleContainer');
    const subtitle = document.getElementById('defaultPlanSubtitle');
    if (!container || !globalDefaultRoutine) return;

    if (subtitle) {
        subtitle.textContent = `Default routine for ${currentRank} Rank (${activeDefaultPath})`;
    }

    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const pathRoutine = globalDefaultRoutine[activeDefaultPath] || {};

    container.innerHTML = days.map(day => {
        const dayData = pathRoutine[day];
        const isRest = !dayData || dayData === "Rest Day" || (Array.isArray(dayData) && dayData.length === 0);

        let exercisesHTML = '';
        if (isRest) {
            exercisesHTML = getRestDayMarkup();
        } else if (Array.isArray(dayData)) {
            const listItems = dayData.map(([exercise, reps]) => `
                <div class="bg-[#101015] border border-gray-800/80 rounded-xl p-2 mb-1.5 last:mb-0">
                    <div class="font-bold text-xs text-white truncate" title="${exercise}">${exercise}</div>
                    <div class="text-[11px] text-red-400 font-mono font-semibold">${reps}</div>
                </div>
            `).join('');
            exercisesHTML = `<div class="mt-2 flex-1">${listItems}</div>`;
        }

        const exerciseCount = Array.isArray(dayData) ? dayData.length : 0;

        return `
            <div class="p-3.5 rounded-2xl border flex flex-col justify-between min-h-[140px] transition ${
                isRest 
                    ? 'bg-[#0d0d11] border-gray-800/50 text-gray-600' 
                    : 'bg-[#15151b] border-red-500/30 hover:border-red-500/60 text-gray-200 shadow-md'
            }">
                <div>
                    <div class="flex items-center justify-between border-b border-gray-800/60 pb-1.5">
                        <span class="text-xs font-black uppercase tracking-wider ${isRest ? 'text-gray-500' : 'text-red-400'}">${day.slice(0, 3)}</span>
                        <span class="text-[10px] px-1.5 py-0.5 rounded-md font-bold uppercase ${
                            isRest ? 'bg-gray-900 text-gray-600' : 'bg-red-950/80 text-red-300 border border-red-800/50'
                        }">${isRest ? 'Rest' : `${exerciseCount} Exercises`}</span>
                    </div>
                    ${exercisesHTML}
                </div>
            </div>
        `;
    }).join('');
}

// -------------------------------------------------------------------------
// CUSTOM SCHEDULE & EXERCISE ACTIONS
// -------------------------------------------------------------------------

// 1. ADD SCHEDULE MODAL
function openAddScheduleModal() {
    const modal = document.getElementById('addScheduleModal');
    if (modal) {
        modal.classList.remove('hidden');
        document.getElementById('scheduleNameInput')?.focus();
    }
}

function closeAddScheduleModal() {
    const modal = document.getElementById('addScheduleModal');
    if (modal) modal.classList.add('hidden');
    const form = document.getElementById('addScheduleForm');
    if (form) form.reset();
}

async function handleAddSchedule(event) {
    event.preventDefault();
    const name = document.getElementById('scheduleNameInput')?.value?.trim();
    if (!name) return showToast('Please enter a schedule name.', 'error');

    try {
        const res = await fetch('/api/workout/schedule/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });
        const result = await res.json();
        if (result.success) {
            closeAddScheduleModal();
            globalSchedules = result.schedules || [];
            activeScheduleIndex = globalSchedules.length - 1;
            renderScheduleSection();
            showToast(`🛡️ Created new plan: "${name}"!`);
        } else {
            showToast(result.error || 'Failed to create schedule.', 'error');
        }
    } catch (err) {
        console.error('Error adding schedule:', err);
        showToast('Error connecting to server.', 'error');
    }
}

// 2. RENAME SCHEDULE MODAL
function openRenameScheduleModal() {
    if (!globalSchedules[activeScheduleIndex]) return;
    const modal = document.getElementById('renameScheduleModal');
    const nameInput = document.getElementById('renameScheduleNameInput');
    if (!modal || !nameInput) return;

    nameInput.value = globalSchedules[activeScheduleIndex].name || '';
    modal.classList.remove('hidden');
    nameInput.focus();
}

function closeRenameScheduleModal() {
    const modal = document.getElementById('renameScheduleModal');
    if (modal) modal.classList.add('hidden');
    const form = document.getElementById('renameScheduleForm');
    if (form) form.reset();
}

async function handleRenameSchedule(event) {
    event.preventDefault();
    const newName = document.getElementById('renameScheduleNameInput')?.value?.trim();
    if (!newName) return showToast('Schedule name is required.', 'error');

    try {
        const res = await fetch('/api/workout/schedule/rename', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                scheduleIndex: activeScheduleIndex,
                newName
            })
        });
        const result = await res.json();
        if (result.success) {
            closeRenameScheduleModal();
            globalSchedules = result.schedules || [];
            renderScheduleSection();
            showToast('Schedule renamed successfully!');
        } else {
            showToast(result.error || 'Failed to rename schedule.', 'error');
        }
    } catch (err) {
        console.error('Error renaming schedule:', err);
        showToast('Error connecting to server.', 'error');
    }
}

// 3. DELETE SCHEDULE MODAL
let isClearAllSchedulesTarget = false;

function openDeleteScheduleModal() {
    isClearAllSchedulesTarget = false;
    const activeSched = globalSchedules[activeScheduleIndex];
    if (!activeSched) return;

    const modal = document.getElementById('deleteScheduleModal');
    const titleEl = document.getElementById('deleteScheduleTitle');
    const descEl = document.getElementById('deleteScheduleDesc');

    if (!modal) return;
    if (titleEl) titleEl.textContent = `Delete "${activeSched.name}"?`;
    if (descEl) descEl.textContent = `Are you sure you want to delete the schedule plan "${activeSched.name}"? All exercises inside it will be removed.`;

    modal.classList.remove('hidden');
}

function openClearAllSchedulesModal() {
    isClearAllSchedulesTarget = true;
    const modal = document.getElementById('deleteScheduleModal');
    const titleEl = document.getElementById('deleteScheduleTitle');
    const descEl = document.getElementById('deleteScheduleDesc');

    if (!modal) return;
    if (titleEl) titleEl.textContent = 'Clear All Plans?';
    if (descEl) descEl.textContent = 'Are you sure you want to delete ALL custom workout schedules? This cannot be undone.';

    modal.classList.remove('hidden');
}

function closeDeleteScheduleModal() {
    const modal = document.getElementById('deleteScheduleModal');
    if (modal) modal.classList.add('hidden');
    isClearAllSchedulesTarget = false;
}

async function confirmDeleteSchedule() {
    if (isClearAllSchedulesTarget) {
        try {
            const res = await fetch('/api/workout/delete', { method: 'DELETE' });
            const result = await res.json();
            if (result.success) {
                closeDeleteScheduleModal();
                globalSchedules = [];
                activeScheduleIndex = 0;
                renderScheduleSection();
                showToast('All custom schedules cleared.');
            } else {
                showToast(result.error || 'Failed to clear schedules.', 'error');
            }
        } catch (err) {
            console.error('Error clearing schedules:', err);
            showToast('Error clearing schedules.', 'error');
        }
    } else {
        try {
            const res = await fetch('/api/workout/schedule/delete', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ scheduleIndex: activeScheduleIndex })
            });
            const result = await res.json();
            if (result.success) {
                closeDeleteScheduleModal();
                globalSchedules = result.schedules || [];
                if (activeScheduleIndex >= globalSchedules.length) {
                    activeScheduleIndex = Math.max(0, globalSchedules.length - 1);
                }
                renderScheduleSection();
                showToast('Schedule plan deleted.');
            } else {
                showToast(result.error || 'Failed to delete schedule.', 'error');
            }
        } catch (err) {
            console.error('Error deleting schedule:', err);
            showToast('Error deleting schedule.', 'error');
        }
    }
}

// 4. ADD EXERCISE MODAL
function openAddExerciseModal(targetDay = 'Monday') {
    if (!globalSchedules || globalSchedules.length === 0) {
        return openAddScheduleModal();
    }
    const modal = document.getElementById('addExerciseModal');
    const daySelect = document.getElementById('addExerciseDaySelect');
    if (!modal || !daySelect) return;

    daySelect.value = targetDay;
    modal.classList.remove('hidden');
    document.getElementById('addExerciseNameInput')?.focus();
}

function closeAddExerciseModal() {
    const modal = document.getElementById('addExerciseModal');
    if (modal) modal.classList.add('hidden');
    const form = document.getElementById('addExerciseForm');
    if (form) form.reset();
}

async function handleAddExercise(event) {
    event.preventDefault();
    const day = document.getElementById('addExerciseDaySelect')?.value;
    const exercise = document.getElementById('addExerciseNameInput')?.value?.trim();
    const reps = document.getElementById('addExerciseRepsInput')?.value?.trim();

    if (!day || !exercise || !reps) {
        return showToast('Day, exercise name, and sets/reps are required.', 'error');
    }

    try {
        const res = await fetch('/api/workout/exercise/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                scheduleIndex: activeScheduleIndex,
                day,
                exercise,
                reps
            })
        });
        const result = await res.json();
        if (result.success) {
            closeAddExerciseModal();
            globalSchedules = result.schedules || [];
            renderScheduleSection();
            showToast(`Added ${exercise} to ${day}!`);
        } else {
            showToast(result.error || 'Failed to add exercise.', 'error');
        }
    } catch (err) {
        console.error('Error adding exercise:', err);
        showToast('Error connecting to server.', 'error');
    }
}

// 5. EDIT EXERCISE MODAL
function openEditExerciseModal(schedIdx, day, exIdx) {
    const sched = globalSchedules[schedIdx];
    if (!sched || !sched.days || !sched.days[day] || !sched.days[day][exIdx]) return;

    const modal = document.getElementById('editExerciseModal');
    const dayHidden = document.getElementById('editExerciseDay');
    const indexHidden = document.getElementById('editExerciseIndex');
    const nameInput = document.getElementById('editExerciseNameInput');
    const repsInput = document.getElementById('editExerciseRepsInput');

    if (!modal) return;

    const currentEx = sched.days[day][exIdx];
    const cleanName = (currentEx.exercise || '').replace('🧩', '').trim();

    if (dayHidden) dayHidden.value = day;
    if (indexHidden) indexHidden.value = exIdx;
    if (nameInput) nameInput.value = cleanName;
    if (repsInput) repsInput.value = currentEx.reps || '';

    modal.classList.remove('hidden');
    nameInput?.focus();
}

function closeEditExerciseModal() {
    const modal = document.getElementById('editExerciseModal');
    if (modal) modal.classList.add('hidden');
    const form = document.getElementById('editExerciseForm');
    if (form) form.reset();
}

async function handleEditExercise(event) {
    event.preventDefault();
    const day = document.getElementById('editExerciseDay')?.value;
    const exerciseIndex = parseInt(document.getElementById('editExerciseIndex')?.value);
    const newExercise = document.getElementById('editExerciseNameInput')?.value?.trim();
    const newReps = document.getElementById('editExerciseRepsInput')?.value?.trim();

    if (!day || isNaN(exerciseIndex) || !newExercise || !newReps) {
        return showToast('Exercise name and sets/reps are required.', 'error');
    }

    try {
        const res = await fetch('/api/workout/exercise/edit', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                scheduleIndex: activeScheduleIndex,
                day,
                exerciseIndex,
                newExercise,
                newReps
            })
        });
        const result = await res.json();
        if (result.success) {
            closeEditExerciseModal();
            globalSchedules = result.schedules || [];
            renderScheduleSection();
            showToast('Exercise updated!');
        } else {
            showToast(result.error || 'Failed to update exercise.', 'error');
        }
    } catch (err) {
        console.error('Error editing exercise:', err);
        showToast('Error connecting to server.', 'error');
    }
}

// 6. DELETE EXERCISE FROM DAY
async function deleteExercise(schedIdx, day, exIdx) {
    try {
        const res = await fetch('/api/workout/exercise/delete', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                scheduleIndex: schedIdx,
                day,
                exerciseIndex: exIdx
            })
        });
        const result = await res.json();
        if (result.success) {
            globalSchedules = result.schedules || [];
            renderScheduleSection();
            showToast('Exercise removed.');
        } else {
            showToast(result.error || 'Failed to delete exercise.', 'error');
        }
    } catch (err) {
        console.error('Error deleting exercise:', err);
        showToast('Error deleting exercise.', 'error');
    }
}

function renderScheduleSection() {
    const planNameEl = document.getElementById('planName');
    const tabsContainer = document.getElementById('scheduleTabsContainer');
    const scheduleContainer = document.getElementById('scheduleContainer');
    const renameBtn = document.getElementById('renameScheduleBtn');
    const deleteSchedBtn = document.getElementById('deleteScheduleBtn');
    const clearAllBtn = document.getElementById('deleteWorkoutBtn');

    if (!scheduleContainer || !tabsContainer) return;

    tabsContainer.innerHTML = '';
    scheduleContainer.innerHTML = '';

    if (!globalSchedules || globalSchedules.length === 0) {
        if (planNameEl) planNameEl.textContent = 'No custom workout splits saved yet. Click "New Schedule" to create your first plan!';
        if (renameBtn) renameBtn.classList.add('hidden');
        if (deleteSchedBtn) deleteSchedBtn.classList.add('hidden');
        if (clearAllBtn) clearAllBtn.classList.add('hidden');

        scheduleContainer.innerHTML = `
            <div class="col-span-full text-center py-12 text-gray-500 border border-dashed border-gray-800 rounded-3xl bg-[#0d0d10]">
                <i class="fa-solid fa-dumbbell text-3xl mb-3 text-purple-500/50"></i>
                <p class="font-bold text-gray-400 text-sm">No custom schedules created yet.</p>
                <p class="text-xs text-gray-600 mt-1">Create your split here or use <code class="text-purple-400 font-mono">/myworkout</code> on Discord.</p>
                <button onclick="openAddScheduleModal()" class="mt-4 px-4 py-2 text-xs font-bold rounded-xl text-white bg-purple-600 hover:bg-purple-500 transition shadow">
                    + Forge First Schedule
                </button>
            </div>
        `;
        return;
    }

    if (renameBtn) renameBtn.classList.remove('hidden');
    if (deleteSchedBtn) deleteSchedBtn.classList.remove('hidden');
    if (clearAllBtn) clearAllBtn.classList.remove('hidden');

    if (activeScheduleIndex >= globalSchedules.length) {
        activeScheduleIndex = 0;
    }

    // Render Schedule Selector Tabs
    globalSchedules.forEach((sched, idx) => {
        const isActive = idx === activeScheduleIndex;
        const tabBtn = document.createElement('button');
        tabBtn.className = `px-4 py-2 text-xs font-bold rounded-xl transition flex items-center gap-2 whitespace-nowrap border ${
            isActive 
                ? 'bg-purple-600 text-white border-purple-500 shadow-lg shadow-purple-900/30' 
                : 'bg-[#15151b] text-gray-400 border-gray-800 hover:text-white hover:border-gray-700'
        }`;

        tabBtn.innerHTML = `
            <i class="fa-solid fa-list-check text-xs"></i>
            <span>${sched.name || `Plan ${idx + 1}`}</span>
        `;

        tabBtn.onclick = () => {
            activeScheduleIndex = idx;
            renderScheduleSection();
        };

        tabsContainer.appendChild(tabBtn);
    });

    // Add "+ Add Plan" tab button at the end
    const addTabBtn = document.createElement('button');
    addTabBtn.className = 'px-3 py-2 text-xs font-bold rounded-xl text-purple-400 bg-purple-950/30 border border-purple-800/40 hover:bg-purple-900/40 transition flex items-center gap-1 whitespace-nowrap';
    addTabBtn.innerHTML = '<i class="fa-solid fa-plus text-xs"></i> <span>Add Plan</span>';
    addTabBtn.onclick = () => openAddScheduleModal();
    tabsContainer.appendChild(addTabBtn);

    const activeSchedule = globalSchedules[activeScheduleIndex];
    if (planNameEl && activeSchedule) {
        planNameEl.textContent = `Viewing Plan (${activeScheduleIndex + 1} of ${globalSchedules.length}): ${activeSchedule.name || 'Unnamed Plan'}`;
    }

    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

    scheduleContainer.innerHTML = days.map(day => {
        const dayExercises = activeSchedule?.days ? (activeSchedule.days[day] || []) : [];
        const isRest = dayExercises.length === 0;

        let exercisesHTML = '';
        if (isRest) {
            exercisesHTML = `
                <div class="flex-1 flex flex-col items-center justify-center py-4 text-gray-600 text-xs font-bold uppercase tracking-wider gap-1.5">
                    <i class="fa-solid fa-bed text-sm"></i>
                    <span>Rest Day</span>
                    <button onclick="openAddExerciseModal('${day}')" class="mt-1 text-[11px] font-bold text-purple-400 hover:text-purple-300 px-2 py-1 rounded-lg bg-purple-950/40 border border-purple-800/40 transition">
                        + Add Exercise
                    </button>
                </div>
            `;
        } else {
            const listItems = dayExercises.map((ex, exIdx) => {
                const cleanEx = (ex.exercise || '').replace('🧩', '').trim();
                return `
                    <div class="bg-[#101015] border border-gray-800/80 rounded-xl p-2.5 mb-1.5 last:mb-0 group relative flex items-center justify-between">
                        <div class="truncate pr-2">
                            <div class="font-bold text-xs text-white truncate" title="${cleanEx}">${cleanEx}</div>
                            <div class="text-[11px] text-purple-400 font-mono font-semibold mt-0.5">${ex.reps || ''}</div>
                        </div>

                        <!-- Action Buttons on hover/focus -->
                        <div class="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition">
                            <button onclick="openEditExerciseModal(${activeScheduleIndex}, '${day}', ${exIdx})" class="text-[10px] text-gray-400 hover:text-white p-1 rounded bg-gray-800 hover:bg-gray-700 transition" title="Edit Exercise">
                                <i class="fa-solid fa-pen"></i>
                            </button>
                            <button onclick="deleteExercise(${activeScheduleIndex}, '${day}', ${exIdx})" class="text-[10px] text-red-400 hover:text-red-300 p-1 rounded bg-red-950/40 hover:bg-red-900/60 border border-red-800/40 transition" title="Delete Exercise">
                                <i class="fa-solid fa-trash"></i>
                            </button>
                        </div>
                    </div>
                `;
            }).join('');

            exercisesHTML = `<div class="mt-2 flex-1">${listItems}</div>`;
        }

        return `
            <div class="p-3.5 rounded-2xl border flex flex-col justify-between min-h-[150px] transition ${
                isRest 
                    ? 'bg-[#0d0d11] border-gray-800/50 text-gray-600' 
                    : 'bg-[#15151b] border-purple-500/30 hover:border-purple-500/60 text-gray-200 shadow-md'
            }">
                <div>
                    <div class="flex items-center justify-between border-b border-gray-800/60 pb-2">
                        <div class="flex items-center gap-1.5">
                            <span class="text-xs font-black uppercase tracking-wider ${isRest ? 'text-gray-500' : 'text-purple-300'}">${day.slice(0, 3)}</span>
                            <span class="text-[10px] px-1.5 py-0.5 rounded-md font-bold uppercase ${
                                isRest ? 'bg-gray-900 text-gray-600' : 'bg-purple-950/80 text-purple-300 border border-purple-800/50'
                            }">${isRest ? 'Rest' : `${dayExercises.length}`}</span>
                        </div>
                        <button onclick="openAddExerciseModal('${day}')" class="text-[11px] text-purple-400 hover:text-white p-1 rounded-lg hover:bg-purple-900/50 transition" title="Add exercise to ${day}">
                            <i class="fa-solid fa-plus"></i>
                        </button>
                    </div>
                    ${exercisesHTML}
                </div>
            </div>
        `;
    }).join('');
}

function renderDietTable(diet) {
    const tableBody = document.getElementById('dietTableBody');
    if (!tableBody) return;

    if (!diet || diet.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="4" class="py-4 text-center text-gray-500">No diet items available.</td></tr>';
        return;
    }

    tableBody.innerHTML = diet.map(item => `
        <tr class="hover:bg-cardHover transition">
            <td class="py-3.5 px-4 font-semibold text-white">${item.name}</td>
            <td class="py-3.5 px-4">
                <span class="px-2.5 py-1 rounded-full text-xs font-bold ${
                    item.category === 'Veg' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-red-950 text-red-400 border border-red-800'
                }">${item.category}</span>
            </td>
            <td class="py-3.5 px-4 font-bold text-emerald-400">${item.protein}g</td>
            <td class="py-3.5 px-4 text-gray-400">${item.calories} kcal</td>
        </tr>
    `).join('');
}

// Helper utility for rest day markup
function getRestDayMarkup() {
    return `
        <div class="flex-1 flex flex-col items-center justify-center py-4 text-gray-600 text-xs font-bold uppercase tracking-wider gap-1">
            <i class="fa-solid fa-bed text-sm"></i>
            <span>Rest</span>
        </div>
    `;
}