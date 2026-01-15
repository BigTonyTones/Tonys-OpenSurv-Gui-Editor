#!/usr/bin/env python3
"""
Tonys OpenSurv Manager 1.2 - Backend Server
Provides API endpoints for managing monitor1.yml and restarting OpenSurv
"""

import sys
import subprocess
import os
import shutil
import json
from datetime import datetime
import time
import logging
from updater import GitHubUpdater


VERSION = "1.6"
PROGRAM_NAME = f"Tonys OpenSurv Manager {VERSION}"
REPO_OWNER = "BigTonyTones"
REPO_NAME = "Tonys-OpenSurv-Gui-Editor"


def check_root():
    """Check if the program is running with root privileges on Linux"""
    if os.name == 'posix' and os.geteuid() != 0:
        print('=' * 60)
        print(f'ERROR: {PROGRAM_NAME} must be run as root (sudo)')
        print('=' * 60)
        print('Please run with: sudo python3 server.py')
        print('=' * 60)
        sys.exit(1)

def check_ffmpeg():
    """Check if ffmpeg is available on Windows and offer to download it"""
    if os.name != 'nt':
        return

    # Check if ffmpeg is in PATH or bin directory
    if shutil.which('ffmpeg') or os.path.exists(os.path.join('bin', 'ffmpeg.exe')):
        return

    print('=' * 60)
    print(f'{PROGRAM_NAME} - FFmpeg Check')
    print('=' * 60)
    print('FFmpeg is missing. It is required for screenshot capture.')
    print('Download source: https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip')
    print('=' * 60)
    
    confirm = input('\nWould you like to download FFmpeg from the official source now? (y/n): ').lower()
    if confirm != 'y':
        print('Skipping FFmpeg download. Screenshot features may not work.')
        return

    print('Downloading FFmpeg (this may take a minute)...')
    try:
        import urllib.request
        import zipfile
        
        url = "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip"
        zip_path = "ffmpeg.zip"
        
        # Download
        print(f"Downloading from {url}...")
        urllib.request.urlretrieve(url, zip_path)
        
        print('Extracting...')
        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            # Find the ffmpeg.exe in the zip
            ffmpeg_file = next((f for f in zip_ref.namelist() if f.endswith('bin/ffmpeg.exe')), None)
            
            if ffmpeg_file:
                # Ensure bin directory exists
                os.makedirs('bin', exist_ok=True)
                # Extract to bin directory
                with zip_ref.open(ffmpeg_file) as source, open(os.path.join('bin', 'ffmpeg.exe'), 'wb') as target:
                    shutil.copyfileobj(source, target)
                print('FFmpeg installed successfully to bin/ folder!')
            else:
                print('Error: Could not find ffmpeg.exe in the downloaded archive.')
                
        # Cleanup
        if os.path.exists(zip_path):
            os.remove(zip_path)
            
    except Exception as e:
        print(f'Error downloading/installing FFmpeg: {e}')

# Auto-install requirements
def install_requirements():
    """Automatically install required packages if not present, with confirmation"""
    required_packages = {
        'flask': 'Flask==3.0.0',
        'flask_cors': 'Flask-CORS==4.0.0',
        'yaml': 'PyYAML==6.0.1'
    }
    
    missing_packages = []
    for module_name, package_spec in required_packages.items():
        try:
            __import__(module_name)
        except ImportError:
            missing_packages.append(package_spec)
    
    if missing_packages:
        print('=' * 60)
        print(f'{PROGRAM_NAME} - Dependency Check')
        print('=' * 60)
        print('The following packages are missing:')
        for package in missing_packages:
            print(f' - {package}')
        print('=' * 60)
        
        confirm = input('\nWould you like to install these dependencies now? (y/n): ').lower()
        if confirm != 'y':
            print('Installation cancelled. The program may not function correctly.')
            if os.name == 'posix':
                print('Tip: You might need to run: sudo pip install flask flask-cors pyyaml')
            return

        installed_count = 0
        for package in missing_packages:
            print(f'Installing {package}...')
            try:
                # Add --break-system-packages for newer Debian/Raspberry Pi OS
                cmd = [sys.executable, '-m', 'pip', 'install', package, '--break-system-packages']
                subprocess.check_call(cmd)
                installed_count += 1
            except Exception as e:
                print(f'Error installing {package}: {e}')
        
        if installed_count > 0:
            print('=' * 60)
            print('Dependencies installed. Restarting server...')
            print('=' * 60)
            os.execv(sys.executable, [sys.executable] + sys.argv)

