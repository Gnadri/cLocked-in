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

    // Listen for storage changes to update dynamically
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'local' && changes.taskHistory) {
            taskHistory = changes.taskHistory.newValue || [];
            updateStats();
            renderCalendar();
        }
    });

    function updateStats() {
        document.getElementById('total-tasks').innerText = taskHistory.length;
        
        let totalSeconds = 0;
        taskHistory.forEach(task => {
            const start = task.startTime;
            const end = task.endTime;
            if(start && end) {
                totalSeconds += (end - start) / 1000;
            }
        });
        
        const hours = (totalSeconds / 3600).toFixed(1);
        document.getElementById('total-hours').innerText = hours + 'h';
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
        const todayStr = new Date().toISOString().split('T')[0];

        for (let day = 1; day <= daysInMonth; day++) {
            const cell = document.createElement('div');
            cell.className = 'day-cell';
            
            // Construct date string YYYY-MM-DD for comparison
            // Note: Month is 0-indexed in JS, so we need +1. PadStart ensures '05' instead of '5'
            const currentMonthStr = (month + 1).toString().padStart(2, '0');
            const currentDayStr = day.toString().padStart(2, '0');
            const dateStr = `${year}-${currentMonthStr}-${currentDayStr}`;

            if (dateStr === todayStr) cell.classList.add('day-today');

            const dayNum = document.createElement('div');
            dayNum.className = 'day-number';
            dayNum.innerText = day;
            cell.appendChild(dayNum);

            // Find tasks for this day
            const daysTasks = taskHistory.filter(t => t.date === dateStr);
            
            daysTasks.forEach(task => {
                const chip = document.createElement('div');
                chip.className = 'task-chip';
                
                // Calculate duration text
                const durationMins = Math.round((task.endTime - task.startTime) / 1000 / 60);
                chip.innerText = `${task.name} (${durationMins}m)`;
                chip.title = `${task.name}\nDuration: ${durationMins} mins`;
                
                cell.appendChild(chip);
            });

            grid.appendChild(cell);
        }
    }
});
