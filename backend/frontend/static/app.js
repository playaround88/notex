// LocalCache - 本地缓存管理类
class LocalCache {
    constructor(ttlMinutes = 5) {
        this.ttl = ttlMinutes * 60 * 1000; // 转换为毫秒
        this.prefix = 'notex_cache_';
    }

    // 生成缓存键
    _makeKey(key) {
        return `${this.prefix}${key}`;
    }

    // 获取缓存
    get(key) {
        try {
            const fullKey = this._makeKey(key);
            const item = localStorage.getItem(fullKey);
            if (!item) return null;

            const data = JSON.parse(item);

            // 检查是否过期
            if (Date.now() > data.expiresAt) {
                localStorage.removeItem(fullKey);
                return null;
            }

            return data.value;
        } catch (e) {
            console.warn('Cache get error:', e);
            return null;
        }
    }

    // 设置缓存
    set(key, value, customTTL = null) {
        try {
            const fullKey = this._makeKey(key);
            const ttl = customTTL || this.ttl;
            const data = {
                value,
                expiresAt: Date.now() + ttl
            };
            localStorage.setItem(fullKey, JSON.stringify(data));
        } catch (e) {
            console.warn('Cache set error:', e);
        }
    }

    // 删除缓存
    delete(key) {
        try {
            const fullKey = this._makeKey(key);
            localStorage.removeItem(fullKey);
        } catch (e) {
            console.warn('Cache delete error:', e);
        }
    }

    // 按前缀删除缓存
    deletePattern(pattern) {
        try {
            const prefix = this._makeKey(pattern);
            const keys = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith(prefix)) {
                    keys.push(key);
                }
            }
            keys.forEach(key => localStorage.removeItem(key));
        } catch (e) {
            console.warn('Cache deletePattern error:', e);
        }
    }

    // 清空所有缓存
    clear() {
        try {
            const keys = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith(this.prefix)) {
                    keys.push(key);
                }
            }
            keys.forEach(key => localStorage.removeItem(key));
        } catch (e) {
            console.warn('Cache clear error:', e);
        }
    }

    // 清理过期缓存
    cleanup() {
        try {
            const now = Date.now();
            const keys = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith(this.prefix)) {
                    keys.push(key);
                }
            }
            keys.forEach(key => {
                try {
                    const item = localStorage.getItem(key);
                    if (item) {
                        const data = JSON.parse(item);
                        if (now > data.expiresAt) {
                            localStorage.removeItem(key);
                        }
                    }
                } catch (e) {
                    // 忽略解析错误，删除无效条目
                    localStorage.removeItem(key);
                }
            });
        } catch (e) {
            console.warn('Cache cleanup error:', e);
        }
    }
}

class OpenNotebook {
    constructor() {
        this.notebooks = [];
        this.currentNotebook = null;
        this.apiBase = '/api';
        this.currentChatSession = null;
        this.chatSessions = []; // 存储会话列表
        this.currentPublicToken = null;

        // Auth state
        this.token = localStorage.getItem('token');
        this.currentUser = null;

        // Sync token from localStorage to cookie for image loading
        if (this.token) {
            document.cookie = `token=${this.token}; path=/; SameSite=Lax`;
        }

        // 初始化本地缓存 (5分钟TTL)
        this.cache = new LocalCache(5);

        // Resource Tab Manager
        this.resourceTabManager = new ResourceTabManager(this);

        // Note type name mapping
        this.noteTypeNameMap = {
            summary: '摘要',
            faq: '常见问题',
            study_guide: '学习指南',
            outline: '大纲',
            podcast: '播客',
            timeline: '时间线',
            glossary: '术语表',
            quiz: '测验',
            mindmap: '思维导图',
            infograph: '信息图',
            ppt: '幻灯片',
            insight: '洞察报告',
            data_table: '数据表格',
            data_chart: '数据图表'
        };

        // Prompt scenarios data - 预定义提示场景
        this.promptScenarios = [
            { icon: 'search', display_text: '总结核心观点', prompt: '总结这篇文章的核心观点' },
            { icon: 'question', display_text: '列出3个关键问题', prompt: '列出3个关于本文的关键问题' },
            { icon: 'lightbulb', display_text: '概念解释', prompt: '解释文中的重要概念' },
            { icon: 'compare', display_text: '观点对比', prompt: '对比文中的不同观点' },
            { icon: 'action', display_text: '可行建议', prompt: '给出具体可行的建议' },
            { icon: 'detail', display_text: '深入分析', prompt: '深入分析某个具体部分' },
            { icon: 'example', display_text: '提供更多例子', prompt: '提供更多相关例子' },
            { icon: 'simplify', display_text: '简单解释复杂概念', prompt: '用简单的话解释复杂概念' },
            { icon: 'extend', display_text: '话题扩展', prompt: '扩展这个话题' },
            { icon: 'creative', display_text: '从不同角度思考', prompt: '从不同角度思考' },
            { icon: 'expert', display_text: '专家综合器', prompt: '你是一位拥有 15 年经验的 [领域] 专家。分析这些资料，并找出该领域从业者会立即识别为突破性进展的 3 个核心见解。对于每个见解，解释它为什么重要，以及它挑战了哪些传统观念。' },
            { icon: 'conflict', display_text: '矛盾猎人', prompt: '比较这些来源，并找出它们相互矛盾的所有点。对于每个矛盾，解释哪个来源有更强的证据以及原因。如果两者都可信，解释可能解释分歧的因素。' },
            { icon: 'blueprint', display_text: '实施蓝图', prompt: '提取所有来源中提到的可执行步骤、工具、框架和技术。将它们组织成一个包含每个步骤的先决条件、预期结果和潜在陷阱的逐步实施计划。' },
            { icon: 'generate', display_text: '问题生成器', prompt: '根据这些来源，生成 15 个专家会问但来源未回答的问题。优先考虑那些将推动领域发展或揭示当前理解中关键空白的问题。' },
            { icon: 'assumption', display_text: '假设挖掘器', prompt: '识别这些来源中每一个未明确说明的假设。对于每个假设，评估其重要性（1-10）以及其错误的可能程度。解释如果该假设是错误的，情况会有何变化。' },
            { icon: 'framework', display_text: '框架构建器', prompt: '创建一个综合框架，整合这些来源中的所有概念。包括：关键组件、组件之间的关系、应用的决策树以及框架失效的边缘情况。' },
            { icon: 'evidence', display_text: '证据映射器', prompt: '对于这些来源中的每项主要声明，提取支持证据并评估其强度（轶事性、相关性、实验性、元分析）。标记那些证据薄弱但以高置信度陈述的声明。' },
            { icon: 'users', display_text: '利益相关者翻译', prompt: '将这些来源的见解翻译给三个不同的受众：[高管、工程师、最终用户]。针对每个受众，关注他们特别关心的内容，并使用他们能立即理解的语言/示例。' },
            { icon: 'timeline', display_text: '时间线构建器', prompt: '从这些来源中提取所有日期、事件、里程碑和时间参考。构建一个全面的 时间线，展示该领域/主题是如何演变的。识别进度显著加快的加速点。' },
            { icon: 'weakness', display_text: '弱点探测器', prompt: '扮演一个严厉的同行评审员。识别这些来源中的每一个方法论缺陷、逻辑漏洞、过度主张和不支持的大跃进。对于每一个弱点，建议需要哪些补充证据来加强论点。' }
        ];

        this.init();
    }

    async init() {
        await this.initAuth();
        await this.loadConfig();
        this.bindEvents();
        this.initResizers();
        this.initNotebookNameEditor();
        this.initPromptScenariosPanel();

        // 清理过期缓存
        this.cache.cleanup();

        // Check if URL contains /notes/:id or /public/:token for direct notebook access
        // Only load notebooks if not accessing a public notebook directly
        if (!this.checkURLForNotebook() && !this.checkURLForPublicNotebook()) {
            await this.loadNotebooks();
            this.applyConfig();
            this.switchView('landing');
        } else {
            this.applyConfig();
        }
    }

    // Check if URL contains /public/:token and load the public notebook
    checkURLForPublicNotebook() {
        const path = window.location.pathname;
        const match = path.match(/^\/public\/([a-f0-9-]+)$/);
        if (match) {
            this.loadPublicNotebook(match[1]);
            return true;
        }
        return false;
    }

    // Load public notebook by token
    async loadPublicNotebook(token) {
        try {
            this.setStatus('加载公开笔记本...');

            const [notebook, sources, notes] = await Promise.all([
                fetch(`/public/notebooks/${token}`).then(r => {
                    if (!r.ok) throw new Error('Failed to load notebook');
                    return r.json();
                }),
                fetch(`/public/notebooks/${token}/sources`).then(r => {
                    if (!r.ok) throw new Error('Failed to load sources');
                    return r.json();
                }),
                fetch(`/public/notebooks/${token}/notes`).then(r => {
                    if (!r.ok) throw new Error('Failed to load notes');
                    return r.json();
                })
            ]);

            this.currentNotebook = notebook;
            this.currentPublicToken = token;

            // 先显示笔记列表 tab（创建容器）
            this.showNotesListTab();

            // 渲染 sources
            await this.renderSourcesList(sources);

            // 渲染 notes 到紧凑网格视图（容器已创建）
            await this.renderNotesCompactGridPublic(notes);

            // 设置为只读模式
            this.setReadOnlyMode(true);

            this.switchView('workspace');
            this.setStatus('公开笔记本: ' + notebook.name);
        } catch (error) {
            console.error('Failed to load public notebook:', error);
            this.showError('加载公开笔记本失败');
            this.switchView('landing');
        }
    }

    // Handle back to list button click
    async handleBackToList() {
        // Clear public notebook state
        this.currentPublicToken = null;
        this.currentNotebook = null;

        // Reload user's notebooks
        await this.loadNotebooks();

        // Clear status
        this.setStatus('就绪');

        // Switch to landing view
        this.switchView('landing');
    }

    // 设置只读模式
    setReadOnlyMode(readOnly) {
        const workspace = document.getElementById('workspaceContainer');
        if (readOnly) {
            workspace.classList.add('readonly-mode');
            // 禁用编辑功能
            const addSourceBtn = document.getElementById('btnAddSource');
            if (addSourceBtn) addSourceBtn.style.display = 'none';

            // 隐藏编辑按钮
            document.querySelectorAll('.transform-card').forEach(btn => {
                btn.style.pointerEvents = 'none';
                btn.style.opacity = '0.5';
            });

            // 隐藏聊天功能
            const chatWrapper = document.querySelector('.chat-messages-wrapper');
            if (chatWrapper) chatWrapper.style.display = 'none';
            const chatInput = document.querySelector('.chat-input-wrapper');
            if (chatInput) chatInput.style.display = 'none';

            // 显示公开标识
            this.showPublicBadge();
        } else {
            workspace.classList.remove('readonly-mode');
            const addSourceBtn = document.getElementById('btnAddSource');
            if (addSourceBtn) addSourceBtn.style.display = '';

            document.querySelectorAll('.transform-card').forEach(btn => {
                btn.style.pointerEvents = '';
                btn.style.opacity = '';
            });

            const chatWrapper = document.querySelector('.chat-messages-wrapper');
            if (chatWrapper) chatWrapper.style.display = '';

            const chatInput = document.querySelector('.chat-input-wrapper');
            if (chatInput) chatInput.style.display = '';

            const badge = document.querySelector('.public-badge');
            if (badge) badge.remove();
        }
    }

    // 显示公开标识
    showPublicBadge() {
        // 移除已存在的 badge
        const existingBadge = document.querySelector('.public-badge');
        if (existingBadge) existingBadge.remove();

        const nameDisplay = document.getElementById('currentNotebookName');
        if (nameDisplay && !document.querySelector('.public-badge')) {
            const badge = document.createElement('div');
            badge.className = 'public-badge';
            badge.innerHTML = `
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M5 9l2-2 2 2m-4 0l2-2 2-2"/>
                </svg>
                <span>公开</span>
            `;
            nameDisplay.parentNode.appendChild(badge);
        }
    }

    // Check if URL contains /notes/:id and auto-load the notebook
    // Returns true if a notebook was found and loaded, false otherwise
    checkURLForNotebook() {
        const path = window.location.pathname;
        const match = path.match(/^\/notes\/([a-f0-9-]+)$/);
        if (match) {
            const notebookId = match[1];
            // Check if notebook exists in loaded notebooks
            const notebook = this.notebooks.find(nb => nb.id === notebookId);
            if (notebook) {
                this.selectNotebook(notebookId);
                return true;  // Notebook found and loaded
            } else {
                // Notebook not found or user doesn't have access
                this.setStatus('笔记本不存在或无权访问', true);
                return false;  // Notebook not found
            }
        }
        return false;  // No notebook ID in URL
    }

    // Update URL when notebook is selected
    updateURL(notebookId) {
        const newURL = `/notes/${notebookId}`;
        window.history.pushState({ notebookId }, '', newURL);
    }

    async loadConfig() {
        // Config loading - no longer needed, all features enabled
    }

    applyConfig() {
        // All features enabled by default, no config to apply
    }

    initResizers() {
        const resizerLeft = document.getElementById('resizerLeft');
        const resizerRight = document.getElementById('resizerRight');
        const grid = document.querySelector('.main-grid');

        if (!resizerLeft || !resizerRight) return;

        let isDragging = false;
        let currentResizer = null;

        const startDragging = (e, resizer) => {
            isDragging = true;
            currentResizer = resizer;
            resizer.classList.add('dragging');
            document.body.style.cursor = 'col-resize';
            e.preventDefault();
        };

        const stopDragging = () => {
            if (!isDragging) return;
            isDragging = false;
            currentResizer.classList.remove('dragging');
            document.body.style.cursor = '';
            currentResizer = null;
        };

        const drag = (e) => {
            if (!isDragging) return;

            const gridRect = grid.getBoundingClientRect();
            if (currentResizer === resizerLeft) {
                const width = e.clientX - gridRect.left;
                if (width > 150 && width < 600) {
                    grid.style.setProperty('--left-width', `${width}px`);
                }
            } else if (currentResizer === resizerRight) {
                const width = gridRect.right - e.clientX;
                if (width > 200 && width < 600) {
                    grid.style.setProperty('--right-width', `${width}px`);
                }
            }
        };

        resizerLeft.addEventListener('mousedown', (e) => startDragging(e, resizerLeft));
        resizerRight.addEventListener('mousedown', (e) => startDragging(e, resizerRight));
        document.addEventListener('mousemove', drag);
        document.addEventListener('mouseup', stopDragging);
    }

