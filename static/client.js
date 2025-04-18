var globalProjectId;
var globalTaskId;
var globalLogId;
var globalSeconds;

let intervalId = null;
let firstLoad = true;
let showCompletedTasks = false;
let showCompletedProjects = false;

const today = new Date();
const year = today.getFullYear();
const month = today.getMonth();
const todaysDayOfWeek = today.getDay();
const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone;

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
    if (time == 1) {
        return '';
    }
    else {
        return 's';
    }
}

function getWeekNumber(date) {
    const currentDate = 
        (typeof date === 'object') ? date : new Date();
    const januaryFirst = 
        new Date(currentDate.getFullYear(), 0, 1);
    const daysToNextMonday = 
        (januaryFirst.getDay() === 1) ? 0 : 
        (7 - januaryFirst.getDay()) % 7;
    const nextMonday = 
        new Date(currentDate.getFullYear(), 0, 
        januaryFirst.getDate() + daysToNextMonday);

    return (currentDate < nextMonday) ? 52 : 
    (currentDate > nextMonday ? Math.ceil(
    (currentDate - nextMonday) / (24 * 3600 * 1000) / 7) : 1);
}

const dayColors = [
    '#7f2828','#fff955','#41a5f1','#fd6d5d','#d379bd','#67ce6a','#2d3b5f'
]

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
        data.forEach((project, index) => {
            if (project.is_visible !== false){
                if (first===true && globalProjectId===undefined){
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

                if (project.id === globalProjectId){
                    newLink.style.opacity = '1';
                    newLink.style.fontWeight = 'bold';
                    projectNameLabel.textContent = project.name;
                    projectNameLabel.style.opacity = "1";
                }
                
                else {
                    newListItem.setAttribute('data-completed', false);
                }

                addProjectClickListener(newLink, project.id, project.name);
                addHoverListener(newLink, 'project', data.id);
                ulElement.appendChild(newListItem);
                newListItem.style.height = '0px';

                if (project.is_completed) {
                    newLink.style.textDecoration = 'line-through';
                    newListItem.setAttribute('data-completed', true);
                    newListItem.style.overflow = 'hidden';
                    newListItem.style.margin = 'auto';
                }
                else {
                    newLink.style.width = '170px';
                    newListItem.style.height = 'auto';
                }



            }
        });
    }

    let cachedProjects = localStorage.getItem(`projects_cache_${globalUserId}`);
    if (cachedProjects) {
        displayProjectData(JSON.parse(cachedProjects));
        console.log('projects read from client-side cache')
    }
    else {
        fetch(`/projects`)
        .then(response => response.json())
        .then(data => {
            displayProjectData(data);
            localStorage.setItem(`projects_cache_${globalUserId}`, JSON.stringify(data));
        });
    }
}

// GET from /tasks endpoint and populate list
function populateTasks(projectId) {

    function displayTaskData(data) {
        const taskUlElement = document.getElementById('task-list-ul');
        taskUlElement.innerHTML = '';
        let first = true;
        data.forEach(task => {
            if (task.is_visible !== false) {
 
                const newTaskListItem = document.createElement('li');
                newTaskListItem.classList.add('task-or-project-li');
                newTaskListItem.style.height = '0px';

                const newTaskLink = document.createElement('p');
                newTaskLink.className = 'task-or-project';
                newTaskLink.textContent = task.name;
                newTaskLink.dataset.totalSeconds = task.total_seconds;
                newTaskLink.dataset.isCompleted = task.is_completed;

                newTaskLink.setAttribute('data-taskId', task.id);
                newTaskListItem.appendChild(newTaskLink);
                taskUlElement.appendChild(newTaskListItem);
                addTaskClickListener(newTaskLink, task.id, task.name);
                addHoverListener(newTaskLink, 'task', task.id);

                // Mark completed if is_complete
                var fullHeight = newTaskListItem.scrollHeight;
                
                if (task.is_completed === true) {
                    newTaskLink.style.textDecoration = 'line-through';
                    newTaskListItem.setAttribute('data-completed', true);
                    newTaskListItem.style.overflow = 'hidden';
                    newTaskListItem.style.margin = 'auto';
                }
                else {
                    newTaskListItem.style.height = fullHeight + 'px';
                    newTaskLink.style.textDecoration = '';
                    newTaskListItem.setAttribute('data-completed', false);
                }

                // Make bold if it is the selected task
                if (first) {
                    newTaskLink.style.opacity = '1';
                    newTaskLink.style.fontWeight = 'bold';
                }
                else {
                    newTaskLink.style.opacity = '0.5';
                    newTaskLink.style.fontWeight = 'normal';
                }

                // Populate logs if it's the first one
                if (first===true){
                    if (globalTaskId!==task.id) {
                        populateLogs(task.id);
                    }
                    globalTaskId=task.id;
                    
                    first = false;

                    const logContent = document.getElementById('log-content');
                    const logDiv = document.getElementById('log-div');
                    logContent.style.visibility = 'visible';
                    logDiv.style.opacity = '1';
                }
            }

        });
    }

    // Check cache first
    let cachedTasks = localStorage.getItem(`tasks_cache_${projectId}`);
    if (cachedTasks) {
        console.log('tasks read from client-side cache');
        displayTaskData(JSON.parse(cachedTasks));
    }
    else {
        // Send projectId to /tasks endpoint
        fetch(`/tasks?project_id=${projectId}`)
        .then(response => response.json())
        .then(data => {
            displayTaskData(data);
            localStorage.setItem(`tasks_cache_${projectId}`, JSON.stringify(data));
        });           
    }
}

function makeLog(id, isPinned, date, description) {
    let dateObj;
    if (date !== null) {
        dateObj = new Date(date);
    }
    else {
        dateObj = new Date();
    }
    const localDateStr = dateObj.toLocaleString();
    const escapedLogText = description;//.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const taskName = document.getElementById('task-name').textContent;

    let style = ''
    let dark = 'dark';
    let color = 'var(--card-color)';
    let backgroundColor = 'var(--text-color)';
    
    if (escapedLogText.includes("<br>")) {
        style = "";
    }
    else {
        style = "white-space: pre-line;";
    }

    if (isPinned) { 
        dark = 'dark';
        color = '#161616';
        backgroundColor = 'var(--text-color)';
    }

    const logEntry = `
        <div class="log-item" data-logId="${id}" data-isPinned=${isPinned} style="background-color:${backgroundColor}; color: ${color};">
        <div class="log-options-div">
        <i id="pin-option-button" class="log-option-button ${dark} pin fa-solid fa-thumbtack" style="width: 0px; font-size: 10pt; overflow: hidden;"></i>
        <i id="edit-option-button" class="log-option-button ${dark} fa fa-pencil-alt" style="width: 0px; font-size: 10pt; overflow: hidden;"></i>
        <i id="delete-option-button" class="log-option-button ${dark} fa fa-trash" style="width: 0px; font-size: 10pt; overflow: hidden;"></i>
        </div>
        <div style="display: flex; margin-bottom: 0px; align-items: center;">
            <span class="log-description" style="${style}">${escapedLogText}</span>
            </div>

        </div>`;

    const element = document.createElement('div');
    element.innerHTML = logEntry;
    logItem = element.firstElementChild;

    const pinOption = logItem.querySelector('#pin-option-button');
    const editOption = logItem.querySelector('#edit-option-button');
    const deleteOption = logItem.querySelector('#delete-option-button');

    if (isPinned) {
        const logOptions = logItem.querySelector('.log-options-div');
        logOptions.style.minWidth = '20px';
        pinOption.style.minWidth = '15px';
    }

    addLogPinClickListener(pinOption, logItem);
    addLogEditClickListener(editOption, logItem);
    addLogDeleteClickListener(deleteOption, logItem);
    return logItem;
}

function addLogPinClickListener(logOptionButton, logItem) {
    logOptionButton.addEventListener('click', () => pinLog(logItem));
}
function addLogEditClickListener(logOptionButton, logItem) {
    logOptionButton.addEventListener('click', () => editLog(logItem));
}
function addLogDeleteClickListener(logOptionButton, logItem) {
    logOptionButton.addEventListener('click', () => deleteLog(logItem));
}


