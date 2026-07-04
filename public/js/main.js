// 主JavaScript文件

// 工具函数
const utils = {
  // 格式化文件大小
  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  },

  // 显示消息
  showMessage(message, type = 'info') {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message message-${type}`;
    messageDiv.textContent = message;
    messageDiv.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 15px 25px;
      border-radius: 8px;
      color: white;
      font-weight: 500;
      z-index: 10000;
      animation: slideIn 0.3s ease;
    `;

    if (type === 'success') {
      messageDiv.style.background = '#10b981';
    } else if (type === 'error') {
      messageDiv.style.background = '#ef4444';
    } else {
      messageDiv.style.background = '#3b82f6';
    }

    document.body.appendChild(messageDiv);

    setTimeout(() => {
      messageDiv.remove();
    }, 3000);
  },

  // HTML转义（防XSS）
  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  },

  // 显示加载状态
  showLoading(button) {
    button.disabled = true;
    button.dataset.originalText = button.textContent;
    button.textContent = '处理中...';
  },

  // 隐藏加载状态
  hideLoading(button) {
    button.disabled = false;
    button.textContent = button.dataset.originalText;
  }
};

// 文件上传处理
class FileUploader {
  constructor(options) {
    this.dropZone = options.dropZone;
    this.fileInput = options.fileInput;
    this.fileList = options.fileList;
    this.maxFiles = options.maxFiles || 10;
    this.maxSize = options.maxSize || 100 * 1024 * 1024; // 100MB
    this.allowedTypes = options.allowedTypes || ['application/pdf'];
    this.files = [];

    this.init();
  }

  init() {
    // 拖拽事件
    this.dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      this.dropZone.classList.add('dragover');
    });

    this.dropZone.addEventListener('dragleave', () => {
      this.dropZone.classList.remove('dragover');
    });

    this.dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      this.dropZone.classList.remove('dragover');
      const files = Array.from(e.dataTransfer.files);
      this.addFiles(files);
    });

    // 点击上传 - 用 label 方式更可靠
    this.dropZone.addEventListener('click', (e) => {
      // 不让删除按钮等子元素触发
      if (e.target.tagName !== 'BUTTON') {
        this.fileInput.value = '';
        this.fileInput.click();
      }
    });

    // 防止 file input 本身点击事件冒泡
    this.fileInput.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    this.fileInput.addEventListener('change', (e) => {
      const files = Array.from(e.target.files);
      if (files.length > 0) {
        this.addFiles(files);
      }
    });
  }

  addFiles(newFiles) {
    for (const file of newFiles) {
      // 检查文件类型
      if (!this.allowedTypes.includes(file.type)) {
        utils.showMessage(`不支持的文件类型: ${file.name}`, 'error');
        continue;
      }

      // 检查文件大小
      if (file.size > this.maxSize) {
        utils.showMessage(`文件太大: ${file.name}`, 'error');
        continue;
      }

      // 检查文件数量
      if (this.files.length >= this.maxFiles) {
        utils.showMessage(`最多只能上传${this.maxFiles}个文件`, 'error');
        break;
      }

      // 检查重复
      if (this.files.some(f => f.name === file.name && f.size === file.size)) {
        utils.showMessage(`文件已存在: ${file.name}`, 'error');
        continue;
      }

      this.files.push(file);
    }

    this.renderFileList();
  }

  removeFile(index) {
    this.files.splice(index, 1);
    this.renderFileList();
  }

  renderFileList() {
    this.fileList.innerHTML = '';

    this.files.forEach((file, index) => {
      const fileItem = document.createElement('div');
      fileItem.className = 'file-item';
      const safeName = utils.escapeHtml(file.name);
      fileItem.innerHTML = `
        <div>
          <span class="file-name">${safeName}</span>
          <span class="file-size">${utils.formatFileSize(file.size)}</span>
        </div>
        <button class="file-remove" data-index="${index}">×</button>
      `;
      this.fileList.appendChild(fileItem);
    });

    // 添加删除事件
    document.querySelectorAll('.file-remove').forEach(button => {
      button.addEventListener('click', (e) => {
        const index = parseInt(e.target.dataset.index);
        this.removeFile(index);
      });
    });
  }

  getFiles() {
    return this.files;
  }

  clear() {
    this.files = [];
    this.renderFileList();
  }
}

// 用户状态管理
const userManager = {
  email: localStorage.getItem('userEmail') || null,
  isPremium: false,

  // 初始化用户状态
  async init() {
    if (this.email) {
      await this.checkPremiumStatus();
    }
    this.updateUI();
  },

  // 检查用户是否是付费用户
  async checkPremiumStatus() {
    try {
      const response = await fetch(`/api/user/check-premium?email=${encodeURIComponent(this.email)}`);
      const data = await response.json();
      this.isPremium = data.isPremium;
    } catch (error) {
      console.error('Error checking premium status:', error);
      this.isPremium = false;
    }
  },

  // 设置用户邮箱
  setEmail(email) {
    this.email = email;
    localStorage.setItem('userEmail', email);
    this.checkPremiumStatus().then(() => this.updateUI());
  },

  // 更新UI
  updateUI() {
    // 更新导航栏显示
    const userStatus = document.getElementById('user-status');
    if (userStatus) {
      if (this.email) {
        userStatus.innerHTML = `
          <span class="user-email">${this.email}</span>
          <span class="user-plan ${this.isPremium ? 'premium' : 'free'}">
            ${this.isPremium ? 'Premium' : 'Free'}
          </span>
        `;
      } else {
        userStatus.innerHTML = '<a href="/login">登录</a>';
      }
    }

    // 根据用户类型显示/隐藏广告
    const adElements = document.querySelectorAll('.ad-container');
    adElements.forEach(ad => {
      ad.style.display = this.isPremium ? 'none' : 'block';
    });

    // 根据用户类型显示/隐藏功能限制提示
    const limitMessages = document.querySelectorAll('.limit-message');
    limitMessages.forEach(msg => {
      msg.style.display = this.isPremium ? 'none' : 'block';
    });
  },

  // 检查是否可以处理文件
  canProcessFile(fileSize) {
    if (this.isPremium) {
      return { allowed: true, maxSize: 100 * 1024 * 1024 }; // 100MB
    }
    return { allowed: true, maxSize: 10 * 1024 * 1024 }; // 10MB
  },

  // 检查每日处理次数
  async canProcessToday() {
    if (this.isPremium) {
      return { allowed: true, remaining: Infinity };
    }

    // 免费用户每天3次
    const today = new Date().toDateString();
    const processCount = parseInt(localStorage.getItem(`processCount_${today}`) || '0');

    if (processCount >= 3) {
      return { allowed: false, remaining: 0 };
    }

    return { allowed: true, remaining: 3 - processCount };
  },

  // 增加处理次数
  incrementProcessCount() {
    if (this.isPremium) return;

    const today = new Date().toDateString();
    const processCount = parseInt(localStorage.getItem(`processCount_${today}`) || '0');
    localStorage.setItem(`processCount_${today}`, (processCount + 1).toString());
  }
};

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
  // 添加动画样式
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideIn {
      from {
        transform: translateX(100%);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }
  `;
  document.head.appendChild(style);

  // 初始化用户状态
  userManager.init();
});

// 导出工具
window.utils = utils;
window.FileUploader = FileUploader;
window.userManager = userManager;
