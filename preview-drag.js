// ===== Screen Preview with Drag & Drop, Selection List, Snapping, and Grid =====
let previewState = {
    dragging: null,
    resizing: null,
    startX: 0,
    startY: 0,
    startLeft: 0,
    startTop: 0,
    startWidth: 0,
    startHeight: 0,
    screenWidth: 1920,
    screenHeight: 1080,
    hasChanges: false,
    selectedCamera: null
};

window.showScreenPreviewDraggable = function () {
    if (state.currentScreenIndex === null) return;

    const screen = state.config.essentials.screens[state.currentScreenIndex];
    const modal = document.getElementById('previewModal');
    const canvas = document.getElementById('previewCanvas');
    const cameraList = document.getElementById('previewCameraList');

    // Only sync resolution from global state if it's not already set in our session
    // or if we're explicitly opening the modal (not re-rendering)
    if (!modal.classList.contains('active')) {
        previewState.screenWidth = state.resolution.width;
        previewState.screenHeight = state.resolution.height;
        previewState.hasChanges = false;
        previewState.selectedCamera = null;
    }

    // Clear previous preview (keeping the grid)
    const grid = document.getElementById('previewGrid');
    const toggleGrid = document.getElementById('toggleGrid');

    // Sync grid visibility with checkbox (which is auto-checked in HTML)
    if (toggleGrid && toggleGrid.checked) grid.classList.add('active');
    else grid.classList.remove('active');

    canvas.innerHTML = '';
    canvas.appendChild(grid);
    cameraList.innerHTML = '';

    // Initialize resolution UI
    const resPreset = document.getElementById('resPreset');
    const resWidth = document.getElementById('resWidth');
    const resHeight = document.getElementById('resHeight');
    const customInputs = document.getElementById('customResInputs');

    const resStr = `${previewState.screenWidth}x${previewState.screenHeight}`;
    let foundPreset = false;
    for (let i = 0; i < resPreset.options.length; i++) {
        if (resPreset.options[i].value === resStr) {
            resPreset.selectedIndex = i;
            foundPreset = true;
            break;
        }
    }

    if (!foundPreset) {
        resPreset.value = 'custom';
        customInputs.style.display = 'flex';
    } else {
        customInputs.style.display = 'none';
    }

    // Update canvas aspect ratio
    canvas.style.aspectRatio = `${previewState.screenWidth} / ${previewState.screenHeight}`;

    resWidth.value = previewState.screenWidth;
    resHeight.value = previewState.screenHeight;

    // Calculate auto-layout if cameras don't have force_coordinates
    const camerasWithoutCoords = screen.streams.filter(s => !s.force_coordinates);

    if (camerasWithoutCoords.length > 0) {
        const columns = screen.nr_of_columns || 2;
        const rows = Math.ceil(camerasWithoutCoords.length / columns);
        const cellWidth = previewState.screenWidth / columns;
        const cellHeight = previewState.screenHeight / rows;

        camerasWithoutCoords.forEach((stream, index) => {
            const col = index % columns;
            const row = Math.floor(index / columns);

            stream._previewCoords = [
                Math.round(col * cellWidth),
                Math.round(row * cellHeight),
                Math.round((col + 1) * cellWidth),
                Math.round((row + 1) * cellHeight)
            ];
        });
    }

    // Render all cameras
    screen.streams.forEach((stream, index) => {
        const coords = stream.force_coordinates || stream._previewCoords;
        if (!coords || coords.length !== 4) return;

        const [x1, y1, x2, y2] = coords;
        const width = x2 - x1;
        const height = y2 - y1;
        const displayName = stream.name || `Camera ${index + 1}`;

        // Create camera list item
        const listItem = document.createElement('div');
        listItem.className = 'preview-camera-item';
        listItem.dataset.index = index;
        listItem.innerHTML = `
            <div class="preview-camera-item-name">${displayName}</div>
            <div class="preview-camera-item-info">${width}x${height}px • [${x1}, ${y1}, ${x2}, ${y2}]</div>
        `;
        listItem.addEventListener('click', () => selectPreviewCamera(index));
        cameraList.appendChild(listItem);

        // Create camera box on canvas
        const cameraDiv = document.createElement('div');
        cameraDiv.className = 'preview-camera' + (stream.showontop ? ' show-on-top' : '');
        cameraDiv.style.left = `${(x1 / previewState.screenWidth) * 100}%`;
        cameraDiv.style.top = `${(y1 / previewState.screenHeight) * 100}%`;
        cameraDiv.style.width = `${(width / previewState.screenWidth) * 100}%`;
        cameraDiv.style.height = `${(height / previewState.screenHeight) * 100}%`;
        cameraDiv.style.cursor = 'grab';
        cameraDiv.dataset.index = index;

        // Image support
        const showImages = document.getElementById('togglePreviewImages') && document.getElementById('togglePreviewImages').checked;
        const screenshot = state.screenshots[stream.url];

        if (showImages && screenshot) {
            cameraDiv.style.backgroundImage = `url(/screenshots/${screenshot})`;
            cameraDiv.style.backgroundSize = 'cover';
            cameraDiv.style.backgroundPosition = 'center';
            cameraDiv.classList.add('has-image');
        }

        cameraDiv.innerHTML = `
            ${(!showImages || !screenshot) ? `
            <div class="preview-camera-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                    <circle cx="12" cy="13" r="4"/>
                </svg>
            </div>` : ''}
            <div class="preview-camera-name" style="${(showImages && screenshot) ? 'text-shadow: 0 1px 3px rgba(0,0,0,0.8); font-weight: 700;' : ''}">${displayName}</div>
            <div class="preview-camera-coords">${width}x${height}px</div>
            <div class="preview-camera-coords">[${x1}, ${y1}, ${x2}, ${y2}]</div>
            <div class="preview-resize-handle"></div>
        `;

        cameraDiv.title = `${displayName}\nClick to select, then drag or use arrows to move. Drag corner to resize.`;

        cameraDiv.addEventListener('click', (e) => {
            if (!previewState.dragging && !previewState.resizing) {
                selectPreviewCamera(index);
            }
        });

        // Initialize dataset coords
        cameraDiv.dataset.coords = JSON.stringify([x1, y1, x2, y2]);

        setupDragAndResize(cameraDiv, canvas);
        canvas.appendChild(cameraDiv);
    });

    updatePreviewInfo();
    modal.classList.add('active');
    updatePreviewSaveButton();
    setupSidebarDragging();
};

