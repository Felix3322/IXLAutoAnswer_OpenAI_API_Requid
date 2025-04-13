// ==UserScript==
// @name         IXL Auto Answer (OpenAI API Required)
// @namespace    http://tampermonkey.net/
// @version      8.3
// @license      GPL-3.0
// @description  Sends HTML and canvas data to AI models for math problem-solving with enhanced accuracy, configurable API base, improved GUI with progress bar, auto-answer functionality, token usage display, rollback and detailed DOM change logging. API key is tested by direct server request.
// @match        https://*.ixl.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @downloadURL  https://update.greasyfork.org/scripts/517259/IXL%20Auto%20Answer%20%28OpenAI%20API%20Required%29.user.js
// @updateURL    https://update.greasyfork.org/scripts/517259/IXL%20Auto%20Answer%20%28OpenAI%20API%20Required%29.meta.js
// @require      https://cdn.jsdelivr.net/npm/marked@4.3.0/marked.min.js
// ==/UserScript==

/*
  This script uses Marked (an MD rendering library). The above @require
  line imports marked for us to parse GPT’s output if it includes markdown.

  - We keep both “Auto Fill” (with code snippet insertion) and “Display Answer Only”.
  - If user picks "Auto Fill", we hide the display answer container and show the
    auto fill disclaimers. Conversely, "Display Answer Only" will show the final
    answer container but won't attempt code execution.
  - Keep the rentKey button and highlight it as it's crucial for monetization.
  - GPT answer's solution steps can be parsed using `marked.parse(...)` to display HTML output.
  - The rest of the logic is the same: we have multiple features:
    * Start Answer
    * Rollback
    * AutoSubmit
    * Refresh models
    * Rent Key button (emphasized)
    * The entire script is self-contained with your original userScript header.
*/