    bindEvents() {
        const safeAddEventListener = (id, event, handler) => {
            const el = document.getElementById(id);
            if (el) el.addEventListener(event, handler);
        };

        safeAddEventListener('btnNewNotebook', 'click', () => this.showNewNotebookModal());
        safeAddEventListener('btnNewNotebookLanding', 'click', () => this.showNewNotebookModal());
        safeAddEventListener('btnShareNotebook', 'click', () => {
            if (this.currentNotebook) {
                this.showShareDialog(this.currentNotebook);
            }
        });

        // Share modal events
        safeAddEventListener('btnCloseShareModal', 'click', () => this.closeShareModal());
        safeAddEventListener('btnCancelShare', 'click', () => this.closeShareModal());
        safeAddEventListener('btnCopyLink', 'click', () => this.copyShareLink());
        safeAddEventListener('btnToggleShare', 'click', () => this.toggleShareFromModal());

        // Auth events
        safeAddEventListener('btnLogin', 'click', () => this.handleLogin());
        safeAddEventListener('btnLogout', 'click', () => this.handleLogout());
        safeAddEventListener('btnLoginWorkspace', 'click', () => this.handleLogin());
        safeAddEventListener('btnLogoutWorkspace', 'click', () => this.handleLogout());

        safeAddEventListener('btnBackToList', 'click', () => this.handleBackToList());
        safeAddEventListener('btnToggleRight', 'click', () => this.toggleRightPanel());
        safeAddEventListener('btnToggleLeft', 'click', () => this.toggleLeftPanel());
        safeAddEventListener('btnShowNotesDetails', 'click', () => this.showNotesListTab());
        safeAddEventListener('btnCloseNotesList', 'click', (e) => {
            e.stopPropagation();
            this.closeNotesListTab();
        });
        safeAddEventListener('btnCloseNote', 'click', (e) => {
            e.stopPropagation();
            this.closeNoteTab();
        });

        // Panel tabs
        document.querySelectorAll('.tab-btn').forEach(tab => {
            tab.addEventListener('click', () => {
                this.switchPanelTab(tab.dataset.tab);
            });
        });
        
        safeAddEventListener('newNotebookForm', 'submit', (e) => this.handleCreateNotebook(e));
        safeAddEventListener('btnCloseNotebookModal', 'click', () => this.closeModals());
        safeAddEventListener('btnCancelNotebook', 'click', () => this.closeModals());

        safeAddEventListener('btnAddSource', 'click', () => this.showAddSourceModal());
        safeAddEventListener('btnCloseSourceModal', 'click', () => this.closeModals());
        const dropZone = document.getElementById('dropZone');
        if (dropZone) {
            dropZone.addEventListener('click', () => document.getElementById('fileInput').click());
            dropZone.addEventListener('dragover', (e) => {
                e.preventDefault();
                dropZone.classList.add('drag-over');
            });
            dropZone.addEventListener('dragleave', () => {
                dropZone.classList.remove('drag-over');
            });
            dropZone.addEventListener('drop', (e) => this.handleDrop(e));
        }
        
        safeAddEventListener('fileInput', 'change', (e) => this.handleFileUpload(e));
        safeAddEventListener('textSourceForm', 'submit', (e) => this.handleTextSource(e));
        safeAddEventListener('urlSourceForm', 'submit', (e) => this.handleURLSource(e));
        safeAddEventListener('btnCancelText', 'click', () => this.closeModals());
        safeAddEventListener('btnCancelURL', 'click', () => this.closeModals());

        document.querySelectorAll('.source-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.source-tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.source-content').forEach(c => c.classList.remove('active'));
                tab.classList.add('active');
                const targetId = `source${tab.dataset.source.charAt(0).toUpperCase() + tab.dataset.source.slice(1)}`;
                const target = document.getElementById(targetId);
                if (target) target.classList.add('active');
            });
        });

        document.querySelectorAll('.transform-card').forEach(card => {
            card.addEventListener('click', (e) => {
                e.preventDefault();
                this.handleTransform(card.dataset.type, card);
            });
        });

        safeAddEventListener('btnCustomTransform', 'click', (e) => {
            this.handleTransform('custom', e.currentTarget);
        });

        safeAddEventListener('chatForm', 'submit', (e) => this.handleChat(e));

        // Chat sessions management
        safeAddEventListener('btnSaveChatSession', 'click', () => this.saveCurrentSession());
        safeAddEventListener('btnNewChatSession', 'click', () => this.handleNewChatSession());
        safeAddEventListener('btnClearSessions', 'click', () => this.handleClearSessions());

        safeAddEventListener('modalOverlay', 'click', (e) => {
            if (e.target.id === 'modalOverlay') {
                this.closeModals();
            }
        });

        // Handle browser back/forward buttons
        window.addEventListener('popstate', (event) => {
            const path = window.location.pathname;
            const match = path.match(/^\/notes\/([a-f0-9-]+)$/);
            if (match) {
                const notebookId = match[1];
                const notebook = this.notebooks.find(nb => nb.id === notebookId);
                if (notebook && !this.currentNotebook) {
                    this.selectNotebook(notebookId);
                }
            } else if (path === '/' && this.currentNotebook) {
                this.switchView('landing');
            }
        });
    }

    // API 方法
    async api(endpoint, options = {}) {
        const timeout = options.timeout || 300000; // 默认 300 秒
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), timeout);

        const defaults = {
            cache: 'no-store',
            signal: controller.signal
        };

        // Set Content-Type header (but not for FormData - let browser set it)
        if (!(options.body instanceof FormData)) {
            defaults.headers = {
                'Content-Type': 'application/json',
            };
        } else {
            defaults.headers = {};
        }

        if (this.token) {
            defaults.headers['Authorization'] = `Bearer ${this.token}`;
        }

        let url = `${this.apiBase}${endpoint}`;
        if (!options.method || options.method === 'GET') {
            const separator = url.includes('?') ? '&' : '?';
            url += `${separator}_t=${Date.now()}`;
        }

        try {
            const response = await fetch(url, { ...defaults, ...options });
            clearTimeout(id);

            if (!response.ok) {
                const error = await response.json().catch(() => ({ error: '请求失败' }));
                throw new Error(error.error || '请求失败');
            }

            if (response.status === 204) {
                return null;
            }

            return response.json();
        } catch (error) {
            clearTimeout(id);
            if (error.name === 'AbortError') {
                throw new Error('请求超时，请稍后重试');
            }
            throw error;
        }
    }

    // Auth Methods
    async initAuth() {
        if (!this.token) {
            this.updateAuthUI();
            return;
        }

        try {
            const user = await this.api('/auth/me');
            this.currentUser = user;
            this.updateAuthUI();
        } catch (error) {
            console.warn('Auth check failed:', error);
            this.handleLogout();
        }
    }

    updateAuthUI() {
        // Landing page auth UI
        const authContainer = document.getElementById('authContainer');
        const btnLogin = document.getElementById('btnLogin');
        const userProfile = document.getElementById('userProfile');
        const userAvatar = document.getElementById('userAvatar');
        const userName = document.getElementById('userName');

        // Workspace auth UI
        const btnLoginWorkspace = document.getElementById('btnLoginWorkspace');
        const userProfileWorkspace = document.getElementById('userProfileWorkspace');
        const userAvatarWorkspace = document.getElementById('userAvatarWorkspace');
        const userNameWorkspace = document.getElementById('userNameWorkspace');

        if (this.currentUser) {
            // Get provider display name
            const providerNames = {
                'github': 'GitHub',
                'google': 'Google'
            };
            const providerName = providerNames[this.currentUser.provider] || this.currentUser.provider;
            const hashIdDisplay = this.currentUser.hash_id ? `用户ID: ${this.currentUser.hash_id}\n` : '';
            const tooltipText = `登录方式: ${providerName}\n${hashIdDisplay}账号: ${this.currentUser.email}`;

            // Update landing page
            if (btnLogin) btnLogin.classList.add('hidden');
            if (userProfile) userProfile.classList.remove('hidden');
            if (userAvatar) {
                userAvatar.src = this.currentUser.avatar_url;
                userAvatar.title = tooltipText;
            }
            if (userName) userName.textContent = this.currentUser.name;

            // Update workspace
            if (btnLoginWorkspace) btnLoginWorkspace.classList.add('hidden');
            if (userProfileWorkspace) userProfileWorkspace.classList.remove('hidden');
            if (userAvatarWorkspace) {
                userAvatarWorkspace.src = this.currentUser.avatar_url;
                userAvatarWorkspace.title = tooltipText;
            }
            if (userNameWorkspace) userNameWorkspace.textContent = this.currentUser.name;
        } else {
            // Update landing page
            if (btnLogin) btnLogin.classList.remove('hidden');
            if (userProfile) userProfile.classList.add('hidden');

            // Update workspace
            if (btnLoginWorkspace) btnLoginWorkspace.classList.remove('hidden');
            if (userProfileWorkspace) userProfileWorkspace.classList.add('hidden');
        }
    }

    handleLogin() {
        // Show login modal
        this.showLoginModal();
    }

    showLoginModal() {
        // Create or get existing modal
        let modal = document.getElementById('loginModal');
        if (!modal) {
            // Create modal dynamically
            modal = document.createElement('div');
            modal.id = 'loginModal';
            modal.className = 'login-modal';
            modal.innerHTML = `
                <div class="login-modal-content">
                    <div class="login-modal-header">
                        <h3>选择登录方式</h3>
                        <button class="btn-close-login" id="btnCloseLoginModal">×</button>
                    </div>
                    <div class="login-modal-body">
                        <button class="btn-login-provider" id="btnLoginGithub">
                            <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor">
                                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
                            </svg>
                            使用 GitHub 登录
                        </button>
                        <button class="btn-login-provider" id="btnLoginGoogle">
                            <svg width="20" height="20" viewBox="0 0 16 16">
                                <path fill="#4285F4" d="M14.9 8.16c0-.95-.08-1.65-.21-2.37H8v4.4h3.83c-.17.96-.69 2.05-1.55 2.68v2.19h2.48c1.46-1.34 2.3-3.31 2.3-5.64z"/>
                                <path fill="#34A853" d="M8 16c2.07 0 3.83-.69 5.11-1.87l-2.48-2.19c-.69.46-1.57.73-2.63.73-2.02 0-3.74-1.37-4.35-3.19H1.11v2.26C2.38 13.89 4.99 16 8 16z"/>
                                <path fill="#FBBC05" d="M3.65 9.52c-.16-.46-.25-.95-.25-1.47s.09-1.01.25-1.47V4.48H1.11C.4 5.87 0 7.39 0 8s.4 2.13 1.11 3.52l2.54-2z"/>
                                <path fill="#EA4335" d="M8 3.24c1.14 0 2.17.39 2.98 1.15l2.2-2.2C11.83.87 10.07 0 8 0 4.99 0 2.38 2.11 1.11 4.48l2.54 2.26c.61-1.82 2.33-3.5 4.35-3.5z"/>
                            </svg>
                            使用 Google 登录
                        </button>
                        <button class="btn-login-provider btn-test-login" id="btnLoginTest" style="display: none;">
                            <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor">
                                <path d="M8 0C3.58 0 0 3.58 0 8s3.58 8 8 8 8-3.58 8-8-3.58-8-8-8zm1 12H7V7h2v5zm0-6H7V4h2v2z"/>
                            </svg>
                            使用测试账号登录
                        </button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);

            // Add event listeners
            document.getElementById('btnCloseLoginModal').addEventListener('click', () => {
                this.closeLoginModal();
            });
            document.getElementById('btnLoginGithub').addEventListener('click', () => {
                this.loginWithProvider('github');
            });
            document.getElementById('btnLoginGoogle').addEventListener('click', () => {
                this.loginWithProvider('google');
            });
            document.getElementById('btnLoginTest').addEventListener('click', () => {
                this.loginWithTestAccount();
            });
        }

        // Check if test mode is enabled and show test login button
        this.checkTestMode().then(enabled => {
            const testBtn = document.getElementById('btnLoginTest');
            if (testBtn && enabled) {
                testBtn.style.display = 'flex';
            }
        });

        modal.classList.add('active');
    }

    async checkTestMode() {
        try {
            const response = await fetch('/auth/test-mode');
            if (response.ok) {
                const data = await response.json();
                return data.enabled || false;
            }
        } catch (error) {
            console.warn('Failed to check test mode:', error);
        }
        return false;
    }

    async loginWithTestAccount() {
        this.closeLoginModal();

        try {
            const response = await fetch('/auth/test-login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Test login failed');
            }

            const data = await response.json();
            this.token = data.token;
            this.currentUser = data.user;
            localStorage.setItem('token', this.token);
            document.cookie = `token=${this.token}; path=/; SameSite=Lax`;

            await this.initAuth();
            this.setStatus('测试账号登录成功');
        } catch (error) {
            console.error('Test login failed:', error);
            this.showError('测试登录失败: ' + error.message);
        }
    }

    closeLoginModal() {
        const modal = document.getElementById('loginModal');
        if (modal) {
            modal.classList.remove('active');
        }
    }

    loginWithProvider(provider) {
        this.closeLoginModal();

        // Open popup
        const width = 600;
        const height = 700;
        const left = (screen.width - width) / 2;
        const top = (screen.height - height) / 2;

        window.open(
            `/auth/login/${provider}`,
            'NotexLogin',
            `width=${width},height=${height},top=${top},left=${left}`
        );

        // Listen for message with origin validation
        const messageHandler = (event) => {
            // Validate origin for security
            if (event.origin !== window.location.origin) {
                console.warn('Received message from untrusted origin:', event.origin);
                return;
            }

            if (event.data.token && event.data.user) {
                this.token = event.data.token;
                this.currentUser = event.data.user;
                localStorage.setItem('token', this.token);

                // Also set token as cookie for image loading
                document.cookie = `token=${this.token}; path=/; SameSite=Lax`;

                this.updateAuthUI();

                // Reload data
                this.loadNotebooks();
            }
        };

        window.addEventListener('message', messageHandler, { once: true });
    }

    handleLogout() {
        this.token = null;
        this.currentUser = null;
        localStorage.removeItem('token');

        // Also remove token cookie
        document.cookie = 'token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';

        // Clear cache
        this.cache.delete('notebooks');

        this.updateAuthUI();

        // Clear data
        this.notebooks = [];
        this.renderNotebooks();
        this.switchView('landing');
    }

    // 笔记本方法
    async loadNotebooks() {
        // Always load public notebooks showcase (regardless of private notebooks)
        await this.loadPublicNotebooksShowcase();

        try {
            // 先尝试从缓存获取
            const cached = this.cache.get('notebooks');
            if (cached) {
                this.notebooks = cached;
                this.renderNotebooks();
                this.updateFooter();
            }

            // 从服务器获取最新数据（包含统计信息）
            const notebooks = await this.api('/notebooks/stats');
            this.notebooks = notebooks;

            // 更新缓存
            this.cache.set('notebooks', notebooks);

            this.renderNotebooks();
            this.updateFooter();
        } catch (error) {
            // 401 Unauthorized is expected for non-logged-in users, don't show error
            if (error.message && !error.message.includes('401')) {
                console.warn('用户未登录，跳过私有笔记本加载');
            } else {
                this.showError('加载笔记本失败');
            }
        }
    }

    renderNotebooks() {
        this.renderNotebookCards();
        this.loadPublicNotebooksShowcase();
    }

    renderNotebookCards() {
        const container = document.getElementById('notebookGridLanding');
        const template = document.getElementById('notebookCardTemplate');

        container.innerHTML = '';

        if (this.notebooks.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <svg width="64" height="64" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1">
                        <rect x="12" y="12" width="40" height="40" rx="4"/>
                        <line x1="20" y1="24" x2="44" y2="24"/>
                        <line x1="20" y1="32" x2="40" y2="32"/>
                    </svg>
                    <p>开启你的知识之旅</p>
                    <button class="btn-primary" onclick="app.showNewNotebookModal()">创建第一个笔记本</button>
                </div>
            `;
            return;
        }

        this.notebooks.forEach(nb => {
            const clone = template.content.cloneNode(true);
            const card = clone.querySelector('.notebook-card');

            card.dataset.id = nb.id;
            card.querySelector('.notebook-card-name').textContent = nb.name;
            card.querySelector('.notebook-card-desc').textContent = nb.description || '暂无描述';

            // 直接使用从 API 获取的统计信息
            card.querySelector('.stat-sources').textContent = `${nb.source_count || 0} 来源`;
            card.querySelector('.stat-notes').textContent = `${nb.note_count || 0} 笔记`;
            card.querySelector('.stat-date').textContent = this.formatDate(nb.created_at);

            // 更新分享按钮状态
            const shareCardBtn = clone.querySelector('.btn-share-card');
            if (shareCardBtn) {
                if (nb.is_public) {
                    shareCardBtn.classList.add('active');
                    shareCardBtn.setAttribute('title', '已公开');
                } else {
                    shareCardBtn.classList.remove('active');
                    shareCardBtn.setAttribute('title', '分享');
                }

                // Share button event
                shareCardBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.showShareDialog(nb);
                });
            }

            card.addEventListener('click', (e) => {
                if (!e.target.closest('.btn-delete-card') && !e.target.closest('.btn-share-card')) {
                    this.selectNotebook(nb.id);
                }
            });

            const deleteCardBtn = card.querySelector('.btn-delete-card');
            deleteCardBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (confirm('确定要删除此笔记本吗？')) {
                    this.deleteNotebook(nb.id);
                }
            });

            container.appendChild(clone);
        });
    }

    // Load and render public notebooks showcase
    async loadPublicNotebooksShowcase() {
        // Prevent duplicate calls
        if (this._publicNotebooksLoaded) return;
        this._publicNotebooksLoaded = true;

        try {
            const response = await fetch('/public/notebooks');
            if (!response.ok) return;

            const notebooks = await response.json();
            this.renderPublicNotebooksShowcase(notebooks);
        } catch (error) {
            console.error('Failed to load public notebooks showcase:', error);
        }
    }

    // Cache to avoid duplicate calls
    _publicNotebooksLoaded = false;

    renderPublicNotebooksShowcase(notebooks) {
        const container = document.getElementById('publicShowcase');
        const grid = document.getElementById('publicShowcaseGrid');

        if (!container || !grid) return;

        grid.innerHTML = '';

        if (notebooks.length === 0) {
            container.style.display = 'none';
            return;
        }

        container.style.display = 'block';

        notebooks.forEach(nb => {
            const card = document.createElement('a');
            card.className = 'public-showcase-card';
            card.href = `/public/${nb.public_token}`;

            // Generate background style if cover image exists
            if (nb.cover_image_url) {
                card.style.backgroundImage = `url('${nb.cover_image_url}')`;
                card.style.backgroundSize = 'cover';
                card.style.backgroundPosition = 'center';
                card.classList.add('has-cover-image');
            }

            card.innerHTML = `
                <div class="public-showcase-card-content">
                    <h3 class="public-showcase-card-title">${this.escapeHtml(nb.name)}</h3>
                    <div class="public-showcase-card-footer">
                        <div class="public-showcase-card-stats">
                            <span>${nb.source_count || 0} 来源</span>
                            <span>${nb.note_count || 0} 笔记</span>
                        </div>
                        <span class="public-showcase-card-date">${this.formatDate(nb.created_at)}</span>
                    </div>
                </div>
            `;

            grid.appendChild(card);
        });
    }

    switchView(view) {
        const landing = document.getElementById('landingPage');
        const workspace = document.getElementById('workspaceContainer');
        const header = document.querySelector('.app-header');

        if (view === 'workspace') {
            landing.classList.add('hidden');
            workspace.classList.remove('hidden');
            header.classList.add('hidden');
        } else {
            landing.classList.remove('hidden');
            workspace.classList.add('hidden');
            header.classList.remove('hidden');
            this.currentNotebook = null;
            this.renderNotebookCards();
            // Update URL to root when returning to landing page
            window.history.pushState({}, '', '/');
        }
    }

    toggleRightPanel() {
        const grid = document.querySelector('.main-grid');
        grid.classList.toggle('right-collapsed');
    }

    toggleLeftPanel() {
        const grid = document.querySelector('.main-grid');
        grid.classList.toggle('left-collapsed');
    }

    switchPanelTab(tab) {
        // Update tab buttons
        document.querySelectorAll('.tab-btn').forEach(t => {
            t.classList.toggle('active', t.dataset.tab === tab);
        });

        // Hide all resource preview containers
        document.querySelectorAll('.resource-preview-container').forEach(el => {
            el.style.display = 'none';
        });

        // Update content visibility
        const chatMessages = document.getElementById('chatMessages');
        const chatWrapper = document.querySelector('.chat-messages-wrapper');
        const noteViewContainer = document.querySelector('.note-view-container');
        const notesDetailsView = document.querySelector('.notes-details-view');
        const sessionsPanel = document.getElementById('chatSessionsPanel');

        // Reset chatMessages to use CSS default (remove inline style)
        if (chatMessages) {
            chatMessages.style.display = '';
        }

        if (tab === 'note') {
            chatWrapper.style.display = 'none';
            if (sessionsPanel) sessionsPanel.classList.add('hidden');
            if (notesDetailsView) notesDetailsView.style.display = 'none';
            if (noteViewContainer) {
                noteViewContainer.style.display = 'flex';
            }
        } else if (tab === 'chat') {
            chatWrapper.style.display = 'flex';
            if (sessionsPanel) sessionsPanel.classList.add('hidden');
            if (notesDetailsView) notesDetailsView.style.display = 'none';
            if (noteViewContainer) {
                noteViewContainer.style.display = 'none';
            }
        } else if (tab === 'sessions') {
            // Show sessions panel, hide chat messages
            chatWrapper.style.display = 'flex';
            if (chatMessages) chatMessages.style.display = 'none';
            if (sessionsPanel) {
                sessionsPanel.classList.remove('hidden');
                // Load sessions when tab is shown
                this.loadChatSessions();
            }
            if (notesDetailsView) notesDetailsView.style.display = 'none';
            if (noteViewContainer) noteViewContainer.style.display = 'none';
        } else if (tab === 'notes_list') {
            chatWrapper.style.display = 'none';
            if (sessionsPanel) sessionsPanel.classList.add('hidden');
            if (noteViewContainer) noteViewContainer.style.display = 'none';
            if (notesDetailsView) {
                notesDetailsView.style.display = 'flex';
                // Only render if not in public mode (public mode already has data loaded)
                if (!this.currentPublicToken) {
                    this.renderNotesCompactGrid();
                }
            }
        } else if (tab.toString().startsWith('resource_')) {
            // Handle resource preview tabs
            chatWrapper.style.display = 'none';
            if (notesDetailsView) notesDetailsView.style.display = 'none';
            if (noteViewContainer) noteViewContainer.style.display = 'none';

            const resourceContainer = document.querySelector(`.resource-preview-container[data-tab-id="${tab}"]`);
            if (resourceContainer) {
                resourceContainer.style.display = 'flex';
            }
        }
    }

    async showNotesListTab() {
        const tabBtn = document.getElementById('tabBtnNotesList');
        tabBtn.classList.remove('hidden');

        // Ensure notesDetailsView container exists
        let notesDetailsView = document.querySelector('.notes-details-view');
        if (!notesDetailsView) {
            const chatWrapper = document.querySelector('.chat-messages-wrapper');
            notesDetailsView = document.createElement('div');
            notesDetailsView.className = 'notes-details-view';
            notesDetailsView.innerHTML = '<div class="notes-compact-grid"></div>';
            chatWrapper.insertAdjacentElement('afterend', notesDetailsView);
        }

        this.switchPanelTab('notes_list');
    }

    closeNotesListTab() {
        const tabBtn = document.getElementById('tabBtnNotesList');
        tabBtn.classList.add('hidden');
        
        const notesDetailsView = document.querySelector('.notes-details-view');
        if (notesDetailsView) notesDetailsView.style.display = 'none';
        
        if (tabBtn.classList.contains('active')) {
            this.switchPanelTab('chat');
        }
    }

    closeNoteTab() {
        const noteViewContainer = document.querySelector('.note-view-container');
        if (noteViewContainer) noteViewContainer.remove();
        
        const tabBtnNote = document.getElementById('tabBtnNote');
        if (tabBtnNote) tabBtnNote.style.display = 'none';

        this.switchPanelTab('chat');
    }

    async renderNotesCompactGrid() {
        if (!this.currentNotebook) return;

        const container = document.querySelector('.notes-compact-grid');
        if (!container) return;

        try {
            const notes = await this.api(`/notebooks/${this.currentNotebook.id}/notes`);
            container.innerHTML = '';

            notes.forEach(note => {
                const card = document.createElement('div');
                card.className = 'compact-note-card';
                card.dataset.noteId = note.id;

                const plainText = note.content
                    .replace(/^#+\s+/gm, '')
                    .replace(/\*\*/g, '')
                    .replace(/\*/g, '')
                    .replace(/`/g, '')
                    .replace(/\n+/g, ' ')
                    .trim();

                card.innerHTML = `
                    <button class="btn-delete-compact-note" title="删除笔记">
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5">
                            <path d="M4.5 4.5L9.5 9.5M9.5 4.5L4.5 9.5"/>
                        </svg>
                    </button>
                    <div class="note-type">${note.type}</div>
                    <h4 class="note-title">${note.title}</h4>
                    <p class="note-preview">${plainText}</p>
                    <div class="note-footer">
                        <span>${this.formatDate(note.created_at)}</span>
                        <span>${note.source_ids?.length || 0} 来源</span>
                    </div>
                `;

                // Delete button event
                const deleteBtn = card.querySelector('.btn-delete-compact-note');
                deleteBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (confirm('确定要删除此笔记吗？')) {
                        this.deleteNote(note.id);
                    }
                });

                card.addEventListener('click', () => this.viewNote(note));
                container.appendChild(card);
            });
        } catch (error) {
            console.error('Failed to load notes for grid:', error);
        }
    }

    // Render notes compact grid for public notebooks (without API call)
    async renderNotesCompactGridPublic(notes) {
        const container = document.querySelector('.notes-compact-grid');
        if (!container) return;

        container.innerHTML = '';

        notes.forEach(note => {
            const card = document.createElement('div');
            card.className = 'compact-note-card';

            const plainText = note.content
                .replace(/^#+\s+/gm, '')
                .replace(/\*\*/g, '')
                .replace(/\*/g, '')
                .replace(/`/g, '')
                .replace(/\n+/g, ' ')
                .trim();

            card.innerHTML = `
                <div class="note-type">${note.type}</div>
                <h4 class="note-title">${note.title}</h4>
                <p class="note-preview">${plainText}</p>
                <div class="note-footer">
                    <span>${this.formatDate(note.created_at)}</span>
                    <span>${note.source_ids?.length || 0} 来源</span>
                </div>
            `;

            card.addEventListener('click', () => this.viewNote(note));
            container.appendChild(card);
        });
    }

    async selectNotebook(id) {
        this.currentNotebook = this.notebooks.find(nb => nb.id === id);
        this.currentPublicToken = null;  // Clear public token when selecting regular notebook

        const nameDisplay = document.getElementById('currentNotebookName');
        nameDisplay.textContent = this.currentNotebook.name;
        nameDisplay.classList.add('editable');

        // Update URL to /notes/:id for shareable links
        this.updateURL(id);

        // 更新分享按钮状态
        this.updateShareButtonState();

        this.switchView('workspace');

        // Reset tab to notes list and remove any existing note view
        this.showNotesListTab();
        const noteView = document.querySelector('.note-view-container');
        if (noteView) noteView.remove();

        await Promise.all([
            this.loadSources(),
            this.loadNotes(),
            this.loadChatSessions()
        ]);

        this.setStatus(`当前选择: ${this.currentNotebook.name}`);
    }

    // 更新分享按钮状态
    updateShareButtonState() {
        const shareBtn = document.getElementById('btnShareNotebook');
        const shareText = document.getElementById('shareButtonText');
        if (!shareBtn || !this.currentNotebook) return;

        if (this.currentNotebook.is_public) {
            shareText.textContent = '已公开';
            shareBtn.classList.add('active');
        } else {
            shareText.textContent = '分享';
            shareBtn.classList.remove('active');
        }
    }

    // 显示分享对话框
    showShareDialog(notebook) {
        this.currentShareNotebook = notebook;
        const modal = document.getElementById('shareModal');
        const overlay = document.getElementById('modalOverlay');

        // 设置笔记本名称
        document.getElementById('shareNotebookName').textContent = notebook.name;

        // 更新状态显示
        this.updateShareModalState(notebook);

        // 显示模态框
        modal.classList.add('active');
        overlay.classList.add('active');
    }

    // 更新分享对话框状态
    updateShareModalState(notebook) {
        const statusIcon = document.getElementById('shareStatusIcon');
        const statusText = document.getElementById('shareStatusText');
        const linkSection = document.getElementById('shareLinkSection');
        const linkInput = document.getElementById('shareLinkInput');
        const toggleBtn = document.getElementById('btnToggleShare');

        if (notebook.is_public) {
            statusIcon.className = 'status-icon public';
            statusIcon.innerHTML = '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 9l2-2 2 2m-4 0l2-2 2-2"/></svg>';
            statusText.textContent = '笔记本已公开';
            linkSection.style.display = 'flex';
            linkInput.value = `${window.location.origin}/public/${notebook.public_token}`;
            toggleBtn.textContent = '取消公开';
            toggleBtn.className = 'btn-secondary';
        } else {
            statusIcon.className = 'status-icon private';
            statusIcon.innerHTML = '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="8" height="4" rx="1"/></svg>';
            statusText.textContent = '笔记本未公开';
            linkSection.style.display = 'none';
            toggleBtn.textContent = '公开笔记本';
            toggleBtn.className = 'btn-primary';
        }
    }

    // 关闭分享对话框
    closeShareModal() {
        const modal = document.getElementById('shareModal');
        const overlay = document.getElementById('modalOverlay');
        modal.classList.remove('active');
        overlay.classList.remove('active');
        this.currentShareNotebook = null;
    }

    // 复制分享链接
    copyShareLink() {
        const linkInput = document.getElementById('shareLinkInput');
        linkInput.select();
        linkInput.setSelectionRange(0, 99999); // For mobile devices

        navigator.clipboard.writeText(linkInput.value).then(() => {
            this.showToast('链接已复制到剪贴板', 'success');
        }).catch(() => {
            // Fallback
            try {
                document.execCommand('copy');
                this.showToast('链接已复制到剪贴板', 'success');
            } catch (err) {
                this.showError('复制失败，请手动复制');
            }
        });
    }

    // 切换笔记本公开状态（从对话框调用）
    async toggleShareFromModal() {
        if (!this.currentShareNotebook) return;

        const newPublicState = !this.currentShareNotebook.is_public;
        try {
            const result = await this.api(`/notebooks/${this.currentShareNotebook.id}/public`, {
                method: 'PUT',
                body: JSON.stringify({ is_public: newPublicState })
            });

            // 更新当前笔记本
            if (this.currentNotebook && this.currentNotebook.id === this.currentShareNotebook.id) {
                this.currentNotebook = result;
                this.updateShareButtonState();
            }

            // 更新笔记本列表中的数据
            const nb = this.notebooks.find(n => n.id === this.currentShareNotebook.id);
            if (nb) {
                nb.is_public = result.is_public;
                nb.public_token = result.public_token;
            }

            // 更新对话框状态
            this.currentShareNotebook = result;
            this.updateShareModalState(result);

            // 刷新笔记本列表
            this.renderNotebooks();

            this.showToast(newPublicState ? '笔记本已公开' : '笔记本已取消公开', 'success');
        } catch (error) {
            this.showError(`操作失败: ${error.message}`);
        }
    }

    initNotebookNameEditor() {
        const nameDisplay = document.getElementById('currentNotebookName');
        const nameEditor = document.getElementById('notebookNameEditor');
        const nameInput = document.getElementById('notebookNameInput');
        const saveBtn = document.getElementById('btnSaveNotebookName');
        const cancelBtn = document.getElementById('btnCancelNotebookName');

        // 双击进入编辑模式
        nameDisplay.addEventListener('dblclick', () => {
            this.startEditingNotebookName();
        });

        // 点击保存按钮
        saveBtn.addEventListener('click', () => {
            this.saveNotebookName();
        });

        // 点击取消按钮
        cancelBtn.addEventListener('click', () => {
            this.cancelEditNotebookName();
        });

        // 输入框回车保存
        nameInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                this.saveNotebookName();
            } else if (e.key === 'Escape') {
                this.cancelEditNotebookName();
            }
        });
    }

    startEditingNotebookName() {
        const nameDisplay = document.getElementById('currentNotebookName');
        const nameEditor = document.getElementById('notebookNameEditor');
        const nameInput = document.getElementById('notebookNameInput');

        nameInput.value = this.currentNotebook.name;
        nameDisplay.classList.add('hidden');
        nameEditor.classList.remove('hidden');
        nameInput.focus();
        nameInput.select();
    }

    async saveNotebookName() {
        const nameInput = document.getElementById('notebookNameInput');
        const newName = nameInput.value.trim();

        if (!newName) {
            this.showError('笔记本名称不能为空');
            return;
        }

        if (newName === this.currentNotebook.name) {
            this.cancelEditNotebookName();
            return;
        }

        try {
            this.showLoading('保存中...');

            const updated = await this.api(`/notebooks/${this.currentNotebook.id}`, {
                method: 'PUT',
                body: JSON.stringify({
                    name: newName,
                    description: this.currentNotebook.description
                })
            });

            // 更新本地数据
            this.currentNotebook.name = newName;
            this.currentNotebook.updated_at = updated.updated_at;

            // 更新 notebooks 列表中的数据
            const nb = this.notebooks.find(n => n.id === this.currentNotebook.id);
            if (nb) {
                nb.name = newName;
                nb.updated_at = updated.updated_at;
            }

            // 使缓存失效
            this.cache.delete('notebooks');

            // 更新显示
            document.getElementById('currentNotebookName').textContent = newName;
            this.cancelEditNotebookName();
            this.hideLoading();
            this.setStatus('笔记本名称已更新');

        } catch (error) {
            this.hideLoading();
            this.showError(error.message);
        }
    }

    cancelEditNotebookName() {
        const nameDisplay = document.getElementById('currentNotebookName');
        const nameEditor = document.getElementById('notebookNameEditor');

        nameDisplay.classList.remove('hidden');
        nameEditor.classList.add('hidden');
    }

    // Initialize prompt scenarios panel
    initPromptScenariosPanel() {
        const header = document.querySelector('.prompt-scenarios-header');
        if (header) {
            header.addEventListener('click', () => this.togglePromptScenariosPanel());
        }
        this.renderPromptScenarios();
    }

    // Render prompt scenarios buttons
    renderPromptScenarios() {
        const container = document.querySelector('.prompt-scenarios-container');
        if (!container) return;

        container.innerHTML = '';
        this.promptScenarios.forEach(scenario => {
            const btn = document.createElement('button');
            btn.className = 'prompt-scenario-btn';
            btn.dataset.prompt = scenario.prompt;
            btn.title = scenario.display_text;
            btn.innerHTML = `
                <span class="prompt-scenario-icon">${this.getIcon(scenario.icon)}</span>
                <span class="prompt-scenario-text">${scenario.display_text}</span>
            `;
            btn.addEventListener('click', () => this.handlePromptScenarioClick(scenario.prompt));
            container.appendChild(btn);
        });
    }

    // Handle prompt scenario button click
    handlePromptScenarioClick(prompt) {
        const chatInput = document.getElementById('chatInput');
        if (chatInput) {
            chatInput.value = prompt;
            chatInput.focus();
            // 触发输入事件以便可以开始输入
            chatInput.dispatchEvent(new Event('input'));
        }
    }

    // Toggle prompt scenarios panel collapse/expand
    togglePromptScenariosPanel() {
        const panel = document.querySelector('.prompt-scenarios-panel');
        const header = document.querySelector('.prompt-scenarios-header');
        const icon = header.querySelector('.chevron-icon');

        if (panel.classList.contains('collapsed')) {
            panel.classList.remove('collapsed');
            icon.classList.remove('rotated');
        } else {
            panel.classList.add('collapsed');
            icon.classList.add('rotated');
        }
    }

    // Get SVG icon by name
    getIcon(name) {
        const icons = {
            search: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.35-4.35"></path></svg>`,
            question: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><path d="M12 17h.01"></path></svg>`,
            lightbulb: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18h6"></path><path d="M10 22h4"></path><path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 12 3.5a4.65 4.65 0 0 0-4.5 4.5v1.29c0 .75-.15 1.48-.5 2.11"></path></svg>`,
            compare: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="18"></rect><rect x="14" y="3" width="7" height="18"></rect><path d="M10 9h4"></path><path d="M10 15h4"></path></svg>`,
            action: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"></path></svg>`,
            detail: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.35-4.35"></path><path d="M11 8v6"></path><path d="M8 11h6"></path></svg>`,
            example: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path><path d="M8 7h6"></path><path d="M8 11h8"></path><path d="M8 15h6"></path></svg>`,
            simplify: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"></path><path d="M8 14s1.5 2 4 2 4-2 4-2"></path><path d="M9 9h.01"></path><path d="M15 9h.01"></path></svg>`,
            extend: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line></svg>`,
            creative: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2z"></path></svg>`,
            expert: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`,
            conflict: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3a9 9 0 1 0 9 9 9 9 0 0 0-9-9Z"></path><path d="M12 12v6"></path><path d="M12 6v2"></path></svg>`,
            blueprint: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="3" y1="15" x2="21" y2="15"></line><line x1="9" y1="3" x2="9" y2="21"></line><line x1="15" y1="3" x2="15" y2="21"></line></svg>`,
            generate: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 22h14a2 2 0 0 0 2-2V7.5L14.5 2H6a2 2 0 0 0-2 2v4"></path><polyline points="14 2 14 8 20 8"></polyline><path d="M3 15h6"></path><path d="M6 12v6"></path></svg>`,
            assumption: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>`,
            framework: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>`,
            evidence: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>`,
            users: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>`,
            timeline: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="18" x2="21" y2="18"></line><path d="M3 6h.01"></path><path d="M3 12h.01"></path><path d="M3 18h.01"></path><path d="M21 18h.01"></path><path d="M21 12h.01"></path><path d="M21 6h.01"></path></svg>`,
            weakness: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path><path d="M12 9v4"></path><path d="M12 17h.01"></path></svg>`
        };
        return icons[name] || icons.search;
    }

    showNewNotebookModal() {
        document.getElementById('newNotebookModal').classList.add('active');
        document.getElementById('modalOverlay').classList.add('active');
        document.querySelector('#newNotebookForm input[name="name"]').focus();
    }

    async handleCreateNotebook(e) {
        e.preventDefault();
        const form = e.target;
        const data = new FormData(form);

        this.showLoading('处理中...');

        try {
            const notebook = await this.api('/notebooks', {
                method: 'POST',
                body: JSON.stringify({
                    name: data.get('name'),
                    description: data.get('description') || undefined,
                }),
            });

            // 使缓存失效
            this.cache.delete('notebooks');

            this.notebooks.push(notebook);
            this.renderNotebooks();
            this.selectNotebook(notebook.id);
            this.closeModals();
            form.reset();
            this.hideLoading();
        } catch (error) {
            this.hideLoading();
            this.showError(error.message);
        }
    }

    async deleteNotebook(id) {
        try {
            await this.api(`/notebooks/${id}`, { method: 'DELETE' });

            // 使缓存失效
            this.cache.delete('notebooks');
            this.cache.deletePattern(`sources_${id}`);
            this.cache.deletePattern(`notes_${id}`);
            this.cache.deletePattern(`chat_${id}`);

            this.notebooks = this.notebooks.filter(nb => nb.id !== id);

            if (this.currentNotebook?.id === id) {
                this.currentNotebook = null;
                this.clearContentAreas();
                this.switchView('landing');
            }

            this.renderNotebooks();
            this.updateFooter();
        } catch (error) {
            this.showError('删除笔记本失败: ' + error.message);
        }
    }

    clearContentAreas() {
        const sourcesContainer = document.getElementById('sourcesGrid');
        sourcesContainer.innerHTML = `
            <div class="empty-state">
                <svg width="64" height="64" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1">
                    <path d="M20 8 L44 8 L48 12 L48 56 L20 56 Z"/>
                    <polyline points="44,8 44,12 48,12"/>
                    <line x1="28" y1="24" x2="40" y2="24"/>
                    <line x1="28" y1="32" x2="40" y2="32"/>
                    <line x1="28" y1="40" x2="36" y2="40"/>
                </svg>
                <p>添加来源以开始</p>
                <p class="empty-hint">支持 PDF, TXT, MD, DOCX, HTML</p>
            </div>
        `;

        const notesContainer = document.getElementById('notesList');
        notesContainer.innerHTML = `
            <div class="empty-state">
                <svg width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M12 4 L36 4 L40 8 L40 44 L12 44 Z"/>
                    <polyline points="36,4 36,8 40,8"/>
                </svg>
                <p>暂无笔记</p>
                <p class="empty-hint">使用转换从来源生成笔记</p>
            </div>
        `;

        const chatContainer = document.getElementById('chatMessages');
        chatContainer.innerHTML = `
            <div class="chat-welcome">
                <svg width="40" height="40" viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1.5">
                    <circle cx="20" cy="12" r="6"/>
                    <path d="M8 38 C8 28 14 22 20 22 C26 22 32 28 32 38"/>
                </svg>
                <h3>与来源对话</h3>
                <p>询问关于笔记本内容的问题</p>
            </div>
        `;

        this.currentChatSession = null;
    }

    // 来源方法
    async loadSources() {
        if (!this.currentNotebook) return;

        const container = document.getElementById('sourcesGrid');
        const template = document.getElementById('sourceTemplate');

        try {
            // 先尝试从缓存获取
            const cacheKey = `sources_${this.currentNotebook.id}`;
            const cached = this.cache.get(cacheKey);

            // 从服务器获取最新数据
            const sources = await this.api(`/notebooks/${this.currentNotebook.id}/sources`);

            // 更新缓存
            this.cache.set(cacheKey, sources);

            if (sources.length === 0) {
                this.clearContentAreas();
                return;
            }

            container.innerHTML = '';

            sources.forEach(source => {
                const clone = template.content.cloneNode(true);
                const card = clone.querySelector('.source-card');

                card.dataset.id = source.id;
                card.dataset.status = source.status || 'completed';
                card.querySelector('.source-type-badge').textContent = source.type;
                card.querySelector('.source-name').textContent = source.name;
                card.querySelector('.source-meta').textContent = this.formatFileSize(source.file_size) || '文本来源';
                card.querySelector('.chunk-count').textContent = source.chunk_count || 0;

                // Add progress indicator for processing sources
                if (source.status === 'processing' || source.status === 'pending') {
                    const progressIndicator = document.createElement('div');
                    progressIndicator.className = 'source-progress';
                    progressIndicator.innerHTML = `
                        <div class="progress-bar-small">
                            <div class="progress-fill-small" style="width: ${this.getProgressValue(source.status, source.progress || 0)}%"></div>
                        </div>
                        <div class="progress-text-small">${this.getStatusText(source.status, source.progress || 0)}</div>
                    `;
                    card.appendChild(progressIndicator);
                }

                // Add error indicator
                if (source.status === 'error') {
                    const errorIndicator = document.createElement('div');
                    errorIndicator.className = 'source-error';
                    errorIndicator.textContent = source.error_msg || '处理失败';
                    card.appendChild(errorIndicator);
                }

                const icon = this.getSourceIcon(source.type);
                card.querySelector('.source-icon').innerHTML = icon;

                const removeBtn = card.querySelector('.btn-remove-source');
                removeBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.removeSource(source.id);
                });

                // Add click event to open resource preview
                card.addEventListener('click', () => {
                    this.resourceTabManager.openTab(source);
                });

                container.appendChild(clone);
            });

            // Start polling for processing sources
            this.startPollingForProcessingSources(sources);

            this.updateFooter();
        } catch (error) {
            console.error('加载来源失败:', error);
        }
    }

    // Start polling for any processing sources
    startPollingForProcessingSources(sources) {
        if (!this.processingSources) {
            this.processingSources = new Map();
        }

        // Clear existing polling intervals
        this.clearPollingIntervals();

        sources.forEach(source => {
            if (source.status === 'processing' || source.status === 'pending') {
                // Add to processing list
                this.processingSources.set(source.id, source);
                // Start polling for this source
                this.pollSourceStatus(source.id);
            }
        });
    }

    // Clear all polling intervals
    clearPollingIntervals() {
        if (this.pollingIntervals) {
            this.pollingIntervals.forEach(clearInterval);
            this.pollingIntervals = [];
        } else {
            this.pollingIntervals = [];
        }
    }

    getSourceIcon(type) {
        const icons = {
            file: '<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M10 4 L24 4 L30 10 L30 36 L10 36 Z"/><polyline points="24,4 24,10 30,10"/></svg>',
            text: '<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 6 L32 6"/><path d="M8 12 L32 12"/><path d="M8 18 L28 18"/><path d="M8 24 L32 24"/><path d="M8 30 L24 30"/></svg>',
            url: '<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 20 C12 14 16 10 22 10 C28 10 32 14 32 20 C32 26 28 30 22 30"/><path d="M28 20 C28 26 24 30 18 30 C12 30 8 26 8 20 C8 14 12 10 18 10"/></svg>',
            insight: '<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="20" cy="20" r="14"/><path d="M20 12 L20 22"/><path d="M20 26 L20 28"/><circle cx="20" cy="20" r="8" stroke-dasharray="2 2"/></svg>',
        };
        return icons[type] || icons.file;
    }

    formatFileSize(bytes) {
        if (!bytes) return null;
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    // Render sources from data (for public notebooks)
    async renderSourcesList(sources) {
        const container = document.getElementById('sourcesGrid');
        const template = document.getElementById('sourceTemplate');

        if (!container || !template) return;

        container.innerHTML = '';

        if (sources.length === 0) {
            this.clearContentAreas();
            return;
        }

        sources.forEach(source => {
            const clone = template.content.cloneNode(true);
            const card = clone.querySelector('.source-card');

            card.dataset.id = source.id;
            card.querySelector('.source-type-badge').textContent = source.type;
            card.querySelector('.source-name').textContent = source.name;
            card.querySelector('.source-meta').textContent = this.formatFileSize(source.file_size) || '文本来源';
            card.querySelector('.chunk-count').textContent = source.chunk_count || 0;

            const icon = this.getSourceIcon(source.type);
            card.querySelector('.source-icon').innerHTML = icon;

            // Remove delete button for public notebooks
            const removeBtn = card.querySelector('.btn-remove-source');
            if (removeBtn) {
                removeBtn.style.display = 'none';
            }

            // Add click event to open resource preview
            card.addEventListener('click', () => {
                this.resourceTabManager.openTab(source);
            });

            container.appendChild(clone);
        });

        this.updateFooter();
    }

    // Render notes from data (for public notebooks)
    async renderNotesList(notes) {
        const container = document.getElementById('notesList');
        const template = document.getElementById('noteTemplate');

        if (!container || !template) return;

        container.innerHTML = '';

        if (notes.length === 0) {
            return;
        }

        notes.forEach(note => {
            const clone = template.content.cloneNode(true);
            const item = clone.querySelector('.note-item');

            item.dataset.id = note.id;
            item.querySelector('.note-type-badge').textContent = this.noteTypeNameMap[note.type] || note.type.toUpperCase();
            item.querySelector('.note-title').textContent = note.title;

            const plainText = note.content
                .replace(/^#+\s+/gm, '')
                .replace(/\*\*/g, '')
                .replace(/\*/g, '')
                .replace(/`/g, '')
                .replace(/\ \[([^\]]+)\]\([^)]+\)/g, '$1')
                .replace(/\n+/g, ' ')
                .trim();

            item.querySelector('.note-preview').textContent = plainText;
            item.querySelector('.note-date').textContent = this.formatDate(note.created_at);
            item.querySelector('.note-sources').textContent = `${note.source_ids?.length || 0} 来源`;

            // Remove delete button for public notebooks
            const deleteBtn = item.querySelector('.btn-delete-note');
            if (deleteBtn) {
                deleteBtn.style.display = 'none';
            }

            item.addEventListener('click', (e) => {
                if (!e.target.closest('.btn-delete-note')) {
                    this.viewNote(note);
                }
            });

            container.appendChild(clone);
        });

        this.updateFooter();
    }

    showAddSourceModal() {
        if (!this.currentNotebook) {
            this.showError('请先选择一个笔记本');
            return;
        }
        document.getElementById('addSourceModal').classList.add('active');
        document.getElementById('modalOverlay').classList.add('active');
    }

    async handleFileUpload(e) {
        const files = e.target.files;
        if (!files.length) return;

        if (!this.currentNotebook) {
            this.showError('请先选择一个笔记本');
            return;
        }

        // Close modal immediately
        this.closeModals();

        for (const file of files) {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('notebook_id', this.currentNotebook.id);

            try {
                const response = await this.api('/upload', {
                    method: 'POST',
                    body: formData,
                });
                
                // Add to processing list and show card immediately
                this.addProcessingSource(response);
                
                // Add card to UI immediately with progress
                this.addSourceCardToGrid(response);
                
                // Start polling for status
                this.pollSourceStatus(response.id);
            } catch (error) {
                this.showError(`上传失败: ${file.name} - ${error.message}`);
            }
        }

        await this.updateCurrentNotebookCounts();
        document.getElementById('fileInput').value = '';
    }

    addProcessingSource(source) {
        // Add to the sources list with processing status
        if (!this.processingSources) {
            this.processingSources = new Map();
        }
        this.processingSources.set(source.id, source);
    }
    
    addSourceCardToGrid(source) {
        const sourcesGrid = document.getElementById('sourcesGrid');
        if (!sourcesGrid) return;
        
        const template = document.getElementById('sourceTemplate');
        const clone = template.content.cloneNode(true);
        const card = clone.querySelector('.source-card');
        
        card.dataset.id = source.id;
        card.dataset.status = source.status || 'pending';
        card.querySelector('.source-type-badge').textContent = source.type;
        card.querySelector('.source-name').textContent = source.name;
        card.querySelector('.source-meta').textContent = this.formatFileSize(source.file_size) || '等待中...';
        card.querySelector('.chunk-count').textContent = '0';
        
        const icon = this.getSourceIcon(source.type);
        card.querySelector('.source-icon').innerHTML = icon;
        
        // Add progress indicator for processing sources
        if (source.status === 'processing' || source.status === 'pending') {
            const progressIndicator = document.createElement('div');
            progressIndicator.className = 'source-progress';
            progressIndicator.innerHTML = `
                <div class="progress-bar-small">
                    <div class="progress-fill-small" style="width: ${source.progress || 0}%"></div>
                </div>
                <div class="progress-text-small">${this.getStatusText(source.status, source.progress || 0)}</div>
            `;
            card.appendChild(progressIndicator);
        }
        
        // Add remove button handler
        const removeBtn = card.querySelector('.btn-remove-source');
        removeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.removeSource(source.id);
        });
        
        // Add click event to open resource preview
        card.addEventListener('click', () => {
            this.resourceTabManager.openTab(source);
        });
        
        // Insert at the beginning of the grid
        sourcesGrid.insertBefore(clone, sourcesGrid.firstChild);
    }

    async pollSourceStatus(sourceId) {
        console.log(`[Poll] Starting poll for source: ${sourceId}`);
        const pollInterval = setInterval(async () => {
            try {
                const response = await this.api(`/sources/${sourceId}`);
                const source = response;

                console.log(`[Poll] Source ${sourceId}: status=${source.status}, progress=${source.progress}`);

                // Update processing status
                if (this.processingSources) {
                    this.processingSources.set(sourceId, source);
                    this.updateProcessingUI();
                }

                // Check if processing is complete or failed
                if (source.status === 'completed' || source.status === 'error') {
                    console.log(`[Poll] Source ${sourceId} finished: ${source.status}`);
                    clearInterval(pollInterval);

                    // Show 100% completion message
                    if (this.processingSources) {
                        // Keep status as 'processing' to show progress bar, but set progress to 100
                        this.processingSources.set(sourceId, { ...source, status: 'processing', progress: 100 });
                        this.updateProcessingUI();
                    }

                    // Wait 2 seconds before removing progress bar
                    await new Promise(resolve => setTimeout(resolve, 2000));

                    // Update card with final data (removes progress bar)
                    await this.updateSourceCard(sourceId);

                    // Remove from processing list
                    if (this.processingSources && this.processingSources.has(sourceId)) {
                        this.processingSources.delete(sourceId);
                    }
                }
            } catch (error) {
                console.error('Failed to poll source status:', error);
                clearInterval(pollInterval);
            }
        }, 1000); // Poll every 1 second for smoother progress

        // Track the interval for cleanup
        if (!this.pollingIntervals) {
            this.pollingIntervals = [];
        }
        this.pollingIntervals.push(pollInterval);
    }

    updateProcessingUI() {
        if (!this.processingSources || this.processingSources.size === 0) {
            return;
        }
        
        // Update each processing source card
        for (const [id, source] of this.processingSources) {
            const card = document.querySelector(`.source-card[data-id="${id}"]`);
            if (!card) {
                // Card doesn't exist, reload sources
                this.loadSources();
                return;
            }
            
            // Remove existing progress indicator if any
            const existingProgress = card.querySelector('.source-progress');
            if (existingProgress) {
                existingProgress.remove();
            }
            
            // Remove existing error if any
            const existingError = card.querySelector('.source-error');
            if (existingError) {
                existingError.remove();
            }
            
            // If processing or error, add progress indicator
            if (source.status === 'processing' || source.status === 'pending' || source.status === 'error') {
                const progressIndicator = document.createElement('div');
                progressIndicator.className = 'source-progress';

                const statusText = this.getStatusText(source.status, source.progress);
                const isError = source.status === 'error';
                const progressValue = this.getProgressValue(source.status, source.progress || 0);

                progressIndicator.innerHTML = `
                    <div class="progress-bar-small ${isError ? 'error' : ''}">
                        <div class="progress-fill-small" style="width: ${progressValue}%"></div>
                    </div>
                    <div class="progress-text-small">${statusText}</div>
                `;

                card.appendChild(progressIndicator);
                card.dataset.status = source.status;
            } else if (source.status === 'completed') {
                // Show 100% progress before removing
                const progressIndicator = document.createElement('div');
                progressIndicator.className = 'source-progress';

                const statusText = this.getStatusText('processing', 100);

                progressIndicator.innerHTML = `
                    <div class="progress-bar-small">
                        <div class="progress-fill-small" style="width: 100%"></div>
                    </div>
                    <div class="progress-text-small">${statusText}</div>
                `;

                card.appendChild(progressIndicator);
            }
        }
    }

    getStatusText(status, progress) {
        switch (status) {
            case 'pending':
                return '等待处理...';
            case 'processing':
                return `处理中... ${progress}%`;
            case 'completed':
                return '完成 ✓';
            case 'error':
                return '处理失败';
            default:
                return `${progress}%`;
        }
    }

    getProgressValue(status, progress) {
        switch (status) {
            case 'pending':
                return 1; // Show at least 1% for pending state
            case 'processing':
            case 'completed':
            case 'error':
                return progress;
            default:
                return progress || 1;
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    async updateSourceCard(sourceId) {
        try {
            const source = await this.api(`/sources/${sourceId}`);
            const card = document.querySelector(`.source-card[data-id="${sourceId}"]`);
            if (!card) {
                // Card not found, reload all sources
                await this.loadSources();
                return;
            }
            
            // Update card content
            card.dataset.status = source.status || '';
            
            // Remove progress indicator
            const progress = card.querySelector('.source-progress');
            if (progress) {
                progress.remove();
            }
            
            // Remove error indicator
            const error = card.querySelector('.source-error');
            if (error) {
                error.remove();
            }
            
            // Update file size display
            if (source.file_size) {
                card.querySelector('.source-meta').textContent = this.formatFileSize(source.file_size);
            }
            
            // Update chunk count
            card.querySelector('.chunk-count').textContent = source.chunk_count || 0;
            
            // Add click handler if not already added
            if (!card.hasAttribute('data-handled')) {
                card.setAttribute('data-handled', 'true');
                const removeBtn = card.querySelector('.btn-remove-source');
                if (removeBtn) {
                    removeBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this.removeSource(source.id);
                    });
                }
                
                card.addEventListener('click', () => {
                    this.resourceTabManager.openTab(source);
                });
            }
        } catch (error) {
            console.error('Failed to update source card:', error);
            // Fallback to reload all sources
            await this.loadSources();
        }
    }

    async handleTextSource(e) {
        e.preventDefault();
        const form = e.target;
        const data = new FormData(form);

        this.showLoading('处理中...');

        try {
            await this.api(`/notebooks/${this.currentNotebook.id}/sources`, {
                method: 'POST',
                body: JSON.stringify({
                    name: data.get('name'),
                    type: 'text',
                    content: data.get('content'),
                }),
            });

            this.hideLoading();
            this.closeModals();
            form.reset();
            await this.loadSources();
            await this.updateCurrentNotebookCounts();
        } catch (error) {
            this.hideLoading();
            this.showError(error.message);
        }
    }

    async handleURLSource(e) {
        e.preventDefault();
        const form = e.target;
        const data = new FormData(form);

        this.showLoading('获取网址内容中...');

        try {
            await this.api(`/notebooks/${this.currentNotebook.id}/sources`, {
                method: 'POST',
                body: JSON.stringify({
                    name: data.get('name') || data.get('url'),
                    type: 'url',
                    url: data.get('url'),
                }),
            });

            this.hideLoading();
            this.closeModals();
            form.reset();
            await this.loadSources();
            await this.updateCurrentNotebookCounts();
        } catch (error) {
            this.hideLoading();
            this.showError(error.message);
        }
    }

    handleDrop(e) {
        e.preventDefault();
        document.getElementById('dropZone').classList.remove('drag-over');

        const files = e.dataTransfer.files;
        if (!files.length) return;

        document.getElementById('fileInput').files = files;
        this.handleFileUpload({ target: { files } });
    }

    async removeSource(id) {
        try {
            await this.api(`/notebooks/${this.currentNotebook.id}/sources/${id}`, {
                method: 'DELETE',
            });
            await this.loadSources();
            await this.updateCurrentNotebookCounts();
        } catch (error) {
            this.showError('移除来源失败');
        }
    }

    // 笔记方法
    async loadNotes() {
        if (!this.currentNotebook) return;

        const container = document.getElementById('notesList');
        const template = document.getElementById('noteTemplate');
        const countHeader = document.querySelector('.section-notes .panel-title');

        try {
            // 先尝试从缓存获取
            const cacheKey = `notes_${this.currentNotebook.id}`;
            const cached = this.cache.get(cacheKey);

            // 从服务器获取最新数据
            const notes = await this.api(`/notebooks/${this.currentNotebook.id}/notes`);

            // 更新缓存
            this.cache.set(cacheKey, notes);
            
            if (countHeader) {
                countHeader.textContent = `笔记 (${notes.length})`;
            }

            if (notes.length === 0) {
                container.innerHTML = `
                    <div class="empty-state">
                        <svg width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.5">
                            <path d="M12 4 L36 4 L40 8 L40 44 L12 44 Z"/>
                            <polyline points="36,4 36,8 40,8"/>
                        </svg>
                        <p>暂无笔记</p>
                        <p class="empty-hint">使用转换从来源生成笔记</p>
                    </div>
                `;
                return;
            }

            container.innerHTML = '';

            notes.forEach(note => {
                const clone = template.content.cloneNode(true);
                const item = clone.querySelector('.note-item');

                item.dataset.id = note.id;
                item.querySelector('.note-type-badge').textContent = this.noteTypeNameMap[note.type] || note.type.toUpperCase();
                item.querySelector('.note-title').textContent = note.title;

                const plainText = note.content
                    .replace(/^#+\s+/gm, '')
                    .replace(/\*\*/g, '')
                    .replace(/\*/g, '')
                    .replace(/`/g, '')
                    .replace(/\ \[([^\]]+)\]\([^)]+\)/g, '$1')
                    .replace(/\n+/g, ' ')
                    .trim();

                item.querySelector('.note-preview').textContent = plainText;
                item.querySelector('.note-date').textContent = this.formatDate(note.created_at);
                item.querySelector('.note-sources').textContent = `${note.source_ids?.length || 0} 来源`;

                const deleteBtn = item.querySelector('.btn-delete-note');
                deleteBtn.addEventListener('click', () => {
                    this.deleteNote(note.id);
                });

                item.addEventListener('click', (e) => {
                    if (!e.target.closest('.btn-delete-note')) {
                        this.viewNote(note);
                    }
                });

                container.appendChild(clone);
            });

            this.updateFooter();
        } catch (error) {
            console.error('加载笔记失败:', error);
        }
    }

    async viewNote(note) {
        // Debug: log note metadata
        console.log('viewNote - metadata:', note.metadata);
        console.log('viewNote - image_url:', note.metadata?.image_url);
        console.log('viewNote - currentPublicToken:', this.currentPublicToken);

        // Rewrite image URLs for public notebooks
        const content = this.rewriteImageUrlsForPublic(note.content);
        const renderedContent = marked.parse(content);

        // 信息图错误提示 HTML
        let infographicErrorHTML = '';
        if (note.type === 'infograph' && note.metadata?.image_error) {
            const fullPrompt = note.content + '\n\n**注意：无论来源是什么语言，请务必使用中文**';
            const escapedPrompt = this.escapeHtml(fullPrompt);
            const escapedError = this.escapeHtml(note.metadata.image_error);

            infographicErrorHTML = `
                <div class="infographic-error-banner">
                    <div class="error-banner-content">
                        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="10" cy="10" r="8"/>
                            <line x1="10" y1="7" x2="10" y2="13"/>
                            <line x1="10" y1="16" x2="10" y2="16"/>
                        </svg>
                        <div>
                            <strong>图片生成失败</strong>
                            <p>${escapedError}</p>
                        </div>
                    </div>
                    <div class="error-banner-prompt">
                        <strong>生成的 Prompt（可用于手动生成）：</strong>
                        <pre>${escapedPrompt}</pre>
                    </div>
                </div>
            `;
        }

        // Rewrite image URL for infographics if present
        const originalImageUrl = note.metadata?.image_url || null;
        const infographicImageUrl = originalImageUrl
            ? this.rewriteImageUrlsForPublic(originalImageUrl)
            : null;

        console.log('viewNote - originalImageUrl:', originalImageUrl);
        console.log('viewNote - infographicImageUrl:', infographicImageUrl);

        const infographicHTML = infographicImageUrl
            ? `<div class="infographic-container">
                 <img src="${infographicImageUrl}" alt="Infographic" class="infographic-image" onerror="console.error('Failed to load image:', this.src)">
                 <div class="infographic-actions">
                    <a href="${infographicImageUrl}" target="_blank" class="btn-text">查看大图</a>
                 </div>
               </div>`
            : '';

        // PPT Slider HTML
        let pptSliderHTML = '';
        if (note.metadata?.slides && note.metadata.slides.length > 0) {
            const slides = note.metadata.slides.map(src => {
                const rewritten = this.rewriteImageUrlsForPublic(src);
                console.log('viewNote - slide original:', src, 'rewritten:', rewritten);
                return rewritten;
            });
            pptSliderHTML = `
                <div class="ppt-viewer-container" id="pptViewer">
                    <div class="ppt-slides-wrapper">
                        ${slides.map((src, index) => `
                            <div class="ppt-slide ${index === 0 ? 'active' : ''}" data-index="${index}">
                                <img src="${src}" alt="Slide ${index + 1}" onerror="console.error('Failed to load slide:', this.src)">
                                <div class="ppt-slide-counter">${index + 1} / ${slides.length}</div>
                            </div>
                        `).join('')}
                    </div>
                    <div class="ppt-controls">
                        <button class="btn-ppt-nav prev" id="btnPptPrev">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"></polyline></svg>
                        </button>
                        <button class="btn-ppt-nav next" id="btnPptNext">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>
                        </button>
                    </div>
                </div>
            `;
        }

        // Determine if we should show the text content
        const showMarkdownContent = (note.type !== 'infograph' && note.type !== 'ppt') || (!note.metadata?.image_url && !note.metadata?.slides);

        // Show the Note tab button
        const tabBtnNote = document.getElementById('tabBtnNote');
        if (tabBtnNote) {
            tabBtnNote.style.display = 'flex';
        }

        // Remove existing note view if any
        const existingNoteView = document.querySelector('.note-view-container');
        if (existingNoteView) {
            existingNoteView.remove();
        }

        // Create note view container and insert it after chat-messages-wrapper
        const noteViewHTML = `
            <div class="note-view-container">
                <div class="note-view-header">
                    <div class="note-view-info">
                        <span class="note-view-type">${note.type}</span>
                        <span class="note-view-title-text">${note.title}</span>
                    </div>
                    <div class="note-view-actions">
                        <button class="btn-copy-note" id="btnCopyNote" title="复制 Markdown">
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2">
                                <rect x="3" y="3" width="10" height="10" rx="1"/>
                                <path d="M7 3 L7 1 C7 1 13 1 13 1 L13 13 L11 13"/>
                            </svg>
                        </button>
                    </div>
                </div>
                <div class="note-view-content">
                    ${infographicErrorHTML}
                    ${infographicHTML}
                    ${pptSliderHTML}
                    <div class="markdown-content" style="${showMarkdownContent ? '' : 'display:none'}">${renderedContent}</div>
                </div>
            </div>
        `;

        const chatWrapper = document.querySelector('.chat-messages-wrapper');
        chatWrapper.insertAdjacentHTML('afterend', noteViewHTML);

        // PPT Navigation Logic
        if (note.metadata?.slides) {
            let currentSlide = 0;
            const slidesCount = note.metadata.slides.length;
            const slideElements = document.querySelectorAll('.ppt-slide');
            
            const showSlide = (n) => {
                slideElements[currentSlide].classList.remove('active');
                currentSlide = (n + slidesCount) % slidesCount;
                slideElements[currentSlide].classList.add('active');
            };

            document.getElementById('btnPptPrev').addEventListener('click', () => showSlide(currentSlide - 1));
            document.getElementById('btnPptNext').addEventListener('click', () => showSlide(currentSlide + 1));
            
            // Key navigation
            const keyHandler = (e) => {
                if (e.key === 'ArrowLeft') showSlide(currentSlide - 1);
                if (e.key === 'ArrowRight') showSlide(currentSlide + 1);
            };
            document.addEventListener('keydown', keyHandler);
            // Cleanup handler on container remove? We'll leave it for now or add observer
        }

        // Render Mermaid diagrams if any
        if (window.mermaid) {
            try {
                mermaid.initialize({ 
                    startOnLoad: false, 
                    theme: 'base',
                    securityLevel: 'loose',
                    fontFamily: 'var(--font-sans)',
                    themeVariables: {
                        // Vibrant WeChat Green Theme
                        primaryColor: '#ecfdf5', // Lighter, more vibrant green background
                        primaryTextColor: '#065f46', // Deep emerald for text
                        primaryBorderColor: '#10b981', // Bright emerald border
                        lineColor: '#10b981', // Bright line color
                        secondaryColor: '#f0fdf4',
                        tertiaryColor: '#ffffff',
                        fontSize: '14px',
                        mainBkg: '#ecfdf5',
                        nodeBorder: '#10b981',
                        clusterBkg: '#f0fdf4',
                        // Mindmap specific vibrancy
                        nodeTextColor: '#065f46',
                        edgeColor: '#34d399' // Slightly lighter green for edges
                    },
                    mindmap: {
                        useMaxWidth: true,
                        padding: 20
                    }
                });
                
                const contentArea = document.querySelector('.note-view-content');
                const mermaidBlocks = contentArea.querySelectorAll('pre code.language-mermaid');
                
                // Helper to fix common mermaid errors
                const sanitizeMermaid = (code) => {
                    let sanitized = code.trim();

                    // 1. If it's a graph and has unquoted brackets, try to wrap them
                    if (sanitized.startsWith('graph')) {
                        // Fix things like: A --> socket() --> B
                        sanitized = sanitized.replace(/(\s+)-->(\s+)([^"\s][^-\n>]*\([^)]*\)[^-\n>]*)/g, '$1-->$2"$3"');
                        sanitized = sanitized.replace(/([^"\s][^-\n>]*\([^)]*\)[^-\n>]*)\s+-->/g, '"$1" -->');
                    }

                    // 2. Fix mindmap - handle special characters in node labels
                    if (sanitized.startsWith('mindmap')) {
                        const lines = sanitized.split('\n');
                        const processedLines = [];

                        for (let i = 0; i < lines.length; i++) {
                            let line = lines[i];
                            const trimmed = line.trim();

                            // Skip empty lines and the mindmap declaration
                            if (!trimmed || trimmed === 'mindmap') {
                                processedLines.push(line);
                                continue;
                            }

                            // Fix root if missing double parens
                            if (trimmed.startsWith('root') && !line.includes('((')) {
                                line = line.replace(/root\s+(.+)/, 'root(($1))');
                                processedLines.push(line);
                                continue;
                            }

                            // For other nodes, check if they contain special characters that need quoting
                            // Special chars: parentheses, brackets, braces, quotes, colons, semicolons
                            const hasSpecialChars = /[\(\)\[\]\{\}"':;,\s]{2,}/.test(trimmed);
                            const alreadyQuoted = /^["'].*["']$/.test(trimmed) || /^\(.*\)$/.test(trimmed) || /^\[.*\]$/.test(trimmed);

                            if (hasSpecialChars && !alreadyQuoted && trimmed.length > 0) {
                                // Extract indentation and node content
                                const indentMatch = line.match(/^(\s*)/);
                                const indent = indentMatch ? indentMatch[1] : '';
                                const content = trimmed;

                                // Wrap in quotes and preserve the original brackets for styling
                                // Replace inner parentheses that are part of the content with quoted version
                                processedLines.push(indent + '"' + content.replace(/"/g, '\\"') + '"');
                            } else {
                                processedLines.push(line);
                            }
                        }

                        sanitized = processedLines.join('\n');
                    }

                    return sanitized;
                };

                for (let i = 0; i < mermaidBlocks.length; i++) {
                    const block = mermaidBlocks[i];
                    const pre = block.parentElement;
                    const rawCode = block.textContent;
                    const cleanCode = sanitizeMermaid(rawCode);
                    
                    const id = `mermaid-diag-${Date.now()}-${i}`;
                    
                    try {
                        const { svg } = await mermaid.render(id, cleanCode);
                        const container = document.createElement('div');
                        container.className = 'mermaid-diagram';
                        container.innerHTML = svg;
                        pre.parentNode.replaceChild(container, pre);
                    } catch (renderErr) {
                        console.error('Mermaid Render Error:', renderErr);
                        // Final fallback: If rendering failed, try one more time by stripping ALL parentheses from labels
                        try {
                            const lastResort = cleanCode.replace(/\(|\)/g, '');
                            const { svg } = await mermaid.render(`${id}-retry`, lastResort);
                            const container = document.createElement('div');
                            container.className = 'mermaid-diagram';
                            container.innerHTML = svg;
                            pre.parentNode.replaceChild(container, pre);
                        } catch (e) {
                            pre.innerHTML = `<div style="color:red; font-size:12px; padding:10px;">渲染失败: ${renderErr.message}</div>`;
                        }
                    }
                }
            } catch (err) {
                console.error('Mermaid general error:', err);
            }
        }

        // Render MathJax if available
        if (window.MathJax && window.MathJax.typesetPromise) {
            try {
                await MathJax.typesetPromise([document.querySelector('.note-view-content')]);
            } catch (e) {
                console.warn('MathJax rendering error:', e);
            }
        }

        // Render ECharts if note type is data_chart
        if (note.type === 'data_chart') {
            try {
                const contentArea = document.querySelector('.note-view-content');
                const markdownContent = document.querySelector('.markdown-content');

                // Try to parse the note content as JSON for chart options
                let charts = [];
                try {
                    // Check if content contains JSON array or object
                    const jsonMatch = note.content.match(/(\[[\s\S]*\])|(\{[\s\S]*\})/);
                    if (jsonMatch) {
                        const parsed = JSON.parse(jsonMatch[0]);
                        if (Array.isArray(parsed)) {
                            // New format: array of {title, option}
                            charts = parsed.map(item => ({
                                title: item.title || '',
                                option: item.option
                            }));
                        } else if (parsed.charts) {
                            // Old format: {charts: [{title, option}]}
                            charts = parsed.charts.map(item => ({
                                title: item.title || '',
                                option: item.option
                            }));
                        } else if (parsed.option) {
                            // Single chart format: {option: {...}}
                            charts = [{ title: '', option: parsed.option }];
                        }
                    }
                } catch (e) {
                    console.log('Failed to parse chart JSON:', e);
                }

                if (charts.length > 0) {
                    // Create chart containers
                    const chartContainer = document.createElement('div');
                    chartContainer.className = 'charts-container';

                    charts.forEach((chart, index) => {
                        const chartWrapper = document.createElement('div');
                        chartWrapper.className = 'chart-wrapper';

                        const chartDiv = document.createElement('div');
                        chartDiv.className = 'chart-div';
                        chartDiv.id = `chart-${note.id}-${index}`;

                        chartWrapper.appendChild(chartDiv);
                        chartContainer.appendChild(chartWrapper);

                        // Initialize ECharts
                        const echartsInstance = echarts.init(chartDiv, {
                            renderer: 'canvas',
                            useDirtyRect: true
                        });

                        echartsInstance.setOption(chart.option);

                        // Resize after 2 seconds to ensure proper display
                        setTimeout(() => {
                            echartsInstance.resize();
                        }, 2000);

                        // Responsive resize
                        window.addEventListener('resize', () => {
                            echartsInstance.resize();
                        });
                    });

                    // Insert charts before markdown content
                    contentArea.insertBefore(chartContainer, markdownContent);
                    markdownContent.style.display = 'none';
                }
            } catch (error) {
                console.error('Failed to render charts:', error);
            }
        }

        // Switch to note tab
        this.switchPanelTab('note');

        // Copy button
        const copyBtn = document.getElementById('btnCopyNote');
        copyBtn.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(note.content);
                const originalHTML = copyBtn.innerHTML;
                copyBtn.innerHTML = `
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="4,8 6,10 12,4"/>
                    </svg>
                `;
                copyBtn.classList.add('copied');
                setTimeout(() => {
                    copyBtn.innerHTML = originalHTML;
                    copyBtn.classList.remove('copied');
                }, 2000);
                this.setStatus('已复制!');
            } catch (err) {
                this.showError('复制失败');
            }
        });

        // Highlight the selected note in the sidebar
        document.querySelectorAll('.note-item').forEach(el => {
            el.classList.remove('selected');
        });
        const noteItem = document.querySelector(`.note-item[data-id="${note.id}"]`);
        if (noteItem) {
            noteItem.classList.add('selected');
        }
    }

    async deleteNote(id) {
        // Immediately remove from UI
        const noteCard = document.querySelector(`.compact-note-card[data-note-id="${id}"]`);
        if (noteCard) {
            noteCard.remove();
        }

        // Also remove from notes list sidebar
        const noteItem = document.querySelector(`.note-item[data-id="${id}"]`);
        if (noteItem) {
            noteItem.remove();
        }

        try {
            await this.api(`/notebooks/${this.currentNotebook.id}/notes/${id}`, {
                method: 'DELETE',
            });
            await this.loadNotes();
            await this.updateCurrentNotebookCounts();

            // If notes_list tab is active or visible, refresh it
            const tabBtnNotesList = document.getElementById('tabBtnNotesList');
            if (tabBtnNotesList && !tabBtnNotesList.classList.contains('hidden')) {
                this.renderNotesCompactGrid();
            }
        } catch (error) {
            this.showError('删除笔记失败');
            // Reload to restore if deletion failed
            await this.loadNotes();
            this.renderNotesCompactGrid();
        }
    }

    // 转换方法
    async handleTransform(type, element) {
        if (!this.currentNotebook) {
            this.showError('请先选择一个笔记本');
            return;
        }

        // 洞察按钮：在新窗口打开 insight.rpcx.io
        if (type === 'insight') {
            window.open('https://insight.rpcx.io', '_blank');
            return;
        }

        const sources = await this.api(`/notebooks/${this.currentNotebook.id}/sources`);
        if (sources.length === 0) {
            this.showError('请先添加来源');
            return;
        }

        const customPrompt = document.getElementById('customPrompt').value;
        const typeName = this.noteTypeNameMap[type] || '内容';

        // 1. 开始动画
        if (element) {
            element.classList.add('loading');
        }

        // 2. 添加占位笔记
        const notesContainer = document.getElementById('notesList');
        const template = document.getElementById('noteTemplate');
        const placeholder = template.content.cloneNode(true).querySelector('.note-item');
        
        placeholder.classList.add('placeholder');
        placeholder.querySelector('.note-title').textContent = `正在生成${typeName}...`;
        placeholder.querySelector('.note-preview').textContent = 'AI 正在分析您的来源并撰写笔记，请稍候...';
        placeholder.querySelector('.note-date').textContent = '刚刚';
        placeholder.querySelector('.note-type-badge').textContent = type.toUpperCase();
        
        // 占位符暂不显示删除按钮
        const delBtn = placeholder.querySelector('.btn-delete-note');
        if (delBtn) delBtn.style.display = 'none';
        
        // 如果有“暂无笔记”状态，先清空
        const emptyState = notesContainer.querySelector('.empty-state');
        if (emptyState) emptyState.remove();
        
        notesContainer.prepend(placeholder);
        placeholder.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

        try {
            const sourceIds = sources.map(s => s.id);
            const note = await this.api(`/notebooks/${this.currentNotebook.id}/transform`, {
                method: 'POST',
                body: JSON.stringify({
                    type: type,
                    prompt: customPrompt || undefined,
                    source_ids: sourceIds,
                    length: 'medium',
                    format: 'markdown',
                }),
            });

            // 3. 停止动画并更新占位符
            if (element) element.classList.remove('loading');

            // 替换占位符内容
            placeholder.classList.remove('placeholder');
            placeholder.dataset.id = note.id;
            placeholder.querySelector('.note-title').textContent = note.title;
            
            const plainText = note.content
                .replace(/^#+\s+/gm, '')
                .replace(/\*\*/g, '')
                .replace(/\*/g, '')
                .replace(/`/g, '')
                .replace(/\ \[([^\]]+)\]\([^)]+\)/g, '$1')
                .replace(/\n+/g, ' ')
                .trim();
            
            placeholder.querySelector('.note-preview').textContent = plainText;
            placeholder.querySelector('.note-sources').textContent = `${note.source_ids?.length || 0} 来源`;

            // 恢复删除按钮并绑定事件
            if (delBtn) {
                delBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.deleteNote(note.id);
                });
            }

            // 绑定查看事件
            placeholder.addEventListener('click', (e) => {
                if (!e.target.closest('.btn-delete-note')) {
                    this.viewNote(note);
                }
            });

            await this.updateCurrentNotebookCounts();
            this.updateFooter();
            document.getElementById('customPrompt').value = '';

            // 检查信息图生成是否失败
            if (type === 'infograph' && note.metadata?.image_error) {
                this.showWarn(`信息图图片生成失败: ${note.metadata.image_error}\n\n生成的 prompt 可在笔记中查看`);
            } else {
                this.setStatus(`成功生成 ${typeName}`);
            }

            // If type is insight, refresh sources list to show the injected insight report
            if (type === 'insight') {
                await this.loadSources();
            }

            // If notes_list tab is active or visible, refresh it
            const tabBtnNotesList = document.getElementById('tabBtnNotesList');
            if (tabBtnNotesList && !tabBtnNotesList.classList.contains('hidden')) {
                this.renderNotesCompactGrid();
            }
        } catch (error) {
            if (element) element.classList.remove('loading');
            placeholder.remove(); // 失败则移除占位符
            this.showError(error.message);
        }
    }

    // 聊天方法
    async loadChatSessions() {
        if (!this.currentNotebook) return;

        try {
            const sessions = await this.api(`/notebooks/${this.currentNotebook.id}/chat/sessions`);
            this.chatSessions = sessions || [];

            // Update session list UI if exists
            const sessionList = document.getElementById('chatSessionList');

            if (sessionList) {
                if (this.chatSessions.length === 0) {
                    sessionList.innerHTML = '<p class="text-muted">暂无对话历史</p>';
                } else {
                    sessionList.innerHTML = sessions.map(session => `
                        <div class="chat-session-item ${session.id === this.currentChatSession ? 'active' : ''}"
                             data-session-id="${session.id}">
                            <div class="session-content">
                                <div class="session-title">${session.title || '新对话'}</div>
                                <div class="session-time">${this.formatTime(session.updated_at)}</div>
                            </div>
                            <button class="btn-delete-session" data-session-id="${session.id}" title="删除对话">
                                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M2 4h10M5 4v8M9 4v8M3 4l1 9M11 4l-1 9"/>
                                </svg>
                            </button>
                        </div>
                    `).join('');

                    // Add click handlers for session switching
                    sessionList.querySelectorAll('.chat-session-item').forEach(item => {
                        const sessionId = item.dataset.sessionId;
                        item.addEventListener('click', (e) => {
                            // Don't switch session if delete button was clicked
                            if (e.target.closest('.btn-delete-session')) return;
                            this.switchChatSession(sessionId);
                        });

                        // Add delete handler
                        const deleteBtn = item.querySelector('.btn-delete-session');
                        if (deleteBtn) {
                            deleteBtn.addEventListener('click', (e) => {
                                e.stopPropagation();
                                this.handleDeleteSession(sessionId);
                            });
                        }
                    });
                }
            }

            // Only reset chat messages view if no current session
            if (!this.currentChatSession) {
                await this.loadNotebookOverview();
            }
        } catch (error) {
            console.error('加载对话失败:', error);
        }
    }

    // Handle new chat session
    async handleNewChatSession() {
        if (!this.currentNotebook) {
            this.showError('请先选择一个笔记本');
            return;
        }

        // Check if there's a current session with messages to save
        if (this.currentChatSession) {
            const chatMessages = document.getElementById('chatMessages');
            const messages = chatMessages.querySelectorAll('.chat-message');
            if (messages.length > 0) {
                // Session has messages, it's already saved
                this.currentChatSession = null;
                this.switchPanelTab('chat');
                this.showWelcomeMessage();
                this.setStatus('已开始新对话');
                return;
            }
        }

        // If there's no current session, just clear and show welcome
        this.currentChatSession = null;
        this.switchPanelTab('chat');
        this.showWelcomeMessage();
        this.setStatus('已开始新对话');
    }

    // Show welcome message
    showWelcomeMessage() {
        const container = document.getElementById('chatMessages');
        container.innerHTML = `
            <div class="chat-welcome">
                <svg width="40" height="40" viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1.5">
                    <circle cx="20" cy="12" r="6"/>
                    <path d="M8 38 C8 28 14 22 20 22 C26 22 32 28 32 38"/>
                </svg>
                <h3>与来源对话</h3>
                <p>询问关于笔记本内容的问题</p>
            </div>
        `;
    }

    // Save current session
    async saveCurrentSession() {
        if (!this.currentNotebook) {
            this.showError('请先选择一个笔记本');
            return;
        }

        try {
            // If there's a current session, check if it has messages
            if (this.currentChatSession) {
                const chatMessages = document.getElementById('chatMessages');
                const messages = chatMessages.querySelectorAll('.chat-message');
                if (messages.length === 0) {
                    this.setStatus('当前会话为空，无需保存');
                    return;
                }
                await this.loadChatSessions();
                this.setStatus('会话已保存');
                return;
            }

            // No current session - show message that empty session doesn't need saving
            this.setStatus('当前会话为空，无需保存');
        } catch (error) {
            console.error('Failed to save session:', error);
            this.showError(`保存失败: ${error.message}`);
        }
    }

    // Switch to a chat session
    switchChatSession(sessionId) {
        this.currentChatSession = sessionId;
        // Switch to chat tab
        this.switchPanelTab('chat');
        // Reload messages for this session
        this.loadChatMessages(sessionId);
        // Update active state in UI
        document.querySelectorAll('.chat-session-item').forEach(item => {
            item.classList.toggle('active', item.dataset.sessionId === sessionId);
        });
    }

    // Load chat messages for a session
    async loadChatMessages(sessionId) {
        if (!this.currentNotebook || !sessionId) return;

        try {
            const session = await this.api(`/notebooks/${this.currentNotebook.id}/chat/sessions/${sessionId}`);
            const container = document.getElementById('chatMessages');
            container.innerHTML = ''; // Clear welcome/overview

            // Display all messages
            if (session.messages && session.messages.length > 0) {
                session.messages.forEach(msg => {
                    const sources = msg.sources || [];
                    this.addMessage(msg.role, msg.content, sources, false);
                });
            }

            // Scroll to bottom
            container.scrollTop = container.scrollHeight;
        } catch (error) {
            console.error('加载对话消息失败:', error);
            this.showError('加载对话消息失败');
        }
    }

    // Handle delete session
    async handleDeleteSession(sessionId) {
        if (!this.currentNotebook) {
            this.showError('请先选择一个笔记本');
            return;
        }

        if (!confirm('确定要删除这个对话吗？')) {
            return;
        }

        try {
            await this.api(`/notebooks/${this.currentNotebook.id}/chat/sessions/${sessionId}`, {
                method: 'DELETE'
            });

            // If deleting current session, clear it
            if (this.currentChatSession === sessionId) {
                this.currentChatSession = null;
                await this.loadNotebookOverview();
            }

            // Refresh session list
            this.loadChatSessions();
            this.setStatus('对话已删除');
        } catch (error) {
            console.error('Failed to delete session:', error);
            this.showError(`删除失败: ${error.message}`);
        }
    }

    // Handle clear all sessions
    async handleClearSessions() {
        if (!this.currentNotebook) {
            this.showError('请先选择一个笔记本');
            return;
        }

        const sessions = this.chatSessions || [];
        if (sessions.length === 0) {
            this.showError('暂无对话历史');
            return;
        }

        if (!confirm(`确定要清空所有对话历史吗？这将删除 ${sessions.length} 个对话。`)) {
            return;
        }

        try {
            await this.api(`/notebooks/${this.currentNotebook.id}/chat/sessions`, {
                method: 'DELETE'
            });

            // Clear current session
            this.currentChatSession = null;
            await this.loadNotebookOverview();

            // Refresh session list
            this.loadChatSessions();
            this.setStatus('对话历史已清空');
        } catch (error) {
            console.error('Failed to clear sessions:', error);
            this.showError(`清空失败: ${error.message}`);
        }
    }

    // Format time for display
    formatTime(timestamp) {
        if (!timestamp) return '';

        const date = new Date(timestamp);
        const now = new Date();
        const diff = now - date;

        // Less than 1 minute
        if (diff < 60000) {
            return '刚刚';
        }

        // Less than 1 hour
        if (diff < 3600000) {
            return `${Math.floor(diff / 60000)}分钟前`;
        }

        // Less than 1 day
        if (diff < 86400000) {
            return `${Math.floor(diff / 3600000)}小时前`;
        }

        // Less than 7 days
        if (diff < 604800000) {
            return `${Math.floor(diff / 86400000)}天前`;
        }

        // Otherwise show date
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const day = date.getDate().toString().padStart(2, '0');
        return `${month}-${day}`;
    }

    async loadNotebookOverview() {
        if (!this.currentNotebook) return;

        // Only show welcome message when there's no current session
        // Overview should only be shown when there's an active session with summary
        if (!this.currentChatSession) {
            this.showWelcomeMessage();
            return;
        }

        // If there's a current session, try to load the session's summary from metadata
        try {
            const session = await this.api(`/notebooks/${this.currentNotebook.id}/chat/sessions/${this.currentChatSession}`);
            if (session.metadata && session.metadata.summary) {
                // Show session summary if available
                this.displayOverview({
                    summary: session.metadata.summary,
                    questions: []
                });
            } else {
                this.showWelcomeMessage();
            }
        } catch (error) {
            console.error('加载会话摘要失败:', error);
            this.showWelcomeMessage();
        }
    }

    displayOverview(overview) {
        const container = document.getElementById('chatMessages');
        container.innerHTML = '';

        // 创建概览卡片
        const overviewCard = document.createElement('div');
        overviewCard.className = 'chat-overview';

        // 摘要部分
        if (overview.summary && overview.summary.trim()) {
            const summaryDiv = document.createElement('div');
            summaryDiv.className = 'overview-summary';
            summaryDiv.innerHTML = `
                <div class="overview-header">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                        <line x1="16" y1="13" x2="8" y2="13"></line>
                        <line x1="16" y1="17" x2="8" y2="17"></line>
                        <polyline points="10 9 9 9 8 9"></polyline>
                    </svg>
                    <span>笔记本概览</span>
                </div>
                <div class="overview-content">${overview.summary}</div>
            `;
            overviewCard.appendChild(summaryDiv);
        }

        // 问题部分
        if (overview.questions && overview.questions.length > 0) {
            const questionsDiv = document.createElement('div');
            questionsDiv.className = 'overview-questions';
            questionsDiv.innerHTML = `
                <div class="overview-header">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"></circle>
                        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
                        <path d="M12 17h.01"></path>
                    </svg>
                    <span>探索问题</span>
                </div>
            `;

            const questionsList = document.createElement('ul');
            overview.questions.forEach((question, index) => {
                const li = document.createElement('li');
                li.className = 'overview-question';
                li.textContent = `${index + 1}. ${question}`;
                li.addEventListener('click', () => {
                    const input = document.getElementById('chatInput');
                    input.value = question;
                    input.focus();
                });
                questionsList.appendChild(li);
            });

            questionsDiv.appendChild(questionsList);
            overviewCard.appendChild(questionsDiv);
        }

        container.appendChild(overviewCard);
        this.currentChatSession = null;
    }

    async handleChat(e) {
        e.preventDefault();

        if (!this.currentNotebook) {
            this.showError('请先选择一个笔记本');
            return;
        }

        const input = document.getElementById('chatInput');
        const message = input.value.trim();

        if (!message) return;

        this.addMessage('user', message);
        input.value = '';

        const sources = await this.api(`/notebooks/${this.currentNotebook.id}/sources`);
        if (sources.length === 0) {
            this.addMessage('assistant', '请先为笔记本添加一些来源。');
            return;
        }

        this.setStatus('思考中...');

        try {
            const response = await this.api(`/notebooks/${this.currentNotebook.id}/chat`, {
                method: 'POST',
                body: JSON.stringify({
                    message: message,
                    session_id: this.currentChatSession || undefined,
                }),
            });

            this.addMessage('assistant', response.message, response.sources, response.metadata);
            this.currentChatSession = response.session_id;
            this.setStatus('就绪');
        } catch (error) {
            this.addMessage('assistant', `错误: ${error.message}`);
            this.setStatus('错误');
        }
    }

    addMessage(role, content, sources = [], metadata = null) {
        const container = document.getElementById('chatMessages');
        const template = document.getElementById('messageTemplate');

        const welcome = container.querySelector('.chat-welcome');
        if (welcome) welcome.remove();

        const clone = template.content.cloneNode(true);
        const message = clone.querySelector('.chat-message');

        message.dataset.role = role;

        const avatar = message.querySelector('.message-avatar');
        avatar.textContent = role === 'assistant' ? 'AI' : '你';

        const messageText = message.querySelector('.message-text');
        if (role === 'assistant') {
            messageText.innerHTML = marked.parse(content);
        } else {
            messageText.textContent = content;
        }

        // Display conversation summary if available
        if (metadata && metadata.conversation_summary && metadata.conversation_summary.trim()) {
            const summaryDiv = document.createElement('div');
            summaryDiv.className = 'conversation-summary';
            summaryDiv.innerHTML = `
                <div class="summary-header">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                        <line x1="16" y1="13" x2="8" y2="13"></line>
                        <line x1="16" y1="17" x2="8" y2="17"></line>
                        <polyline points="10 9 9 9 8 9"></polyline>
                    </svg>
                    <span>对话摘要</span>
                </div>
                <div class="summary-content">${metadata.conversation_summary}</div>
            `;
            container.appendChild(summaryDiv);
        }

        if (sources.length > 0) {
            const sourcesContainer = message.querySelector('.message-sources');
            sources.forEach(source => {
                const tag = document.createElement('span');
                tag.className = 'source-tag';
                tag.textContent = source.name || source.id;
                sourcesContainer.appendChild(tag);
            });
        }

        container.appendChild(clone);

        // Render MathJax for the new message if available
        if (window.MathJax && window.MathJax.typesetPromise && role === 'assistant') {
            MathJax.typesetPromise([messageText]).catch(err => {
                console.warn('MathJax rendering error:', err);
            });
        }

        container.scrollTop = container.scrollHeight;
    }

    // UI 方法
    closeModals() {
        document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
        document.getElementById('modalOverlay').classList.remove('active');
        this.hideLoading();
    }

    showLoading(text) {
        document.getElementById('loadingText').textContent = text || '处理中...';
        document.getElementById('loadingOverlay').classList.add('active');
    }

    hideLoading() {
        document.getElementById('loadingOverlay').classList.remove('active');
    }

    setStatus(text) {
        document.getElementById('footerStatus').textContent = text;
    }

    // 工具方法：转义 HTML 特殊字符
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Rewrite image URLs for public notebooks
    // No longer needed - backend handles access control based on notebook public status
    rewriteImageUrlsForPublic(content) {
        // Keep original URLs - backend will handle access control
        return content;
    }

    // 通用 toast 提示方法
    showToast(message, type = 'error') {
        const colors = {
            error: 'var(--accent-red)',
            warn: 'var(--accent-orange)',
            success: 'var(--accent-green)'
        };

        const toast = document.createElement('div');
        toast.className = `${type}-toast`;
        toast.style.cssText = `
            position: fixed; bottom: 60px; right: 20px; padding: 12px 20px;
            background: ${colors[type]}; color: white; font-family: var(--font-mono);
            font-size: 0.75rem; border-radius: 4px; box-shadow: var(--shadow-medium);
            animation: slideIn 0.3s ease; z-index: 3000; white-space: pre-wrap; max-width: 400px;
        `;
        toast.textContent = message;
        document.body.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, 5000);
    }

    showError(message) {
        this.setStatus(`错误: ${message}`);
        this.showToast(message, 'error');
    }

    showWarn(message) {
        this.showToast(message, 'warn');
    }

    updateFooter() {
        const sourceCount = document.querySelectorAll('.source-card').length;
        const noteCount = document.querySelectorAll('.note-item').length;
        document.getElementById('footerStats').textContent = `${sourceCount} 来源 · ${noteCount} 笔记`;
    }

    formatDate(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diff = now - date;

        if (diff < 60000) return '刚刚';
        if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;

        return date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' });
    }

    async updateCurrentNotebookCounts() {
        if (!this.currentNotebook) return;

        const [sources, notes] = await Promise.all([
            this.api(`/notebooks/${this.currentNotebook.id}/sources`),
            this.api(`/notebooks/${this.currentNotebook.id}/notes`)
        ]);

        const notebookCard = document.querySelector(`.notebook-card[data-id="${this.currentNotebook.id}"]`);
        if (notebookCard) {
            notebookCard.querySelector('.stat-sources').textContent = `${sources.length} 来源`;
            notebookCard.querySelector('.stat-notes').textContent = `${notes.length} 笔记`;
        }
    }
}

// ============================================
// Resource Tab Manager
// ============================================
class ResourceTabManager {
    constructor(app) {
        this.app = app;
        this.openTabs = new Map();  // tabId -> { sourceId, sourceName, sourceType, element }
        this.activeTabId = null;
        this.nextTabId = 1;
        this.previewers = new Map();  // tabId -> Previewer instance
    }

    openTab(source) {
        // Check if tab already exists
        for (const [tabId, tab] of this.openTabs) {
            if (tab.sourceId === source.id) {
                this.switchTab(tabId);
                return;
            }
        }

        const tabId = `resource_${this.nextTabId++}`;
        const tabData = {
            tabId,
            sourceId: source.id,
            sourceName: source.name,
            sourceType: source.type,
            source: source
        };
        this.openTabs.set(tabId, tabData);

        // Create tab button
        this.createTabButton(tabData);

        // Create tab content
        this.createTabContent(tabData);

        // Switch to new tab
        this.switchTab(tabId);
    }

    closeTab(tabId) {
        const tab = this.openTabs.get(tabId);
        if (!tab) return;

        // Remove tab button
        const tabBtn = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
        if (tabBtn) tabBtn.remove();

        // Remove tab content
        const tabContent = document.querySelector(`.resource-preview-container[data-tab-id="${tabId}"]`);
        if (tabContent) tabContent.remove();

        // Destroy previewer
        const previewer = this.previewers.get(tabId);
        if (previewer && previewer.destroy) {
            previewer.destroy();
        }
        this.previewers.delete(tabId);

        this.openTabs.delete(tabId);

        // Switch to another tab if active was closed
        if (this.activeTabId === tabId) {
            const remainingTabs = Array.from(this.openTabs.keys());
            if (remainingTabs.length > 0) {
                this.switchTab(remainingTabs[0]);
            } else {
                this.activeTabId = null;
                this.app.switchPanelTab('chat');
            }
        }
    }

    switchTab(tabId) {
        this.activeTabId = tabId;

        // Update tab button states
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabId);
        });

        // Update content visibility
        const chatWrapper = document.querySelector('.chat-messages-wrapper');
        const noteViewContainer = document.querySelector('.note-view-container');
        const notesDetailsView = document.querySelector('.notes-details-view');

        // Hide all resource preview containers
        document.querySelectorAll('.resource-preview-container').forEach(el => {
            el.style.display = 'none';
        });

        // Show selected tab content
        const tabContent = document.querySelector(`.resource-preview-container[data-tab-id="${tabId}"]`);
        if (tabContent) {
            chatWrapper.style.display = 'none';
            if (notesDetailsView) notesDetailsView.style.display = 'none';
            if (noteViewContainer) noteViewContainer.style.display = 'none';
            tabContent.style.display = 'flex';
        }
    }

    closeAllResourceTabs() {
        const tabIds = Array.from(this.openTabs.keys());
        tabIds.forEach(tabId => this.closeTab(tabId));
    }

    createTabButton(tabData) {
        const tabsContainer = document.getElementById('centerPanelTabs');
        if (!tabsContainer) return;

        const tabBtn = document.createElement('button');
        tabBtn.className = 'tab-btn';
        tabBtn.dataset.tab = tabData.tabId;
        tabBtn.innerHTML = `
            <span class="tab-title">${this.truncateText(tabData.sourceName, 20)}</span>
            <span class="tab-close">×</span>
        `;

        // Close button event
        tabBtn.querySelector('.tab-close').addEventListener('click', (e) => {
            e.stopPropagation();
            this.closeTab(tabData.tabId);
        });

        // Tab click event
        tabBtn.addEventListener('click', () => {
            this.switchTab(tabData.tabId);
        });

        // Insert after notes_list tab (笔记列表 tab), or at the end if not found
        const notesListTab = tabsContainer.querySelector('.tab-btn[data-tab="notes_list"]');
        if (notesListTab && !notesListTab.classList.contains('hidden')) {
            notesListTab.insertAdjacentElement('afterend', tabBtn);
        } else {
            tabsContainer.appendChild(tabBtn);
        }
    }

    createTabContent(tabData) {
        const chatWrapper = document.querySelector('.chat-messages-wrapper');
        if (!chatWrapper) return;

        const template = document.getElementById('resourcePreviewTemplate');
        if (!template) return;

        const clone = template.content.cloneNode(true);
        const container = clone.querySelector('.resource-preview-container');
        container.dataset.tabId = tabData.tabId;

        // Set title
        container.querySelector('.resource-title').textContent = tabData.sourceName;

        // Close button event
        container.querySelector('[data-action="close"]').addEventListener('click', () => {
            this.closeTab(tabData.tabId);
        });

        // Create previewer based on source type
        const body = container.querySelector('.resource-body');
        const previewer = this.createPreviewer(tabData, body);
        this.previewers.set(tabData.tabId, previewer);

        // Insert after chat wrapper
        chatWrapper.insertAdjacentElement('afterend', container);

        // Load preview
        previewer.load();
    }

    createPreviewer(tabData, body) {
        const sourceType = this.determineSourceType(tabData.source);

        switch (sourceType) {
            case 'text':
                return new TextPreviewer(this.app, tabData, body);
            case 'image':
                return new ImagePreviewer(this.app, tabData, body);
            case 'audio':
                return new AudioPreviewer(this.app, tabData, body);
            case 'pdf':
                return new PdfPreviewer(this.app, tabData, body);
            case 'url':
                return new UrlPreviewer(this.app, tabData, body);
            default:
                return new TextPreviewer(this.app, tabData, body);
        }
    }

    determineSourceType(source) {
        if (source.type === 'url') return 'url';

        if (source.type === 'text') return 'text';

        if (source.file_name) {
            const ext = source.file_name.toLowerCase().split('.').pop();
            const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'];
            const audioExtensions = ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'];
            const pdfExtensions = ['pdf'];

            if (pdfExtensions.includes(ext)) return 'pdf';
            if (imageExtensions.includes(ext)) return 'image';
            if (audioExtensions.includes(ext)) return 'audio';
        }

        // Default to text
        return 'text';
    }

    truncateText(text, maxLength) {
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength - 3) + '...';
    }
}

// ============================================
// Base Previewer Class
// ============================================
class BasePreviewer {
    constructor(app, tabData, container) {
        this.app = app;
        this.tabData = tabData;
        this.container = container;
        this.loadingEl = null;
        this.errorEl = null;
        this.contentEl = null;
    }

    load() {
        throw new Error('load() must be implemented');
    }

    destroy() {
        // Override if needed
    }

    showLoading() {
        this.contentEl?.classList.add('hidden');
        this.errorEl?.classList.add('hidden');
        this.loadingEl?.classList.remove('hidden');
        // Clear the inline display style on the resource-body container
        this.container.style.display = '';
    }

    hideLoading() {
        this.loadingEl?.classList.add('hidden');
    }

    showError(message) {
        this.loadingEl?.classList.add('hidden');
        this.contentEl?.classList.add('hidden');
        this.errorEl?.classList.remove('hidden');
        // Clear the inline display style on the resource-body container
        this.container.style.display = '';
        const errorMsgEl = this.errorEl?.querySelector('.error-message');
        if (errorMsgEl) {
            errorMsgEl.textContent = message;
        } else if (this.errorEl) {
            // Fallback if error-message element doesn't exist
            this.errorEl.textContent = message;
        }
    }

    showContent() {
        this.loadingEl?.classList.add('hidden');
        this.errorEl?.classList.add('hidden');
        this.contentEl?.classList.remove('hidden');
        // Clear the inline display style on the resource-body container
        this.container.style.display = '';
        // Also show the resource-body by removing inline style
        const resourceBody = this.container.closest('.resource-preview-content')?.querySelector('.resource-body');
        if (resourceBody) {
            resourceBody.style.display = '';
        }
    }

    async fetchSource() {
        try {
            const endpoint = this.app.currentPublicToken
                ? `/public/notebooks/${this.app.currentPublicToken}/sources/${this.tabData.sourceId}`
                : `/api/notebooks/${this.app.currentNotebook.id}/sources/${this.tabData.sourceId}`;

            const headers = {};
            if (this.app.token && !this.app.currentPublicToken) {
                headers['Authorization'] = `Bearer ${this.app.token}`;
            }

            const response = await fetch(endpoint, { headers });
            if (!response.ok) throw new Error('Failed to fetch source');
            return await response.json();
        } catch (error) {
            console.error('Failed to fetch source:', error);
            throw error;
        }
    }
}

// ============================================
// Text Previewer
// ============================================
class TextPreviewer extends BasePreviewer {
    constructor(app, tabData, container) {
        super(app, tabData, container);
        this.searchQuery = '';
        this.matches = [];
        this.currentMatchIndex = -1;
        this.rawText = ''; // Store original markdown text for search
    }

    load() {
        // Create text preview UI
        const template = document.getElementById('textPreviewTemplate');
        if (!template) return;

        const clone = template.content.cloneNode(true);
        this.container.appendChild(clone);

        // Now setup elements after template is appended
        this.setupElements();
        this.bindEvents();

        this.loadContent();
    }

    setupElements() {
        // Get elements from the preview template content (this.container is the resource-body div)
        // The text/content was added from textPreviewTemplate, so query this.container directly
        const previewContent = this.container.parentElement;
        this.loadingEl = previewContent?.querySelector('.resource-loading');
        this.errorEl = previewContent?.querySelector('.resource-error');

        // Don't query .resource-body again - this.container IS the resource-body div
        // The text-content element should be a child of this.container
        this.contentEl = this.container.querySelector('.text-content');
        this.searchInput = this.container.querySelector('.text-search-input');
        this.searchPrevBtn = this.container.querySelector('.btn-search-prev');
        this.searchNextBtn = this.container.querySelector('.btn-search-next');
        this.searchClearBtn = this.container.querySelector('.btn-search-clear');
        this.searchCountEl = this.container.querySelector('.search-count');
    }

    bindEvents() {
        this.searchInput.addEventListener('input', (e) => {
            this.search(e.target.value);
        });

        this.searchPrevBtn.addEventListener('click', () => {
            this.navigateMatch(-1);
        });

        this.searchNextBtn.addEventListener('click', () => {
            this.navigateMatch(1);
        });

        this.searchClearBtn.addEventListener('click', () => {
            this.searchInput.value = '';
            this.search('');
            this.searchInput.focus();
        });
    }

    async loadContent() {
        this.showLoading();

        try {
            const source = await this.fetchSource();
            const text = source.content || '';

            if (text) {
                // Store raw text for search
                this.rawText = text;
                // Render markdown to HTML
                this.contentEl.innerHTML = marked.parse(text);
                this.showContent();
            } else {
                this.showError('该资源没有可显示的文本内容');
            }
        } catch (error) {
            this.showError('加载文本失败: ' + error.message);
        }
    }

    search(query) {
        this.searchQuery = query;
        // Reset to original rendered markdown when clearing search
        this.contentEl.innerHTML = marked.parse(this.rawText);

        if (!query) {
            this.matches = [];
            this.currentMatchIndex = -1;
            this.updateSearchUI();
            return;
        }

        // Find matches in raw text
        const text = this.rawText;
        this.matches = [];
        let match;
        const regex = new RegExp(query.replace(/[.*+?^$()|[\]\\]/g, '\\$&'), 'gi');

        while ((match = regex.exec(text)) !== null) {
            this.matches.push({
                start: match.index,
                end: match.index + match[0].length,
                text: match[0]
            });
        }

        if (this.matches.length > 0) {
            this.currentMatchIndex = 0;
            this.highlightMatches();
            this.scrollToMatch(this.currentMatchIndex);
        } else {
            this.currentMatchIndex = -1;
        }

        this.updateSearchUI();
    }

    highlightMatches() {
        // Highlight matches in the raw text, then re-render
        const text = this.rawText;
        let html = '';
        let lastIndex = 0;

        this.matches.forEach((match, index) => {
            // Escape text before the match
            html += this.escapeHtml(text.substring(lastIndex, match.start));
            const isActive = index === this.currentMatchIndex;
            html += `<span class="search-highlight ${isActive ? 'active' : ''}">${this.escapeHtml(match.text)}</span>`;
            lastIndex = match.end;
        });

        // Add remaining text after last match
        html += this.escapeHtml(text.substring(lastIndex));

        // Set as raw markdown with highlight spans, then render
        this.contentEl.innerHTML = marked.parse(html);
    }

    scrollToMatch(index) {
        if (index < 0 || index >= this.matches.length) return;

        const match = this.matches[index];
        const textNodes = this.contentEl.querySelectorAll('.search-highlight');
        const targetNode = textNodes[index];

        if (targetNode) {
            targetNode.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    navigateMatch(direction) {
        if (this.matches.length === 0) return;

        this.currentMatchIndex += direction;

        if (this.currentMatchIndex < 0) {
            this.currentMatchIndex = this.matches.length - 1;
        } else if (this.currentMatchIndex >= this.matches.length) {
            this.currentMatchIndex = 0;
        }

        this.highlightMatches();
        this.scrollToMatch(this.currentMatchIndex);
        this.updateSearchUI();
    }

    updateSearchUI() {
        if (this.matches.length > 0) {
            this.searchCountEl.textContent = `${this.currentMatchIndex + 1} / ${this.matches.length}`;
            this.searchPrevBtn.disabled = false;
            this.searchNextBtn.disabled = false;
        } else {
            this.searchCountEl.textContent = this.searchQuery ? '无匹配' : '';
            this.searchPrevBtn.disabled = true;
            this.searchNextBtn.disabled = true;
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// ============================================
// Image Previewer
// ============================================
class ImagePreviewer extends BasePreviewer {
    constructor(app, tabData, container) {
        super(app, tabData, container);
        this.scale = 1.0;
        this.rotation = 0;
        this.isDragging = false;
        this.lastMousePos = { x: 0, y: 0 };
        this.translateX = 0;
        this.translateY = 0;
    }

    load() {
        const template = document.getElementById('imagePreviewTemplate');
        if (!template) return;

        const clone = template.content.cloneNode(true);
        this.container.appendChild(clone);

        this.setupElements();
        this.bindEvents();

        this.loadContent();
    }

    setupElements() {
        // Get elements from preview template content
        const previewContent = this.container.parentElement;
        this.loadingEl = previewContent?.querySelector('.resource-loading');
        this.errorEl = previewContent?.querySelector('.resource-error');

        // Don't query .resource-body - this.container IS the resource-body div
        // Image preview elements are direct children of this.container
        this.zoomInBtn = this.container.querySelector('.btn-image-zoom-in');
        this.zoomOutBtn = this.container.querySelector('.btn-image-zoom-out');
        this.resetBtn = this.container.querySelector('.btn-image-reset');
        this.rotateLeftBtn = this.container.querySelector('.btn-image-rotate-left');
        this.rotateRightBtn = this.container.querySelector('.btn-image-rotate-right');
        this.zoomLevelEl = this.container.querySelector('.zoom-level');
        this.viewport = this.container.querySelector('.image-viewport');
        this.img = this.container.querySelector('.image-preview-img');
    }

    bindEvents() {
        this.zoomInBtn.addEventListener('click', () => this.zoom(0.2));
        this.zoomOutBtn.addEventListener('click', () => this.zoom(-0.2));
        this.resetBtn.addEventListener('click', () => this.reset());
        this.rotateLeftBtn.addEventListener('click', () => this.rotate(-90));
        this.rotateRightBtn.addEventListener('click', () => this.rotate(90));

        // Mouse wheel zoom
        this.viewport.addEventListener('wheel', (e) => {
            e.preventDefault();
            const delta = e.deltaY > 0 ? -0.1 : 0.1;
            this.zoom(delta);
        });

        // Drag to pan - save handler references for cleanup
        this.mouseMoveHandler = (e) => {
            if (!this.isDragging) return;
            const dx = e.clientX - this.lastMousePos.x;
            const dy = e.clientY - this.lastMousePos.y;
            this.translateX += dx;
            this.translateY += dy;
            this.lastMousePos = { x: e.clientX, y: e.clientY };
            this.updateTransform();
        };

        this.mouseUpHandler = () => {
            this.isDragging = false;
            this.viewport.style.cursor = 'grab';
        };

        this.viewport.addEventListener('mousedown', (e) => {
            this.isDragging = true;
            this.lastMousePos = { x: e.clientX, y: e.clientY };
            this.viewport.style.cursor = 'grabbing';
        });

        document.addEventListener('mousemove', this.mouseMoveHandler);
        document.addEventListener('mouseup', this.mouseUpHandler);
    }

    async loadContent() {
        this.showLoading();

        try {
            const source = await this.fetchSource();
            const fileUrl = source.file_name ? `/api/files/${source.file_name}` : null;

            if (fileUrl) {
                // Fetch image with authentication first
                const headers = {};
                if (this.app.token && !this.app.currentPublicToken) {
                    headers['Authorization'] = `Bearer ${this.app.token}`;
                }

                const response = await fetch(fileUrl, { headers });
                if (!response.ok) {
                    throw new Error(`Failed to load image: ${response.status}`);
                }

                const blob = await response.blob();
                this.img.src = URL.createObjectURL(blob);

                this.img.addEventListener('load', () => {
                    this.showContent();
                    this.reset();
                }, { once: true });

                this.img.addEventListener('error', () => {
                    this.showError('加载图片失败');
                }, { once: true });
            } else {
                this.showError('该资源没有可显示的图片');
            }
        } catch (error) {
            console.error('Image loading error:', error);
            this.showError('加载图片失败: ' + error.message);
        }
    }

    zoom(delta) {
        this.scale = Math.max(0.1, Math.min(5, this.scale + delta));
        this.updateTransform();
        this.updateZoomLevel();
    }

    rotate(angle) {
        this.rotation = (this.rotation + angle) % 360;
        this.updateTransform();
    }

    reset() {
        this.scale = 1.0;
        this.rotation = 0;
        this.translateX = 0;
        this.translateY = 0;
        this.updateTransform();
        this.updateZoomLevel();
    }

    updateTransform() {
        this.img.style.transform = `translate(${this.translateX}px, ${this.translateY}px) scale(${this.scale}) rotate(${this.rotation}deg)`;
    }

    updateZoomLevel() {
        this.zoomLevelEl.textContent = Math.round(this.scale * 100) + '%';
    }

    destroy() {
        // Clean up event listeners to prevent memory leaks
        if (this.mouseMoveHandler) {
            document.removeEventListener('mousemove', this.mouseMoveHandler);
        }
        if (this.mouseUpHandler) {
            document.removeEventListener('mouseup', this.mouseUpHandler);
        }
    }
}

// ============================================
// Audio Previewer
// ============================================
class AudioPreviewer extends BasePreviewer {
    constructor(app, tabData, container) {
        super(app, tabData, container);
        this.audio = null;
    }

    load() {
        const template = document.getElementById('audioPreviewTemplate');
        if (!template) return;

        const clone = template.content.cloneNode(true);
        this.container.appendChild(clone);

        this.setupElements();
        this.bindEvents();

        this.loadContent();
    }

    setupElements() {
        // Get elements from preview template content
        const previewContent = this.container.parentElement;
        this.loadingEl = previewContent?.querySelector('.resource-loading');
        this.errorEl = previewContent?.querySelector('.resource-error');

        // Don't query .resource-body - this.container IS the resource-body div
        // Audio preview elements are direct children of this.container
        this.audio = this.container.querySelector('.audio-player');
        this.playBtn = this.container.querySelector('.btn-audio-play');
        this.iconPlay = this.container.querySelector('.icon-play');
        this.iconPause = this.container.querySelector('.icon-pause');
        this.progressBar = this.container.querySelector('.audio-progress-bar');
        this.progressFill = this.container.querySelector('.audio-progress-fill');
        this.currentTimeEl = this.container.querySelector('.current-time');
        this.durationEl = this.container.querySelector('.duration');
        this.muteBtn = this.container.querySelector('.btn-audio-mute');
        this.iconVolumeHigh = this.container.querySelector('.icon-volume-high');
        this.iconVolumeLow = this.container.querySelector('.icon-volume-low');
        this.iconMute = this.container.querySelector('.icon-mute');
        this.volumeSlider = this.container.querySelector('.audio-volume-slider');
        this.transcriptToggle = this.container.querySelector('.btn-transcript-toggle');
        this.transcriptContent = this.container.querySelector('.transcript-content');
        this.transcriptText = this.container.querySelector('.transcript-text');
    }

    bindEvents() {
        this.playBtn.addEventListener('click', () => this.togglePlay());
        this.audio.addEventListener('timeupdate', () => this.updateProgress());
        this.audio.addEventListener('loadedmetadata', () => this.updateDuration());
        this.audio.addEventListener('ended', () => this.onEnded());

        this.progressBar.addEventListener('click', (e) => {
            const rect = this.progressBar.getBoundingClientRect();
            const percent = (e.clientX - rect.left) / rect.width;
            this.audio.currentTime = percent * this.audio.duration;
        });

        this.muteBtn.addEventListener('click', () => this.toggleMute());
        this.volumeSlider.addEventListener('input', (e) => {
            this.audio.volume = e.target.value;
            this.updateVolumeIcons();
        });

        this.transcriptToggle.addEventListener('click', () => {
            this.transcriptContent.classList.toggle('collapsed');
            this.transcriptToggle.textContent = this.transcriptContent.classList.contains('collapsed') ? '展开' : '收起';
        });

        // Keyboard shortcut - save handler reference for cleanup
        this.keydownHandler = (e) => {
            if (e.key === ' ') {
                e.preventDefault();
                this.togglePlay();
            }
        };

        this.container.addEventListener('keydown', this.keydownHandler);
    }

    async loadContent() {
        this.showLoading();

        try {
            const source = await this.fetchSource();

            const fileUrl = source.file_name ? `/api/files/${source.file_name}` : null;

            if (fileUrl) {
                // Fetch audio with authentication first
                const headers = {};
                if (this.app.token && !this.app.currentPublicToken) {
                    headers['Authorization'] = `Bearer ${this.app.token}`;
                }

                const response = await fetch(fileUrl, { headers });
                if (!response.ok) {
                    throw new Error(`Failed to load audio: ${response.status}`);
                }

                const blob = await response.blob();
                this.audio.src = URL.createObjectURL(blob);

                this.audio.addEventListener('loadeddata', () => {
                    this.showContent();
                }, { once: true });

                this.audio.addEventListener('error', () => {
                    this.showError('加载音频失败');
                }, { once: true });
            } else {
                this.showError('该资源没有可播放的音频');
            }

            // Load transcript
            if (source.content) {
                if (this.transcriptText) {
                    this.transcriptText.textContent = source.content;
                }
                // Don't add collapsed class - keep transcript visible by default
                // User can click the toggle button to collapse/expand
                this.transcriptContent.classList.remove('collapsed');
                this.transcriptToggle.textContent = '收起';
            } else {
                this.transcriptContent.style.display = 'none';
                this.transcriptToggle.parentElement.style.display = 'none';
            }
        } catch (error) {
            console.error('Audio loading error:', error);
            this.showError('加载音频失败: ' + error.message);
        }
    }

    togglePlay() {
        if (this.audio.paused) {
            this.audio.play();
            this.iconPlay.style.display = 'none';
            this.iconPause.style.display = 'block';
        } else {
            this.audio.pause();
            this.iconPlay.style.display = 'block';
            this.iconPause.style.display = 'none';
        }
    }

    onEnded() {
        this.iconPlay.style.display = 'block';
        this.iconPause.style.display = 'none';
    }

    updateProgress() {
        const percent = (this.audio.currentTime / this.audio.duration) * 100;
        this.progressFill.style.width = percent + '%';
        this.currentTimeEl.textContent = this.formatTime(this.audio.currentTime);
    }

    updateDuration() {
        this.durationEl.textContent = this.formatTime(this.audio.duration);
    }

    formatTime(seconds) {
        if (isNaN(seconds)) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    toggleMute() {
        this.audio.muted = !this.audio.muted;
        this.updateVolumeIcons();
    }

    updateVolumeIcons() {
        if (this.audio.muted || this.audio.volume === 0) {
            this.iconVolumeHigh.style.display = 'none';
            this.iconVolumeLow.style.display = 'none';
            this.iconMute.style.display = 'block';
        } else if (this.audio.volume < 0.5) {
            this.iconVolumeHigh.style.display = 'none';
            this.iconVolumeLow.style.display = 'block';
            this.iconMute.style.display = 'none';
        } else {
            this.iconVolumeHigh.style.display = 'block';
            this.iconVolumeLow.style.display = 'none';
            this.iconMute.style.display = 'none';
        }
    }

    destroy() {
        // Clean up keyboard event listener
        if (this.keydownHandler) {
            this.container.removeEventListener('keydown', this.keydownHandler);
        }
    }
}

// ============================================
// PDF Previewer
// ============================================
class PdfPreviewer extends BasePreviewer {
    constructor(app, tabData, container) {
        super(app, tabData, container);
        this.pdfDoc = null;
        this.currentPage = 1;
        this.totalPages = 0;
        this.scale = 1.0;
        this.canvas = null;
        this.ctx = null;
    }

    load() {
        const template = document.getElementById('pdfPreviewTemplate');
        if (!template) return;

        const clone = template.content.cloneNode(true);
        this.container.appendChild(clone);

        this.setupElements();
        this.bindEvents();

        this.loadContent();
    }

    setupElements() {
        // Get elements from preview template content
        const previewContent = this.container.parentElement;
        this.loadingEl = previewContent?.querySelector('.resource-loading');
        this.errorEl = previewContent?.querySelector('.resource-error');
        this.contentEl = this.container.querySelector('.pdf-viewport');

        // Don't query .resource-body - this.container IS the resource-body div
        // PDF preview elements are direct children of this.container
        this.prevPageBtn = this.container.querySelector('.btn-pdf-prev');
        this.nextPageBtn = this.container.querySelector('.btn-pdf-next');
        this.zoomInBtn = this.container.querySelector('.btn-pdf-zoom-in');
        this.zoomOutBtn = this.container.querySelector('.btn-pdf-zoom-out');
        this.fitWidthBtn = this.container.querySelector('.btn-pdf-fit-width');
        this.currentPageEl = this.container.querySelector('.current-page');
        this.totalPagesEl = this.container.querySelector('.total-pages');
        this.zoomLevelEl = this.container.querySelector('.pdf-zoom-level');
        this.canvas = this.container.querySelector('.pdf-canvas');
        this.ctx = this.canvas?.getContext('2d');
    }

    bindEvents() {
        this.prevPageBtn.addEventListener('click', () => this.changePage(-1));
        this.nextPageBtn.addEventListener('click', () => this.changePage(1));
        this.zoomInBtn.addEventListener('click', () => this.zoom(0.2));
        this.zoomOutBtn.addEventListener('click', () => this.zoom(-0.2));
        this.fitWidthBtn.addEventListener('click', () => this.fitWidth());
    }

    async loadContent() {
        this.showLoading();

        try {
            const source = await this.fetchSource();
            const fileUrl = source.file_name ? `/api/files/${source.file_name}` : null;

            if (!fileUrl) {
                this.showError('该资源没有可显示的 PDF');
                return;
            }

            // Fetch PDF with authentication first
            const headers = {};
            if (this.app.token && !this.app.currentPublicToken) {
                headers['Authorization'] = `Bearer ${this.app.token}`;
            }

            const response = await fetch(fileUrl, { headers });
            if (!response.ok) {
                throw new Error(`Failed to load PDF: ${response.status} ${response.statusText}`);
            }

            const pdfData = await response.arrayBuffer();

            // Check if pdfjsLib is available
            if (typeof pdfjsLib === 'undefined') {
                throw new Error('PDF.js library is not loaded');
            }

            // Load PDF using PDF.js with the fetched data
            const loadingTask = pdfjsLib.getDocument({ data: pdfData });
            this.pdfDoc = await loadingTask.promise;
            this.totalPages = this.pdfDoc.numPages;

            this.totalPagesEl.textContent = this.totalPages;
            this.updatePageButtons();

            this.showContent();
            this.renderPage(this.currentPage);
        } catch (error) {
            console.error('PDF loading error:', error);
            this.showError('加载 PDF 失败: ' + error.message);
        }
    }

    async renderPage(pageNum) {
        if (!this.pdfDoc) return;

        this.currentPage = pageNum;
        this.currentPageEl.textContent = pageNum;
        this.updatePageButtons();

        try {
            const page = await this.pdfDoc.getPage(pageNum);
            const viewport = page.getViewport({ scale: this.scale });

            this.canvas.height = viewport.height;
            this.canvas.width = viewport.width;

            const renderContext = {
                canvasContext: this.ctx,
                viewport: viewport
            };

            await page.render(renderContext).promise;
        } catch (error) {
            console.error('PDF render error:', error);
        }
    }

    changePage(delta) {
        const newPage = this.currentPage + delta;
        if (newPage >= 1 && newPage <= this.totalPages) {
            this.renderPage(newPage);
        }
    }

    zoom(delta) {
        this.scale = Math.max(0.25, Math.min(3, this.scale + delta));
        this.updateZoomLevel();
        this.renderPage(this.currentPage);
    }

    fitWidth() {
        const containerWidth = this.container.querySelector('.pdf-viewport')?.clientWidth || 800;
        if (!this.pdfDoc || this.currentPage < 1) return;

        this.pdfDoc.getPage(this.currentPage).then(page => {
            const viewport = page.getViewport({ scale: 1.0 });
            this.scale = (containerWidth - 40) / viewport.width;
            this.updateZoomLevel();
            this.renderPage(this.currentPage);
        });
    }

    updatePageButtons() {
        this.prevPageBtn.disabled = this.currentPage <= 1;
        this.nextPageBtn.disabled = this.currentPage >= this.totalPages;
    }

    updateZoomLevel() {
        this.zoomLevelEl.textContent = Math.round(this.scale * 100) + '%';
    }

    destroy() {
        if (this.pdfDoc) {
            this.pdfDoc.destroy();
            this.pdfDoc = null;
        }
    }
}

// ============================================
// URL Previewer
// ============================================
class UrlPreviewer extends BasePreviewer {
    constructor(app, tabData, container) {
        super(app, tabData, container);
        this.url = '';
    }

    load() {
        const template = document.getElementById('urlPreviewTemplate');
        if (!template) return;

        const clone = template.content.cloneNode(true);
        this.container.appendChild(clone);

        this.setupElements();
        this.bindEvents();

        this.loadContent();
    }

    setupElements() {
        // Get elements from preview template content
        const previewContent = this.container.parentElement;
        this.loadingEl = previewContent?.querySelector('.resource-loading');
        this.errorEl = previewContent?.querySelector('.resource-error');

        // Don't query .resource-body - this.container IS the resource-body div
        // URL preview elements are direct children of this.container
        this.urlInput = this.container.querySelector('.url-input');
        this.backBtn = this.container.querySelector('.btn-url-back');
        this.forwardBtn = this.container.querySelector('.btn-url-forward');
        this.refreshBtn = this.container.querySelector('.btn-url-refresh');
        this.externalBtn = this.container.querySelector('.btn-url-external');
        this.iframe = this.container.querySelector('.url-iframe');
        this.blockedEl = this.container.querySelector('.url-blocked');
        this.openExternalBtn = this.container.querySelector('.btn-open-external');
    }

    bindEvents() {
        this.backBtn.addEventListener('click', () => {
            if (this.iframe.contentWindow) {
                this.iframe.contentWindow.history.back();
            }
        });

        this.forwardBtn.addEventListener('click', () => {
            if (this.iframe.contentWindow) {
                this.iframe.contentWindow.history.forward();
            }
        });

        this.refreshBtn.addEventListener('click', () => {
            if (this.iframe.src) {
                this.iframe.src = this.iframe.src;
            }
        });

        this.iframe.addEventListener('load', () => {
            this.loadingEl?.classList.add('hidden');
        });

        this.iframe.addEventListener('error', () => {
            this.showBlocked();
        });

        this.openExternalBtn.addEventListener('click', () => {
            if (this.url) {
                window.open(this.url, '_blank');
            }
        });
    }

    async loadContent() {
        this.showLoading();

        try {
            const source = await this.fetchSource();
            this.url = source.url;

            if (this.url) {
                this.urlInput.value = this.url;
                this.externalBtn.href = this.url;
                this.openExternalBtn.href = this.url;

                // Set iframe src with a timeout to detect blocking
                this.iframe.src = this.url;

                // Show content after a short delay
                setTimeout(() => {
                    this.showContent();
                }, 500);

                // Check if the iframe was blocked
                setTimeout(() => {
                    if (this.iframe.contentWindow === null) {
                        this.showBlocked();
                    }
                }, 2000);
            } else {
                this.showError('该资源没有 URL');
            }
        } catch (error) {
            this.showError('加载 URL 失败: ' + error.message);
        }
    }

    showBlocked() {
        this.iframe.style.display = 'none';
        this.blockedEl.style.display = 'flex';
        this.loadingEl?.classList.add('hidden');
    }
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    window.app = new OpenNotebook();
});