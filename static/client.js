var globalProjectId;
var globalTaskId;

let firstLoad = true;
let showCompletedTasks = false;
let showCompletedProjects = false;

const today = new Date();
const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone;

// Task colours: the original seven plus a violet, so eight tasks never collide
const taskPalette = [
    '#41a5f1', '#fd6d5d', '#67ce6a', '#d379bd', '#fff955', '#9d7cf0', '#2d3b5f', '#7f2828'
];
let taskColors = {};

const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

function getDaySuffix(day) {
    if (day >= 11 && day <= 13) return "th";
    switch (day % 10) {
        case 1: return "st";
        case 2: return "nd";
        case 3: return "rd";
        default: return "th";
    }
}

function s(time) {
    return (time == 1) ? '' : 's';
}

function pad(n) {
    return String(n).padStart(2, '0');
}

// Colour a task keeps for good: its position in the project's task list, then the
// palette cycles. Tasks that have since been completed or hidden fall back to a hash.
function colorForTask(taskId) {
    if (taskColors[taskId]) return taskColors[taskId];
    return taskPalette[Math.abs(parseInt(taskId, 10) || 0) % taskPalette.length];
}

// Dark or light ink, whichever actually reads on that fill
function inkOn(hex) {
    const channel = v => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    const r = channel(parseInt(hex.slice(1, 3), 16));
    const g = channel(parseInt(hex.slice(3, 5), 16));
    const b = channel(parseInt(hex.slice(5, 7), 16));
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) > 0.179 ? '#17140f' : '#fae6d7';
}

