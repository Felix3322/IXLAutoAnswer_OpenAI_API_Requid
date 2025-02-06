// ==UserScript==
// @name         IXL Auto Answer (OpenAI API Required)
// @namespace    http://tampermonkey.net/
// @version      7.0
// @license      GPL-3.0
// @description  Sends HTML and canvas data to AI models for math problem solving with enhanced accuracy, a configurable API base, an improved GUI with progress bar and auto-answer functionality.
// @match        https://*.ixl.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @downloadURL https://update.greasyfork.org/scripts/517259/IXL%20Auto%20Answer%20%28OpenAI%20API%20Required%29.user.js
// @updateURL https://update.greasyfork.org/scripts/517259/IXL%20Auto%20Answer%20%28OpenAI%20API%20Required%29.meta.js
// ==/UserScript==

(function() {
    'use strict';

    // 从 localStorage 中加载 API key 和 API base（若没有则使用默认值）
    let API_KEY = localStorage.getItem("gpt4o-api-key") || "";
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

    // 模型介绍（注意：o3-mini 准确率不如 o1）
    const modelDescriptions = {
        "gpt-4o": "Can solve problems with images, cost-effective.",
        "gpt-4o-mini": "Handles text-only questions, cheapest option.",
        "o1": "Solves image problems with highest accuracy, but is slow and expensive.",
        "o3-mini": "Handles text-only questions, fast and cost-effective, but accuracy is not as high as o1."
    };

    // 多语言文本
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
            statusFetching: "Status: Retrieving HTML structure...",
            statusSubmitting: "Status: Code executed",
            progressText: "Processing...",
            closeButton: "Close",
            requestError: "Request error: "
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
            statusFetching: "状态：获取 HTML 结构...",
            statusSubmitting: "状态：代码已执行",
            progressText: "处理中...",
            closeButton: "关闭",
            requestError: "请求错误："
        }
    };

    // 创建控制面板
    const panel = document.createElement('div');
    panel.id = "gpt4o-panel";
    panel.innerHTML = `
        <div id="gpt4o-header">
            <span>GPT Answer Assistant</span>
            <button id="close-button">${langText[language].closeButton}</button>
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
                </select>
                <p id="model-description">${modelDescriptions[selectedModel]}</p>
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
                <span id="progress-text">${langText[language].progressText}</span>
            </div>
            
            <p id="status">${langText[language].statusWaiting}</p>
        </div>
    `;
    document.body.appendChild(panel);

    // 预填 API Base 输入框
    document.getElementById('api-base-input').value = API_BASE;

    // 使面板可拖拽
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

    // 事件绑定
    document.getElementById("close-button").addEventListener("click", function() {
        panel.style.display = "none";
    });

    document.getElementById("language-select").addEventListener("change", function() {
        language = this.value;
        localStorage.setItem("gpt4o-language", language);
        updateLanguageText();
    });

    document.getElementById("model-select").addEventListener("change", function() {
        selectedModel = this.value;
        document.getElementById("model-description").textContent = modelDescriptions[selectedModel];
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

    document.getElementById("auto-answer-mode-toggle").addEventListener("change", function() {
        autoAnswerModeEnabled = this.checked;
        if (autoAnswerModeEnabled) {
            monitorNewQuestions();
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
        document.getElementById("close-button").textContent = langText[language].closeButton;
        document.getElementById("label-api-key").textContent = langText[language].setApiKey + ":";
        document.getElementById("api-key-input").placeholder = langText[language].apiKeyPlaceholder;
        document.getElementById("save-api-key").textContent = langText[language].saveApiKey;
        document.getElementById("label-api-base").textContent = langText[language].setApiBase + ":";
        document.getElementById("api-base-input").placeholder = langText[language].apiBasePlaceholder;
        document.getElementById("save-api-base").textContent = langText[language].saveApiBase;
        document.getElementById("label-model-selection").textContent = langText[language].modelSelection + ":";
        document.getElementById("model-description").textContent = modelDescriptions[selectedModel];
        document.getElementById("label-auto-answer").innerHTML = `<input type="checkbox" id="auto-answer-mode-toggle"> <span id="span-auto-answer">${langText[language].autoAnsweringMode}</span>`;
        document.getElementById("label-auto-submit").innerHTML = `<input type="checkbox" id="auto-submit-toggle"> <span id="span-auto-submit">${langText[language].autoSubmit}</span>`;
        document.getElementById("label-language").textContent = langText[language].language + ":";
        document.getElementById("progress-text").textContent = langText[language].progressText;
        document.getElementById("status").textContent = langText[language].statusWaiting;
    }

    // 进度条相关操作
    const progressContainer = document.getElementById("progress-container");
    const progressBar = document.getElementById("progress-bar");
    let progressInterval = null;

    // 更新进度到指定数值
    function updateProgress(value) {
        progressBar.value = value;
    }

    // 请求时启动“假进度”，从当前进度（应为40%）缓慢增至95%
    function startFakeProgress() {
        progressInterval = setInterval(() => {
            if (progressBar.value < 95) {
                updateProgress(progressBar.value + 3);  // 每次增加3%
            } else {
                clearInterval(progressInterval);
            }
        }, 500);
    }

    // 请求结束后停止计时器，并将进度置为100%，稍后隐藏进度条
    function finishProgress() {
        clearInterval(progressInterval);
        updateProgress(100);
        setTimeout(() => {
            progressContainer.style.display = "none";
            updateProgress(0);
        }, 500);
    }

    // 捕获目标 HTML 中的 canvas 元素（若存在）并转换为 base64 编码的 PNG 图像
    function captureCanvasImage(htmlElement) {
        const canvas = htmlElement.querySelector('canvas');
        if (canvas) {
            console.log("Detected canvas element, capturing image...");
            const offscreenCanvas = document.createElement('canvas');
            offscreenCanvas.width = canvas.width;
            offscreenCanvas.height = canvas.height;
            const ctx = offscreenCanvas.getContext('2d');
            ctx.drawImage(canvas, 0, 0);
            return offscreenCanvas.toDataURL("image/png").split(",")[1];
        }
        return null;
    }

    // 向 GPT 发送 HTML 内容和可选的 canvas 数据，并执行返回的 JavaScript 代码
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

        // 显示进度条（此时进度应为40%）
        progressContainer.style.display = "block";
        updateProgress(40);
        startFakeProgress();
        document.getElementById("status").textContent = langText[language].statusFetching;

        GM_xmlhttpRequest({
            method: "POST",
            url: API_BASE,
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${API_KEY}`
            },
            data: JSON.stringify(requestPayload),
            onload: function(response) {
                // 请求成功时完成进度
                if (response.status === 200) {
                    finishProgress();
                    document.getElementById("status").textContent = langText[language].statusSubmitting;
                    let data = JSON.parse(response.responseText);
                    let code = sanitizeCode(data.choices[0].message.content.trim());
                    try {
                        eval(code);
                        if (autoSubmitEnabled) submitAnswer();
                    } catch (error) {
                        document.getElementById("status").textContent = "Error during code execution.";
                        console.error("Execution error: ", error);
                    }
                } else {
                    clearInterval(progressInterval);
                    updateProgress(0);
                    progressContainer.style.display = "none";
                    document.getElementById("status").textContent = langText[language].requestError + response.status;
                    console.error("GPT request error, status code: " + response.status);
                }
            },
            onerror: function(error) {
                clearInterval(progressInterval);
                updateProgress(0);
                progressContainer.style.display = "none";
                document.getElementById("status").textContent = langText[language].requestError + error;
                console.error("Request error: ", error);
            }
        });
    }

    // 从 GPT 返回的文本中提取 JavaScript 代码
    function sanitizeCode(responseContent) {
        const regex = /```javascript\s+([\s\S]*?)\s+```/i;
        const match = responseContent.match(regex);
        if (match && match[1]) {
            return match[1].trim();
        } else {
            console.error("Error: No JavaScript code found in response.");
            return "";
        }
    }

    // 模拟点击页面中的提交按钮提交答案
    function submitAnswer() {
        const submitButton = document.evaluate('/html/body/main/div/article/section/section/div/div[1]/section/div/section/div/button', document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
        if (submitButton) {
            submitButton.click();
            console.log("Answer submitted automatically.");
        } else {
            console.log("Submit button not found.");
        }
    }

    // 捕获当前问题页面的 HTML 结构及 canvas（若存在），并发送给 GPT 处理
    function answerQuestion() {
        // 开始时显示进度条并置为初始值 10%
        progressContainer.style.display = "block";
        updateProgress(10);
        document.getElementById("status").textContent = langText[language].statusFetching;
        
        let targetDiv = document.evaluate('/html/body/main/div/article/section/section/div/div[1]', document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
        if (!targetDiv) {
            updateProgress(0);
            progressContainer.style.display = "none";
            document.getElementById("status").textContent = "Error: HTML structure not found.";
            console.error("Error: HTML structure not found, check XPath.");
            return;
        }
        
        // HTML 提取完成，更新进度到 20%
        updateProgress(20);
        let htmlContent = targetDiv.outerHTML;
        
        // 尝试提取 canvas 图片，提取完成后更新进度到 40%
        const canvasDataUrl = captureCanvasImage(targetDiv);
        updateProgress(40);
        
        // 发起请求，进度将从 40% 渐增到 95%
        sendContentToGPT(htmlContent, canvasDataUrl);
    }

    // 当 auto-answer 模式启用时，监控页面中是否有新问题出现
    function monitorNewQuestions() {
        const observer = new MutationObserver(() => {
            if (autoAnswerModeEnabled) {
                console.log("New question detected, attempting to answer...");
                answerQuestion();
            }
        });
        const targetNode = document.querySelector("main");
        if (targetNode) {
            observer.observe(targetNode, { childList: true, subtree: true });
        }
    }

    // 样式设置
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
