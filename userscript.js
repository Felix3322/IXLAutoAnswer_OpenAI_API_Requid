// ==UserScript==
// @name         IXL Auto Answer (Display by Default, AI Helper, IXL-styled)
// @namespace    http://tampermonkey.net/
// @version      13.0
// @license      GPL-3.0
// @description  Default to Display Answer Only; AI helper can configure script; new IXL-style layout; manage URL logic; rent API key link
// @match        https://*.ixl.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// ==/UserScript==

(function() {
    'use strict';

    //----------------------------------------------------------------------
    // 1) 说明 & 配置
    //----------------------------------------------------------------------
    // 脚本概述：提供自动答题(Display/AutoFill)、多模型管理、AI助手对话等
    // 下面这个描述会在 askAiQuestion() 时作为 system 内容的一部分
    const scriptDescription = `
This script can:
1) Solve IXL questions in two modes:
   - Display-only: GPT returns plain text answers (Unicode only, no LaTeX/Markdown).
   - Auto-fill: GPT returns JavaScript code to fill in answers automatically (unstable).
2) Supports multiple models, each with own apiKey/apiBase.
3) Has an AI Helper to discuss or reconfigure the script. The function window.AI_setScriptConfig(...) can be used to apply config changes.
4) 'Get API Key' link points to:
   - openai: https://platform.openai.com/api-keys
   - deepseek: https://platform.deepseek.com/api_keys
   - else: '#'
5) There's also a 'Rent API Key' button to pop up your contact info.
You are an assistant that helps the user understand or configure the script.
Allowed config fields: selectedModel, fillMode, autoSubmitEnabled, language, etc.
Return JSON if you want the script to apply changes: e.g. { "fillMode": "autoFill" } 
    `;

    // modelConfigs：各模型对应的 key/baseURL。 discovered=true 表示是通过 /models 动态发现
    let modelConfigs = JSON.parse(localStorage.getItem("gpt4o-modelConfigs") || "{}");

    // 预置模型列表
    const predefinedModels = [
        "gpt-4o", "gpt-4o-mini", "o1", "o3-mini",
        "deepseek-reasoner", "deepseek-chat", "chatgpt-4o-least"
    ];

    // 如果没有 gpt-4o，就给它一个默认
    if (!modelConfigs["gpt-4o"]) {
        modelConfigs["gpt-4o"] = {
            apiKey: localStorage.getItem("gpt4o-api-key") || "",
            apiBase: localStorage.getItem("gpt4o-api-base") || "https://api.openai.com/v1/chat/completions",
            manageUrl: "",
            modelList: [],
            discovered: false
        };
    }

    // 全局配置：默认 fillMode = displayOnly
    const config = {
        selectedModel: "gpt-4o",
        language: localStorage.getItem("gpt4o-language") || "en",
        tokenUsage: 0,
        lastTargetState: null,
        retryCount: 0,
        maxRetry: 2,
        fillMode: "displayOnly",
        autoSubmitEnabled: false
    };

    function saveModelConfigs() {
        localStorage.setItem("gpt4o-modelConfigs", JSON.stringify(modelConfigs));
    }

    //----------------------------------------------------------------------
    // 2) 多语言文本
    //----------------------------------------------------------------------
    const langText = {
        en: {
            fillModeLabel: "Answer Mode",
            fillMode_auto: "Auto Fill (unstable)",
            fillMode_display: "Display Only (default)",
            startAnswering: "Start Answering",
            rollback: "Rollback Last Answer",
            language: "Language",
            modelSelection: "Select Model",
            modelDescription: "Model Description",
            setApiKey: "Set API Key",
            saveApiKey: "Save API Key",
            apiKeyPlaceholder: "Enter your API key",
            setApiBase: "Set API Base",
            saveApiBase: "Save API Base",
            apiBasePlaceholder: "Enter your API base URL",
            statusWaiting: "Status: Waiting for input",
            analyzingHtml: "Analyzing HTML structure...",
            extractingData: "Extracting question data...",
            constructingApi: "Constructing API request...",
            waitingGpt: "Waiting for GPT response...",
            parsingResponse: "Parsing GPT response...",
            executingCode: "Executing code...",
            submissionComplete: "Submission complete.",
            requestError: "Request error: ",
            showLog: "Show Logs",
            hideLog: "Hide Logs",
            customModelPlaceholder: "Enter your custom model name",
            checkApiKey: "Test API Key",
            checkingApiKey: "Testing API key...",
            apiKeyValid: "API key seems valid (test success).",
            apiKeyInvalid: "API key is invalid (did not see test success).",
            progressText: "Processing...",
            tokenUsage: "Tokens: ",
            closeButton: "Close",
            manageModelLink: "Get API Key",
            refreshModelList: "Refresh Model List",
            modelListLabel: "Fetched Model Names",
            askAi: "Ask AI",
            askAiTitle: "AI Helper",
            rentApiKey: "Rent API Key"
        },
        zh: {
            fillModeLabel: "答题模式",
            fillMode_auto: "自动填写（不稳定）",
            fillMode_display: "仅显示（默认）",
            startAnswering: "开始答题",
            rollback: "撤回上一次",
            language: "语言",
            modelSelection: "选择模型",
            modelDescription: "模型介绍",
            setApiKey: "设置 API 密钥",
            saveApiKey: "保存 API 密钥",
            apiKeyPlaceholder: "请输入您的 API 密钥",
            setApiBase: "设置 API 基础地址",
            saveApiBase: "保存 API 基础地址",
            apiBasePlaceholder: "请输入您的 API 基础地址",
            statusWaiting: "状态：等待输入",
            analyzingHtml: "分析 HTML 结构...",
            extractingData: "提取问题数据...",
            constructingApi: "构造 API 请求...",
            waitingGpt: "等待 GPT 响应...",
            parsingResponse: "解析 GPT 响应...",
            executingCode: "执行代码...",
            submissionComplete: "完成提交。",
            requestError: "请求错误：",
            showLog: "显示日志",
            hideLog: "隐藏日志",
            customModelPlaceholder: "输入自定义模型名称",
            checkApiKey: "测试 API 密钥",
            checkingApiKey: "正在测试 API 密钥...",
            apiKeyValid: "API 密钥有效（收到 test success）。",
            apiKeyInvalid: "API 密钥无效（没有收到 test success）。",
            progressText: "处理中...",
            tokenUsage: "使用量: ",
            closeButton: "关闭",
            manageModelLink: "获取 API Key",
            refreshModelList: "刷新模型列表",
            modelListLabel: "已获取模型名称",
            askAi: "问AI",
            askAiTitle: "AI 助手",
            rentApiKey: "租用 API Key"
        }
    };

    //----------------------------------------------------------------------
    // 3) 模型介绍
    //----------------------------------------------------------------------
    const modelDescriptions = {
        "gpt-4o": "Can solve problems with images, cost-effective.",
        "gpt-4o-mini": "Handles text-only questions, cheap option.",
        "o1": "Solves image problems with highest accuracy, but is slow and expensive.",
        "o3-mini": "Handles text-only questions, fast and cost-effective, but accuracy is not as high as o1.",
        "deepseek-reasoner": "Similar speed to o1, lower accuracy. No image recognition, cheaper than o1.",
        "deepseek-chat": "Similar speed to 4o, similar accuracy, no image recognition, cheapest.",
        "chatgpt-4o-least": "Unstable RLHF version. More human-like but prone to mistakes/hallucinations.",
        "custom": "User-defined model. Please enter your model name below."
    };

    //----------------------------------------------------------------------
    // 4) 构建主面板（模仿 IXL 风格布局）
    //----------------------------------------------------------------------
    const panel = document.createElement('div');
    panel.id = "gpt4o-panel";
    panel.innerHTML = `
      <div class="ixl-header-bar">
          <span class="ixl-header-title">GPT Answer Assistant</span>
          <div class="ixl-header-right">
              <span id="token-usage-display" class="ixl-token-usage">${langText[config.language].tokenUsage}0</span>
              <button id="toggle-log-btn">${langText[config.language].showLog}</button>
              <button id="close-button">${langText[config.language].closeButton}</button>
          </div>
      </div>
      <div class="ixl-content-area">

          <button id="start-answering" class="ixl-btn-emphasized">${langText[config.language].startAnswering}</button>

          <div class="ixl-row">
              <div class="ixl-col">
                  <label id="label-fill-mode">${langText[config.language].fillModeLabel}:</label>
                  <select id="fill-mode-select">
                      <option value="autoFill">${langText[config.language].fillMode_auto}</option>
                      <option value="displayOnly">${langText[config.language].fillMode_display}</option>
                  </select>
              </div>
              <div class="ixl-col">
                  <button id="rollback-answer">${langText[config.language].rollback}</button>
              </div>
          </div>

          <div class="ixl-row">
              <div class="ixl-col">
                  <label id="label-model-selection">${langText[config.language].modelSelection}:</label>
                  <select id="model-select"></select>
                  <p id="model-description"></p>
              </div>
              <!-- 自定义模型 -->
              <div class="ixl-col" id="custom-model-group" style="display: none;">
                  <label id="label-custom-model">${langText[config.language].modelSelection} (Custom):</label>
                  <input type="text" id="custom-model-input" placeholder="${langText[config.language].customModelPlaceholder}">
              </div>
          </div>

          <div class="ixl-row">
              <div class="ixl-col">
                  <label id="label-api-key">${langText[config.language].setApiKey}:</label>
                  <input type="password" id="api-key-input" placeholder="${langText[config.language].apiKeyPlaceholder}">
                  <button id="save-api-key">${langText[config.language].saveApiKey}</button>
                  <button id="check-api-key-btn">${langText[config.language].checkApiKey}</button>
              </div>
              <div class="ixl-col">
                  <label id="label-api-base">${langText[config.language].setApiBase}:</label>
                  <input type="text" id="api-base-input" placeholder="${langText[config.language].apiBasePlaceholder}">
                  <button id="save-api-base">${langText[config.language].saveApiBase}</button>
              </div>
          </div>

          <div class="ixl-row">
              <div class="ixl-col">
                  <label>${langText[config.language].manageModelLink}:</label>
                  <div style="display:flex; gap:10px;">
                      <a id="manage-model-link" href="#" target="_blank" class="ixl-link">Open Link</a>
                      <button id="rent-api-btn" style="flex-shrink:0;">${langText[config.language].rentApiKey}</button>
                  </div>
              </div>
              <div class="ixl-col">
                  <button id="refresh-model-list-btn">${langText[config.language].refreshModelList}</button>
              </div>
          </div>

          <!-- auto submit -->
          <div class="ixl-row" id="auto-submit-group">
              <div class="ixl-col">
                  <label id="label-auto-submit">
                      <input type="checkbox" id="auto-submit-toggle">
                      <span id="span-auto-submit">Enable Auto Submit</span>
                  </label>
              </div>
          </div>

          <div class="ixl-row">
              <div class="ixl-col">
                  <label id="label-language">${langText[config.language].language}:</label>
                  <select id="language-select">
                      <option value="en" ${config.language === "en" ? "selected" : ""}>English</option>
                      <option value="zh" ${config.language === "zh" ? "selected" : ""}>中文</option>
                  </select>
              </div>
          </div>

          <div id="progress-container" style="display:none; margin-top:10px;">
              <progress id="progress-bar" max="100" value="0"></progress>
              <span id="progress-text">${langText[config.language].progressText}</span>
          </div>

          <p id="status" style="margin-top:10px;font-weight:bold;">
            ${langText[config.language].statusWaiting}
          </p>

          <!-- log -->
          <div id="log-container" style="display: none; max-height: 180px; overflow-y: auto; border: 1px solid #ccc; margin-top: 10px; padding: 5px; background-color: #fff;font-family:monospace;"></div>

          <!-- 如果 fillMode = displayOnly 这里显示答案 -->
          <div id="answer-display" style="display: none; margin-top: 10px; padding: 8px; border: 1px solid #ccc; background-color: #fff;">
              <h4>GPT Answer:</h4>
              <div id="answer-content" style="white-space: pre-wrap;"></div>
          </div>

          <!-- 底部：问 AI -->
          <button id="ask-ai-btn" class="ixl-btn-secondary" style="margin-top: 10px;">
              ${langText[config.language].askAi}
          </button>
      </div>
    `;
    document.body.appendChild(panel);

    // 常用的 UI 句柄
    const UI = {
        panel,
        logContainer: panel.querySelector("#log-container"),
        status: panel.querySelector("#status"),
        tokenUsageDisplay: panel.querySelector("#token-usage-display"),
        closeButton: panel.querySelector("#close-button"),
        toggleLogBtn: panel.querySelector("#toggle-log-btn"),
        progressContainer: panel.querySelector("#progress-container"),
        progressBar: panel.querySelector("#progress-bar"),
        startAnswering: panel.querySelector("#start-answering"),
        rollbackAnswer: panel.querySelector("#rollback-answer"),
        fillModeSelect: panel.querySelector("#fill-mode-select"),
        answerDisplay: panel.querySelector("#answer-display"),
        answerContent: panel.querySelector("#answer-content"),
        autoSubmitGroup: panel.querySelector("#auto-submit-group"),
        autoSubmitToggle: panel.querySelector("#auto-submit-toggle"),
        languageSelect: panel.querySelector("#language-select"),
        apiKeyInput: panel.querySelector("#api-key-input"),
        apiBaseInput: panel.querySelector("#api-base-input"),
        modelSelect: panel.querySelector("#model-select"),
        modelDescription: panel.querySelector("#model-description"),
        customModelGroup: panel.querySelector("#custom-model-group"),
        customModelInput: panel.querySelector("#custom-model-input"),
        manageModelLink: panel.querySelector("#manage-model-link"),
        refreshModelListBtn: panel.querySelector("#refresh-model-list-btn"),
        rentApiBtn: panel.querySelector("#rent-api-btn")
    };

    //----------------------------------------------------------------------
    // 5) 样式 (IXL-like)
    //----------------------------------------------------------------------
    GM_addStyle(`
      /* 全局面板外观 */
      #gpt4o-panel {
          position: fixed;
          top: 80px;
          right: 20px;
          width: 600px;
          z-index: 999999;
          border-radius: 6px;
          box-shadow: 0 3px 12px rgba(0,0,0,0.3);
          overflow: hidden;
          font-family: "Arial", sans-serif;
      }
      .ixl-header-bar {
          background-color: #003b5c;
          color: #fff;
          padding: 8px 15px;
          display: flex;
          justify-content: space-between;
          align-items: center;
      }
      .ixl-header-title {
          font-size: 16px;
          font-weight: bold;
      }
      .ixl-header-right button {
          background-color: #d9534f;
          border: none;
          color: #fff;
          padding: 4px 8px;
          border-radius: 3px;
          margin-left: 5px;
          cursor: pointer;
      }
      .ixl-header-right button:hover {
          opacity: 0.8;
      }
      .ixl-header-right .ixl-token-usage {
          margin-right: 10px;
          font-weight: bold;
      }
      .ixl-content-area {
          background-color: #f0f4f5;
          padding: 15px;
      }

      /* 行列布局 */
      .ixl-row {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin-top: 10px;
      }
      .ixl-col {
          flex: 1;
          min-width: 0;
      }

      /* 按钮 */
      button {
          cursor: pointer;
      }
      .ixl-btn-emphasized {
          display: block;
          width: 100%;
          background-color: #f0ad4e; /* 橘黄色 */
          color: #fff;
          padding: 10px 0;
          font-size: 15px;
          font-weight: bold;
          border: none;
          border-radius: 4px;
          text-align: center;
      }
      .ixl-btn-emphasized:hover {
          background-color: #ec971f;
      }
      .ixl-btn-secondary {
          width: 100%;
          background-color: #bbb;
          color: #333;
          padding: 10px 0;
          border: none;
          border-radius: 4px;
          font-size: 14px;
      }
      .ixl-btn-secondary:hover {
          background-color: #aaa;
      }

      input, select, button {
          font-size: 14px;
          padding: 6px;
          box-sizing: border-box;
          width: 100%;
      }

      .ixl-link {
          display: inline-block;
          padding: 6px;
          background-color: #2f8ee0;
          color: #fff;
          border-radius: 4px;
          text-decoration: none;
          text-align: center;
      }
      .ixl-link:hover {
          opacity: 0.8;
      }
    `);

    //----------------------------------------------------------------------
    // 6) 日志函数
    //----------------------------------------------------------------------
    function logMessage(msg) {
        const now = new Date().toLocaleString();
        const div = document.createElement('div');
        div.textContent = `[${now}] ${msg}`;
        UI.logContainer.appendChild(div);
        console.log(`[Log] ${msg}`);
    }
    function logDump(label, val) {
        let msg = `[DUMP] ${label}: `;
        if (typeof val === "object") {
            try { msg += JSON.stringify(val); } catch(e){ msg += String(val); }
        } else {
            msg += String(val);
        }
        logMessage(msg);
    }

    //----------------------------------------------------------------------
    // 7) 填充语言文本
    //----------------------------------------------------------------------
    function updateLanguageText() {
        UI.startAnswering.textContent = langText[config.language].startAnswering;
        UI.rollbackAnswer.textContent = langText[config.language].rollback;

        panel.querySelector("#label-fill-mode").textContent = langText[config.language].fillModeLabel + ":";
        UI.fillModeSelect.options[0].text = langText[config.language].fillMode_auto;
        UI.fillModeSelect.options[1].text = langText[config.language].fillMode_display;

        panel.querySelector("#close-button").textContent = langText[config.language].closeButton;

        panel.querySelector("#label-model-selection").textContent = langText[config.language].modelSelection + ":";
        panel.querySelector("#label-custom-model").textContent = langText[config.language].modelSelection + " (Custom):";
        UI.customModelInput.placeholder = langText[config.language].customModelPlaceholder;

        panel.querySelector("#label-api-key").textContent = langText[config.language].setApiKey + ":";
        UI.apiKeyInput.placeholder = langText[config.language].apiKeyPlaceholder;
        panel.querySelector("#save-api-key").textContent = langText[config.language].saveApiKey;
        panel.querySelector("#check-api-key-btn").textContent = langText[config.language].checkApiKey;

        panel.querySelector("#label-api-base").textContent = langText[config.language].setApiBase + ":";
        UI.apiBaseInput.placeholder = langText[config.language].apiBasePlaceholder;
        panel.querySelector("#save-api-base").textContent = langText[config.language].saveApiBase;

        panel.querySelector("#refresh-model-list-btn").textContent = langText[config.language].refreshModelList;

        panel.querySelector("#span-auto-submit").textContent = "Enable Auto Submit"; // 仅英语写死了，也可多语言化
        panel.querySelector("#label-language").textContent = langText[config.language].language + ":";

        panel.querySelector("#progress-text").textContent = langText[config.language].progressText;
        UI.status.textContent = langText[config.language].statusWaiting;
        UI.toggleLogBtn.textContent = (UI.logContainer.style.display === "none") ? langText[config.language].showLog : langText[config.language].hideLog;
        UI.tokenUsageDisplay.textContent = langText[config.language].tokenUsage + config.tokenUsage;

        panel.querySelector("#ask-ai-btn").textContent = langText[config.language].askAi;
        panel.querySelector("#manage-model-link").textContent = langText[config.language].manageModelLink;
        UI.rentApiBtn.textContent = langText[config.language].rentApiKey;
    }

    //----------------------------------------------------------------------
    // 8) 构建下拉框
    //----------------------------------------------------------------------
    function rebuildModelSelect() {
        UI.modelSelect.innerHTML = "";
        // 预置
        const ogPre = document.createElement("optgroup");
        ogPre.label = "Predefined";
        predefinedModels.forEach(m => {
            const opt = document.createElement("option");
            opt.value = m;
            opt.textContent = m;
            ogPre.appendChild(opt);
        });
        UI.modelSelect.appendChild(ogPre);

        // 动态发现
        const ogDisc = document.createElement("optgroup");
        ogDisc.label = "Discovered";
        const discoveredKeys = Object.keys(modelConfigs).filter(k => modelConfigs[k].discovered);
        if (discoveredKeys.length > 0) {
            discoveredKeys.forEach(m => {
                const opt = document.createElement("option");
                opt.value = m;
                opt.textContent = m;
                ogDisc.appendChild(opt);
            });
            UI.modelSelect.appendChild(ogDisc);
        }

        // custom
        const optCustom = document.createElement("option");
        optCustom.value = "custom";
        optCustom.textContent = "custom";
        UI.modelSelect.appendChild(optCustom);

        // set selected
        if (UI.modelSelect.querySelector(`option[value="${config.selectedModel}"]`)) {
            UI.modelSelect.value = config.selectedModel;
        } else {
            UI.modelSelect.value = "custom";
        }

        UI.modelDescription.textContent = modelDescriptions[config.selectedModel] || "Custom or discovered model.";
        UI.customModelGroup.style.display = (config.selectedModel === "custom") ? "block" : "none";
    }

    //----------------------------------------------------------------------
    // 9) 事件绑定
    //----------------------------------------------------------------------
    // 关闭面板
    UI.closeButton.addEventListener("click", () => {
        panel.style.display = "none";
        logMessage("Panel closed by user.");
    });

    // 显示/隐藏日志
    UI.toggleLogBtn.addEventListener("click", () => {
        if (UI.logContainer.style.display === "none") {
            UI.logContainer.style.display = "block";
            UI.toggleLogBtn.textContent = langText[config.language].hideLog;
            logMessage("Log panel shown.");
        } else {
            UI.logContainer.style.display = "none";
            UI.toggleLogBtn.textContent = langText[config.language].showLog;
            logMessage("Log panel hidden.");
        }
    });

    // 语言切换
    UI.languageSelect.addEventListener("change", () => {
        config.language = UI.languageSelect.value;
        localStorage.setItem("gpt4o-language", config.language);
        updateLanguageText();
    });

    // 答题模式切换
    UI.fillModeSelect.addEventListener("change", () => {
        config.fillMode = UI.fillModeSelect.value;
        if (config.fillMode === "displayOnly") {
            UI.answerDisplay.style.display = "block";
            UI.answerContent.textContent = "";
            UI.autoSubmitGroup.style.display = "none";
        } else {
            // 当用户选择 autoFill 时，提示不稳定
            alert("Warning: Auto Fill mode is unstable. Recommended only if you need automatic filling.");
            UI.answerDisplay.style.display = "none";
            UI.autoSubmitGroup.style.display = "block";
        }
    });

    // 开始答题
    UI.startAnswering.addEventListener("click", () => {
        answerQuestion();
    });

    // 撤回
    UI.rollbackAnswer.addEventListener("click", () => {
        if (config.lastTargetState) {
            const tgt = getTargetDiv();
            if (tgt) {
                tgt.innerHTML = config.lastTargetState;
                logMessage("Rolled back to previous state.");
            } else {
                logMessage("Rollback failed: no target found.");
            }
        } else {
            logMessage("No previous state available for rollback.");
        }
    });

    // 模型选择
    UI.modelSelect.addEventListener("change", () => {
        config.selectedModel = UI.modelSelect.value;
        if (!modelConfigs[config.selectedModel]) {
            modelConfigs[config.selectedModel] = {
                apiKey: "",
                apiBase: "https://api.openai.com/v1/chat/completions",
                manageUrl: "",
                modelList: [],
                discovered: false
            };
        }
        UI.modelDescription.textContent = modelDescriptions[config.selectedModel] || "Custom or discovered model.";
        UI.customModelGroup.style.display = (config.selectedModel === "custom") ? "block" : "none";
        UI.apiKeyInput.value = modelConfigs[config.selectedModel].apiKey || "";
        UI.apiBaseInput.value = modelConfigs[config.selectedModel].apiBase || "";
        updateManageUrl(); // 更新“Get API Key”链接
    });

    // 自定义模型
    UI.customModelInput.addEventListener("change", () => {
        const name = UI.customModelInput.value.trim();
        if (!name) return;
        config.selectedModel = name;
        if (!modelConfigs[name]) {
            modelConfigs[name] = {
                apiKey: "",
                apiBase: "https://api.openai.com/v1/chat/completions",
                manageUrl: "",
                modelList: [],
                discovered: false
            };
        }
        rebuildModelSelect();
        UI.modelSelect.value = "custom";
        UI.apiKeyInput.value = modelConfigs[name].apiKey;
        UI.apiBaseInput.value = modelConfigs[name].apiBase;
        updateManageUrl();
    });

    // 保存 apiKey
    panel.querySelector("#save-api-key").addEventListener("click", () => {
        const newKey = UI.apiKeyInput.value.trim();
        modelConfigs[config.selectedModel].apiKey = newKey;
        saveModelConfigs();
        logDump("API Key saved", newKey);
    });

    // 测试 apiKey
    panel.querySelector("#check-api-key-btn").addEventListener("click", () => {
        UI.status.textContent = langText[config.language].checkingApiKey;
        checkApiKey();
    });

    // 保存 apiBase
    panel.querySelector("#save-api-base").addEventListener("click", () => {
        const newBase = UI.apiBaseInput.value.trim();
        modelConfigs[config.selectedModel].apiBase = newBase;
        saveModelConfigs();
        logDump("API Base saved", newBase);
    });

    // 刷新模型列表
    UI.refreshModelListBtn.addEventListener("click", () => {
        refreshModelList();
    });

    // Auto Submit
    UI.autoSubmitToggle.addEventListener("change", () => {
        config.autoSubmitEnabled = UI.autoSubmitToggle.checked;
        logDump("autoSubmitEnabled", config.autoSubmitEnabled);
    });

    // 租用APIkey
    UI.rentApiBtn.addEventListener("click", () => {
        showRentApiPopup();
    });

    // 问AI
    panel.querySelector("#ask-ai-btn").addEventListener("click", () => {
        openAiHelperDialog();
    });

    //----------------------------------------------------------------------
    // 10) ManageUrl / RentKey 弹窗
    //----------------------------------------------------------------------
    function updateManageUrl() {
        // 如果包含 "deepseek" 则指向 deepseek api；若不是则 openai；如都不匹配则 "#"
        let modelName = config.selectedModel.toLowerCase();
        let link = "#";
        if (modelName.includes("deepseek")) {
            link = "https://platform.deepseek.com/api_keys";
        } else {
            // 默认当成 openai
            link = "https://platform.openai.com/api-keys";
        }
        modelConfigs[config.selectedModel].manageUrl = link;
        UI.manageModelLink.href = link;
        saveModelConfigs();
    }

    function showRentApiPopup() {
        const overlay = document.createElement("div");
        overlay.style.position = "fixed";
        overlay.style.top = "0";
        overlay.style.left = "0";
        overlay.style.width = "100%";
        overlay.style.height = "100%";
        overlay.style.zIndex = "100000";
        overlay.style.backgroundColor = "rgba(0,0,0,0.5)";
        const box = document.createElement("div");
        box.style.position = "absolute";
        box.style.top = "50%";
        box.style.left = "50%";
        box.style.transform = "translate(-50%,-50%)";
        box.style.backgroundColor = "#fff";
        box.style.padding = "20px";
        box.style.borderRadius = "6px";
        box.style.width = "400px";
        box.innerHTML = `
            <h3>Rent an API Key</h3>
            <p>Please contact me at:</p>
            <ul>
                <li>felixliujy@Gmail.com</li>
                <li>admin@obanarchy.org</li>
            </ul>
            <button id="rent-close-btn">${langText[config.language].closeButton}</button>
        `;
        overlay.appendChild(box);
        document.body.appendChild(overlay);
        box.querySelector("#rent-close-btn").addEventListener("click", () => {
            document.body.removeChild(overlay);
        });
    }

    //----------------------------------------------------------------------
    // 11) AI Helper：能够配置脚本
    //----------------------------------------------------------------------
    function openAiHelperDialog() {
        const overlay = document.createElement("div");
        overlay.style.position = "fixed";
        overlay.style.top = "0";
        overlay.style.left = "0";
        overlay.style.width = "100%";
        overlay.style.height = "100%";
        overlay.style.backgroundColor = "rgba(0,0,0,0.5)";
        overlay.style.zIndex = "200001";

        const box = document.createElement("div");
        box.style.position = "absolute";
        box.style.top = "50%";
        box.style.left = "50%";
        box.style.transform = "translate(-50%, -50%)";
        box.style.backgroundColor = "#fff";
        box.style.padding = "20px";
        box.style.borderRadius = "6px";
        box.style.width = "480px";
        box.style.maxHeight = "80%";
        box.style.overflowY = "auto";
        box.style.textAlign = "left";

        box.innerHTML = `
            <h3>${langText[config.language].askAiTitle}</h3>
            <textarea id="ask-ai-question" style="width:100%;height:80px;" placeholder="Type your question..."></textarea>
            <div style="margin-top:10px;">
                <button id="ask-ai-submit">Submit</button>
                <button id="ask-ai-close">${langText[config.language].closeButton}</button>
            </div>
            <pre id="ask-ai-answer" style="margin-top:10px;white-space:pre-wrap;background:#f7f7f7;padding:10px;border-radius:4px;max-height:300px;overflow:auto;"></pre>
        `;
        overlay.appendChild(box);
        document.body.appendChild(overlay);

        const txtQuestion = box.querySelector("#ask-ai-question");
        const divAnswer = box.querySelector("#ask-ai-answer");
        box.querySelector("#ask-ai-close").addEventListener("click", () => {
            document.body.removeChild(overlay);
        });
        box.querySelector("#ask-ai-submit").addEventListener("click", () => {
            const question = txtQuestion.value.trim();
            if (!question) return;
            divAnswer.textContent = "... loading ...";
            askAiQuestion(question, (answer) => {
                divAnswer.textContent = answer;
            });
        });
    }

    function askAiQuestion(userQuery, callback) {
        const modelConf = modelConfigs[config.selectedModel] || {};
        const payload = {
            model: config.selectedModel,
            messages: [
                { role: "system", content: scriptDescription },
                { role: "user", content: userQuery }
            ]
        };
        GM_xmlhttpRequest({
            method: "POST",
            url: modelConf.apiBase || "https://api.openai.com/v1/chat/completions",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${modelConf.apiKey}`
            },
            data: JSON.stringify(payload),
            onload: function(resp) {
                try {
                    const data = JSON.parse(resp.responseText);
                    const text = data.choices[0].message.content.trim();
                    callback(text);
                } catch(e) {
                    callback("[Error parsing AI response]");
                    logDump("askAiQuestion Parse Error", e);
                }
            },
            onerror: function(err) {
                callback("[AI request failed]");
                logDump("askAiQuestion Error", err);
            }
        });
    }

    // 提供给外部AI一个配置函数
    window.AI_setScriptConfig = function(newCfg) {
        // newCfg 可能形如 { fillMode: "autoFill", language: "en", autoSubmitEnabled: true }
        // 这里我们有选择地应用
        if (typeof newCfg.language === "string") {
            config.language = newCfg.language;
            localStorage.setItem("gpt4o-language", config.language);
            updateLanguageText();
        }
        if (typeof newCfg.fillMode === "string") {
            config.fillMode = newCfg.fillMode;
            UI.fillModeSelect.value = config.fillMode;
            if (config.fillMode === "displayOnly") {
                UI.answerDisplay.style.display = "block";
                UI.answerContent.textContent = "";
                UI.autoSubmitGroup.style.display = "none";
            } else {
                UI.answerDisplay.style.display = "none";
                UI.autoSubmitGroup.style.display = "block";
            }
        }
        if (typeof newCfg.autoSubmitEnabled === "boolean") {
            config.autoSubmitEnabled = newCfg.autoSubmitEnabled;
            UI.autoSubmitToggle.checked = newCfg.autoSubmitEnabled;
        }
        // 其他更多字段...
        logMessage("AI_setScriptConfig invoked with: " + JSON.stringify(newCfg));
    };

    //----------------------------------------------------------------------
    // 12) 测试 API Key
    //----------------------------------------------------------------------
    function checkApiKey() {
        const modelConf = modelConfigs[config.selectedModel];
        if (!modelConf) return;
        const testPayload = {
            model: config.selectedModel,
            messages: [
                {role: "system", content: "You are a quick test assistant."},
                {role: "user", content: "Please ONLY respond with: test success"}
            ]
        };
        GM_xmlhttpRequest({
            method: "POST",
            url: modelConf.apiBase || "https://api.openai.com/v1/chat/completions",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${modelConf.apiKey}`
            },
            data: JSON.stringify(testPayload),
            onload: function(resp) {
                UI.status.textContent = langText[config.language].statusWaiting;
                try {
                    logDump("checkApiKey Response", resp.responseText);
                    const data = JSON.parse(resp.responseText);
                    const ans = data.choices[0].message.content.trim().toLowerCase();
                    if (ans.includes("test success")) {
                        alert(langText[config.language].apiKeyValid);
                    } else {
                        alert(langText[config.language].apiKeyInvalid);
                    }
                } catch(e) {
                    alert("Error while testing key: " + e);
                }
            },
            onerror: function(err) {
                logDump("API Key Test Error", err);
                UI.status.textContent = langText[config.language].statusWaiting;
                alert("Test failed: " + JSON.stringify(err));
            }
        });
    }

    //----------------------------------------------------------------------
    // 13) 获取模型列表
    //----------------------------------------------------------------------
    function refreshModelList() {
        const modelConf = modelConfigs[config.selectedModel];
        if (!modelConf) return;
        const url = modelConf.apiBase.replace("/chat/completions","/models");
        logMessage("Fetching model list from: " + url);
        GM_xmlhttpRequest({
            method: "GET",
            url: url,
            headers: {
                "Authorization": `Bearer ${modelConf.apiKey}`
            },
            onload: function(resp) {
                logDump("FetchModelListResponse", resp.responseText);
                try {
                    const data = JSON.parse(resp.responseText);
                    if (data.data && Array.isArray(data.data)) {
                        const newList = data.data.map(x => x.id);
                        modelConf.modelList = newList;
                        // 把新发现的模型注册
                        newList.forEach(m => {
                            if (!modelConfigs[m]) {
                                modelConfigs[m] = {
                                    apiKey: modelConf.apiKey,
                                    apiBase: modelConf.apiBase,
                                    manageUrl: "",
                                    modelList: [],
                                    discovered: true
                                };
                            }
                        });
                        saveModelConfigs();
                        rebuildModelSelect();
                        alert("Model list refreshed. Found: " + newList.join(", "));
                    } else {
                        alert("Unexpected model list response. Check console for details.");
                    }
                } catch(e) {
                    alert("Failed to parse model list: " + e);
                }
            },
            onerror: function(err) {
                alert("Error refreshing model list: " + JSON.stringify(err));
            }
        });
    }

    //----------------------------------------------------------------------
    // 14) 题目区域 + GPT 交互
    //----------------------------------------------------------------------
    function getTargetDiv() {
        let targ = document.evaluate(
            '/html/body/main/div/article/section/section/div/div[1]',
            document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null
        ).singleNodeValue;
        if (!targ) {
            targ = document.querySelector('main div.article, main > div, article');
        }
        return targ;
    }

    function monitorDOMChanges(el) {
        if (!el) return;
        const obs = new MutationObserver((mutations) => {
            mutations.forEach(m => {
                logDump("DOM mutation", {
                    type: m.type,
                    added: m.addedNodes.length,
                    removed: m.removedNodes.length
                });
            });
        });
        obs.observe(el, {childList:true, subtree:true});
        logMessage("Monitoring DOM changes on target element.");
    }

    function captureMathContent(el) {
        let mathEls = el.querySelectorAll('script[type="math/tex"], .MathJax, .mjx-chtml');
        if (mathEls.length > 0) {
            let latex = "";
            mathEls.forEach(n => latex += n.textContent + "\n");
            logDump("Captured latex", latex);
            return latex;
        }
        return null;
    }

    function captureCanvasImage(el) {
        let can = el.querySelector('canvas');
        if (can) {
            logMessage("Canvas found, capturing as base64...");
            const offC = document.createElement('canvas');
            offC.width = can.width;
            offC.height = can.height;
            offC.getContext('2d').drawImage(can, 0,0);
            return offC.toDataURL("image/png").split(",")[1];
        }
        return null;
    }

    // 发送 GPT 请求
    function answerQuestion() {
        logMessage("AnswerQuestion triggered.");
        const targetDiv = getTargetDiv();
        if (!targetDiv) {
            UI.status.textContent = "Error: can't find question region.";
            logMessage("No targetDiv found.");
            return;
        }
        config.lastTargetState = targetDiv.innerHTML;
        monitorDOMChanges(targetDiv);

        const htmlContent = targetDiv.outerHTML;
        const latex = captureMathContent(targetDiv);
        const canvasData = latex ? null : captureCanvasImage(targetDiv);

        // 要求 GPT 仅使用 unicode、不使用markdown、latex。如果 autoFill，就允许 triple-backtick code
        let systemPrompt = "";
        let userContent = "";

        if (config.fillMode === "displayOnly") {
            // 仅文本回答（unicode数学符号）
            systemPrompt = "You are a math assistant specialized in solving IXL math problems. Output the final numeric/textual answer in plain text with only unicode math. No Markdown or LaTeX. No code blocks.";
            userContent = `HTML: ${htmlContent}\n`;
            if (latex) userContent += `MathLaTeX:\n${latex}\n`;
            if (canvasData) userContent += "Canvas base64 attached (pretend you can interpret it).";
        } else {
            // autoFill，需要三重反引号JS
            systemPrompt = "You are a math assistant for IXL. Output a JavaScript code snippet with triple backticks ```javascript ...``` that fills all required answer fields. Use only unicode for any math symbols, no latex or markdown outside code. The code must be the entire message, no extra text.";
            userContent = `Given HTML:\n${htmlContent}\n`;
            if (latex) userContent += `MathLaTeX:\n${latex}\n`;
            if (canvasData) userContent += "Canvas base64 attached (pretend you can interpret it).";
        }

        const messages = [
            { role: "system", content: systemPrompt },
            { role: "user", content: userContent }
        ];
        const reqPayload = {
            model: config.selectedModel,
            messages: messages
        };

        UI.status.textContent = langText[config.language].waitingGpt;
        startFakeProgress();

        const mc = modelConfigs[config.selectedModel] || {};
        GM_xmlhttpRequest({
            method: "POST",
            url: mc.apiBase || "https://api.openai.com/v1/chat/completions",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${mc.apiKey}`
            },
            data: JSON.stringify(reqPayload),
            onload: function(resp) {
                finishProgress();
                try {
                    const data = JSON.parse(resp.responseText);
                    if (data.usage && data.usage.total_tokens) {
                        config.tokenUsage = data.usage.total_tokens;
                        UI.tokenUsageDisplay.textContent = langText[config.language].tokenUsage + config.tokenUsage;
                    }
                    const output = data.choices[0].message.content.trim();
                    if (config.fillMode === "displayOnly") {
                        UI.answerDisplay.style.display = "block";
                        UI.answerContent.textContent = output;
                    } else {
                        const code = extractJSCode(output);
                        if (!code) {
                            logMessage("No JavaScript code found in GPT output.");
                            UI.status.textContent = "Error: No code found in GPT answer.";
                            return;
                        }
                        runInSandbox(code);
                        if (config.autoSubmitEnabled) {
                            submitAnswer();
                        }
                    }
                    UI.status.textContent = langText[config.language].submissionComplete;
                } catch(e) {
                    UI.status.textContent = "Error handling GPT answer.";
                    logDump("AnswerError", e);
                }
            },
            onerror: function(err) {
                finishProgress();
                UI.status.textContent = langText[config.language].requestError + JSON.stringify(err);
                logDump("RequestError", err);
            }
        });
    }

    function extractJSCode(content) {
        const re = /```javascript\s+([\s\S]*?)\s+```/i;
        const match = content.match(re);
        return match && match[1] ? match[1].trim() : null;
    }

    function runInSandbox(code) {
        try {
            const sandbox = {};
            (new Function("sandbox", "with(sandbox){"+code+"}"))(sandbox);
        } catch(e) {
            logDump("SandboxError", e);
        }
    }

    function submitAnswer() {
        let btn = document.evaluate(
            '/html/body/main/div/article/section/section/div/div[1]/section/div/section/div/button',
            document,null,XPathResult.FIRST_ORDERED_NODE_TYPE,null
        ).singleNodeValue;
        if (!btn) {
            btn = document.querySelector('button.submit, button[class*="submit"]');
        }
        if (btn) {
            logMessage("Auto-submitting the answer...");
            btn.click();
        } else {
            logMessage("No submit button found.");
        }
    }

    //----------------------------------------------------------------------
    // 15) 初始化
    //----------------------------------------------------------------------
    function initSelectedModelUI() {
        // 如果指定模型不存在就默认 gpt-4o
        if (!modelConfigs[config.selectedModel]) {
            config.selectedModel = "gpt-4o";
        }
        rebuildModelSelect();

        const mconf = modelConfigs[config.selectedModel];
        UI.apiKeyInput.value = mconf.apiKey || "";
        UI.apiBaseInput.value = mconf.apiBase || "";
        updateManageUrl();

        UI.fillModeSelect.value = config.fillMode;
        if (config.fillMode === "displayOnly") {
            UI.answerDisplay.style.display = "block";
            UI.answerContent.textContent = "";
            UI.autoSubmitGroup.style.display = "none";
        } else {
            UI.answerDisplay.style.display = "none";
            UI.autoSubmitGroup.style.display = "block";
        }
    }

    initSelectedModelUI();
    updateLanguageText();
    logMessage("Script loaded with 'Display Only' default, AI helper, IXL-style UI, etc.");
})();
