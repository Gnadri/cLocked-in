document.addEventListener('DOMContentLoaded', () => {
    let currentDate = new Date();
    let taskHistory = [];

    // Load data once
    chrome.storage.local.get(['taskHistory'], (result) => {
        taskHistory = result.taskHistory || [];
        updateStats();
        renderCalendar();
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
        if (namespace === 'local' && changes.taskHistory) {
            taskHistory = changes.taskHistory.newValue || [];
            // If day view is open, we should probably update that too, 
            // but for now just update global or current view if we tracked state.
            // Simplest is to just update global stats if we are in grid view.
            if(dayView.style.display === 'none') {
                updateStats();
                renderCalendar();
            }
        }
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
