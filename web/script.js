// ===== Application State =====
const state = {
    config: {
        essentials: {
            disable_autorotation: false,
            screens: []
        }
    },
    resolution: { width: 1920, height: 1080 },
    currentScreenIndex: null,
    currentCameraIndex: null,
    currentFilePath: '/etc/opensurv/monitor1.yml', // Default for display
    editMode: 'add', // 'add' or 'edit'
    screenshots: {} // url -> filename mapping
};

// ===== YAML Parser (Simple Implementation) =====
const YAMLParser = {
    parse(yamlText) {
        try {
            // This is a simplified YAML parser for the monitor1.yml structure
            const config = {
                essentials: {
                    disable_autorotation: false,
                    screens: []
                }
            };

            const lines = yamlText.split('\n');
            let currentScreen = null;
            let currentStream = null;
            let inEssentials = false;
            let inScreens = false;
            let lastComment = null; // Track the last comment for camera names

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                const trimmed = line.trim();

                // Skip empty lines
                if (trimmed === '') continue;

                // SPECIAL HANDLING FOR DISABLED (COMMENTED) STREAMS
                if (trimmed.startsWith('#')) {
                    const content = trimmed.substring(1).trim();
                    let handledAsDisabled = false;

                    // Case 1: Commented out URL (Start of disabled stream)
                    if (currentScreen && content.startsWith('- url:')) {
                        const urlMatch = content.match(/- url:\s*"([^"]+)"/);
                        if (urlMatch) {
                            currentStream = {
                                name: lastComment || null, // Use pending comment as name
                                url: urlMatch[1],
                                imageurl: null,
                                showontop: null,
                                enableaudio: null,
                                probe_timeout: null,
                                timeout_waiting_for_init_stream: null,
                                freeform_advanced_mpv_options: null,
                                force_coordinates: null,
                                disabled: true
                            };
                            currentScreen.streams.push(currentStream);
                            lastComment = null;
                            handledAsDisabled = true;
                        }
                    }
                    // Case 2: Property of disabled stream
                    else if (currentStream && currentStream.disabled) {
                        if (content.startsWith('imageurl:')) {
                            const value = content.split(':')[1].trim();
                            currentStream.imageurl = value === 'true' || value === 'True';
                            handledAsDisabled = true;
                        } else if (content.startsWith('showontop:')) {
                            const value = content.split(':')[1].trim();
                            currentStream.showontop = value === 'True' || value === 'true';
                            handledAsDisabled = true;
                        } else if (content.startsWith('enableaudio:')) {
                            const value = content.split(':')[1].trim();
                            currentStream.enableaudio = value === 'True' || value === 'true';
                            handledAsDisabled = true;
                        } else if (content.startsWith('probe_timeout:')) {
                            currentStream.probe_timeout = parseInt(content.split(':')[1].trim());
                            handledAsDisabled = true;
                        } else if (content.startsWith('timeout_waiting_for_init_stream:')) {
                            currentStream.timeout_waiting_for_init_stream = parseInt(content.split(':')[1].trim());
                            handledAsDisabled = true;
                        } else if (content.startsWith('freeform_advanced_mpv_options:')) {
                            const value = content.match(/"([^"]+)"/);
                            if (value) currentStream.freeform_advanced_mpv_options = value[1];
                            handledAsDisabled = true;
                        } else if (content.startsWith('force_coordinates:')) {
                            const coordsMatch = content.match(/\[([\d,\s]+)\]/);
                            if (coordsMatch) {
                                currentStream.force_coordinates = coordsMatch[1].split(',').map(n => parseInt(n.trim()));
                            }
                            handledAsDisabled = true;
                        }
                    }

                    if (handledAsDisabled) continue;
                }

                // Capture comments that might be camera names or resolution info
                if (trimmed.startsWith('#') && !trimmed.includes('###')) {
                    const commentText = trimmed.substring(1).trim();

                    // Look for resolution info: # Resolution: 1920x1080
                    const resMatch = commentText.match(/Resolution:\s*(\d+)x(\d+)/i);
                    if (resMatch) {
                        state.resolution = {
                            width: parseInt(resMatch[1]),
                            height: parseInt(resMatch[2])
                        };
                    } else if (currentScreen) {
                        // Extract the comment text (remove the # and trim) for camera names
                        lastComment = commentText;
                    }
                    continue;
                }

                // Skip documentation comments
                if (trimmed.startsWith('#')) continue;

                // Check for essentials section
                if (trimmed === 'essentials:') {
                    inEssentials = true;
                    continue;
                }

                // Check for disable_autorotation
                if (inEssentials && trimmed.startsWith('disable_autorotation:')) {
                    const value = trimmed.split(':')[1].trim();
                    config.essentials.disable_autorotation = value === 'True' || value === 'true';
                    continue;
                }

                // Check for screens section
                if (trimmed === 'screens:') {
                    inScreens = true;
                    continue;
                }

                // New screen
                if (inScreens && trimmed === '- streams:') {
                    currentScreen = {
                        streams: [],
                        duration: null,
                        nr_of_columns: null,
                        rotate90: null,
                        disable_probing_for_all_streams: null
                    };
                    config.essentials.screens.push(currentScreen);
                    lastComment = null; // Reset comment for new screen
                    continue;
                }

                // New stream (Active)
                if (currentScreen && trimmed.startsWith('- url:')) {
                    const urlMatch = trimmed.match(/- url:\s*"([^"]+)"/);
                    if (urlMatch) {
                        currentStream = {
                            name: lastComment || null, // Use the last comment as the camera name
                            url: urlMatch[1],
                            imageurl: null,
                            showontop: null,
                            enableaudio: null,
                            probe_timeout: null,
                            timeout_waiting_for_init_stream: null,
                            freeform_advanced_mpv_options: null,
                            force_coordinates: null,
                            disabled: false
                        };
                        currentScreen.streams.push(currentStream);
                        lastComment = null; // Reset after using
                    }
                    continue;
                }

                // Stream properties
                if (currentStream) {
                    if (trimmed.startsWith('disabled:')) {
                        const value = trimmed.split(':')[1].trim();
                        currentStream.disabled = value === 'True' || value === 'true';
                    } else if (trimmed.startsWith('imageurl:')) {
                        const value = trimmed.split(':')[1].trim();
                        currentStream.imageurl = value === 'true' || value === 'True';
                    } else if (trimmed.startsWith('showontop:')) {
                        const value = trimmed.split(':')[1].trim();
                        currentStream.showontop = value === 'True' || value === 'true';
                    } else if (trimmed.startsWith('enableaudio:')) {
                        const value = trimmed.split(':')[1].trim();
                        currentStream.enableaudio = value === 'True' || value === 'true';
                    } else if (trimmed.startsWith('probe_timeout:')) {
                        currentStream.probe_timeout = parseInt(trimmed.split(':')[1].trim());
                    } else if (trimmed.startsWith('timeout_waiting_for_init_stream:')) {
                        currentStream.timeout_waiting_for_init_stream = parseInt(trimmed.split(':')[1].trim());
                    } else if (trimmed.startsWith('freeform_advanced_mpv_options:')) {
                        const value = trimmed.match(/"([^"]+)"/);
                        if (value) currentStream.freeform_advanced_mpv_options = value[1];
                    } else if (trimmed.startsWith('force_coordinates:')) {
                        const coordsMatch = trimmed.match(/\[([\d,\s]+)\]/);
                        if (coordsMatch) {
                            currentStream.force_coordinates = coordsMatch[1].split(',').map(n => parseInt(n.trim()));
                        }
                    }
                }

                // Screen properties
                if (currentScreen && !trimmed.startsWith('- url:')) {
                    if (trimmed.startsWith('duration:')) {
                        currentScreen.duration = parseInt(trimmed.split(':')[1].trim());
                    } else if (trimmed.startsWith('nr_of_columns:')) {
                        currentScreen.nr_of_columns = parseInt(trimmed.split(':')[1].trim());
                    } else if (trimmed.startsWith('rotate90:')) {
                        const value = trimmed.split(':')[1].trim();
                        currentScreen.rotate90 = value === 'True' || value === 'true';
                    } else if (trimmed.startsWith('disable_probing_for_all_streams:')) {
                        const value = trimmed.split(':')[1].trim();
                        currentScreen.disable_probing_for_all_streams = value === 'True' || value === 'true';
                    }
                }
            }

            return config;
        } catch (error) {
            console.error('Error parsing YAML:', error);
            throw new Error('Failed to parse YAML file');
        }
    },

    stringify(config) {
        let yaml = '#THIS IS A YAML FILE, INDENTATION IS IMPORTANT. ALSO DO NOT USE TABS FOR INDENTATION, BUT USE SPACES\n';
        yaml += `# Resolution: ${state.resolution.width}x${state.resolution.height}\n\n`;
        yaml += 'essentials:\n';
        yaml += `  disable_autorotation: ${config.essentials.disable_autorotation ? 'True' : 'False'}\n\n`;
        yaml += '  screens:\n';

        config.essentials.screens.forEach((screen, screenIndex) => {
            yaml += '    - streams:\n';

            screen.streams.forEach((stream, streamIndex) => {
                // Add camera name as comment if it exists
                if (stream.name) {
                    yaml += `#${stream.name}\n`;
                }

                // Build the stream block
                let sb = '';
                sb += `        - url: "${stream.url}"\n`;

                if (stream.imageurl !== null && stream.imageurl !== undefined) {
                    sb += `          imageurl: ${stream.imageurl ? 'true' : 'false'}\n`;
                }

                if (stream.force_coordinates && stream.force_coordinates.length === 4) {
                    sb += `          force_coordinates: [${stream.force_coordinates.join(', ')}]\n`;
                }

                if (stream.showontop !== null && stream.showontop !== undefined) {
                    sb += `          showontop: ${stream.showontop ? 'True' : 'False'}\n`;
                }

                if (stream.enableaudio !== null && stream.enableaudio !== undefined) {
                    sb += `          enableaudio: ${stream.enableaudio ? 'True' : 'False'}\n`;
                }

                if (stream.probe_timeout) {
                    sb += `          probe_timeout: ${stream.probe_timeout}\n`;
                }

                if (stream.timeout_waiting_for_init_stream) {
                    sb += `          timeout_waiting_for_init_stream: ${stream.timeout_waiting_for_init_stream}\n`;
                }

                if (stream.freeform_advanced_mpv_options) {
                    sb += `          freeform_advanced_mpv_options: "${stream.freeform_advanced_mpv_options}"\n`;
                }

                // If disabled, comment out every line in the block
                if (stream.disabled) {
                    sb = sb.split('\n').map(line => {
                        if (line.trim().length === 0) return line;
                        return '#' + line;
                    }).join('\n');
                }

                yaml += sb;
            });

            // Screen-level properties
            if (screen.duration) {
                yaml += `      duration: ${screen.duration}\n`;
            }
            if (screen.nr_of_columns) {
                yaml += `      nr_of_columns: ${screen.nr_of_columns}\n`;
            }
            if (screen.rotate90 !== null && screen.rotate90 !== undefined) {
                yaml += `      rotate90: ${screen.rotate90 ? 'True' : 'False'}\n`;
            }
            if (screen.disable_probing_for_all_streams !== null && screen.disable_probing_for_all_streams !== undefined) {
                yaml += `      disable_probing_for_all_streams: ${screen.disable_probing_for_all_streams ? 'True' : 'False'}\n`;
            }

            yaml += '\n';
        });

        return yaml;
    }
};