function escapeHtml(text) {
    return String(text === null || text === undefined ? '' : text)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Clear local storage on first load
window.onload = function() {
    const keep = localStorage.getItem("month_year_cache");
    localStorage.clear();
    if (keep !== null) {
        localStorage.setItem("month_year_cache", keep);
    }
};

// GET from /projects endpoint and populate list
function populateProjects() {
    const ulElement = document.getElementById('project-list-ul');
    const projectNameLabel = document.getElementById('project-name');

    function displayProjectData(data) {
        ulElement.innerHTML = "";
        let first = true;
        data.forEach(project => {
            if (project.is_visible !== false) {
                if (first === true && globalProjectId === undefined) {
                    globalProjectId = project.id;
                    populateTasks(globalProjectId);
                    getTime(globalProjectId);
                    first = false;
                }
                const newListItem = document.createElement('li');
                newListItem.classList.add('task-or-project-li');
                const newLink = document.createElement('p');
                newLink.className = 'task-or-project';

                newLink.textContent = project.name;
                newLink.setAttribute('data-projectId', project.id);
                newListItem.appendChild(newLink);
                newLink.style.opacity = '0.5';

                if (project.id === globalProjectId) {
                    newLink.style.opacity = '1';
                    newLink.style.fontWeight = 'bold';
                    projectNameLabel.textContent = project.name;
                    projectNameLabel.style.opacity = "1";
                } else {
                    newListItem.setAttribute('data-completed', false);
                }

                addProjectClickListener(newLink, project.id, project.name);
                addHoverListener(newLink, 'project', project.id);
                ulElement.appendChild(newListItem);
                newListItem.style.height = '0px';

                if (project.is_completed) {
                    newLink.style.textDecoration = 'line-through';
                    newListItem.setAttribute('data-completed', true);
                    newListItem.style.overflow = 'hidden';
                    newListItem.style.margin = 'auto';
                } else {
                    newLink.style.width = '170px';
                    newListItem.style.height = 'auto';
                }
            }
        });
    }

    let cachedProjects = localStorage.getItem(`projects_cache_${globalUserId}`);
    if (cachedProjects) {
        console.log('projects read from client-side cache');
        displayProjectData(JSON.parse(cachedProjects));
    } else {
        fetch(`/projects`)
        .then(response => response.json())
        .then(data => {
            displayProjectData(data);
            localStorage.setItem(`projects_cache_${globalUserId}`, JSON.stringify(data));
        });
    }
}

// GET from /tasks endpoint, populate list, assign colours, fill the timer dropdown
let currentTasks = [];

function populateTasks(projectId) {

    function displayTaskData(data) {
        const taskUlElement = document.getElementById('task-list-ul');
        taskUlElement.innerHTML = '';
        taskColors = {};
        currentTasks = data.filter(task => task.is_visible !== false);

        currentTasks.forEach((task, index) => {
            taskColors[task.id] = taskPalette[index % taskPalette.length];

            const newTaskListItem = document.createElement('li');
            newTaskListItem.classList.add('task-or-project-li');

            const newTaskLink = document.createElement('p');
            newTaskLink.className = 'task-or-project';
            newTaskLink.innerHTML =
                `<span class="task-swatch" style="background-color:${taskColors[task.id]}"></span>` +
                `<span>${escapeHtml(task.name)}</span>`;
            newTaskLink.dataset.totalSeconds = task.total_seconds;
            newTaskLink.dataset.isCompleted = task.is_completed;
            newTaskLink.setAttribute('data-taskId', task.id);

            newTaskListItem.appendChild(newTaskLink);
            taskUlElement.appendChild(newTaskListItem);
            addHoverListener(newTaskLink, 'task', task.id);

            if (task.is_completed === true) {
                newTaskLink.style.textDecoration = 'line-through';
                newTaskListItem.setAttribute('data-completed', true);
                newTaskListItem.style.overflow = 'hidden';
                newTaskListItem.style.margin = 'auto';
            } else {
                newTaskListItem.style.height = 'auto';
                newTaskListItem.setAttribute('data-completed', false);
            }
        });

        if (currentTasks.length && (globalTaskId === undefined || !taskColors[globalTaskId])) {
            globalTaskId = currentTasks[0].id;
        }
        renderTimerTasks();
        renderTimes();
    }

    let cachedTasks = localStorage.getItem(`tasks_cache_${projectId}`);
    if (cachedTasks) {
        console.log('tasks read from client-side cache');
        displayTaskData(JSON.parse(cachedTasks));
    } else {
        fetch(`/tasks?project_id=${projectId}`)
        .then(response => response.json())
        .then(data => {
            displayTaskData(data);
            localStorage.setItem(`tasks_cache_${projectId}`, JSON.stringify(data));
        });
    }
}

function setMonthYear() {
    const monthSelect = document.getElementById('month-select');
    const yearSelect = document.getElementById('year-select');
    localStorage.setItem('month_year_cache', JSON.stringify({
        selectedMonth: parseInt(monthSelect.value, 10),
        selectedYear: parseInt(yearSelect.value, 10)
    }));
}

function getMonthYear() {
    const cached = localStorage.getItem('month_year_cache');
    if (cached) return JSON.parse(cached);
    return { selectedMonth: today.getMonth(), selectedYear: today.getFullYear() };
}

/* ============================================================
   Time entries
   ============================================================ */

// entries are held locally as { id, taskId, taskName, start, end, description }
// with start/end as local 'YYYY-MM-DDTHH:MM' strings, ready for datetime-local
let timeEntries = [];
let openEntryId = null;   // id of the entry whose editor is open
let draft = null;         // uncommitted edits; nothing is written until the check is clicked

const entriesContainer = document.getElementById('entries');
const addTimeBlockButton = document.getElementById('add-a-time-block');

// Convert a UTC date string to a local string for the datetime-local input
function convertUTCToLocalForInput(utcDateString) {
    const utcDate = new Date(utcDateString + 'Z');
    const localDate = new Date(utcDate.getTime() - (utcDate.getTimezoneOffset() * 60000));
    return localDate.toISOString().slice(0, 16);
}

function durationSeconds(entry) {
    return Math.max(0, (new Date(entry.end) - new Date(entry.start)) / 1000);
}

function hoursOf(seconds) {
    return (seconds / 60 / 60).toFixed(2);
}

function formatClockTime(localString) {
    const date = new Date(localString);
    let hours = date.getHours();
    const ampm = hours >= 12 ? 'pm' : 'am';
    hours = hours % 12 || 12;
    return `${hours}:${pad(date.getMinutes())}${ampm}`;
}

function taskNameFor(taskId, fallback) {
    const task = currentTasks.find(t => t.id == taskId);
    return task ? task.name : (fallback || 'Unassigned');
}

function startOfWeek(date) {
    const start = new Date(date.getFullYear(), date.getMonth(), date.getDate() - date.getDay());
    start.setHours(0, 0, 0, 0);
    return start;
}

function sameDay(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// GET to /time endpoint
function getTime(projectId) {
    function displayTimeData(data) {
        timeEntries = data.map(time => ({
            id: time.id,
            taskId: time.task_id,
            taskName: time.task_name,
            start: convertUTCToLocalForInput(time.start),
            end: convertUTCToLocalForInput(time.end),
            // the API sends the placeholder string when description is null
            description: (time.description === 'Add a description...') ? '' : (time.description || '')
        }));
        renderTimes();
    }

    let cachedTime = localStorage.getItem(`time_cache_${projectId}`);
    if (cachedTime) {
        console.log('time read from client-side cache');
        displayTimeData(JSON.parse(cachedTime));
    } else {
        const { selectedMonth, selectedYear } = getMonthYear();
        fetch(`/time?project_id=${projectId}&tz_name=${localTz}&month=${selectedMonth}&year=${selectedYear}`, { credentials: "include" })
        .then(response => {
            if (!response.ok) throw new Error('Network response was not ok');
            return response.json();
        })
        .then(data => {
            try {
                localStorage.setItem(`time_cache_${projectId}`, JSON.stringify(data));
            } catch (e) {
                console.error('Error saving data to LocalStorage:', e);
            }
            displayTimeData(data);
        })
        .catch(error => console.error('There has been a problem with your fetch operation:', error));
    }
}

// The open entry previews its draft; everything else shows what is stored
function viewOf(entry) {
    return (draft && draft.id === entry.id) ? Object.assign({}, entry, draft) : entry;
}

function findEntry(id) {
    return timeEntries.find(e => e.id === id);
}

function isDirty() {
    if (!draft) return false;
    const entry = findEntry(draft.id);
    if (!entry) return false;
    if (entry.isNew) return true;
    return draft.taskId != entry.taskId
        || draft.description !== entry.description
        || draft.start !== entry.start
        || draft.end !== entry.end;
}

function sortedEntries() {
    return timeEntries.slice().sort((a, b) => new Date(viewOf(b).start) - new Date(viewOf(a).start));
}

function renderTimes() {
    renderTimeStats();
    entriesContainer.innerHTML = '';
    entriesContainer.classList.toggle('has-open', openEntryId !== null);

    const entries = sortedEntries();
    if (!entries.length) {
        entriesContainer.innerHTML = '<p class="empty-state">No time logged this month. Add an entry, or start the timer above.</p>';
        return;
    }

    const groups = [];
    entries.forEach(entry => {
        const key = viewOf(entry).start.slice(0, 10);
        let group = groups.find(g => g.key === key);
        if (!group) {
            group = { key: key, items: [] };
            groups.push(group);
        }
        group.items.push(entry);
    });
    groups.sort((a, b) => b.key.localeCompare(a.key));

    groups.forEach(group => {
        const date = new Date(group.key + 'T00:00');
        const total = group.items.reduce((sum, e) => sum + durationSeconds(viewOf(e)), 0);

        const groupDiv = document.createElement('div');
        groupDiv.className = 'date-group';

        const head = document.createElement('div');
        head.className = 'date-head';
        head.innerHTML =
            `<h3>${dayNames[date.getDay()]}, ${monthNames[date.getMonth()]} ${date.getDate()}${getDaySuffix(date.getDate())}</h3>` +
            (sameDay(date, new Date()) ? '<span class="today-pill">today</span>' : '') +
            `<span class="day-total">${hoursOf(total)} h</span>`;
        groupDiv.appendChild(head);

        group.items.forEach(entry => groupDiv.appendChild(buildEntryCard(entry)));
        entriesContainer.appendChild(groupDiv);
    });

    const openShell = document.querySelector('.entry-wrap.open .editor-shell');
    if (openShell && openShell.firstElementChild) {
        openShell.style.height = openShell.firstElementChild.offsetHeight + 'px';
    }
}

function renderTimeStats() {
    const now = new Date();
    const weekStart = startOfWeek(now);
    const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);

    let month = 0, week = 0, todayTotal = 0;
    timeEntries.forEach(entry => {
        const view = viewOf(entry);
        const seconds = durationSeconds(view);
        const start = new Date(view.start);
        month += seconds;
        if (start >= weekStart && start < weekEnd) week += seconds;
        if (sameDay(start, now)) todayTotal += seconds;
    });

    document.getElementById('stat-month').textContent = hoursOf(month);
    document.getElementById('stat-week').textContent = hoursOf(week);
    document.getElementById('stat-today').textContent = hoursOf(todayTotal);
}

function cardInner(view) {
    return `
        <div class="body">
            <div class="task">${escapeHtml(taskNameFor(view.taskId, view.taskName))}</div>
            <div class="desc${view.description ? '' : ' empty'}">${escapeHtml(view.description || 'No description')}</div>
        </div>
        <div class="range">${formatClockTime(view.start)} &ndash; ${formatClockTime(view.end)}</div>
        <div class="dur">${hoursOf(durationSeconds(view))} h</div>`;
}

function taskOptions(selectedId) {
    return currentTasks
        .map(task => `<option value="${task.id}"${task.id == selectedId ? ' selected' : ''}>${escapeHtml(task.name)}</option>`)
        .join('');
}

function buildEntryCard(entry) {
    const view = viewOf(entry);
    const accent = colorForTask(view.taskId);
    const isOpen = openEntryId === entry.id;

    const wrap = document.createElement('div');
    wrap.className = 'entry-wrap' + (isOpen ? ' open' : '') + (entry.isNew ? ' pending' : '');
    wrap.dataset.id = entry.id;
    wrap.style.setProperty('--accent', accent);
    wrap.style.setProperty('--on-accent', inkOn(accent));

    const card = document.createElement('div');
    card.className = 'entry';
    card.innerHTML = cardInner(view);
    card.addEventListener('click', () => isOpen ? closeCard() : openCard(entry.id));
    wrap.appendChild(card);

    const shell = document.createElement('div');
    shell.className = 'editor-shell';
    if (isOpen) shell.appendChild(buildEditor(entry));
    wrap.appendChild(shell);

    return wrap;
}

function buildEditor(entry) {
    const editor = document.createElement('div');
    editor.className = 'editor';
    editor.innerHTML = `
        <input id="time-description-text" class="desc-input" autocomplete="off" placeholder="What did you work on?" value="${escapeHtml(draft.description)}">
        <div class="fields">
            <div>
                <label>Task</label>
                <select id="task-select">${taskOptions(draft.taskId)}</select>
            </div>
            <div>
                <label>Start</label>
                <input class="datetime-input" type="datetime-local" id="start-time-input" value="${draft.start}">
            </div>
            <div>
                <label>End</label>
                <input class="datetime-input" type="datetime-local" id="end-time-input" value="${draft.end}">
            </div>
            <span class="live-duration" id="duration"></span>
            <span class="spacer"></span>
            <button class="icon-button" id="delete-time-block-button" title="Delete Time Block"><i class="fa-solid fa-trash"></i></button>
            <button class="icon-button" id="commit-time-block-button" title="Commit Changes"><i class="fa-solid fa-check"></i></button>
        </div>`;
    editor.addEventListener('click', event => event.stopPropagation());

    const descInput = editor.querySelector('#time-description-text');
    const taskSelect = editor.querySelector('#task-select');
    const startTimeInput = editor.querySelector('#start-time-input');
    const endTimeInput = editor.querySelector('#end-time-input');
    const commitButton = editor.querySelector('#commit-time-block-button');

    function touched(field) {
        const stored = findEntry(entry.id);
        return stored && !stored.isNew && draft[field] != stored[field];
    }

    // The card is the live preview of the draft; nothing is saved until commit
    function refresh() {
        const wrap = editor.closest('.entry-wrap');
        const accent = colorForTask(draft.taskId);
        wrap.style.setProperty('--accent', accent);
        wrap.style.setProperty('--on-accent', inkOn(accent));
        wrap.querySelector('.entry').innerHTML = cardInner(Object.assign({}, findEntry(entry.id), draft));

        descInput.classList.toggle('changed', touched('description'));
        taskSelect.classList.toggle('changed', touched('taskId'));
        startTimeInput.classList.toggle('changed', touched('start'));
        endTimeInput.classList.toggle('changed', touched('end'));

        const seconds = durationSeconds(draft);
        const hours = hoursOf(seconds);
        editor.querySelector('#duration').textContent =
            seconds > 0 ? `${hours} hour${s(hours)}` : 'End is before start';
        commitButton.classList.toggle('visible', isDirty() && seconds > 0);

        renderTimeStats();
    }

    descInput.addEventListener('input', () => { draft.description = descInput.value; refresh(); });
    descInput.addEventListener('keydown', event => {
        if (event.key === 'Enter') {
            event.preventDefault();
            commitTimeBlock();
        }
    });
    taskSelect.addEventListener('change', () => { draft.taskId = parseInt(taskSelect.value, 10); refresh(); });
    startTimeInput.addEventListener('change', () => { draft.start = startTimeInput.value; refresh(); });
    endTimeInput.addEventListener('change', () => { draft.end = endTimeInput.value; refresh(); });
    commitButton.addEventListener('click', commitTimeBlock);
    editor.querySelector('#delete-time-block-button').addEventListener('click', () => deleteTimeBlock(entry.id));

    setTimeout(refresh, 0);
    return editor;
}

function openCard(id) {
    if (openEntryId !== null && !closeCard()) return;
    const entry = findEntry(id);
    if (!entry) return;

    draft = {
        id: id,
        taskId: entry.taskId,
        description: entry.description,
        start: entry.start,
        end: entry.end
    };
    openEntryId = id;
    renderTimes();

    const wrap = document.querySelector('.entry-wrap.open');
    const shell = wrap && wrap.querySelector('.editor-shell');
    if (shell) {
        const editor = shell.firstElementChild;
        shell.style.height = '0px';
        requestAnimationFrame(() => { shell.style.height = editor.offsetHeight + 'px'; });
        setTimeout(() => wrap.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 260);
    }
}

// Returns false and nudges the check when there is something unsaved
function closeCard() {
    if (openEntryId === null) return true;
    if (isDirty()) {
        const button = document.querySelector('.entry-wrap.open #commit-time-block-button');
        if (button) {
            button.classList.remove('nudge');
            void button.offsetWidth;
            button.classList.add('nudge');
        }
        return false;
    }
    collapseOpenCard();
    return true;
}

function collapseOpenCard(then) {
    const wrap = document.querySelector('.entry-wrap.open');
    openEntryId = null;
    draft = null;
    if (!wrap) {
        renderTimes();
        if (then) then();
        return;
    }
    const shell = wrap.querySelector('.editor-shell');
    shell.style.height = shell.firstElementChild.offsetHeight + 'px';
    requestAnimationFrame(() => {
        wrap.classList.remove('open');
        wrap.querySelector('.entry').style.borderRadius = '7px';
        shell.style.height = '0px';
        entriesContainer.classList.remove('has-open');
    });
    setTimeout(() => {
        renderTimes();
        if (then) then();
    }, 240);
}

function discardDraft() {
    if (openEntryId === null) return;
    const entry = findEntry(openEntryId);
    if (entry && entry.isNew) {
        const id = entry.id;
        collapseOpenCard(() => {
            const index = timeEntries.findIndex(e => e.id === id);
            if (index > -1) timeEntries.splice(index, 1);
            renderTimes();
        });
        return;
    }
    collapseOpenCard();
}

// Create a new, uncommitted entry
function createTimeBlock(start, end) {
    if (openEntryId !== null && !closeCard()) return;
    if (!currentTasks.length) return;

    const now = new Date();
    const endTime = end || now;
    const startTime = start || new Date(endTime.getTime() - 60 * 60 * 1000);

    const entry = {
        id: `new-${Date.now()}`,
        taskId: globalTaskId || currentTasks[0].id,
        taskName: taskNameFor(globalTaskId),
        start: convertUTCToLocalForInput(startTime.toISOString().slice(0, 16)),
        end: convertUTCToLocalForInput(endTime.toISOString().slice(0, 16)),
        description: '',
        isNew: true
    };
    timeEntries.push(entry);
    openCard(entry.id);

    const input = document.querySelector('.entry-wrap.open .desc-input');
    if (input) input.focus();
}
addTimeBlockButton.addEventListener('click', () => createTimeBlock());

// Commit time block edit
function commitTimeBlock() {
    if (!draft) return;
    const entry = findEntry(draft.id);
    if (!entry) return;

    const startTime = new Date(draft.start);
    const endTime = new Date(draft.end);
    const duration = Math.round((endTime - startTime) / 1000);
    if (!(duration > 0)) return;

    const previousTaskId = entry.taskId;
    const wasNew = !!entry.isNew;

    entry.taskId = draft.taskId;
    entry.description = draft.description;
    entry.start = draft.start;
    entry.end = draft.end;
    delete entry.isNew;
    globalTaskId = entry.taskId;
    renderTimerTasks();

    const payload = {
        projectId: globalProjectId,
        taskId: entry.taskId,
        timeId: wasNew ? '-1' : entry.id,
        start: startTime,
        end: endTime,
        duration: duration,
        description: entry.description
    };

    fetch('/time', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    })
    .then(response => response.json())
    .then(data => {
        if (data.time_id) entry.id = data.time_id;
        localStorage.removeItem(`time_cache_${globalProjectId}`);
        localStorage.removeItem('days_cache');
        calculateTaskTotalTime(entry.taskId, true);
        if (previousTaskId !== entry.taskId) calculateTaskTotalTime(previousTaskId, true);
        setTimeout(populateDays, 500);
    })
    .catch(error => console.error('There has been a problem with your fetch operation:', error));

    collapseOpenCard();
}

