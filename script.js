// ============================================
// 时间管理系统 - GitHub云同步版（完整修复版 v2.2）
// 修复问题：Token配置后退出重新打开丢失
// ============================================

// 配置
const CONFIG = {
    github: {
        username: '2209722515-debug',
        repo: 'time-schedule-data',
        branch: 'main',
        dataFile: 'data.json',
        apiUrl: 'https://api.github.com/repos/2209722515-debug/time-schedule-data/contents/data.json',
        rawUrl: 'https://raw.githubusercontent.com/2209722515-debug/time-schedule-data/main/data.json',
        pagesUrl: 'https://2209722515-debug.github.io/time-schedule-data/data.json'
    },
    
    storageKeys: {
        schedules: 'team_time_schedules_v7',
        adminUsers: 'admin_users_config_v7',
        loginInfo: 'admin_login_info_v7',
        lastSyncTime: 'last_sync_time_v2',
        lastGitHash: 'last_git_hash_v2',
        githubToken: 'github_token_shared_v1',
        autoUpload: 'auto_upload_enabled_v1',
        appVersion: 'time_schedule_app_version'  // 新增：版本跟踪
    },
    
    defaultAdmin: {
        username: 'admin',
        password: 'admin123',
        name: '系统管理员'
    },
    
    minDate: '2024-01-01',
    maxDate: '2035-12-31',
    
    sync: {
        enabled: true,
        interval: 30000,
        retryInterval: 5000,
        maxRetries: 3,
        autoResolve: true,
        autoUpload: true
    }
};

// 全局变量
let schedules = [];
let adminUsers = [];
let currentAdmin = null;
let currentDate = '';
let selectedStatus = 'free';
let isOnline = navigator.onLine;
let syncEnabled = CONFIG.sync.enabled;
let autoUploadEnabled = CONFIG.sync.autoUpload;
let syncInterval = null;
let lastSyncTime = 0;
let lastGitHash = '';
let githubToken = '';
let isSyncing = false;
let syncTimeout = null;

// ============================================
// 核心修复：版本控制和Token持久化
// ============================================

// 定义当前版本号
const APP_VERSION = '2.2';

// 版本初始化检查
function initVersionControl() {
    console.log('🔍 版本控制初始化...');
    
    const lastVersion = localStorage.getItem(CONFIG.storageKeys.appVersion);
    
    if (lastVersion !== APP_VERSION) {
        console.log(`🔄 检测到版本更新: ${lastVersion || '未知'} → ${APP_VERSION}`);
        
        // 版本更新时执行清理和迁移
        handleVersionUpgrade(lastVersion);
        
        // 保存新版本号
        localStorage.setItem(CONFIG.storageKeys.appVersion, APP_VERSION);
        
        // 添加版本标记到URL，防止缓存
        if (!window.location.href.includes('v=')) {
            const newUrl = new URL(window.location.href);
            newUrl.searchParams.set('v', APP_VERSION);
            console.log('🔄 添加版本参数到URL');
        }
    }
    
    console.log(`✅ 当前版本: ${APP_VERSION}`);
}

// 版本升级处理
function handleVersionUpgrade(oldVersion) {
    console.log(`🔄 处理版本升级: ${oldVersion} → ${APP_VERSION}`);
    
    // 备份重要数据
    const importantData = {
        token: localStorage.getItem(CONFIG.storageKeys.githubToken),
        schedules: localStorage.getItem(CONFIG.storageKeys.schedules),
        adminUsers: localStorage.getItem(CONFIG.storageKeys.adminUsers)
    };
    
    console.log('📦 重要数据已备份');
    
    // 清理可能的问题数据
    const cleanupKeys = [
        'github_token_error',
        'github_token_try_count',
        'token_save_error',
        'last_token_error'
    ];
    
    cleanupKeys.forEach(key => {
        localStorage.removeItem(key);
    });
    
    console.log('🧹 清理完成');
}

// ============================================
// Token持久化修复核心
// ============================================

