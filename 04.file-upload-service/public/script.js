class FileUploadApp {
    constructor() {
        this.apiBase = '/api';
        this.token = localStorage.getItem('authToken');
        this.currentUser = null;
        this.files = [];

        this.initializeEventListeners();
        this.checkAuthState();
    }

    initializeEventListeners() {
        // Authentication forms
        document.getElementById('loginForm').addEventListener('submit', (e) => this.handleLogin(e));
        document.getElementById('registerForm').addEventListener('submit', (e) => this.handleRegister(e));
        document.getElementById('logoutBtn').addEventListener('click', () => this.handleLogout());

        // File upload
        document.getElementById('uploadBtn').addEventListener('click', () => {
            document.getElementById('fileInput').click();
        });

        document.getElementById('fileInput').addEventListener('change', (e) => {
            this.handleFileSelection(e.target.files);
        });

        // Drag and drop
        const uploadArea = document.getElementById('uploadArea');
        uploadArea.addEventListener('dragover', (e) => this.handleDragOver(e));
        uploadArea.addEventListener('dragleave', (e) => this.handleDragLeave(e));
        uploadArea.addEventListener('drop', (e) => this.handleDrop(e));

        // File management
        document.getElementById('refreshBtn').addEventListener('click', () => this.loadFiles());
        document.getElementById('categoryFilter').addEventListener('change', () => this.loadFiles());
        document.getElementById('searchInput').addEventListener('input', () => this.debounceSearch());
    }

    async checkAuthState() {
        if (this.token) {
            try {
                const response = await this.apiCall('/auth/profile', 'GET');
                if (response.success) {
                    this.currentUser = response.data.user;
                    this.showApp();
                    this.loadFiles();
                    this.loadStorageStats();
                } else {
                    this.handleLogout();
                }
            } catch (error) {
                this.handleLogout();
            }
        } else {
            this.showAuth();
        }
    }

    async handleLogin(e) {
        e.preventDefault();

        const email = document.getElementById('loginEmail').value;
        const password = document.getElementById('loginPassword').value;

        try {
            const response = await this.apiCall('/auth/login', 'POST', { email, password });

            if (response.success) {
                this.token = response.data.token;
                this.currentUser = response.data.user;
                localStorage.setItem('authToken', this.token);
                this.showMessage('Login successful!', 'success');
                this.showApp();
                this.loadFiles();
                this.loadStorageStats();
            } else {
                this.showMessage(response.error, 'error');
            }
        } catch (error) {
            this.showMessage('Login failed. Please try again.', 'error');
        }
    }

    async handleRegister(e) {
        e.preventDefault();

        const name = document.getElementById('registerName').value;
        const email = document.getElementById('registerEmail').value;
        const password = document.getElementById('registerPassword').value;

        try {
            const response = await this.apiCall('/auth/register', 'POST', { name, email, password });

            if (response.success) {
                this.token = response.data.token;
                this.currentUser = response.data.user;
                localStorage.setItem('authToken', this.token);
                this.showMessage('Registration successful!', 'success');
                this.showApp();
                this.loadFiles();
                this.loadStorageStats();
            } else {
                this.showMessage(response.error, 'error');
            }
        } catch (error) {
            this.showMessage('Registration failed. Please try again.', 'error');
        }
    }

    handleLogout() {
        this.token = null;
        this.currentUser = null;
        localStorage.removeItem('authToken');
        this.showAuth();
        this.showMessage('Logged out successfully', 'info');
    }

    showAuth() {
        document.getElementById('authSection').style.display = 'block';
        document.getElementById('appSection').style.display = 'none';
        document.getElementById('userInfo').style.display = 'none';
    }

    showApp() {
        document.getElementById('authSection').style.display = 'none';
        document.getElementById('appSection').style.display = 'block';
        document.getElementById('userInfo').style.display = 'flex';
        document.getElementById('userName').textContent = this.currentUser.name;
    }

    handleDragOver(e) {
        e.preventDefault();
        document.getElementById('uploadArea').classList.add('drag-over');
    }

    handleDragLeave(e) {
        e.preventDefault();
        document.getElementById('uploadArea').classList.remove('drag-over');
    }

    handleDrop(e) {
        e.preventDefault();
        document.getElementById('uploadArea').classList.remove('drag-over');
        this.handleFileSelection(e.dataTransfer.files);
    }

    async handleFileSelection(files) {
        if (files.length === 0) return;

        const formData = new FormData();
        for (let file of files) {
            formData.append('files', file);
        }

        this.showUploadProgress();

        try {
            const response = await fetch(`${this.apiBase}/files/upload`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.token}`
                },
                body: formData
            });

            const result = await response.json();

            if (result.success) {
                this.showMessage(`Successfully uploaded ${files.length} file(s)!`, 'success');
                this.loadFiles();
                this.loadStorageStats();
            } else {
                this.showMessage(result.error, 'error');
            }
        } catch (error) {
            this.showMessage('Upload failed. Please try again.', 'error');
        } finally {
            this.hideUploadProgress();
            document.getElementById('fileInput').value = '';
        }
    }

    showUploadProgress() {
        document.getElementById('uploadProgress').style.display = 'block';
        document.getElementById('progressFill').style.width = '0%';
        document.getElementById('progressText').textContent = 'Uploading...';

        // Simulate progress for demonstration
        let progress = 0;
        const interval = setInterval(() => {
            progress += Math.random() * 15;
            if (progress >= 90) {
                clearInterval(interval);
                return;
            }
            document.getElementById('progressFill').style.width = progress + '%';
        }, 200);
    }

    hideUploadProgress() {
        document.getElementById('uploadProgress').style.display = 'none';
    }

    async loadFiles() {
        try {
            const category = document.getElementById('categoryFilter').value;
            const search = document.getElementById('searchInput').value;

            let url = `/files?`;
            if (category) url += `category=${category}&`;
            if (search) url += `search=${encodeURIComponent(search)}&`;

            const response = await this.apiCall(url, 'GET');

            if (response.success) {
                this.files = response.data.files;
                this.renderFileList();
            } else {
                this.showMessage('Failed to load files', 'error');
            }
        } catch (error) {
            this.showMessage('Failed to load files', 'error');
        }
    }

    async loadStorageStats() {
        try {
            const response = await this.apiCall('/files/stats', 'GET');

            if (response.success) {
                this.updateStorageDisplay(response.data);
            }
        } catch (error) {
            console.error('Failed to load storage stats:', error);
        }
    }

    updateStorageDisplay(stats) {
        const percentage = stats.usage_percentage;
        const usedHuman = this.formatFileSize(stats.storage_used_bytes);
        const totalHuman = this.formatFileSize(stats.storage_quota_bytes);

        document.getElementById('storageProgress').style.width = `${percentage}%`;
        document.getElementById('storageText').textContent = `${usedHuman} / ${totalHuman}`;
        document.getElementById('storagePercentage').textContent = `${percentage}%`;
    }

    renderFileList() {
        const fileList = document.getElementById('fileList');

        if (this.files.length === 0) {
            fileList.innerHTML = '<p style="text-align: center; color: #7f8c8d; padding: 40px;">No files uploaded yet</p>';
            return;
        }

        fileList.innerHTML = this.files.map(file => `
            <div class="file-item">
                <div class="file-icon">${this.getFileIcon(file.file_category)}</div>
                <div class="file-info">
                    <h4>${file.original_filename}</h4>
                    <div class="file-meta">
                        ${file.file_size_human} • ${file.upload_age} • ${file.file_category}
                    </div>
                </div>
                <div class="file-status status-${file.processing_status}">
                    ${file.processing_status}
                </div>
                <div class="file-actions">
                    <button class="btn-view" onclick="app.viewFile(${file.id})">View</button>
                    <button class="btn-delete" onclick="app.deleteFile(${file.id})">Delete</button>
                </div>
            </div>
        `).join('');
    }

    getFileIcon(category) {
        const icons = {
            image: '🖼️',
            document: '📄',
            video: '🎥',
            audio: '🎵',
            other: '📎'
        };
        return icons[category] || '📎';
    }

    async viewFile(fileId) {
        window.open(`${this.apiBase}/files/${fileId}/download`, '_blank');
    }

    async deleteFile(fileId) {
        if (!confirm('Are you sure you want to delete this file?')) {
            return;
        }

        try {
            const response = await this.apiCall(`/files/${fileId}`, 'DELETE');

            if (response.success) {
                this.showMessage('File deleted successfully', 'success');
                this.loadFiles();
                this.loadStorageStats();
            } else {
                this.showMessage(response.error, 'error');
            }
        } catch (error) {
            this.showMessage('Failed to delete file', 'error');
        }
    }

    debounceSearch() {
        clearTimeout(this.searchTimeout);
        this.searchTimeout = setTimeout(() => {
            this.loadFiles();
        }, 500);
    }

    async apiCall(endpoint, method = 'GET', body = null) {
        const url = endpoint.startsWith('http') ? endpoint : `${this.apiBase}${endpoint}`;

        const options = {
            method,
            headers: {
                'Content-Type': 'application/json',
            }
        };

        if (this.token) {
            options.headers['Authorization'] = `Bearer ${this.token}`;
        }

        if (body && method !== 'GET') {
            options.body = JSON.stringify(body);
        }

        const response = await fetch(url, options);
        return await response.json();
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    showMessage(message, type = 'info') {
        const messagesContainer = document.getElementById('messages');
        const messageElement = document.createElement('div');
        messageElement.className = `message ${type}`;
        messageElement.textContent = message;

        messagesContainer.appendChild(messageElement);

        setTimeout(() => {
            messageElement.remove();
        }, 5000);
    }
}

// Initialize the application when the page loads
const app = new FileUploadApp();
