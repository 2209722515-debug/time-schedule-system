// ============================================
// 时间管理系统 - 自动实时同步版
// ============================================

// 配置
const CONFIG = {
    // 默认管理员
    defaultAdmin: {
        username: 'admin',
        password: 'admin123',
        name: '系统管理员'
    },
    
    // 数据存储键名
    storageKeys: {
        schedules: 'team_time_schedules_v5',
        adminUsers: 'admin_users_config_v5',
        loginInfo: 'admin_login_info_v5',
        syncSettings: 'sync_settings_v2',
        deviceId: 'device_id_v1'
    },
    
    // 日期范围
    minDate: '2024-01-01',
    maxDate: '2035-12-31',
    
    // 同步配置
    sync: {
        interval: 30000, // 30秒同步一次
        debounce: 2000,  // 防抖延迟
        retryInterval: 5000, // 重试间隔
        maxRetries: 3, // 最大重试次数
        conflictStrategy: 'merge' // 冲突解决策略：merge, local, cloud
    }
};

// 全局变量
let schedules = [];
let adminUsers = [];
let currentAdmin = null;
let currentDate = '';
let selectedStatus = 'free';
let autoSyncManager = null;
let isOnline = navigator.onLine;

// ============================================
// 自动同步管理器
// ============================================

class AutoSyncManager {
    constructor() {
        this.syncEnabled = false;
        this.syncKey = null;
        this.deviceId = null;
        this.lastSyncTime = 0;
        this.isSyncing = false;
        this.retryCount = 0;
        this.syncInterval = null;
        this.syncTimeout = null;
        this.connectedDevices = new Set();
        this.conflictQueue = [];
        this.autoResolve = true;
        
        this.init();
    }
    
    init() {
        // 加载设置
        this.loadSettings();
        
        // 生成设备ID
        this.deviceId = this.getDeviceId();
        
        // 初始化事件监听
        this.initEventListeners();
        
        // 更新UI状态
        this.updateUI();
        
        // 检查URL中的同步密钥
        this.checkUrlSyncKey();
        
        console.log('同步管理器初始化完成，设备ID:', this.deviceId);
    }
    
    loadSettings() {
        try {
            const settings = localStorage.getItem(CONFIG.storageKeys.syncSettings);
            if (settings) {
                const parsed = JSON.parse(settings);
                this.syncEnabled = parsed.syncEnabled || false;
                this.syncKey = parsed.syncKey || this.generateSyncKey();
                this.lastSyncTime = parsed.lastSyncTime || 0;
                this.autoResolve = parsed.autoResolve !== false;
            } else {
                this.syncKey = this.generateSyncKey();
                this.saveSettings();
            }
        } catch (error) {
            console.error('加载同步设置失败:', error);
            this.syncKey = this.generateSyncKey();
            this.saveSettings();
        }
    }
    
    saveSettings() {
        const settings = {
            syncEnabled: this.syncEnabled,
            syncKey: this.syncKey,
            lastSyncTime: this.lastSyncTime,
            autoResolve: this.autoResolve
        };
        localStorage.setItem(CONFIG.storageKeys.syncSettings, JSON.stringify(settings));
    }
    
    generateSyncKey() {
        // 生成一个随机的同步密钥
        const key = 'team_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
        console.log('生成新的同步密钥:', key);
        return key;
    }
    
    getDeviceId() {
        let deviceId = localStorage.getItem(CONFIG.storageKeys.deviceId);
        if (!deviceId) {
            deviceId = 'device_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
            localStorage.setItem(CONFIG.storageKeys.deviceId, deviceId);
        }
        return deviceId;
    }
    
