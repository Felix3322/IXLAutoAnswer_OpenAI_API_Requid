// ==UserScript==
// @name         IXL Auto Answer (Plain BG, Larger UI, Old Data Migration, Markdown Support)
// @namespace    http://tampermonkey.net/
// @version      5.0
// @license      GPL-3.0
// @description  IXL auto solver with older aesthetic, plain background, bigger elements, "Ask AI" -> "AI", parse <answer> tags, handles markdown if GPT insists, auto migrates old localStorage keys.
// @match        https://*.ixl.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// ==/UserScript==

(function () {
    'use strict';

    //======================================================================
    // 1) 数据兼容与迁移
    //======================================================================
    // 新的 localStorage key: "gptAutoConfigs"
    // 兼容老版本"gpt4o-modelConfigs" 或 "ixlAutoAnswerConfigs"
    let oldData1 = localStorage.getItem("gpt4o-modelConfigs");
    let oldData2 = localStorage.getItem("ixlAutoAnswerConfigs");
    let newData = localStorage.getItem("gptAutoConfigs");

    if (!newData) {
        if (oldData1) {
            localStorage.setItem("gptAutoConfigs", oldData1);
            localStorage.removeItem("gpt4o-modelConfigs");
            console.log("[Migration] Moved old 'gpt4o-modelConfigs' to 'gptAutoConfigs'");
        } else if (oldData2) {
            localStorage.setItem("gptAutoConfigs", oldData2);
            localStorage.removeItem("ixlAutoAnswerConfigs");
            console.log("[Migration] Moved old 'ixlAutoAnswerConfigs' to 'gptAutoConfigs'");
        }
    }

    //======================================================================
    // 2) 模型配置存储
    //======================================================================
    let modelConfigs = JSON.parse(localStorage.getItem("gptAutoConfigs") || "{}");
    const predefinedModels = [
        "gpt-4o","gpt-4o-mini","o1","o3-mini",
        "deepseek-reasoner","deepseek-chat","chatgpt-4o-least"
    ];
    // 若无 gpt-4o，则给一个默认
    if (!modelConfigs["gpt-4o"]) {
        modelConfigs["gpt-4o"] = {
            apiKey: "",
            apiBase: "https://api.openai.com/v1/chat/completions",
            discovered: false,
            modelList: []
        };
    }

    // GUI/脚本配置信息
    const config = {
        selectedModel: "gpt-4o",
        language: localStorage.getItem("gptAutoLang") || "en",
        mode: "displayOnly",    // displayOnly or autoFill
        autoSubmit: false,
        totalTokens: 0,
        lastState: null
    };

    // 保存：写入 localStorage
    function saveConfigs() {
        localStorage.setItem("gptAutoConfigs", JSON.stringify(modelConfigs));
        localStorage.setItem("gptAutoLang", config.language);
    }

    //======================================================================
    // 3) 文本 - 语言
    //======================================================================
    // Note: 模型描述固定英文
    const langText = {
        en: {
            modeLabel: "Mode",
            mode_auto: "Auto Fill (unstable)",
            mode_display: "Display Only (default)",
            startAnswer: "Start",
            rollback: "Rollback",
            language: "Language",
            modelSelect: "Model",
            modelDesc: "Model Description",
            apiKey: "API Key",
            save: "Save",
            apiKeyPlaceholder: "Enter your API key",
            apiBase: "API Base",
            apiBasePlaceholder: "Enter your API base",
            statusIdle: "Status: Idle",
            waiting: "Waiting for GPT...",
            complete: "Done.",
            requestErr: "Request error: ",
            showLog: "Logs",
            hideLog: "Hide Logs",
            customModel: "Custom Model",
            testKey: "Test Key",
            testKeyIng: "Testing Key...",
            keyOk: "API key valid.",
            keyBad: "API key invalid (no 'test success').",
            processing: "Processing...",
            tokens: "Tokens: ",
            close: "Close",
            getKeyLink: "Get API Key",
            refreshModels: "Refresh Models",
            askAi: "AI",
            askAiTitle: "AI Helper",
            rentKey: "Rent Key",
            finalAnswer: "Final Answer:",
            steps: "Solution Steps"
        },
        zh: {
            modeLabel: "模式",
            mode_auto: "自动填写（不稳定）",
            mode_display: "仅显示（默认）",
            startAnswer: "开始",
            rollback: "撤回",
            language: "语言",
            modelSelect: "模型",
            modelDesc: "模型说明",
            apiKey: "API 密钥",
            save: "保存",
            apiKeyPlaceholder: "输入 API 密钥",
            apiBase: "API 基础地址",
            apiBasePlaceholder: "输入 API Base",
            statusIdle: "状态：空闲",
            waiting: "等待GPT...",
            complete: "完成。",
            requestErr: "请求错误：",
            showLog: "日志",
            hideLog: "隐藏",
            customModel: "自定义模型",
            testKey: "测试密钥",
            testKeyIng: "正在测试...",
            keyOk: "API密钥有效。",
            keyBad: "API密钥无效(无'test success')。",
            processing: "处理中...",
            tokens: "用量: ",
            close: "关闭",
            getKeyLink: "获取API Key",
            refreshModels: "刷新模型",
            askAi: "AI",
            askAiTitle: "AI助手",
            rentKey: "租用Key",
            finalAnswer: "最终答案：",
            steps: "解题过程"
        }
    };

    // 模型描述(固定英文)
    const modelDescs = {
        "gpt-4o": "Solves images, cost-effective.",
        "gpt-4o-mini": "Handles text-only, cheaper.",
        "o1": "Best for images, slow & expensive.",
        "o3-mini": "Text-only, fast, cheaper than o1.",
        "deepseek-reasoner": "No images, cheaper than o1.",
        "deepseek-chat": "No images, cheap & fast as 4o.",
        "chatgpt-4o-least": "RLHF version, more human but error-prone.",
        "custom": "User-defined model."
    };

    //======================================================================
    // 4) GUI
    //======================================================================
    const panel = document.createElement("div");
    panel.id = "gptAuto-panel";
    panel.innerHTML = `
      <div class="header-bar">
        <span id="token-label">${langText[config.language].tokens}0</span>
        <button id="log-btn">${langText[config.language].showLog}</button>
        <button id="close-btn">${langText[config.language].close}</button>
      </div>
      <div class="content-area">
        <!-- top row: Mode + Start + Rollback -->
        <div class="row-top">
          <div class="col-left">
            <label>${langText[config.language].modeLabel}:</label>
            <select id="mode-select">
              <option value="autoFill">${langText[config.language].mode_auto}</option>
              <option value="displayOnly">${langText[config.language].mode_display}</option>
            </select>
          </div>
          <div class="col-right">
            <button id="start-btn" class="btn-accent">${langText[config.language].startAnswer}</button>
            <button id="rollback-btn" class="btn-normal">${langText[config.language].rollback}</button>
          </div>
        </div>

        <!-- Answer Display -->
        <div id="answer-box" style="display:none; margin:8px 0; border:1px solid #aaa; padding:6px; background:#fff;">
          <h4 id="answer-title">${langText[config.language].finalAnswer}</h4>
          <div id="answer-content" style="font-size:15px; font-weight:bold; color:#080; margin-bottom:4px;"></div>
          <hr/>
          <div id="solution-steps" style="font-size:13px; color:#666;"></div>
        </div>

        <!-- Ask AI small button -->
        <button id="ask-ai-btn" class="btn-sm" style="width:100%; margin-bottom:6px;">
          ${langText[config.language].askAi}
        </button>

        <!-- progress -->
        <div id="progress-box" style="display:none;">
          <progress id="progress-bar" max="100" value="0" style="width:100%;"></progress>
          <span id="progress-label">${langText[config.language].processing}</span>
        </div>

        <!-- status -->
        <p id="status-line" style="font-weight:bold; margin-top:6px;">${langText[config.language].statusIdle}</p>

        <!-- logs -->
        <div id="log-box" style="
          display:none; 
          max-height:120px; 
          overflow-y:auto; 
          background:#fff; 
          border:1px solid #888; 
          margin-top:6px; 
          padding:4px; 
          font-family:monospace;"></div>

        <!-- 2-col config -->
        <div class="two-col-area">
          <div class="col-block" style="flex:1;">
            <!-- Model -->
            <label>${langText[config.language].modelSelect}:</label>
            <select id="model-select" style="width:100%;"></select>
            <p id="model-desc" style="font-size:12px; color:#666; margin:4px 0;"></p>
            <div id="custom-model-area" style="display:none; margin-bottom:6px;">
              <input type="text" id="custom-model-input" placeholder="${langText[config.language].customModel}" style="width:100%;" />
            </div>

            <!-- language -->
            <label>${langText[config.language].language}:</label>
            <select id="lang-select" style="width:100%; margin-bottom:6px;">
              <option value="en">English</option>
              <option value="zh">中文</option>
            </select>

            <!-- auto submit row -->
            <div id="auto-submit-row">
              <label style="display:block; margin-bottom:2px;">Auto Submit:</label>
              <input type="checkbox" id="auto-submit-toggle" />
            </div>

            <!-- rent key -->
            <button id="rent-key-btn" class="btn-normal" style="margin-top:6px; width:100%;">
              ${langText[config.language].rentKey}
            </button>
          </div>
          <div class="col-block" style="flex:1;">
            <!-- API key, base, refresh, manage link -->
            <label>${langText[config.language].apiKey}:</label>
            <div style="display:flex; gap:4px; margin-bottom:6px;">
              <input type="password" id="api-key" style="flex:1;" placeholder="${langText[config.language].apiKeyPlaceholder}" />
              <button id="save-key-btn">${langText[config.language].save}</button>
              <button id="test-key-btn">${langText[config.language].testKey}</button>
            </div>

            <label>${langText[config.language].apiBase}:</label>
            <div style="display:flex; gap:4px; margin-bottom:6px;">
              <input type="text" id="api-base" style="flex:1;" placeholder="${langText[config.language].apiBasePlaceholder}" />
              <button id="save-base-btn">${langText[config.language].save}</button>
            </div>

            <label>${langText[config.language].getKeyLink}:</label>
            <div style="display:flex; gap:4px;">
              <a id="manage-link" href="#" target="_blank" class="link-btn" style="flex:1;">Link</a>
              <button id="refresh-models-btn" class="btn-normal" style="flex:1;">${langText[config.language].refreshModels}</button>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(panel);

    //======================================================================
    // 5) 样式 - 纯色背景 + 更现代
    //======================================================================
    GM_addStyle(`
      body {
        background-color: #f0f2f5; /* 纯色背景 */
      }
      #gptAuto-panel {
        position: fixed;
        top: 20px;
        right: 20px;
        width: 400px;
        background: #fff;
        border-radius: 6px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        font-family: "Segoe UI", Arial, sans-serif;
        z-index: 999999;
        font-size: 14px;
      }
      .header-bar {
        background: #fafafa;
        border-bottom: 1px solid #ccc;
        padding: 6px;
        display: flex;
        justify-content: flex-end;
        gap: 4px;
      }
      .content-area {
        padding: 10px;
      }
      .row-top {
        display: flex;
        gap: 8px;
        margin-bottom: 6px;
      }
      .row-top .col-left,
      .row-top .col-right {
        flex: 1;
      }
      label {
        font-weight: 600;
        font-size: 14px;
        margin-bottom: 2px;
        display: inline-block;
      }
      input, select, button {
        font-size: 14px;
        padding: 6px;
        box-sizing: border-box;
      }
      .btn-accent {
        background-color: #f0ad4e;
        color: #fff;
        border: none;
        border-radius: 4px;
        font-weight: bold;
        width: 100%;
      }
      .btn-accent:hover {
        background-color: #ec971f;
      }
      .btn-normal {
        background-color: #ddd;
        color: #333;
        border: none;
        border-radius: 4px;
        width: 100%;
      }
      .btn-normal:hover {
        background-color: #ccc;
      }
      .btn-sm {
        background-color: #bbb;
        color: #333;
        border: none;
        border-radius: 4px;
        font-size: 13px;
        padding: 4px 8px;
      }
      .btn-sm:hover {
        background-color: #aaa;
      }
      .link-btn {
        background: #2f8ee0;
        color: #fff;
        border-radius: 4px;
        text-decoration: none;
        text-align: center;
        padding: 6px;
      }
      .link-btn:hover {
        opacity: 0.8;
      }
      .two-col-area {
        display: flex;
        gap: 8px;
        margin-top: 6px;
      }
      .col-block {
        background: #f8f8f8;
        border: 1px solid #ccc;
        border-radius: 6px;
        padding: 8px;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
    `);

    //======================================================================
    // 6) 缓存 UI 引用
    //======================================================================
    const UI = {
        panel,
        logBox: document.getElementById("log-box"),
        logBtn: document.getElementById("log-btn"),
        closeBtn: document.getElementById("close-btn"),
        tokenLabel: document.getElementById("token-label"),
        startBtn: document.getElementById("start-btn"),
        rollbackBtn: document.getElementById("rollback-btn"),
        answerBox: document.getElementById("answer-box"),
        answerContent: document.getElementById("answer-content"),
        solutionSteps: document.getElementById("solution-steps"),
        askAiBtn: document.getElementById("ask-ai-btn"),
        progressBox: document.getElementById("progress-box"),
        progressBar: document.getElementById("progress-bar"),
        progressLabel: document.getElementById("progress-label"),
        statusLine: document.getElementById("status-line"),
        modeSelect: document.getElementById("mode-select"),
        autoSubmitRow: document.getElementById("auto-submit-row"),
        autoSubmitToggle: document.getElementById("auto-submit-toggle"),
        modelSelect: document.getElementById("model-select"),
        modelDesc: document.getElementById("model-desc"),
        customModelArea: document.getElementById("custom-model-area"),
        customModelInput: document.getElementById("custom-model-input"),
        langSelect: document.getElementById("lang-select"),
        rentKeyBtn: document.getElementById("rent-key-btn"),
        apiKeyInput: document.getElementById("api-key"),
        saveKeyBtn: document.getElementById("save-key-btn"),
        testKeyBtn: document.getElementById("test-key-btn"),
        apiBaseInput: document.getElementById("api-base"),
        saveBaseBtn: document.getElementById("save-base-btn"),
        manageLink: document.getElementById("manage-link"),
        refreshModelsBtn: document.getElementById("refresh-models-btn")
    };

    //======================================================================
    // 7) 日志函数
    //======================================================================
    function logMsg(message) {
        const stamp = new Date().toLocaleString();
        const div = document.createElement("div");
        div.textContent = `[${stamp}] ${message}`;
        UI.logBox.appendChild(div);
        console.log("[Log]", message);
    }
    function logDump(label, val) {
        let msg = `[DUMP] ${label}: `;
        try {
            msg += JSON.stringify(val);
        } catch(e){
            msg += String(val);
        }
        logMsg(msg);
    }

    //======================================================================
    // 8) 更新语言文本
    //======================================================================
    function updateLangTexts() {
        UI.logBtn.textContent = (UI.logBox.style.display==="none") ? langText[config.language].showLog : langText[config.language].hideLog;
        UI.closeBtn.textContent = langText[config.language].close;
        UI.tokenLabel.textContent = langText[config.language].tokens + config.totalTokens;
        UI.statusLine.textContent = langText[config.language].statusIdle;
        UI.progressLabel.textContent = langText[config.language].processing;
        UI.modeSelect.options[0].text = langText[config.language].mode_auto;
        UI.modeSelect.options[1].text = langText[config.language].mode_display;
        UI.startBtn.textContent = langText[config.language].startAnswer;
        UI.rollbackBtn.textContent = langText[config.language].rollback;
        UI.apiKeyInput.placeholder = langText[config.language].apiKeyPlaceholder;
        UI.saveKeyBtn.textContent = langText[config.language].save;
        UI.testKeyBtn.textContent = langText[config.language].testKey;
        UI.apiBaseInput.placeholder = langText[config.language].apiBasePlaceholder;
        UI.saveBaseBtn.textContent = langText[config.language].save;
        UI.manageLink.textContent = langText[config.language].getKeyLink;
        UI.refreshModelsBtn.textContent = langText[config.language].refreshModels;
        UI.askAiBtn.textContent = langText[config.language].askAi;
        UI.rentKeyBtn.textContent = langText[config.language].rentKey;
        document.getElementById("answer-title").textContent = langText[config.language].finalAnswer;
    }

    //======================================================================
    // 9) 模型选择构建
    //======================================================================
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

        // discovered
        const discoveredKeys = Object.keys(modelConfigs).filter(k => modelConfigs[k].discovered);
        if (discoveredKeys.length>0) {
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

        // custom
        const optCust = document.createElement("option");
        optCust.value = "custom";
        optCust.textContent = "custom";
        UI.modelSelect.appendChild(optCust);

        if (UI.modelSelect.querySelector(`option[value="${config.selectedModel}"]`)) {
            UI.modelSelect.value = config.selectedModel;
        } else {
            UI.modelSelect.value = "custom";
        }
        UI.modelDesc.textContent = modelDescs[config.selectedModel] || "User-defined model.";
        UI.customModelArea.style.display = (config.selectedModel==="custom")?"block":"none";
    }

    //======================================================================
    // 10) UI事件
    //======================================================================
    // 切换日志
    UI.logBtn.addEventListener("click", () => {
        if(UI.logBox.style.display==="none"){
            UI.logBox.style.display="block";
            UI.logBtn.textContent=langText[config.language].hideLog;
        } else {
            UI.logBox.style.display="none";
            UI.logBtn.textContent=langText[config.language].showLog;
        }
    });
    // 关闭
    UI.closeBtn.addEventListener("click", () => {
        UI.panel.style.display="none";
        logMsg("Panel closed.");
    });
    // 模式切换
    UI.modeSelect.addEventListener("change", () => {
        config.mode = UI.modeSelect.value;
        if(config.mode==="displayOnly"){
            UI.autoSubmitRow.style.display="none";
            UI.answerBox.style.display="none";
        } else {
            UI.autoSubmitRow.style.display="block";
            alert("Warning: Auto Fill can be unstable.");
        }
    });
    // start
    UI.startBtn.addEventListener("click", () => {
        answerQuestion();
    });
    // rollback
    UI.rollbackBtn.addEventListener("click", () => {
        if(config.lastState) {
            let tgt = getTargetDiv();
            if(tgt) {
                tgt.innerHTML = config.lastState;
                logMsg("Rolled back question content.");
            }
        } else {
            logMsg("No last state available to rollback.");
        }
    });
    // ask AI
    UI.askAiBtn.addEventListener("click", () => {
        openAiDialog();
    });
    // autoSubmit
    UI.autoSubmitToggle.addEventListener("change", () => {
        config.autoSubmit = UI.autoSubmitToggle.checked;
        logDump("autoSubmit", config.autoSubmit);
    });
    // model select
    UI.modelSelect.addEventListener("change", () => {
        config.selectedModel = UI.modelSelect.value;
        if(!modelConfigs[config.selectedModel]){
            modelConfigs[config.selectedModel] = {
                apiKey:"",
                apiBase:"https://api.openai.com/v1/chat/completions",
                discovered:false,
                modelList:[]
            };
        }
        UI.customModelArea.style.display=(config.selectedModel==="custom")?"block":"none";
        UI.modelDesc.textContent = modelDescs[config.selectedModel] || "User-defined model";
        UI.apiKeyInput.value=modelConfigs[config.selectedModel].apiKey||"";
        UI.apiBaseInput.value=modelConfigs[config.selectedModel].apiBase||"";
        updateManageLink();
    });
    // custom model
    UI.customModelInput.addEventListener("change", () => {
        let name=UI.customModelInput.value.trim();
        if(!name) return;
        config.selectedModel=name;
        if(!modelConfigs[name]){
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
        updateManageLink();
    });
    // lang
    UI.langSelect.addEventListener("change", () => {
        config.language = UI.langSelect.value;
        saveConfigs();
        updateLangTexts();
    });
    // rent key
    UI.rentKeyBtn.addEventListener("click", () => {
        showRentPopup();
    });
    // save key
    UI.saveKeyBtn.addEventListener("click", () => {
        let k=UI.apiKeyInput.value.trim();
        modelConfigs[config.selectedModel].apiKey=k;
        saveConfigs();
        logMsg("Saved API key.");
    });
    // test key
    UI.testKeyBtn.addEventListener("click", () => {
        testApiKey();
    });
    // save base
    UI.saveBaseBtn.addEventListener("click", () => {
        let base=UI.apiBaseInput.value.trim();
        modelConfigs[config.selectedModel].apiBase=base;
        saveConfigs();
        logMsg("Saved API base.");
    });
    // refresh models
    UI.refreshModelsBtn.addEventListener("click", () => {
        refreshModelList();
    });

    //======================================================================
    // 11) Manage Link
    //======================================================================
    function updateManageLink() {
        const mod = config.selectedModel.toLowerCase();
        let link="#";
        if(mod.indexOf("deepseek")!==-1) {
            link="https://platform.deepseek.com/api_keys";
        } else {
            link="https://platform.openai.com/api-keys";
        }
        modelConfigs[config.selectedModel].manageUrl=link;
        UI.manageLink.href=link;
        saveConfigs();
    }

    //======================================================================
    // 12) Rent Popup
    //======================================================================
    function showRentPopup() {
        const overlay=document.createElement("div");
        overlay.style.position="fixed";
        overlay.style.top="0"; overlay.style.left="0";
        overlay.style.width="100%"; overlay.style.height="100%";
        overlay.style.backgroundColor="rgba(0,0,0,0.4)";
        overlay.style.zIndex="999999999";

        const box=document.createElement("div");
        box.style.position="absolute";
        box.style.top="50%"; box.style.left="50%";
        box.style.transform="translate(-50%,-50%)";
        box.style.width="280px";
        box.style.backgroundColor="#fff";
        box.style.borderRadius="6px";
        box.style.padding="10px";

        box.innerHTML=`
          <h3>${langText[config.language].rentKey}</h3>
          <p>Contact me:</p>
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

    //======================================================================
    // 13) Test API Key
    //======================================================================
    function testApiKey() {
        UI.statusLine.textContent = langText[config.language].testKeyIng;
        const conf=modelConfigs[config.selectedModel];
        const payload={
            model: config.selectedModel,
            messages: [
                {role:"system", content:"You are a key test assistant."},
                {role:"user", content:"Please ONLY respond with: test success"}
            ]
        };
        GM_xmlhttpRequest({
            method:"POST",
            url: conf.apiBase,
            headers:{
                "Content-Type":"application/json",
                "Authorization": "Bearer "+conf.apiKey
            },
            data: JSON.stringify(payload),
            onload:(resp)=>{
                UI.statusLine.textContent=langText[config.language].statusIdle;
                try{
                    const data=JSON.parse(resp.responseText);
                    const ans=data.choices[0].message.content.toLowerCase();
                    if(ans.indexOf("test success")!==-1){
                        alert(langText[config.language].keyOk);
                    }else{
                        alert(langText[config.language].keyBad);
                    }
                }catch(e){
                    alert("Error parsing test result:"+e);
                }
            },
            onerror:(err)=>{
                UI.statusLine.textContent=langText[config.language].statusIdle;
                alert("Key test failed:"+JSON.stringify(err));
            }
        });
    }

    //======================================================================
    // 14) Refresh Model
    //======================================================================
    function refreshModelList() {
        const c = modelConfigs[config.selectedModel];
        if(!c)return;
        const url=c.apiBase.replace("/chat/completions","/models");
        logMsg("Fetching models from: "+url);
        GM_xmlhttpRequest({
            method:"GET",
            url,
            headers:{
                "Authorization":"Bearer "+c.apiKey
            },
            onload:(resp)=>{
                try{
                    const data=JSON.parse(resp.responseText);
                    if(Array.isArray(data.data)){
                        const arr=data.data.map(x=>x.id);
                        c.modelList=arr;
                        arr.forEach(m=>{
                            if(!modelConfigs[m]){
                                modelConfigs[m]={
                                    apiKey:c.apiKey,
                                    apiBase:c.apiBase,
                                    discovered:true,
                                    modelList:[]
                                };
                            }
                        });
                        saveConfigs();
                        rebuildModelSelect();
                        alert("Models refreshed: "+arr.join(", "));
                    }
                }catch(e){
                    alert("Error parsing models:"+e);
                }
            },
            onerror:(err)=>{
                alert("Failed model refresh:"+JSON.stringify(err));
            }
        });
    }

    //======================================================================
    // 15) “Ask AI” 对话框
    //======================================================================
    function openAiDialog() {
        const overlay=document.createElement("div");
        overlay.style.position="fixed";
        overlay.style.top="0"; overlay.style.left="0";
        overlay.style.width="100%"; overlay.style.height="100%";
        overlay.style.backgroundColor="rgba(0,0,0,0.5)";
        overlay.style.zIndex="999999999";

        const box=document.createElement("div");
        box.style.position="absolute";
        box.style.top="50%"; box.style.left="50%";
        box.style.transform="translate(-50%,-50%)";
        box.style.width="320px";
        box.style.backgroundColor="#fff";
        box.style.borderRadius="6px";
        box.style.padding="10px";

        box.innerHTML=`
          <h3>${langText[config.language].askAiTitle}</h3>
          <textarea id="ai-helper-q" style="width:100%;height:80px;"></textarea>
          <button id="ai-helper-ask" style="margin-top:6px;">${langText[config.language].askAi}</button>
          <button id="ai-helper-close" style="margin-top:6px;">${langText[config.language].close}</button>
          <div id="ai-helper-output" style="margin-top:6px; border:1px solid #ccc; padding:4px; background:#fafafa;white-space:pre-wrap;"></div>
        `;
        overlay.appendChild(box);
        document.body.appendChild(overlay);

        const btnClose=box.querySelector("#ai-helper-close");
        const btnAsk=box.querySelector("#ai-helper-ask");
        const txtQ=box.querySelector("#ai-helper-q");
        const out=box.querySelector("#ai-helper-output");

        btnClose.addEventListener("click",()=>{
            document.body.removeChild(overlay);
        });
        btnAsk.addEventListener("click",()=>{
            let question=txtQ.value.trim();
            if(!question) return;
            out.textContent="(waiting...)";
            askAiHelper(question,(resp)=>{
                // 解析 markdown -> HTML
                const html= parseMarkdown(resp);
                out.innerHTML=html;
                // 识别 <answer>xxx</answer>
                const finalAns= parseAnswerTag(resp);
                if(finalAns){
                    out.innerHTML += `<p style="font-weight:bold; color:#d00; font-size:16px;">Answer: ${finalAns}</p>`;
                }
            },(err)=>{
                out.textContent="[Error] "+err;
            });
        });
    }
    function askAiHelper(userQ,onSuccess,onError){
        const c=modelConfigs[config.selectedModel]||{};
        const pay={
            model: config.selectedModel,
            messages: [
                {role:"system", content: "You are an AI helper. It's okay if you output markdown."},
                {role:"user", content: userQ}
            ]
        };
        GM_xmlhttpRequest({
            method:"POST",
            url: c.apiBase,
            headers:{
                "Content-Type":"application/json",
                "Authorization":"Bearer "+c.apiKey
            },
            data:JSON.stringify(pay),
            onload:(resp)=>{
                try{
                    const data=JSON.parse(resp.responseText);
                    const text=data.choices[0].message.content;
                    onSuccess(text);
                }catch(e){
                    onError("Parse error:"+e);
                }
            },
            onerror:(err)=>{
                onError(JSON.stringify(err));
            }
        });
    }

    //======================================================================
    // 16) Markdown 简易解析
    //======================================================================
    function parseMarkdown(md) {
        // 这里只做一个最基本的 markdown => HTML 转换
        // 1. ```xxx``` -> <pre><code>xxx</code></pre>
        // 2. **bold** -> <b>bold</b>
        // 3. *italic* -> <i>italic</i>
        // 视情况可再扩展
        let txt=md;

        // ```...``` code
        txt=txt.replace(/```([^`]+)```/g, (match, p1)=>{
            return `<pre style="background:#f4f4f4;padding:6px;"><code>${escapeHtml(p1)}</code></pre>`;
        });

        // **...**
        txt=txt.replace(/\*\*([^*]+)\*\*/g, (match,p1)=>{
            return `<b>${escapeHtml(p1)}</b>`;
        });

        // *...*
        txt=txt.replace(/\*([^*]+)\*/g, (match,p1)=>{
            return `<i>${escapeHtml(p1)}</i>`;
        });

        // 其它可以加(### heading => <h3>...), 这里先不加
        return txt;
    }
    function escapeHtml(str){
        return str.replace(/[<>&"]/g, (c)=>{
            switch(c){
                case '<':return "&lt;";
                case '>':return "&gt;";
                case '&':return "&amp;";
                case '"':return "&quot;";
            }
        });
    }

    //======================================================================
    // 17) <answer>xxx</answer> 解析
    //======================================================================
    function parseAnswerTag(txt) {
        const re=/<answer>([\s\S]*?)<\/answer>/i;
        const m=txt.match(re);
        return m? m[1].trim():null;
    }

    //======================================================================
    // 18) AnswerQuestion 主流程
    //======================================================================
    function getTargetDiv(){
        let d=document.evaluate(
            '/html/body/main/div/article/section/section/div/div[1]',
            document,null,XPathResult.FIRST_ORDERED_NODE_TYPE,null
        ).singleNodeValue;
        if(!d) d=document.querySelector('main div.article, main>div, article');
        return d;
    }
    function answerQuestion(){
        logMsg("Answer question triggered.");
        const target=getTargetDiv();
        if(!target){
            logMsg("No question area found!");
            return;
        }
        config.lastState=target.innerHTML;

        monitorDomChanges(target);

        let userStr="HTML:\n"+target.outerHTML+"\n";
        const la= captureLatex(target);
        if(la) userStr+="LaTeX:\n"+la+"\n";
        const c64= la? null : captureCanvasImg(target);
        if(c64) userStr+="Canvas base64 attached.\n";

        let sysStr="";
        if(config.mode==="displayOnly"){
            sysStr="You are a math solver for IXL. Provide explanation if you want. The final numeric/textual answer MUST appear in <answer>...</answer>. It's allowed to output markdown if you want. No LaTeX outside code blocks if possible.";
        } else {
            sysStr="You are a math solver for IXL. Provide a small explanation, plus a JS code block in triple backticks to fill answers automatically. The final answer MUST be in <answer>...</answer>. Markdown is allowed, but no LaTeX outside code if possible.";
        }

        UI.statusLine.textContent=langText[config.language].waiting;
        startProg();

        const pay={
            model: config.selectedModel,
            messages:[
                {role:"system", content:sysStr},
                {role:"user", content:userStr}
            ]
        };

        const c=modelConfigs[config.selectedModel]||{};
        GM_xmlhttpRequest({
            method:"POST",
            url:c.apiBase,
            headers:{
                "Content-Type":"application/json",
                "Authorization":"Bearer "+c.apiKey
            },
            data:JSON.stringify(pay),
            onload:(resp)=>{
                stopProg();
                try{
                    const data=JSON.parse(resp.responseText);
                    logDump("GPT AnswerResponse", data);
                    if(data.usage && data.usage.total_tokens){
                        config.totalTokens+=data.usage.total_tokens;
                        UI.tokenLabel.textContent=langText[config.language].tokens+config.totalTokens;
                    }
                    const gptOut=data.choices[0].message.content;
                    UI.answerBox.style.display="block";

                    // 先做 markdown => html
                    const mdHtml=parseMarkdown(gptOut);
                    // 识别 <answer>
                    const finalAns=parseAnswerTag(gptOut);
                    const steps=gptOut.replace(/<answer>[\s\S]*?<\/answer>/i,"").trim();

                    // 大块显示 final answer
                    if(finalAns){
                        UI.answerContent.innerHTML=escapeHtml(finalAns);
                    } else {
                        UI.answerContent.innerHTML=`<span style="color:red;font-weight:bold;">No <answer> tag found</span>`;
                        UI.statusLine.textContent="Missing <answer> tag.";
                    }
                    // 剩余步骤
                    UI.solutionSteps.textContent=steps;

                    if(config.mode==="autoFill"){
                        const codeMatch=gptOut.match(/```javascript\s+([\s\S]*?)```/i);
                        if(codeMatch && codeMatch[1]){
                            const code=codeMatch[1].trim();
                            runJsCode(code);
                            if(config.autoSubmit){
                                autoSubmitAnswers();
                            }
                        } else {
                            logMsg("No JS code found for auto fill.");
                        }
                    }
                    UI.statusLine.textContent=langText[config.language].complete;
                }catch(e){
                    logDump("Answer parse error", e);
                    UI.statusLine.textContent="Error parsing GPT output.";
                }
            },
            onerror:(err)=>{
                stopProg();
                UI.statusLine.textContent=langText[config.language].requestErr+JSON.stringify(err);
                logDump("Request error", err);
            }
        });
    }

    function captureLatex(el) {
        let arr=el.querySelectorAll('script[type="math/tex"], .MathJax, .mjx-chtml');
        if(arr.length>0){
            let ret="";
            arr.forEach(x=>ret+=x.textContent+"\n");
            return ret;
        }
        return null;
    }
    function captureCanvasImg(el) {
        let c=el.querySelector('canvas');
        if(c){
            const cv=document.createElement('canvas');
            cv.width=c.width;
            cv.height=c.height;
            cv.getContext('2d').drawImage(c,0,0);
            return cv.toDataURL("image/png").split(",")[1];
        }
        return null;
    }

    function runJsCode(code) {
        try{
            const sandbox={};
            (new Function("sandbox", "with(sandbox){"+code+"}"))(sandbox);
        }catch(e){
            logDump("Run code error", e);
        }
    }
    function autoSubmitAnswers(){
        let subBtn=document.evaluate(
            '/html/body/main/div/article/section/section/div/div[1]/section/div/section/div/button',
            document,null,XPathResult.FIRST_ORDERED_NODE_TYPE,null
        ).singleNodeValue;
        if(!subBtn){
            subBtn=document.querySelector('button.submit, button[class*="submit"]');
        }
        if(subBtn){
            logMsg("Auto-submitting answer now...");
            subBtn.click();
        } else {
            logMsg("No submit button found for autoSubmit.");
        }
    }

    function monitorDomChanges(el) {
        if(!el)return;
        const obs=new MutationObserver(muts=>{
            muts.forEach(m=>{
                logDump("DOM mutation", {added:m.addedNodes.length, removed:m.removedNodes.length});
            });
        });
        obs.observe(el,{childList:true, subtree:true});
        logMsg("Observing DOM changes on question area.");
    }

    //======================================================================
    // 19) 进度条
    //======================================================================
    let progTimer=null;
    function startProg(){
        UI.progressBox.style.display="block";
        UI.progressBar.value=0;
        progTimer=setInterval(()=>{
            if(UI.progressBar.value<95) UI.progressBar.value+=2;
        },200);
    }
    function stopProg(){
        if(progTimer){
            clearInterval(progTimer);
        }
        UI.progressBar.value=100;
        setTimeout(()=>{
            UI.progressBox.style.display="none";
            UI.progressBar.value=0;
        },400);
    }

    //======================================================================
    // 20) 初始化
    //======================================================================
    function initPanel(){
        // 构建下拉
        rebuildModelSelect();

        let selConf=modelConfigs[config.selectedModel]||{};
        UI.apiKeyInput.value=selConf.apiKey||"";
        UI.apiBaseInput.value=selConf.apiBase||"";
        updateManageLink();

        UI.modeSelect.value=config.mode;
        if(config.mode==="displayOnly"){
            UI.autoSubmitRow.style.display="none";
        }
        UI.langSelect.value=config.language;
        updateLangTexts();

        logMsg("Script loaded with old aesthetic, plain BG, larger UI, <answer> parse & markdown support.");
    }
    initPanel();

})();
