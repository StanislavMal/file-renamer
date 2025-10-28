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
    excludeMode: false,
    lastPlan: null
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
        const item = document.createElement('div');
        item.className = 'file-item';
        item.dataset.index = index;
        
        if (state.selectedTarget === index) {
            item.classList.add('selected');
        }
        
        const isPaired = state.pairs[file.name];
        if (isPaired) {
            item.classList.add('paired');
        }
        
        item.textContent = file.name;
        
        if (isPaired && state.mode === 'pairing') {
            const info = document.createElement('small');
            info.textContent = `→ ${computeNewName(file.name, state.pairs[file.name])}`;
            item.appendChild(info);
        }
        
        item.addEventListener('click', () => handleTargetClick(index));
        list.appendChild(item);
    });
}

function renderSourceList() {
    const list = document.getElementById('source-list');
    list.innerHTML = '';
    
    state.visibleSourceFiles.forEach((file, index) => {
        const item = document.createElement('div');
        item.className = 'file-item';
        item.dataset.index = index;
        
        if (state.selectedSource === index) {
            item.classList.add('selected');
        }
        
        // Check if this source is already paired
        const pairedTarget = Object.keys(state.pairs).find(k => state.pairs[k] === file.name);
        if (pairedTarget) {
            item.classList.add('paired');
            const info = document.createElement('small');
            info.textContent = `← ${pairedTarget}`;
            item.appendChild(document.createTextNode(file.name));
            item.appendChild(info);
        } else {
            item.textContent = file.name;
        }
        
        item.addEventListener('click', () => handleSourceClick(index));
        list.appendChild(item);
    });
}

function updateCounts() {
    document.getElementById('target-count').textContent = `Файлов: ${state.targetFiles.length}`;
    document.getElementById('source-count').textContent = `Файлов: ${state.sourceFiles.length}`;
    document.getElementById('target-visible-count').textContent = state.visibleTargetFiles.length;
    document.getElementById('target-total-count').textContent = state.targetFiles.length;
    document.getElementById('source-visible-count').textContent = state.visibleSourceFiles.length;
    document.getElementById('source-total-count').textContent = state.sourceFiles.length;
}

// ========== PAIRING MODE ==========
function handleTargetClick(index) {
    if (state.excludeMode) {
        excludeTargetFile(index);
        return;
    }
    
    state.selectedTarget = index;
    renderTargetList();
    tryCreatePair();
}