// ===== Toast Notifications =====
function showToast(title, message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icons = {
        success: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>',
        error: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
        warning: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
        info: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#667eea" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
    };

    toast.innerHTML = `
        <div class="toast-icon">${icons[type]}</div>
        <div class="toast-content">
            <div class="toast-title">${title}</div>
            <div class="toast-message">${message}</div>
        </div>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'slideInRight 0.3s reverse';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ===== Clipboard Utility =====
// ===== Clipboard Utility =====
async function copyToClipboard(text, btnElement) {
    // Helper to show success feedback
    const showSuccess = () => {
        const originalText = btnElement.innerHTML;
        const originalClass = btnElement.className;

        btnElement.classList.add('copied');
        btnElement.innerHTML = `
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="margin-right:4px;">
                <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            Copied
        `;

        setTimeout(() => {
            btnElement.className = originalClass;
            btnElement.innerHTML = originalText;
        }, 2000);
    };

    try {
        // Try modern API first
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(text);
            showSuccess();
            return;
        }

        // Fallback for non-secure contexts (useful for local IP access)
        const textArea = document.createElement("textarea");
        textArea.value = text;

        // Ensure it's not visible but part of DOM
        textArea.style.position = "fixed";
        textArea.style.left = "-9999px";
        textArea.style.top = "0";
        document.body.appendChild(textArea);

        textArea.focus();
        textArea.select();

        const successful = document.execCommand('copy');
        document.body.removeChild(textArea);

        if (successful) {
            showSuccess();
        } else {
            throw new Error('execCommand fallback failed');
        }

    } catch (err) {
        console.error('Failed to copy text: ', err);
        showToast('Error', 'Failed to copy to clipboard: ' + err.message, 'error');
    }
}

// ===== UI Rendering =====
function renderScreensList() {
    const screensList = document.getElementById('screensList');
    screensList.innerHTML = '';

    state.config.essentials.screens.forEach((screen, index) => {
        const screenTab = document.createElement('div');
        screenTab.className = `screen-tab ${state.currentScreenIndex === index ? 'active' : ''}`;
        screenTab.textContent = `Screen ${index + 1}`;
        screenTab.title = `${screen.streams.length} camera(s)`;

        screenTab.addEventListener('click', () => selectScreen(index));
        screensList.appendChild(screenTab);
    });
}

function renderCamerasList() {
    const camerasList = document.getElementById('camerasList');
    camerasList.innerHTML = '';

    if (state.currentScreenIndex === null) return;

    const screen = state.config.essentials.screens[state.currentScreenIndex];

    if (screen.streams.length === 0) {
        camerasList.innerHTML = `
            <div style="text-align: center; padding: 3rem; color: var(--text-muted);">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin: 0 auto 1rem;">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                    <circle cx="12" cy="13" r="4"/>
                </svg>
                <p>No cameras added yet. Click "Add Camera" to get started.</p>
            </div>
        `;
        return;
    }

    screen.streams.forEach((stream, index) => {
        try {
            const card = document.createElement('div');
            card.className = `camera-card ${stream.disabled ? 'disabled' : ''}`;

            const badges = [];
            if (stream.imageurl) badges.push('<span class="camera-badge active">Image URL</span>');
            if (stream.showontop) badges.push('<span class="camera-badge active">Show on Top</span>');
            if (stream.enableaudio) badges.push('<span class="camera-badge active">Audio</span>');

            if (stream.force_coordinates) {
                let coordsText = '(Invalid Coords)';
                if (Array.isArray(stream.force_coordinates)) {
                    coordsText = `[${stream.force_coordinates.join(', ')}]`;
                } else {
                    console.warn(`Camera ${index} has invalid force_coordinates format:`, stream.force_coordinates);
                }
                badges.push(`<span class="camera-badge">Custom Position ${coordsText}</span>`);
            }

            if (stream.probe_timeout) badges.push(`<span class="camera-badge">Timeout: ${stream.probe_timeout}s</span>`);
            if (stream.disabled) badges.push('<span class="camera-badge danger">Disabled</span>');

            // Use camera name if available, otherwise show URL
            const displayName = stream.name || 'Camera ' + (index + 1);
            const urlToDisplay = stream.name ? stream.url : (stream.url || 'No URL');
            const screenshot = state.screenshots && state.screenshots[stream.url] ? state.screenshots[stream.url] : null;

            card.innerHTML = `
                ${screenshot ? `<img src="/screenshots/${screenshot}" class="camera-preview" alt="${displayName}">` : ''}
                <div class="camera-header">
                    <div class="camera-name" style="margin: 0; font-size: 1.1rem;">${displayName}</div>
                    <div class="camera-actions">
                        <button class="camera-action-btn play" data-index="${index}" title="Play in VLC">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polygon points="5 3 19 12 5 21 5 3"/>
                            </svg>
                        </button>
                        <button class="camera-action-btn edit" data-index="${index}" title="Edit">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                            </svg>
                        </button>
                        <button class="camera-action-btn delete" data-index="${index}" title="Delete">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="3 6 5 6 21 6"/>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2-2v2"/>
                            </svg>
                        </button>
                    </div>
                </div>
                <div class="url-badge-container">
                    <div class="url-badge">
                        <span class="url-text" title="${urlToDisplay}">${urlToDisplay}</span>
                        <button class="copy-url-btn" onclick="copyToClipboard('${urlToDisplay}', this)">
                            <span>Copy</span>
                        </button>
                    </div>
                </div>
                <div class="camera-details">
                    ${badges.join('')}
                </div>
            `;

            camerasList.appendChild(card);
        } catch (err) {
            console.error('Error rendering camera card:', err);
            const errorCard = document.createElement('div');
            errorCard.className = 'camera-card';
            errorCard.style.border = '1px solid var(--danger-color)';
            errorCard.innerHTML = `<div style="padding: 1rem; color: var(--danger-color);">Error rendering camera ${index + 1}</div>`;
            camerasList.appendChild(errorCard);
        }
    });

    // Add event listeners for play, edit and delete buttons
    document.querySelectorAll('.camera-action-btn.play').forEach(btn => {
        btn.addEventListener('click', () => playInVLC(parseInt(btn.dataset.index)));
    });

    document.querySelectorAll('.camera-action-btn.edit').forEach(btn => {
        btn.addEventListener('click', () => editCamera(parseInt(btn.dataset.index)));
    });

    document.querySelectorAll('.camera-action-btn.delete').forEach(btn => {
        btn.addEventListener('click', () => deleteCamera(parseInt(btn.dataset.index)));
    });
}

function selectScreen(index) {
    state.currentScreenIndex = index;
    renderScreensList();
    renderScreenEditor();
    renderCamerasList();
    checkExistingScreenshots();
}

function renderScreenEditor() {
    const welcomeScreen = document.getElementById('welcomeScreen');
    const screenEditor = document.getElementById('screenEditor');

    if (state.currentScreenIndex === null) {
        welcomeScreen.style.display = 'flex';
        screenEditor.style.display = 'none';
        return;
    }

    welcomeScreen.style.display = 'none';
    screenEditor.style.display = 'block';

    const screen = state.config.essentials.screens[state.currentScreenIndex];

    // document.getElementById('screenTitle').textContent = `Screen ${state.currentScreenIndex + 1}`;
    document.getElementById('currentFilePath').textContent = state.currentFilePath;
    // document.getElementById('screenSubtitle').textContent = `Configure streams and settings for this screen`;

    // Populate screen settings
    document.getElementById('screenDuration').value = screen.duration || '';
    document.getElementById('screenColumns').value = screen.nr_of_columns || '';
    document.getElementById('screenRotate90').checked = screen.rotate90 || false;
    document.getElementById('screenDisableProbing').checked = screen.disable_probing_for_all_streams || false;
}

// ===== Screen Management =====
function addScreen() {
    const newScreen = {
        streams: [],
        duration: null,
        nr_of_columns: null,
        rotate90: null,
        disable_probing_for_all_streams: null
    };

    state.config.essentials.screens.push(newScreen);
    state.currentScreenIndex = state.config.essentials.screens.length - 1;

    renderScreensList();
    renderScreenEditor();
    renderCamerasList();

    showToast('Screen Added', 'New screen created successfully', 'success');
}

function deleteScreen() {
    if (state.currentScreenIndex === null) return;

    if (confirm('Are you sure you want to delete this screen and all its cameras?')) {
        state.config.essentials.screens.splice(state.currentScreenIndex, 1);

        if (state.config.essentials.screens.length === 0) {
            state.currentScreenIndex = null;
        } else if (state.currentScreenIndex >= state.config.essentials.screens.length) {
            state.currentScreenIndex = state.config.essentials.screens.length - 1;
        }

        renderScreensList();
        renderScreenEditor();
        renderCamerasList();

        showToast('Screen Deleted', 'Screen removed successfully', 'success');
    }
}

function updateScreenSettings() {
    if (state.currentScreenIndex === null) return;

    const screen = state.config.essentials.screens[state.currentScreenIndex];

    const duration = parseInt(document.getElementById('screenDuration').value);
    const columns = parseInt(document.getElementById('screenColumns').value);

    screen.duration = duration || null;
    screen.nr_of_columns = columns || null;
    screen.rotate90 = document.getElementById('screenRotate90').checked || null;
    screen.disable_probing_for_all_streams = document.getElementById('screenDisableProbing').checked || null;
}

// ===== Camera Management =====
function openCameraModal(mode = 'add', cameraIndex = null) {
    state.editMode = mode;
    state.currentCameraIndex = cameraIndex;

    const modal = document.getElementById('cameraModal');
    const modalTitle = document.getElementById('modalTitle');

    modalTitle.textContent = mode === 'add' ? 'Add Camera' : 'Edit Camera';

    // Reset form
    document.getElementById('cameraName').value = '';
    document.getElementById('cameraUrl').value = '';
    document.getElementById('cameraImageUrl').checked = false;
    document.getElementById('cameraShowOnTop').checked = false;
    document.getElementById('cameraEnableAudio').checked = false;
    document.getElementById('cameraProbeTimeout').value = '';
    document.getElementById('cameraInitTimeout').value = '';
    document.getElementById('cameraMpvOptions').value = '';
    document.getElementById('cameraForceCoords').checked = false;
    document.getElementById('coordX1').value = '';
    document.getElementById('coordY1').value = '';
    document.getElementById('coordX2').value = '';
    document.getElementById('coordY2').value = '';
    document.getElementById('coordsSection').style.display = 'none';
    document.getElementById('cameraEnabled').checked = true;

    // If editing, populate form
    if (mode === 'edit' && cameraIndex !== null) {
        const screen = state.config.essentials.screens[state.currentScreenIndex];
        const camera = screen.streams[cameraIndex];

        document.getElementById('cameraName').value = camera.name || '';
        document.getElementById('cameraUrl').value = camera.url || '';
        document.getElementById('cameraImageUrl').checked = camera.imageurl || false;
        document.getElementById('cameraShowOnTop').checked = camera.showontop || false;
        document.getElementById('cameraEnableAudio').checked = camera.enableaudio || false;
        document.getElementById('cameraProbeTimeout').value = camera.probe_timeout || '';
        document.getElementById('cameraInitTimeout').value = camera.timeout_waiting_for_init_stream || '';
        document.getElementById('cameraMpvOptions').value = camera.freeform_advanced_mpv_options || '';

        if (camera.force_coordinates && camera.force_coordinates.length === 4) {
            document.getElementById('cameraForceCoords').checked = true;
            document.getElementById('coordsSection').style.display = 'block';
            document.getElementById('coordX1').value = camera.force_coordinates[0];
            document.getElementById('coordY1').value = camera.force_coordinates[1];
            document.getElementById('coordX2').value = camera.force_coordinates[2];
            document.getElementById('coordY2').value = camera.force_coordinates[3];
        }

        document.getElementById('cameraEnabled').checked = camera.disabled === true ? false : true;
    }

    modal.classList.add('active');
}

function closeCameraModal() {
    document.getElementById('cameraModal').classList.remove('active');
}

function saveCamera() {
    const url = document.getElementById('cameraUrl').value.trim();

    if (!url) {
        showToast('Validation Error', 'Stream URL is required', 'error');
        return;
    }

    const cameraName = document.getElementById('cameraName').value.trim();

    const camera = {
        name: cameraName || null,
        url: url,
        imageurl: document.getElementById('cameraImageUrl').checked || null,
        showontop: document.getElementById('cameraShowOnTop').checked || null,
        enableaudio: document.getElementById('cameraEnableAudio').checked || null,
        probe_timeout: parseInt(document.getElementById('cameraProbeTimeout').value) || null,
        timeout_waiting_for_init_stream: parseInt(document.getElementById('cameraInitTimeout').value) || null,
        freeform_advanced_mpv_options: document.getElementById('cameraMpvOptions').value.trim() || null,
        force_coordinates: null,
        disabled: !document.getElementById('cameraEnabled').checked
    };

    if (document.getElementById('cameraForceCoords').checked) {
        const x1 = parseInt(document.getElementById('coordX1').value);
        const y1 = parseInt(document.getElementById('coordY1').value);
        const x2 = parseInt(document.getElementById('coordX2').value);
        const y2 = parseInt(document.getElementById('coordY2').value);

        if (!isNaN(x1) && !isNaN(y1) && !isNaN(x2) && !isNaN(y2)) {
            camera.force_coordinates = [x1, y1, x2, y2];
        }
    }

    const screen = state.config.essentials.screens[state.currentScreenIndex];

    if (state.editMode === 'add') {
        screen.streams.push(camera);
        showToast('Camera Added', 'Camera added successfully', 'success');
    } else {
        screen.streams[state.currentCameraIndex] = camera;
        showToast('Camera Updated', 'Camera updated successfully', 'success');
    }

    closeCameraModal();
    renderCamerasList();
    renderScreensList();
    checkExistingScreenshots();
}

function editCamera(index) {
    openCameraModal('edit', index);
}

async function playInVLC(index) {
    if (state.currentScreenIndex === null) return;

    const screen = state.config.essentials.screens[state.currentScreenIndex];
    const camera = screen.streams[index];

    try {
        const response = await fetch(`${API_BASE}/api/play-vlc`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ url: camera.url })
        });

        const data = await response.json();

        if (data.success) {
            showToast('Opening VLC', `Playing ${camera.name || 'camera stream'} in VLC`, 'success');
        } else {
            throw new Error(data.error || 'Failed to open VLC');
        }
    } catch (error) {
        console.error('Error opening VLC:', error);
        showToast('VLC Error', error.message || 'Failed to open stream in VLC. Make sure VLC is installed.', 'error');
    }
}

function deleteCamera(index) {
    if (confirm('Are you sure you want to delete this camera?')) {
        const screen = state.config.essentials.screens[state.currentScreenIndex];
        screen.streams.splice(index, 1);
        renderCamerasList();
        renderScreensList();
        showToast('Camera Deleted', 'Camera removed successfully', 'success');
    }
}


// ===== Settings Management =====
async function openSettingsModal() {
    const modal = document.getElementById('settingsModal');
    const autoStartToggle = document.getElementById('autoStartToggle');
    const portInput = document.getElementById('serverPort');

    try {
        // Fetch autostart status
        const autoResponse = await fetch(`${API_BASE}/api/autostart`);
        const autoData = await autoResponse.json();

        if (autoData.success) {
            autoStartToggle.checked = autoData.enabled;
            if (autoData.error && autoData.error.includes('Linux')) {
                autoStartToggle.disabled = true;
                autoStartToggle.parentElement.title = "Auto-start is only supported on Linux/systemd";
            }
        }

        // Fetch GUI settings (port)
        const settingsResponse = await fetch(`${API_BASE}/api/settings`);
        const settingsData = await settingsResponse.json();

        if (settingsData.success) {
            portInput.value = settingsData.settings.port;
            portInput.dataset.originalPort = settingsData.settings.port;
        }
    } catch (error) {
        console.error('Error fetching settings:', error);
    }

    modal.classList.add('active');

    // Check for updates
    if (typeof checkForUpdates === 'function') {
        checkForUpdates();
    }
}

function closeSettingsModal() {
    document.getElementById('settingsModal').classList.remove('active');
}

async function saveSettings() {
    const autoStartToggle = document.getElementById('autoStartToggle');
    const portInput = document.getElementById('serverPort');
    const newPort = parseInt(portInput.value);
    const originalPort = parseInt(portInput.dataset.originalPort);

    try {
        // 1. Save GUI settings (Port)
        const settingsResponse = await fetch(`${API_BASE}/api/settings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ port: newPort })
        });
        const settingsData = await settingsResponse.json();

        if (!settingsData.success) throw new Error(settingsData.error);

        // 2. Save Auto-start (if changed)
        // Note: It's better to just toggle it if the user clicked the toggle, 
        // but for simplicity here we just check current state
        await fetch(`${API_BASE}/api/autostart`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enable: autoStartToggle.checked })
        });

        showToast('Settings Saved', 'Your preferences have been updated.', 'success');

        if (newPort !== originalPort) {
            const nextUrl = `${window.location.protocol}//${window.location.hostname}:${newPort}`;
            if (confirm(`Port changed to ${newPort}. The server will need to be restarted to apply this change. Since this is an agentic environment, I can restart it for you, but you will need to manually change the URL in your browser to: ${nextUrl}\n\nWould you like me to attempt a server restart now?`)) {
                // We'll let the agent restart the server after this
                closeSettingsModal();
                return true; // Indicate port changed
            }
        }

        closeSettingsModal();
        return false;
    } catch (error) {
        console.error('Error saving settings:', error);
        showToast('Settings Error', error.message, 'error');
        return false;
    }
}