// Delete time block
function deleteTimeBlock(id) {
    const entry = findEntry(id);
    if (!entry) return;
    const taskId = entry.taskId;
    const wasNew = !!entry.isNew;

    collapseOpenCard(() => {
        const index = timeEntries.findIndex(e => e.id === id);
        if (index > -1) timeEntries.splice(index, 1);
        renderTimes();

        if (wasNew) return;

        fetch('/time', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                timeId: id,
                taskId: taskId,
                projectId: globalProjectId,
                isVisible: false
            })
        })
        .then(response => response.json())
        .then(() => {
            localStorage.removeItem(`time_cache_${globalProjectId}`);
            localStorage.removeItem('days_cache');
            calculateTaskTotalTime(taskId, true);
            setTimeout(populateDays, 500);
        });
    });
}

// Escape discards, clicking away keeps unsaved work on screen
document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && openEntryId !== null) discardDraft();
});
document.addEventListener('click', event => {
    if (openEntryId === null) return;
    if (event.target.closest('.entry-wrap') || event.target.closest('#add-a-time-block')) return;
    if (event.target.closest('#timer')) return;
    closeCard();
});

// Calculate task total time from the entries on screen
function calculateTaskTotalTime(taskId, changed) {
    if (!taskId) return;
    let totalSeconds = 0;
    timeEntries.forEach(entry => {
        if (entry.taskId == taskId) totalSeconds += durationSeconds(entry);
    });

    const taskItem = document.querySelector(`[data-taskid="${taskId}"]`);
    if (taskItem) taskItem.dataset.totalSeconds = totalSeconds;

    if (changed) {
        fetch('/tasks', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ taskId: taskId, totalSeconds: Math.round(totalSeconds) })
        });
        localStorage.removeItem(`tasks_cache_${globalProjectId}`);
    }
}