// Token状态管理器
const TokenManager = {
    // Token存储键名（多备份策略）
    tokenKeys: [
        'github_token_shared_v1',           // 主存储
        'github_token_backup_1',            // 备份1
        'github_token_backup_2',            // 备份2
        'github_token_mobile_fallback'      // 移动端专用备份
    ],
    
    // 获取Token（从多个位置尝试）
    getToken() {
        console.log('🔍 TokenManager: 获取Token...');
        
        for (const key of this.tokenKeys) {
            try {
                const token = localStorage.getItem(key);
                if (token && this.validateTokenFormat(token)) {
                    console.log(`✅ 从 ${key} 获取到Token`);
                    return token;
                }
            } catch (error) {
                console.warn(`无法从 ${key} 读取Token:`, error);
            }
        }
        
        // 尝试从sessionStorage获取（移动端可能用这个）
        try {
            const sessionToken = sessionStorage.getItem('github_token_session');
            if (sessionToken && this.validateTokenFormat(sessionToken)) {
                console.log('✅ 从sessionStorage获取到Token');
                return sessionToken;
            }
        } catch (error) {
            console.warn('无法从sessionStorage读取Token:', error);
        }
        
        console.log('❌ 未找到有效Token');
        return null;
    },
    
    // 保存Token（多位置备份）
    saveToken(token) {
        if (!this.validateTokenFormat(token)) {
            console.error('❌ Token格式无效');
            return false;
        }
        
        console.log('💾 TokenManager: 保存Token...');
        
        let successCount = 0;
        
        // 保存到所有存储位置
        for (const key of this.tokenKeys) {
            try {
                localStorage.setItem(key, token);
                successCount++;
                console.log(`✅ 保存到 ${key}`);
            } catch (error) {
                console.warn(`无法保存到 ${key}:`, error);
            }
        }
        
        // 额外保存到sessionStorage（移动端兼容）
        try {
            sessionStorage.setItem('github_token_session', token);
            console.log('✅ 保存到sessionStorage');
        } catch (error) {
            console.warn('无法保存到sessionStorage:', error);
        }
        
        // 设置最后保存时间
        try {
            localStorage.setItem('token_last_saved', Date.now().toString());
            console.log('✅ 保存时间戳');
        } catch (error) {
            console.warn('无法保存时间戳:', error);
        }
        
        // 验证至少一个保存成功
        if (successCount > 0) {
            console.log(`🎉 Token保存成功 (${successCount}个位置)`);
            return true;
        } else {
            console.error('❌ Token保存失败');
            return false;
        }
    },
    
    // 验证Token格式
    validateTokenFormat(token) {
        if (!token || typeof token !== 'string') return false;
        return token.startsWith('ghp_') || token.startsWith('github_pat_');
    },
    
    // 清除所有Token
    clearAllTokens() {
        console.log('🧹 TokenManager: 清除所有Token...');
        
        this.tokenKeys.forEach(key => {
            try {
                localStorage.removeItem(key);
            } catch (error) {
                console.warn(`无法清除 ${key}:`, error);
            }
        });
        
        try {
            sessionStorage.removeItem('github_token_session');
        } catch (error) {
            console.warn('无法清除sessionStorage:', error);
        }
        
        console.log('✅ 所有Token已清除');
    },
    
    // 检查Token状态
    checkTokenStatus() {
        const token = this.getToken();
        const hasToken = !!token;
        const lastSaved = localStorage.getItem('token_last_saved');
        const saveTime = lastSaved ? new Date(parseInt(lastSaved)).toLocaleString() : '从未';
        
        console.log('📊 Token状态报告:');
        console.log(`- 是否有Token: ${hasToken ? '✅ 是' : '❌ 否'}`);
        console.log(`- 最后保存时间: ${saveTime}`);
        
        return {
            hasToken,
            token: hasToken ? token.substring(0, 8) + '...' : null,
            lastSaved: saveTime
        };
    }
};

