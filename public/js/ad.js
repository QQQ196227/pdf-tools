// 广告管理模块
const AdManager = {
  // 广告配置
  config: {
    googleAdSense: {
      clientId: 'ca-pub-XXXXXXXXXXXXXXXX', // 替换为您的AdSense客户端ID
      slots: {
        banner: 'XXXXXXXXXX', // 横幅广告位
        sidebar: 'XXXXXXXXXX', // 侧边栏广告位
        inline: 'XXXXXXXXXX', // 内联广告位
      }
    },
    // 免费用户每天处理文件限制
    freeUserLimits: {
      dailyFiles: 3,
      maxFileSize: 10 * 1024 * 1024, // 10MB
    }
  },

  // 用户状态
  userStatus: {
    isPremium: false,
    filesProcessedToday: 0,
    lastResetDate: null,
  },

  // 初始化广告
  init() {
    this.loadGoogleAdSense();
    this.checkUserStatus();
    this.displayAds();
  },

  // 加载Google AdSense
  loadGoogleAdSense() {
    // 检查是否已经加载
    if (window.adsbygoogle) {
      return;
    }

    // 加载AdSense脚本
    const script = document.createElement('script');
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${this.config.googleAdSense.clientId}`;
    document.head.appendChild(script);

    // 初始化adsbygoogle数组
    window.adsbygoogle = window.adsbygoogle || [];
  },

  // 检查用户状态
  checkUserStatus() {
    // 从localStorage获取用户状态
    const savedStatus = localStorage.getItem('pdfToolsUserStatus');
    if (savedStatus) {
      const parsed = JSON.parse(savedStatus);
      this.userStatus = { ...this.userStatus, ...parsed };
    }

    // 检查是否需要重置每日计数
    const today = new Date().toDateString();
    if (this.userStatus.lastResetDate !== today) {
      this.userStatus.filesProcessedToday = 0;
      this.userStatus.lastResetDate = today;
      this.saveUserStatus();
    }
  },

  // 保存用户状态
  saveUserStatus() {
    localStorage.setItem('pdfToolsUserStatus', JSON.stringify(this.userStatus));
  },

  // 显示广告
  displayAds() {
    // 如果是付费用户，不显示广告
    if (this.userStatus.isPremium) {
      this.hideAllAds();
      return;
    }

    // 显示横幅广告
    this.showBannerAd();

    // 显示侧边栏广告
    this.showSidebarAd();

    // 显示内联广告
    this.showInlineAd();
  },

  // 隐藏所有广告
  hideAllAds() {
    document.querySelectorAll('.ad-container').forEach(ad => {
      ad.style.display = 'none';
    });
  },

  // 显示横幅广告
  showBannerAd() {
    const bannerAd = document.getElementById('bannerAd');
    if (bannerAd) {
      bannerAd.innerHTML = `
        <ins class="adsbygoogle"
             style="display:block"
             data-ad-client="${this.config.googleAdSense.clientId}"
             data-ad-slot="${this.config.googleAdSense.slots.banner}"
             data-ad-format="auto"
             data-full-width-responsive="true"></ins>
      `;
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    }
  },

  // 显示侧边栏广告
  showSidebarAd() {
    const sidebarAd = document.getElementById('sidebarAd');
    if (sidebarAd) {
      sidebarAd.innerHTML = `
        <ins class="adsbygoogle"
             style="display:block"
             data-ad-client="${this.config.googleAdSense.clientId}"
             data-ad-slot="${this.config.googleAdSense.slots.sidebar}"
             data-ad-format="auto"></ins>
      `;
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    }
  },

  // 显示内联广告
  showInlineAd() {
    const inlineAd = document.getElementById('inlineAd');
    if (inlineAd) {
      inlineAd.innerHTML = `
        <ins class="adsbygoogle"
             style="display:block; text-align:center;"
             data-ad-layout="in-article"
             data-ad-format="fluid"
             data-ad-client="${this.config.googleAdSense.clientId}"
             data-ad-slot="${this.config.googleAdSense.slots.inline}"></ins>
      `;
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    }
  },

  // 检查是否可以处理文件
  canProcessFile(fileSize) {
    // 付费用户无限制
    if (this.userStatus.isPremium) {
      return { allowed: true };
    }

    // 检查文件大小
    if (fileSize > this.config.freeUserLimits.maxFileSize) {
      return {
        allowed: false,
        reason: '文件大小超过免费版限制（10MB）',
        upgradeRequired: true
      };
    }

    // 检查每日处理次数
    if (this.userStatus.filesProcessedToday >= this.config.freeUserLimits.dailyFiles) {
      return {
        allowed: false,
        reason: '今日免费处理次数已用完',
        upgradeRequired: true
      };
    }

    return { allowed: true };
  },

  // 记录文件处理
  recordFileProcessing() {
    this.userStatus.filesProcessedToday++;
    this.saveUserStatus();
  },

  // 升级到付费版
  upgradeToPremium() {
    // 这里应该跳转到支付页面
    window.location.href = '/pricing';
  },

  // 显示升级提示
  showUpgradePrompt(reason) {
    const modal = document.createElement('div');
    modal.className = 'upgrade-modal';
    modal.innerHTML = `
      <div class="upgrade-content">
        <h3>升级到付费版</h3>
        <p>${reason}</p>
        <ul>
          <li>✅ 无限次处理文件</li>
          <li>✅ 文件大小限制提升到100MB</li>
          <li>✅ 无广告体验</li>
          <li>✅ 批量处理功能</li>
          <li>✅ AI高级功能</li>
        </ul>
        <div class="upgrade-price">
          <span class="price">$4.99/月</span>
          <span class="annual">或 $29.99/年（节省40%）</span>
        </div>
        <div class="upgrade-buttons">
          <button onclick="AdManager.upgradeToPremium()" class="btn btn-primary">
            立即升级
          </button>
          <button onclick="this.closest('.upgrade-modal').remove()" class="btn btn-secondary">
            稍后再说
          </button>
        </div>
      </div>
    `;

    // 添加样式
    const style = document.createElement('style');
    style.textContent = `
      .upgrade-modal {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
      }
      .upgrade-content {
        background: white;
        border-radius: 16px;
        padding: 32px;
        max-width: 400px;
        width: 90%;
        text-align: center;
      }
      .upgrade-content h3 {
        font-size: 1.5rem;
        margin-bottom: 16px;
        color: #1e293b;
      }
      .upgrade-content p {
        color: #64748b;
        margin-bottom: 20px;
      }
      .upgrade-content ul {
        text-align: left;
        margin-bottom: 24px;
        padding-left: 20px;
      }
      .upgrade-content li {
        margin-bottom: 8px;
        color: #1e293b;
      }
      .upgrade-price {
        margin-bottom: 24px;
      }
      .price {
        font-size: 2rem;
        font-weight: 800;
        color: #4f46e5;
      }
      .annual {
        display: block;
        color: #64748b;
        font-size: 0.9rem;
        margin-top: 4px;
      }
      .upgrade-buttons {
        display: flex;
        gap: 12px;
        justify-content: center;
      }
      .btn-secondary {
        background: #e2e8f0;
        color: #475569;
      }
    `;
    document.head.appendChild(style);
    document.body.appendChild(modal);
  }
};

// 初始化广告管理器
document.addEventListener('DOMContentLoaded', () => {
  AdManager.init();
});

// 导出广告管理器
window.AdManager = AdManager;