    initEventListeners() {
        // 网络状态监听
        window.addEventListener('online', () => {
            isOnline = true;
            this.updateNetworkStatus();
            if (this.syncEnabled) {
                this.syncNow();
            }
        });
        
        window.addEventListener('offline', () => {
            isOnline = false;
            this.updateNetworkStatus();
        });
        
        // 页面可见性监听
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && this.syncEnabled && isOnline) {
                this.syncNow();
            }
        });
        
        // Storage事件监听（多标签页同步）
        window.addEventListener('storage', (event) => {
            this.handleStorageEvent(event);
        });
        
        // 心跳检测
        this.startHeartbeat();
    }
    
    startHeartbeat() {
        // 每10秒发送一次心跳
        setInterval(() => {
            if (this.syncEnabled && isOnline) {
                this.sendHeartbeat();
            }
        }, 10000);
    }
    
    sendHeartbeat() {
        const heartbeat = {
            type: 'heartbeat',
            deviceId: this.deviceId,
            syncKey: this.syncKey,
            timestamp: Date.now()
        };
        
        // 保存到localStorage触发storage事件
        localStorage.setItem(`sync_heartbeat_${this.syncKey}_${this.deviceId}`, JSON.stringify(heartbeat));
        
        // 更新设备列表
        this.updateDeviceList();
    }
    
    updateDeviceList() {
        const devices = new Set();
        const now = Date.now();
        
        // 扫描所有心跳记录
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(`sync_heartbeat_${this.syncKey}_`)) {
                try {
                    const heartbeat = JSON.parse(localStorage.getItem(key));
                    // 只保留30秒内的心跳
                    if (now - heartbeat.timestamp < 30000) {
                        const deviceId = key.split('_').pop();
                        devices.add(deviceId);
                    } else {
                        // 删除过期心跳
                        localStorage.removeItem(key);
                    }
                } catch (error) {
                    // 忽略无效数据
                }
            }
        }
        
        this.connectedDevices = devices;
        this.updateDeviceCount();
    }
    
    updateDeviceCount() {
        const count = this.connectedDevices.size;
        const countEl = document.getElementById('onlineCount');
        if (countEl) {
            countEl.textContent = count;
            countEl.title = `${count}个设备在线`;
        }
        
        const deviceCountEl = document.getElementById('syncDeviceCount');
        if (deviceCountEl) {
            deviceCountEl.textContent = `${count}台`;
        }
    }
    
    handleStorageEvent(event) {
        if (!event.key || !this.syncEnabled) return;
        
        // 处理心跳事件
        if (event.key.startsWith(`sync_heartbeat_${this.syncKey}_`)) {
            this.updateDeviceList();
            return;
        }
        
        // 处理数据同步事件
        if (event.key === `sync_data_${this.syncKey}` && event.newValue) {
            try {
                const newData = JSON.parse(event.newValue);
                if (newData && newData.deviceId !== this.deviceId) {
                    console.log('收到其他设备的数据更新:', newData.deviceId);
                    
                    // 延迟执行避免重复处理
                    clearTimeout(this.syncTimeout);
                    this.syncTimeout = setTimeout(() => {
                        this.handleIncomingData(newData);
                    }, 1000);
                }
            } catch (error) {
                console.error('解析同步数据失败:', error);
            }
        }
    }
    
    async enableSync() {
        if (this.syncEnabled) return;
        
        this.syncEnabled = true;
        this.saveSettings();
        
        // 首次同步
        await this.uploadData();
        
        // 启动定时同步
        this.startSyncInterval();
        
        // 更新UI
        this.updateUI();
        this.updateDeviceList();
        
        showMessage('实时同步已启用', 'success');
        console.log('实时同步已启用，同步密钥:', this.syncKey);
    }
    
    disableSync() {
        this.syncEnabled = false;
        this.saveSettings();
        
        // 停止定时同步
        this.stopSyncInterval();
        
        // 更新UI
        this.updateUI();
        
        showMessage('实时同步已禁用', 'info');
    }
    
    startSyncInterval() {
        if (this.syncInterval) clearInterval(this.syncInterval);
        
        this.syncInterval = setInterval(() => {
            if (this.syncEnabled && isOnline && !this.isSyncing) {
                this.syncNow();
            }
        }, CONFIG.sync.interval);
    }
    
    stopSyncInterval() {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
        }
    }
    
    async syncNow() {
        if (!this.syncEnabled || !isOnline || this.isSyncing) {
            return;
        }
        
        this.isSyncing = true;
        this.updateSyncIndicator(true);
        
        try {
            console.log('开始数据同步...');
            
            // 1. 下载云端数据
            const cloudData = await this.downloadData();
            
            // 2. 处理数据
            if (cloudData) {
                await this.processIncomingData(cloudData);
            }
            
            // 3. 上传本地数据
            await this.uploadData();
            
            // 4. 更新同步时间
            this.lastSyncTime = Date.now();
            this.saveSettings();
            this.retryCount = 0;
            
            console.log('数据同步完成');
            this.updateLastSyncTime();
            
        } catch (error) {
            console.error('同步失败:', error);
            this.retryCount++;
            
            if (this.retryCount <= CONFIG.sync.maxRetries) {
                console.log(`将在${CONFIG.sync.retryInterval/1000}秒后重试...`);
                setTimeout(() => this.syncNow(), CONFIG.sync.retryInterval);
            } else {
                showMessage('同步失败，请检查网络连接', 'error');
            }
        } finally {
            this.isSyncing = false;
            this.updateSyncIndicator(false);
        }
    }
    
    scheduleSync() {
        // 防抖处理
        clearTimeout(this.syncTimeout);
        this.syncTimeout = setTimeout(() => {
            if (this.syncEnabled && isOnline && !this.isSyncing) {
                this.syncNow();
            }
        }, CONFIG.sync.debounce);
    }
    
    async uploadData() {
        const data = {
            type: 'sync',
            deviceId: this.deviceId,
            syncKey: this.syncKey,
            schedules: JSON.parse(JSON.stringify(schedules)), // 深拷贝
            adminUsers: JSON.parse(JSON.stringify(adminUsers)),
            timestamp: Date.now(),
            version: '2.0'
        };
        
        // 保存到localStorage触发storage事件
        localStorage.setItem(`sync_data_${this.syncKey}`, JSON.stringify(data));
        
        // 同时保存到IndexedDB
        await this.saveToIndexedDB(data);
        
        console.log('数据已上传，时间安排:', data.schedules.length, '条');
        return data;
    }
    
    async downloadData() {
        try {
            // 从localStorage获取最新的同步数据
            const dataStr = localStorage.getItem(`sync_data_${this.syncKey}`);
            
            if (dataStr) {
                const data = JSON.parse(dataStr);
                
                // 忽略自己上传的数据
                if (data.deviceId !== this.deviceId) {
                    return data;
                }
            }
            
            // 或从IndexedDB获取
            return await this.loadFromIndexedDB();
            
        } catch (error) {
            console.error('下载数据失败:', error);
            return null;
        }
    }
    
    async handleIncomingData(incomingData) {
        if (!incomingData || incomingData.deviceId === this.deviceId) {
            return;
        }
        
        console.log('处理来自设备', incomingData.deviceId, '的数据');
        
        // 检查时间戳，避免处理旧数据
        if (incomingData.timestamp <= this.lastSyncTime) {
            console.log('忽略旧数据');
            return;
        }
        
        await this.processIncomingData(incomingData);
    }
    
    async processIncomingData(incomingData) {
        if (!incomingData.schedules || !incomingData.adminUsers) {
            return;
        }
        
        const localSchedules = schedules;
        const localAdmins = adminUsers;
        const cloudSchedules = incomingData.schedules;
        const cloudAdmins = incomingData.adminUsers;
        
        // 检查冲突
        const conflicts = this.detectConflicts(localSchedules, cloudSchedules);
        
        if (conflicts.length > 0) {
            console.log('发现', conflicts.length, '个冲突');
            
            if (this.autoResolve) {
                // 自动解决冲突
                this.autoResolveConflicts(conflicts, localSchedules, cloudSchedules);
            } else {
                // 添加到冲突队列等待手动解决
                this.conflictQueue.push({
                    conflicts: conflicts,
                    cloudData: incomingData
                });
                this.showConflictNotification();
                return;
            }
        }
        
        // 合并数据
        this.mergeSchedules(localSchedules, cloudSchedules);
        this.mergeAdmins(localAdmins, cloudAdmins);
        
        // 保存并刷新
        saveSchedules();
        saveAdminUsers();
        loadSchedules();
        
        showMessage('数据已同步更新', 'info');
    }
    
    detectConflicts(localSchedules, cloudSchedules) {
        const conflicts = [];
        const localMap = new Map();
        const cloudMap = new Map();
        
        // 构建ID映射
        localSchedules.forEach(s => localMap.set(s.id, s));
        cloudSchedules.forEach(s => cloudMap.set(s.id, s));
        
        // 检查冲突
        for (const [id, localSchedule] of localMap) {
            const cloudSchedule = cloudMap.get(id);
            if (cloudSchedule) {
                // 检查内容是否相同
                if (!this.isScheduleEqual(localSchedule, cloudSchedule)) {
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
    
    isScheduleEqual(s1, s2) {
        return s1.date === s2.date &&
               s1.startTime === s2.startTime &&
               s1.endTime === s2.endTime &&
               s1.status === s2.status &&
               s1.adminName === s2.adminName;
    }
    
    autoResolveConflicts(conflicts, localSchedules, cloudSchedules) {
        // 简单的自动解决策略：保留最新的修改
        conflicts.forEach(conflict => {
            const localTime = new Date(conflict.local.updatedAt || conflict.local.createdAt || 0).getTime();
            const cloudTime = new Date(conflict.cloud.updatedAt || conflict.cloud.createdAt || 0).getTime();
            
            if (cloudTime > localTime) {
                // 使用云端版本
                const index = localSchedules.findIndex(s => s.id === conflict.id);
                if (index !== -1) {
                    localSchedules[index] = JSON.parse(JSON.stringify(conflict.cloud));
                }
            }
            // 否则保留本地版本（不需要操作）
        });
        
        console.log('已自动解决', conflicts.length, '个冲突');
    }
    
    mergeSchedules(localSchedules, cloudSchedules) {
        const scheduleMap = new Map();
        
        // 先添加所有本地计划
        localSchedules.forEach(schedule => {
            if (schedule.id) {
                scheduleMap.set(schedule.id, schedule);
            }
        });
        
        // 添加或更新云端计划
        cloudSchedules.forEach(cloudSchedule => {
            const existing = scheduleMap.get(cloudSchedule.id);
            if (!existing) {
                // 云端有本地没有，添加
                scheduleMap.set(cloudSchedule.id, cloudSchedule);
            } else {
                // 保留最新的（已在冲突解决中处理）
                // 这里主要是处理新增的计划
            }
        });
        
        // 更新数组
        schedules.length = 0;
        scheduleMap.forEach(schedule => {
            schedules.push(schedule);
        });
    }
    
    mergeAdmins(localAdmins, cloudAdmins) {
        const adminMap = new Map();
        
        // 添加本地管理员
        localAdmins.forEach(admin => adminMap.set(admin.username, admin));
        
        // 添加云端管理员（不覆盖密码）
        cloudAdmins.forEach(cloudAdmin => {
            if (!adminMap.has(cloudAdmin.username)) {
                adminMap.set(cloudAdmin.username, {
                    ...cloudAdmin,
                    password: 'default123' // 设置默认密码
                });
            }
        });
        
        // 更新数组
        adminUsers.length = 0;
        adminMap.forEach(admin => adminUsers.push(admin));
    }
    
    async saveToIndexedDB(data) {
        return new Promise((resolve, reject) => {
            if (!window.indexedDB) {
                resolve(); // 不支持IndexedDB
                return;
            }
            
            const request = indexedDB.open('TimeSyncDB', 1);
            
            request.onupgradeneeded = function(event) {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('syncData')) {
                    db.createObjectStore('syncData', { keyPath: 'syncKey' });
                }
            };
            
            request.onsuccess = function(event) {
                const db = event.target.result;
                const transaction = db.transaction(['syncData'], 'readwrite');
                const store = transaction.objectStore('syncData');
                
                const saveRequest = store.put({
                    syncKey: data.syncKey,
                    data: data,
                    timestamp: Date.now()
                });
                
                saveRequest.onsuccess = () => resolve();
                saveRequest.onerror = () => reject(saveRequest.error);
            };
            
            request.onerror = function(event) {
                reject(event.target.error);
            };
        });
    }
    
    async loadFromIndexedDB() {
        return new Promise((resolve, reject) => {
            if (!window.indexedDB) {
                resolve(null);
                return;
            }
            
            const request = indexedDB.open('TimeSyncDB', 1);
            
            request.onsuccess = function(event) {
                const db = event.target.result;
                
                if (!db.objectStoreNames.contains('syncData')) {
                    resolve(null);
                    return;
                }
                
                const transaction = db.transaction(['syncData'], 'readonly');
                const store = transaction.objectStore('syncData');
                const getRequest = store.get(autoSyncManager.syncKey);
                
                getRequest.onsuccess = function() {
                    resolve(getRequest.result ? getRequest.result.data : null);
                };
                
                getRequest.onerror = function() {
                    reject(getRequest.error);
                };
            };
            
            request.onerror = function(event) {
                reject(event.target.error);
            };
        });
    }
    
    checkUrlSyncKey() {
        const urlParams = new URLSearchParams(window.location.search);
        const urlSyncKey = urlParams.get('syncKey');
        
        if (urlSyncKey && urlSyncKey !== this.syncKey) {
            this.joinSync(urlSyncKey);
        }
    }
    
    joinSync(syncKey) {
        if (!syncKey || syncKey === this.syncKey) return false;
        
        const confirmed = confirm(`是否加入同步组？\n同步密钥：${syncKey}\n\n加入后，您的数据将与团队同步。`);
        
        if (confirmed) {
            this.syncKey = syncKey;
            this.syncEnabled = true;
            this.saveSettings();
            this.updateUI();
            
            // 立即同步
            this.syncNow();
            
            showMessage('已加入团队同步', 'success');
            return true;
        }
        
        return false;
    }
    
    shareSync() {
        const shareUrl = `${window.location.origin}${window.location.pathname}?syncKey=${encodeURIComponent(this.syncKey)}`;
        
        // 尝试使用Web Share API
        if (navigator.share) {
            navigator.share({
                title: '时间管理系统 - 加入同步',
                text: '点击链接加入时间管理同步组',
                url: shareUrl
            }).catch(console.error);
        } else {
            // 降级方案：复制到剪贴板
            navigator.clipboard.writeText(shareUrl).then(() => {
                showMessage('同步链接已复制到剪贴板，分享给团队成员即可加入同步', 'success');
            }).catch(() => {
                prompt('请复制以下链接分享给团队成员：', shareUrl);
            });
        }
    }
    
    resetSync() {
        const confirmed = confirm('确定要重置同步吗？这将清除所有同步数据，但不会删除本地数据。');
        
        if (confirmed) {
            // 删除同步相关的localStorage数据
            for (let key in localStorage) {
                if (key.startsWith('sync_') || key === CONFIG.storageKeys.syncSettings) {
                    localStorage.removeItem(key);
                }
            }
            
            // 重置管理器
            this.syncKey = this.generateSyncKey();
            this.syncEnabled = false;
            this.connectedDevices.clear();
            this.saveSettings();
            this.updateUI();
            this.updateDeviceList();
            
            showMessage('同步已重置', 'success');
        }
    }
    
    updateUI() {
        // 更新同步开关
        const toggle = document.getElementById('syncToggle');
        if (toggle) {
            toggle.checked = this.syncEnabled;
        }
        
        // 更新自动解决开关
        const resolveToggle = document.getElementById('autoResolveToggle');
        if (resolveToggle) {
            resolveToggle.checked = this.autoResolve;
        }
        
        // 更新同步密钥显示
        const keyDisplay = document.getElementById('syncKeyDisplay');
        if (keyDisplay) {
            keyDisplay.textContent = this.syncKey || '未生成';
        }
        
        // 更新设备ID显示
        const deviceDisplay = document.getElementById('deviceIdDisplay');
        if (deviceDisplay) {
            deviceDisplay.textContent = this.deviceId;
        }
        
        // 更新同步状态
        const statusEl = document.getElementById('syncActiveStatus');
        if (statusEl) {
            if (this.syncEnabled) {
                statusEl.innerHTML = '<i class="fas fa-sync fa-spin"></i> 同步中';
                statusEl.className = 'status-value active';
            } else {
                statusEl.innerHTML = '<i class="fas fa-pause-circle"></i> 未启用';
                statusEl.className = 'status-value inactive';
            }
        }
        
        // 更新同步徽章
        const badge = document.getElementById('syncBadge');
        if (badge) {
            badge.style.display = this.syncEnabled ? 'inline-flex' : 'none';
        }
        
        // 更新页脚状态
        const footerStatus = document.getElementById('footerSyncStatus');
        if (footerStatus) {
            footerStatus.textContent = this.syncEnabled ? '实时同步已启用' : '同步已禁用';
            footerStatus.style.color = this.syncEnabled ? '#2ecc71' : '#95a5a6';
        }
        
        // 更新主界面状态文本
        const statusText = document.getElementById('syncStatusText');
        if (statusText) {
            if (this.syncEnabled) {
                statusText.textContent = `实时同步 ${this.connectedDevices.size}台设备`;
                statusText.style.display = 'inline';
            } else {
                statusText.style.display = 'none';
            }
        }
    }
    
    updateNetworkStatus() {
        const networkEl = document.getElementById('networkStatus');
        const syncNetworkEl = document.getElementById('syncNetworkStatus');
        
        if (isOnline) {
            if (networkEl) {
                networkEl.innerHTML = '<i class="fas fa-wifi"></i> 在线';
                networkEl.className = 'network-status online';
                setTimeout(() => {
                    networkEl.style.display = 'none';
                }, 3000);
            }
            if (syncNetworkEl) {
                syncNetworkEl.innerHTML = '<i class="fas fa-wifi"></i> 在线';
                syncNetworkEl.className = 'status-value online';
            }
        } else {
            if (networkEl) {
                networkEl.innerHTML = '<i class="fas fa-wifi-slash"></i> 离线';
                networkEl.className = 'network-status offline';
                networkEl.style.display = 'block';
            }
            if (syncNetworkEl) {
                syncNetworkEl.innerHTML = '<i class="fas fa-wifi-slash"></i> 离线';
                syncNetworkEl.className = 'status-value offline';
            }
        }
        
        this.updateSyncIndicator();
    }
    
    updateSyncIndicator(syncing = false) {
        const indicator = document.getElementById('syncIndicator');
        if (!indicator) return;
        
        if (syncing) {
            indicator.innerHTML = '<i class="fas fa-sync fa-spin"></i>';
            indicator.className = 'sync-indicator syncing';
        } else if (!isOnline) {
            indicator.innerHTML = '<i class="fas fa-wifi-slash"></i>';
            indicator.className = 'sync-indicator offline';
        } else if (this.syncEnabled) {
            indicator.innerHTML = '<i class="fas fa-cloud"></i>';
            indicator.className = 'sync-indicator online';
        } else {
            indicator.innerHTML = '<i class="fas fa-cloud-slash"></i>';
            indicator.className = 'sync-indicator inactive';
        }
    }
    
    updateLastSyncTime() {
        const timeEl = document.getElementById('syncLastTime');
        if (timeEl) {
            if (this.lastSyncTime > 0) {
                timeEl.textContent = new Date(this.lastSyncTime).toLocaleTimeString('zh-CN');
            } else {
                timeEl.textContent = '从未同步';
            }
        }
    }
    
    showConflictNotification() {
        const notification = document.createElement('div');
        notification.className = 'conflict-notification';
        notification.innerHTML = `
            <div class="notification-content">
                <i class="fas fa-exclamation-triangle text-warning"></i>
                <span>发现数据冲突，需要解决</span>
                <button onclick="showConflictResolver()" class="btn btn-sm btn-warning">
                    立即处理
                </button>
            </div>
        `;
        
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: white;
            border: 2px solid #f39c12;
            border-radius: 8px;
            padding: 15px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 9999;
            max-width: 300px;
        `;
        
        document.body.appendChild(notification);
        
        // 5秒后自动消失
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 5000);
    }
}

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
    initAutoSync();
    checkForScrollHint();
});

function initToastr() {
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

function initData() {
    console.log('初始化数据...');
    // 加载时间安排
    try {
        const savedSchedules = localStorage.getItem(CONFIG.storageKeys.schedules);
        schedules = savedSchedules ? JSON.parse(savedSchedules) : [];
        console.log(`加载了 ${schedules.length} 条时间安排`);
    } catch (error) {
        schedules = [];
        console.error('加载时间安排失败：', error);
    }
    
    // 加载管理员配置
    try {
        const savedAdmins = localStorage.getItem(CONFIG.storageKeys.adminUsers);
        if (savedAdmins) {
            adminUsers = JSON.parse(savedAdmins);
            console.log(`加载了 ${adminUsers.length} 个管理员`);
        } else {
            adminUsers = [CONFIG.defaultAdmin];
            saveAdminUsers();
            showMessage('默认管理员已创建：admin / admin123', 'info');
        }
    } catch (error) {
        adminUsers = [CONFIG.defaultAdmin];
        console.error('加载管理员配置失败：', error);
    }
    
    // 检查登录状态
    checkLoginStatus();
}

function initUI() {
    console.log('初始化UI...');
    initDatePicker();
    setToday();
    updateUserUI();
    loadSchedules();
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
    
    // 监听窗口大小变化
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
    
    // 检查是否需要滚动提示
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
// 初始化自动同步
// ============================================

function initAutoSync() {
    autoSyncManager = new AutoSyncManager();
    autoSyncManager.updateNetworkStatus();
}

// ============================================
// 状态选择函数
// ============================================

function selectStatus(status) {
    selectedStatus = status;
    
    // 更新按钮样式
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
// 登录系统
// ============================================

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
    
    // 登录按钮状态
    const loginBtn = document.querySelector('#loginModal .btn-primary');
    if (loginBtn) {
        loginBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 登录中';
        loginBtn.disabled = true;
    }
    
    // 模拟网络延迟
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
        
    } else {
        showMessage('账号或密码错误', 'error');
        if (passwordInput) {
            passwordInput.value = '';
            passwordInput.focus();
        }
    }
    
    // 恢复登录按钮状态
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
        // 已登录状态
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
        alertMessage.textContent = `管理员模式`;
        systemAlert.style.background = 'linear-gradient(135deg, #2ecc71 0%, #27ae60 100%)';
        
    } else {
        // 未登录状态
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
    
    // 检查滚动提示
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
    
    // 清空输入框
    startTimeInput.value = '';
    endTimeInput.value = '';
    
    showMessage('时间段添加成功', 'success');
    
    // 触发同步
    if (autoSyncManager && autoSyncManager.syncEnabled) {
        autoSyncManager.scheduleSync();
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
            
            // 触发同步
            if (autoSyncManager && autoSyncManager.syncEnabled) {
                autoSyncManager.scheduleSync();
            }
        }
    }
}

// ============================================
// 同步相关函数
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
        
        // 更新数据版本显示
        const versionEl = document.getElementById('dataVersionDisplay');
        if (versionEl) {
            versionEl.textContent = `v2.0 (${schedules.length}条记录)`;
        }
        
        if (autoSyncManager) {
            autoSyncManager.updateLastSyncTime();
        }
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
    if (!currentAdmin) {
        showMessage('请先登录管理员账号', 'warning');
        return;
    }
    
    const toggle = document.getElementById('syncToggle');
    if (!toggle || !autoSyncManager) return;
    
    if (toggle.checked) {
        autoSyncManager.enableSync();
    } else {
        autoSyncManager.disableSync();
    }
}

function toggleAutoResolve() {
    const toggle = document.getElementById('autoResolveToggle');
    if (!toggle || !autoSyncManager) return;
    
    autoSyncManager.autoResolve = toggle.checked;
    autoSyncManager.saveSettings();
    
    showMessage(`自动冲突解决已${toggle.checked ? '启用' : '禁用'}`, 'info');
}

function shareTeamSync() {
    if (!currentAdmin) {
        showMessage('请先登录管理员账号', 'warning');
        return;
    }
    
    if (!autoSyncManager) return;
    
    if (!autoSyncManager.syncEnabled) {
        const confirmed = confirm('需要先启用自动同步才能分享。是否现在启用？');
        if (confirmed) {
            autoSyncManager.enableSync();
            setTimeout(() => autoSyncManager.shareSync(), 1000);
        }
    } else {
        autoSyncManager.shareSync();
    }
}

function forceSyncNow() {
    if (!autoSyncManager || !autoSyncManager.syncEnabled) {
        showMessage('请先启用自动同步', 'warning');
        return;
    }
    
    autoSyncManager.syncNow();
}

function copySyncKey() {
    if (!autoSyncManager || !autoSyncManager.syncKey) {
        showMessage('同步密钥未生成', 'warning');
        return;
    }
    
    navigator.clipboard.writeText(autoSyncManager.syncKey).then(() => {
        showMessage('同步密钥已复制', 'success');
    }).catch(() => {
        const keyDisplay = document.getElementById('syncKeyDisplay');
        if (keyDisplay) {
            const range = document.createRange();
            range.selectNode(keyDisplay);
            window.getSelection().removeAllRanges();
            window.getSelection().addRange(range);
            showMessage('密钥已选中，请按Ctrl+C复制', 'info');
        }
    });
}

function resetSync() {
    if (!autoSyncManager) return;
    autoSyncManager.resetSync();
}

// ============================================
// 管理员设置
// ============================================

function openAdminSettings() {
    if (!currentAdmin) {
        showMessage('请先登录管理员账号', 'warning');
        return;
    }
    
    const modal = document.getElementById('adminSettingsModal');
    if (modal) {
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
        
        // 显示当前账号信息
        const currentAccountEl = document.getElementById('currentAccount');
        const editAdminNameEl = document.getElementById('editAdminName');
        
        if (currentAccountEl) currentAccountEl.textContent = currentAdmin.username;
        if (editAdminNameEl) editAdminNameEl.value = currentAdmin.name;
        
        loadAdminList();
        
        setTimeout(() => {
            if (editAdminNameEl) editAdminNameEl.focus();
        }, 100);
    }
}

function hideAdminSettings() {
    const modal = document.getElementById('adminSettingsModal');
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = '';
        
        // 清空表单
        const inputs = modal.querySelectorAll('input[type="password"], input[type="text"]');
        inputs.forEach(input => {
            if (input.id !== 'editAdminName') {
                input.value = '';
            }
        });
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
    
    // 更新当前管理员昵称
    const adminIndex = adminUsers.findIndex(admin => admin.username === currentAdmin.username);
    if (adminIndex !== -1) {
        adminUsers[adminIndex].name = newName;
        currentAdmin.name = newName;
        
        saveAdminUsers();
        
        // 更新所有相关的时间安排
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
        
        // 触发同步
        if (autoSyncManager && autoSyncManager.syncEnabled) {
            autoSyncManager.scheduleSync();
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
        
        // 清空密码字段
        currentPasswordEl.value = '';
        newPasswordEl.value = '';
        confirmPasswordEl.value = '';
        
        showMessage('密码修改成功', 'success');
        
        // 触发同步
        if (autoSyncManager && autoSyncManager.syncEnabled) {
            autoSyncManager.scheduleSync();
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
        name: name
    };
    
    adminUsers.push(newAdmin);
    saveAdminUsers();
    loadAdminList();
    
    // 清空表单
    usernameInput.value = '';
    passwordInput.value = '';
    nameInput.value = '';
    
    showMessage(`管理员 ${name} 添加成功`, 'success');
    
    // 触发同步
    if (autoSyncManager && autoSyncManager.syncEnabled) {
        autoSyncManager.scheduleSync();
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
    
    const confirmed = await customConfirm(`确定要移除管理员 ${adminToRemove.name} 吗？`);
    if (confirmed) {
        adminUsers.splice(index, 1);
        saveAdminUsers();
        loadAdminList();
        showMessage('管理员移除成功', 'success');
        
        // 触发同步
        if (autoSyncManager && autoSyncManager.syncEnabled) {
            autoSyncManager.scheduleSync();
        }
    }
}

// ============================================
// 数据管理
// ============================================

function saveSchedules() {
    try {
        localStorage.setItem(CONFIG.storageKeys.schedules, JSON.stringify(schedules));
        console.log('时间安排已保存');
        
        // 触发同步
        if (autoSyncManager && autoSyncManager.syncEnabled && !autoSyncManager.isSyncing) {
            autoSyncManager.scheduleSync();
        }
    } catch (error) {
        console.error('数据保存失败：', error);
        showMessage('数据保存失败，请检查存储空间', 'error');
    }
}

function saveAdminUsers() {
    try {
        localStorage.setItem(CONFIG.storageKeys.adminUsers, JSON.stringify(adminUsers));
        console.log('管理员配置已保存');
        
        // 触发同步
        if (autoSyncManager && autoSyncManager.syncEnabled && !autoSyncManager.isSyncing) {
            autoSyncManager.scheduleSync();
        }
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
        version: '2.0',
        exportTime: new Date().toISOString(),
        totalSchedules: schedules.length,
        schedules: schedules,
        adminUsers: adminUsers.map(admin => ({
            username: admin.username,
            name: admin.name
        })),
        syncKey: autoSyncManager ? autoSyncManager.syncKey : null
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
                
                // 触发同步
                if (autoSyncManager && autoSyncManager.syncEnabled) {
                    autoSyncManager.scheduleSync();
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
// 云同步功能（GitHub Gist）
// ============================================

let gistSync = null;

class GitHubGistSync {
    constructor() {
        this.gistId = null;
        this.githubToken = '';
        this.gistFilename = 'time_schedule_backup.json';
    }

    setToken(token) {
        this.githubToken = token;
        localStorage.setItem('github_token', token);
        showMessage('GitHub Token已设置', 'success');
    }

    async backupToCloud() {
        if (!this.githubToken) {
            showMessage('请先设置GitHub Token', 'warning');
            return false;
        }

        const data = {
            schedules: schedules,
            adminUsers: adminUsers.map(admin => ({
                username: admin.username,
                name: admin.name
            })),
            syncKey: autoSyncManager ? autoSyncManager.syncKey : null,
            backupTime: new Date().toISOString(),
            version: '2.0'
        };

        const gistData = {
            description: `时间管理系统备份 ${new Date().toLocaleDateString('zh-CN')}`,
            public: false,
            files: {
                [this.gistFilename]: {
                    content: JSON.stringify(data, null, 2)
                }
            }
        };

        try {
            let url = 'https://api.github.com/gists';
            let method = 'POST';

            if (this.gistId) {
                url = `https://api.github.com/gists/${this.gistId}`;
                method = 'PATCH';
            }

            const response = await fetch(url, {
                method: method,
                headers: {
                    'Authorization': `token ${this.githubToken}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/vnd.github.v3+json'
                },
                body: JSON.stringify(gistData)
            });

            const result = await response.json();
            
            if (result.id) {
                this.gistId = result.id;
                showMessage('数据已备份到GitHub Gist', 'success');
                return true;
            }
        } catch (error) {
            console.error('Gist备份失败:', error);
            showMessage('备份失败: ' + error.message, 'error');
        }
        return false;
    }

    async restoreFromCloud() {
        if (!this.gistId || !this.githubToken) {
            showMessage('请先备份数据到云端', 'warning');
            return false;
        }

        try {
            const response = await fetch(`https://api.github.com/gists/${this.gistId}`, {
                headers: {
                    'Authorization': `token ${this.githubToken}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });

            const gist = await response.json();
            const fileContent = gist.files[this.gistFilename].content;
            const data = JSON.parse(fileContent);

            const confirmed = await customConfirm(
                `确定要从云端恢复数据吗？\n备份时间：${data.backupTime}\n时间安排：${data.schedules.length}条\n注意：这会覆盖当前数据！`
            );
            
            if (confirmed) {
                schedules = data.schedules || [];
                
                // 合并管理员
                if (data.adminUsers) {
                    data.adminUsers.forEach(backupAdmin => {
                        if (!adminUsers.some(admin => admin.username === backupAdmin.username)) {
                            adminUsers.push({
                                username: backupAdmin.username,
                                password: 'default123',
                                name: backupAdmin.name
                            });
                        }
                    });
                }
                
                // 恢复同步密钥
                if (data.syncKey && autoSyncManager) {
                    autoSyncManager.syncKey = data.syncKey;
                    autoSyncManager.saveSettings();
                }
                
                saveSchedules();
                saveAdminUsers();
                loadSchedules();
                
                showMessage('已从云端恢复数据', 'success');
                return true;
            }
        } catch (error) {
            console.error('Gist恢复失败:', error);
            showMessage('恢复失败: ' + error.message, 'error');
        }
        return false;
    }
}

function setupGitHubSync() {
    const tokenInput = document.getElementById('githubToken');
    if (!tokenInput) return;
    
    const token = tokenInput.value.trim();
    if (!token) {
        showMessage('请输入GitHub Token', 'warning');
        return;
    }
    
    if (!gistSync) {
        gistSync = new GitHubGistSync();
    }
    
    gistSync.setToken(token);
    tokenInput.value = '';
}

async function backupToCloud() {
    if (!currentAdmin) {
        showMessage('请先登录管理员账号', 'warning');
        return;
    }
    
    if (!gistSync) {
        gistSync = new GitHubGistSync();
        
        const token = localStorage.getItem('github_token');
        if (!token) {
            showMessage('请先设置GitHub Token', 'warning');
            return;
        }
        gistSync.setToken(token);
    }
    
    await gistSync.backupToCloud();
}

async function restoreFromCloud() {
    if (!currentAdmin) {
        showMessage('请先登录管理员账号', 'warning');
        return;
    }
    
    if (!gistSync) {
        showMessage('请先备份数据到云端', 'warning');
        return;
    }
    
    await gistSync.restoreFromCloud();
}

// ============================================
// 工具函数
// ============================================

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

function timeToMinutes(time) {
    if (!time) return 0;
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + (minutes || 0);
}

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

function showMessage(message, type = 'info') {
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
}

// 自定义确认对话框
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
// 键盘快捷键支持
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
    
    // 登录模态框
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
    
    // 时间设置
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
}

function handleEscapeKey() {
    const loginModal = document.getElementById('loginModal');
    const syncModal = document.getElementById('syncSettingsModal');
    const adminModal = document.getElementById('adminSettingsModal');
    const conflictModal = document.getElementById('conflictModal');
    
    if (loginModal && loginModal.style.display === 'flex') {
        hideLoginModal();
    } else if (syncModal && syncModal.style.display === 'flex') {
        hideSyncSettings();
    } else if (adminModal && adminModal.style.display === 'flex') {
        hideAdminSettings();
    } else if (conflictModal && conflictModal.style.display === 'flex') {
        hideConflictModal();
    }
}

function setupInputKeyboard() {
    // 时间输入框
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
    
    // 登录输入框
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
}

// ============================================
// 冲突解决
// ============================================

function showConflictResolver() {
    if (!autoSyncManager || autoSyncManager.conflictQueue.length === 0) {
        return;
    }
    
    const conflictData = autoSyncManager.conflictQueue[0];
    const modal = document.getElementById('conflictModal');
    const preview = document.getElementById('conflictPreview');
    
    if (!modal || !preview) return;
    
    // 生成预览
    let previewHtml = '<ul>';
    conflictData.conflicts.forEach((conflict, index) => {
        previewHtml += `
            <li>
                <strong>${conflict.local.date} ${conflict.local.startTime}-${conflict.local.endTime}</strong><br>
                本地: ${conflict.local.adminName} (${new Date(conflict.local.updatedAt || conflict.local.createdAt).toLocaleString()})<br>
                云端: ${conflict.cloud.adminName} (${new Date(conflict.cloud.updatedAt || conflict.cloud.createdAt).toLocaleString()})
            </li>
        `;
    });
    previewHtml += '</ul>';
    preview.innerHTML = previewHtml;
    
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

function hideConflictModal() {
    const modal = document.getElementById('conflictModal');
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = '';
    }
}

function resolveConflict() {
    const modal = document.getElementById('conflictModal');
    if (!modal || !autoSyncManager || autoSyncManager.conflictQueue.length === 0) {
        return;
    }
    
    const resolveOption = document.querySelector('input[name="resolveOption"]:checked').value;
    const conflictData = autoSyncManager.conflictQueue.shift();
    
    // 应用解决方案
    switch (resolveOption) {
        case 'local':
            // 保留本地数据（不需要操作）
            break;
        case 'cloud':
            // 使用云端数据
            conflictData.conflicts.forEach(conflict => {
                const index = schedules.findIndex(s => s.id === conflict.id);
                if (index !== -1) {
                    schedules[index] = JSON.parse(JSON.stringify(conflict.cloud));
                }
            });
            saveSchedules();
            loadSchedules();
            break;
        case 'merge':
            // 智能合并
            autoSyncManager.autoResolveConflicts(conflictData.conflicts, schedules, conflictData.cloudData.schedules);
            saveSchedules();
            loadSchedules();
            break;
    }
    
    hideConflictModal();
    showMessage('冲突已解决', 'success');
    
    // 如果还有更多冲突，继续显示
    if (autoSyncManager.conflictQueue.length > 0) {
        setTimeout(showConflictResolver, 1000);
    }
}

// ============================================
// 页面生命周期管理
// ============================================

// 页面可见性变化
document.addEventListener('visibilitychange', function() {
    if (!document.hidden && autoSyncManager && autoSyncManager.syncEnabled && isOnline) {
        // 页面重新可见时同步数据
        autoSyncManager.syncNow();
    }
});

// 防止页面离开时数据丢失
window.addEventListener('beforeunload', function() {
    saveSchedules();
    saveAdminUsers();
});

// 页面加载完成
window.addEventListener('load', function() {
    console.log('页面完全加载完成');
    
    // 更新设备列表
    if (autoSyncManager) {
        autoSyncManager.updateDeviceList();
    }
    
    // 最终检查表格显示
    setTimeout(() => {
        updateTableLayout();
    }, 1000);
});

console.log('时间管理系统初始化完成，版本：自动实时同步版 v2.0');