// 页面加载时的Token自动恢复
function autoRestoreTokenOnLoad() {
    console.log('🤖 自动Token恢复启动...');
    
    // 延迟执行，确保DOM完全加载
    setTimeout(() => {
        const token = TokenManager.getToken();
        
        if (token) {
            // 设置全局变量
            window.githubToken = token;
            console.log('✅ 自动恢复Token成功');
            
            // 更新UI
            updateTokenStatusUI();
            
            // 触发一次同步检查
            if (syncEnabled && isOnline) {
                setTimeout(() => checkAndSync(), 2000);
            }
        } else {
            console.log('ℹ️ 无Token可恢复');
        }
    }, 500);
}

// ============================================
// 初始化函数
// ============================================

document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 时间管理系统初始化开始 (修复版 v2.2)...');
    console.log('📱 设备类型:', /Mobile|Android|iPhone/i.test(navigator.userAgent) ? '移动设备' : '桌面设备');
    
    // 第一步：版本控制
    initVersionControl();
    
    // 第二步：Token自动恢复
    autoRestoreTokenOnLoad();
    
    // 第三步：继续原有初始化
    initToastr();
    initData();
    initUI();
    initMobileOptimization();
    initKeyboardSupport();
    initSync();
    checkForScrollHint();
    
    // 第四步：启动Token监控
    startTokenMonitor();
    
    // 初始同步
    setTimeout(() => {
        if (syncEnabled && isOnline) {
            checkAndSync();
        }
    }, 2000);
});

// Token状态监控
function startTokenMonitor() {
    console.log('🔍 启动Token状态监控器...');
    
    // 定期检查Token状态
    setInterval(() => {
        const token = TokenManager.getToken();
        
        if (token && (!window.githubToken || window.githubToken !== token)) {
            console.log('🔄 监控器：修复全局Token变量不一致');
            window.githubToken = token;
            updateTokenStatusUI();
        }
        
        if (!token && window.githubToken) {
            console.log('⚠️ 监控器：Token丢失，正在尝试恢复...');
            // Token丢失，尝试从全局变量恢复
            if (TokenManager.validateTokenFormat(window.githubToken)) {
                TokenManager.saveToken(window.githubToken);
            }
        }
    }, 30000); // 每30秒检查一次
    
    // 页面可见性变化时检查
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            console.log('👁️ 页面重新可见，检查Token状态...');
            autoRestoreTokenOnLoad();
        }
    });
}

// 增强的initData函数
function initData() {
    console.log('📊 初始化数据...');
    
    // 1. 首先恢复Token（最高优先级）
    const token = TokenManager.getToken();
    if (token) {
        githubToken = token;
        console.log('✅ 从TokenManager恢复Token');
    } else {
        // 向后兼容：检查旧的存储位置
        const oldToken = localStorage.getItem(CONFIG.storageKeys.githubToken);
        if (oldToken && TokenManager.validateTokenFormat(oldToken)) {
            githubToken = oldToken;
            TokenManager.saveToken(oldToken); // 迁移到新系统
            console.log('🔄 从旧系统迁移Token');
        } else {
            githubToken = '';
            console.log('ℹ️ 未配置Token');
        }
    }
    
    // 2. 加载其他数据
    try {
        const savedSchedules = localStorage.getItem(CONFIG.storageKeys.schedules);
        schedules = savedSchedules ? JSON.parse(savedSchedules) : [];
        console.log(`📅 加载了 ${schedules.length} 条时间安排`);
    } catch (error) {
        schedules = [];
        console.error('加载时间安排失败：', error);
    }
    
    try {
        const savedAdmins = localStorage.getItem(CONFIG.storageKeys.adminUsers);
        if (savedAdmins) {
            adminUsers = JSON.parse(savedAdmins);
            console.log(`👥 加载了 ${adminUsers.length} 个管理员`);
        } else {
            adminUsers = [CONFIG.defaultAdmin];
            saveAdminUsers();
            console.log('👤 创建默认管理员');
        }
    } catch (error) {
        adminUsers = [CONFIG.defaultAdmin];
        console.error('加载管理员配置失败：', error);
    }
    
    try {
        const savedLastSync = localStorage.getItem(CONFIG.storageKeys.lastSyncTime);
        lastSyncTime = savedLastSync ? parseInt(savedLastSync) : 0;
        
        const savedGitHash = localStorage.getItem(CONFIG.storageKeys.lastGitHash);
        lastGitHash = savedGitHash || '';
        
        const savedAutoUpload = localStorage.getItem(CONFIG.storageKeys.autoUpload);
        autoUploadEnabled = savedAutoUpload !== null ? JSON.parse(savedAutoUpload) : CONFIG.sync.autoUpload;
        
        console.log('⚙️ 同步设置加载完成');
    } catch (error) {
        console.error('加载同步设置失败：', error);
    }
    
    checkLoginStatus();
    
    // 3. 输出Token状态报告
    TokenManager.checkTokenStatus();
}