function setupSidebarDragging() {
    const sidebar = document.querySelector('.preview-sidebar-overlay');
    const title = sidebar.querySelector('.preview-sidebar-title');
    if (!sidebar || !title || sidebar.dataset.draggableInitialized) return;

    let isDraggingSidebar = false;
    let startSidebarX, startSidebarY;
    let startSidebarLeft, startSidebarTop;

    title.style.cursor = 'move';
    title.addEventListener('mousedown', (e) => {
        isDraggingSidebar = true;
        startSidebarX = e.clientX;
        startSidebarY = e.clientY;

        const rect = sidebar.getBoundingClientRect();
        const parentRect = sidebar.parentElement.getBoundingClientRect();

        startSidebarLeft = rect.left - parentRect.left;
        startSidebarTop = rect.top - parentRect.top;

        e.preventDefault();
        e.stopPropagation();
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDraggingSidebar) return;

        const deltaX = e.clientX - startSidebarX;
        const deltaY = e.clientY - startSidebarY;

        const parentRect = sidebar.parentElement.getBoundingClientRect();
        const sidebarRect = sidebar.getBoundingClientRect();

        let newLeft = startSidebarLeft + deltaX;
        let newTop = startSidebarTop + deltaY;

        // Constrain within parent
        newLeft = Math.max(10, Math.min(newLeft, parentRect.width - sidebarRect.width - 10));
        newTop = Math.max(10, Math.min(newTop, parentRect.height - sidebarRect.height - 10));

        sidebar.style.left = `${newLeft}px`;
        sidebar.style.top = `${newTop}px`;
        sidebar.style.right = 'auto'; // Disable the default right positioning if any
    });

    document.addEventListener('mouseup', () => {
        isDraggingSidebar = false;
    });

    sidebar.dataset.draggableInitialized = "true";
}

