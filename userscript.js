// ==UserScript==
// @name         IXL Auto Answer (Compact Layout, <answer> Tag, Non-Stream Helper)
// @namespace    http://tampermonkey.net/
// @version      15.0
// @license      GPL-3.0
// @description  Default display mode, final answer in <answer>...</answer>, full features, compact layout, non-stream AI helper
// @match        https://*.ixl.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// ==/UserScript==

(function() {
    'use strict';

    //----------------------------------------------------------------------
    // 1) Script Config & Explanation
    //----------------------------------------------------------------------
    // modelConfigs: 记录每个模型的 key/base
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

    // 脚本全局配置
    const config = {
        selectedModel: "gpt-4o",
        language: localStorage.getItem("gpt4o-language") || "en",
        fillMode: "displayOnly",        // 默认仅显示答案
        autoSubmitEnabled: false,
        lastTargetState: null,
        totalTokensUsed: 0              // 仅“回答问题”累加
    };

    function saveModelConfigs() {
        localStorage.setItem("gpt4o-modelConfigs", JSON.stringify(modelConfigs));
    }

    // 用于 AI 助手的 system prompt
    const scriptDescription = `
You are an assistant for a Tampermonkey script that solves IXL math. 
Key points:
1) GPT can output steps, but final answer must be wrapped in <answer>...</answer>.
2) The script will parse that <answer> to highlight it.
3) We have "display only" and "auto fill" modes. 
4) A tokens counter for "AnswerQuestion" only. 
Please provide the solution or help as needed.
`;

    //----------------------------------------------------------------------
    // 2) 多语言文本
    //----------------------------------------------------------------------
    const langText = {
        en: {
            fillModeLabel: "Mode",
            fillMode_auto: "Auto Fill (unstable)",
            fillMode_display: "Display Only (default)",
            startAnswering: "Start Answering",
            rollback: "Rollback",
            advancedConfig: "Advanced Config",
            language: "Language",
            modelSelection: "Model",
            modelDescription: "Model Description",
            setApiKey: "API Key",
            saveApiKey: "Save",
            apiKeyPlaceholder: "Enter your API key",
            setApiBase: "API Base",
            saveApiBase: "Save",
            apiBasePlaceholder: "Enter your API base URL",
            statusWaiting: "Status: Idle",
            analyzingHtml: "Analyzing HTML...",
            extractingData: "Extracting question data...",
            constructingApi: "Constructing API request...",
            waitingGpt: "Waiting for GPT response...",
            parsingResponse: "Parsing GPT response...",
            executingCode: "Executing code...",
            submissionComplete: "Submission complete.",
            requestError: "Request error: ",
            showLog: "Show Logs",
            hideLog: "Hide Logs",
            customModelPlaceholder: "Custom model name",
            checkApiKey: "Test Key",
            checkingApiKey: "Testing Key...",
            apiKeyValid: "API key seems valid.",
            apiKeyInvalid: "API key invalid (no 'test success').",
            progressText: "Processing...",
            tokenUsage: "Tokens: ",
            closeButton: "Close",
            manageModelLink: "Get API Key",
            refreshModelList: "Refresh Models",
            modelListLabel: "Fetched Models",
            askAi: "Ask AI",
            askAiTitle: "AI Helper",
            rentApiKey: "Rent Key"
        },
        zh: {
            fillModeLabel: "模式",
            fillMode_auto: "自动填写（不稳定）",
            fillMode_display: "仅显示（默认）",
            startAnswering: "开始答题",
            rollback: "撤回",
            advancedConfig: "高级配置",
            language: "语言",
            modelSelection: "模型",
            modelDescription: "模型介绍",
            setApiKey: "API 密钥",
            saveApiKey: "保存",
            apiKeyPlaceholder: "输入您的 API 密钥",
            setApiBase: "API 基础地址",
            saveApiBase: "保存",
            apiBasePlaceholder: "输入您的 API 基础地址",
            statusWaiting: "状态：空闲",
            analyzingHtml: "分析HTML...",
            extractingData: "提取问题数据...",
            constructingApi: "构造API请求...",
            waitingGpt: "等待GPT响应...",
            parsingResponse: "解析GPT响应...",
            executingCode: "执行代码...",
            submissionComplete: "完成提交。",
            requestError: "请求错误：",
            showLog: "查看日志",
            hideLog: "隐藏日志",
            customModelPlaceholder: "自定义模型名称",
            checkApiKey: "测试密钥",
            checkingApiKey: "正在测试...",
            apiKeyValid: "API密钥有效。",
            apiKeyInvalid: "API密钥无效（未见'test success'）。",
            progressText: "处理中...",
            tokenUsage: "用量: ",
            closeButton: "关闭",
            manageModelLink: "获取API Key",
            refreshModelList: "刷新模型列表",
            modelListLabel: "获取的模型",
            askAi: "问AI",
            askAiTitle: "AI助手",
            rentApiKey: "租用Key"
        }
    };

    //----------------------------------------------------------------------
    // 3) 模型介绍
    //----------------------------------------------------------------------
    const modelDescriptions = {
        "gpt-4o": "Solves images, cost-effective.",
        "gpt-4o-mini": "Text-only, cheap.",
        "o1": "Best image solver, slow & pricey.",
        "o3-mini": "Text-only, fast, cheaper.",
        "deepseek-reasoner": "No images, cheaper than o1.",
        "deepseek-chat": "No images, cheapest, similar speed to 4o.",
        "chatgpt-4o-least": "Unstable RLHF version.",
        "custom": "User-defined."
    };

    //----------------------------------------------------------------------
    // 4) 布局：更加紧凑
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
        <h3 style="margin:6px 0;">IXL Auto Answer</h3>

        <div class="row">
          <label>${langText[config.language].fillModeLabel}:</label>
          <select id="fill-mode-select">
            <option value="autoFill">${langText[config.language].fillMode_auto}</option>
            <option value="displayOnly">${langText[config.language].fillMode_display}</option>
          </select>
        </div>

        <div style="display:flex; gap:6px; margin-top:6px;">
          <button id="start-answering" class="btn-strong" style="flex:1;">${langText[config.language].startAnswering}</button>
          <button id="rollback-answer" class="btn-normal" style="flex:1;">${langText[config.language].rollback}</button>
        </div>

        <!-- 答案显示 -->
        <div id="answer-display" style="display:none; margin-top:6px; background:#fff; border:1px solid #ccc; padding:6px;">
          <h4>Final Answer:</h4>
          <div id="answer-content" style="margin-top:4px;"></div>
          <hr/>
          <div id="solution-steps" style="font-size:13px; color:#666;"></div>
        </div>

        <!-- AI助手按钮 -->
        <button id="ask-ai-btn" class="btn-secondary" style="width:100%; margin-top:6px;">
          ${langText[config.language].askAi}
        </button>

        <!-- 进度条 -->
        <div id="progress-container" style="margin-top:6px; display:none;">
          <progress id="progress-bar" max="100" value="0" style="width:100%;"></progress>
          <span id="progress-text">${langText[config.language].progressText}</span>
        </div>

        <!-- 状态显示 -->
        <p id="status" style="margin-top:6px;font-weight:bold;">${langText[config.language].statusWaiting}</p>

        <!-- 日志 -->
        <div id="log-container" style="display:none; max-height:120px; overflow-y:auto; background:#fff; border:1px solid #999; margin-top:6px; padding:4px; font-family:monospace;"></div>

        <!-- 折叠的高级配置 -->
        <button id="toggle-advanced-btn" class="btn-normal" style="margin-top:6px; width:100%;">
          ${langText[config.language].advancedConfig}
        </button>
        <div id="advanced-panel" style="display:none; background:#f9f9f9; border:1px solid #ccc; padding:6px; margin-top:4px;">

          <div class="row">
            <label>${langText[config.language].modelSelection}:</label>
            <select id="model-select"></select>
            <p id="model-description" style="font-size:12px; color:#666; margin:4px 0;"></p>
          </div>

          <div class="row" id="custom-model-group" style="display:none;">
            <label>${langText[config.language].modelSelection} (Custom):</label>
            <input type="text" id="custom-model-input" placeholder="${langText[config.language].customModelPlaceholder}">
          </div>

          <div class="row">
            <div style="display:flex;gap:4px;">
              <label style="flex:1;">${langText[config.language].setApiKey}:</label>
              <input type="password" id="api-key-input" placeholder="${langText[config.language].apiKeyPlaceholder}" style="flex:2;">
              <button id="save-api-key" style="flex:1;">${langText[config.language].saveApiKey}</button>
              <button id="check-api-key-btn" style="flex:1;">${langText[config.language].checkApiKey}</button>
            </div>
          </div>

          <div class="row">
            <div style="display:flex;gap:4px;">
              <label style="flex:1;">${langText[config.language].setApiBase}:</label>
              <input type="text" id="api-base-input" placeholder="${langText[config.language].apiBasePlaceholder}" style="flex:2;">
              <button id="save-api-base" style="flex:1;">${langText[config.language].saveApiBase}</button>
            </div>
          </div>

          <div class="row" style="display:flex;gap:4px;">
            <label>${langText[config.language].manageModelLink}:</label>
            <a id="manage-model-link" href="#" target="_blank" class="link-button">Link</a>
            <button id="rent-api-btn" style="flex:1;">${langText[config.language].rentApiKey}</button>
            <button id="refresh-model-list-btn" style="flex:1;">${langText[config.language].refreshModelList}</button>
          </div>

          <div class="row" style="display:flex; gap:4px;">
            <label style="flex:1;">Auto Submit:</label>
            <input type="checkbox" id="auto-submit-toggle" style="flex:0;">
          </div>

          <div class="row" style="display:flex; gap:4px;">
            <label style="flex:1;">${langText[config.language].language}:</label>
            <select id="language-select" style="flex:1;">
              <option value="en" ${config.language==="en"?"selected":""}>English</option>
              <option value="zh" ${config.language==="zh"?"selected":""}>中文</option>
            </select>
          </div>

        </div>
      </div>
    `;
    document.body.appendChild(panel);

    // 缓存主要UI元素
    const UI = {
        panel,
        logContainer: panel.querySelector("#log-container"),
        toggleLogBtn: panel.querySelector("#toggle-log-btn"),
        closeButton: panel.querySelector("#close-button"),
        tokenUsageDisplay: panel.querySelector("#token-usage-display"),
        status: panel.querySelector("#status"),
        progressContainer: panel.querySelector("#progress-container"),
        progressBar: panel.querySelector("#progress-bar"),
        progressText: panel.querySelector("#progress-text"),
        fillModeSelect: panel.querySelector("#fill-mode-select"),
        startAnswering: panel.querySelector("#start-answering"),
        rollbackAnswer: panel.querySelector("#rollback-answer"),
        answerDisplay: panel.querySelector("#answer-display"),
        answerContent: panel.querySelector("#answer-content"),
        solutionSteps: panel.querySelector("#solution-steps"),
        modelSelect: panel.querySelector("#model-select"),
        modelDescription: panel.querySelector("#model-description"),
        customModelGroup: panel.querySelector("#custom-model-group"),
        customModelInput: panel.querySelector("#custom-model-input"),
        apiKeyInput: panel.querySelector("#api-key-input"),
        apiBaseInput: panel.querySelector("#api-base-input"),
        autoSubmitToggle: panel.querySelector("#auto-submit-toggle"),
        languageSelect: panel.querySelector("#language-select"),
        manageModelLink: panel.querySelector("#manage-model-link"),
        refreshModelListBtn: panel.querySelector("#refresh-model-list-btn"),
        rentApiBtn: panel.querySelector("#rent-api-btn"),
        toggleAdvancedBtn: panel.querySelector("#toggle-advanced-btn")
    };

    //----------------------------------------------------------------------
    // 5) CSS 样式（背景渐变 & 面板更小）
    //----------------------------------------------------------------------
    GM_addStyle(`
      body {
        background: linear-gradient(to bottom, #cfd9df 0%, #e2ebf0 100%);
        font-family: "Segoe UI", Arial, sans-serif;
      }
      #gpt4o-panel {
        position: fixed;
        top: 20px;
        right: 20px;
        width: 350px;
        background: rgba(255,255,255,0.96);
        border-radius: 6px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        z-index: 999999;
        font-size: 13px;
      }
      .header-bar {
        background: #f7f7f7;
        border-bottom: 1px solid #ccc;
        padding: 6px;
        display: flex;
        justify-content: flex-end;
        gap: 4px;
      }
      .content-area {
        padding: 8px;
      }
      .row {
        margin-top: 4px;
        display: flex;
        flex-direction: column;
        gap: 3px;
      }
      label {
        font-weight:bold;
        font-size: 13px;
      }
      input, select, button {
        font-size:13px;
        padding:4px;
        box-sizing:border-box;
      }
      #log-container > div {
        margin-bottom:2px;
      }
      .btn-strong {
        background-color:#f0ad4e;
        color:#fff;
        border:none;
        border-radius:4px;
        font-weight:bold;
      }
      .btn-strong:hover {
        background-color:#ec971f;
      }
      .btn-normal {
        background-color:#ddd;
        border:none;
        border-radius:4px;
        color:#333;
      }
      .btn-normal:hover {
        background-color:#ccc;
      }
      .btn-secondary {
        width:100%;
        background-color:#bbb;
        color:#333;
        border:none;
        border-radius:4px;
      }
      .btn-secondary:hover {
        background-color:#aaa;
      }
      .link-button {
        background:#2f8ee0;
        color:#fff;
        border-radius:4px;
        text-decoration:none;
        padding:4px;
        text-align:center;
      }
      .link-button:hover {
        opacity:0.8;
      }
    `);

    //----------------------------------------------------------------------
    // 6) 日志工具
    //----------------------------------------------------------------------
    function logMessage(msg) {
        const t = new Date().toLocaleString();
        const div = document.createElement("div");
        div.textContent = `[${t}] ${msg}`;
        UI.logContainer.appendChild(div);
        console.log(`[Log] ${msg}`);
    }
    function logDump(label, value) {
        let out = `[DUMP] ${label}: `;
        if (typeof value === "object") {
            try { out+=JSON.stringify(value); } catch(e){ out+=String(value); }
        } else {
            out+=String(value);
        }
        logMessage(out);
    }

    //----------------------------------------------------------------------
    // 7) 更新语言文本
    //----------------------------------------------------------------------
    function updateLanguageText() {
        UI.toggleLogBtn.textContent = (UI.logContainer.style.display==="none")
            ? langText[config.language].showLog
            : langText[config.language].hideLog;
        UI.closeButton.textContent = langText[config.language].closeButton;
        UI.tokenUsageDisplay.textContent = langText[config.language].tokenUsage + config.totalTokensUsed;
        UI.fillModeSelect.options[0].text = langText[config.language].fillMode_auto;
        UI.fillModeSelect.options[1].text = langText[config.language].fillMode_display;
        UI.startAnswering.textContent = langText[config.language].startAnswering;
        UI.rollbackAnswer.textContent = langText[config.language].rollback;
        UI.status.textContent = langText[config.language].statusWaiting;
        UI.progressText.textContent = langText[config.language].progressText;
        panel.querySelector("#toggle-advanced-btn").textContent = langText[config.language].advancedConfig;
        UI.rentApiBtn.textContent = langText[config.language].rentApiKey;
        UI.refreshModelListBtn.textContent = langText[config.language].refreshModelList;
        UI.manageModelLink.textContent = langText[config.language].manageModelLink;
        panel.querySelector("#ask-ai-btn").textContent = langText[config.language].askAi;
    }

    //----------------------------------------------------------------------
    // 8) 初始构建模型下拉框
    //----------------------------------------------------------------------
    function rebuildModelSelect() {
        UI.modelSelect.innerHTML="";
        const ogPre = document.createElement("optgroup");
        ogPre.label="Predefined";
        predefinedModels.forEach(m=>{
            const opt=document.createElement("option");
            opt.value=m; opt.textContent=m;
            ogPre.appendChild(opt);
        });
        UI.modelSelect.appendChild(ogPre);

        // discovered
        const discoveredKeys = Object.keys(modelConfigs).filter(k=>modelConfigs[k].discovered);
        if (discoveredKeys.length>0) {
            const ogDisc = document.createElement("optgroup");
            ogDisc.label="Discovered";
            discoveredKeys.forEach(m=>{
                const opt=document.createElement("option");
                opt.value=m;
                opt.textContent=m;
                ogDisc.appendChild(opt);
            });
            UI.modelSelect.appendChild(ogDisc);
        }
        // custom
        const optC=document.createElement("option");
        optC.value="custom";
        optC.textContent="custom";
        UI.modelSelect.appendChild(optC);

        if (UI.modelSelect.querySelector(`option[value="${config.selectedModel}"]`)) {
            UI.modelSelect.value=config.selectedModel;
        } else {
            UI.modelSelect.value="custom";
        }
        UI.modelDescription.textContent = modelDescriptions[config.selectedModel]||"User-defined model";
        UI.customModelGroup.style.display=(config.selectedModel==="custom")?"block":"none";
    }

    //----------------------------------------------------------------------
    // 9) UI事件
    //----------------------------------------------------------------------
    // 折叠高级配置
    UI.toggleAdvancedBtn.addEventListener("click",()=>{
        const adv = document.querySelector("#advanced-panel");
        if (adv.style.display==="none") adv.style.display="block";
        else adv.style.display="none";
    });
    // 显示/隐藏日志
    UI.toggleLogBtn.addEventListener("click",()=>{
        if (UI.logContainer.style.display==="none") {
            UI.logContainer.style.display="block";
            UI.toggleLogBtn.textContent=langText[config.language].hideLog;
        } else {
            UI.logContainer.style.display="none";
            UI.toggleLogBtn.textContent=langText[config.language].showLog;
        }
    });
    // 关闭
    UI.closeButton.addEventListener("click",()=>{
        panel.style.display="none";
        logMessage("Panel closed by user.");
    });
    // 语言
    UI.languageSelect.addEventListener("change",()=>{
        config.language=UI.languageSelect.value;
        localStorage.setItem("gpt4o-language", config.language);
        updateLanguageText();
    });
    // fillMode
    UI.fillModeSelect.addEventListener("change",()=>{
        config.fillMode=UI.fillModeSelect.value;
        if (config.fillMode==="displayOnly") {
            UI.answerDisplay.style.display="none"; // 等下发请求再显示
        } else {
            alert("Caution: Auto Fill is unstable!");
            UI.answerDisplay.style.display="none";
        }
    });
    // start answer
    UI.startAnswering.addEventListener("click",()=>{
        answerQuestion();
    });
    // rollback
    UI.rollbackAnswer.addEventListener("click",()=>{
        if (config.lastTargetState) {
            const tgt = getTargetDiv();
            if (tgt) {
                tgt.innerHTML=config.lastTargetState;
                logMessage("Rolled back to previous question state.");
            }
        } else {
            logMessage("No last state to rollback.");
        }
    });
    // model select
    UI.modelSelect.addEventListener("change",()=>{
        config.selectedModel=UI.modelSelect.value;
        if (!modelConfigs[config.selectedModel]) {
            modelConfigs[config.selectedModel]={
                apiKey:"",
                apiBase:"https://api.openai.com/v1/chat/completions",
                discovered:false,
                modelList:[]
            };
        }
        UI.customModelGroup.style.display=(config.selectedModel==="custom")?"block":"none";
        UI.modelDescription.textContent = modelDescriptions[config.selectedModel]||"User-defined model";
        UI.apiKeyInput.value=modelConfigs[config.selectedModel].apiKey||"";
        UI.apiBaseInput.value=modelConfigs[config.selectedModel].apiBase||"";
        updateManageUrl();
    });
    // custom model
    UI.customModelInput.addEventListener("change",()=>{
        const name=UI.customModelInput.value.trim();
        if (!name) return;
        config.selectedModel=name;
        if (!modelConfigs[name]) {
            modelConfigs[name]={
                apiKey:"",
                apiBase:"https://api.openai.com/v1/chat/completions",
                discovered:false,
                modelList:[]
            };
        }
        rebuildModelSelect();
        UI.modelSelect.value="custom";
        UI.apiKeyInput.value=modelConfigs[name].apiKey||"";
        UI.apiBaseInput.value=modelConfigs[name].apiBase||"";
        updateManageUrl();
    });
    // save key
    panel.querySelector("#save-api-key").addEventListener("click",()=>{
        const key = UI.apiKeyInput.value.trim();
        modelConfigs[config.selectedModel].apiKey=key;
        saveModelConfigs();
        logMessage("API key saved.");
    });
    // test key
    panel.querySelector("#check-api-key-btn").addEventListener("click",()=>{
        testApiKey();
    });
    // save base
    panel.querySelector("#save-api-base").addEventListener("click",()=>{
        const b = UI.apiBaseInput.value.trim();
        modelConfigs[config.selectedModel].apiBase=b;
        saveModelConfigs();
        logMessage("API base saved.");
    });
    // auto submit
    UI.autoSubmitToggle.addEventListener("change",()=>{
        config.autoSubmitEnabled=UI.autoSubmitToggle.checked;
        logDump("autoSubmitEnabled", config.autoSubmitEnabled);
    });
    // refresh model list
    UI.refreshModelListBtn.addEventListener("click",()=>{
        refreshModelList();
    });
    // rent key
    UI.rentApiBtn.addEventListener("click",()=>{
        showRentApiPopup();
    });
    // ask AI
    panel.querySelector("#ask-ai-btn").addEventListener("click",()=>{
        openAiHelperDialog();
    });

    //----------------------------------------------------------------------
    // 10) ManageURL
    //----------------------------------------------------------------------
    function updateManageUrl() {
        let mod = config.selectedModel.toLowerCase();
        let link="#";
        if (mod.includes("deepseek")) {
            link="https://platform.deepseek.com/api_keys";
        } else {
            link="https://platform.openai.com/api-keys";
        }
        modelConfigs[config.selectedModel].manageUrl=link;
        UI.manageModelLink.href=link;
        saveModelConfigs();
    }
    function showRentApiPopup() {
        const overlay=document.createElement("div");
        overlay.style.position="fixed";
        overlay.style.top="0"; overlay.style.left="0";
        overlay.style.width="100%"; overlay.style.height="100%";
        overlay.style.backgroundColor="rgba(0,0,0,0.5)";
        overlay.style.zIndex="99999999";
        const box=document.createElement("div");
        box.style.position="absolute";
        box.style.top="50%"; box.style.left="50%";
        box.style.transform="translate(-50%,-50%)";
        box.style.backgroundColor="#fff";
        box.style.borderRadius="6px";
        box.style.width="300px";
        box.style.padding="10px";
        box.innerHTML=`
          <h3>Rent Key</h3>
          <p>Contact me at:</p>
          <ul>
            <li>felixliujy@Gmail.com</li>
            <li>admin@obanarchy.org</li>
          </ul>
          <button id="rent-close">${langText[config.language].closeButton}</button>
        `;
        overlay.appendChild(box);
        document.body.appendChild(overlay);
        box.querySelector("#rent-close").addEventListener("click",()=>{
            document.body.removeChild(overlay);
        });
    }

    //----------------------------------------------------------------------
    // 11) Test API Key
    //----------------------------------------------------------------------
    function testApiKey() {
        UI.status.textContent=langText[config.language].checkingApiKey;
        const mc=modelConfigs[config.selectedModel]||{};
        const payload={
            model: config.selectedModel,
            messages:[
                {role:"system", content:"Testing key."},
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
            data: JSON.stringify(payload),
            onload:(resp)=>{
                UI.status.textContent=langText[config.language].statusWaiting;
                try{
                    let data=JSON.parse(resp.responseText);
                    if (data.choices && data.choices[0].message.content.toLowerCase().includes("test success")) {
                        alert(langText[config.language].apiKeyValid);
                    } else {
                        alert(langText[config.language].apiKeyInvalid);
                    }
                } catch(e){
                    alert("Error parsing test result: "+e);
                }
            },
            onerror:(err)=>{
                UI.status.textContent=langText[config.language].statusWaiting;
                alert("Key test failed: "+JSON.stringify(err));
            }
        });
    }

    //----------------------------------------------------------------------
    // 12) Refresh Model List
    //----------------------------------------------------------------------
    function refreshModelList() {
        const mc=modelConfigs[config.selectedModel]||{};
        const url=mc.apiBase.replace("/chat/completions","/models");
        logMessage("Refreshing models: "+url);
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
                        const newList=data.data.map(o=>o.id);
                        mc.modelList=newList;
                        newList.forEach(x=>{
                            if(!modelConfigs[x]){
                                modelConfigs[x]={
                                    apiKey:mc.apiKey,
                                    apiBase:mc.apiBase,
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
                    alert("Error: "+e);
                }
            },
            onerror:(err)=>{
                alert("Failed to refresh model list: "+JSON.stringify(err));
            }
        });
    }

    //----------------------------------------------------------------------
    // 13) AI Helper (non-stream)
    //----------------------------------------------------------------------
    function openAiHelperDialog() {
        const overlay=document.createElement("div");
        overlay.style.position="fixed";
        overlay.style.top="0";
        overlay.style.left="0";
        overlay.style.width="100%";
        overlay.style.height="100%";
        overlay.style.backgroundColor="rgba(0,0,0,0.5)";
        overlay.style.zIndex="999999999";

        const box=document.createElement("div");
        box.style.position="absolute";
        box.style.top="50%";
        box.style.left="50%";
        box.style.transform="translate(-50%,-50%)";
        box.style.width="320px";
        box.style.backgroundColor="#fff";
        box.style.borderRadius="6px";
        box.style.padding="10px";
        box.innerHTML=`
          <h3>${langText[config.language].askAiTitle}</h3>
          <textarea id="helper-input" style="width:100%;height:80px;"></textarea>
          <button id="helper-ask" style="margin-top:6px;">${langText[config.language].askAi}</button>
          <button id="helper-close" style="margin-top:6px;">${langText[config.language].closeButton}</button>
          <div id="helper-output" style="margin-top:6px; border:1px solid #ccc; padding:4px; background:#f9f9f9;white-space:pre-wrap;"></div>
        `;
        overlay.appendChild(box);
        document.body.appendChild(overlay);

        const btnClose=box.querySelector("#helper-close");
        btnClose.addEventListener("click",()=>{
            document.body.removeChild(overlay);
        });
        const btnAsk=box.querySelector("#helper-ask");
        const inp=box.querySelector("#helper-input");
        const out=box.querySelector("#helper-output");
        btnAsk.addEventListener("click",()=>{
            let q=inp.value.trim();
            if (!q) return;
            out.textContent="(waiting for response...)";
            askAiHelper(q, (res)=>{
                out.textContent=res;
                // 同样可以解析 <answer>...</answer> 并加粗
                const finalAns = parseAnswerTag(res);
                if (finalAns) {
                    out.innerHTML += `<p style="font-weight:bold; color:#c00; font-size:16px;">Answer: ${finalAns}</p>`;
                }
            }, (err)=>{
                out.textContent="[Error] "+err;
            });
        });
    }

    function askAiHelper(userQ, onSuccess, onError) {
        const mc=modelConfigs[config.selectedModel]||{};
        const payload={
            model: config.selectedModel,
            messages:[
                {role:"system", content:scriptDescription},
                {role:"user", content:userQ}
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
                try{
                    let data=JSON.parse(resp.responseText);
                    let text=data.choices[0].message.content;
                    onSuccess(text);
                }catch(e){
                    onError("Failed to parse: "+e);
                }
            },
            onerror:(err)=>{
                onError(JSON.stringify(err));
            }
        });
    }

    //----------------------------------------------------------------------
    // 14) AnswerQuestion：GPT 需输出过程，但最终答案在 <answer>...</answer>
    //----------------------------------------------------------------------
    function getTargetDiv() {
        let t=document.evaluate(
            '/html/body/main/div/article/section/section/div/div[1]',
            document,null,XPathResult.FIRST_ORDERED_NODE_TYPE,null
        ).singleNodeValue;
        if (!t) {
            t=document.querySelector('main div.article, main>div, article');
        }
        return t;
    }
    function captureMath(el) {
        let arr=el.querySelectorAll('script[type="math/tex"], .MathJax, .mjx-chtml');
        if(arr.length>0){
            let latex="";
            arr.forEach(e=>latex+=e.textContent+"\n");
            return latex;
        }
        return null;
    }
    function captureCanvas(el) {
        let c=el.querySelector('canvas');
        if (c){
            const cv=document.createElement("canvas");
            cv.width=c.width; cv.height=c.height;
            cv.getContext("2d").drawImage(c,0,0);
            return cv.toDataURL("image/png").split(",")[1];
        }
        return null;
    }
    function monitorDom(el) {
        if(!el) return;
        const obs=new MutationObserver((mutations)=>{
            for(const m of mutations){
                logDump("DOM changed", {
                    added:m.addedNodes.length,
                    removed:m.removedNodes.length
                });
            }
        });
        obs.observe(el,{childList:true,subtree:true});
    }

    // 解析 <answer>...</answer>，其余文本则视为过程
    function parseAnswerTag(gptOutput) {
        const re=/<answer>([\s\S]*?)<\/answer>/i;
        let m=gptOutput.match(re);
        return m? m[1].trim() : null;
    }

    function answerQuestion() {
        logMessage("AnswerQuestion triggered.");
        const targ=getTargetDiv();
        if(!targ) {
            logMessage("No question region found!");
            return;
        }
        config.lastTargetState = targ.innerHTML;
        monitorDom(targ);

        // 组装 prompt
        const latex = captureMath(targ);
        const canvasB64 = latex? null : captureCanvas(targ);

        let systemPrompt="";
        let userBody="You can show your solution steps, but final numeric/textual answer must be in <answer>...</answer>.\n\nHTML:\n"+targ.outerHTML;
        if(latex) userBody+=`\nLaTeX:\n${latex}`;
        if(canvasB64) userBody+="\nCanvas image base64 attached.";

        if (config.fillMode==="displayOnly") {
            systemPrompt="You are a math solver for IXL. Return your steps if needed, but the final answer must appear within <answer>...</answer>. No code is needed.";
        } else {
            systemPrompt="You are a math solver for IXL. Return your steps if needed, but also provide a JavaScript code snippet in triple backticks. The final numeric/textual answer must appear in <answer>...</answer>. Fill all required fields. No LaTeX outside code. Return only one code block if possible.";
        }

        UI.answerDisplay.style.display="none";
        UI.answerContent.innerHTML="";
        UI.solutionSteps.innerHTML="";

        UI.status.textContent=langText[config.language].waitingGpt;
        startProgress();

        const pay={
            model: config.selectedModel,
            messages:[
                {role:"system", content:systemPrompt},
                {role:"user", content:userBody}
            ]
        };
        const mc=modelConfigs[config.selectedModel]||{};
        GM_xmlhttpRequest({
            method:"POST",
            url: mc.apiBase,
            headers:{
                "Content-Type":"application/json",
                "Authorization": `Bearer ${mc.apiKey}`
            },
            data: JSON.stringify(pay),
            onload:(resp)=>{
                stopProgress();
                UI.status.textContent=langText[config.language].parsingResponse;
                try{
                    let data=JSON.parse(resp.responseText);
                    logDump("AnswerQ response", data);

                    // 记录 tokens
                    if (data.usage && data.usage.total_tokens) {
                        config.totalTokensUsed += data.usage.total_tokens;
                        UI.tokenUsageDisplay.textContent = langText[config.language].tokenUsage + config.totalTokensUsed;
                    }

                    // 显示
                    let fullText=data.choices[0].message.content;
                    let finalAnswer=parseAnswerTag(fullText);
                    // 提取 <answer> 并把其余内容视为 "解题过程"
                    if (!finalAnswer) {
                        UI.answerDisplay.style.display="block";
                        UI.answerContent.innerHTML=`<b style="color:red;">未找到 <answer> 标签，请检查GPT输出</b>`;
                        UI.solutionSteps.textContent=fullText;
                        UI.status.textContent="Missing <answer> tag.";
                        return;
                    }
                    // 截取 <answer>..</answer> 以外的文本
                    let steps = fullText.replace(/<answer>[\s\S]*?<\/answer>/i,""); // remove the final answer part
                    UI.answerDisplay.style.display="block";

                    // 最终答案：加大加粗
                    UI.answerContent.innerHTML = `<div style="font-size:18px; font-weight:bold; color:#008000;">${finalAnswer}</div>`;
                    UI.solutionSteps.textContent=steps.trim(); // 过程

                    // 如果 autoFill, 再看看有没有 ```javascript code```
                    if (config.fillMode==="autoFill") {
                        let codeMatch = fullText.match(/```javascript\s+([\s\S]*?)\s+```/i);
                        if (codeMatch && codeMatch[1]) {
                            let code=codeMatch[1].trim();
                            runCodeInSandbox(code);
                            if (config.autoSubmitEnabled) autoSubmit();
                        } else {
                            logMessage("No code block found for auto fill.");
                        }
                    }
                    UI.status.textContent=langText[config.language].submissionComplete;
                } catch(e){
                    logDump("AnswerQ parse err", e);
                    UI.status.textContent="Error parsing GPT output.";
                }
            },
            onerror:(err)=>{
                stopProgress();
                UI.status.textContent=langText[config.language].requestError + JSON.stringify(err);
                logDump("AnswerQ onerror", err);
            }
        });
    }

    // 执行 JS 代码
    function runCodeInSandbox(jsCode){
        try{
            const sandbox={};
            (new Function("sandbox", "with(sandbox){"+jsCode+"}"))(sandbox);
        }catch(e){
            logDump("Sandbox error", e);
        }
    }
    // auto submit
    function autoSubmit(){
        let btn=document.evaluate(
            '/html/body/main/div/article/section/section/div/div[1]/section/div/section/div/button',
            document,null,XPathResult.FIRST_ORDERED_NODE_TYPE,null
        ).singleNodeValue;
        if (!btn) {
            btn=document.querySelector('button.submit, button[class*="submit"]');
        }
        if (btn) {
            logMessage("Auto-submitting answer now...");
            btn.click();
        } else {
            logMessage("No submit button found for autoSubmit");
        }
    }

    //----------------------------------------------------------------------
    // 15) 小进度条
    //----------------------------------------------------------------------
    let progTimer=null;
    function startProgress(){
        UI.progressContainer.style.display="block";
        UI.progressBar.value=0;
        progTimer=setInterval(()=>{
            if (UI.progressBar.value<90) UI.progressBar.value+=2;
        },200);
    }
    function stopProgress(){
        if (progTimer) clearInterval(progTimer);
        UI.progressBar.value=100;
        setTimeout(()=>{
            UI.progressContainer.style.display="none";
            UI.progressBar.value=0;
        },400);
    }

    //----------------------------------------------------------------------
    // 初始化
    //----------------------------------------------------------------------
    function initPanel(){
        rebuildModelSelect();
        let conf=modelConfigs[config.selectedModel];
        UI.apiKeyInput.value=conf.apiKey||"";
        UI.apiBaseInput.value=conf.apiBase||"https://api.openai.com/v1/chat/completions";
        updateManageUrl();
        UI.fillModeSelect.value=config.fillMode;
        if(config.fillMode==="displayOnly") {
            UI.answerDisplay.style.display="none";
        }
        UI.languageSelect.value=config.language;
        updateLanguageText();
        logMessage("Script loaded (compact layout). <answer> tags used to parse final answer.");
    }
    initPanel();

    // getTargetDiv
    function getTargetDiv() {
        let d=document.evaluate(
            '/html/body/main/div/article/section/section/div/div[1]',
            document,null,XPathResult.FIRST_ORDERED_NODE_TYPE,null
        ).singleNodeValue;
        if(!d) d=document.querySelector('main div.article, main>div, article');
        return d;
    }

})();