function handleSourceClick(index) {
    if (state.excludeMode) {
        excludeSourceFile(index);
        return;
    }
    
    state.selectedSource = index;
    renderSourceList();
    tryCreatePair();
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

function excludeTargetFile(index) {
    const file = state.visibleTargetFiles[index];
    delete state.pairs[file.name];
    state.visibleTargetFiles.splice(index, 1);
    renderTargetList();
    updateCounts();
    updatePreview();
}

function excludeSourceFile(index) {
    const file = state.visibleSourceFiles[index];
    
    // Remove pairing
    Object.keys(state.pairs).forEach(key => {
        if (state.pairs[key] === file.name) {
            delete state.pairs[key];
        }
    });
    
    state.visibleSourceFiles.splice(index, 1);
    renderSourceList();
    updateCounts();
    updatePreview();
}

function moveTargetFile(direction) {
    if (state.selectedTarget === null) return;
    
    const newIndex = state.selectedTarget + direction;
    if (newIndex < 0 || newIndex >= state.visibleTargetFiles.length) return;
    
    const temp = state.visibleTargetFiles[state.selectedTarget];
    state.visibleTargetFiles[state.selectedTarget] = state.visibleTargetFiles[newIndex];
    state.visibleTargetFiles[newIndex] = temp;
    
    state.selectedTarget = newIndex;
    renderTargetList();
}

function moveSourceFile(direction) {
    if (state.selectedSource === null) return;
    
    const newIndex = state.selectedSource + direction;
    if (newIndex < 0 || newIndex >= state.visibleSourceFiles.length) return;
    
    const temp = state.visibleSourceFiles[state.selectedSource];
    state.visibleSourceFiles[state.selectedSource] = state.visibleSourceFiles[newIndex];
    state.visibleSourceFiles[newIndex] = temp;
    
    state.selectedSource = newIndex;
    renderSourceList();
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
    const renameBtn = document.getElementById('rename-btn');
    
    try {
        let result;
        
        if (state.mode === 'pairing') {
            if (!state.targetDir || Object.keys(state.pairs).length === 0) {
                previewContent.innerHTML = '<p class="text-muted">Создайте пары для предпросмотра</p>';
                renameBtn.disabled = true;
                return;
            }
            
            result = await BuildPlanFromPairs(state.targetDir, state.pairs);
        } else {
            // Batch mode
            const params = {
                find: document.getElementById('batch-find').value,
                replace: document.getElementById('batch-replace').value,
                prefix: document.getElementById('batch-prefix').value,
                suffix: document.getElementById('batch-suffix').value
            };
            
            if (!state.targetDir || (!params.find && !params.prefix && !params.suffix)) {
                previewContent.innerHTML = '<p class="text-muted">Задайте параметры обработки</p>';
                renameBtn.disabled = true;
                return;
            }
            
            const fileNames = state.visibleTargetFiles.map(f => f.name);
            result = await BuildPlanFromBatch(state.targetDir, fileNames, params);
        }
        
        state.lastPlan = result;
        
        let html = '';
        
        if (result.operations && result.operations.length > 0) {
            html += `<div style="margin-bottom: 16px;"><strong>Будут переименованы (${result.operations.length}):</strong></div>`;
            result.operations.forEach(op => {
                html += `<div class="preview-op">• ${op.oldName} → ${op.newName}`;
                if (state.mode === 'pairing' && op.sourceName) {
                    html += ` <small>(источник: ${op.sourceName})</small>`;
                }
                html += `</div>`;
            });
        } else {
            html += '<p class="text-muted">Нет валидных переименований</p>';
        }
        
        if (result.conflicts && result.conflicts.length > 0) {
            html += `<div style="margin-top: 16px; margin-bottom: 8px;"><strong style="color: var(--error);">Конфликты (${result.conflicts.length}):</strong></div>`;
            result.conflicts.forEach(c => {
                html += `<div class="preview-op conflict">• ${c.targetName} → ${c.newName}<br><small>${c.reason}</small></div>`;
            });
        }
        
        previewContent.innerHTML = html;
        renameBtn.disabled = !result.operations || result.operations.length === 0;
        
    } catch (error) {
        console.error('Ошибка построения плана:', error);
        previewContent.innerHTML = `<p style="color: var(--error);">Ошибка: ${error}</p>`;
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
    updateCounts();
    updatePreview();
    
    if (state.mode === 'batch') {
        document.getElementById('batch-find').value = '';
        document.getElementById('batch-replace').value = '';
        document.getElementById('batch-prefix').value = '';
        document.getElementById('batch-suffix').value = '';
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
        if (e.target.tagName === 'BUTTON') {
            switchMode(e.target.dataset.mode);
        }
    });
    
    // Folder selection
    document.getElementById('target-browse-btn').addEventListener('click', selectTargetFolder);
    document.getElementById('source-browse-btn').addEventListener('click', selectSourceFolder);
    
    // Pairing controls
    document.getElementById('map-in-order-btn').addEventListener('click', mapInOrder);
    document.getElementById('unpair-btn').addEventListener('click', unpairSelected);
    document.getElementById('exclude-mode-check').addEventListener('change', (e) => {
        state.excludeMode = e.target.checked;
        state.selectedTarget = null;
        state.selectedSource = null;
        renderTargetList();
        renderSourceList();
    });
    
    // List controls
    document.getElementById('target-up-btn').addEventListener('click', () => moveTargetFile(-1));
    document.getElementById('target-down-btn').addEventListener('click', () => moveTargetFile(1));
    document.getElementById('source-up-btn').addEventListener('click', () => moveSourceFile(-1));
    document.getElementById('source-down-btn').addEventListener('click', () => moveSourceFile(1));
    
    // Batch inputs
    ['batch-find', 'batch-replace', 'batch-prefix', 'batch-suffix'].forEach(id => {
        document.getElementById(id).addEventListener('input', updatePreview);
    });
    
    // Actions
    document.getElementById('reset-btn').addEventListener('click', resetState);
    document.getElementById('rename-btn').addEventListener('click', executeRename);
});