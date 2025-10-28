import {
    WindowMinimize,
    WindowToggleMaximize,
    WindowClose,
    GetFilesInDirectory,
    SelectFolder,
    BuildPlanFromPairs,
    BuildPlanFromBatch,
    ExecuteRename
} from '../wailsjs/go/main/App';

// ========== STATE ==========
const state = {
    mode: 'pairing', // 'pairing' | 'batch'
    targetDir: '',
    sourceDir: '',
    targetFiles: [],
    sourceFiles: [],
    visibleTargetFiles: [],
    visibleSourceFiles: [],
    pairs: {}, // targetName -> sourceName
    selectedTarget: null,
    selectedSource: null,
    lastPlan: null,
    draggedItem: null,
    draggedList: null
};

// ========== THEME ==========
function getSystemTheme() {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function setTheme(theme) {
    const actualTheme = theme === 'System' ? getSystemTheme() : theme.toLowerCase();
    document.documentElement.setAttribute('data-theme', actualTheme);
    localStorage.setItem('theme', theme);
    updateActiveThemeButton(theme);
}

function updateActiveThemeButton(activeTheme) {
    document.querySelectorAll('.theme-buttons button').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.theme === activeTheme);
    });
}

// ========== MODE SWITCHING ==========
function switchMode(newMode) {
    state.mode = newMode;
    
    document.querySelectorAll('.mode-buttons button').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === newMode);
    });
    
    document.querySelectorAll('.mode-content').forEach(content => {
        content.classList.remove('active');
    });
    
    document.getElementById(`${newMode}-mode`).classList.add('active');
    
    // Show/hide source folder selector
    const sourceGroup = document.getElementById('source-group');
    if (newMode === 'pairing') {
        sourceGroup.classList.remove('hidden');
    } else {
        sourceGroup.classList.add('hidden');
        renderBatchList();
    }
    
    resetState();
    updatePreview();
}

// ========== FILE OPERATIONS ==========
async function loadTargetFiles() {
    if (!state.targetDir) return;
    
    try {
        const files = await GetFilesInDirectory(state.targetDir);
        state.targetFiles = files;
        state.visibleTargetFiles = [...files];
        renderTargetList();
        
        if (state.mode === 'batch') {
            renderBatchList();
        }
        
        updateCounts();
        updatePreview();
    } catch (error) {
        console.error('Ошибка загрузки целевых файлов:', error);
        alert(`Ошибка: ${error}`);
    }
}

async function loadSourceFiles() {
    if (!state.sourceDir) return;
    
    try {
        const files = await GetFilesInDirectory(state.sourceDir);
        state.sourceFiles = files;
        state.visibleSourceFiles = [...files];
        renderSourceList();
        updateCounts();
    } catch (error) {
        console.error('Ошибка загрузки файлов-образцов:', error);
        alert(`Ошибка: ${error}`);
    }
}

async function selectTargetFolder() {
    try {
        const path = await SelectFolder(state.targetDir);
        if (path) {
            state.targetDir = path;
            document.getElementById('target-path').value = path;
            await loadTargetFiles();
        }
    } catch (error) {
        console.error('Ошибка выбора папки:', error);
    }
}

async function selectSourceFolder() {
    try {
        const path = await SelectFolder(state.sourceDir);
        if (path) {
            state.sourceDir = path;
            document.getElementById('source-path').value = path;
            await loadSourceFiles();
        }
    } catch (error) {
        console.error('Ошибка выбора папки:', error);
    }
}

// ========== RENDERING ==========
function renderTargetList() {
    const list = document.getElementById('target-list');
    list.innerHTML = '';
    
    state.visibleTargetFiles.forEach((file, index) => {
        const item = createFileItem(file, index, 'target');
        list.appendChild(item);
    });
}

function renderSourceList() {
    const list = document.getElementById('source-list');
    list.innerHTML = '';
    
    state.visibleSourceFiles.forEach((file, index) => {
        const item = createFileItem(file, index, 'source');
        list.appendChild(item);
    });
}

