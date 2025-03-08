// ==UserScript==
// @name         IXL Auto Answer (OpenAI API Required)
// @namespace    http://tampermonkey.net/
// @version      7.5
// @license      GPL-3.0
// @description  Sends HTML and canvas data to AI models for math problem-solving with enhanced accuracy, a configurable API base, an improved GUI with progress bar and auto-answer functionality. Added logging for JS errors and GPT request errors.
// @match        https://*.ixl.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @downloadURL  https://update.greasyfork.org/scripts/517259/IXL%20Auto%20Answer%20%28OpenAI%20API%20Required%29.user.js
// @updateURL    https://update.greasyfork.org/scripts/517259/IXL%20Auto%20Answer%20%28OpenAI%20API%20Required%29.meta.js
// ==/UserScript==

(function() {
    'use strict';

    // -------------------- 全局变量及初始设置 --------------------
    let API_KEY = localStorage.getItem("gpt4o-api-key") || "";
    // 默认API_BASE按OpenAI模型的地址初始化
    let API_BASE = localStorage.getItem("gpt4o-api-base") || "https://api.openai.com/v1/chat/completions";
    let selectedModel = "gpt-4o";
    let autoAnswerModeEnabled = false;
    let autoSubmitEnabled = false;
    let language = localStorage.getItem("gpt4o-language") || "en";

    if (!API_KEY) {
        API_KEY = prompt("Please enter your OpenAI API key:");
        if (API_KEY) {
            localStorage.setItem("gpt4o-api-key", API_KEY);
        } else {
            alert("API key is required to use this tool.");
            return;
        }
    }

    // 模型介绍及描述更新
    const modelDescriptions = {
        "gpt-4o": "Can solve problems with images, cost-effective.",
        "gpt-4o-mini": "Handles text-only questions, cheap option.",
        "o1": "Solves image problems with highest accuracy, but is slow and expensive.",
        "o3-mini": "Handles text-only questions, fast and cost-effective, but accuracy is not as high as o1.",
        "deepseek-reasoner": "The speed is similar to o1, but the accuracy is lower than o1. It does not support image recognition and is much cheaper than o1.",
        "deepseek-chat": "The speed is similar to 4o, and the accuracy is about the same. It does not support image recognition and is the cheapest.",
        "custom": "User-defined model. Please enter your model name below."
    };

    // -------------------- 多语言文本 --------------------
    const langText = {
        en: {
            startAnswering: "Start Answering",
            autoAnsweringMode: "Enable Auto Answer Mode",
            autoSubmit: "Enable Auto Submit",
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
            autoAnswerDisabled: "Auto Answer Mode is disabled and will not work."
        },
        zh: {
            startAnswering: "开始答题",
            autoAnsweringMode: "启用自动答题模式",
            autoSubmit: "启用自动提交",
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
            autoAnswerDisabled: "自动答题模式已失效，该功能暂时（甚至永远）不可用。"
        }
    };

    // -------------------- 创建控制面板 --------------------
    const panel = document.createElement('div');
    panel.id = "gpt4o-panel";
    panel.innerHTML = `
        <div id="gpt4o-header">
            <span>GPT Answer Assistant</span>
            <div>
                <button id="toggle-log-btn">${langText[language].showLog}</button>
                <button id="close-button">${langText[language].closeButton || "Close"}</button>
            </div>
        </div>
        <div id="gpt4o-content">
            <button id="start-answering">${langText[language].startAnswering}</button>
            
            <div class="input-group">
                <label id="label-api-key">${langText[language].setApiKey}:</label>
                <input type="password" id="api-key-input" placeholder="${langText[language].apiKeyPlaceholder}">
                <button id="save-api-key">${langText[language].saveApiKey}</button>
            </div>
            
            <div class="input-group">
                <label id="label-api-base">${langText[language].setApiBase}:</label>
                <input type="text" id="api-base-input" placeholder="${langText[language].apiBasePlaceholder}">
                <button id="save-api-base">${langText[language].saveApiBase}</button>
            </div>
            
            <div class="input-group">
                <label id="label-model-selection">${langText[language].modelSelection}:</label>
                <select id="model-select">
                    <option value="gpt-4o">GPT-4o</option>
                    <option value="gpt-4o-mini">GPT-4o-mini</option>
                    <option value="o1">o1</option>
                    <option value="o3-mini">o3-mini</option>
                    <option value="deepseek-reasoner">deepseek-reasoner</option>
                    <option value="deepseek-chat">deepseek-chat</option>
                    <option value="custom">Custom</option>
                </select>
                <p id="model-description">${modelDescriptions[selectedModel]}</p>
            </div>
            
            <!-- 自定义模型输入框，默认隐藏 -->
            <div class="input-group" id="custom-model-group" style="display: none;">
                <label id="label-custom-model">${langText[language].modelSelection} (Custom):</label>
                <input type="text" id="custom-model-input" placeholder="${langText[language].customModelPlaceholder}">
            </div>
            
            <div class="input-group">
                <label id="label-auto-answer">
                    <input type="checkbox" id="auto-answer-mode-toggle">
                    <span id="span-auto-answer">${langText[language].autoAnsweringMode}</span>
                </label>
            </div>
            
            <div class="input-group">
                <label id="label-auto-submit">
                    <input type="checkbox" id="auto-submit-toggle">
                    <span id="span-auto-submit">${langText[language].autoSubmit}</span>
                </label>
            </div>
            
            <div class="input-group">
                <label id="label-language">${langText[language].language}:</label>
                <select id="language-select">
                    <option value="en" ${language === "en" ? "selected" : ""}>English</option>
                    <option value="zh" ${language === "zh" ? "selected" : ""}>中文</option>
                </select>
            </div>
            
            <div id="progress-container">
                <progress id="progress-bar" max="100" value="0"></progress>
                <span id="progress-text">${langText[language].progressText || "Processing..."}</span>
            </div>
            
            <p id="status">${langText[language].statusWaiting}</p>
            
            <!-- 日志显示区域，默认隐藏 -->
            <div id="log-container" style="display: none; max-height: 200px; overflow-y: auto; border: 1px solid #ccc; margin-top: 10px; padding: 5px; background-color: #f9f9f9;"></div>
        </div>
    `;
    document.body.appendChild(panel);

    // -------------------- 日志功能相关 --------------------
    function logMessage(message) {
        const logContainer = document.getElementById('log-container');
        const timestamp = new Date().toLocaleString();
        const logEntry = document.createElement('div');
        logEntry.textContent = `[${timestamp}] ${message}`;
        logContainer.appendChild(logEntry);
        // 同时在控制台输出
        console.log(`[Log] ${message}`);
    }

    // 切换日志面板显示/隐藏
    document.getElementById("toggle-log-btn").addEventListener("click", function() {
        const logContainer = document.getElementById('log-container');
        if (logContainer.style.display === "none") {
            logContainer.style.display = "block";
            this.textContent = langText[language].hideLog;
        } else {
            logContainer.style.display = "none";
            this.textContent = langText[language].showLog;
        }
    });

    // 捕获全局 JS 错误，并显示日志
    window.onerror = function(message, source, lineno, colno, error) {
        logMessage(`JS Error: ${message} at ${source}:${lineno}:${colno}`);
    };

    // -------------------- 使面板可拖拽 --------------------
    (function makeDraggable(element) {
        let posX = 0, posY = 0, initX = 0, initY = 0;
        const header = document.getElementById("gpt4o-header");
        header.style.cursor = "move";
        header.addEventListener('mousedown', function(e) {
            e.preventDefault();
            initX = e.clientX;
            initY = e.clientY;
            document.addEventListener('mousemove', drag);
            document.addEventListener('mouseup', closeDrag);
        });
        function drag(e) {
            e.preventDefault();
            posX = initX - e.clientX;
            posY = initY - e.clientY;
            initX = e.clientX;
            initY = e.clientY;
            element.style.top = (element.offsetTop - posY) + "px";
            element.style.left = (element.offsetLeft - posX) + "px";
        }
        function closeDrag() {
            document.removeEventListener('mousemove', drag);
            document.removeEventListener('mouseup', closeDrag);
        }
    })(panel);

    // -------------------- 事件绑定 --------------------
    document.getElementById("close-button").addEventListener("click", function() {
        panel.style.display = "none";
    });

    document.getElementById("language-select").addEventListener("change", function() {
        language = this.value;
        localStorage.setItem("gpt4o-language", language);
        updateLanguageText();
    });

    // 模型选择变更时处理：更新描述、检查是否为deepseek系列或自定义模型，并自动配置API_BASE
    document.getElementById("model-select").addEventListener("change", function() {
        selectedModel = this.value;
        document.getElementById("model-description").textContent = modelDescriptions[selectedModel];

        // 控制自定义模型输入框显示
        const customModelGroup = document.getElementById("custom-model-group");
        if (selectedModel === "custom") {
            customModelGroup.style.display = "block";
        } else {
            customModelGroup.style.display = "none";
        }

        // 自动配置API_BASE
        const apiBaseInput = document.getElementById("api-base-input");
        if (selectedModel === "deepseek-reasoner" || selectedModel === "deepseek-chat") {
            API_BASE = "https://api.deepseek.com/v1/chat/completions";
        } else {
            API_BASE = "https://api.openai.com/v1/chat/completions";
        }
        localStorage.setItem("gpt4o-api-base", API_BASE);
        apiBaseInput.value = API_BASE;
        // 高光闪烁效果：临时改变背景色后恢复
        const originalBg = apiBaseInput.style.backgroundColor;
        apiBaseInput.style.backgroundColor = "#ffff99";
        setTimeout(() => {
            apiBaseInput.style.backgroundColor = originalBg;
        }, 500);
    });

    // 当用户在自定义模型输入框输入后，将值赋给selectedModel
    document.getElementById("custom-model-input").addEventListener("change", function() {
        const customModel = this.value.trim();
        if (customModel) {
            selectedModel = customModel;
            // 更新描述为用户自定义内容
            document.getElementById("model-description").textContent = "User-defined custom model: " + customModel;
        }
    });

    document.getElementById("save-api-key").addEventListener("click", function() {
        const newApiKey = document.getElementById("api-key-input").value.trim();
        if (newApiKey) {
            API_KEY = newApiKey;
            localStorage.setItem("gpt4o-api-key", API_KEY);
            document.getElementById("api-key-input").value = "********";
        } else {
            alert("API key cannot be empty.");
        }
    });

    document.getElementById("save-api-base").addEventListener("click", function() {
        const newApiBase = document.getElementById("api-base-input").value.trim();
        if (newApiBase) {
            API_BASE = newApiBase;
            localStorage.setItem("gpt4o-api-base", API_BASE);
        } else {
            alert("API base cannot be empty.");
        }
    });

    // 修改 Auto Answer Mode 事件处理，提示功能不可用，并取消勾选
    document.getElementById("auto-answer-mode-toggle").addEventListener("change", function() {
        if (this.checked) {
            alert(langText[language].autoAnswerDisabled);
            this.checked = false;
            autoAnswerModeEnabled = false;
        }
    });

    document.getElementById("auto-submit-toggle").addEventListener("change", function() {
        autoSubmitEnabled = this.checked;
    });

    document.getElementById("start-answering").addEventListener("click", function() {
        answerQuestion();
    });

    // 根据当前语言更新界面文本
    function updateLanguageText() {
        document.getElementById("start-answering").textContent = langText[language].startAnswering;
        document.getElementById("close-button").textContent = langText[language].closeButton || "Close";
        document.getElementById("label-api-key").textContent = langText[language].setApiKey + ":";
        document.getElementById("api-key-input").placeholder = langText[language].apiKeyPlaceholder;
        document.getElementById("save-api-key").textContent = langText[language].saveApiKey;
        document.getElementById("label-api-base").textContent = langText[language].setApiBase + ":";
        document.getElementById("api-base-input").placeholder = langText[language].apiBasePlaceholder;
        document.getElementById("save-api-base").textContent = langText[language].saveApiBase;
        document.getElementById("label-model-selection").textContent = langText[language].modelSelection + ":";
        document.getElementById("model-description").textContent = modelDescriptions[selectedModel] || "User-defined custom model";
        document.getElementById("label-language").textContent = langText[language].language + ":";
        document.getElementById("progress-text").textContent = langText[language].progressText || "Processing...";
        document.getElementById("status").textContent = langText[language].statusWaiting;
        // 更新日志按钮文本（根据日志区域是否显示）
        const toggleBtn = document.getElementById("toggle-log-btn");
        const logContainer = document.getElementById('log-container');
        toggleBtn.textContent = logContainer.style.display === "none" ? langText[language].showLog : langText[language].hideLog;
        // 更新自定义模型输入框提示
        document.getElementById("custom-model-input").placeholder = langText[language].customModelPlaceholder;
    }

    // -------------------- 进度条相关操作 --------------------
    const progressContainer = document.getElementById("progress-container");
    const progressBar = document.getElementById("progress-bar");
    let progressInterval = null;

    function updateProgress(value) {
        progressBar.value = value;
    }

    // 进度条模拟更新
    function startFakeProgress() {
        progressInterval = setInterval(() => {
            let current = progressBar.value;
            if (current < 90) {
                let increment = (90 - current) * 0.05;
                if (increment < 0.5) {
                    increment = 0.5;
                }
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

    // -------------------- Canvas 截图 --------------------
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

    // -------------------- 向 GPT 发送请求及处理返回结果 --------------------
    function sendContentToGPT(htmlContent, canvasDataUrl) {
        const messages = [
            {
                "role": "system",
                "content": "You are a math assistant. Carefully analyze the provided HTML structure and canvas image (if available) to generate executable JavaScript code that fills in all required answer fields accurately. Use stable selectors such as XPath. Think step by step before answering."
            },
            {
                "role": "user",
                "content": `This is a math question. Use the following HTML structure to generate JavaScript code that fills each answer field without leaving any fields empty.\n\nHTML Structure:\n${htmlContent}`
            }
        ];
        if (canvasDataUrl) {
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
            model: selectedModel,
            messages: messages
        };

        updateProgress(15);
        document.getElementById("status").textContent = langText[language].waitingGpt;
        startFakeProgress();

        GM_xmlhttpRequest({
            method: "POST",
            url: API_BASE,
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${API_KEY}`
            },
            data: JSON.stringify(requestPayload),
            onload: function(response) {
                if (response.status === 200) {
                    clearInterval(progressInterval);
                    updateProgress(95);
                    document.getElementById("status").textContent = langText[language].parsingResponse;
                    let data = JSON.parse(response.responseText);
                    let code = sanitizeCode(data.choices[0].message.content.trim());
                    try {
                        document.getElementById("status").textContent = langText[language].executingCode;
                        eval(code);
                        if (autoSubmitEnabled) {
                            submitAnswer();
                            document.getElementById("status").textContent = langText[language].submissionComplete;
                        }
                        finishProgress();
                    } catch (error) {
                        document.getElementById("status").textContent = "Error during code execution.";
                        logMessage(`Error during code execution: ${error}`);
                        console.error("Execution error: ", error);
                    }
                } else {
                    clearInterval(progressInterval);
                    updateProgress(0);
                    progressContainer.style.display = "none";
                    document.getElementById("status").textContent = langText[language].requestError + response.status;
                    logMessage(`GPT request error, status code: ${response.status}`);
                    console.error("GPT request error, status code: " + response.status);
                }
            },
            onerror: function(error) {
                clearInterval(progressInterval);
                updateProgress(0);
                progressContainer.style.display = "none";
                document.getElementById("status").textContent = langText[language].requestError + error;
                logMessage(`Request error: ${error}`);
                console.error("Request error: ", error);
            }
        });
    }

    // 提取返回的 JavaScript 代码
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

    // 模拟点击提交按钮
    function submitAnswer() {
        const submitButton = document.evaluate(
            '/html/body/main/div/article/section/section/div/div[1]/section/div/section/div/button',
            document,
            null,
            XPathResult.FIRST_ORDERED_NODE_TYPE,
            null
        ).singleNodeValue;
        if (submitButton) {
            submitButton.click();
            logMessage("Answer submitted automatically.");
            console.log("Answer submitted automatically.");
        } else {
            logMessage("Submit button not found.");
            console.log("Submit button not found.");
        }
    }

    // 捕获当前问题页面的 HTML 结构及 canvas，并发送给 GPT
    function answerQuestion() {
        progressContainer.style.display = "block";
        updateProgress(5);
        document.getElementById("status").textContent = langText[language].analyzingHtml;

        let targetDiv = document.evaluate(
            '/html/body/main/div/article/section/section/div/div[1]',
            document,
            null,
            XPathResult.FIRST_ORDERED_NODE_TYPE,
            null
        ).singleNodeValue;

        if (!targetDiv) {
            updateProgress(0);
            progressContainer.style.display = "none";
            document.getElementById("status").textContent = "Error: HTML structure not found.";
            logMessage("Error: HTML structure not found, check XPath.");
            console.error("Error: HTML structure not found, check XPath.");
            return;
        }

        updateProgress(10);
        document.getElementById("status").textContent = langText[language].extractingData;
        let htmlContent = targetDiv.outerHTML;

        updateProgress(15);
        document.getElementById("status").textContent = langText[language].constructingApi;

        const canvasDataUrl = captureCanvasImage(targetDiv);

        sendContentToGPT(htmlContent, canvasDataUrl);
    }

    // 监控新问题出现（已禁用Auto Answer Mode）
    function monitorNewQuestions() {
        // 此功能已失效，不再自动监控新问题
        logMessage("Auto Answer Mode is disabled and will not work.");
    }

    // -------------------- 样式设置 --------------------
    GM_addStyle(`
        #gpt4o-panel {
            font-family: Arial, sans-serif;
            font-size: 14px;
            width: 350px;
            background-color: rgba(255, 255, 255, 0.95);
            border-radius: 5px;
            position: fixed;
            top: 10px;
            right: 10px;
            z-index: 10000;
            box-shadow: 0px 0px 10px rgba(0, 0, 0, 0.3);
        }
        #gpt4o-header {
            cursor: move;
            padding: 5px 10px;
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
            padding: 2px 6px;
            cursor: pointer;
            color: white;
            font-size: 14px;
            border-radius: 3px;
            margin-left: 5px;
        }
        #gpt4o-content {
            padding: 10px;
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
            padding: 5px;
            box-sizing: border-box;
        }
        .input-group button {
            margin-top: 5px;
            width: 100%;
            padding: 5px;
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
            height: 10px;
        }
        #status {
            margin-top: 10px;
            font-weight: bold;
        }
    `);
})();
