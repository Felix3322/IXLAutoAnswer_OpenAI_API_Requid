// ==UserScript==
// @name         IXL Auto Answer (OpenAI API Required)
// @namespace    http://tampermonkey.net/
// @version
// @license      GPL-3.0
// @description  Sends HTML and canvas data to AI models for math problem-solving with enhanced accuracy, configurable API base, improved GUI with progress bar, auto-answer functionality, token usage display, rollback and detailed DOM change logging. API key is tested by direct server request.
// @match        https://*.ixl.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @downloadURL  https://update.greasyfork.org/scripts/517259/IXL%20Auto%20Answer%20%28OpenAI%20API%20Required%29.user.js
// @updateURL    https://update.greasyfork.org/scripts/517259/IXL%20Auto%20Answer%20%28OpenAI%20API%20Required%29.meta.js
// ==/UserScript==

(function(){
    'use strict';

    // 1) 全局数据
    // 为兼容旧版本localStorage，若之前有则迁移；此段不会改动脚本顶部注释
    let oldConfigs1 = localStorage.getItem("gpt4o-modelConfigs");
    let oldConfigs2 = localStorage.getItem("ixlAutoAnswerConfigs");
    let newConfigs = localStorage.getItem("ixlAutoAnswerNew");
    if(!newConfigs) {
        if(oldConfigs1) {
            localStorage.setItem("ixlAutoAnswerNew", oldConfigs1);
            localStorage.removeItem("gpt4o-modelConfigs");
        } else if(oldConfigs2) {
            localStorage.setItem("ixlAutoAnswerNew", oldConfigs2);
            localStorage.removeItem("ixlAutoAnswerConfigs");
        }
    }
    let modelConfigs = JSON.parse(localStorage.getItem("ixlAutoAnswerNew") || "{}");
    if(!modelConfigs["gpt-4o"]) {
        modelConfigs["gpt-4o"] = {
            apiKey: "",
            apiBase: "https://api.openai.com/v1/chat/completions",
            discovered: false,
            modelList: []
        };
    }

    // 脚本配置
    let config = {
        selectedModel: "gpt-4o",
        language: localStorage.getItem("ixlAutoLang") || "en",
        mode: "displayOnly",    // "autoFill" or "displayOnly"
        autoSubmit: false,
        totalTokens: 0,
        lastState: null
    };

    function saveConfigs(){
        localStorage.setItem("ixlAutoAnswerNew", JSON.stringify(modelConfigs));
        localStorage.setItem("ixlAutoLang", config.language);
    }

    // 2) 文本资源
    let langText = {
        en: {
            topTitle: "IXL Auto Answer (OpenAI API Required)",
            modeLabel: "Mode",
            modeAuto: "Auto Fill",
            modeDisp: "Display Only",
            start: "Start",
            rollback: "Rollback",
            confAssist: "Config Assistant",
            close: "Close",
            logs: "Logs",
            hideLogs: "Hide Logs",
            tokens: "Tokens: ",
            statusIdle: "Status: Idle",
            statusWait: "Waiting for GPT...",
            statusDone: "Done.",
            requestErr: "Request error: ",
            finalAnsTitle: "Final Answer",
            stepsTitle: "Solution Steps",
            missingAnswerTag: "Missing <answer> tag",
            modelSelection: "Model",
            modelDesc: "Model Description",
            customModelPlaceholder: "Custom model name",
            language: "Language",
            autoSubmit: "Auto Submit",
            rentKey: "Rent Key",
            apikey: "API Key",
            save: "Save",
            testKey: "Test Key",
            testKeyIng: "Testing Key...",
            keyValid: "API key valid.",
            keyInvalid: "API key invalid (no 'test success').",
            placeKey: "Enter your API key",
            placeBase: "Enter your API base URL",
            apiBase: "API Base",
            refreshModels: "Refresh Models",
            getKeyLink: "Get API Key",
            shortAI: "AI"
        },
        zh: {
            topTitle: "IXL自动解题(OpenAI)",
            modeLabel: "模式",
            modeAuto: "自动填写",
            modeDisp: "仅展示答案",
            start: "开始",
            rollback: "撤回",
            confAssist: "配置助手",
            close: "关闭",
            logs: "日志",
            hideLogs: "隐藏日志",
            tokens: "用量：",
            statusIdle: "状态：空闲",
            statusWait: "等待GPT...",
            statusDone: "完成。",
            requestErr: "请求错误：",
            finalAnsTitle: "最终答案",
            stepsTitle: "解题过程",
            missingAnswerTag: "缺少<answer>标签",
            modelSelection: "模型",
            modelDesc: "模型说明",
            customModelPlaceholder: "自定义模型名称",
            language: "语言",
            autoSubmit: "自动提交",
            rentKey: "租用Key",
            apikey: "API密钥",
            save: "保存",
            testKey: "测试Key",
            testKeyIng: "正在测试...",
            keyValid: "密钥有效",
            keyInvalid: "密钥无效(未见'test success')",
            placeKey: "输入API Key",
            placeBase: "输入API Base",
            apiBase: "API基础地址",
            refreshModels: "刷新模型",
            getKeyLink: "获取API Key",
            shortAI: "AI"
        }
    };

    // 模型说明(固定英文)
    let modelDescs = {
        "gpt-4o":"Solves images, cost-effective.",
        "gpt-4o-mini":"Handles text-only, cheaper.",
        "o1":"Best for images, but slow & expensive.",
        "o3-mini":"Text-only, cheaper than o1.",
        "deepseek-reasoner":"No images, cheaper than o1.",
        "deepseek-chat":"No images, cheaper & fast.",
        "chatgpt-4o-least":"RLHF version, error-prone.",
        "custom":"User-defined."
    };

    // 3) GUI
    let panel = document.createElement("div");
    panel.id="ixl-gui-panel";
    panel.innerHTML=`
      <div class="header-bar">
        <span id="header-title">${langText[config.language].topTitle}</span>
        <span id="token-count">${langText[config.language].tokens}0</span>
        <button id="log-btn">${langText[config.language].logs}</button>
        <button id="close-btn">${langText[config.language].close}</button>
      </div>
      <div class="content-body">
        <div class="row">
          <label>${langText[config.language].modeLabel}:</label>
          <select id="mode-select" style="width:100%;">
            <option value="autoFill">${langText[config.language].modeAuto}</option>
            <option value="displayOnly">${langText[config.language].modeDisp}</option>
          </select>
        </div>
        <div class="row" style="display:flex; gap:8px; margin-top:6px;">
          <button id="start-btn" class="accent-btn" style="flex:1;">${langText[config.language].start}</button>
          <button id="rollback-btn" class="gray-btn" style="flex:1;">${langText[config.language].rollback}</button>
          <button id="conf-assist-btn" class="mini-btn" style="flex:0;">${langText[config.language].confAssist}</button>
        </div>

        <div id="answer-container" style="display:none; border:1px solid #999; padding:6px; background:#fff; margin-top:8px;">
          <h4 id="answer-title">${langText[config.language].finalAnsTitle}</h4>
          <div id="answer-content" style="font-size:15px; font-weight:bold; color:#080;"></div>
          <hr/>
          <h5 id="steps-label">${langText[config.language].stepsTitle}</h5>
          <div id="steps-content" style="font-size:13px; color:#666;"></div>
        </div>

        <div id="progress-panel" style="display:none; margin-top:8px;">
          <progress id="progress-bar" max="100" value="0" style="width:100%;"></progress>
          <span id="progress-label">${langText[config.language].statusWait}</span>
        </div>
        <p id="status-line" style="font-weight:bold; margin-top:6px;">${langText[config.language].statusIdle}</p>

        <div id="log-box" style="display:none; max-height:120px; overflow-y:auto; background:#fff; border:1px solid #888; margin-top:6px; padding:4px; font-family:monospace;"></div>

        <div class="row" style="margin-top:10px;">
          <label>${langText[config.language].modelSelection}:</label>
          <select id="model-select" style="width:100%;"></select>
          <p id="model-desc" style="font-size:12px; color:#666;"></p>
          <div id="custom-model-area" style="display:none;">
            <input type="text" id="custom-model-input" style="width:100%;" placeholder="${langText[config.language].customModelPlaceholder}" />
          </div>
        </div>

        <div class="row" style="margin-top:6px;">
          <label>${langText[config.language].language}:</label>
          <select id="lang-select" style="width:100%;">
            <option value="en">English</option>
            <option value="zh">中文</option>
          </select>
        </div>

        <div id="autosubmit-row" style="margin-top:6px;">
          <label style="display:block;">${langText[config.language].autoSubmit}:</label>
          <input type="checkbox" id="auto-submit-toggle" />
        </div>

        <button id="rent-btn" class="gray-btn" style="margin-top:8px; width:100%;">${langText[config.language].rentKey}</button>

        <div class="row" style="margin-top:10px;">
          <label>${langText[config.language].apikey}:</label>
          <div style="display:flex; gap:4px; margin-top:4px;">
            <input type="password" id="api-key" style="flex:1;" placeholder="${langText[config.language].placeKey}" />
            <button id="save-key-btn">${langText[config.language].save}</button>
            <button id="test-key-btn">${langText[config.language].testKey}</button>
          </div>
        </div>

        <div class="row" style="margin-top:8px;">
          <label>${langText[config.language].apiBase}:</label>
          <div style="display:flex; gap:4px; margin-top:4px;">
            <input type="text" id="api-base" style="flex:1;" placeholder="${langText[config.language].placeBase}" />
            <button id="save-base-btn">${langText[config.language].save}</button>
          </div>
        </div>

        <label style="margin-top:6px; display:block;">${langText[config.language].getKeyLink}:</label>
        <div style="display:flex; gap:4px; margin-top:4px;">
          <a id="manage-link" href="#" target="_blank" class="link-btn" style="flex:1;">Link</a>
          <button id="refresh-models-btn" class="gray-btn" style="flex:1;">${langText[config.language].refreshModels}</button>
        </div>
      </div>
    `;
    document.body.appendChild(panel);

    GM_addStyle(`
      .header-bar {
        background: #4caf50;
        color: #fff;
        padding: 6px;
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 6px;
      }
      #header-title {
        font-weight: bold;
        margin-right: auto;
      }
      #ixl-gui-panel {
        position: fixed;
        top:20px; right:20px;
        width:430px;
        background:#fff;
        border-radius:6px;
        box-shadow:0 2px 10px rgba(0,0,0,0.3);
        font-family: "Segoe UI", Arial, sans-serif;
        z-index:999999999;
        font-size:14px;
      }
      .content-body { padding:10px; }
      .row { margin-top:6px; }
      .accent-btn {
        background:#f0ad4e; color:#fff; border:none; border-radius:4px; font-weight:bold;
      }
      .accent-btn:hover { background:#ec971f; }
      .gray-btn {
        background:#ddd; color:#333; border:none; border-radius:4px;
      }
      .gray-btn:hover { background:#ccc; }
      .mini-btn {
        background:#bbb; color:#333; border:none; border-radius:4px; font-size:12px; padding:4px 8px;
      }
      .mini-btn:hover { background:#aaa; }
      .link-btn {
        background:#2f8ee0; color:#fff; border-radius:4px; text-decoration:none; text-align:center; padding:6px;
      }
      .link-btn:hover { opacity:0.8; }
    `);

    let UI = {
        panel,
        logBox: document.getElementById("log-box"),
        logBtn: document.getElementById("log-btn"),
        closeBtn: document.getElementById("close-btn"),
        tokenCount: document.getElementById("token-count"),
        modeSelect: document.getElementById("mode-select"),
        startBtn: document.getElementById("start-btn"),
        rollbackBtn: document.getElementById("rollback-btn"),
        confAssistBtn: document.getElementById("conf-assist-btn"),
        answerContainer: document.getElementById("answer-container"),
        answerContent: document.getElementById("answer-content"),
        stepsContent: document.getElementById("steps-content"),
        progressPanel: document.getElementById("progress-panel"),
        progressBar: document.getElementById("progress-bar"),
        progressLabel: document.getElementById("progress-label"),
        statusLine: document.getElementById("status-line"),
        modelSelect: document.getElementById("model-select"),
        modelDesc: document.getElementById("model-desc"),
        customModelArea: document.getElementById("custom-model-area"),
        customModelInput: document.getElementById("custom-model-input"),
        langSelect: document.getElementById("lang-select"),
        autoSubmitRow: document.getElementById("autosubmit-row"),
        autoSubmitToggle: document.getElementById("auto-submit-toggle"),
        rentBtn: document.getElementById("rent-btn"),
        apiKeyInput: document.getElementById("api-key"),
        saveKeyBtn: document.getElementById("save-key-btn"),
        testKeyBtn: document.getElementById("test-key-btn"),
        apiBaseInput: document.getElementById("api-base"),
        saveBaseBtn: document.getElementById("save-base-btn"),
        manageLink: document.getElementById("manage-link"),
        refreshModelsBtn: document.getElementById("refresh-models-btn")
    };

    function logMsg(m){
        let now=new Date().toLocaleString();
        let div=document.createElement("div");
        div.textContent=`[${now}] ${m}`;
        UI.logBox.appendChild(div);
        console.log("[Log]", m);
    }
    function logDump(label, val){
        let s=`[DUMP] ${label}: `;
        try { s+=JSON.stringify(val);}catch(e){s+=String(val);}
        logMsg(s);
    }

    function updateLangText(){
        UI.logBtn.textContent=(UI.logBox.style.display==="none")?langText[config.language].logs:langText[config.language].hideLogs;
        UI.closeBtn.textContent=langText[config.language].close;
        UI.tokenCount.textContent=langText[config.language].tokens+config.totalTokens;
        UI.statusLine.textContent=langText[config.language].statusIdle;
        UI.progressLabel.textContent=langText[config.language].statusWait;
        UI.modeSelect.options[0].text=langText[config.language].modeAuto;
        UI.modeSelect.options[1].text=langText[config.language].modeDisp;
        UI.startBtn.textContent=langText[config.language].start;
        UI.rollbackBtn.textContent=langText[config.language].rollback;
        UI.confAssistBtn.textContent=langText[config.language].confAssist;
        document.getElementById("answer-title").textContent=langText[config.language].finalAnsTitle;
        document.getElementById("steps-label").textContent=langText[config.language].stepsTitle;
        UI.apiKeyInput.placeholder=langText[config.language].placeKey;
        UI.saveKeyBtn.textContent=langText[config.language].save;
        UI.testKeyBtn.textContent=langText[config.language].testKey;
        UI.apiBaseInput.placeholder=langText[config.language].placeBase;
        UI.saveBaseBtn.textContent=langText[config.language].save;
        UI.manageLink.textContent="Link";
        UI.refreshModelsBtn.textContent=langText[config.language].refreshModels;
        UI.rentBtn.textContent=langText[config.language].rentKey;
    }

    function rebuildModelSelect(){
        UI.modelSelect.innerHTML="";
        let ogPre=document.createElement("optgroup");
        ogPre.label="Predefined";
        let predef=["gpt-4o","gpt-4o-mini","o1","o3-mini","deepseek-reasoner","deepseek-chat","chatgpt-4o-least"];
        predef.forEach(m=>{
            let opt=document.createElement("option");
            opt.value=m; opt.textContent=m;
            ogPre.appendChild(opt);
        });
        UI.modelSelect.appendChild(ogPre);
        let discovered=Object.keys(modelConfigs).filter(k=>modelConfigs[k].discovered);
        if(discovered.length>0){
            let ogDisc=document.createElement("optgroup");
            ogDisc.label="Discovered";
            discovered.forEach(m=>{
                let op=document.createElement("option");
                op.value=m; op.textContent=m;
                ogDisc.appendChild(op);
            });
            UI.modelSelect.appendChild(ogDisc);
        }
        let opCust=document.createElement("option");
        opCust.value="custom"; opCust.textContent="custom";
        UI.modelSelect.appendChild(opCust);

        if(UI.modelSelect.querySelector(`option[value="${config.selectedModel}"]`)){
            UI.modelSelect.value=config.selectedModel;
        } else {
            UI.modelSelect.value="custom";
        }
        UI.modelDesc.textContent=modelDescs[config.selectedModel]||"User-defined model";
        UI.customModelArea.style.display=(config.selectedModel==="custom")?"block":"none";
    }

    UI.logBtn.addEventListener("click",()=>{
        if(UI.logBox.style.display==="none"){
            UI.logBox.style.display="block";
            UI.logBtn.textContent=langText[config.language].hideLogs;
        } else {
            UI.logBox.style.display="none";
            UI.logBtn.textContent=langText[config.language].logs;
        }
    });
    UI.closeBtn.addEventListener("click",()=>{
        panel.style.display="none";
        logMsg("Panel closed");
    });
    UI.modeSelect.addEventListener("change",()=>{
        config.mode=UI.modeSelect.value;
        if(config.mode==="autoFill"){
            UI.answerContainer.style.display="none";
            UI.autoSubmitRow.style.display="block";
        } else {
            UI.answerContainer.style.display="none";
            UI.autoSubmitRow.style.display="none";
        }
    });
    UI.startBtn.addEventListener("click",()=>{
        doAnswerQuestion();
    });
    UI.rollbackBtn.addEventListener("click",()=>{
        if(config.lastState){
            let tg=getQuestionDiv();
            if(tg){
                tg.innerHTML=config.lastState;
                logMsg("Rolled back question area");
            }
        } else {
            logMsg("No previous state to rollback");
        }
    });
    UI.confAssistBtn.addEventListener("click",()=>{
        openConfigAssist();
    });
    UI.autoSubmitToggle.addEventListener("change",()=>{
        config.autoSubmit=UI.autoSubmitToggle.checked;
        logDump("autoSubmit",config.autoSubmit);
    });
    UI.modelSelect.addEventListener("change",()=>{
        config.selectedModel=UI.modelSelect.value;
        if(!modelConfigs[config.selectedModel]){
            modelConfigs[config.selectedModel]={
                apiKey:"",
                apiBase:"https://api.openai.com/v1/chat/completions",
                discovered:false, modelList:[]
            };
        }
        UI.customModelArea.style.display=(config.selectedModel==="custom")?"block":"none";
        UI.modelDesc.textContent=modelDescs[config.selectedModel]||"User-defined model";
        UI.apiKeyInput.value=modelConfigs[config.selectedModel].apiKey||"";
        UI.apiBaseInput.value=modelConfigs[config.selectedModel].apiBase||"";
        if(config.selectedModel.toLowerCase().includes("deepseek")){
            UI.apiBaseInput.value="https://api.deepseek.com/v1/chat/completions";
            modelConfigs[config.selectedModel].apiBase="https://api.deepseek.com/v1/chat/completions";
        }
        updateManageLink();
    });
    UI.customModelInput.addEventListener("change",()=>{
        let name=UI.customModelInput.value.trim();
        if(!name)return;
        config.selectedModel=name;
        if(!modelConfigs[name]){
            modelConfigs[name]={
                apiKey:"",
                apiBase:"https://api.openai.com/v1/chat/completions",
                discovered:false, modelList:[]
            };
        }
        rebuildModelSelect();
        UI.modelSelect.value="custom";
        UI.apiKeyInput.value=modelConfigs[name].apiKey||"";
        UI.apiBaseInput.value=modelConfigs[name].apiBase||"";
        updateManageLink();
    });
    UI.langSelect.addEventListener("change",()=>{
        config.language=UI.langSelect.value;
        saveConfigs();
        updateLangText();
    });
    UI.rentBtn.addEventListener("click",()=>{
        showRentPopup();
    });
    UI.saveKeyBtn.addEventListener("click",()=>{
        let newKey=UI.apiKeyInput.value.trim();
        modelConfigs[config.selectedModel].apiKey=newKey;
        saveConfigs();
        logMsg("Saved API Key");
    });
    UI.testKeyBtn.addEventListener("click",()=>{
        testApiKey();
    });
    UI.saveBaseBtn.addEventListener("click",()=>{
        let nb=UI.apiBaseInput.value.trim();
        modelConfigs[config.selectedModel].apiBase=nb;
        saveConfigs();
        logMsg("Saved API Base");
    });
    UI.refreshModelsBtn.addEventListener("click",()=>{
        refreshModels();
    });

    function updateManageLink(){
        let mod=config.selectedModel.toLowerCase();
        let link="#";
        if(mod.includes("deepseek")){
            link="https://platform.deepseek.com/api_keys";
        } else {
            link="https://platform.openai.com/api-keys";
        }
        modelConfigs[config.selectedModel].manageUrl=link;
        UI.manageLink.href=link;
        saveConfigs();
    }

    function showRentPopup(){
        let overlay=document.createElement("div");
        overlay.style.position="fixed";
        overlay.style.top="0";
        overlay.style.left="0";
        overlay.style.width="100%";
        overlay.style.height="100%";
        overlay.style.backgroundColor="rgba(0,0,0,0.4)";
        overlay.style.zIndex="999999999";

        let box=document.createElement("div");
        box.style.position="absolute";
        box.style.top="50%";
        box.style.left="50%";
        box.style.transform="translate(-50%,-50%)";
        box.style.width="320px";
        box.style.backgroundColor="#fff";
        box.style.borderRadius="6px";
        box.style.padding="10px";

        box.innerHTML=`
          <h3>Rent API Key</h3>
          <p>Contact me at:</p>
          <ul>
            <li>felixliujy@Gmail.com</li>
            <li>admin@obanarchy.org</li>
          </ul>
          <button id="close-rent-btn">${langText[config.language].close}</button>
        `;
        overlay.appendChild(box);
        document.body.appendChild(overlay);
        box.querySelector("#close-rent-btn").addEventListener("click",()=>{
            document.body.removeChild(overlay);
        });
    }

    function testApiKey(){
        UI.statusLine.textContent=langText[config.language].testKeyIng;
        let conf=modelConfigs[config.selectedModel];
        let payload={
            model: config.selectedModel,
            messages:[
                {role:"system", content:"Key test assistant."},
                {role:"user", content:"Please ONLY respond with: test success"}
            ]
        };
        GM_xmlhttpRequest({
            method:"POST",
            url:conf.apiBase,
            headers:{
                "Content-Type":"application/json",
                "Authorization":"Bearer "+conf.apiKey
            },
            data:JSON.stringify(payload),
            onload:(resp)=>{
                UI.statusLine.textContent=langText[config.language].statusIdle;
                try{
                    let data=JSON.parse(resp.responseText);
                    let ans=data.choices[0].message.content.toLowerCase();
                    if(ans.includes("test success")) alert(langText[config.language].keyValid);
                    else alert(langText[config.language].keyInvalid);
                } catch(e){
                    alert("Error parsing test result:"+e);
                }
            },
            onerror:(err)=>{
                UI.statusLine.textContent=langText[config.language].statusIdle;
                alert("Key test failed: "+JSON.stringify(err));
            }
        });
    }

    function refreshModels(){
        let c=modelConfigs[config.selectedModel];
        if(!c)return;
        let url=c.apiBase.replace("/chat/completions","/models");
        logMsg("Refreshing models from: "+url);
        GM_xmlhttpRequest({
            method:"GET",
            url,
            headers:{
                "Authorization":"Bearer "+c.apiKey
            },
            onload:(resp)=>{
                try{
                    let data=JSON.parse(resp.responseText);
                    logDump("Refresh Models Resp", data);
                    if(Array.isArray(data.data)){
                        let arr=data.data.map(x=>x.id);
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
                    alert("Error parsing model list:"+e);
                }
            },
            onerror:(err)=>{
                alert("Refresh models error: "+JSON.stringify(err));
            }
        });
    }

    function openConfigAssist(){
        let overlay=document.createElement("div");
        overlay.style.position="fixed";
        overlay.style.top="0";
        overlay.style.left="0";
        overlay.style.width="100%";
        overlay.style.height="100%";
        overlay.style.backgroundColor="rgba(0,0,0,0.5)";
        overlay.style.zIndex="999999999";

        let box=document.createElement("div");
        box.style.position="absolute";
        box.style.top="50%";
        box.style.left="50%";
        box.style.transform="translate(-50%,-50%)";
        box.style.width="320px";
        box.style.backgroundColor="#fff";
        box.style.borderRadius="6px";
        box.style.padding="10px";

        box.innerHTML=`
          <h3>${langText[config.language].confAssist}</h3>
          <textarea id="assist-q" style="width:100%;height:80px;"></textarea>
          <button id="assist-submit" style="margin-top:6px;">${langText[config.language].shortAI}</button>
          <button id="assist-close" style="margin-top:6px;">${langText[config.language].close}</button>
          <div id="assist-output" style="margin-top:6px; border:1px solid #ccc; background:#fafafa; padding:6px; white-space:pre-wrap;"></div>
        `;
        overlay.appendChild(box);
        document.body.appendChild(overlay);

        let btnClose=box.querySelector("#assist-close");
        btnClose.addEventListener("click",()=>{
            document.body.removeChild(overlay);
        });
        let btnSubmit=box.querySelector("#assist-submit");
        let txt=box.querySelector("#assist-q");
        let out=box.querySelector("#assist-output");
        btnSubmit.addEventListener("click",()=>{
            let q=txt.value.trim();
            if(!q)return;
            out.textContent="(waiting...)";
            askConfigAssistant(q,(resp)=>{
                out.textContent=resp;
            },(err)=>{
                out.textContent="[Error] "+err;
            });
        });
    }

    function askConfigAssistant(question,onSuccess,onError){
        let c=modelConfigs[config.selectedModel]||{};
        let pay={
            model: config.selectedModel,
            messages:[
                {role:"system", content:"You are a config assistant for the user. They might want to reconfigure the script. Provide helpful answers."},
                {role:"user", content: question}
            ]
        };
        GM_xmlhttpRequest({
            method:"POST",
            url:c.apiBase,
            headers:{
                "Content-Type":"application/json",
                "Authorization":"Bearer "+c.apiKey
            },
            data:JSON.stringify(pay),
            onload:(resp)=>{
                try{
                    let data=JSON.parse(resp.responseText);
                    let ans=data.choices[0].message.content;
                    onSuccess(ans);
                } catch(e){
                    onError("Parse error:"+e);
                }
            },
            onerror:(err)=>{
                onError(JSON.stringify(err));
            }
        });
    }

    function getQuestionDiv(){
        let targ=document.evaluate(
            '/html/body/main/div/article/section/section/div/div[1]',
            document,null,XPathResult.FIRST_ORDERED_NODE_TYPE,null
        ).singleNodeValue;
        if(!targ){
            targ=document.querySelector('main div.article, main>div, article');
        }
        return targ;
    }

    let progTimer=null;
    function startProgress(){
        UI.progressPanel.style.display="block";
        UI.progressBar.value=0;
        progTimer=setInterval(()=>{
            if(UI.progressBar.value<90) UI.progressBar.value+=2;
        },200);
    }
    function stopProgress(){
        if(progTimer)clearInterval(progTimer);
        UI.progressBar.value=100;
        setTimeout(()=>{
            UI.progressPanel.style.display="none";
            UI.progressBar.value=0;
        },400);
    }

    function doAnswerQuestion(){
        logMsg("AnswerQuestion triggered");
        let tgt=getQuestionDiv();
        if(!tgt){
            logMsg("No question area found!");
            return;
        }
        config.lastState=tgt.innerHTML;

        let userPrompt="HTML:\n"+tgt.outerHTML+"\n";
        let latexCap=captureLatex(tgt);
        if(latexCap) userPrompt+="LaTeX:\n"+latexCap+"\n";
        let c64=latexCap? null : captureCanvas(tgt);
        if(c64) userPrompt+="Canvas base64 attached.\n";

        UI.answerContainer.style.display="none";

        let sysPrompt="";
        if(config.mode==="autoFill"){
            sysPrompt="You are an IXL solver. Provide minimal steps if needed, plus a JavaScript code block to fill the answer. The final numeric/textual result MUST appear in <answer>...</answer> and do not forget to produce code. No LaTeX outside code block. You can output markdown if you want.";
        } else {
            sysPrompt="You are an IXL solver. Provide steps if you like, but the final numeric/textual result MUST appear in <answer>...</answer>. No code is needed. You can output markdown if you want.";
        }

        UI.statusLine.textContent=langText[config.language].statusWait;
        startProgress();

        let pay={
            model: config.selectedModel,
            messages:[
                {role:"system", content:sysPrompt},
                {role:"user", content:userPrompt}
            ]
        };
        let cConf=modelConfigs[config.selectedModel]||{};
        GM_xmlhttpRequest({
            method:"POST",
            url:cConf.apiBase,
            headers:{
                "Content-Type":"application/json",
                "Authorization":"Bearer "+cConf.apiKey
            },
            data:JSON.stringify(pay),
            onload:(resp)=>{
                stopProgress();
                try{
                    let data=JSON.parse(resp.responseText);
                    logDump("GPT answer", data);
                    if(data.usage && data.usage.total_tokens){
                        config.totalTokens+=data.usage.total_tokens;
                        UI.tokenCount.textContent=langText[config.language].tokens+config.totalTokens;
                    }
                    let output=data.choices[0].message.content;
                    let finalAns=parseAnswerTag(output);
                    let steps=output.replace(/<answer>[\s\S]*?<\/answer>/i,"").trim();
                    UI.answerContainer.style.display="block";
                    if(finalAns){
                        UI.answerContent.textContent=finalAns;
                    } else {
                        UI.answerContent.innerHTML=`<span style="color:red;font-weight:bold;">${langText[config.language].missingAnswerTag}</span>`;
                    }
                    UI.stepsContent.textContent=steps;
                    if(config.mode==="autoFill"){
                        let codeMatch=output.match(/```javascript\s+([\s\S]*?)```/i);
                        if(codeMatch && codeMatch[1]){
                            runJsCode(codeMatch[1].trim());
                            if(config.autoSubmit) doAutoSubmit();
                        } else {
                            logMsg("No JavaScript code found for auto fill");
                        }
                    }
                    UI.statusLine.textContent=langText[config.language].statusDone;
                } catch(e){
                    UI.statusLine.textContent="Parse GPT error.";
                    logDump("Parse GPT error", e);
                }
            },
            onerror:(err)=>{
                stopProgress();
                UI.statusLine.textContent=langText[config.language].requestErr+JSON.stringify(err);
                logDump("Request error",err);
            }
        });
    }

    function parseAnswerTag(txt){
        let re=/<answer>([\s\S]*?)<\/answer>/i;
        let m=txt.match(re);
        return m?m[1].trim():null;
    }
    function captureLatex(el){
        let arr=el.querySelectorAll('script[type="math/tex"], .MathJax, .mjx-chtml');
        if(arr.length>0){
            let out="";
            arr.forEach(e=>out+=e.textContent+"\n");
            return out;
        }
        return null;
    }
    function captureCanvas(el){
        let c=el.querySelector("canvas");
        if(c){
            let cv=document.createElement("canvas");
            cv.width=c.width; cv.height=c.height;
            cv.getContext("2d").drawImage(c,0,0);
            return cv.toDataURL("image/png").split(",")[1];
        }
        return null;
    }
    function runJsCode(code){
        try{
            let sandbox={};
            (new Function("sandbox", "with(sandbox){"+code+"}"))(sandbox);
        }catch(e){
            logDump("Run code error", e);
        }
    }
    function doAutoSubmit(){
        let subBtn=document.evaluate(
            '/html/body/main/div/article/section/section/div/div[1]/section/div/section/div/button',
            document,null,XPathResult.FIRST_ORDERED_NODE_TYPE,null
        ).singleNodeValue;
        if(!subBtn){
            subBtn=document.querySelector("button.submit, button[class*='submit']");
        }
        if(subBtn){
            logMsg("Auto-submitting the answer...");
            subBtn.click();
        } else {
            logMsg("No submit button found for autoSubmit");
        }
    }

    let progTmr=null;
    function startProgress(){
        UI.progressPanel.style.display="block";
        UI.progressBar.value=0;
        progTmr=setInterval(()=>{
            if(UI.progressBar.value<95) UI.progressBar.value+=2;
        },200);
    }
    function stopProgress(){
        if(progTmr)clearInterval(progTmr);
        UI.progressBar.value=100;
        setTimeout(()=>{
            UI.progressPanel.style.display="none";
            UI.progressBar.value=0;
        },400);
    }

    function initAll(){
        rebuildModelSelect();
        let c=modelConfigs[config.selectedModel]||{};
        UI.apiKeyInput.value=c.apiKey||"";
        UI.apiBaseInput.value=c.apiBase||"";
        updateManageLink();
        UI.modeSelect.value=config.mode;
        if(config.mode==="displayOnly"){
            UI.answerContainer.style.display="none";
            UI.autoSubmitRow.style.display="none";
        }
        UI.langSelect.value=config.language;
        updateLangText();
        logMsg("Script loaded with singled column, separate prompts, old data migration, etc.");
    }
    initAll();

})();
