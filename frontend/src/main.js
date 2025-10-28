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
    selectedTarget: new Set(), // Множественное выделение
    selectedSource: new Set(),
    lastClickedTarget: null, // Для Shift-выделения
    lastClickedSource: null,
    lastPlan: null,
    draggedItems: null, // Массив индексов перетаскиваемых элементов
    draggedList: null,
    dropIndicator: null
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
    const selectedSet = listType === 'target' ? state.selectedTarget : state.selectedSource;
    if (selectedSet.has(index)) {
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
    item.addEventListener('click', (e) => handleFileClick(e, index, listType));
    
    // Drag events
    item.addEventListener('dragstart', (e) => handleDragStart(e, index, listType));
    item.addEventListener('dragend', (e) => handleDragEnd(e));
    item.addEventListener('dragover', (e) => handleDragOver(e, index, listType));
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

// ========== SELECTION ==========
function handleFileClick(e, index, listType) {
    const selectedSet = listType === 'target' ? state.selectedTarget : state.selectedSource;
    const lastClicked = listType === 'target' ? state.lastClickedTarget : state.lastClickedSource;
    const fileList = listType === 'target' || listType === 'batch' ? state.visibleTargetFiles : state.visibleSourceFiles;
    
    if (e.shiftKey && lastClicked !== null) {
        // Shift-выделение диапазона
        const start = Math.min(lastClicked, index);
        const end = Math.max(lastClicked, index);
        
        for (let i = start; i <= end; i++) {
            selectedSet.add(i);
        }
    } else if (e.ctrlKey || e.metaKey) {
        // Ctrl/Cmd - переключение выделения
        if (selectedSet.has(index)) {
            selectedSet.delete(index);
        } else {
            selectedSet.add(index);
        }
    } else {
        // Обычный клик - выделение одного элемента
        selectedSet.clear();
        selectedSet.add(index);
    }
    
    // Обновляем последний кликнутый
    if (listType === 'target') {
        state.lastClickedTarget = index;
    } else {
        state.lastClickedSource = index;
    }
    
    // Пробуем создать пару если выделен один target и один source
    if (state.mode === 'pairing') {
        tryCreatePair();
    }
    
    // Перерисовываем списки
    if (listType === 'target') {
        renderTargetList();
    } else if (listType === 'source') {
        renderSourceList();
    } else if (listType === 'batch') {
        renderBatchList();
    }
}

// ========== DRAG AND DROP ==========
function handleDragStart(e, index, listType) {
    const selectedSet = listType === 'target' ? state.selectedTarget : state.selectedSource;
    
    // Если кликнутый элемент не выделен, выделяем только его
    if (!selectedSet.has(index)) {
        selectedSet.clear();
        selectedSet.add(index);
        
        if (listType === 'target') {
            renderTargetList();
        } else if (listType === 'source') {
            renderSourceList();
        } else if (listType === 'batch') {
            renderBatchList();
        }
    }
    
    // Перетаскиваем все выделенные элементы
    state.draggedItems = Array.from(selectedSet).sort((a, b) => a - b);
    state.draggedList = listType;
    
    e.currentTarget.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', ''); // Для Firefox
}

function handleDragEnd(e) {
    e.currentTarget.classList.remove('dragging');
    removeDropIndicator();
    
    document.querySelectorAll('.file-item').forEach(item => {
        item.classList.remove('drag-over');
    });
}

function handleDragOver(e, targetIndex, targetListType) {
    e.preventDefault();
    
    // Можно перетаскивать только внутри одного списка
    if (state.draggedList !== targetListType) {
        return;
    }
    
    e.dataTransfer.dropEffect = 'move';
    
    // Показываем индикатор между элементами
    showDropIndicator(e, targetIndex, targetListType);
}

function handleDragLeave(e) {
    if (!e.currentTarget.contains(e.relatedTarget)) {
        e.currentTarget.classList.remove('drag-over');
    }
}

function handleDrop(e, targetIndex, targetListType) {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    removeDropIndicator();
    
    if (state.draggedList !== targetListType || !state.draggedItems || state.draggedItems.length === 0) {
        return;
    }
    
    let list;
    if (targetListType === 'target' || targetListType === 'batch') {
        list = state.visibleTargetFiles;
    } else if (targetListType === 'source') {
        list = state.visibleSourceFiles;
    }
    
    // Определяем позицию для вставки
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseY = e.clientY;
    const itemMiddle = rect.top + rect.height / 2;
    const insertBefore = mouseY < itemMiddle;
    
    let insertIndex = insertBefore ? targetIndex : targetIndex + 1;
    
    // Извлекаем перетаскиваемые элементы
    const draggedFiles = state.draggedItems.map(idx => list[idx]);
    
    // Удаляем их из исходных позиций (в обратном порядке, чтобы индексы не сбивались)
    const sortedIndices = [...state.draggedItems].sort((a, b) => b - a);
    for (const idx of sortedIndices) {
        list.splice(idx, 1);
        // Корректируем insertIndex если удаляем элементы перед местом вставки
        if (idx < insertIndex) {
            insertIndex--;
        }
    }
    
    // Вставляем в новую позицию
    list.splice(insertIndex, 0, ...draggedFiles);
    
    // Обновляем выделение на новые индексы
    const selectedSet = targetListType === 'target' ? state.selectedTarget : state.selectedSource;
    selectedSet.clear();
    for (let i = 0; i < draggedFiles.length; i++) {
        selectedSet.add(insertIndex + i);
    }
    
    // Перерисовываем
    if (targetListType === 'target') {
        renderTargetList();
    } else if (targetListType === 'source') {
        renderSourceList();
    } else if (targetListType === 'batch') {
        renderBatchList();
    }
    
    updatePreview();
}

function showDropIndicator(e, targetIndex, listType) {
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseY = e.clientY;
    const itemMiddle = rect.top + rect.height / 2;
    const insertBefore = mouseY < itemMiddle;
    
    removeDropIndicator();
    
    const indicator = document.createElement('div');
    indicator.className = 'drop-indicator';
    indicator.id = 'drop-indicator';
    
    if (insertBefore) {
        e.currentTarget.parentNode.insertBefore(indicator, e.currentTarget);
    } else {
        if (e.currentTarget.nextSibling) {
            e.currentTarget.parentNode.insertBefore(indicator, e.currentTarget.nextSibling);
        } else {
            e.currentTarget.parentNode.appendChild(indicator);
        }
    }
    
    state.dropIndicator = indicator;
}

function removeDropIndicator() {
    if (state.dropIndicator) {
        state.dropIndicator.remove();
        state.dropIndicator = null;
    }
}

// ========== PAIRING MODE ==========
function tryCreatePair() {
    if (state.selectedTarget.size !== 1 || state.selectedSource.size !== 1) {
        return;
    }
    
    const targetIndex = Array.from(state.selectedTarget)[0];
    const sourceIndex = Array.from(state.selectedSource)[0];
    
    const targetFile = state.visibleTargetFiles[targetIndex];
    const sourceFile = state.visibleSourceFiles[sourceIndex];
    
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
    
    state.selectedTarget.clear();
    state.selectedSource.clear();
    state.lastClickedTarget = null;
    state.lastClickedSource = null;
    
    renderTargetList();
    renderSourceList();
    updatePreview();
}

function excludeFile(index, listType) {
    if (listType === 'target' || listType === 'batch') {
        const file = state.visibleTargetFiles[index];
        delete state.pairs[file.name];
        state.visibleTargetFiles.splice(index, 1);
        state.selectedTarget.delete(index);
        
        // Обновляем индексы в selectedTarget
        const newSelected = new Set();
        state.selectedTarget.forEach(idx => {
            if (idx > index) {
                newSelected.add(idx - 1);
            } else if (idx < index) {
                newSelected.add(idx);
            }
        });
        state.selectedTarget = newSelected;
        
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
        state.selectedSource.delete(index);
        
        // Обновляем индексы в selectedSource
        const newSelected = new Set();
        state.selectedSource.forEach(idx => {
            if (idx > index) {
                newSelected.add(idx - 1);
            } else if (idx < index) {
                newSelected.add(idx);
            }
        });
        state.selectedSource = newSelected;
        
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

// ========== PREVIEW ==========
async function updatePreview() {
    const previewContent = document.getElementById('preview-content');
    const previewCount = document.getElementById('preview-count');
    const renameBtn = document.getElementById('rename-btn');
    const batchRenameBtn = document.getElementById('batch-rename-btn');
    
    try {
        let result;
        
        if (state.mode === 'pairing') {
            if (!state.targetDir || Object.keys(state.pairs).length === 0) {
                previewContent.innerHTML = '<p class="text-muted">Создайте пары для предпросмотра</p>';
                previewCount.textContent = '';
                if (renameBtn) renameBtn.disabled = true;
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
                if (batchRenameBtn) batchRenameBtn.disabled = true;
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
        
        const hasOperations = result.operations && result.operations.length > 0;
        if (renameBtn) renameBtn.disabled = !hasOperations;
        if (batchRenameBtn) batchRenameBtn.disabled = !hasOperations;
        
    } catch (error) {
        console.error('Ошибка построения плана:', error);
        previewContent.innerHTML = `<p style="color: var(--error);">Ошибка: ${error}</p>`;
        previewCount.textContent = '';
        if (renameBtn) renameBtn.disabled = true;
        if (batchRenameBtn) batchRenameBtn.disabled = true;
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
    state.selectedTarget.clear();
    state.selectedSource.clear();
    state.lastClickedTarget = null;
    state.lastClickedSource = null;
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
    
    // Batch actions
    const batchResetBtn = document.getElementById('batch-reset-btn');
    const batchRenameBtn = document.getElementById('batch-rename-btn');
    if (batchResetBtn) batchResetBtn.addEventListener('click', resetState);
    if (batchRenameBtn) batchRenameBtn.addEventListener('click', executeRename);
});