// GET from /tasks /hours and /logs endpoints and populate content
function populateLogs(taskId) {

    const logItemsContainer = document.getElementById('log-items-container');
    logItemsContainer.innerHTML = '';

    const pinnedLogsContainer = document.getElementById('pinned-logs-container');
    pinnedLogsContainer.innerHTML = '';
    
    const taskName = document.getElementById('task-name');
    const taskCheckbox = document.getElementById('task-checkbox');

    let thisTask = document.querySelector(`p[data-taskid="${taskId}"]`);
    taskName.textContent = thisTask.textContent;
    globalSeconds = thisTask.dataset.totalSeconds;
    taskIsCompleted = thisTask.dataset.isCompleted;
    updateClock();

    if (taskIsCompleted === "true") {
        taskName.style.textDecoration = 'line-through';
        taskCheckbox.checked = true;
    }
    else {
        taskName.style.textDecoration = '';
        taskCheckbox.checked = false;
    }

    function displayLogData(data) {
        // Append responses to entry log
        data.forEach((log, index) => {
            showIt = (log.description.includes("Timer stop (") || log.description.includes("Timer start (") || log.description.includes("Timer edited to (")) ? false : true;
            if (showIt) {

                let logEntry = makeLog(log.id, false, log.created_at, log.description);
                let pinnedLogEntry = makeLog(log.id, true, log.created_at, log.description);
                
                logEntry.style.opacity = '0';
                pinnedLogEntry.style.opacity = '0';

                if (log.is_pinned) {
                    pinnedLogsContainer.appendChild(pinnedLogEntry);
                    pinnedLogEntry.style.opacity = '1';
                    logEntry.style.opacity = '1';
                    logEntry.style.height = '0px';
                    logEntry.style.padding = '0px';
                    logItemsContainer.appendChild(logEntry);
                    logEntry.style.display = 'none';
                }
                else{
                    logItemsContainer.appendChild(logEntry);
                    setTimeout(() => logEntry.style.opacity = '1', 10);
                }
                //adjustLogItemsContainerHeight();
            }
        });
        
    }

    // Check cache first
    let cachedLogs = localStorage.getItem(`logs_cache_${taskId}`);
    if (cachedLogs) {
        console.log('logs read from client-side cache');
        displayLogData(JSON.parse(cachedLogs));
    }
    else {
        fetch(`/logs?task_id=${taskId}`)
        .then(response => response.json())
        .then(data => {
            displayLogData(data);
            localStorage.setItem(`logs_cache_${taskId}`, JSON.stringify(data));
        })
    }     
}

function setMonthYear() {
    selectedMonth = monthSelect.value;
    selectedYear = yearSelect.value;
    const monthYear = { month: selectedMonth, year: selectedYear };
    localStorage.clear();
    console.log(monthYear);
    localStorage.setItem("month_year_cache", JSON.stringify(monthYear));
    window.location.reload();
}

function getMonthYear() {
    // Load month and year
    let cachedMonthYear = localStorage.getItem("month_year_cache");
    let selectedMonth, selectedYear;
    
    if (cachedMonthYear) {
        console.log("month and year read from client-side cache");
        const parsed = JSON.parse(cachedMonthYear);
        selectedMonth = parsed.month;
        selectedYear = parsed.year;
    } else {
        const currentDate = new Date();
        selectedYear = currentDate.getFullYear();
        selectedMonth = currentDate.getMonth();
        const monthYear = { month: selectedMonth, year: selectedYear };
        localStorage.setItem("month_year_cache", JSON.stringify(monthYear));
    }

    return { selectedMonth, selectedYear };
}

const monthSelect = document.getElementById('month-select');
const yearSelect = document.getElementById('year-select');
monthSelect.addEventListener('change', () => setMonthYear());
yearSelect.addEventListener('change', () => setMonthYear());


// Fill day div
function populateDays() {
    const dayInfo = document.getElementById('day-info');
    const dayDiv = document.querySelector('.day-div');
    const dayTable = document.getElementById('day-table');
    const monthAbbreviations = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

    const monthAbbrev = monthAbbreviations[month];
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const divWidth = dayDiv.offsetWidth;

    const { selectedMonth, selectedYear } = getMonthYear();
    
    // make month select
    const monthSelect = document.getElementById("month-select");
    monthAbbreviations.forEach((month, idx) => {
      const opt = document.createElement("option");
      opt.value = idx;
      opt.textContent = month;
      console.log(selectedMonth);
      if (idx == selectedMonth) {
        opt.selected = true;
      }
        monthSelect.appendChild(opt);
    });
    
    // make year select
    const yearSelect = document.getElementById("year-select");

    const currentYear = new Date().getFullYear();
    for (let y = currentYear; y >= 2023; y--) {
      const opt = document.createElement("option");
      opt.value = y;
      opt.textContent = y;
      if (y == selectedYear) opt.selected = true;
      yearSelect.appendChild(opt);
    }

    // Get day data
    let cachedDays = localStorage.getItem(`days_cache`);
    if (cachedDays) {
        console.log('days read from client-side cache');
        displayDayData(JSON.parse(cachedDays));
    }
    else {
        fetch(`/days?tz_name=${localTz}&month=${selectedMonth}&year=${selectedYear}`)
        .then(response => response.json())
        .then(data => {
            displayDayData(data);
            localStorage.setItem(`days_cache`, JSON.stringify(data));
        })
    }    

    function displayDayData(data){
        // Clear existing content
        const dayTable = document.getElementById('day-table');
        dayTable.innerHTML = '';
        let maxDuration = 0;
        for (const dayNumber in data) {
            const dayData = data[dayNumber];
            if (dayData.duration > maxDuration) {
                maxDuration = dayData.duration;
            }
        }

        let weeklyTotals = {};

        for (let day = 1; day <= daysInMonth; day++) {
            let squareDate = new Date(year, month, day);
            let weekNumber = getWeekNumber(squareDate);
        
            if (data[day] && data[day]['hours']) {
                if (!weeklyTotals[weekNumber]) {
                    weeklyTotals[weekNumber] = 0;
                }
                weeklyTotals[weekNumber] += parseFloat(data[day]['hours']) || 0; 
            }
        }

        for (let day = 1; day <= daysInMonth; day++) {
            const daySquare = document.createElement('div');
            daySquare.classList.add('day-square');
            daySquare.style.opacity = '0.1';
            daySquare.style.width = `${(divWidth/daysInMonth)-2}%`;
            daySquare.style.height = '20px';
            daySquare.style.borderRadius = '4px';
            daySquare.style.backgroundColor = 'var(--text-color)';
            daySquare.style.display = 'inline-block';
            daySquare.style.margin = '2px';
            daySquare.style.textAlign = 'center';

            let squareDate = new Date(year, month, day)
            let dayOfWeek = squareDate.getDay();
            let weekNumber = getWeekNumber(squareDate);

            if (data[day]){
                daySquare.style.backgroundColor = dayColors[dayOfWeek];
                daySquare.dataset.title = `${dayNames[dayOfWeek]}, ${monthAbbrev} ${day}${getDaySuffix(day)}<br><b>${data[day]['hours']} hour${s(data[day]['hours'])}</b>, ${weeklyTotals[weekNumber].toFixed(2)} for the week`;
                daySquare.style.opacity = (data[day]['duration'] / maxDuration) + 0.1;
            }
            else {
                daySquare.dataset.title = `${dayNames[dayOfWeek]}, ${monthAbbrev} ${day}${getDaySuffix(day)}<br>0.00 hours, ${weeklyTotals[weekNumber] ? weeklyTotals[weekNumber].toFixed(2) : '0.00'} for the week`;
            }

            function updateDayInfo(daySquare) {
                return function() {
                    dayInfo.style.paddingTop = "8px";
                    dayInfo.style.transition = "0.2s ease";
                    dayDiv.style.transition = "0.1s ease";
                    dayDiv.style.borderRadius = "10px 10px 0px 0px";
                    dayInfo.style.borderBottom = "none";
                    dayInfo.style.border = "2px solid var(--border-color)";
                    dayInfo.style.borderTop = "none";
                    dayInfo.style.height = "55px";
                    dayInfo.style.lineHeight = "22px";
                    dayInfo.innerHTML = daySquare.dataset.title; 
                };
            }

            document.addEventListener('touchstart', function(event) {
                if (!dayTable.contains(event.target)) {
                    clearDayInfo();
                }
            });

            document.addEventListener('mouseover', function(event) {
                if (!dayTable.contains(event.target)) {
                    clearDayInfo();
                }
            });

            function clearDayInfo() {
                dayInfo.style.border = "none";
                dayInfo.style.transition = "0.1s";
                dayDiv.style.transition = "0.3s ease";
                dayInfo.style.height = "0px";
                dayInfo.style.paddingTop = "0px";
                dayInfo.textContent = ''; 
                dayDiv.style.borderRadius = "10px 10px 10px 10px";
            }
            
            // Loop through each daySquare or ensure this logic is applied within your existing loop
            daySquare.addEventListener('mouseover', updateDayInfo(daySquare));
            daySquare.addEventListener('touchstart', updateDayInfo(daySquare));

            dayTable.appendChild(daySquare);
        }
    }
    resizeDays();
  }
  
  populateDays();

  function resizeDays(){
        const daySquares = document.querySelectorAll('.day-square');
        const dayDiv = document.querySelector('.day-div');

        daysInMonth = daySquares.length;
        divWidth = dayDiv.offsetWidth;
        daySquares.forEach((square, index) => {
            square.style.width = `${(divWidth/daysInMonth)-2}%`;
        })
    }

