// ============================================================================
//  模型 Token 统计（Model Token Totals） v0.2.0  SillyTavern UI Extension
//  目标版本：SillyTavern 1.18.0
//
//  三重视角：
//   1. 全局总额 —— totals[模型] 累计所有聊天的输入/输出 Token（持久化）
//   2. 当前聊天 —— chatTotals[聊天ID][模型] 记下每个聊天各自用掉的 Token
//   3. 悬浮球抽屉 —— 页面右下角悬浮球，点开小抽屉实时看「当前聊天 + 全局」
//
//  命令：/tokenstats  另在 设置-扩展 里有可点击入口。
// ============================================================================

const MODULE_ID = 'model-token-totals';

const DEFAULT_SETTINGS = Object.freeze({
    enabled: true,
    countUser: true,
    countOutput: true,
    totals: {}, //     { '<模型名>': { input, output, count } }            全局额度
    chatTotals: {},   // { '<聊天id>': { '<模型名>': { input, output, count } } }
});

let countedKeys = new Set();
let drawerOpen = false;

function getCtx() {
    const ctx = globalThis.SillyTavern?.getContext?.();
    if (!ctx) throw new Error('[' + MODULE_ID + '] SillyTavern 上下文不可用');
    return ctx;
}

function getSettings() {
    const context = getCtx();
    if (!context.extensionSettings[MODULE_ID] || typeof context.extensionSettings[MODULE_ID] !== 'object') {
        context.extensionSettings[MODULE_ID] = {};
    }
    const settings = context.extensionSettings[MODULE_ID];
    for (const key of Object.keys(DEFAULT_SETTINGS)) {
        if (!Object.hasOwn(settings, key)) {
            settings[key] = structuredClone(DEFAULT_SETTINGS[key]);
        }
    }
    return settings;
}

function currentModel() {
    const ctx = getCtx();
    let name = '';
    try {
        if (typeof ctx.getChatCompletionModel === 'function') name = ctx.getChatCompletionModel();
    } catch { /* 非 ChatCompletion 后端 */ }
    return String(name || '').trim() || String(ctx.mainApi || 'unknown');
}

function currentChatId() {
    const ctx = getCtx();
    const v = ctx.chatId ?? ctx.groupId ?? '';
    return String(v || '').trim();
}

function myFolder() {
    const url = import.meta?.url;
    if (!url) return MODULE_ID;
    try {
        const marker = '/scripts/extensions/';
        const path = new URL(url).pathname;
        const idx = path.indexOf(marker);
        if (idx < 0) return MODULE_ID;
        const rel = path.slice(idx + marker.length).replace(/\/[^/]+$/, '');
        return rel || MODULE_ID;
    } catch { return MODULE_ID; }
}

function fmt(n) { return Number(n || 0).toLocaleString('en-US'); }

function compact(n) {
    n = Number(n || 0);
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'm';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'k';
    return String(n);
}