/* ============================================================
   Timer
   ============================================================ */

let timerStartDateTime = null;
let timerIntervalId = null;

function renderTimerTasks() {
    const select = document.getElementById('timer-task');
    select.innerHTML = taskOptions(globalTaskId);
}

document.getElementById('timer-task').addEventListener('change', function() {
    globalTaskId = parseInt(this.value, 10);
});

function toggleClock() {
    const timer = document.getElementById('timer');
    const toggleIcon = document.getElementById('toggle-icon');
    const clock = document.getElementById('clock');

    if (!timerStartDateTime) {
        if (openEntryId !== null && !closeCard()) return;
        timerStartDateTime = new Date();
        toggleIcon.className = 'fa-solid fa-stop';
        timer.classList.add('running');
        document.getElementById('toggle-button').title = 'Stop and save';
        timerIntervalId = setInterval(() => {
            const seconds = Math.floor((new Date() - timerStartDateTime) / 1000);
            clock.textContent = `${pad(Math.floor(seconds / 3600))}:${pad(Math.floor(seconds / 60) % 60)}:${pad(seconds % 60)}`;
        }, 1000);
    } else {
        const start = timerStartDateTime;
        const end = new Date();
        clearInterval(timerIntervalId);
        timerIntervalId = null;
        timerStartDateTime = null;
        toggleIcon.className = 'fa-solid fa-play';
        timer.classList.remove('running');
        document.getElementById('toggle-button').title = 'Start timing';
        clock.textContent = '00:00:00';
        createTimeBlock(start, end);
    }
}
document.getElementById('toggle-button').addEventListener('click', toggleClock);

