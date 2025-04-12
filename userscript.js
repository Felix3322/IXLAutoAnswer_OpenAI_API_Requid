// ==UserScript==
// @name         IXL Auto Answer (OpenAI API Required)
// @namespace    http://tampermonkey.net/
// @version      8.0
// @license      GPL-3.0
// @description  Sends HTML and canvas data to AI models for math problem-solving with enhanced accuracy, configurable API base, improved GUI with progress bar, auto-answer functionality, token usage display, rollback and detailed DOM change logging. API key is tested by direct server request.
// @match        https://*.ixl.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @downloadURL  https://update.greasyfork.org/scripts/517259/IXL%20Auto%20Answer%20%28OpenAI%20API%20Required%29.user.js
// @updateURL    https://update.greasyfork.org/scripts/517259/IXL%20Auto%20Answer%20%28OpenAI%20API%20Required%29.meta.js
// ==/UserScript==

(function() {
    'use strict';

    //-------------------- 全局状态配置（封装为对象） --------------------
    const config = {
        apiKey: localStorage.getItem("gpt4o-api-key") || "",
        apiBase: localStorage.getItem("gpt4o-api-base") || "https://api.openai.com/v1/chat/completions",
        selectedModel: "gpt-4o",
        autoAnswerModeEnabled: false,
        autoSubmitEnabled: false,
        language: localStorage.getItem("gpt4o-language") || "en",
        tokenUsage: 0,
        lastTargetState: null,  // 用于回滚
        retryCount: 0,
        maxRetry: 2
    };

    //-------------------- UI 元素缓存对象 --------------------
    const UI = {};

    //-------------------- 日志工具函数 --------------------
    function logMessage(message) {
        const timestamp = new Date().toLocaleString();
        const logContainer = UI.logContainer;
        const logEntry = document.createElement('div');
        logEntry.textContent = `[Log] ${timestamp} ${message}`;
        logContainer.appendChild(logEntry);
        console.log(`[Log] ${message}`);
    }
    function logDump(label, value) {
        let dumpMessage = `[DUMP] ${label}: `;
        if (typeof value === "object") {
            try {
                dumpMessage += JSON.stringify(value);
            } catch (e) {
                dumpMessage += value;
            }
        } else {
            dumpMessage += value;
        }
        logMessage(dumpMessage);
    }

    //-------------------- 多语言文本 --------------------
    const langText = {
        en: {
            startAnswering: "Start Answering",
            autoAnsweringMode: "Enable Auto Answer Mode",
            autoSubmit: "Enable Auto Submit",
            rollback: "Rollback Last Answer",
            language: "Language",
            modelSelection: "Select Model",
            modelDescription: "Model Description",
            setApiKey: "Set API Key",
            saveApiKey: "Save API Key",
            apiKeyPlaceholder: "Enter your OpenAI API key",
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
            autoAnswerDisabled: "Auto Answer Mode is disabled and will not work.",
            checkApiKey: "Test API Key",
            checkingApiKey: "Testing API key...",
            apiKeyValid: "API key seems valid.",
            apiKeyInvalid: "API key seems invalid.",
            progressText: "Processing...",
            tokenUsage: "Tokens: "
        },
        zh: {
            startAnswering: "开始答题",
            autoAnsweringMode: "启用自动答题模式",
            autoSubmit: "启用自动提交",
            rollback: "撤回上一次",
            language: "语言",
            modelSelection: "选择模型",
            modelDescription: "模型介绍",
            setApiKey: "设置 API 密钥",
            saveApiKey: "保存 API 密钥",
            apiKeyPlaceholder: "输入您的 OpenAI API 密钥",
            setApiBase: "设置 API 基础地址",
            saveApiBase: "保存 API 基础地址",
            apiBasePlaceholder: "输入您的 API 基础地址",
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
            autoAnswerDisabled: "自动答题模式已失效，该功能暂时（甚至永远）不可用。",
            checkApiKey: "测试 API 密钥",
            checkingApiKey: "正在测试 API 密钥...",
            apiKeyValid: "API 密钥看起来有效。",
            apiKeyInvalid: "API 密钥看起来无效。",
            progressText: "处理中...",
            tokenUsage: "使用量: "
        }
    };

    //-------------------- 模型描述 --------------------
    const modelDescriptions = {
        "gpt-4o": "Can solve problems with images, cost-effective.",
        "gpt-4o-mini": "Handles text-only questions, cheap option.",
        "o1": "Solves image problems with highest accuracy, but is slow and expensive.",
        "o3-mini": "Handles text-only questions, fast and cost-effective, but accuracy is not as high as o1.",
        "deepseek-reasoner": "The speed is similar to o1, but the accuracy is lower than o1. It does not support image recognition and is much cheaper than o1.",
        "deepseek-chat": "The speed is similar to 4o, and the accuracy is about the same. It does not support image recognition and is the cheapest.",
        "chatgpt-4o-least": "This model has a high ceiling but low floor—very unstable. It is the RLHF version of gpt4o, more human-like but prone to mistakes, hallucinations, and nonsense.",
        "custom": "User-defined model. Please enter your model name below."
    };

    //-------------------- 创建控制面板（尺寸加大） --------------------
    const panel = document.createElement('div');
    panel.id = "gpt4o-panel";
    panel.innerHTML = `
        <div id="gpt4o-header">
            <span>GPT Answer Assistant</span>
            <div>
                <span id="token-usage-display">${langText[config.language].tokenUsage}0</span>
                <button id="toggle-log-btn">${langText[config.language].showLog}</button>
                <button id="close-button">${langText[config.language].closeButton || "Close"}</button>
            </div>
        </div>
        <div id="gpt4o-content">
            <button id="start-answering">${langText[config.language].startAnswering}</button>
            <button id="rollback-answer">${langText[config.language].rollback}</button>
            
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
            
            <!-- 自定义模型输入框，默认隐藏 -->
            <div class="input-group" id="custom-model-group" style="display: none;">
                <label id="label-custom-model">${langText[config.language].modelSelection} (Custom):</label>
                <input type="text" id="custom-model-input" placeholder="${langText[config.language].customModelPlaceholder}">
            </div>
            
            <div class="input-group">
                <label id="label-auto-answer">
                    <input type="checkbox" id="auto-answer-mode-toggle">
                    <span id="span-auto-answer">${langText[config.language].autoAnsweringMode}</span>
                </label>
            </div>
            
            <div class="input-group">
                <label id="label-auto-submit">
                    <input type="checkbox" id="auto-submit-toggle">
                    <span id="span-auto-submit">${langText[config.language].autoSubmit}</span>
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
                <span id="progress-text">${langText[config.language].progressText || "Processing..."}</span>
            </div>
            
            <p id="status">${langText[config.language].statusWaiting}</p>
            
            <!-- 日志显示区域，默认隐藏 -->
            <div id="log-container" style="display: none; max-height: 250px; overflow-y: auto; border: 1px solid #ccc; margin-top: 10px; padding: 5px; background-color: #f9f9f9;"></div>
        </div>
    `;
    document.body.appendChild(panel);

    // 缓存 UI 元素
    UI.panel = document.getElementById("gpt4o-panel");
    UI.header = document.getElementById("gpt4o-header");
    UI.logContainer = document.getElementById("log-container");
    UI.apiKeyInput = document.getElementById("api-key-input");
    UI.apiBaseInput = document.getElementById("api-base-input");
    UI.status = document.getElementById("status");
    UI.tokenUsageDisplay = document.getElementById("token-usage-display");

    //-------------------- 事件绑定 --------------------
    // 切换日志面板显示/隐藏
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

    // 面板关闭
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

    // 模型选择与 API Base 自动切换
    document.getElementById("model-select").addEventListener("change", function() {
        config.selectedModel = this.value;
        document.getElementById("model-description").textContent = modelDescriptions[config.selectedModel];
        logDump("Model Selected", config.selectedModel);
        // 显示或隐藏自定义模型输入
        const customModelGroup = document.getElementById("custom-model-group");
        if (config.selectedModel === "custom") {
            customModelGroup.style.display = "block";
        } else {
            customModelGroup.style.display = "none";
        }
        // 自动配置 API Base
        if (config.selectedModel === "deepseek-reasoner" || config.selectedModel === "deepseek-chat") {
            config.apiBase = "https://api.deepseek.com/v1/chat/completions";
        } else {
            config.apiBase = "https://api.openai.com/v1/chat/completions";
        }
        localStorage.setItem("gpt4o-api-base", config.apiBase);
        UI.apiBaseInput.value = config.apiBase;
        logDump("API Base Updated", config.apiBase);
        // 高光闪烁效果
        const originalBg = UI.apiBaseInput.style.backgroundColor;
        UI.apiBaseInput.style.backgroundColor = "#ffff99";
        setTimeout(() => {
            UI.apiBaseInput.style.backgroundColor = originalBg;
        }, 500);
    });

    // 自定义模型输入
    document.getElementById("custom-model-input").addEventListener("change", function() {
        const customModel = this.value.trim();
        if (customModel) {
            config.selectedModel = customModel;
            document.getElementById("model-description").textContent = "User-defined custom model: " + customModel;
            logDump("Custom Model Selected", customModel);
        }
    });

    // 保存 API key
    document.getElementById("save-api-key").addEventListener("click", function() {
        const newApiKey = UI.apiKeyInput.value.trim();
        if (newApiKey) {
            config.apiKey = newApiKey;
            localStorage.setItem("gpt4o-api-key", config.apiKey);
            logDump("API Key Saved", config.apiKey);
        } else {
            alert("API key cannot be empty.");
        }
    });

    // 测试 API key：直接请求 OpenAI 服务器接口，并弹出服务器返回结果
    document.getElementById("check-api-key-btn").addEventListener("click", function() {
        UI.status.textContent = langText[config.language].checkingApiKey;
        logMessage("Testing API key via server request...");
        GM_xmlhttpRequest({
            method: "GET",
            url: "https://api.openai.com/v1/models",
            headers: {
                "Authorization": `Bearer ${config.apiKey}`
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

    // 弹出一个可关闭的测试结果文本框
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
        box.innerHTML = `<pre style="white-space: pre-wrap;">${message}</pre><button id="close-test-result">Close</button>`;
        overlay.appendChild(box);
        document.body.appendChild(overlay);
        document.getElementById("close-test-result").addEventListener("click", function() {
            document.body.removeChild(overlay);
        });
        logDump("Test API Key Result", message);
    }

    // 保存 API Base
    document.getElementById("save-api-base").addEventListener("click", function() {
        const newApiBase = UI.apiBaseInput.value.trim();
        if (newApiBase) {
            config.apiBase = newApiBase;
            localStorage.setItem("gpt4o-api-base", config.apiBase);
            logDump("API Base Saved", config.apiBase);
        } else {
            alert("API base cannot be empty.");
        }
    });

    // 修改 Auto Answer Mode（不可用时直接回滚）
    document.getElementById("auto-answer-mode-toggle").addEventListener("change", function() {
        logDump("Auto Answer Mode Toggle", this.checked);
        if (this.checked) {
            alert(langText[config.language].autoAnswerDisabled);
            this.checked = false;
            config.autoAnswerModeEnabled = false;
            logMessage("Auto Answer Mode attempted to enable, but remains disabled.");
        }
    });

    // Auto Submit 切换
    document.getElementById("auto-submit-toggle").addEventListener("change", function() {
        config.autoSubmitEnabled = this.checked;
        logDump("Auto Submit Toggle", config.autoSubmitEnabled);
    });

    // 开始答题
    document.getElementById("start-answering").addEventListener("click", function() {
        logMessage("Start Answering button clicked.");
        answerQuestion();
    });

    // 撤回上一次答案
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

    // 根据当前语言更新界面文本
    function updateLanguageText() {
        document.getElementById("start-answering").textContent = langText[config.language].startAnswering;
        document.getElementById("rollback-answer").textContent = langText[config.language].rollback;
        document.getElementById("close-button").textContent = langText[config.language].closeButton || "Close";
        document.getElementById("label-api-key").textContent = langText[config.language].setApiKey + ":";
        UI.apiKeyInput.placeholder = langText[config.language].apiKeyPlaceholder;
        document.getElementById("save-api-key").textContent = langText[config.language].saveApiKey;
        document.getElementById("check-api-key-btn").textContent = langText[config.language].checkApiKey;
        document.getElementById("label-api-base").textContent = langText[config.language].setApiBase + ":";
        UI.apiBaseInput.placeholder = langText[config.language].apiBasePlaceholder;
        document.getElementById("save-api-base").textContent = langText[config.language].saveApiBase;
        document.getElementById("label-model-selection").textContent = langText[config.language].modelSelection + ":";
        document.getElementById("model-description").textContent = modelDescriptions[config.selectedModel] || "User-defined custom model";
        document.getElementById("label-language").textContent = langText[config.language].language + ":";
        document.getElementById("progress-text").textContent = langText[config.language].progressText || "Processing...";
        UI.status.textContent = langText[config.language].statusWaiting;
        const toggleBtn = document.getElementById("toggle-log-btn");
        toggleBtn.textContent = (UI.logContainer.style.display === "none") ? langText[config.language].showLog : langText[config.language].hideLog;
        document.getElementById("custom-model-input").placeholder = langText[config.language].customModelPlaceholder;
        UI.tokenUsageDisplay.textContent = langText[config.language].tokenUsage + config.tokenUsage;
    }

    //-------------------- 进度条相关操作 --------------------
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
        }, 500);
    }

    //-------------------- 数学公式和 Canvas 截图 --------------------
    // 优先抓取数学公式 LaTeX 内容（例如 MathJax 渲染的公式）
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
    // 截取 Canvas 图片
    function captureCanvasImage(htmlElement) {
        const canvas = htmlElement.querySelector('canvas');
        if (canvas) {
            logMessage("Detected canvas element, capturing image...");
            const offscreenCanvas = document.createElement('canvas');
            offscreenCanvas.width = canvas.width;
            offscreenCanvas.height = canvas.height;
            const ctx = offscreenCanvas.getContext('2d');
            ctx.drawImage(canvas, 0, 0);
            let canvasBase64 = offscreenCanvas.toDataURL("image/png").split(",")[1];
            logDump("Canvas Image Captured", canvasBase64);
            return canvasBase64;
        }
        return null;
    }

    //-------------------- 执行代码沙箱（隔离作用域） --------------------
    function executeInSandbox(code) {
        try {
            const sandbox = {};
            (new Function("sandbox", "with(sandbox) { " + code + " }"))(sandbox);
        } catch (e) {
            logDump("Sandbox Execution Error", e);
            throw e;
        }
    }

    //-------------------- GPT 请求及自动重试 --------------------
    function sendContentToGPT(htmlContent, canvasDataUrl, latexContent) {
        // 更新 GPT 提示词：要求返回的代码必须严格修改 DOM 填空，且只返回纯代码，并返回最稳定的选择器（例如 XPath）。
        const messages = [
            {
                "role": "system",
                "content": "You are a math assistant specialized in solving IXL math problems. Analyze the provided HTML structure and, if available, the extracted LaTeX content (preferred) or the canvas image. Your goal is to generate a complete, executable JavaScript code snippet that fills in all required answer fields on the page. Your code must use robust and precise selectors (for example, XPath) as the most stable selectors and simulate necessary clicks. DO NOT leave any required field empty. Return ONLY code wrapped in triple backticks with language identifier (```javascript ... ```), and nothing else."
            },
            {
                "role": "user",
                "content": `This is a math question. Use the following HTML structure to generate JavaScript code that completely fills each answer field.\n\nHTML Structure:\n${htmlContent}`
            }
        ];
        if (latexContent) {
            messages.push({
                "role": "user",
                "content": `Extracted LaTeX content:\n${latexContent}`
            });
        } else if (canvasDataUrl) {
            messages.push({
                "role": "user",
                "content": {
                    "type": "image_url",
                    "image_url": {
                        "url": `data:image/png;base64,${canvasDataUrl}`
                    }
                }
            });
        }
        const requestPayload = {
            model: config.selectedModel,
            messages: messages
        };
        logDump("Request Payload", requestPayload);
        updateProgress(15);
        UI.status.textContent = langText[config.language].waitingGpt;
        startFakeProgress();

        // 内部请求函数：自动重试机制
        function attemptSend(retry) {
            GM_xmlhttpRequest({
                method: "POST",
                url: config.apiBase,
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${config.apiKey}`
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
                            let code = sanitizeCode(data.choices[0].message.content.trim());
                            logDump("Cleaned JavaScript Code", code);
                            UI.status.textContent = langText[config.language].executingCode;
                            logDump("Evaluated Code", code);
                            executeInSandbox(code);
                            if (config.autoSubmitEnabled) {
                                submitAnswer();
                                UI.status.textContent = langText[config.language].submissionComplete;
                            }
                            finishProgress();
                        } catch (error) {
                            UI.status.textContent = "Error during code execution.";
                            logDump("Code Execution Error", error);
                            console.error("Execution error: ", error);
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
                            console.error("GPT request error, status code: " + response.status);
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
                        UI.status.textContent = langText[config.language].requestError + error;
                        logDump("Request Error", error);
                        console.error("Request error: ", error);
                    }
                }
            });
        }
        attemptSend(0);
    }

    //-------------------- 提取返回的 JavaScript 代码 --------------------
    function sanitizeCode(responseContent) {
        const regex = /```javascript\s+([\s\S]*?)\s+```/i;
        const match = responseContent.match(regex);
        if (match && match[1]) {
            return match[1].trim();
        } else {
            logMessage("Error: No JavaScript code found in response.");
            console.error("Error: No JavaScript code found in response.");
            return "";
        }
    }

    //-------------------- 模拟点击提交按钮 --------------------
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
            console.log("Submit button not found.");
        }
    }

    //-------------------- 监控 IXL 题目区域 DOM 变化 --------------------
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

    //-------------------- 获取 IXL 题目区域节点（主 XPath + 备用） --------------------
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

    //-------------------- 捕获当前问题页面的 HTML 结构及发送给 GPT --------------------
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
            console.error("Error: HTML structure not found, check XPath and backup selectors.");
            return;
        }
        // 保存当前状态以便回滚
        config.lastTargetState = targetDiv.innerHTML;
        logDump("Saved Last Target State", config.lastTargetState);
        // 监控 DOM 变化
        monitorDOMChanges(targetDiv);
        updateProgress(10);
        UI.status.textContent = langText[config.language].extractingData;
        let htmlContent = targetDiv.outerHTML;
        logDump("Captured HTML", htmlContent);
        updateProgress(15);
        UI.status.textContent = langText[config.language].constructingApi;
        // 优先抓取数学公式 LaTeX 内容
        const latexContent = captureMathContent(targetDiv);
        // 如果没有 LaTeX，再抓取 canvas 图片
        const canvasDataUrl = latexContent ? null : captureCanvasImage(targetDiv);
        logDump("Captured Math Content", latexContent);
        logDump("Captured Canvas Image Base64", canvasDataUrl);
        sendContentToGPT(htmlContent, canvasDataUrl, latexContent);
    }

    //-------------------- 样式设置 --------------------
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
        .input-group input, .input-group select {
            width: 100%;
            padding: 6px;
            box-sizing: border-box;
        }
        .input-group button {
            margin-top: 5px;
            width: 100%;
            padding: 6px;
            background-color: #5bc0de;
            border: none;
            color: white;
            border-radius: 3px;
            cursor: pointer;
        }
        .input-group button:hover {
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
        /* 测试结果弹出框样式 */
        #test-result-overlay {
            font-family: Arial, sans-serif;
        }
    `);

    //-------------------- 初始化：填充 API key 与 API Base --------------------
    UI.apiKeyInput.value = config.apiKey;
    UI.apiBaseInput.value = config.apiBase;
    logDump("Initial API Key", config.apiKey);
    logDump("Initial API Base", config.apiBase);
    updateLanguageText();
})();
