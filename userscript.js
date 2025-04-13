// ==UserScript==
// @name         IXL Auto Answer (Optimized Prompt, Two-Column GUI)
// @namespace    http://tampermonkey.net/
// @version      8.4
// @license      GPL-3.0
// @description  IXL 自动解题脚本。系统提示要求 GPT 仅返回纯 Unicode，不使用 Markdown/LaTeX，并且最终答案必须严格以 $<answer> ... </answer>$ 包裹。GUI 采用两列布局，配置紧凑美观，保留所有功能（API Key 测试、刷新模型、租用 Key、AI 对话等）。
// @match        https://*.ixl.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// ==/UserScript==

(function () {
    'use strict';

    // -------------------- 1. 全局配置 --------------------
    // 模型配置对象（保存在 localStorage 中）
    let modelConfigs = JSON.parse(localStorage.getItem("ixlAutoAnswerConfigs") || "{}");
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

    // 全局运行配置
    const config = {
        selectedModel: "gpt-4o",
        language: localStorage.getItem("ixlAutoAnswerLanguage") || "en",
        mode: "displayOnly", // "displayOnly" 或 "autoFill"
        autoSubmitEnabled: false,
        totalTokens: 0,
        lastState: null
    };

    function saveConfigs() {
        localStorage.setItem("ixlAutoAnswerConfigs", JSON.stringify(modelConfigs));
        localStorage.setItem("ixlAutoAnswerLanguage", config.language);
    }

    // 系统提示：明确要求只用纯 Unicode，不允许 Markdown/LaTeX，最终答案严格包裹在 $<answer> ... </answer>$
    const systemPrompt = `
You are an expert math assistant solving IXL problems. 
Do not use any markdown formatting, LaTeX, backticks, or similar delimiters. 
All output must be in plain Unicode. 
The FINAL ANSWER MUST be enclosed exactly within the tags $<answer> and </answer>$. 
For example, if the final answer is 42, your output should include: $<answer>42</answer>$.
You may include explanation or steps, but the final answer must be marked as specified.
    `;

    // -------------------- 2. 多语言文本 --------------------
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
            waiting: "Waiting for GPT response...",
            complete: "Submission complete.",
            reqError: "Request error: ",
            showLog: "Show Logs",
            hideLog: "Hide Logs",
            customModel: "Custom model name",
            testKey: "Test Key",
            testingKey: "Testing Key...",
            keyValid: "API key appears valid.",
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
            waiting: "等待GPT响应...",
            complete: "提交完成。",
            reqError: "请求错误：",
            showLog: "显示日志",
            hideLog: "隐藏日志",
            customModel: "自定义模型名称",
            testKey: "测试密钥",
            testingKey: "正在测试...",
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

    // -------------------- 3. 模型说明 --------------------
    const modelDescriptions = {
        "gpt-4o": "解决图片类题目，性价比较高。",
        "gpt-4o-mini": "仅支持文字题目，费用低。",
        "o1": "图片题解能力最佳，但较慢且费用高。",
        "o3-mini": "文字题目处理快且费用低，但准确性略逊。",
        "deepseek-reasoner": "无图片识别，费用低于 o1。",
        "deepseek-chat": "无图片识别，速度与 gpt-4o 相近，费用最低。",
        "chatgpt-4o-least": "RLHF 版本，接近人类风格，但容易出错。",
        "custom": "自定义模型。请输入模型名称。"
    };

    // -------------------- 4. 构建 GUI 布局 --------------------
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

        <!-- Answer Display -->
        <div id="answer-display" style="display:none; margin:6px 0; border:1px solid #aaa; padding:6px; background:#fff;">
          <h4>Final Answer:</h4>
          <div id="final-answer" style="font-size:18px; font-weight:bold; color:#080;"></div>
          <hr/>
          <div id="solution-steps" style="font-size:12px; color:#666;"></div>
        </div>

        <button id="ask-ai-btn" class="btn-secondary" style="width:100%; margin-bottom:6px;">${langText[config.language].askAi}</button>

        <div id="progress-container" style="display:none; margin-bottom:6px;">
          <progress id="progress-bar" max="100" value="0" style="width:100%;"></progress>
          <span id="progress-text">${langText[config.language].progress}</span>
        </div>

        <p id="status" style="font-weight:bold; margin-bottom:6px;">${langText[config.language].statusIdle}</p>

        <!-- 日志区 -->
        <div id="log-container" style="display:none; max-height:100px; overflow-y:auto; background:#fff; border:1px solid #888; padding:4px; margin-bottom:6px; font-family:monospace;"></div>

        <!-- 配置区，双列布局 -->
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
            <label>${langText[config.language].getApiKey}:</label>
            <div style="display:flex; gap:4px;">
              <a id="manage-link" class="link-button" href="#" target="_blank" style="flex:1;">Link</a>
              <button id="refresh-model-btn" class="btn-normal" style="flex:1;">${langText[config.language].refreshModels}</button>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(panel);

    // -------------------- 5. 缓存 UI 元素 --------------------
    const UI = {
        panel,
        logContainer: document.getElementById("log-container"),
        toggleLogBtn: document.getElementById("toggle-log-btn"),
        closeButton: document.getElementById("close-btn"),
        tokenUsageDisplay: document.getElementById("token-usage-display"),
        status: document.getElementById("status"),
        progressContainer: document.getElementById("progress-container"),
        progressBar: document.getElementById("progress-bar"),
        progressText: document.getElementById("progress-text"),
        fillModeSelect: document.getElementById("mode-select"),
        startAnswering: document.getElementById("start-answer-btn"),
        rollbackAnswer: document.getElementById("rollback-btn"),
        answerDisplay: document.getElementById("answer-display"),
        answerContent: document.getElementById("final-answer"),
        solutionSteps: document.getElementById("solution-steps"),
        modelSelect: document.getElementById("model-select"),
        modelDescription: document.getElementById("model-description"),
        customModelGroup: document.getElementById("custom-model-group"),
        customModelInput: document.getElementById("custom-model-input"),
        apiKeyInput: document.getElementById("api-key-input"),
        apiBaseInput: document.getElementById("api-base-input"),
        autoSubmitToggle: document.getElementById("auto-submit-toggle"),
        languageSelect: document.getElementById("language-select"),
        manageModelLink: document.getElementById("manage-link"),
        refreshModelListBtn: document.getElementById("refresh-model-btn"),
        rentApiBtn: document.getElementById("rent-key-btn")
    };

    // -------------------- 6. CSS 样式 --------------------
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
        font-size: 13px;
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
        flex: 1;
      }
      .config-area {
        display: flex;
        gap: 6px;
        margin-top: 8px;
      }
      .config-area .col {
        flex: 1;
        min-width: 150px;
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

    // -------------------- 7. 日志函数 --------------------
    function logMessage(msg) {
        const now = new Date().toLocaleString();
        const div = document.createElement("div");
        div.textContent = `[${now}] ${msg}`;
        UI.logContainer.appendChild(div);
        console.log("[Log]", msg);
    }
    function logDump(label, obj) {
        let str = `[DUMP] ${label}: `;
        try { str += JSON.stringify(obj); } catch(e){ str += String(obj); }
        logMessage(str);
    }

    // -------------------- 8. 更新语言文本 --------------------
    function updateLanguageText() {
        UI.toggleLogBtn.textContent = (UI.logContainer.style.display === "none") ? langText[config.language].showLog : langText[config.language].hideLog;
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

    // -------------------- 9. 构建模型下拉框 --------------------
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

        const discovered = Object.keys(modelConfigs).filter(k => modelConfigs[k].discovered);
        if(discovered.length > 0) {
            const ogDisc = document.createElement("optgroup");
            ogDisc.label = "Discovered";
            discovered.forEach(m => {
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

    // -------------------- 10. UI 事件绑定 --------------------
    // 切换日志显示
    UI.toggleLogBtn.addEventListener("click", () => {
        if(UI.logContainer.style.display === "none") {
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
        logMessage("Panel closed by user.");
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
            const target = getTargetDiv();
            if(target) {
                target.innerHTML = config.lastState;
                logMessage("Rolled back to previous question state.");
            }
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
        UI.apiKeyInput.value = modelConfigs[name].apiKey || "";
        UI.apiBaseInput.value = modelConfigs[name].apiBase || "";
        updateManageUrl();
    });
    // 保存 API Key
    document.getElementById("save-api-key").addEventListener("click", () => {
        const key = UI.apiKeyInput.value.trim();
        modelConfigs[config.selectedModel].apiKey = key;
        saveConfigs();
        logMessage("API Key saved.");
    });
    // 测试 API Key
    document.getElementById("check-key-btn").addEventListener("click", () => {
        testApiKey();
    });
    // 保存 API Base
    document.getElementById("save-api-base").addEventListener("click", () => {
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
    // "Ask AI" 对话框
    document.getElementById("ask-ai-btn").addEventListener("click", () => {
        openAiDialog();
    });

    // -------------------- 11. 更新 Manage URL --------------------
    function updateManageUrl() {
        let m = config.selectedModel.toLowerCase();
        let link = "#";
        if(m.indexOf("deepseek") !== -1) { link = "https://platform.deepseek.com/api_keys"; }
        else { link = "https://platform.openai.com/api-keys"; }
        modelConfigs[config.selectedModel].manageUrl = link;
        UI.manageModelLink.href = link;
        saveConfigs();
    }

    // -------------------- 12. 租用 API Key 弹窗 --------------------
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
          <p>Contact:</p>
          <ul>
            <li>felixliujy@Gmail.com</li>
            <li>admin@obanarchy.org</li>
          </ul>
          <button id="rent-close-btn">${langText[config.language].close}</button>
        `;
        overlay.appendChild(box);
        document.body.appendChild(overlay);
        box.querySelector("#rent-close-btn").addEventListener("click", () => {
            document.body.removeChild(overlay);
        });
    }

    // -------------------- 13. 测试 API Key --------------------
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
                    const data = JSON.parse(resp.responseText);
                    const ans = data.choices[0].message.content.toLowerCase();
                    if(ans.indexOf("test success") !== -1) {
                        alert(langText[config.language].keyValid);
                    } else {
                        alert(langText[config.language].keyInvalid);
                    }
                } catch(e) {
                    alert("Error parsing test result: " + e);
                }
            },
            onerror: (err) => {
                UI.status.textContent = langText[config.language].statusIdle;
                alert("Key test failed: " + JSON.stringify(err));
            }
        });
    }

    // -------------------- 14. 刷新模型列表 --------------------
    function refreshModelList() {
        const mc = modelConfigs[config.selectedModel];
        if(!mc) return;
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
                    const data = JSON.parse(resp.responseText);
                    if(Array.isArray(data.data)) {
                        const list = data.data.map(o => o.id);
                        mc.modelList = list;
                        list.forEach(m => {
                            if(!modelConfigs[m]) {
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
                } catch(e) {
                    alert("Error parsing model list: " + e);
                }
            },
            onerror: (err) => {
                alert("Failed refreshing models: " + JSON.stringify(err));
            }
        });
    }

    // -------------------- 15. "Ask AI" 对话框（非流式） --------------------
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
        btnClose.addEventListener("click", () => {
            document.body.removeChild(overlay);
        });
        btnSubmit.addEventListener("click", () => {
            let q = txtQ.value.trim();
            if (!q) return;
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
            method: "POST",
            url: mc.apiBase,
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${mc.apiKey}`
            },
            data: JSON.stringify(payload),
            onload: (resp) => {
                try {
                    const data = JSON.parse(resp.responseText);
                    const txt = data.choices[0].message.content;
                    onSuccess(txt);
                } catch(e) {
                    onError("Parse error: " + e);
                }
            },
            onerror: (err) => { onError(JSON.stringify(err)); }
        });
    }

    // -------------------- 16. Answer Question 主流程 --------------------
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
        if(!target) {
            logMessage("Question region not found!");
            return;
        }
        config.lastState = target.innerHTML;
        monitorDom(target);

        // 构造提示：把 HTML 传递给 GPT（可附加 LaTeX/Canvas 信息）
        let userPrompt = "HTML:\n" + target.outerHTML + "\n";
        const latex = captureLatex(target);
        if(latex) { userPrompt += "LaTeX:\n" + latex + "\n"; }
        const canvasB64 = latex ? null : captureCanvas(target);
        if(canvasB64) { userPrompt += "Canvas image base64 attached.\n"; }

        // 系统提示：要求最终答案必须用 $<answer> ... </answer>$ 包裹
        let sysPrompt = "";
        if(config.mode === "displayOnly") {
            sysPrompt = "You are an IXL math solver. You may provide explanation, but the FINAL ANSWER MUST be strictly enclosed within the tags $<answer> and </answer>$. Do not output markdown or LaTeX, only plain Unicode.";
        } else {
            sysPrompt = "You are an IXL math solver. Provide explanation and also output a JavaScript code block (in triple backticks) to auto fill answers. The FINAL ANSWER MUST be strictly enclosed within the tags $<answer> and </answer>$. Do not use markdown or LaTeX (except inside the code block).";
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
            method: "POST",
            url: mc.apiBase,
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${mc.apiKey}`
            },
            data: JSON.stringify(payload),
            onload: (resp) => {
                stopProgress();
                try {
                    const data = JSON.parse(resp.responseText);
                    logDump("Answer response", data);
                    if (data.usage && data.usage.total_tokens) {
                        config.totalTokens += data.usage.total_tokens;
                        UI.tokenUsageDisplay.textContent = langText[config.language].tokens + config.totalTokens;
                    }
                    const fullOutput = data.choices[0].message.content;
                    const finalAns = parseFinalAnswer(fullOutput);
                    const steps = fullOutput.replace(/<answer>[\s\S]*?<\/answer>/i, "").trim();
                    UI.answerDisplay.style.display = "block";
                    if(finalAns) {
                        UI.answerContent.innerHTML = `<span style="font-size:18px; font-weight:bold; color:#080;">${finalAns}</span>`;
                    } else {
                        UI.answerContent.innerHTML = `<span style="color:red; font-weight:bold;">Error: No <answer> marker found.</span>`;
                        UI.status.textContent = "Missing <answer> tag.";
                    }
                    UI.solutionSteps.textContent = steps;
                    if(config.mode === "autoFill") {
                        const codeMatch = fullOutput.match(/```javascript\s+([\s\S]*?)\s+```/i);
                        if(codeMatch && codeMatch[1]) {
                            const code = codeMatch[1].trim();
                            runCode(code);
                            if(config.autoSubmitEnabled) {
                                submitAnswer();
                            }
                        } else {
                            logMessage("No JavaScript code block found for auto fill.");
                        }
                    }
                    UI.status.textContent = langText[config.language].complete;
                } catch(e) {
                    logDump("Answer parse error", e);
                    UI.status.textContent = "Error parsing GPT output.";
                }
            },
            onerror: (err) => {
                stopProgress();
                UI.status.textContent = langText[config.language].reqError + JSON.stringify(err);
                logDump("Answer request error", err);
            }
        });
    }

    // -------------------- 17. 辅助函数 --------------------
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

    // -------------------- 18. 进度条 --------------------
    let progTimer = null;
    function startProgress() {
        UI.progressContainer.style.display = "block";
        UI.progressBar.value = 0;
        progTimer = setInterval(() => {
            if (UI.progressBar.value < 90) { UI.progressBar.value += 2; }
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

    // -------------------- 19. "Ask AI" 对话框 (非流式) --------------------
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
            method: "POST",
            url: mc.apiBase,
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${mc.apiKey}`
            },
            data: JSON.stringify(payload),
            onload: (resp) => {
                try {
                    const data = JSON.parse(resp.responseText);
                    const txt = data.choices[0].message.content;
                    onSuccess(txt);
                } catch(e) {
                    onError("Parse error: " + e);
                }
            },
            onerror: (err) => { onError(JSON.stringify(err)); }
        });
    }

    // -------------------- 20. AnswerQuestion 主流程 --------------------
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
        if(!target) { logMessage("Question region not found!"); return; }
        config.lastState = target.innerHTML;
        monitorDom(target);
        // 构造提示文本
        let userText = "HTML:\n" + target.outerHTML + "\n";
        const latex = captureLatex(target);
        if(latex) { userText += "LaTeX:\n" + latex + "\n"; }
        const canvasData = latex ? null : captureCanvas(target);
        if(canvasData) { userText += "Canvas image base64 attached.\n"; }

        let sysText = "";
        if(config.mode === "displayOnly") {
            sysText = "You are a math solver for IXL. Provide an explanation if needed, but the FINAL ANSWER MUST be strictly enclosed within the tags $<answer> and </answer>$. Do not output any markdown, LaTeX, or backticks. Only plain Unicode is allowed.";
        } else {
            sysText = "You are a math solver for IXL. Provide explanation if needed, and also output a JavaScript code block (in triple backticks) to fill in the answer automatically. However, the FINAL ANSWER MUST be strictly enclosed within the tags $<answer> and </answer>$. Do not output markdown/LaTeX outside the code block.";
        }
        UI.status.textContent = langText[config.language].waiting;
        startProgress();

        const payload = {
            model: config.selectedModel,
            messages: [
                { role: "system", content: sysText },
                { role: "user", content: userText }
            ]
        };
        const mcConfig = modelConfigs[config.selectedModel] || {};
        GM_xmlhttpRequest({
            method: "POST",
            url: mcConfig.apiBase,
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${mcConfig.apiKey}`
            },
            data: JSON.stringify(payload),
            onload: (resp) => {
                stopProgress();
                try {
                    const data = JSON.parse(resp.responseText);
                    logDump("Answer response", data);
                    if (data.usage && data.usage.total_tokens) {
                        config.totalTokens += data.usage.total_tokens;
                        UI.tokenUsageDisplay.textContent = langText[config.language].tokens + config.totalTokens;
                    }
                    const fullText = data.choices[0].message.content;
                    const finalAns = parseFinalAnswer(fullText);
                    const steps = fullText.replace(/<answer>[\s\S]*?<\/answer>/i, "").trim();
                    UI.answerDisplay.style.display = "block";
                    if(finalAns) {
                        UI.answerContent.innerHTML = `<span style="font-size:18px; font-weight:bold; color:#080;">${finalAns}</span>`;
                    } else {
                        UI.answerContent.innerHTML = `<span style="color:red; font-weight:bold;">Error: No <answer> marker found.</span>`;
                        UI.status.textContent = "Missing <answer> tag.";
                    }
                    UI.solutionSteps.textContent = steps;
                    if(config.mode === "autoFill") {
                        const codeMatch = fullText.match(/```javascript\s+([\s\S]*?)\s+```/i);
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
            onerror: (err) => {
                stopProgress();
                UI.status.textContent = langText[config.language].reqError + JSON.stringify(err);
                logDump("Answer request error", err);
            }
        });
    }

    // -------------------- 21. 辅助函数 --------------------
    function captureLatex(el) {
        const elems = el.querySelectorAll('script[type="math/tex"], .MathJax, .mjx-chtml');
        if(elems.length > 0) {
            let out = "";
            elems.forEach(e => { out += e.textContent + "\n"; });
            return out;
        }
        return null;
    }
    function captureCanvas(el) {
        const c = el.querySelector("canvas");
        if(c) {
            const canvas = document.createElement("canvas");
            canvas.width = c.width;
            canvas.height = c.height;
            canvas.getContext("2d").drawImage(c, 0, 0);
            return canvas.toDataURL("image/png").split(",")[1];
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

    // 从 GPT 输出中解析 $<answer> ... </answer>$ 标签内的最终答案
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

    // -------------------- 22. 进度条 --------------------
    let progTimer = null;
    function startProgress() {
        UI.progressContainer.style.display = "block";
        UI.progressBar.value = 0;
        progTimer = setInterval(() => {
            if (UI.progressBar.value < 90) { UI.progressBar.value += 2; }
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

    // -------------------- 23. "Ask AI" 对话框 --------------------
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
            method: "POST",
            url: mc.apiBase,
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${mc.apiKey}`
            },
            data: JSON.stringify(payload),
            onload: (resp) => {
                try {
                    const data = JSON.parse(resp.responseText);
                    const txt = data.choices[0].message.content;
                    onSuccess(txt);
                } catch(e) { onError("Parse error: " + e); }
            },
            onerror: (err) => { onError(JSON.stringify(err)); }
        });
    }

    // -------------------- 24. 初始化面板 --------------------
    function initPanel() {
        rebuildModelSelect();
        const conf = modelConfigs[config.selectedModel];
        UI.apiKeyInput.value = conf.apiKey || "";
        UI.apiBaseInput.value = conf.apiBase || "https://api.openai.com/v1/chat/completions";
        updateManageUrl();
        UI.fillModeSelect.value = config.mode;
        if(config.mode === "displayOnly") {
            document.getElementById("auto-submit-row").style.display = "none";
            UI.answerDisplay.style.display = "none";
        }
        UI.languageSelect.value = config.language;
        updateLanguageText();
        logMessage("Script loaded with optimized prompt and two-column GUI.");
    }
    initPanel();

    // -------------------- 25. 获取题目区域 --------------------
    function getTargetDiv() {
        let div = document.evaluate(
            '/html/body/main/div/article/section/section/div/div[1]',
            document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null
        ).singleNodeValue;
        if (!div) { div = document.querySelector('main div.article, main>div, article'); }
        return div;
    }

    // -------------------- 26. 主流程：Answer Question --------------------
    function answerQuestion() {
        logMessage("AnswerQuestion triggered.");
        const target = getTargetDiv();
        if(!target) {
            logMessage("Question region not found!");
            return;
        }
        config.lastState = target.innerHTML;
        monitorDom(target);

        // 组装提示：传递 HTML 及附加信息（LaTeX / Canvas）
        let userPrompt = "HTML:\n" + target.outerHTML + "\n";
        const latex = captureLatex(target);
        if (latex) { userPrompt += "LaTeX:\n" + latex + "\n"; }
        const canvasData = latex ? null : captureCanvas(target);
        if (canvasData) { userPrompt += "Canvas image base64 attached.\n"; }

        let sysPrompt = "";
        if(config.mode === "displayOnly") {
            sysPrompt = "You are a math solver for IXL. Provide explanation if needed, but the FINAL ANSWER MUST be strictly enclosed within the tags $<answer> and </answer>$. Output only plain Unicode (no markdown or LaTeX).";
        } else {
            sysPrompt = "You are a math solver for IXL. Provide explanation if needed and output a JavaScript code block (in triple backticks) to auto fill answers. However, the FINAL ANSWER MUST be strictly enclosed within the tags $<answer> and </answer>$. Do not output markdown/LaTeX outside the code block.";
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
            method: "POST",
            url: mc.apiBase,
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${mc.apiKey}`
            },
            data: JSON.stringify(payload),
            onload: (resp) => {
                stopProgress();
                try {
                    const data = JSON.parse(resp.responseText);
                    logDump("Answer response", data);
                    if (data.usage && data.usage.total_tokens) {
                        config.totalTokens += data.usage.total_tokens;
                        UI.tokenUsageDisplay.textContent = langText[config.language].tokens + config.totalTokens;
                    }
                    const output = data.choices[0].message.content;
                    const finalAns = parseFinalAnswer(output);
                    const steps = output.replace(/<answer>[\s\S]*?<\/answer>/i, "").trim();
                    UI.answerDisplay.style.display = "block";
                    if(finalAns) {
                        UI.answerContent.innerHTML = `<span style="font-size:18px; font-weight:bold; color:#080;">${finalAns}</span>`;
                    } else {
                        UI.answerContent.innerHTML = `<span style="color:red; font-weight:bold;">Error: No <answer> marker found.</span>`;
                        UI.status.textContent = "Missing <answer> tag.";
                    }
                    UI.solutionSteps.textContent = steps;
                    if (config.mode === "autoFill") {
                        const codeMatch = output.match(/```javascript\s+([\s\S]*?)\s+```/i);
                        if(codeMatch && codeMatch[1]) {
                            const code = codeMatch[1].trim();
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
            onerror: (err) => {
                stopProgress();
                UI.status.textContent = langText[config.language].reqError + JSON.stringify(err);
                logDump("Answer request error", err);
            }
        });
    }

    // -------------------- 27. 初始化辅助函数 --------------------
    function captureLatex(el) { // 捕获数学公式（如果有 MathJax/LaTeX 渲染内容）
        const elems = el.querySelectorAll('script[type="math/tex"], .MathJax, .mjx-chtml');
        if(elems.length > 0) {
            let out = "";
            elems.forEach(e => { out += e.textContent + "\n"; });
            return out;
        }
        return null;
    }
    function captureCanvas(el) { // 捕获 Canvas 图片
        const c = el.querySelector("canvas");
        if(c) {
            const canvas = document.createElement("canvas");
            canvas.width = c.width;
            canvas.height = c.height;
            canvas.getContext("2d").drawImage(c, 0, 0);
            return canvas.toDataURL("image/png").split(",")[1];
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

    // -------------------- 28. "Ask AI" 对话框 (保持非串流) --------------------
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
            method: "POST",
            url: mc.apiBase,
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${mc.apiKey}`
            },
            data: JSON.stringify(payload),
            onload: (resp) => {
                try {
                    const data = JSON.parse(resp.responseText);
                    const txt = data.choices[0].message.content;
                    onSuccess(txt);
                } catch(e) { onError("Parse error: " + e); }
            },
            onerror: (err) => { onError(JSON.stringify(err)); }
        });
    }

    // -------------------- 29. 初始化面板 --------------------
    function initPanel() {
        rebuildModelSelect();
        const conf = modelConfigs[config.selectedModel];
        UI.apiKeyInput.value = conf.apiKey || "";
        UI.apiBaseInput.value = conf.apiBase || "https://api.openai.com/v1/chat/completions";
        updateManageUrl();
        UI.fillModeSelect.value = config.mode;
        // 默认 displayOnly 隐藏自动提交
        if(config.mode === "displayOnly") {
            document.getElementById("auto-submit-row").style.display = "none";
            UI.answerDisplay.style.display = "none";
        }
        UI.languageSelect.value = config.language;
        updateLanguageText();
        logMessage("Script loaded with optimized prompt and two-column GUI.");
    }
    initPanel();

    // -------------------- 30. 获取题目区域 --------------------
    function getTargetDiv() {
        let d = document.evaluate(
            '/html/body/main/div/article/section/section/div/div[1]',
            document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null
        ).singleNodeValue;
        if(!d) { d = document.querySelector('main div.article, main>div, article'); }
        return d;
    }

    // -------------------- 31. 主流程：Answer Question --------------------
    function answerQuestion() {
        logMessage("AnswerQuestion triggered.");
        const target = getTargetDiv();
        if(!target) {
            logMessage("Question region not found!");
            return;
        }
        config.lastState = target.innerHTML;
        monitorDom(target);

        let userPrompt = "HTML:\n" + target.outerHTML + "\n";
        const latex = captureLatex(target);
        if(latex) { userPrompt += "LaTeX:\n" + latex + "\n"; }
        const canvasData = latex ? null : captureCanvas(target);
        if(canvasData) { userPrompt += "Canvas image base64 attached.\n"; }

        let sysPrompt = "";
        if(config.mode === "displayOnly") {
            sysPrompt = "You are a math solver for IXL. Provide any necessary explanation for your solution, but the FINAL ANSWER MUST be strictly enclosed within the tags $<answer> and </answer>$. Output only plain Unicode (do not use markdown, LaTeX, or backticks).";
        } else {
            sysPrompt = "You are a math solver for IXL. Provide a brief explanation for your solution and also output a JavaScript code block (in triple backticks) to auto fill answers. However, the FINAL ANSWER MUST be strictly enclosed within the tags $<answer> and </answer>$. Do not use markdown, LaTeX, or backticks (except for the code block).";
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
            method: "POST",
            url: mc.apiBase,
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${mc.apiKey}`
            },
            data: JSON.stringify(payload),
            onload: (resp) => {
                stopProgress();
                try {
                    const data = JSON.parse(resp.responseText);
                    logDump("Answer response", data);
                    if (data.usage && data.usage.total_tokens) {
                        config.totalTokens += data.usage.total_tokens;
                        UI.tokenUsageDisplay.textContent = langText[config.language].tokens + config.totalTokens;
                    }
                    const output = data.choices[0].message.content;
                    const finalAns = parseFinalAnswer(output);
                    const steps = output.replace(/<answer>[\s\S]*?<\/answer>/i, "").trim();
                    UI.answerDisplay.style.display = "block";
                    if(finalAns) {
                        UI.answerContent.innerHTML = `<span style="font-size:18px; font-weight:bold; color:#080;">${finalAns}</span>`;
                    } else {
                        UI.answerContent.innerHTML = `<span style="color:red; font-weight:bold;">Error: No <answer> marker found.</span>`;
                        UI.status.textContent = "Missing <answer> tag.";
                    }
                    UI.solutionSteps.textContent = steps;
                    if(config.mode === "autoFill") {
                        const codeMatch = output.match(/```javascript\s+([\s\S]*?)\s+```/i);
                        if(codeMatch && codeMatch[1]) {
                            const code = codeMatch[1].trim();
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
            onerror: (err) => {
                stopProgress();
                UI.status.textContent = langText[config.language].reqError + JSON.stringify(err);
                logDump("Answer request error", err);
            }
        });
    }

    // -------------------- 32. 初始化辅助函数 --------------------
    function captureLatex(el) {
        const elems = el.querySelectorAll('script[type="math/tex"], .MathJax, .mjx-chtml');
        if(elems.length > 0) {
            let out = "";
            elems.forEach(e => { out += e.textContent + "\n"; });
            return out;
        }
        return null;
    }
    function captureCanvas(el) {
        const c = el.querySelector("canvas");
        if(c) {
            const canvas = document.createElement("canvas");
            canvas.width = c.width;
            canvas.height = c.height;
            canvas.getContext("2d").drawImage(c, 0, 0);
            return canvas.toDataURL("image/png").split(",")[1];
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

    // -------------------- 33. 进度条控制 --------------------
    let progTimer = null;
    function startProgress() {
        UI.progressContainer.style.display = "block";
        UI.progressBar.value = 0;
        progTimer = setInterval(() => {
            if (UI.progressBar.value < 90) { UI.progressBar.value += 2; }
            else { clearInterval(progTimer); }
        }, 200);
    }
    function stopProgress() {
        if (progTimer) clearInterval(progTimer);
        UI.progressBar.value = 100;
        setTimeout(() => {
            UI.progressContainer.style.display = "none";
            UI.progressBar.value = 0;
        }, 400);
    }

    // -------------------- 34. "Ask AI" 对话框 (非流式) --------------------
    function openAiDialog() {
        const overlay = document.createElement("div");
        overlay.style.position = "fixed";
        overlay.style.top = "0";
        overlay.style.left = "0";
        overlay.style.width = "100%";
        overlay.style.height = "100%";
        overlay.style.backgroundColor = "rgba(0,0,0,0.5)";
        overlay.style.zIndex = "99999999";
        const box = document.createElement("div");
        box.style.position = "absolute";
        box.style.top = "50%";
        box.style.left = "50%";
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
        box.querySelector("#ai-dialog-close").addEventListener("click", () => { document.body.removeChild(overlay); });
        overlay.appendChild(box);
        document.body.appendChild(overlay);
        const btnSubmit = box.querySelector("#ai-dialog-submit");
        const txtQ = box.querySelector("#ai-dialog-q");
        const out = box.querySelector("#ai-dialog-output");
        btnSubmit.addEventListener("click", () => {
            let q = txtQ.value.trim();
            if (!q) return;
            out.textContent = "(waiting for answer...)";
            askAi(q, (resp) => {
                out.textContent = resp;
                const final = parseFinalAnswer(resp);
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
            method: "POST",
            url: mc.apiBase,
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${mc.apiKey}`
            },
            data: JSON.stringify(payload),
            onload: (resp) => {
                try {
                    const data = JSON.parse(resp.responseText);
                    const txt = data.choices[0].message.content;
                    onSuccess(txt);
                } catch (e) { onError("Parse error: " + e); }
            },
            onerror: (err) => { onError(JSON.stringify(err)); }
        });
    }

    // -------------------- 35. 初始化面板 --------------------
    function initPanel() {
        rebuildModelSelect();
        const conf = modelConfigs[config.selectedModel];
        UI.apiKeyInput.value = conf.apiKey || "";
        UI.apiBaseInput.value = conf.apiBase || "https://api.openai.com/v1/chat/completions";
        updateManageUrl();
        UI.fillModeSelect.value = config.mode;
        if(config.mode === "displayOnly") {
            document.getElementById("auto-submit-row").style.display = "none";
            UI.answerDisplay.style.display = "none";
        }
        UI.languageSelect.value = config.language;
        updateLanguageText();
        logMessage("Script loaded with optimized prompt and two-column compact layout.");
    }
    initPanel();

    // -------------------- 36. 获取题目区域 --------------------
    function getTargetDiv() {
        let d = document.evaluate(
            '/html/body/main/div/article/section/section/div/div[1]',
            document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null
        ).singleNodeValue;
        if(!d) { d = document.querySelector('main div.article, main>div, article'); }
        return d;
    }

    // -------------------- 37. 主流程：Answer Question --------------------
    function answerQuestion() {
        logMessage("AnswerQuestion triggered.");
        const target = getTargetDiv();
        if(!target) { logMessage("Question region not found!"); return; }
        config.lastState = target.innerHTML;
        monitorDom(target);

        let userPrompt = "HTML:\n" + target.outerHTML + "\n";
        const latex = captureLatex(target);
        if(latex) { userPrompt += "LaTeX:\n" + latex + "\n"; }
        const canvasData = latex ? null : captureCanvas(target);
        if(canvasData) { userPrompt += "Canvas image base64 attached.\n"; }

        let sysPrompt = "";
        if(config.mode === "displayOnly") {
            sysPrompt = "You are a math solver for IXL. Provide explanation if needed, but the FINAL ANSWER MUST be strictly enclosed within the tags $<answer> and </answer>$. Output only plain Unicode (do not use markdown, LaTeX, or backticks).";
        } else {
            sysPrompt = "You are a math solver for IXL. Provide explanation if needed and also output a JavaScript code block (in triple backticks) to auto fill answers. However, the FINAL ANSWER MUST be strictly enclosed within the tags $<answer> and </answer>$. Do not use markdown/LaTeX outside the code block.";
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
            method: "POST",
            url: mc.apiBase,
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${mc.apiKey}`
            },
            data: JSON.stringify(payload),
            onload: (resp) => {
                stopProgress();
                try {
                    const data = JSON.parse(resp.responseText);
                    logDump("Answer response", data);
                    if(data.usage && data.usage.total_tokens) {
                        config.totalTokens += data.usage.total_tokens;
                        UI.tokenUsageDisplay.textContent = langText[config.language].tokens + config.totalTokens;
                    }
                    const fullOutput = data.choices[0].message.content;
                    const finalAns = parseFinalAnswer(fullOutput);
                    const steps = fullOutput.replace(/<answer>[\s\S]*?<\/answer>/i, "").trim();
                    UI.answerDisplay.style.display = "block";
                    if(finalAns) {
                        UI.answerContent.innerHTML = `<span style="font-size:18px; font-weight:bold; color:#080;">${finalAns}</span>`;
                    } else {
                        UI.answerContent.innerHTML = `<span style="color:red; font-weight:bold;">Error: No <answer> marker found.</span>`;
                        UI.status.textContent = "Missing <answer> tag.";
                    }
                    UI.solutionSteps.textContent = steps;
                    if(config.mode === "autoFill") {
                        const codeMatch = fullOutput.match(/```javascript\s+([\s\S]*?)\s+```/i);
                        if(codeMatch && codeMatch[1]) {
                            const code = codeMatch[1].trim();
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
            onerror: (err) => {
                stopProgress();
                UI.status.textContent = langText[config.language].reqError + JSON.stringify(err);
                logDump("Answer request error", err);
            }
        });
    }

    // -------------------- 38. 初始化辅助 --------------------
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
        const discKeys = Object.keys(modelConfigs).filter(k => modelConfigs[k].discovered);
        if(discKeys.length > 0) {
            const ogDisc = document.createElement("optgroup");
            ogDisc.label = "Discovered";
            discKeys.forEach(m => {
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
        if (UI.modelSelect.querySelector(`option[value="${config.selectedModel}"]`)) {
            UI.modelSelect.value = config.selectedModel;
        } else {
            UI.modelSelect.value = "custom";
        }
        UI.modelDescription.textContent = modelDescriptions[config.selectedModel] || "User-defined model";
        UI.customModelGroup.style.display = (config.selectedModel === "custom") ? "block" : "none";
    }
    function updateManageUrl() {
        let m = config.selectedModel.toLowerCase();
        let link = "#";
        if(m.indexOf("deepseek") !== -1) { link = "https://platform.deepseek.com/api_keys"; }
        else { link = "https://platform.openai.com/api-keys"; }
        modelConfigs[config.selectedModel].manageUrl = link;
        UI.manageModelLink.href = link;
        saveConfigs();
    }
    function captureLatex(el) { return captureLatex(el); } // 重复定义时请忽略——使用上面函数
    function captureCanvas(el) { return captureCanvas(el); }
    function monitorDom(el) { monitorDom(el); } // 同上

    // -------------------- 39. 初始化完成 --------------------
    initPanel();

    // -------------------- End of Script --------------------
})();
