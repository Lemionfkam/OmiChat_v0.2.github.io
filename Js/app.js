// ============================================================================
// OMI Chat v0.2 - Основной файл JavaScript
// ============================================================================

// ===== КОНФИГУРАЦИЯ =====
const CONFIG = {
    API_URL: 'https://script.google.com/macros/s/AKfycbz2LBCDbWMLROdFuyKTa4SWipi2DgqJIGrwHvn2zXOnXt8HXQw0XBYOcghK_4Je6aRWnQ/exec',
    POLL_INTERVAL: 2000, // 2 секунды
    MAX_MESSAGES: 500,
    MAX_USERNAME_LENGTH: 20,
    SESSION_ID: 'omichat_v0.3',
    VERSION: '0.3'
};

// ===== ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ =====
let state = {
    currentUser: '',
    messages: [],
    onlineUsers: new Set(),
    lastMessageId: 0,
    isTyping: false,
    isConnected: false,
    pollInterval: null,
    typingTimeout: null,
    connectionRetries: 0,
    maxRetries: 5,
    newMessagesCount: 0,
    unreadCount: 0
};

// ===== УТИЛИТЫ =====
const Utils = {
    // Форматирование времени
    formatTime: (timeString) => {
        if (!timeString) return '';
        
        try {
            const date = new Date(timeString);
            if (isNaN(date.getTime())) {
                return timeString;
            }
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } catch (e) {
            return timeString;
        }
    },

    // Экранирование HTML
    escapeHtml: (text) => {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    // Генерация случайного цвета для аватара
    generateAvatarColor: (username) => {
        const colors = [
            '#4285F4', '#34A853', '#FBBC05', '#EA4335',
            '#8AB4F8', '#81C995', '#FDE293', '#F28B82',
            '#5C6BC0', '#26A69A', '#FFA726', '#AB47BC'
        ];
        const hash = Array.from(username).reduce((acc, char) => 
            acc + char.charCodeAt(0), 0);
        return colors[hash % colors.length];
    },

    // Анимация элемента
    animateElement: (element, animation) => {
        element.classList.add(animation);
        element.addEventListener('animationend', () => {
            element.classList.remove(animation);
        }, { once: true });
    },

    // Сохранение в LocalStorage
    saveToStorage: (key, value) => {
        try {
            localStorage.setItem(`omichat_${key}`, JSON.stringify(value));
        } catch (e) {
            console.error('Ошибка сохранения:', e);
        }
    },

    // Загрузка из LocalStorage
    loadFromStorage: (key) => {
        try {
            const item = localStorage.getItem(`omichat_${key}`);
            return item ? JSON.parse(item) : null;
        } catch (e) {
            console.error('Ошибка загрузки:', e);
            return null;
        }
    },

    // Отслеживание позиции мыши для кнопок
    setupMouseTracking: () => {
        const buttons = document.querySelectorAll('.btn');
        buttons.forEach(btn => {
            btn.addEventListener('mousemove', (e) => {
                const rect = btn.getBoundingClientRect();
                const x = ((e.clientX - rect.left) / rect.width) * 100;
                const y = ((e.clientY - rect.top) / rect.height) * 100;
                
                btn.style.setProperty('--mouse-x', `${x}%`);
                btn.style.setProperty('--mouse-y', `${y}%`);
            });
        });
    }
};

// ===== УПРАВЛЕНИЕ СОСТОЯНИЕМ =====
const StateManager = {
    // Сохранение состояния
    saveState: () => {
        Utils.saveToStorage('state', {
            currentUser: state.currentUser,
            messages: state.messages.slice(-100), // Сохраняем только последние 100
            lastMessageId: state.lastMessageId,
            onlineUsers: Array.from(state.onlineUsers)
        });
    },

    // Восстановление состояния
    restoreState: () => {
        const savedState = Utils.loadFromStorage('state');
        if (savedState) {
            state.currentUser = savedState.currentUser || '';
            state.messages = savedState.messages || [];
            state.lastMessageId = savedState.lastMessageId || 0;
            state.onlineUsers = new Set(savedState.onlineUsers || []);
            return true;
        }
        return false;
    },

    // Сброс состояния
    resetState: () => {
        state = {
            currentUser: '',
            messages: [],
            onlineUsers: new Set(),
            lastMessageId: 0,
            isTyping: false,
            isConnected: false,
            pollInterval: null,
            typingTimeout: null,
            connectionRetries: 0,
            maxRetries: 5,
            newMessagesCount: 0,
            unreadCount: 0
        };
        localStorage.removeItem('omichat_state');
    }
};

// ===== API КЛИЕНТ =====
const ApiClient = {
    // Проверка подключения
    checkConnection: async () => {
        try {
            const response = await fetch(CONFIG.API_URL + '?ping=' + Date.now());
            return response.ok;
        } catch (error) {
            console.error('Ошибка подключения:', error);
            return false;
        }
    },

    // Получение сообщений
    fetchMessages: async () => {
        try {
            const response = await fetch(CONFIG.API_URL + '?t=' + Date.now());
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const data = await response.json();
            return Array.isArray(data) ? data : [];
        } catch (error) {
            console.error('Ошибка получения сообщений:', error);
            throw error;
        }
    },

    // Отправка сообщения
    sendMessage: async (user, message) => {
        try {
            const response = await fetch(CONFIG.API_URL, {
                method: 'POST',
                body: JSON.stringify({
                    user: user,
                    message: message,
                    session: CONFIG.SESSION_ID,
                    version: CONFIG.VERSION
                })
            });
            
            const result = await response.json();
            return {
                success: result.success === true,
                id: result.id || Date.now(),
                timestamp: result.timestamp || new Date().toISOString()
            };
        } catch (error) {
            console.error('Ошибка отправки сообщения:', error);
            throw error;
        }
    }
};

// ===== УПРАВЛЕНИЕ ДОМ =====
const DomManager = {
    // Элементы
    elements: {},

    // Инициализация элементов
    initElements: () => {
        DomManager.elements = {
            // Модальное окно
            loginModal: document.getElementById('loginModal'),
            usernameInput: document.getElementById('usernameInput'),
            
            // Основной интерфейс
            chatInterface: document.getElementById('chatInterface'),
            currentUsername: document.getElementById('currentUsername'),
            userAvatar: document.getElementById('userAvatar'),
            
            // Статус
            connectionStatus: document.getElementById('connectionStatus'),
            statusText: document.getElementById('statusText'),
            
            // Список пользователей
            usersList: document.getElementById('usersList'),
            onlineCount: document.getElementById('onlineCount'),
            onlineCountBadge: document.getElementById('onlineCountBadge'),
            
            // Сообщения
            messagesContainer: document.getElementById('messagesContainer'),
            messageCount: document.getElementById('messageCount'),
            welcomeMessage: document.getElementById('welcomeMessage'),
            
            // Ввод
            messageInput: document.getElementById('messageInput'),
            sendButton: document.getElementById('sendButton'),
            
            // Прочее
            lastUpdate: document.getElementById('lastUpdate'),
            typingIndicator: document.getElementById('typingIndicator'),
            connectionInfo: document.getElementById('connectionInfo'),
            
            // Кнопки
            refreshBtn: document.getElementById('refreshBtn'),
            exportBtn: document.getElementById('exportBtn'),
            settingsBtn: document.getElementById('settingsBtn'),
            clearBtn: document.getElementById('clearBtn'),
            usersBtn: document.getElementById('usersBtn'),
            helpBtn: document.getElementById('helpBtn'),
            logoutBtn: document.getElementById('logoutBtn'),
            refreshBadge: document.getElementById('refreshBadge')
        };
    },

    // Обновление статуса
    updateStatus: (text, isError = false) => {
        const { statusText, connectionStatus, connectionInfo } = DomManager.elements;
        
        statusText.textContent = text;
        connectionInfo.textContent = text;
        
        if (isError) {
            connectionStatus.classList.add('status-disconnected');
            connectionStatus.classList.remove('status-connected');
            Utils.animateElement(connectionStatus, 'shake');
        } else {
            connectionStatus.classList.add('status-connected');
            connectionStatus.classList.remove('status-disconnected');
        }
    },

    // Обновление списка онлайн пользователей
    updateOnlineUsers: () => {
        const { usersList, onlineCount, onlineCountBadge } = DomManager.elements;
        
        usersList.innerHTML = '';
        state.onlineUsers.forEach(user => {
            const userDiv = document.createElement('div');
            userDiv.className = `user-item ${user === state.currentUser ? 'self' : ''}`;
            userDiv.innerHTML = `
                <span style="color: ${Utils.generateAvatarColor(user)}; margin-right: 8px;">●</span>
                <span style="flex: 1;">${Utils.escapeHtml(user)}</span>
                ${user === state.currentUser ? 
                    '<small style="color: #666; font-size: 0.75rem;">(Вы)</small>' : ''}
            `;
            usersList.appendChild(userDiv);
        });
        
        const count = state.onlineUsers.size;
        onlineCount.textContent = count;
        onlineCountBadge.textContent = count;
    },

    // Добавление сообщения в интерфейс
    addMessage: (user, text, timestamp, id, isOwn = false) => {
        const { messagesContainer } = DomManager.elements;
        
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${isOwn ? 'message-outgoing' : 'message-incoming'}`;
        messageDiv.dataset.id = id;
        
        const time = Utils.formatTime(timestamp);
        
        messageDiv.innerHTML = `
            <div class="message-header">
                <span class="message-user">${isOwn ? 'Вы' : Utils.escapeHtml(user)}</span>
                <span class="message-time">${time}</span>
            </div>
            <div class="message-text">${Utils.escapeHtml(text)}</div>
            <div class="message-status">${isOwn ? '✓' : ''}</div>
        `;
        
        messagesContainer.appendChild(messageDiv);
        
        // Прокрутка к последнему сообщению
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
        
        // Добавляем в состояние
        state.messages.push({
            id: id,
            user: user,
            text: text,
            time: timestamp,
            isOwn: isOwn
        });
        
        // Обновляем счетчик
        DomManager.updateMessageCount();
        
        // Анимация
        Utils.animateElement(messageDiv, 'messageAppear');
    },

    // Обновление счетчика сообщений
    updateMessageCount: () => {
        const { messageCount } = DomManager.elements;
        messageCount.textContent = state.messages.length;
    },

    // Обновление времени последнего обновления
    updateLastUpdate: () => {
        const { lastUpdate } = DomManager.elements;
        const now = new Date();
        const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        lastUpdate.textContent = timeStr;
    },

    // Показ индикатора набора текста
    showTypingIndicator: () => {
        const { typingIndicator } = DomManager.elements;
        typingIndicator.style.display = 'flex';
    },

    // Скрытие индикатора набора текста
    hideTypingIndicator: () => {
        const { typingIndicator } = DomManager.elements;
        typingIndicator.style.display = 'none';
    },

    // Авто-ресайз поля ввода
    autoResizeTextarea: (textarea) => {
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(textarea.scrollHeight, 150) + 'px';
    },

    // Показ приветственного сообщения
    showWelcomeMessage: () => {
        const { welcomeMessage } = DomManager.elements;
        welcomeMessage.style.display = 'block';
    },

    // Скрытие приветственного сообщения
    hideWelcomeMessage: () => {
        const { welcomeMessage } = DomManager.elements;
        welcomeMessage.style.display = 'none';
    },

    // Обновление бейджа новых сообщений
    updateNewMessagesBadge: (count) => {
        const { refreshBadge } = DomManager.elements;
        if (count > 0) {
            refreshBadge.textContent = count;
            refreshBadge.style.display = 'inline-block';
            Utils.animateElement(refreshBadge, 'badgePulse');
        } else {
            refreshBadge.style.display = 'none';
        }
    },

    // Анимация кнопки
    animateButton: (buttonId, animationClass) => {
        const button = document.getElementById(buttonId);
        if (button) {
            Utils.animateElement(button, animationClass);
        }
    }
};

// ===== ОБРАБОТЧИКИ СОБЫТИЙ =====
const EventHandlers = {
    // Обработчик входа
    handleLogin: () => {
        const { usernameInput } = DomManager.elements;
        const username = usernameInput.value.trim();
        
        if (!username) {
            alert('Пожалуйста, введите ваше имя');
            Utils.animateElement(usernameInput, 'shake');
            return;
        }
        
        if (username.length > CONFIG.MAX_USERNAME_LENGTH) {
            alert(`Имя должно быть не длиннее ${CONFIG.MAX_USERNAME_LENGTH} символов`);
            return;
        }
        
        state.currentUser = username;
        Utils.saveToStorage('username', username);
        
        // Скрываем модальное окно
        DomManager.elements.loginModal.style.display = 'none';
        
        // Инициализируем чат
        ChatManager.initChat();
    },

    // Обработчик отправки сообщения
    handleSendMessage: async () => {
        const { messageInput } = DomManager.elements;
        const text = messageInput.value.trim();
        
        if (!text || !state.currentUser) return;
        
        // Очищаем поле ввода
        messageInput.value = '';
        DomManager.autoResizeTextarea(messageInput);
        
        // Показываем сообщение локально
        const tempId = Date.now();
        DomManager.addMessage(
            state.currentUser,
            text,
            new Date().toISOString(),
            tempId,
            true
        );
        
        // Анимация кнопки отправки
        DomManager.animateButton('sendButton', 'scaleIn');
        
        // Отправляем на сервер
        try {
            const result = await ApiClient.sendMessage(state.currentUser, text);
            
            if (result.success) {
                DomManager.updateStatus('Сообщение отправлено');
                state.lastMessageId = Math.max(state.lastMessageId, result.id);
                
                // Анимация кнопки обновления
                DomManager.animateButton('refreshBtn', 'pulse');
            } else {
                DomManager.updateStatus('Ошибка отправки', true);
            }
        } catch (error) {
            DomManager.updateStatus('Ошибка сети', true);
        }
        
        // Сбрасываем статус набора
        TypingManager.stopTyping();
    },

    // Обработчик клавиш
    handleKeyDown: (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            EventHandlers.handleSendMessage();
        } else if (event.key === 'Escape') {
            DomManager.elements.messageInput.value = '';
            DomManager.autoResizeTextarea(DomManager.elements.messageInput);
        }
    },

    // Обработчик выхода
    handleLogout: () => {
        if (confirm('Выйти из чата?')) {
            ChatManager.stopPolling();
            StateManager.resetState();
            
            // Показываем модальное окно входа
            DomManager.elements.loginModal.style.display = 'flex';
            DomManager.elements.chatInterface.style.display = 'none';
            DomManager.elements.usernameInput.value = '';
            DomManager.elements.usernameInput.focus();
            
            // Очищаем сообщения
            DomManager.elements.messagesContainer.innerHTML = '';
            DomManager.showWelcomeMessage();
            
            // Сбрасываем бейджи
            DomManager.updateNewMessagesBadge(0);
        }
    },

    // Обработчик обновления чата
    handleRefreshChat: () => {
        ChatManager.loadMessages();
        DomManager.updateStatus('Обновление...');
        DomManager.updateNewMessagesBadge(0);
        state.newMessagesCount = 0;
        
        // Анимация кнопки
        DomManager.animateButton('refreshBtn', 'spin');
    },

    // Очистка локального чата
    handleClearLocalChat: () => {
        if (confirm('Очистить локальную историю сообщений?\nЭто не удалит сообщения из Google Sheets.')) {
            state.messages = [];
            DomManager.elements.messagesContainer.innerHTML = '';
            DomManager.updateMessageCount();
            DomManager.showWelcomeMessage();
            
            // Показываем уведомление
            const notification = document.createElement('div');
            notification.className = 'system-message success';
            notification.textContent = 'Локальная история очищена';
            DomManager.elements.messagesContainer.appendChild(notification);
            
            setTimeout(() => notification.remove(), 3000);
            
            // Анимация кнопки
            DomManager.animateButton('clearBtn', 'shake');
        }
    },

    // Показать список пользователей
    handleShowUsers: () => {
        const usersList = Array.from(state.onlineUsers).join('\n• ');
        alert(`👥 Пользователи онлайн (${state.onlineUsers.size}):\n\n• ${usersList || 'Нет активных пользователей'}`);
    },

    // Показать справку
    handleShowHelp: () => {
        alert(`📚 OMI Chat v${CONFIG.VERSION} - Справка

Основные функции:
• 💬 Напишите сообщение и нажмите Enter
• 🔄 Обновить - загрузить новые сообщения
• 📥 Экспорт - сохранить историю в файл
• ⚙️ Настройки - информация о системе
• 🗑️ Очистить - удалить локальную историю
• 👥 Участники - список онлайн пользователей
• 🚪 Выйти - выход из аккаунта

Горячие клавиши:
• Enter - отправить сообщение
• Shift+Enter - новая строка
• Esc - очистить поле ввода

Сообщения сохраняются в Google Sheets:
https://docs.google.com/spreadsheets/d/1llN40GyGlHZGd_6vBNl8dh5RujaA6A68Tl77XbDG1pk/edit

Версия: ${CONFIG.VERSION}`);
    }
};

// ===== УПРАВЛЕНИЕ НАБОРОМ ТЕКСТА =====
const TypingManager = {
    // Начало набора
    startTyping: () => {
        if (!state.isTyping) {
            state.isTyping = true;
            DomManager.showTypingIndicator();
        }
        
        clearTimeout(state.typingTimeout);
        state.typingTimeout = setTimeout(TypingManager.stopTyping, 3000);
    },

    // Остановка набора
    stopTyping: () => {
        state.isTyping = false;
        DomManager.hideTypingIndicator();
        clearTimeout(state.typingTimeout);
    }
};

// ===== УПРАВЛЕНИЕ ЧАТОМ =====
const ChatManager = {
    // Инициализация чата
    initChat: async () => {
        // Показываем интерфейс
        DomManager.elements.chatInterface.style.display = 'flex';
        DomManager.elements.currentUsername.textContent = state.currentUser;
        
        // Настраиваем аватар
        const avatarColor = Utils.generateAvatarColor(state.currentUser);
        const avatar = DomManager.elements.userAvatar;
        avatar.style.background = `linear-gradient(135deg, ${avatarColor} 0%, ${this.adjustColor(avatarColor, -20)} 100%)`;
        avatar.querySelector('span').textContent = state.currentUser.charAt(0).toUpperCase();
        
        // Добавляем пользователя в онлайн
        state.onlineUsers.add(state.currentUser);
        DomManager.updateOnlineUsers();
        
        // Активируем поле ввода
        DomManager.elements.messageInput.disabled = false;
        DomManager.elements.sendButton.disabled = false;
        DomManager.elements.messageInput.focus();
        
        // Настраиваем обработчики
        DomManager.elements.messageInput.addEventListener('input', (e) => {
            DomManager.autoResizeTextarea(e.target);
            TypingManager.startTyping();
        });
        
        DomManager.elements.messageInput.addEventListener('keydown', EventHandlers.handleKeyDown);
        
        // Настраиваем обработчики кнопок
        DomManager.elements.refreshBtn.addEventListener('click', EventHandlers.handleRefreshChat);
        DomManager.elements.exportBtn.addEventListener('click', ChatManager.exportChat);
        DomManager.elements.settingsBtn.addEventListener('click', ChatManager.showSettings);
        DomManager.elements.clearBtn.addEventListener('click', EventHandlers.handleClearLocalChat);
        DomManager.elements.usersBtn.addEventListener('click', EventHandlers.handleShowUsers);
        DomManager.elements.helpBtn.addEventListener('click', EventHandlers.handleShowHelp);
        DomManager.elements.logoutBtn.addEventListener('click', EventHandlers.handleLogout);
        
        // Настраиваем отслеживание мыши для кнопок
        Utils.setupMouseTracking();
        
        // Загружаем сообщения и начинаем опрос
        await ChatManager.loadMessages();
        ChatManager.startPolling();
        
        // Обновляем статус
        DomManager.updateStatus('Подключено');
        DomManager.updateLastUpdate();
        DomManager.hideWelcomeMessage();
    },

    // Загрузка сообщений
    loadMessages: async () => {
        try {
            const newMessages = await ApiClient.fetchMessages();
            
            if (newMessages.length > 0) {
                // Фильтруем новые сообщения
                const latestMessages = newMessages.filter(msg => {
                    const msgId = parseInt(msg.id) || 0;
                    return msgId > state.lastMessageId;
                });
                
                if (latestMessages.length > 0) {
                    latestMessages.forEach(msg => {
                        const isOwn = msg.user === state.currentUser;
                        DomManager.addMessage(
                            msg.user,
                            msg.message,
                            msg.timestamp,
                            msg.id,
                            isOwn
                        );
                        
                        state.lastMessageId = Math.max(state.lastMessageId, parseInt(msg.id) || 0);
                        
                        // Добавляем пользователя в онлайн
                        if (msg.user && msg.user !== state.currentUser) {
                            state.onlineUsers.add(msg.user);
                        }
                    });
                    
                    // Обновляем счетчик новых сообщений
                    if (!document.hasFocus()) {
                        state.newMessagesCount += latestMessages.length;
                        DomManager.updateNewMessagesBadge(state.newMessagesCount);
                    }
                    
                    DomManager.updateOnlineUsers();
                    DomManager.updateLastUpdate();
                    StateManager.saveState();
                }
            }
            
            state.isConnected = true;
            state.connectionRetries = 0;
            DomManager.updateStatus('Подключено');
            
        } catch (error) {
            state.connectionRetries++;
            
            if (state.connectionRetries >= state.maxRetries) {
                DomManager.updateStatus('Ошибка соединения', true);
                ChatManager.stopPolling();
            } else {
                DomManager.updateStatus(`Переподключение (${state.connectionRetries}/${state.maxRetries})...`);
            }
        }
    },

    // Начало опроса сообщений
    startPolling: () => {
        if (state.pollInterval) {
            clearInterval(state.pollInterval);
        }
        
        state.pollInterval = setInterval(() => {
            if (document.visibilityState === 'visible') {
                ChatManager.loadMessages();
            }
        }, CONFIG.POLL_INTERVAL);
    },

    // Остановка опроса
    stopPolling: () => {
        if (state.pollInterval) {
            clearInterval(state.pollInterval);
            state.pollInterval = null;
        }
    },

    // Экспорт чата
    exportChat: () => {
        if (state.messages.length === 0) {
            alert('Нет сообщений для экспорта');
            return;
        }
        
        const chatText = state.messages.map(msg => 
            `[${Utils.formatTime(msg.time)}] ${msg.user}: ${msg.text}`
        ).join('\n');
        
        const header = `OMI Chat v${CONFIG.VERSION} - Экспорт истории\n` +
                      `Дата: ${new Date().toLocaleString()}\n` +
                      `Пользователь: ${state.currentUser}\n` +
                      `Сообщений: ${state.messages.length}\n` +
                      '='.repeat(50) + '\n\n';
        
        const blob = new Blob([header + chatText], { 
            type: 'text/plain;charset=utf-8' 
        });
        
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `omichat_export_${new Date().toISOString().slice(0,10)}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        // Анимация кнопки
        DomManager.animateButton('exportBtn', 'scaleIn');
    },

    // Показ настроек
    showSettings: () => {
        const settings = `
            OMI Chat v${CONFIG.VERSION}
            
            Пользователь: ${state.currentUser}
            Сообщений: ${state.messages.length}
            Онлайн: ${state.onlineUsers.size}
            
            API URL: ${CONFIG.API_URL}
            Таблица: https://docs.google.com/spreadsheets/d/1llN40GyGlHZGd_6vBNl8dh5RujaA6A68Tl77XbDG1pk/edit
            
            Интервал опроса: ${CONFIG.POLL_INTERVAL / 1000} сек
            Макс. сообщений: ${CONFIG.MAX_MESSAGES}
            
            Статус: ${state.isConnected ? 'Подключено ✓' : 'Отключено ✗'}
            Попыток переподключения: ${state.connectionRetries}
        `;
        
        alert(settings);
        
        // Анимация кнопки
        DomManager.animateButton('settingsBtn', 'pulse');
    },

    // Вспомогательная функция для настройки цвета
    adjustColor: (color, amount) => {
        let usePound = false;
        
        if (color[0] === "#") {
            color = color.slice(1);
            usePound = true;
        }
        
        const num = parseInt(color, 16);
        let r = (num >> 16) + amount;
        let g = ((num >> 8) & 0x00FF) + amount;
        let b = (num & 0x0000FF) + amount;
        
        r = Math.min(Math.max(0, r), 255);
        g = Math.min(Math.max(0, g), 255);
        b = Math.min(Math.max(0, b), 255);
        
        return (usePound ? "#" : "") + (b | (g << 8) | (r << 16)).toString(16).padStart(6, '0');
    }
};

// ===== ИНИЦИАЛИЗАЦИЯ ПРИЛОЖЕНИЯ =====
const App = {
    // Инициализация
    init: () => {
        // Инициализация DOM элементов
        DomManager.initElements();
        
        // Восстановление состояния
        const hasState = StateManager.restoreState();
        
        if (hasState && state.currentUser) {
            // Пользователь уже авторизован
            DomManager.elements.loginModal.style.display = 'none';
            ChatManager.initChat();
        } else {
            // Проверяем сохраненное имя пользователя
            const savedUsername = Utils.loadFromStorage('username');
            if (savedUsername) {
                state.currentUser = savedUsername;
                DomManager.elements.loginModal.style.display = 'none';
                ChatManager.initChat();
            } else {
                // Показываем окно входа
                DomManager.elements.loginModal.style.display = 'flex';
                DomManager.elements.usernameInput.focus();
            }
        }
        
        // Настройка глобальных обработчиков
        App.setupGlobalHandlers();
        
        // Проверка соединения
        App.checkInitialConnection();
    },

    // Настройка глобальных обработчиков
    setupGlobalHandlers: () => {
        // Обработчик видимости вкладки
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible' && state.currentUser) {
                ChatManager.loadMessages();
                // Сбрасываем счетчик новых сообщений при фокусе
                if (state.newMessagesCount > 0) {
                    state.newMessagesCount = 0;
                    DomManager.updateNewMessagesBadge(0);
                }
            }
        });
        
        // Автоочистка неактивных пользователей
        setInterval(() => {
            if (state.onlineUsers.size > 1) {
                // Оставляем текущего пользователя и 4 последних активных
                const activeUsers = new Set([state.currentUser]);
                const otherUsers = Array.from(state.onlineUsers)
                    .filter(user => user !== state.currentUser)
                    .slice(-4);
                
                otherUsers.forEach(user => activeUsers.add(user));
                state.onlineUsers = activeUsers;
                DomManager.updateOnlineUsers();
            }
        }, 60000); // Каждую минуту
        
        // Уведомление о новом сообщении
        document.addEventListener('DOMContentLoaded', () => {
            if ('Notification' in window && Notification.permission === 'default') {
                Notification.requestPermission();
            }
        });
    },

    // Первоначальная проверка соединения
    checkInitialConnection: async () => {
        const isConnected = await ApiClient.checkConnection();
        
        if (!isConnected) {
            DomManager.updateStatus('Не удалось подключиться к серверу', true);
        }
    }
};

// ===== ГЛОБАЛЬНЫЕ ФУНКЦИИ ДЛЯ HTML =====
// Эти функции вызываются из onclick атрибутов

function login() {
    EventHandlers.handleLogin();
}

function sendMessage() {
    EventHandlers.handleSendMessage();
}

function logout() {
    EventHandlers.handleLogout();
}

function refreshChat() {
    EventHandlers.handleRefreshChat();
}

function exportChat() {
    ChatManager.exportChat();
}

function showSettings() {
    ChatManager.showSettings();
}

function clearLocalChat() {
    EventHandlers.handleClearLocalChat();
}

function showUsers() {
    EventHandlers.handleShowUsers();
}

function showHelp() {
    EventHandlers.handleShowHelp();
}

function autoResize(textarea) {
    DomManager.autoResizeTextarea(textarea);
}

function handleKeyDown(event) {
    EventHandlers.handleKeyDown(event);
}

function initApp() {
    App.init();
}

// Экспорт для тестирования
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        App,
        ChatManager,
        StateManager,
        Utils,
        EventHandlers
    };
}