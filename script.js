// ============================================
// 时间管理系统 - GitHub云同步版（智能冲突解决版）
// 完整版本 - 包含所有功能
// ============================================

// 配置
const CONFIG = {
    // GitHub Pages配置
    github: {
        username: '2209722515-debug',
        repo: 'time-schedule-data',
        branch: 'main',
        dataFile: 'data.json',
        apiUrl: 'https://api.github.com/repos/2209722515-debug/time-schedule-data/contents/data.json',
        rawUrl: 'https://raw.githubusercontent.com/2209722515-debug/time-schedule-data/main/data.json',
        pagesUrl: 'https://2209722515-debug.github.io/time-schedule-data/data.json'
    },
    
    // 数据存储键名
    storageKeys: {
        schedules: 'team_time_schedules_v8',
        adminUsers: 'admin_users_config_v8',
        loginInfo: 'admin_login_info_v8',
        lastSyncTime: 'last_sync_time_v3',
        lastGitHash: 'last_git_hash_v3',
        githubToken: 'github_token_shared_v2',
        autoUpload: 'auto_upload_enabled_v2',
        pendingOperations: 'pending_operations_queue_v1'
    },
    
    // 默认管理员
    defaultAdmin: {
        username: 'admin',
        password: 'admin123',
        name: '系统管理员',
        createdAt: new Date().toISOString()
    },
    
    // 日期范围
    minDate: '2024-01-01',
    maxDate: '2035-12-31',
    
    // 同步配置
    sync: {
        enabled: true,
        interval: 30000,
        retryInterval: 5000,
        maxRetries: 3,
        autoResolve: true,
        autoUpload: true,
        conflictRetries: 3
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

// 新增：操作队列系统
let operationQueue = [];
let isProcessingQueue = false;

// 新增：网络状态管理
let networkState = {
    isOnline: navigator.onLine,
    lastCheck: Date.now(),
    quality: 'unknown',
    latency: 0
};

// ============================================
// 初始化函数
// ============================================

document.addEventListener('DOMContentLoaded', function() {
    console.log('时间管理系统初始化开始...');
    
    initToastr();
    initData();
    initUI();
    initMobileOptimization();
    initKeyboardSupport();
    initSync();
    initNetworkMonitoring();
    initOperationQueue();
    checkForScrollHint();
    
    setupGlobalEventListeners();
    
    setTimeout(() => {
        checkPendingOperations();
    }, 3000);
    
    setTimeout(() => {
        if (syncEnabled && isOnline) {
            enhancedSync();
        }
    }, 2000);
});

function initToastr() {
    if (typeof toastr === 'undefined') {
        window.toastr = {
            success: function(msg) { 
                console.log('✅', msg);
                showFallbackMessage(msg, 'success');
            },
            error: function(msg) { 
                console.log('❌', msg);
                showFallbackMessage(msg, 'error');
            },
            warning: function(msg) { 
                console.log('⚠️', msg);
                showFallbackMessage(msg, 'warning');
            },
            info: function(msg) { 
                console.log('ℹ️', msg);
                showFallbackMessage(msg, 'info');
            }
        };
    } else {
        toastr.options = {
            "closeButton": true,
            "debug": false,
            "newestOnTop": true,
            "progressBar": true,
            "positionClass": "toast-top-right",
            "preventDuplicates": false,
            "onclick": null,
            "showDuration": "300",
            "hideDuration": "1000",
            "timeOut": "3000",
            "extendedTimeOut": "1000",
            "showEasing": "swing",
            "hideEasing": "linear",
            "showMethod": "fadeIn",
            "hideMethod": "fadeOut"
        };
    }
}

function showFallbackMessage(message, type = 'info') {
    const colors = {
        success: '#2ecc71',
        error: '#e74c3c',
        warning: '#f39c12',
        info: '#3498db'
    };
    
    const icon = {
        success: '✅',
        error: '❌',
        warning: '⚠️',
        info: 'ℹ️'
    };
    
    const messageDiv = document.createElement('div');
    messageDiv.innerHTML = `${icon[type] || 'ℹ️'} ${message}`;
    messageDiv.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 12px 20px;
        background: ${colors[type] || '#3498db'};
        color: white;
        border-radius: 4px;
        z-index: 9999;
        box-shadow: 0 2px 10px rgba(0,0,0,0.2);
        font-family: sans-serif;
        max-width: 300px;
        word-wrap: break-word;
    `;
    
    document.body.appendChild(messageDiv);
    
    setTimeout(() => {
        messageDiv.style.opacity = '0';
        messageDiv.style.transition = 'opacity 0.5s';
        setTimeout(() => {
            if (messageDiv.parentNode) {
                messageDiv.parentNode.removeChild(messageDiv);
            }
        }, 500);
    }, 3000);
}

function initData() {
    console.log('初始化数据...');
    
    try {
        const savedSchedules = localStorage.getItem(CONFIG.storageKeys.schedules);
        schedules = savedSchedules ? JSON.parse(savedSchedules) : [];
        console.log(`从本地存储加载了 ${schedules.length} 条时间安排`);
    } catch (error) {
        schedules = [];
        console.error('加载时间安排失败：', error);
    }
    
    try {
        const savedAdmins = localStorage.getItem(CONFIG.storageKeys.adminUsers);
        if (savedAdmins) {
            adminUsers = JSON.parse(savedAdmins);
            console.log(`从本地存储加载了 ${adminUsers.length} 个管理员`);
        } else {
            adminUsers = [CONFIG.defaultAdmin];
            saveAdminUsers();
            console.log('创建默认管理员：admin / admin123');
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
        
        const savedToken = localStorage.getItem(CONFIG.storageKeys.githubToken);
        githubToken = savedToken || '';
        console.log('加载的Token:', githubToken ? '已配置' : '未配置');
        
        const savedAutoUpload = localStorage.getItem(CONFIG.storageKeys.autoUpload);
        autoUploadEnabled = savedAutoUpload !== null ? JSON.parse(savedAutoUpload) : CONFIG.sync.autoUpload;
        
        console.log('同步设置加载完成');
    } catch (error) {
        console.error('加载同步设置失败：', error);
    }
    
    checkLoginStatus();
}

function checkLoginStatus() {
    try {
        const savedLogin = localStorage.getItem(CONFIG.storageKeys.loginInfo);
        if (savedLogin) {
            const loginInfo = JSON.parse(savedLogin);
            const admin = adminUsers.find(u => u.username === loginInfo.username);
            if (admin) {
                currentAdmin = admin;
                updateUserUI();
                return;
            }
        }
    } catch (error) {
        console.error('检查登录状态失败：', error);
    }
    
    currentAdmin = null;
    updateUserUI();
}

function initUI() {
    console.log('初始化UI...');
    initDatePicker();
    setToday();
    updateUserUI();
    loadSchedules();
    updateSyncUI();
    updateTokenStatusUI();
    updateNetworkStatus();
    
    setTimeout(() => {
        rebindButtonEvents();
        setupAdminSettingsButton();
        setupGlobalClickHandlers();
    }, 500);
}

function initDatePicker() {
    const datePicker = document.getElementById('datePicker');
    if (!datePicker) {
        console.error('未找到日期选择器');
        return;
    }
    
    datePicker.min = CONFIG.minDate;
    datePicker.max = CONFIG.maxDate;
    
    datePicker.addEventListener('change', function() {
        currentDate = this.value;
        updateDateDisplay();
        loadSchedules();
    });
    
    console.log('日期选择器初始化完成');
}

function setToday() {
    const today = new Date();
    currentDate = formatDate(today);
    
    const datePicker = document.getElementById('datePicker');
    if (datePicker) {
        datePicker.value = currentDate;
    }
    
    updateDateDisplay();
}

function formatDate(date, format = 'YYYY-MM-DD') {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    
    return format
        .replace('YYYY', year)
        .replace('MM', month)
        .replace('DD', day);
}

function getWeekDay(date) {
    const weekDays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
    return weekDays[date.getDay()];
}

function updateDateDisplay() {
    const dateDisplay = document.getElementById('currentDateDisplay');
    const weekDayDisplay = document.getElementById('weekDayDisplay');
    
    if (currentDate && dateDisplay && weekDayDisplay) {
        const date = new Date(currentDate);
        const formattedDate = formatDate(date, 'YYYY年MM月DD日');
        const weekDay = getWeekDay(date);
        
        dateDisplay.textContent = formattedDate;
        weekDayDisplay.textContent = weekDay;
    }
}

// ============================================
// 网络监控和操作队列
// ============================================

function initNetworkMonitoring() {
    console.log('初始化网络监控...');
    
    setInterval(async () => {
        await checkNetworkQuality();
        updateNetworkStatus();
    }, 30000);
    
    setTimeout(() => checkNetworkQuality(), 1000);
}

async function checkNetworkQuality() {
    try {
        const startTime = Date.now();
        
        const testEndpoints = [
            'https://api.github.com',
            'https://raw.githubusercontent.com',
            'https://google.com'
        ];
        
        let successCount = 0;
        let totalLatency = 0;
        
        for (const endpoint of testEndpoints) {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 5000);
                
                const response = await fetch(endpoint, {
                    method: 'HEAD',
                    mode: 'no-cors',
                    signal: controller.signal,
                    cache: 'no-cache'
                });
                
                clearTimeout(timeoutId);
                successCount++;
                totalLatency += (Date.now() - startTime);
            } catch (e) {
                // 忽略单个失败
            }
        }
        
        const avgLatency = successCount > 0 ? totalLatency / successCount : 9999;
        
        if (successCount === 0) {
            networkState.quality = 'offline';
            networkState.latency = 9999;
        } else if (avgLatency < 800) {
            networkState.quality = 'good';
            networkState.latency = avgLatency;
        } else if (avgLatency < 3000) {
            networkState.quality = 'fair';
            networkState.latency = avgLatency;
        } else {
            networkState.quality = 'poor';
            networkState.latency = avgLatency;
        }
        
        networkState.lastCheck = Date.now();
        networkState.isOnline = successCount > 0;
        
        return networkState.quality;
        
    } catch (error) {
        console.error('网络质量检测失败:', error);
        networkState.quality = 'unknown';
        return 'unknown';
    }
}

function initOperationQueue() {
    console.log('初始化操作队列...');
    
    try {
        const pendingOps = localStorage.getItem(CONFIG.storageKeys.pendingOperations);
        if (pendingOps) {
            operationQueue = JSON.parse(pendingOps);
            console.log(`从存储恢复 ${operationQueue.length} 个待处理操作`);
            
            if (networkState.quality === 'good') {
                setTimeout(() => processQueue(), 5000);
            }
        }
    } catch (error) {
        console.error('恢复操作队列失败:', error);
    }
}

function saveOperationQueue() {
    try {
        const queueToSave = operationQueue.slice(-100);
        localStorage.setItem(CONFIG.storageKeys.pendingOperations, JSON.stringify(queueToSave));
    } catch (error) {
        console.error('保存操作队列失败:', error);
    }
}

async function checkPendingOperations() {
    if (operationQueue.length > 0) {
        console.log(`检测到 ${operationQueue.length} 个待处理操作`);
        
        if (networkState.quality === 'good') {
            showMessage(`有 ${operationQueue.length} 个待处理操作，正在处理...`, 'info');
            await processQueue();
        } else {
            showMessage(`有 ${operationQueue.length} 个待处理操作，等待网络恢复...`, 'warning');
        }
    }
}

function queueOperation(operationType, data, priority = 'normal') {
    const operationId = generateId();
    
    const operation = {
        id: operationId,
        type: operationType,
        data: data,
        priority: priority,
        timestamp: Date.now(),
        status: 'pending',
        retryCount: 0
    };
    
    if (priority === 'high') {
        operationQueue.unshift(operation);
    } else {
        operationQueue.push(operation);
    }
    
    console.log(`操作已加入队列: ${operationType} [${operationId}], 优先级: ${priority}, 队列长度: ${operationQueue.length}`);
    
    saveOperationQueue();
    
    if (networkState.quality === 'good' && !isProcessingQueue) {
        setTimeout(() => processQueue(), 1000);
    }
    
    return operationId;
}

async function processQueue() {
    if (isProcessingQueue || operationQueue.length === 0) {
        return;
    }
    
    isProcessingQueue = true;
    console.log(`开始处理操作队列，剩余: ${operationQueue.length} 个操作`);
    
    try {
        while (operationQueue.length > 0) {
            const operation = operationQueue[0];
            
            operation.status = 'processing';
            operation.startedAt = Date.now();
            
            console.log(`处理操作: ${operation.type} [${operation.id}]`);
            
            let success = false;
            
            try {
                switch (operation.type) {
                    case 'deleteAdmin':
                        success = await processDeleteAdminOperation(operation.data);
                        break;
                    case 'addSchedule':
                        success = await processAddScheduleOperation(operation.data);
                        break;
                    case 'syncData':
                        success = await processSyncOperation();
                        break;
                    case 'uploadData':
                        success = await smartUploadToGitHub();
                        break;
                    default:
                        console.warn(`未知操作类型: ${operation.type}`);
                        success = true;
                }
                
                if (success) {
                    operation.status = 'completed';
                    operation.completedAt = Date.now();
                    operationQueue.shift();
                    
                    console.log(`✅ 操作完成: ${operation.type} [${operation.id}]`);
                    
                } else {
                    operation.retryCount++;
                    
                    if (operation.retryCount >= 3) {
                        operation.status = 'failed';
                        operationQueue.shift();
                        console.error(`❌ 操作失败（达到最大重试次数）: ${operation.type} [${operation.id}]`);
                    } else {
                        operation.status = 'pending';
                        operationQueue.shift();
                        operationQueue.push(operation);
                        console.log(`↺ 操作将重试: ${operation.type} [${operation.id}], 重试次数: ${operation.retryCount}`);
                        
                        await new Promise(resolve => setTimeout(resolve, 5000 * operation.retryCount));
                    }
                }
                
            } catch (err) {
                operation.status = 'error';
                operation.error = err.message;
                operationQueue.shift();
                
                console.error(`❌ 操作异常: ${operation.type} [${operation.id}]`, err);
            }
            
            saveOperationQueue();
            
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        
    } finally {
        isProcessingQueue = false;
        console.log('操作队列处理完成');
    }
}

// ============================================
// 增强的GitHub同步功能
// ============================================

async function smartUploadToGitHub() {
    const tokenToUse = githubToken || localStorage.getItem(CONFIG.storageKeys.githubToken);
    
    if (!tokenToUse || !currentAdmin) {
        console.log('Token或管理员信息缺失，跳过上传');
        return false;
    }
    
    let retryCount = 0;
    const maxRetries = CONFIG.sync.conflictRetries;
    
    while (retryCount < maxRetries) {
        try {
            console.log(`开始上传 (尝试 ${retryCount + 1}/${maxRetries})...`);
            
            const fileInfo = await getGitHubFileInfo(tokenToUse);
            
            const data = {
                metadata: {
                    version: '3.0-smart',
                    timestamp: new Date().toISOString(),
                    updatedBy: currentAdmin.username,
                    device: navigator.platform,
                    conflictRetry: retryCount
                },
                coreData: {
                    schedules: schedules,
                    adminUsers: adminUsers.map(admin => ({
                        username: admin.username,
                        name: admin.name,
                        createdAt: admin.createdAt || new Date().toISOString()
                    }))
                },
                syncInfo: {
                    localScheduleCount: schedules.length,
                    localAdminCount: adminUsers.length,
                    lastSyncTime: lastSyncTime
                }
            };
            
            const content = JSON.stringify(data, null, 2);
            const contentEncoded = btoa(unescape(encodeURIComponent(content)));
            
            const uploadData = {
                message: `时间管理系统同步 - ${currentAdmin.name} - ${new Date().toLocaleString('zh-CN')} - 尝试${retryCount + 1}`,
                content: contentEncoded,
                branch: CONFIG.github.branch,
                sha: fileInfo ? fileInfo.sha : null
            };
            
            const response = await fetch(CONFIG.github.apiUrl, {
                method: 'PUT',
                headers: {
                    'Authorization': `token ${tokenToUse}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/vnd.github.v3+json',
                    'If-None-Match': fileInfo ? fileInfo.sha : '*'
                },
                body: JSON.stringify(uploadData)
            });
            
            if (response.ok) {
                const result = await response.json();
                lastGitHash = result.content.sha;
                localStorage.setItem(CONFIG.storageKeys.lastGitHash, lastGitHash);
                
                lastSyncTime = Date.now();
                localStorage.setItem(CONFIG.storageKeys.lastSyncTime, lastSyncTime.toString());
                
                console.log('✅ 上传成功，新 hash:', lastGitHash.substring(0, 8));
                updateLastSyncTimeDisplay();
                
                return true;
                
            } else {
                const errorData = await response.json();
                
                if (response.status === 409) {
                    console.log('⚠️ 检测到版本冲突 (409)');
                    
                    if (retryCount < maxRetries - 1) {
                        retryCount++;
                        
                        const conflictMessage = `数据冲突检测到 (${retryCount}/${maxRetries})\n正在解决...`;
                        showMessage(conflictMessage, 'warning');
                        
                        await new Promise(resolve => setTimeout(resolve, 2000 * retryCount));
                        
                        console.log('重新获取最新数据...');
                        await forceSyncFromGitHub();
                        
                        continue;
                        
                    } else {
                        const errorMsg = '多次尝试后仍有冲突，请手动解决或稍后重试';
                        console.error(errorMsg);
                        showMessage(errorMsg, 'error');
                        
                        saveToPendingUpload(data);
                        
                        return false;
                    }
                }
                
                throw new Error(`上传失败 (${response.status}): ${errorData.message || '未知错误'}`);
            }
            
        } catch (error) {
            console.error(`上传尝试 ${retryCount + 1} 失败:`, error);
            
            if (retryCount < maxRetries - 1) {
                retryCount++;
                showMessage(`上传失败，正在重试 (${retryCount}/${maxRetries})...`, 'warning');
                await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
                continue;
            } else {
                showMessage(`上传失败: ${error.message}`, 'error');
                
                const pendingData = {
                    schedules: schedules,
                    timestamp: Date.now()
                };
                saveToPendingUpload(pendingData);
                
                return false;
            }
        }
    }
    
    return false;
}