# Perform startup checks
if os.name == 'posix':
    check_root()
install_requirements()
check_ffmpeg()

# Import dependencies AFTER check/installation
try:
    from flask import Flask, request, jsonify, send_from_directory
    from flask_cors import CORS
except ImportError as e:
    print(f"Critical Error: Failed to import dependencies: {e}")
    sys.exit(1)

app = Flask(__name__, static_folder='web')
CORS(app)

# Suppress development server warning
log = logging.getLogger('werkzeug')
log.setLevel(logging.ERROR)
updater = GitHubUpdater(REPO_OWNER, REPO_NAME, VERSION)

# Configuration
if os.name == 'posix':
    CONFIG_FILE = '/etc/opensurv/monitor1.yml'
else:
    CONFIG_FILE = os.path.join('config', 'monitor1.yml') # Local for Windows dev
SETTINGS_FILE = 'gui_settings.json'
BACKUP_DIR = 'backups'

# Default settings
DEFAULT_SETTINGS = {
    'port': 6453
}

def load_settings():
    if os.path.exists(SETTINGS_FILE):
        try:
            with open(SETTINGS_FILE, 'r') as f:
                return {**DEFAULT_SETTINGS, **json.load(f)}
        except:
            return DEFAULT_SETTINGS
    return DEFAULT_SETTINGS

def save_settings(settings):
    with open(SETTINGS_FILE, 'w') as f:
        json.dump(settings, f, indent=4)

# Ensure backup directory exists
os.makedirs(BACKUP_DIR, exist_ok=True)