// GET to /time endpoint
function getTime(projectId) {
    const timeDivDiv = document.getElementById('time-div-div');

    timeDiv.style.justifyContent = 'center';
    timeDiv.style.border = '2px dashed var(--text-color)';
    timeDiv.innerHTML = '<i id="add-a-time-block" title="Add a Time Block" class="add-button fa-solid fa-plus" style="color: var(--text-color);"></i>';
    timeDivDiv.style.width = '100%';
    addTimeBlockButton = document.getElementById('add-a-time-block');
    addTimeBlockButton.addEventListener('click', createTimeBlock);

    function displayTimeData(data) {
        const totalDuration = data.reduce((sum, time) => sum + time.duration, 0);
        data.forEach((time, index) => {
            timeDiv.style.justifyContent = 'flex-end';
            timeDiv.style.border = '';
            const newBlock = document.createElement('div');
            newBlock.className = 'time-block';
            newBlock.dataset.id = time.id;
            newBlock.dataset.taskId = time.task_id;
            newBlock.dataset.projectId = time.project_id;
            newBlock.dataset.startTime = convertUTCToLocalForInput(time.start); 
            newBlock.dataset.endTime = convertUTCToLocalForInput(time.end);   
            newBlock.dataset.duration = time.duration;
            newBlock.dataset.description = time.description;
            newBlock.dataset.taskName = time.task_name;
            newBlock.style.width = `0px`;
            newBlock.addEventListener('click', () => openTimeDescription(newBlock));
            newBlock.addEventListener('click', () => hideCommitTimeButton());
            
            const dayOfWeek = new Date(convertUTCToLocalForInput(time.start)).getDay();
            newBlock.style.backgroundColor = dayColors[dayOfWeek];
            timeDiv.insertBefore(newBlock,addTimeBlockButton);
        });

        resizeTimeBlocks();
    }

    let cachedTime = localStorage.getItem(`time_cache_${projectId}`);

    if (cachedTime) {
        console.log('time read from client-side cache');
        displayTimeData(JSON.parse(cachedTime));
    }
    else {
        const {selectedMonth, selectedYear} = getMonthYear();
        console.log(getMonthYear());
        fetch(`/time?project_id=${projectId}&tz_name=${localTz}&month=${selectedMonth}&year=${selectedYear}`, {credentials: "include"}) 
        .then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
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
        .catch(error => {
            console.error('There has been a problem with your fetch operation:', error);
        });
    }
}

// Function to convert a UTC date string to a local date string for the datetime-local input
function convertUTCToLocalForInput(utcDateString) {
    const utcDate = new Date(utcDateString + 'Z'); // Ensure the 'Z' is there to parse as UTC
    const localDate = new Date(utcDate.getTime() - (utcDate.getTimezoneOffset() * 60000));
    return localDate.toISOString().slice(0, 16);
}

// Make it readable
function formatDateTime(dateString) {
    const date = new Date(dateString);
    let hours = date.getHours();
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours.toString().padStart(2, '0') : '12'; 
    
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    
    return `${month}/${day} at ${hours}:${minutes} ${ampm}`;
}

// Add click listeners
const timeDiv = document.getElementById('time-div');
const timeContent = document.getElementById('time-content');
const timeDescription = document.getElementById('time-description');
const timeDescriptionText = document.getElementById('time-description-text');
const timeDescriptionContainer = document.getElementById('time-description-container');
const allTimeComponents = document.getElementById('all-time-components');

let activeBlock = null;

function updateDurationS() {
    const duration = document.getElementById('duration').textContent;
    const timeDurationS = document.getElementById('duration-s');
    if (duration==='1.00') {
        timeDurationS.textContent = '';
    }
    else {
        timeDurationS.textContent = 's';
    }
}

function updateTimeDescription(block) {
    const duration = document.getElementById('duration');
    const blockDuration = block.dataset.duration; 
    const hours = (blockDuration / 60 / 60).toFixed(2);
    duration.textContent = hours;

    timeDescription.style.backgroundColor = block.style.backgroundColor;

    const timeDescriptionTaskName = document.getElementById('time-description-task-name'); 
    timeDescriptionTaskName.textContent = block.dataset.taskName;

    const startTimeInput = document.getElementById('start-time-input');
    startTimeInput.value = block.dataset.startTime;

    const endTimeInput = document.getElementById('end-time-input');
    endTimeInput.value = block.dataset.endTime;

    timeDescriptionText.value = block.dataset.description;
    updateDurationS();
}

function openTimeDescription(block) {
    let timeDescriptionHeight = timeDescription.offsetHeight;
    const timeBlocks = document.querySelectorAll('.time-block');
        timeBlocks.forEach(function(b) {
            b.style.opacity = "0.3";
            b.style.borderRadius = '5px';
        });

    // If click on new time block
    if (activeBlock !== block) {
            if (activeBlock) {
                if (activeBlock.dataset.id === "-1") {
                    blockToRemove = activeBlock;
                    blockToRemove.style.width = '0px';
                    timeDiv.removeChild(blockToRemove);
                    resizeTimeBlocks();            
                }
                timeDescriptionContainer.style.height = '0px';
                timeDescriptionContainer.style.opacity = '0.7';
                block.style.opacity = "1";
                activeBlock = block;
                timeDiv.style.borderRadius = '7px 7px 0 0';
                block.style.borderRadius = '5px 5px 0 0';
                updateTimeDescription(block);
                timeDescriptionHeight = timeDescription.offsetHeight;
                timeDescriptionContainer.style.height = `${timeDescriptionHeight}px`;
                setTimeout(() => timeDescriptionContainer.style.opacity = '1', 100);

            } else {
                addTimeBlockButton.removeEventListener('click', createTimeBlock);
                addTimeBlockButton.style.width = '0px';
                addTimeBlockButton.style.paddingRight = '0px';

                block.style.opacity = "1";
                activeBlock = block;
                timeDiv.style.borderRadius = '7px 7px 0 0';
                block.style.borderRadius = '5px 5px 0 0';
                updateTimeDescription(block);
                timeDescriptionHeight = timeDescription.offsetHeight;
                timeDescriptionContainer.style.height = `${timeDescriptionHeight}px`;
            }
    } 
    // If click on active block
    else {
        closeTimeDescription() 
    }
    updateDurationS();
}

function closeTimeDescription() {

    if (activeBlock && activeBlock.dataset.id === "-1") {
        blockToRemove = activeBlock;
        blockToRemove.style.width = '0px';
        timeDiv.removeChild(blockToRemove);
        resizeTimeBlocks();
    }

    const timeBlocks = document.querySelectorAll('.time-block');
    addTimeBlockButton.addEventListener('click', createTimeBlock);
    addTimeBlockButton.style.width = '20px';
    addTimeBlockButton.style.paddingRight = '7px';

    timeDescriptionHeight = timeDescription.offsetHeight;
    timeBlocks.forEach(function(b) {
        b.style.opacity = "1";
        b.style.borderRadius = '5px';
    });
    timeDescriptionContainer.style.height = '0px';
    timeDiv.style.borderRadius = '7px';
    activeBlock = null;

    if (timeDiv.childElementCount===1) {
        timeDiv.style.border = '2px dashed var(--text-color)';
    }
}
document.getElementById('project-space').addEventListener('click', function(event) {
    if (!allTimeComponents.contains(event.target)) {
        closeTimeDescription();
    }
});
// POST to /projects endpoint and append list
function addProject() {
    const projectUlElement = document.getElementById('project-list-ul');
    const newProjectLi = document.getElementById('new-project-li');
    const newProjectInput = document.getElementById('new-project-input');
    const newProjectName = newProjectInput.value;

    if (newProjectName) {

        // Create and insert the new list item before the input item
        const newListItem = document.createElement('li');
        newListItem.classList.add('task-or-project-li');
        const newLink = document.createElement('p');
        newLink.style.opacity = '0.5';
        newLink.className = 'task-or-project';
        newLink.textContent = newProjectName;
        newListItem.setAttribute('data-completed', false);

        newListItem.appendChild(newLink);
        projectUlElement.insertBefore(newListItem, newProjectLi);
        newProjectInput.value = '';

        // Construct payload
        const payload = {
            name: newProjectName,
            user_id: globalUserId
        };

        // Send POST request to Flask API
        fetch('/projects', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        }).then(response => response.json())
        .then(data => {
            if (data.message === "Project created") {
                console.log('project created');
                newLink.setAttribute('data-projectid',data.id)
                addProjectClickListener(newLink, data.id, newProjectName);
                addHoverListener(newLink, 'project', data.id);
                localStorage.removeItem(`projects_cache_${globalUserId}`);
            }
        });
    }
}

