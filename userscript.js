// ==UserScript==
// @name         IXL Auto Answer (Optimized Prompt, Two-Column GUI)
// @namespace    http://tampermonkey.net/
// @version      1.0
// @license      GPL-3.0
// @description  IXL 自动解题脚本：系统提示要求最终答案必须以 $<answer> ... </answer>$ 包裹，仅返回纯 Unicode；双列配置布局、美观紧凑，保留 API Key 测试、刷新模型、租用 Key 等所有功能。
// @match        https://*.ixl.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// ==/UserScript==

(function() {
    'use strict';

    //==========================================================================
    // 1. 全局配置与模型管理
    //==========================================================================
    // 保存各模型配置：apiKey、apiBase、是否为动态发现（discovered）、模型列表
    let modelConfigs = JSON.parse(localStorage.getItem("ixlAutoAnswerConfigs") || "{}");

    // 预置模型列表
    const predefinedModels = ["gpt-4o", "gpt-4o-mini", "o1", "o3-mini", "deepseek-reasoner", "deepseek-chat", "chatgpt-4o-least"];
    if (!modelConfigs["gpt-4o"]) {
        modelConfigs["gpt-4o"] = {
            apiKey: "",
            apiBase: "https://api.openai.com/v1/chat/completions",
            manageUrl: "",
            discovered: false,
            modelList: []
        };
    }

    // 全局运行配置，默认模式为 "displayOnly"
    const config = {
        selectedModel: "gpt-4o",
        language: localStorage.getItem("ixlAutoAnswerLanguage") || "en",
        mode: "displayOnly",   // "displayOnly" 或 "autoFill"
        autoSubmitEnabled: false,
        totalTokens: 0,
        lastState: null // 用于回滚
    };

    function saveConfigs() {
        localStorage.setItem("ixlAutoAnswerConfigs", JSON.stringify(modelConfigs));
        localStorage.setItem("ixlAutoAnswerLanguage", config.language);
    }

    //==========================================================================
    // 2. 系统提示 (Prompt) 优化
    //==========================================================================
    // 系统提示要求 GPT 返回时只能使用纯 Unicode 字符，
    // 且最终答案必须严格用 $<answer> ... </answer>$ 包裹，且不得使用 Markdown/LaTeX。
    const systemPrompt = `
You are an expert math assistant solving IXL problems.
Provide your solution with optional explanation of your process.
The FINAL answer MUST be strictly enclosed within the tags $<answer> and </answer>$.
Do not use markdown formatting, LaTeX notation, backticks, or any delimiters like \\( ... \\).
Only use plain Unicode characters for all output.
Example final answer format: $<answer>42</answer>$
    `;

    //==========================================================================
    // 3. 多语言文本
    //==========================================================================
    const langText = {
        en: {
            modeLabel: "Mode",
            mode_auto: "Auto Fill (unstable)",
            mode_display: "Display Only (default)",
            startAnswer: "Start Answering",
            rollback: "Rollback",
            language: "Language",
            modelSelect: "Model",
            modelDescription: "Model Description",
            apiKey: "API Key",
            save: "Save",
            apiKeyPlaceholder: "Enter your API key",
            apiBase: "API Base",
            apiBasePlaceholder: "Enter your API base URL",
            statusIdle: "Status: Idle",
            analyzing: "Analyzing HTML...",
            extracting: "Extracting question data...",
            constructing: "Constructing API request...",
            waiting: "Waiting for GPT response...",
            parsing: "Parsing GPT output...",
            executing: "Executing code...",
            complete: "Submission complete.",
            reqError: "Request error: ",
            showLog: "Show Logs",
            hideLog: "Hide Logs",
            customModel: "Custom model name",
            testKey: "Test Key",
            testingKey: "Testing Key...",
            keyValid: "API key valid.",
            keyInvalid: "API key invalid (missing 'test success').",
            progress: "Processing...",
            tokens: "Tokens: ",
            close: "Close",
            getApiKey: "Get API Key",
            refreshModels: "Refresh Models",
            askAi: "Ask AI",
            askAiTitle: "AI Helper",
            rentKey: "Rent API Key"
        },
        zh: {
            modeLabel: "模式",
            mode_auto: "自动填写（不稳定）",
            mode_display: "仅显示（默认）",
            startAnswer: "开始答题",
            rollback: "撤回",
            language: "语言",
            modelSelect: "选择模型",
            modelDescription: "模型介绍",
            apiKey: "API 密钥",
            save: "保存",
            apiKeyPlaceholder: "输入您的 API 密钥",
            apiBase: "API 基础地址",
            apiBasePlaceholder: "输入您的 API 基础地址",
            statusIdle: "状态：空闲",
            analyzing: "分析HTML结构...",
            extracting: "提取题目数据...",
            constructing: "构造API请求...",
            waiting: "等待GPT响应...",
            parsing: "解析GPT输出...",
            executing: "执行代码...",
            complete: "提交完成。",
            reqError: "请求错误：",
            showLog: "显示日志",
            hideLog: "隐藏日志",
            customModel: "自定义模型名称",
            testKey: "测试密钥",
            testingKey: "正在测试密钥...",
            keyValid: "API密钥有效。",
            keyInvalid: "API密钥无效（未见 'test success'）。",
            progress: "处理中...",
            tokens: "用量: ",
            close: "关闭",
            getApiKey: "获取API Key",
            refreshModels: "刷新模型列表",
            askAi: "问AI",
            askAiTitle: "AI 助手",
            rentKey: "租用 API Key"
        }
    };

    //==========================================================================
    // 4. GUI 布局与样式 (双列布局，紧凑美观)
    //==========================================================================
    const panel = document.createElement("div");
    panel.id = "ixl-auto-answer-panel";
    panel.innerHTML = `
      <div class="header-bar">
        <span id="token-usage-display">${langText[config.language].tokens}0</span>
        <button id="toggle-log-btn">${langText[config.language].showLog}</button>
        <button id="close-btn">${langText[config.language].close}</button>
      </div>
      <div class="content-area">
        <div class="top-row">
          <div class="col">
            <label>${langText[config.language].modeLabel}:</label>
            <select id="mode-select" style="width:100%;">
              <option value="autoFill">${langText[config.language].mode_auto}</option>
              <option value="displayOnly" selected>${langText[config.language].mode_display}</option>
            </select>
          </div>
          <div class="col">
            <button id="start-answer-btn" class="btn-strong" style="width:100%;">${langText[config.language].startAnswer}</button>
            <button id="rollback-btn" class="btn-normal" style="width:100%; margin-top:4px;">${langText[config.language].rollback}</button>
          </div>
        </div>

        <!-- Answer display -->
        <div id="answer-display" style="display:none; margin-top:6px; border:1px solid #aaa; padding:6px; background:#fff;">
          <h4>Final Answer:</h4>
          <div id="final-answer" style="font-size:18px; font-weight:bold; color:#080;"></div>
          <hr/>
          <div id="solution-steps" style="font-size:12px; color:#666;"></div>
        </div>

        <button id="ask-ai-btn" class="btn-secondary" style="width:100%; margin-top:6px;">${langText[config.language].askAi}</button>

        <div id="progress-container" style="display:none; margin-top:6px;">
          <progress id="progress-bar" max="100" value="0" style="width:100%;"></progress>
          <span id="progress-text">${langText[config.language].progress}</span>
        </div>

        <p id="status" style="font-weight:bold; margin-top:6px;">${langText[config.language].statusIdle}</p>

        <!-- Log area -->
        <div id="log-container" style="display:none; max-height:100px; overflow-y:auto; background:#fff; border:1px solid #888; padding:4px; margin-top:6px; font-family:monospace;"></div>

        <!-- 双列配置区 -->
        <div class="config-area">
          <div class="col">
            <label>${langText[config.language].modelSelect}:</label>
            <select id="model-select" style="width:100%;"></select>
            <p id="model-description" style="font-size:12px; color:#666; margin:4px 0;"></p>
            <div id="custom-model-group" style="display:none;">
              <input type="text" id="custom-model-input" style="width:100%;" placeholder="${langText[config.language].customModel}">
            </div>
            <label>${langText[config.language].language}:</label>
            <select id="language-select" style="width:100%;">
              <option value="en">English</option>
              <option value="zh">中文</option>
            </select>
            <div id="auto-submit-row" style="margin-top:6px;">
              <label>Auto Submit:</label>
              <input type="checkbox" id="auto-submit-toggle">
            </div>
            <button id="rent-key-btn" class="btn-normal" style="width:100%; margin-top:6px;">${langText[config.language].rentKey}</button>
          </div>
          <div class="col">
            <label>${langText[config.language].apiKey}:</label>
            <div style="display:flex; gap:4px;">
              <input type="password" id="api-key-input" style="flex:1;" placeholder="${langText[config.language].apiKeyPlaceholder}">
              <button id="save-api-key" style="flex:0;">${langText[config.language].save}</button>
              <button id="check-key-btn" style="flex:0;">${langText[config.language].testKey}</button>
            </div>
            <label>${langText[config.language].apiBase}:</label>
            <div style="display:flex; gap:4px;">
              <input type="text" id="api-base-input" style="flex:1;" placeholder="${langText[config.language].apiBasePlaceholder}">
              <button id="save-api-base" style="flex:0;">${langText[config.language].save}</button>
            </div>
            <label>${langText[config.language].manageModelLink}:</label>
            <div style="display:flex; gap:4px;">
              <a id="manage-link" class="link-button" href="#" target="_blank" style="flex:1;">Link</a>
              <button id="refresh-model-btn" class="btn-normal" style="flex:1;">${langText[config.language].refreshModels}</button>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(panel);

    //==========================================================================
    // 5. CSS 样式（整体美观、双列紧凑布局）
    //==========================================================================
    GM_addStyle(`
      body {
        background: linear-gradient(to bottom, #cfd9df, #e2ebf0);
        font-family: "Segoe UI", Arial, sans-serif;
      }
      #ixl-auto-answer-panel {
        position: fixed;
        top: 20px;
        right: 20px;
        width: 400px;
        background: rgba(255,255,255,0.96);
        border-radius: 6px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.3);
        z-index: 999999;
      }
      .header-bar {
        background: #f7f7f7;
        border-bottom: 1px solid #ccc;
        padding: 4px;
        display: flex;
        justify-content: flex-end;
        gap: 4px;
      }
      .content-area {
        padding: 8px;
      }
      .top-row {
        display: flex;
        gap: 6px;
      }
      .top-row .col {
        flex:1;
      }
      .config-area {
        display: flex;
        gap: 6px;
        margin-top: 8px;
      }
      .config-area .col {
        flex:1;
        border: 1px solid #ccc;
        background: #fafafa;
        padding: 4px;
        border-radius: 4px;
      }
      label {
        font-weight: bold;
        font-size: 13px;
      }
      input, select, button {
        font-size: 13px;
        padding: 4px;
        box-sizing: border-box;
      }
      .btn-strong {
        background-color: #f0ad4e;
        color: #fff;
        border: none;
        border-radius: 4px;
        font-weight: bold;
      }
      .btn-strong:hover {
        background-color: #ec971f;
      }
      .btn-normal {
        background-color: #ddd;
        color: #333;
        border: none;
        border-radius: 4px;
      }
      .btn-normal:hover {
        background-color: #ccc;
      }
      .btn-secondary {
        background-color: #bbb;
        color: #333;
        border: none;
        border-radius: 4px;
      }
      .btn-secondary:hover {
        background-color: #aaa;
      }
      .link-button {
        background: #2f8ee0;
        color: #fff;
        border-radius: 4px;
        text-decoration: none;
        padding: 4px;
        text-align: center;
      }
      .link-button:hover {
        opacity: 0.8;
      }
    `);

    //==========================================================================
    // 6. 日志输出函数
    //==========================================================================
    function logMessage(msg) {
        const time = new Date().toLocaleString();
        const div = document.createElement("div");
        div.textContent = `[${time}] ${msg}`;
        UI.logContainer.appendChild(div);
        console.log("[Log]", msg);
    }
    function logDump(label, val) {
        let out = `[DUMP] ${label}: `;
        if(typeof val === "object") {
            try { out += JSON.stringify(val); } catch(e) { out += String(val); }
        } else {
            out += String(val);
        }
        logMessage(out);
    }

    //==========================================================================
    // 7. 更新语言文本
    //==========================================================================
    function updateLanguageText() {
        UI.toggleLogBtn.textContent = (UI.logContainer.style.display==="none") ? langText[config.language].showLog : langText[config.language].hideLog;
        UI.closeButton.textContent = langText[config.language].close;
        UI.tokenUsageDisplay.textContent = langText[config.language].tokens + config.totalTokens;
        UI.status.textContent = langText[config.language].statusIdle;
        UI.progressText.textContent = langText[config.language].progress;
        UI.fillModeSelect.options[0].text = langText[config.language].mode_auto;
        UI.fillModeSelect.options[1].text = langText[config.language].mode_display;
        UI.startAnswering.textContent = langText[config.language].startAnswer;
        UI.rollbackAnswer.textContent = langText[config.language].rollback;
        UI.apiKeyInput.placeholder = langText[config.language].apiKeyPlaceholder;
        panel.querySelector("#save-api-key").textContent = langText[config.language].save;
        panel.querySelector("#check-key-btn").textContent = langText[config.language].testKey;
        UI.apiBaseInput.placeholder = langText[config.language].apiBasePlaceholder;
        panel.querySelector("#save-api-base").textContent = langText[config.language].save;
        UI.manageModelLink.textContent = langText[config.language].getApiKey;
        UI.refreshModelListBtn.textContent = langText[config.language].refreshModels;
        panel.querySelector("#ask-ai-btn").textContent = langText[config.language].askAi;
        UI.rentApiBtn.textContent = langText[config.language].rentKey;
    }

    //==========================================================================
    // 8. 构建模型下拉框
    //==========================================================================
    function rebuildModelSelect() {
        UI.modelSelect.innerHTML = "";
        const ogPre = document.createElement("optgroup");
        ogPre.label = "Predefined";
        predefinedModels.forEach(m => {
            const opt = document.createElement("option");
            opt.value = m;
            opt.textContent = m;
            ogPre.appendChild(opt);
        });
        UI.modelSelect.appendChild(ogPre);
        const discoveredKeys = Object.keys(modelConfigs).filter(k => modelConfigs[k].discovered);
        if (discoveredKeys.length > 0) {
            const ogDisc = document.createElement("optgroup");
            ogDisc.label = "Discovered";
            discoveredKeys.forEach(m => {
                const opt = document.createElement("option");
                opt.value = m;
                opt.textContent = m;
                ogDisc.appendChild(opt);
            });
            UI.modelSelect.appendChild(ogDisc);
        }
        const optCustom = document.createElement("option");
        optCustom.value = "custom";
        optCustom.textContent = "custom";
        UI.modelSelect.appendChild(optCustom);
        if(UI.modelSelect.querySelector(`option[value="${config.selectedModel}"]`)) {
            UI.modelSelect.value = config.selectedModel;
        } else {
            UI.modelSelect.value = "custom";
        }
        UI.modelDescription.textContent = modelDescriptions[config.selectedModel] || "User-defined model";
        UI.customModelGroup.style.display = (config.selectedModel === "custom") ? "block" : "none";
    }

    //==========================================================================
    // 9. 事件绑定
    //==========================================================================
    // 切换日志
    UI.toggleLogBtn.addEventListener("click", () => {
        if (UI.logContainer.style.display === "none") {
            UI.logContainer.style.display = "block";
            UI.toggleLogBtn.textContent = langText[config.language].hideLog;
        } else {
            UI.logContainer.style.display = "none";
            UI.toggleLogBtn.textContent = langText[config.language].showLog;
        }
    });
    // 关闭面板
    UI.closeButton.addEventListener("click", () => {
        panel.style.display = "none";
        logMessage("Panel closed.");
    });
    // 语言切换
    UI.languageSelect.addEventListener("change", () => {
        config.language = UI.languageSelect.value;
        localStorage.setItem("ixlAutoAnswerLanguage", config.language);
        updateLanguageText();
    });
    // 模式切换
    UI.fillModeSelect.addEventListener("change", () => {
        config.mode = UI.fillModeSelect.value;
        if(config.mode === "displayOnly") {
            document.getElementById("auto-submit-row").style.display = "none";
            UI.answerDisplay.style.display = "none";
        } else {
            document.getElementById("auto-submit-row").style.display = "block";
            alert("Warning: Auto Fill mode is unstable. Use with caution.");
        }
    });
    // 开始答题
    UI.startAnswering.addEventListener("click", () => {
        answerQuestion();
    });
    // 撤回答题
    UI.rollbackAnswer.addEventListener("click", () => {
        if(config.lastState) {
            let target = getTargetDiv();
            if(target) { target.innerHTML = config.lastState; }
            logMessage("Rolled back to previous state.");
        } else {
            logMessage("No previous state available.");
        }
    });
    // 模型选择
    UI.modelSelect.addEventListener("change", () => {
        config.selectedModel = UI.modelSelect.value;
        if(!modelConfigs[config.selectedModel]) {
            modelConfigs[config.selectedModel] = {
                apiKey: "",
                apiBase: "https://api.openai.com/v1/chat/completions",
                discovered: false,
                modelList: []
            };
        }
        UI.customModelGroup.style.display = (config.selectedModel === "custom") ? "block" : "none";
        UI.modelDescription.textContent = modelDescriptions[config.selectedModel] || "User-defined model";
        UI.apiKeyInput.value = modelConfigs[config.selectedModel].apiKey || "";
        UI.apiBaseInput.value = modelConfigs[config.selectedModel].apiBase || "";
        updateManageUrl();
    });
    // 自定义模型
    UI.customModelInput.addEventListener("change", () => {
        const name = UI.customModelInput.value.trim();
        if(!name) return;
        config.selectedModel = name;
        if(!modelConfigs[name]) {
            modelConfigs[name] = {
                apiKey: "",
                apiBase: "https://api.openai.com/v1/chat/completions",
                discovered: false,
                modelList: []
            };
        }
        rebuildModelSelect();
        UI.modelSelect.value = "custom";
        UI.apiKeyInput.value = modelConfigs[name].apiKey;
        UI.apiBaseInput.value = modelConfigs[name].apiBase;
        updateManageUrl();
    });
    // 保存 API Key
    panel.querySelector("#save-api-key").addEventListener("click", () => {
        const key = UI.apiKeyInput.value.trim();
        modelConfigs[config.selectedModel].apiKey = key;
        saveConfigs();
        logMessage("API Key saved.");
    });
    // 测试 API Key
    panel.querySelector("#check-key-btn").addEventListener("click", () => {
        testApiKey();
    });
    // 保存 API Base
    panel.querySelector("#save-api-base").addEventListener("click", () => {
        const base = UI.apiBaseInput.value.trim();
        modelConfigs[config.selectedModel].apiBase = base;
        saveConfigs();
        logMessage("API Base saved.");
    });
    // 刷新模型列表
    UI.refreshModelListBtn.addEventListener("click", () => {
        refreshModelList();
    });
    // 租用 API Key
    UI.rentApiBtn.addEventListener("click", () => {
        showRentPopup();
    });
    // "Ask AI" 按钮
    panel.querySelector("#ask-ai-btn").addEventListener("click", () => {
        openAiDialog();
    });

    //==========================================================================
    // 10. Manage URL 更新（根据模型名称判断）
    //==========================================================================
    function updateManageUrl() {
        let m = config.selectedModel.toLowerCase();
        let link = "#";
        if(m.indexOf("deepseek") !== -1) {
            link = "https://platform.deepseek.com/api_keys";
        } else {
            link = "https://platform.openai.com/api-keys";
        }
        modelConfigs[config.selectedModel].manageUrl = link;
        UI.manageModelLink.href = link;
        saveConfigs();
    }

    //==========================================================================
    // 11. Rent API Key 弹窗
    //==========================================================================
    function showRentPopup() {
        const overlay = document.createElement("div");
        overlay.style.position = "fixed";
        overlay.style.top = "0"; overlay.style.left = "0";
        overlay.style.width = "100%"; overlay.style.height = "100%";
        overlay.style.backgroundColor = "rgba(0,0,0,0.5)";
        overlay.style.zIndex = "99999999";
        const box = document.createElement("div");
        box.style.position = "absolute";
        box.style.top = "50%"; box.style.left = "50%";
        box.style.transform = "translate(-50%,-50%)";
        box.style.backgroundColor = "#fff";
        box.style.padding = "10px";
        box.style.borderRadius = "6px";
        box.style.width = "300px";
        box.innerHTML = `
          <h3>${langText[config.language].rentKey}</h3>
          <p>Contact: <br>felixliujy@Gmail.com<br>admin@obanarchy.org</p>
          <button id="rent-close-btn">${langText[config.language].close}</button>
        `;
        overlay.appendChild(box);
        document.body.appendChild(overlay);
        box.querySelector("#rent-close-btn").addEventListener("click", () => {
            document.body.removeChild(overlay);
        });
    }

    //==========================================================================
    // 12. Test API Key
    //==========================================================================
    function testApiKey() {
        UI.status.textContent = langText[config.language].testingKey;
        const mc = modelConfigs[config.selectedModel];
        const payload = {
            model: config.selectedModel,
            messages: [
                { role: "system", content: "Test assistant." },
                { role: "user", content: "Please ONLY respond with: test success" }
            ]
        };
        GM_xmlhttpRequest({
            method: "POST",
            url: mc.apiBase,
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${mc.apiKey}`
            },
            data: JSON.stringify(payload),
            onload: (resp) => {
                UI.status.textContent = langText[config.language].statusIdle;
                try {
                    let data = JSON.parse(resp.responseText);
                    let ans = data.choices[0].message.content.toLowerCase();
                    if (ans.indexOf("test success") !== -1) {
                        alert(langText[config.language].keyValid);
                    } else {
                        alert(langText[config.language].keyInvalid);
                    }
                } catch (e) {
                    alert("Error parsing test result: " + e);
                }
            },
            onerror: (err) => {
                UI.status.textContent = langText[config.language].statusIdle;
                alert("Key test failed: " + JSON.stringify(err));
            }
        });
    }

    //==========================================================================
    // 13. Refresh Model List
    //==========================================================================
    function refreshModelList() {
        const mc = modelConfigs[config.selectedModel];
        if (!mc) return;
        const url = mc.apiBase.replace("/chat/completions", "/models");
        logMessage("Refreshing models from: " + url);
        GM_xmlhttpRequest({
            method: "GET",
            url: url,
            headers: {
                "Authorization": `Bearer ${mc.apiKey}`
            },
            onload: (resp) => {
                try {
                    logDump("RefreshModelList response", resp.responseText);
                    let data = JSON.parse(resp.responseText);
                    if (Array.isArray(data.data)) {
                        let list = data.data.map(o => o.id);
                        mc.modelList = list;
                        list.forEach(m => {
                            if (!modelConfigs[m]) {
                                modelConfigs[m] = {
                                    apiKey: mc.apiKey,
                                    apiBase: mc.apiBase,
                                    discovered: true,
                                    modelList: []
                                };
                            }
                        });
                        saveConfigs();
                        rebuildModelSelect();
                        alert("Models refreshed: " + list.join(", "));
                    }
                } catch (e) {
                    alert("Error parsing model list: " + e);
                }
            },
            onerror: (err) => {
                alert("Failed refreshing models: " + JSON.stringify(err));
            }
        });
    }

    //==========================================================================
    // 14. AI Helper (非串流模式，保留原模式)
    //==========================================================================
    function openAiDialog() {
        const overlay = document.createElement("div");
        overlay.style.position = "fixed";
        overlay.style.top = "0"; overlay.style.left = "0";
        overlay.style.width = "100%"; overlay.style.height = "100%";
        overlay.style.backgroundColor = "rgba(0,0,0,0.5)";
        overlay.style.zIndex = "99999999";
        const box = document.createElement("div");
        box.style.position = "absolute";
        box.style.top = "50%"; box.style.left = "50%";
        box.style.transform = "translate(-50%,-50%)";
        box.style.backgroundColor = "#fff";
        box.style.padding = "10px";
        box.style.borderRadius = "6px";
        box.style.width = "320px";
        box.innerHTML = `
          <h3>${langText[config.language].askAiTitle}</h3>
          <textarea id="ai-question" style="width:100%;height:80px;"></textarea>
          <button id="ai-submit" style="margin-top:6px;">${langText[config.language].askAi}</button>
          <button id="ai-close" style="margin-top:6px;">${langText[config.language].close}</button>
          <pre id="ai-output" style="margin-top:6px; border:1px solid #ccc; padding:4px; background:#fafafa;white-space:pre-wrap;"></pre>
        `;
        overlay.appendChild(box);
        document.body.appendChild(overlay);
        const btnClose = box.querySelector("#ai-close");
        const btnSubmit = box.querySelector("#ai-submit");
        const txtQuestion = box.querySelector("#ai-question");
        const out = box.querySelector("#ai-output");
        btnClose.addEventListener("click", () => { document.body.removeChild(overlay); });
        btnSubmit.addEventListener("click", () => {
            let question = txtQuestion.value.trim();
            if (!question) return;
            out.textContent = "(waiting...)";
            askAi(question, (response) => {
                out.textContent = response;
                let final = parseFinalAnswer(response);
                if (final) {
                    out.innerHTML += `<p style="font-weight:bold; font-size:16px; color:#c00;">Final Answer: ${final}</p>`;
                }
            }, (err) => {
                out.textContent = "[Error] " + err;
            });
        });
    }
    function askAi(userQ, onSuccess, onError) {
        const mc = modelConfigs[config.selectedModel] || {};
        const payload = {
            model: config.selectedModel,
            messages: [
                { role: "system", content: scriptDescription },
                { role: "user", content: userQ }
            ]
        };
        GM_xmlhttpRequest({
            method:"POST",
            url: mc.apiBase,
            headers:{
                "Content-Type":"application/json",
                "Authorization":`Bearer ${mc.apiKey}`
            },
            data: JSON.stringify(payload),
            onload:(resp)=>{
                try {
                    const data = JSON.parse(resp.responseText);
                    const txt = data.choices[0].message.content;
                    onSuccess(txt);
                } catch(e) { onError("Parse error: " + e); }
            },
            onerror:(err)=>{ onError(JSON.stringify(err)); }
        });
    }

    //==========================================================================
    // 15. Answer Question：GPT返回时，要求最终答案必须用 $<answer> ... </answer>$ 包裹
    //==========================================================================
    function getTargetDiv() {
        let d = document.evaluate(
            '/html/body/main/div/article/section/section/div/div[1]',
            document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null
        ).singleNodeValue;
        if(!d) { d = document.querySelector('main div.article, main>div, article'); }
        return d;
    }
    function answerQuestion() {
        logMessage("AnswerQuestion triggered.");
        const target = getTargetDiv();
        if(!target) {
            logMessage("Question region not found.");
            return;
        }
        config.lastState = target.innerHTML;
        monitorDom(target);

        // 构造用户提示：包含 HTML 源码（可附加 math 或 canvas）
        let userText = `HTML:\n${target.outerHTML}\n`;
        const latex = captureLatex(target);
        if(latex) { userText += `LaTeX:\n${latex}\n`; }
        const canvasB64 = latex ? null : captureCanvas(target);
        if(canvasB64) { userText += "Canvas image base64 attached.\n"; }

        let sysPrompt = "";
        if(config.mode==="displayOnly") {
            sysPrompt = "You are an IXL math solver. Provide an explanation if needed, but the FINAL ANSWER MUST be enclosed EXACTLY within the tags $<answer> and </answer>$. Do not use any markdown formatting or LaTeX. Only plain Unicode output is allowed.";
        } else {
            sysPrompt = "You are an IXL math solver. Provide explanation if necessary and also provide a JavaScript code block (in triple backticks) to auto fill answers. The FINAL ANSWER MUST be enclosed exactly within the tags $<answer> and </answer>$. Do not use markdown or LaTeX outside of code.";
        }

        UI.status.textContent = langText[config.language].waiting;
        startProgress();

        const payload = {
            model: config.selectedModel,
            messages: [
                { role: "system", content: sysPrompt },
                { role: "user", content: userText }
            ]
        };

        const mc = modelConfigs[config.selectedModel] || {};
        GM_xmlhttpRequest({
            method:"POST",
            url: mc.apiBase,
            headers:{
                "Content-Type":"application/json",
                "Authorization":`Bearer ${mc.apiKey}`
            },
            data: JSON.stringify(payload),
            onload:(resp)=>{
                stopProgress();
                try {
                    let data = JSON.parse(resp.responseText);
                    logDump("Answer response", data);
                    if(data.usage && data.usage.total_tokens) {
                        config.totalTokens += data.usage.total_tokens;
                        UI.tokenUsageDisplay.textContent = langText[config.language].tokens + config.totalTokens;
                    }
                    let fullOutput = data.choices[0].message.content;
                    // 解析 <answer> ... </answer>
                    const finalAnswer = parseFinalAnswer(fullOutput);
                    // 解题过程为去除 <answer> 部分
                    const steps = fullOutput.replace(/<answer>[\s\S]*?<\/answer>/i, "").trim();
                    if(!finalAnswer) {
                        UI.answerDisplay.style.display = "block";
                        UI.answerContent.innerHTML = `<span style="color:red; font-weight:bold;">Error: No final answer marker found.</span>`;
                        UI.solutionSteps.textContent = fullOutput;
                        UI.status.textContent = "Missing <answer> tag.";
                        return;
                    }
                    UI.answerDisplay.style.display = "block";
                    UI.answerContent.innerHTML = `<span style="font-size:18px; font-weight:bold; color:#080;">${finalAnswer}</span>`;
                    UI.solutionSteps.textContent = steps;
                    if(config.mode==="autoFill") {
                        let codeMatch = fullOutput.match(/```javascript\s+([\s\S]*?)\s+```/i);
                        if(codeMatch && codeMatch[1]) {
                            let code = codeMatch[1].trim();
                            runCode(code);
                            if(config.autoSubmitEnabled) { submitAnswer(); }
                        } else {
                            logMessage("No code block found for auto fill.");
                        }
                    }
                    UI.status.textContent = langText[config.language].complete;
                } catch(e) {
                    logDump("Answer parse error", e);
                    UI.status.textContent = "Error parsing GPT output.";
                }
            },
            onerror:(err)=>{
                stopProgress();
                UI.status.textContent = langText[config.language].reqError + JSON.stringify(err);
                logDump("Answer request error", err);
            }
        });
    }

    function captureLatex(el) {
        let arr = el.querySelectorAll('script[type="math/tex"], .MathJax, .mjx-chtml');
        if(arr.length > 0) {
            let latex = "";
            arr.forEach(e => { latex += e.textContent + "\n"; });
            return latex;
        }
        return null;
    }
    function captureCanvas(el) {
        let canvas = el.querySelector('canvas');
        if(canvas) {
            const c = document.createElement("canvas");
            c.width = canvas.width;
            c.height = canvas.height;
            c.getContext("2d").drawImage(canvas, 0, 0);
            return c.toDataURL("image/png").split(",")[1];
        }
        return null;
    }
    function monitorDom(el) {
        if(!el) return;
        const observer = new MutationObserver(muts => {
            muts.forEach(m => {
                logDump("DOM update", { added: m.addedNodes.length, removed: m.removedNodes.length });
            });
        });
        observer.observe(el, { childList: true, subtree: true });
        logMessage("Monitoring DOM changes.");
    }
    function parseFinalAnswer(text) {
        const re = /\$<answer>([\s\S]*?)<\/answer>\$/i;
        const m = text.match(re);
        return m ? m[1].trim() : null;
    }
    function runCode(code) {
        try {
            const sandbox = {};
            (new Function("sandbox", "with(sandbox){"+code+"}"))(sandbox);
        } catch(e) {
            logDump("Sandbox error", e);
        }
    }
    function submitAnswer() {
        let btn = document.evaluate(
            '/html/body/main/div/article/section/section/div/div[1]/section/div/section/div/button',
            document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null
        ).singleNodeValue;
        if(!btn) {
            btn = document.querySelector('button.submit, button[class*="submit"]');
        }
        if(btn) {
            logMessage("Auto submitting...");
            btn.click();
        } else {
            logMessage("Submit button not found.");
        }
    }

    //==========================================================================
    // 15. 进度条控制
    //==========================================================================
    let progTimer = null;
    function startProgress() {
        UI.progressContainer.style.display = "block";
        UI.progressBar.value = 0;
        progTimer = setInterval(() => {
            if(UI.progressBar.value < 90) { UI.progressBar.value += 2; }
            else { clearInterval(progTimer); }
        }, 200);
    }
    function stopProgress() {
        if(progTimer) clearInterval(progTimer);
        UI.progressBar.value = 100;
        setTimeout(() => {
            UI.progressContainer.style.display = "none";
            UI.progressBar.value = 0;
        }, 400);
    }

    //==========================================================================
    // 16. "Ask AI" 对话框 (非流式)
    //==========================================================================
    function openAiDialog() {
        const overlay = document.createElement("div");
        overlay.style.position = "fixed";
        overlay.style.top = "0"; overlay.style.left = "0";
        overlay.style.width = "100%"; overlay.style.height = "100%";
        overlay.style.backgroundColor = "rgba(0,0,0,0.5)";
        overlay.style.zIndex = "99999999";
        const box = document.createElement("div");
        box.style.position = "absolute";
        box.style.top = "50%"; box.style.left = "50%";
        box.style.transform = "translate(-50%,-50%)";
        box.style.width = "320px";
        box.style.backgroundColor = "#fff";
        box.style.borderRadius = "6px";
        box.style.padding = "10px";
        box.innerHTML = `
            <h3>${langText[config.language].askAiTitle}</h3>
            <textarea id="ai-dialog-q" style="width:100%; height:80px;"></textarea>
            <button id="ai-dialog-submit" style="margin-top:6px;">${langText[config.language].askAi}</button>
            <button id="ai-dialog-close" style="margin-top:6px;">${langText[config.language].close}</button>
            <pre id="ai-dialog-output" style="margin-top:6px; border:1px solid #ccc; padding:4px; background:#fafafa; white-space:pre-wrap;"></pre>
        `;
        overlay.appendChild(box);
        document.body.appendChild(overlay);
        const btnClose = box.querySelector("#ai-dialog-close");
        const btnSubmit = box.querySelector("#ai-dialog-submit");
        const txtQ = box.querySelector("#ai-dialog-q");
        const out = box.querySelector("#ai-dialog-output");
        btnClose.addEventListener("click", () => { document.body.removeChild(overlay); });
        btnSubmit.addEventListener("click", () => {
            const q = txtQ.value.trim();
            if(!q) return;
            out.textContent = "(waiting for answer...)";
            askAi(q, (resp) => {
                out.textContent = resp;
                const ans = parseFinalAnswer(resp);
                if(ans) {
                    out.innerHTML += `<p style="font-weight:bold; font-size:16px; color:#c00;">Final Answer: ${ans}</p>`;
                }
            }, (err) => {
                out.textContent = "[Error] " + err;
            });
        });
    }
    function askAi(userQ, onSuccess, onError) {
        const mc = modelConfigs[config.selectedModel] || {};
        const payload = {
            model: config.selectedModel,
            messages: [
                { role: "system", content: scriptDescription },
                { role: "user", content: userQ }
            ]
        };
        GM_xmlhttpRequest({
            method:"POST",
            url: mc.apiBase,
            headers:{
                "Content-Type":"application/json",
                "Authorization":`Bearer ${mc.apiKey}`
            },
            data: JSON.stringify(payload),
            onload:(resp)=>{
                try {
                    const data = JSON.parse(resp.responseText);
                    const txt = data.choices[0].message.content;
                    onSuccess(txt);
                } catch(e) {
                    onError("Parse error: " + e);
                }
            },
            onerror:(err)=>{
                onError(JSON.stringify(err));
            }
        });
    }

    //==========================================================================
    // 17. AnswerQuestion 主流程
    //==========================================================================
    function getTargetDiv() {
        let div = document.evaluate(
            '/html/body/main/div/article/section/section/div/div[1]',
            document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null
        ).singleNodeValue;
        if(!div) { div = document.querySelector('main div.article, main>div, article'); }
        return div;
    }
    function answerQuestion() {
        logMessage("AnswerQuestion triggered.");
        const target = getTargetDiv();
        if (!target) {
            logMessage("Question region not found!");
            return;
        }
        config.lastState = target.innerHTML;
        monitorDom(target);

        // 构造用户提示，将 HTML 内容传递给 GPT
        let userPrompt = "HTML:\n" + target.outerHTML + "\n";
        const latex = captureLatex(target);
        if (latex) { userPrompt += "LaTeX:\n" + latex + "\n"; }
        const canvasData = latex ? null : captureCanvas(target);
        if (canvasData) { userPrompt += "Canvas image base64 attached.\n"; }

        // 系统提示要求：最终答案必须以 $<answer> ... </answer>$ 包裹
        let sysPrompt = "";
        if(config.mode === "displayOnly") {
            sysPrompt = "You are a math solver for IXL. Provide any necessary explanation for your solution, but the FINAL ANSWER MUST be enclosed exactly within the tags $<answer> and </answer>$. Do not use markdown, LaTeX, or backticks. Only plain Unicode is allowed.";
        } else {
            sysPrompt = "You are a math solver for IXL. Provide a brief explanation for your solution and also output a JavaScript code block (in triple backticks) to fill in the answer automatically. The FINAL ANSWER MUST be enclosed exactly within the tags $<answer> and </answer>$. Do not use markdown, LaTeX, or backticks (except for the code block).";
        }

        UI.status.textContent = langText[config.language].waiting;
        startProgress();

        const payload = {
            model: config.selectedModel,
            messages: [
                { role: "system", content: sysPrompt },
                { role: "user", content: userPrompt }
            ]
        };

        const mc = modelConfigs[config.selectedModel] || {};
        GM_xmlhttpRequest({
            method:"POST",
            url: mc.apiBase,
            headers:{
                "Content-Type":"application/json",
                "Authorization":`Bearer ${mc.apiKey}`
            },
            data: JSON.stringify(payload),
            onload:(resp)=>{
                stopProgress();
                try {
                    const data = JSON.parse(resp.responseText);
                    logDump("AnswerQuestion response", data);
                    if(data.usage && data.usage.total_tokens) {
                        config.totalTokens += data.usage.total_tokens;
                        UI.tokenUsageDisplay.textContent = langText[config.language].tokens + config.totalTokens;
                    }
                    const output = data.choices[0].message.content;
                    const finalAnswer = parseFinalAnswer(output);
                    const steps = output.replace(/<answer>[\s\S]*?<\/answer>/i, "").trim();
                    UI.answerDisplay.style.display = "block";
                    if(finalAnswer) {
                        UI.answerContent.innerHTML = `<span style="font-size:18px; font-weight:bold; color:#080;">${finalAnswer}</span>`;
                    } else {
                        UI.answerContent.innerHTML = `<span style="color:red; font-weight:bold;">Error: No <answer> marker found.</span>`;
                    }
                    UI.solutionSteps.textContent = steps;
                    if(config.mode === "autoFill") {
                        const codeMatch = output.match(/```javascript\s+([\s\S]*?)\s+```/i);
                        if(codeMatch && codeMatch[1]) {
                            const code = codeMatch[1].trim();
                            runCode(code);
                            if(config.autoSubmitEnabled) {
                                submitAnswer();
                            }
                        } else {
                            logMessage("No code block found for auto fill.");
                        }
                    }
                    UI.status.textContent = langText[config.language].complete;
                } catch(e) {
                    logDump("Answer parse error", e);
                    UI.status.textContent = "Error parsing GPT output.";
                }
            },
            onerror:(err)=>{
                stopProgress();
                UI.status.textContent = langText[config.language].reqError + JSON.stringify(err);
                logDump("Answer request error", err);
            }
        });
    }

    //==========================================================================
    // 18. 辅助函数
    //==========================================================================
    function captureLatex(el) {
        let elems = el.querySelectorAll('script[type="math/tex"], .MathJax, .mjx-chtml');
        if(elems.length > 0) {
            let latex = "";
            elems.forEach(e => { latex += e.textContent + "\n"; });
            return latex;
        }
        return null;
    }
    function captureCanvas(el) {
        let canvas = el.querySelector('canvas');
        if(canvas) {
            const c = document.createElement("canvas");
            c.width = canvas.width;
            c.height = canvas.height;
            c.getContext("2d").drawImage(canvas, 0, 0);
            return c.toDataURL("image/png").split(",")[1];
        }
        return null;
    }
    function monitorDom(el) {
        if(!el) return;
        const observer = new MutationObserver(muts => {
            muts.forEach(m => {
                logDump("DOM update", { added: m.addedNodes.length, removed: m.removedNodes.length });
            });
        });
        observer.observe(el, { childList: true, subtree: true });
        logMessage("Monitoring DOM changes on target element.");
    }
    function parseFinalAnswer(text) {
        const re = /\$<answer>([\s\S]*?)<\/answer>\$/i;
        const m = text.match(re);
        return m ? m[1].trim() : null;
    }
    function runCode(code) {
        try {
            const sandbox = {};
            (new Function("sandbox", "with(sandbox){"+code+"}"))(sandbox);
        } catch(e) {
            logDump("Sandbox error", e);
        }
    }
    function submitAnswer() {
        let btn = document.evaluate(
            '/html/body/main/div/article/section/section/div/div[1]/section/div/section/div/button',
            document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null
        ).singleNodeValue;
        if(!btn) {
            btn = document.querySelector('button.submit, button[class*="submit"]');
        }
        if(btn) {
            logMessage("Auto submitting answer...");
            btn.click();
        } else {
            logMessage("Submit button not found.");
        }
    }

    //==========================================================================
    // 19. 进度条控制
    //==========================================================================
    let progTimer = null;
    function startProgress() {
        UI.progressContainer.style.display = "block";
        UI.progressBar.value = 0;
        progTimer = setInterval(() => {
            if(UI.progressBar.value < 90) { UI.progressBar.value += 2; }
            else { clearInterval(progTimer); }
        }, 200);
    }
    function stopProgress() {
        if(progTimer) clearInterval(progTimer);
        UI.progressBar.value = 100;
        setTimeout(() => {
            UI.progressContainer.style.display = "none";
            UI.progressBar.value = 0;
        }, 400);
    }

    //==========================================================================
    // 20. "Ask AI" 对话框（保持非串流模式）
    //==========================================================================
    function openAiDialog() {
        const overlay = document.createElement("div");
        overlay.style.position = "fixed";
        overlay.style.top = "0"; overlay.style.left = "0";
        overlay.style.width = "100%"; overlay.style.height = "100%";
        overlay.style.backgroundColor = "rgba(0,0,0,0.5)";
        overlay.style.zIndex = "99999999";
        const box = document.createElement("div");
        box.style.position = "absolute";
        box.style.top = "50%"; box.style.left = "50%";
        box.style.transform = "translate(-50%,-50%)";
        box.style.width = "320px";
        box.style.backgroundColor = "#fff";
        box.style.borderRadius = "6px";
        box.style.padding = "10px";
        box.innerHTML = `
          <h3>${langText[config.language].askAiTitle}</h3>
          <textarea id="ai-dialog-q" style="width:100%;height:80px;"></textarea>
          <button id="ai-dialog-submit" style="margin-top:6px;">${langText[config.language].askAi}</button>
          <button id="ai-dialog-close" style="margin-top:6px;">${langText[config.language].close}</button>
          <pre id="ai-dialog-output" style="margin-top:6px; border:1px solid #ccc; padding:4px; background:#fafafa; white-space:pre-wrap;"></pre>
        `;
        overlay.appendChild(box);
        document.body.appendChild(overlay);
        const btnClose = box.querySelector("#ai-dialog-close");
        const btnSubmit = box.querySelector("#ai-dialog-submit");
        const txtQ = box.querySelector("#ai-dialog-q");
        const out = box.querySelector("#ai-dialog-output");
        btnClose.addEventListener("click", () => { document.body.removeChild(overlay); });
        btnSubmit.addEventListener("click", () => {
            let q = txtQ.value.trim();
            if(!q) return;
            out.textContent = "(waiting for answer...)";
            askAi(q, (resp) => {
                out.textContent = resp;
                const final = parseFinalAnswer(resp);
                if(final) {
                    out.innerHTML += `<p style="font-weight:bold; font-size:16px; color:#c00;">Final Answer: ${final}</p>`;
                }
            }, (err) => {
                out.textContent = "[Error] " + err;
            });
        });
    }
    function askAi(userQ, onSuccess, onError) {
        const mc = modelConfigs[config.selectedModel] || {};
        const payload = {
            model: config.selectedModel,
            messages: [
                { role: "system", content: scriptDescription },
                { role: "user", content: userQ }
            ]
        };
        GM_xmlhttpRequest({
            method:"POST",
            url: mc.apiBase,
            headers: {
                "Content-Type":"application/json",
                "Authorization": `Bearer ${mc.apiKey}`
            },
            data: JSON.stringify(payload),
            onload:(resp)=>{
                try {
                    let data = JSON.parse(resp.responseText);
                    let txt = data.choices[0].message.content;
                    onSuccess(txt);
                } catch(e) {
                    onError("Parse error: " + e);
                }
            },
            onerror:(err)=>{ onError(JSON.stringify(err)); }
        });
    }

    //==========================================================================
    // 21. 初始化
    //==========================================================================
    function initPanel() {
        rebuildModelSelect();
        let conf = modelConfigs[config.selectedModel];
        UI.apiKeyInput.value = conf.apiKey || "";
        UI.apiBaseInput.value = conf.apiBase || "https://api.openai.com/v1/chat/completions";
        updateManageUrl();
        UI.fillModeSelect.value = config.mode;
        // 隐藏 AutoSubmit if mode is displayOnly
        if (config.mode === "displayOnly") {
            document.getElementById("auto-submit-row").style.display = "none";
            UI.answerDisplay.style.display = "none";
        }
        UI.languageSelect.value = config.language;
        updateLanguageText();
        logMessage("Script loaded (optimized prompt, two-column layout).");
    }
    initPanel();

    //==========================================================================
    // End of script
    //==========================================================================
})();