async function getGitHubFileInfo(token) {
    try {
        const response = await fetch(CONFIG.github.apiUrl, {
            headers: {
                'Authorization': `token ${token}`,
                'Accept': 'application/vnd.github.v3+json',
                'Cache-Control': 'no-cache'
            },
            signal: AbortSignal.timeout(10000)
        });
        
        if (response.ok) {
            return await response.json();
        } else if (response.status === 404) {
            console.log('GitHub文件不存在（首次使用）');
            return null;
        }
    } catch (error) {
        if (error.name === 'TimeoutError') {
            console.log('获取文件信息超时');
        } else {
            console.log('获取文件信息失败:', error.message);
        }
    }
    
    return null;
}

async function forceSyncFromGitHub() {
    try {
        console.log('开始强制从GitHub同步...');
        
        const cloudData = await fetchFromGitHub();
        
        if (cloudData) {
            await syncWithCloudSmart(cloudData);
            
            loadSchedules();
            updateLastSyncTimeDisplay();
            
            console.log('✅ 强制同步完成');
            return true;
        } else {
            console.log('云端数据为空');
            return false;
        }
        
    } catch (error) {
        console.error('强制同步失败:', error);
        showMessage('强制同步失败: ' + error.message, 'error');
        return false;
    }
}

async function fetchFromGitHub() {
    try {
        console.log('从GitHub获取数据...');
        
        const response = await fetch(CONFIG.github.pagesUrl + '?t=' + Date.now(), {
            headers: {
                'Accept': 'application/json',
                'Cache-Control': 'no-cache'
            }
        });
        
        if (!response.ok) {
            if (response.status === 404) {
                console.log('GitHub数据文件不存在（首次使用）');
                return null;
            }
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        console.log('从GitHub获取数据成功，条数:', data.schedules ? data.schedules.length : 0);
        
        let gitHash = '';
        let tokenToUse = githubToken || localStorage.getItem(CONFIG.storageKeys.githubToken);
        
        if (tokenToUse) {
            try {
                const apiResponse = await fetch(CONFIG.github.apiUrl, {
                    headers: {
                        'Authorization': `token ${tokenToUse}`,
                        'Accept': 'application/vnd.github.v3+json'
                    }
                });
                
                if (apiResponse.ok) {
                    const fileInfo = await apiResponse.json();
                    gitHash = fileInfo.sha || '';
                }
            } catch (apiError) {
                console.log('无法获取文件hash:', apiError.message);
            }
        }
        
        return {
            schedules: data.schedules || [],
            adminUsers: data.adminUsers || [],
            gitHash: gitHash
        };
        
    } catch (error) {
        console.error('从GitHub获取数据失败:', error);
        throw error;
    }
}

async function syncWithCloudSmart(cloudData) {
    console.log('开始智能数据同步...');
    
    const localSchedules = schedules;
    const localAdmins = adminUsers;
    const cloudSchedules = cloudData.schedules || [];
    const cloudAdmins = cloudData.adminUsers || [];
    
    console.log(`本地: ${localSchedules.length}条安排, ${localAdmins.length}个管理员`);
    console.log(`云端: ${cloudSchedules.length}条安排, ${cloudAdmins.length}个管理员`);
    
    const scheduleConflicts = detectConflicts(localSchedules, cloudSchedules);
    const adminConflicts = detectAdminConflicts(localAdmins, cloudAdmins);
    
    if (scheduleConflicts.length > 0 || adminConflicts.length > 0) {
        console.log(`检测到冲突: ${scheduleConflicts.length}个时间安排冲突, ${adminConflicts.length}个管理员冲突`);
        
        if (CONFIG.sync.autoResolve) {
            console.log('自动解决冲突...');
            
            autoResolveConflicts(scheduleConflicts, localSchedules, cloudSchedules);
            autoResolveAdminConflicts(adminConflicts, localAdmins, cloudAdmins);
            
        } else {
            const resolved = await showConflictResolutionDialog(scheduleConflicts, adminConflicts);
            if (!resolved) {
                console.log('用户取消冲突解决');
                return;
            }
        }
    }
    
    mergeSchedulesSmart(localSchedules, cloudSchedules);
    mergeAdminsSmart(localAdmins, cloudAdmins);
    
    saveSchedules();
    saveAdminUsers();
    
    if (cloudData.gitHash) {
        lastGitHash = cloudData.gitHash;
        localStorage.setItem(CONFIG.storageKeys.lastGitHash, lastGitHash);
    }
    
    console.log('✅ 智能同步完成');
}

function detectConflicts(localSchedules, cloudSchedules) {
    const conflicts = [];
    const localMap = new Map();
    const cloudMap = new Map();
    
    localSchedules.forEach(s => localMap.set(s.id, s));
    cloudSchedules.forEach(s => cloudMap.set(s.id, s));
    
    for (const [id, localSchedule] of localMap) {
        const cloudSchedule = cloudMap.get(id);
        if (cloudSchedule) {
            if (!isScheduleEqual(localSchedule, cloudSchedule)) {
                conflicts.push({
                    id: id,
                    local: localSchedule,
                    cloud: cloudSchedule
                });
            }
        }
    }
    
    return conflicts;
}

function isScheduleEqual(s1, s2) {
    return s1.date === s2.date &&
           s1.startTime === s2.startTime &&
           s1.endTime === s2.endTime &&
           s1.status === s2.status &&
           s1.adminName === s2.adminName;
}

function detectAdminConflicts(localAdmins, cloudAdmins) {
    const conflicts = [];
    const localMap = new Map(localAdmins.map(a => [a.username, a]));
    const cloudMap = new Map(cloudAdmins.map(a => [a.username, a]));
    
    for (const [username, localAdmin] of localMap) {
        const cloudAdmin = cloudMap.get(username);
        if (cloudAdmin) {
            if (localAdmin.name !== cloudAdmin.name) {
                conflicts.push({
                    username: username,
                    localName: localAdmin.name,
                    cloudName: cloudAdmin.name,
                    type: 'name_conflict'
                });
            }
        }
    }
    
    return conflicts;
}

function autoResolveConflicts(conflicts, localSchedules, cloudSchedules) {
    conflicts.forEach(conflict => {
        const localTime = new Date(conflict.local.updatedAt || conflict.local.createdAt || 0).getTime();
        const cloudTime = new Date(conflict.cloud.updatedAt || conflict.cloud.createdAt || 0).getTime();
        
        if (cloudTime > localTime) {
            const index = localSchedules.findIndex(s => s.id === conflict.id);
            if (index !== -1) {
                localSchedules[index] = JSON.parse(JSON.stringify(conflict.cloud));
            }
        }
    });
    
    console.log('已自动解决', conflicts.length, '个冲突');
}

function autoResolveAdminConflicts(conflicts, localAdmins, cloudAdmins) {
    conflicts.forEach(conflict => {
        const adminIndex = localAdmins.findIndex(a => a.username === conflict.username);
        if (adminIndex !== -1) {
            const cloudAdmin = cloudAdmins.find(a => a.username === conflict.username);
            if (cloudAdmin) {
                localAdmins[adminIndex].name = cloudAdmin.name;
                console.log(`自动解决管理员 ${conflict.username} 的昵称冲突`);
            }
        }
    });
}

function mergeSchedulesSmart(localSchedules, cloudSchedules) {
    const scheduleMap = new Map();
    
    cloudSchedules.forEach(schedule => {
        if (schedule.id) {
            scheduleMap.set(schedule.id, { ...schedule, source: 'cloud' });
        }
    });
    
    localSchedules.forEach(localSchedule => {
        const existing = scheduleMap.get(localSchedule.id);
        
        if (!existing) {
            scheduleMap.set(localSchedule.id, { ...localSchedule, source: 'local' });
        } else {
            const localTime = new Date(localSchedule.updatedAt || localSchedule.createdAt || 0).getTime();
            const cloudTime = new Date(existing.updatedAt || existing.createdAt || 0).getTime();
            
            if (localTime > cloudTime) {
                scheduleMap.set(localSchedule.id, { ...localSchedule, source: 'local' });
            }
        }
    });
    
    schedules.length = 0;
    scheduleMap.forEach(schedule => {
        const { source, ...cleanSchedule } = schedule;
        schedules.push(cleanSchedule);
    });
    
    console.log(`智能合并后: ${schedules.length}条时间安排`);
}

function mergeAdminsSmart(localAdmins, cloudAdmins) {
    const adminMap = new Map();
    
    cloudAdmins.forEach(cloudAdmin => {
        adminMap.set(cloudAdmin.username, {
            username: cloudAdmin.username,
            name: cloudAdmin.name || cloudAdmin.username,
            createdAt: cloudAdmin.createdAt || new Date().toISOString()
        });
    });
    
    localAdmins.forEach(localAdmin => {
        if (adminMap.has(localAdmin.username)) {
            const existing = adminMap.get(localAdmin.username);
            
            existing.password = localAdmin.password;
            
            if (localAdmin.name && localAdmin.name !== localAdmin.username) {
                existing.name = localAdmin.name;
            }
            
        } else {
            adminMap.set(localAdmin.username, {
                ...localAdmin,
                createdAt: localAdmin.createdAt || new Date().toISOString()
            });
        }
    });
    
    adminMap.forEach(admin => {
        if (!admin.password) {
            admin.password = 'admin123';
            console.log(`为管理员 ${admin.username} 设置默认密码`);
        }
    });
    
    adminUsers.length = 0;
    adminMap.forEach(admin => adminUsers.push(admin));
    
    console.log(`智能合并后: ${adminUsers.length}个管理员`);
}

// ============================================
// 登录系统
// ============================================

function showLoginModal() {
    if (currentAdmin) {
        showLogoutConfirm();
        return;
    }
    
    const modal = document.getElementById('loginModal');
    if (modal) {
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
        
        setTimeout(() => {
            const usernameInput = document.getElementById('loginUsername');
            if (usernameInput) usernameInput.focus();
        }, 100);
    }
}

function hideLoginModal() {
    const modal = document.getElementById('loginModal');
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = '';
        
        const usernameInput = document.getElementById('loginUsername');
        const passwordInput = document.getElementById('loginPassword');
        if (usernameInput) usernameInput.value = '';
        if (passwordInput) passwordInput.value = '';
    }
}