// POST to /tasks endpoint and append list
function addTask(projectId) {
    const newTaskLi = document.getElementById('new-task-li');
    const newTaskInput = document.getElementById('new-task-input');
    const newTaskName = newTaskInput.value;
    const taskUlElement = document.getElementById('task-list-ul');
    const logDiv = document.getElementById('log-div');

    if (newTaskName) {
        const newListItem = document.createElement('li');
        newListItem.classList.add('task-or-project-li');
        const newLink = document.createElement('p');
        newLink.className = 'task-or-project';
        newLink.textContent = newTaskName;
        newLink.style.opacity = '0.5';
        newListItem.setAttribute('data-completed', false);

        newListItem.appendChild(newLink);
        taskUlElement.insertBefore(newListItem, newTaskLi);
        newTaskInput.value = '';
        newLink.setAttribute('data-total-Seconds', 0);
        newLink.setAttribute('data-is-Completed','false');

        // Construct payload
        const payload = {
            projectId: projectId,
            taskName: newTaskName
        };

        // Send POST request to Flask API
        fetch('/tasks', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        }).then(response => response.json())
        .then(data => {
            if (data.message === "Task created") {
                // Create and insert the new list item before the input item
                console.log('task created');
                newLink.setAttribute('data-taskId', data.id);
                addTaskClickListener(newLink, data.id, data.name);
                addHoverListener(newLink, 'task', data.id);
                localStorage.removeItem(`tasks_cache_${projectId}`);
            }
        });
    }
}

// POST to /logs endpoint and append list. PUT to /tasks
function addLog(taskId, logType) {
    const logItemsContainer = document.getElementById('log-items-container');
    const tempId = Math.floor(Math.random() * 90000) + 10000;
    const initialTaskId = taskId;
    const logInput = document.getElementById('log-input');
    const clock = document.getElementById('clock');
    let logText;
    let logEntry;
    
    logText = logInput.innerHTML;

    // Build log entry
    logEntry = makeLog(tempId, false, null, logText);
    logItemsContainer.insertBefore(logEntry, logItemsContainer.childNodes[0]);
    logInput.innerHTML = "";

    // construct PUT payload
    const putPayload = {
        taskId: taskId,
        totalSeconds: globalSeconds
    };

    // Send PUT request to Flask API
    fetch('/tasks', {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(putPayload)
    }).then(response => response.json())
    .then(data => {
        if (data.message === "Task updated") {
            console.log("task updated")
        }
    });

    if (taskId) {
        // Construct POST payload
        const postPayload = {
            taskId: taskId,
            description: logText,
            createdAt: new Date()
        };

        // Send POST request to Flask API
        fetch('/logs', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(postPayload)
        }).then(response => response.json())
        .then(data => {
            if (data.message === "Log created") {
                logEntry.setAttribute('data-logid',data.id);
                localStorage.removeItem(`logs_cache_${taskId}`);
            }
        });

    }
}

// Add a click listener to a project link
function addProjectClickListener(newLink, projectId, projectName) {
    newLink.addEventListener('click', function() {

        // Stop clock if running
        const toggleIcon = document.getElementById('toggle-icon');
        if (toggleIcon.classList.contains('fa-hourglass-half')) {
            toggleClock();
        }

        // Show tasks
        if (projectId !== globalProjectId){
            globalTaskId = undefined;
            populateTasks(projectId);
            timeDescriptionContainer.style.height = '0px';
            getTime(projectId);
        }
        
        // Fade log if picking a new project
        const logContent = document.getElementById('log-content');
        const logDiv = document.getElementById('log-div');
        if (globalProjectId !== projectId) {
            //logContent.style.visibility = 'hidden';
            logDiv.style.opacity = "1";
        }

        // Update global
        globalProjectId = projectId;

        // Update project name label
        const projectNameLabel = document.getElementById('project-name');
        projectNameLabel.textContent = projectName;
        
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

// Add click event listener to task link
function addTaskClickListener(newLink, taskId) {
    newLink.addEventListener('click', function() {
        calculateTaskTotalTime(taskId);

        // Stop clock if running
        const toggleIcon = document.getElementById('toggle-icon');
        if (toggleIcon.classList.contains('fa-hourglass-half') && taskId !== globalTaskId) {
            toggleClock();
            updateClock();
        }

        if (taskId!==globalTaskId) {
            // Show logs
            populateLogs(taskId);
            
            // Update global
            globalTaskId = taskId;
        }

        // Update bold
        const allLinks = document.querySelectorAll('#task-list-ul li p');
        allLinks.forEach(link => {
            link.style.opacity = '0.5';
            link.style.fontWeight = 'normal';
        });
        newLink.style.fontWeight = 'bold';
        newLink.style.opacity = '1';

    });
}

// Add unload listener
window.addEventListener('beforeunload', function() {
    const toggleIcon = document.getElementById('toggle-icon');
    if (toggleIcon.classList.contains('fa-hourglass-half')) {
        toggleClock();
    }
});

// Add hover event listener to project link
function addHoverListener(newLink, elementType, elementId) {
    let hoverMenu;
    let timeoutId;

    function displayCustomHoverMenu(e) {
        console.log(newLink);
        e.preventDefault();
        // Remove existing hover menus
        const existingMenu = document.querySelector('.custom-hover-menu');
        if (existingMenu) {
            existingMenu.remove();
        }

        // Create custom hover menu
        hoverMenu = document.createElement('ul');
        hoverMenu.className = 'custom-hover-menu';

        // Rename option with FontAwesome icon
        const renameOption = document.createElement('li');
        const renameIcon = document.createElement('i');
        renameIcon.className = 'fa fa-pencil-alt'; 
        renameOption.appendChild(renameIcon);

        renameOption.addEventListener('click', function() {
            // Hide hover menu
            hoverMenu.remove();

            // Create an input element
            const inputElement = document.createElement('input');
            inputElement.classList.add('rename-input');
            inputElement.type = 'text';
            inputElement.value = newLink.textContent;

            // Replace the link with the input element
            newLink.parentNode.replaceChild(inputElement, newLink);

            // Focus the input and select its content
            inputElement.focus();
            inputElement.select();

            // Revert changes if the user clicks away
            const blurHandler = function() {
                if (inputElement.parentNode) {
                    inputElement.parentNode.replaceChild(newLink, inputElement);
                }
            };
            inputElement.addEventListener('blur', blurHandler);

            // Listen for Enter key press
            inputElement.addEventListener('keypress', function(e) {
                if (e.key === 'Enter') {
                    inputElement.removeEventListener('blur', blurHandler);
                    
                    if (elementType==='project') {
                        // Run renameProject function
                        projectId = newLink.getAttribute('data-projectId');
                        renameProject(projectId, inputElement.value);
                    }
                    else {
                        // Run renameTask function
                        taskId = newLink.getAttribute('data-taskId');
                        renameTask(taskId, inputElement.value);
                    }

                    // Replace the input back with the link
                    if (inputElement.parentNode) {
                        inputElement.parentNode.replaceChild(newLink, inputElement);
                    }

                    // Update the link text
                    newLink.textContent = inputElement.value;
                    
                }
            });
        });

        // Complete option with FontAwesome icon
        const completeOption = document.createElement('li');
        const completeIcon = document.createElement('i');
        let isCompleted = true;

        if (newLink.style.textDecoration === 'line-through') {
            completeIcon.className = 'fa fa-undo';
            isCompleted = false;
        }
        else {
            completeIcon.className = 'fa fa-check';
        }
        
        completeOption.appendChild(completeIcon);
        completeOption.addEventListener('click', function() {

            if (completeIcon.className === 'fa fa-check') {
                // Confetti
                const x = event.clientX;
                const y = event.clientY;
                createConfetti(x, y);
            }

            if (elementType==='project'){
                completeProject(elementId, isCompleted);
            }
            else {
                const taskCheckbox = document.getElementById('task-checkbox');
                const taskLabel = document.getElementById('task-name');
                completeTask(taskCheckbox, taskLabel, isCompleted, elementId);
            }
            
            // Remove the hover menu
            if (hoverMenu && hoverMenu.parentNode) {
                hoverMenu.parentNode.removeChild(hoverMenu);
            }
        })
        
        // Delete option with FontAwesome icon
        let deleteConfirmed = false;  
        const deleteOption = document.createElement('li');
        const deleteIcon = document.createElement('i');
        deleteIcon.className = 'fa fa-trash';  // FontAwesome class for trash/delete icon
        deleteOption.appendChild(deleteIcon);

        deleteOption.addEventListener('click', function() {
            if (!deleteConfirmed) {
                // First click: Ask for confirmation
                deleteIcon.className = 'fa fa-question';  // Change to a 'confirm' icon
                deleteConfirmed = true;
            } else {
                // Second click: Proceed with deletion
                if (elementType==='project') {
                    deleteProject(elementId);
                    const taskList = document.getElementById('task-list-ul');
                    taskList.innerHTML = "";
                }
                else {
                    deleteTask(elementId);
                }

                // Remove the hover menu
                if (hoverMenu && hoverMenu.parentNode) {
                    hoverMenu.parentNode.removeChild(hoverMenu);
                }

                deleteConfirmed = false;  // Reset flag
            }
        });

        // Append options to hover menu
        hoverMenu.appendChild(completeOption);
        hoverMenu.appendChild(renameOption);
        hoverMenu.appendChild(deleteOption);

        // Append hover menu to document
        document.body.appendChild(hoverMenu);

        // Position the hover menu to the right of the list item
        const rect = newLink.getBoundingClientRect();
        hoverMenu.style.top = (rect.top + window.scrollY) + 'px';
        hoverMenu.style.left = (rect.right + window.scrollX) + 'px';


        // Clear any existing timeout
        if (timeoutId) {
            clearTimeout(timeoutId);
        }

        hoverMenu.addEventListener('mouseleave', function() {
            // Set a timeout to fade out the menu after 1 second
            timeoutId = setTimeout(() => {
                hoverMenu.classList.add('fade-out');
                setTimeout(() => {
                    hoverMenu.remove();
                }, 300);  // Remove after the transition completes
            }, 300);
        });

        hoverMenu.addEventListener('mouseenter', function() {
            // Clear the timeout and fade-out class if the mouse re-enters the menu
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
            hoverMenu.classList.remove('fade-out');
        });

    };

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

    newLink.addEventListener('mouseleave', function(e) {
        if (hoverMenu && !hoverMenu.matches(':hover')) {
            hoverMenu.classList.add('fade-out');
            timeoutId = setTimeout(() => {
                hoverMenu.remove();
            }, 300);
        }
    });
}

// Update clock
let currentRotation = 0;
let blockSeconds;
let clockStartTime = null;
let blockStartTime = null;
function updateClock(countUp) {

    if (countUp === true && clockStartTime === null) {
        clockStartTime = new Date().getTime() - (globalSeconds * 1000);
        blockStartTime = new Date().getTime();
    }

    if (clockStartTime !== null) {
        const currentTime = new Date().getTime();
        globalSeconds = Math.floor((currentTime - clockStartTime) / 1000);
        
        if (blockStartTime !== null) {
            blockSeconds = Math.floor((currentTime - blockStartTime) / 1000);
        }
    }

    const hrs = String(Math.floor(globalSeconds / 3600)).padStart(2, '0');
    const mins = String(Math.floor((globalSeconds % 3600) / 60)).padStart(2, '0');
    const secs = String(globalSeconds % 60).padStart(2, '0');
    clock.textContent = `${hrs}:${mins}:${secs}`;

    if (countUp === true) {
        currentRotation = 180;

        const block_hrs = String(Math.floor(blockSeconds / 3600)).padStart(2, '0');
        const block_mins = String(Math.floor((blockSeconds % 3600) / 60)).padStart(2, '0');
        const block_secs = String(blockSeconds % 60).padStart(2, '0');
        clock.textContent = `${hrs}:${mins}:${secs} (${block_hrs}:${block_mins}:${block_secs})`;
    } else {
        clock.textContent = `${hrs}:${mins}:${secs}`;
    }
}

// Handle clock edit
function makeEditable() {
    // Convert current time to editable format
    let currentText = this.innerText;
    let input = document.createElement('input');
    input.value = currentText;
    input.className = 'rename-input darkmode';
    this.replaceWith(input);
    
    // Focus and select the input content
    input.focus();
    input.select();

    // Add event listener for blur and key events
    input.addEventListener('blur', processEdit);
    input.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            processEdit.call(this, e);
        }
    });
}
function processEdit(e) {
    updateDurationS();
    this.removeEventListener('blur', processEdit);
    this.removeEventListener('keydown', processEdit);
    let value = e.target.value;
    let newClock = document.createElement('p');
    newClock.id = 'clock';
    newClock.addEventListener('click', makeEditable);
    if (isValidTime(value)) {
        let seconds = convertToSeconds(value);
        globalSeconds = seconds;
        newClock.textContent = value;
        e.target.replaceWith(newClock);
        addLog(globalTaskId, 'Edit');
    }
}
function isValidTime(time) {
    let regex = /^([0-9]{2}\.){2}[0-9]{2}$/;
    return regex.test(time);
}
function convertToSeconds(time) {
    let [hours, minutes, seconds] = time.split('.').map(Number);
    return hours * 3600 + minutes * 60 + seconds;
}