function selectPreviewCamera(index) {
    previewState.selectedCamera = index;

    document.querySelectorAll('.preview-camera-item').forEach((item) => {
        if (parseInt(item.dataset.index) === index) {
            item.classList.add('selected');
        } else {
            item.classList.remove('selected');
        }
    });

    document.querySelectorAll('.preview-camera').forEach((cam) => {
        if (parseInt(cam.dataset.index) === index) {
            cam.style.zIndex = '100';
            cam.style.boxShadow = '0 0 0 3px var(--primary-color), 0 0 20px rgba(102, 126, 234, 0.5)';
        } else {
            cam.style.zIndex = cam.classList.contains('show-on-top') ? '5' : '1';
            cam.style.boxShadow = 'none';
        }
    });
}

function setupDragAndResize(cameraDiv, canvas) {
    const resizeHandle = cameraDiv.querySelector('.preview-resize-handle');

    cameraDiv.addEventListener('mousedown', (e) => {
        if (e.target === resizeHandle || e.target.closest('.preview-resize-handle')) return;
        e.preventDefault();
        e.stopPropagation();

        const index = parseInt(cameraDiv.dataset.index);
        selectPreviewCamera(index);

        previewState.dragging = cameraDiv;
        const rect = cameraDiv.getBoundingClientRect();
        const canvasRect = canvas.getBoundingClientRect();

        previewState.startX = e.clientX;
        previewState.startY = e.clientY;
        previewState.startLeft = rect.left - canvasRect.left;
        previewState.startTop = rect.top - canvasRect.top;

        cameraDiv.style.cursor = 'grabbing';
    });

    if (resizeHandle) {
        resizeHandle.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();

            const index = parseInt(cameraDiv.dataset.index);
            selectPreviewCamera(index);

            previewState.resizing = cameraDiv;
            const rect = cameraDiv.getBoundingClientRect();

            previewState.startX = e.clientX;
            previewState.startY = e.clientY;
            previewState.startWidth = rect.width;
            previewState.startHeight = rect.height;
        });
    }
}