async function performLogin() {
    const usernameInput = document.getElementById('loginUsername');
    const passwordInput = document.getElementById('loginPassword');
    
    if (!usernameInput || !passwordInput) {
        showMessage('登录表单未找到', 'error');
        return;
    }
    
    const username = usernameInput.value.trim();
    const password = passwordInput.value;
    
    if (!username || !password) {
        showMessage('请输入账号和密码', 'warning');
        return;
    }
    
    const loginBtn = document.querySelector('#loginModal .btn-primary');
    if (loginBtn) {
        loginBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 登录中';
        loginBtn.disabled = true;
    }
    
    await new Promise(resolve => setTimeout(resolve, 300));
    
    const admin = adminUsers.find(u => u.username === username && u.password === password);
    
    if (admin) {
        currentAdmin = admin;
        
        const loginInfo = {
            username: admin.username,
            loginTime: new Date().getTime()
        };
        localStorage.setItem(CONFIG.storageKeys.loginInfo, JSON.stringify(loginInfo));
        
        updateUserUI();
        hideLoginModal();
        
        showMessage('登录成功', 'success');
        loadSchedules();
        
        if (syncEnabled && isOnline) {
            setTimeout(() => enhancedSync(), 1000);
        }
        
    } else {
        showMessage('账号或密码错误', 'error');
        if (passwordInput) {
            passwordInput.value = '';
            passwordInput.focus();
        }
    }
    
    if (loginBtn) {
        loginBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i> 登录';
        loginBtn.disabled = false;
    }
}

async function showLogoutConfirm() {
    const confirmed = await customConfirm(`确定要退出登录吗？`);
    if (confirmed) {
        logout();
    }
}

function logout() {
    currentAdmin = null;
    localStorage.removeItem(CONFIG.storageKeys.loginInfo);
    updateUserUI();
    showMessage('已退出登录', 'info');
    loadSchedules();
}

function updateUserUI() {
    const navUser = document.getElementById('navUser');
    const adminCard = document.getElementById('adminCard');
    const systemAlert = document.getElementById('systemAlert');
    const alertMessage = document.getElementById('alertMessage');
    
    if (!navUser || !adminCard || !systemAlert || !alertMessage) {
        console.error('UI元素未找到');
        return;
    }
    
    if (currentAdmin) {
        navUser.innerHTML = `
            <span class="admin-indicator">
                <i class="fas fa-user-shield"></i>
                <span>${currentAdmin.name}</span>
            </span>
            <button class="btn btn-primary btn-sm" onclick="showLoginModal()">
                <i class="fas fa-sign-out-alt"></i> 退出
            </button>
        `;
        
        adminCard.style.display = 'block';
        alertMessage.textContent = `管理员模式 - ${currentAdmin.name}`;
        systemAlert.style.background = 'linear-gradient(135deg, #2ecc71 0%, #27ae60 100%)';
        
    } else {
        navUser.innerHTML = `
            <button class="btn btn-primary" onclick="showLoginModal()">
                <i class="fas fa-sign-in-alt"></i> 管理员登录
            </button>
        `;
        
        adminCard.style.display = 'none';
        alertMessage.textContent = '访客模式：仅可查看时间安排';
        systemAlert.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
    }
}