async function toggleAutoStart(enable) {
    // This is now handled by saveSettings, but keeping it for immediate feedback if desired
    // Or we can just let saveSettings handle everything.
}

// ===== Backups Management =====
async function openBackupsModal() {
    const modal = document.getElementById('backupsModal');
    const container = document.getElementById('backupsList');

    modal.classList.add('active');
    container.innerHTML = '<div class="loading-state">Loading backups...</div>';

    try {
        const response = await fetch(`${API_BASE}/api/backups`);
        const data = await response.json();

        if (data.success) {
            if (data.backups.length === 0) {
                container.innerHTML = '<div class="loading-state">No backups found yet.</div>';
                return;
            }

            container.innerHTML = '';
            data.backups.forEach(backup => {
                const date = new Date(backup.modified).toLocaleString();
                const size = (backup.size / 1024).toFixed(1) + ' KB';

                const item = document.createElement('div');
                item.className = 'backup-item';
                item.innerHTML = `
                    <div class="backup-info">
                        <div class="backup-name">${backup.filename}</div>
                        <div class="backup-meta">${date} • ${size}</div>
                    </div>
                    <div class="backup-actions">
                        <button class="btn btn-secondary btn-sm" onclick="downloadBackup('${backup.filename}')">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
                            </svg>
                            Download
                        </button>
                    </div>
                `;
                container.appendChild(item);
            });
        } else {
            throw new Error(data.error);
        }
    } catch (error) {
        console.error('Error loading backups:', error);
        container.innerHTML = `<div class="loading-state" style="color: var(--danger-color);">Error: ${error.message}</div>`;
    }
}