// Stop the clock and keep the entry on screen if the tab is closing
window.addEventListener('beforeunload', function() {
    if (timerStartDateTime) toggleClock();
});

/* ============================================================
   Days
   ============================================================ */

const dayBlock = document.getElementById('day-block');
const dayInfo = document.getElementById('day-info');

function showDayInfo(html) {
    dayInfo.innerHTML = html;
    dayBlock.classList.add('info-open');
}
function clearDayInfo() {
    dayBlock.classList.remove('info-open');
}
document.addEventListener('mouseover', function(event) {
    if (!document.getElementById('day-table').contains(event.target)) clearDayInfo();
});
document.addEventListener('touchstart', function(event) {
    if (!document.getElementById('day-table').contains(event.target)) clearDayInfo();
}, { passive: true });

function populateDays() {
    const monthSelect = document.getElementById('month-select');
    const yearSelect = document.getElementById('year-select');
    const dayTable = document.getElementById('day-table');

    if (!monthSelect.options.length) {
        monthNames.forEach((month, index) => {
            const option = document.createElement('option');
            option.value = index;
            option.textContent = month;
            monthSelect.appendChild(option);
        });
        const thisYear = today.getFullYear();
        for (let year = thisYear - 3; year <= thisYear + 1; year++) {
            const option = document.createElement('option');
            option.value = year;
            option.textContent = year;
            yearSelect.appendChild(option);
        }
        const { selectedMonth, selectedYear } = getMonthYear();
        monthSelect.value = selectedMonth;
        yearSelect.value = selectedYear;

        [monthSelect, yearSelect].forEach(select => {
            select.addEventListener('change', function() {
                if (openEntryId !== null && !closeCard()) {
                    // put the month back until the open entry is dealt with
                    const { selectedMonth, selectedYear } = getMonthYear();
                    monthSelect.value = selectedMonth;
                    yearSelect.value = selectedYear;
                    return;
                }
                setMonthYear();
                localStorage.removeItem(`time_cache_${globalProjectId}`);
                localStorage.removeItem('days_cache');
                openEntryId = null;
                draft = null;
                getTime(globalProjectId);
                populateDays();
            });
        });
    }

    const selectedMonth = parseInt(monthSelect.value, 10);
    const selectedYear = parseInt(yearSelect.value, 10);
    const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();

    function displayDayData(data) {
        dayTable.innerHTML = '';

        let maxDuration = 0;
        for (const dayNumber in data) {
            if (data[dayNumber].duration > maxDuration) maxDuration = data[dayNumber].duration;
        }

        // hours per week, so the panel can show the day next to its week
        const weeklyTotals = {};
        for (let day = 1; day <= daysInMonth; day++) {
            const key = startOfWeek(new Date(selectedYear, selectedMonth, day)).getTime();
            const hours = (data[day] && parseFloat(data[day].hours)) || 0;
            weeklyTotals[key] = (weeklyTotals[key] || 0) + hours;
        }

        for (let day = 1; day <= daysInMonth; day++) {
            const squareDate = new Date(selectedYear, selectedMonth, day);
            const weekTotal = weeklyTotals[startOfWeek(squareDate).getTime()] || 0;
            const dayHours = (data[day] && data[day].hours) ? data[day].hours : '0.00';

            const daySquare = document.createElement('div');
            daySquare.classList.add('day-square');
            if (data[day] && maxDuration) {
                daySquare.style.opacity = (0.2 + 0.8 * (data[day].duration / maxDuration)).toFixed(2);
            }

            const info = `${dayNames[squareDate.getDay()]}, ${monthNames[selectedMonth].slice(0, 3)} ${day}${getDaySuffix(day)}` +
                `<br><b>${dayHours} hour${s(dayHours)}</b>` +
                `<span class="dim">, ${weekTotal.toFixed(2)} for the week</span>`;

            daySquare.addEventListener('mouseover', () => showDayInfo(info));
            daySquare.addEventListener('touchstart', () => showDayInfo(info), { passive: true });
            dayTable.appendChild(daySquare);
        }
    }

    const cachedDays = localStorage.getItem('days_cache');
    if (cachedDays) {
        console.log('days read from client-side cache');
        displayDayData(JSON.parse(cachedDays));
    } else {
        fetch(`/days?tz_name=${localTz}&month=${selectedMonth}&year=${selectedYear}`)
        .then(response => response.json())
        .then(data => {
            localStorage.setItem('days_cache', JSON.stringify(data));
            displayDayData(data);
        });
    }
}