// Global mouse move handler with snapping
document.addEventListener('mousemove', (e) => {
    const canvas = document.getElementById('previewCanvas');
    if (!canvas) return;

    const canvasRect = canvas.getBoundingClientRect();
    const snapThreshold = 10;

    if (previewState.dragging) {
        const deltaX = e.clientX - previewState.startX;
        const deltaY = e.clientY - previewState.startY;

        let newLeft = previewState.startLeft + deltaX;
        let newTop = previewState.startTop + deltaY;

        const draggedWidth = previewState.dragging.offsetWidth;
        const draggedHeight = previewState.dragging.offsetHeight;

        let snapX = null, snapY = null;
        const snapGuides = [];
        const otherCameras = Array.from(canvas.querySelectorAll('.preview-camera')).filter(cam => cam !== previewState.dragging);

        // Snap to edges
        if (Math.abs(newLeft) < snapThreshold) { snapX = 0; snapGuides.push({ type: 'vertical', position: 0 }); }
        if (Math.abs(newTop) < snapThreshold) { snapY = 0; snapGuides.push({ type: 'horizontal', position: 0 }); }
        if (Math.abs((newLeft + draggedWidth) - canvasRect.width) < snapThreshold) { snapX = canvasRect.width - draggedWidth; snapGuides.push({ type: 'vertical', position: canvasRect.width }); }
        if (Math.abs((newTop + draggedHeight) - canvasRect.height) < snapThreshold) { snapY = canvasRect.height - draggedHeight; snapGuides.push({ type: 'horizontal', position: canvasRect.height }); }

        otherCameras.forEach(cam => {
            const rect = cam.getBoundingClientRect();
            const camLeft = rect.left - canvasRect.left, camTop = rect.top - canvasRect.top;
            const camRight = camLeft + rect.width, camBottom = camTop + rect.height;

            if (Math.abs(newLeft - camLeft) < snapThreshold) { snapX = camLeft; snapGuides.push({ type: 'vertical', position: camLeft }); }
            if (Math.abs(newLeft - camRight) < snapThreshold) { snapX = camRight; snapGuides.push({ type: 'vertical', position: camRight }); }
            if (Math.abs((newLeft + draggedWidth) - camLeft) < snapThreshold) { snapX = camLeft - draggedWidth; snapGuides.push({ type: 'vertical', position: camLeft }); }
            if (Math.abs((newLeft + draggedWidth) - camRight) < snapThreshold) { snapX = camRight - draggedWidth; snapGuides.push({ type: 'vertical', position: camRight }); }
            if (Math.abs(newTop - camTop) < snapThreshold) { snapY = camTop; snapGuides.push({ type: 'horizontal', position: camTop }); }
            if (Math.abs(newTop - camBottom) < snapThreshold) { snapY = camBottom; snapGuides.push({ type: 'horizontal', position: camBottom }); }
            if (Math.abs((newTop + draggedHeight) - camTop) < snapThreshold) { snapY = camTop - draggedHeight; snapGuides.push({ type: 'horizontal', position: camTop }); }
            if (Math.abs((newTop + draggedHeight) - camBottom) < snapThreshold) { snapY = camBottom - draggedHeight; snapGuides.push({ type: 'horizontal', position: camBottom }); }
        });

        if (snapX !== null) newLeft = snapX;
        if (snapY !== null) newTop = snapY;

        const constrainedLeft = Math.max(0, Math.min(newLeft, canvasRect.width - draggedWidth));
        const constrainedTop = Math.max(0, Math.min(newTop, canvasRect.height - draggedHeight));

        previewState.dragging.style.left = `${(constrainedLeft / canvasRect.width) * 100}%`;
        previewState.dragging.style.top = `${(constrainedTop / canvasRect.height) * 100}%`;

        showSnapGuides(snapGuides, canvasRect);
        updateCameraCoords(previewState.dragging, canvasRect);
        previewState.hasChanges = true;
    }

    if (previewState.resizing) {
        const deltaX = e.clientX - previewState.startX;
        const deltaY = e.clientY - previewState.startY;
        const newWidth = Math.max(50, previewState.startWidth + deltaX);
        const newHeight = Math.max(50, previewState.startHeight + deltaY);
        const rect = previewState.resizing.getBoundingClientRect();
        const constrainedWidth = Math.min(newWidth, canvasRect.right - rect.left);
        const constrainedHeight = Math.min(newHeight, canvasRect.bottom - rect.top);

        previewState.resizing.style.width = `${(constrainedWidth / canvasRect.width) * 100}%`;
        previewState.resizing.style.height = `${(constrainedHeight / canvasRect.height) * 100}%`;

        updateCameraCoords(previewState.resizing, canvasRect);
        previewState.hasChanges = true;
    }
});

function showSnapGuides(guides, canvasRect) {
    document.querySelectorAll('.snap-guide').forEach(g => g.remove());
    if (guides.length === 0) return;
    const canvas = document.getElementById('previewCanvas');
    guides.forEach(guide => {
        const line = document.createElement('div');
        line.className = 'snap-guide';
        if (guide.type === 'vertical') {
            line.style.left = `${(guide.position / canvasRect.width) * 100}%`;
            line.style.top = '0'; line.style.width = '2px'; line.style.height = '100%';
        } else {
            line.style.left = '0'; line.style.top = `${(guide.position / canvasRect.height) * 100}%`;
            line.style.width = '100%'; line.style.height = '2px';
        }
        canvas.appendChild(line);
    });
}

document.addEventListener('mouseup', () => {
    if (previewState.dragging) {
        previewState.dragging.style.cursor = 'grab';
        previewState.dragging = null;
        document.querySelectorAll('.snap-guide').forEach(g => g.remove());
        updatePreviewSaveButton();
    }
    if (previewState.resizing) {
        previewState.resizing = null;
        updatePreviewSaveButton();
    }
});