async function downloadBackup(filename) {
    try {
        const response = await fetch(`${API_BASE}/api/backups/${filename}`);
        const data = await response.json();

        if (data.success) {
            const blob = new Blob([data.content], { type: 'text/yaml' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            showToast('Download Started', filename, 'success');
        } else {
            throw new Error(data.error);
        }
    } catch (error) {
        console.error('Error downloading backup:', error);
        showToast('Download Error', error.message, 'error');
    }
}

function closeBackupsModal() {
    document.getElementById('backupsModal').classList.remove('active');
}
window.downloadBackup = downloadBackup; // Expose to onclick


// ===== File Browser Management =====
let currentBrowserPath = '/etc/opensurv';
let selectedExternalPath = null;

async function openFileBrowser(path = currentBrowserPath) {
    const modal = document.getElementById('fileBrowserModal');
    const listContainer = document.getElementById('fileBrowserList');
    const breadcrumbs = document.getElementById('fileBrowserBreadcrumbs');
    const importBtn = document.getElementById('fileBrowserModalImport');
    const selectedText = document.getElementById('selectedFilePath');

    modal.classList.add('active');
    listContainer.innerHTML = '<div class="loading-state">Scanning directory...</div>';
    importBtn.disabled = true;
    selectedExternalPath = null;
    selectedText.textContent = 'No file selected';

    try {
        const response = await fetch(`${API_BASE}/api/files/list`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path })
        });
        const data = await response.json();

        if (data.success) {
            currentBrowserPath = data.currentPath;
            renderBreadcrumbs(data.currentPath, data.platform);
            renderFileList(data.items, data.platform);
        } else {
            throw new Error(data.error);
        }
    } catch (error) {
        console.error('File browser error:', error);
        listContainer.innerHTML = `<div class="loading-state" style="color: var(--danger-color);">Error: ${error.message}</div>`;
    }
}

