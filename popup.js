document.addEventListener('DOMContentLoaded', () => {
    // Helper: Get Local Date String (YYYY-MM-DD)
    const getLocalTodayStr = () => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    };

    // --- DATE STATE ---
    let currentDate = getLocalTodayStr();
    const datePicker = document.getElementById('date-picker');
    const btnPrevDate = document.getElementById('btn-prev-date');
    const btnNextDate = document.getElementById('btn-next-date');

    // Initialize Date Picker
    if(datePicker) {
        datePicker.value = currentDate;
        
        datePicker.addEventListener('change', (e) => {
            if(e.target.value) {
                currentDate = e.target.value;
                renderStats();
            }
        });
    }

    // Arrow Navigation
    if(btnPrevDate) {
        btnPrevDate.addEventListener('click', () => {
            const d = new Date(currentDate);
            d.setDate(d.getDate() - 1);
            currentDate = d.toISOString().split('T')[0];
            datePicker.value = currentDate;
            renderStats();
        });
    }

    if(btnNextDate) {
        btnNextDate.addEventListener('click', () => {
            const d = new Date(currentDate);
            d.setDate(d.getDate() + 1);
            currentDate = d.toISOString().split('T')[0];
            datePicker.value = currentDate;
            renderStats();
        });
    }

    // --- NAVIGATION ---
    const tabs = ['dash', 'tasks', 'collections'];
    tabs.forEach(t => {
        const el = document.getElementById(`nav-${t}`);
        if(el) {
            el.addEventListener('click', () => {
                tabs.forEach(x => {
                    document.getElementById(`nav-${x}`).classList.remove('active');
                    document.getElementById(`view-${x}`).classList.remove('active');
                });
                el.classList.add('active');
                document.getElementById(`view-${t}`).classList.add('active');
            });
        }
    });

    // --- HELPER: Time Formatter (00h 00m 00s) ---
    function formatTimeDetailed(seconds) {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        const pad = (num) => num.toString().padStart(2, '0');
        // Only show hours if > 0 to save space, or keep fixed format like image
        return `${pad(h)}h ${pad(m)}m ${pad(s)}s`;
    }

    // --- HELPER: Colors ---
    // Palette matching the vibrant look in the image
    const COLORS = [
        '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40', 
        '#E7E9ED', '#76ff03', '#f06292', '#00e676'
    ];

    const FOLDER_COLORS = [
        '#3b82f6', // Blue (Default)
        '#ef4444', // Red
        '#10b981', // Green
        '#f59e0b', // Amber
        '#8b5cf6', // Violet
        '#ec4899', // Pink
        '#6366f1', // Indigo
        '#14b8a6'  // Teal
    ];

    // --- STATE: Collections ---
    let currentSiteToSave = '';
    let currentDetailColId = null; // Track which category is open
    let chartSlices = []; // Store slice info for hover
    const modalOverlay = document.getElementById('modal-overlay');
    const modalSelect = document.getElementById('modal-select-collection');
    const modalCreate = document.getElementById('modal-create-collection');
    const modalDetails = document.getElementById('modal-category-details');
    const modalCreateActivity = document.getElementById('modal-create-activity');

    function openCategoryModal(site) {
        currentSiteToSave = site;
        modalOverlay.style.display = 'flex';
        modalSelect.style.display = 'block';
        modalCreate.style.display = 'none';
        modalDetails.style.display = 'none';
        modalCreateActivity.style.display = 'none';
        renderCollectionsListModal();
    }

    function openCategoryDetails(col) {
        currentDetailColId = col.id;
        modalOverlay.style.display = 'flex';
        modalSelect.style.display = 'none';
        modalCreate.style.display = 'none';
        modalDetails.style.display = 'block';
        modalCreateActivity.style.display = 'none';
        
        document.getElementById('detail-category-name').innerText = col.name;
        document.getElementById('detail-block-toggle').checked = !!col.isBlocked;
        
        renderDetailList(col);
    }

    function renderDetailList(col) {
        const list = document.getElementById('detail-site-list');
        list.innerHTML = '';
        
        if(!col.items || col.items.length === 0) {
             list.innerHTML = '<div style="padding:15px; text-align:center; color:#999;">No sites in this category</div>';
             return;
        }

        col.items.forEach(site => {
            const div = document.createElement('div');
            div.className = 'collection-item';
            div.style.cursor = 'default';
            div.innerHTML = `
                <div class="collection-thumb" style="width:24px; height:24px; font-size:12px;">
                    <img src="https://www.google.com/s2/favicons?domain=${site}&sz=32" style="width:100%; height:100%; border-radius:4px;">
                </div>
                <div class="collection-info">
                    <div class="collection-name" style="font-weight:normal;">${site}</div>
                </div>
                <div class="btn-remove-site" title="Remove from category" style="cursor:pointer; padding:5px; color:#ff6b6b; font-weight:bold;">✕</div>
            `;
            
            // Remove Logic
            div.querySelector('.btn-remove-site').addEventListener('click', () => {
                chrome.storage.local.get(['collections'], (result) => {
                    const cols = result.collections || [];
                    const foundCol = cols.find(c => c.id === col.id);
                    if(foundCol) {
                        foundCol.items = foundCol.items.filter(s => s !== site);
                        chrome.storage.local.set({collections: cols}, () => {
                            // Update local object and re-render
                            col.items = foundCol.items;
                            renderDetailList(col);
                            renderCollectionsGrid(); // Update background grid
                            showNotification(`Removed ${site}`);
                        });
                    }
                });
            });

            list.appendChild(div);
        });
    }

    // --- MAIN DASHBOARD RENDERER ---
    function renderStats() {
        chrome.storage.local.get(['trackerData'], (result) => {
            const data = result.trackerData || {};
            const dayData = data[currentDate] || {};
            const container = document.getElementById('stats-list');
            container.innerHTML = '';

            // 1. Prepare Data
            let entries = Object.entries(dayData).map(([site, seconds]) => ({ site, seconds }));
            
            // Filter out newtab
            entries = entries.filter(e => e.site !== 'newtab');
            
            // Sort by time descending
            entries.sort((a, b) => b.seconds - a.seconds);

            // Calculate Total for Percentages
            const totalSeconds = entries.reduce((acc, curr) => acc + curr.seconds, 0);

            if (entries.length === 0) {
                container.innerHTML = '<div style="text-align:center; padding:20px;">No data recorded for this date.</div>';
                drawChart([]);
                return;
            }

            // 2. Render List
            entries.forEach((item, index) => {
                const color = COLORS[index % COLORS.length];
                const percentage = totalSeconds > 0 ? ((item.seconds / totalSeconds) * 100).toFixed(2) : 0;
                const faviconUrl = `https://www.google.com/s2/favicons?domain=${item.site}&sz=32`;
                
                const row = document.createElement('div');
                row.className = 'site-row';
                row.innerHTML = `
                    <div class="site-color" style="background-color: ${color};"></div>
                    <img src="${faviconUrl}" style="width:16px; height:16px; margin-right:8px; border-radius:2px;" onerror="this.style.display='none'">
                    <div class="site-name" title="${item.site}">${item.site}</div>
                    <div class="site-percent">${percentage} %</div>
                    <div class="site-time">${formatTimeDetailed(item.seconds)}</div>
                    <div class="btn-add-cat" title="Add to Category">+</div>
                `;
                
                // Add event listener for the add button
                const btnAdd = row.querySelector('.btn-add-cat');
                btnAdd.addEventListener('click', () => {
                    openCategoryModal(item.site);
                });

                container.appendChild(row);
                
                // Attach color to item for chart usage
                item.color = color;
            });

            // 3. Draw Chart
            drawChart(entries, totalSeconds);
        });
    }

    // --- CANVAS CHART DRAWER ---
    function drawChart(entries, totalSeconds) {
        const canvas = document.getElementById('usageChart');
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;
        const radius = Math.min(width, height) / 2;
        const centerX = width / 2;
        const centerY = height / 2;

        // Clear canvas
        ctx.clearRect(0, 0, width, height);
        chartSlices = []; // Reset slices

        if(entries.length === 0) return;

        let startAngle = -0.5 * Math.PI; // Start at top (12 o'clock)

        entries.forEach(entry => {
            // Calculate slice angle
            const sliceAngle = (entry.seconds / totalSeconds) * 2 * Math.PI;
            const endAngle = startAngle + sliceAngle;

            // Store slice info for hover
            chartSlices.push({
                startAngle,
                endAngle,
                site: entry.site,
                color: entry.color,
                percentage: ((entry.seconds / totalSeconds) * 100).toFixed(1)
            });

            // Draw Pie Slice
            ctx.beginPath();
            ctx.moveTo(centerX, centerY);
            ctx.arc(centerX, centerY, radius, startAngle, endAngle);
            ctx.closePath();
            ctx.fillStyle = entry.color;
            ctx.fill();

            // Gap between slices (optional, creates the white lines)
            ctx.lineWidth = 4;
            ctx.strokeStyle = '#ffffff';
            ctx.stroke();

            startAngle = endAngle;
        });

        // Cut out the center to make it a Donut
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius * 0.6, 0, 2 * Math.PI);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
    }

    // Add event listener for canvas hover
    const canvas = document.getElementById('usageChart');
    const tooltip = document.getElementById('chart-tooltip');

    if(canvas && tooltip) {
        canvas.addEventListener('mousemove', (e) => {
            const rect = canvas.getBoundingClientRect();
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;
            
            const x = (e.clientX - rect.left) * scaleX;
            const y = (e.clientY - rect.top) * scaleY;
            
            const centerX = canvas.width / 2;
            const centerY = canvas.height / 2;
            
            const dx = x - centerX;
            const dy = y - centerY;
            const dist = Math.sqrt(dx*dx + dy*dy);
            const radius = Math.min(canvas.width, canvas.height) / 2;
            const innerRadius = radius * 0.6;

            // Check if mouse is inside the donut ring
            if (dist < innerRadius || dist > radius) {
                tooltip.style.display = 'none';
                canvas.style.cursor = 'default';
                return;
            }

            // Calculate angle relative to center
            let angle = Math.atan2(dy, dx);
            
            // Normalize to [0, 2PI) starting from Top (-PI/2) Clockwise
            // atan2: 0 is Right, -PI/2 is Top.
            // We want Top to be 0.
            let checkAngle = angle + Math.PI / 2;
            if (checkAngle < 0) checkAngle += 2 * Math.PI;
            
            const found = chartSlices.find(s => {
                // Normalize slice angles to 0..2PI from top
                let sStart = s.startAngle + Math.PI/2;
                let sEnd = s.endAngle + Math.PI/2;
                return checkAngle >= sStart && checkAngle < sEnd;
            });

            if (found) {
                tooltip.style.display = 'block';
                // Position tooltip near mouse but slightly offset
                // Use clientX/Y from event for screen position
                tooltip.style.left = (e.clientX - rect.left + 10) + 'px';
                tooltip.style.top = (e.clientY - rect.top + 10) + 'px';
                tooltip.innerHTML = `<strong>${found.site}</strong><br>${found.percentage}%`;
                canvas.style.cursor = 'pointer';
            } else {
                tooltip.style.display = 'none';
                canvas.style.cursor = 'default';
            }
        });
        
        canvas.addEventListener('mouseout', () => {
            tooltip.style.display = 'none';
        });
    }

    // Initialize
    renderStats();
    setInterval(() => {
        const today = getLocalTodayStr();
        if(currentDate === today) {
            renderStats();
        }
    }, 1000); // Live update only if viewing today

    // --- ACTIVITIES LOGIC ---
    const btnNewActivity = document.getElementById('btn-new-activity');
    const btnNewTaskFolder = document.getElementById('btn-new-task-folder');
    const btnSaveTaskFolder = document.getElementById('btn-save-task-folder');
    const modalCreateTaskFolder = document.getElementById('modal-create-task-folder');
    const btnTaskBack = document.getElementById('btn-task-back');
    const taskBreadcrumbs = document.getElementById('task-breadcrumbs');
    const taskFolderTitle = document.getElementById('task-folder-title');
    const folderSettingsTrigger = document.getElementById('folder-settings-trigger');
    const folderInlinePicker = document.getElementById('folder-inline-color-picker');
    const folderInlineColors = document.getElementById('folder-inline-colors');
    
    // modalCreateActivity moved to top scope
    const btnSaveActivity = document.getElementById('btn-save-activity');
    const activeContainer = document.getElementById('active-activity-container');
    // Removed static ID references for active task elements
    let activityInterval;
    let editingActivityId = null; // Track if we are editing
    let currentTaskFolderId = null; // Track current folder view

    // Toggle Inline Picker
    if(folderSettingsTrigger) {
        folderSettingsTrigger.addEventListener('click', () => {
            if(folderInlinePicker.style.display === 'none') {
                folderInlinePicker.style.display = 'block';
                renderInlineColorPicker();
            } else {
                folderInlinePicker.style.display = 'none';
            }
        });
    }

    function renderInlineColorPicker() {
        folderInlineColors.innerHTML = '';
        FOLDER_COLORS.forEach(color => {
            const swatch = document.createElement('div');
            swatch.style.width = '24px';
            swatch.style.height = '24px';
            swatch.style.borderRadius = '50%';
            swatch.style.backgroundColor = color;
            swatch.style.cursor = 'pointer';
            swatch.style.border = '2px solid transparent';
            
            swatch.addEventListener('click', () => {
                updateFolderColor(currentTaskFolderId, color);
            });
            
            folderInlineColors.appendChild(swatch);
        });
    }

    function updateFolderColor(folderId, color) {
        chrome.storage.local.get(['taskFolders'], (result) => {
            const folders = result.taskFolders || [];
            const folder = folders.find(f => f.id === folderId);
            if(folder) {
                folder.color = color;
                chrome.storage.local.set({taskFolders: folders}, () => {
                    folderSettingsTrigger.style.backgroundColor = color;
                    folderInlinePicker.style.display = 'none';
                    showNotification('Folder color updated');
                    // Re-render to update any visible UI dependent on color
                    renderActivitiesList(); 
                });
            }
        });
    }

    // Open Create Activity Modal
    if(btnNewActivity) {
        btnNewActivity.addEventListener('click', () => {
            editingActivityId = null; // Reset editing state
            document.getElementById('new-activity-name').value = '';
            document.getElementById('new-activity-duration').value = '';
            document.getElementById('new-activity-redirect').value = '';
            document.getElementById('new-activity-exceptions').value = '';
            document.querySelector('#modal-create-activity .modal-header span:first-child').innerText = 'New Task';
            document.getElementById('btn-save-activity').innerText = 'Create Task';
            
            // Pre-select current folder if inside one
            renderTaskFolderSelect(currentTaskFolderId);

            modalOverlay.style.display = 'flex';
            modalSelect.style.display = 'none';
            modalCreate.style.display = 'none';
            modalDetails.style.display = 'none';
            modalCreateTaskFolder.style.display = 'none';
            modalCreateActivity.style.display = 'block';
            renderCategorySelect();
        });
    }

    // Open Create Folder Modal
    if(btnNewTaskFolder) {
        btnNewTaskFolder.addEventListener('click', () => {
            document.getElementById('new-task-folder-name').value = '';
            
            // Render Color Picker
            const picker = document.getElementById('folder-color-picker');
            const inputColor = document.getElementById('new-task-folder-color');
            picker.innerHTML = '';
            inputColor.value = FOLDER_COLORS[0]; // Default

            FOLDER_COLORS.forEach(color => {
                const swatch = document.createElement('div');
                swatch.style.width = '24px';
                swatch.style.height = '24px';
                swatch.style.borderRadius = '50%';
                swatch.style.backgroundColor = color;
                swatch.style.cursor = 'pointer';
                swatch.style.border = color === inputColor.value ? '2px solid #333' : '2px solid transparent';
                
                swatch.addEventListener('click', () => {
                    inputColor.value = color;
                    // Update selection visual
                    Array.from(picker.children).forEach(c => c.style.border = '2px solid transparent');
                    swatch.style.border = '2px solid #333';
                });
                
                picker.appendChild(swatch);
            });

            modalOverlay.style.display = 'flex';
            modalSelect.style.display = 'none';
            modalCreate.style.display = 'none';
            modalDetails.style.display = 'none';
            modalCreateActivity.style.display = 'none';
            modalCreateTaskFolder.style.display = 'block';
        });
    }

    // Save Task Folder
    if(btnSaveTaskFolder) {
        btnSaveTaskFolder.addEventListener('click', () => {
            const name = document.getElementById('new-task-folder-name').value.trim();
            const color = document.getElementById('new-task-folder-color').value;
            if(name) {
                chrome.storage.local.get(['taskFolders'], (result) => {
                    const folders = result.taskFolders || [];
                    folders.push({
                        id: Date.now().toString(),
                        name: name,
                        color: color
                    });
                    chrome.storage.local.set({taskFolders: folders}, () => {
                        modalOverlay.style.display = 'none';
                        modalCreateTaskFolder.style.display = 'none';
                        renderActivitiesList();
                        showNotification('Folder created');
                    });
                });
            }
        });
    }

    // Back Button Logic
    if(btnTaskBack) {
        btnTaskBack.addEventListener('click', () => {
            currentTaskFolderId = null;
            renderActivitiesList();
        });
    }

    function renderTaskFolderSelect(selectedId = null) {
        chrome.storage.local.get(['taskFolders'], (result) => {
            const folders = result.taskFolders || [];
            const select = document.getElementById('new-activity-folder');
            select.innerHTML = '<option value="">No Folder (Root)</option>';
            
            folders.forEach(f => {
                const opt = document.createElement('option');
                opt.value = f.id;
                opt.innerText = f.name;
                if(f.id === selectedId) opt.selected = true;
                select.appendChild(opt);
            });
        });
    }

    // Render Category Checkboxes
    function renderCategorySelect(selectedIds = []) {
        chrome.storage.local.get(['collections'], (result) => {
            const container = document.getElementById('activity-category-select');
            container.innerHTML = '';
            const cols = result.collections || [];
            
            if(cols.length === 0) {
                container.innerHTML = '<div style="padding:10px; color:#999; font-size:12px;">No categories found. Create one first!</div>';
                return;
            }

            cols.forEach(col => {
                const label = document.createElement('label');
                label.style.display = 'flex';
                label.style.alignItems = 'center';
                label.style.padding = '5px';
                label.style.cursor = 'pointer';
                const isChecked = selectedIds.includes(col.id) ? 'checked' : '';
                label.innerHTML = `
                    <input type="checkbox" value="${col.id}" style="width:auto; margin-right:10px;" ${isChecked}>
                    <span>${col.name}</span>
                `;
                container.appendChild(label);
            });
        });
    }

    // Save Activity
    if(btnSaveActivity) {
        btnSaveActivity.addEventListener('click', () => {
            const name = document.getElementById('new-activity-name').value.trim();
            const duration = document.getElementById('new-activity-duration').value.trim();
            const redirect = document.getElementById('new-activity-redirect').value.trim();
            const folderId = document.getElementById('new-activity-folder').value;
            const exceptionsRaw = document.getElementById('new-activity-exceptions').value;
            const exceptions = exceptionsRaw.split('\n').map(e => e.trim()).filter(e => e);
            
            const checkboxes = document.querySelectorAll('#activity-category-select input:checked');
            const selectedCats = Array.from(checkboxes).map(cb => cb.value);

            if(name && selectedCats.length > 0) {
                chrome.storage.local.get(['activities'], (result) => {
                    let acts = result.activities || [];
                    
                    if (editingActivityId) {
                        // Update existing
                        const index = acts.findIndex(a => a.id === editingActivityId);
                        if (index !== -1) {
                            acts[index] = {
                                ...acts[index],
                                name: name,
                                duration: duration ? parseInt(duration) : null,
                                redirectUrl: redirect,
                                exceptions: exceptions,
                                blockedCategoryIds: selectedCats,
                                folderId: folderId || null
                            };
                            showNotification('Task updated');
                        }
                    } else {
                        // Create new
                        acts.push({
                            id: Date.now().toString(),
                            name: name,
                            duration: duration ? parseInt(duration) : null,
                            redirectUrl: redirect,
                            exceptions: exceptions,
                            blockedCategoryIds: selectedCats,
                            folderId: folderId || null
                        });
                        showNotification('Task created');
                    }

                    chrome.storage.local.set({activities: acts}, () => {
                        modalOverlay.style.display = 'none';
                        modalCreateActivity.style.display = 'none';
                        renderActivitiesList();
                    });
                });
            } else {
                showNotification('Name and at least one category required');
            }
        });
    }

    function assignTaskToFolder(taskId, folderId) {
        chrome.storage.local.get(['activities', 'taskFolders'], (result) => {
            const acts = result.activities || [];
            const folders = result.taskFolders || [];
            const taskIndex = acts.findIndex(a => a.id === taskId);
            const folder = folders.find(f => f.id === folderId);
            
            if(taskIndex !== -1 && folder) {
                acts[taskIndex].folderId = folderId;
                chrome.storage.local.set({activities: acts}, () => {
                    renderActivitiesList();
                    showNotification(`Moved to ${folder.name}`);
                });
            }
        });
    }

    // Render Activities List
    function renderActivitiesList() {
        chrome.storage.local.get(['activities', 'activeActivities', 'taskFolders'], (result) => {
            const list = document.getElementById('activities-list');
            if(!list) return;
            list.innerHTML = '';
            const acts = result.activities || [];
            const activeActs = result.activeActivities || [];
            const folders = result.taskFolders || [];

            // Handle Breadcrumbs
            if(currentTaskFolderId) {
                const currentFolder = folders.find(f => f.id === currentTaskFolderId);
                taskBreadcrumbs.style.display = 'flex';
                taskFolderTitle.innerText = currentFolder ? currentFolder.name : 'Unknown Folder';
                
                // Update trigger color
                if(currentFolder && currentFolder.color) {
                    folderSettingsTrigger.style.backgroundColor = currentFolder.color;
                } else {
                    folderSettingsTrigger.style.backgroundColor = '#fff';
                }
                
                // Hide picker by default when entering
                folderInlinePicker.style.display = 'none';
            } else {
                taskBreadcrumbs.style.display = 'none';
            }

            // Render Active Activities (Always at top)
            if(activeActs.length > 0) {
                activeContainer.style.display = 'block';
                activeContainer.innerHTML = '<div style="font-size:12px; color:#1976d2; font-weight:bold; text-transform:uppercase; margin-bottom:10px;">Current Focus</div>';
                
                activeActs.forEach(current => {
                    const div = document.createElement('div');
                    div.className = 'active-task-item';
                    div.style.marginBottom = '15px';
                    div.style.borderBottom = '1px solid #bbdefb';
                    div.style.paddingBottom = '15px';
                    div.innerHTML = `
                        <div style="font-size:18px; font-weight:bold; margin:5px 0; color:#0d47a1;">${current.name}</div>
                        <div id="timer-${current.id}" class="timer-big" style="font-size:24px; margin:10px 0;">00:00:00</div>
                        <div style="display:flex; gap:10px; justify-content:center;">
                            <button class="btn btn-red btn-stop-task" data-id="${current.id}" style="flex:1;">Stop</button>
                            <button class="btn btn-green btn-complete-task" data-id="${current.id}" style="flex:3;">Complete Task</button>
                        </div>
                    `;
                    activeContainer.appendChild(div);
                    
                    // Attach listeners
                    div.querySelector('.btn-stop-task').addEventListener('click', () => stopTask(current.id));
                    div.querySelector('.btn-complete-task').addEventListener('click', () => completeTask(current.id));
                });
                
                // Remove last border
                if(activeContainer.lastElementChild) activeContainer.lastElementChild.style.borderBottom = 'none';

                startActivityTimer(activeActs);
            } else {
                activeContainer.style.display = 'none';
                clearInterval(activityInterval);
            }

            // Render Folders (Only at root level)
            if(!currentTaskFolderId) {
                folders.forEach(folder => {
                    const item = document.createElement('div');
                    item.className = 'collection-item';
                    const folderColor = folder.color || '#f57f17'; // Default orange if not set
                    
                    // Tint background slightly
                    item.style.backgroundColor = '#fff'; 
                    item.style.borderLeft = `4px solid ${folderColor}`;
                    
                    // Drag & Drop Events
                    item.addEventListener('dragover', (e) => {
                        e.preventDefault();
                        item.style.backgroundColor = `${folderColor}20`; // Light tint
                    });
                    item.addEventListener('dragleave', () => {
                        item.style.backgroundColor = '#fff';
                    });
                    item.addEventListener('drop', (e) => {
                        e.preventDefault();
                        item.style.backgroundColor = '#fff';
                        const taskId = e.dataTransfer.getData('text/plain');
                        if(taskId) assignTaskToFolder(taskId, folder.id);
                    });

                    // Count tasks in this folder
                    const count = acts.filter(a => a.folderId === folder.id).length;

                    item.innerHTML = `
                        <div class="collection-thumb" style="background:${folderColor}20; color:${folderColor};">📂</div>
                        <div class="collection-info">
                            <div class="collection-name">${folder.name}</div>
                            <div class="collection-count">${count} tasks</div>
                        </div>
                        <div class="btn-delete-folder" style="cursor:pointer; padding:6px; color:#ff6b6b; margin-left:5px;">✕</div>
                    `;

                    item.addEventListener('click', () => {
                        currentTaskFolderId = folder.id;
                        renderActivitiesList();
                    });

                    item.querySelector('.btn-delete-folder').addEventListener('click', (e) => {
                        e.stopPropagation();
                        if(confirm('Delete folder? Tasks inside will be moved to root.')) {
                            // Move tasks to root
                            const updatedActs = acts.map(a => {
                                if(a.folderId === folder.id) return {...a, folderId: null};
                                return a;
                            });
                            const updatedFolders = folders.filter(f => f.id !== folder.id);
                            
                            chrome.storage.local.set({
                                activities: updatedActs,
                                taskFolders: updatedFolders
                            }, renderActivitiesList);
                        }
                    });

                    list.appendChild(item);
                });
            }

            // Render Tasks (Filtered by Folder)
            const filteredActs = acts.filter(act => {
                if(currentTaskFolderId) return act.folderId === currentTaskFolderId;
                return true; // Show ALL tasks in root (as requested)
            });

            filteredActs.forEach(act => {
                const item = document.createElement('div');
                item.className = 'collection-item';
                item.setAttribute('draggable', true);
                
                item.addEventListener('dragstart', (e) => {
                    e.dataTransfer.setData('text/plain', act.id);
                });

                const durationText = act.duration ? ` • ${act.duration}m` : '';
                item.innerHTML = `
                    <div class="collection-thumb" style="background:#e3f2fd; color:#1976d2;">⚡</div>
                    <div class="collection-info">
                        <div class="collection-name">${act.name}${durationText}</div>
                        <div class="collection-count">${act.blockedCategoryIds.length} categories blocked</div>
                    </div>
                    <div class="btn-start-activity" style="cursor:pointer; padding:6px 12px; background:#4caf50; color:white; border-radius:4px; font-size:12px; font-weight:bold;">START</div>
                    <div class="btn-delete-activity" style="cursor:pointer; padding:6px; color:#ff6b6b; margin-left:5px;">✕</div>
                `;

                // Click to Edit
                item.addEventListener('click', () => {
                    editingActivityId = act.id;
                    document.getElementById('new-activity-name').value = act.name;
                    document.getElementById('new-activity-duration').value = act.duration || '';
                    document.getElementById('new-activity-redirect').value = act.redirectUrl || '';
                    document.getElementById('new-activity-exceptions').value = (act.exceptions || []).join('\n');
                    
                    document.querySelector('#modal-create-activity .modal-header span:first-child').innerText = 'Edit Task';
                    document.getElementById('btn-save-activity').innerText = 'Save Changes';

                    renderTaskFolderSelect(act.folderId);

                    modalOverlay.style.display = 'flex';
                    modalSelect.style.display = 'none';
                    modalCreate.style.display = 'none';
                    modalDetails.style.display = 'none';
                    modalCreateTaskFolder.style.display = 'none';
                    modalCreateActivity.style.display = 'block';
                    
                    renderCategorySelect(act.blockedCategoryIds);
                });

                // Start Button
                item.querySelector('.btn-start-activity').addEventListener('click', (e) => {
                    e.stopPropagation();
                    // Check if already active
                    if(activeActs.find(a => a.id === act.id)) {
                        showNotification('Task already active');
                        return;
                    }
                    startActivity(act);
                });

                // Delete Button
                item.querySelector('.btn-delete-activity').addEventListener('click', (e) => {
                    e.stopPropagation();
                    if(confirm('Delete this activity?')) {
                        const newActs = acts.filter(a => a.id !== act.id);
                        chrome.storage.local.set({activities: newActs}, renderActivitiesList);
                    }
                });

                list.appendChild(item);
            });
        });
    }

    function startActivity(act) {
        chrome.storage.local.get(['activeActivities'], (res) => {
            let current = res.activeActivities || [];
            const newActive = {
                id: act.id,
                name: act.name,
                startTime: Date.now(),
                duration: act.duration,
                endTime: act.duration ? Date.now() + (act.duration * 60 * 1000) : null,
                redirectUrl: act.redirectUrl,
                exceptions: act.exceptions,
                blockedCategoryIds: act.blockedCategoryIds,
                folderId: act.folderId // Pass folderId to active state
            };
            current.push(newActive);
            chrome.storage.local.set({activeActivities: current}, () => {
                renderActivitiesList();
                showNotification(`Started ${act.name}`);
            });
        });
    }

    function stopTask(id) {
        chrome.storage.local.get(['activeActivities'], (res) => {
            let current = res.activeActivities || [];
            current = current.filter(a => a.id !== id);
            chrome.storage.local.set({activeActivities: current}, () => {
                renderActivitiesList();
                showNotification('Activity stopped');
            });
        });
    }

    function completeTask(id) {
        chrome.storage.local.get(['activeActivities', 'trackerData', 'taskHistory', 'taskFolders'], (res) => {
            let current = res.activeActivities || [];
            let trackerData = res.trackerData || {};
            let taskHistory = res.taskHistory || [];
            let folders = res.taskFolders || [];
            
            const taskIndex = current.findIndex(a => a.id === id);
            if (taskIndex !== -1) {
                const task = current[taskIndex];
                const now = Date.now();
                // Calculate duration in seconds
                const elapsedSeconds = Math.floor((now - task.startTime) / 1000);
                
                const today = getLocalTodayStr();

                // Update Tracker Data for today (Popup Stats)
                if (!trackerData[today]) trackerData[today] = {};
                if (!trackerData[today][task.name]) trackerData[today][task.name] = 0;
                trackerData[today][task.name] += elapsedSeconds;

                // Determine Color
                let taskColor = '#3b82f6'; // Default Blue
                if (task.folderId) {
                    const folder = folders.find(f => f.id === task.folderId);
                    if (folder && folder.color) {
                        taskColor = folder.color;
                    }
                }

                // Update Task History (Dashboard Calendar)
                taskHistory.push({
                    name: task.name,
                    startTime: task.startTime,
                    endTime: now,
                    date: today,
                    color: taskColor
                });

                // Remove from active list
                current.splice(taskIndex, 1);
                
                chrome.storage.local.set({
                    activeActivities: current,
                    trackerData: trackerData,
                    taskHistory: taskHistory
                }, () => {
                    renderActivitiesList();
                    showNotification('Task Completed! 🎉');
                });
            }
        });
    }

    function startActivityTimer(activeActs) {
        clearInterval(activityInterval);
        const update = () => {
            activeActs.forEach(current => {
                const el = document.getElementById(`timer-${current.id}`);
                if(!el) return;

                if (current.endTime) {
                    // Countdown
                    const diff = Math.floor((current.endTime - Date.now()) / 1000);
                    if (diff <= 0) {
                        el.innerText = "00:00:00";
                        // Auto-stop logic handled in background or next render
                    } else {
                        el.innerText = formatTimeDetailed(diff);
                    }
                } else {
                    // Count up
                    const diff = Math.floor((Date.now() - current.startTime) / 1000);
                    el.innerText = formatTimeDetailed(diff);
                }
            });
        };
        update();
        activityInterval = setInterval(update, 1000);
    }

    // Initial Render
    renderActivitiesList();

    // --- LIMITS LOGIC REMOVED ---

    // --- NOTIFICATION SYSTEM ---
    function showNotification(message, duration = 3000) {
        const container = document.getElementById('notification-container');
        if(!container) return;
        
        const toast = document.createElement('div');
        toast.className = 'notification-toast';
        toast.innerText = message;
        container.appendChild(toast);

        // Trigger reflow
        void toast.offsetWidth;

        toast.classList.add('show');

        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => {
                toast.remove();
            }, 300); // Wait for transition
        }, duration);
    }

    // --- COLLECTIONS LOGIC ---
    const btnOpenDashboard = document.getElementById('btn-open-dashboard');
    if(btnOpenDashboard) {
        btnOpenDashboard.addEventListener('click', () => {
            chrome.tabs.create({ url: 'dashboard.html' });
        });
    }

    const btnBookmark = document.getElementById('btn-bookmark-current');
    // modalOverlay, modalSelect, modalCreate, currentSiteToSave moved to top scope
    const btnNewColTrigger = document.getElementById('btn-new-collection-trigger');
    const btnCreateCol = document.getElementById('btn-create-collection');
    const inputColName = document.getElementById('new-collection-name');
    const closeModals = document.querySelectorAll('.close-modal');
    const backToSelect = document.querySelector('.back-to-select');
    const closeDetails = document.querySelector('.close-details');
    const toggleBlock = document.getElementById('detail-block-toggle');
    const btnDeleteCol = document.getElementById('btn-delete-category');
    
    // Open Modal
    if(btnBookmark) {
        btnBookmark.addEventListener('click', () => {
            // Get current tab
            chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
                if(tabs[0]) {
                    const url = new URL(tabs[0].url);
                    openCategoryModal(url.hostname);
                }
            });
        });
    }

    // Close Modals
    closeModals.forEach(btn => {
        btn.addEventListener('click', () => {
            modalOverlay.style.display = 'none';
        });
    });

    // Switch to Create
    if(btnNewColTrigger) {
        btnNewColTrigger.addEventListener('click', () => {
            modalSelect.style.display = 'none';
            modalCreate.style.display = 'block';
        });
    }

    // Back to Select
    if(backToSelect) {
        backToSelect.addEventListener('click', () => {
            modalCreate.style.display = 'none';
            modalSelect.style.display = 'block';
        });
    }

    // Create Collection
    if(btnCreateCol) {
        btnCreateCol.addEventListener('click', () => {
            const name = inputColName.value.trim();
            if(name) {
                chrome.storage.local.get(['collections'], (result) => {
                    const cols = result.collections || [];
                    const newCol = {
                        id: Date.now().toString(),
                        name: name,
                        items: currentSiteToSave ? [currentSiteToSave] : []
                    };
                    cols.push(newCol);
                    chrome.storage.local.set({collections: cols}, () => {
                        inputColName.value = '';
                        // If we were saving a site, we are done
                        modalOverlay.style.display = 'none';
                        renderCollectionsGrid(); // Update grid if visible
                        showNotification(`Saved ${currentSiteToSave} to ${name}`);
                    });
                });
            }
        });
    }

    function renderCollectionsListModal() {
        chrome.storage.local.get(['collections'], (result) => {
            const list = document.getElementById('modal-collections-list');
            list.innerHTML = '';
            const cols = result.collections || [];
            
            cols.forEach(col => {
                const item = document.createElement('div');
                item.className = 'collection-item';
                item.innerHTML = `
                    <div class="collection-thumb">📁</div>
                    <div class="collection-info">
                        <div class="collection-name">${col.name}</div>
                        <div class="collection-count">${col.items.length} items</div>
                    </div>
                `;
                item.addEventListener('click', () => {
                    // Add site to this collection
                    if(!col.items.includes(currentSiteToSave)) {
                        col.items.push(currentSiteToSave);
                        chrome.storage.local.set({collections: cols}, () => {
                            modalOverlay.style.display = 'none';
                            renderCollectionsGrid();
                            showNotification(`Saved ${currentSiteToSave} to ${col.name}`);
                        });
                    } else {
                        showNotification('Site already in category');
                        modalOverlay.style.display = 'none';
                    }
                });
                list.appendChild(item);
            });
        });
    }

    function renderCollectionsGrid() {
        chrome.storage.local.get(['collections'], (result) => {
            const grid = document.getElementById('collections-grid');
            if(!grid) return;
            grid.innerHTML = '';
            const cols = result.collections || [];
            
            if(cols.length === 0) {
                grid.innerHTML = '<div style="grid-column: span 2; text-align:center; padding:20px; color:#999;">No categories yet.</div>';
                return;
            }

            cols.forEach(col => {
                const item = document.createElement('div');
                item.className = 'grid-item';
                
                // Get up to 3 favicons
                const thumbsHTML = col.items.slice(0, 3).map(site => {
                    const faviconUrl = `https://www.google.com/s2/favicons?domain=${site}&sz=32`;
                    return `<div class="favicon-item"><img src="${faviconUrl}" alt="${site}" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22%3E%3Ccircle cx=%2212%22 cy=%2212%22 r=%2210%22 fill=%22%23ddd%22/%3E%3C/svg%3E'"/></div>`;
                }).join('');
                
                item.innerHTML = `
                    <div class="grid-thumb">${thumbsHTML}</div>
                    <div style="font-weight:bold; font-size:13px;">${col.name}</div>
                    <div style="font-size:11px; color:#999;">${col.items.length} items</div>
                `;
                item.addEventListener('click', () => {
                    openCategoryDetails(col);
                });
                grid.appendChild(item);
            });
        });
    }
    
    // Initial render
    renderCollectionsGrid();

    // Details Modal Logic
    if(closeDetails) {
        closeDetails.addEventListener('click', () => {
            modalOverlay.style.display = 'none';
        });
    }

    if(toggleBlock) {
        toggleBlock.addEventListener('change', (e) => {
            if(!currentDetailColId) return;
            const isBlocked = e.target.checked;
            chrome.storage.local.get(['collections'], (result) => {
                const cols = result.collections || [];
                const col = cols.find(c => c.id === currentDetailColId);
                if(col) {
                    col.isBlocked = isBlocked;
                    chrome.storage.local.set({collections: cols}, () => {
                        showNotification(isBlocked ? `Blocked ${col.name}` : `Unblocked ${col.name}`);
                    });
                }
            });
        });
    }

    if(btnDeleteCol) {
        btnDeleteCol.addEventListener('click', () => {
            if(!currentDetailColId) return;
            if(confirm('Are you sure you want to delete this category?')) {
                chrome.storage.local.get(['collections'], (result) => {
                    let cols = result.collections || [];
                    cols = cols.filter(c => c.id !== currentDetailColId);
                    chrome.storage.local.set({collections: cols}, () => {
                        modalOverlay.style.display = 'none';
                        renderCollectionsGrid();
                        showNotification('Category deleted');
                    });
                });
            }
        });
    }
});