@app.route('/')
def index():
    return send_from_directory('web', 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory('web', path)

@app.route('/api/config', methods=['GET'])
def get_config():
    try:
        if os.path.exists(CONFIG_FILE):
            with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
                content = f.read()
            return jsonify({'success': True, 'content': content})
        return jsonify({'success': False, 'error': 'Configuration file not found'}), 404
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/config', methods=['POST'])
def save_config():
    try:
        data = request.get_json()
        content = data.get('content')
        if not content:
            return jsonify({'success': False, 'error': 'No content provided'}), 400
        # Ensure config directory exists
        config_dir = os.path.dirname(CONFIG_FILE)
        if config_dir and not os.path.exists(config_dir):
            os.makedirs(config_dir, exist_ok=True)

        if os.path.exists(CONFIG_FILE):
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            backup_file = os.path.join(BACKUP_DIR, f'monitor1_{timestamp}.yml')
            shutil.copy2(CONFIG_FILE, backup_file)
        with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
            f.write(content)
        return jsonify({'success': True, 'message': 'Configuration saved successfully'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/settings', methods=['GET'])
def get_settings():
    return jsonify({'success': True, 'settings': load_settings()})

@app.route('/api/settings', methods=['POST'])
def update_settings():
    try:
        data = request.get_json()
        settings = load_settings()
        
        # Update settings
        if 'port' in data:
            settings['port'] = int(data['port'])
            
        save_settings(settings)
        return jsonify({'success': True, 'message': 'Settings saved. Restart required for some changes.'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/restart', methods=['POST'])
def restart_opensurv():
    try:
        if os.name == 'posix':
            result = subprocess.run(['sudo', 'systemctl', 'restart', 'lightdm.service'], capture_output=True, text=True, timeout=10)
            if result.returncode == 0:
                return jsonify({'success': True, 'message': 'OpenSurv restarted successfully'})
            return jsonify({'success': False, 'error': f'Failed to restart: {result.stderr}'}), 500
        return jsonify({'success': False, 'error': 'Restart is only supported on Linux'}), 400
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/reboot', methods=['POST'])
def reboot_system():
    try:
        if os.name == 'posix':
            # Run in background so request can complete
            subprocess.Popen(['sudo', 'reboot'], shell=False)
            return jsonify({'success': True, 'message': 'System is rebooting...'})
        return jsonify({'success': False, 'error': 'Reboot is only supported on Linux'}), 400
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/screenshots/<path:filename>')
def serve_screenshot(filename):
    return send_from_directory('screenshots', filename)

def get_ffmpeg_command():
    """Get the correct ffmpeg command/path for the current system"""
    if os.name == 'nt':
        local_path = os.path.join(os.getcwd(), 'bin', 'ffmpeg.exe')
        if os.path.exists(local_path):
            return local_path
    return 'ffmpeg'

@app.route('/api/screenshots/capture', methods=['POST'])
def capture_screenshots():
    try:
        data = request.get_json()
        streams = data.get('streams', [])
        
        if not streams:
            return jsonify({'success': False, 'error': 'No streams provided'}), 400

        # Ensure screenshots directory exists
        screenshot_dir = os.path.join(os.getcwd(), 'screenshots')
        if not os.path.exists(screenshot_dir):
            os.makedirs(screenshot_dir)

        results = {}
        import hashlib
        
        for stream in streams:
            url = stream.get('url')
            if not url:
                continue
                
            # Create a safe filename hash from URL
            url_hash = hashlib.md5(url.encode()).hexdigest()
            filename = f"cam_{url_hash}.jpg"
            filepath = os.path.join(screenshot_dir, filename)
            
            # Simple RTSP frame capture using ffmpeg
            # -y: overwrite
            # -rtsp_transport tcp: reliable transport
            # -i url: input
            # -frames:v 1: grab 1 frame
            # -q:v 2: quality
            # Try TCP first (Reliable)
            ffmpeg_cmd = get_ffmpeg_command()
            cmd_tcp = [
                ffmpeg_cmd, '-y', '-nostdin',
                '-rtsp_transport', 'tcp',
                '-i', url,
                '-frames:v', '1',
                '-q:v', '5', 
                filepath
            ]
            
            success = False
            try:
                # 15 second timeout for slow streams (Unifi, etc)
                subprocess.run(cmd_tcp, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=15)
                if os.path.exists(filepath) and os.path.getsize(filepath) > 0:
                    success = True
            except (subprocess.TimeoutExpired, Exception) as e:
                print(f"TCP capture failed for {url}: {e}")

            # Fallback to UDP if TCP failed
            if not success:
                print(f"Retrying with UDP for {url}...")
                cmd_udp = [
                    ffmpeg_cmd, '-y', '-nostdin',
                    '-i', url,
                    '-frames:v', '1',
                    '-q:v', '5', 
                    filepath
                ]
                try:
                    subprocess.run(cmd_udp, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=15)
                    if os.path.exists(filepath) and os.path.getsize(filepath) > 0:
                        success = True
                except Exception as e:
                    print(f"UDP capture failed for {url}: {e}")

            if success:
                results[url] = filename

        return jsonify({'success': True, 'screenshots': results})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/screenshots/check', methods=['POST'])
def check_screenshots():
    try:
        data = request.get_json()
        streams = data.get('streams', [])
        
        if not streams:
            return jsonify({'success': False, 'error': 'No streams provided'}), 400

        screenshot_dir = os.path.join(os.getcwd(), 'screenshots')
        if not os.path.exists(screenshot_dir):
             return jsonify({'success': True, 'screenshots': {}})

        results = {}
        import hashlib
        
        for stream in streams:
            url = stream.get('url')
            if not url:
                continue
                
            url_hash = hashlib.md5(url.encode()).hexdigest()
            filename = f"cam_{url_hash}.jpg"
            filepath = os.path.join(screenshot_dir, filename)
            
            if os.path.exists(filepath):
                 results[url] = filename

        return jsonify({'success': True, 'screenshots': results})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/update/check', methods=['GET'])
def check_update():
    result = updater.check_for_updates()
    return jsonify(result)

@app.route('/api/update/perform', methods=['POST'])
def perform_update():
    try:
        data = request.get_json()
        download_url = data.get('download_url')
        
        if not download_url:
            return jsonify({'success': False, 'error': 'No download URL provided'}), 400
            
        # Download
        zip_path = "update.zip"
        if updater.download_update(download_url, zip_path):
            # Create script
            script_path = updater.create_update_script(zip_path)
            
            # Launch script and exit
            if os.name == 'nt':
                # Windows: start a new command prompt to run the batch file
                subprocess.Popen(['start', 'cmd', '/c', script_path], shell=True)
            else:
                # Linux: run shell script in background
                subprocess.Popen(['/bin/bash', script_path], start_new_session=True)
                
            # Exit server shortly after
            def exit_server():
                time.sleep(1)
                os._exit(0)
                
            from threading import Thread
            Thread(target=exit_server).start()
            
            return jsonify({'success': True, 'message': 'Update started. Server is restarting...'})
        else:
            return jsonify({'success': False, 'error': 'Failed to download update'}), 500
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/backups', methods=['GET'])

def list_backups():
    try:
        backups = []
        if os.path.exists(BACKUP_DIR):
            for filename in sorted(os.listdir(BACKUP_DIR), reverse=True):
                if filename.endswith('.yml'):
                    filepath = os.path.join(BACKUP_DIR, filename)
                    stat = os.stat(filepath)
                    backups.append({
                        'filename': filename,
                        'size': stat.st_size,
                        'modified': datetime.fromtimestamp(stat.st_mtime).isoformat()
                    })
        return jsonify({'success': True, 'backups': backups})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/backups/<filename>', methods=['GET'])
def get_backup(filename):
    try:
        filepath = os.path.join(BACKUP_DIR, filename)
        if '..' in filename or '/' in filename or '\\' in filename:
            return jsonify({'success': False, 'error': 'Invalid filename'}), 400
        if os.path.exists(filepath):
            with open(filepath, 'r', encoding='utf-8') as f:
                content = f.read()
            return jsonify({'success': True, 'content': content})
        return jsonify({'success': False, 'error': 'Backup file not found'}), 404
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/validate', methods=['POST'])
def validate_config():
    try:
        import yaml
        data = request.get_json()
        content = data.get('content')
        if not content:
            return jsonify({'success': False, 'error': 'No content provided'}), 400
        yaml.safe_load(content)
        return jsonify({'success': True, 'message': 'Configuration is valid'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

@app.route('/api/files/list', methods=['POST'])
def list_directory():
    """List contents of a directory for the file browser"""
    data = request.get_json()
    path = data.get('path', '/etc/opensurv')
    
    # On Windows for testing, use a fallback if /etc/opensurv doesn't exist
    if os.name == 'nt' and not os.path.exists(path):
        path = os.getcwd()
        
    try:
        items = []
        # Add parent directory option if not at root
        parent = os.path.dirname(path)
        if parent != path:
            items.append({
                'name': '..',
                'path': parent,
                'type': 'directory'
            })
            
        with os.scandir(path) as entries:
            for entry in entries:
                # Basic security: skip hidden files/folders
                if entry.name.startswith('.'): continue
                
                items.append({
                    'name': entry.name,
                    'path': entry.path,
                    'type': 'directory' if entry.is_dir() else 'file',
                    'size': entry.stat().st_size if entry.is_file() else None
                })
        
        # Sort: directories first, then alphabetical
        items.sort(key=lambda x: (x['type'] != 'directory', x['name'].lower()))
        
        return jsonify({
            'success': True,
            'currentPath': os.path.abspath(path),
            'items': items,
            'platform': os.name # 'nt' or 'posix'
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/files/read', methods=['POST'])
def read_external_file():
    """Read contents of an external file for import"""
    data = request.get_json()
    path = data.get('path')
    
    if not path or not os.path.isfile(path):
        return jsonify({'success': False, 'error': 'Invalid file path'}), 400
        
    try:
        with open(path, 'r', encoding='utf-8') as f:
            content = f.read()
        return jsonify({
            'success': True,
            'content': content,
            'filename': os.path.basename(path)
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/play-vlc', methods=['POST'])
def play_vlc():
    try:
        data = request.get_json()
        url = data.get('url')
        if not url:
            return jsonify({'success': False, 'error': 'No URL provided'}), 400
        if os.name == 'nt':
            vlc_paths = [r'C:\Program Files\VideoLAN\VLC\vlc.exe', r'C:\Program Files (x86)\VideoLAN\VLC\vlc.exe']
            vlc_exe = next((p for p in vlc_paths if os.path.exists(p)), None)
            if not vlc_exe: return jsonify({'success': False, 'error': 'VLC not found'}), 404
            subprocess.Popen([vlc_exe, url], shell=False)
        else:
            try: subprocess.Popen(['vlc', url], shell=False)
            except FileNotFoundError: return jsonify({'success': False, 'error': 'VLC not found'}), 404
        return jsonify({'success': True, 'message': 'VLC launched successfully'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/autostart', methods=['GET'])
def get_autostart():
    if os.name != 'posix': return jsonify({'success': False, 'error': 'Only supported on Linux'})
    service_path = '/etc/systemd/system/opensurv-gui.service'
    exists = os.path.exists(service_path)
    enabled = False
    if exists:
        result = subprocess.run(['systemctl', 'is-enabled', 'opensurv-gui.service'], capture_output=True, text=True)
        enabled = result.returncode == 0
    return jsonify({'success': True, 'exists': exists, 'enabled': enabled})

@app.route('/api/autostart', methods=['POST'])
def toggle_autostart():
    if os.name != 'posix': return jsonify({'success': False, 'error': 'Only supported on Linux'})
    data = request.get_json()
    enable = data.get('enable', False)
    script_path = os.path.abspath(__file__)
    working_dir = os.path.dirname(script_path)
    python_path = sys.executable
    
    service_content = f"""[Unit]
Description={PROGRAM_NAME}
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory={working_dir}
ExecStart={python_path} {script_path}
Restart=always

[Install]
WantedBy=multi-user.target
"""
    service_path = '/etc/systemd/system/opensurv-gui.service'
    temp_service = '/tmp/opensurv-gui.service'
    try:
        if enable:
            with open(temp_service, 'w') as f: f.write(service_content)
            subprocess.run(['sudo', 'mv', temp_service, service_path], check=True)
            subprocess.run(['sudo', 'systemctl', 'daemon-reload'], check=True)
            subprocess.run(['sudo', 'systemctl', 'enable', 'opensurv-gui.service'], check=True)
            subprocess.run(['sudo', 'systemctl', 'start', 'opensurv-gui.service'], check=True)
        else:
            subprocess.run(['sudo', 'systemctl', 'stop', 'opensurv-gui.service'], check=False)
            subprocess.run(['sudo', 'systemctl', 'disable', 'opensurv-gui.service'], check=False)
            if os.path.exists(service_path): subprocess.run(['sudo', 'rm', service_path], check=True)
            subprocess.run(['sudo', 'systemctl', 'daemon-reload'], check=True)
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

if __name__ == '__main__':
    settings = load_settings()
    port = settings.get('port', 6453)
    
    if not os.environ.get("WERKZEUG_RUN_MAIN"):
        print('=' * 60)
        print(f'{PROGRAM_NAME} - Backend Server')
        print('=' * 60)
        print(f'Configuration file: {os.path.abspath(CONFIG_FILE)}')
        print('=' * 60)
        print(f'Starting server on http://localhost:{port}')
        print('Press Ctrl+C to stop')
        print('=' * 60)

    if os.name == 'nt' and not os.environ.get("WERKZEUG_RUN_MAIN"):
        import webbrowser
        from threading import Timer
        Timer(1.5, lambda: webbrowser.open(f'http://localhost:{port}')).start()

    app.run(host='0.0.0.0', port=port, debug=True)