function renderBreadcrumbs(path, platform) {
    const breadcrumbs = document.getElementById('fileBrowserBreadcrumbs');
    breadcrumbs.innerHTML = '';

    // Split path and filter out empty strings
    const separator = platform === 'nt' ? /[/\\]/ : /\//;
    const parts = path.split(separator).filter(p => p !== '');

    // Add root
    const rootItem = document.createElement('span');
    rootItem.className = 'breadcrumb-item';
    rootItem.textContent = platform === 'nt' ? 'This PC' : 'Root (/)';
    rootItem.onclick = () => openFileBrowser(platform === 'nt' ? 'C:\\' : '/');
    breadcrumbs.appendChild(rootItem);

    let currentPath = '';
    parts.forEach((part, index) => {
        const sep = document.createElement('span');
        sep.className = 'breadcrumb-separator';
        sep.textContent = ' / ';
        breadcrumbs.appendChild(sep);

        const item = document.createElement('span');
        item.className = 'breadcrumb-item';
        item.textContent = part;

        const isWindows = platform === 'nt';
        if (isWindows) {
            currentPath = parts.slice(0, index + 1).join('\\');
            if (currentPath.length === 1 && currentPath.match(/[A-Z]/i)) currentPath += ':\\';
            else if (!currentPath.includes(':')) currentPath = parts[0] + ':\\' + parts.slice(1, index + 1).join('\\');
        } else {
            currentPath = '/' + parts.slice(0, index + 1).join('/');
        }

        const targetPath = currentPath;
        item.onclick = () => openFileBrowser(targetPath);
        breadcrumbs.appendChild(item);
    });
}

function renderFileList(items, platform) {
    const listContainer = document.getElementById('fileBrowserList');
    listContainer.innerHTML = '';

    items.forEach(item => {
        const div = document.createElement('div');
        div.className = `file-item ${item.type}`;

        const isFolder = item.type === 'directory';
        const icon = isFolder
            ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>'
            : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>';

        div.innerHTML = `
            <div class="file-icon ${isFolder ? 'folder' : 'file'}">${icon}</div>
            <div class="file-name">${item.name}</div>
            <div class="file-size">${item.size ? (item.size / 1024).toFixed(1) + ' KB' : ''}</div>
        `;

        div.onclick = () => {
            if (isFolder) {
                openFileBrowser(item.path);
            } else if (item.name.toLowerCase().endsWith('.yml') || item.name.toLowerCase().endsWith('.yaml')) {
                // Select file
                document.querySelectorAll('.file-item').forEach(el => el.classList.remove('selected'));
                div.classList.add('selected');
                selectedExternalPath = item.path;
                document.getElementById('selectedFilePath').textContent = item.name;
                document.getElementById('fileBrowserModalImport').disabled = false;
            }
        };

        listContainer.appendChild(div);
    });
}