// Play pause toggle
let timerDuration = 0;
let timerStartDateTime;
let toggleClock = (function() {
    const button = document.querySelector('.button-common');
    const toggleIcon = document.getElementById('toggle-icon');
    const clockDiv = document.getElementById('clock-div');

    let intervalId = null;

    return function() {
        if (toggleIcon.classList.contains('fa-hourglass-end')) {
                clockDiv.classList.add('fade-in-animation');
                timerDuration = 0;
                timerStartDateTime = new Date();
                updateClock(true);
                button.style.transform = `rotate(180deg)`;
                toggleIcon.classList.remove('fa-hourglass-end');
                toggleIcon.classList.add('fa-hourglass-half');
                intervalId = setInterval(() => {
                    timerDuration++; 
                    updateClock(true);
                }, 1000);
            } else {
                clockDiv.classList.remove('fade-in-animation');
                clockStartTime = null;
                toggleIcon.classList.remove('fa-hourglass-half');
                toggleIcon.classList.add('fa-hourglass-end');
                clearInterval(intervalId);
                button.style.transform = `rotate(${currentRotation-180}deg)`;
                currentRotation = 0;
                timerEndDateTime = new Date();
                timerDuration = Math.floor((timerEndDateTime - timerStartDateTime) / 1000);

                newBlock = document.createElement('div');
                newBlock.className = 'time-block';
                newBlock.dataset.startTime = convertUTCToLocalForInput(timerStartDateTime.toISOString().slice(0,16));
                newBlock.dataset.endTime = convertUTCToLocalForInput(timerEndDateTime.toISOString().slice(0,16));
                newBlock.dataset.duration = timerDuration;
                newBlock.dataset.taskId = globalTaskId;
                newBlock.dataset.taskName = document.getElementById('task-name').textContent;
                newBlock.dataset.description = "";
                newBlock.addEventListener('click', () => openTimeDescription(newBlock));
                timeDiv.insertBefore(newBlock, addTimeBlockButton);
                resizeTimeBlocks();

                // POST time block
                const payload = {
                    projectId: globalProjectId,
                    taskId: globalTaskId,
                    start: timerStartDateTime,
                    end: timerEndDateTime,
                    duration: timerDuration,
                    description: ""
                };

                // Send POST request to Flask API
                fetch('/time', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(payload)
                })
                .then(response => response.json())
                .then(data => {
                    if (data.message === "Time block created") {
                        console.log("time block updated")
                        newBlock.dataset.id = data.id;
                    }
                    localStorage.removeItem(`time_cache_${globalProjectId}`);
                });
                calculateTaskTotalTime(globalTaskId, changed=true);
            }
        };
})();
document.getElementById('clock').addEventListener('click', toggleClock);

// Create a new time block on click
addTimeBlockButton = document.getElementById('add-a-time-block');
function createTimeBlock() {
    timeDiv.style.border = '';
    newBlock = document.createElement('div');
    newBlock.className = 'time-block';
    newBlock.dataset.duration = 3600;
    timerStartDateTime = new Date();
    timerEndDateTime = new Date();
    timerStartDateTime.setSeconds(timerEndDateTime.getSeconds() - parseInt(newBlock.dataset.duration));
    newBlock.dataset.startTime = convertUTCToLocalForInput(timerStartDateTime.toISOString().slice(0,16));
    newBlock.dataset.endTime = convertUTCToLocalForInput(timerEndDateTime.toISOString().slice(0,16));
    newBlock.dataset.duration = 3600;
    newBlock.dataset.id = -1;
    newBlock.dataset.taskId = globalTaskId;
    newBlock.dataset.projectId = globalProjectId;
    newBlock.dataset.description = '';
    newBlock.dataset.taskName = document.getElementById('task-name').textContent;
    newBlock.addEventListener('click', () => openTimeDescription(newBlock));
    timeDiv.insertBefore(newBlock, addTimeBlockButton);
    openTimeDescription(newBlock);
    resizeTimeBlocks();

    newBlock.style.backgroundColor = 'transparent';
    newBlock.style.border = `2px dashed ${dayColors[todaysDayOfWeek]}`;
    showCommitTimeButton(endTimeInput);
}
addTimeBlockButton.addEventListener('click', createTimeBlock);

// Resize time blocks
function resizeTimeBlocks() {
    const timeDivDiv = document.getElementById('time-div-div');
    const timeBlocks = document.querySelectorAll(".time-block");
    
    // get time bounds 
    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const startOfWeek = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate() - today.getDay()
    );    
    startOfWeek.setHours(0, 0, 0, 0);

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 7);

    let totalDuration = 0;
    let totalDurationToday = 0;
    let totalDurationThisWeek = 0;
    let smallestDuration = Infinity;
    
    timeBlocks.forEach(block => {
        const duration = parseInt(block.dataset.duration, 10);
        totalDuration += duration;
    
        if (duration < smallestDuration) {
            smallestDuration = duration;
        }
    
        const startTime = new Date(block.dataset.startTime);
        if (startTime >= startOfToday && startTime < new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000)) {
            totalDurationToday += duration;
        }    
        if (startTime >= startOfWeek && startTime < endOfWeek) {
            totalDurationThisWeek += duration;
        }
    });

    timeDiv.style.width = '100%';
    let minDenominator = 100;
    if (smallestDuration < totalDuration/minDenominator) {
        let widthFraction = smallestDuration / totalDuration;
        let divWidth = (timeDivDiv.offsetWidth * ((1/minDenominator)/widthFraction)) + 'px';
        timeDiv.style.width = divWidth;
    }

    const hoursLogged = document.getElementById('hours-logged');
    const hoursRounded = (totalDuration / 60 / 60).toFixed(2);
    hoursLogged.textContent = `${hoursRounded} hour${s(hoursRounded)} this month, ${(totalDurationThisWeek / 60 / 60).toFixed(2)} this week, ${(totalDurationToday / 60 / 60).toFixed(2)} today`;

    timeBlocks.forEach(block => {
        let duration = parseInt(block.dataset.duration, 10);
        let widthPercentage = (duration / totalDuration);
        block.style.width = widthPercentage * divWidth + 'px';
    });
}