function renderBatchList() {
    const list = document.getElementById('batch-list');
    if (!list) return;
    
    list.innerHTML = '';
    
    state.visibleTargetFiles.forEach((file, index) => {
        const item = createFileItem(file, index, 'batch');
        list.appendChild(item);
    });
}

function createFileItem(file, index, listType) {
    const item = document.createElement('div');
    item.className = 'file-item';
    item.dataset.index = index;
    item.dataset.listType = listType;
    item.draggable = true;
    
    // Selection state
    if (listType === 'target' && state.selectedTarget === index) {
        item.classList.add('selected');
    } else if (listType === 'source' && state.selectedSource === index) {
        item.classList.add('selected');
    }
    
    // Paired state
    const isPaired = state.pairs[file.name];
    if (isPaired && listType === 'target') {
        item.classList.add('paired');
    }
    
    // Check if source is paired
    if (listType === 'source') {
        const pairedTarget = Object.keys(state.pairs).find(k => state.pairs[k] === file.name);
        if (pairedTarget) {
            item.classList.add('paired');
        }
    }
    
    // File name
    const nameSpan = document.createElement('span');
    nameSpan.textContent = file.name;
    item.appendChild(nameSpan);
    
    // Additional info
    if (isPaired && state.mode === 'pairing' && listType === 'target') {
        const info = document.createElement('small');
        info.textContent = `→ ${computeNewName(file.name, state.pairs[file.name])}`;
        item.appendChild(info);
    }
    
    if (listType === 'source') {
        const pairedTarget = Object.keys(state.pairs).find(k => state.pairs[k] === file.name);
        if (pairedTarget) {
            const info = document.createElement('small');
            info.textContent = `← ${pairedTarget}`;
            item.appendChild(info);
        }
    }
    
    // Remove button
    const removeBtn = document.createElement('button');
    removeBtn.className = 'file-item-remove';
    removeBtn.innerHTML = '✕';
    removeBtn.title = 'Исключить файл';
    removeBtn.onclick = (e) => {
        e.stopPropagation();
        excludeFile(index, listType);
    };
    item.appendChild(removeBtn);
    
    // Events
    item.addEventListener('click', () => handleFileClick(index, listType));
    
    // Drag events
    item.addEventListener('dragstart', (e) => handleDragStart(e, index, listType));
    item.addEventListener('dragend', (e) => handleDragEnd(e));
    item.addEventListener('dragover', (e) => handleDragOver(e));
    item.addEventListener('drop', (e) => handleDrop(e, index, listType));
    item.addEventListener('dragleave', (e) => handleDragLeave(e));
    
    return item;
}

function updateCounts() {
    document.getElementById('target-count').textContent = `Файлов: ${state.targetFiles.length}`;
    document.getElementById('source-count').textContent = `Файлов: ${state.sourceFiles.length}`;
    document.getElementById('target-visible-count').textContent = state.visibleTargetFiles.length;
    document.getElementById('target-total-count').textContent = state.targetFiles.length;
    document.getElementById('source-visible-count').textContent = state.visibleSourceFiles.length;
    document.getElementById('source-total-count').textContent = state.sourceFiles.length;
    
    const batchVisibleCount = document.getElementById('batch-visible-count');
    const batchTotalCount = document.getElementById('batch-total-count');
    if (batchVisibleCount && batchTotalCount) {
        batchVisibleCount.textContent = state.visibleTargetFiles.length;
        batchTotalCount.textContent = state.targetFiles.length;
    }
}

// ========== DRAG AND DROP ==========
function handleDragStart(e, index, listType) {
    state.draggedItem = index;
    state.draggedList = listType;
    e.currentTarget.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
}

function handleDragEnd(e) {
    e.currentTarget.classList.remove('dragging');
    document.querySelectorAll('.file-item').forEach(item => {
        item.classList.remove('drag-over');
    });
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const item = e.currentTarget;
    if (!item.classList.contains('dragging')) {
        item.classList.add('drag-over');
    }
}

function handleDragLeave(e) {
    e.currentTarget.classList.remove('drag-over');
}

