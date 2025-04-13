// ==UserScript==
// @name         IXL Auto Answer (Gradient, Streaming AI helper, Detailed Logs)
// @namespace    http://tampermonkey.net/
// @version      14.0
// @license      GPL-3.0
// @description  Default display mode, AI helper uses streaming, fix answer question, track total tokens, pastel gradient UI.
// @match        https://*.ixl.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// ==/UserScript==

(function() {
    'use strict';

    //----------------------------------------------------------------------
    // 1) 全局说明 & 配置
    //----------------------------------------------------------------------
    const scriptDescription = `
Script features:
1) Default "Display Only" for IXL solutions (GPT returns plain text).
2) "Auto Fill" mode can fill answers automatically (unstable).
3) AI Helper uses streaming: partial output displayed in real time.
4) The top "Tokens" counter accumulates usage from "AnswerQuestion" calls (non-stream). 
5) ManageKey & RentKey features included.
    `;

    // modelConfigs：各模型管理
    let modelConfigs = JSON.parse(localStorage.getItem("gpt4o-modelConfigs") || "{}");
    const predefinedModels = [
        "gpt-4o", "gpt-4o-mini", "o1", "o3-mini",
        "deepseek-reasoner", "deepseek-chat", "chatgpt-4o-least"
    ];
    if (!modelConfigs["gpt-4o"]) {
        modelConfigs["gpt-4o"] = {
            apiKey: "",
            apiBase: "https://api.openai.com/v1/chat/completions",
            manageUrl: "",
            modelList: [],
            discovered: false
        };
    }

    // 全局 config：默认 displayOnly
    const config = {
        selectedModel: "gpt-4o",
        language: localStorage.getItem("gpt4o-language") || "en",
        fillMode: "displayOnly",
        autoSubmitEnabled: false,
        lastTargetState: null,
        totalTokenUsage: 0,       // 累计tokens，AI助手流式请求无法统计
        maxRetry: 2
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
    // 4) 主面板（新增背景渐变、布局微调）
    //----------------------------------------------------------------------
    const panel = document.createElement('div');
    panel.id = "gpt4o-panel";
    panel.innerHTML = `
      <div class="header-bar">
          <span id="token-usage-display">${langText[config.language].tokenUsage}0</span>
          <button id="toggle-log-btn">${langText[config.language].showLog}</button>
          <button id="close-button">${langText[config.language].closeButton}</button>
      </div>
      <div class="content-area">

          <h2 style="margin:10px 0;">GPT Answer Assistant</h2>

          <div class="row">
              <label>${langText[config.language].fillModeLabel}:</label>
              <select id="fill-mode-select">
                  <option value="autoFill">${langText[config.language].fillMode_auto}</option>
                  <option value="displayOnly">${langText[config.language].fillMode_display}</option>
              </select>
          </div>

          <button id="start-answering" class="btn-strong">
              ${langText[config.language].startAnswering}
          </button>
          <button id="rollback-answer" class="btn-normal">
              ${langText[config.language].rollback}
          </button>

          <div class="row">
              <label>${langText[config.language].modelSelection}:</label>
              <select id="model-select"></select>
              <p id="model-description" style="margin:5px 0;"></p>
          </div>

          <div class="row" id="custom-model-group" style="display:none;">
              <label id="label-custom-model">
                  ${langText[config.language].modelSelection} (Custom):
              </label>
              <input type="text" id="custom-model-input" placeholder="${langText[config.language].customModelPlaceholder}">
          </div>

          <div class="row">
              <label>${langText[config.language].setApiKey}:</label>
              <input type="password" id="api-key-input" placeholder="${langText[config.language].apiKeyPlaceholder}">
              <button id="save-api-key">${langText[config.language].saveApiKey}</button>
              <button id="check-api-key-btn">${langText[config.language].checkApiKey}</button>
          </div>

          <div class="row">
              <label>${langText[config.language].setApiBase}:</label>
              <input type="text" id="api-base-input" placeholder="${langText[config.language].apiBasePlaceholder}">
              <button id="save-api-base">${langText[config.language].saveApiBase}</button>
          </div>

          <div class="row">
              <div style="display:flex;gap:8px;">
                  <label>${langText[config.language].manageModelLink}:</label>
                  <a id="manage-model-link" href="#" target="_blank" class="link-button">Open Link</a>
              </div>
              <button id="rent-api-btn">${langText[config.language].rentApiKey}</button>
              <button id="refresh-model-list-btn">
                  ${langText[config.language].refreshModelList}
              </button>
          </div>

          <div class="row" id="auto-submit-group">
              <label>
                  <input type="checkbox" id="auto-submit-toggle">
                  <span id="span-auto-submit">Enable Auto Submit</span>
              </label>
          </div>

          <div class="row">
              <label>Language:</label>
              <select id="language-select">
                  <option value="en" ${config.language === "en" ? "selected" : ""}>English</option>
                  <option value="zh" ${config.language === "zh" ? "selected" : ""}>中文</option>
              </select>
          </div>

          <div id="progress-container" style="display:none; margin-top:10px;">
              <progress id="progress-bar" max="100" value="0"></progress>
              <span id="progress-text">${langText[config.language].progressText}</span>
          </div>

          <p id="status" style="margin-top:10px;font-weight:bold;">
            ${langText[config.language].statusWaiting}
          </p>

          <!-- 日志区 -->
          <div id="log-container" style="
            display:none;
            max-height: 250px;
            overflow-y:auto;
            border:1px solid #999;
            margin-top:10px;
            background:#fff;
            padding:10px;
            font-family:monospace;
          "></div>

          <div id="answer-display" style="
            display:none;
            margin-top:10px;
            padding:8px;
            border:1px solid #999;
            background:#fff;
          ">
              <h3>GPT Answer:</h3>
              <div id="answer-content" style="white-space:pre-wrap;"></div>
          </div>

          <div style="margin-top:10px;">
              <button id="ask-ai-btn" class="btn-secondary">
                  ${langText[config.language].askAi}
              </button>
          </div>

      </div>
    `;
    document.body.appendChild(panel);

    // 常用 UI
    const UI = {
        panel,
        logContainer: panel.querySelector("#log-container"),
        toggleLogBtn: panel.querySelector("#toggle-log-btn"),
        closeButton: panel.querySelector("#close-button"),
        tokenUsageDisplay: panel.querySelector("#token-usage-display"),
        status: panel.querySelector("#status"),
        progressContainer: panel.querySelector("#progress-container"),
        progressBar: panel.querySelector("#progress-bar"),
        fillModeSelect: panel.querySelector("#fill-mode-select"),
        startAnswering: panel.querySelector("#start-answering"),
        rollbackAnswer: panel.querySelector("#rollback-answer"),
        modelSelect: panel.querySelector("#model-select"),
        modelDescription: panel.querySelector("#model-description"),
        customModelGroup: panel.querySelector("#custom-model-group"),
        customModelInput: panel.querySelector("#custom-model-input"),
        apiKeyInput: panel.querySelector("#api-key-input"),
        apiBaseInput: panel.querySelector("#api-base-input"),
        autoSubmitGroup: panel.querySelector("#auto-submit-group"),
        autoSubmitToggle: panel.querySelector("#auto-submit-toggle"),
        languageSelect: panel.querySelector("#language-select"),
        manageModelLink: panel.querySelector("#manage-model-link"),
        refreshModelListBtn: panel.querySelector("#refresh-model-list-btn"),
        rentApiBtn: panel.querySelector("#rent-api-btn"),
        answerDisplay: panel.querySelector("#answer-display"),
        answerContent: panel.querySelector("#answer-content")
    };

    //----------------------------------------------------------------------
    // 5) 样式：背景渐变 & 按钮风格
    //----------------------------------------------------------------------
    GM_addStyle(`
      /* 整体背景颜色：淡蓝到淡绿渐变 */
      body {
        background: linear-gradient(to bottom, #c2e9fb, #a1c4fd) no-repeat;
      }
      #gpt4o-panel {
        position: fixed;
        top: 20px;
        right: 20px;
        width: 400px;
        background: rgba(255,255,255,0.9);
        border-radius: 6px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.3);
        z-index: 999999;
        font-family: Arial, sans-serif;
      }
      .header-bar {
        background: #f8f8f8;
        border-bottom: 1px solid #ccc;
        padding: 8px;
        display: flex;
        justify-content: flex-end;
        gap: 8px;
      }
      .content-area {
        padding: 15px;
      }
      .row {
        margin-top: 10px;
        display: flex;
        flex-direction: column;
        gap: 5px;
      }
      label {
        font-weight: bold;
      }
      input, select, button {
        font-size: 14px;
        padding: 6px;
        box-sizing: border-box;
      }
      .btn-strong {
        display:block;
        width:100%;
        background-color: #f0ad4e;
        color: #fff;
        border: none;
        border-radius: 4px;
        margin-top:10px;
        padding:8px;
        text-align:center;
        font-weight:bold;
      }
      .btn-strong:hover {
        background-color: #ec971f;
      }
      .btn-normal {
        display:block;
        width:100%;
        background-color: #ddd;
        color: #333;
        border: none;
        border-radius: 4px;
        margin-top:10px;
        padding:8px;
      }
      .btn-normal:hover {
        background-color: #ccc;
      }
      .btn-secondary {
        width:100%;
        background-color: #bbb;
        color: #333;
        border: none;
        border-radius:4px;
        padding:8px;
      }
      .btn-secondary:hover {
        background-color:#aaa;
      }
      .link-button {
        padding:6px;
        background:#2f8ee0;
        color:#fff;
        border-radius:4px;
        text-decoration:none;
      }
      .link-button:hover {
        opacity:0.8;
      }
    `);

    //----------------------------------------------------------------------
    // 6) 日志
    //----------------------------------------------------------------------
    function logMessage(msg) {
        const time = new Date().toLocaleString();
        const div = document.createElement("div");
        div.textContent = `[${time}] ${msg}`;
        UI.logContainer.appendChild(div);
        console.log(`[Log] ${msg}`);
    }
    function logDump(label, val) {
        let str = `[DUMP] ${label}: `;
        if (typeof val === "object") {
            try {
                str += JSON.stringify(val);
            } catch(e){
                str += String(val);
            }
        } else {
            str += String(val);
        }
        logMessage(str);
    }

    //----------------------------------------------------------------------
    // 7) 语言
    //----------------------------------------------------------------------
    function updateLanguageText() {
        UI.toggleLogBtn.textContent = (UI.logContainer.style.display==="none")
            ? langText[config.language].showLog
            : langText[config.language].hideLog;
        UI.closeButton.textContent = langText[config.language].closeButton;
        UI.tokenUsageDisplay.textContent = langText[config.language].tokenUsage + config.totalTokenUsage;

        panel.querySelector("#fill-mode-select").options[0].text = langText[config.language].fillMode_auto;
        panel.querySelector("#fill-mode-select").options[1].text = langText[config.language].fillMode_display;
        panel.querySelector("#start-answering").textContent = langText[config.language].startAnswering;
        panel.querySelector("#rollback-answer").textContent = langText[config.language].rollback;

        panel.querySelector("#model-description").textContent = modelDescriptions[config.selectedModel] || "???";
        panel.querySelector("#label-custom-model").textContent
            = langText[config.language].modelSelection + " (Custom):";

        UI.apiKeyInput.placeholder = langText[config.language].apiKeyPlaceholder;
        panel.querySelector("#save-api-key").textContent = langText[config.language].saveApiKey;
        panel.querySelector("#check-api-key-btn").textContent = langText[config.language].checkApiKey;

        UI.apiBaseInput.placeholder = langText[config.language].apiBasePlaceholder;
        panel.querySelector("#save-api-base").textContent = langText[config.language].saveApiBase;
        panel.querySelector("#manage-model-link").textContent = langText[config.language].manageModelLink;
        UI.rentApiBtn.textContent = langText[config.language].rentApiKey;
        UI.refreshModelListBtn.textContent = langText[config.language].refreshModelList;
        panel.querySelector("#progress-text").textContent = langText[config.language].progressText;
        UI.status.textContent = langText[config.language].statusWaiting;
        panel.querySelector("#ask-ai-btn").textContent = langText[config.language].askAi;
    }

    //----------------------------------------------------------------------
    // 8) 初始化下拉框
    //----------------------------------------------------------------------
    function rebuildModelSelect() {
        UI.modelSelect.innerHTML = "";
        // group: Predefined
        const ogPre = document.createElement("optgroup");
        ogPre.label = "Predefined";
        predefinedModels.forEach(m => {
            const opt = document.createElement("option");
            opt.value = m;
            opt.textContent = m;
            ogPre.appendChild(opt);
        });
        UI.modelSelect.appendChild(ogPre);

        // group: discovered
        const disc = Object.keys(modelConfigs).filter(k=>modelConfigs[k].discovered);
        if (disc.length>0) {
            const ogDisc = document.createElement("optgroup");
            ogDisc.label = "Discovered";
            disc.forEach(m=>{
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

        if (UI.modelSelect.querySelector(`option[value="${config.selectedModel}"]`)) {
            UI.modelSelect.value = config.selectedModel;
        } else {
            UI.modelSelect.value = "custom";
        }
        UI.modelDescription.textContent = modelDescriptions[config.selectedModel]||"???";
        UI.customModelGroup.style.display = (config.selectedModel === "custom") ? "block" : "none";
    }

    //----------------------------------------------------------------------
    // 9) UI事件绑定
    //----------------------------------------------------------------------
    UI.closeButton.addEventListener("click", ()=>{
        panel.style.display = "none";
        logMessage("Panel closed.");
    });
    UI.toggleLogBtn.addEventListener("click", ()=>{
        if (UI.logContainer.style.display==="none") {
            UI.logContainer.style.display="block";
            UI.toggleLogBtn.textContent = langText[config.language].hideLog;
        } else {
            UI.logContainer.style.display="none";
            UI.toggleLogBtn.textContent = langText[config.language].showLog;
        }
    });
    UI.languageSelect.addEventListener("change", ()=>{
        config.language = UI.languageSelect.value;
        localStorage.setItem("gpt4o-language", config.language);
        updateLanguageText();
    });
    UI.fillModeSelect.addEventListener("change", ()=>{
        config.fillMode = UI.fillModeSelect.value;
        if (config.fillMode==="displayOnly") {
            UI.answerDisplay.style.display="block";
            UI.answerContent.textContent="";
            UI.autoSubmitGroup.style.display="none";
        } else {
            alert("Warning: Auto Fill mode is unstable. Use with caution.");
            UI.answerDisplay.style.display="none";
            UI.autoSubmitGroup.style.display="block";
        }
    });
    UI.startAnswering.addEventListener("click", ()=>{
        answerQuestion();
    });
    UI.rollbackAnswer.addEventListener("click", ()=>{
        if (config.lastTargetState) {
            let tg = getTargetDiv();
            if (tg) {
                tg.innerHTML = config.lastTargetState;
                logMessage("Rolled back content.");
            }
        } else {
            logMessage("No previous state to rollback to.");
        }
    });
    UI.modelSelect.addEventListener("change", ()=>{
        config.selectedModel = UI.modelSelect.value;
        if (!modelConfigs[config.selectedModel]) {
            modelConfigs[config.selectedModel]={
                apiKey:"",
                apiBase:"https://api.openai.com/v1/chat/completions",
                manageUrl:"",
                discovered:false,
                modelList:[]
            };
        }
        UI.customModelGroup.style.display = (config.selectedModel==="custom")?"block":"none";
        UI.modelDescription.textContent = modelDescriptions[config.selectedModel]||"???";
        UI.apiKeyInput.value = modelConfigs[config.selectedModel].apiKey;
        UI.apiBaseInput.value = modelConfigs[config.selectedModel].apiBase;
        updateManageUrl();
    });
    UI.customModelInput.addEventListener("change", ()=>{
        const name=UI.customModelInput.value.trim();
        if (!name) return;
        config.selectedModel=name;
        if (!modelConfigs[name]) {
            modelConfigs[name]={
                apiKey:"",
                apiBase:"https://api.openai.com/v1/chat/completions",
                manageUrl:"",
                discovered:false,
                modelList:[]
            };
        }
        rebuildModelSelect();
        UI.modelSelect.value="custom";
        UI.apiKeyInput.value = modelConfigs[name].apiKey;
        UI.apiBaseInput.value = modelConfigs[name].apiBase;
        updateManageUrl();
    });
    panel.querySelector("#save-api-key").addEventListener("click", ()=>{
        const newKey=UI.apiKeyInput.value.trim();
        modelConfigs[config.selectedModel].apiKey=newKey;
        saveModelConfigs();
        logMessage("API Key saved.");
    });
    panel.querySelector("#check-api-key-btn").addEventListener("click", ()=>{
        UI.status.textContent = langText[config.language].checkingApiKey;
        testApiKey();
    });
    panel.querySelector("#save-api-base").addEventListener("click", ()=>{
        const newBase=UI.apiBaseInput.value.trim();
        modelConfigs[config.selectedModel].apiBase=newBase;
        saveModelConfigs();
        logMessage("API Base saved.");
    });
    UI.autoSubmitToggle.addEventListener("change", ()=>{
        config.autoSubmitEnabled = UI.autoSubmitToggle.checked;
        logDump("autoSubmitEnabled", config.autoSubmitEnabled);
    });
    UI.refreshModelListBtn.addEventListener("click", ()=>{
        refreshModelList();
    });
    UI.rentApiBtn.addEventListener("click", ()=>{
        showRentApiPopup();
    });
    panel.querySelector("#ask-ai-btn").addEventListener("click", ()=>{
        openAiHelperDialog();
    });

    //----------------------------------------------------------------------
    // 10) manageUrl / rent key
    //----------------------------------------------------------------------
    function updateManageUrl() {
        let lower = config.selectedModel.toLowerCase();
        let link="#";
        if (lower.includes("deepseek")) {
            link="https://platform.deepseek.com/api_keys";
        } else {
            // default assume openai
            link="https://platform.openai.com/api-keys";
        }
        modelConfigs[config.selectedModel].manageUrl=link;
        UI.manageModelLink.href=link;
        saveModelConfigs();
    }
    function showRentApiPopup() {
        const overlay=document.createElement("div");
        overlay.style.position="fixed";
        overlay.style.top="0";
        overlay.style.left="0";
        overlay.style.width="100%";
        overlay.style.height="100%";
        overlay.style.backgroundColor="rgba(0,0,0,0.5)";
        overlay.style.zIndex="9999999";
        const box=document.createElement("div");
        box.style.position="absolute";
        box.style.top="50%";
        box.style.left="50%";
        box.style.transform="translate(-50%,-50%)";
        box.style.backgroundColor="#fff";
        box.style.padding="20px";
        box.style.borderRadius="6px";
        box.style.width="320px";
        box.innerHTML=`
          <h3>Rent an API Key</h3>
          <p>Contact me at:</p>
          <ul>
            <li>felixliujy@Gmail.com</li>
            <li>admin@obanarchy.org</li>
          </ul>
          <button id="close-rent-popup">${langText[config.language].closeButton}</button>
        `;
        overlay.appendChild(box);
        document.body.appendChild(overlay);
        box.querySelector("#close-rent-popup").addEventListener("click",()=>{
            document.body.removeChild(overlay);
        });
    }

    //----------------------------------------------------------------------
    // 11) testApiKey
    //----------------------------------------------------------------------
    function testApiKey() {
        const mc = modelConfigs[config.selectedModel];
        if (!mc) return;
        const testPayload = {
            model: config.selectedModel,
            stream: false,
            messages:[
                {role:"system", content:"You are a quick test assistant."},
                {role:"user", content:"Please ONLY respond with: test success"}
            ]
        };
        GM_xmlhttpRequest({
            method:"POST",
            url: mc.apiBase,
            headers:{
                "Content-Type":"application/json",
                "Authorization":`Bearer ${mc.apiKey}`
            },
            data: JSON.stringify(testPayload),
            onload:(resp)=>{
                UI.status.textContent = langText[config.language].statusWaiting;
                try {
                    logDump("testApiKey response", resp.responseText);
                    const data=JSON.parse(resp.responseText);
                    const ans=data.choices[0].message.content.toLowerCase();
                    if (ans.includes("test success")) {
                        alert(langText[config.language].apiKeyValid);
                    } else {
                        alert(langText[config.language].apiKeyInvalid);
                    }
                } catch(e) {
                    alert(`Error parsing test result: ${e}`);
                }
            },
            onerror:(err)=>{
                UI.status.textContent=langText[config.language].statusWaiting;
                alert("Key test failed: "+JSON.stringify(err));
            }
        });
    }

    //----------------------------------------------------------------------
    // 12) 刷新模型列表
    //----------------------------------------------------------------------
    function refreshModelList() {
        const mc = modelConfigs[config.selectedModel];
        if (!mc) return;
        const url = mc.apiBase.replace("/chat/completions","/models");
        logMessage("Fetching model list from: "+url);
        GM_xmlhttpRequest({
            method:"GET",
            url,
            headers:{
                "Authorization":`Bearer ${mc.apiKey}`
            },
            onload:(resp)=>{
                try{
                    logDump("refreshModelList", resp.responseText);
                    const data=JSON.parse(resp.responseText);
                    if (Array.isArray(data.data)) {
                        const newList=data.data.map(x=>x.id);
                        mc.modelList=newList;
                        newList.forEach(n=>{
                            if(!modelConfigs[n]){
                                modelConfigs[n]={
                                    apiKey:mc.apiKey,
                                    apiBase:mc.apiBase,
                                    manageUrl:"",
                                    discovered:true,
                                    modelList:[]
                                };
                            }
                        });
                        saveModelConfigs();
                        rebuildModelSelect();
                        alert("Refreshed. Found: "+newList.join(", "));
                    }
                }catch(e){
                    alert("Error parsing model list: "+e);
                }
            },
            onerror:(err)=>{
                alert("Failed refreshing model list: "+JSON.stringify(err));
            }
        });
    }

    //----------------------------------------------------------------------
    // 13) AI Helper - 使用流模式
    //----------------------------------------------------------------------
    function openAiHelperDialog() {
        const overlay=document.createElement("div");
        overlay.style.position="fixed";
        overlay.style.top="0";
        overlay.style.left="0";
        overlay.style.width="100%";
        overlay.style.height="100%";
        overlay.style.backgroundColor="rgba(0,0,0,0.5)";
        overlay.style.zIndex="99999999";

        const box=document.createElement("div");
        box.style.position="absolute";
        box.style.top="50%";
        box.style.left="50%";
        box.style.transform="translate(-50%,-50%)";
        box.style.backgroundColor="#fff";
        box.style.padding="20px";
        box.style.borderRadius="6px";
        box.style.width="500px";
        box.style.maxHeight="80%";
        box.style.overflowY="auto";
        box.innerHTML=`
          <h3>${langText[config.language].askAiTitle}</h3>
          <textarea id="ai-question" style="width:100%;height:80px;"></textarea>
          <button id="ai-ask-btn" style="margin-top:8px;">Ask AI</button>
          <button id="ai-close-btn" style="margin-top:8px;">${langText[config.language].closeButton}</button>
          <pre id="ai-answer" style="
            margin-top:10px;
            background:#f7f7f7;
            padding:10px;
            border-radius:4px;
            white-space:pre-wrap;
            max-height:300px;overflow:auto;
          "></pre>
        `;
        overlay.appendChild(box);
        document.body.appendChild(overlay);

        const btnClose=box.querySelector("#ai-close-btn");
        btnClose.addEventListener("click",()=>{
            document.body.removeChild(overlay);
        });
        const btnAsk=box.querySelector("#ai-ask-btn");
        const txt=box.querySelector("#ai-question");
        const ans=box.querySelector("#ai-answer");
        btnAsk.addEventListener("click",()=>{
            let question=txt.value.trim();
            if(!question) return;
            ans.textContent="(streaming)...";
            askAiHelperStreaming(question, (partial)=>{
                ans.textContent=partial; // 实时刷新
            }, (err)=>{
                ans.textContent="[ERROR] "+err;
            });
        });
    }

    // 采用 "stream": true 并在 onprogress 中解析 chunk
    function askAiHelperStreaming(userQuestion, onPartial, onError) {
        const mc=modelConfigs[config.selectedModel]||{};
        // system prompt 让 GPT 知道脚本功能
        const payload={
            model: config.selectedModel,
            stream: true,
            messages:[
                {role:"system", content:scriptDescription},
                {role:"user", content:userQuestion}
            ]
        };
        let partialContent="";
        GM_xmlhttpRequest({
            method:"POST",
            url: mc.apiBase,
            headers:{
                "Content-Type":"application/json",
                "Authorization":`Bearer ${mc.apiKey}`
            },
            data:JSON.stringify(payload),
            responseType:"text", // we want raw text stream
            onprogress: function(e) {
                // 可能 chunk 到 e.responseText
                const chunk=e.currentTarget.responseText;
                // chunk 里会包含 "data: { ... }\n\ndata: { ... }\n\ndata: [DONE]"
                // 先把已有数据按行分割
                let lines=chunk.split("\n");
                for(const line of lines) {
                    if(!line.startsWith("data: ")) continue;
                    const jsonStr=line.slice(6).trim();
                    if(jsonStr==="[DONE]"){
                        // 流结束
                        return;
                    }
                    try{
                        const data=JSON.parse(jsonStr);
                        if(data.choices && data.choices[0].delta){
                            const delta=data.choices[0].delta.content||"";
                            partialContent+=delta;
                            onPartial(partialContent);
                        }
                    }catch(err){
                        // 忽略解析失败
                    }
                }
            },
            onload: function(e) {
                // 结束
                onPartial(partialContent);
            },
            onerror: function(err) {
                onError(JSON.stringify(err));
            }
        });
    }

    //----------------------------------------------------------------------
    // 14) AnswerQuestion（不流式，用于获取 usage 并计入 totalTokenUsage）
    //----------------------------------------------------------------------
    function getTargetDiv() {
        let div=document.evaluate(
            '/html/body/main/div/article/section/section/div/div[1]',
            document,null,XPathResult.FIRST_ORDERED_NODE_TYPE,null
        ).singleNodeValue;
        if(!div){
            div=document.querySelector('main div.article, main>div, article');
        }
        return div;
    }
    function captureMathContent(el) {
        let mathEls = el.querySelectorAll('script[type="math/tex"], .MathJax, .mjx-chtml');
        if(mathEls.length>0){
            let latex="";
            mathEls.forEach(m=>latex+=m.textContent+"\n");
            return latex;
        }
        return null;
    }
    function captureCanvasImage(el) {
        let can=el.querySelector('canvas');
        if(can){
            const c2=document.createElement('canvas');
            c2.width=can.width; c2.height=can.height;
            c2.getContext("2d").drawImage(can,0,0);
            return c2.toDataURL("image/png").split(",")[1];
        }
        return null;
    }
    function monitorDOMChanges(div) {
        if(!div) return;
        const obs=new MutationObserver((mutations)=>{
            for(const m of mutations){
                logDump("DOM changed", {
                    added:m.addedNodes.length,
                    removed:m.removedNodes.length
                });
            }
        });
        obs.observe(div,{childList:true,subtree:true});
        logMessage("Monitoring DOM changes on target element.");
    }
    function answerQuestion() {
        logMessage("AnswerQuestion triggered.");
        const targetDiv=getTargetDiv();
        if(!targetDiv){
            logMessage("No question region found. Aborting.");
            return;
        }
        config.lastTargetState=targetDiv.innerHTML;
        monitorDOMChanges(targetDiv);

        const htmlContent=targetDiv.outerHTML;
        const latex=captureMathContent(targetDiv);
        const canvasData= latex? null : captureCanvasImage(targetDiv);

        let systemPrompt="", userContent="";
        if(config.fillMode==="displayOnly"){
            systemPrompt="You are a math solver for IXL. Return the final answer in plain text (only unicode math, no LaTeX/markdown).";
            userContent=`HTML:\n${htmlContent}\n`;
            if(latex) userContent+=`Math:\n${latex}\n`;
            if(canvasData) userContent+="Canvas base64 attached. (pretend interpret it)";
        } else {
            systemPrompt="You are a math solver for IXL. Return only one JavaScript code block with triple backticks ```javascript ...``` that fills the answers. No text outside code block. Use only unicode, no LaTeX.";
            userContent=`HTML:\n${htmlContent}\n`;
            if(latex) userContent+=`Math:\n${latex}\n`;
            if(canvasData) userContent+="Canvas base64 attached. (pretend interpret it)";
        }

        const payload={
            model: config.selectedModel,
            messages:[
                {role:"system", content:systemPrompt},
                {role:"user", content:userContent}
            ]
        };
        // step
        UI.status.textContent=langText[config.language].waitingGpt;
        startFakeProgress();

        const mc=modelConfigs[config.selectedModel]||{};
        GM_xmlhttpRequest({
            method:"POST",
            url: mc.apiBase,
            headers:{
                "Content-Type":"application/json",
                "Authorization":`Bearer ${mc.apiKey}`
            },
            data: JSON.stringify(payload),
            onload:(resp)=>{
                finishProgress();
                try{
                    const data=JSON.parse(resp.responseText);
                    logDump("AnswerQuestion response", data);
                    if(data.usage && data.usage.total_tokens){
                        config.totalTokenUsage += data.usage.total_tokens;
                        UI.tokenUsageDisplay.textContent = langText[config.language].tokenUsage + config.totalTokenUsage;
                    }
                    const content=data.choices[0].message.content.trim();
                    if(config.fillMode==="displayOnly"){
                        UI.answerDisplay.style.display="block";
                        UI.answerContent.textContent=content;
                    } else {
                        // parse code
                        const code=extractCode(content);
                        if(!code){
                            UI.status.textContent="Error: no code block found in GPT answer.";
                            logMessage("No code block found.");
                            return;
                        }
                        runJsCode(code);
                        if(config.autoSubmitEnabled){
                            autoSubmit();
                        }
                    }
                    UI.status.textContent=langText[config.language].submissionComplete;
                }catch(e){
                    logDump("AnswerQuestion parse error", e);
                    UI.status.textContent="Error parsing GPT answer. Check logs.";
                }
            },
            onerror:(err)=>{
                finishProgress();
                UI.status.textContent=langText[config.language].requestError+JSON.stringify(err);
                logDump("AnswerQuestion request error", err);
            }
        });
    }

    function extractCode(txt){
        const re=/```javascript\s+([\s\S]*?)\s+```/i;
        let m=txt.match(re);
        if(m && m[1]) return m[1].trim();
        return null;
    }
    function runJsCode(code){
        try{
            const sandbox={};
            (new Function("sandbox", "with(sandbox){"+code+"}"))(sandbox);
        }catch(e){
            logDump("runJsCode error", e);
        }
    }
    function autoSubmit(){
        let btn=document.evaluate(
            '/html/body/main/div/article/section/section/div/div[1]/section/div/section/div/button',
            document,null,XPathResult.FIRST_ORDERED_NODE_TYPE,null
        ).singleNodeValue;
        if(!btn){
            btn=document.querySelector('button.submit, button[class*="submit"]');
        }
        if(btn){
            logMessage("Auto-submitting answer...");
            btn.click();
        } else {
            logMessage("No submit button found.");
        }
    }

    //----------------------------------------------------------------------
    // 15) 进度条
    //----------------------------------------------------------------------
    let progressTimer=null;
    function startFakeProgress(){
        UI.progressContainer.style.display="block";
        UI.progressBar.value=0;
        progressTimer=setInterval(()=>{
            if(UI.progressBar.value<90){
                UI.progressBar.value+=2;
            } else {
                clearInterval(progressTimer);
            }
        },200);
    }
    function finishProgress(){
        if(progressTimer){
            clearInterval(progressTimer);
        }
        UI.progressBar.value=100;
        setTimeout(()=>{
            UI.progressContainer.style.display="none";
            UI.progressBar.value=0;
        },500);
    }

    //----------------------------------------------------------------------
    // 16) init
    //----------------------------------------------------------------------
    function initPanel(){
        // fill from config
        rebuildModelSelect();
        const mc=modelConfigs[config.selectedModel];
        UI.apiKeyInput.value=mc.apiKey||"";
        UI.apiBaseInput.value=mc.apiBase||"https://api.openai.com/v1/chat/completions";
        updateManageUrl();
        UI.fillModeSelect.value=config.fillMode;
        if(config.fillMode==="displayOnly"){
            UI.answerDisplay.style.display="block";
            UI.answerContent.textContent="";
            UI.autoSubmitGroup.style.display="none";
        } else {
            UI.answerDisplay.style.display="none";
            UI.autoSubmitGroup.style.display="block";
        }
        updateLanguageText();
        logMessage("Script loaded with gradient UI & streaming AI helper. If 'AnswerQuestion' fails, check logs for details.");
    }
    initPanel();
})();