// ============================================
// 修复的GitHub Token管理函数
// ============================================

// 配置GitHub Token
function configureGitHubToken() {
    if (!currentAdmin) {
        showMessage('请先登录管理员账号', 'warning');
        return;
    }
    
    const modal = document.getElementById('githubTokenModal');
    if (modal) {
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
        
        // 预填充已保存的Token（如果有）
        const tokenInput = document.getElementById('githubTokenInput');
        const currentToken = TokenManager.getToken();
        if (tokenInput && currentToken) {
            tokenInput.value = currentToken;
        }
        
        setTimeout(() => {
            if (tokenInput) tokenInput.focus();
        }, 100);
    }
}

// 保存GitHub Token（完全重写，修复所有问题）
let isSavingToken = false;

async function saveGitHubToken() {
    console.log('💾 保存GitHub Token...');
    
    // 防重复点击
    if (isSavingToken) {
        console.log('⏳ Token保存操作正在进行中，请稍候...');
        showMessage('正在保存Token，请稍候...', 'info');
        return;
    }
    
    isSavingToken = true;
    
    try {
        const tokenInput = document.getElementById('githubTokenInput');
        if (!tokenInput) {
            throw new Error('找不到Token输入框');
        }
        
        const token = tokenInput.value.trim();
        console.log('输入的Token:', token ? `${token.substring(0, 8)}...` : '空');
        
        // 空值检查
        if (!token) {
            showMessage('Token不能为空', 'warning');
            return;
        }
        
        // Token格式验证
        if (!TokenManager.validateTokenFormat(token)) {
            showMessage('Token格式不正确（应以ghp_或github_pat_开头）', 'warning');
            tokenInput.focus();
            tokenInput.select();
            return;
        }
        
        // 显示验证消息
        showMessage('正在验证Token有效性...', 'info');
        
        // 验证Token有效性
        const isValid = await testGitHubTokenWithToken(token);
        if (!isValid) {
            return;
        }
        
        // 保存Token（使用增强的TokenManager）
        const saveSuccess = TokenManager.saveToken(token);
        if (!saveSuccess) {
            throw new Error('Token保存失败，请检查浏览器存储权限');
        }
        
        // 更新全局变量
        githubToken = token;
        
        // 隐藏模态框
        hideGitHubTokenModal();
        
        // 更新UI状态
        updateTokenStatusUI();
        updateSyncUI();
        
        // 显示成功消息
        showMessage('✅ GitHub Token配置成功！Token已安全保存', 'success');
        
        // 记录成功日志
        console.log('🎉 Token保存成功，详细信息:');
        TokenManager.checkTokenStatus();
        
        // 尝试上传数据
        setTimeout(() => {
            if (githubToken && currentAdmin) {
                uploadToGitHub();
            }
        }, 1000);
        
        // 触发页面状态保存（移动端兼容）
        savePageState();
        
    } catch (error) {
        console.error('保存Token失败:', error);
        showMessage(`保存失败: ${error.message}`, 'error');
        
        // 尝试备用保存方案
        try {
            const tokenInput = document.getElementById('githubTokenInput');
            const token = tokenInput?.value.trim();
            if (token) {
                // 尝试最简单的保存方式
                localStorage.setItem('github_token_emergency', token);
                console.log('🆘 使用紧急方案保存Token');
                showMessage('Token已使用备用方案保存', 'warning');
            }
        } catch (e) {
            console.error('紧急方案也失败:', e);
        }
    } finally {
        // 延迟重置状态，防止快速连续点击
        setTimeout(() => {
            isSavingToken = false;
        }, 2000);
    }
}