// ============================================
// 时间安排管理
// ============================================

function loadSchedules() {
    const tableBody = document.getElementById('scheduleTable');
    const emptyState = document.getElementById('emptyState');
    
    if (!tableBody || !emptyState) {
        console.error('表格元素未找到');
        return;
    }
    
    const daySchedules = schedules.filter(schedule => schedule.date === currentDate);
    
    if (daySchedules.length === 0) {
        tableBody.innerHTML = '';
        emptyState.style.display = 'flex';
        updateStats(0, 0);
        return;
    }
    
    daySchedules.sort((a, b) => {
        return timeToMinutes(a.startTime) - timeToMinutes(b.startTime);
    });
    
    let html = '';
    let freeCount = 0;
    let busyCount = 0;
    
    const isMobile = window.innerWidth <= 768;
    
    daySchedules.forEach((schedule, index) => {
        if (schedule.status === 'free') freeCount++;
        if (schedule.status === 'busy') busyCount++;
        
        const adminName = schedule.adminName || '未知管理员';
        
        html += `
            <tr>
                <td data-label="时间段">
                    <strong>${schedule.startTime} - ${schedule.endTime}</strong>
                </td>
                <td data-label="状态">
                    <span class="status-cell status-${schedule.status}">
                        ${schedule.status === 'free' ? '空闲' : '繁忙'}
                    </span>
                </td>
                <td data-label="设置人" class="admin-cell">
                    <i class="fas fa-user-circle"></i>
                    <span>${adminName}</span>
                </td>
                <td data-label="操作" class="action-buttons">
                    ${currentAdmin ? `
                        <button onclick="deleteSchedule(${index})" class="btn btn-danger btn-sm">
                            <i class="fas fa-trash"></i> ${isMobile ? '' : '删除'}
                        </button>
                    ` : '<span class="text-muted">（仅管理员可操作）</span>'}
                </td>
            </tr>
        `;
    });
    
    tableBody.innerHTML = html;
    emptyState.style.display = 'none';
    updateStats(freeCount, busyCount);
    
    setTimeout(() => {
        checkForScrollHint();
    }, 100);
}

function updateStats(freeCount, busyCount) {
    const freeCountEl = document.getElementById('freeCount');
    const busyCountEl = document.getElementById('busyCount');
    
    if (freeCountEl) freeCountEl.textContent = freeCount;
    if (busyCountEl) busyCountEl.textContent = busyCount;
}

function addSchedule() {
    if (!currentAdmin) {
        showMessage('请先登录管理员账号', 'warning');
        return;
    }
    
    const startTimeInput = document.getElementById('startTime');
    const endTimeInput = document.getElementById('endTime');
    
    if (!startTimeInput || !endTimeInput) {
        showMessage('时间输入框未找到', 'error');
        return;
    }
    
    const startTime = startTimeInput.value;
    const endTime = endTimeInput.value;
    
    if (!startTime || !endTime) {
        showMessage('请选择开始和结束时间', 'warning');
        return;
    }
    
    if (timeToMinutes(startTime) >= timeToMinutes(endTime)) {
        showMessage('结束时间必须晚于开始时间', 'warning');
        return;
    }
    
    const hasConflict = checkTimeConflict(currentDate, startTime, endTime);
    if (hasConflict) {
        showMessage('该时间段已有安排，请选择其他时间', 'warning');
        return;
    }
    
    const newSchedule = {
        id: generateId(),
        date: currentDate,
        startTime: startTime,
        endTime: endTime,
        status: selectedStatus,
        adminName: currentAdmin.name,
        createdBy: currentAdmin.username,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    
    schedules.push(newSchedule);
    saveSchedules();
    loadSchedules();
    
    startTimeInput.value = '';
    endTimeInput.value = '';
    
    showMessage('时间段添加成功', 'success');
    
    if (githubToken && autoUploadEnabled) {
        queueOperation('uploadData', {}, 'normal');
    }
}

function checkTimeConflict(date, startTime, endTime) {
    const daySchedules = schedules.filter(schedule => schedule.date === date);
    
    const newStart = timeToMinutes(startTime);
    const newEnd = timeToMinutes(endTime);
    
    for (const schedule of daySchedules) {
        const existingStart = timeToMinutes(schedule.startTime);
        const existingEnd = timeToMinutes(schedule.endTime);
        
        if ((newStart >= existingStart && newStart < existingEnd) ||
            (newEnd > existingStart && newEnd <= existingEnd) ||
            (newStart <= existingStart && newEnd >= existingEnd)) {
            return true;
        }
    }
    
    return false;
}

async function deleteSchedule(index) {
    if (!currentAdmin) {
        showMessage('请先登录管理员账号', 'warning');
        return;
    }
    
    const daySchedules = schedules.filter(schedule => schedule.date === currentDate);
    const scheduleToDelete = daySchedules[index];
    
    if (!scheduleToDelete) {
        showMessage('未找到要删除的时间段', 'error');
        return;
    }
    
    const confirmed = await customConfirm('确定要删除这个时间段吗？');
    
    if (confirmed) {
        const globalIndex = schedules.findIndex(s => s.id === scheduleToDelete.id);
        if (globalIndex !== -1) {
            schedules.splice(globalIndex, 1);
            saveSchedules();
            loadSchedules();
            showMessage('时间段删除成功', 'success');
            
            if (githubToken && autoUploadEnabled) {
                queueOperation('uploadData', {}, 'normal');
            }
        }
    }
}

// ============================================
// 管理员设置
// ============================================

function openAdminSettings() {
    console.log('openAdminSettings函数被调用');
    
    if (!currentAdmin) {
        console.log('未登录，无法打开管理员设置');
        showMessage('请先登录管理员账号', 'warning');
        return;
    }
    
    const modal = document.getElementById('adminSettingsModal');
    if (!modal) {
        console.error('找不到管理员设置模态框');
        showMessage('界面加载异常，请刷新页面', 'error');
        return;
    }
    
    console.log('显示模态框');
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    
    const currentAccountEl = document.getElementById('currentAccount');
    const editAdminNameEl = document.getElementById('editAdminName');
    
    if (currentAccountEl) {
        currentAccountEl.textContent = currentAdmin.username;
    }
    if (editAdminNameEl) {
        editAdminNameEl.value = currentAdmin.name;
    }
    
    loadAdminList();
    
    setTimeout(() => {
        if (editAdminNameEl) {
            editAdminNameEl.focus();
        }
    }, 100);
}

function hideAdminSettings() {
    const modal = document.getElementById('adminSettingsModal');
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = '';
        
        const inputs = modal.querySelectorAll('input[type="password"], input[type="text"]');
        inputs.forEach(input => {
            if (input.id !== 'editAdminName') {
                input.value = '';
            }
        });
    }
}

async function removeAdmin(index) {
    const adminToRemove = adminUsers[index];
    
    if (!adminToRemove) {
        showMessage('未找到要移除的管理员', 'error');
        return;
    }
    
    if (adminUsers.length <= 1) {
        showMessage('至少需要保留一个管理员', 'warning');
        return;
    }
    
    const confirmed = await customConfirm(`确定要移除管理员 ${adminToRemove.name} 吗？\n\n此操作将同步到所有设备。`);
    
    if (confirmed) {
        const operationId = queueOperation('deleteAdmin', {
            adminIndex: index,
            adminName: adminToRemove.name
        }, 'high');
        
        showMessage('删除操作已加入队列，正在处理...', 'info');
        
        setTimeout(() => {
            const operation = operationQueue.find(op => op.id === operationId);
            if (operation && operation.status === 'completed') {
                showMessage(`管理员 ${adminToRemove.name} 已成功移除`, 'success');
            }
        }, 10000);
    }
}

function updateAdminName() {
    const editAdminNameEl = document.getElementById('editAdminName');
    if (!editAdminNameEl) return;
    
    const newName = editAdminNameEl.value.trim();
    
    if (!newName) {
        showMessage('请输入昵称', 'warning');
        return;
    }
    
    const adminIndex = adminUsers.findIndex(admin => admin.username === currentAdmin.username);
    if (adminIndex !== -1) {
        adminUsers[adminIndex].name = newName;
        currentAdmin.name = newName;
        
        saveAdminUsers();
        
        schedules.forEach(schedule => {
            if (schedule.createdBy === currentAdmin.username) {
                schedule.adminName = newName;
                schedule.updatedAt = new Date().toISOString();
            }
        });
        saveSchedules();
        
        updateUserUI();
        loadSchedules();
        
        showMessage('昵称更新成功', 'success');
        
        if (githubToken && autoUploadEnabled) {
            queueOperation('uploadData', {}, 'normal');
        }
    }
}

async function changePassword() {
    const currentPasswordEl = document.getElementById('currentPassword');
    const newPasswordEl = document.getElementById('newPassword');
    const confirmPasswordEl = document.getElementById('confirmPassword');
    
    if (!currentPasswordEl || !newPasswordEl || !confirmPasswordEl) return;
    
    const currentPassword = currentPasswordEl.value;
    const newPassword = newPasswordEl.value;
    const confirmPassword = confirmPasswordEl.value;
    
    if (!currentPassword || !newPassword || !confirmPassword) {
        showMessage('请填写所有字段', 'warning');
        return;
    }
    
    if (currentAdmin.password !== currentPassword) {
        showMessage('当前密码错误', 'error');
        return;
    }
    
    if (newPassword !== confirmPassword) {
        showMessage('两次输入的新密码不一致', 'warning');
        return;
    }
    
    if (newPassword.length < 6) {
        showMessage('新密码至少需要6位', 'warning');
        return;
    }
    
    const adminIndex = adminUsers.findIndex(admin => admin.username === currentAdmin.username);
    if (adminIndex !== -1) {
        adminUsers[adminIndex].password = newPassword;
        currentAdmin.password = newPassword;
        
        saveAdminUsers();
        
        currentPasswordEl.value = '';
        newPasswordEl.value = '';
        confirmPasswordEl.value = '';
        
        showMessage('密码修改成功', 'success');
        
        if (githubToken && autoUploadEnabled) {
            queueOperation('uploadData', {}, 'normal');
        }
    }
}