// Arrow Key Fine-tuning
document.addEventListener('keydown', (e) => {
    if (previewState.selectedCamera === null || previewState.dragging || previewState.resizing) return;
    const canvas = document.getElementById('previewCanvas');
    if (!canvas || !document.getElementById('previewModal').classList.contains('active')) return;

    const camDiv = document.querySelector(`.preview-camera[data-index="${previewState.selectedCamera}"]`);
    if (!camDiv) return;

    let [x1, y1, x2, y2] = JSON.parse(camDiv.dataset.coords || '[0,0,0,0]');
    const width = x2 - x1;
    const height = y2 - y1;

    // Movement step: 1px normally, 10px with Shift
    const step = e.shiftKey ? 10 : 1;
    let moved = false;

    if (e.key === 'ArrowLeft') {
        // Move left, clamp to 0
        const newX1 = Math.max(0, x1 - step);
        const diff = x1 - newX1; // Actual distance moved
        x1 = newX1;
        x2 -= diff;
        moved = true;
    }
    else if (e.key === 'ArrowRight') {
        // Move right, clamp to screenWidth
        const newX2 = Math.min(previewState.screenWidth, x2 + step);
        const diff = newX2 - x2;
        x2 = newX2;
        x1 += diff;
        moved = true;
    }
    else if (e.key === 'ArrowUp') {
        // Move up, clamp to 0
        const newY1 = Math.max(0, y1 - step);
        const diff = y1 - newY1;
        y1 = newY1;
        y2 -= diff;
        moved = true;
    }
    else if (e.key === 'ArrowDown') {
        // Move down, clamp to screenHeight
        const newY2 = Math.min(previewState.screenHeight, y2 + step);
        const diff = newY2 - y2;
        y2 = newY2;
        y1 += diff;
        moved = true;
    }

    if (moved) {
        e.preventDefault();

        // Update DOM Style (Percentages)
        camDiv.style.left = `${(x1 / previewState.screenWidth) * 100}%`;
        camDiv.style.top = `${(y1 / previewState.screenHeight) * 100}%`;

        // Update Dataset (Source of Truth)
        camDiv.dataset.coords = JSON.stringify([x1, y1, x2, y2]);

        // Update Visuals manually to match exactly
        const coordsElements = camDiv.querySelectorAll('.preview-camera-coords');
        if (coordsElements.length >= 2) {
            coordsElements[0].textContent = `${width}x${height}px`;
            coordsElements[1].textContent = `[${x1}, ${y1}, ${x2}, ${y2}]`;
        }

        const listItem = document.querySelector(`.preview-camera-item[data-index="${previewState.selectedCamera}"]`);
        if (listItem) {
            const info = listItem.querySelector('.preview-camera-item-info');
            if (info) info.textContent = `${width}x${height}px • [${x1}, ${y1}, ${x2}, ${y2}]`;
        }

        previewState.hasChanges = true;
        updatePreviewSaveButton();
    }
});

function updateCameraCoords(cameraDiv, canvasRect) {
    const rect = cameraDiv.getBoundingClientRect();
    const scaleX = previewState.screenWidth / canvasRect.width;
    const scaleY = previewState.screenHeight / canvasRect.height;

    const x1 = Math.round((rect.left - canvasRect.left) * scaleX);
    const y1 = Math.round((rect.top - canvasRect.top) * scaleY);
    const x2 = Math.round(x1 + (rect.width * scaleX));
    const y2 = Math.round(y1 + (rect.height * scaleY));
    const width = x2 - x1, height = y2 - y1;

    const coordsElements = cameraDiv.querySelectorAll('.preview-camera-coords');
    if (coordsElements.length >= 2) {
        coordsElements[0].textContent = `${width}x${height}px`;
        coordsElements[1].textContent = `[${x1}, ${y1}, ${x2}, ${y2}]`;
    }

    const index = parseInt(cameraDiv.dataset.index);
    const listItem = document.querySelector(`.preview-camera-item[data-index="${index}"]`);
    if (listItem) {
        const info = listItem.querySelector('.preview-camera-item-info');
        if (info) info.textContent = `${width}x${height}px • [${x1}, ${y1}, ${x2}, ${y2}]`;
    }

    cameraDiv.dataset.coords = JSON.stringify([x1, y1, x2, y2]);
    updatePreviewInfo();
}

function updatePreviewInfo() {
    const screen = state.config.essentials.screens[state.currentScreenIndex];
    const changedText = previewState.hasChanges ? ' • Modified (click Apply to save)' : '';
    const resEl = document.getElementById('previewResolution');
    if (resEl) {
        resEl.textContent = `Resolution: ${previewState.screenWidth}x${previewState.screenHeight} • ${screen.streams.length} camera${screen.streams.length !== 1 ? 's' : ''}${changedText}`;
    }
}