function handleDrop(e, targetIndex, targetListType) {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    
    if (state.draggedList !== targetListType || state.draggedItem === targetIndex) {
        return;
    }
    
    const draggedIndex = state.draggedItem;
    let list;
    
    if (targetListType === 'target' || targetListType === 'batch') {
        list = state.visibleTargetFiles;
    } else if (targetListType === 'source') {
        list = state.visibleSourceFiles;
    }
    
    // Reorder
    const draggedFile = list[draggedIndex];
    list.splice(draggedIndex, 1);
    
    // Adjust target index if needed
    const newIndex = draggedIndex < targetIndex ? targetIndex - 1 : targetIndex;
    list.splice(newIndex, 0, draggedFile);
    
    // Re-render
    if (targetListType === 'target') {
        renderTargetList();
    } else if (targetListType === 'source') {
        renderSourceList();
    } else if (targetListType === 'batch') {
        renderBatchList();
    }
    
    updatePreview();
}

// ========== PAIRING MODE ==========
function handleFileClick(index, listType) {
    if (listType === 'target') {
        // Toggle selection
        if (state.selectedTarget === index) {
            state.selectedTarget = null;
        } else {
            state.selectedTarget = index;
        }
        renderTargetList();
        tryCreatePair();
    } else if (listType === 'source') {
        // Toggle selection
        if (state.selectedSource === index) {
            state.selectedSource = null;
        } else {
            state.selectedSource = index;
        }
        renderSourceList();
        tryCreatePair();
    }
}

function tryCreatePair() {
    if (state.selectedTarget === null || state.selectedSource === null) return;
    
    const targetFile = state.visibleTargetFiles[state.selectedTarget];
    const sourceFile = state.visibleSourceFiles[state.selectedSource];
    
    if (!targetFile || !sourceFile) return;
    
    // Remove old pairing
    delete state.pairs[targetFile.name];
    
    // Remove if source was paired with someone else
    Object.keys(state.pairs).forEach(key => {
        if (state.pairs[key] === sourceFile.name) {
            delete state.pairs[key];
        }
    });
    
    // Create new pair
    state.pairs[targetFile.name] = sourceFile.name;
    
    state.selectedTarget = null;
    state.selectedSource = null;
    
    renderTargetList();
    renderSourceList();
    updatePreview();
}

function excludeFile(index, listType) {
    if (listType === 'target' || listType === 'batch') {
        const file = state.visibleTargetFiles[index];
        delete state.pairs[file.name];
        state.visibleTargetFiles.splice(index, 1);
        renderTargetList();
        if (state.mode === 'batch') {
            renderBatchList();
        }
    } else if (listType === 'source') {
        const file = state.visibleSourceFiles[index];
        
        // Remove pairing
        Object.keys(state.pairs).forEach(key => {
            if (state.pairs[key] === file.name) {
                delete state.pairs[key];
            }
        });
        
        state.visibleSourceFiles.splice(index, 1);
        renderSourceList();
    }
    
    updateCounts();
    updatePreview();
}

function mapInOrder() {
    if (!state.targetDir || !state.sourceDir) {
        alert('Выберите обе папки');
        return;
    }
    
    if (state.visibleTargetFiles.length === 0 || state.visibleSourceFiles.length === 0) {
        alert('Один из списков пуст');
        return;
    }
    
    const limit = Math.min(state.visibleTargetFiles.length, state.visibleSourceFiles.length);
    
    if (!confirm(`Сопоставить первые ${limit} файлов по порядку?`)) {
        return;
    }
    
    state.pairs = {};
    for (let i = 0; i < limit; i++) {
        state.pairs[state.visibleTargetFiles[i].name] = state.visibleSourceFiles[i].name;
    }
    
    renderTargetList();
    renderSourceList();
    updatePreview();
}

function unpairSelected() {
    let removed = false;
    
    if (state.selectedTarget !== null) {
        const file = state.visibleTargetFiles[state.selectedTarget];
        if (state.pairs[file.name]) {
            delete state.pairs[file.name];
            removed = true;
        }
    }
    
    if (!removed && state.selectedSource !== null) {
        const file = state.visibleSourceFiles[state.selectedSource];
        Object.keys(state.pairs).forEach(key => {
            if (state.pairs[key] === file.name) {
                delete state.pairs[key];
                removed = true;
            }
        });
    }
    
    if (removed) {
        state.selectedTarget = null;
        state.selectedSource = null;
        renderTargetList();
        renderSourceList();
        updatePreview();
    }
}

