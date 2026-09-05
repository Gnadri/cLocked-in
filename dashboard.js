document.addEventListener('DOMContentLoaded', () => {
    let currentDate = new Date();
    let taskHistory = [];
    let goalTrackerGoals = [];
    let goalTrackerEntries = {};
    let goalWeekDate = getStartOfWeek(new Date());
    let goalTimelineMode = 'good';

    // Load data once
    chrome.storage.local.get(['taskHistory', 'goalTrackerGoals', 'goalTrackerEntries'], (result) => {
        taskHistory = result.taskHistory || [];
        goalTrackerGoals = result.goalTrackerGoals || [];
        goalTrackerEntries = result.goalTrackerEntries || {};
        updateStats();
        renderCalendar();
        renderGoalTracker();
    });

    // Event Listeners
    document.getElementById('prev-month').addEventListener('click', () => {
        currentDate.setDate(1); // Avoid month overflow
        currentDate.setMonth(currentDate.getMonth() - 1);
        renderCalendar();
    });

    document.getElementById('next-month').addEventListener('click', () => {
        currentDate.setDate(1); // Avoid month overflow
        currentDate.setMonth(currentDate.getMonth() + 1);
        renderCalendar();
    });

    document.getElementById('today-btn').addEventListener('click', () => {
        currentDate = new Date();
        renderCalendar();
    });

    // Day View Elements
    const calHeader = document.getElementById('cal-header-main');
    const calGrid = document.getElementById('calendar-grid');
    const dayView = document.getElementById('day-view');
    const btnBack = document.getElementById('btn-back-cal');
    const dayTimeline = document.getElementById('day-timeline');
    const dayViewDate = document.getElementById('day-view-date');
    const goalsButton = document.getElementById('goals-btn');
    const goalTracker = document.getElementById('goal-tracker');
    const goalWeekLabel = document.getElementById('goal-week-label');
    const goalTableHead = document.getElementById('goal-table-head');
    const goalTableBody = document.getElementById('goal-table-body');
    const goalForm = document.getElementById('goal-create-form');
    const goalNameInput = document.getElementById('goal-name-input');
    const goalTypeInput = document.getElementById('goal-type-input');
    const goalTargetField = document.getElementById('goal-target-field');
    const goalTargetInput = document.getElementById('goal-target-input');
    const goalGoodTimeline = document.getElementById('goal-good-timeline');
    const goalBadTimeline = document.getElementById('goal-bad-timeline');
    const goalTimelineHint = document.getElementById('goal-timeline-hint');

    goalsButton.addEventListener('click', () => {
        goalTracker.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    document.getElementById('goal-prev-week').addEventListener('click', () => {
        goalWeekDate.setDate(goalWeekDate.getDate() - 7);
        renderGoalTracker();
    });

    document.getElementById('goal-next-week').addEventListener('click', () => {
        goalWeekDate.setDate(goalWeekDate.getDate() + 7);
        renderGoalTracker();
    });

    document.getElementById('goal-current-week').addEventListener('click', () => {
        goalWeekDate = getStartOfWeek(new Date());
        renderGoalTracker();
    });

    goalGoodTimeline.addEventListener('click', () => {
        goalTimelineMode = 'good';
        renderGoalTracker();
    });

    goalBadTimeline.addEventListener('click', () => {
        goalTimelineMode = 'bad';
        renderGoalTracker();
    });

    goalTypeInput.addEventListener('change', () => {
        const isCountable = goalTypeInput.value === 'countable';
        goalForm.classList.toggle('is-countable', isCountable);
        goalTargetField.hidden = !isCountable;
        goalTargetInput.required = isCountable;
    });

    goalForm.addEventListener('submit', (event) => {
        event.preventDefault();

        const name = goalNameInput.value.trim();
        const type = goalTypeInput.value === 'countable' ? 'countable' : 'checkoff';
        const dailyTarget = type === 'countable' ? Number.parseInt(goalTargetInput.value, 10) : null;
        if (!name || (type === 'countable' && (!Number.isFinite(dailyTarget) || dailyTarget < 1))) return;

        goalTrackerGoals.push({
            id: globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function'
                ? globalThis.crypto.randomUUID()
                : `goal-${Date.now()}`,
            name,
            type,
            dailyTarget
        });

        chrome.storage.local.set({ goalTrackerGoals }, () => {
            goalForm.reset();
            goalForm.classList.remove('is-countable');
            goalTargetField.hidden = true;
            goalTargetInput.required = false;
            renderGoalTracker();
            goalNameInput.focus();
        });
    });

    function getStartOfWeek(value) {
        const date = new Date(value);
        date.setHours(12, 0, 0, 0);
        const daysSinceMonday = (date.getDay() + 6) % 7;
        date.setDate(date.getDate() - daysSinceMonday);
        return date;
    }

    function getDateKey(date) {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    }

    function getGoalWeekDays() {
        const monday = getStartOfWeek(goalWeekDate);
        return Array.from({ length: 7 }, (_, index) => {
            const date = new Date(monday);
            date.setDate(monday.getDate() + index);
            return date;
        });
    }

    function setGoalEntry(goalId, dateKey, value) {
        if (!goalTrackerEntries[goalId]) goalTrackerEntries[goalId] = {};

        if (value === false || value === '' || value === null || value === 0) {
            delete goalTrackerEntries[goalId][dateKey];
        } else {
            goalTrackerEntries[goalId][dateKey] = value;
        }

        if (Object.keys(goalTrackerEntries[goalId]).length === 0) {
            delete goalTrackerEntries[goalId];
        }

        chrome.storage.local.set({ goalTrackerEntries }, renderGoalTracker);
    }

    function deleteGoal(goal) {
        if (!confirm(`Delete "${goal.name}" and its tracked history?`)) return;

        goalTrackerGoals = goalTrackerGoals.filter((item) => item.id !== goal.id);
        delete goalTrackerEntries[goal.id];
        chrome.storage.local.set({ goalTrackerGoals, goalTrackerEntries }, renderGoalTracker);
    }

    function renderGoalTracker() {
        if (!goalTableHead || !goalTableBody) return;

        const isBadTimeline = goalTimelineMode === 'bad';
        goalGoodTimeline.classList.toggle('good-active', !isBadTimeline);
        goalBadTimeline.classList.toggle('bad-active', isBadTimeline);
        goalGoodTimeline.setAttribute('aria-pressed', String(!isBadTimeline));
        goalBadTimeline.setAttribute('aria-pressed', String(isBadTimeline));
        goalForm.hidden = isBadTimeline;
        goalTimelineHint.textContent = isBadTimeline
            ? 'Completed goals are shown here. Uncheck one or lower its count to return it to Good Timeline.'
            : 'Complete a goal and it will automatically move out of this view.';

        const weekDays = getGoalWeekDays();
        const todayKey = getDateKey(new Date());
        const rangeStart = weekDays[0];
        const rangeEnd = weekDays[6];
        const startText = rangeStart.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            ...(rangeStart.getFullYear() !== rangeEnd.getFullYear() ? { year: 'numeric' } : {})
        });
        const endText = rangeEnd.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
        goalWeekLabel.textContent = `${startText} – ${endText}`;

        goalTableHead.innerHTML = '';
        const headerRow = document.createElement('tr');
        const goalHeader = document.createElement('th');
        goalHeader.textContent = 'Goal / Task';
        headerRow.appendChild(goalHeader);

        weekDays.forEach((date) => {
            const header = document.createElement('th');
            if (getDateKey(date) === todayKey) header.classList.add('goal-today');
            header.textContent = date.toLocaleDateString('en-US', { weekday: 'short' });

            const dateLabel = document.createElement('span');
            dateLabel.className = 'goal-day-date';
            dateLabel.textContent = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            header.appendChild(dateLabel);
            headerRow.appendChild(header);
        });

        const progressHeader = document.createElement('th');
        progressHeader.className = 'goal-progress-col';
        progressHeader.textContent = 'Progress';
        headerRow.appendChild(progressHeader);

        const actionsHeader = document.createElement('th');
        actionsHeader.className = 'goal-actions-col';
        actionsHeader.setAttribute('aria-label', 'Actions');
        headerRow.appendChild(actionsHeader);
        goalTableHead.appendChild(headerRow);

        goalTableBody.innerHTML = '';
        if (goalTrackerGoals.length === 0) {
            const emptyRow = document.createElement('tr');
            const emptyCell = document.createElement('td');
            emptyCell.className = 'goal-empty';
            emptyCell.colSpan = 10;
            emptyCell.textContent = isBadTimeline
                ? 'No goals yet. Switch to Good Timeline to add one.'
                : 'No goals yet. Add your first daily goal above.';
            emptyRow.appendChild(emptyCell);
            goalTableBody.appendChild(emptyRow);
            return;
        }

        let visibleGoalCount = 0;
        goalTrackerGoals.forEach((goal) => {
            const row = document.createElement('tr');
            const nameCell = document.createElement('td');
            const name = document.createElement('div');
            name.className = 'goal-name';
            name.textContent = goal.name;
            const type = document.createElement('div');
            type.className = 'goal-type';
            const dailyTarget = globalThis.GoalTrackerLogic.getDailyTarget(goal);
            type.textContent = goal.type === 'countable' ? `Count · ${dailyTarget}/day` : 'Daily checkoff';
            nameCell.append(name, type);
            row.appendChild(nameCell);

            let completedDays = 0;
            let weeklyCount = 0;
            let visibleCellCount = 0;
            weekDays.forEach((date) => {
                const dateKey = getDateKey(date);
                const value = goalTrackerEntries[goal.id] && goalTrackerEntries[goal.id][dateKey];
                const cell = document.createElement('td');
                if (dateKey === todayKey) cell.classList.add('goal-today');

                if (goal.type === 'countable') {
                    const count = Number(value) || 0;
                    const isCompleted = globalThis.GoalTrackerLogic.isEntryComplete(goal, value);
                    weeklyCount += count;
                    if (isCompleted) completedDays += 1;

                    if (globalThis.GoalTrackerLogic.shouldShowEntry(goalTimelineMode, goal, value)) {
                        visibleCellCount += 1;
                        const input = document.createElement('input');
                        input.className = 'goal-count-input';
                        input.type = 'number';
                        input.min = '0';
                        input.step = '1';
                        input.value = count || '';
                        input.placeholder = '0';
                        input.setAttribute('aria-label', `${goal.name} count for ${date.toLocaleDateString()}`);
                        input.addEventListener('change', () => {
                            const nextValue = Math.max(0, Number.parseInt(input.value, 10) || 0);
                            setGoalEntry(goal.id, dateKey, nextValue);
                        });
                        cell.appendChild(input);
                    } else {
                        cell.classList.add('goal-cell-hidden');
                    }
                } else {
                    const checked = value === true;
                    if (checked) completedDays += 1;

                    if (globalThis.GoalTrackerLogic.shouldShowEntry(goalTimelineMode, goal, value)) {
                        visibleCellCount += 1;
                        const input = document.createElement('input');
                        input.className = 'goal-checkbox';
                        input.type = 'checkbox';
                        input.checked = checked;
                        input.setAttribute('aria-label', `${goal.name} completed on ${date.toLocaleDateString()}`);
                        input.addEventListener('change', () => {
                            setGoalEntry(goal.id, dateKey, input.checked);
                        });
                        cell.appendChild(input);
                    } else {
                        cell.classList.add('goal-cell-hidden');
                    }
                }

                row.appendChild(cell);
            });

            const progressCell = document.createElement('td');
            const progress = document.createElement('div');
            progress.className = 'goal-progress';
            progress.textContent = goal.type === 'countable' ? `${weeklyCount}` : `${completedDays}/7`;
            progressCell.appendChild(progress);
            if (goal.type === 'countable') {
                const detail = document.createElement('div');
                detail.className = 'goal-progress-detail';
                detail.textContent = `${completedDays}/7 targets`;
                progressCell.appendChild(detail);
            }
            row.appendChild(progressCell);

            const actionsCell = document.createElement('td');
            const deleteButton = document.createElement('button');
            deleteButton.className = 'goal-delete';
            deleteButton.type = 'button';
            deleteButton.textContent = '✕';
            deleteButton.title = `Delete ${goal.name}`;
            deleteButton.setAttribute('aria-label', `Delete ${goal.name}`);
            deleteButton.addEventListener('click', () => deleteGoal(goal));
            actionsCell.appendChild(deleteButton);
            row.appendChild(actionsCell);

            if (visibleCellCount > 0) {
                goalTableBody.appendChild(row);
                visibleGoalCount += 1;
            }
        });

        if (visibleGoalCount === 0) {
            const emptyRow = document.createElement('tr');
            const emptyCell = document.createElement('td');
            emptyCell.className = 'goal-empty';
            emptyCell.colSpan = 10;
            emptyCell.textContent = isBadTimeline
                ? 'No completed goals are waiting in Bad Timeline this week.'
                : 'Everything is complete for this week. Use Bad Timeline to review it.';
            emptyRow.appendChild(emptyCell);
            goalTableBody.appendChild(emptyRow);
        }
    }

    if(btnBack) {
        btnBack.addEventListener('click', () => {
            dayView.style.display = 'none';
            calGrid.style.display = 'grid';
            calHeader.style.display = 'flex';
            updateStats(); // Reset to global stats
        });
    }

    function openDayView(dateStr) {
        calGrid.style.display = 'none';
        calHeader.style.display = 'none';
        dayView.style.display = 'flex';
        
        // Parse date for display
        const [y, m, d] = dateStr.split('-');
        const dateObj = new Date(y, m-1, d);
        dayViewDate.innerText = dateObj.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

        renderTimeline(dateStr);
        updateStats(dateStr); // Show stats for this day
    }

    function renderTimeline(dateStr) {
        dayTimeline.innerHTML = '';
        const PIXELS_PER_HOUR = 120; // 2px per minute
        const MIN_TASK_HEIGHT = 40; // Minimum height in pixels for readability
        
        // 1. Render Grid Lines (Hours)
        for(let i=0; i<24; i++) {
            const top = i * PIXELS_PER_HOUR;
            
            const label = document.createElement('div');
            label.className = 'time-label';
            label.style.top = top + 'px';
            label.innerText = `${i.toString().padStart(2, '0')}:00`;
            dayTimeline.appendChild(label);

            const line = document.createElement('div');
            line.className = 'time-line';
            line.style.top = top + 'px';
            dayTimeline.appendChild(line);
        }

        // 2. Prepare Tasks with Visual Coordinates
        const daysTasks = taskHistory.filter(t => t.date === dateStr);
        
        // Map to visual objects
        let visualTasks = daysTasks.map(task => {
            const start = new Date(task.startTime);
            const end = new Date(task.endTime);
            const durationMins = (end - start) / 1000 / 60;
            
            const startHour = start.getHours();
            const startMin = start.getMinutes();
            const top = (startHour * 60 + startMin) * (PIXELS_PER_HOUR / 60);
            const height = Math.max(MIN_TASK_HEIGHT, durationMins * (PIXELS_PER_HOUR / 60));
            
            return {
                ...task,
                _start: start,
                _end: end,
                _top: top,
                _height: height,
                _bottom: top + height,
                _lane: 0
            };
        });

        // Sort by top position, then by height (longest first)
        visualTasks.sort((a, b) => {
            if (Math.abs(a._top - b._top) > 1) return a._top - b._top;
            return b._height - a._height;
        });

        // Group overlapping tasks based on VISUAL coordinates
        let groups = [];
        let currentGroup = [];
        let groupBottom = 0;

        visualTasks.forEach(task => {
            if (currentGroup.length === 0) {
                currentGroup.push(task);
                groupBottom = task._bottom;
            } else {
                // Check overlap with the entire group range
                if (task._top < groupBottom) {
                    currentGroup.push(task);
                    if (task._bottom > groupBottom) groupBottom = task._bottom;
                } else {
                    groups.push(currentGroup);
                    currentGroup = [task];
                    groupBottom = task._bottom;
                }
            }
        });
        if (currentGroup.length > 0) groups.push(currentGroup);

        // Process each group to assign lanes
        groups.forEach(group => {
            let lanes = []; // Stores bottom pixel of the last task in each lane

            group.forEach(task => {
                let placed = false;
                // Find first lane that fits
                for (let i = 0; i < lanes.length; i++) {
                    if (lanes[i] <= task._top) {
                        task._lane = i;
                        lanes[i] = task._bottom;
                        placed = true;
                        break;
                    }
                }
                // If no lane fits, create new one
                if (!placed) {
                    task._lane = lanes.length;
                    lanes.push(task._bottom);
                }
            });

            const totalLanes = lanes.length;
            const laneWidth = 100 / totalLanes;

            // Render tasks in this group
            group.forEach(task => {
                const el = document.createElement('div');
                el.className = 'task-block';
                el.style.top = task._top + 'px';
                el.style.height = task._height + 'px';
                el.style.left = `calc(${task._lane * laneWidth}% + 10px)`; 
                el.style.width = `calc(${laneWidth}% - 20px)`; 
                el.style.zIndex = 10 + task._lane;

                // Use stored color if available
                if(task.color) {
                    el.style.backgroundColor = `${task.color}20`; // Light tint
                    el.style.borderLeft = `4px solid ${task.color}`;
                    el.style.color = task.color; // Text color
                }

                el.innerHTML = `
                    <div class="task-name">${task.name}</div>
                    <div class="task-time">${task._start.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} - ${task._end.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
                `;
                
                dayTimeline.appendChild(el);
            });
        });
        
        // Scroll to first task or 8am
        if(visualTasks.length > 0) {
            // Sort back by top to find earliest
            visualTasks.sort((a, b) => a._top - b._top);
            const scrollPos = visualTasks[0]._top - 50;
            document.querySelector('.day-scroll-area').scrollTop = Math.max(0, scrollPos);
        } else {
            document.querySelector('.day-scroll-area').scrollTop = 8 * PIXELS_PER_HOUR; // 8:00 AM
        }
    }

    // Listen for storage changes to update dynamically
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace !== 'local') return;

        if (changes.taskHistory) {
            taskHistory = changes.taskHistory.newValue || [];
            // If day view is open, we should probably update that too, 
            // but for now just update global or current view if we tracked state.
            // Simplest is to just update global stats if we are in grid view.
            if(dayView.style.display === 'none') {
                updateStats();
                renderCalendar();
            }
        }

        let goalsChanged = false;
        if (changes.goalTrackerGoals) {
            goalTrackerGoals = changes.goalTrackerGoals.newValue || [];
            goalsChanged = true;
        }
        if (changes.goalTrackerEntries) {
            goalTrackerEntries = changes.goalTrackerEntries.newValue || {};
            goalsChanged = true;
        }
        if (goalsChanged) renderGoalTracker();
    });

    function updateStats(dateStr = null) {
        let tasksToUse = taskHistory;
        
        if (dateStr) {
            tasksToUse = taskHistory.filter(t => t.date === dateStr);
        }

        document.getElementById('total-tasks').innerText = tasksToUse.length;
        document.getElementById('label-total-tasks').innerText = dateStr ? "Tasks Completed" : "Tasks Completed Total";
        
        let totalSeconds = 0;
        let distribution = {}; // name -> { seconds, color }

        tasksToUse.forEach(task => {
            const start = task.startTime;
            const end = task.endTime;
            if(start && end) {
                const dur = (end - start) / 1000;
                totalSeconds += dur;
                
                // Aggregate for chart
                if(!distribution[task.name]) {
                    distribution[task.name] = { seconds: 0, color: task.color || '#3b82f6' };
                }
                distribution[task.name].seconds += dur;
            }
        });
        
        const hours = (totalSeconds / 3600).toFixed(1);
        document.getElementById('total-hours').innerText = hours + 'h';
        document.getElementById('label-total-hours').innerText = dateStr ? "Productive Time" : "Productive Time Total";

        // Chart Logic
        const chartCard = document.getElementById('sidebar-chart-card');
        const listCard = document.getElementById('sidebar-task-list');
        const listContainer = document.getElementById('day-tasks-container');

        if (dateStr) {
            if(chartCard) {
                chartCard.style.display = 'block';
                drawSidebarChart(distribution, totalSeconds);
            }
            
            if(listCard && listContainer) {
                listCard.style.display = 'block';
                listContainer.innerHTML = '';
                
                // Convert distribution to array and sort by duration desc
                const sortedDist = Object.entries(distribution)
                    .map(([name, data]) => ({ name, ...data }))
                    .sort((a, b) => b.seconds - a.seconds);

                sortedDist.forEach(item => {
                    const row = document.createElement('div');
                    row.style.display = 'flex';
                    row.style.justifyContent = 'space-between';
                    row.style.alignItems = 'center';
                    row.style.marginBottom = '6px';
                    row.style.fontSize = '0.85rem';
                    
                    const leftDiv = document.createElement('div');
                    leftDiv.style.display = 'flex';
                    leftDiv.style.alignItems = 'center';
                    leftDiv.style.gap = '6px';

                    const dot = document.createElement('div');
                    dot.style.width = '8px';
                    dot.style.height = '8px';
                    dot.style.borderRadius = '50%';
                    dot.style.backgroundColor = item.color;

                    const nameSpan = document.createElement('span');
                    nameSpan.innerText = item.name;
                    nameSpan.style.color = '#374151';
                    
                    leftDiv.appendChild(dot);
                    leftDiv.appendChild(nameSpan);

                    const timeSpan = document.createElement('span');
                    const mins = Math.round(item.seconds / 60);
                    timeSpan.innerText = `${mins}m`;
                    timeSpan.style.fontWeight = 'bold';
                    timeSpan.style.color = '#6b7280';

                    row.appendChild(leftDiv);
                    row.appendChild(timeSpan);
                    listContainer.appendChild(row);
                });
            }
        } else {
            if(chartCard) chartCard.style.display = 'none';
            if(listCard) listCard.style.display = 'none';
        }
    }

    function drawSidebarChart(distribution, totalSeconds) {
        const canvas = document.getElementById('dayPieChart');
        if(!canvas) return;
        const ctx = canvas.getContext('2d');
        // Reset canvas size to match display size for sharpness (optional, but good practice)
        // For now just use fixed coordinate system
        const width = canvas.width;
        const height = canvas.height;
        const radius = Math.min(width, height) / 2;
        const centerX = width / 2;
        const centerY = height / 2;

        ctx.clearRect(0, 0, width, height);

        if(totalSeconds === 0) return;

        let startAngle = -0.5 * Math.PI;

        Object.values(distribution).forEach(item => {
            const sliceAngle = (item.seconds / totalSeconds) * 2 * Math.PI;
            const endAngle = startAngle + sliceAngle;

            ctx.beginPath();
            ctx.moveTo(centerX, centerY);
            ctx.arc(centerX, centerY, radius, startAngle, endAngle);
            ctx.closePath();
            ctx.fillStyle = item.color;
            ctx.fill();
            
            ctx.lineWidth = 2;
            ctx.strokeStyle = '#f9fafb'; // Match card bg
            ctx.stroke();

            startAngle = endAngle;
        });
        
        // Donut hole
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius * 0.6, 0, 2 * Math.PI);
        ctx.fillStyle = '#f9fafb'; // Match card bg
        ctx.fill();
    }

    function renderCalendar() {
        const grid = document.getElementById('calendar-grid');
        const monthTitle = document.getElementById('cal-month-year');
        
        grid.innerHTML = ''; // Clear previous

        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        
        // Update Title
        const monthNames = ["January", "February", "March", "April", "May", "June",
            "July", "August", "September", "October", "November", "December"];
        monthTitle.innerText = `${monthNames[month]} ${year}`;

        // Add Day Headers
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        days.forEach(d => {
            const header = document.createElement('div');
            header.className = 'day-header';
            header.innerText = d;
            grid.appendChild(header);
        });

        // Calculate Days
        const firstDayOfMonth = new Date(year, month, 1).getDay(); // 0-6
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        // 1. Empty slots for previous month
        for (let i = 0; i < firstDayOfMonth; i++) {
            const empty = document.createElement('div');
            empty.className = 'day-cell empty';
            grid.appendChild(empty);
        }

        // 2. Actual Days
        const now = new Date();
        const todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;

        for (let day = 1; day <= daysInMonth; day++) {
            const cell = document.createElement('div');
            cell.className = 'day-cell';
            
            // Construct date string YYYY-MM-DD for comparison
            // Note: Month is 0-indexed in JS, so we need +1. PadStart ensures '05' instead of '5'
            const currentMonthStr = (month + 1).toString().padStart(2, '0');
            const currentDayStr = day.toString().padStart(2, '0');
            const dateStr = `${year}-${currentMonthStr}-${currentDayStr}`;

            if (dateStr === todayStr) cell.classList.add('day-today');

            // Click to open Day View
            cell.style.cursor = 'pointer';
            cell.addEventListener('click', (e) => {
                // Prevent opening if clicking a chip directly (optional, but good UX)
                // But user might want to see details of that specific task in the day view anyway.
                openDayView(dateStr);
            });

            const dayNum = document.createElement('div');
            dayNum.className = 'day-number';
            dayNum.innerText = day;
            cell.appendChild(dayNum);

            // Find tasks for this day
            const daysTasks = taskHistory.filter(t => t.date === dateStr);
            
            // Aggregate tasks by name
            const aggregation = {};
            daysTasks.forEach(t => {
                if(!aggregation[t.name]) {
                    aggregation[t.name] = { 
                        totalMs: 0, 
                        color: t.color 
                    };
                }
                aggregation[t.name].totalMs += (t.endTime - t.startTime);
            });

            // Sort by duration desc
            const sortedTasks = Object.keys(aggregation).map(name => ({
                name,
                totalMs: aggregation[name].totalMs,
                color: aggregation[name].color
            })).sort((a, b) => b.totalMs - a.totalMs);
            
            sortedTasks.forEach(task => {
                const chip = document.createElement('div');
                chip.className = 'task-chip';
                
                // Use stored color if available
                if(task.color) {
                    chip.style.backgroundColor = `${task.color}20`; // Light tint
                    chip.style.color = task.color;
                    chip.style.borderLeft = `3px solid ${task.color}`;
                }

                // Calculate duration text
                const durationMins = Math.round(task.totalMs / 1000 / 60);
                chip.innerText = `${task.name} (${durationMins}m)`;
                chip.title = `${task.name}\nTotal Duration: ${durationMins} mins`;
                
                cell.appendChild(chip);
            });

            grid.appendChild(cell);
        }
    }
});
