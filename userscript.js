// ==UserScript==
// @name         IXL Auto Answer (OpenAI API Requid)
// @namespace    http://tampermonkey.net/
// @version      5.4
// @license CC-BY NC
// @description  Sends HTML and canvas data to GPT-4o for math problem solving with enhanced accuracy, GUI, and auto-answering functionality
// @match        https://ca.ixl.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// ==/UserScript==
 
(function() {
    'use strict';
 
    let API_KEY = localStorage.getItem("gpt4o-api-key") || "";  // Load API key from storage
    const API_URL = "https://api.openai.com/v1/chat/completions";
    let selectedModel = "gpt-4o";
    let autoAnswerModeEnabled = false;
    let autoSubmitEnabled = false;
    let language = localStorage.getItem("gpt4o-language") || "en";  // Default to English and load stored language
 
    // Prompt for API key if not set
    if (!API_KEY) {
        API_KEY = prompt("Please enter your OpenAI API key:");
        if (API_KEY) {
            localStorage.setItem("gpt4o-api-key", API_KEY);  // Save API key
        } else {
            alert("API key is required to use this tool.");
            return;
        }
    }
 
    // Text content for different languages
    const langText = {
        en: {
            startAnswering: "Start Answering",
            autoAnsweringMode: "Enable Auto Answer Mode",
            autoSubmit: "Enable Auto Submit",
            language: "Language",
            statusWaiting: "Status: Waiting for input",
            statusFetching: "Status: Retrieving HTML structure...",
            statusSubmitting: "Status: Code executed",
            logLanguageSet: "Language set to",
            logModelSwitch: "Model switched to",
            logAutoAnswer: "Auto answer mode is",
            logAutoSubmit: "Auto submit is",
            logCanvasDetected: "Detected canvas element, capturing image...",
            logGeneratedCode: "Generated code",
            logExecutionError: "Execution error",
            logAnswerSubmitted: "Answer submitted automatically",
            logSubmitNotFound: "Submit button not found",
            logHtmlFetched: "Captured HTML structure",
            closeButton: "Close",
        },
        zh: {
            startAnswering: "开始答题",
            autoAnsweringMode: "启用自动答题模式",
            autoSubmit: "启用自动提交",
            language: "语言",
            statusWaiting: "状态：等待输入",
            statusFetching: "状态：获取 HTML 结构...",
            statusSubmitting: "状态：代码已执行",
            logLanguageSet: "语言设置为",
            logModelSwitch: "模型切换为",
            logAutoAnswer: "自动答题模式已",
            logAutoSubmit: "自动提交已",
            logCanvasDetected: "检测到画布元素，正在捕获图像...",
            logGeneratedCode: "生成的代码",
            logExecutionError: "执行错误",
            logAnswerSubmitted: "答案已自动提交",
            logSubmitNotFound: "未找到提交按钮",
            logHtmlFetched: "获取的 HTML 结构",
            closeButton: "关闭",
        }
    };
 
    const panel = document.createElement('div');
    panel.id = "gpt4o-panel";
    panel.innerHTML = `
        <div id="gpt4o-header" style="cursor: move; padding: 5px; background-color: #4CAF50; color: white;">
            GPT-4o Answer Assistant
            <button id="close-button" style="float: right; background-color: #d9534f; color: white; border: none; padding: 2px 6px; cursor: pointer;">${langText[language].closeButton}</button>
        </div>
        <div style="padding: 10px;">
            <button id="start-answering">${langText[language].startAnswering}</button>
            <label>
                <input type="radio" name="model" value="gpt-4o" checked> GPT-4o
            </label>
            <label>
                <input type="radio" name="model" value="gpt-4o-mini"> GPT-4o-mini
            </label>
            <label style="display: block; margin-top: 10px;">
                <input type="checkbox" id="auto-answer-mode-toggle"> ${langText[language].autoAnsweringMode}
            </label>
            <label style="display: block; margin-top: 10px;">
                <input type="checkbox" id="auto-submit-toggle"> ${langText[language].autoSubmit}
            </label>
            <label style="display: block; margin-top: 10px;">
                ${langText[language].language}:
                <select id="language-select">
                    <option value="en" ${language === "en" ? "selected" : ""}>English</option>
                    <option value="zh" ${language === "zh" ? "selected" : ""}>中文</option>
                </select>
            </label>
            <p id="status" style="color: green;">${langText[language].statusWaiting}</p>
            <div id="log" style="font-size: 12px; color: #333; max-height: 300px; overflow-y: auto; border-top: 1px solid #ccc; margin-top: 10px; padding-top: 5px;"></div>
        </div>
    `;
    document.body.appendChild(panel);
 
    // Make the panel draggable
    function makeDraggable(element) {
        let posX = 0, posY = 0, initX = 0, initY = 0;
        const header = document.getElementById("gpt4o-header");
 
        header.onmousedown = function(e) {
            e.preventDefault();
            initX = e.clientX;
            initY = e.clientY;
            document.onmouseup = closeDrag;
            document.onmousemove = drag;
        };
 
        function drag(e) {
            e.preventDefault();
            posX = initX - e.clientX;
            posY = initY - e.clientY;
            initX = e.clientX;
            initY = e.clientY;
            element.style.top = (element.offsetTop - posY) + "px";
            element.style.left = (element.offsetLeft - posX) + "px";
            element.style.pointerEvents = "auto";
        }
 
        function closeDrag() {
            document.onmouseup = null;
            document.onmousemove = null;
        }
    }
 
    makeDraggable(panel);
 
    document.getElementById("close-button").addEventListener("click", function() {
        panel.style.display = "none";
    });
 
    document.getElementById("language-select").addEventListener("change", function() {
        language = this.value;
        localStorage.setItem("gpt4o-language", language);
        updateTextContent();
        logMessage(`${langText[language].logLanguageSet}: ${language}`);
    });
 
    function updateTextContent() {
        document.getElementById("start-answering").textContent = langText[language].startAnswering;
        document.getElementById("auto-answer-mode-toggle").nextSibling.textContent = langText[language].autoAnsweringMode;
        document.getElementById("auto-submit-toggle").nextSibling.textContent = langText[language].autoSubmit;
        document.getElementById("close-button").textContent = langText[language].closeButton;
        document.getElementById("status").textContent = langText[language].statusWaiting;
    }
 
    function logMessage(message) {
        const logDiv = document.getElementById('log');
        logDiv.innerHTML += `<p>${message}</p>`;
        logDiv.scrollTop = logDiv.scrollHeight;
    }
 
    function sanitizeCode(codeString) {
        return codeString.replace(/^```(?:js|javascript)?\s*/i, "").replace(/```$/i, "").trim();
    }
 
    // Capture canvas element if present in the question
    function captureCanvasImage(htmlElement) {
        const canvas = htmlElement.querySelector('canvas');
        if (canvas) {
            logMessage(langText[language].logCanvasDetected);
            const offscreenCanvas = document.createElement('canvas');
            offscreenCanvas.width = canvas.width;
            offscreenCanvas.height = canvas.height;
            const ctx = offscreenCanvas.getContext('2d');
            ctx.drawImage(canvas, 0, 0);
            return offscreenCanvas.toDataURL("image/png").split(",")[1];
        }
        return null;
    }
 
    function sendContentToGPT(htmlContent, canvasDataUrl) {
        const requestPayload = {
            model: selectedModel,
            messages: [
                {
                    "role": "system",
                    "content": "You are a math assistant. Carefully analyze the HTML structure and canvas (if provided) to produce executable JavaScript code that fills all required fields based on the question's context. Use only stable selectors like xpath, and ensure each field is filled correctly without explanations or comments."
                },
                {
                    "role": "user",
                    "content": `This is a math question. Use the HTML structure provided to generate JavaScript code that fills each answer field without leaving any fields empty.\n\nHTML Structure:\n${htmlContent}`
                }
            ]
        };
 
        if (canvasDataUrl) {
            requestPayload["image"] = canvasDataUrl;
        }
 
        GM_xmlhttpRequest({
            method: "POST",
            url: API_URL,
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${API_KEY}`
            },
            data: JSON.stringify(requestPayload),
            onload: function(response) {
                if (response.status === 200) {
                    let data = JSON.parse(response.responseText);
                    let code = sanitizeCode(data.choices[0].message.content.trim());
                    document.getElementById('status').innerText = langText[language].statusSubmitting;
                    logMessage(`${langText[language].logGeneratedCode}: ${code}`);
 
                    try {
                        eval(code);
                        if (autoSubmitEnabled) submitAnswer();
                    } catch (error) {
                        document.getElementById('status').innerText = langText[language].logExecutionError;
                        logMessage(`${langText[language].logExecutionError}: ${error.message}`);
                    }
                } else {
                    document.getElementById('status').innerText = "Status: GPT request failed";
                    logMessage("GPT request error, status code: " + response.status);
                }
            },
            onerror: function(error) {
                document.getElementById('status').innerText = "Status: Request error";
                logMessage("Request error: " + error);
            }
        });
    }
 
    function submitAnswer() {
        const submitButton = document.evaluate('/html/body/main/div/article/section/section/div/div[1]/section/div/section/div/button', document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
        if (submitButton) {
            submitButton.click();
            logMessage(langText[language].logAnswerSubmitted);
        } else {
            logMessage(langText[language].logSubmitNotFound);
        }
    }
 
    function answerQuestion() {
        document.getElementById('status').innerText = langText[language].statusFetching;
        logMessage(langText[language].logHtmlFetched);
 
        let targetDiv = document.evaluate('/html/body/main/div/article/section/section/div/div[1]', document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
 
        if (!targetDiv) {
            document.getElementById('status').innerText = langText[language].statusFetching;
            logMessage("Error: HTML structure not found, check XPath.");
            return;
        }
 
        let htmlContent = targetDiv.outerHTML;
        const canvasDataUrl = captureCanvasImage(targetDiv);
        sendContentToGPT(htmlContent, canvasDataUrl);
    }
 
    function monitorNewQuestions() {
        const observer = new MutationObserver(() => {
            if (autoAnswerModeEnabled) {
                logMessage("New question detected, attempting to answer...");
                answerQuestion();
            }
        });
 
        const targetNode = document.querySelector("main");
        if (targetNode) {
            observer.observe(targetNode, { childList: true, subtree: true });
        }
    }
 
    document.getElementById('auto-answer-mode-toggle').addEventListener('change', function() {
        autoAnswerModeEnabled = this.checked;
        logMessage(`${langText[language].logAutoAnswer} ${autoAnswerModeEnabled ? 'enabled' : 'disabled'}`);
        if (autoAnswerModeEnabled) {
            monitorNewQuestions();
        }
    });
 
    document.getElementById('auto-submit-toggle').addEventListener('change', function() {
        autoSubmitEnabled = this.checked;
        logMessage(`${langText[language].logAutoSubmit} ${autoSubmitEnabled ? 'enabled' : 'disabled'}`);
    });
 
    document.getElementById('start-answering').addEventListener('click', function() {
        answerQuestion();
    });
 
    GM_addStyle(`
        #gpt4o-panel {
            font-family: Arial, sans-serif;
            font-size: 14px;
            width: 300px;
            border-radius: 5px;
            box-shadow: 0px 0px 10px rgba(0, 0, 0, 0.3);  /* Set semi-transparent shadow */
            position: absolute;
            top: 10px;
            right: 10px;
            z-index: 10000;  /* Ensure top layer */
            background-color: rgba(255, 255, 255, 0.9);  /* Semi-transparent background */
        }
        #gpt4o-panel button {
            background-color: #4CAF50;
            color: white;
            border: none;
            padding: 8px 16px;
            font-size: 14px;
            cursor: pointer;
            border-radius: 5px;
        }
        #gpt4o-panel button:hover {
            background-color: #45a049;
        }
        #log {
            font-family: monospace;
        }
    `);
})();
