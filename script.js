// ============================================
// 时间管理系统 - 网页优化版
// 修复所有问题：
// 1. 状态选择样式优化（使用按钮）
// 2. 系统管理员可以修改昵称
// 3. 管理员可以互相删除时间安排
// 4. 简化登录后显示（移除"欢迎"文字）
// 5. 添加键盘快捷键支持
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
        schedules: 'team_time_schedules_v3',
        adminUsers: 'admin_users_config_v3',
        loginInfo: 'admin_login_info_v3'
    },
    
    // 日期范围
    minDate: '2024-01-01',
    maxDate: '2035-12-31'
};

// 全局变量
let schedules = [];
let adminUsers = [];
let currentAdmin = null;
let currentDate = '';
let selectedStatus = 'free';

// ============================================
// 初始化函数
// ============================================

document.addEventListener('DOMContentLoaded', function() {
    initToastr();
    initData();
    initUI();
    initKeyboardSupport();
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
    // 加载时间安排
    try {
        const savedSchedules = localStorage.getItem(CONFIG.storageKeys.schedules);
        schedules = savedSchedules ? JSON.parse(savedSchedules) : [];
    } catch (error) {
        schedules = [];
    }
    
    // 加载管理员配置
    try {
        const savedAdmins = localStorage.getItem(CONFIG.storageKeys.adminUsers);
        if (savedAdmins) {
            adminUsers = JSON.parse(savedAdmins);
        } else {
            adminUsers = [CONFIG.defaultAdmin];
            saveAdminUsers();
            showMessage('默认管理员已创建：admin / admin123', 'info');
        }
    } catch (error) {
        adminUsers = [CONFIG.defaultAdmin];
    }
    
    // 检查登录状态
    checkLoginStatus();
}

function initUI() {
    initDatePicker();
    setToday();
    updateUserUI();
    loadSchedules();
}

function initDatePicker() {
    const datePicker = document.getElementById('datePicker');
    datePicker.min = CONFIG.minDate;
    datePicker.max = CONFIG.maxDate;
    
    datePicker.addEventListener('change', function() {
        currentDate = this.value;
        updateDateDisplay();
        loadSchedules();
    });
}

function setToday() {
    const today = new Date();
    currentDate = formatDate(today);
    
    const datePicker = document.getElementById('datePicker');
    datePicker.value = currentDate;
    
    updateDateDisplay();
}

function updateDateDisplay() {
    const dateDisplay = document.getElementById('currentDateDisplay');
    const weekDayDisplay = document.getElementById('weekDayDisplay');
    
    if (currentDate) {
        const date = new Date(currentDate);
        const formattedDate = formatDate(date, 'YYYY年MM月DD日');
        const weekDay = getWeekDay(date);
        
        dateDisplay.textContent = formattedDate;
        weekDayDisplay.textContent = weekDay;
    }
}

// ============================================
// 状态选择函数
// ============================================

function selectStatus(status) {
    selectedStatus = status;
    
    // 更新按钮样式
    const freeBtn = document.querySelector('.status-free');
    const busyBtn = document.querySelector('.status-busy');
    
    freeBtn.classList.remove('active');
    busyBtn.classList.remove('active');
    
    if (status === 'free') {
        freeBtn.classList.add('active');
    } else {
        busyBtn.classList.add('active');
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
    modal.style.display = 'flex';
    
    setTimeout(() => {
        document.getElementById('loginUsername').focus();
    }, 100);
}

function hideLoginModal() {
    document.getElementById('loginModal').style.display = 'none';
    document.getElementById('loginUsername').value = '';
    document.getElementById('loginPassword').value = '';
}

async function performLogin() {
    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value;
    
    if (!username || !password) {
        showMessage('请输入账号和密码', 'warning');
        return;
    }
    
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
        document.getElementById('loginPassword').value = '';
        document.getElementById('loginPassword').focus();
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
    
    if (currentAdmin) {
        // 已登录状态 - 简化显示
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
    
    const daySchedules = schedules.filter(schedule => schedule.date === currentDate);
    
    if (daySchedules.length === 0) {
        tableBody.innerHTML = '';
        emptyState.style.display = 'block';
        updateStats(0, 0);
        return;
    }
    
    daySchedules.sort((a, b) => {
        return timeToMinutes(a.startTime) - timeToMinutes(b.startTime);
    });
    
    let html = '';
    let freeCount = 0;
    let busyCount = 0;
    
    daySchedules.forEach((schedule, index) => {
        if (schedule.status === 'free') freeCount++;
        if (schedule.status === 'busy') busyCount++;
        
        html += `
            <tr>
                <td>
                    <strong>${schedule.startTime} - ${schedule.endTime}</strong>
                </td>
                <td>
                    <span class="status-cell status-${schedule.status}">
                        ${schedule.status === 'free' ? '空闲' : '繁忙'}
                    </span>
                </td>
                <td class="admin-cell">
                    <i class="fas fa-user-circle"></i>
                    <span>${schedule.adminName}</span>
                </td>
                <td class="action-buttons">
                    ${currentAdmin ? `
                        <button onclick="deleteSchedule(${index})" class="btn btn-danger btn-sm">
                            <i class="fas fa-trash"></i> 删除
                        </button>
                    ` : ''}
                </td>
            </tr>
        `;
    });
    
    tableBody.innerHTML = html;
    emptyState.style.display = 'none';
    updateStats(freeCount, busyCount);
}

function updateStats(freeCount, busyCount) {
    document.getElementById('freeCount').textContent = freeCount;
    document.getElementById('busyCount').textContent = busyCount;
}

function addSchedule() {
    if (!currentAdmin) {
        showMessage('请先登录管理员账号', 'warning');
        return;
    }
    
    const startTime = document.getElementById('startTime').value;
    const endTime = document.getElementById('endTime').value;
    
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
        createdAt: new Date().toISOString()
    };
    
    schedules.push(newSchedule);
    saveSchedules();
    loadSchedules();
    
    document.getElementById('startTime').value = '';
    document.getElementById('endTime').value = '';
    
    showMessage('时间段添加成功', 'success');
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
        }
    }
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
    modal.style.display = 'flex';
    
    // 显示当前账号信息
    document.getElementById('currentAccount').textContent = currentAdmin.username;
    document.getElementById('editAdminName').value = currentAdmin.name;
    
    loadAdminList();
    
    setTimeout(() => {
        document.getElementById('editAdminName').focus();
    }, 100);
}