async function importExternalYaml() {
    if (!selectedExternalPath) return;

    try {
        const response = await fetch(`${API_BASE}/api/files/read`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: selectedExternalPath })
        });
        const data = await response.json();

        if (data.success) {
            state.config = YAMLParser.parse(data.content);
            state.currentFilePath = selectedExternalPath;
            document.getElementById('currentFilePath').textContent = state.currentFilePath;

            renderScreensList();
            document.getElementById('disableAutorotation').checked = state.config.essentials.disable_autorotation;
            showToast('Import Successful', `Loaded ${data.filename}`, 'success');
            closeFileBrowser();
        } else {
            throw new Error(data.error);
        }
    } catch (error) {
        console.error('Import error:', error);
        showToast('Import Error', error.message, 'error');
    }
}

function closeFileBrowser() {
    document.getElementById('fileBrowserModal').classList.remove('active');
}

// Update the original importConfig function to trigger our browser
window.importConfig = function () {
    openFileBrowser('/etc/opensurv');
};

// ===== File Operations =====
const API_BASE = window.location.origin;

async function loadConfig() {
    try {
        const response = await fetch(`${API_BASE}/api/config`);
        const data = await response.json();

        if (data.success) {
            state.config = YAMLParser.parse(data.content);

            // Update UI
            // Update UI
            document.getElementById('disableAutorotation').checked = state.config.essentials.disable_autorotation;
            renderScreensList();

            // Select first screen by default
            if (state.config.essentials.screens.length > 0) {
                selectScreen(0);
            }

            showToast('Config Loaded', 'Configuration loaded successfully', 'success');
        } else {
            throw new Error(data.error || 'Failed to load configuration');
        }
    } catch (error) {
        console.error('Error loading config:', error);
        showToast('Load Error', error.message || 'Failed to load configuration file', 'error');
    }
}

async function saveConfig() {
    try {
        // Update global settings
        state.config.essentials.disable_autorotation = document.getElementById('disableAutorotation').checked;

        // Update current screen settings
        updateScreenSettings();

        const yamlText = YAMLParser.stringify(state.config);

        // Save to backend
        const response = await fetch(`${API_BASE}/api/config`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ content: yamlText })
        });

        const data = await response.json();

        if (data.success) {
            showToast('Config Saved', 'Configuration saved successfully (backup created)', 'success');
        } else {
            throw new Error(data.error || 'Failed to save configuration');
        }
    } catch (error) {
        console.error('Error saving config:', error);
        showToast('Save Error', error.message || 'Failed to save configuration', 'error');
    }
}

/**
 * Replaced legacy import with File Browser
 */
function importConfig() {
    openFileBrowser('/etc/opensurv');
}