document.addEventListener("DOMContentLoaded", function() {
    // Toggle on click
    const toggleButton = document.getElementById('toggle-button');
    toggleButton.addEventListener('click', function() {
        toggleClock();
    })

    // Add log upon enter
    const logInput = document.getElementById('log-input');
    logInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            if (!e.shiftKey) {
                e.preventDefault();
                addLog(globalTaskId, logType='Comment');
            }
        }
    });

    // Function to update the height of inputElement
    function updateInputHeight(input) {
        input.style.height = input.scrollHeight + 'px !important';
    }
    logInput.addEventListener('input', () => updateInputHeight(logInput));
    updateInputHeight(logInput);


    // Mark task as completed or not yet completed when taskbox is checked
    const taskCheckbox = document.getElementById('task-checkbox');
    const taskLabel = document.getElementById('task-name');

    taskCheckbox.addEventListener('click', function(event) {
        const isCompleted = taskCheckbox.checked ? true : false;
        completeTask(taskCheckbox, taskLabel, isCompleted);

        if (isCompleted === true) {
            // Confetti
            const x = event.clientX;
            const y = event.clientY;
            createConfetti(x, y);
        }

        const toggleIcon = document.getElementById('toggle-icon');
        if (toggleIcon.classList.contains('fa-hourglass-half')){
            toggleClock();
        }
    });
});

// Complete task
function completeTask(taskCheckbox, taskLabel, isCompleted, taskId) {
    const selectedTask = document.querySelector(`p[data-taskId="${taskId}"]`);
    const listItem = selectedTask.closest('li');

    if (isCompleted) {
        selectedTask.style.textDecoration = 'line-through';
        taskLabel.style.textDecoration = 'line-through';
        taskCheckbox.checked = true;
        listItem.setAttribute('data-completed',true);
        listItem.style.height = '0px'
        listItem.style.height = '0px';
        listItem.style.overflow = 'hidden';
        listItem.style.margin = 'auto';
    }
    else {
        selectedTask.style.textDecoration = '';
        taskLabel.style.textDecoration = '';
        taskCheckbox.checked = false;
        listItem.setAttribute('data-completed',false);
        listItem.style.height = 'auto';
        listItem.style.overflow = 'visible';
        listItem.style.marginBottom = '5px';
    }

    //calculateListHeight();

    fetch(`/tasks`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            taskId: globalTaskId,
            isCompleted: isCompleted,
            totalSeconds: globalSeconds
        })
        })
        .catch(error => {
        console.error(error);
    });

    localStorage.removeItem(`tasks_cache_${globalProjectId}`);

}

// Complete project
function completeProject(projectId, isCompleted) {
    const selectedProject = document.querySelector(`p[data-projectId="${projectId}"]`);
    const listItem = selectedProject.closest('li');
    
    if (isCompleted) {
        selectedProject.style.textDecoration = 'line-through';
        listItem.setAttribute('data-completed',true);
        listItem.style.height = '0px'
        listItem.style.height = '0px';
        listItem.style.overflow = 'hidden';
        listItem.style.margin = 'auto';
    }
    else {
        selectedProject.style.textDecoration = '';
        listItem.setAttribute('data-completed',false);
        listItem.style.height = 'auto';
        listItem.style.overflow = 'visible';
        listItem.style.marginBottom = '5px';
    }

    //calculateListHeight();

    fetch(`/projects`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            projectId: projectId,
            isCompleted: isCompleted
        })
        })
        .then(response => response.json())
        .then(data => {
            //populateProjects();
            localStorage.removeItem(`projects_cache_${globalUserId}`);
        })
        .catch(error => {
        console.error(error); // Handle errors
    }); 
}

// Rename project
function renameProject(projectId, newName){
    localStorage.removeItem(`projects_cache_${globalUserId}`);

    fetch(`/projects`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            projectId: projectId,
            name: newName
        })
        })
        .then(response => response.json())
        .then(data => {
            populateProjects();
        })
        .catch(error => {
            console.error(error); 
    });
}

// Delete project
function deleteProject(projectId){
    localStorage.removeItem(`projects_cache_${globalUserId}`);
    fetch(`/projects`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            projectId: projectId,
            isVisible: false
        })
        })
        .then(response => response.json())
        .then(data => {
            populateProjects();
        })
        .catch(error => {
        console.error(error); // Handle errors
    });
}

// Rename task
function renameTask(taskId, newName){
    localStorage.removeItem(`tasks_cache_${globalProjectId}`);
    fetch(`/tasks`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            taskId: taskId,
            name: newName,
            totalSeconds: globalSeconds
        })
        })
        .then(response => response.json())
        .then(data => {
            const taskLabel = document.getElementById('task-name');
            taskLabel.textContent = newName;
        })
        .catch(error => {
        console.error(error); // Handle errors
    });
}

// Delete task
function deleteTask(taskId){
    localStorage.removeItem(`tasks_cache_${globalProjectId}`);
    fetch(`/tasks`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            taskId: taskId,
            isVisible: false,
            totalSeconds: globalSeconds
        })
        })
        .then(response => response.json())
        .then(data => {
            if (data.message === "Task updated") {
                const logDiv = document.getElementById('log-div');
                const logContent = document.getElementById('log-content');
                globalTaskId=undefined;
                populateTasks(globalProjectId);
            }
        })
        .catch(error => {
        console.error(error); // Handle errors
    });
}

// Delete log
function deleteLog(logItem) {
    localStorage.removeItem(`logs_cache_${globalTaskId}`);
    const logItemsContainer = document.getElementById('log-items-container');
    const pinnedLogsContainer = document.getElementById('pinned-logs-container');

    const logId = logItem.getAttribute('data-logId');
    const isPinned = logItem.getAttribute('data-isPinned');

    logItem.style.opacity = '0';

    if (isPinned === 'true') {
        setTimeout(() => pinnedLogsContainer.removeChild(logItem), 250);
    } else {
        setTimeout(() => logItemsContainer.removeChild(logItem), 250);
    }    

    fetch(`logs`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            taskId: globalTaskId,
            projectId: globalProjectId,
            logId: logId,
            delete: true
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.message === "Log deleted") {
            console.log('log deleted');
        }
    });
}

// Pin log
function pinLog(logItem) {
    localStorage.removeItem(`logs_cache_${globalTaskId}`);

    const logItemsContainer = document.getElementById('log-items-container');
    const pinnedLogsContainer = document.getElementById('pinned-logs-container');

    const logId = logItem.getAttribute('data-logId');
    const isPinned = logItem.getAttribute('data-isPinned');

    if (logItem) {
        if (isPinned === 'true') {

            // Unpin if pinned
            hiddenLogItem = logItemsContainer.querySelector(`[data-logId="${logId}"]`);
            hiddenLogItem.style.height = 'auto';
            hiddenLogItem.style.padding = '15px';
            hiddenLogItem.style.display = 'block';

            // Make sure the text content is updated
            const hiddenDescription = hiddenLogItem.querySelector('.log-description');
            const pinnedDescription = logItem.querySelector('.log-description');
            hiddenDescription.innerHTML = pinnedDescription.innerHTML;
            pinnedLogsContainer.removeChild(logItem);
        } else {
            // Pin if not pinned
            let clonedLogItem = logItem.cloneNode(true);
            
            // Make buttons dark
            const logOptionButtons = clonedLogItem.querySelectorAll('.log-option-button');
            logOptionButtons.forEach(button => {
                button.classList.add('dark')
            });

            // Hide item in regular log
            logItem.style.height = '0px';
            logItem.style.padding = '0px';
            logItem.style.overflow = 'hidden';
            logItem.style.display = 'none';

            // Create item in pinned log
            clonedLogItem.style.opacity = '1'; 
            clonedLogItem.style.background = 'var(--text-color)';
            clonedLogItem.style.color = '#161616';
            pinnedLogsContainer.appendChild(clonedLogItem);
            clonedLogItem.setAttribute('data-isPinned', 'true');

            const pinOption = clonedLogItem.querySelector('#pin-option-button');
            const editOption = clonedLogItem.querySelector('#edit-option-button');
            const deleteOption = clonedLogItem.querySelector('#delete-option-button');

            const logOptions = clonedLogItem.querySelector('.log-options-div');
            logOptions.style.minWidth = '20px';
            logOptions.style.minHeight = '15px';
            pinOption.style.minWidth = '15px';

            addLogPinClickListener(pinOption, clonedLogItem);
            addLogEditClickListener(editOption, clonedLogItem);
            addLogDeleteClickListener(deleteOption, clonedLogItem);

        }
    }

    // Update log
    fetch(`logs`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            projectId: globalProjectId,
            taskId: globalTaskId,
            logId: logId,
            isPinned: isPinned !== 'true'
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.message === "Log updated") {
            console.log('log updated');
        }
    });
}