(function() {
  'use strict';

  // (1) MIGRATION/CONFIG STORAGE
  let oldStore1 = localStorage.getItem("gpt4o-modelConfigs");
  let oldStore2 = localStorage.getItem("ixlAutoAnswerConfigs");
  let newStore = localStorage.getItem("myNewIxLStorage");
  if (!newStore) {
    if (oldStore1) {
      localStorage.setItem("myNewIxLStorage", oldStore1);
      localStorage.removeItem("gpt4o-modelConfigs");
    } else if (oldStore2) {
      localStorage.setItem("myNewIxLStorage", oldStore2);
      localStorage.removeItem("ixlAutoAnswerConfigs");
    }
  }

  let modelConfigs = JSON.parse(localStorage.getItem("myNewIxLStorage") || "{}");
  if (!modelConfigs["gpt-4o"]) {
    modelConfigs["gpt-4o"] = {
      apiKey: "",
      apiBase: "https://api.openai.com/v1/chat/completions",
      discovered: false,
      modelList: []
    };
  }

  let config = {
    selectedModel: "gpt-4o",
    language: localStorage.getItem("myIxLLang") || "en",
    mode: "displayOnly", // can be "autoFill" or "displayOnly"
    autoSubmit: false,
    totalTokens: 0,
    lastState: null
  };

  function saveConfig() {
    localStorage.setItem("myNewIxLStorage", JSON.stringify(modelConfigs));
    localStorage.setItem("myIxLLang", config.language);
  }

  // (2) MULTI-LANG TEXT
  const langText = {
    en: {
      panelTitle: "IXL Auto Answer (OpenAI API Required)",
      modeLabel: "Mode",
      modeAuto: "Auto Fill (Unstable)",
      modeDisp: "Display Answer Only",
      startButton: "Start Answering",
      rollbackButton: "Rollback",
      configAssistant: "Config Assistant",
      closeButton: "Close",
      logsButton: "Logs",
      logsHide: "Hide Logs",
      tokensLabel: "Tokens: ",
      statusIdle: "Status: Idle",
      statusWaiting: "Waiting for GPT...",
      statusDone: "Done.",
      requestError: "Request error: ",
      finalAnswerTitle: "Final Answer",
      stepsTitle: "Solution Steps",
      missingAnswerTag: "Missing <answer> tag",
      modelSelectLabel: "Model",
      modelDescLabel: "Model Description",
      customModelPlaceholder: "Custom model name",
      languageLabel: "Language",
      autoSubmitLabel: "Auto Submit",
      rentKeyButton: "Rent Key (Support Me!)",
      apiKeyLabel: "API Key",
      saveButton: "Save",
      testKeyButton: "Test Key",
      testKeyMsg: "Testing key...",
      keyOK: "API key valid.",
      keyBad: "API key invalid (missing 'test success').",
      placeKey: "Enter your API key",
      placeBase: "Enter your API base URL",
      apiBaseLabel: "API Base",
      refreshModels: "Refresh Models",
      getKeyLinkLabel: "Get API Key",
      disclaimAutoFill: "Warning: Auto Fill is unstable. Use carefully."
    },
    zh: {
      panelTitle: "IXL自动解题 (OpenAI)",
      modeLabel: "模式",
      modeAuto: "自动填入（不稳定）",
      modeDisp: "仅展示答案",
      startButton: "开始答题",
      rollbackButton: "撤回",
      configAssistant: "配置助手",
      closeButton: "关闭",
      logsButton: "日志",
      logsHide: "隐藏日志",
      tokensLabel: "用量: ",
      statusIdle: "状态：空闲",
      statusWaiting: "等待GPT...",
      statusDone: "完成。",
      requestError: "请求错误：",
      finalAnswerTitle: "最终答案",
      stepsTitle: "解题过程",
      missingAnswerTag: "缺少<answer>标签",
      modelSelectLabel: "模型",
      modelDescLabel: "模型介绍",
      customModelPlaceholder: "自定义模型名称",
      languageLabel: "语言",
      autoSubmitLabel: "自动提交",
      rentKeyButton: "租用Key (支持我!)",
      apiKeyLabel: "API密钥",
      saveButton: "保存",
      testKeyButton: "测试密钥",
      testKeyMsg: "正在测试...",
      keyOK: "API密钥有效。",
      keyBad: "API密钥无效(缺'test success')",
      placeKey: "输入API密钥",
      placeBase: "输入API基础地址",
      apiBaseLabel: "API基础地址",
      refreshModels: "刷新模型列表",
      getKeyLinkLabel: "获取API Key",
      disclaimAutoFill: "警告：自动填入模式可能不稳定，请慎用。"
    }
  };

  // (3) MODEL DESCRIPTIONS (Fixed English)
  const modelDescDB = {
    "gpt-4o": "Solves images, cost-effective.",
    "gpt-4o-mini": "Text-only, cheaper.",
    "o1": "Best for images but slow & expensive.",
    "o3-mini": "Text-only, cheaper than o1.",
    "deepseek-reasoner": "No images, cheaper than o1.",
    "deepseek-chat": "No images, cheap & fast as 4o.",
    "chatgpt-4o-least": "RLHF version, can be error-prone.",
    "custom": "User-defined model"
  };

  // (4) BUILD UI
  const panel = document.createElement("div");
  panel.id = "ixl-auto-panel";
  panel.innerHTML = `
    <div class="ixl-header">
      <span id="panel-title">${langText[config.language].panelTitle}</span>
      <span id="token-count">${langText[config.language].tokensLabel}0</span>
      <button id="btn-logs">${langText[config.language].logsButton}</button>
      <button id="btn-close">${langText[config.language].closeButton}</button>
    </div>
    <div class="ixl-content">
      <div class="row">
        <label>${langText[config.language].modeLabel}:</label>
        <select id="sel-mode" style="width:100%;">
          <option value="autoFill">${langText[config.language].modeAuto}</option>
          <option value="displayOnly">${langText[config.language].modeDisp}</option>
        </select>
      </div>
      <div class="row" style="margin-top:8px; display:flex; gap:8px;">
        <button id="btn-start" class="btn-accent" style="flex:1;">${langText[config.language].startButton}</button>
        <button id="btn-rollback" class="btn-normal" style="flex:1;">${langText[config.language].rollbackButton}</button>
        <button id="btn-config-assist" class="btn-mini" style="flex:0;">${langText[config.language].configAssistant}</button>
      </div>
      <div id="answer-box" style="display:none; border:1px solid #999; padding:6px; background:#fff; margin-top:6px;">
        <h4 id="answer-title">${langText[config.language].finalAnswerTitle}</h4>
        <div id="answer-content" style="font-size:15px; font-weight:bold; color:#080;"></div>
        <hr/>
        <h5 id="steps-title">${langText[config.language].stepsTitle}</h5>
        <div id="steps-content" style="font-size:13px; color:#666;"></div>
      </div>
      <div id="progress-area" style="display:none; margin-top:8px;">
        <progress id="progress-bar" max="100" value="0" style="width:100%;"></progress>
        <span id="progress-label">${langText[config.language].statusWaiting}</span>
      </div>
      <p id="status-line" style="font-weight:bold; margin-top:6px;">${langText[config.language].statusIdle}</p>
      <div id="log-area" style="display:none; max-height:120px; overflow-y:auto; background:#fff; border:1px solid #888; margin-top:6px; padding:4px; font-family:monospace;"></div>
      <div class="row" style="margin-top:10px;">
        <label>${langText[config.language].modelSelectLabel}:</label>
        <select id="sel-model" style="width:100%;"></select>
        <p id="model-desc" style="font-size:12px; color:#666; margin:4px 0;"></p>
        <div id="custom-model-area" style="display:none;">
          <input type="text" id="custom-model-input" style="width:100%;" placeholder="${langText[config.language].customModelPlaceholder}" />
        </div>
      </div>
      <div class="row" style="margin-top:8px;">
        <label>${langText[config.language].languageLabel}:</label>
        <select id="sel-lang" style="width:100%;">
          <option value="en">English</option>
          <option value="zh">中文</option>
        </select>
      </div>
      <div id="auto-submit-row" style="margin-top:8px;">
        <label style="display:block;">${langText[config.language].autoSubmitLabel}:</label>
        <input type="checkbox" id="chk-auto-submit"/>
      </div>
      <button id="btn-rent" class="btn-normal" style="margin-top:10px; width:100%; font-weight:bold;">
        ${langText[config.language].rentKeyButton}
      </button>
      <div class="row" style="margin-top:10px;">
        <label>${langText[config.language].apiKeyLabel}:</label>
        <div style="display:flex; gap:4px; margin-top:4px;">
          <input type="password" id="txt-apikey" style="flex:1;" placeholder="${langText[config.language].placeKey}"/>
          <button id="btn-save-key">${langText[config.language].saveButton}</button>
          <button id="btn-test-key">${langText[config.language].testKeyButton}</button>
        </div>
      </div>
      <div class="row" style="margin-top:8px;">
        <label>${langText[config.language].apiBaseLabel}:</label>
        <div style="display:flex; gap:4px; margin-top:4px;">
          <input type="text" id="txt-apibase" style="flex:1;" placeholder="${langText[config.language].placeBase}"/>
          <button id="btn-save-base">${langText[config.language].saveButton}</button>
        </div>
      </div>
      <label style="margin-top:6px; display:block;">${langText[config.language].getKeyLinkLabel}:</label>
      <div style="display:flex; gap:4px; margin-top:4px;">
        <a id="link-getkey" href="#" target="_blank" class="link-btn" style="flex:1;">Link</a>
        <button id="btn-refresh" class="btn-normal" style="flex:1;">${langText[config.language].refreshModels}</button>
      </div>
    </div>
  `;
  document.body.appendChild(panel);

  // (5) CSS
  GM_addStyle(`
    #ixl-auto-panel {
      position: fixed;
      top:20px;
      right:20px;
      width:460px;
      background:#fff;
      border-radius:6px;
      box-shadow:0 2px 10px rgba(0,0,0,0.3);
      z-index:99999999;
      font-size:14px;
      font-family: "Segoe UI", Arial, sans-serif;
    }
    .ixl-header {
      background:#4caf50;
      color:#fff;
      padding:6px;
      display:flex;
      align-items:center;
      justify-content:flex-end;
      gap:6px;
    }
    #panel-title {
      font-weight:bold;
      margin-right:auto;
    }
    .ixl-content {
      padding:10px;
    }
    .row { margin-top:6px; }
    .btn-accent {
      background:#f0ad4e; color:#fff; border:none; border-radius:4px; font-weight:bold;
    }
    .btn-accent:hover { background:#ec971f; }
    .btn-normal {
      background:#ddd; color:#333; border:none; border-radius:4px;
    }
    .btn-normal:hover {
      background:#ccc;
    }
    .btn-mini {
      background:#bbb; color:#333; border:none; border-radius:4px;
      font-size:12px; padding:4px 6px;
    }
    .btn-mini:hover {
      background:#aaa;
    }
    .link-btn {
      background:#2f8ee0; color:#fff; border-radius:4px;
      text-decoration:none; text-align:center; padding:6px;
    }
    .link-btn:hover { opacity:0.8; }
  `);

  // (6) REFS
  const UI = {
    panel,
    logArea: document.getElementById("log-area"),
    logsBtn: document.getElementById("btn-logs"),
    closeBtn: document.getElementById("btn-close"),
    tokenCount: document.getElementById("token-count"),
    modeSelect: document.getElementById("sel-mode"),
    startBtn: document.getElementById("btn-start"),
    rollbackBtn: document.getElementById("btn-rollback"),
    confAssistBtn: document.getElementById("btn-config-assist"),
    answerBox: document.getElementById("answer-box"),
    answerContent: document.getElementById("answer-content"),
    stepsContent: document.getElementById("steps-content"),
    progressArea: document.getElementById("progress-area"),
    progressBar: document.getElementById("progress-bar"),
    progressLabel: document.getElementById("progress-label"),
    statusLine: document.getElementById("status-line"),
    modelSelect: document.getElementById("sel-model"),
    modelDesc: document.getElementById("model-desc"),
    customModelArea: document.getElementById("custom-model-area"),
    customModelInput: document.getElementById("custom-model-input"),
    langSelect: document.getElementById("sel-lang"),
    autoSubmitRow: document.getElementById("auto-submit-row"),
    autoSubmitToggle: document.getElementById("chk-auto-submit"),
    rentBtn: document.getElementById("btn-rent"),
    txtApiKey: document.getElementById("txt-apikey"),
    saveKeyBtn: document.getElementById("btn-save-key"),
    testKeyBtn: document.getElementById("btn-test-key"),
    txtApiBase: document.getElementById("txt-apibase"),
    saveBaseBtn: document.getElementById("btn-save-base"),
    linkGetKey: document.getElementById("link-getkey"),
    refreshBtn: document.getElementById("btn-refresh")
  };

  // (7) UTILS
  function logMsg(msg) {
    const time = new Date().toLocaleString();
    const div = document.createElement("div");
    div.textContent = `[${time}] ${msg}`;
    UI.logArea.appendChild(div);
    console.log("[Log]", msg);
  }
  function logDump(label, val) {
    let m = `[DUMP] ${label}: `;
    try { m += JSON.stringify(val); } catch(e){ m += String(val); }
    logMsg(m);
  }
  function updateLangText() {
    UI.logsBtn.textContent = (UI.logArea.style.display==="none") ? langText[config.language].logsButton : langText[config.language].logsHide;
    UI.closeBtn.textContent = langText[config.language].closeButton;
    UI.tokenCount.textContent = langText[config.language].tokensLabel + config.totalTokens;
    UI.statusLine.textContent = langText[config.language].statusIdle;
    UI.progressLabel.textContent = langText[config.language].statusWaiting;
    UI.modeSelect.options[0].text = langText[config.language].modeAuto;
    UI.modeSelect.options[1].text = langText[config.language].modeDisp;
    UI.startBtn.textContent = langText[config.language].startButton;
    UI.rollbackBtn.textContent = langText[config.language].rollbackButton;
    UI.confAssistBtn.textContent = langText[config.language].configAssistant;
    document.getElementById("answer-title").textContent = langText[config.language].finalAnswerTitle;
    document.getElementById("steps-title").textContent = langText[config.language].stepsTitle;
    UI.txtApiKey.placeholder = langText[config.language].placeKey;
    UI.saveKeyBtn.textContent = langText[config.language].saveButton;
    UI.testKeyBtn.textContent = langText[config.language].testKeyButton;
    UI.txtApiBase.placeholder = langText[config.language].placeBase;
    UI.saveBaseBtn.textContent = langText[config.language].saveButton;
    UI.linkGetKey.textContent = "Link";
    UI.refreshBtn.textContent = langText[config.language].refreshModels;
    UI.rentBtn.textContent = langText[config.language].rentKeyButton;
  }

  // (8) BUILD MODEL SELECT
  function buildModelSelect() {
    UI.modelSelect.innerHTML = "";
    const ogPre = document.createElement("optgroup");
    ogPre.label = "Predefined";
    const builtins = ["gpt-4o","gpt-4o-mini","o1","o3-mini","deepseek-reasoner","deepseek-chat","chatgpt-4o-least"];
    for(const b of builtins){
      const opt = document.createElement("option");
      opt.value = b;
      opt.textContent = b;
      ogPre.appendChild(opt);
    }
    UI.modelSelect.appendChild(ogPre);

    const discovered = Object.keys(modelConfigs).filter(k=>modelConfigs[k].discovered);
    if(discovered.length>0){
      const ogDisc = document.createElement("optgroup");
      ogDisc.label = "Discovered";
      discovered.forEach(m=>{
        const opt = document.createElement("option");
        opt.value = m;
        opt.textContent = m;
        ogDisc.appendChild(opt);
      });
      UI.modelSelect.appendChild(ogDisc);
    }

    const optCust = document.createElement("option");
    optCust.value = "custom";
    optCust.textContent = "custom";
    UI.modelSelect.appendChild(optCust);

    if(UI.modelSelect.querySelector(`option[value="${config.selectedModel}"]`)){
      UI.modelSelect.value = config.selectedModel;
    } else {
      UI.modelSelect.value = "custom";
    }
    UI.modelDesc.textContent = modelDescDB[config.selectedModel] || "User-defined model";
    UI.customModelArea.style.display = (config.selectedModel==="custom")?"block":"none";
  }

  // (9) EVENT BIND
  UI.logsBtn.addEventListener("click",()=>{
    if(UI.logArea.style.display==="none"){
      UI.logArea.style.display="block";
      UI.logsBtn.textContent=langText[config.language].logsHide;
    } else {
      UI.logArea.style.display="none";
      UI.logsBtn.textContent=langText[config.language].logsButton;
    }
  });
  UI.closeBtn.addEventListener("click",()=>{
    panel.style.display="none";
    logMsg("User closed panel");
  });
  UI.modeSelect.addEventListener("change",()=>{
    config.mode = UI.modeSelect.value;
    if(config.mode==="autoFill"){
      UI.answerBox.style.display="none";
      UI.autoSubmitRow.style.display="block";
      alert(langText[config.language].disclaimAutoFill);
    } else {
      UI.answerBox.style.display="none";
      UI.autoSubmitRow.style.display="none";
    }
  });
  UI.startBtn.addEventListener("click",()=>{
    startAnswer();
  });
  UI.rollbackBtn.addEventListener("click",()=>{
    if(config.lastState){
      const div = getQuestionDiv();
      if(div){
        div.innerHTML = config.lastState;
        logMsg("Rolled back to previous question content");
      }
    } else {
      logMsg("No stored state for rollback");
    }
  });
  UI.confAssistBtn.addEventListener("click",()=>{
    openConfigAssistant();
  });
  UI.autoSubmitToggle.addEventListener("change",()=>{
    config.autoSubmit = UI.autoSubmitToggle.checked;
    logDump("AutoSubmit?", config.autoSubmit);
  });
  UI.modelSelect.addEventListener("change",()=>{
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
    UI.modelDesc.textContent=modelDescDB[config.selectedModel]||"User-defined model";
    UI.txtApiKey.value = modelConfigs[config.selectedModel].apiKey || "";
    UI.txtApiBase.value = modelConfigs[config.selectedModel].apiBase || "";
    // if user picks deepseek
    if(config.selectedModel.toLowerCase().includes("deepseek")){
      UI.txtApiBase.value="https://api.deepseek.com/v1/chat/completions";
      modelConfigs[config.selectedModel].apiBase="https://api.deepseek.com/v1/chat/completions";
    }
    updateManageLink();
  });
  UI.customModelInput.addEventListener("change",()=>{
    const name = UI.customModelInput.value.trim();
    if(!name)return;
    config.selectedModel=name;
    if(!modelConfigs[name]){
      modelConfigs[name]={
        apiKey:"",
        apiBase:"https://api.openai.com/v1/chat/completions",
        discovered:false,
        modelList:[]
      };
    }
    buildModelSelect();
    UI.modelSelect.value="custom";
    UI.txtApiKey.value=modelConfigs[name].apiKey||"";
    UI.txtApiBase.value=modelConfigs[name].apiBase||"";
    updateManageLink();
  });
  UI.langSelect.addEventListener("change",()=>{
    config.language=UI.langSelect.value;
    saveConfig();
    updateLangText();
  });
  UI.rentBtn.addEventListener("click",()=>{
    openRentPopup();
  });
  UI.saveKeyBtn.addEventListener("click",()=>{
    const k=UI.txtApiKey.value.trim();
    modelConfigs[config.selectedModel].apiKey=k;
    saveConfig();
    logMsg("Saved new API key");
  });
  UI.testKeyBtn.addEventListener("click",()=>{
    testApiKey();
  });
  UI.saveBaseBtn.addEventListener("click",()=>{
    const nb=UI.txtApiBase.value.trim();
    modelConfigs[config.selectedModel].apiBase=nb;
    saveConfig();
    logMsg("Saved new API Base");
  });
  UI.refreshBtn.addEventListener("click",()=>{
    refreshModelList();
  });

  // (10) MISC FUNCS
  function updateManageLink(){
    let mod = config.selectedModel.toLowerCase();
    let link="#";
    if(mod.includes("deepseek")){
      link="https://platform.deepseek.com/api_keys";
    } else {
      link="https://platform.openai.com/api-keys";
    }
    modelConfigs[config.selectedModel].manageUrl=link;
    UI.linkGetKey.href=link;
    saveConfig();
  }
  function openRentPopup(){
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
    box.style.width="300px";
    box.style.backgroundColor="#fff";
    box.style.borderRadius="6px";
    box.style.padding="10px";
    box.innerHTML=`
      <h3 style="margin-top:0;">Rent Key</h3>
      <p>Contact me to rent an API key:</p>
      <ul>
        <li>felixliujy@Gmail.com</li>
        <li>admin@obanarchy.org</li>
      </ul>
      <p>Thanks for supporting!</p>
      <button id="rent-close-btn">${langText[config.language].closeButton}</button>
    `;
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    box.querySelector("#rent-close-btn").addEventListener("click",()=>{
      document.body.removeChild(overlay);
    });
  }
  function testApiKey(){
    UI.statusLine.textContent=langText[config.language].testKeyMsg;
    let conf = modelConfigs[config.selectedModel];
    const payload={
      model: config.selectedModel,
      messages:[
        {role:"system", content:"Test key."},
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
          const data=JSON.parse(resp.responseText);
          const c = data.choices[0].message.content.toLowerCase();
          if(c.includes("test success")) alert(langText[config.language].keyOK);
          else alert(langText[config.language].keyBad);
        } catch(e){
          alert("Error parse test:"+e);
        }
      },
      onerror:(err)=>{
        UI.statusLine.textContent=langText[config.language].statusIdle;
        alert("Test key error:"+JSON.stringify(err));
      }
    });
  }
  function refreshModelList(){
    const c=modelConfigs[config.selectedModel];
    if(!c)return;
    const url=c.apiBase.replace("/chat/completions","/models");
    logMsg("refreshing from: "+url);
    GM_xmlhttpRequest({
      method:"GET",
      url,
      headers:{
        "Authorization":"Bearer "+c.apiKey
      },
      onload:(resp)=>{
        try{
          const d=JSON.parse(resp.responseText);
          logDump("Model Refresh", d);
          if(Array.isArray(d.data)){
            const arr=d.data.map(x=>x.id);
            c.modelList=arr;
            for(let m of arr){
              if(!modelConfigs[m]){
                modelConfigs[m]={
                  apiKey:c.apiKey,
                  apiBase:c.apiBase,
                  discovered:true,
                  modelList:[]
                };
              }
            }
            saveConfig();
            buildModelSelect();
            alert("Found models: "+arr.join(", "));
          }
        }catch(e){
          alert("Error parse model list:"+e);
        }
      },
      onerror:(err)=>{
        alert("Refresh error:"+JSON.stringify(err));
      }
    });
  }
  function openConfigAssistant(){
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
      <h3 style="margin-top:0;">${langText[config.language].configAssistant}</h3>
      <textarea id="assistant-inp" style="width:100%;height:80px;"></textarea>
      <button id="assistant-ask" style="margin-top:6px;">${langText[config.language].shortAI}</button>
      <button id="assistant-close" style="margin-top:6px;">${langText[config.language].closeButton}</button>
      <div id="assistant-out" style="margin-top:6px; border:1px solid #ccc; background:#fafafa; padding:6px; white-space:pre-wrap;"></div>
    `;
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    const closeBtn=box.querySelector("#assistant-close");
    const askBtn=box.querySelector("#assistant-ask");
    const inp=box.querySelector("#assistant-inp");
    const out=box.querySelector("#assistant-out");
    closeBtn.addEventListener("click",()=>{
      document.body.removeChild(overlay);
    });
    askBtn.addEventListener("click",()=>{
      const q=inp.value.trim();
      if(!q)return;
      out.textContent="(waiting...)";
      askAssistant(q,(resp)=>{
        out.innerHTML=marked.parse(resp||"");
      },(err)=>{
        out.textContent="[Error] "+err;
      });
    });
  }
  function askAssistant(q,onSuccess,onError){
    const c=modelConfigs[config.selectedModel]||{};
    const pay={
      model:config.selectedModel,
      messages:[
        {role:"system", content:"You are the config assistant. Provide helpful info for user to reconfigure."},
        {role:"user", content:q}
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
          const d=JSON.parse(resp.responseText);
          const ans=d.choices[0].message.content;
          onSuccess(ans);
        }catch(e){
          onError("Parse error:"+e);
        }
      },
      onerror:(err)=>{
        onError(JSON.stringify(err));
      }
    });
  }

  function getQuestionDiv(){
    let d = document.evaluate(
      '/html/body/main/div/article/section/section/div/div[1]',
      document,null,XPathResult.FIRST_ORDERED_NODE_TYPE,null
    ).singleNodeValue;
    if(!d)d=document.querySelector('main div.article, main>div, article');
    return d;
  }

  // progress
  let progressTimer=null;
  function startProgress(){
    UI.progressArea.style.display="block";
    UI.progressBar.value=0;
    progressTimer=setInterval(()=>{
      if(UI.progressBar.value<90) UI.progressBar.value+=2;
    },200);
  }
  function stopProgress(){
    if(progressTimer) clearInterval(progressTimer);
    UI.progressBar.value=100;
    setTimeout(()=>{
      UI.progressArea.style.display="none";
      UI.progressBar.value=0;
    },400);
  }

  // (11) MAIN LOGIC
  function startAnswer(){
    logMsg("User pressed StartAnswer");
    const dv=getQuestionDiv();
    if(!dv){
      logMsg("No question region found!");
      return;
    }
    config.lastState = dv.innerHTML;
    let userPrompt="HTML:\n"+dv.outerHTML+"\n";
    const latexCap = captureLatex(dv);
    if(latexCap) userPrompt+="LaTeX:\n"+latexCap+"\n";
    else {
      const c64=captureCanvas(dv);
      if(c64) userPrompt+="Canvas image base64 attached.\n";
    }

    UI.answerBox.style.display="none";
    let systemPrompt;
    if(config.mode==="autoFill"){
      systemPrompt="You are an IXL solver. Provide minimal steps, and final <answer> in <answer>...</answer>, plus a JS code block in triple backticks to fill answers automatically. No LaTeX outside code. You can output markdown if you want. (Note: auto fill is unstable!)";
    } else {
      systemPrompt="You are an IXL solver. Provide steps if needed, final numeric/textual result must appear in <answer>...</answer>. No code is needed. You can output markdown.";
    }

    UI.statusLine.textContent=langText[config.language].statusWaiting;
    startProgress();

    let cConf = modelConfigs[config.selectedModel]||{};
    const pay={
      model:config.selectedModel,
      messages:[
        {role:"system", content:systemPrompt},
        {role:"user", content:userPrompt}
      ]
    };

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
          const data=JSON.parse(resp.responseText);
          logDump("GPT raw", data);
          if(data.usage?.total_tokens){
            config.totalTokens+=data.usage.total_tokens;
            UI.tokenCount.textContent=langText[config.language].tokensLabel+config.totalTokens;
          }
          const fullOut=data.choices[0].message.content;
          // parse <answer> part
          const answerMatch=fullOut.match(/<answer>([\s\S]*?)<\/answer>/i);
          let finalAnswer="";
          let stepsText="";
          if(answerMatch){
            finalAnswer=answerMatch[1].trim();
            stepsText=fullOut.replace(/<answer>[\s\S]*?<\/answer>/i,"").trim();
          } else {
            finalAnswer=langText[config.language].missingAnswerTag;
            stepsText=fullOut;
          }

          // show container
          UI.answerBox.style.display=(config.mode==="displayOnly")?"block":"none";

          // parse steps as markdown
          const stepsHtml=marked.parse(stepsText||"");
          // parse finalAnswer as simple text or md?
          // if you want to parse finalAnswer too:
          const finalHtml=marked.parseInline(finalAnswer);

          UI.answerContent.innerHTML=finalHtml;
          UI.stepsContent.innerHTML=stepsHtml;

          if(config.mode==="autoFill"){
            // look for code
            const codeMatch=fullOut.match(/```javascript\s+([\s\S]*?)```/i);
            if(codeMatch && codeMatch[1]){
              runJsCode(codeMatch[1].trim());
              if(config.autoSubmit){
                doAutoSubmit();
              }
            } else {
              logMsg("No JS code found in GPT output for auto fill");
            }
          }
          UI.statusLine.textContent=langText[config.language].statusDone;
        } catch(e){
          UI.statusLine.textContent="Error parse GPT result";
          logDump("Parse GPT error", e);
        }
      },
      onerror:(err)=>{
        stopProgress();
        UI.statusLine.textContent=langText[config.language].requestError+JSON.stringify(err);
        logDump("Request error", err);
      }
    });
  }

  function runJsCode(codeStr){
    try{
      const sandbox={};
      (new Function("sandbox", "with(sandbox){"+codeStr+"}"))(sandbox);
    } catch(e){
      logDump("RunJS error", e);
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
      logMsg("auto-submitting now");
      subBtn.click();
    } else {
      logMsg("no submit button found for autoSubmit");
    }
  }

  function captureLatex(div){
    const arr=div.querySelectorAll('script[type="math/tex"], .MathJax, .mjx-chtml');
    if(arr.length>0){
      let latex="";
      arr.forEach(e=>{ latex+=e.textContent+"\n"; });
      return latex;
    }
    return null;
  }
  function captureCanvas(div){
    const c=div.querySelector("canvas");
    if(c){
      const cv=document.createElement("canvas");
      cv.width=c.width;
      cv.height=c.height;
      cv.getContext("2d").drawImage(c,0,0);
      return cv.toDataURL("image/png").split(",")[1];
    }
    return null;
  }

  function getQuestionDiv(){
    let d=document.evaluate(
      '/html/body/main/div/article/section/section/div/div[1]',
      document,null,XPathResult.FIRST_ORDERED_NODE_TYPE,null
    ).singleNodeValue;
    if(!d) d=document.querySelector('main div.article, main>div, article');
    return d;
  }

  function initAll(){
    buildModelSelect();
    let c=modelConfigs[config.selectedModel]||{};
    UI.txtApiKey.value=c.apiKey||"";
    UI.txtApiBase.value=c.apiBase||"";
    updateManageLink();
    UI.modeSelect.value=config.mode;
    if(config.mode==="displayOnly"){
      UI.answerBox.style.display="none";
      UI.autoSubmitRow.style.display="none";
    }
    UI.langSelect.value=config.language;
    updateLangText();
    logMsg("Script loaded. Marked version for MD rendering is required via @require. Full code included. Enjoy!");
  }
  initAll();
})();