function escapeHtml(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ============================================================================
// 统计核心
// ============================================================================
async function countMessage(messageId, kind) {
    const ctx = getCtx();
    const settings = getSettings();
    if (!settings.enabled) return;
    if (kind === 'input' && !settings.countUser) return;
    if (kind === 'output' && !settings.countOutput) return;

    const msg = ctx.chat?.[Number(messageId)];
    if (!msg || typeof msg.mes !== 'string' || !msg.mes.length) return;
    if (msg.is_system || msg.role === 'system') return;

    const key = messageId + ':' + kind + ':' + (msg.swipe_id ?? '-') + ':' + msg.mes.length;
    if (countedKeys.has(key)) return;
    countedKeys.add(key);

    let tokens = 0;
    try { tokens = Number(await ctx.getTokenCountAsync(msg.mes)) || 0; } catch { tokens = 0; }
    if (tokens === 0) return;

    const model = currentModel();
    const chatId = currentChatId();

    settings.totals[model] ??= { input: 0, output: 0, count: 0 };
    const ge = settings.totals[model];
    if (kind === 'input') ge.input += tokens; else ge.output += tokens;
    ge.count += 1;

    if (chatId) {
        settings.chatTotals[chatId] = settings.chatTotals[chatId] || {};
        const cm = settings.chatTotals[chatId][model] || (settings.chatTotals[chatId][model] = { input: 0, output: 0, count: 0 });
        if (kind === 'input') cm.input += tokens; else cm.output += tokens;
        cm.count += 1;
    }

    ctx.saveSettingsDebounced();
    renderFloatUI();
}

const onUserMessage = (messageId) => countMessage(messageId, 'input');
const onAssistantMessage = (messageId) => countMessage(messageId, 'output');
const onChatChanged = () => renderFloatUI();

// ============================================================================
// 悬浮球 + 抽屉
// ============================================================================
function injectFloat() {
    if (document.getElementById('mtt-float')) return;
    // eslint-disable-next-line no-undef
    const html =
        '<div id="mtt-float">' +
        '  <div id="mtt-fab" title="模型 Token 统计" role="button" tabindex="0">' +
        '    <i class="fa-solid fa-chart-simple"></i>' +
        '    <span id="mtt-fab-count">0</span>' +
        '  </div>' +
        '  <div id="mtt-drawer" class="mtt-drawer" hidden>' +
        '    <div class="mtt-drawer-head">' +
        '      <b>Token 统计</b>' +
        '      <div>' +
        '        <button id="mtt-drawer-refresh" class="mtt-icon-btn" title="刷新"><i class="fa-solid fa-rotate"></i></button>' +
        '        <button id="mtt-drawer-close" class="mtt-icon-btn" title="关闭"><i class="fa-solid fa-xmark"></i></button>' +
        '      </div>' +
        '    </div>' +
        '    <div class="mtt-drawer-body" id="mtt-drawer-body"></div>' +
        '  </div>' +
        '</div>';

    $('body').append(html);
    $('#mtt-fab').on('click', () => toggleDrawer());
    $('#mtt-drawer-close').on('click', () => toggleDrawer(false));
    $('#mtt-drawer-refresh').on('click', () => renderFloatUI());
    // ESC 关闭
    $(document).on('keydown.mtt', (e) => { if (e.key === 'Escape' && drawerOpen) toggleDrawer(false); });
}

function toggleDrawer(open) {
    drawerOpen = open !== undefined ? open : !drawerOpen;
    if (drawerOpen) {
        renderFloatUI();
        $('#mtt-drawer').prop('hidden', false);
    } else {
        $('#mtt-drawer').prop('hidden', true);
    }
}

function globalsummary() {
    const settings = getSettings();
    let input = 0, output = 0, msgCount = 0;
    const models = [];
    for (const [model, v] of Object.entries(settings.totals || {})) {
        const i = Number(v?.input || 0), o = Number(v?.output || 0);
        input += i; output += o; msgCount += Number(v?.count || 0);
        models.push({ model, input: i, output: o, total: i + o, count: Number(v?.count || 0) });
    }
    models.sort((a, b) => b.total - a.total);
    return { input, output, total: input + output, count: msgCount, models };
}

function currentChatSummary() {
    const settings = getSettings();
    const chatId = currentChatId();
    const byModel = chatId ? settings.chatTotals?.[chatId] || {} : {};
    const rows = [];
    let input = 0, output = 0, count = 0;
    for (const [model, v] of Object.entries(byModel)) {
        const i = Number(v?.input || 0), o = Number(v?.output || 0);
        input += i; output += o; count += Number(v?.count || 0);
        rows.push({ model, input: i, output: o, total: i + o, count: Number(v?.count || 0) });
    }
    rows.sort((a, b) => b.total - a.total);
    return { chatId, input, output, total: input + output, count, rows };
}

function renderFloatUI() {
    if (!$('#mtt-float').length) return;
    const global_ = globalsummary();
    const chat = currentChatSummary();

    $('#mtt-fab-count').text(compact(chat.total || global_.total));

    const chatHtml = '<div class="mtt-card">' +
        '<div class="mtt-card-title">当前聊天' + (chat.chatId ? '<span class="mtt-muted">' + escapeHtml(chat.chatId.slice(-6)) + '</span>' : '') + '</div>' +
        (chat.chatId
            ? '<div class="mtt-line"><span>输入</span><b>' + fmt(chat.input) + '</b></div>' +
              '<div class="mtt-line"><span>输出</span><b>' + fmt(chat.output) + '</b></div>' +
              '<div class="mtt-line mtt-line-total"><span>合计</span><b>' + fmt(chat.total) + ' <small>(' + chat.count + ' 条)</small></b></div>' +
              (chat.rows.length > 1 ? '<div class="mtt-models">' + chat.rows.map(r => '<div>' + escapeHtml(r.model) + ' · ' + compact(r.total) + '</div>').join('') + '</div>' : '')
            : '<div class="mtt-muted">尚未进入聊天</div>') +
        '</div>';

    const topModels = global_.models.slice(0, 4).map(r =>
        '<div class="mtt-line"><span title="' + escapeHtml(r.model) + '">' + escapeHtml(r.model) + '</span>' +
        '<b>' + compact(r.input) + ' / ' + compact(r.output) + '</b></div>').join('');
    const globalHtml = '<div class="mtt-card">' +
        '<div class="mtt-card-title">全局总额</div>' +
        '<div class="mtt-line mtt-line-total"><span>输入+输出</span><b>' + fmt(global_.total) + '</b></div>' +
        (topModels || '<div class="mtt-muted">暂无数据</div>') +
        '</div>';

    $('#mtt-drawer-body').html(
        chatHtml + globalHtml +
        '<div class="mtt-actions">' +
        '  <button id="mtt-open-win" class="mtt-btn">查看完整统计</button>' +
        '  <button id="mtt-reset-all" class="mtt-btn mtt-btn-danger">全局清零</button>' +
        '</div>'
    );
    $('#mtt-open-win').on('click', () => showFullPopup());
    $('#mtt-reset-all').on('click', () => {
        const settings = getSettings();
        settings.totals = {};
        settings.chatTotals = {};
        getCtx().saveSettingsDebounced();
        renderFloatUI();
        toastr.info('已清零全部 Token 统计');
    });
}

// ============================================================================
// 完整统计弹窗（/tokenstats）
// ============================================================================
async function showFullPopup() {
    const ctx = getCtx();
    const global_ = globalsummary();
    const chat = currentChatSummary();

    // 全局（按模型）表格
    const globalRows = global_.models.map(r => ({ ...r, input: fmt(r.input), output: fmt(r.output), total: fmt(r.total) }));
    const totalRow = { model: '合计所有模型', input: fmt(global_.input), output: fmt(global_.output), total: fmt(global_.total), count: global_.count };

    // 各聊天表格
    const settings = getSettings();
    const perChat = [];
    for (const [cid, byModel] of Object.entries(settings.chatTotals || {})) {
        let input = 0, output = 0, count = 0;
        for (const v of Object.values(byModel)) {
            input += Number(v?.input || 0); output += Number(v?.output || 0); count += Number(v?.count || 0);
        }
        perChat.push({ chatId: cid, input: fmt(input), output: fmt(output), total: fmt(input + output), count });
    }
    perChat.sort((a, b) => Number(b.total.replace(/,/g, '')) - Number(a.total.replace(/,/g, '')));

    const html = await ctx.renderExtensionTemplateAsync(myFolder(), 'window', {
        globalRows,
        totalRow,
        perChat,
        curChatId: chat.chatId || '',
        curInput: fmt(chat.input),
        curOutput: fmt(chat.output),
        curTotal: fmt(chat.total),
    });
    ctx.callGenericPopup(html, ctx.POPUP_TYPE.TEXT, '', { wide: true, large: true, allowVerticalScrolling: true });
}

// ============================================================================
// 设置页抽屉（设置在扩展面板）
// ============================================================================
async function initSettingsPanel() {
    const ctx = getCtx();
    const html = await ctx.renderExtensionTemplateAsync(myFolder(), 'settings');
    $('#extensions_settings2')?.append(html);

    const settings = getSettings();
    $('#mtt_enabled').prop('checked', settings.enabled).on('change', function () {
        settings.enabled = $(this).prop('checked');
        ctx.saveSettingsDebounced();
        renderFloatUI();
    });
    $('#mtt_count_user').prop('checked', settings.countUser).on('change', function () {
        settings.countUser = $(this).prop('checked');
        ctx.saveSettingsDebounced();
    });
    $('#mtt_count_output').prop('checked', settings.countOutput).on('change', function () {
        settings.countOutput = $(this).prop('checked');
        ctx.saveSettingsDebounced();
    });
    $('#mtt_open_drawer').on('click', () => toggleDrawer(true));
    $('#mtt_reset_all').on('click', () => {
        settings.totals = {};
        settings.chatTotals = {};
        ctx.saveSettingsDebounced();
        renderFloatUI();
        toastr.info('已清零全部 Token 统计');
    });
}

function registerCommand(ctx) {
    ctx.SlashCommandParser.addCommandObject(ctx.SlashCommand.fromProps({
        name: 'tokenstats',
        aliases: ['tstats', 'tt'],
        callback: () => toggleDrawer(true),
        returns: '',
        helpString: '<div>打开「模型 Token 统计」悬浮抽屉（全局总额 + 当前聊天）。</div>',
    }));
}

// ============================================================================
// 生命周期
// ============================================================================
export async function onActivate() {
    try {
        getSettings();
        const ctx = getCtx();
        countedKeys = new Set();
        ctx.eventSource.on(ctx.eventTypes.MESSAGE_SENT, onUserMessage);
        ctx.eventSource.on(ctx.eventTypes.MESSAGE_RECEIVED, onAssistantMessage);
        ctx.eventSource.on(ctx.eventTypes.CHAT_CHANGED, onChatChanged);
        registerCommand(ctx);
        injectFloat();
        renderFloatUI();
        await initSettingsPanel();
        console.log('[' + MODULE_ID + '] 已激活 v0.2.0');
    } catch (error) {
        console.error('[' + MODULE_ID + '] 激活失败：', error);
    }
}

export function onClean() {
    try {
        const ctx = getCtx();
        ctx.eventSource.removeListener(ctx.eventTypes.MESSAGE_SENT, onUserMessage);
        ctx.eventSource.removeListener(ctx.eventTypes.MESSAGE_RECEIVED, onAssistantMessage);
        ctx.eventSource.removeListener(ctx.eventTypes.CHAT_CHANGED, onChatChanged);
        $('#mtt-float')?.remove();
        $(document).off('keydown.mtt');
        $('#extensions_settings2 .model-token-totals-settings')?.remove();
    } catch { /* 忽略 */ }
}