function editLog(logItem) {
    const logDescription = logItem.querySelector('.log-description');
    const logOptions = logItem.querySelector('.log-options-div');
    const inputElement = document.createElement('div');
    inputElement.style.height = logDescription.scrollHeight + 'px';
    inputElement.classList.add('log-edit-area');
    inputElement.classList.add('dark');
    inputElement.contentEditable = "true";

    logItem.style.border = '2px dashed var(--text-color)';
    logItem.style.background = 'transparent';
    
    var originalPadding = parseInt(logItem.style.padding, 10);
    logItem.style.padding = originalPadding - 2 + 'px';

    const description = logDescription.innerHTML;
    inputElement.innerHTML = description;
    logOptions.style.display = 'none';

    // Replace the description with the input element
    logDescription.parentNode.replaceChild(inputElement, logDescription);

    // Focus the input and select its content
    inputElement.focus();
    //inputElement.select();


    // Function to revert changes
    function revertEdit() {
        if (inputElement.parentNode) {
            inputElement.parentNode.replaceChild(logDescription, inputElement);
            inputElement.removeEventListener('keydown', escHandler); 
            logOptions.style.display = 'flex';
            
            logItem.style.border = 'none';
            logItem.style.background = 'var(--text-color)';
            logItem.style.padding = originalPadding + 'px';

        }
    }

    // Function to handle escape key
    function escHandler(event) {
        if (event.key === 'Escape') {
            revertEdit();
        }
    }

    // Add log upon enter
    function enterHandler(e) {
        if (e.key === 'Enter') {
            if (!e.shiftKey) {
                e.preventDefault();
                commitLogEdit();
            }
        }
    };
    inputElement.addEventListener('keypress', enterHandler);

    // Function to update the height of inputElement
    function updateInputHeight(input) {
        input.style.height = 'auto';
        input.style.height = input.scrollHeight + 'px !important';
    }
    inputElement.addEventListener('keypress', () => setTimeout(updateInputHeight(inputElement),5));
    updateInputHeight(inputElement);

    // Add event listener for the escape key
    inputElement.addEventListener('keydown', escHandler);

    // Function to commit changes
    function commitLogEdit() {
        const newDescription = inputElement.innerHTML;
        logDescription.innerHTML = newDescription;

        if (inputElement.parentNode) {
            inputElement.parentNode.replaceChild(logDescription, inputElement);
            inputElement.removeEventListener('keydown', enterHandler); 
            logOptions.style.display = 'flex';
            
            logItem.style.border = 'none';
            logItem.style.background = 'var(--text-color)';
            logItem.style.padding = originalPadding + 'px';

            // Update log
            fetch(`logs`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    taskId: globalTaskId,
                    projectId: globalProjectId,
                    logId: logItem.getAttribute('data-logId'),
                    newDescription: newDescription
                })
            })
            .then(response => response.json())
            .then(data => {
                if (data.message === "Log updated") {
                    console.log('log updated');
                    localStorage.removeItem(`logs_cache_${globalTaskId}`);
                }
            });
        }
    }
}

// Add click listeners to export buttons
//const userExport = document.getElementById('users-csv');
//userExport.addEventListener('click', function() {
//    exportCsv('auth',globalUserId);
//})
const projectExport = document.getElementById('project-csv');
projectExport.addEventListener('click', function() {
    exportCsv('user_id',globalUserId);
})
const taskExport = document.getElementById('task-csv');
taskExport.addEventListener('click', function() {
    exportCsv('project_id',globalProjectId);
})
const logExport = document.getElementById('log-csv');
logExport.addEventListener('click', function() {
    exportCsv('time',globalProjectId);
})
const timeExport = document.getElementById('time-csv');
timeExport.addEventListener('click', function() {
    exportCsv('days',globalProjectId);
})


// Ping export backend
function exportCsv(arg, id) {
    // Generate filename based on arg
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hour = String(now.getHours()).padStart(2, '0');
    const minute = String(now.getMinutes()).padStart(2, '0');

    let prefix = 'anolog_';

    let dataType = '';
    if (arg === 'user_id') {
        dataType = 'projects';
    } else if (arg === 'project_id') {
        dataType = 'tasks';
    } else if (arg === 'time') {
        dataType = 'time';
    } else if (arg === 'days') {
        dataType = 'days';
    }

    const filename = `${prefix}${dataType}_${year}${month}${day}${hour}${minute}`;

    // Fetch CSV data and trigger download
    fetch(`/export_csv?${arg}=${id}`)
    .then(response => response.blob())
    .then(blob => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = `${filename}.csv`;  // Use the dynamically generated filename
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
    })
    .catch(error => console.error('Error:', error));
}

// Collapse left menu
document.querySelector('.toggle').addEventListener('click', function() {
    const listContainer = document.querySelector('.list-container')
    const menuButton = document.getElementById('menu-button');
    if (menuButton.className === "fa-solid fa-bars") {
        listContainer.classList.remove('list-collapsed');
        menuButton.className = "fa-solid fa-square-minus";
        setTimeout(resizeTimeBlocks,150);
    }
    else {          
        listContainer.classList.add('list-collapsed');
        void listContainer.offsetWidth;
        menuButton.className = "fa-solid fa-bars";
        setTimeout(resizeTimeBlocks,150);
    }
});

// Open export menu
const exportButton = document.getElementById('export-button');
const dropdownMenu = document.getElementById('dropdown-menu');
function addBorderRadius() {
    exportButton.style.borderRadius = '10px 10px 0 0';
    exportButton.style.width = '80px';
}
function removeBorderRadius() {
    exportButton.style.borderRadius = '10px';  
    exportButton.style.width = '44px';
}
exportButton.addEventListener('mouseover', addBorderRadius);
exportButton.addEventListener('mouseout', removeBorderRadius);
dropdownMenu.addEventListener('mouseover', addBorderRadius);
dropdownMenu.addEventListener('mouseout', removeBorderRadius);

// Collapse menu only on mobile
const listContainer = document.querySelector('.list-container');
const menuButton = document.getElementById('menu-button');
function setClassForScreenSize() {
    if (window.innerWidth >= 769) {
        resizeTimeBlocks();
    } else {
        resizeTimeBlocks();
    }
}