function hideAdminSettings() {
    document.getElementById('adminSettingsModal').style.display = 'none';
    document.getElementById('currentPassword').value = '';
    document.getElementById('newPassword').value = '';
    document.getElementById('confirmPassword').value = '';
    document.getElementById('newAdminUsername').value = '';
    document.getElementById('newAdminPassword').value = '';
    document.getElementById('newAdminName').value = '';
}

function updateAdminName() {
    const newName = document.getElementById('editAdminName').value.trim();
    
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
            }
        });
        saveSchedules();
        
        updateUserUI();
        loadSchedules();
        
        showMessage('昵称更新成功', 'success');
    }
}

async function changePassword() {
    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    
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
        
        document.getElementById('currentPassword').value = '';
        document.getElementById('newPassword').value = '';
        document.getElementById('confirmPassword').value = '';
        
        showMessage('密码修改成功', 'success');
    }
}

function loadAdminList() {
    const adminList = document.getElementById('adminList');
    
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
    const username = document.getElementById('newAdminUsername').value.trim();
    const password = document.getElementById('newAdminPassword').value;
    const name = document.getElementById('newAdminName').value.trim();
    
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
    
    document.getElementById('newAdminUsername').value = '';
    document.getElementById('newAdminPassword').value = '';
    document.getElementById('newAdminName').value = '';
    
    showMessage(`管理员 ${name} 添加成功`, 'success');
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
    }
}

