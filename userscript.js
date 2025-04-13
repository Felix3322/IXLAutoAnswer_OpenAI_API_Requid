// ==UserScript==
// @name         IXL Auto Answer (Enhanced)
// @namespace    http://tampermonkey.net/
// @version      10.0
// @license      GPL-3.0
// @description  Per-model account management, Fill Mode selection (Auto Fill / Display Only), model list fetching, 'Ask AI' help panel, etc.
// @match        https://*.ixl.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// ==/UserScript==

(function() {
    'use strict';

    //------------------------------------------------------------------------
    // 1) 全局模型配置：每个模型都有独立的 apiKey, apiBase, manageUrl, modelList
    //------------------------------------------------------------------------
    let modelConfigs = JSON.parse(localStorage.getItem("gpt4o-modelConfigs") || "{}");

    // 如果还没有 gpt-4o 配置，就给它一个初始值
    if (!modelConfigs["gpt-4o"]) {
        modelConfigs["gpt-4o"] = {
            apiKey: localStorage.getItem("gpt4o-api-key") || "",  // 兼容老版本
            apiBase: localStorage.getItem("gpt4o-api-base") || "https://api.openai.com/v1/chat/completions",
            manageUrl: "",        // 你可以改成你的管理链接
            modelList: []         // 用于保存从 /models 接口获取的模型列表
        };
    }
    // 你也可在此给其他模型一个初始值，比如 deepseek-chat 等

    //------------------------------------------------------------------------
    // 2) 运行时全局配置
    //------------------------------------------------------------------------
    const config = {
        selectedModel: "gpt-4o",
        language: localStorage.getItem("gpt4o-language") || "en",
        tokenUsage: 0,
        lastTargetState: null,
        retryCount: 0,
        maxRetry: 2,
        // Fill Mode：autoFill(执行JS代码) 或 displayOnly(仅显示答案)
        fillMode: "autoFill",
        autoSubmitEnabled: false
    };

    // 保存/加载 modelConfigs
    function saveModelConfigs() {
        localStorage.setItem("gpt4o-modelConfigs", JSON.stringify(modelConfigs));
    }

    //------------------------------------------------------------------------
    // 3) 多语言文本
    //------------------------------------------------------------------------
    const langText = {
        en: {
            fillModeLabel: "Fill Mode",
            fillMode_auto: "Auto Fill the Answer",
            fillMode_display: "Display Answer Only",
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
            apiKeyValid: "API key seems valid.",
            apiKeyInvalid: "API key seems invalid.",
            progressText: "Processing...",
            tokenUsage: "Tokens: ",
            closeButton: "Close",
            manageModelLink: "Model Manage URL",
            refreshModelList: "Refresh Model List",
            modelListLabel: "Fetched Model Names",
            askAi: "Ask AI"
        },
        zh: {
            fillModeLabel: "答题模式",
            fillMode_auto: "自动填写答案",
            fillMode_display: "仅显示答案",
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
            customModelPlaceholder: "输入您的自定义模型名称",
            checkApiKey: "测试 API 密钥",
            checkingApiKey: "正在测试 API 密钥...",
            apiKeyValid: "API 密钥看起来有效。",
            apiKeyInvalid: "API 密钥看起来无效。",
            progressText: "处理中...",
            tokenUsage: "使用量: ",
            closeButton: "关闭",
            manageModelLink: "模型管理链接",
            refreshModelList: "刷新模型列表",
            modelListLabel: "已获取模型名称",
            askAi: "问AI"
        }
    };

    //------------------------------------------------------------------------
    // 4) 模型介绍
    //------------------------------------------------------------------------
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

    //------------------------------------------------------------------------
    // 5) 主面板
    //------------------------------------------------------------------------
    const panel = document.createElement('div');
    panel.id = "gpt4o-panel";
    panel.innerHTML = `
        <div id="gpt4o-header">
            <span>GPT Answer Assistant</span>
            <div>
                <span id="token-usage-display">${langText[config.language].tokenUsage}0</span>
                <button id="toggle-log-btn">${langText[config.language].showLog}</button>
                <button id="close-button">${langText[config.language].closeButton}</button>
            </div>
        </div>
        <div id="gpt4o-content">
            <!-- 答题模式： Auto Fill or Display Only -->
            <div class="input-group">
                <label id="label-fill-mode">${langText[config.language].fillModeLabel}:</label>
                <select id="fill-mode-select">
                    <option value="autoFill">${langText[config.language].fillMode_auto}</option>
                    <option value="displayOnly">${langText[config.language].fillMode_display}</option>
                </select>
            </div>

            <button id="start-answering">${langText[config.language].startAnswering}</button>
            <button id="rollback-answer">${langText[config.language].rollback}</button>

            <div class="input-group">
                <label id="label-model-selection">${langText[config.language].modelSelection}:</label>
                <select id="model-select">
                    <option value="gpt-4o">GPT-4o</option>
                    <option value="gpt-4o-mini">GPT-4o-mini</option>
                    <option value="o1">o1</option>
                    <option value="o3-mini">o3-mini</option>
                    <option value="deepseek-reasoner">deepseek-reasoner</option>
                    <option value="deepseek-chat">deepseek-chat</option>
                    <option value="chatgpt-4o-least">chatgpt-4o-least</option>
                    <option value="custom">Custom</option>
                </select>
                <p id="model-description">${modelDescriptions[config.selectedModel]}</p>
            </div>

            <!-- 自定义模型输入框 -->
            <div class="input-group" id="custom-model-group" style="display: none;">
                <label id="label-custom-model">${langText[config.language].modelSelection} (Custom):</label>
                <input type="text" id="custom-model-input" placeholder="${langText[config.language].customModelPlaceholder}">
            </div>

            <div class="input-group">
                <label id="label-api-key">${langText[config.language].setApiKey}:</label>
                <input type="password" id="api-key-input" placeholder="${langText[config.language].apiKeyPlaceholder}">
                <button id="save-api-key">${langText[config.language].saveApiKey}</button>
                <button id="check-api-key-btn">${langText[config.language].checkApiKey}</button>
            </div>

            <div class="input-group">
                <label id="label-api-base">${langText[config.language].setApiBase}:</label>
                <input type="text" id="api-base-input" placeholder="${langText[config.language].apiBasePlaceholder}">
                <button id="save-api-base">${langText[config.language].saveApiBase}</button>
            </div>

            <div class="input-group">
                <a id="manage-model-link" href="#" target="_blank">
                    ${langText[config.language].manageModelLink}
                </a>
            </div>

            <div class="input-group">
                <button id="refresh-model-list-btn">${langText[config.language].refreshModelList}</button>
            </div>
            <div class="input-group" id="model-list-container" style="display: none;">
                <label>${langText[config.language].modelListLabel}:</label>
                <ul id="model-list-ul" style="margin-left: 20px;"></ul>
            </div>

            <div class="input-group">
                <label id="label-auto-submit">
                    <input type="checkbox" id="auto-submit-toggle">
                    <span id="span-auto-submit">Enable Auto Submit</span>
                </label>
            </div>

            <div class="input-group">
                <label id="label-language">${langText[config.language].language}:</label>
                <select id="language-select">
                    <option value="en" ${config.language === "en" ? "selected" : ""}>English</option>
                    <option value="zh" ${config.language === "zh" ? "selected" : ""}>中文</option>
                </select>
            </div>

            <div id="progress-container">
                <progress id="progress-bar" max="100" value="0"></progress>
                <span id="progress-text">${langText[config.language].progressText}</span>
            </div>

            <p id="status">${langText[config.language].statusWaiting}</p>

            <!-- 日志显示区域，默认隐藏 -->
            <div id="log-container" style="display: none; max-height: 250px; overflow-y: auto; border: 1px solid #ccc; margin-top: 10px; padding: 5px; background-color: #f9f9f9;"></div>

            <!-- 如果 fillMode=displayOnly 时，这里显示答案 -->
            <div id="answer-display" style="display: none; margin-top: 10px; padding: 8px; border: 1px solid #ccc; background-color: #fff;">
                <h4>GPT Answer:</h4>
                <div id="answer-content" style="white-space: pre-wrap;"></div>
            </div>

            <!-- 底部：问AI 按钮 -->
            <button id="ask-ai-btn" style="margin-top: 10px;">
                ${langText[config.language].askAi}
            </button>
        </div>
    `;
    document.body.appendChild(panel);

    // 缓存常用 UI 元素
    const UI = {
        panel: document.getElementById("gpt4o-panel"),
        header: document.getElementById("gpt4o-header"),
        logContainer: document.getElementById("log-container"),
        tokenUsageDisplay: document.getElementById("token-usage-display"),
        status: document.getElementById("status"),
        apiKeyInput: document.getElementById("api-key-input"),
        apiBaseInput: document.getElementById("api-base-input"),
        modelSelect: document.getElementById("model-select"),
        customModelGroup: document.getElementById("custom-model-group"),
        customModelInput: document.getElementById("custom-model-input"),
        modelDescription: document.getElementById("model-description"),
        manageModelLink: document.getElementById("manage-model-link"),
        fillModeSelect: document.getElementById("fill-mode-select"),
        answerDisplay: document.getElementById("answer-display"),
        answerContent: document.getElementById("answer-content"),
        modelListContainer: document.getElementById("model-list-container"),
        modelListUl: document.getElementById("model-list-ul")
    };

    //------------------------------------------------------------------------
    // 6) 日志工具
    //------------------------------------------------------------------------
    function logMessage(message) {
        const timestamp = new Date().toLocaleString();
        const logEntry = document.createElement('div');
        logEntry.textContent = `[Log] ${timestamp} ${message}`;
        UI.logContainer.appendChild(logEntry);
        console.log(`[Log] ${message}`);
    }
    function logDump(label, value) {
        let dumpMessage = `[DUMP] ${label}: `;
        if (typeof value === "object") {
            try {
                dumpMessage += JSON.stringify(value);
            } catch (e) {
                dumpMessage += String(value);
            }
        } else {
            dumpMessage += String(value);
        }
        logMessage(dumpMessage);
    }

    //------------------------------------------------------------------------
    // 7) 语言切换
    //------------------------------------------------------------------------
    function updateLanguageText() {
        document.getElementById("label-fill-mode").textContent = langText[config.language].fillModeLabel + ":";
        UI.fillModeSelect.options[0].text = langText[config.language].fillMode_auto;
        UI.fillModeSelect.options[1].text = langText[config.language].fillMode_display;
        document.getElementById("start-answering").textContent = langText[config.language].startAnswering;
        document.getElementById("rollback-answer").textContent = langText[config.language].rollback;
        document.getElementById("close-button").textContent = langText[config.language].closeButton;

        document.getElementById("label-model-selection").textContent = langText[config.language].modelSelection + ":";
        document.getElementById("label-custom-model").textContent = langText[config.language].modelSelection + " (Custom):";
        document.getElementById("custom-model-input").placeholder = langText[config.language].customModelPlaceholder;

        document.getElementById("label-api-key").textContent = langText[config.language].setApiKey + ":";
        UI.apiKeyInput.placeholder = langText[config.language].apiKeyPlaceholder;
        document.getElementById("save-api-key").textContent = langText[config.language].saveApiKey;
        document.getElementById("check-api-key-btn").textContent = langText[config.language].checkApiKey;

        document.getElementById("label-api-base").textContent = langText[config.language].setApiBase + ":";
        UI.apiBaseInput.placeholder = langText[config.language].apiBasePlaceholder;
        document.getElementById("save-api-base").textContent = langText[config.language].saveApiBase;

        UI.manageModelLink.textContent = langText[config.language].manageModelLink;
        document.getElementById("refresh-model-list-btn").textContent = langText[config.language].refreshModelList;
        document.getElementById("model-list-container").querySelector("label").textContent = langText[config.language].modelListLabel + ":";

        document.getElementById("span-auto-submit").textContent = langText[config.language].fillMode_auto; // 或者保留原文
        // 你可以改一下，这里只是演示
        document.getElementById("span-auto-submit").textContent = "Enable Auto Submit";

        document.getElementById("label-language").textContent = langText[config.language].language + ":";
        document.getElementById("progress-text").textContent = langText[config.language].progressText;
        UI.status.textContent = langText[config.language].statusWaiting;

        const toggleBtn = document.getElementById("toggle-log-btn");
        toggleBtn.textContent = (UI.logContainer.style.display === "none") ? langText[config.language].showLog : langText[config.language].hideLog;

        UI.tokenUsageDisplay.textContent = langText[config.language].tokenUsage + config.tokenUsage;
        document.getElementById("ask-ai-btn").textContent = langText[config.language].askAi;
    }

    //------------------------------------------------------------------------
    // 8) 事件绑定
    //------------------------------------------------------------------------
    // 显示/隐藏日志
    document.getElementById("toggle-log-btn").addEventListener("click", function() {
        if (UI.logContainer.style.display === "none") {
            UI.logContainer.style.display = "block";
            this.textContent = langText[config.language].hideLog;
            logMessage("Log panel shown.");
        } else {
            UI.logContainer.style.display = "none";
            this.textContent = langText[config.language].showLog;
            logMessage("Log panel hidden.");
        }
    });

    // 关闭面板
    document.getElementById("close-button").addEventListener("click", function() {
        UI.panel.style.display = "none";
        logMessage("Panel closed by user.");
    });

    // 语言切换
    document.getElementById("language-select").addEventListener("change", function() {
        config.language = this.value;
        localStorage.setItem("gpt4o-language", config.language);
        updateLanguageText();
        logDump("Language Changed", config.language);
    });

    // “答题模式”切换
    UI.fillModeSelect.addEventListener("change", function() {
        config.fillMode = this.value; // autoFill or displayOnly
        // 如果是displayOnly，就显示 answerDisplay，但先清空
        if (config.fillMode === "displayOnly") {
            UI.answerDisplay.style.display = "block";
            UI.answerContent.textContent = "";
        } else {
            UI.answerDisplay.style.display = "none";
        }
        logDump("FillMode Changed", config.fillMode);
    });

    // 开始答题
    document.getElementById("start-answering").addEventListener("click", function() {
        logMessage("Start Answering button clicked.");
        answerQuestion();
    });

    // 撤回答案
    document.getElementById("rollback-answer").addEventListener("click", function() {
        if (config.lastTargetState) {
            let targetDiv = getTargetDiv();
            if (targetDiv) {
                targetDiv.innerHTML = config.lastTargetState;
                logMessage("Rolled back to previous state.");
            } else {
                logMessage("Rollback failed: target element not found.");
            }
        } else {
            logMessage("No previous state available for rollback.");
        }
    });

    // 模型选择
    UI.modelSelect.addEventListener("change", function() {
        config.selectedModel = this.value;
        UI.modelDescription.textContent = modelDescriptions[config.selectedModel] || "Custom model";

        if (config.selectedModel === "custom") {
            UI.customModelGroup.style.display = "block";
        } else {
            UI.customModelGroup.style.display = "none";
        }

        // 如果没配置过，就先给个默认
        if (!modelConfigs[config.selectedModel]) {
            modelConfigs[config.selectedModel] = {
                apiKey: "",
                apiBase: (config.selectedModel.includes("deepseek"))
                    ? "https://api.deepseek.com/v1/chat/completions"
                    : "https://api.openai.com/v1/chat/completions",
                manageUrl: "",
                modelList: []
            };
        }
        // 载入对应信息
        UI.apiKeyInput.value = modelConfigs[config.selectedModel].apiKey;
        UI.apiBaseInput.value = modelConfigs[config.selectedModel].apiBase;
        UI.manageModelLink.href = modelConfigs[config.selectedModel].manageUrl || "#";

        // 如果 modelList 有值，就展示出来
        displayModelList(modelConfigs[config.selectedModel].modelList);

        logDump("Model Selected", config.selectedModel);
        logDump("Loaded Model Config", modelConfigs[config.selectedModel]);
    });

    // 自定义模型输入
    UI.customModelInput.addEventListener("change", function() {
        const customName = this.value.trim();
        if (customName) {
            config.selectedModel = customName;
            if (!modelConfigs[customName]) {
                modelConfigs[customName] = {
                    apiKey: UI.apiKeyInput.value || "",
                    apiBase: UI.apiBaseInput.value || "https://api.openai.com/v1/chat/completions",
                    manageUrl: "",
                    modelList: []
                };
            }
            UI.modelDescription.textContent = "User-defined custom model: " + customName;
            UI.modelSelect.value = "custom"; // 显示为“Custom”
            logDump("Custom Model Selected", customName);
        }
    });

    // 保存 API key
    document.getElementById("save-api-key").addEventListener("click", function() {
        const newApiKey = UI.apiKeyInput.value.trim();
        modelConfigs[config.selectedModel].apiKey = newApiKey;
        saveModelConfigs();
        logDump("API Key Saved", newApiKey);
    });

    // 测试 API key
    document.getElementById("check-api-key-btn").addEventListener("click", function() {
        UI.status.textContent = langText[config.language].checkingApiKey;
        logMessage("Testing API key via server request...");

        const checkKey = modelConfigs[config.selectedModel].apiKey || "";
        const checkBase = modelConfigs[config.selectedModel].apiBase || "";
        GM_xmlhttpRequest({
            method: "GET",
            url: checkBase.replace("/chat/completions","/models"), // 有些 base 可能不兼容
            headers: {
                "Authorization": `Bearer ${checkKey}`
            },
            onload: function(response) {
                logDump("API Key Test Response", response.responseText);
                showTestResult(response.responseText);
                UI.status.textContent = langText[config.language].statusWaiting;
            },
            onerror: function(error) {
                logDump("API Key Test Error", error);
                showTestResult("Error testing API key: " + JSON.stringify(error));
                UI.status.textContent = langText[config.language].statusWaiting;
            }
        });
    });

    // 保存 API Base
    document.getElementById("save-api-base").addEventListener("click", function() {
        const newApiBase = UI.apiBaseInput.value.trim();
        modelConfigs[config.selectedModel].apiBase = newApiBase;
        saveModelConfigs();
        logDump("API Base Saved", newApiBase);
    });

    // 刷新模型列表
    document.getElementById("refresh-model-list-btn").addEventListener("click", function() {
        refreshModelList();
    });

    // Auto Submit 切换
    document.getElementById("auto-submit-toggle").addEventListener("change", function() {
        config.autoSubmitEnabled = this.checked;
        logDump("Auto Submit Toggle", config.autoSubmitEnabled);
    });

    // 问AI按钮
    document.getElementById("ask-ai-btn").addEventListener("click", function() {
        openHelpPanel();
    });

    //------------------------------------------------------------------------
    // 9) 样式
    //------------------------------------------------------------------------
    GM_addStyle(`
        #gpt4o-panel {
            font-family: Arial, sans-serif;
            font-size: 14px;
            width: 500px;
            background-color: rgba(255, 255, 255, 0.98);
            border-radius: 5px;
            position: fixed;
            top: 10px;
            right: 10px;
            z-index: 10000;
            box-shadow: 0px 0px 15px rgba(0, 0, 0, 0.4);
            padding-bottom: 10px;
        }
        #gpt4o-header {
            cursor: move;
            padding: 10px 15px;
            background-color: #4CAF50;
            color: white;
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-top-left-radius: 5px;
            border-top-right-radius: 5px;
        }
        #gpt4o-header button {
            background-color: #d9534f;
            border: none;
            padding: 4px 8px;
            cursor: pointer;
            color: white;
            font-size: 14px;
            border-radius: 3px;
            margin-left: 5px;
        }
        #gpt4o-header span#token-usage-display {
            margin-right: 10px;
            font-weight: bold;
        }
        #gpt4o-content {
            padding: 15px;
        }
        .input-group {
            margin-top: 10px;
        }
        .input-group label {
            display: block;
            margin-bottom: 3px;
        }
        .input-group input, .input-group select, .input-group button, #ask-ai-btn {
            width: 100%;
            padding: 6px;
            box-sizing: border-box;
        }
        .input-group button:hover, #ask-ai-btn:hover {
            background-color: #31b0d5;
        }
        #progress-container {
            margin-top: 10px;
            display: none;
        }
        #progress-bar {
            width: 100%;
            height: 12px;
        }
        #status {
            margin-top: 10px;
            font-weight: bold;
        }
        #log-container {
            font-family: monospace;
        }
        #answer-display {
            border-radius: 4px;
        }
        #model-list-container ul {
            list-style-type: disc;
        }
        /* 测试结果弹出框 */
        #test-result-overlay {
            font-family: Arial, sans-serif;
        }
    `);

    //------------------------------------------------------------------------
    // 10) 帮助弹窗 & 测试结果弹窗
    //------------------------------------------------------------------------
    function openHelpPanel() {
        const overlay = document.createElement("div");
        overlay.id = "help-panel-overlay";
        overlay.style.position = "fixed";
        overlay.style.top = "0";
        overlay.style.left = "0";
        overlay.style.width = "100%";
        overlay.style.height = "100%";
        overlay.style.backgroundColor = "rgba(0,0,0,0.5)";
        overlay.style.zIndex = "20000";
        const box = document.createElement("div");
        box.style.position = "absolute";
        box.style.top = "50%";
        box.style.left = "50%";
        box.style.transform = "translate(-50%, -50%)";
        box.style.backgroundColor = "#fff";
        box.style.padding = "20px";
        box.style.borderRadius = "5px";
        box.style.width = "400px";
        box.style.maxHeight = "80%";
        box.style.overflowY = "auto";
        box.style.textAlign = "left";

        box.innerHTML = `
            <h3>AI Script Help</h3>
            <p>这里是一个示例帮助窗口。你可以在此说明脚本的使用方式，例如：</p>
            <ul>
                <li>如何切换模型并保存 API Key？</li>
                <li>填入模式 vs 显示答案模式的区别</li>
                <li>如何刷新模型列表？</li>
                <li>Auto Submit 的作用</li>
            </ul>
            <p>若你想让脚本调用外部 AI 完成更多内容，可以在脚本中自行整合相应功能。</p>
            <button id="close-help-panel">Close</button>
        `;
        overlay.appendChild(box);
        document.body.appendChild(overlay);

        document.getElementById("close-help-panel").addEventListener("click", function() {
            document.body.removeChild(overlay);
        });
    }

    function showTestResult(message) {
        const overlay = document.createElement("div");
        overlay.id = "test-result-overlay";
        overlay.style.position = "fixed";
        overlay.style.top = "0";
        overlay.style.left = "0";
        overlay.style.width = "100%";
        overlay.style.height = "100%";
        overlay.style.backgroundColor = "rgba(0,0,0,0.5)";
        overlay.style.zIndex = "20000";

        const box = document.createElement("div");
        box.style.position = "absolute";
        box.style.top = "50%";
        box.style.left = "50%";
        box.style.transform = "translate(-50%, -50%)";
        box.style.backgroundColor = "#fff";
        box.style.padding = "20px";
        box.style.borderRadius = "5px";
        box.style.width = "400px";
        box.style.maxHeight = "80%";
        box.style.overflowY = "auto";
        box.style.textAlign = "left";
        box.innerHTML = `
            <pre style="white-space: pre-wrap;">${message}</pre>
            <button id="close-test-result">Close</button>
        `;
        overlay.appendChild(box);
        document.body.appendChild(overlay);

        document.getElementById("close-test-result").addEventListener("click", function() {
            document.body.removeChild(overlay);
        });
        logDump("Test API Key Result", message);
    }

    //------------------------------------------------------------------------
    // 11) 模型列表刷新与显示
    //------------------------------------------------------------------------
    function refreshModelList() {
        const modelConf = modelConfigs[config.selectedModel];
        if (!modelConf) return;
        const checkKey = modelConf.apiKey;
        const checkBase = modelConf.apiBase;
        if (!checkBase) {
            logMessage("No apiBase set for this model.");
            return;
        }
        const url = checkBase.replace("/chat/completions", "/models");
        logMessage("Fetching model list from: " + url);
        GM_xmlhttpRequest({
            method: "GET",
            url: url,
            headers: {
                "Authorization": `Bearer ${checkKey}`
            },
            onload: function(response) {
                logDump("Fetch Model List Response", response.responseText);
                try {
                    const data = JSON.parse(response.responseText);
                    if (data.data && Array.isArray(data.data)) {
                        // openai 风格: data:[{id:xx}, {id:yy}]
                        const newList = data.data.map(m => m.id);
                        modelConf.modelList = newList;
                        saveModelConfigs();
                        displayModelList(newList);
                    } else {
                        logMessage("Unexpected model list format.");
                    }
                } catch (err) {
                    logDump("Model List Parse Error", err);
                }
            },
            onerror: function(error) {
                logDump("RefreshModelList Error", error);
            }
        });
    }

    function displayModelList(modelList) {
        if (!modelList || modelList.length === 0) {
            UI.modelListContainer.style.display = "none";
            return;
        }
        UI.modelListContainer.style.display = "block";
        UI.modelListUl.innerHTML = "";
        modelList.forEach(name => {
            const li = document.createElement("li");
            li.textContent = name;
            UI.modelListUl.appendChild(li);
        });
    }

    //------------------------------------------------------------------------
    // 12) 进度条
    //------------------------------------------------------------------------
    const progressContainer = document.getElementById("progress-container");
    const progressBar = document.getElementById("progress-bar");
    let progressInterval = null;

    function updateProgress(value) {
        progressBar.value = value;
    }
    function startFakeProgress() {
        progressInterval = setInterval(() => {
            let current = progressBar.value;
            if (current < 90) {
                let increment = (90 - current) * 0.05;
                if (increment < 0.5) increment = 0.5;
                updateProgress(current + increment);
            } else {
                clearInterval(progressInterval);
            }
        }, 1000);
    }
    function finishProgress() {
        clearInterval(progressInterval);
        updateProgress(100);
        setTimeout(() => {
            progressContainer.style.display = "none";
            updateProgress(0);
        }, 600);
    }

    //------------------------------------------------------------------------
    // 13) 数学公式 & Canvas
    //------------------------------------------------------------------------
    function captureMathContent(htmlElement) {
        let mathElements = htmlElement.querySelectorAll('script[type="math/tex"], .MathJax, .mjx-chtml');
        if (mathElements.length > 0) {
            let latex = "";
            mathElements.forEach(el => { latex += el.textContent + "\n"; });
            logDump("Captured LaTeX Content", latex);
            return latex;
        }
        return null;
    }
    function captureCanvasImage(htmlElement) {
        const canvas = htmlElement.querySelector('canvas');
        if (canvas) {
            logMessage("Detected canvas element, capturing image...");
            const offscreenCanvas = document.createElement('canvas');
            offscreenCanvas.width = canvas.width;
            offscreenCanvas.height = canvas.height;
            const ctx = offscreenCanvas.getContext('2d');
            ctx.drawImage(canvas, 0, 0);
            return offscreenCanvas.toDataURL("image/png").split(",")[1];
        }
        return null;
    }

    //------------------------------------------------------------------------
    // 14) GPT 交互 & 执行
    //------------------------------------------------------------------------
    function executeInSandbox(code) {
        try {
            const sandbox = {};
            (new Function("sandbox", "with(sandbox) { " + code + " }"))(sandbox);
        } catch (e) {
            logDump("Sandbox Execution Error", e);
            throw e;
        }
    }

    function sendContentToGPT(htmlContent, canvasDataUrl, latexContent) {
        // 根据 fillMode 来生成不同行为
        let systemPrompt = "";
        let userContent = "";

        if (config.fillMode === "displayOnly") {
            // 仅显示答案
            systemPrompt = "You are a math assistant specialized in solving IXL math problems. Given the question data, return the final numeric/textual answer as clearly as possible. DO NOT return code. Provide any necessary steps or reasoning if needed, but focus on the final answer. Output only the answer.";
            userContent = `HTML: ${htmlContent}\n` + (latexContent ? `\nLaTeX:\n${latexContent}` : "");
            if (canvasDataUrl) userContent += "\nCanvas image base64 attached (pretend you can interpret it).";
        } else {
            // 自动填入
            systemPrompt = "You are a math assistant specialized in solving IXL math problems. Analyze the provided HTML structure and, if available, the extracted LaTeX or canvas image. Your goal is to generate a complete, executable JavaScript code snippet that fills in all required answer fields on the page. Use robust selectors (XPath). Return only code in triple backticks ```javascript ...```.";
            userContent = `This is a math question. Use the following HTML structure to generate JavaScript code that completely fills each answer field.\nHTML Structure:\n${htmlContent}`;
            if (latexContent) {
                userContent += `\nExtracted LaTeX content:\n${latexContent}`;
            } else if (canvasDataUrl) {
                userContent += `\nCanvas image base64 attached (pretend you can interpret it).`;
            }
        }

        const messages = [
            { role: "system", content: systemPrompt },
            { role: "user", content: userContent }
        ];

        const requestPayload = {
            model: config.selectedModel,
            messages: messages
        };
        logDump("Request Payload", requestPayload);

        progressContainer.style.display = "block";
        updateProgress(15);
        UI.status.textContent = langText[config.language].waitingGpt;
        startFakeProgress();

        const currentModelKey = modelConfigs[config.selectedModel].apiKey || "";
        const currentModelBase = modelConfigs[config.selectedModel].apiBase || "";

        function attemptSend(retry) {
            GM_xmlhttpRequest({
                method: "POST",
                url: currentModelBase,
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${currentModelKey}`
                },
                data: JSON.stringify(requestPayload),
                onload: function(response) {
                    logDump("Raw GPT Response", response.responseText);
                    if (response.status === 200) {
                        clearInterval(progressInterval);
                        updateProgress(95);
                        UI.status.textContent = langText[config.language].parsingResponse;

                        try {
                            let data = JSON.parse(response.responseText);
                            if (data.usage && data.usage.total_tokens) {
                                config.tokenUsage = data.usage.total_tokens;
                                UI.tokenUsageDisplay.textContent = langText[config.language].tokenUsage + config.tokenUsage;
                                logDump("Token Usage", data.usage);
                            }
                            let gptOutput = data.choices[0].message.content.trim();

                            if (config.fillMode === "displayOnly") {
                                // 显示答案
                                UI.answerDisplay.style.display = "block";
                                UI.answerContent.textContent = gptOutput;
                                finishProgress();
                                UI.status.textContent = langText[config.language].submissionComplete;
                            } else {
                                // 自动填入
                                let code = sanitizeCode(gptOutput);
                                logDump("Cleaned JavaScript Code", code);
                                UI.status.textContent = langText[config.language].executingCode;
                                executeInSandbox(code);

                                if (config.autoSubmitEnabled) {
                                    submitAnswer();
                                }
                                finishProgress();
                                UI.status.textContent = langText[config.language].submissionComplete;
                            }
                        } catch (error) {
                            UI.status.textContent = "Error during code execution.";
                            logDump("Code Execution Error", error);
                            console.error(error);
                        }
                    } else {
                        if (retry < config.maxRetry) {
                            logMessage(`GPT request failed (status ${response.status}). Retrying... (${retry+1}/${config.maxRetry})`);
                            setTimeout(() => { attemptSend(retry + 1); }, 1000);
                        } else {
                            clearInterval(progressInterval);
                            updateProgress(0);
                            progressContainer.style.display = "none";
                            UI.status.textContent = langText[config.language].requestError + response.status;
                            logMessage(`GPT request error, status code: ${response.status}`);
                        }
                    }
                },
                onerror: function(error) {
                    if (retry < config.maxRetry) {
                        logMessage(`Request error encountered. Retrying... (${retry+1}/${config.maxRetry})`);
                        setTimeout(() => { attemptSend(retry + 1); }, 1000);
                    } else {
                        clearInterval(progressInterval);
                        updateProgress(0);
                        progressContainer.style.display = "none";
                        UI.status.textContent = langText[config.language].requestError + JSON.stringify(error);
                        logDump("Request Error", error);
                    }
                }
            });
        }
        attemptSend(0);
    }

    function sanitizeCode(responseContent) {
        const regex = /```javascript\s+([\s\S]*?)\s+```/i;
        const match = responseContent.match(regex);
        if (match && match[1]) {
            return match[1].trim();
        } else {
            logMessage("Error: No JavaScript code found in response.");
            return "";
        }
    }

    function submitAnswer() {
        let submitButton = document.evaluate(
            '/html/body/main/div/article/section/section/div/div[1]/section/div/section/div/button',
            document,
            null,
            XPathResult.FIRST_ORDERED_NODE_TYPE,
            null
        ).singleNodeValue;
        if (!submitButton) {
            logMessage("Primary XPath for submit button failed, trying backup selector...");
            submitButton = document.querySelector('button.submit, button[class*="submit"]');
        }
        if (submitButton) {
            logMessage("Auto Submit Action initiated.");
            logDump("Auto Submit Button", submitButton.outerHTML);
            submitButton.click();
            logMessage("Answer submitted automatically.");
        } else {
            logMessage("Submit button not found.");
        }
    }

    //------------------------------------------------------------------------
    // 15) DOM 监控
    //------------------------------------------------------------------------
    function monitorDOMChanges(targetElement) {
        if (!targetElement) return;
        const observer = new MutationObserver(function(mutationsList) {
            mutationsList.forEach(mutation => {
                logDump("DOM Mutation", {
                    type: mutation.type,
                    addedNodes: mutation.addedNodes.length,
                    removedNodes: mutation.removedNodes.length
                });
            });
        });
        observer.observe(targetElement, { childList: true, subtree: true });
        logMessage("MutationObserver attached to target element.");
    }

    function getTargetDiv() {
        let targetDiv = document.evaluate(
            '/html/body/main/div/article/section/section/div/div[1]',
            document,
            null,
            XPathResult.FIRST_ORDERED_NODE_TYPE,
            null
        ).singleNodeValue;
        if (!targetDiv) {
            logMessage("Primary XPath for targetDiv failed, trying backup selector...");
            targetDiv = document.querySelector('main div.article, main > div, article');
        }
        return targetDiv;
    }

    //------------------------------------------------------------------------
    // 16) 核心答题
    //------------------------------------------------------------------------
    function answerQuestion() {
        logMessage("Answer Question initiated.");
        progressContainer.style.display = "block";
        updateProgress(5);
        UI.status.textContent = langText[config.language].analyzingHtml;

        let targetDiv = getTargetDiv();
        if (!targetDiv) {
            updateProgress(0);
            progressContainer.style.display = "none";
            UI.status.textContent = "Error: HTML structure not found.";
            logMessage("Error: HTML structure not found, check XPath and backup selectors.");
            return;
        }
        config.lastTargetState = targetDiv.innerHTML;
        logDump("Saved Last Target State", config.lastTargetState);

        monitorDOMChanges(targetDiv);
        updateProgress(10);
        UI.status.textContent = langText[config.language].extractingData;

        let htmlContent = targetDiv.outerHTML;
        logDump("Captured HTML", htmlContent);

        updateProgress(15);
        UI.status.textContent = langText[config.language].constructingApi;

        const latexContent = captureMathContent(targetDiv);
        const canvasDataUrl = latexContent ? null : captureCanvasImage(targetDiv);

        sendContentToGPT(htmlContent, canvasDataUrl, latexContent);
    }

    //------------------------------------------------------------------------
    // 17) 外部AI可调用的函数（示例）
    //------------------------------------------------------------------------
    // 假设外部有个 AI 助手，可以直接调用脚本函数，如： window.AI_setScriptConfig({...})
    // 用于帮助用户自动批量配置脚本。
    window.AI_setScriptConfig = function(newConfig) {
        // 这里只是示例，你可让它自由修改 modelConfigs
        if (newConfig.language) {
            config.language = newConfig.language;
            localStorage.setItem("gpt4o-language", config.language);
            updateLanguageText();
        }
        if (newConfig.selectedModel) {
            if (!modelConfigs[newConfig.selectedModel]) {
                modelConfigs[newConfig.selectedModel] = {
                    apiKey: "",
                    apiBase: "https://api.openai.com/v1/chat/completions",
                    manageUrl: "",
                    modelList: []
                };
            }
            config.selectedModel = newConfig.selectedModel;
            UI.modelSelect.value = (["gpt-4o","gpt-4o-mini","o1","o3-mini","deepseek-reasoner","deepseek-chat","chatgpt-4o-least"].includes(newConfig.selectedModel))
                ? newConfig.selectedModel
                : "custom";
            UI.customModelInput.value = (UI.modelSelect.value === "custom") ? newConfig.selectedModel : "";
        }
        if (newConfig.apiKey) {
            modelConfigs[config.selectedModel].apiKey = newConfig.apiKey;
            UI.apiKeyInput.value = newConfig.apiKey;
        }
        if (newConfig.apiBase) {
            modelConfigs[config.selectedModel].apiBase = newConfig.apiBase;
            UI.apiBaseInput.value = newConfig.apiBase;
        }
        if (typeof newConfig.autoSubmitEnabled === "boolean") {
            config.autoSubmitEnabled = newConfig.autoSubmitEnabled;
            document.getElementById("auto-submit-toggle").checked = newConfig.autoSubmitEnabled;
        }
        // 其他更多配置...
        saveModelConfigs();
        logDump("AI_setScriptConfig called", newConfig);
    };

    //------------------------------------------------------------------------
    // 18) 初始化
    //------------------------------------------------------------------------
    function initSelectedModelUI() {
        const defaultModel = "gpt-4o";
        config.selectedModel = defaultModel;
        // 如果 modelConfigs 没有 gpt-4o，就先给一个空
        if (!modelConfigs[defaultModel]) {
            modelConfigs[defaultModel] = {
                apiKey: "",
                apiBase: "https://api.openai.com/v1/chat/completions",
                manageUrl: "",
                modelList: []
            };
        }
        UI.modelSelect.value = defaultModel;
        UI.apiKeyInput.value = modelConfigs[defaultModel].apiKey;
        UI.apiBaseInput.value = modelConfigs[defaultModel].apiBase;
        UI.manageModelLink.href = modelConfigs[defaultModel].manageUrl || "#";

        // 填充 modelList
        displayModelList(modelConfigs[defaultModel].modelList);
    }

    initSelectedModelUI();
    updateLanguageText();
    logMessage("Script loaded successfully with multi-model management & fill-mode selection.");
})();