/* ============================================================
   Projects and tasks
   ============================================================ */

// POST to /projects endpoint and append list
function addProject() {
    const projectUlElement = document.getElementById('project-list-ul');
    const newProjectLi = document.getElementById('new-project-li');
    const newProjectInput = document.getElementById('new-project-input');
    const newProjectName = newProjectInput.value;

    if (newProjectName) {
        const newListItem = document.createElement('li');
        newListItem.classList.add('task-or-project-li');
        const newLink = document.createElement('p');
        newLink.className = 'task-or-project';
        newLink.textContent = newProjectName;
        newLink.style.opacity = '0.5';
        newLink.style.width = '170px';
        newListItem.appendChild(newLink);
        projectUlElement.insertBefore(newListItem, newProjectLi);
        newProjectInput.value = '';

        fetch('/projects', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: newProjectName, user_id: globalUserId })
        })
        .then(response => response.json())
        .then(data => {
            newLink.setAttribute('data-projectId', data.id);
            addProjectClickListener(newLink, data.id, newProjectName);
            addHoverListener(newLink, 'project', data.id);
            localStorage.removeItem(`projects_cache_${globalUserId}`);
        });
    }
}

// POST to /tasks endpoint and append list
function addTask(projectId) {
    const taskUlElement = document.getElementById('task-list-ul');
    const newTaskLi = document.getElementById('new-task-li');
    const newTaskInput = document.getElementById('new-task-input');
    const newTaskName = newTaskInput.value;

    if (newTaskName) {
        fetch('/tasks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ projectId: projectId, taskName: newTaskName })
        })
        .then(response => response.json())
        .then(data => {
            newTaskInput.value = '';
            if (newTaskLi && newTaskLi.parentNode) newTaskLi.parentNode.removeChild(newTaskLi);
            localStorage.removeItem(`tasks_cache_${projectId}`);
            populateTasks(projectId);
        });
    }
}

function addProjectClickListener(newLink, projectId, projectName) {
    newLink.addEventListener('click', function() {
        // don't drop unsaved edits on the way out
        if (openEntryId !== null && !closeCard()) return;
        if (timerStartDateTime) toggleClock();

        if (projectId !== globalProjectId) {
            openEntryId = null;
            draft = null;
            globalTaskId = undefined;
            globalProjectId = projectId;
            populateTasks(projectId);
            getTime(projectId);
        }

        document.getElementById('project-name').textContent = projectName;

        const allLinks = document.querySelectorAll('#project-list-ul li p');
        allLinks.forEach(link => {
            link.style.fontSize = '12pt';
            link.style.opacity = '0.5';
            link.style.fontWeight = 'normal';
        });
        newLink.style.fontWeight = 'bold';
        newLink.style.opacity = '1';
    });
}

// Add hover event listener to project or task link
function addHoverListener(newLink, elementType, elementId) {
    let hoverMenu;
    let timeoutId;

    function displayCustomHoverMenu(e) {
        e.preventDefault();
        const existingMenu = document.querySelector('.custom-hover-menu');
        if (existingMenu) existingMenu.remove();

        hoverMenu = document.createElement('ul');
        hoverMenu.className = 'custom-hover-menu';

        // Rename
        const renameOption = document.createElement('li');
        const renameIcon = document.createElement('i');
        renameIcon.className = 'fa fa-pencil-alt';
        renameOption.appendChild(renameIcon);

        renameOption.addEventListener('click', function() {
            hoverMenu.remove();

            const inputElement = document.createElement('input');
            inputElement.classList.add('rename-input');
            inputElement.type = 'text';
            inputElement.value = newLink.textContent.trim();

            newLink.parentNode.replaceChild(inputElement, newLink);
            inputElement.focus();
            inputElement.select();

            const blurHandler = function() {
                if (inputElement.parentNode) inputElement.parentNode.replaceChild(newLink, inputElement);
            };
            inputElement.addEventListener('blur', blurHandler);

            inputElement.addEventListener('keypress', function(event) {
                if (event.key === 'Enter') {
                    inputElement.removeEventListener('blur', blurHandler);

                    if (elementType === 'project') {
                        renameProject(newLink.getAttribute('data-projectId'), inputElement.value);
                        newLink.textContent = inputElement.value;
                    } else {
                        renameTask(newLink.getAttribute('data-taskId'), inputElement.value);
                        const swatch = newLink.querySelector('.task-swatch');
                        newLink.innerHTML = (swatch ? swatch.outerHTML : '') + `<span>${escapeHtml(inputElement.value)}</span>`;
                    }

                    if (inputElement.parentNode) inputElement.parentNode.replaceChild(newLink, inputElement);
                }
            });
        });

        // Complete
        const completeOption = document.createElement('li');
        const completeIcon = document.createElement('i');
        let isCompleted = true;

        if (newLink.style.textDecoration === 'line-through') {
            completeIcon.className = 'fa fa-undo';
            isCompleted = false;
        } else {
            completeIcon.className = 'fa fa-check';
        }

        completeOption.appendChild(completeIcon);
        completeOption.addEventListener('click', function(event) {
            if (completeIcon.className === 'fa fa-check') {
                createConfetti(event.clientX, event.clientY);
            }

            if (elementType === 'project') {
                completeProject(elementId, isCompleted);
            } else {
                completeTask(elementId, isCompleted);
            }

            if (hoverMenu && hoverMenu.parentNode) hoverMenu.parentNode.removeChild(hoverMenu);
        });

        // Delete
        let deleteConfirmed = false;
        const deleteOption = document.createElement('li');
        const deleteIcon = document.createElement('i');
        deleteIcon.className = 'fa fa-trash';
        deleteOption.appendChild(deleteIcon);

        deleteOption.addEventListener('click', function() {
            if (!deleteConfirmed) {
                deleteIcon.className = 'fa fa-question';
                deleteConfirmed = true;
            } else {
                if (elementType === 'project') {
                    deleteProject(elementId);
                    document.getElementById('task-list-ul').innerHTML = "";
                } else {
                    deleteTask(elementId);
                }
                if (hoverMenu && hoverMenu.parentNode) hoverMenu.parentNode.removeChild(hoverMenu);
                deleteConfirmed = false;
            }
        });

        hoverMenu.appendChild(completeOption);
        hoverMenu.appendChild(renameOption);
        hoverMenu.appendChild(deleteOption);
        document.body.appendChild(hoverMenu);

        const rect = newLink.getBoundingClientRect();
        hoverMenu.style.top = (rect.top + window.scrollY) + 'px';
        hoverMenu.style.left = (rect.right + window.scrollX) + 'px';

        if (timeoutId) clearTimeout(timeoutId);

        hoverMenu.addEventListener('mouseleave', function() {
            timeoutId = setTimeout(() => {
                hoverMenu.classList.add('fade-out');
                setTimeout(() => hoverMenu.remove(), 300);
            }, 300);
        });

        hoverMenu.addEventListener('mouseenter', function() {
            if (timeoutId) clearTimeout(timeoutId);
            hoverMenu.classList.remove('fade-out');
        });
    }

    newLink.addEventListener('contextmenu', displayCustomHoverMenu);

    let lastTapTime = 0;
    newLink.addEventListener('touchend', function(e) {
        const currentTime = new Date().getTime();
        const tapInterval = currentTime - lastTapTime;
        if (tapInterval < 300 && tapInterval > 0) {
            displayCustomHoverMenu(e);
            e.preventDefault();
        }
        lastTapTime = currentTime;
    });

    newLink.addEventListener('mouseleave', function() {
        if (hoverMenu && !hoverMenu.matches(':hover')) {
            hoverMenu.classList.add('fade-out');
            timeoutId = setTimeout(() => hoverMenu.remove(), 300);
        }
    });
}