let blockResizeTimeout;
let listResizeTimeout;
let dayResizeTimeout;
window.addEventListener('resize', () => {

    clearTimeout(blockResizeTimeout);
    clearTimeout(listResizeTimeout);
    blockResizeTimeout = setTimeout(resizeTimeBlocks, 100);
    //listResizeTimeout = setTimeout(calculateListHeight, 100);
    dayResizeTimeout = setTimeout(resizeDays, 200);
    setClassForScreenSize();
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

// Update user's color field
document.addEventListener('change', function(event) {
    if (event.target.id === 'color-picker') {
        document.documentElement.style.setProperty('--primary-color', event.target.value);
        // Send PUT to /user endpoint
        fetch('/user', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({userId: globalUserId, color: event.target.value }),
        });
    }
});

// Confetti
function createConfetti(x, y) {
    const confettiCount = 40;
    const colors = ['#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF'];

        for(let i = 0; i < confettiCount; i++) {
            const confetti = document.createElement('div');
            const randomColor = colors[Math.floor(Math.random() * colors.length)];
            confetti.style.backgroundColor = randomColor;
            confetti.className = 'confetti';
            confetti.style.left = `${x}px`;
            confetti.style.top = `${y}px`;
            document.body.appendChild(confetti);

            // Randomize initial position and rotation
            confetti.style.setProperty('--initial-x', `${Math.random() * 30 - 15}px`);
            confetti.style.setProperty('--initial-y', `${Math.random() * 30 - 15}px`);
            confetti.style.setProperty('--rotation', `${Math.random() * 360}deg`);
            confetti.style.setProperty('--speed', `${Math.random() * .1 + 0.5}s`);

            // Remove after animation completes
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
function toggleDarkmode(initialToggle) {
    const logo = document.querySelector('.logo');
    const title = document.querySelector('h1');
    const darkmodeIcon = document.querySelector('#darkmode-icon');

    if (initialToggle) {
        darkmode = !darkmode;
    }

    if (darkmode) {
        // Make lightmode
        darkmode = false;
        document.body.style.backgroundColor = "var(--text-color)";
        darkmodeIcon.className = "fa-regular fa-moon";
        darkmodeIcon.style.fontSize = "14pt";
        title.style.color = "var(--card-color)";
    }
    else {
        // Make darkmode
        darkmode = true;
        document.body.style.backgroundColor = "#000000";
        darkmodeIcon.className = "fa-solid fa-moon";
        darkmodeIcon.style.fontSize = "14pt";
        title.style.color =  "var(--text-color)";
    }

    if (!firstLoad) {
    // Send PUT to /user endpoint
        fetch('/user', {
            method: 'PUT',
            headers: {
                    'Content-Type': 'application/json',
            },
            body: JSON.stringify({userId: globalUserId, darkmode: darkmode }),
        });
    }
    firstLoad = false;
}
const darkmodeButton = document.querySelector('.darkmode-button');
darkmodeButton.addEventListener('click', function() {
    toggleDarkmode();
})
toggleDarkmode(initialToggle=true);

// Toggle show completed
function toggleShowCompleted(type) {
    let completed = document.querySelectorAll(`#${type}-list-ul li[data-completed=true]`);
    if (type === 'task') {
        showCompleted = showCompletedTasks;
    }
    else {
        showCompleted = showCompletedProjects;
    }
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
    if (type === 'task') {
        showCompletedTasks = !showCompletedTasks;
    }
    else {
        showCompletedProjects = !showCompletedProjects;
    }

}
const showCompletedTaskToggle = document.getElementById('toggle-completed-tasks');
showCompletedTaskToggle.addEventListener('click', function() {
    toggleShowCompleted('task');
    if (showCompletedTasks) {
        showCompletedTaskToggle.className = 'toggle-completed fa-solid fa-eye';
        showCompletedTaskToggle.title = "Hide Completed Tasks";
    } else {
        showCompletedTaskToggle.className = 'toggle-completed fa-solid fa-eye-slash';
        showCompletedTaskToggle.title = "Hide Completed Tasks";
    }
});
const showCompletedProjectToggle = document.getElementById('toggle-completed-projects');
showCompletedProjectToggle.addEventListener('click', function() {
    toggleShowCompleted('project');
    if (showCompletedProjects) {
        showCompletedProjectToggle.className = 'toggle-completed fa-solid fa-eye';
        showCompletedProjectToggle.title = "Hide Completed Projects";
    } else {
        showCompletedProjectToggle.className = 'toggle-completed fa-solid fa-eye-slash';
        showCompletedProjectToggle.title = "Hide Completed Projects";
    }
});

// Add a task or project
function addNewItem(type) {
    //calculateListHeight();
    const projectUlElement = document.getElementById('project-list-ul');
    const taskUlElement = document.getElementById('task-list-ul');
    const targetUl = type === 'project' ? projectUlElement : taskUlElement;

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
            } else if (type === 'task') {
                addTask(globalProjectId);
                newInput.blur();
            }
            newInput.focus();
        }
        //calculateListHeight();
    });

    // Remove the input when it loses focus
    newInput.addEventListener('blur', function() {
        targetUl.removeChild(newLi);
    });

    newLi.appendChild(newInput);
    targetUl.insertBefore(newLi, targetUl.firstChild);
    newInput.focus();
}

document.querySelectorAll('.add-button').forEach(button => {
    button.addEventListener('click', function() {
        if (this.id === 'add-a-task') {
            addNewItem('task');
        } else if (this.id === 'add-a-project') {
            addNewItem('project');
        }
    });
});

// Keep list container correct size
const listDiv = document.querySelector('.list-div');
function calculateListHeight() {
    let listHeight = listDiv.offsetHeight;
    var totalHeight = listHeight + 50;
    
    listContainer.style.height = totalHeight + 'px';
    if (window.innerWidth >= 769) {
        //listContainer.style.width = 270 + 'px';
    }
    else {
        //listContainer.style.width = 'auto';
    }
}
listContainer.addEventListener('click', function() {
    //calculateListHeight();
});
//calculateListHeight();

// Update duration text
const startTimeInput = document.getElementById('start-time-input');
const endTimeInput = document.getElementById('end-time-input');
const durationText = document.getElementById('duration');

function updateDurationText() {
    const startTime = new Date(startTimeInput.value);
    const endTime = new Date(endTimeInput.value);
    const differenceInMilliseconds = endTime - startTime;
    const hoursFromInput = differenceInMilliseconds / (1000 * 60 * 60);
    if (!isNaN(startTime.getTime()) && !isNaN(endTime.getTime()) && hoursFromInput>0) {
        durationText.textContent = hoursFromInput.toFixed(2); 
    } else {
        hideCommitTimeButton();
    }
    updateDurationS();
}

// Commit time block edit
function commitTimeBlock(block) {
    const startTime = new Date(startTimeInput.value);
    const endTime = new Date(endTimeInput.value);
    const differenceInMilliseconds = endTime - startTime;
    const duration = (differenceInMilliseconds / 1000).toFixed(0);
    const description = timeDescriptionText.value;
    
    block.dataset.startTime = convertUTCToLocalForInput(startTime.toISOString().slice(0,16));
    block.dataset.endTime = convertUTCToLocalForInput(endTime.toISOString().slice(0,16));
    block.dataset.duration = duration;
    block.style.border = '0px';
    block.style.backgroundColor = dayColors[todaysDayOfWeek];
    block.dataset.description = description;
    
    // construct task PUT payload
    const putPayload = {
        projectId: globalProjectId,
        taskId: globalTaskId,
        timeId: block.dataset.id,
        start: startTime,
        end: endTime,
        duration: duration,
        description: description
    };

    // Send PUT request to Flask API
    fetch('/time', {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(putPayload)
    })
    .then(response => response.json())
    .then(data => {
        if (data.message === "Time block updated") {
            console.log("time block updated")
            block.dataset.id = data.time_id;
            calculateTaskTotalTime(block.dataset.taskId, changed=true);
            localStorage.removeItem(`time_cache_${globalProjectId}`);
            localStorage.removeItem('days_cache');
            setTimeout(populateDays, 500);
            resizeTimeBlocks();
        }
    });
}

// Allow user to commit
const commitTimeBlockButton = document.getElementById('commit-time-block-button');
function showCommitTimeButton(startOrEndInput) {
    startOrEndInput.style.backgroundColor = 'yellow';
    commitTimeBlockButton.style.display = 'inline';
    updateDurationText();
}
function hideCommitTimeButton() {
    const startOrEndInputs = document.querySelectorAll('.datetime-input');
    startOrEndInputs.forEach(function(startOrEndInput) {
        startOrEndInput.style.backgroundColor = 'transparent';
    });
    commitTimeBlockButton.style.display = 'none';
    timeDescriptionText.style.background = 'none';
}

// Ask to save and highlight changes upon edit
startTimeInput.addEventListener('change', function(e) {
    showCommitTimeButton(startTimeInput);
});    
endTimeInput.addEventListener('change', function(e) {
    showCommitTimeButton(endTimeInput);
}); 
timeDescriptionText.addEventListener('change', function(e) {
    showCommitTimeButton(timeDescriptionText);
});  

// Commit and update stylings upon save
commitTimeBlockButton.addEventListener('click', () => {
    commitTimeBlock(activeBlock);
    hideCommitTimeButton();
});

// Calculate task total time
function calculateTaskTotalTime(taskId, changed) {
    const blocks = document.querySelectorAll('.time-block');
    let totalSeconds = 0;
    
    blocks.forEach(block => {
        if (block.dataset.taskId == taskId) {
            totalSeconds += parseInt(block.dataset.duration, 10);
        }
    });

    globalSeconds = totalSeconds;
    updateClock();

    const taskItem = document.querySelector(`[data-taskid="${taskId}"]`);
    taskItem.dataset.totalSeconds = globalSeconds;

    if (changed) {
        // construct PUT payload
        const putPayload = {
            taskId: taskId,
            totalSeconds: globalSeconds
        };

        // Send PUT request to Flask API
        fetch('/tasks', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(putPayload)
        })
    }
}

// Delete time block
function deleteActiveTimeBlock() {
    const putPayload = {
        timeId: activeBlock.dataset.id,
        taskId: activeBlock.dataset.taskId,
        projectId: activeBlock.dataset.projectId,
        isVisible: false
    };

    // Send PUT request to Flask API
    fetch('/time', {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(putPayload)
    })
    .then(response => response.json())
    .then(data => {
        if (data.message === "Time block updated") {
            console.log("time block updated")
            taskId = putPayload.taskId;

            const timeBlocks = document.querySelectorAll('.time-block');
            timeDiv.removeChild(activeBlock);
            resizeTimeBlocks();
            timeBlocks.forEach(function(b) {
                b.style.opacity = "1";
                b.style.borderRadius = '5px';
            });
            timeDescriptionContainer.style.height = '0px';
            timeDiv.style.borderRadius = '7px';
            activeBlock = null;
            calculateTaskTotalTime(taskId, changed=true);  
            closeTimeDescription();              
        }
        localStorage.removeItem(`time_cache_${globalProjectId}`);
    });
}
const deleteActiveTimeBlockButton = document.getElementById('delete-time-block-button');
deleteActiveTimeBlockButton.addEventListener('click',deleteActiveTimeBlock);


// Load
populateProjects();