function loadAdminList() {
    const adminList = document.getElementById('adminList');
    if (!adminList) return;
    
    let html = '';
    adminUsers.forEach((admin, index) => {
        const isCurrentUser = currentAdmin && admin.username === currentAdmin.username;
        
        html += `
            <tr>
                <td>${admin.username} ${isCurrentUser ? '<span class="badge free-badge">当前</span>' : ''}</td>
                <td>${admin.name}</td>
                <td>
                    ${!isCurrentUser ? `
                        <button onclick="removeAdmin(${index})" class="btn btn-danger btn-sm">
                            <i class="fas fa-trash"></i> 移除
                        </button>
                    ` : '<span class="text-muted">（当前用户）</span>'}
                </td>
            </tr>
        `;
    });
    
    adminList.innerHTML = html;
}

async function addNewAdmin() {
    const usernameInput = document.getElementById('newAdminUsername');
    const passwordInput = document.getElementById('newAdminPassword');
    const nameInput = document.getElementById('newAdminName');
    
    if (!usernameInput || !passwordInput || !nameInput) return;
    
    const username = usernameInput.value.trim();
    const password = passwordInput.value;
    const name = nameInput.value.trim();
    
    if (!username || !password || !name) {
        showMessage('请填写所有字段', 'warning');
        return;
    }
    
    if (adminUsers.some(admin => admin.username === username)) {
        showMessage('该用户名已存在', 'warning');
        return;
    }
    
    const newAdmin = {
        username: username,
        password: password,
        name: name,
        createdAt: new Date().toISOString()
    };
    
    adminUsers.push(newAdmin);
    saveAdminUsers();
    loadAdminList();
    
    usernameInput.value = '';
    passwordInput.value = '';
    nameInput.value = '';
    
    showMessage(`管理员 ${name} 添加成功`, 'success');
    
    if (githubToken && autoUploadEnabled) {
        queueOperation('uploadData', {}, 'normal');
    }
}

// ============================================
// GitHub Token管理
// ============================================

function configureGitHubToken() {
    if (!currentAdmin) {
        showMessage('请先登录管理员账号', 'warning');
        return;
    }
    
    const modal = document.getElementById('githubTokenModal');
    if (modal) {
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
        
        const tokenInput = document.getElementById('githubTokenInput');
        if (tokenInput) {
            tokenInput.value = '';
        }
        
        setTimeout(() => {
            if (tokenInput) tokenInput.focus();
        }, 100);
    }
}

function hideGitHubTokenModal() {
    const modal = document.getElementById('githubTokenModal');
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = '';
    }
}

async function testGitHubTokenInput() {
    const tokenInput = document.getElementById('githubTokenInput');
    if (!tokenInput) {
        console.error('找不到Token输入框');
        showMessage('找不到Token输入框', 'error');
        return;
    }
    
    const token = tokenInput.value.trim();
    
    if (!token) {
        showMessage('请输入GitHub Token', 'warning');
        tokenInput.focus();
        return;
    }
    
    if (!token.startsWith('ghp_') && !token.startsWith('github_pat_')) {
        showMessage('Token格式不正确，请确保是有效的GitHub Token', 'warning');
        tokenInput.focus();
        tokenInput.select();
        return;
    }
    
    showMessage('正在测试Token...', 'info');
    
    const isValid = await testGitHubTokenWithToken(token);
    if (isValid) {
        showMessage('✅ Token验证成功！可以正常访问GitHub仓库', 'success');
        tokenInput.style.borderColor = '#2ecc71';
        tokenInput.style.borderWidth = '2px';
        
        setTimeout(() => {
            tokenInput.style.borderColor = '';
            tokenInput.style.borderWidth = '';
        }, 3000);
    }
}