// ========== PREVIEW ==========
async function updatePreview() {
    const previewContent = document.getElementById('preview-content');
    const previewCount = document.getElementById('preview-count');
    const renameBtn = document.getElementById('rename-btn');
    
    try {
        let result;
        
        if (state.mode === 'pairing') {
            if (!state.targetDir || Object.keys(state.pairs).length === 0) {
                previewContent.innerHTML = '<p class="text-muted">Создайте пары для предпросмотра</p>';
                previewCount.textContent = '';
                renameBtn.disabled = true;
                return;
            }
            
            result = await BuildPlanFromPairs(state.targetDir, state.pairs);
        } else {
            // Batch mode
            const numberingEnabled = document.getElementById('batch-numbering').checked;
            const params = {
                find: document.getElementById('batch-find').value,
                replace: document.getElementById('batch-replace').value,
                prefix: document.getElementById('batch-prefix').value,
                suffix: document.getElementById('batch-suffix').value,
                numbering: numberingEnabled,
                numberPosition: numberingEnabled ? document.getElementById('batch-number-position').value : '',
                numberFormat: numberingEnabled ? document.getElementById('batch-number-format').value : '',
                numberStart: numberingEnabled ? parseInt(document.getElementById('batch-number-start').value) || 1 : 0
            };
            
            if (!state.targetDir || (!params.find && !params.prefix && !params.suffix && !params.numbering)) {
                previewContent.innerHTML = '<p class="text-muted">Задайте параметры обработки</p>';
                previewCount.textContent = '';
                renameBtn.disabled = true;
                return;
            }
            
            const fileNames = state.visibleTargetFiles.map(f => f.name);
            result = await BuildPlanFromBatch(state.targetDir, fileNames, params);
        }
        
        state.lastPlan = result;
        
        let html = '';
        
        if (result.operations && result.operations.length > 0) {
            previewCount.textContent = `${result.operations.length} операций`;
            
            result.operations.forEach(op => {
                html += `<div class="preview-op">• ${op.oldName} → ${op.newName}`;
                if (state.mode === 'pairing' && op.sourceName) {
                    html += ` <small>(источник: ${op.sourceName})</small>`;
                }
                html += `</div>`;
            });
        } else {
            html += '<p class="text-muted">Нет валидных переименований</p>';
            previewCount.textContent = '';
        }
        
        if (result.conflicts && result.conflicts.length > 0) {
            html += `<div style="margin-top: 12px; margin-bottom: 6px;"><strong style="color: var(--error);">Конфликты (${result.conflicts.length}):</strong></div>`;
            result.conflicts.forEach(c => {
                html += `<div class="preview-op conflict">• ${c.targetName} → ${c.newName}<br><small>${c.reason}</small></div>`;
            });
        }
        
        previewContent.innerHTML = html;
        renameBtn.disabled = !result.operations || result.operations.length === 0;
        
    } catch (error) {
        console.error('Ошибка построения плана:', error);
        previewContent.innerHTML = `<p style="color: var(--error);">Ошибка: ${error}</p>`;
        previewCount.textContent = '';
        renameBtn.disabled = true;
    }
}

// ========== EXECUTION ==========
async function executeRename() {
    if (!state.lastPlan || !state.lastPlan.operations || state.lastPlan.operations.length === 0) {
        alert('Нет операций для выполнения');
        return;
    }
    
    const count = state.lastPlan.operations.length;
    if (!confirm(`Выполнить ${count} переименований?`)) {
        return;
    }
    
    try {
        const result = await ExecuteRename(state.lastPlan.operations);
        
        if (result.errors && result.errors.length > 0) {
            alert(`Успешно: ${result.success}\nОшибок: ${result.errors.length}\n\n${result.errors.join('\n')}`);
        } else {
            alert(`Успешно переименовано: ${result.success}`);
        }
        
        // Reload files
        await loadTargetFiles();
        if (state.mode === 'pairing') {
            await loadSourceFiles();
        }
        resetState();
        
    } catch (error) {
        console.error('Ошибка выполнения:', error);
        alert(`Ошибка: ${error}`);
    }
}

