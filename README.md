# IXL Auto Answer (OpenAI API Required)

### If you want to **check if your API key works**, you can use my website: [keytest.obanarchy.org](https://keytest.obanarchy.org).  
**I won’t store or save your API key.**

> *This repository is only used for reporting issues, submitting pull requests, requesting features, and communicating with the author.  
> The repository reflects the latest progress of the script and may not be stable.  
> **Ordinary users should install the script from [Greasy Fork](https://greasyfork.org/zh-CN/scripts/517259-ixl-auto-answer-openai-api-requid).***  

## **latest screenshot**

![image](https://github.com/user-attachments/assets/a6383e67-e68a-45d3-8290-9a00b5f30b9c)

![image](https://github.com/user-attachments/assets/f51040a2-b151-4e9c-bca3-4e351203c1ca)

---

## **Installation Guide**

This is a **Tampermonkey script** designed to automate answering math questions on the IXL platform.  
It requires a userscript manager like **Tampermonkey** (available for most browsers) or similar alternatives to run effectively.  

For a streamlined installation, **install the script directly from**:  
➡️ **[Greasy Fork](https://greasyfork.org/zh-CN/scripts/517259-ixl-auto-answer-openai-api-requid)**  

### 🛠 Installation Steps:

1. **One-Click Installation (if Tampermonkey is installed):**  
   - Visit: **[IXL Auto Answer on Greasy Fork](https://greasyfork.org/zh-CN/scripts/517259-ixl-auto-answer-openai-api-requid)**  
   - Click **Install** to add the script to your Tampermonkey dashboard.  
   - ✅ **You can skip to Step 4!**

2. **Install Tampermonkey (if not installed):**  
   - [Tampermonkey for Chrome](https://chrome.google.com/webstore/detail/dhdgffkkebhmkfjojejmpbldmpobfkfo)  
   - [Tampermonkey for Firefox](https://addons.mozilla.org/en-US/firefox/addon/tampermonkey/)  
   - [Tampermonkey for Safari](https://apps.apple.com/app/apple-store/id1482490089)  
   - Alternatively, use other userscript managers like **Greasemonkey**.

3. **Install the Script:**  
   - Visit **[IXL Auto Answer on Greasy Fork](https://greasyfork.org/zh-CN/scripts/517259-ixl-auto-answer-openai-api-requid)**.  
   - Click **Install** to add the script to your Tampermonkey dashboard.

4. **Setup OpenAI API Key:**  
   - The script will prompt you to enter your OpenAI API key upon first use.  
   - This key is required to enable the answering functionality, as it connects to OpenAI’s API for generating solutions.  

> If you want to **check if your API key works**, you can use my website:  
> [keytest.obanarchy.org](https://keytest.obanarchy.org).  
> **I won’t store or save your API key.**  

---

## **Primary Purpose**
This script automates the process of answering math questions on IXL by using the OpenAI API.  
It captures relevant **HTML content**, **sends it to OpenAI**, and **generates JavaScript code** to populate the correct answers on the page.

---

## **Key Features**

### ✅ **Automated Answer Generation**
- Detects new questions on the IXL page and uses the OpenAI API to generate JavaScript code that accurately fills in the correct answers.

### ✅ **AI-Powered Math Solutions**
- Sends problem data to OpenAI’s **GPT-4o** model for processing, enabling the script to solve various math problems.
- Requires an **OpenAI API key**, which users must input when prompted.

### ✅ **User-Friendly Control Panel**
- Allows users to toggle modes like **Auto Answer** and **Auto Submit**.
- Supports **multiple AI models**: **GPT-4o, GPT-4o-mini, o1, and o3-mini**.
- Provides **language options** (English & Chinese).
- Fully **draggable, semi-transparent**, and can be minimized or closed.

### ✅ **Advanced Canvas Image Processing**
- Captures **canvas-based visual questions** (e.g., graphs and shapes).
- Sends captured images to OpenAI for accurate answers.

### ✅ **Stable Code Generation**
- Uses **stable selectors** (`id`, `name`, `data-*`) for high precision in JavaScript code.
- Implements **regex filtering** to ensure only essential code is extracted, reducing errors.

### ✅ **Comprehensive Logging and Error Handling**
- Logs **all actions, errors, and statuses** for transparency.
- If an answer can’t be auto-filled, the script **logs an error message** for review.

---

## **Usage Instructions**

### 🔹 **1. OpenAI API Key**
- Enter your **OpenAI API key** the first time you run the script.
- The key is securely saved for future use.
- You can update the key at any time via the control panel.

### 🔹 **2. Activating the Script**
- **Auto Answer**: Detects and answers new questions automatically.
- **Auto Submit**: Submits answers immediately after filling them in.

### 🔹 **3. Selecting a Model**
- Choose between **GPT-4o, GPT-4o-mini, o1, and o3-mini**.
- Different models vary in **cost, speed, and accuracy**.

### 🔹 **4. Switching Languages**
- Toggle between **English** and **Chinese** in the settings.

### 🔹 **5. Adjustable GUI**
- The control panel is **movable and customizable**.
- Can be **minimized** or **closed** for better screen space.

---

## **Benefits**

✅ **Efficient Math Problem-Solving** – Automates answer input, saving time on IXL.  
✅ **Flexible and Customizable** – Offers options for model selection, language, and GUI preferences.  
✅ **Accurate Answer Generation** – Uses OpenAI’s advanced models to solve complex questions, including those with visual elements.  
✅ **Low Interaction Needed** – Once active, the script detects and answers questions with minimal user intervention.  

---

## **Requirements**

- **OpenAI API Key** – Users must have an OpenAI account and API key for the script to function.  
- **Tampermonkey** – A userscript manager such as Tampermonkey is required to run the script.  

This script is ideal for **students, educators, and anyone seeking an automated solution** for solving math problems on IXL efficiently. 🚀