// Mark a task complete
function completeTask(taskId, isCompleted) {
    const taskLink = document.querySelector(`[data-taskid="${taskId}"]`);
    if (taskLink) {
        taskLink.style.textDecoration = isCompleted ? 'line-through' : '';
        const listItem = taskLink.closest('li');
        if (listItem) listItem.setAttribute('data-completed', isCompleted);
    }

    fetch(`/tasks`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: taskId, isCompleted: isCompleted })
    })
    .then(response => response.json())
    .then(() => localStorage.removeItem(`tasks_cache_${globalProjectId}`))
    .catch(error => console.error('There has been a problem with your fetch operation:', error));
}

// Mark a project complete
function completeProject(projectId, isCompleted) {
    const projectLink = document.querySelector(`[data-projectid="${projectId}"]`);
    if (projectLink) {
        projectLink.style.textDecoration = isCompleted ? 'line-through' : '';
        const listItem = projectLink.closest('li');
        if (listItem) listItem.setAttribute('data-completed', isCompleted);
    }

    fetch(`/projects`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: projectId, isCompleted: isCompleted })
    })
    .then(response => response.json())
    .then(() => localStorage.removeItem(`projects_cache_${globalUserId}`))
    .catch(error => console.error('There has been a problem with your fetch operation:', error));
}

function renameProject(projectId, newName) {
    fetch(`/projects`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: projectId, name: newName })
    })
    .then(response => response.json())
    .then(() => {
        localStorage.removeItem(`projects_cache_${globalUserId}`);
        if (projectId == globalProjectId) document.getElementById('project-name').textContent = newName;
    })
    .catch(error => console.error('There has been a problem with your fetch operation:', error));
}

function deleteProject(projectId) {
    fetch(`/projects`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: projectId, isVisible: false })
    })
    .then(response => response.json())
    .then(() => {
        localStorage.removeItem(`projects_cache_${globalUserId}`);
        const link = document.querySelector(`[data-projectid="${projectId}"]`);
        if (link) link.closest('li').remove();
        if (projectId == globalProjectId) {
            globalProjectId = undefined;
            globalTaskId = undefined;
            timeEntries = [];
            renderTimes();
            populateProjects();
        }
    })
    .catch(error => console.error('There has been a problem with your fetch operation:', error));
}

function renameTask(taskId, newName) {
    fetch(`/tasks`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: taskId, name: newName })
    })
    .then(response => response.json())
    .then(() => {
        localStorage.removeItem(`tasks_cache_${globalProjectId}`);
        const task = currentTasks.find(t => t.id == taskId);
        if (task) task.name = newName;
        renderTimerTasks();
        renderTimes();
    })
    .catch(error => console.error('There has been a problem with your fetch operation:', error));
}

function deleteTask(taskId) {
    fetch(`/tasks`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: taskId, isVisible: false })
    })
    .then(response => response.json())
    .then(() => {
        localStorage.removeItem(`tasks_cache_${globalProjectId}`);
        populateTasks(globalProjectId);
    })
    .catch(error => console.error('There has been a problem with your fetch operation:', error));
}

/* ============================================================
   Chrome: export, colour, darkmode, confetti, list toggles
   ============================================================ */

function exportCsv(arg, id) {
    const now = new Date();
    const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}`;

    let dataType = '';
    if (arg === 'user_id') dataType = 'projects';
    else if (arg === 'project_id') dataType = 'tasks';
    else if (arg === 'time') dataType = 'time';
    else if (arg === 'days') dataType = 'days';

    const { selectedMonth, selectedYear } = getMonthYear();
    const filename = `anolog_${dataType}_${stamp}`;

    fetch(`/export_csv?${arg}=${id}&month=${selectedMonth}&year=${selectedYear}`)
    .then(response => response.blob())
    .then(blob => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = dataType === 'time' ? `${filename}.xlsx` : `${filename}.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
    })
    .catch(error => console.error('Error:', error));
}

