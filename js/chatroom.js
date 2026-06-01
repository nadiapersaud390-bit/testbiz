/**
 * ═══════════════════════════════════════════════════════════════
 * SECURE CHATROOM — E2E Encrypted Agent ↔ Admin Messaging
 * ═══════════════════════════════════════════════════════════════
 *
 * Features:
 * - AES-GCM end-to-end encryption (Web Crypto API)
 * - GENERAL CHATROOM - always open in full tab, everyone can see messages
 * - FLOATING WIDGET - opens to list view (not General Chat by default)
 * - Users see their own messages immediately
 * - Admin shown with their actual names (JAMAL, ROSE, MOMO)
 * - Private 1-on-1 admin ↔ agent channels
 * - Quick action buttons (Come Quick, Help)
 * - Floating chat icon always visible
 * - TALL CHAT HEIGHT - takes full available space
 */

(function() {
    'use strict';

    // ═══════════════════════════════════════════
    // CONSTANTS & STATE
    // ═══════════════════════════════════════════
    const CRYPTO_SALT = 'BIZ-LevelUp-E2E-2025';
    const CHAT_DB_PATH = 'secure_chat';
    const GENERAL_CHAT_PATH = 'general_chat';
    const TYPING_DB_PATH = 'chat_typing';

    // Quick action messages (removed listen_call)
    const QUICK_ACTIONS = {
        come_quick: { text: '🚨 COME QUICK', emoji: '🚨', message: '🚨 URGENT: Come quick! I need immediate assistance right now.' },
        help: { text: '🆘 HELP', emoji: '🆘', message: '🆘 HELP NEEDED: I need immediate assistance on this call!' }
    };

    const REACTIONS_DB_PATH = 'chat_reactions';

    let _crListeners = [];
    let _crCurrentChannel = null;
    let _crCurrentChannelType = 'general';
    let _crSidebarTab = 'general';
    let _crChannels = {};
    let _crTypingTimers = {};
    let _crAudioCtx = null;
    let _crOriginalTitle = document.title;
    let _crTitleBlinkInterval = null;
    let _crSearchQuery = '';
    let _crFloatSearchQuery = '';
    let _generalChatMessages = [];
    let _generalChatUnread = 0;
    let _localMessageIds = new Set();
    let _crReactions = {};

    // ── PERFORMANCE: key + message decrypt caches ──
    const _keyCache = {};        // channelId → CryptoKey (derived once, reused)
    const _decryptCache = {};    // msgId → plaintext (never re-decrypt same msg)

    let _fbFunctions = null;
    let _initialized = false;
    let _isFirstLoad = true;

    // Identity - Support multiple admins with their actual names
    function _getMyIdentity() {
        const userRole = sessionStorage.getItem('bizUserRole');
        const isAdmin = userRole === 'admin';
        
        if (isAdmin) {
            const adminData = JSON.parse(sessionStorage.getItem('currentAdmin') || '{}');
            // Get actual admin name from stored data
            let adminName = adminData.name || 'JAMAL';
            // Map common admin names
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

    // Get admin display name by ID
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

    function _stopTitleBlink() {
        if (_crTitleBlinkInterval) {
            clearInterval(_crTitleBlinkInterval);
            _crTitleBlinkInterval = null;
            document.title = _crOriginalTitle;
        }
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
                off: mod.off
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
    // GENERAL CHAT - Always Open in Full Tab
    // ═══════════════════════════════════════════
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
            const msgKeys = Object.keys(data).sort();
            
            for (const key of msgKeys) {
                const raw = data[key];
                if (!raw || !raw.ciphertext) continue;
                const cacheKey = GENERAL_CHAT_PATH + '_' + key;
                const plaintext = _decryptCache[cacheKey]
                    ? _decryptCache[cacheKey]
                    : (_decryptCache[cacheKey] = await _decrypt(raw.ciphertext, raw.iv, GENERAL_CHAT_PATH));
                messages.push({
                    id: key,
                    from: raw.from || '',
                    fromName: raw.fromName || '',
                    text: plaintext,
                    timestamp: raw.timestamp || 0,
                    isQuickAction: raw.isQuickAction || false
                });
            }

            messages.sort((a, b) => a.timestamp - b.timestamp);
            _generalChatMessages = messages;

            if (!initialLoad && messages.length > 0) {
                const newest = messages[messages.length - 1];
                if (newest && newest.from !== me.id) {
                    _playNotificationSound();
                    if (!_isFirstLoad) {
                        if (window.currentTab === 'chatroom') {
                            setTimeout(() => window._crSelectGeneralChat && window._crSelectGeneralChat(), 300);
                        } else {
                            setTimeout(() => window._crOpenFloat('general'), 500);
                        }
                    }
                }
            }
            
            initialLoad = false;
            _updateFloatBubbleBadge();

            if (_crCurrentChannelType === 'general') {
                _renderGeneralChatMessages(me);
            }
            if (document.getElementById('cr-channel-list')) {
                _renderChannelList();
            }
        });
    }

    async function _sendToGeneralChat(text, me, isQuickAction = false) {
        if (!_fbFunctions || !text) return false;
        // Pre-warm key cache so encryption is instant
        if (!_keyCache[GENERAL_CHAT_PATH]) await _deriveKey(GENERAL_CHAT_PATH);
        
        const tempId = 'temp_' + Date.now() + '_' + Math.random();
        const tempMessage = {
            id: tempId,
            from: me.id,
            fromName: me.name,
            text: text,
            timestamp: Date.now(),
            isQuickAction: isQuickAction,
            isTemp: true
        };
        
        _generalChatMessages.push(tempMessage);
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
            await _fbFunctions.push(_ref(GENERAL_CHAT_PATH), {
                from: me.id,
                fromName: me.name,
                ciphertext: encrypted.ciphertext,
                iv: encrypted.iv,
                timestamp: Date.now(),
                isQuickAction: isQuickAction
            });
            
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
            if (window._crFloatActiveChannel) window._crOpenFloatChat(window._crFloatActiveChannel);
        });
    }

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

        sortedMessages.forEach(msg => {
            const msgDate = new Date(msg.timestamp).toLocaleDateString('en-US', {
                weekday: 'short', month: 'short', day: 'numeric'
            });
            if (msgDate !== lastDate) {
                html += `<div class="cr-date-sep" style="text-align:center;padding:16px 0 8px;"><span style="font-size:10px;font-weight:700;color:#475569;background:rgba(255,255,255,0.04);padding:4px 12px;border-radius:20px;">${msgDate}</span></div>`;
                lastDate = msgDate;
            }

            const isSent = msg.from === me.id;
            const timeStr = new Date(msg.timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
            const isQuickAction = msg.isQuickAction;
            const actionStyle = isQuickAction ? 'background:rgba(239,68,68,0.15);border-left:3px solid #ef4444;' : '';
            
            // Show proper admin names with icons
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

            const ri = _getReactionInfo(msg.id, me.id);
            html += `
                <div class="cr-msg-row ${isSent ? 'sent' : 'received'}" style="display:flex;justify-content:${isSent ? 'flex-end' : 'flex-start'};margin-bottom:12px;animation:fadeIn 0.2s ease;"
                     onmouseenter="var b=this.querySelector('.cr-tb');if(b)b.style.opacity='1'"
                     onmouseleave="var b=this.querySelector('.cr-tb');if(b&&b.getAttribute('data-has')!=='1')b.style.opacity='0'">
                    <div style="max-width:75%;">
                        <div class="cr-msg-bubble" style="padding:10px 14px;border-radius:16px;${actionStyle} ${isSent ? 'background:linear-gradient(135deg,rgba(16,185,129,0.18),rgba(5,150,105,0.22));border-bottom-right-radius:6px;' : 'background:rgba(255,255,255,0.04);border-bottom-left-radius:6px;'}">
                            <div class="cr-msg-sender" style="font-size:10px;${senderClass} font-weight:800;margin-bottom:4px;white-space:nowrap;">${senderIcon}${_escHtml(senderName)}</div>
                            <div class="cr-msg-text" style="font-size:13px;color:#e2e8f0;line-height:1.5;${isQuickAction ? 'font-weight:800;color:#f87171;' : ''}">${_escHtml(msg.text)}</div>
                            <div class="cr-msg-meta" style="display:flex;align-items:center;gap:6px;margin-top:6px;justify-content:flex-end;">
                                <button class="cr-tb" data-has="${ri.count > 0 || ri.iReacted ? '1' : '0'}"
                                        onclick="window._crToggleThumbsUp('${msg.id}')"
                                        title="${_escHtml(ri.names)}"
                                        style="opacity:${ri.count > 0 || ri.iReacted ? '1' : '0'};transition:opacity 0.15s;background:${ri.iReacted ? 'rgba(250,204,21,0.15)' : 'rgba(15,23,42,0.92)'};border:1px solid ${ri.iReacted ? 'rgba(250,204,21,0.45)' : 'rgba(255,255,255,0.14)'};border-radius:20px;padding:2px 8px;cursor:pointer;font-size:10px;color:${ri.iReacted ? '#facc15' : '#94a3b8'};white-space:nowrap;">
                                    👍${ri.count > 0 ? ' ' + ri.count : ''}
                                </button>
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
            // Admins can also message other admins
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
    }

    function _listenForPrivateMessages(me) {
        if (!_fbFunctions) return;

        Object.values(_crChannels).forEach(ch => {
            _listenToPrivateChannel(ch.channelId, me);
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

            const msgKeys = Object.keys(data).sort();
            
            for (const key of msgKeys) {
                const raw = data[key];
                if (!raw || !raw.ciphertext) continue;
                const cacheKey = channelId + '_' + key;
                const plaintext = _decryptCache[cacheKey]
                    ? _decryptCache[cacheKey]
                    : (_decryptCache[cacheKey] = await _decrypt(raw.ciphertext, raw.iv, channelId));
                // Keep original sender name (no transformation here - that happens in render)
                const msg = {
                    id: key,
                    from: raw.from || '',
                    fromName: raw.fromName || '',
                    text: plaintext,
                    timestamp: raw.timestamp || 0,
                    read: raw.read || false,
                    isQuickAction: raw.isQuickAction || false
                };
                messages.push(msg);
                if (msg.timestamp > lastMsgTime) {
                    lastMsgTime = msg.timestamp;
                    lastMsg = msg;
                }
                if (msg.from !== me.id && !msg.read) unread++;
            }

            const ch = _crChannels[channelId];
            if (ch) {
                ch.messages = messages;
                ch.unread = unread;
                ch.lastMsg = lastMsg;
                ch.lastMsgTime = lastMsgTime;

                if (!initialLoad && messages.length > 0) {
                    const newest = messages[messages.length - 1];
                    if (newest && newest.from !== me.id) {
                        _playNotificationSound();
                        if (!_isFirstLoad) {
                            if (window.currentTab === 'chatroom') {
                                setTimeout(() => window._crSelectPrivateChat && window._crSelectPrivateChat(channelId), 300);
                            } else {
                                setTimeout(() => window._crOpenFloat(channelId), 500);
                            }
                        }
                    }
                }
            }
            
            initialLoad = false;
            _updateFloatBubbleBadge();

            if (_crCurrentChannel === channelId && _crCurrentChannelType === 'dm') {
                _renderPrivateChatMessages(channelId, me);
            }
            if (document.getElementById('cr-channel-list')) _renderChannelList();
        });
    }

    async function _sendToPrivateChannel(channelId, text, me, isQuickAction = false) {
        if (!_fbFunctions || !text || !channelId) return false;
        
        const tempId = 'temp_' + Date.now() + '_' + Math.random();
        const tempMessage = {
            id: tempId,
            from: me.id,
            fromName: me.name,
            text: text,
            timestamp: Date.now(),
            isQuickAction: isQuickAction,
            isTemp: true
        };
        
        if (_crChannels[channelId]) {
            _crChannels[channelId].messages.push(tempMessage);
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
            await _fbFunctions.push(_ref(CHAT_DB_PATH + '/' + channelId), {
                from: me.id,
                fromName: me.name,
                ciphertext: encrypted.ciphertext,
                iv: encrypted.iv,
                timestamp: Date.now(),
                read: false,
                isQuickAction: isQuickAction
            });
            
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

        sortedMessages.forEach(msg => {
            const msgDate = new Date(msg.timestamp).toLocaleDateString('en-US', {
                weekday: 'short', month: 'short', day: 'numeric'
            });
            if (msgDate !== lastDate) {
                html += `<div class="cr-date-sep" style="text-align:center;padding:16px 0 8px;"><span style="font-size:10px;font-weight:700;color:#475569;background:rgba(255,255,255,0.04);padding:4px 12px;border-radius:20px;">${msgDate}</span></div>`;
                lastDate = msgDate;
            }

            const isSent = msg.from === me.id;
            const timeStr = new Date(msg.timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
            const isQuickAction = msg.isQuickAction;
            const actionStyle = isQuickAction ? 'background:rgba(239,68,68,0.15);border-left:3px solid #ef4444;' : '';
            
            // Get display name for the sender
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

            const ri = _getReactionInfo(msg.id, me.id);
            html += `
                <div class="cr-msg-row ${isSent ? 'sent' : 'received'}" style="display:flex;justify-content:${isSent ? 'flex-end' : 'flex-start'};margin-bottom:12px;"
                     onmouseenter="var b=this.querySelector('.cr-tb');if(b)b.style.opacity='1'"
                     onmouseleave="var b=this.querySelector('.cr-tb');if(b&&b.getAttribute('data-has')!=='1')b.style.opacity='0'">
                    <div style="max-width:75%;">
                        <div class="cr-msg-bubble" style="padding:10px 14px;border-radius:16px;${actionStyle} ${isSent ? 'background:linear-gradient(135deg,rgba(16,185,129,0.18),rgba(5,150,105,0.22));border-bottom-right-radius:6px;' : 'background:rgba(255,255,255,0.04);border-bottom-left-radius:6px;'}">
                            ${!isSent ? `<div class="cr-msg-sender" style="font-size:10px;color:${senderColor};font-weight:800;margin-bottom:4px;">${senderIcon}${_escHtml(displayName)}</div>` : ''}
                            <div class="cr-msg-text" style="font-size:13px;color:#e2e8f0;line-height:1.5;${isQuickAction ? 'font-weight:800;color:#f87171;' : ''}">${_escHtml(msg.text)}</div>
                            <div class="cr-msg-meta" style="display:flex;align-items:center;gap:6px;margin-top:6px;justify-content:flex-end;">
                                <button class="cr-tb" data-has="${ri.count > 0 || ri.iReacted ? '1' : '0'}"
                                        onclick="window._crToggleThumbsUp('${msg.id}')"
                                        title="${_escHtml(ri.names)}"
                                        style="opacity:${ri.count > 0 || ri.iReacted ? '1' : '0'};transition:opacity 0.15s;background:${ri.iReacted ? 'rgba(250,204,21,0.15)' : 'rgba(15,23,42,0.92)'};border:1px solid ${ri.iReacted ? 'rgba(250,204,21,0.45)' : 'rgba(255,255,255,0.14)'};border-radius:20px;padding:2px 8px;cursor:pointer;font-size:10px;color:${ri.iReacted ? '#facc15' : '#94a3b8'};white-space:nowrap;">
                                    👍${ri.count > 0 ? ' ' + ri.count : ''}
                                </button>
                                <span class="cr-msg-time" style="font-size:9px;color:#475569;">${timeStr}</span>
                                ${msg.isTemp ? '<span class="cr-msg-read" style="font-size:9px;color:#fbbf24;">sending...</span>' : (isSent && msg.read ? '<span class="cr-msg-read" style="font-size:10px;color:#10b981;">✓✓</span>' : '')}
                            </div>
                        </div>
                    </div>
                </div>`;
        });

        area.innerHTML = html;
        setTimeout(() => { if (area) area.scrollTop = area.scrollHeight; }, 50);
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
                if (document.getElementById('cr-channel-list')) _renderChannelList();
            }
        } catch(e) {}
    }

    // ═══════════════════════════════════════════
    // UI RENDERING - TALL CHAT HEIGHT
    // ═══════════════════════════════════════════
    function _renderMainLayout(me) {
        const container = document.getElementById('cr-main-container');
        if (!container) return;

        container.style.height = 'calc(100vh - 180px)';
        container.style.minHeight = '550px';

        container.innerHTML = `
            <div class="cr-container" id="cr-chat-container" style="height: 100%; display: flex; gap: 0;">
                <div class="cr-sidebar" id="cr-sidebar" style="width: 280px; min-width: 280px; border-right: 1px solid rgba(255,255,255,0.06); display: flex; flex-direction: column; height: 100%;">
                    <div class="cr-sidebar-header" style="padding: 16px; border-bottom: 1px solid rgba(255,255,255,0.06);">
                        <div class="cr-sidebar-title" style="font-family:Orbitron,sans-serif;font-size:10px;font-weight:900;color:#10b981;"><span class="lock-icon">🔒</span> Chat</div>
                    </div>
                    <div class="cr-sidebar-tabs" style="display:flex;gap:2px;padding:12px;">
                        <button class="cr-sidebar-tab active" id="cr-tab-general" onclick="window._crSwitchSidebarTab('general')" style="flex:1;padding:8px;border-radius:10px;font-size:10px;font-weight:900;background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.25);color:#10b981;">🌍 General</button>
                        <button class="cr-sidebar-tab" id="cr-tab-dms" onclick="window._crSwitchSidebarTab('dms')" style="flex:1;padding:8px;border-radius:10px;font-size:10px;font-weight:900;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);color:#64748b;">💬 Private</button>
                    </div>
                    <div class="cr-search-wrap" style="padding:0 12px 12px;position:relative;">
                        <span class="cr-search-icon" style="position:absolute;left:22px;top:50%;transform:translateY(-50%);font-size:11px;color:#334155;">🔍</span>
                        <input type="text" class="cr-search-input" placeholder="Search..." oninput="window._crSearch(this.value)" style="width:100%;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:8px 12px 8px 32px;color:#e2e8f0;font-size:12px;" />
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

        const channels = Object.values(_crChannels)
            .filter(ch => {
                if (!_crSearchQuery) return true;
                return (ch.agentName || '').toLowerCase().includes(_crSearchQuery);
            })
            .sort((a, b) => (b.lastMsgTime || 0) - (a.lastMsgTime || 0));

        channels.forEach(ch => {
            const isActive = _crCurrentChannel === ch.channelId && _crCurrentChannelType === 'dm';
            const name = ch.agentName || 'User';
            const avatarContent = _getInitials(name);
            const preview = ch.lastMsg ? _truncate(ch.lastMsg.text, 30) : 'No messages';
            const timeStr = ch.lastMsgTime ? _formatTime(ch.lastMsgTime) : '';
            const unreadBadge = ch.unread > 0 ? `<div class="cr-unread-badge" style="background:#10b981;color:white;border-radius:10px;min-width:18px;height:18px;font-size:9px;display:flex;align-items:center;justify-content:center;padding:0 4px;">${ch.unread}</div>` : '';

            html += `
                <div class="cr-channel-item ${isActive ? 'active' : ''}" onclick="window._crSelectPrivateChat('${ch.channelId}')" style="display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:12px;cursor:pointer;margin-bottom:2px;${isActive ? 'background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.2);' : 'background:transparent;'}">
                    <div class="cr-channel-avatar" style="width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,0.05);font-size:16px;font-weight:900;color:#10b981;">${avatarContent}</div>
                    <div class="cr-channel-info" style="flex:1;">
                        <div class="cr-channel-name" style="font-size:13px;font-weight:800;color:white;">${_escHtml(name)}</div>
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
        
        const panel = document.getElementById('cr-chat-panel');
        if (!panel) return;

        panel.innerHTML = `
            <div class="cr-chat-header" style="display:flex;align-items:center;gap:14px;padding:16px 20px;border-bottom:1px solid rgba(255,255,255,0.06);flex-shrink:0;">
                <button class="cr-back-btn" onclick="window._crBackToSidebar()" style="display:none;background:rgba(255,255,255,0.05);border:none;border-radius:10px;color:#94a3b8;width:34px;height:34px;align-items:center;justify-content:center;cursor:pointer;">←</button>
                <div class="cr-channel-avatar" style="width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,rgba(16,185,129,0.15),rgba(56,189,248,0.15));font-size:22px;">🌍</div>
                <div class="cr-chat-header-info" style="flex:1;">
                    <div class="cr-chat-header-name" style="font-size:14px;font-weight:900;color:white;">General Chat</div>
                    <div class="cr-chat-header-status" style="font-size:10px;color:#64748b;margin-top:2px;"><span class="cr-e2e-badge" style="display:inline-flex;align-items:center;gap:4px;background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.25);border-radius:6px;padding:2px 8px;font-size:8px;color:#10b981;">🔐 E2E Encrypted</span> <span style="margin-left:8px;">Everyone in the room</span></div>
                </div>
            </div>
            <div style="display:flex;gap:8px;padding:10px 16px;background:rgba(0,0,0,0.2);border-bottom:1px solid rgba(255,255,255,0.06);flex-wrap:wrap;flex-shrink:0;align-items:center;">
                <button onclick="window._crSendQuickActionToGeneral('come_quick')" style="background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.4);border-radius:20px;padding:6px 14px;color:#f87171;font-size:11px;font-weight:700;cursor:pointer;">🚨 Come Quick</button>
                <button onclick="window._crSendQuickActionToGeneral('help')" style="background:rgba(245,158,11,0.15);border:1px solid rgba(245,158,11,0.4);border-radius:20px;padding:6px 14px;color:#fbbf24;font-size:11px;font-weight:700;cursor:pointer;">🆘 Help</button>
                ${(function(){ const a=JSON.parse(sessionStorage.getItem('currentAdmin')||'{}'); return (a.role==='super_admin'||a.isSuper)?'<button onclick="window._crClearGeneralChat()" style="margin-left:auto;background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.3);border-radius:20px;padding:6px 14px;color:#ef4444;font-size:10px;font-weight:800;cursor:pointer;letter-spacing:0.05em;text-transform:uppercase;">🗑 Clear Chat</button>':'';}())}
            </div>
            <div class="cr-messages" id="cr-messages-area" style="flex: 1; overflow-y: auto; padding: 16px 20px;"></div>
            <div class="cr-typing-indicator hidden" id="cr-typing-indicator" style="padding:8px 16px;flex-shrink:0;"><div class="cr-typing-dots" style="display:flex;gap:3px;"><div class="cr-typing-dot" style="width:5px;height:5px;border-radius:50%;background:#475569;"></div><div class="cr-typing-dot" style="width:5px;height:5px;border-radius:50%;background:#475569;"></div><div class="cr-typing-dot" style="width:5px;height:5px;border-radius:50%;background:#475569;"></div></div><span class="cr-typing-text" style="font-size:10px;color:#475569;margin-left:8px;">typing...</span></div>
            <div class="cr-input-bar" style="padding:12px 16px;border-top:1px solid rgba(255,255,255,0.06);display:flex;gap:10px;flex-shrink:0;">
                <div class="cr-input-wrap" style="flex:1;"><textarea class="cr-msg-input" id="cr-msg-input" placeholder="Type a message to everyone..." rows="1" style="width:100%;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:14px;color:#e2e8f0;font-size:13px;padding:12px 16px;resize:none;line-height:1.4;" onkeydown="window._crHandleGeneralKeydown(event)" oninput="window._crHandleGeneralTyping()"></textarea></div>
                <button class="cr-send-btn" onclick="window._crSendGeneralMessage()" style="width:44px;height:44px;border-radius:14px;background:linear-gradient(135deg,#10b981,#059669);border:none;color:white;cursor:pointer;display:flex;align-items:center;justify-content:center;">➤</button>
            </div>`;

        _renderGeneralChatMessages(me);
        
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

        const panel = document.getElementById('cr-chat-panel');
        if (!panel) return;

        panel.innerHTML = `
            <div class="cr-chat-header" style="display:flex;align-items:center;gap:14px;padding:16px 20px;border-bottom:1px solid rgba(255,255,255,0.06);flex-shrink:0;">
                <button class="cr-back-btn" onclick="window._crBackToSidebar()" style="display:none;background:rgba(255,255,255,0.05);border:none;border-radius:10px;color:#94a3b8;width:34px;height:34px;align-items:center;justify-content:center;cursor:pointer;">←</button>
                <div class="cr-channel-avatar" style="width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,0.05);font-size:18px;font-weight:900;color:#10b981;">${_getInitials(title)}</div>
                <div class="cr-chat-header-info" style="flex:1;">
                    <div class="cr-chat-header-name" style="font-size:14px;font-weight:900;color:white;">${_escHtml(title)}</div>
                    <div class="cr-chat-header-status" style="font-size:10px;color:#64748b;margin-top:2px;"><span class="cr-e2e-badge" style="display:inline-flex;align-items:center;gap:4px;background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.25);border-radius:6px;padding:2px 8px;font-size:8px;color:#10b981;">🔐 E2E Encrypted</span> <span style="margin-left:8px;">Private conversation</span></div>
                </div>
                <button class="cr-clear-chat-btn" onclick="window._crClearPrivateChat('${channelId}')" style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:8px;color:#ef4444;padding:6px 12px;font-size:10px;font-weight:900;cursor:pointer;">🗑️ Clear</button>
            </div>
            <div style="display:flex;gap:8px;padding:10px 16px;background:rgba(0,0,0,0.2);border-bottom:1px solid rgba(255,255,255,0.06);flex-wrap:wrap;flex-shrink:0;">
                <button onclick="window._crSendQuickActionToPrivate('come_quick', '${channelId}')" style="background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.4);border-radius:20px;padding:6px 14px;color:#f87171;font-size:11px;font-weight:700;cursor:pointer;">🚨 Come Quick</button>
                <button onclick="window._crSendQuickActionToPrivate('help', '${channelId}')" style="background:rgba(245,158,11,0.15);border:1px solid rgba(245,158,11,0.4);border-radius:20px;padding:6px 14px;color:#fbbf24;font-size:11px;font-weight:700;cursor:pointer;">🆘 Help</button>
            </div>
            <div class="cr-messages" id="cr-messages-area" style="flex: 1; overflow-y: auto; padding: 16px 20px;"></div>
            <div class="cr-typing-indicator hidden" id="cr-typing-indicator" style="padding:8px 16px;flex-shrink:0;"><div class="cr-typing-dots" style="display:flex;gap:3px;"><div class="cr-typing-dot" style="width:5px;height:5px;border-radius:50%;background:#475569;"></div><div class="cr-typing-dot" style="width:5px;height:5px;border-radius:50%;background:#475569;"></div><div class="cr-typing-dot" style="width:5px;height:5px;border-radius:50%;background:#475569;"></div></div><span class="cr-typing-text" style="font-size:10px;color:#475569;margin-left:8px;">typing...</span></div>
            <div class="cr-input-bar" style="padding:12px 16px;border-top:1px solid rgba(255,255,255,0.06);display:flex;gap:10px;flex-shrink:0;">
                <div class="cr-input-wrap" style="flex:1;"><textarea class="cr-msg-input" id="cr-msg-input" placeholder="Type a private message..." rows="1" style="width:100%;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:14px;color:#e2e8f0;font-size:13px;padding:12px 16px;resize:none;line-height:1.4;" onkeydown="window._crHandlePrivateKeydown(event, '${channelId}')" oninput="window._crHandlePrivateTyping()"></textarea></div>
                <button class="cr-send-btn" onclick="window._crSendPrivateMessage('${channelId}')" style="width:44px;height:44px;border-radius:14px;background:linear-gradient(135deg,#10b981,#059669);border:none;color:white;cursor:pointer;display:flex;align-items:center;justify-content:center;">➤</button>
            </div>`;

        _renderPrivateChatMessages(channelId, me);
        _markPrivateChannelRead(channelId, me);

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
            input.style.height = 'auto';
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
            input.style.height = 'auto';
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
        // Send to the specific private channel only, not to all admins
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

    window._crHandleGeneralTyping = function() {
        const input = document.getElementById('cr-msg-input');
        if (input) {
            input.style.height = 'auto';
            input.style.height = Math.min(input.scrollHeight, 80) + 'px';
        }
    };

    window._crHandlePrivateTyping = function() {
        const input = document.getElementById('cr-msg-input');
        if (input) {
            input.style.height = 'auto';
            input.style.height = Math.min(input.scrollHeight, 80) + 'px';
        }
    };

    window._crClearPrivateChat = async function(channelId) {
        if (!confirm('Clear this private chat?')) return;
        if (!_fbFunctions || !channelId) return;
        try {
            await _fbFunctions.remove(_ref(CHAT_DB_PATH + '/' + channelId));
            if (_crChannels[channelId]) {
                _crChannels[channelId].messages = [];
                _crChannels[channelId].unread = 0;
            }
            const me = _getMyIdentity();
            _renderPrivateChatMessages(channelId, me);
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

    function _formatTime(ts) {
        if (!ts) return '';
        const diff = Date.now() - ts;
        if (diff < 60000) return 'now';
        if (diff < 3600000) return Math.floor(diff / 60000) + 'm';
        return new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    }

    // ═══════════════════════════════════════════
    // FLOATING WIDGET - Opens to list view
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
                <div id="cr-float-body" style="flex:1;overflow-y:auto;padding:12px;"></div>
                <div style="padding:10px;border-top:1px solid rgba(255,255,255,0.06);display:flex;gap:6px;">
                    <textarea id="cr-float-input" placeholder="Type a message..." rows="1" style="flex:1;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:10px;color:white;font-size:12px;padding:8px 10px;resize:none;"></textarea>
                    <button id="cr-float-send" style="width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,#10b981,#059669);border:none;color:white;cursor:pointer;">➤</button>
                </div>
            </div>`;
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
        // Send to the specific active channel only
        if (window._crFloatActiveChannel === 'general') {
            await _sendToGeneralChat(action.message, me, true);
        } else if (window._crFloatActiveChannel && window._crFloatActiveChannel.startsWith('dm_')) {
            await _sendToPrivateChannel(window._crFloatActiveChannel, action.message, me, true);
        } else {
            // Default to general chat if no channel selected
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
            .filter(ch => !q || (ch.agentName || '').toLowerCase().includes(q))
            .sort((a, b) => (b.lastMsgTime || 0) - (a.lastMsgTime || 0));

        channels.forEach(ch => {
            const name = ch.agentName || 'User';
            const avatarContent = _getInitials(name);
            const preview = ch.lastMsg ? _truncate(ch.lastMsg.text, 25) : 'No messages';
            const timeStr = ch.lastMsgTime ? _formatTime(ch.lastMsgTime) : '';
            const unreadBadge = ch.unread > 0 ? `<div class="cr-unread-badge" style="margin-left:auto;background:#10b981;color:white;border-radius:10px;min-width:18px;height:18px;font-size:9px;display:flex;align-items:center;justify-content:center;padding:0 4px;">${ch.unread}</div>` : '';

            html += `<div style="display:flex;align-items:center;gap:12px;padding:10px;border-radius:12px;cursor:pointer;margin-bottom:4px;" onclick="window._crOpenFloatChat('${ch.channelId}')">
                <div style="width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,0.05);font-size:14px;font-weight:900;color:#10b981;">${avatarContent}</div>
                <div style="flex:1;"><div style="font-size:12px;font-weight:800;color:white;">${_escHtml(name)}</div><div style="font-size:9px;color:#475569;">${_escHtml(preview)}</div></div>
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

    window._crOpenFloatChat = function(channelId) {
        if (window.currentTab === 'chatroom') return;
        window._crFloatActiveChannel = channelId;

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
                        const timeStr = new Date(msg.timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
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
                        html += `<div style="display:flex;justify-content:${isSent ? 'flex-end' : 'flex-start'};margin-bottom:10px;"
                                     onmouseenter="var b=this.querySelector('.cr-tb');if(b)b.style.opacity='1'"
                                     onmouseleave="var b=this.querySelector('.cr-tb');if(b&&b.getAttribute('data-has')!=='1')b.style.opacity='0'">
                            <div style="max-width:80%;">
                                <div style="padding:8px 12px;border-radius:12px;${isQuickAction ? 'background:rgba(239,68,68,0.15);border-left:3px solid #ef4444;' : 'background:rgba(255,255,255,0.04);'}">
                                    ${!isSent ? `<div style="font-size:9px;${senderClass} font-weight:800;margin-bottom:2px;">${senderIcon}${_escHtml(senderName)}</div>` : ''}
                                    <div style="font-size:11px;color:white;${isQuickAction ? 'font-weight:800;color:#f87171;' : ''}">${_escHtml(msg.text)}</div>
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
                        const timeStr = new Date(msg.timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
                        const isQuickAction = msg.isQuickAction;
                        const ri = _getReactionInfo(msg.id, me.id);
                        html += `<div style="display:flex;justify-content:${isSent ? 'flex-end' : 'flex-start'};margin-bottom:10px;"
                                     onmouseenter="var b=this.querySelector('.cr-tb');if(b)b.style.opacity='1'"
                                     onmouseleave="var b=this.querySelector('.cr-tb');if(b&&b.getAttribute('data-has')!=='1')b.style.opacity='0'">
                            <div style="max-width:80%;">
                                <div style="padding:8px 12px;border-radius:12px;${isQuickAction ? 'background:rgba(239,68,68,0.15);border-left:3px solid #ef4444;' : 'background:rgba(255,255,255,0.04);'}">
                                    <div style="font-size:11px;color:white;${isQuickAction ? 'font-weight:800;color:#f87171;' : ''}">${_escHtml(msg.text)}</div>
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

    window._crFloatSend = async function() {
        const input = document.getElementById('cr-float-input');
        if (!input) return;
        const text = input.value.trim();
        if (!text || !window._crFloatActiveChannel) return;
        const me = _getMyIdentity();
        let success = false;
        if (window._crFloatActiveChannel === 'general') {
            success = await _sendToGeneralChat(text, me, false);
        } else if (window._crFloatActiveChannel.startsWith('dm_')) {
            success = await _sendToPrivateChannel(window._crFloatActiveChannel, text, me, false);
        }
        if (success) {
            input.value = '';
            if (window._crFloatActiveChannel === 'general') {
                const body = document.getElementById('cr-float-body');
                if (body && _generalChatMessages.length) {
                    let html = '';
                    const sortedMessages = [..._generalChatMessages].sort((a, b) => a.timestamp - b.timestamp);
                    sortedMessages.slice(-30).forEach(msg => {
                        const isSent = msg.from === me.id;
                        const timeStr = new Date(msg.timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
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
                        html += `<div style="display:flex;justify-content:${isSent ? 'flex-end' : 'flex-start'};margin-bottom:10px;"
                                     onmouseenter="var b=this.querySelector('.cr-tb');if(b)b.style.opacity='1'"
                                     onmouseleave="var b=this.querySelector('.cr-tb');if(b&&b.getAttribute('data-has')!=='1')b.style.opacity='0'">
                            <div style="max-width:80%;">
                                <div style="padding:8px 12px;border-radius:12px;${isQuickAction ? 'background:rgba(239,68,68,0.15);border-left:3px solid #ef4444;' : 'background:rgba(255,255,255,0.04);'}">
                                    ${!isSent ? `<div style="font-size:9px;${senderClass} font-weight:800;margin-bottom:2px;">${senderIcon}${_escHtml(senderName)}</div>` : ''}
                                    <div style="font-size:11px;color:white;${isQuickAction ? 'font-weight:800;color:#f87171;' : ''}">${_escHtml(msg.text)}</div>
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
        _loadPrivateChannels(me);
        _listenToGeneralChat(me);
    };

    console.log('[Chat] chatroom.js loaded - Quick actions: Come Quick and Help only');
})();
