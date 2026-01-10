import os
import json
import urllib.request
import shutil
import zipfile
import sys
import subprocess
import time

class GitHubUpdater:
    def __init__(self, repo_owner, repo_name, current_version):
        self.repo_owner = repo_owner
        self.repo_name = repo_name
        self.current_version = current_version
        self.api_url = f"https://api.github.com/repos/{repo_owner}/{repo_name}/releases/latest"

    def check_for_updates(self):
        """
        Check for updates on GitHub.
        Returns:
            dict: { 'update_available': bool, 'latest_version': str, 'release_notes': str, 'download_url': str }
        """
        try:
            req = urllib.request.Request(self.api_url)
            req.add_header('User-Agent', 'Tonys-OpenSurv-Manager-Updater')
            
            with urllib.request.urlopen(req, timeout=10) as response:
                if response.status != 200:
                    return {'update_available': False, 'error': f"GitHub API returned {response.status}"}
                
                data = json.loads(response.read().decode('utf-8'))
                
                latest_tag = data.get('tag_name', '').lstrip('v')
                
                # Simple version comparison
                if self._compare_versions(latest_tag, self.current_version) > 0:
                    # Find zipball or asset
                    download_url = data.get('zipball_url') # Default to source code zip
                    
                    # If there are assets, look for a specific release zip if preferred, 
                    # otherwise use the first one or source code.
                    # For this project, source code zip is probably best.
                    
                    return {
                        'update_available': True,
                        'latest_version': latest_tag,
                        'release_notes': data.get('body', ''),
                        'download_url': download_url
                    }
                
                return {
                    'update_available': False, 
                    'latest_version': latest_tag,
                    'current_version': self.current_version
                }
                
        except Exception as e:
            return {'update_available': False, 'error': str(e)}

    def _compare_versions(self, v1, v2):
        """
        Compare two version strings (v1 and v2).
        Returns:
            1 if v1 > v2
            -1 if v1 < v2
            0 if v1 == v2
        """
        def normalize(v):
            return [int(x) for x in v.replace('v', '').split('.')]
        
        try:
            parts1 = normalize(v1)
            parts2 = normalize(v2)
            
            # Pad with zeros
            while len(parts1) < len(parts2): parts1.append(0)
            while len(parts2) < len(parts1): parts2.append(0)
            
            if parts1 > parts2: return 1
            if parts1 < parts2: return -1
            return 0
        except:
            # Fallback for non-standard versions
            return 1 if v1 != v2 else 0

    def download_update(self, url, target_path):
        """Download the update file"""
        try:
            print(f"Downloading update from {url}...")
            urllib.request.urlretrieve(url, target_path)
            return True
        except Exception as e:
            print(f"Download failed: {e}")
            return False

    def create_update_script(self, zip_path):
        """Create a platform-specific update script"""
        if os.name == 'nt':
            return self._create_windows_script(zip_path)
        else:
            return self._create_linux_script(zip_path)

    def _create_windows_script(self, zip_path):
        script_name = "update_install.bat"
        # We need a python script to extract the zip because batch extraction is hard without tools
        extractor_script = "extract_update.py"
        
        # Create a helper python script for extraction
        with open(extractor_script, 'w') as f:
            f.write(f"""
import zipfile
import os
import shutil
import sys
import time

def extract_and_move(zip_path):
    print(f"Extracting {{zip_path}}...")
    try:
        # Extract to temp folder
        temp_dir = "update_temp"
        if os.path.exists(temp_dir):
            shutil.rmtree(temp_dir)
        os.makedirs(temp_dir)
        
        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            zip_ref.extractall(temp_dir)
            
        # The zip likely contains a top-level directory (e.g., repo-name-hash)
        # We need to find it and move contents up
        content_root = temp_dir
        items = os.listdir(temp_dir)
        if len(items) == 1 and os.path.isdir(os.path.join(temp_dir, items[0])):
            content_root = os.path.join(temp_dir, items[0])
            
        print(f"Installing files from {{content_root}}...")
        # Copy files to current directory
        # We exclude the update scripts themselves and temp dir
        excluded = [os.path.basename(__file__), "{script_name}", "update_temp", os.path.basename(zip_path)]
        
        for item in os.listdir(content_root):
            if item in excluded: continue
            
            s = os.path.join(content_root, item)
            d = os.path.join(".", item)
            
            if os.path.isdir(s):
                if os.path.exists(d):
                    # We merge directories usually, or replace? 
                    # copytree with dirs_exist_ok=True (Python 3.8+)
                    shutil.copytree(s, d, dirs_exist_ok=True)
                else:
                    shutil.copytree(s, d)
            else:
                shutil.copy2(s, d)
                
        print("Update installed successfully.")
        return True
    except Exception as e:
        print(f"Error installing update: {{e}}")
        return False

if __name__ == "__main__":
    time.sleep(2) # Give main process time to die
    if extract_and_move(r"{zip_path}"):
        print("Cleaning up...")
        # Cleanup
        try:
            if os.path.exists("{zip_path}"): os.remove("{zip_path}")
            if os.path.exists("update_temp"): shutil.rmtree("update_temp")
        except: pass
        
        print("Restarting server...")
        # Restart the main application
        if os.path.exists("run_windows.bat"):
            # Use start to launch in separate window/process and let this script exit
            os.system("start run_windows.bat")
        else:
            os.system("start python server.py")
    else:
        print("Update failed.")
        input("Press Enter to exit...")
""")
            
        # Create the batch script that runs the python extractor
        with open(script_name, 'w') as f:
            f.write(f"""@echo off
echo Waiting for application to close...
timeout /t 3 /nobreak
echo Starting update process...
python {extractor_script}
""")
        
        return script_name

    def _create_linux_script(self, zip_path):
        script_name = "update_install.sh"
        
        # For Linux, we can also use a python script or shell commands. 
        # Python is safer for consistency.
        extractor_script = "extract_update.py"
        
        # Same python script logic, just different restart command
        with open(extractor_script, 'w') as f:
            f.write(f"""
import zipfile
import os
import shutil
import sys
import time
import subprocess

def extract_and_move(zip_path):
    print(f"Extracting {{zip_path}}...")
    try:
        temp_dir = "update_temp"
        if os.path.exists(temp_dir):
            shutil.rmtree(temp_dir)
        os.makedirs(temp_dir)
        
        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            zip_ref.extractall(temp_dir)
            
        content_root = temp_dir
        items = os.listdir(temp_dir)
        if len(items) == 1 and os.path.isdir(os.path.join(temp_dir, items[0])):
            content_root = os.path.join(temp_dir, items[0])
            
        print(f"Installing files from {{content_root}}...")
        
        excluded = [os.path.basename(__file__), "{script_name}", "update_temp", os.path.basename(zip_path)]
        
        for item in os.listdir(content_root):
            if item in excluded: continue
            
            s = os.path.join(content_root, item)
            d = os.path.join(".", item)
            
            if os.path.isdir(s):
                if os.path.exists(d):
                    shutil.copytree(s, d, dirs_exist_ok=True)
                else:
                    shutil.copytree(s, d)
            else:
                shutil.copy2(s, d)
                
        print("Update installed successfully.")
        return True
    except Exception as e:
        print(f"Error installing update: {{e}}")
        return False

if __name__ == "__main__":
    time.sleep(2)
    if extract_and_move(r"{zip_path}"):
        print("Cleaning up...")
        try:
            if os.path.exists("{zip_path}"): os.remove("{zip_path}")
            if os.path.exists("update_temp"): shutil.rmtree("update_temp")
        except: pass
        
        print("Restarting server...")
        # Restart logic
        if os.path.exists("start_ubuntu_25.sh"):
             os.system("chmod +x start_ubuntu_25.sh")
             subprocess.Popen("./start_ubuntu_25.sh", shell=True)
        else:
             subprocess.Popen([sys.executable, "server.py"])
    else:
        print("Update failed.")
""")
        
        with open(script_name, 'w') as f:
            f.write(f"""#!/bin/bash
echo "Waiting for application to close..."
sleep 3
echo "Starting update process..."
python3 {extractor_script}
""")
        
        # Make script executable
        os.chmod(script_name, 0o755)
        
        return script_name