document.getElementById('export-button').addEventListener('click', function() {
    exportCsv('time', globalProjectId);
});
document.getElementById('project-csv').addEventListener('click', function() {
    exportCsv('user_id', globalUserId);
});
document.getElementById('task-csv').addEventListener('click', function() {
    exportCsv('project_id', globalProjectId);
});
document.getElementById('log-csv').addEventListener('click', function() {
    exportCsv('time', globalProjectId);
});
document.getElementById('time-csv').addEventListener('click', function() {
    exportCsv('days', globalProjectId);
});

// Collapse left menu
document.querySelector('.toggle').addEventListener('click', function() {
    const listContainer = document.querySelector('.list-container');
    const menuButton = document.getElementById('menu-button');
    if (menuButton.className === "fa-solid fa-bars") {
        listContainer.classList.remove('list-collapsed');
        menuButton.className = "fa-solid fa-square-minus";
    } else {
        listContainer.classList.add('list-collapsed');
        void listContainer.offsetWidth;
        menuButton.className = "fa-solid fa-bars";
    }
});

// Pick color
document.getElementById('picker-label').addEventListener('click', function() {
    document.getElementById('color-picker').click();
});
document.addEventListener('input', function(event) {
    if (event.target.id === 'color-picker') {
        document.documentElement.style.setProperty('--primary-color', event.target.value);
    }
});
document.addEventListener('change', function(event) {
    if (event.target.id === 'color-picker') {
        document.documentElement.style.setProperty('--primary-color', event.target.value);
        fetch('/user', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: globalUserId, color: event.target.value })
        });
    }
});

// Confetti
function createConfetti(x, y) {
    const confettiCount = 40;
    const colors = ['#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF'];

    for (let i = 0; i < confettiCount; i++) {
        const confetti = document.createElement('div');
        confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
        confetti.className = 'confetti';
        confetti.style.left = `${x}px`;
        confetti.style.top = `${y}px`;
        document.body.appendChild(confetti);

        confetti.style.setProperty('--initial-x', `${Math.random() * 30 - 15}px`);
        confetti.style.setProperty('--initial-y', `${Math.random() * 30 - 15}px`);
        confetti.style.setProperty('--rotation', `${Math.random() * 360}deg`);
        confetti.style.setProperty('--speed', `${Math.random() * .1 + 0.5}s`);

        confetti.addEventListener('animationend', function() {
            confetti.remove();
        });
    }
}

// Logout
document.getElementById('logout-button').addEventListener('click', function() {
    window.location.href = '/logout';
});

// Toggle darkmode
function toggleDarkmode() {
    const title = document.querySelector('h1');
    const darkmodeIcon = document.querySelector('#darkmode-icon');

    if (darkmode) {
        darkmode = false;
        document.body.style.backgroundColor = "var(--text-color)";
        darkmodeIcon.className = "fa-regular fa-moon";
        darkmodeIcon.style.fontSize = "14pt";
        title.style.color = "var(--card-color)";
    } else {
        darkmode = true;
        document.body.style.backgroundColor = "#000000";
        darkmodeIcon.className = "fa-solid fa-moon";
        darkmodeIcon.style.fontSize = "14pt";
        title.style.color = "var(--text-color)";
    }

    if (!firstLoad) {
        fetch('/user', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: globalUserId, darkmode: darkmode })
        });
    }
    firstLoad = false;
}
document.querySelector('.darkmode-button').addEventListener('click', toggleDarkmode);
toggleDarkmode();

// Toggle show completed
function toggleShowCompleted(type) {
    const completed = document.querySelectorAll(`#${type}-list-ul li[data-completed=true]`);
    const showCompleted = (type === 'task') ? showCompletedTasks : showCompletedProjects;

    completed.forEach(item => {
        if (showCompleted) {
            item.style.height = '0px';
            item.style.overflow = 'hidden';
            item.style.margin = 'auto';
        } else {
            item.style.height = 'auto';
            item.style.overflow = 'visible';
            item.style.marginBottom = '5px';
        }
    });

    if (type === 'task') showCompletedTasks = !showCompletedTasks;
    else showCompletedProjects = !showCompletedProjects;
}

const showCompletedTaskToggle = document.getElementById('toggle-completed-tasks');
showCompletedTaskToggle.addEventListener('click', function() {
    toggleShowCompleted('task');
    showCompletedTaskToggle.className = showCompletedTasks
        ? 'toggle-completed fa-solid fa-eye'
        : 'toggle-completed fa-solid fa-eye-slash';
    showCompletedTaskToggle.title = showCompletedTasks ? "Hide Completed Tasks" : "Show Completed Tasks";
});

const showCompletedProjectToggle = document.getElementById('toggle-completed-projects');
showCompletedProjectToggle.addEventListener('click', function() {
    toggleShowCompleted('project');
    showCompletedProjectToggle.className = showCompletedProjects
        ? 'toggle-completed fa-solid fa-eye'
        : 'toggle-completed fa-solid fa-eye-slash';
    showCompletedProjectToggle.title = showCompletedProjects ? "Hide Completed Projects" : "Show Completed Projects";
});

// Add a task or project
function addNewItem(type) {
    const targetUl = document.getElementById(type === 'project' ? 'project-list-ul' : 'task-list-ul');

    const newLi = document.createElement('li');
    newLi.classList.add('task-or-project-li');
    newLi.id = `new-${type}-li`;

    const newInput = document.createElement('input');
    newInput.type = 'text';
    newInput.id = `new-${type}-input`;

    newInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            if (type === 'project') {
                addProject();
                newInput.blur();
            } else {
                addTask(globalProjectId);
                newInput.blur();
            }
            newInput.focus();
        }
    });

    newInput.addEventListener('blur', function() {
        if (newLi.parentNode) targetUl.removeChild(newLi);
    });

    newLi.appendChild(newInput);
    targetUl.insertBefore(newLi, targetUl.firstChild);
    newInput.focus();
}

document.querySelectorAll('.add-button').forEach(button => {
    button.addEventListener('click', function() {
        if (this.id === 'add-a-task') addNewItem('task');
        else if (this.id === 'add-a-project') addNewItem('project');
    });
});

// Load
populateDays();
populateProjects();