// ==UserScript==
// @name         IXL Auto Answer (OpenAI API Required)
// @namespace    http://tampermonkey.net/
// @version      9.1
// @license      GPL-3.0
// @description  IXL 解题脚本：Display-Only 模式使用 OpenAI SSE 流式实时渲染；Auto-Fill 保留自动填入。面板可拖拽+最小化，进度条、回滚、日志、令牌计数、默认折叠设置区。预置 gpt-4.1-nano。
// @match        https://*.ixl.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @require      https://cdn.jsdelivr.net/npm/marked@4.3.0/marked.min.js
// @require      https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js
// ==/UserScript==

(function () {
    'use strict';

    /*───────────────────────────────────────────────────────────────────────
       0. LaTeX 包装 & 反转义
    ───────────────────────────────────────────────────────────────────────*/
    function wrapLatex(s) {
        // 修复 (-$\frac{a}{b}$) → $-\frac{a}{b}$，并给裸 \frac 补 $$
        s = s.replace(/\(-\$\\frac\{([^}]+)\}\{([^}]+)\}\$\)/g, (_, a, b) => `$-\\frac{${a}}{${b}}$`);
        return s.replace(/\\frac\{[^}]+\}\{[^}]+\}/g, m => `$${m}$`);
    }
    function unescapeDollar(s) {
        return s.replace(/\\\$/g, '$');
    }

    /*───────────────────────────────────────────────────────────────────────
       1. 配置存储与迁移
    ───────────────────────────────────────────────────────────────────────*/
    const OLD1 = localStorage.getItem('gpt4o-modelConfigs');
    const OLD2 = localStorage.getItem('ixlAutoAnswerConfigs');
    if (!localStorage.getItem('myNewIxLStorage')) {
        if (OLD1) {
            localStorage.setItem('myNewIxLStorage', OLD1);
            localStorage.removeItem('gpt4o-modelConfigs');
        }
        if (OLD2) {
            localStorage.setItem('myNewIxLStorage', OLD2);
            localStorage.removeItem('ixlAutoAnswerConfigs');
        }
    }
    const modelConfigs = JSON.parse(localStorage.getItem('myNewIxLStorage') || '{}');
    if (!modelConfigs['gpt-4.1']) {
        modelConfigs['gpt-4.1'] = {
            apiKey: '',
            apiBase: 'https://api.openai.com/v1/chat/completions',
            discovered: false,
            modelList: []
        };
    }
    const config = {
        selectedModel: 'gpt-4.1',
        language: localStorage.getItem('myIxLLang') || 'en',
        mode: 'displayOnly',        // "autoFill" | "displayOnly"
        autoSubmit: false,
        totalTokens: 0,
        lastState: null
    };
    function saveConfig() {
        localStorage.setItem('myNewIxLStorage', JSON.stringify(modelConfigs));
        localStorage.setItem('myIxLLang', config.language);
    }

    /*───────────────────────────────────────────────────────────────────────
       2. 多语言文案
    ───────────────────────────────────────────────────────────────────────*/
    const langText = {
        en: {
            panelTitle: "IXL Auto Answer (OpenAI API Required)",
            modeLabel: "Mode",
            modeAuto: "Auto Fill (Unstable)",
            modeDisp: "Display Answer Only (stream)",
            startButton: "Start Answering",
            rollbackButton: "Rollback",
            configAssistant: "Config Assistant",
            closeButton: "Close",
            logsButton: "Logs",
            logsHide: "Hide Logs",
            tokensLabel: "Tokens: ",
            statusIdle: "Status: Idle",
            statusWaiting: "Streaming...",
            statusDone: "Done.",
            requestError: "Request error: ",
            finalAnswerTitle: "Final Answer",
            stepsTitle: "Solution Steps",
            missingAnswerTag: "Missing <answer> tag",
            modelSelectLabel: "Model",
            modelDescLabel: "Model Description",
            customModelPlaceholder: "Custom model name",
            languageLabel: "Language",
            autoSubmitLabel: "Auto Submit",
            rentKeyButton: "Rent Key (Support Me!)",
            settingsKeyButton: "Toggle Settings",
            apiKeyLabel: "API Key",
            saveButton: "Save",
            testKeyButton: "Test Key",
            testKeyMsg: "Testing key...",
            keyOK: "API key valid.",
            keyBad: "API key invalid (missing 'test success').",
            placeKey: "Enter your API key",
            placeBase: "Enter your API base URL",
            apiBaseLabel: "API Base",
            refreshModels: "Refresh Models",
            getKeyLinkLabel: "Get API Key",
            disclaimAutoFill: "Warning: Auto Fill unstable.",
            minButton: "Min",
            shortAI: "Ask"
        },
        zh: {
            panelTitle: "IXL自动解题 (OpenAI)",
            modeLabel: "模式",
            modeAuto: "自动填入（不稳定）",
            modeDisp: "仅展示答案（流式）",
            startButton: "开始答题",
            rollbackButton: "撤回",
            configAssistant: "配置助手",
            closeButton: "关闭",
            logsButton: "日志",
            logsHide: "隐藏日志",
            tokensLabel: "用量: ",
            statusIdle: "状态：空闲",
            statusWaiting: "流式等待GPT...",
            statusDone: "完成。",
            requestError: "请求错误：",
            finalAnswerTitle: "最终答案",
            stepsTitle: "解题过程",
            missingAnswerTag: "缺少<answer>标签",
            modelSelectLabel: "模型",
            modelDescLabel: "模型介绍",
            customModelPlaceholder: "自定义模型名称",
            languageLabel: "语言",
            autoSubmitLabel: "自动提交",
            rentKeyButton: "租用Key (支持我!)",
            settingsKeyButton: "开关设置",
            apiKeyLabel: "API密钥",
            saveButton: "保存",
            testKeyButton: "测试密钥",
            testKeyMsg: "正在测试...",
            keyOK: "API密钥有效。",
            keyBad: "API密钥无效(缺'test success')",
            placeKey: "输入API密钥",
            placeBase: "输入API基础地址",
            apiBaseLabel: "API基础地址",
            refreshModels: "刷新模型列表",
            getKeyLinkLabel: "获取API Key",
            disclaimAutoFill: "警告：自动填入模式可能不稳定，请慎用。",
            minButton: "最小化",
            shortAI: "提问"
        }
    };

    /*───────────────────────────────────────────────────────────────────────
       3. 模型描述
    ───────────────────────────────────────────────────────────────────────*/
    const modelDescDB = {
        "gpt-4.1": "New Model, cheaper and a lot better than 4o",
        "gpt-4.1-mini": "New Model, cheaper and a little bit better than 4o",
        "gpt-4.1-nano": "Ultra-fast text-only.",
        "gpt-4o": "Solves images, cost-effective.",
        "gpt-4o-mini": "Text-only, cheaper.",
        "o1": "Best for images but slow & expensive.",
        "o3-mini": "Text-only, cheaper than o1.",
        "deepseek-reasoner": "No images, cheaper than o1.",
        "deepseek-chat": "No images, cheap & fast as 4o.",
        "o3": "Advanced multi-step reasoning model.",
        "o4-mini": "Compact variant of o4 architecture.",
        "chatgpt-4o-least": "RLHF version, can be error-prone.",
        "custom": "User-defined model"
    };

    /*───────────────────────────────────────────────────────────────────────
       4. 构建 UI
    ───────────────────────────────────────────────────────────────────────*/
    const panel = document.createElement("div");
    panel.id = "ixl-auto-panel";
    panel.innerHTML = `
<div class="ixl-header">
  <span id="panel-title">${langText[config.language].panelTitle}</span>
  <span id="token-count">${langText[config.language].tokensLabel}0</span>
  <button id="btn-min" title="${langText[config.language].minButton}">—</button>
  <button id="btn-logs">${langText[config.language].logsButton}</button>
  <button id="btn-close">${langText[config.language].closeButton}</button>
</div>
<div class="ixl-content" id="ixl-body">
  <div class="row">
    <label>${langText[config.language].modeLabel}:</label>
    <select id="sel-mode" style="width:100%;">
      <option value="autoFill">${langText[config.language].modeAuto}</option>
      <option value="displayOnly">${langText[config.language].modeDisp}</option>
    </select>
  </div>
  <div class="row" style="margin-top:8px; display:flex; gap:8px;">
    <button id="btn-start" class="btn-accent" style="flex:1;">${langText[config.language].startButton}</button>
    <button id="btn-rollback" class="btn-normal" style="flex:1;">${langText[config.language].rollbackButton}</button>
    <button id="btn-config-assist" class="btn-mini" style="flex:0;">${langText[config.language].configAssistant}</button>
  </div>
  <div id="answer-box" style="display:none; border:1px solid #999; padding:6px; background:#fff; margin-top:6px;">
    <h4 id="answer-title">${langText[config.language].finalAnswerTitle}</h4>
    <div id="answer-content" style="font-size:15px; font-weight:bold; color:#080;"></div>
    <hr/>
    <h5 id="steps-title">${langText[config.language].stepsTitle}</h5>
    <div id="steps-content" style="font-size:13px; color:#666;"></div>
  </div>
  <div id="progress-area" style="display:none; margin-top:8px;">
    <progress id="progress-bar" max="100" value="0" style="width:100%;"></progress>
    <span id="progress-label">${langText[config.language].statusWaiting}</span>
  </div>
  <p id="status-line" style="font-weight:bold; margin-top:6px;">${langText[config.language].statusIdle}</p>
  <div id="log-area" style="display:none; max-height:120px; overflow-y:auto; background:#fff; border:1px solid #888; margin-top:6px; padding:4px; font-family:monospace;"></div>
  <div class="row" style="margin-top:10px;">
    <button id="btn-rent" class="btn-normal" style="width:100%; font-weight:bold;">${langText[config.language].rentKeyButton}</button>
    <button id="btn-settings" class="btn-normal" style="width:100%; font-weight:bold; margin-top:6px;">${langText[config.language].settingsKeyButton}</button>
  </div>
  <div id="settings-area">
    <label>${langText[config.language].modelSelectLabel}:</label>
    <select id="sel-model" style="width:100%;"></select>
    <p id="model-desc" style="font-size:12px; color:#666; margin:4px 0;"></p>
    <div id="custom-model-area" style="display:none;"><input type="text" id="custom-model-input" style="width:100%;" placeholder="${langText[config.language].customModelPlaceholder}"/></div>
    <div class="row" style="margin-top:8px;">
      <label>${langText[config.language].languageLabel}:</label>
      <select id="sel-lang" style="width:100%;">
        <option value="en">English</option>
        <option value="zh">中文</option>
      </select>
    </div>
    <div id="auto-submit-row" style="margin-top:8px;"><label>${langText[config.language].autoSubmitLabel}:</label><input type="checkbox" id="chk-auto-submit"/></div>
    <div class="row" style="margin-top:10px;">
      <label>${langText[config.language].apiKeyLabel}:</label>
      <div style="display:flex; gap:4px; margin-top:4px;">
        <input type="password" id="txt-apikey" style="flex:1;" placeholder="${langText[config.language].placeKey}"/>
        <button id="btn-save-key">${langText[config.language].saveButton}</button>
        <button id="btn-test-key">${langText[config.language].testKeyButton}</button>
      </div>
    </div>
    <div class="row" style="margin-top:8px;">
      <label>${langText[config.language].apiBaseLabel}:</label>
      <div style="display:flex; gap:4px; margin-top:4px;">
        <input type="text" id="txt-apibase" style="flex:1;" placeholder="${langText[config.language].placeBase}"/>
        <button id="btn-save-base">${langText[config.language].saveButton}</button>
      </div>
    </div>
    <label style="display:block; margin-top:6px;">${langText[config.language].getKeyLinkLabel}:</label>
    <div style="display:flex; gap:4px; margin-top:4px;">
      <a id="link-getkey" href="#" target="_blank" class="link-btn" style="flex:1;">Link</a>
      <button id="btn-refresh" class="btn-normal" style="flex:1;">${langText[config.language].refreshModels}</button>
    </div>
  </div>
</div>`;
    document.body.appendChild(panel);

    GM_addStyle(`
#ixl-auto-panel{position:fixed;top:20px;right:20px;width:460px;max-height:500px;background:#fff;border-radius:6px;box-shadow:0 2px 10px rgba(0,0,0,.3);font-family:"Segoe UI",Arial,sans-serif;font-size:14px;overflow-y:auto;z-index:99999999;}
.ixl-header{background:#4caf50;color:#fff;display:flex;align-items:center;gap:6px;padding:6px;cursor:move;user-select:none;}
.ixl-header button{background:#fff;color:#333;border:none;border-radius:3px;padding:0 6px;font-weight:bold;cursor:pointer;}
.ixl-header button:hover{background:#eee;}
.ixl-content{padding:10px;}
#settings-area{display:none;}
.btn-accent{background:#f0ad4e;color:#fff;border:none;border-radius:4px;font-weight:bold;}
.btn-accent:hover{background:#ec971f;}
.btn-normal{background:#ddd;color:#333;border:none;border-radius:4px;}
.btn-normal:hover{background:#ccc;}
.btn-mini{background:#bbb;color:#333;border:none;border-radius:4px;font-size:12px;padding:4px 6px;}
.btn-mini:hover{background:#aaa;}
.link-btn{background:#2f8ee0;color:#fff;text-align:center;padding:6px;border-radius:4px;text-decoration:none;}
.link-btn:hover{opacity:.8;}
`);

    /*───────────────────────────────────────────────────────────────────────
       5. UI 参考
    ───────────────────────────────────────────────────────────────────────*/
    const UI = {
        panel,
        header: panel.querySelector('.ixl-header'),
        body: document.getElementById('ixl-body'),
        minBtn: document.getElementById('btn-min'),
        logsBtn: document.getElementById('btn-logs'),
        closeBtn: document.getElementById('btn-close'),
        tokenCount: document.getElementById('token-count'),
        modeSelect: document.getElementById('sel-mode'),
        startBtn: document.getElementById('btn-start'),
        rollbackBtn: document.getElementById('btn-rollback'),
        confAssistBtn: document.getElementById('btn-config-assist'),
        answerBox: document.getElementById('answer-box'),
        answerContent: document.getElementById('answer-content'),
        stepsContent: document.getElementById('steps-content'),
        progressArea: document.getElementById('progress-area'),
        progressBar: document.getElementById('progress-bar'),
        progressLabel: document.getElementById('progress-label'),
        statusLine: document.getElementById('status-line'),
        logArea: document.getElementById('log-area'),
        rentBtn: document.getElementById('btn-rent'),
        settingsBtn: document.getElementById('btn-settings'),
        settingsArea: document.getElementById('settings-area'),
        modelSelect:	document.getElementById('sel-model'),
        modelDesc:	document.getElementById('model-desc'),
        customModelArea: document.getElementById('custom-model-area'),
        customModelInput: document.getElementById('custom-model-input'),
        langSelect:	document.getElementById('sel-lang'),
        autoSubmitRow: document.getElementById('auto-submit-row'),
        autoSubmitToggle: document.getElementById('chk-auto-submit'),
        txtApiKey:	document.getElementById('txt-apikey'),
        saveKeyBtn:	document.getElementById('btn-save-key'),
        testKeyBtn:	document.getElementById('btn-test-key'),
        txtApiBase:	document.getElementById('txt-apibase'),
        saveBaseBtn:	document.getElementById('btn-save-base'),
        linkGetKey:	document.getElementById('link-getkey'),
        refreshBtn:	document.getElementById('btn-refresh')
    };

    /*───────────────────────────────────────────────────────────────────────
       6. 日志助手
    ───────────────────────────────────────────────────────────────────────*/
    function logMsg(msg) {
        const div = document.createElement('div');
        div.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
        UI.logArea.appendChild(div);
        console.log('[IXL-Auto]', msg);
    }
    function logDump(label, val) {
        try {
            logMsg(`[DUMP] ${label}: ${JSON.stringify(val)}`);
        } catch (e) {
            logMsg(`[DUMP] ${label}: ${String(val)}`);
        }
    }

    /*───────────────────────────────────────────────────────────────────────
       7. 更新语言文本
    ───────────────────────────────────────────────────────────────────────*/
    function updateLangText() {
        UI.logsBtn.textContent = UI.logArea.style.display === 'none'
            ? langText[config.language].logsButton
            : langText[config.language].logsHide;
        UI.closeBtn.textContent = langText[config.language].closeButton;
        UI.tokenCount.textContent = langText[config.language].tokensLabel + config.totalTokens;
        UI.statusLine.textContent = langText[config.language].statusIdle;
        UI.progressLabel.textContent = langText[config.language].statusWaiting;
        UI.modeSelect.options[0].text = langText[config.language].modeAuto;
        UI.modeSelect.options[1].text = langText[config.language].modeDisp;
        UI.startBtn.textContent = langText[config.language].startButton;
        UI.rollbackBtn.textContent = langText[config.language].rollbackButton;
        UI.confAssistBtn.textContent = langText[config.language].configAssistant;
        document.getElementById('answer-title').textContent = langText[config.language].finalAnswerTitle;
        document.getElementById('steps-title').textContent = langText[config.language].stepsTitle;
        UI.txtApiKey.placeholder = langText[config.language].placeKey;
        UI.txtApiBase.placeholder = langText[config.language].placeBase;
        UI.saveKeyBtn.textContent = langText[config.language].saveButton;
        UI.testKeyBtn.textContent = langText[config.language].testKeyButton;
        UI.saveBaseBtn.textContent = langText[config.language].saveButton;
        UI.linkGetKey.textContent = langText[config.language].getKeyLinkLabel;
        UI.refreshBtn.textContent = langText[config.language].refreshModels;
        UI.rentBtn.textContent = langText[config.language].rentKeyButton;
        UI.settingsBtn.textContent = langText[config.language].settingsKeyButton;
        UI.minBtn.title = langText[config.language].minButton;
    }
    updateLangText();

    /*───────────────────────────────────────────────────────────────────────
       8. 构建模型选择
    ───────────────────────────────────────────────────────────────────────*/
    function buildModelSelect() {
        UI.modelSelect.innerHTML = '';
        const ogPre = document.createElement('optgroup');
        ogPre.label = 'Predefined';
        ['gpt-4.1','gpt-4.1-mini','gpt-4.1-nano','gpt-4o','gpt-4o-mini','o3','o4-mini','o1','o3-mini','deepseek-reasoner','deepseek-chat','chatgpt-4o-least']
            .forEach(m => {
                const o = document.createElement('option');
                o.value = m;
                o.textContent = m;
                ogPre.appendChild(o);
            });
        UI.modelSelect.appendChild(ogPre);
        const discovered = Object.keys(modelConfigs).filter(k => modelConfigs[k].discovered);
        if (discovered.length) {
            const ogDisc = document.createElement('optgroup');
            ogDisc.label = 'Discovered';
            discovered.forEach(m => {
                const o = document.createElement('option');
                o.value = m;
                o.textContent = m;
                ogDisc.appendChild(o);
            });
            UI.modelSelect.appendChild(ogDisc);
        }
        const optCust = document.createElement('option');
        optCust.value = 'custom';
        optCust.textContent = 'custom';
        UI.modelSelect.appendChild(optCust);

        UI.modelSelect.value = config.selectedModel in modelDescDB ? config.selectedModel : 'custom';
        UI.modelDesc.textContent = modelDescDB[config.selectedModel] || 'User-defined model';
        UI.customModelArea.style.display = config.selectedModel === 'custom' ? 'block' : 'none';
    }

    /*───────────────────────────────────────────────────────────────────────
       9. 拖拽 & 最小化
    ───────────────────────────────────────────────────────────────────────*/
    let dragOn = false, dx = 0, dy = 0;
    UI.header.addEventListener('mousedown', e => {
        if (e.target.tagName === 'BUTTON') return;
        dragOn = true;
        dx = e.clientX - panel.offsetLeft;
        dy = e.clientY - panel.offsetTop;
        panel.style.opacity = 0.8;
    });
    document.addEventListener('mousemove', e => {
        if (!dragOn) return;
        panel.style.left = (e.clientX - dx) + 'px';
        panel.style.top = (e.clientY - dy) + 'px';
    });
    document.addEventListener('mouseup', () => {
        dragOn = false;
        panel.style.opacity = 1;
    });
    let minimized = false;
    UI.minBtn.addEventListener('click', () => {
        minimized = !minimized;
        UI.body.style.display = minimized ? 'none' : 'block';
        UI.minBtn.textContent = minimized ? '+' : '—';
    });

    /*───────────────────────────────────────────────────────────────────────
       10. 事件绑定
    ───────────────────────────────────────────────────────────────────────*/
    UI.logsBtn.addEventListener('click', () => {
        UI.logArea.style.display = UI.logArea.style.display === 'none' ? 'block' : 'none';
        updateLangText();
    });
    UI.closeBtn.addEventListener('click', () => {
        panel.style.display = 'none';
    });
    UI.modeSelect.addEventListener('change', () => {
        config.mode = UI.modeSelect.value;
        if (config.mode === 'autoFill') {
            UI.answerBox.style.display = 'none';
            UI.autoSubmitRow.style.display = 'block';
            alert(langText[config.language].disclaimAutoFill);
        } else {
            UI.answerBox.style.display = 'none';
            UI.autoSubmitRow.style.display = 'none';
        }
    });
    UI.startBtn.addEventListener('click', startAnswer);
    UI.rollbackBtn.addEventListener('click', () => {
        if (config.lastState) {
            const d = getQuestionDiv();
            if (d) {
                d.innerHTML = config.lastState;
                logMsg('Rolled back.');
            }
        } else logMsg('No stored state.');
    });
    UI.confAssistBtn.addEventListener('click', openConfigAssistant);
    UI.autoSubmitToggle.addEventListener('change', () => {
        config.autoSubmit = UI.autoSubmitToggle.checked;
    });
    UI.modelSelect.addEventListener('change', () => {
        config.selectedModel = UI.modelSelect.value;
        if (!modelConfigs[config.selectedModel]) {
            modelConfigs[config.selectedModel] = {
                apiKey: '',
                apiBase: 'https://api.openai.com/v1/chat/completions',
                discovered: false,
                modelList: []
            };
        }
        UI.customModelArea.style.display = config.selectedModel === 'custom' ? 'block' : 'none';
        UI.modelDesc.textContent = modelDescDB[config.selectedModel] || 'User-defined model';
        UI.txtApiKey.value = modelConfigs[config.selectedModel].apiKey;
        UI.txtApiBase.value = modelConfigs[config.selectedModel].apiBase;
        if (config.selectedModel.toLowerCase().includes('deepseek')) {
            UI.txtApiBase.value = 'https://api.deepseek.com/v1/chat/completions';
            modelConfigs[config.selectedModel].apiBase = 'https://api.deepseek.com/v1/chat/completions';
        }
        updateManageLink();
    });
    UI.customModelInput.addEventListener('change', () => {
        const name = UI.customModelInput.value.trim();
        if (!name) return;
        config.selectedModel = name;
        if (!modelConfigs[name]) {
            modelConfigs[name] = {
                apiKey: '',
                apiBase: 'https://api.openai.com/v1/chat/completions',
                discovered: false,
                modelList: []
            };
        }
        buildModelSelect();
        UI.modelSelect.value = 'custom';
        UI.txtApiKey.value = modelConfigs[name].apiKey;
        UI.txtApiBase.value = modelConfigs[name].apiBase;
        updateManageLink();
    });
    UI.langSelect.addEventListener('change', () => {
        config.language = UI.langSelect.value;
        saveConfig();
        updateLangText();
    });
    UI.rentBtn.addEventListener('click', openRentPopup);
    UI.saveKeyBtn.addEventListener('click', () => {
        modelConfigs[config.selectedModel].apiKey = UI.txtApiKey.value.trim();
        saveConfig();
        logMsg('API key saved.');
    });
    UI.testKeyBtn.addEventListener('click', testApiKey);
    UI.saveBaseBtn.addEventListener('click', () => {
        modelConfigs[config.selectedModel].apiBase = UI.txtApiBase.value.trim();
        saveConfig();
        logMsg('API base saved.');
    });
    UI.refreshBtn.addEventListener('click', refreshModelList);
    UI.settingsBtn.addEventListener('click', () => {
        UI.settingsArea.style.display = UI.settingsArea.style.display === 'none' ? 'block' : 'none';
    });

    /*───────────────────────────────────────────────────────────────────────
       11. 更新管理链接
    ───────────────────────────────────────────────────────────────────────*/
    function updateManageLink() {
        const mod = config.selectedModel.toLowerCase();
        const link = mod.includes('deepseek')
            ? 'https://platform.deepseek.com/api_keys'
            : 'https://platform.openai.com/api-keys';
        modelConfigs[config.selectedModel].manageUrl = link;
        UI.linkGetKey.href = link;
        saveConfig();
    }

    /*───────────────────────────────────────────────────────────────────────
       12. 租用弹窗
    ───────────────────────────────────────────────────────────────────────*/
    function openRentPopup() {
        const overlay = document.createElement('div');
        Object.assign(overlay.style, {
            position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
            backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 999999999
        });
        const box = document.createElement('div');
        Object.assign(box.style, {
            position: 'absolute', top: '50%', left: '50%',
            transform: 'translate(-50%,-50%)', width: '300px',
            backgroundColor: '#fff', borderRadius: '6px', padding: '10px'
        });
        box.innerHTML = `
<h3 style="margin-top:0;">Rent Key</h3>
<p>Contact me to rent an API key:</p>
<ul>
  <li>felixliujy@gmail.com</li>
  <li>admin@obanarchy.org</li>
</ul>
<p>Thanks for supporting!</p>
<button id="rent-close-btn">${langText[config.language].closeButton}</button>
`;
        overlay.appendChild(box);
        document.body.appendChild(overlay);
        box.querySelector('#rent-close-btn').addEventListener('click', () => {
            document.body.removeChild(overlay);
        });
    }

    /*───────────────────────────────────────────────────────────────────────
       13. 测试 API Key
    ───────────────────────────────────────────────────────────────────────*/
    function testApiKey() {
        UI.statusLine.textContent = langText[config.language].testKeyMsg;
        const conf = modelConfigs[config.selectedModel];
        const payload = {
            model: config.selectedModel,
            messages: [
                { role: "system", content: "Test key." },
                { role: "user", content: "Please ONLY respond with: test success" }
            ]
        };
        GM_xmlhttpRequest({
            method: "POST",
            url: conf.apiBase,
            headers: {
                "Content-Type": "application/json",
                "Authorization": "Bearer " + conf.apiKey
            },
            data: JSON.stringify(payload),
            onload: (resp) => {
                UI.statusLine.textContent = langText[config.language].statusIdle;
                try {
                    const data = JSON.parse(resp.responseText);
                    const c = data.choices[0].message.content.toLowerCase();
                    alert(c.includes("test success") ? langText[config.language].keyOK : langText[config.language].keyBad);
                } catch (e) {
                    alert("Parse error: " + e);
                }
            },
            onerror: (err) => {
                UI.statusLine.textContent = langText[config.language].statusIdle;
                alert("Test error: " + JSON.stringify(err));
            }
        });
    }

    /*───────────────────────────────────────────────────────────────────────
       14. 刷新模型列表
    ───────────────────────────────────────────────────────────────────────*/
    function refreshModelList() {
        const c = modelConfigs[config.selectedModel];
        if (!c) return;
        const url = c.apiBase.replace("/chat/completions", "/models");
        logMsg("Refreshing models from: " + url);
        GM_xmlhttpRequest({
            method: "GET",
            url: url,
            headers: {
                "Authorization": "Bearer " + c.apiKey
            },
            onload: (resp) => {
                try {
                    const d = JSON.parse(resp.responseText);
                    logDump("Model Refresh", d);
                    if (Array.isArray(d.data)) {
                        const arr = d.data.map(x => x.id);
                        c.modelList = arr;
                        for (let m of arr) {
                            if (!modelConfigs[m]) {
                                modelConfigs[m] = {
                                    apiKey: c.apiKey,
                                    apiBase: c.apiBase,
                                    discovered: true,
                                    modelList: []
                                };
                            }
                        }
                        saveConfig();
                        buildModelSelect();
                        alert("Found models: " + arr.join(", "));
                    }
                } catch (e) {
                    alert("Parse error: " + e);
                }
            },
            onerror: (err) => {
                alert("Refresh error: " + JSON.stringify(err));
            }
        });
    }

    /*───────────────────────────────────────────────────────────────────────
       15. Config Assistant
    ───────────────────────────────────────────────────────────────────────*/
    function openConfigAssistant() {
        const overlay = document.createElement('div');
        Object.assign(overlay.style, {
            position: 'fixed', top: 0, left: 0,
            width: '100%', height: '100%',
            backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 999999999
        });
        const box = document.createElement('div');
        Object.assign(box.style, {
            position: 'absolute',
            top: '50%', left: '50%',
            transform: 'translate(-50%,-50%)',
            width: '340px', backgroundColor: '#fff',
            borderRadius: '6px', padding: '10px'
        });
        box.innerHTML = `
<h3 style="margin-top:0;">${langText[config.language].configAssistant}</h3>
<textarea id="assistant-inp" style="width:100%;height:80px;"></textarea>
<button id="assistant-ask" style="margin-top:6px;">${langText[config.language].shortAI}</button>
<button id="assistant-close" style="margin-top:6px;">${langText[config.language].closeButton}</button>
<div id="assistant-out" style="margin-top:6px;border:1px solid #ccc;background:#fafafa;padding:6px;white-space:pre-wrap;max-height:200px;overflow-y:auto;"></div>`;
        overlay.appendChild(box);
        document.body.appendChild(overlay);
        const closeBtn = box.querySelector('#assistant-close');
        const askBtn = box.querySelector('#assistant-ask');
        const inp = box.querySelector('#assistant-inp');
        const outDiv = box.querySelector('#assistant-out');
        closeBtn.addEventListener('click', () => document.body.removeChild(overlay));
        askBtn.addEventListener('click', () => {
            const q = inp.value.trim();
            if (!q) return;
            outDiv.textContent = '(waiting…)';
            askAssistant(q,
                resp => { outDiv.innerHTML = marked.parse(resp || ''); },
                err => { outDiv.textContent = '[Error] ' + err; }
            );
        });
    }
    function askAssistant(question, onSuccess, onError) {
        const conf = modelConfigs[config.selectedModel];
        const payload = {
            model: config.selectedModel,
            messages: [
                { role: 'system', content: 'You are the config assistant. Provide concise, helpful configuration advice.' },
                { role: 'user', content: question }
            ]
        };
        GM_xmlhttpRequest({
            method: 'POST',
            url: conf.apiBase,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + conf.apiKey
            },
            data: JSON.stringify(payload),
            onload: resp => {
                try {
                    const d = JSON.parse(resp.responseText);
                    onSuccess(d.choices[0].message.content);
                } catch (e) {
                    onError(e);
                }
            },
            onerror: err => { onError(err); }
        });
    }

    /*───────────────────────────────────────────────────────────────────────
       16. 获取题目 DIV / 捕获 LaTeX / 画布
    ───────────────────────────────────────────────────────────────────────*/
    function getQuestionDiv() {
        let d = document.evaluate(
            '/html/body/main/div/article/section/section/div/div[1]',
            document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null
        ).singleNodeValue;
        if (!d) d = document.querySelector('main div.article, main>div, article');
        return d;
    }
    function captureLatex(div) {
        const arr = div.querySelectorAll('script[type="math/tex"], .MathJax, .mjx-chtml');
        if (arr.length) {
            let s = '';
            arr.forEach(e => s += e.textContent + '\n');
            return s;
        }
        return null;
    }
    function captureCanvas(div) {
        const c = div.querySelector('canvas');
        if (c) {
            const cv = document.createElement('canvas');
            cv.width = c.width; cv.height = c.height;
            cv.getContext('2d').drawImage(c, 0, 0);
            return cv.toDataURL('image/png').split(',')[1];
        }
        return null;
    }

    /*───────────────────────────────────────────────────────────────────────
       17. 进度条助手
    ───────────────────────────────────────────────────────────────────────*/
    let progTimer = null;
    function startProgress() {
        UI.progressArea.style.display = 'block';
        UI.progressBar.value = 0;
        progTimer = setInterval(() => {
            if (UI.progressBar.value < 90) UI.progressBar.value += 2;
        }, 200);
    }
    function stopProgress() {
        clearInterval(progTimer);
        UI.progressBar.value = 100;
        setTimeout(() => {
            UI.progressArea.style.display = 'none';
            UI.progressBar.value = 0;
        }, 400);
    }

    /*───────────────────────────────────────────────────────────────────────
       18. 主逻辑：startAnswer()
    ───────────────────────────────────────────────────────────────────────*/
    function startAnswer() {
        logMsg('Start pressed.');
        const qDiv = getQuestionDiv();
        if (!qDiv) { logMsg('Question div not found'); return; }
        config.lastState = qDiv.innerHTML;

        let userPrompt = 'HTML:\n' + qDiv.outerHTML + '\n';
        const latex = captureLatex(qDiv);
        if (latex) userPrompt += 'LaTeX:\n' + latex + '\n';
        else {
            const c64 = captureCanvas(qDiv);
            if (c64) userPrompt += 'Canvas image base64 attached.\n';
        }

        UI.answerBox.style.display = 'none';
        UI.statusLine.textContent = langText[config.language].statusWaiting;
        startProgress();

        const autoFillPrompt = `
You are an IXL math solver with automation support.
1. Solve the problem.
2. Provide final answer inside <answer>...</answer>.
3. After a blank line, show steps in Markdown.
4. At end, include one \`\`\`javascript block to autofill the input.`;

        const displayOnlyPrompt = `
You are an IXL math solver.
First return <answer>RESULT</answer> on its own line.
Then a blank line, then solution steps in Markdown.`;

        const messages = config.mode === 'autoFill'
            ? [{ role: 'system', content: autoFillPrompt }, { role: 'user', content: userPrompt }]
            : [{ role: 'system', content: displayOnlyPrompt }, { role: 'user', content: userPrompt }];

        const payload = {
            model: config.selectedModel,
            messages: messages,
            stream: config.mode === 'displayOnly'
        };
        const conf = modelConfigs[config.selectedModel];

        if (config.mode === 'displayOnly') {
            // SSE 流式
            let buffer = '';
            let answerDone = false;
            GM_xmlhttpRequest({
                method: 'POST',
                url: conf.apiBase,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + conf.apiKey,
                    'Accept': 'text/event-stream'
                },
                data: JSON.stringify(payload),
                onprogress: e => {
                    const chunk = e.responseText.substring(e.loadedPrev || 0);
                    e.loadedPrev = e.responseText.length;
                    const lines = chunk.split('\n').filter(l => l.startsWith('data:'));
                    lines.forEach(line => {
                        const data = line.replace(/^data:\s*/, '').trim();
                        if (data === '[DONE]') return;
                        try {
                            const json = JSON.parse(data);
                            const delta = json.choices?.[0]?.delta?.content;
                            if (!delta) return;
                            buffer += delta;
                            if (!answerDone) {
                                const m = buffer.match(/<answer>[\s\S]*?<\/answer>/i);
                                if (m) {
                                    answerDone = true;
                                    UI.answerContent.innerHTML = marked.parse(wrapLatex(m[0]));
                                    UI.answerBox.style.display = 'block';
                                    if (window.MathJax && typeof MathJax.typesetPromise === 'function') {
                                        MathJax.typesetPromise([UI.answerContent]).catch(() => {});
                                    }
                                }
                            }
                        } catch {}
                    });
                },
                onload: () => {
                    stopProgress();
                    const md = buffer.replace(/<answer>[\s\S]*?<\/answer>/i, '').trim();
                    UI.stepsContent.innerHTML = marked.parse(wrapLatex(unescapeDollar(md)));
                    if (window.MathJax && typeof MathJax.typesetPromise === 'function') {
                        MathJax.typesetPromise([UI.stepsContent]).catch(() => {});
                    }
                    UI.statusLine.textContent = langText[config.language].statusDone;
                },
                onerror: err => {
                    stopProgress();
                    UI.statusLine.textContent = 'Stream error';
                    logDump('SSE error', err);
                }
            });
            return;
        }

        // AutoFill 模式
        GM_xmlhttpRequest({
            method: 'POST',
            url: conf.apiBase,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + conf.apiKey
            },
            data: JSON.stringify(payload),
            onload: resp => {
                stopProgress();
                try {
                    const d = JSON.parse(resp.responseText);
                    logDump('GPT raw', d);
                    if (d.usage?.total_tokens) {
                        config.totalTokens += d.usage.total_tokens;
                        UI.tokenCount.textContent = langText[config.language].tokensLabel + config.totalTokens;
                    }
                    const out = d.choices[0].message.content;
                    const ansMatch = out.match(/<answer>([\s\S]*?)<\/answer>/i);
                    const ansTag = ansMatch ? ansMatch[0] : `<answer>${langText[config.language].missingAnswerTag}</answer>`;
                    const steps = ansMatch ? out.replace(ansTag, '') : out;
                    UI.answerContent.innerHTML = marked.parse(wrapLatex(ansTag));
                    UI.stepsContent.innerHTML = marked.parse(wrapLatex(unescapeDollar(steps)));
                    if (window.MathJax && typeof MathJax.typesetPromise === 'function') {
                        MathJax.typesetPromise([UI.answerContent, UI.stepsContent]).catch(() => {});
                    }
                    const codeMatch = out.match(/```(?:javascript|js)?\s*([\s\S]*?)```/i);
                    if (codeMatch && codeMatch[1]) {
                        try {
                            (new Function(codeMatch[1]))();
                        } catch (e) {
                            logDump('RunJS error', e);
                        }
                        if (config.autoSubmit) {
                            const btn = document.querySelector('button.submit, button[class*=submit]');
                            if (btn) btn.click();
                        }
                    } else {
                        logMsg('No JS code block found');
                    }
                    UI.statusLine.textContent = langText[config.language].statusDone;
                } catch (e) {
                    UI.statusLine.textContent = 'Parse error';
                    logDump('Parse error', e);
                }
            },
            onerror: err => {
                stopProgress();
                UI.statusLine.textContent = langText[config.language].requestError + JSON.stringify(err);
                logDump('Request error', err);
            }
        });
    }

    /*───────────────────────────────────────────────────────────────────────
       19. 初始化
    ───────────────────────────────────────────────────────────────────────*/
    function initAll() {
        buildModelSelect();
        UI.txtApiKey.value = modelConfigs[config.selectedModel].apiKey;
        UI.txtApiBase.value = modelConfigs[config.selectedModel].apiBase;
        UI.modeSelect.value = config.mode;
        UI.autoSubmitRow.style.display = config.mode === 'autoFill' ? 'block' : 'none';
        UI.langSelect.value = config.language;
        updateManageLink();
        updateLangText();
        document.getElementById('settings-area').style.display = 'none';
        logMsg('IXL Auto Answer v9.1 loaded.');
    }

    window.MathJax = {
        tex: { inlineMath: [['$', '$'], ['\\(', '\\)']] },
        svg: { fontCache: 'global' }
    };

    initAll();

})();
