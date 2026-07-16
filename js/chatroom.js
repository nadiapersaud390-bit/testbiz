/**
 * ═══════════════════════════════════════════════════════════════
 * SECURE CHATROOM — E2E Encrypted Agent ↔ Admin Messaging
 * ═══════════════════════════════════════════════════════════════
 * 
 * FIXED: Server timestamps for correct message ordering across all devices
 * FIXED: Messages always appear in chronological order (oldest first)
 * FIXED: Time display uses consistent Guyana timezone
 * FIXED: Floating chat displays messages instantly
 * FIXED: Floating chat shows who you're chatting with
 */

(function() {
    'use strict';

    // ═══════════════════════════════════════════
    // CONSTANTS & STATE
    // ═══════════════════════════════════════════
    const CRYPTO_SALT = 'BIZ-LevelUp-E2E-2025';
    const CHAT_DB_PATH = 'secure_chat';
    const GENERAL_CHAT_PATH = 'general_chat';
    const GROUP_CHAT_PATH = 'group_chats';
    const PRESENCE_DB_PATH = 'chat_presence';
    const PINS_DB_PATH = 'chat_pins';
    const NOTIF_SETTINGS_KEY = 'chat_notification_settings';
    const TYPING_DB_PATH = 'chat_typing';
    const DRAFTS_KEY = 'chat_message_drafts';

    // Quick action messages
    const QUICK_ACTIONS = {
        come_quick: { text: '🚨 COME QUICK', emoji: '🚨', message: '🚨 URGENT: Come quick! I need immediate assistance right now.' },
        help: { text: '🆘 HELP', emoji: '🆘', message: '🆘 HELP NEEDED: I need immediate assistance on this call!' }
    };

    const REACTIONS_DB_PATH = 'chat_reactions';

    // Common emojis
    const COMMON_EMOJIS = [
        '😀', '😃', '😄', '😁', '😅', '😂', '🤣', '😊',
        '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘',
        '😗', '😙', '😚', '😋', '😛', '😝', '😜', '🤪',
        '🤨', '🧐', '🤓', '😎', '🤩', '🥳', '😏', '😒',
        '😞', '😔', '😟', '😕', '🙁', '😣', '😖', '😫',
        '😩', '🥺', '😢', '😭', '😤', '😠', '😡', '🤬',
        '🤯', '😳', '🥵', '🥶', '😱', '😨', '😰', '😥',
        '😓', '🤗', '🤔', '🤭', '🤫', '🤥', '😶', '😐',
        '😑', '😬', '🙄', '😯', '😦', '😧', '😮', '😲',
        '🥱', '😴', '🤤', '😪', '😵', '🤐', '🥴', '🤢',
        '🤮', '🤧', '😷', '🤒', '🤕', '🤑', '🤠', '😈',
        '👿', '👹', '👺', '💀', '👻', '👽', '🤖', '💩'
    ];

    let _crListeners = [];
    let _crCurrentChannel = null;
    let _crCurrentChannelType = 'general';
    let _crSidebarTab = 'general';
    let _crChannels = {};
    let _crGroupChannels = {};
    let _crTypingTimers = {};
    let _crCurrentTypingUsers = {};
    let _crAudioCtx = null;
    let _crOriginalTitle = document.title;
    let _crTitleBlinkInterval = null;
    let _crSearchQuery = '';
    let _crFloatSearchQuery = '';
    let _crSearchActive = false;
    let _crSearchResults = [];
    let _crCurrentSearchIndex = -1;
    let _generalChatMessages = [];
    let _generalChatUnread = 0;
    let _localMessageIds = new Set();
    let _crReactions = {};
    let _crPinnedMessages = {};
    let _crNotificationSettings = {};
    let _crMediaRecorder = null;
    let _crAudioChunks = [];
    let _crIsRecording = false;
    let _crOnlineUsers = new Set();
    let _crLastSeen = {};

    const _keyCache = {};
    const _decryptCache = {};

    let _fbFunctions = null;
    let _initialized = false;
    let _isFirstLoad = true;

    // ═══════════════════════════════════════════
    // FIXED: Consistent timestamp handling
    // ═══════════════════════════════════════════
    
    function _toMillis(timestamp) {
        if (!timestamp) return 0;
        if (typeof timestamp === 'object' && timestamp !== null) {
            if (typeof timestamp.toDate === 'function') {
                return timestamp.toDate().getTime();
            }
            if (timestamp._seconds !== undefined) {
                return timestamp._seconds * 1000;
            }
        }
        if (typeof timestamp === 'number') {
            return timestamp;
        }
        const parsed = Date.parse(timestamp);
        return isNaN(parsed) ? 0 : parsed;
    }

    function _formatMessageTime(timestamp) {
        const ms = _toMillis(timestamp);
        if (!ms) return '--:--';
        const date = new Date(ms);
        if (isNaN(date.getTime())) return '--:--';
        return date.toLocaleTimeString('en-US', { 
            hour: 'numeric', 
            minute: '2-digit', 
            hour12: true,
            timeZone: 'America/Guyana'
        });
    }

    function _formatMessageDate(timestamp) {
        const ms = _toMillis(timestamp);
        if (!ms) return '';
        const date = new Date(ms);
        if (isNaN(date.getTime())) return '';
        return date.toLocaleDateString('en-US', {
            weekday: 'short', 
            month: 'short', 
            day: 'numeric',
            timeZone: 'America/Guyana'
        });
    }

    function _getServerTimestamp() {
        if (_fbFunctions && _fbFunctions.serverTimestamp) {
            return _fbFunctions.serverTimestamp();
        }
        console.warn('[Chat] Using client timestamp - server timestamp not available');
        return { _seconds: Math.floor(Date.now() / 1000) };
    }

    function _loadDraft(channelId) {
        try {
            const drafts = JSON.parse(localStorage.getItem(DRAFTS_KEY) || '{}');
            return drafts[channelId] || '';
        } catch(e) { return ''; }
    }

    function _saveDraft(channelId, draft) {
        try {
            const drafts = JSON.parse(localStorage.getItem(DRAFTS_KEY) || '{}');
            if (draft) {
                drafts[channelId] = draft;
            } else {
                delete drafts[channelId];
            }
            localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts));
        } catch(e) {}
    }

    // Identity
    function _getMyIdentity() {
        const userRole = sessionStorage.getItem('bizUserRole');
        const isAdmin = userRole === 'admin';
        
        if (isAdmin) {
            const adminData = JSON.parse(sessionStorage.getItem('currentAdmin') || '{}');
            let adminName = adminData.name || 'JAMAL';
            if (adminName.toUpperCase() === 'JAMAL') adminName = 'JAMAL';
            else if (adminName.toUpperCase() === 'ROSE') adminName = 'ROSE';
            else if (adminName.toUpperCase() === 'MOMO' || adminName.toUpperCase() === 'MOHENIE') adminName = 'MOHENIE';
            else if (adminName.toUpperCase() === 'MEL' || adminName.toUpperCase().includes('MEL')) adminName = 'MEL';
            else if (adminName.toUpperCase() === 'NADIA' || adminName.toUpperCase().includes('NADIA')) adminName = 'NADIA';
            
            return {
                id: (adminData.email || adminData.name || 'admin').replace(/[.#$\[\]]/g, '_').toLowerCase(),
                name: adminName,
                role: 'admin',
                isSuper: adminData.role === 'super_admin' || adminData.isSuper
            };
        } else {
            const profile = JSON.parse(sessionStorage.getItem('currentAgentProfile') || '{}');
            return {
                id: 'agent_' + (profile.ytelId || 'unknown'),
                name: profile.name || 'Agent',
                role: 'agent',
                ytelId: profile.ytelId || '',
                team: profile.team || ''
            };
        }
    }

    function _getAllChatParticipants() {
        const admins = [
            { id: 'jamal', name: 'JAMAL', type: 'admin' },
            { id: 'rose', name: 'ROSE', type: 'admin' },
            { id: 'momo', name: 'MOHENIE', type: 'admin' },
            { id: 'mel', name: 'MEL', type: 'admin' },
            { id: 'nadia', name: 'NADIA', type: 'admin' }
        ];
        
        const roster = _getAgentRoster();
        const agents = roster.map(agent => ({
            id: 'agent_' + (agent.userId || agent.ytelId || agent.id || ''),
            name: agent.fullName || agent.name || 'Agent',
            type: 'agent',
            team: agent.team || 'PR'
        })).filter(a => a.id && a.id !== 'agent_');
        
        return [...admins, ...agents];
    }

    function _getAdminNameById(adminId) {
        const adminMap = {
            'admin': 'JAMAL',
            'jamal': 'JAMAL',
            'rose': 'ROSE',
            'momo': 'MOHENIE',
            'mohenie': 'MOHENIE',
            'mel': 'MEL',
            'nadia': 'NADIA'
        };
        const lowerId = String(adminId).toLowerCase();
        for (const [key, value] of Object.entries(adminMap)) {
            if (lowerId.includes(key)) return value;
        }
        return adminId.charAt(0).toUpperCase() + adminId.slice(1);
    }

    // ═══════════════════════════════════════════
    // ENCRYPTION ENGINE
    // ═══════════════════════════════════════════
    async function _deriveKey(channelId) {
        if (_keyCache[channelId]) return _keyCache[channelId];
        const encoder = new TextEncoder();
        const keyMaterial = await crypto.subtle.importKey(
            'raw',
            encoder.encode(CRYPTO_SALT + ':' + channelId),
            { name: 'PBKDF2' },
            false,
            ['deriveKey']
        );
        const key = await crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: encoder.encode('biz-dashboard-4396c-' + channelId),
                iterations: 100000,
                hash: 'SHA-256'
            },
            keyMaterial,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
        _keyCache[channelId] = key;
        return key;
    }

    async function _encrypt(plaintext, channelId) {
        try {
            const key = await _deriveKey(channelId);
            const iv = crypto.getRandomValues(new Uint8Array(12));
            const encoder = new TextEncoder();
            const encrypted = await crypto.subtle.encrypt(
                { name: 'AES-GCM', iv: iv },
                key,
                encoder.encode(plaintext)
            );
            return {
                ciphertext: _bufToBase64(new Uint8Array(encrypted)),
                iv: _bufToBase64(iv)
            };
        } catch (e) {
            console.error('[Chat] Encryption failed:', e);
            return null;
        }
    }

    async function _decrypt(ciphertextB64, ivB64, channelId) {
        try {
            const key = await _deriveKey(channelId);
            const ciphertext = _base64ToBuf(ciphertextB64);
            const iv = _base64ToBuf(ivB64);
            const decrypted = await crypto.subtle.decrypt(
                { name: 'AES-GCM', iv: iv },
                key,
                ciphertext
            );
            return new TextDecoder().decode(decrypted);
        } catch (e) {
            console.warn('[Chat] Decryption failed:', e);
            return '[🔒 Unable to decrypt]';
        }
    }

    function _bufToBase64(buf) {
        let binary = '';
        for (let i = 0; i < buf.length; i++) binary += String.fromCharCode(buf[i]);
        return btoa(binary);
    }

    function _base64ToBuf(b64) {
        const binary = atob(b64);
        const buf = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) buf[i] = binary.charCodeAt(i);
        return buf;
    }

    // ═══════════════════════════════════════════
    // SOUND SYSTEM
    // ═══════════════════════════════════════════
    function _playNotificationSound() {
        try {
            if (!_crAudioCtx) _crAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const ctx = _crAudioCtx;
            if (ctx.state === 'suspended') ctx.resume();

            const now = ctx.currentTime;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(880, now);
            gain.gain.setValueAtTime(0.1, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(now);
            osc.stop(now + 0.3);
        } catch(e) {}
    }

    // ═══════════════════════════════════════════
    // FIREBASE HELPERS
    // ═══════════════════════════════════════════
    function _getDb() {
        return window.database || null;
    }

    async function _initFirebaseFunctions() {
        try {
            const mod = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js');
            _fbFunctions = {
                ref: mod.ref,
                set: mod.set,
                push: mod.push,
                get: mod.get,
                update: mod.update,
                remove: mod.remove,
                onValue: mod.onValue,
                off: mod.off,
                serverTimestamp: mod.serverTimestamp
            };
            console.log('[Chat] Firebase functions loaded');
            return true;
        } catch(e) {
            console.error('[Chat] Failed to load Firebase functions:', e);
            return false;
        }
    }

    function _ref(path) {
        if (!_fbFunctions || !_getDb()) return null;
        return _fbFunctions.ref(_getDb(), path);
    }

    // ═══════════════════════════════════════════
    // CHANNEL HELPERS
    // ═══════════════════════════════════════════
    function _getDMChannelId(id1, id2) {
        const parts = [id1, id2].sort();
        return 'dm_' + parts.join('__');
    }

    function _getGroupChannelId(roomName, members) {
        const sorted = [...members].sort();
        return 'group_' + roomName.replace(/[^a-z0-9]/gi, '_').toLowerCase() + '_' + sorted.join('_').slice(0, 50);
    }

    function _getAdminList() {
        return [
            { id: 'jamal', name: 'JAMAL' },
            { id: 'mel', name: 'MEL' },
            { id: 'momo', name: 'MOHENIE' },
            { id: 'nadia', name: 'NADIA' }
        ];
    }

    function _getAgentRoster() {
        const profiles = window.allAgentProfiles || [];
        if (profiles.length > 0) return profiles;
        try {
            const saved = localStorage.getItem('biz_master_roster');
            if (saved) return JSON.parse(saved);
        } catch(e) {}
        return [];
    }

    // ═══════════════════════════════════════════
    // TYPING INDICATORS
    // ═══════════════════════════════════════════
    function _sendTypingIndicator(channelId, isTyping) {
        if (!_fbFunctions || !channelId) return;
        const me = _getMyIdentity();
        const typingRef = _ref(TYPING_DB_PATH + '/' + channelId + '/' + me.id);
        if (typingRef) {
            if (isTyping) {
                _fbFunctions.set(typingRef, {
                    name: me.name,
                    timestamp: _getServerTimestamp()
                });
            } else {
                _fbFunctions.remove(typingRef);
            }
        }
    }
    
    function _listenForTyping(channelId) {
        if (!_fbFunctions || !channelId) return;
        const typingRef = _ref(TYPING_DB_PATH + '/' + channelId);
        if (!typingRef) return;
        
        _fbFunctions.onValue(typingRef, (snapshot) => {
            const data = snapshot.val() || {};
            const me = _getMyIdentity();
            const now = Date.now();
            const typingUsers = [];
            
            Object.keys(data).forEach(userId => {
                if (userId !== me.id && data[userId]) {
                    const ts = _toMillis(data[userId].timestamp);
                    if (now - ts < 3000) {
                        typingUsers.push(data[userId].name);
                    }
                }
            });
            
            _crCurrentTypingUsers[channelId] = typingUsers;
            _updateTypingIndicator(channelId);
        });
    }
    
    function _updateTypingIndicator(channelId) {
        if (_crCurrentChannel !== channelId) return;
        const typingUsers = _crCurrentTypingUsers[channelId] || [];
        const indicator = document.getElementById('cr-typing-indicator');
        if (!indicator) return;
        
        if (typingUsers.length === 0) {
            indicator.classList.add('hidden');
        } else if (typingUsers.length === 1) {
            indicator.querySelector('.cr-typing-text').textContent = typingUsers[0] + ' is typing...';
            indicator.classList.remove('hidden');
        } else if (typingUsers.length === 2) {
            indicator.querySelector('.cr-typing-text').textContent = typingUsers[0] + ' and ' + typingUsers[1] + ' are typing...';
            indicator.classList.remove('hidden');
        } else {
            indicator.querySelector('.cr-typing-text').textContent = 'Several people are typing...';
            indicator.classList.remove('hidden');
        }
    }

    // ═══════════════════════════════════════════
    // MESSAGE EDIT/DELETE
    // ═══════════════════════════════════════════
    async function _editMessage(channelId, messageId, newText) {
        if (!_fbFunctions || !channelId || !messageId) return false;
        
        const me = _getMyIdentity();
        const msgRef = _ref(CHAT_DB_PATH + '/' + channelId + '/' + messageId);
        if (!msgRef) return false;
        
        try {
            const snapshot = await _fbFunctions.get(msgRef);
            const msg = snapshot.val();
            if (!msg || msg.from !== me.id) {
                alert('You can only edit your own messages');
                return false;
            }
            
            const encrypted = await _encrypt(newText, channelId);
            if (!encrypted) return false;
            
            await _fbFunctions.update(msgRef, {
                ciphertext: encrypted.ciphertext,
                iv: encrypted.iv,
                edited: true,
                editedAt: _getServerTimestamp()
            });
            
            return true;
        } catch(e) {
            console.error('[Chat] Edit message failed:', e);
            return false;
        }
    }
    
    async function _deleteMessage(channelId, messageId) {
        if (!_fbFunctions || !channelId || !messageId) return false;
        
        const me = _getMyIdentity();
        const msgRef = _ref(CHAT_DB_PATH + '/' + channelId + '/' + messageId);
        if (!msgRef) return false;
        
        try {
            const snapshot = await _fbFunctions.get(msgRef);
            const msg = snapshot.val();
            if (!msg || msg.from !== me.id) {
                alert('You can only delete your own messages');
                return false;
            }
            
            await _fbFunctions.remove(msgRef);
            return true;
        } catch(e) {
            console.error('[Chat] Delete message failed:', e);
            return false;
        }
    }

    // ═══════════════════════════════════════════
    // SEARCH WITHIN CHAT
    // ═══════════════════════════════════════════
    function _searchMessages(query, messages) {
        if (!query || !messages.length) return [];
        
        const results = [];
        const lowerQuery = query.toLowerCase();
        
        messages.forEach((msg, index) => {
            if (msg.text && msg.text.toLowerCase().includes(lowerQuery)) {
                results.push({ index, message: msg, preview: msg.text.substring(0, 100) });
            }
        });
        
        return results;
    }
    
    function _highlightSearchResults() {
        if (!_crSearchActive || !_crSearchResults.length) return;
        
        const messages = document.querySelectorAll('.cr-msg-text');
        messages.forEach(msgEl => {
            const originalHtml = msgEl.innerHTML;
            _crSearchResults.forEach(result => {
                const regex = new RegExp(`(${_crSearchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
                msgEl.innerHTML = originalHtml.replace(regex, '<mark style="background:#facc15;color:#020617;padding:0 2px;border-radius:3px;">$1</mark>');
            });
        });
    }
    
    function _navigateSearchResult(direction) {
        if (!_crSearchResults.length) return;
        
        _crCurrentSearchIndex += direction;
        if (_crCurrentSearchIndex < 0) _crCurrentSearchIndex = _crSearchResults.length - 1;
        if (_crCurrentSearchIndex >= _crSearchResults.length) _crCurrentSearchIndex = 0;
        
        const result = _crSearchResults[_crCurrentSearchIndex];
        const messageElements = document.querySelectorAll('.cr-msg-row');
        if (messageElements[result.index]) {
            messageElements[result.index].scrollIntoView({ behavior: 'smooth', block: 'center' });
            messageElements[result.index].style.background = 'rgba(250,204,21,0.15)';
            setTimeout(() => {
                messageElements[result.index].style.background = '';
            }, 2000);
        }
        
        const searchInfo = document.getElementById('cr-search-info');
        if (searchInfo) {
            searchInfo.textContent = `${_crCurrentSearchIndex + 1} of ${_crSearchResults.length}`;
        }
    }

    // ═══════════════════════════════════════════
    // PIN MESSAGES
    // ═══════════════════════════════════════════
    async function _pinMessage(channelId, messageId, message) {
        if (!_fbFunctions) return;
        const me = _getMyIdentity();
        const pinRef = _ref(PINS_DB_PATH + '/' + channelId + '/' + messageId);
        if (!pinRef) return;
        
        const isPinned = _crPinnedMessages[channelId] && _crPinnedMessages[channelId][messageId];
        
        if (isPinned) {
            await _fbFunctions.remove(pinRef);
            if (_crPinnedMessages[channelId]) delete _crPinnedMessages[channelId][messageId];
        } else {
            await _fbFunctions.set(pinRef, {
                pinnedBy: me.id,
                pinnedByName: me.name,
                pinnedAt: _getServerTimestamp(),
                message: {
                    text: message.text,
                    fromName: message.fromName,
                    timestamp: message.timestamp
                }
            });
            if (!_crPinnedMessages[channelId]) _crPinnedMessages[channelId] = {};
            _crPinnedMessages[channelId][messageId] = true;
        }
        
        _renderPinnedMessages(channelId);
    }
    
    function _listenForPins(channelId) {
        if (!_fbFunctions) return;
        const pinsRef = _ref(PINS_DB_PATH + '/' + channelId);
        if (!pinsRef) return;
        
        _fbFunctions.onValue(pinsRef, (snapshot) => {
            _crPinnedMessages[channelId] = snapshot.val() || {};
            _renderPinnedMessages(channelId);
        });
    }
    
    function _renderPinnedMessages(channelId) {
        const container = document.getElementById('cr-pinned-messages');
        if (!container) return;
        
        const pins = _crPinnedMessages[channelId] || {};
        const pinList = Object.values(pins);
        
        if (pinList.length === 0) {
            container.innerHTML = '<div class="cr-pinned-header" style="display:none;"></div>';
            return;
        }
        
        container.innerHTML = `
            <div class="cr-pinned-header" style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:rgba(250,204,21,0.08);border-bottom:1px solid rgba(250,204,21,0.2);font-size:10px;font-weight:900;color:#facc15;">
                <span>📌 Pinned Messages (${pinList.length})</span>
            </div>
            <div class="cr-pinned-list" style="max-height:150px;overflow-y:auto;padding:8px;">
                ${pinList.slice(0, 5).map(pin => `
                    <div class="cr-pinned-item" style="padding:6px 10px;background:rgba(255,255,255,0.03);border-radius:8px;margin-bottom:4px;cursor:pointer;" onclick="window._crScrollToMessage('${channelId}')">
                        <div style="font-size:9px;color:#facc15;font-weight:800;">📌 ${_escHtml(pin.message?.fromName || 'Unknown')}</div>
                        <div style="font-size:11px;color:#e2e8f0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${_escHtml(pin.message?.text?.substring(0, 50) || '')}</div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    // ═══════════════════════════════════════════
    // PRESENCE / ONLINE STATUS
    // ═══════════════════════════════════════════
    function _updatePresence() {
        if (!_fbFunctions) return;
        const me = _getMyIdentity();
        const presenceRef = _ref(PRESENCE_DB_PATH + '/' + me.id);
        if (presenceRef) {
            _fbFunctions.set(presenceRef, {
                name: me.name,
                role: me.role,
                online: true,
                lastSeen: _getServerTimestamp()
            });
            
            const onDisconnectRef = _fbFunctions.ref(_getDb(), PRESENCE_DB_PATH + '/' + me.id);
            if (onDisconnectRef && onDisconnectRef.onDisconnect) {
                onDisconnectRef.onDisconnect().set({
                    name: me.name,
                    role: me.role,
                    online: false,
                    lastSeen: _getServerTimestamp()
                });
            }
        }
    }
    
    function _listenForPresence() {
        if (!_fbFunctions) return;
        const presenceRef = _ref(PRESENCE_DB_PATH);
        if (!presenceRef) return;
        
        _fbFunctions.onValue(presenceRef, (snapshot) => {
            const data = snapshot.val() || {};
            _crOnlineUsers.clear();
            Object.keys(data).forEach(id => {
                if (data[id].online) {
                    _crOnlineUsers.add(id);
                }
                _crLastSeen[id] = data[id].lastSeen || 0;
            });
            _updateOnlineStatusUI();
        });
    }
    
    function _updateOnlineStatusUI() {
        const statusEl = document.getElementById('cr-online-status');
        if (statusEl) {
            const count = _crOnlineUsers.size;
            statusEl.innerHTML = `<span class="online-dot" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#22c55e;margin-right:6px;"></span> ${count} online`;
        }
    }

    // ═══════════════════════════════════════════
    // GENERAL CHAT - with server timestamps
    // ═══════════════════════════════════════════
    function _loadNotificationSettings() {
        try {
            const saved = localStorage.getItem(NOTIF_SETTINGS_KEY);
            if (saved) _crNotificationSettings = JSON.parse(saved);
        } catch(e) {}
    }

    function _listenToGeneralChat(me) {
        if (!_fbFunctions) return;
        const generalRef = _ref(GENERAL_CHAT_PATH);
        if (!generalRef) return;

        let initialLoad = true;

        _fbFunctions.onValue(generalRef, async (snapshot) => {
            const data = snapshot.val();
            if (!data) {
                _generalChatMessages = [];
                if (_crCurrentChannelType === 'general') {
                    _renderGeneralChatMessages(me);
                }
                return;
            }

            const messages = [];
            const msgKeys = Object.keys(data);
            
            for (const key of msgKeys) {
                const raw = data[key];
                if (!raw || !raw.ciphertext) continue;
                const cacheKey = GENERAL_CHAT_PATH + '_' + key;
                let plaintext = _decryptCache[cacheKey];
                if (!plaintext) {
                    plaintext = await _decrypt(raw.ciphertext, raw.iv, GENERAL_CHAT_PATH);
                    _decryptCache[cacheKey] = plaintext;
                }
                
                let timestamp = 0;
                if (raw.timestamp) {
                    timestamp = _toMillis(raw.timestamp);
                } else if (raw.createdAt) {
                    timestamp = _toMillis(raw.createdAt);
                }
                
                messages.push({
                    id: key,
                    from: raw.from || '',
                    fromName: raw.fromName || '',
                    text: plaintext,
                    timestamp: timestamp,
                    isQuickAction: raw.isQuickAction || false,
                    edited: raw.edited || false
                });
            }

            messages.sort((a, b) => a.timestamp - b.timestamp);
            _generalChatMessages = messages;

            if (!initialLoad && messages.length > 0) {
                const newest = messages[messages.length - 1];
                if (newest && newest.from !== me.id) {
                    _playNotificationSound();
                    if (!_isFirstLoad) {
                        _generalChatUnread++;
                        _updateFloatBubbleBadge();
                        _updateTabBadge();
                        if (window.currentTab !== 'chatroom') {
                            setTimeout(() => window._crOpenFloat('general'), 500);
                        }
                    }
                }
            }
            
            initialLoad = false;
            _updateFloatBubbleBadge();
            _updateTabBadge();

            if (_crCurrentChannelType === 'general') {
                _renderGeneralChatMessages(me);
            }
            if (document.getElementById('cr-channel-list')) {
                _renderChannelList();
            }
        });
    }
    
    function _updateTabBadge() {
        let totalUnread = _generalChatUnread;
        Object.values(_crChannels).forEach(ch => { totalUnread += (ch.unread || 0); });
        
        const chatroomTab = document.getElementById('tab-chatroom');
        if (chatroomTab) {
            if (totalUnread > 0) {
                chatroomTab.innerHTML = `💬 Chatroom <span style="background:#ef4444;color:white;border-radius:10px;padding:2px 6px;margin-left:5px;font-size:9px;">${totalUnread > 99 ? '99+' : totalUnread}</span>`;
            } else {
                chatroomTab.innerHTML = `💬 Chatroom`;
            }
        }
    }

    async function _sendToGeneralChat(text, me, isQuickAction = false) {
        if (!_fbFunctions || !text) return false;
        if (!_keyCache[GENERAL_CHAT_PATH]) await _deriveKey(GENERAL_CHAT_PATH);
        
        const tempId = 'temp_' + Date.now() + '_' + Math.random();
        const tempTimestamp = Date.now();
        const tempMessage = {
            id: tempId,
            from: me.id,
            fromName: me.name,
            text: text,
            timestamp: tempTimestamp,
            isQuickAction: isQuickAction,
            isTemp: true
        };
        
        _generalChatMessages.push(tempMessage);
        _generalChatMessages.sort((a, b) => a.timestamp - b.timestamp);
        
        if (_crCurrentChannelType === 'general') {
            _renderGeneralChatMessages(me);
        }
        
        const encrypted = await _encrypt(text, GENERAL_CHAT_PATH);
        if (!encrypted) {
            _generalChatMessages = _generalChatMessages.filter(m => m.id !== tempId);
            if (_crCurrentChannelType === 'general') {
                _renderGeneralChatMessages(me);
            }
            return false;
        }
        
        try {
            const payload = {
                from: me.id,
                fromName: me.name,
                ciphertext: encrypted.ciphertext,
                iv: encrypted.iv,
                isQuickAction: isQuickAction,
                timestamp: _getServerTimestamp()
            };
            
            await _fbFunctions.push(_ref(GENERAL_CHAT_PATH), payload);
            
            _generalChatMessages = _generalChatMessages.filter(m => m.id !== tempId);
            return true;
        } catch(e) {
            _generalChatMessages = _generalChatMessages.filter(m => m.id !== tempId);
            if (_crCurrentChannelType === 'general') {
                _renderGeneralChatMessages(me);
            }
            return false;
        }
    }

    function _getReactionInfo(msgId, myId) {
        const reactions = (_crReactions && _crReactions[msgId]) || {};
        const count = Object.keys(reactions).length;
        const iReacted = !!reactions[myId];
        const names = Object.values(reactions).filter(Boolean).join(', ');
        return { count, iReacted, names };
    }

    function _listenToReactions() {
        if (!_fbFunctions) return;
        const reactionsRef = _ref(REACTIONS_DB_PATH);
        if (!reactionsRef) return;
        _fbFunctions.onValue(reactionsRef, (snapshot) => {
            _crReactions = snapshot.val() || {};
            const me = _getMyIdentity();
            if (_crCurrentChannelType === 'general') _renderGeneralChatMessages(me);
            else if (_crCurrentChannelType === 'dm' && _crCurrentChannel) _renderPrivateChatMessages(_crCurrentChannel, me);
            else if (_crCurrentChannelType === 'group' && _crCurrentChannel) _renderGroupChatMessages(_crCurrentChannel, me);
            if (window._crFloatActiveChannel) window._crOpenFloatChat(window._crFloatActiveChannel);
        });
    }

    // ═══════════════════════════════════════════
    // RENDER MESSAGES
    // ═══════════════════════════════════════════
    function _renderGeneralChatMessages(me) {
        const area = document.getElementById('cr-messages-area');
        if (!area) return;

        if (_generalChatMessages.length === 0) {
            area.innerHTML = `<div class="cr-empty-state" style="padding:60px 20px;text-align:center;"><div class="cr-empty-icon" style="font-size:48px;margin-bottom:16px;">💬</div><div class="cr-empty-title" style="font-size:16px;font-weight:800;margin-bottom:8px;">General Chat</div><div class="cr-empty-desc" style="font-size:12px;color:#64748b;">Everyone in the room can see messages here. Be professional and helpful!</div></div>`;
            return;
        }

        let html = '';
        let lastDate = '';
        
        const sortedMessages = [..._generalChatMessages].sort((a, b) => a.timestamp - b.timestamp);

        sortedMessages.forEach((msg, idx) => {
            const msgDate = _formatMessageDate(msg.timestamp);
            if (msgDate !== lastDate) {
                html += `<div class="cr-date-sep" style="text-align:center;padding:16px 0 8px;"><span style="font-size:10px;font-weight:700;color:#475569;background:rgba(255,255,255,0.04);padding:4px 12px;border-radius:20px;">${msgDate}</span></div>`;
                lastDate = msgDate;
            }

            const isSent = msg.from === me.id;
            const timeStr = _formatMessageTime(msg.timestamp);
            const isQuickAction = msg.isQuickAction;
            const actionStyle = isQuickAction ? 'background:rgba(239,68,68,0.15);border-left:3px solid #ef4444;' : '';
            const editedBadge = msg.edited ? '<span style="font-size:8px;color:#64748b;margin-left:6px;">(edited)</span>' : '';
            
            let senderName = msg.fromName;
            let senderClass = 'color:#a855f7;';
            let senderIcon = '';
            if (msg.fromName === 'JAMAL') {
                senderIcon = '👑 ';
                senderClass = 'color:#fbbf24;';
                senderName = 'JAMAL';
            } else if (msg.fromName === 'ROSE' || (msg.fromName || '').toUpperCase().includes('MASTER SUPER')) {
                senderIcon = '🌹 ';
                senderClass = 'color:#ec4899;';
                senderName = 'ROSE';
            } else if (msg.fromName === 'MOMO' || msg.fromName === 'MOHENIE') {
                senderIcon = '🐱 ';
                senderClass = 'color:#06b6d4;';
                senderName = 'MOHENIE';
            }

            const isOnline = _crOnlineUsers.has(msg.from);
            const onlineDot = isOnline ? '<span class="online-status-dot" style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#22c55e;margin-left:6px;"></span>' : '';
            
            const isPinned = _crPinnedMessages[GENERAL_CHAT_PATH] && _crPinnedMessages[GENERAL_CHAT_PATH][msg.id];
            const pinIcon = isPinned ? '<span style="margin-left:6px;color:#facc15;">📌</span>' : '';
            
            const pinButton = `<button class="cr-pin-btn" onclick="window._crPinMessage('${GENERAL_CHAT_PATH}', '${msg.id}', this)" style="background:transparent;border:none;color:${isPinned ? '#facc15' : '#64748b'};cursor:pointer;font-size:10px;" title="${isPinned ? 'Unpin' : 'Pin'}">📌</button>`;
            
            const editButton = isSent ? `<button class="cr-edit-btn" onclick="window._crEditMessage('${GENERAL_CHAT_PATH}', '${msg.id}', this)" style="background:transparent;border:none;color:#64748b;cursor:pointer;font-size:10px;" title="Edit">✏️</button>` : '';
            const deleteButton = isSent ? `<button class="cr-delete-btn" onclick="window._crDeleteMessage('${GENERAL_CHAT_PATH}', '${msg.id}', this)" style="background:transparent;border:none;color:#ef4444;cursor:pointer;font-size:10px;" title="Delete">🗑️</button>` : '';

            const ri = _getReactionInfo(msg.id, me.id);
            html += `
                <div class="cr-msg-row ${isSent ? 'sent' : 'received'}" data-msg-id="${msg.id}" data-msg-index="${idx}" style="display:flex;justify-content:${isSent ? 'flex-end' : 'flex-start'};margin-bottom:12px;animation:fadeIn 0.2s ease;">
                    <div style="max-width:75%;">
                        <div class="cr-msg-bubble" style="padding:10px 14px;border-radius:16px;${actionStyle} ${isSent ? 'background:linear-gradient(135deg,rgba(16,185,129,0.18),rgba(5,150,105,0.22));border-bottom-right-radius:6px;' : 'background:rgba(255,255,255,0.04);border-bottom-left-radius:6px;'}">
                            <div class="cr-msg-sender" style="font-size:10px;${senderClass} font-weight:800;margin-bottom:4px;white-space:nowrap;">
                                ${senderIcon}${_escHtml(senderName)}${onlineDot}${pinIcon}
                            </div>
                            <div class="cr-msg-text" style="font-size:13px;color:#e2e8f0;line-height:1.5;${isQuickAction ? 'font-weight:800;color:#f87171;' : ''}">${_escHtml(msg.text)}${editedBadge}</div>
                            <div class="cr-msg-meta" style="display:flex;align-items:center;gap:6px;margin-top:6px;justify-content:flex-end;">
                                <button class="cr-tb" data-has="${ri.count > 0 || ri.iReacted ? '1' : '0'}"
                                        onclick="window._crToggleThumbsUp('${msg.id}')"
                                        title="${_escHtml(ri.names)}"
                                        style="opacity:${ri.count > 0 || ri.iReacted ? '1' : '0'};transition:opacity 0.15s;background:${ri.iReacted ? 'rgba(250,204,21,0.15)' : 'rgba(15,23,42,0.92)'};border:1px solid ${ri.iReacted ? 'rgba(250,204,21,0.45)' : 'rgba(255,255,255,0.14)'};border-radius:20px;padding:2px 8px;cursor:pointer;font-size:10px;color:${ri.iReacted ? '#facc15' : '#94a3b8'};white-space:nowrap;">
                                    👍${ri.count > 0 ? ' ' + ri.count : ''}
                                </button>
                                ${pinButton}
                                ${editButton}
                                ${deleteButton}
                                <span class="cr-msg-time" style="font-size:9px;color:#475569;">${timeStr}</span>
                                ${msg.isTemp ? '<span class="cr-msg-read" style="font-size:9px;color:#fbbf24;">sending...</span>' : ''}
                            </div>
                        </div>
                    </div>
                </div>`;
        });

        area.innerHTML = html;
        
        setTimeout(() => {
            if (area) area.scrollTop = area.scrollHeight;
        }, 50);
        
        if (_crSearchActive && _crSearchQuery) {
            _highlightSearchResults();
        }
    }

    // ═══════════════════════════════════════════
    // PRIVATE DM CHANNELS
    // ═══════════════════════════════════════════
    function _loadPrivateChannels(me) {
        const isAdmin = me.role === 'admin';
        
        if (isAdmin) {
            const roster = _getAgentRoster();
            roster.forEach(agent => {
                const agentId = 'agent_' + (agent.userId || agent.ytelId || agent.id || '');
                if (!agentId || agentId === 'agent_') return;
                const channelId = _getDMChannelId(me.id, agentId);
                if (!_crChannels[channelId]) {
                    _crChannels[channelId] = {
                        type: 'dm',
                        channelId: channelId,
                        agentId: agentId,
                        agentName: agent.fullName || agent.name || 'Agent',
                        messages: [],
                        unread: 0,
                        lastMsg: null,
                        lastMsgTime: 0
                    };
                }
            });
            const admins = _getAdminList();
            admins.forEach(admin => {
                if (admin.id === me.id || admin.name === me.name) return;
                const channelId = _getDMChannelId(me.id, admin.id);
                if (!_crChannels[channelId]) {
                    _crChannels[channelId] = {
                        type: 'dm',
                        channelId: channelId,
                        agentId: admin.id,
                        agentName: admin.name,
                        messages: [],
                        unread: 0,
                        lastMsg: null,
                        lastMsgTime: 0
                    };
                }
            });
        } else {
            const admins = _getAdminList();
            admins.forEach(admin => {
                const channelId = _getDMChannelId(me.id, admin.id);
                if (!_crChannels[channelId]) {
                    _crChannels[channelId] = {
                        type: 'dm',
                        channelId: channelId,
                        agentId: admin.id,
                        agentName: admin.name,
                        messages: [],
                        unread: 0,
                        lastMsg: null,
                        lastMsgTime: 0
                    };
                }
            });
        }

        _listenForPrivateMessages(me);
        _loadGroupChats(me);
        _updatePresence();
        _listenForPresence();
        _loadNotificationSettings();
    }

    function _loadGroupChats(me) {
        if (!_fbFunctions) return;
        const groupsRef = _ref(GROUP_CHAT_PATH);
        if (!groupsRef) return;

        _fbFunctions.onValue(groupsRef, async (snapshot) => {
            const data = snapshot.val();
            if (!data) return;

            Object.keys(data).forEach(groupKey => {
                const group = data[groupKey];
                if (!group || !group.members) return;
                
                const memberIds = group.members.map(m => String(m.id || m));
                const myId = String(me.id);
                const isMember = memberIds.includes(myId);
                
                if (!isMember) return;

                if (!_crGroupChannels[groupKey]) {
                    _crGroupChannels[groupKey] = {
                        type: 'group',
                        channelId: groupKey,
                        roomName: group.roomName || 'Group Chat',
                        members: group.members,
                        createdBy: group.createdBy || '',
                        createdByName: group.createdByName || '',
                        messages: [],
                        unread: 0,
                        lastMsg: null,
                        lastMsgTime: 0
                    };
                }
                _crChannels[groupKey] = _crGroupChannels[groupKey];
                _listenToGroupChannel(groupKey, me);
                _listenForTyping(groupKey);
                _listenForPins(groupKey);
            });
            
            if (document.getElementById('cr-channel-list')) _renderChannelList();
        });
    }

    function _listenToGroupChannel(channelId, me) {
        if (!_fbFunctions) return;
        const msgRef = _ref(CHAT_DB_PATH + '/' + channelId);
        if (!msgRef) return;

        let initialLoad = true;

        _fbFunctions.onValue(msgRef, async (snapshot) => {
            const data = snapshot.val();
            if (!data) return;

            const messages = [];
            let unread = 0;
            let lastMsgTime = 0;
            let lastMsg = null;

            const msgKeys = Object.keys(data);
            
            for (const key of msgKeys) {
                const raw = data[key];
                if (!raw || !raw.ciphertext) continue;
                const cacheKey = channelId + '_' + key;
                let plaintext = _decryptCache[cacheKey];
                if (!plaintext) {
                    plaintext = await _decrypt(raw.ciphertext, raw.iv, channelId);
                    _decryptCache[cacheKey] = plaintext;
                }
                
                let timestamp = _toMillis(raw.timestamp);
                
                const msg = {
                    id: key,
                    from: raw.from || '',
                    fromName: raw.fromName || '',
                    text: plaintext,
                    timestamp: timestamp,
                    read: raw.read || false,
                    isQuickAction: raw.isQuickAction || false,
                    edited: raw.edited || false
                };
                messages.push(msg);
                if (msg.timestamp > lastMsgTime) {
                    lastMsgTime = msg.timestamp;
                    lastMsg = msg;
                }
                if (msg.from !== me.id && !msg.read) unread++;
            }

            messages.sort((a, b) => a.timestamp - b.timestamp);

            const ch = _crChannels[channelId];
            if (ch) {
                ch.messages = messages;
                if (!initialLoad && unread > ch.unread) {
                    _playNotificationSound();
                }
                ch.unread = unread;
                ch.lastMsg = lastMsg;
                ch.lastMsgTime = lastMsgTime;
                
                _updateFloatBubbleBadge();
                _updateTabBadge();

                if (!initialLoad && messages.length > 0) {
                    const newest = messages[messages.length - 1];
                    if (newest && newest.from !== me.id) {
                        _playNotificationSound();
                        if (!_isFirstLoad && window.currentTab !== 'chatroom') {
                            setTimeout(() => window._crOpenFloat(channelId), 500);
                        }
                    }
                }
            }
            
            initialLoad = false;

            if (_crCurrentChannel === channelId && _crCurrentChannelType === 'group') {
                _renderGroupChatMessages(channelId, me);
                if (ch) ch.unread = 0;
            }
            if (document.getElementById('cr-channel-list')) _renderChannelList();
        });
    }

    async function _sendToGroupChannel(channelId, text, me, isQuickAction = false) {
        if (!_fbFunctions || !text || !channelId) return false;
        
        const tempId = 'temp_' + Date.now() + '_' + Math.random();
        const tempTimestamp = Date.now();
        const tempMessage = {
            id: tempId,
            from: me.id,
            fromName: me.name,
            text: text,
            timestamp: tempTimestamp,
            isQuickAction: isQuickAction,
            isTemp: true
        };
        
        if (_crChannels[channelId]) {
            _crChannels[channelId].messages.push(tempMessage);
            _crChannels[channelId].messages.sort((a, b) => a.timestamp - b.timestamp);
            if (_crCurrentChannel === channelId && _crCurrentChannelType === 'group') {
                _renderGroupChatMessages(channelId, me);
            }
        }
        
        const encrypted = await _encrypt(text, channelId);
        if (!encrypted) {
            if (_crChannels[channelId]) {
                _crChannels[channelId].messages = _crChannels[channelId].messages.filter(m => m.id !== tempId);
                if (_crCurrentChannel === channelId && _crCurrentChannelType === 'group') {
                    _renderGroupChatMessages(channelId, me);
                }
            }
            return false;
        }
        
        try {
            const payload = {
                from: me.id,
                fromName: me.name,
                ciphertext: encrypted.ciphertext,
                iv: encrypted.iv,
                read: false,
                isQuickAction: isQuickAction,
                timestamp: _getServerTimestamp()
            };
            
            await _fbFunctions.push(_ref(CHAT_DB_PATH + '/' + channelId), payload);
            
            if (_crChannels[channelId]) {
                _crChannels[channelId].messages = _crChannels[channelId].messages.filter(m => m.id !== tempId);
            }
            return true;
        } catch(e) {
            if (_crChannels[channelId]) {
                _crChannels[channelId].messages = _crChannels[channelId].messages.filter(m => m.id !== tempId);
                if (_crCurrentChannel === channelId && _crCurrentChannelType === 'group') {
                    _renderGroupChatMessages(channelId, me);
                }
            }
            return false;
        }
    }

    function _renderGroupChatMessages(channelId, me) {
        const area = document.getElementById('cr-messages-area');
        if (!area) return;

        const ch = _crChannels[channelId];
        if (!ch || ch.messages.length === 0) {
            area.innerHTML = `<div class="cr-empty-state" style="padding:60px 20px;text-align:center;"><div class="cr-empty-icon" style="font-size:48px;margin-bottom:16px;">👥</div><div class="cr-empty-title" style="font-size:16px;font-weight:800;margin-bottom:8px;">${_escHtml(ch?.roomName || 'Group Chat')}</div><div class="cr-empty-desc" style="font-size:12px;color:#64748b;">Group messages are end-to-end encrypted.</div></div>`;
            return;
        }

        let html = '';
        let lastDate = '';
        const sortedMessages = [...ch.messages].sort((a, b) => a.timestamp - b.timestamp);

        sortedMessages.forEach((msg, idx) => {
            const msgDate = _formatMessageDate(msg.timestamp);
            if (msgDate !== lastDate) {
                html += `<div class="cr-date-sep" style="text-align:center;padding:16px 0 8px;"><span style="font-size:10px;font-weight:700;color:#475569;background:rgba(255,255,255,0.04);padding:4px 12px;border-radius:20px;">${msgDate}</span></div>`;
                lastDate = msgDate;
            }

            const isSent = msg.from === me.id;
            const timeStr = _formatMessageTime(msg.timestamp);
            const isQuickAction = msg.isQuickAction;
            const actionStyle = isQuickAction ? 'background:rgba(239,68,68,0.15);border-left:3px solid #ef4444;' : '';
            const editedBadge = msg.edited ? '<span style="font-size:8px;color:#64748b;margin-left:6px;">(edited)</span>' : '';
            
            let displayName = msg.fromName;
            let senderIcon = '';
            let senderColor = '#a855f7';
            
            if (msg.fromName === 'JAMAL') {
                senderIcon = '👑 ';
                senderColor = '#fbbf24';
            } else if (msg.fromName === 'ROSE') {
                senderIcon = '🌹 ';
                senderColor = '#ec4899';
            } else if (msg.fromName === 'MOMO') {
                senderIcon = '🐱 ';
                senderColor = '#06b6d4';
            }

            const isOnline = _crOnlineUsers.has(msg.from);
            const onlineDot = isOnline ? '<span class="online-status-dot" style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#22c55e;margin-left:6px;"></span>' : '';
            
            const isPinned = _crPinnedMessages[channelId] && _crPinnedMessages[channelId][msg.id];
            const pinIcon = isPinned ? '<span style="margin-left:6px;color:#facc15;">📌</span>' : '';
            
            const pinButton = `<button class="cr-pin-btn" onclick="window._crPinMessage('${channelId}', '${msg.id}', this)" style="background:transparent;border:none;color:${isPinned ? '#facc15' : '#64748b'};cursor:pointer;font-size:10px;" title="${isPinned ? 'Unpin' : 'Pin'}">📌</button>`;
            
            const editButton = isSent ? `<button class="cr-edit-btn" onclick="window._crEditMessage('${channelId}', '${msg.id}', this)" style="background:transparent;border:none;color:#64748b;cursor:pointer;font-size:10px;" title="Edit">✏️</button>` : '';
            const deleteButton = isSent ? `<button class="cr-delete-btn" onclick="window._crDeleteMessage('${channelId}', '${msg.id}', this)" style="background:transparent;border:none;color:#ef4444;cursor:pointer;font-size:10px;" title="Delete">🗑️</button>` : '';

            const ri = _getReactionInfo(msg.id, me.id);
            html += `
                <div class="cr-msg-row ${isSent ? 'sent' : 'received'}" data-msg-id="${msg.id}" data-msg-index="${idx}" style="display:flex;justify-content:${isSent ? 'flex-end' : 'flex-start'};margin-bottom:12px;">
                    <div style="max-width:75%;">
                        <div class="cr-msg-bubble" style="padding:10px 14px;border-radius:16px;${actionStyle} ${isSent ? 'background:linear-gradient(135deg,rgba(16,185,129,0.18),rgba(5,150,105,0.22));border-bottom-right-radius:6px;' : 'background:rgba(255,255,255,0.04);border-bottom-left-radius:6px;'}">
                            ${!isSent ? `<div class="cr-msg-sender" style="font-size:10px;color:${senderColor};font-weight:800;margin-bottom:4px;">${senderIcon}${_escHtml(displayName)}${onlineDot}${pinIcon}</div>` : ''}
                            <div class="cr-msg-text" style="font-size:13px;color:#e2e8f0;line-height:1.5;${isQuickAction ? 'font-weight:800;color:#f87171;' : ''}">${_escHtml(msg.text)}${editedBadge}</div>
                            <div class="cr-msg-meta" style="display:flex;align-items:center;gap:6px;margin-top:6px;justify-content:flex-end;">
                                <button class="cr-tb" data-has="${ri.count > 0 || ri.iReacted ? '1' : '0'}"
                                        onclick="window._crToggleThumbsUp('${msg.id}')"
                                        title="${_escHtml(ri.names)}"
                                        style="opacity:${ri.count > 0 || ri.iReacted ? '1' : '0'};transition:opacity 0.15s;background:${ri.iReacted ? 'rgba(250,204,21,0.15)' : 'rgba(15,23,42,0.92)'};border:1px solid ${ri.iReacted ? 'rgba(250,204,21,0.45)' : 'rgba(255,255,255,0.14)'};border-radius:20px;padding:2px 8px;cursor:pointer;font-size:10px;color:${ri.iReacted ? '#facc15' : '#94a3b8'};white-space:nowrap;">
                                    👍${ri.count > 0 ? ' ' + ri.count : ''}
                                </button>
                                ${pinButton}
                                ${editButton}
                                ${deleteButton}
                                <span class="cr-msg-time" style="font-size:9px;color:#475569;">${timeStr}</span>
                                ${msg.isTemp ? '<span class="cr-msg-read" style="font-size:9px;color:#fbbf24;">sending...</span>' : (isSent && msg.read ? '<span class="cr-msg-read" style="font-size:10px;color:#10b981;">✓✓</span>' : '')}
                            </div>
                        </div>
                    </div>
                </div>`;
        });

        area.innerHTML = html;
        setTimeout(() => { if (area) area.scrollTop = area.scrollHeight; }, 50);
        
        if (_crSearchActive && _crSearchQuery) {
            _highlightSearchResults();
        }
    }

    window._crCreateRoom = async function() {
        const roomName = document.getElementById('cr-room-name-input')?.value.trim();
        const checkboxes = document.querySelectorAll('#cr-agent-checklist input[type="checkbox"]:checked');
        
        if (!roomName) {
            alert('Please enter a room name');
            return;
        }
        
        const me = _getMyIdentity();
        
        const selectedParticipants = Array.from(checkboxes).map(cb => ({
            id: cb.value,
            name: cb.getAttribute('data-name') || cb.value,
            type: cb.value.startsWith('agent_') ? 'agent' : 'admin'
        }));
        
        const members = [{ id: me.id, name: me.name, type: 'admin' }, ...selectedParticipants];
        
        const uniqueMembers = [];
        const memberIds = new Set();
        for (const m of members) {
            if (!memberIds.has(m.id)) {
                memberIds.add(m.id);
                uniqueMembers.push(m);
            }
        }
        
        const channelId = _getGroupChannelId(roomName, uniqueMembers.map(m => m.id));
        
        const groupInfo = {
            roomName: roomName,
            members: uniqueMembers,
            createdBy: me.id,
            createdByName: me.name,
            createdAt: _getServerTimestamp(),
            memberIds: uniqueMembers.map(m => m.id)
        };
        
        if (!_fbFunctions) return;
        
        try {
            await _fbFunctions.set(_ref(GROUP_CHAT_PATH + '/' + channelId), groupInfo);
            
            _crGroupChannels[channelId] = {
                type: 'group',
                channelId: channelId,
                roomName: roomName,
                members: uniqueMembers,
                createdBy: me.id,
                createdByName: me.name,
                messages: [],
                unread: 0,
                lastMsg: null,
                lastMsgTime: 0
            };
            _crChannels[channelId] = _crGroupChannels[channelId];
            
            _listenToGroupChannel(channelId, me);
            _listenForTyping(channelId);
            _listenForPins(channelId);
            
            window._crCloseModal();
            
            if (document.getElementById('cr-channel-list')) _renderChannelList();
            
            setTimeout(() => window._crSelectGroupChat(channelId), 500);
            
        } catch(e) {
            console.error('[Chat] Failed to create room:', e);
            alert('Failed to create room: ' + e.message);
        }
    };
    
    window._crSelectGroupChat = function(channelId) {
        const me = _getMyIdentity();
        _crCurrentChannel = channelId;
        _crCurrentChannelType = 'group';
        
        const ch = _crChannels[channelId];
        const title = ch ? ch.roomName : 'Group Chat';
        
        if (ch) ch.unread = 0;
        _updateFloatBubbleBadge();
        _updateTabBadge();

        const panel = document.getElementById('cr-chat-panel');
        if (!panel) return;
        
        const savedDraft = _loadDraft(channelId);

        panel.innerHTML = `
            <div class="cr-chat-header" style="display:flex;align-items:center;gap:14px;padding:16px 20px;border-bottom:1px solid rgba(255,255,255,0.06);flex-shrink:0;">
                <button class="cr-back-btn" onclick="window._crBackToSidebar()" style="display:none;background:rgba(255,255,255,0.05);border:none;border-radius:10px;color:#94a3b8;width:34px;height:34px;align-items:center;justify-content:center;cursor:pointer;">←</button>
                <div class="cr-channel-avatar" style="width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,0.05);font-size:18px;font-weight:900;color:#10b981;">👥</div>
                <div class="cr-chat-header-info" style="flex:1;">
                    <div class="cr-chat-header-name" style="font-size:14px;font-weight:900;color:white;">${_escHtml(title)}</div>
                    <div class="cr-chat-header-status" style="font-size:10px;color:#64748b;margin-top:2px;">
                        <span class="cr-e2e-badge" style="display:inline-flex;align-items:center;gap:4px;background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.25);border-radius:6px;padding:2px 8px;font-size:8px;color:#10b981;">🔐 E2E Encrypted</span>
                        <span style="margin-left:8px;" id="cr-online-status">Loading...</span>
                    </div>
                </div>
                <div class="cr-chat-actions" style="display:flex;gap:4px;">
                    <button class="cr-search-btn" onclick="window._crToggleSearch()" style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:6px 10px;color:#94a3b8;cursor:pointer;font-size:12px;">🔍</button>
                    <button id="cr-members-toggle-btn" onclick="window._crToggleGroupMembers('${channelId}')" style="background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.3);border-radius:8px;padding:6px 10px;color:#10b981;cursor:pointer;font-size:12px;font-weight:700;">👥 Members</button>
                    <button class="cr-clear-chat-btn" onclick="window._crClearPrivateChat('${channelId}')" style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:8px;color:#ef4444;padding:6px 12px;font-size:10px;font-weight:900;cursor:pointer;">🗑️ Clear</button>
                </div>
            </div>
            <div id="cr-pinned-messages" style="border-bottom:1px solid rgba(255,255,255,0.06);"></div>
            <div id="cr-search-panel" style="display:none;padding:8px 12px;background:rgba(0,0,0,0.3);border-bottom:1px solid rgba(255,255,255,0.06);">
                <div style="display:flex;gap:8px;align-items:center;">
                    <input type="text" id="cr-search-input" placeholder="Search messages..." style="flex:1;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:6px 10px;color:white;font-size:12px;">
                    <button onclick="window._crSearchMessages()" style="background:#10b981;border:none;border-radius:8px;padding:6px 12px;color:white;cursor:pointer;">🔍</button>
                    <span id="cr-search-info" style="font-size:10px;color:#64748b;"></span>
                    <button onclick="window._crCloseSearch()" style="background:transparent;border:none;color:#94a3b8;cursor:pointer;">✕</button>
                </div>
                <div style="display:flex;gap:4px;margin-top:6px;justify-content:center;">
                    <button onclick="window._crPrevSearchResult()" style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:6px;padding:2px 8px;font-size:10px;">← Previous</button>
                    <button onclick="window._crNextSearchResult()" style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:6px;padding:2px 8px;font-size:10px;">Next →</button>
                </div>
            </div>
            <div style="display:flex;gap:8px;padding:10px 16px;background:rgba(0,0,0,0.2);border-bottom:1px solid rgba(255,255,255,0.06);flex-wrap:wrap;flex-shrink:0;">
                <button onclick="window._crSendQuickActionToGroup('come_quick', '${channelId}')" style="background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.4);border-radius:20px;padding:6px 14px;color:#f87171;font-size:11px;font-weight:700;cursor:pointer;">🚨 Come Quick</button>
                <button onclick="window._crSendQuickActionToGroup('help', '${channelId}')" style="background:rgba(245,158,11,0.15);border:1px solid rgba(245,158,11,0.4);border-radius:20px;padding:6px 14px;color:#fbbf24;font-size:11px;font-weight:700;cursor:pointer;">🆘 Help</button>
                <button onclick="window._crMentionUser()" style="background:rgba(139,92,246,0.15);border:1px solid rgba(139,92,246,0.4);border-radius:20px;padding:6px 14px;color:#a78bfa;font-size:11px;font-weight:700;cursor:pointer;">@ Mention</button>
            </div>
            <div class="cr-messages" id="cr-messages-area" style="flex: 1; overflow-y: auto; padding: 16px 20px;"></div>
            <div class="cr-typing-indicator hidden" id="cr-typing-indicator" style="padding:8px 16px;flex-shrink:0;"><div class="cr-typing-dots" style="display:flex;gap:3px;"><div class="cr-typing-dot" style="width:5px;height:5px;border-radius:50%;background:#475569;"></div><div class="cr-typing-dot" style="width:5px;height:5px;border-radius:50%;background:#475569;"></div><div class="cr-typing-dot" style="width:5px;height:5px;border-radius:50%;background:#475569;"></div></div><span class="cr-typing-text" style="font-size:10px;color:#475569;margin-left:8px;">typing...</span></div>
            <div class="cr-input-bar" style="padding:12px 16px;border-top:1px solid rgba(255,255,255,0.06);display:flex;gap:10px;flex-shrink:0;">
                <div class="cr-input-wrap" style="flex:1;position:relative;">
                    <textarea class="cr-msg-input" id="cr-msg-input" placeholder="Type a message to the group..." rows="1" style="width:100%;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:14px;color:#e2e8f0;font-size:13px;padding:12px 16px;resize:none;line-height:1.4;padding-right:50px;" onkeydown="window._crHandleGroupKeydown(event, '${channelId}')" oninput="window._crHandleGroupTyping(event, '${channelId}')">${_escHtml(savedDraft)}</textarea>
                    <button class="cr-emoji-btn" onclick="window._crToggleEmojiPicker(event, 'group_${channelId}')" style="position:absolute;right:8px;bottom:8px;width:32px;height:32px;border-radius:10px;background:rgba(255,255,255,0.05);border:none;cursor:pointer;font-size:18px;">😊</button>
                    <div id="cr-emoji-picker-group_${channelId}" class="cr-emoji-picker"></div>
                </div>
                <button class="cr-send-btn" onclick="window._crSendGroupMessage('${channelId}')" style="width:44px;height:44px;border-radius:14px;background:linear-gradient(135deg,#10b981,#059669);border:none;color:white;cursor:pointer;display:flex;align-items:center;justify-content:center;">➤</button>
            </div>`;

        _renderGroupChatMessages(channelId, me);
        _markPrivateChannelRead(channelId, me);
        _listenForTyping(channelId);
        _updateOnlineStatusUI();
        
        const textarea = document.getElementById('cr-msg-input');
        if (textarea) {
            textarea.addEventListener('input', () => {
                _saveDraft(channelId, textarea.value);
            });
        }

        if (window.innerWidth <= 700) {
            const sidebar = document.getElementById('cr-sidebar');
            const chatPanel = document.getElementById('cr-chat-panel');
            if (sidebar) sidebar.classList.add('sidebar-hidden');
            if (chatPanel) chatPanel.classList.remove('panel-hidden');
            const backBtn = document.querySelector('#cr-chat-panel .cr-back-btn');
            if (backBtn) backBtn.style.display = 'flex';
        }
    };

    // ===========================================
    // GROUP MEMBERS MODAL
    // ===========================================

    window._crToggleGroupMembers = function(channelId) {
        window._crOpenMembersModal(channelId);
    };

    window._crOpenMembersModal = function(channelId) {
        var old = document.getElementById('cr-members-modal-overlay');
        if (old) old.remove();

        var me = _getMyIdentity();
        var ch = _crChannels[channelId];
        if (!ch) return;
        var isAdmin = (me.role === 'admin' || me.role === 'super_admin');
        var isCreator = String(ch.createdBy) === String(me.id);
        var canManage = isAdmin || isCreator;

        var overlay = document.createElement('div');
        overlay.id = 'cr-members-modal-overlay';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.65);backdrop-filter:blur(4px);z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px;';
        overlay.onclick = function(e){ if(e.target===overlay) overlay.remove(); };

        var modal = document.createElement('div');
        modal.style.cssText = 'background:#0d1b2a;border:1px solid rgba(255,255,255,0.1);border-radius:18px;width:100%;max-width:520px;max-height:82vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 24px 80px rgba(0,0,0,0.7);';

        var roomName = (ch.roomName || 'Group Chat').replace(/</g,'&lt;');
        modal.innerHTML =
          '<div style="display:flex;align-items:center;justify-content:space-between;padding:18px 20px 14px;border-bottom:1px solid rgba(255,255,255,0.07);">'
          + '<div>'
          + '<div style="font-size:15px;font-weight:800;color:#f8fafc;">\xf0\x9f\x91\xa5 ' + roomName + '</div>'
          + '<div style="font-size:10px;color:#64748b;margin-top:2px;font-weight:600;">MANAGE MEMBERS</div>'
          + '</div>'
          + '<button onclick="document.getElementById(\'cr-members-modal-overlay\').remove()" style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:10px;width:32px;height:32px;color:#94a3b8;font-size:18px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;">&times;</button>'
          + '</div>'
          + '<div id="cr-mm-tabs" style="display:flex;border-bottom:1px solid rgba(255,255,255,0.07);">'
          + '<button id="cr-mm-tab-current" onclick="window._crMmSwitchTab(\'current\',\'' + channelId + '\')" style="flex:1;padding:10px;font-size:11px;font-weight:800;color:#10b981;border:none;background:rgba(16,185,129,0.07);border-bottom:2px solid #10b981;cursor:pointer;text-transform:uppercase;letter-spacing:0.07em;">\xf0\x9f\x93\x8b Current Members</button>'
          + '<button id="cr-mm-tab-add" onclick="window._crMmSwitchTab(\'add\',\'' + channelId + '\')" style="flex:1;padding:10px;font-size:11px;font-weight:800;color:#64748b;border:none;background:transparent;border-bottom:2px solid transparent;cursor:pointer;text-transform:uppercase;letter-spacing:0.07em;">\xe2\x9e\x95 Add Members</button>'
          + '</div>'
          + '<div style="padding:12px 16px 8px;">'
          + '<input id="cr-mm-search" type="text" placeholder="Search..." oninput="window._crMmOnSearch(\'' + channelId + '\')" style="width:100%;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:10px;padding:8px 12px;color:white;font-size:12px;box-sizing:border-box;outline:none;">'
          + '</div>'
          + '<div id="cr-mm-list" style="flex:1;overflow-y:auto;padding:6px 16px 10px;"></div>'
          + '<div id="cr-mm-footer" style="padding:12px 16px;border-top:1px solid rgba(255,255,255,0.07);display:flex;align-items:center;justify-content:space-between;gap:10px;">'
          + '<span id="cr-mm-sel-count" style="font-size:11px;color:#64748b;font-weight:700;">0 selected</span>'
          + '<div style="display:flex;gap:8px;">'
          + '<button onclick="window._crMmSelectAll()" style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:9px;padding:6px 14px;color:#94a3b8;font-size:11px;font-weight:700;cursor:pointer;">Select All</button>'
          + '<button id="cr-mm-action-btn" onclick="window._crMmCommitAction(\'' + channelId + '\')" style="border-radius:9px;padding:6px 18px;font-size:11px;font-weight:800;cursor:pointer;background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.4);color:#ef4444;">Remove Selected</button>'
          + '</div>'
          + '</div>';

        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        window._crMmState = { tab: 'current', channelId: channelId, selected: new Set(), canManage: canManage };
        window._crMmSwitchTab('current', channelId);
    };

    window._crMmSwitchTab = function(tab, channelId) {
        var st = window._crMmState;
        if (!st) return;
        st.tab = tab;
        st.selected = new Set();
        var tCur = document.getElementById('cr-mm-tab-current');
        var tAdd = document.getElementById('cr-mm-tab-add');
        if (tCur) { tCur.style.color=tab==='current'?'#10b981':'#64748b'; tCur.style.background=tab==='current'?'rgba(16,185,129,0.07)':''; tCur.style.borderBottomColor=tab==='current'?'#10b981':'transparent'; }
        if (tAdd) { tAdd.style.color=tab==='add'?'#10b981':'#64748b'; tAdd.style.background=tab==='add'?'rgba(16,185,129,0.07)':''; tAdd.style.borderBottomColor=tab==='add'?'#10b981':'transparent'; }
        var btn = document.getElementById('cr-mm-action-btn');
        if (btn) {
            if (tab==='add') { btn.textContent='Add Selected'; btn.style.background='rgba(16,185,129,0.15)'; btn.style.borderColor='rgba(16,185,129,0.4)'; btn.style.color='#10b981'; }
            else { btn.textContent='Remove Selected'; btn.style.background='rgba(239,68,68,0.15)'; btn.style.borderColor='rgba(239,68,68,0.4)'; btn.style.color='#ef4444'; }
        }
        var si = document.getElementById('cr-mm-search');
        if (si) si.value='';
        window._crMmRender(channelId, '');
    };

    window._crMmOnSearch = function(channelId) {
        var si = document.getElementById('cr-mm-search');
        window._crMmRender(channelId, si ? si.value : '');
    };

    window._crMmRender = function(channelId, filter) {
        var st = window._crMmState;
        var listEl = document.getElementById('cr-mm-list');
        if (!st || !listEl) return;
        var me = _getMyIdentity();
        var ch = _crChannels[channelId];
        if (!ch) return;
        var lf = (filter || '').toLowerCase();
        var html = '';

        if (st.tab === 'current') {
            var members = (ch.members || []).filter(function(m) {
                if (!lf) return true;
                return (m.name||String(m.id||m)).toLowerCase().includes(lf);
            });
            if (!members.length) {
                listEl.innerHTML = '<div style="color:#64748b;font-size:12px;text-align:center;padding:24px;">No members found</div>';
                return;
            }
            members.forEach(function(member) {
                var mid = String(member.id || member);
                var mname = member.name || mid;
                var mtype = member.type || 'agent';
                var isSelf = mid === String(me.id);
                var isGroupCreator = mid === String(ch.createdBy);
                var removable = st.canManage && !isSelf && !isGroupCreator;
                var isChecked = st.selected.has(mid);
                var roleBadge = isGroupCreator ? 'Creator' : (mtype==='agent'?'Agent':'Admin');
                var roleColor = isGroupCreator ? '#facc15' : (mtype==='agent'?'#3b82f6':'#10b981');
                var avatarColor = mtype==='agent'?'#3b82f6':'#10b981';
                var rowBg = isChecked ? 'background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.25);' : 'background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.05);';
                html += '<div' + (removable ? ' onclick="window._crMmToggle(\''+mid+'\')"' : '') + ' style="display:flex;align-items:center;gap:12px;padding:9px 10px;border-radius:12px;margin-bottom:4px;cursor:' + (removable?'pointer':'default') + ';' + rowBg + '">';
                if (removable) {
                    var chkBorder = isChecked ? '#ef4444' : 'rgba(255,255,255,0.2)';
                    var chkBg = isChecked ? 'rgba(239,68,68,0.25)' : 'transparent';
                    html += '<div style="width:18px;height:18px;border-radius:5px;border:2px solid ' + chkBorder + ';background:' + chkBg + ';flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:900;color:#ef4444;">' + (isChecked?'&#x2713;':'')+'</div>';
                } else {
                    html += '<div style="width:18px;flex-shrink:0;"></div>';
                }
                html += '<div style="width:34px;height:34px;border-radius:50%;background:rgba(255,255,255,0.07);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:900;color:' + avatarColor + ';flex-shrink:0;">' + _escHtml((mname.charAt(0)||'?').toUpperCase()) + '</div>';
                html += '<div style="flex:1;min-width:0;">';
                html += '<div style="font-size:12px;font-weight:700;color:' + (isSelf?'#10b981':'#e2e8f0') + ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + _escHtml(mname) + (isSelf?' <span style="opacity:0.5;font-size:10px;">(you)</span>':'') + '</div>';
                html += '<div style="font-size:9px;font-weight:800;color:' + roleColor + ';text-transform:uppercase;margin-top:1px;letter-spacing:0.05em;">' + roleBadge + '</div>';
                html += '</div>';
                if (!removable) html += '<div style="font-size:9px;color:#475569;font-weight:600;">' + (isGroupCreator?'Creator':'\xf0\x9f\x94\x92') + '</div>';
                html += '</div>';
            });
        } else {
            var currentIds = new Set((ch.members||[]).map(function(m){ return String(m.id||m); }));
            var all = _getAllChatParticipants();
            var available = all.filter(function(p) {
                if (currentIds.has(String(p.id))) return false;
                if (lf) return (p.name||'').toLowerCase().includes(lf);
                return true;
            });
            if (!available.length) {
                listEl.innerHTML = '<div style="color:#64748b;font-size:12px;text-align:center;padding:24px;">' + (lf?'No users match your search':'Everyone is already a member') + '</div>';
                return;
            }
            available.forEach(function(p) {
                var pid = String(p.id);
                var isChecked = st.selected.has(pid);
                var ptype = p.type || 'agent';
                var avatarColor = ptype==='agent'?'#3b82f6':'#10b981';
                var rowBg = isChecked ? 'background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.25);' : 'background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.05);';
                var chkBorder = isChecked ? '#10b981' : 'rgba(255,255,255,0.2)';
                var chkBg = isChecked ? 'rgba(16,185,129,0.25)' : 'transparent';
                html += '<div onclick="window._crMmToggle(\''+pid+'\')" style="display:flex;align-items:center;gap:12px;padding:9px 10px;border-radius:12px;margin-bottom:4px;cursor:pointer;' + rowBg + '">';
                html += '<div style="width:18px;height:18px;border-radius:5px;border:2px solid ' + chkBorder + ';background:' + chkBg + ';flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:900;color:#10b981;">' + (isChecked?'&#x2713;':'')+'</div>';
                html += '<div style="width:34px;height:34px;border-radius:50%;background:rgba(255,255,255,0.07);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:900;color:' + avatarColor + ';flex-shrink:0;">' + _escHtml((p.name||'?').charAt(0).toUpperCase()) + '</div>';
                html += '<div style="flex:1;min-width:0;">';
                html += '<div style="font-size:12px;font-weight:700;color:#e2e8f0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + _escHtml(p.name) + '</div>';
                html += '<div style="font-size:9px;font-weight:800;color:' + avatarColor + ';text-transform:uppercase;margin-top:1px;letter-spacing:0.05em;">' + ptype + '</div>';
                html += '</div>';
                html += '</div>';
            });
        }

        listEl.innerHTML = html;
        window._crMmUpdateCount();
    };

    window._crMmToggle = function(id) {
        var st = window._crMmState;
        if (!st) return;
        if (st.selected.has(id)) st.selected.delete(id);
        else st.selected.add(id);
        var si = document.getElementById('cr-mm-search');
        window._crMmRender(st.channelId, si?si.value:'');
    };

    window._crMmSelectAll = function() {
        var st = window._crMmState;
        if (!st) return;
        var ch = _crChannels[st.channelId];
        var me = _getMyIdentity();
        if (st.tab === 'current') {
            (ch.members||[]).forEach(function(m) {
                var mid=String(m.id||m);
                if (mid!==String(me.id) && mid!==String(ch.createdBy)) st.selected.add(mid);
            });
        } else {
            var currentIds=new Set((ch.members||[]).map(function(m){return String(m.id||m);}));
            _getAllChatParticipants().forEach(function(p){ if(!currentIds.has(String(p.id))) st.selected.add(String(p.id)); });
        }
        var si=document.getElementById('cr-mm-search');
        window._crMmRender(st.channelId, si?si.value:'');
    };

    window._crMmUpdateCount = function() {
        var st = window._crMmState;
        var el = document.getElementById('cr-mm-sel-count');
        if (!el || !st) return;
        var n = st.selected.size;
        el.textContent = n + ' selected';
    };

    window._crMmCommitAction = async function(channelId) {
        var st = window._crMmState;
        if (!st || !st.selected.size) return;
        if (!_fbFunctions) return;
        var ch = _crChannels[channelId];
        if (!ch) return;
        if (!st.canManage) return;
        var btn = document.getElementById('cr-mm-action-btn');
        if (btn) { btn.disabled=true; btn.textContent='Saving...'; }
        try {
            var updated;
            if (st.tab === 'current') {
                updated = (ch.members||[]).filter(function(m){ return !st.selected.has(String(m.id||m)); });
            } else {
                var all = _getAllChatParticipants();
                var toAdd = all.filter(function(p){ return st.selected.has(String(p.id)); });
                var currentIds = new Set((ch.members||[]).map(function(m){return String(m.id||m);}));
                var newOnes = toAdd.filter(function(p){return !currentIds.has(String(p.id));}).map(function(p){return {id:p.id,name:p.name,type:p.type||'agent'};});
                updated = (ch.members||[]).concat(newOnes);
            }
            await _fbFunctions.update(_ref(GROUP_CHAT_PATH+'/'+channelId), { members: updated, memberIds: updated.map(function(m){return m.id||m;}) });
            ch.members = updated;
            st.selected = new Set();
            window._crMmSwitchTab(st.tab, channelId);
        } catch(e) {
            console.error('[Chat] Member update failed:', e);
            if (btn) { btn.disabled=false; btn.textContent=st.tab==='add'?'Add Selected':'Remove Selected'; }
        }
    };

    window._crGroupRemoveMember = async function(channelId, memberId) {
        window._crMmState = { tab: 'current', channelId: channelId, selected: new Set([memberId]), canManage: true };
        await window._crMmCommitAction(channelId);
    };

    window._crGroupAddMemberById = async function(channelId, userId, userName, userType) {
        var ch = _crChannels[channelId]; if (!ch) return;
        var currentIds = new Set((ch.members||[]).map(function(m){return String(m.id||m);}));
        if (currentIds.has(String(userId))) return;
        var updated = (ch.members||[]).concat([{id:userId,name:userName,type:userType||'agent'}]);
        if (!_fbFunctions) return;
        await _fbFunctions.update(_ref(GROUP_CHAT_PATH+'/'+channelId), { members: updated, memberIds: updated.map(function(m){return m.id||m;}) });
        ch.members = updated;
    };


    window._crSendGroupMessage = async function(channelId) {
        const input = document.getElementById('cr-msg-input');
        if (!input) return;
        const text = input.value.trim();
        if (!text || !channelId) return;
        const me = _getMyIdentity();
        const success = await _sendToGroupChannel(channelId, text, me, false);
        if (success) {
            input.value = '';
            _saveDraft(channelId, '');
            input.style.height = 'auto';
            _sendTypingIndicator(channelId, false);
        }
    };

    window._crSendQuickActionToGroup = async function(actionKey, channelId) {
        const action = QUICK_ACTIONS[actionKey];
        if (!action || !channelId) return;
        const me = _getMyIdentity();
        await _sendToGroupChannel(channelId, action.message, me, true);
    };

    window._crHandleGroupKeydown = function(e, channelId) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            window._crSendGroupMessage(channelId);
        }
    };

    window._crHandleGroupTyping = function(e, channelId) {
        const input = document.getElementById('cr-msg-input');
        if (input) {
            input.style.height = 'auto';
            input.style.height = Math.min(input.scrollHeight, 80) + 'px';
        }
        
        if (_crTypingTimers[channelId]) clearTimeout(_crTypingTimers[channelId]);
        _sendTypingIndicator(channelId, true);
        _crTypingTimers[channelId] = setTimeout(() => {
            _sendTypingIndicator(channelId, false);
        }, 1500);
    };

    function _listenForPrivateMessages(me) {
        if (!_fbFunctions) return;

        Object.values(_crChannels).forEach(ch => {
            if (ch.type === 'dm') _listenToPrivateChannel(ch.channelId, me);
        });

        const chatRef = _ref(CHAT_DB_PATH);
        if (!chatRef) return;

        _fbFunctions.onValue(chatRef, (snapshot) => {
            const data = snapshot.val();
            if (!data) return;

            Object.keys(data).forEach(channelId => {
                if (!channelId.startsWith('dm_')) return;
                if (_crChannels[channelId]) return;

                const parts = channelId.replace('dm_', '').split('__');
                if (!parts.includes(me.id)) return;

                const otherId = parts[0] === me.id ? parts[1] : parts[0];
                if (!otherId) return;

                const isAdmin = me.role === 'admin';
                const otherIsAdmin = otherId === 'admin' || otherId === 'jamal' || otherId === 'rose' || otherId === 'momo' || otherId === 'mel' || otherId === 'nadia';
                
                if (isAdmin && !otherId.startsWith('agent_') && !otherIsAdmin) return;
                if (!isAdmin && !otherIsAdmin) return;

                let agentName = otherId;
                if (otherId.startsWith('agent_')) {
                    const roster = _getAgentRoster();
                    const agent = roster.find(a => 'agent_' + (a.userId || a.ytelId) === otherId);
                    agentName = agent ? (agent.fullName || agent.name) : otherId.replace('agent_', 'Agent ');
                } else {
                    const admins = _getAdminList();
                    const admin = admins.find(a => a.id === otherId);
                    agentName = admin ? admin.name : _getAdminNameById(otherId);
                }

                _crChannels[channelId] = {
                    type: 'dm',
                    channelId: channelId,
                    agentId: otherId,
                    agentName: agentName,
                    messages: [],
                    unread: 0,
                    lastMsg: null,
                    lastMsgTime: 0
                };
                _listenToPrivateChannel(channelId, me);
                _listenForTyping(channelId);
                if (document.getElementById('cr-channel-list')) _renderChannelList();
            });
        }, { onlyOnce: true });
    }

    function _listenToPrivateChannel(channelId, me) {
        if (!_fbFunctions) return;
        const msgRef = _ref(CHAT_DB_PATH + '/' + channelId);
        if (!msgRef) return;

        let initialLoad = true;

        _fbFunctions.onValue(msgRef, async (snapshot) => {
            const data = snapshot.val();
            if (!data) return;

            const messages = [];
            let unread = 0;
            let lastMsgTime = 0;
            let lastMsg = null;

            const msgKeys = Object.keys(data);
            
            for (const key of msgKeys) {
                const raw = data[key];
                if (!raw || !raw.ciphertext) continue;
                const cacheKey = channelId + '_' + key;
                let plaintext = _decryptCache[cacheKey];
                if (!plaintext) {
                    plaintext = await _decrypt(raw.ciphertext, raw.iv, channelId);
                    _decryptCache[cacheKey] = plaintext;
                }
                
                let timestamp = _toMillis(raw.timestamp);
                
                const msg = {
                    id: key,
                    from: raw.from || '',
                    fromName: raw.fromName || '',
                    text: plaintext,
                    timestamp: timestamp,
                    read: raw.read || false,
                    isQuickAction: raw.isQuickAction || false,
                    edited: raw.edited || false
                };
                messages.push(msg);
                if (msg.timestamp > lastMsgTime) {
                    lastMsgTime = msg.timestamp;
                    lastMsg = msg;
                }
                if (msg.from !== me.id && !msg.read) unread++;
            }

            messages.sort((a, b) => a.timestamp - b.timestamp);

            const ch = _crChannels[channelId];
            if (ch) {
                ch.messages = messages;
                if (!initialLoad && unread > ch.unread) {
                    _playNotificationSound();
                }
                ch.unread = unread;
                ch.lastMsg = lastMsg;
                ch.lastMsgTime = lastMsgTime;
                
                _updateFloatBubbleBadge();
                _updateTabBadge();

                if (!initialLoad && messages.length > 0) {
                    const newest = messages[messages.length - 1];
                    if (newest && newest.from !== me.id) {
                        _playNotificationSound();
                        if (!_isFirstLoad && window.currentTab !== 'chatroom') {
                            setTimeout(() => window._crOpenFloat(channelId), 500);
                        }
                    }
                }
            }
            
            initialLoad = false;

            if (_crCurrentChannel === channelId && _crCurrentChannelType === 'dm') {
                _renderPrivateChatMessages(channelId, me);
                if (ch) ch.unread = 0;
            }
            if (document.getElementById('cr-channel-list')) _renderChannelList();
        });
    }

    async function _sendToPrivateChannel(channelId, text, me, isQuickAction = false) {
        if (!_fbFunctions || !text || !channelId) return false;
        
        const tempId = 'temp_' + Date.now() + '_' + Math.random();
        const tempTimestamp = Date.now();
        const tempMessage = {
            id: tempId,
            from: me.id,
            fromName: me.name,
            text: text,
            timestamp: tempTimestamp,
            isQuickAction: isQuickAction,
            isTemp: true
        };
        
        if (_crChannels[channelId]) {
            _crChannels[channelId].messages.push(tempMessage);
            _crChannels[channelId].messages.sort((a, b) => a.timestamp - b.timestamp);
            if (_crCurrentChannel === channelId && _crCurrentChannelType === 'dm') {
                _renderPrivateChatMessages(channelId, me);
            }
        }
        
        const encrypted = await _encrypt(text, channelId);
        if (!encrypted) {
            if (_crChannels[channelId]) {
                _crChannels[channelId].messages = _crChannels[channelId].messages.filter(m => m.id !== tempId);
                if (_crCurrentChannel === channelId && _crCurrentChannelType === 'dm') {
                    _renderPrivateChatMessages(channelId, me);
                }
            }
            return false;
        }
        
        try {
            const payload = {
                from: me.id,
                fromName: me.name,
                ciphertext: encrypted.ciphertext,
                iv: encrypted.iv,
                read: false,
                isQuickAction: isQuickAction,
                timestamp: _getServerTimestamp()
            };
            
            await _fbFunctions.push(_ref(CHAT_DB_PATH + '/' + channelId), payload);
            
            if (_crChannels[channelId]) {
                _crChannels[channelId].messages = _crChannels[channelId].messages.filter(m => m.id !== tempId);
            }
            return true;
        } catch(e) {
            if (_crChannels[channelId]) {
                _crChannels[channelId].messages = _crChannels[channelId].messages.filter(m => m.id !== tempId);
                if (_crCurrentChannel === channelId && _crCurrentChannelType === 'dm') {
                    _renderPrivateChatMessages(channelId, me);
                }
            }
            return false;
        }
    }

    function _renderPrivateChatMessages(channelId, me) {
        const area = document.getElementById('cr-messages-area');
        if (!area) return;

        const ch = _crChannels[channelId];
        if (!ch || ch.messages.length === 0) {
            area.innerHTML = `<div class="cr-empty-state" style="padding:60px 20px;text-align:center;"><div class="cr-empty-icon" style="font-size:48px;margin-bottom:16px;">🔒</div><div class="cr-empty-title" style="font-size:16px;font-weight:800;margin-bottom:8px;">Private Chat</div><div class="cr-empty-desc" style="font-size:12px;color:#64748b;">Messages are end-to-end encrypted.</div></div>`;
            return;
        }

        let html = '';
        let lastDate = '';
        const sortedMessages = [...ch.messages].sort((a, b) => a.timestamp - b.timestamp);

        sortedMessages.forEach((msg, idx) => {
            const msgDate = _formatMessageDate(msg.timestamp);
            if (msgDate !== lastDate) {
                html += `<div class="cr-date-sep" style="text-align:center;padding:16px 0 8px;"><span style="font-size:10px;font-weight:700;color:#475569;background:rgba(255,255,255,0.04);padding:4px 12px;border-radius:20px;">${msgDate}</span></div>`;
                lastDate = msgDate;
            }

            const isSent = msg.from === me.id;
            const timeStr = _formatMessageTime(msg.timestamp);
            const isQuickAction = msg.isQuickAction;
            const actionStyle = isQuickAction ? 'background:rgba(239,68,68,0.15);border-left:3px solid #ef4444;' : '';
            const editedBadge = msg.edited ? '<span style="font-size:8px;color:#64748b;margin-left:6px;">(edited)</span>' : '';
            
            let displayName = msg.fromName;
            let senderIcon = '';
            let senderColor = '#a855f7';
            
            if (msg.fromName === 'JAMAL') {
                senderIcon = '👑 ';
                senderColor = '#fbbf24';
            } else if (msg.fromName === 'ROSE') {
                senderIcon = '🌹 ';
                senderColor = '#ec4899';
            } else if (msg.fromName === 'MOMO') {
                senderIcon = '🐱 ';
                senderColor = '#06b6d4';
            }

            const isOnline = _crOnlineUsers.has(msg.from);
            const onlineDot = isOnline ? '<span class="online-status-dot" style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#22c55e;margin-left:6px;"></span>' : '';
            
            const isPinned = _crPinnedMessages[channelId] && _crPinnedMessages[channelId][msg.id];
            const pinIcon = isPinned ? '<span style="margin-left:6px;color:#facc15;">📌</span>' : '';
            
            const pinButton = `<button class="cr-pin-btn" onclick="window._crPinMessage('${channelId}', '${msg.id}', this)" style="background:transparent;border:none;color:${isPinned ? '#facc15' : '#64748b'};cursor:pointer;font-size:10px;" title="${isPinned ? 'Unpin' : 'Pin'}">📌</button>`;
            
            const editButton = isSent ? `<button class="cr-edit-btn" onclick="window._crEditMessage('${channelId}', '${msg.id}', this)" style="background:transparent;border:none;color:#64748b;cursor:pointer;font-size:10px;" title="Edit">✏️</button>` : '';
            const deleteButton = isSent ? `<button class="cr-delete-btn" onclick="window._crDeleteMessage('${channelId}', '${msg.id}', this)" style="background:transparent;border:none;color:#ef4444;cursor:pointer;font-size:10px;" title="Delete">🗑️</button>` : '';

            const ri = _getReactionInfo(msg.id, me.id);
            html += `
                <div class="cr-msg-row ${isSent ? 'sent' : 'received'}" data-msg-id="${msg.id}" data-msg-index="${idx}" style="display:flex;justify-content:${isSent ? 'flex-end' : 'flex-start'};margin-bottom:12px;">
                    <div style="max-width:75%;">
                        <div class="cr-msg-bubble" style="padding:10px 14px;border-radius:16px;${actionStyle} ${isSent ? 'background:linear-gradient(135deg,rgba(16,185,129,0.18),rgba(5,150,105,0.22));border-bottom-right-radius:6px;' : 'background:rgba(255,255,255,0.04);border-bottom-left-radius:6px;'}">
                            ${!isSent ? `<div class="cr-msg-sender" style="font-size:10px;color:${senderColor};font-weight:800;margin-bottom:4px;">${senderIcon}${_escHtml(displayName)}${onlineDot}${pinIcon}</div>` : ''}
                            <div class="cr-msg-text" style="font-size:13px;color:#e2e8f0;line-height:1.5;${isQuickAction ? 'font-weight:800;color:#f87171;' : ''}">${_escHtml(msg.text)}${editedBadge}</div>
                            <div class="cr-msg-meta" style="display:flex;align-items:center;gap:6px;margin-top:6px;justify-content:flex-end;">
                                <button class="cr-tb" data-has="${ri.count > 0 || ri.iReacted ? '1' : '0'}"
                                        onclick="window._crToggleThumbsUp('${msg.id}')"
                                        title="${_escHtml(ri.names)}"
                                        style="opacity:${ri.count > 0 || ri.iReacted ? '1' : '0'};transition:opacity 0.15s;background:${ri.iReacted ? 'rgba(250,204,21,0.15)' : 'rgba(15,23,42,0.92)'};border:1px solid ${ri.iReacted ? 'rgba(250,204,21,0.45)' : 'rgba(255,255,255,0.14)'};border-radius:20px;padding:2px 8px;cursor:pointer;font-size:10px;color:${ri.iReacted ? '#facc15' : '#94a3b8'};white-space:nowrap;">
                                    👍${ri.count > 0 ? ' ' + ri.count : ''}
                                </button>
                                ${pinButton}
                                ${editButton}
                                ${deleteButton}
                                <span class="cr-msg-time" style="font-size:9px;color:#475569;">${timeStr}</span>
                                ${msg.isTemp ? '<span class="cr-msg-read" style="font-size:9px;color:#fbbf24;">sending...</span>' : (isSent && msg.read ? '<span class="cr-msg-read" style="font-size:10px;color:#10b981;">✓✓</span>' : '')}
                            </div>
                        </div>
                    </div>
                </div>`;
        });

        area.innerHTML = html;
        setTimeout(() => { if (area) area.scrollTop = area.scrollHeight; }, 50);
        
        if (_crSearchActive && _crSearchQuery) {
            _highlightSearchResults();
        }
    }

    async function _markPrivateChannelRead(channelId, me) {
        if (!_fbFunctions) return;
        const ch = _crChannels[channelId];
        if (!ch || ch.unread === 0) return;

        const msgRef = _ref(CHAT_DB_PATH + '/' + channelId);
        if (!msgRef) return;

        try {
            const snapshot = await _fbFunctions.get(msgRef);
            const data = snapshot.val();
            if (!data) return;

            const updates = {};
            Object.keys(data).forEach(key => {
                const msg = data[key];
                if (msg.from !== me.id && !msg.read) {
                    updates[key + '/read'] = true;
                }
            });

            if (Object.keys(updates).length > 0) {
                await _fbFunctions.update(msgRef, updates);
                ch.unread = 0;
                _updateFloatBubbleBadge();
                _updateTabBadge();
                if (document.getElementById('cr-channel-list')) _renderChannelList();
            }
        } catch(e) {}
    }

    // ═══════════════════════════════════════════
    // EDIT/DELETE/PIN MESSAGE FUNCTIONS
    // ═══════════════════════════════════════════
    window._crEditMessage = async function(channelId, messageId, btn) {
        const newText = prompt('Edit your message:', '');
        if (!newText) return;
        
        const success = await _editMessage(channelId, messageId, newText);
        if (success) {
            const me = _getMyIdentity();
            if (channelId === GENERAL_CHAT_PATH) {
                _renderGeneralChatMessages(me);
            } else if (_crCurrentChannelType === 'dm') {
                _renderPrivateChatMessages(channelId, me);
            } else if (_crCurrentChannelType === 'group') {
                _renderGroupChatMessages(channelId, me);
            }
        } else {
            alert('Failed to edit message');
        }
    };
    
    window._crDeleteMessage = async function(channelId, messageId, btn) {
        if (!confirm('Delete this message? This cannot be undone.')) return;
        
        const success = await _deleteMessage(channelId, messageId);
        if (success) {
            const me = _getMyIdentity();
            if (channelId === GENERAL_CHAT_PATH) {
                _renderGeneralChatMessages(me);
            } else if (_crCurrentChannelType === 'dm') {
                _renderPrivateChatMessages(channelId, me);
            } else if (_crCurrentChannelType === 'group') {
                _renderGroupChatMessages(channelId, me);
            }
        } else {
            alert('Failed to delete message');
        }
    };
    
    window._crPinMessage = async function(channelId, messageId, btn) {
        let message = null;
        if (channelId === GENERAL_CHAT_PATH) {
            message = _generalChatMessages.find(m => m.id === messageId);
        } else {
            const ch = _crChannels[channelId];
            if (ch) message = ch.messages.find(m => m.id === messageId);
        }
        
        if (message) {
            await _pinMessage(channelId, messageId, message);
        }
    };
    
    window._crScrollToMessage = function(channelId) {};

    // ═══════════════════════════════════════════
    // SEARCH FUNCTIONS
    // ═══════════════════════════════════════════
    window._crToggleSearch = function() {
        const panel = document.getElementById('cr-search-panel');
        if (panel) {
            panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
            if (panel.style.display === 'block') {
                document.getElementById('cr-search-input').focus();
            } else {
                _crSearchActive = false;
                const me = _getMyIdentity();
                if (_crCurrentChannelType === 'general') _renderGeneralChatMessages(me);
                else if (_crCurrentChannelType === 'dm') _renderPrivateChatMessages(_crCurrentChannel, me);
                else if (_crCurrentChannelType === 'group') _renderGroupChatMessages(_crCurrentChannel, me);
            }
        }
    };
    
    window._crSearchMessages = function() {
        const query = document.getElementById('cr-search-input').value.trim();
        if (!query) return;
        
        _crSearchQuery = query;
        _crSearchActive = true;
        
        let messages = [];
        if (_crCurrentChannelType === 'general') {
            messages = _generalChatMessages;
        } else {
            const ch = _crChannels[_crCurrentChannel];
            if (ch) messages = ch.messages;
        }
        
        _crSearchResults = _searchMessages(query, messages);
        _crCurrentSearchIndex = -1;
        
        if (_crSearchResults.length > 0) {
            _navigateSearchResult(1);
            const searchInfo = document.getElementById('cr-search-info');
            if (searchInfo) searchInfo.textContent = `${_crCurrentSearchIndex + 1} of ${_crSearchResults.length}`;
        } else {
            alert('No messages found matching "' + query + '"');
        }
        
        _highlightSearchResults();
    };
    
    window._crNextSearchResult = function() {
        _navigateSearchResult(1);
    };
    
    window._crPrevSearchResult = function() {
        _navigateSearchResult(-1);
    };
    
    window._crCloseSearch = function() {
        const panel = document.getElementById('cr-search-panel');
        if (panel) panel.style.display = 'none';
        _crSearchActive = false;
        const me = _getMyIdentity();
        if (_crCurrentChannelType === 'general') _renderGeneralChatMessages(me);
        else if (_crCurrentChannelType === 'dm') _renderPrivateChatMessages(_crCurrentChannel, me);
        else if (_crCurrentChannelType === 'group') _renderGroupChatMessages(_crCurrentChannel, me);
    };
    
    // ═══════════════════════════════════════════
    // VOICE RECORDING & FILE SHARING
    // ═══════════════════════════════════════════
    async function _startVoiceRecording() {
        if (_crIsRecording) {
            _stopVoiceRecording();
            return;
        }
        
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            _crMediaRecorder = new MediaRecorder(stream);
            _crAudioChunks = [];
            
            _crMediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    _crAudioChunks.push(event.data);
                }
            };
            
            _crMediaRecorder.onstop = async () => {
                const audioBlob = new Blob(_crAudioChunks, { type: 'audio/webm' });
                const reader = new FileReader();
                reader.onloadend = async () => {
                    const audioData = reader.result.split(',')[1];
                    const me = _getMyIdentity();
                    const messageText = '🎤 Voice message';
                    if (_crCurrentChannelType === 'general') {
                        await _sendToGeneralChat(messageText, me, false);
                    } else if (_crCurrentChannelType === 'dm') {
                        await _sendToPrivateChannel(_crCurrentChannel, messageText, me, false);
                    } else if (_crCurrentChannelType === 'group') {
                        await _sendToGroupChannel(_crCurrentChannel, messageText, me, false);
                    }
                    stream.getTracks().forEach(track => track.stop());
                };
                reader.readAsDataURL(audioBlob);
                _updateVoiceButtonUI(false);
            };
            
            _crMediaRecorder.start(1000);
            _crIsRecording = true;
            _updateVoiceButtonUI(true);
            
            setTimeout(() => {
                if (_crIsRecording) _stopVoiceRecording();
            }, 30000);
        } catch (e) {
            console.error('[Chat] Voice recording failed:', e);
            alert('Microphone access denied or not available');
        }
    }
    
    function _stopVoiceRecording() {
        if (_crMediaRecorder && _crIsRecording) {
            _crMediaRecorder.stop();
            _crIsRecording = false;
            _updateVoiceButtonUI(false);
        }
    }
    
    function _updateVoiceButtonUI(isRecording) {
        const voiceBtn = document.getElementById('cr-voice-btn');
        if (voiceBtn) {
            if (isRecording) {
                voiceBtn.innerHTML = '🔴';
                voiceBtn.style.background = 'rgba(239,68,68,0.2)';
                voiceBtn.style.borderColor = '#ef4444';
            } else {
                voiceBtn.innerHTML = '🎙️';
                voiceBtn.style.background = 'rgba(255,255,255,0.05)';
                voiceBtn.style.borderColor = 'rgba(255,255,255,0.1)';
            }
        }
    }
    
    window._crHandleFileSelect = async function(input) {
        const files = Array.from(input.files);
        for (const file of files) {
            if (file.size > 10 * 1024 * 1024) {
                alert(`File ${file.name} is too large (max 10MB)`);
                continue;
            }
            const reader = new FileReader();
            reader.onloadend = async () => {
                const fileData = reader.result.split(',')[1];
                const me = _getMyIdentity();
                const messageText = `📎 ${file.name}`;
                if (_crCurrentChannelType === 'general') {
                    await _sendToGeneralChat(messageText, me, false);
                } else if (_crCurrentChannelType === 'dm') {
                    await _sendToPrivateChannel(_crCurrentChannel, messageText, me, false);
                } else if (_crCurrentChannelType === 'group') {
                    await _sendToGroupChannel(_crCurrentChannel, messageText, me, false);
                }
            };
            reader.readAsDataURL(file);
        }
        input.value = '';
    };
    
    window._crToggleVoiceRecording = function() {
        if (_crIsRecording) {
            _stopVoiceRecording();
        } else {
            _startVoiceRecording();
        }
    };
    
    // ═══════════════════════════════════════════
    // MENTION FUNCTION
    // ═══════════════════════════════════════════
    window._crMentionUser = function() {
        const participants = _getAllChatParticipants();
        const mentionList = participants.map(p => p.name).join(', ');
        const input = document.getElementById('cr-msg-input');
        if (input) {
            input.value += '@';
            input.focus();
        }
    };
    
    // ═══════════════════════════════════════════
    // UI RENDERING
    // ═══════════════════════════════════════════
    function _renderMainLayout(me) {
        const container = document.getElementById('cr-main-container');
        if (!container) return;

        container.style.height = 'calc(100vh - 180px)';
        container.style.minHeight = '550px';

        const allParticipants = _getAllChatParticipants();
        const checklist = document.getElementById('cr-agent-checklist');
        if (checklist) {
            const adminsList = allParticipants.filter(p => p.type === 'admin');
            const agentsList = allParticipants.filter(p => p.type === 'agent');
            
            let checklistHtml = '<div style="margin-bottom:8px;font-size:10px;font-weight:900;color:#10b981;">👑 Admins</div>';
            adminsList.forEach(admin => {
                checklistHtml += `
                    <label class="cr-agent-check-row" style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:8px;cursor:pointer;">
                        <input type="checkbox" value="${admin.id}" data-name="${admin.name}" ${admin.id === me.id ? 'checked disabled' : ''}>
                        <span class="cr-agent-check-name">👑 ${_escHtml(admin.name)} (Admin)</span>
                    </label>
                `;
            });
            
            checklistHtml += '<div style="margin:12px 0 8px;font-size:10px;font-weight:900;color:#10b981;">👤 Agents</div>';
            agentsList.forEach(agent => {
                checklistHtml += `
                    <label class="cr-agent-check-row" style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:8px;cursor:pointer;">
                        <input type="checkbox" value="${agent.id}" data-name="${agent.name}">
                        <span class="cr-agent-check-name">👤 ${_escHtml(agent.name)} (${agent.team || 'Agent'})</span>
                    </label>
                `;
            });
            
            checklist.innerHTML = checklistHtml;
        }

        container.innerHTML = `
            <div class="cr-container" id="cr-chat-container" style="height: 100%; display: flex; gap: 0;">
                <div class="cr-sidebar" id="cr-sidebar" style="width: 280px; min-width: 280px; border-right: 1px solid rgba(255,255,255,0.06); display: flex; flex-direction: column; height: 100%;">
                    <div class="cr-sidebar-header" style="padding: 16px; border-bottom: 1px solid rgba(255,255,255,0.06);">
                        <div class="cr-sidebar-title" style="font-family:Orbitron,sans-serif;font-size:10px;font-weight:900;color:#10b981;"><span class="lock-icon">🔒</span> Chat</div>
                        <button class="cr-create-room-btn" onclick="document.getElementById('cr-create-room-modal').classList.remove('hidden')" title="Create Group Chat">➕</button>
                    </div>
                    <div class="cr-sidebar-tabs" style="display:flex;gap:2px;padding:12px;">
                        <button class="cr-sidebar-tab active" id="cr-tab-general" onclick="window._crSwitchSidebarTab('general')" style="flex:1;padding:8px;border-radius:10px;font-size:10px;font-weight:900;background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.25);color:#10b981;">🌍 General</button>
                        <button class="cr-sidebar-tab" id="cr-tab-dms" onclick="window._crSwitchSidebarTab('dms')" style="flex:1;padding:8px;border-radius:10px;font-size:10px;font-weight:900;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);color:#64748b;">💬 Private</button>
                        <button class="cr-sidebar-tab" id="cr-tab-groups" onclick="window._crSwitchSidebarTab('groups')" style="flex:1;padding:8px;border-radius:10px;font-size:10px;font-weight:900;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);color:#64748b;">👥 Groups</button>
                    </div>
                    <div class="cr-search-wrap" style="padding:0 12px 12px;position:relative;">
                        <span class="cr-search-icon" style="position:absolute;left:22px;top:50%;transform:translateY(-50%);font-size:11px;color:#334155;">🔍</span>
                        <input type="text" class="cr-search-input" placeholder="Search channels..." oninput="window._crSearch(this.value)" style="width:100%;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:8px 12px 8px 32px;color:#e2e8f0;font-size:12px;" />
                    </div>
                    <div class="cr-channel-list" id="cr-channel-list" style="flex: 1; overflow-y: auto; padding: 8px;"></div>
                </div>
                <div class="cr-chat-panel" id="cr-chat-panel" style="flex: 1; display: flex; flex-direction: column; height: 100%;"></div>
            </div>`;

        window._crSelectGeneralChat();
    }

    function _renderChannelList() {
        const listEl = document.getElementById('cr-channel-list');
        if (!listEl) return;

        const generalUnreadBadge = _generalChatUnread > 0 ? `<div class="cr-unread-badge" style="background:#10b981;color:white;border-radius:10px;min-width:18px;height:18px;font-size:9px;display:flex;align-items:center;justify-content:center;padding:0 4px;">${_generalChatUnread}</div>` : '';
        
        let html = `
            <div class="cr-channel-item ${_crCurrentChannelType === 'general' ? 'active' : ''}" onclick="window._crSelectGeneralChat()" style="display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:12px;cursor:pointer;margin-bottom:2px;${_crCurrentChannelType === 'general' ? 'background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.2);' : 'background:transparent;'}">
                <div class="cr-channel-avatar" style="width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,rgba(16,185,129,0.15),rgba(56,189,248,0.15));font-size:18px;">🌍</div>
                <div class="cr-channel-info" style="flex:1;">
                    <div class="cr-channel-name" style="font-size:13px;font-weight:800;color:white;">General Chat</div>
                    <div class="cr-channel-preview" style="font-size:10px;color:#475569;">Everyone in the room</div>
                </div>
                <div class="cr-channel-meta">${generalUnreadBadge}</div>
            </div>`;

        let channelsToShow = [];
        
        if (_crSidebarTab === 'dms') {
            channelsToShow = Object.values(_crChannels).filter(ch => ch.type === 'dm');
        } else if (_crSidebarTab === 'groups') {
            channelsToShow = Object.values(_crChannels).filter(ch => ch.type === 'group');
        } else {
            channelsToShow = [];
        }

        const filtered = channelsToShow.filter(ch => {
            if (!_crSearchQuery) return true;
            const name = ch.type === 'group' ? (ch.roomName || '') : (ch.agentName || '');
            return name.toLowerCase().includes(_crSearchQuery);
        }).sort((a, b) => (b.lastMsgTime || 0) - (a.lastMsgTime || 0));

        filtered.forEach(ch => {
            const isActive = _crCurrentChannel === ch.channelId && _crCurrentChannelType === ch.type;
            const name = ch.type === 'group' ? (ch.roomName || 'Group Chat') : (ch.agentName || 'User');
            const avatarContent = ch.type === 'group' ? '👥' : _getInitials(name);
            const preview = ch.lastMsg ? _truncate(ch.lastMsg.text, 30) : 'No messages';
            const timeStr = ch.lastMsgTime ? _formatMessageTime(ch.lastMsgTime) : '';
            const unreadBadge = ch.unread > 0 ? `<div class="cr-unread-badge" style="background:#10b981;color:white;border-radius:10px;min-width:18px;height:18px;font-size:9px;display:flex;align-items:center;justify-content:center;padding:0 4px;">${ch.unread}</div>` : '';
            
            let onlineIndicator = '';
            if (ch.type === 'dm' && _crOnlineUsers.has(ch.agentId)) {
                onlineIndicator = '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#22c55e;margin-left:6px;box-shadow:0 0 4px #22c55e;"></span>';
            }

            const onClick = ch.type === 'dm' 
                ? `window._crSelectPrivateChat('${ch.channelId}')` 
                : `window._crSelectGroupChat('${ch.channelId}')`;

            html += `
                <div class="cr-channel-item ${isActive ? 'active' : ''}" onclick="${onClick}" style="display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:12px;cursor:pointer;margin-bottom:2px;${isActive ? 'background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.2);' : 'background:transparent;'}">
                    <div class="cr-channel-avatar" style="width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,0.05);font-size:16px;font-weight:900;color:#10b981;">${avatarContent}</div>
                    <div class="cr-channel-info" style="flex:1;">
                        <div class="cr-channel-name" style="font-size:13px;font-weight:800;color:white;">${_escHtml(name)}${onlineIndicator}</div>
                        <div class="cr-channel-preview" style="font-size:10px;color:#475569;">${_escHtml(preview)}</div>
                    </div>
                    <div class="cr-channel-meta" style="text-align:right;">
                        <span class="cr-channel-time" style="font-size:9px;color:#334155;">${timeStr}</span>
                        ${unreadBadge}
                    </div>
                </div>`;
        });

        listEl.innerHTML = html;
    }

    window._crSwitchSidebarTab = function(tab) {
        _crSidebarTab = tab;
        document.querySelectorAll('.cr-sidebar-tab').forEach(t => t.classList.remove('active'));
        const activeTab = document.getElementById('cr-tab-' + tab);
        if (activeTab) activeTab.classList.add('active');
        _renderChannelList();
    };

    window._crSelectGeneralChat = function() {
        const me = _getMyIdentity();
        _crCurrentChannelType = 'general';
        _crCurrentChannel = null;
        
        _generalChatUnread = 0;
        _updateFloatBubbleBadge();
        _updateTabBadge();
        
        const savedDraft = _loadDraft(GENERAL_CHAT_PATH);

        const panel = document.getElementById('cr-chat-panel');
        if (!panel) return;

        panel.innerHTML = `
            <div class="cr-chat-header" style="display:flex;align-items:center;gap:14px;padding:16px 20px;border-bottom:1px solid rgba(255,255,255,0.06);flex-shrink:0;">
                <button class="cr-back-btn" onclick="window._crBackToSidebar()" style="display:none;background:rgba(255,255,255,0.05);border:none;border-radius:10px;color:#94a3b8;width:34px;height:34px;align-items:center;justify-content:center;cursor:pointer;">←</button>
                <div class="cr-channel-avatar" style="width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,rgba(16,185,129,0.15),rgba(56,189,248,0.15));font-size:22px;">🌍</div>
                <div class="cr-chat-header-info" style="flex:1;">
                    <div class="cr-chat-header-name" style="font-size:14px;font-weight:900;color:white;">General Chat</div>
                    <div class="cr-chat-header-status" style="font-size:10px;color:#64748b;margin-top:2px;">
                        <span class="cr-e2e-badge" style="display:inline-flex;align-items:center;gap:4px;background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.25);border-radius:6px;padding:2px 8px;font-size:8px;color:#10b981;">🔐 E2E Encrypted</span>
                        <span style="margin-left:8px;" id="cr-online-status">Everyone in the room</span>
                    </div>
                </div>
                <div class="cr-chat-actions" style="display:flex;gap:4px;">
                    <button class="cr-search-btn" onclick="window._crToggleSearch()" style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:6px 10px;color:#94a3b8;cursor:pointer;font-size:12px;">🔍</button>
                </div>
            </div>
            <div id="cr-pinned-messages" style="border-bottom:1px solid rgba(255,255,255,0.06);"></div>
            <div id="cr-search-panel" style="display:none;padding:8px 12px;background:rgba(0,0,0,0.3);border-bottom:1px solid rgba(255,255,255,0.06);">
                <div style="display:flex;gap:8px;align-items:center;">
                    <input type="text" id="cr-search-input" placeholder="Search messages..." style="flex:1;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:6px 10px;color:white;font-size:12px;">
                    <button onclick="window._crSearchMessages()" style="background:#10b981;border:none;border-radius:8px;padding:6px 12px;color:white;cursor:pointer;">🔍</button>
                    <span id="cr-search-info" style="font-size:10px;color:#64748b;"></span>
                    <button onclick="window._crCloseSearch()" style="background:transparent;border:none;color:#94a3b8;cursor:pointer;">✕</button>
                </div>
                <div style="display:flex;gap:4px;margin-top:6px;justify-content:center;">
                    <button onclick="window._crPrevSearchResult()" style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:6px;padding:2px 8px;font-size:10px;">← Previous</button>
                    <button onclick="window._crNextSearchResult()" style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:6px;padding:2px 8px;font-size:10px;">Next →</button>
                </div>
            </div>
            <div style="display:flex;gap:8px;padding:10px 16px;background:rgba(0,0,0,0.2);border-bottom:1px solid rgba(255,255,255,0.06);flex-wrap:wrap;flex-shrink:0;align-items:center;">
                <button onclick="window._crSendQuickActionToGeneral('come_quick')" style="background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.4);border-radius:20px;padding:6px 14px;color:#f87171;font-size:11px;font-weight:700;cursor:pointer;">🚨 Come Quick</button>
                <button onclick="window._crSendQuickActionToGeneral('help')" style="background:rgba(245,158,11,0.15);border:1px solid rgba(245,158,11,0.4);border-radius:20px;padding:6px 14px;color:#fbbf24;font-size:11px;font-weight:700;cursor:pointer;">🆘 Help</button>
                <button onclick="window._crMentionUser()" style="background:rgba(139,92,246,0.15);border:1px solid rgba(139,92,246,0.4);border-radius:20px;padding:6px 14px;color:#a78bfa;font-size:11px;font-weight:700;cursor:pointer;">@ Mention</button>
                ${(function(){ const a=JSON.parse(sessionStorage.getItem('currentAdmin')||'{}'); return (a.role==='super_admin'||a.isSuper)?'<button onclick="window._crClearGeneralChat()" style="margin-left:auto;background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.3);border-radius:20px;padding:6px 14px;color:#ef4444;font-size:10px;font-weight:800;cursor:pointer;letter-spacing:0.05em;text-transform:uppercase;">🗑 Clear Chat</button>':'';}())}
            </div>
            <div class="cr-messages" id="cr-messages-area" style="flex: 1; overflow-y: auto; padding: 16px 20px;"></div>
            <div class="cr-typing-indicator hidden" id="cr-typing-indicator" style="padding:8px 16px;flex-shrink:0;"><div class="cr-typing-dots" style="display:flex;gap:3px;"><div class="cr-typing-dot" style="width:5px;height:5px;border-radius:50%;background:#475569;"></div><div class="cr-typing-dot" style="width:5px;height:5px;border-radius:50%;background:#475569;"></div><div class="cr-typing-dot" style="width:5px;height:5px;border-radius:50%;background:#475569;"></div></div><span class="cr-typing-text" style="font-size:10px;color:#475569;margin-left:8px;">typing...</span></div>
            <div class="cr-input-bar" style="padding:12px 16px;border-top:1px solid rgba(255,255,255,0.06);display:flex;gap:10px;flex-shrink:0;">
                <div class="cr-input-wrap" style="flex:1;position:relative;">
                    <textarea class="cr-msg-input" id="cr-msg-input" placeholder="Type a message to everyone... (use @ to mention)" rows="1" style="width:100%;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:14px;color:#e2e8f0;font-size:13px;padding:12px 16px;resize:none;line-height:1.4;padding-right:50px;" onkeydown="window._crHandleGeneralKeydown(event)" oninput="window._crHandleGeneralTyping(event)">${_escHtml(savedDraft)}</textarea>
                    <button class="cr-emoji-btn" onclick="window._crToggleEmojiPicker(event, 'general')" style="position:absolute;right:8px;bottom:8px;width:32px;height:32px;border-radius:10px;background:rgba(255,255,255,0.05);border:none;cursor:pointer;font-size:18px;">😊</button>
                    <div id="cr-emoji-picker-general" class="cr-emoji-picker"></div>
                </div>
                <button id="cr-file-btn" onclick="document.getElementById('cr-file-input').click()" style="width:44px;height:44px;border-radius:14px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);color:#94a3b8;cursor:pointer;">📎</button>
                <button id="cr-voice-btn" onclick="window._crToggleVoiceRecording()" style="width:44px;height:44px;border-radius:14px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);color:#94a3b8;cursor:pointer;">🎙️</button>
                <button class="cr-send-btn" onclick="window._crSendGeneralMessage()" style="width:44px;height:44px;border-radius:14px;background:linear-gradient(135deg,#10b981,#059669);border:none;color:white;cursor:pointer;display:flex;align-items:center;justify-content:center;">➤</button>
            </div>
            <input type="file" id="cr-file-input" style="display:none" multiple onchange="window._crHandleFileSelect(this)">`;

        _renderGeneralChatMessages(me);
        _listenForTyping(GENERAL_CHAT_PATH);
        _listenForPins(GENERAL_CHAT_PATH);
        
        const textarea = document.getElementById('cr-msg-input');
        if (textarea) {
            textarea.addEventListener('input', () => {
                _saveDraft(GENERAL_CHAT_PATH, textarea.value);
            });
        }
        
        if (window.innerWidth <= 700) {
            const sidebar = document.getElementById('cr-sidebar');
            const chatPanel = document.getElementById('cr-chat-panel');
            if (sidebar) sidebar.classList.add('sidebar-hidden');
            if (chatPanel) chatPanel.classList.remove('panel-hidden');
            const backBtn = document.querySelector('#cr-chat-panel .cr-back-btn');
            if (backBtn) backBtn.style.display = 'flex';
        }
    };

    window._crSelectPrivateChat = function(channelId) {
        const me = _getMyIdentity();
        _crCurrentChannel = channelId;
        _crCurrentChannelType = 'dm';
        
        const ch = _crChannels[channelId];
        const title = ch ? ch.agentName : 'Chat';
        
        if (ch) ch.unread = 0;
        _updateFloatBubbleBadge();
        _updateTabBadge();
        
        const savedDraft = _loadDraft(channelId);

        const panel = document.getElementById('cr-chat-panel');
        if (!panel) return;

        panel.innerHTML = `
            <div class="cr-chat-header" style="display:flex;align-items:center;gap:14px;padding:16px 20px;border-bottom:1px solid rgba(255,255,255,0.06);flex-shrink:0;">
                <button class="cr-back-btn" onclick="window._crBackToSidebar()" style="display:none;background:rgba(255,255,255,0.05);border:none;border-radius:10px;color:#94a3b8;width:34px;height:34px;align-items:center;justify-content:center;cursor:pointer;">←</button>
                <div class="cr-channel-avatar" style="width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,0.05);font-size:18px;font-weight:900;color:#10b981;">${_getInitials(title)}</div>
                <div class="cr-chat-header-info" style="flex:1;">
                    <div class="cr-chat-header-name" style="font-size:14px;font-weight:900;color:white;">${_escHtml(title)}</div>
                    <div class="cr-chat-header-status" style="font-size:10px;color:#64748b;margin-top:2px;">
                        <span class="cr-e2e-badge" style="display:inline-flex;align-items:center;gap:4px;background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.25);border-radius:6px;padding:2px 8px;font-size:8px;color:#10b981;">🔐 E2E Encrypted</span>
                        <span style="margin-left:8px;" id="cr-online-status">Private conversation</span>
                    </div>
                </div>
                <div class="cr-chat-actions" style="display:flex;gap:4px;">
                    <button class="cr-search-btn" onclick="window._crToggleSearch()" style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:6px 10px;color:#94a3b8;cursor:pointer;font-size:12px;">🔍</button>
                    <button class="cr-clear-chat-btn" onclick="window._crClearPrivateChat('${channelId}')" style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:8px;color:#ef4444;padding:6px 12px;font-size:10px;font-weight:900;cursor:pointer;">🗑️ Clear</button>
                </div>
            </div>
            <div id="cr-pinned-messages" style="border-bottom:1px solid rgba(255,255,255,0.06);"></div>
            <div id="cr-search-panel" style="display:none;padding:8px 12px;background:rgba(0,0,0,0.3);border-bottom:1px solid rgba(255,255,255,0.06);">
                <div style="display:flex;gap:8px;align-items:center;">
                    <input type="text" id="cr-search-input" placeholder="Search messages..." style="flex:1;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:6px 10px;color:white;font-size:12px;">
                    <button onclick="window._crSearchMessages()" style="background:#10b981;border:none;border-radius:8px;padding:6px 12px;color:white;cursor:pointer;">🔍</button>
                    <span id="cr-search-info" style="font-size:10px;color:#64748b;"></span>
                    <button onclick="window._crCloseSearch()" style="background:transparent;border:none;color:#94a3b8;cursor:pointer;">✕</button>
                </div>
                <div style="display:flex;gap:4px;margin-top:6px;justify-content:center;">
                    <button onclick="window._crPrevSearchResult()" style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:6px;padding:2px 8px;font-size:10px;">← Previous</button>
                    <button onclick="window._crNextSearchResult()" style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:6px;padding:2px 8px;font-size:10px;">Next →</button>
                </div>
            </div>
            <div style="display:flex;gap:8px;padding:10px 16px;background:rgba(0,0,0,0.2);border-bottom:1px solid rgba(255,255,255,0.06);flex-wrap:wrap;flex-shrink:0;">
                <button onclick="window._crSendQuickActionToPrivate('come_quick', '${channelId}')" style="background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.4);border-radius:20px;padding:6px 14px;color:#f87171;font-size:11px;font-weight:700;cursor:pointer;">🚨 Come Quick</button>
                <button onclick="window._crSendQuickActionToPrivate('help', '${channelId}')" style="background:rgba(245,158,11,0.15);border:1px solid rgba(245,158,11,0.4);border-radius:20px;padding:6px 14px;color:#fbbf24;font-size:11px;font-weight:700;cursor:pointer;">🆘 Help</button>
                <button onclick="window._crMentionUser()" style="background:rgba(139,92,246,0.15);border:1px solid rgba(139,92,246,0.4);border-radius:20px;padding:6px 14px;color:#a78bfa;font-size:11px;font-weight:700;cursor:pointer;">@ Mention</button>
            </div>
            <div class="cr-messages" id="cr-messages-area" style="flex: 1; overflow-y: auto; padding: 16px 20px;"></div>
            <div class="cr-typing-indicator hidden" id="cr-typing-indicator" style="padding:8px 16px;flex-shrink:0;"><div class="cr-typing-dots" style="display:flex;gap:3px;"><div class="cr-typing-dot" style="width:5px;height:5px;border-radius:50%;background:#475569;"></div><div class="cr-typing-dot" style="width:5px;height:5px;border-radius:50%;background:#475569;"></div><div class="cr-typing-dot" style="width:5px;height:5px;border-radius:50%;background:#475569;"></div></div><span class="cr-typing-text" style="font-size:10px;color:#475569;margin-left:8px;">typing...</span></div>
            <div class="cr-input-bar" style="padding:12px 16px;border-top:1px solid rgba(255,255,255,0.06);display:flex;gap:10px;flex-shrink:0;">
                <div class="cr-input-wrap" style="flex:1;position:relative;">
                    <textarea class="cr-msg-input" id="cr-msg-input" placeholder="Type a private message... (use @ to mention)" rows="1" style="width:100%;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:14px;color:#e2e8f0;font-size:13px;padding:12px 16px;resize:none;line-height:1.4;padding-right:50px;" onkeydown="window._crHandlePrivateKeydown(event, '${channelId}')" oninput="window._crHandlePrivateTyping(event, '${channelId}')">${_escHtml(savedDraft)}</textarea>
                    <button class="cr-emoji-btn" onclick="window._crToggleEmojiPicker(event, 'private_${channelId}')" style="position:absolute;right:8px;bottom:8px;width:32px;height:32px;border-radius:10px;background:rgba(255,255,255,0.05);border:none;cursor:pointer;font-size:18px;">😊</button>
                    <div id="cr-emoji-picker-private_${channelId}" class="cr-emoji-picker"></div>
                </div>
                <button class="cr-send-btn" onclick="window._crSendPrivateMessage('${channelId}')" style="width:44px;height:44px;border-radius:14px;background:linear-gradient(135deg,#10b981,#059669);border:none;color:white;cursor:pointer;display:flex;align-items:center;justify-content:center;">➤</button>
            </div>`;

        _renderPrivateChatMessages(channelId, me);
        _markPrivateChannelRead(channelId, me);
        _listenForTyping(channelId);
        _listenForPins(channelId);
        _updateOnlineStatusUI();
        
        const textarea = document.getElementById('cr-msg-input');
        if (textarea) {
            textarea.addEventListener('input', () => {
                _saveDraft(channelId, textarea.value);
            });
        }

        if (window.innerWidth <= 700) {
            const sidebar = document.getElementById('cr-sidebar');
            const chatPanel = document.getElementById('cr-chat-panel');
            if (sidebar) sidebar.classList.add('sidebar-hidden');
            if (chatPanel) chatPanel.classList.remove('panel-hidden');
            const backBtn = document.querySelector('#cr-chat-panel .cr-back-btn');
            if (backBtn) backBtn.style.display = 'flex';
        }
    };

    window._crBackToSidebar = function() {
        const sidebar = document.getElementById('cr-sidebar');
        const chatPanel = document.getElementById('cr-chat-panel');
        if (sidebar) sidebar.classList.remove('sidebar-hidden');
        if (chatPanel) chatPanel.classList.add('panel-hidden');
    };

    window._crSearch = function(query) {
        _crSearchQuery = query.toLowerCase().trim();
        _renderChannelList();
    };

    window._crFloatSearch = function(query) {
        _crFloatSearchQuery = query.toLowerCase().trim();
        _renderFloatChannelList();
    };

    window._crCloseModal = function() {
        const modal = document.getElementById('cr-create-room-modal');
        if (modal) modal.classList.add('hidden');
    };

    // ═══════════════════════════════════════════
    // SEND MESSAGES & QUICK ACTIONS
    // ═══════════════════════════════════════════
    window._crSendGeneralMessage = async function() {
        const input = document.getElementById('cr-msg-input');
        if (!input) return;
        const text = input.value.trim();
        if (!text) return;
        const me = _getMyIdentity();
        const success = await _sendToGeneralChat(text, me, false);
        if (success) {
            input.value = '';
            _saveDraft(GENERAL_CHAT_PATH, '');
            input.style.height = 'auto';
            _sendTypingIndicator(GENERAL_CHAT_PATH, false);
        }
    };

    window._crSendPrivateMessage = async function(channelId) {
        const input = document.getElementById('cr-msg-input');
        if (!input) return;
        const text = input.value.trim();
        if (!text || !channelId) return;
        const me = _getMyIdentity();
        const success = await _sendToPrivateChannel(channelId, text, me, false);
        if (success) {
            input.value = '';
            _saveDraft(channelId, '');
            input.style.height = 'auto';
            _sendTypingIndicator(channelId, false);
        }
    };

    window._crSendQuickActionToGeneral = async function(actionKey) {
        const action = QUICK_ACTIONS[actionKey];
        if (!action) return;
        const me = _getMyIdentity();
        await _sendToGeneralChat(action.message, me, true);
    };

    window._crSendQuickActionToPrivate = async function(actionKey, channelId) {
        const action = QUICK_ACTIONS[actionKey];
        if (!action || !channelId) return;
        const me = _getMyIdentity();
        await _sendToPrivateChannel(channelId, action.message, me, true);
    };

    window._crHandleGeneralKeydown = function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            window._crSendGeneralMessage();
        }
    };

    window._crHandlePrivateKeydown = function(e, channelId) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            window._crSendPrivateMessage(channelId);
        }
    };

    window._crHandleGeneralTyping = function(e) {
        const input = document.getElementById('cr-msg-input');
        if (input) {
            input.style.height = 'auto';
            input.style.height = Math.min(input.scrollHeight, 80) + 'px';
        }
        
        if (_crTypingTimers[GENERAL_CHAT_PATH]) clearTimeout(_crTypingTimers[GENERAL_CHAT_PATH]);
        _sendTypingIndicator(GENERAL_CHAT_PATH, true);
        _crTypingTimers[GENERAL_CHAT_PATH] = setTimeout(() => {
            _sendTypingIndicator(GENERAL_CHAT_PATH, false);
        }, 1500);
    };

    window._crHandlePrivateTyping = function(e, channelId) {
        const input = document.getElementById('cr-msg-input');
        if (input) {
            input.style.height = 'auto';
            input.style.height = Math.min(input.scrollHeight, 80) + 'px';
        }
        
        if (_crTypingTimers[channelId]) clearTimeout(_crTypingTimers[channelId]);
        _sendTypingIndicator(channelId, true);
        _crTypingTimers[channelId] = setTimeout(() => {
            _sendTypingIndicator(channelId, false);
        }, 1500);
    };

    window._crClearPrivateChat = async function(channelId) {
        if (!confirm('Clear this chat?')) return;
        if (!_fbFunctions || !channelId) return;
        try {
            await _fbFunctions.remove(_ref(CHAT_DB_PATH + '/' + channelId));
            if (_crChannels[channelId]) {
                _crChannels[channelId].messages = [];
                _crChannels[channelId].unread = 0;
            }
            const me = _getMyIdentity();
            if (_crCurrentChannelType === 'dm') _renderPrivateChatMessages(channelId, me);
            else if (_crCurrentChannelType === 'group') _renderGroupChatMessages(channelId, me);
        } catch(e) {}
    };

    window._crClearGeneralChat = async function() {
        const cAdmin = JSON.parse(sessionStorage.getItem('currentAdmin') || '{}');
        if (!cAdmin || (cAdmin.role !== 'super_admin' && !cAdmin.isSuper)) {
            alert('Only Rose (Super Admin) can clear the general chat.');
            return;
        }
        if (!confirm('Clear ALL messages in General Chat? This cannot be undone.')) return;
        if (!_fbFunctions) return;
        try {
            await _fbFunctions.remove(_ref(GENERAL_CHAT_PATH));
            _generalChatMessages = [];
            const me = _getMyIdentity();
            _renderGeneralChatMessages(me);
        } catch(e) {
            alert('Failed to clear chat: ' + e.message);
        }
    };

    // ═══════════════════════════════════════════
    // UTILITIES
    // ═══════════════════════════════════════════
    function _escHtml(str) {
        if (!str) return '';
        return String(str).replace(/[&<>]/g, function(m) {
            if (m === '&') return '&amp;';
            if (m === '<') return '&lt;';
            if (m === '>') return '&gt;';
            return m;
        });
    }

    function _getInitials(name) {
        if (!name) return '?';
        const parts = name.trim().split(/\s+/);
        if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
        return name.substring(0, 2).toUpperCase();
    }

    function _truncate(str, len) {
        if (!str) return '';
        return str.length > len ? str.substring(0, len) + '…' : str;
    }

    // ═══════════════════════════════════════════
    // EMOJI PICKER FUNCTIONS
    // ═══════════════════════════════════════════
    function _buildEmojiPickerWithClose(pickerId) {
        var html = '<div class="cr-emoji-picker-header" style="display:flex;align-items:center;justify-content:space-between;grid-column:span 8;">';
        html += '<span>Emojis</span>';
        html += '<button class="cr-emoji-close-btn" style="background:transparent;border:none;color:#94a3b8;cursor:pointer;font-size:16px;padding:0 4px;line-height:1;">x</button>';
        html += '</div>';
        COMMON_EMOJIS.forEach(function(emoji) {
            html += '<div class="cr-emoji-option" data-emoji="' + emoji + '">' + emoji + '</div>';
        });
        return html;
    }

    function _buildEmojiPicker() {
        let html = '<div class="cr-emoji-picker-header">😊 Common Emojis</div>';
        COMMON_EMOJIS.forEach(emoji => {
            html += `<div class="cr-emoji-option" data-emoji="${emoji}">${emoji}</div>`;
        });
        return html;
    }

    var _emojiCloseHandlers = {};

    window._crToggleEmojiPicker = function(event, pickerId) {
        event.stopPropagation();
        const picker = document.getElementById(`cr-emoji-picker-${pickerId}`);
        if (!picker) return;
        
        document.querySelectorAll('.cr-emoji-picker').forEach(p => {
            if (p.id !== `cr-emoji-picker-${pickerId}`) {
                p.classList.remove('show');
            }
        });
        
        var isNowOpen = !picker.classList.contains('show');
        picker.classList.toggle('show');

        if (picker.innerHTML === '') {
            picker.innerHTML = _buildEmojiPickerWithClose(pickerId);
            picker.querySelectorAll('.cr-emoji-option').forEach(function(opt) {
                opt.addEventListener('click', function(e) {
                    e.stopPropagation();
                    var emoji = opt.getAttribute('data-emoji');
                    var input = document.getElementById('cr-msg-input');
                    if (input) {
                        var start = input.selectionStart;
                        var end = input.selectionEnd;
                        var text = input.value;
                        input.value = text.substring(0, start) + emoji + text.substring(end);
                        input.focus();
                        input.selectionStart = input.selectionEnd = start + emoji.length;
                        input.dispatchEvent(new Event('input'));
                    }
                    picker.classList.remove('show');
                    if (_emojiCloseHandlers[pickerId]) {
                        document.removeEventListener('click', _emojiCloseHandlers[pickerId]);
                        delete _emojiCloseHandlers[pickerId];
                    }
                });
            });
            var closeBtn = picker.querySelector('.cr-emoji-close-btn');
            if (closeBtn) {
                closeBtn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    picker.classList.remove('show');
                    if (_emojiCloseHandlers[pickerId]) {
                        document.removeEventListener('click', _emojiCloseHandlers[pickerId]);
                        delete _emojiCloseHandlers[pickerId];
                    }
                });
            }
        }

        if (_emojiCloseHandlers[pickerId]) {
            document.removeEventListener('click', _emojiCloseHandlers[pickerId]);
            delete _emojiCloseHandlers[pickerId];
        }
        if (isNowOpen) {
            var closePicker = function(e) {
                if (!picker.contains(e.target) && !e.target.closest('.cr-emoji-btn')) {
                    picker.classList.remove('show');
                    document.removeEventListener('click', _emojiCloseHandlers[pickerId]);
                    delete _emojiCloseHandlers[pickerId];
                }
            };
            _emojiCloseHandlers[pickerId] = closePicker;
            setTimeout(function() { document.addEventListener('click', closePicker); }, 100);
        }
    };

    window._crToggleFloatEmojiPicker = function(event) {
        event.stopPropagation();
        var picker = document.getElementById('cr-float-emoji-picker');
        if (!picker) return;

        var isNowOpen = !picker.classList.contains('show');
        picker.classList.toggle('show');

        if (picker.innerHTML === '') {
            picker.innerHTML = _buildEmojiPickerWithClose('float');
            picker.querySelectorAll('.cr-emoji-option').forEach(function(opt) {
                opt.addEventListener('click', function(e) {
                    e.stopPropagation();
                    var emoji = opt.getAttribute('data-emoji');
                    var input = document.getElementById('cr-float-input');
                    if (input) {
                        var start = input.selectionStart;
                        var end = input.selectionEnd;
                        var text = input.value;
                        input.value = text.substring(0, start) + emoji + text.substring(end);
                        input.focus();
                        input.selectionStart = input.selectionEnd = start + emoji.length;
                        input.dispatchEvent(new Event('input'));
                    }
                    picker.classList.remove('show');
                    if (_emojiCloseHandlers['float']) {
                        document.removeEventListener('click', _emojiCloseHandlers['float']);
                        delete _emojiCloseHandlers['float'];
                    }
                });
            });
            var closeBtn = picker.querySelector('.cr-emoji-close-btn');
            if (closeBtn) {
                closeBtn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    picker.classList.remove('show');
                    if (_emojiCloseHandlers['float']) {
                        document.removeEventListener('click', _emojiCloseHandlers['float']);
                        delete _emojiCloseHandlers['float'];
                    }
                });
            }
        }

        if (_emojiCloseHandlers['float']) {
            document.removeEventListener('click', _emojiCloseHandlers['float']);
            delete _emojiCloseHandlers['float'];
        }
        if (isNowOpen) {
            var closePicker = function(e) {
                if (!picker.contains(e.target) && !e.target.closest('.cr-emoji-btn')) {
                    picker.classList.remove('show');
                    document.removeEventListener('click', _emojiCloseHandlers['float']);
                    delete _emojiCloseHandlers['float'];
                }
            };
            _emojiCloseHandlers['float'] = closePicker;
            setTimeout(function() { document.addEventListener('click', closePicker); }, 100);
        }
    };

    // ═══════════════════════════════════════════
    // FLOATING WIDGET - FIXED with instant updates and header
    // ═══════════════════════════════════════════
    window._crFloatActiveChannel = null;
    let _crFloatDrag = { active: false, currentX: 0, currentY: 0, initialX: 0, initialY: 0, xOffset: 0, yOffset: 0, isDraggingClick: false };
    let _floatWidgetInitialized = false;

    function _initFloatingWidget() {
        if (_floatWidgetInitialized) return;
        if (document.getElementById('cr-floating-bubble')) return;

        const bubble = document.createElement('div');
        bubble.id = 'cr-floating-bubble';
        bubble.className = 'cr-floating-bubble';
        bubble.style.cssText = 'position:fixed;bottom:20px;right:20px;width:56px;height:56px;border-radius:50%;background:linear-gradient(135deg,#10b981,#059669);box-shadow:0 4px 20px rgba(16,185,129,0.4);display:flex;align-items:center;justify-content:center;font-size:28px;color:white;cursor:pointer;z-index:99999;transition:transform 0.2s;user-select:none;';
        bubble.innerHTML = `💬<div id="cr-bubble-badge" style="position:absolute;top:-5px;right:-5px;background:#ef4444;color:white;font-size:11px;font-weight:900;min-width:20px;height:20px;border-radius:10px;display:flex;align-items:center;justify-content:center;border:2px solid rgba(15,15,30,0.95);display:none;"></div>`;
        document.body.appendChild(bubble);

        bubble.addEventListener('mouseenter', () => { bubble.style.transform = 'scale(1.1)'; });
        bubble.addEventListener('mouseleave', () => { bubble.style.transform = 'scale(1)'; });
        bubble.addEventListener('click', () => { window._crToggleFloat(); });

        let isDragging = false;
        let startX, startY, startLeft, startTop;
        
        bubble.addEventListener('mousedown', (e) => {
            if (e.target === bubble || bubble.contains(e.target)) {
                isDragging = true;
                startX = e.clientX;
                startY = e.clientY;
                const rect = bubble.getBoundingClientRect();
                startLeft = rect.left;
                startTop = rect.top;
                bubble.style.transition = 'none';
                e.preventDefault();
            }
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            let newLeft = startLeft + dx;
            let newTop = startTop + dy;
            newLeft = Math.max(0, Math.min(window.innerWidth - bubble.offsetWidth, newLeft));
            newTop = Math.max(0, Math.min(window.innerHeight - bubble.offsetHeight, newTop));
            bubble.style.left = newLeft + 'px';
            bubble.style.top = newTop + 'px';
            bubble.style.right = 'auto';
            bubble.style.bottom = 'auto';
        });

        document.addEventListener('mouseup', () => {
            isDragging = false;
            bubble.style.transition = '';
        });

        const fw = document.createElement('div');
        fw.id = 'cr-floating-widget';
        fw.className = 'cr-floating-widget hidden';
        fw.style.cssText = 'position:fixed;bottom:90px;right:20px;width:320px;height:450px;background:rgba(15,15,30,0.98);border:1px solid rgba(16,185,129,0.3);border-radius:16px;box-shadow:0 10px 40px rgba(0,0,0,0.5);display:flex;flex-direction:column;z-index:99998;backdrop-filter:blur(12px);overflow:hidden;display:none;';
        fw.innerHTML = `
            <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:rgba(16,185,129,0.15);border-bottom:1px solid rgba(16,185,129,0.3);cursor:pointer;">
                <div style="font-family:Orbitron,sans-serif;font-size:11px;font-weight:900;color:#10b981;text-transform:uppercase;">💬 Chat</div>
                <button id="cr-float-close" style="background:transparent;border:none;color:#94a3b8;font-size:14px;cursor:pointer;">✕</button>
            </div>
            <div id="cr-float-quick-actions" style="display:flex;gap:6px;padding:8px;background:rgba(0,0,0,0.3);border-bottom:1px solid rgba(255,255,255,0.06);flex-wrap:wrap;">
                <button onclick="window._crFloatSendQuickAction('come_quick')" style="background:rgba(239,68,68,0.2);border:1px solid rgba(239,68,68,0.4);border-radius:16px;padding:4px 10px;color:#f87171;font-size:9px;font-weight:700;cursor:pointer;">🚨 Come Quick</button>
                <button onclick="window._crFloatSendQuickAction('help')" style="background:rgba(245,158,11,0.2);border:1px solid rgba(245,158,11,0.4);border-radius:16px;padding:4px 10px;color:#fbbf24;font-size:9px;font-weight:700;cursor:pointer;">🆘 Help</button>
            </div>
            <div id="cr-float-search-wrap" style="padding:6px 8px;border-bottom:1px solid rgba(255,255,255,0.06);">
                <input type="text" id="cr-float-search-input" placeholder="🔍 Search..." oninput="window._crFloatSearch(this.value)" style="width:100%;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:6px 10px;color:#e2e8f0;font-size:11px;box-sizing:border-box;" />
            </div>
            <div id="cr-float-list-view" style="flex:1;overflow-y:auto;padding:8px;"></div>
            <div id="cr-float-chat-view" style="flex:1;display:flex;flex-direction:column;min-height:0;display:none;">
                <div id="cr-float-chat-header" style="padding:8px 12px;background:rgba(16,185,129,0.1);border-bottom:1px solid rgba(16,185,129,0.2);font-size:11px;font-weight:900;color:#10b981;display:flex;align-items:center;gap:6px;">
                    <span>💬</span>
                    <span id="cr-float-chat-name">Chat</span>
                    <button onclick="window._crFloatShowList()" style="margin-left:auto;background:transparent;border:none;color:#64748b;cursor:pointer;font-size:12px;">← Back</button>
                </div>
                <div id="cr-float-body" style="flex:1;overflow-y:auto;padding:12px;"></div>
                <div style="padding:10px;border-top:1px solid rgba(255,255,255,0.06);display:flex;gap:6px;position:relative;">
                    <textarea id="cr-float-input" placeholder="Type a message..." rows="1" style="flex:1;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:10px;color:white;font-size:12px;padding:8px 10px;resize:none;"></textarea>
                    <button class="cr-emoji-btn" onclick="window._crToggleFloatEmojiPicker(event)" style="width:32px;height:36px;border-radius:10px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);cursor:pointer;font-size:16px;">😊</button>
                    <button id="cr-float-send" style="width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,#10b981,#059669);border:none;color:white;cursor:pointer;">➤</button>
                </div>
            </div>
            <div id="cr-float-emoji-picker" class="cr-emoji-picker" style="bottom:70px;right:0;left:auto;width:260px;"></div>`;
        document.body.appendChild(fw);

        document.getElementById('cr-float-close').addEventListener('click', () => window._crCloseFloat());
        document.getElementById('cr-float-send').addEventListener('click', () => window._crFloatSend());
        document.getElementById('cr-float-input').addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                window._crFloatSend();
            }
        });

        _floatWidgetInitialized = true;
        
        _isFirstLoad = true;
        setTimeout(() => {
            _isFirstLoad = false;
        }, 3000);
    }

    window._crFloatSendQuickAction = async function(actionKey) {
        const action = QUICK_ACTIONS[actionKey];
        if (!action) return;
        const me = _getMyIdentity();
        if (window._crFloatActiveChannel === 'general') {
            await _sendToGeneralChat(action.message, me, true);
        } else if (window._crFloatActiveChannel && window._crFloatActiveChannel.startsWith('dm_')) {
            await _sendToPrivateChannel(window._crFloatActiveChannel, action.message, me, true);
        } else if (window._crFloatActiveChannel && window._crFloatActiveChannel.startsWith('group_')) {
            await _sendToGroupChannel(window._crFloatActiveChannel, action.message, me, true);
        } else {
            await _sendToGeneralChat(action.message, me, true);
        }
    };

    function _updateFloatBubbleBadge() {
        const badge = document.getElementById('cr-bubble-badge');
        if (!badge) return;
        let totalUnread = _generalChatUnread;
        Object.values(_crChannels).forEach(ch => { totalUnread += (ch.unread || 0); });
        if (totalUnread > 0) {
            badge.textContent = totalUnread > 99 ? '99+' : totalUnread;
            badge.style.display = 'flex';
        } else {
            badge.style.display = 'none';
        }
    }

    function _renderFloatChannelList() {
        const listEl = document.getElementById('cr-float-list-view');
        if (!listEl) return;

        const q = _crFloatSearchQuery;
        const matchesGeneral = !q || 'general chat'.includes(q) || 'everyone'.includes(q);

        const generalUnreadBadge = _generalChatUnread > 0 ? `<div class="cr-unread-badge" style="margin-left:auto;background:#10b981;color:white;border-radius:10px;min-width:18px;height:18px;font-size:9px;display:flex;align-items:center;justify-content:center;padding:0 4px;">${_generalChatUnread}</div>` : '';

        let html = matchesGeneral ? `<div style="display:flex;align-items:center;gap:12px;padding:10px;border-radius:12px;cursor:pointer;margin-bottom:4px;" onclick="window._crOpenFloatChat('general')">
            <div style="width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,rgba(16,185,129,0.15),rgba(56,189,248,0.15));font-size:16px;">🌍</div>
            <div style="flex:1;"><div style="font-size:12px;font-weight:800;color:white;">General Chat</div><div style="font-size:9px;color:#475569;">Everyone in the room</div></div>
            ${generalUnreadBadge}
        </div>` : '';

        const channels = Object.values(_crChannels)
            .filter(ch => {
                if (ch.type === 'general') return false;
                const name = ch.type === 'group' ? (ch.roomName || '') : (ch.agentName || '');
                return !q || name.toLowerCase().includes(q);
            })
            .sort((a, b) => (b.lastMsgTime || 0) - (a.lastMsgTime || 0));

        channels.forEach(ch => {
            const name = ch.type === 'group' ? (ch.roomName || 'Group Chat') : (ch.agentName || 'User');
            const avatarContent = ch.type === 'group' ? '👥' : _getInitials(name);
            const preview = ch.lastMsg ? _truncate(ch.lastMsg.text, 25) : 'No messages';
            const timeStr = ch.lastMsgTime ? _formatMessageTime(ch.lastMsgTime) : '';
            const unreadBadge = ch.unread > 0 ? `<div class="cr-unread-badge" style="margin-left:auto;background:#10b981;color:white;border-radius:10px;min-width:18px;height:18px;font-size:9px;display:flex;align-items:center;justify-content:center;padding:0 4px;">${ch.unread}</div>` : '';
            
            let onlineIndicator = '';
            if (ch.type === 'dm' && _crOnlineUsers.has(ch.agentId)) {
                onlineIndicator = '<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#22c55e;margin-left:6px;"></span>';
            }

            html += `<div style="display:flex;align-items:center;gap:12px;padding:10px;border-radius:12px;cursor:pointer;margin-bottom:4px;" onclick="window._crOpenFloatChat('${ch.channelId}')">
                <div style="width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,0.05);font-size:14px;font-weight:900;color:#10b981;">${avatarContent}</div>
                <div style="flex:1;">
                    <div style="font-size:12px;font-weight:800;color:white;">${_escHtml(name)}${onlineIndicator}</div>
                    <div style="font-size:9px;color:#475569;">${_escHtml(preview)}</div>
                </div>
                <div style="text-align:right;"><span style="font-size:8px;color:#334155;">${timeStr}</span>${unreadBadge}</div>
            </div>`;
        });

        if (!html) html = `<div style="text-align:center;padding:30px 10px;color:#475569;font-size:11px;">No results for "${_escHtml(q)}"</div>`;

        listEl.innerHTML = html;
    }

    window._crFloatShowList = function() {
        const listView = document.getElementById('cr-float-list-view');
        const chatView = document.getElementById('cr-float-chat-view');
        const quickActions = document.getElementById('cr-float-quick-actions');
        const searchWrap = document.getElementById('cr-float-search-wrap');
        if (listView) listView.style.display = 'block';
        if (chatView) chatView.style.display = 'none';
        if (quickActions) quickActions.style.display = 'flex';
        if (searchWrap) searchWrap.style.display = 'block';
        window._crFloatActiveChannel = null;
        _renderFloatChannelList();
    };

    // FIXED: Open float chat with proper header and fast message display
    window._crOpenFloatChat = function(channelId) {
        if (window.currentTab === 'chatroom') return;
        window._crFloatActiveChannel = channelId;

        // Update the header name
        const chatNameSpan = document.getElementById('cr-float-chat-name');
        if (chatNameSpan) {
            if (channelId === 'general') {
                chatNameSpan.textContent = 'General Chat';
            } else if (channelId.startsWith('dm_')) {
                const ch = _crChannels[channelId];
                chatNameSpan.textContent = ch ? ch.agentName : 'Private Chat';
            } else if (channelId.startsWith('group_')) {
                const ch = _crChannels[channelId];
                chatNameSpan.textContent = ch ? ch.roomName : 'Group Chat';
            }
        }

        const listView = document.getElementById('cr-float-list-view');
        const chatView = document.getElementById('cr-float-chat-view');
        const quickActions = document.getElementById('cr-float-quick-actions');
        const searchWrap = document.getElementById('cr-float-search-wrap');
        if (listView) listView.style.display = 'none';
        if (chatView) chatView.style.display = 'flex';
        if (quickActions) quickActions.style.display = 'none';
        if (searchWrap) searchWrap.style.display = 'none';

        const me = _getMyIdentity();
        const body = document.getElementById('cr-float-body');
        
        if (channelId === 'general') {
            if (body) {
                if (_generalChatMessages.length === 0) {
                    body.innerHTML = `<div style="text-align:center;padding:40px 20px;color:#475569;">No messages yet</div>`;
                } else {
                    let html = '';
                    const sortedMessages = [..._generalChatMessages].sort((a, b) => a.timestamp - b.timestamp);
                    sortedMessages.slice(-30).forEach(msg => {
                        const isSent = msg.from === me.id;
                        const timeStr = _formatMessageTime(msg.timestamp);
                        const isQuickAction = msg.isQuickAction;
                        let senderName = msg.fromName;
                        let senderClass = 'color:#a855f7;';
                        let senderIcon = '';
                        if (msg.fromName === 'JAMAL') {
                            senderIcon = '👑 ';
                            senderClass = 'color:#fbbf24;';
                        } else if (msg.fromName === 'ROSE' || (msg.fromName || '').toUpperCase().includes('MASTER SUPER')) {
                            senderIcon = '🌹 ';
                            senderClass = 'color:#ec4899;';
                            senderName = 'ROSE';
                        } else if (msg.fromName === 'MOMO' || msg.fromName === 'MOHENIE') {
                            senderIcon = '🐱 ';
                            senderClass = 'color:#06b6d4;';
                            senderName = 'MOHENIE';
                        }
                        const ri = _getReactionInfo(msg.id, me.id);
                        const editedBadge = msg.edited ? '<span style="font-size:8px;color:#64748b;"> (edited)</span>' : '';
                        html += `<div style="display:flex;justify-content:${isSent ? 'flex-end' : 'flex-start'};margin-bottom:10px;"
                                     onmouseenter="var b=this.querySelector('.cr-tb');if(b)b.style.opacity='1'"
                                     onmouseleave="var b=this.querySelector('.cr-tb');if(b&&b.getAttribute('data-has')!=='1')b.style.opacity='0'">
                            <div style="max-width:80%;">
                                <div style="padding:8px 12px;border-radius:12px;${isQuickAction ? 'background:rgba(239,68,68,0.15);border-left:3px solid #ef4444;' : 'background:rgba(255,255,255,0.04);'}">
                                    ${!isSent ? `<div style="font-size:9px;${senderClass} font-weight:800;margin-bottom:2px;">${senderIcon}${_escHtml(senderName)}</div>` : ''}
                                    <div style="font-size:11px;color:white;${isQuickAction ? 'font-weight:800;color:#f87171;' : ''}">${_escHtml(msg.text)}${editedBadge}</div>
                                    <div style="display:flex;align-items:center;gap:4px;margin-top:4px;justify-content:flex-end;">
                                        <button class="cr-tb" data-has="${ri.count > 0 || ri.iReacted ? '1' : '0'}"
                                                onclick="window._crToggleThumbsUp('${msg.id}')"
                                                title="${_escHtml(ri.names)}"
                                                style="opacity:${ri.count > 0 || ri.iReacted ? '1' : '0'};transition:opacity 0.15s;background:${ri.iReacted ? 'rgba(250,204,21,0.15)' : 'rgba(15,23,42,0.92)'};border:1px solid ${ri.iReacted ? 'rgba(250,204,21,0.45)' : 'rgba(255,255,255,0.14)'};border-radius:20px;padding:1px 6px;cursor:pointer;font-size:9px;color:${ri.iReacted ? '#facc15' : '#94a3b8'};white-space:nowrap;">
                                            👍${ri.count > 0 ? ' ' + ri.count : ''}
                                        </button>
                                        <span style="font-size:8px;color:#475569;">${timeStr}</span>
                                    </div>
                                </div>
                            </div>
                        </div>`;
                    });
                    body.innerHTML = html;
                    body.scrollTop = body.scrollHeight;
                }
            }
        } else if (channelId.startsWith('dm_')) {
            const ch = _crChannels[channelId];
            if (body) {
                if (!ch || ch.messages.length === 0) {
                    body.innerHTML = `<div style="text-align:center;padding:40px 20px;color:#475569;">No messages yet</div>`;
                } else {
                    let html = '';
                    const sortedMessages = [...ch.messages].sort((a, b) => a.timestamp - b.timestamp);
                    sortedMessages.slice(-30).forEach(msg => {
                        const isSent = msg.from === me.id;
                        const timeStr = _formatMessageTime(msg.timestamp);
                        const isQuickAction = msg.isQuickAction;
                        const editedBadge = msg.edited ? '<span style="font-size:8px;color:#64748b;"> (edited)</span>' : '';
                        const ri = _getReactionInfo(msg.id, me.id);
                        html += `<div style="display:flex;justify-content:${isSent ? 'flex-end' : 'flex-start'};margin-bottom:10px;"
                                     onmouseenter="var b=this.querySelector('.cr-tb');if(b)b.style.opacity='1'"
                                     onmouseleave="var b=this.querySelector('.cr-tb');if(b&&b.getAttribute('data-has')!=='1')b.style.opacity='0'">
                            <div style="max-width:80%;">
                                <div style="padding:8px 12px;border-radius:12px;${isQuickAction ? 'background:rgba(239,68,68,0.15);border-left:3px solid #ef4444;' : 'background:rgba(255,255,255,0.04);'}">
                                    <div style="font-size:11px;color:white;${isQuickAction ? 'font-weight:800;color:#f87171;' : ''}">${_escHtml(msg.text)}${editedBadge}</div>
                                    <div style="display:flex;align-items:center;gap:4px;margin-top:4px;justify-content:flex-end;">
                                        <button class="cr-tb" data-has="${ri.count > 0 || ri.iReacted ? '1' : '0'}"
                                                onclick="window._crToggleThumbsUp('${msg.id}')"
                                                title="${_escHtml(ri.names)}"
                                                style="opacity:${ri.count > 0 || ri.iReacted ? '1' : '0'};transition:opacity 0.15s;background:${ri.iReacted ? 'rgba(250,204,21,0.15)' : 'rgba(15,23,42,0.92)'};border:1px solid ${ri.iReacted ? 'rgba(250,204,21,0.45)' : 'rgba(255,255,255,0.14)'};border-radius:20px;padding:1px 6px;cursor:pointer;font-size:9px;color:${ri.iReacted ? '#facc15' : '#94a3b8'};white-space:nowrap;">
                                            👍${ri.count > 0 ? ' ' + ri.count : ''}
                                        </button>
                                        <span style="font-size:8px;color:#475569;">${timeStr}</span>
                                    </div>
                                </div>
                            </div>
                        </div>`;
                    });
                    body.innerHTML = html;
                    body.scrollTop = body.scrollHeight;
                }
            }
            if (channelId.startsWith('dm_')) _markPrivateChannelRead(channelId, me);
        } else if (channelId.startsWith('group_')) {
            const ch = _crChannels[channelId];
            if (body) {
                if (!ch || ch.messages.length === 0) {
                    body.innerHTML = `<div style="text-align:center;padding:40px 20px;color:#475569;">No messages yet</div>`;
                } else {
                    let html = '';
                    const sortedMessages = [...ch.messages].sort((a, b) => a.timestamp - b.timestamp);
                    sortedMessages.slice(-30).forEach(msg => {
                        const isSent = msg.from === me.id;
                        const timeStr = _formatMessageTime(msg.timestamp);
                        const isQuickAction = msg.isQuickAction;
                        let displayName = msg.fromName;
                        let senderIcon = '';
                        let senderColor = '#a855f7';
                        if (msg.fromName === 'JAMAL') {
                            senderIcon = '👑 ';
                            senderColor = '#fbbf24';
                        } else if (msg.fromName === 'ROSE') {
                            senderIcon = '🌹 ';
                            senderColor = '#ec4899';
                        } else if (msg.fromName === 'MOMO') {
                            senderIcon = '🐱 ';
                            senderColor = '#06b6d4';
                        }
                        const editedBadge = msg.edited ? '<span style="font-size:8px;color:#64748b;"> (edited)</span>' : '';
                        const ri = _getReactionInfo(msg.id, me.id);
                        html += `<div style="display:flex;justify-content:${isSent ? 'flex-end' : 'flex-start'};margin-bottom:10px;"
                                     onmouseenter="var b=this.querySelector('.cr-tb');if(b)b.style.opacity='1'"
                                     onmouseleave="var b=this.querySelector('.cr-tb');if(b&&b.getAttribute('data-has')!=='1')b.style.opacity='0'">
                            <div style="max-width:80%;">
                                <div style="padding:8px 12px;border-radius:12px;${isQuickAction ? 'background:rgba(239,68,68,0.15);border-left:3px solid #ef4444;' : 'background:rgba(255,255,255,0.04);'}">
                                    ${!isSent ? `<div style="font-size:9px;color:${senderColor};font-weight:800;margin-bottom:2px;">${senderIcon}${_escHtml(displayName)}</div>` : ''}
                                    <div style="font-size:11px;color:white;${isQuickAction ? 'font-weight:800;color:#f87171;' : ''}">${_escHtml(msg.text)}${editedBadge}</div>
                                    <div style="display:flex;align-items:center;gap:4px;margin-top:4px;justify-content:flex-end;">
                                        <button class="cr-tb" data-has="${ri.count > 0 || ri.iReacted ? '1' : '0'}"
                                                onclick="window._crToggleThumbsUp('${msg.id}')"
                                                title="${_escHtml(ri.names)}"
                                                style="opacity:${ri.count > 0 || ri.iReacted ? '1' : '0'};transition:opacity 0.15s;background:${ri.iReacted ? 'rgba(250,204,21,0.15)' : 'rgba(15,23,42,0.92)'};border:1px solid ${ri.iReacted ? 'rgba(250,204,21,0.45)' : 'rgba(255,255,255,0.14)'};border-radius:20px;padding:1px 6px;cursor:pointer;font-size:9px;color:${ri.iReacted ? '#facc15' : '#94a3b8'};white-space:nowrap;">
                                            👍${ri.count > 0 ? ' ' + ri.count : ''}
                                        </button>
                                        <span style="font-size:8px;color:#475569;">${timeStr}</span>
                                    </div>
                                </div>
                            </div>
                        </div>`;
                    });
                    body.innerHTML = html;
                    body.scrollTop = body.scrollHeight;
                }
            }
            _markPrivateChannelRead(channelId, me);
        }
    };

    window._crOpenFloat = function(channelId) {
        const fw = document.getElementById('cr-floating-widget');
        if (fw) { 
            fw.style.display = 'flex'; 
            fw.classList.remove('hidden'); 
        }
        if (channelId) {
            window._crOpenFloatChat(channelId);
        } else {
            window._crFloatShowList();
        }
    };

    window._crCloseFloat = function() {
        const fw = document.getElementById('cr-floating-widget');
        if (fw) fw.style.display = 'none';
    };

    window._crToggleThumbsUp = async function(msgId) {
        if (!_fbFunctions || !msgId) return;
        const me = _getMyIdentity();
        const reactionRef = _ref(REACTIONS_DB_PATH + '/' + msgId + '/' + me.id);
        if (!reactionRef) return;
        const existing = _crReactions[msgId] && _crReactions[msgId][me.id];
        try {
            await _fbFunctions.set(reactionRef, existing ? null : (me.name || me.id));
        } catch(e) { console.error('[Chat] Reaction error:', e); }
    };

    window._crToggleFloat = function() {
        const fw = document.getElementById('cr-floating-widget');
        if (!fw) return;
        if (fw.style.display === 'none' || fw.classList.contains('hidden')) {
            fw.style.display = 'flex';
            fw.classList.remove('hidden');
            window._crFloatShowList();
        } else {
            fw.style.display = 'none';
            fw.classList.add('hidden');
        }
    };

    // FIXED: Send message with immediate UI update
    window._crFloatSend = async function() {
        const input = document.getElementById('cr-float-input');
        if (!input) return;
        const text = input.value.trim();
        if (!text || !window._crFloatActiveChannel) return;
        const me = _getMyIdentity();
        
        // Clear input immediately for better UX
        input.value = '';
        
        let success = false;
        if (window._crFloatActiveChannel === 'general') {
            success = await _sendToGeneralChat(text, me, false);
            if (success) {
                // Immediately update the floating chat view
                const body = document.getElementById('cr-float-body');
                if (body && _generalChatMessages.length) {
                    let html = '';
                    const sortedMessages = [..._generalChatMessages].sort((a, b) => a.timestamp - b.timestamp);
                    const recentMessages = sortedMessages.slice(-30);
                    recentMessages.forEach(msg => {
                        const isSent = msg.from === me.id;
                        const timeStr = _formatMessageTime(msg.timestamp);
                        const isQuickAction = msg.isQuickAction;
                        let senderName = msg.fromName;
                        let senderClass = 'color:#a855f7;';
                        let senderIcon = '';
                        if (msg.fromName === 'JAMAL') {
                            senderIcon = '👑 ';
                            senderClass = 'color:#fbbf24;';
                        } else if (msg.fromName === 'ROSE' || (msg.fromName || '').toUpperCase().includes('MASTER SUPER')) {
                            senderIcon = '🌹 ';
                            senderClass = 'color:#ec4899;';
                            senderName = 'ROSE';
                        } else if (msg.fromName === 'MOMO' || msg.fromName === 'MOHENIE') {
                            senderIcon = '🐱 ';
                            senderClass = 'color:#06b6d4;';
                            senderName = 'MOHENIE';
                        }
                        const ri = _getReactionInfo(msg.id, me.id);
                        const editedBadge = msg.edited ? '<span style="font-size:8px;color:#64748b;"> (edited)</span>' : '';
                        html += `<div style="display:flex;justify-content:${isSent ? 'flex-end' : 'flex-start'};margin-bottom:10px;"
                                     onmouseenter="var b=this.querySelector('.cr-tb');if(b)b.style.opacity='1'"
                                     onmouseleave="var b=this.querySelector('.cr-tb');if(b&&b.getAttribute('data-has')!=='1')b.style.opacity='0'">
                            <div style="max-width:80%;">
                                <div style="padding:8px 12px;border-radius:12px;${isQuickAction ? 'background:rgba(239,68,68,0.15);border-left:3px solid #ef4444;' : 'background:rgba(255,255,255,0.04);'}">
                                    ${!isSent ? `<div style="font-size:9px;${senderClass} font-weight:800;margin-bottom:2px;">${senderIcon}${_escHtml(senderName)}</div>` : ''}
                                    <div style="font-size:11px;color:white;${isQuickAction ? 'font-weight:800;color:#f87171;' : ''}">${_escHtml(msg.text)}${editedBadge}</div>
                                    <div style="display:flex;align-items:center;gap:4px;margin-top:4px;justify-content:flex-end;">
                                        <button class="cr-tb" data-has="${ri.count > 0 || ri.iReacted ? '1' : '0'}"
                                                onclick="window._crToggleThumbsUp('${msg.id}')"
                                                title="${_escHtml(ri.names)}"
                                                style="opacity:${ri.count > 0 || ri.iReacted ? '1' : '0'};transition:opacity 0.15s;background:${ri.iReacted ? 'rgba(250,204,21,0.15)' : 'rgba(15,23,42,0.92)'};border:1px solid ${ri.iReacted ? 'rgba(250,204,21,0.45)' : 'rgba(255,255,255,0.14)'};border-radius:20px;padding:1px 6px;cursor:pointer;font-size:9px;color:${ri.iReacted ? '#facc15' : '#94a3b8'};white-space:nowrap;">
                                            👍${ri.count > 0 ? ' ' + ri.count : ''}
                                        </button>
                                        <span style="font-size:8px;color:#475569;">${timeStr}</span>
                                    </div>
                                </div>
                            </div>
                        </div>`;
                    });
                    body.innerHTML = html;
                    body.scrollTop = body.scrollHeight;
                }
            }
        } else if (window._crFloatActiveChannel.startsWith('dm_')) {
            success = await _sendToPrivateChannel(window._crFloatActiveChannel, text, me, false);
            if (success) {
                const body = document.getElementById('cr-float-body');
                const ch = _crChannels[window._crFloatActiveChannel];
                if (body && ch && ch.messages.length) {
                    let html = '';
                    const sortedMessages = [...ch.messages].sort((a, b) => a.timestamp - b.timestamp);
                    const recentMessages = sortedMessages.slice(-30);
                    recentMessages.forEach(msg => {
                        const isSent = msg.from === me.id;
                        const timeStr = _formatMessageTime(msg.timestamp);
                        const isQuickAction = msg.isQuickAction;
                        const editedBadge = msg.edited ? '<span style="font-size:8px;color:#64748b;"> (edited)</span>' : '';
                        const ri = _getReactionInfo(msg.id, me.id);
                        html += `<div style="display:flex;justify-content:${isSent ? 'flex-end' : 'flex-start'};margin-bottom:10px;"
                                     onmouseenter="var b=this.querySelector('.cr-tb');if(b)b.style.opacity='1'"
                                     onmouseleave="var b=this.querySelector('.cr-tb');if(b&&b.getAttribute('data-has')!=='1')b.style.opacity='0'">
                            <div style="max-width:80%;">
                                <div style="padding:8px 12px;border-radius:12px;${isQuickAction ? 'background:rgba(239,68,68,0.15);border-left:3px solid #ef4444;' : 'background:rgba(255,255,255,0.04);'}">
                                    <div style="font-size:11px;color:white;${isQuickAction ? 'font-weight:800;color:#f87171;' : ''}">${_escHtml(msg.text)}${editedBadge}</div>
                                    <div style="display:flex;align-items:center;gap:4px;margin-top:4px;justify-content:flex-end;">
                                        <button class="cr-tb" data-has="${ri.count > 0 || ri.iReacted ? '1' : '0'}"
                                                onclick="window._crToggleThumbsUp('${msg.id}')"
                                                title="${_escHtml(ri.names)}"
                                                style="opacity:${ri.count > 0 || ri.iReacted ? '1' : '0'};transition:opacity 0.15s;background:${ri.iReacted ? 'rgba(250,204,21,0.15)' : 'rgba(15,23,42,0.92)'};border:1px solid ${ri.iReacted ? 'rgba(250,204,21,0.45)' : 'rgba(255,255,255,0.14)'};border-radius:20px;padding:1px 6px;cursor:pointer;font-size:9px;color:${ri.iReacted ? '#facc15' : '#94a3b8'};white-space:nowrap;">
                                            👍${ri.count > 0 ? ' ' + ri.count : ''}
                                        </button>
                                        <span style="font-size:8px;color:#475569;">${timeStr}</span>
                                    </div>
                                </div>
                            </div>
                        </div>`;
                    });
                    body.innerHTML = html;
                    body.scrollTop = body.scrollHeight;
                }
            }
        } else if (window._crFloatActiveChannel.startsWith('group_')) {
            success = await _sendToGroupChannel(window._crFloatActiveChannel, text, me, false);
            if (success) {
                const body = document.getElementById('cr-float-body');
                const ch = _crChannels[window._crFloatActiveChannel];
                if (body && ch && ch.messages.length) {
                    let html = '';
                    const sortedMessages = [...ch.messages].sort((a, b) => a.timestamp - b.timestamp);
                    const recentMessages = sortedMessages.slice(-30);
                    recentMessages.forEach(msg => {
                        const isSent = msg.from === me.id;
                        const timeStr = _formatMessageTime(msg.timestamp);
                        const isQuickAction = msg.isQuickAction;
                        let displayName = msg.fromName;
                        let senderIcon = '';
                        let senderColor = '#a855f7';
                        if (msg.fromName === 'JAMAL') {
                            senderIcon = '👑 ';
                            senderColor = '#fbbf24';
                        } else if (msg.fromName === 'ROSE') {
                            senderIcon = '🌹 ';
                            senderColor = '#ec4899';
                        } else if (msg.fromName === 'MOMO') {
                            senderIcon = '🐱 ';
                            senderColor = '#06b6d4';
                        }
                        const editedBadge = msg.edited ? '<span style="font-size:8px;color:#64748b;"> (edited)</span>' : '';
                        const ri = _getReactionInfo(msg.id, me.id);
                        html += `<div style="display:flex;justify-content:${isSent ? 'flex-end' : 'flex-start'};margin-bottom:10px;"
                                     onmouseenter="var b=this.querySelector('.cr-tb');if(b)b.style.opacity='1'"
                                     onmouseleave="var b=this.querySelector('.cr-tb');if(b&&b.getAttribute('data-has')!=='1')b.style.opacity='0'">
                            <div style="max-width:80%;">
                                <div style="padding:8px 12px;border-radius:12px;${isQuickAction ? 'background:rgba(239,68,68,0.15);border-left:3px solid #ef4444;' : 'background:rgba(255,255,255,0.04);'}">
                                    ${!isSent ? `<div style="font-size:9px;color:${senderColor};font-weight:800;margin-bottom:2px;">${senderIcon}${_escHtml(displayName)}</div>` : ''}
                                    <div style="font-size:11px;color:white;${isQuickAction ? 'font-weight:800;color:#f87171;' : ''}">${_escHtml(msg.text)}${editedBadge}</div>
                                    <div style="display:flex;align-items:center;gap:4px;margin-top:4px;justify-content:flex-end;">
                                        <button class="cr-tb" data-has="${ri.count > 0 || ri.iReacted ? '1' : '0'}"
                                                onclick="window._crToggleThumbsUp('${msg.id}')"
                                                title="${_escHtml(ri.names)}"
                                                style="opacity:${ri.count > 0 || ri.iReacted ? '1' : '0'};transition:opacity 0.15s;background:${ri.iReacted ? 'rgba(250,204,21,0.15)' : 'rgba(15,23,42,0.92)'};border:1px solid ${ri.iReacted ? 'rgba(250,204,21,0.45)' : 'rgba(255,255,255,0.14)'};border-radius:20px;padding:1px 6px;cursor:pointer;font-size:9px;color:${ri.iReacted ? '#facc15' : '#94a3b8'};white-space:nowrap;">
                                            👍${ri.count > 0 ? ' ' + ri.count : ''}
                                        </button>
                                        <span style="font-size:8px;color:#475569;">${timeStr}</span>
                                    </div>
                                </div>
                            </div>
                        </div>`;
                    });
                    body.innerHTML = html;
                    body.scrollTop = body.scrollHeight;
                }
            }
        }
        
        if (success) {
            input.value = '';
        }
    };

    window.initChatroomBackground = async function() {
        if (_initialized) return;
        if (!_fbFunctions) {
            const ok = await _initFirebaseFunctions();
            if (!ok) return;
        }
        const me = _getMyIdentity();
        if (!me || !me.id) return;
        _loadPrivateChannels(me);
        _listenToGeneralChat(me);
        _listenToReactions();
        _initialized = true;
        if (typeof _renderFloatChannelList === 'function') _renderFloatChannelList();
        console.log('[Chat] Background initialized');
    };

    // ═══════════════════════════════════════════
    // INITIALIZE ON PAGE LOAD
    // ═══════════════════════════════════════════
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            _initFloatingWidget();
            setTimeout(() => window.initChatroomBackground(), 500);
        });
    } else {
        _initFloatingWidget();
        setTimeout(() => window.initChatroomBackground(), 500);
    }

    window.initChatroom = async function() {
        if (!_fbFunctions) {
            const ok = await _initFirebaseFunctions();
            if (!ok) {
                const container = document.getElementById('cr-main-container');
                if (container) container.innerHTML = '<div class="cr-empty-state"><div class="cr-empty-icon">⚠️</div><div class="cr-empty-title">Connection Error</div></div>';
                return;
            }
        }
        const me = _getMyIdentity();
        if (!me || !me.id) return;
        _renderMainLayout(me);
        if (!_initialized) {
            _loadPrivateChannels(me);
            _listenToGeneralChat(me);
            _listenToReactions();
            _initialized = true;
        } else {
            _listenToReactions();
            if (_crCurrentChannelType === 'general') _renderGeneralChatMessages(me);
        }
    };

    console.log('[Chat] chatroom.js loaded - Full feature chat with instant floating updates');
})();