// ============================================
// 数据管理
// ============================================

function saveSchedules() {
    try {
        localStorage.setItem(CONFIG.storageKeys.schedules, JSON.stringify(schedules));
    } catch (error) {
        showMessage('数据保存失败', 'error');
    }
}

function saveAdminUsers() {
    try {
        localStorage.setItem(CONFIG.storageKeys.adminUsers, JSON.stringify(adminUsers));
    } catch (error) {
        showMessage('管理员配置保存失败', 'error');
    }
}

async function exportData() {
    if (!currentAdmin) {
        showMessage('请先登录管理员账号', 'warning');
        return;
    }
    
    const exportData = {
        version: '1.0',
        exportTime: new Date().toISOString(),
        totalSchedules: schedules.length,
        schedules: schedules,
        adminUsers: adminUsers.map(admin => ({
            username: admin.username,
            name: admin.name
        }))
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
            }
            
        } catch (error) {
            showMessage('导入失败：文件格式错误', 'error');
        }
    };
    reader.readAsText(file);
    event.target.value = '';
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
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
}

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
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
        
        okBtn.onclick = function() {
            document.body.removeChild(modal);
            resolve(true);
        };
        
        cancelBtn.onclick = function() {
            document.body.removeChild(modal);
            resolve(false);
        };
        
        modal.onkeydown = function(event) {
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
        
        modal.onclick = function(event) {
            if (event.target === modal) {
                cancelBtn.click();
            }
        };
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
    document.getElementById('datePicker').value = newDate;
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
    
    // 为输入框添加键盘事件
    setupInputKeyboard();
}

function handleEnterKey(event) {
    const activeElement = document.activeElement;
    
    // 登录模态框
    if (activeElement.id === 'loginUsername' || activeElement.id === 'loginPassword') {
        if (document.getElementById('loginModal').style.display === 'flex') {
            event.preventDefault();
            if (activeElement.id === 'loginUsername') {
                document.getElementById('loginPassword').focus();
            } else {
                performLogin();
            }
        }
    }
    
    // 管理员设置
    if (document.getElementById('adminSettingsModal').style.display === 'flex') {
        if (activeElement.id === 'editAdminName') {
            event.preventDefault();
            updateAdminName();
        }
        else if (activeElement.id === 'currentPassword' || 
                 activeElement.id === 'newPassword' || 
                 activeElement.id === 'confirmPassword') {
            event.preventDefault();
            changePassword();
        }
        else if (activeElement.id === 'newAdminUsername' || 
                 activeElement.id === 'newAdminPassword' || 
                 activeElement.id === 'newAdminName') {
            event.preventDefault();
            addNewAdmin();
        }
    }
    
    // 时间设置
    if (activeElement.id === 'startTime' || activeElement.id === 'endTime') {
        if (currentAdmin) {
            event.preventDefault();
            if (activeElement.id === 'startTime') {
                document.getElementById('endTime').focus();
            } else {
                addSchedule();
            }
        }
    }
}

