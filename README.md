### Script Name: IXL Auto Answer (OpenAI API Required)

It's not perfect, you can help me improve it on github

**Primary Purpose**:  
This script is designed to automatically answer math questions on the IXL platform by leveraging the OpenAI API (GPT-4o model). It captures relevant HTML content, sends it to GPT-4o, and generates JavaScript code to fill in the correct answers.

---

### Key Features

1. **Automated Question Detection and Answer Generation**:  
   The script detects new questions on the IXL page. When auto-answer mode is enabled, it uses the GPT-4o model to generate JavaScript code for accurately filling in the answers.

2. **AI-Powered Answering via OpenAI API**:  
   The script leverages the OpenAI API to interpret and solve math problems by generating code to input the correct answers. An OpenAI API key is required for this functionality, which users need to enter initially.

3. **Customizable GUI for User Control**:  
   Users can toggle between "Auto Answer" and "Auto Submit" modes, switch languages (English and Chinese), and select between GPT-4o or GPT-4o-mini models. The GUI is draggable, semi-transparent, and can be minimized or closed as needed.

4. **Canvas Image Capture for Complex Questions**:  
   For questions that use canvas elements (such as visual math problems), the script captures images of the canvas elements and includes them in the data sent to GPT-4o for a more comprehensive understanding.

5. **Accurate Code Generation**:  
   The script prompts GPT-4o to use stable selectors (like `id`, `name`, and `data-*`) for precise and robust JavaScript code, minimizing errors. A regex filter extracts only the necessary JavaScript code from the GPT output, avoiding any extraneous text or comments.

6. **Error Handling and Logging**:  
   Detailed logging tracks all actions, errors, and statuses, allowing users to see each step and any issues encountered. If the answer cannot be filled automatically, the script logs an error for user review.

---

### Usage Instructions

1. **OpenAI API Key Setup**:  
   The script prompts users to enter their OpenAI API key upon first use. The key is saved for future use, so users do not need to re-enter it unless they wish to change it.

2. **Starting the Script**:  
   - Enable "Auto Answer" mode to automatically detect and respond to new questions.
   - Enable "Auto Submit" mode if you want the script to submit answers automatically after filling in the answers.

3. **Model Selection**:  
   Users can choose between GPT-4o and GPT-4o-mini models, with GPT-4o-mini offering a more budget-friendly alternative for simpler problems.

4. **Language Support**:  
   The GUI supports English and Chinese, which can be switched in the settings. 

5. **Drag and Drop GUI**:  
   The control panel can be moved around the screen for convenience and customized view.

---

### Benefits

- **Saves Time**: Automates the answering process, allowing for quick problem-solving on IXL.
- **Customizable**: Offers flexibility with multiple settings, including model choice and language preference.
- **Robust Answering**: Leverages OpenAI’s advanced models to interpret complex questions, including visual ones with canvas elements.
- **Minimal User Interaction Required**: Automatically detects and responds to questions, requiring minimal user intervention once the script is running.

### Requirements

- **OpenAI API Key**: Users must have an OpenAI account and API key to use this script.
- **Tampermonkey**: The script runs within a userscript manager like Tampermonkey.

This script is ideal for students, educators, and anyone looking to automate their experience on IXL for efficient math problem-solving.
