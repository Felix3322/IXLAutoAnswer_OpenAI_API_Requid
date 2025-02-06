# IXL Auto Answer (OpenAI API Required)

> If you want to **check whether your API key works**, you can use my website: [keytest.obanarchy.org](https://keytest.obanarchy.org). **I won’t store or storage your API key.**

---

### *This repository is only used for: reporting issues, submitting pull requests, requesting features, and communicating with the author. This repository will reflect the latest progress of the script and may not be stable. Ordinary users should go to the [Greasy Fork](https://greasyfork.org/zh-CN/scripts/517259-ixl-auto-answer-openai-api-requid).*

---

### **Installation Guide**

This is a **Tampermonkey script** designed to automate answering math questions on the IXL platform. It requires a userscript manager like **Tampermonkey** (available for most browsers) or similar alternatives to run effectively. **For a streamlined installation, you can directly access the script on [Greasy Fork](https://greasyfork.org/zh-CN/scripts/517259-ixl-auto-answer-openai-api-requid).**

#### **Installation Steps**:
1. **One-Click Installation (If you already installed Tampermonkey)**:
   - Visit the script’s page on Greasy Fork at: [IXL Auto Answer on Greasy Fork](https://greasyfork.org/zh-CN/scripts/517259-ixl-auto-answer-openai-api-requid).
   - Click on **Install** to add the script to your Tampermonkey dashboard.
   - Thats it, You can proceed directly to **step 4** now.

2. **Install Tampermonkey** (or a similar script manager):
   - [Tampermonkey for Chrome](https://chrome.google.com/webstore/detail/dhdgffkkebhmkfjojejmpbldmpobfkfo)
   - [Tampermonkey for Firefox](https://addons.mozilla.org/en-US/firefox/addon/tampermonkey/)
   - [Tampermonkey for Safari](https://apps.apple.com/app/apple-store/id1482490089)
   - Alternatively, use other script managers like **Greasemonkey**.

3. **Installation script**:
   - Visit the script’s page on Greasy Fork at: [IXL Auto Answer on Greasy Fork](https://greasyfork.org/zh-CN/scripts/517259-ixl-auto-answer-openai-api-requid).
   - Click on **Install** to add the script to your Tampermonkey dashboard.

4. **Setup OpenAI API Key**:
   - The script will prompt you to enter your OpenAI API key upon first use. This key is required to enable the answering functionality, as it connects to the OpenAI API for generating solutions.

---

### **Primary Purpose**
This script automates the process of answering math questions on IXL by using the OpenAI API (GPT-4o model). It captures relevant HTML content, sends it to GPT-4o, and generates JavaScript code to populate correct answers on the page.

---

### **Key Features**

1. **Automated Answer Generation**:
   - Detects new questions on the IXL page and uses the OpenAI API to generate JavaScript code that accurately fills in the correct answers.

2. **AI-Powered Math Solutions**:
   - Sends problem data to GPT-4o for processing, enabling the script to solve various math problems. This requires an OpenAI API key, which users need to input when prompted.

3. **User-Friendly Control Panel**:
   - Allows users to toggle modes like "Auto Answer" and "Auto Submit," switch languages (English and Chinese), and choose between GPT-4o or GPT-4o-mini models. The control panel is draggable, semi-transparent, and can be minimized or closed as desired.

4. **Advanced Canvas Image Processing**:
   - For complex visual questions (such as those with canvas elements), the script captures images of canvas elements and sends them to GPT-4o for more accurate answers.

5. **Stable Code Generation**:
   - Uses stable selectors (`id`, `name`, `data-*`) in the generated JavaScript code for precision. A regex filter further ensures only essential JavaScript code is extracted, minimizing errors.

6. **Comprehensive Logging and Error Handling**:
   - Logs all actions, errors, and statuses, providing users with insights on each step. If the answer can’t be auto-filled, an error message is logged for review.

---

### **Usage Instructions**

1. **OpenAI API Key**:
   - Input your OpenAI API key the first time you run the script. The key will be saved securely for future use, so there’s no need to re-enter it unless you wish to update it.

2. **Activating the Script**:
   - **Auto Answer**: Automatically detects and answers new questions.
   - **Auto Submit**: Automatically submits answers once they’re filled in.

3. **Selecting a Model**:
   - Choose between **GPT-4o** (standard) or **GPT-4o-mini** (budget-friendly) models depending on your needs.

4. **Switching Languages**:
   - Toggle between **English** and **Chinese** in the settings.

5. **Adjustable GUI**:
   - The control panel is movable and can be customized to suit your screen view.

---

### **Benefits**

- **Efficient Math Problem-Solving**: Automates answer input, saving time on IXL.
- **Flexible and Customizable**: Offers options for model selection, language, and GUI preferences.
- **Accurate Answer Generation**: Uses OpenAI’s advanced models to tackle complex questions, including those with visual elements.
- **Low Interaction Needed**: Once active, the script detects and answers questions with minimal user intervention.

---

### **Requirements**

- **OpenAI API Key**: Users must have an OpenAI account and API key for the script to function.
- **Tampermonkey**: A userscript manager such as Tampermonkey is necessary to run the script.

This script is ideal for students, lazy man like me, and those seeking an automated solution for math questions on IXL, making it a valuable tool for efficient problem-solving.