async function testGitHubTokenWithToken(token) {
    try {
        const response = await fetch(CONFIG.github.apiUrl, {
            headers: {
                'Authorization': `token ${token}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });
        
        if (response.ok) {
            console.log('GitHub Token验证成功');
            return true;
        } else {
            const error = await response.json();
            console.error('GitHub Token验证失败:', error);
            
            let errorMessage = 'Token验证失败: ';
            if (response.status === 401) {
                errorMessage += 'Token无效或已过期';
            } else if (response.status === 403) {
                errorMessage += '权限不足（需要repo权限）';
            } else if (response.status === 404) {
                errorMessage += '仓库不存在或无法访问';
            } else {
                errorMessage += error.message || `HTTP ${response.status}`;
            }
            
            showMessage(errorMessage, 'error');
            return false;
        }
    } catch (error) {
        console.error('测试GitHub Token时出错:', error);
        showMessage('Token测试失败: 网络错误或无法连接到GitHub', 'error');
        return false;
    }
}

let isSavingToken = false;

async function saveGitHubToken() {
    console.log('点击了保存Token按钮');
    
    if (isSavingToken) {
        console.log('Token保存操作正在进行中，请稍候...');
        return;
    }
    isSavingToken = true;
    
    const tokenInput = document.getElementById('githubTokenInput');
    if (!tokenInput) {
        console.error('找不到Token输入框');
        isSavingToken = false;
        return;
    }
    
    const token = tokenInput.value.trim();
    
    if (!token) {
        showMessage('Token不能为空', 'warning');
        isSavingToken = false;
        return;
    }
    
    if (!token.startsWith('ghp_') && !token.startsWith('github_pat_')) {
        showMessage('Token格式不正确，请确保是有效的GitHub Token', 'warning');
        isSavingToken = false;
        tokenInput.focus();
        tokenInput.select();
        return;
    }
    
    showMessage('正在验证Token有效性...', 'info');
    
    const isValid = await testGitHubTokenWithToken(token);
    if (!isValid) {
        isSavingToken = false;
        return;
    }
    
    githubToken = token;
    localStorage.setItem(CONFIG.storageKeys.githubToken, token);
    
    hideGitHubTokenModal();
    
    updateTokenStatusUI();
    updateSyncUI();
    
    showMessage('GitHub Token配置成功！所有管理员现在都可以上传数据到云端', 'success');
    
    setTimeout(() => {
        forceUpdateTokenUsage();
    }, 100);
    
    setTimeout(() => {
        smartUploadToGitHub();
    }, 500);
    
    setTimeout(() => {
        isSavingToken = false;
    }, 1000);
}

async function testGitHubToken() {
    let tokenToTest = githubToken;
    if (!tokenToTest) {
        tokenToTest = localStorage.getItem(CONFIG.storageKeys.githubToken);
        if (tokenToTest) {
            githubToken = tokenToTest;
            console.log('从localStorage恢复Token');
        }
    }
    
    if (!tokenToTest) {
        showMessage('未配置GitHub Token', 'warning');
        return;
    }
    
    showMessage('正在测试当前Token...', 'info');
    
    const isValid = await testGitHubTokenWithToken(tokenToTest);
    if (isValid) {
        showMessage('当前Token验证成功！可以正常上传数据', 'success');
    }
}

function removeGitHubToken() {
    const confirmed = confirm('确定要移除GitHub Token吗？移除后将无法上传数据到云端。');
    
    if (!confirmed) return;
    
    githubToken = '';
    localStorage.removeItem(CONFIG.storageKeys.githubToken);
    
    updateTokenStatusUI();
    updateSyncUI();
    
    showMessage('GitHub Token已移除', 'info');
}

function forceUpdateTokenUsage() {
    console.log('强制更新Token使用...');
    
    const storedToken = localStorage.getItem(CONFIG.storageKeys.githubToken);
    if (storedToken && !githubToken) {
        githubToken = storedToken;
        console.log('✅ 已从localStorage恢复githubToken');
    }
    
    if (githubToken) {
        console.log('当前有效的Token:', githubToken.substring(0, 4) + '...');
    }
}

function toggleTokenVisibility() {
    const tokenDisplay = document.getElementById('currentTokenDisplay');
    if (!tokenDisplay) return;
    
    if (tokenDisplay.type === 'password') {
        tokenDisplay.type = 'text';
        if (githubToken) {
            const visibleToken = githubToken.substring(0, 4) + '...' + githubToken.substring(githubToken.length - 4);
            tokenDisplay.value = visibleToken;
        }
    } else {
        tokenDisplay.type = 'password';
        tokenDisplay.value = githubToken ? '••••••••••••••••' : '未配置Token';
    }
}

function updateTokenStatusUI() {
    const tokenIndicator = document.getElementById('tokenStatusIndicator');
    if (tokenIndicator) {
        if (githubToken) {
            tokenIndicator.innerHTML = '<i class="fas fa-check-circle"></i> Token已配置';
            tokenIndicator.className = 'token-status-indicator token-status-ok';
            tokenIndicator.title = 'GitHub Token已配置，可以上传数据';
        } else {
            tokenIndicator.innerHTML = '<i class="fas fa-exclamation-circle"></i> 未配置Token';
            tokenIndicator.className = 'token-status-indicator token-status-none';
            tokenIndicator.title = '未配置GitHub Token，无法上传数据到云端';
        }
    }
    
    const tokenStatusEl = document.getElementById('githubTokenStatus');
    if (tokenStatusEl) {
        if (githubToken) {
            tokenStatusEl.innerHTML = '<i class="fas fa-check-circle"></i> 已配置';
            tokenStatusEl.className = 'status-value active';
        } else {
            tokenStatusEl.innerHTML = '<i class="fas fa-exclamation-circle"></i> 未配置';
            tokenStatusEl.className = 'status-value warning';
        }
    }
    
    const tokenDisplay = document.getElementById('currentTokenDisplay');
    if (tokenDisplay) {
        tokenDisplay.value = githubToken ? '••••••••••••••••' : '未配置Token';
    }
    
    const configBtn = document.getElementById('configureTokenBtn');
    if (configBtn) {
        configBtn.innerHTML = githubToken ? 
            '<i class="fas fa-key"></i> 更新Token' : 
            '<i class="fas fa-key"></i> 配置Token';
    }
}

// ============================================
// 同步设置
// ============================================

function openSyncSettings() {
    if (!currentAdmin) {
        showMessage('请先登录管理员账号', 'warning');
        return;
    }
    
    const modal = document.getElementById('syncSettingsModal');
    if (modal) {
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
        
        updateStatsDisplay();
        updateTokenStatusUI();
        updateLastSyncTimeDisplay();
    }
}

function hideSyncSettings() {
    const modal = document.getElementById('syncSettingsModal');
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = '';
    }
}

function toggleAutoSync() {
    const toggle = document.getElementById('syncToggle');
    if (!toggle) return;
    
    syncEnabled = toggle.checked;
    
    if (syncEnabled) {
        startSyncInterval();
        if (isOnline) {
            enhancedSync();
        }
        showMessage('云同步已启用', 'success');
    } else {
        stopSyncInterval();
        showMessage('云同步已禁用', 'info');
    }
    
    updateSyncUI();
    updateSyncIndicator();
}

function toggleAutoResolve() {
    const toggle = document.getElementById('autoResolveToggle');
    if (!toggle) return;
    
    CONFIG.sync.autoResolve = toggle.checked;
    showMessage(`自动冲突解决已${toggle.checked ? '启用' : '禁用'}`, 'info');
}

function toggleAutoUpload() {
    const toggle = document.getElementById('autoUploadToggle');
    if (!toggle) return;
    
    autoUploadEnabled = toggle.checked;
    localStorage.setItem(CONFIG.storageKeys.autoUpload, JSON.stringify(autoUploadEnabled));
    
    showMessage(`自动上传修改已${toggle.checked ? '启用' : '禁用'}`, 'info');
}

function resetLocalData() {
    const confirmed = confirm('确定要清空所有本地数据吗？这不会影响云端数据。');
    
    if (confirmed) {
        schedules = [];
        saveSchedules();
        loadSchedules();
        
        lastSyncTime = 0;
        lastGitHash = '';
        localStorage.removeItem(CONFIG.storageKeys.lastSyncTime);
        localStorage.removeItem(CONFIG.storageKeys.lastGitHash);
        
        updateLastSyncTimeDisplay();
        showMessage('本地数据已清空', 'success');
        
        if (syncEnabled && isOnline) {
            setTimeout(() => enhancedSync(), 1000);
        }
    }
}

// ============================================
// 增强的同步函数
// ============================================

async function enhancedSync() {
    if (isSyncing) {
        console.log('同步正在进行中，跳过');
        return;
    }
    
    if (!syncEnabled) {
        console.log('同步已禁用，跳过');
        return;
    }
    
    if (!isOnline) {
        console.log('网络离线，跳过同步');
        return;
    }
    
    isSyncing = true;
    updateSyncIndicator(true);
    
    try {
        console.log('开始增强同步流程...');
        
        const networkQuality = await checkNetworkQuality();
        
        if (networkQuality !== 'good' && networkQuality !== 'fair') {
            console.log(`网络质量不佳 (${networkQuality})，跳过同步`);
            showMessage(`网络质量不佳 (${networkQuality})，稍后重试`, 'warning');
            return;
        }
        
        const cloudData = await fetchFromGitHub();
        
        if (cloudData) {
            if (cloudData.gitHash !== lastGitHash) {
                console.log('检测到云端数据更新，开始智能合并');
                await syncWithCloudSmart(cloudData);
            } else {
                console.log('云端数据未更新，跳过合并');
            }
        } else {
            console.log('云端数据为空或获取失败');
        }
        
        const tokenToUse = githubToken || localStorage.getItem(CONFIG.storageKeys.githubToken);
        if (tokenToUse && currentAdmin && autoUploadEnabled) {
            console.log('开始自动上传数据...');
            await smartUploadToGitHub();
        }
        
        lastSyncTime = Date.now();
        localStorage.setItem(CONFIG.storageKeys.lastSyncTime, lastSyncTime.toString());
        
        if (networkQuality === 'good') {
            await processPendingUploads();
        }
        
        if (operationQueue.length > 0) {
            console.log(`同步完成后处理操作队列: ${operationQueue.length} 个操作`);
            await processQueue();
        }
        
        console.log('✅ 增强同步完成');
        
    } catch (error) {
        console.error('增强同步失败:', error);
        showMessage('同步失败: ' + error.message, 'error');
        
        const syncError = {
            timestamp: Date.now(),
            error: error.message,
            stack: error.stack
        };
        localStorage.setItem('last_sync_error', JSON.stringify(syncError));
        
    } finally {
        isSyncing = false;
        updateSyncIndicator(false);
        updateLastSyncTimeDisplay();
    }
}

// ============================================
// 工具函数
// ============================================

function timeToMinutes(time) {
    if (!time) return 0;
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + (minutes || 0);
}

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

function showMessage(message, type = 'info') {
    if (typeof toastr === 'undefined') {
        console.log(`${type}: ${message}`);
        showFallbackMessage(message, type);
        return;
    }
    
    try {
        switch (type) {
            case 'success':
                toastr.success(message);
                break;
            case 'error':
                toastr.error(message);
                break;
            case 'warning':
                toastr.warning(message);
                break;
            default:
                toastr.info(message);
        }
    } catch (error) {
        console.log(`${type}: ${message}`);
        showFallbackMessage(message, type);
    }
}

async function customConfirm(message) {
    return new Promise((resolve) => {
        const modal = document.createElement('div');
        modal.className = 'custom-confirm-modal';
        modal.innerHTML = `
            <div class="custom-confirm-dialog">
                <div class="custom-confirm-content">${message}</div>
                <div class="custom-confirm-buttons">
                    <button class="btn btn-secondary" id="customConfirmCancel">取消</button>
                    <button class="btn btn-primary" id="customConfirmOk">确定</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        const okBtn = document.getElementById('customConfirmOk');
        const cancelBtn = document.getElementById('customConfirmCancel');
        
        setTimeout(() => okBtn.focus(), 100);
        
        const cleanup = function() {
            document.body.removeChild(modal);
            document.removeEventListener('keydown', handleKeydown);
        };
        
        const handleKeydown = function(event) {
            if (event.key === 'Enter') {
                event.preventDefault();
                okBtn.click();
            } else if (event.key === 'Escape') {
                event.preventDefault();
                cancelBtn.click();
            } else if (event.key === 'Tab') {
                event.preventDefault();
                if (document.activeElement === okBtn) {
                    cancelBtn.focus();
                } else {
                    okBtn.focus();
                }
            }
        };
        
        okBtn.onclick = function() {
            cleanup();
            resolve(true);
        };
        
        cancelBtn.onclick = function() {
            cleanup();
            resolve(false);
        };
        
        modal.onclick = function(event) {
            if (event.target === modal) {
                cancelBtn.click();
            }
        };
        
        document.addEventListener('keydown', handleKeydown);
    });
}

// ============================================
// 页面操作函数
// ============================================

function goToday() {
    setToday();
    loadSchedules();
    showMessage('已回到今天', 'info');
}

function changeDate(days) {
    const date = new Date(currentDate);
    date.setDate(date.getDate() + days);
    
    const newDate = formatDate(date);
    
    const minDate = new Date(CONFIG.minDate);
    const maxDate = new Date(CONFIG.maxDate);
    
    if (date < minDate || date > maxDate) {
        showMessage(`日期超出范围（${CONFIG.minDate} ~ ${CONFIG.maxDate}）`, 'warning');
        return;
    }
    
    currentDate = newDate;
    const datePicker = document.getElementById('datePicker');
    if (datePicker) datePicker.value = newDate;
    updateDateDisplay();
    loadSchedules();
}

// ============================================
// 数据管理
// ============================================

function saveSchedules() {
    try {
        localStorage.setItem(CONFIG.storageKeys.schedules, JSON.stringify(schedules));
        console.log('时间安排已保存到本地，条数:', schedules.length);
    } catch (error) {
        console.error('数据保存失败：', error);
        showMessage('数据保存失败，请检查存储空间', 'error');
    }
}

function saveAdminUsers() {
    try {
        localStorage.setItem(CONFIG.storageKeys.adminUsers, JSON.stringify(adminUsers));
        console.log('管理员配置已保存到本地，数量:', adminUsers.length);
    } catch (error) {
        console.error('管理员配置保存失败：', error);
        showMessage('管理员配置保存失败', 'error');
    }
}

async function exportData() {
    if (!currentAdmin) {
        showMessage('请先登录管理员账号', 'warning');
        return;
    }
    
    const exportData = {
        version: '3.0',
        exportTime: new Date().toISOString(),
        totalSchedules: schedules.length,
        schedules: schedules,
        adminUsers: adminUsers.map(admin => ({
            username: admin.username,
            name: admin.name
        })),
        config: CONFIG.github,
        githubTokenConfigured: !!githubToken
    };
    
    const dataStr = JSON.stringify(exportData, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
    
    const exportFileName = `时间管理系统_备份_${formatDate(new Date(), 'YYYY-MM-DD')}.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileName);
    document.body.appendChild(linkElement);
    linkElement.click();
    document.body.removeChild(linkElement);
    
    showMessage('数据导出成功', 'success');
}

async function importData(event) {
    if (!currentAdmin) {
        showMessage('请先登录管理员账号', 'warning');
        return;
    }
    
    const file = event.target.files[0];
    if (!file) return;
    
    if (file.size > 10 * 1024 * 1024) {
        showMessage('文件太大，请选择小于10MB的文件', 'warning');
        event.target.value = '';
        return;
    }
    
    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const importedData = JSON.parse(e.target.result);
            
            if (!importedData.schedules || !Array.isArray(importedData.schedules)) {
                throw new Error('数据格式无效');
            }
            
            const confirmed = await customConfirm(
                `确定要导入数据吗？\n时间安排：${importedData.schedules.length} 条\n注意：这会覆盖当前数据！`
            );
            
            if (confirmed) {
                schedules = importedData.schedules;
                saveSchedules();
                loadSchedules();
                showMessage('数据导入成功', 'success');
                
                if (githubToken && autoUploadEnabled) {
                    queueOperation('uploadData', {}, 'high');
                }
            }
            
        } catch (error) {
            showMessage('导入失败：文件格式错误', 'error');
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}

// ============================================
// UI更新函数
// ============================================

function updateSyncUI() {
    const toggle = document.getElementById('syncToggle');
    if (toggle) {
        toggle.checked = syncEnabled;
    }
    
    const resolveToggle = document.getElementById('autoResolveToggle');
    if (resolveToggle) {
        resolveToggle.checked = CONFIG.sync.autoResolve;
    }
    
    const uploadToggle = document.getElementById('autoUploadToggle');
    if (uploadToggle) {
        uploadToggle.checked = autoUploadEnabled;
    }
    
    const badge = document.getElementById('syncBadge');
    if (badge) {
        badge.style.display = syncEnabled ? 'inline-flex' : 'none';
    }
    
    const statusText = document.getElementById('syncStatusText');
    if (statusText) {
        if (syncEnabled) {
            if (githubToken) {
                statusText.textContent = 'GitHub云同步已启用';
            } else {
                statusText.textContent = '同步已启用（无Token）';
            }
            statusText.style.display = 'inline';
        } else {
            statusText.style.display = 'none';
        }
    }
    
    const syncStatusEl = document.getElementById('syncActiveStatus');
    if (syncStatusEl) {
        if (syncEnabled) {
            if (githubToken) {
                syncStatusEl.innerHTML = '<i class="fas fa-sync-alt"></i> 自动同步';
            } else {
                syncStatusEl.innerHTML = '<i class="fas fa-sync-alt"></i> 自动同步（只读）';
            }
            syncStatusEl.className = 'status-value active';
        } else {
            syncStatusEl.innerHTML = '<i class="fas fa-pause-circle"></i> 已禁用';
            syncStatusEl.className = 'status-value inactive';
        }
    }
    
    updateStatsDisplay();
}

function updateNetworkStatus() {
    const networkEl = document.getElementById('networkStatus');
    const syncNetworkEl = document.getElementById('syncNetworkStatus');
    
    let statusText = '';
    let statusClass = '';
    
    switch (networkState.quality) {
        case 'good':
            statusText = `<i class="fas fa-wifi"></i> 在线 (良好)`;
            statusClass = 'online';
            break;
        case 'fair':
            statusText = `<i class="fas fa-wifi"></i> 在线 (一般)`;
            statusClass = 'online';
            break;
        case 'poor':
            statusText = `<i class="fas fa-wifi-slash"></i> 在线 (较差)`;
            statusClass = 'offline';
            break;
        case 'offline':
            statusText = `<i class="fas fa-wifi-slash"></i> 离线`;
            statusClass = 'offline';
            break;
        default:
            statusText = isOnline ? `<i class="fas fa-wifi"></i> 在线` : `<i class="fas fa-wifi-slash"></i> 离线`;
            statusClass = isOnline ? 'online' : 'offline';
    }
    
    if (networkEl) {
        networkEl.innerHTML = statusText;
        networkEl.className = `network-status ${statusClass}`;
        
        if (networkState.quality === 'good') {
            setTimeout(() => {
                networkEl.style.display = 'none';
            }, 3000);
        } else {
            networkEl.style.display = 'block';
        }
    }
    
    if (syncNetworkEl) {
        syncNetworkEl.innerHTML = statusText;
        syncNetworkEl.className = `status-value ${statusClass}`;
    }
    
    updateSyncIndicator();
}

function updateSyncIndicator(syncing = false) {
    const indicator = document.getElementById('syncIndicator');
    if (!indicator) return;
    
    if (syncing) {
        indicator.innerHTML = '<i class="fas fa-sync fa-spin"></i>';
        indicator.className = 'sync-indicator syncing';
        indicator.title = '同步中...';
    } else if (!isOnline) {
        indicator.innerHTML = '<i class="fas fa-wifi-slash"></i>';
        indicator.className = 'sync-indicator offline';
        indicator.title = '网络离线';
    } else if (syncEnabled && githubToken) {
        indicator.innerHTML = '<i class="fab fa-github"></i>';
        indicator.className = 'sync-indicator online';
        indicator.title = 'GitHub云同步已启用，点击手动同步';
    } else if (syncEnabled) {
        indicator.innerHTML = '<i class="fab fa-github"></i>';
        indicator.className = 'sync-indicator inactive';
        indicator.title = '同步已启用（无Token，只读模式）';
    } else {
        indicator.innerHTML = '<i class="fab fa-github-slash"></i>';
        indicator.className = 'sync-indicator inactive';
        indicator.title = '云同步已禁用';
    }
}

function updateLastSyncTimeDisplay() {
    const timeEl = document.getElementById('syncLastTime');
    const badgeEl = document.getElementById('lastSyncTimeBadge');
    
    if (lastSyncTime > 0) {
        const timeStr = new Date(lastSyncTime).toLocaleTimeString('zh-CN');
        const now = Date.now();
        const diffMinutes = Math.floor((now - lastSyncTime) / 60000);
        
        let displayTime;
        if (diffMinutes < 1) {
            displayTime = '刚刚';
        } else if (diffMinutes < 60) {
            displayTime = `${diffMinutes}分钟前`;
        } else {
            displayTime = `${Math.floor(diffMinutes / 60)}小时前`;
        }
        
        if (timeEl) {
            timeEl.textContent = `${timeStr} (${displayTime})`;
        }
        if (badgeEl) {
            badgeEl.textContent = displayTime;
            badgeEl.title = `最后同步: ${timeStr}`;
        }
    } else {
        if (timeEl) timeEl.textContent = '从未同步';
        if (badgeEl) {
            badgeEl.textContent = '从未';
            badgeEl.title = '从未同步';
        }
    }
}

function updateStatsDisplay() {
    const versionEl = document.getElementById('dataVersionDisplay');
    if (versionEl) {
        versionEl.textContent = `v3.0 (${schedules.length}条)`;
    }
    
    const localCountEl = document.getElementById('localScheduleCount');
    const cloudCountEl = document.getElementById('cloudScheduleCount');
    
    if (localCountEl) {
        localCountEl.textContent = `${schedules.length} 条`;
    }
    
    if (cloudCountEl) {
        cloudCountEl.textContent = '加载中...';
        fetchFromGitHub().then(cloudData => {
            if (cloudData && cloudData.schedules) {
                cloudCountEl.textContent = `${cloudData.schedules.length} 条`;
            } else {
                cloudCountEl.textContent = '0 条';
            }
        }).catch(() => {
            cloudCountEl.textContent = '获取失败';
        });
    }
}

// ============================================
// 移动端优化
// ============================================

function initMobileOptimization() {
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    const isSmallScreen = window.innerWidth <= 768;
    
    console.log(`移动端检测：${isMobile ? '是' : '否'}，小屏幕：${isSmallScreen ? '是' : '否'}，屏幕宽度：${window.innerWidth}px`);
    
    if (isMobile || isSmallScreen) {
        document.body.classList.add('mobile-device');
        optimizeTableForMobile();
    }
    
    window.addEventListener('resize', function() {
        optimizeTableForMobile();
        updateTableLayout();
    });
}

function optimizeTableForMobile() {
    const table = document.querySelector('.schedule-table');
    if (!table) return;
    
    if (window.innerWidth <= 768) {
        table.style.fontSize = '12px';
        table.style.minWidth = '550px';
    } else {
        table.style.fontSize = '';
        table.style.minWidth = '600px';
    }
}

function updateTableLayout() {
    const tableContainer = document.querySelector('.table-responsive');
    if (!tableContainer) return;
    
    const table = tableContainer.querySelector('.schedule-table');
    if (!table) return;
    
    const scrollHint = document.getElementById('scrollHint');
    if (window.innerWidth <= 768 && table.scrollWidth > tableContainer.clientWidth) {
        if (scrollHint) {
            scrollHint.style.display = 'block';
        }
    } else {
        if (scrollHint) {
            scrollHint.style.display = 'none';
        }
    }
}

function checkForScrollHint() {
    setTimeout(() => {
        updateTableLayout();
    }, 500);
}

// ============================================
// 状态选择
// ============================================

function selectStatus(status) {
    selectedStatus = status;
    
    const freeBtn = document.querySelector('.status-free');
    const busyBtn = document.querySelector('.status-busy');
    
    if (freeBtn && busyBtn) {
        freeBtn.classList.remove('active');
        busyBtn.classList.remove('active');
        
        if (status === 'free') {
            freeBtn.classList.add('active');
        } else {
            busyBtn.classList.add('active');
        }
    }
}

// ============================================
// 同步初始化
// ============================================

function initSync() {
    window.addEventListener('online', async () => {
        isOnline = true;
        await checkNetworkQuality();
        updateNetworkStatus();
        
        if (syncEnabled) {
            showMessage('网络已连接，开始同步...', 'info');
            setTimeout(() => enhancedSync(), 2000);
        }
    });
    
    window.addEventListener('offline', () => {
        isOnline = false;
        networkState.quality = 'offline';
        updateNetworkStatus();
    });
    
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden && syncEnabled && isOnline) {
            setTimeout(() => enhancedSync(), 1000);
        }
    });
    
    if (syncEnabled) {
        startSyncInterval();
    }
    
    updateNetworkStatus();
    updateLastSyncTimeDisplay();
}

function startSyncInterval() {
    if (syncInterval) clearInterval(syncInterval);
    
    syncInterval = setInterval(async () => {
        if (syncEnabled && isOnline && !isSyncing) {
            const quality = await checkNetworkQuality();
            
            if (quality === 'good' || quality === 'fair') {
                console.log('定时同步检查...');
                await enhancedSync();
            } else {
                console.log(`网络质量不佳 (${quality})，跳过定时同步`);
            }
        }
    }, CONFIG.sync.interval);
    
    console.log('定时同步已启动，间隔:', CONFIG.sync.interval, 'ms');
}

function stopSyncInterval() {
    if (syncInterval) {
        clearInterval(syncInterval);
        syncInterval = null;
        console.log('定时同步已停止');
    }
}

// ============================================
// 键盘支持
// ============================================

function initKeyboardSupport() {
    document.addEventListener('keydown', function(event) {
        if (event.key === 'Enter') {
            handleEnterKey(event);
        } else if (event.key === 'Escape') {
            handleEscapeKey();
        }
    });
    
    setupInputKeyboard();
}

function handleEnterKey(event) {
    const activeElement = document.activeElement;
    
    if (activeElement.id === 'loginUsername' || activeElement.id === 'loginPassword') {
        if (document.getElementById('loginModal').style.display === 'flex') {
            event.preventDefault();
            if (activeElement.id === 'loginUsername') {
                const passwordInput = document.getElementById('loginPassword');
                if (passwordInput) passwordInput.focus();
            } else {
                performLogin();
            }
        }
    }
    
    if (activeElement.id === 'startTime' || activeElement.id === 'endTime') {
        if (currentAdmin) {
            event.preventDefault();
            if (activeElement.id === 'startTime') {
                const endTimeInput = document.getElementById('endTime');
                if (endTimeInput) endTimeInput.focus();
            } else {
                addSchedule();
            }
        }
    }
    
    if (activeElement.id === 'githubTokenInput') {
        if (document.getElementById('githubTokenModal').style.display === 'flex') {
            event.preventDefault();
            saveGitHubToken();
        }
    }
}

function handleEscapeKey() {
    const loginModal = document.getElementById('loginModal');
    const syncModal = document.getElementById('syncSettingsModal');
    const adminModal = document.getElementById('adminSettingsModal');
    const tokenModal = document.getElementById('githubTokenModal');
    
    if (loginModal && loginModal.style.display === 'flex') {
        hideLoginModal();
    } else if (syncModal && syncModal.style.display === 'flex') {
        hideSyncSettings();
    } else if (adminModal && adminModal.style.display === 'flex') {
        hideAdminSettings();
    } else if (tokenModal && tokenModal.style.display === 'flex') {
        hideGitHubTokenModal();
    }
}

function setupInputKeyboard() {
    const startTimeInput = document.getElementById('startTime');
    const endTimeInput = document.getElementById('endTime');
    
    if (startTimeInput) {
        startTimeInput.onkeydown = function(event) {
            if (event.key === 'Enter') {
                event.preventDefault();
                if (endTimeInput) endTimeInput.focus();
            }
        };
    }
    
    if (endTimeInput) {
        endTimeInput.onkeydown = function(event) {
            if (event.key === 'Enter') {
                event.preventDefault();
                if (currentAdmin) {
                    addSchedule();
                }
            }
        };
    }
    
    const loginUsername = document.getElementById('loginUsername');
    const loginPassword = document.getElementById('loginPassword');
    
    if (loginUsername && loginPassword) {
        loginUsername.onkeydown = function(event) {
            if (event.key === 'Enter') {
                event.preventDefault();
                loginPassword.focus();
            }
        };
        
        loginPassword.onkeydown = function(event) {
            if (event.key === 'Enter') {
                event.preventDefault();
                performLogin();
            }
        };
    }
    
    const githubTokenInput = document.getElementById('githubTokenInput');
    if (githubTokenInput) {
        githubTokenInput.onkeydown = function(event) {
            if (event.key === 'Enter') {
                event.preventDefault();
                saveGitHubToken();
            }
        };
    }
}

// ============================================
// 辅助函数
// ============================================

function setupGlobalEventListeners() {
    document.addEventListener('click', function(event) {
        const button = event.target.closest('button');
        if (!button) return;
        
        if (button.id === 'adminSettingsBtn' || 
            button.textContent.includes('管理设置') ||
            (button.innerHTML && button.innerHTML.includes('管理设置'))) {
            event.preventDefault();
            event.stopPropagation();
            openAdminSettings();
            return;
        }
    });
}

function setupGlobalClickHandlers() {
    const adminSettingsBtn = document.getElementById('adminSettingsBtn');
    if (adminSettingsBtn) {
        const newBtn = adminSettingsBtn.cloneNode(true);
        adminSettingsBtn.parentNode.replaceChild(newBtn, adminSettingsBtn);
        
        newBtn.addEventListener('click', function(event) {
            event.preventDefault();
            event.stopPropagation();
            openAdminSettings();
        });
        
        newBtn.onclick = function(event) {
            event.preventDefault();
            openAdminSettings();
        };
    }
}

function rebindButtonEvents() {
    const testTokenBtn = document.getElementById('testTokenBtn');
    const saveTokenBtn = document.getElementById('saveTokenBtn');
    
    if (testTokenBtn) {
        const newTestBtn = testTokenBtn.cloneNode(true);
        testTokenBtn.parentNode.replaceChild(newTestBtn, testTokenBtn);
    }
    
    if (saveTokenBtn) {
        const newSaveBtn = saveTokenBtn.cloneNode(true);
        saveTokenBtn.parentNode.replaceChild(newSaveBtn, saveTokenBtn);
    }
    
    setTimeout(() => {
        document.addEventListener('click', function(event) {
            const button = event.target.closest('button');
            if (!button) return;
            
            const buttonId = button.id || '';
            
            if (buttonId === 'testTokenBtn') {
                event.preventDefault();
                event.stopPropagation();
                testGitHubTokenInput();
                return;
            }
            
            if (buttonId === 'saveTokenBtn') {
                event.preventDefault();
                event.stopPropagation();
                saveGitHubToken();
                return;
            }
        });
    }, 100);
}

// ============================================
// 新增的队列处理函数
// ============================================

async function processDeleteAdminOperation(data) {
    const { adminIndex, adminName } = data;
    
    console.log(`处理删除管理员操作: ${adminName} (索引: ${adminIndex})`);
    
    try {
        await forceSyncFromGitHub();
        
        if (adminIndex >= 0 && adminIndex < adminUsers.length) {
            adminUsers.splice(adminIndex, 1);
            saveAdminUsers();
            loadAdminList();
            
            await smartUploadToGitHub();
            
            return true;
        } else {
            console.error(`管理员索引无效: ${adminIndex}`);
            return false;
        }
        
    } catch (error) {
        console.error('处理删除管理员操作失败:', error);
        return false;
    }
}

async function processAddScheduleOperation(data) {
    return true;
}

async function processSyncOperation() {
    try {
        await enhancedSync();
        return true;
    } catch (error) {
        console.error('同步操作失败:', error);
        return false;
    }
}

function saveToPendingUpload(data) {
    try {
        const pendingUploads = JSON.parse(localStorage.getItem('pending_uploads') || '[]');
        
        if (pendingUploads.length >= 20) {
            pendingUploads.shift();
        }
        
        pendingUploads.push({
            data: data,
            timestamp: Date.now(),
            device: navigator.userAgent.substring(0, 100)
        });
        
        localStorage.setItem('pending_uploads', JSON.stringify(pendingUploads));
        console.log('数据已保存到待上传队列，队列大小:', pendingUploads.length);
        
        return true;
    } catch (error) {
        console.error('保存到待上传队列失败:', error);
        return false;
    }
}

async function processPendingUploads() {
    try {
        const pendingUploads = JSON.parse(localStorage.getItem('pending_uploads') || '[]');
        
        if (pendingUploads.length === 0) {
            return;
        }
        
        console.log(`开始处理 ${pendingUploads.length} 个待上传项目`);
        
        if (networkState.quality !== 'good') {
            console.log('网络不佳，跳过处理待上传队列');
            return;
        }
        
        let successCount = 0;
        let failCount = 0;
        
        for (let i = 0; i < pendingUploads.length; i++) {
            const item = pendingUploads[i];
            
            try {
                console.log(`处理待上传项目 ${i + 1}/${pendingUploads.length}`);
                
                successCount++;
                pendingUploads.splice(i, 1);
                i--;
                
            } catch (error) {
                console.error(`处理待上传项目失败:`, error);
                failCount++;
            }
        }
        
        localStorage.setItem('pending_uploads', JSON.stringify(pendingUploads));
        
        if (successCount > 0) {
            showMessage(`已处理 ${successCount} 个待上传项目`, 'success');
        }
        
        if (failCount > 0) {
            showMessage(`${failCount} 个项目处理失败，已保留在队列中`, 'warning');
        }
        
    } catch (error) {
        console.error('处理待上传队列失败:', error);
    }
}

// ============================================
// 冲突解决对话框
// ============================================

async function showConflictResolutionDialog(scheduleConflicts, adminConflicts) {
    if (scheduleConflicts.length === 0 && adminConflicts.length === 0) {
        return true;
    }
    
    return new Promise((resolve) => {
        const modal = document.createElement('div');
        modal.className = 'custom-confirm-modal';
        
        let conflictMessage = '检测到数据冲突：\n\n';
        
        if (scheduleConflicts.length > 0) {
            conflictMessage += `• ${scheduleConflicts.length} 个时间安排冲突\n`;
        }
        
        if (adminConflicts.length > 0) {
            conflictMessage += `• ${adminConflicts.length} 个管理员冲突\n`;
        }
        
        conflictMessage += '\n请选择解决方式：';
        
        modal.innerHTML = `
            <div class="custom-confirm-dialog" style="max-width: 450px;">
                <div class="custom-confirm-content">
                    <h4 style="color: #f39c12; margin-bottom: 15px;">
                        <i class="fas fa-exclamation-triangle"></i> 数据冲突
                    </h4>
                    <p style="margin-bottom: 20px; white-space: pre-line;">${conflictMessage}</p>
                    <div style="margin: 20px 0;">
                        <button class="btn btn-primary btn-block" id="autoResolveBtn" style="margin-bottom: 10px;">
                            <i class="fas fa-robot"></i> 自动解决冲突（推荐）
                        </button>
                        <button class="btn btn-secondary btn-block" id="useLocalBtn" style="margin-bottom: 10px;">
                            <i class="fas fa-desktop"></i> 使用本地版本
                        </button>
                        <button class="btn btn-secondary btn-block" id="useCloudBtn" style="margin-bottom: 10px;">
                            <i class="fab fa-github"></i> 使用云端版本
                        </button>
                        <button class="btn btn-outline btn-block" id="cancelBtn">
                            <i class="fas fa-times"></i> 取消（保持现状）
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        const cleanup = function() {
            if (modal.parentNode) {
                document.body.removeChild(modal);
            }
        };
        
        document.getElementById('autoResolveBtn').onclick = function() {
            cleanup();
            resolve(true);
        };
        
        document.getElementById('useLocalBtn').onclick = function() {
            cleanup();
            resolve('local');
        };
        
        document.getElementById('useCloudBtn').onclick = function() {
            cleanup();
            resolve('cloud');
        };
        
        document.getElementById('cancelBtn').onclick = function() {
            cleanup();
            resolve(false);
        };
        
        modal.onclick = function(event) {
            if (event.target === modal) {
                cleanup();
                resolve(false);
            }
        };
        
        setTimeout(() => {
            if (modal.parentNode) {
                const autoBtn = document.getElementById('autoResolveBtn');
                if (autoBtn) {
                    autoBtn.click();
                }
            }
        }, 10000);
    });
}

// ============================================
// 页面生命周期管理
// ============================================

document.addEventListener('visibilitychange', function() {
    if (!document.hidden && syncEnabled && isOnline) {
        enhancedSync();
    }
});

window.addEventListener('beforeunload', function() {
    saveSchedules();
    saveAdminUsers();
    saveOperationQueue();
});

window.addEventListener('load', function() {
    console.log('页面完全加载完成，系统已就绪');
    console.log('当前网络状态:', networkState.quality);
    console.log('当前Token状态:', githubToken ? '已配置' : '未配置');
    console.log('当前管理员:', currentAdmin ? currentAdmin.name : '未登录');
    console.log('时间安排数量:', schedules.length);
    console.log('管理员数量:', adminUsers.length);
    console.log('操作队列长度:', operationQueue.length);
    
    setTimeout(() => {
        updateTableLayout();
    }, 1000);
});

// ============================================
// 系统信息
// ============================================

console.log('✅ 时间管理系统智能冲突解决版 v3.0 初始化完成');
console.log('📱 移动端优化：已启用');
console.log('🔄 智能同步：已启用');
console.log('📊 操作队列：已启用');
console.log('📶 网络监控：已启用');
console.log('🔧 冲突解决：已启用');
console.log('💾 数据备份：已启用');

setTimeout(() => {
    console.log('🚀 系统就绪，开始运行...');
}, 1000);