// ========== RESET ==========
function resetState() {
    state.pairs = {};
    state.selectedTarget = null;
    state.selectedSource = null;
    state.visibleTargetFiles = [...state.targetFiles];
    state.visibleSourceFiles = [...state.sourceFiles];
    state.lastPlan = null;
    
    renderTargetList();
    renderSourceList();
    if (state.mode === 'batch') {
        renderBatchList();
    }
    updateCounts();
    updatePreview();
    
    if (state.mode === 'batch') {
        document.getElementById('batch-find').value = '';
        document.getElementById('batch-replace').value = '';
        document.getElementById('batch-prefix').value = '';
        document.getElementById('batch-suffix').value = '';
        document.getElementById('batch-numbering').checked = false;
        document.getElementById('numbering-options').classList.remove('active');
        document.getElementById('batch-number-start').value = '1';
        document.getElementById('batch-number-format').value = '000';
    }
}

// ========== UTILITIES ==========
function computeNewName(targetName, sourceName) {
    const targetExt = targetName.substring(targetName.lastIndexOf('.'));
    const sourceExt = sourceName.substring(sourceName.lastIndexOf('.'));
    const sourceBase = sourceName.substring(0, sourceName.length - sourceExt.length);
    return sourceBase + targetExt;
}

// ========== INITIALIZATION ==========
document.addEventListener('DOMContentLoaded', () => {
    // Window controls
    document.getElementById('minimize-btn').addEventListener('click', () => {
        WindowMinimize().catch(console.error);
    });
    
    document.getElementById('maximize-btn').addEventListener('click', () => {
        WindowToggleMaximize().catch(console.error);
    });
    
    document.getElementById('close-btn').addEventListener('click', () => {
        WindowClose().catch(console.error);
    });
    
    // Theme
    const savedTheme = localStorage.getItem('theme') || 'Light';
    setTheme(savedTheme);
    
    document.querySelector('.theme-buttons').addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON') {
            setTheme(e.target.dataset.theme);
        }
    });
    
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        if (localStorage.getItem('theme') === 'System') {
            setTheme('System');
        }
    });
    
    // Mode switching
    document.querySelector('.mode-buttons').addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON' || e.target.parentElement.tagName === 'BUTTON') {
            const btn = e.target.tagName === 'BUTTON' ? e.target : e.target.parentElement;
            switchMode(btn.dataset.mode);
        }
    });
    
    // Folder selection
    document.getElementById('target-browse-btn').addEventListener('click', selectTargetFolder);
    document.getElementById('source-browse-btn').addEventListener('click', selectSourceFolder);
    
    // Pairing controls
    document.getElementById('map-in-order-btn').addEventListener('click', mapInOrder);
    document.getElementById('unpair-btn').addEventListener('click', unpairSelected);
    
    // Batch inputs
    ['batch-find', 'batch-replace', 'batch-prefix', 'batch-suffix'].forEach(id => {
        document.getElementById(id).addEventListener('input', updatePreview);
    });
    
    // Numbering controls
    const numberingCheckbox = document.getElementById('batch-numbering');
    const numberingOptions = document.getElementById('numbering-options');
    
    numberingCheckbox.addEventListener('change', (e) => {
        if (e.target.checked) {
            numberingOptions.classList.add('active');
        } else {
            numberingOptions.classList.remove('active');
        }
        updatePreview();
    });
    
    document.getElementById('batch-number-position').addEventListener('change', updatePreview);
    document.getElementById('batch-number-format').addEventListener('input', updatePreview);
    document.getElementById('batch-number-start').addEventListener('input', updatePreview);
    
    // Actions
    document.getElementById('reset-btn').addEventListener('click', resetState);
    document.getElementById('rename-btn').addEventListener('click', executeRename);
});