function handleEscapeKey() {
    if (document.getElementById('loginModal').style.display === 'flex') {
        hideLoginModal();
    }
    if (document.getElementById('adminSettingsModal').style.display === 'flex') {
        hideAdminSettings();
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
                endTimeInput.focus();
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

console.log('时间管理系统初始化完成');
// GitHub Gist同步方案
class GitHubGistSync {
    constructor() {
        this.gistId = localStorage.getItem('sync_gist_id');
        this.githubToken = ''; // 需要用户提供
        this.gistFilename = 'time_schedule_data.json';
    }

    // 设置GitHub Token
    setToken(token) {
        this.githubToken = token;
        localStorage.setItem('github_token', token);
    }

    // 创建或更新Gist
    async saveToGist() {
        if (!this.githubToken) {
            showMessage('请先设置GitHub Token', 'warning');
            return false;
        }

        const data = {
            schedules: schedules,
            adminUsers: adminUsers,
            lastUpdated: new Date().toISOString()
        };

        const gistData = {
            description: '时间管理系统数据同步',
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
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(gistData)
            });

            const result = await response.json();
            
            if (result.id) {
                this.gistId = result.id;
                localStorage.setItem('sync_gist_id', result.id);
                showMessage('数据已保存到云端', 'success');
                return true;
            }
        } catch (error) {
            console.error('Gist保存失败:', error);
            showMessage('同步失败: ' + error.message, 'error');
        }
        return false;
    }

    // 从Gist加载
    async loadFromGist() {
        if (!this.gistId || !this.githubToken) {
            return false;
        }

        try {
            const response = await fetch(`https://api.github.com/gists/${this.gistId}`, {
                headers: {
                    'Authorization': `token ${this.githubToken}`
                }
            });

            const gist = await response.json();
            const fileContent = gist.files[this.gistFilename].content;
            const data = JSON.parse(fileContent);

            // 合并数据
            this.mergeData(data);
            
            showMessage('已从云端加载数据', 'success');
            return true;
        } catch (error) {
            console.error('Gist加载失败:', error);
            showMessage('加载失败: ' + error.message, 'error');
        }
        return false;
    }

    // 合并数据（智能合并冲突）
    mergeData(cloudData) {
        // 这里实现数据合并逻辑
        // 可以按时间戳合并，或者让用户选择
        
        if (cloudData.schedules) {
            schedules = cloudData.schedules;
            saveSchedules();
        }
        
        if (cloudData.adminUsers) {
            adminUsers = cloudData.adminUsers;
            saveAdminUsers();
        }
        
        loadSchedules();
    }
}

// 在HTML中添加同步设置界面
function addSyncSettings() {
    // 在管理员设置模态框中添加
    const adminSettings = document.querySelector('.admin-list');
    if (adminSettings) {
        adminSettings.insertAdjacentHTML('afterend', `
            <div class="cloud-sync-settings">
                <h4><i class="fas fa-cloud"></i> 云同步设置</h4>
                <div class="form-group">
                    <label>GitHub Token：</label>
                    <input type="password" id="githubToken" placeholder="输入GitHub Personal Access Token" class="form-control">
                    <small class="form-text">
                        <a href="https://github.com/settings/tokens" target="_blank">获取Token</a>
                        （需要gist权限）
                    </small>
                </div>
                <div class="form-group">
                    <button onclick="setupGitHubSync()" class="btn btn-primary">
                        <i class="fas fa-key"></i> 设置Token
                    </button>
                    <button onclick="syncToCloud()" class="btn btn-success">
                        <i class="fas fa-cloud-upload-alt"></i> 上传到云端
                    </button>
                    <button onclick="syncFromCloud()" class="btn btn-info">
                        <i class="fas fa-cloud-download-alt"></i> 从云端下载
                    </button>
                </div>
                <div class="sync-status" id="syncStatus">
                    <!-- 同步状态显示 -->
                </div>
            </div>
        `);
    }
}

// 全局同步实例
let gistSync = null;

function setupGitHubSync() {
    const token = document.getElementById('githubToken').value.trim();
    if (!token) {
        showMessage('请输入GitHub Token', 'warning');
        return;
    }
    
    if (!gistSync) {
        gistSync = new GitHubGistSync();
    }
    
    gistSync.setToken(token);
    showMessage('GitHub Token已设置', 'success');
}

async function syncToCloud() {
    if (!gistSync) {
        gistSync = new GitHubGistSync();
    }
    
    await gistSync.saveToGist();
}

async function syncFromCloud() {
    if (!gistSync) {
        showMessage('请先设置GitHub Token', 'warning');
        return;
    }
    
    await gistSync.loadFromGist();
}