function updatePreviewSaveButton() {
    const header = document.querySelector('#previewModal .modal-header');
    let applyBtn = document.getElementById('previewApplyBtn');
    if (previewState.hasChanges && !applyBtn) {
        applyBtn = document.createElement('button');
        applyBtn.id = 'previewApplyBtn';
        applyBtn.className = 'btn btn-primary';
        applyBtn.textContent = 'Apply Changes';
        applyBtn.addEventListener('click', applyPreviewChanges);
        header.insertBefore(applyBtn, document.getElementById('previewModalOk'));
    } else if (!previewState.hasChanges && applyBtn) {
        applyBtn.remove();
    }
}

window.applyPreviewChanges = function () {
    const screen = state.config.essentials.screens[state.currentScreenIndex];
    const canvas = document.getElementById('previewCanvas');
    canvas.querySelectorAll('.preview-camera').forEach(cameraDiv => {
        const index = parseInt(cameraDiv.dataset.index);
        const coords = JSON.parse(cameraDiv.dataset.coords || '[]');
        if (coords.length === 4) screen.streams[index].force_coordinates = coords;
    });

    state.resolution = { width: previewState.screenWidth, height: previewState.screenHeight };
    screen.streams.forEach(stream => { delete stream._previewCoords; });
    previewState.hasChanges = false;
    updatePreviewInfo();
    updatePreviewSaveButton();
    renderCamerasList();
    showToast('Changes Applied', 'Layout positions and resolution updated. Save Config to persist.', 'success');
};

window.closePreviewModalDraggable = function () {
    if (state.currentScreenIndex !== null) {
        state.config.essentials.screens[state.currentScreenIndex].streams.forEach(s => delete s._previewCoords);
    }
    document.querySelectorAll('.snap-guide').forEach(g => g.remove());
    document.getElementById('previewModal').classList.remove('active');
    previewState.hasChanges = false;
    previewState.selectedCamera = null;
    const applyBtn = document.getElementById('previewApplyBtn');
    if (applyBtn) applyBtn.remove();
};

// Event Listeners for Resolution and Grid
function initPreviewControls() {
    const resPreset = document.getElementById('resPreset');
    const resWidth = document.getElementById('resWidth');
    const resHeight = document.getElementById('resHeight');
    const customInputs = document.getElementById('customResInputs');
    const toggleGrid = document.getElementById('toggleGrid');
    const grid = document.getElementById('previewGrid');

    if (!resPreset || !resWidth || !resHeight || !customInputs || !toggleGrid || !grid) return;

    // Prevent multiple attachments
    if (resPreset.dataset.initialized) return;
    resPreset.dataset.initialized = "true";

    resPreset.addEventListener('change', () => {
        if (resPreset.value === 'custom') {
            customInputs.style.display = 'flex';
        } else {
            customInputs.style.display = 'none';
            const [w, h] = resPreset.value.split('x').map(n => parseInt(n));
            previewState.screenWidth = w;
            previewState.screenHeight = h;
            showScreenPreviewDraggable(); // Re-render to update coordinates scaling
            previewState.hasChanges = true;
            updatePreviewSaveButton();
        }
    });

    const handleCustomRes = () => {
        previewState.screenWidth = parseInt(resWidth.value) || 1920;
        previewState.screenHeight = parseInt(resHeight.value) || 1080;
        showScreenPreviewDraggable();
        previewState.hasChanges = true;
        updatePreviewSaveButton();
    };

    resWidth.addEventListener('change', handleCustomRes);
    resHeight.addEventListener('change', handleCustomRes);

    toggleGrid.addEventListener('change', () => {
        if (toggleGrid.checked) grid.classList.add('active');
        else grid.classList.remove('active');
    });
}

// Re-initialize controls when modal is shown 
// This ensures they are ready even if modal was injected or DOM changed
const originalShowPreview = window.showScreenPreviewDraggable;
window.showScreenPreviewDraggable = function () {
    originalShowPreview.apply(this, arguments);
    initPreviewControls();
};

document.addEventListener('DOMContentLoaded', initPreviewControls);