function exportConfig() {
    try {
        // Update global settings
        state.config.essentials.disable_autorotation = document.getElementById('disableAutorotation').checked;

        // Update current screen settings
        updateScreenSettings();

        const yamlText = YAMLParser.stringify(state.config);

        // Create download
        const blob = new Blob([yamlText], { type: 'text/yaml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'monitor1.yml';
        a.click();
        URL.revokeObjectURL(url);

        showToast('Config Exported', 'Configuration exported to file', 'success');
    } catch (error) {
        console.error('Error exporting config:', error);
        showToast('Export Error', 'Failed to export configuration', 'error');
    }
}

async function restartOpenSurv() {
    if (!confirm('Are you sure you want to restart Tonys OpenSurv Manager? This will reload the configuration and restart the display.')) {
        return;
    }

    try {
        // Save current config first
        await saveConfig();

        // Send restart command
        const response = await fetch(`${API_BASE}/api/restart`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();

        if (data.success) {
            showToast('OpenSurv Restarted', 'OpenSurv is restarting...', 'success');
        } else {
            throw new Error(data.error || 'Failed to restart OpenSurv');
        }
    } catch (error) {
        console.error('Error restarting OpenSurv:', error);
        showToast('Restart Error', error.message || 'Failed to restart OpenSurv. You may need to run: sudo systemctl restart lightdm.service', 'warning');
    }
}

async function checkExistingScreenshots() {
    if (state.currentScreenIndex === null) return;
    const screen = state.config.essentials.screens[state.currentScreenIndex];
    if (screen.streams.length === 0) return;

    try {
        const payload = {
            streams: screen.streams.map(s => ({ url: s.url }))
        };

        const response = await fetch(`${API_BASE}/api/screenshots/check`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (data.success && Object.keys(data.screenshots).length > 0) {
            state.screenshots = { ...state.screenshots, ...data.screenshots };
            renderCamerasList();
            console.log(`Loaded ${Object.keys(data.screenshots).length} existing screenshots`);
        }
    } catch (error) {
        console.error('Error checking existing screenshots:', error);
    }
}

async function retrieveScreenshots() {
    if (state.currentScreenIndex === null) return;

    const screen = state.config.essentials.screens[state.currentScreenIndex];
    if (screen.streams.length === 0) {
        showToast('No Cameras', 'Add cameras before retrieving screenshots', 'warning');
        return;
    }

    const btn = document.getElementById('retrieveScreenshotsBtn');
    const originalText = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg> Retrieve Screenshots`; // Hardcoded original icon since we might lose it

    btn.disabled = true;
    showToast('Capture Started', `Starting individual capture for ${screen.streams.length} cameras...`, 'info');

    let successCount = 0;
    let failCount = 0;

    try {
        // Sequential processing for granular updates
        for (let i = 0; i < screen.streams.length; i++) {
            const stream = screen.streams[i];
            const name = stream.name || `Camera ${i + 1}`;

            // Update button status
            btn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> Capturing ${i + 1}/${screen.streams.length}...`;

            // Optional: Scroll camera into view or highlight it
            // const card = document.querySelectorAll('.camera-card')[i];
            // if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });

            try {
                const response = await fetch(`${API_BASE}/api/screenshots/capture`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ streams: [{ url: stream.url }] }) // Send single stream
                });

                const data = await response.json();

                if (data.success && data.screenshots && data.screenshots[stream.url]) {
                    state.screenshots = { ...state.screenshots, ...data.screenshots };
                    successCount++;
                    // Update UI immediately for this camera
                    renderCamerasList();
                } else {
                    failCount++;
                }
            } catch (err) {
                console.error(`Failed to capture ${name}`, err);
                failCount++;
            }
        }

        showToast('Capture Complete', `Successfully captured ${successCount} cameras. ${failCount > 0 ? `${failCount} failed.` : ''}`, successCount > 0 ? 'success' : 'warning');

    } catch (error) {
        console.error('Screenshot error:', error);
        showToast('System Error', error.message || 'Fatal error during capture loop', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}


async function rebootSystem() {
    if (!confirm('WARNING: This will REBOOT the entire server. Are you sure?')) {
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/api/reboot`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const data = await response.json();

        if (data.success) {
            showToast('System Rebooting', 'Server is restarting now...', 'success');
        } else {
            throw new Error(data.error);
        }
    } catch (error) {
        console.error('Reboot error:', error);
        showToast('Reboot Failed', error.message, 'error');
    }
}

// ===== Screen Preview =====
function showScreenPreview() {
    if (state.currentScreenIndex === null) return;

    const screen = state.config.essentials.screens[state.currentScreenIndex];
    const modal = document.getElementById('previewModal');
    const canvas = document.getElementById('previewCanvas');

    // Clear previous preview
    canvas.innerHTML = '';

    // Assume 1920x1080 resolution (16:9)
    const screenWidth = 1920;
    const screenHeight = 1080;

    // Get canvas dimensions for scaling
    const canvasRect = canvas.getBoundingClientRect();
    const scale = canvasRect.width / screenWidth;

    // Calculate auto-layout if cameras don't have force_coordinates
    const camerasWithCoords = screen.streams.filter(s => s.force_coordinates);
    const camerasWithoutCoords = screen.streams.filter(s => !s.force_coordinates);

    // Auto-calculate positions for cameras without coordinates
    if (camerasWithoutCoords.length > 0) {
        const columns = screen.nr_of_columns || 2;
        const rows = Math.ceil(camerasWithoutCoords.length / columns);
        const cellWidth = screenWidth / columns;
        const cellHeight = screenHeight / rows;

        camerasWithoutCoords.forEach((stream, index) => {
            const col = index % columns;
            const row = Math.floor(index / columns);

            // Create temporary coordinates for preview
            stream._previewCoords = [
                col * cellWidth,
                row * cellHeight,
                (col + 1) * cellWidth,
                (row + 1) * cellHeight
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

        // Background image logic
        const showImages = document.getElementById('togglePreviewImages').checked;
        const screenshot = state.screenshots[stream.url];

        const cameraDiv = document.createElement('div');
        cameraDiv.className = 'preview-camera' + (stream.showontop ? ' show-on-top' : '');
        cameraDiv.style.left = `${(x1 / screenWidth) * 100}%`;
        cameraDiv.style.top = `${(y1 / screenHeight) * 100}%`;
        cameraDiv.style.width = `${(width / screenWidth) * 100}%`;
        cameraDiv.style.height = `${(height / screenHeight) * 100}%`;

        if (showImages && screenshot) {
            cameraDiv.style.backgroundImage = `url(/screenshots/${screenshot})`;
            cameraDiv.classList.add('has-image');
        }

        const displayName = stream.name || `Camera ${index + 1}`;

        cameraDiv.innerHTML = `
            ${(!showImages || !screenshot) ? `
            <div class="preview-camera-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                    <circle cx="12" cy="13" r="4"/>
                </svg>
            </div>` : ''}
            <div class="preview-camera-name">${displayName}</div>
            <div class="preview-camera-coords">${width}x${height}px</div>
            <div class="preview-camera-coords">[${x1}, ${y1}, ${x2}, ${y2}]</div>
        `;

        cameraDiv.title = `${displayName}\nPosition: [${x1}, ${y1}, ${x2}, ${y2}]\nSize: ${width}x${height}px${stream.showontop ? '\nShow on Top: Yes' : ''}`;

        canvas.appendChild(cameraDiv);

        // Clean up temporary coordinates
        delete stream._previewCoords;
    });

    // Update resolution display
    document.getElementById('previewResolution').textContent = `Resolution: ${screenWidth}x${screenHeight} (16:9) • ${screen.streams.length} camera${screen.streams.length !== 1 ? 's' : ''}`;

    // Show modal
    modal.classList.add('active');
}

function closePreviewModal() {
    document.getElementById('previewModal').classList.remove('active');
}

// ===== Event Listeners =====
document.addEventListener('DOMContentLoaded', () => {
    // Load initial config
    loadConfig();

    // Header buttons
    document.getElementById('importBtn').addEventListener('click', importConfig);
    document.getElementById('exportBtn').addEventListener('click', exportConfig);
    document.getElementById('saveBtn').addEventListener('click', saveConfig);
    document.getElementById('headerUpdatesBtn').addEventListener('click', () => {
        openSettingsModal();
        // Scroll to bottom to show updates section
        const modalBody = document.querySelector('#settingsModal .modal-body');
        if (modalBody) setTimeout(() => modalBody.scrollTop = modalBody.scrollHeight, 100);
    });
    document.getElementById('backupsBtn').addEventListener('click', openBackupsModal);
    document.getElementById('settingsBtn').addEventListener('click', openSettingsModal);
    document.getElementById('restartBtn').addEventListener('click', restartOpenSurv);

    // Settings Modal
    document.getElementById('settingsModalClose').addEventListener('click', closeSettingsModal);
    document.getElementById('settingsModalCloseBtn').addEventListener('click', closeSettingsModal);
    document.getElementById('saveSettingsBtn').addEventListener('click', saveSettings);

    // Backups Modal
    document.getElementById('backupsModalClose').addEventListener('click', closeBackupsModal);
    document.getElementById('backupsModalOk').addEventListener('click', closeBackupsModal);

    document.getElementById('settingsModal').addEventListener('click', (e) => {
        if (e.target.id === 'settingsModal') closeSettingsModal();
    });

    document.getElementById('backupsModal').addEventListener('click', (e) => {
        if (e.target.id === 'backupsModal') closeBackupsModal();
    });

    // File Browser Modal
    document.getElementById('fileBrowserModalClose').addEventListener('click', closeFileBrowser);
    document.getElementById('fileBrowserModalCancel').addEventListener('click', closeFileBrowser);
    document.getElementById('fileBrowserModalImport').addEventListener('click', importExternalYaml);

    document.getElementById('fileBrowserModal').addEventListener('click', (e) => {
        if (e.target.id === 'fileBrowserModal') closeFileBrowser();
    });

    // Reboot Button
    const rebootBtn = document.getElementById('rebootBtn');
    if (rebootBtn) {
        rebootBtn.addEventListener('click', rebootSystem);
    }

    // Sidebar
    document.getElementById('addScreenBtn').addEventListener('click', addScreen);

    // Screen editor
    document.getElementById('deleteScreenBtn').addEventListener('click', deleteScreen);
    document.getElementById('addCameraBtn').addEventListener('click', () => openCameraModal('add'));
    document.getElementById('retrieveScreenshotsBtn').addEventListener('click', retrieveScreenshots);
    document.getElementById('previewScreenBtn').addEventListener('click', () => {
        if (typeof showScreenPreviewDraggable === 'function') {
            showScreenPreviewDraggable();
        } else {
            showScreenPreview();
        }
    });

    document.getElementById('togglePreviewImages').addEventListener('change', () => {
        // Re-render preview to apply changes
        if (typeof showScreenPreviewDraggable === 'function') {
            showScreenPreviewDraggable();
        } else {
            // Fallback for non-draggable version (unlikely to be used but good for safety)
            showScreenPreview();
        }
    });

    // Screen settings - auto-save on change
    document.getElementById('screenDuration').addEventListener('change', updateScreenSettings);
    document.getElementById('screenColumns').addEventListener('change', updateScreenSettings);
    document.getElementById('screenRotate90').addEventListener('change', updateScreenSettings);
    document.getElementById('screenDisableProbing').addEventListener('change', updateScreenSettings);

    // Camera modal
    document.getElementById('modalClose').addEventListener('click', closeCameraModal);
    document.getElementById('modalCancel').addEventListener('click', closeCameraModal);
    document.getElementById('modalSave').addEventListener('click', saveCamera);

    // Preview modal
    document.getElementById('previewModalClose').addEventListener('click', () => {
        if (typeof closePreviewModalDraggable === 'function') {
            closePreviewModalDraggable();
        } else {
            closePreviewModal();
        }
    });
    document.getElementById('previewModalOk').addEventListener('click', () => {
        if (typeof closePreviewModalDraggable === 'function') {
            closePreviewModalDraggable();
        } else {
            closePreviewModal();
        }
    });

    // Force coordinates toggle
    document.getElementById('cameraForceCoords').addEventListener('change', (e) => {
        document.getElementById('coordsSection').style.display = e.target.checked ? 'block' : 'none';
    });

    // Close modal on background click
    document.getElementById('cameraModal').addEventListener('click', (e) => {
        if (e.target.id === 'cameraModal') {
            closeCameraModal();
        }
    });

    document.getElementById('previewModal').addEventListener('click', (e) => {
        if (e.target.id === 'previewModal') {
            if (typeof closePreviewModalDraggable === 'function') {
                closePreviewModalDraggable();
            } else {
                closePreviewModal();
            }
        }
    });
});

// ===== Update Management =====
let updateDownloadUrl = null;

async function checkForUpdates() {
    const statusText = document.getElementById('updateStatusText');
    const statusSubtext = document.getElementById('updateStatusSubtext');
    const checkBtn = document.getElementById('checkForUpdatesBtn');
    const updateBtn = document.getElementById('performUpdateBtn');
    const reinstallBtn = document.getElementById('reinstallUpdateBtn');
    const releaseNotes = document.getElementById('updateReleaseNotes');

    if (!statusText) return; // Guard clause

    statusText.textContent = 'Checking for updates...';
    checkBtn.disabled = true;
    updateBtn.style.display = 'none';
    if (reinstallBtn) reinstallBtn.style.display = 'none';
    releaseNotes.style.display = 'none';

    try {
        const response = await fetch(`${API_BASE}/api/update/check`);
        const data = await response.json();

        // Update current version if returned
        if (document.getElementById('currentVersionDisplay')) {
            document.getElementById('currentVersionDisplay').textContent = data.current_version || '1.3.1';
        }

        if (data.update_available) {
            statusText.textContent = `Update Available: ${data.latest_version}`;
            statusText.style.color = 'var(--success-color)';
            statusSubtext.textContent = 'A new update is available for download.';
            statusSubtext.style.color = 'var(--text-muted)';

            updateDownloadUrl = data.download_url;
            updateBtn.style.display = 'block';

            if (data.release_notes) {
                releaseNotes.textContent = data.release_notes;
                releaseNotes.style.display = 'block';
            }
        } else if (data.error) {
            statusText.textContent = 'Check failed';
            statusSubtext.textContent = data.error;
            statusSubtext.style.color = '#ef4444'; // Danger color
        } else {
            statusText.textContent = 'You are on the latest version';
            statusText.style.color = 'var(--text-secondary)';
            statusSubtext.textContent = `Current version: v${data.current_version}`;
            statusSubtext.style.color = 'var(--text-muted)';
            // Still allow reinstall if we got a download URL
            if (data.download_url) {
                updateDownloadUrl = data.download_url;
                if (reinstallBtn) reinstallBtn.style.display = 'block';
            }
        }
    } catch (error) {
        console.error('Update check error:', error);
        statusText.textContent = 'Check failed';
        statusSubtext.textContent = 'Could not connect to update server';
        statusSubtext.style.color = '#ef4444'; // Danger color
    } finally {
        checkBtn.disabled = false;
    }
}

async function performUpdate() {
    if (!updateDownloadUrl) return;

    const statusText = document.getElementById('updateStatusText');
    const updateBtn = document.getElementById('performUpdateBtn');
    const reinstallBtn = document.getElementById('reinstallUpdateBtn');
    const checkBtn = document.getElementById('checkForUpdatesBtn'); // Get check button too

    if (!confirm('This will download and install the version from GitHub. The application will restart. Continue?')) {
        return;
    }

    statusText.textContent = 'Updating... Please wait.';
    updateBtn.disabled = true;
    if (reinstallBtn) reinstallBtn.disabled = true;
    if (checkBtn) checkBtn.disabled = true; // Disable check button during update
    updateBtn.innerHTML = 'Updating...';

    try {
        const response = await fetch(`${API_BASE}/api/update/perform`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ download_url: updateDownloadUrl })
        });

        const data = await response.json();

        if (data.success) {
            statusText.textContent = 'Updating...';
            showToast('Update Started', 'The server is updating and will restart shortly. Please reload this page in a minute.', 'success');

            // Disable UI
            document.body.style.opacity = '0.5';
            document.body.style.pointerEvents = 'none';

            // Try to reload after 15 seconds
            setTimeout(() => {
                location.reload();
            }, 15000);
        } else {
            throw new Error(data.error);
        }
    } catch (error) {
        console.error('Update error:', error);
        statusText.textContent = 'Update failed';
        showToast('Update Failed', error.message, 'error');
        updateBtn.disabled = false;
        updateBtn.innerHTML = 'Update Now';
    }
}

// Expose to window for onclick handlers
window.checkForUpdates = checkForUpdates;
window.performUpdate = performUpdate;

// ===== Raw Editor =====
const rawEditorModal = document.getElementById('rawEditorModal');
const rawEditorBtn = document.getElementById('rawEditorBtn');
const rawEditorClose = document.getElementById('rawEditorModalClose');
const rawEditorCancel = document.getElementById('rawEditorCancel');
const rawEditorSave = document.getElementById('rawEditorSave');
const rawEditorContent = document.getElementById('rawEditorContent');

async function openRawEditor() {
    rawEditorModal.classList.add('active');
    rawEditorContent.value = 'Loading configuration...';
    rawEditorContent.disabled = true;

    try {
        const response = await fetch(`${API_BASE}/api/config`);
        const data = await response.json();

        if (data.success) {
            rawEditorContent.value = data.content;
            rawEditorContent.disabled = false;
        } else {
            rawEditorContent.value = `Error loading config: ${data.error}`;
        }
    } catch (error) {
        console.error('Error fetching raw config:', error);
        rawEditorContent.value = `Failed to connect to server: ${error.message}`;
    }
}

function closeRawEditor() {
    rawEditorModal.classList.remove('active');
}

async function saveRawFile() {
    if (!confirm('WARNING: Saving raw configuration will overwrite existing settings. Syntax errors may prevent the server from starting. Are you sure?')) {
        return;
    }

    const content = rawEditorContent.value;
    const saveBtn = document.getElementById('rawEditorSave');
    saveBtn.disabled = true;
    saveBtn.innerHTML = 'Saving...';

    try {
        const response = await fetch(`${API_BASE}/api/config`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: content })
        });

        const data = await response.json();

        if (data.success) {
            showToast('Success', 'Configuration saved successfully', 'success');
            closeRawEditor();
            // Reload main config to update UI
            loadConfig();
        } else {
            showToast('Error', data.error || 'Failed to save configuration', 'error');
        }
    } catch (error) {
        console.error('Error saving raw config:', error);
        showToast('Error', 'Failed to connect to server', 'error');
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = 'Save Changes';
    }
}

if (rawEditorBtn) rawEditorBtn.addEventListener('click', openRawEditor);
if (rawEditorClose) rawEditorClose.addEventListener('click', closeRawEditor);
if (rawEditorCancel) rawEditorCancel.addEventListener('click', closeRawEditor);
if (rawEditorSave) rawEditorSave.addEventListener('click', saveRawFile);