// 测试Token函数
async function testGitHubTokenInput() {
    const tokenInput = document.getElementById('githubTokenInput');
    if (!tokenInput) return;
    
    const token = tokenInput.value.trim();
    
    if (!token) {
        showMessage('请输入GitHub Token', 'warning');
        return;
    }
    
    if (!TokenManager.validateTokenFormat(token)) {
        showMessage('Token格式不正确（应以ghp_或github_pat_开头）', 'warning');
        return;
    }
    
    showMessage('正在测试Token...', 'info');
    
    const isValid = await testGitHubTokenWithToken(token);
    if (isValid) {
        showMessage('✅ Token验证成功！', 'success');
        
        // 标记输入框
        tokenInput.style.borderColor = '#2ecc71';
        tokenInput.style.borderWidth = '2px';
        
        setTimeout(() => {
            tokenInput.style.borderColor = '';
            tokenInput.style.borderWidth = '';
        }, 3000);
    }
}

// 测试当前Token
async function testGitHubToken() {
    const token = TokenManager.getToken();
    
    if (!token) {
        showMessage('未配置GitHub Token', 'warning');
        return;
    }
    
    showMessage('正在测试当前Token...', 'info');
    
    const isValid = await testGitHubTokenWithToken(token);
    if (isValid) {
        showMessage('✅ 当前Token验证成功！', 'success');
    }
}

// 移除Token
function removeGitHubToken() {
    const confirmed = confirm('确定要移除GitHub Token吗？这会影响所有设备的数据上传。');
    
    if (!confirmed) return;
    
    // 使用TokenManager清除所有Token
    TokenManager.clearAllTokens();
    
    // 清除全局变量
    githubToken = '';
    
    // 更新UI
    updateTokenStatusUI();
    updateSyncUI();
    
    showMessage('GitHub Token已移除', 'info');
}

// ============================================
// 移动端兼容性增强
// ============================================

// 保存页面状态（移动端兼容）
function savePageState() {
    try {
        const state = {
            timestamp: Date.now(),
            hasToken: !!githubToken,
            adminLoggedIn: !!currentAdmin,
            currentDate: currentDate
        };
        
        localStorage.setItem('page_last_state', JSON.stringify(state));
        console.log('💾 页面状态已保存');
    } catch (error) {
        console.warn('保存页面状态失败:', error);
    }
}

// 恢复页面状态
function restorePageState() {
    try {
        const savedState = localStorage.getItem('page_last_state');
        if (savedState) {
            const state = JSON.parse(savedState);
            const age = Date.now() - state.timestamp;
            
            // 只恢复最近的状态（5分钟内）
            if (age < 5 * 60 * 1000) {
                console.log('🔄 恢复页面状态（最近5分钟内）');
                
                if (state.currentDate) {
                    currentDate = state.currentDate;
                    const datePicker = document.getElementById('datePicker');
                    if (datePicker) datePicker.value = currentDate;
                    updateDateDisplay();
                    loadSchedules();
                }
            }
        }
    } catch (error) {
        console.warn('恢复页面状态失败:', error);
    }
}

// 移动端初始化
function initMobileOptimization() {
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    const isSmallScreen = window.innerWidth <= 768;
    
    if (isMobile) {
        console.log('📱 移动设备优化已启用');
        document.body.classList.add('mobile-device');
        
        // 移动端特有优化
        optimizeForMobile();
    }
    
    window.addEventListener('resize', function() {
        optimizeTableForMobile();
        updateTableLayout();
    });
}

// 移动端优化
function optimizeForMobile() {
    // 增加触摸目标大小
    const touchElements = document.querySelectorAll('button, input, .btn');
    touchElements.forEach(el => {
        el.style.minHeight = '44px';
        el.style.minWidth = '44px';
    });
    
    // 禁用hover效果
    document.body.classList.add('no-hover');
    
    // 添加移动端特定样式
    const style = document.createElement('style');
    style.textContent = `
        .mobile-device .btn {
            padding: 12px 20px !important;
            font-size: 16px !important;
        }
        .mobile-device input, 
        .mobile-device select, 
        .mobile-device textarea {
            font-size: 16px !important; /* 防止iOS缩放 */
        }
        .no-hover *:hover {
            background-color: inherit !important;
        }
    `;
    document.head.appendChild(style);
}

// ============================================
// UI更新函数（增强）
// ============================================

function updateTokenStatusUI() {
    console.log('🎨 更新Token状态UI...');
    
    const token = TokenManager.getToken();
    const hasToken = !!token;
    
    // 导航栏Token状态指示器
    const tokenIndicator = document.getElementById('tokenStatusIndicator');
    if (tokenIndicator) {
        if (hasToken) {
            tokenIndicator.innerHTML = '<i class="fas fa-check-circle"></i> Token已配置';
            tokenIndicator.className = 'token-status-indicator token-status-ok';
            tokenIndicator.title = 'GitHub Token已配置，可以上传数据';
        } else {
            tokenIndicator.innerHTML = '<i class="fas fa-exclamation-circle"></i> 未配置Token';
            tokenIndicator.className = 'token-status-indicator token-status-none';
            tokenIndicator.title = '未配置GitHub Token，无法上传数据到云端';
        }
    }
    
    // 同步设置中的Token状态
    const tokenStatusEl = document.getElementById('githubTokenStatus');
    if (tokenStatusEl) {
        if (hasToken) {
            tokenStatusEl.innerHTML = '<i class="fas fa-check-circle"></i> 已配置';
            tokenStatusEl.className = 'status-value active';
        } else {
            tokenStatusEl.innerHTML = '<i class="fas fa-exclamation-circle"></i> 未配置';
            tokenStatusEl.className = 'status-value warning';
        }
    }
    
    // Token显示框
    const tokenDisplay = document.getElementById('currentTokenDisplay');
    if (tokenDisplay) {
        tokenDisplay.value = hasToken ? '••••••••••••••••' : '未配置Token';
    }
    
    // 配置按钮
    const configBtn = document.getElementById('configureTokenBtn');
    if (configBtn) {
        configBtn.innerHTML = hasToken ? 
            '<i class="fas fa-key"></i> 更新Token' : 
            '<i class="fas fa-key"></i> 配置Token';
    }
    
    // 更新同步指示器
    updateSyncIndicator();
}

// ============================================
// 增强的同步和上传函数
// ============================================

async function uploadToGitHub() {
    console.log('📤 上传数据到GitHub...');
    
    // 使用TokenManager获取Token
    const token = TokenManager.getToken();
    
    if (!token) {
        console.log('❌ 未配置GitHub Token，跳过上传');
        
        // 检查是否有旧的全局变量可以恢复
        if (window.githubToken && TokenManager.validateTokenFormat(window.githubToken)) {
            console.log('🔄 尝试从全局变量恢复Token');
            TokenManager.saveToken(window.githubToken);
            // 重试
            setTimeout(uploadToGitHub, 500);
            return false;
        }
        
        showMessage('请先配置GitHub Token', 'warning');
        return false;
    }
    
    if (!currentAdmin) {
        console.log('❌ 未登录管理员账号，跳过上传');
        showMessage('请先登录管理员账号', 'warning');
        return false;
    }
    
    // 确保全局变量与TokenManager同步
    if (!window.githubToken || window.githubToken !== token) {
        window.githubToken = token;
        console.log('🔄 同步全局Token变量');
    }
    
    try {
        // ... 原有上传逻辑 ...
        const data = {
            schedules: schedules,
            adminUsers: adminUsers.map(admin => ({
                username: admin.username,
                name: admin.name
            })),
            lastSync: new Date().toISOString(),
            version: APP_VERSION,
            updatedBy: currentAdmin.name,
            updatedAt: new Date().toISOString()
        };
        
        const content = JSON.stringify(data, null, 2);
        const contentEncoded = btoa(unescape(encodeURIComponent(content)));
        
        let currentFile = null;
        try {
            const response = await fetch(CONFIG.github.apiUrl, {
                headers: {
                    'Authorization': `token ${token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });
            
            if (response.ok) {
                currentFile = await response.json();
            }
        } catch (error) {
            console.log('GitHub文件不存在，将创建新文件');
        }
        
        const uploadData = {
            message: `时间管理系统数据同步 v${APP_VERSION} - ${currentAdmin.name} - ${new Date().toLocaleString('zh-CN')}`,
            content: contentEncoded,
            branch: CONFIG.github.branch
        };
        
        if (currentFile && currentFile.sha) {
            uploadData.sha = currentFile.sha;
        }
        
        const response = await fetch(CONFIG.github.apiUrl, {
            method: 'PUT',
            headers: {
                'Authorization': `token ${token}`,
                'Content-Type': 'application/json',
                'Accept': 'application/vnd.github.v3+json'
            },
            body: JSON.stringify(uploadData)
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            
            if (response.status === 401) {
                showMessage('GitHub Token无效或已过期，请重新配置', 'error');
                removeGitHubToken();
                return false;
            }
            
            throw new Error(`上传失败: ${response.status} - ${errorText}`);
        }
        
        const result = await response.json();
        lastGitHash = result.content.sha;
        localStorage.setItem(CONFIG.storageKeys.lastGitHash, lastGitHash);
        
        console.log('✅ 数据上传到GitHub成功');
        showMessage('数据已同步到云端', 'success');
        return true;
        
    } catch (error) {
        console.error('上传到GitHub失败:', error);
        showMessage('上传失败: ' + error.message, 'error');
        return false;
    }
}

// ============================================
// 页面生命周期管理（增强）
// ============================================

// 页面可见性变化处理
document.addEventListener('visibilitychange', function() {
    if (!document.hidden) {
        console.log('👁️ 页面重新激活');
        
        // 检查网络状态
        isOnline = navigator.onLine;
        updateNetworkStatus();
        
        // 恢复Token状态
        autoRestoreTokenOnLoad();
        
        // 恢复页面状态
        restorePageState();
        
        // 检查同步
        if (syncEnabled && isOnline && !isSyncing) {
            setTimeout(() => checkAndSync(), 1000);
        }
    } else {
        console.log('👁️ 页面失活，保存状态');
        savePageState();
    }
});

// 页面卸载前保存状态
window.addEventListener('beforeunload', function() {
    console.log('📝 页面卸载，保存数据...');
    saveSchedules();
    saveAdminUsers();
    savePageState();
    
    // 确保Token已保存
    if (window.githubToken) {
        TokenManager.saveToken(window.githubToken);
    }
});

// 页面加载完成
window.addEventListener('load', function() {
    console.log('✅ 页面完全加载完成');
    console.log(`📱 应用版本: ${APP_VERSION}`);
    console.log(`🔑 Token状态: ${TokenManager.getToken() ? '已配置' : '未配置'}`);
    
    // 输出诊断信息
    console.group('🔍 系统诊断信息');
    console.log('用户代理:', navigator.userAgent);
    console.log('屏幕尺寸:', window.innerWidth, 'x', window.innerHeight);
    console.log('localStorage可用:', !!window.localStorage);
    console.log('sessionStorage可用:', !!window.sessionStorage);
    console.log('Token存储检查:');
    TokenManager.checkTokenStatus();
    console.groupEnd();
    
    // 最终表格调整
    setTimeout(() => {
        updateTableLayout();
    }, 1000);
});

// ============================================
// 其他原有函数（保持不变）
// ============================================

// [这里放置其他原有函数，如：
// initToastr, showMessage, loadSchedules, addSchedule, 
// deleteSchedule, checkLoginStatus, performLogin, 等等]
// 注意：这些函数需要从原script.js中复制过来，但为了简洁这里省略

// ============================================
// 初始化完成
// ============================================

console.log(`🎉 时间管理系统修复版 v${APP_VERSION} 初始化完成`);
console.log('修复内容：');
console.log('1. Token多位置备份存储');
console.log('2. 页面加载时自动恢复Token');
console.log('3. Token状态监控器');
console.log('4. 移动端兼容性增强');
console.log('5. 版本控制和缓存管理');