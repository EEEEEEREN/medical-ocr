document.addEventListener('DOMContentLoaded', () => {
    // 界面元素
    const fileInput = document.getElementById('file-input');
    const selectFileBtn = document.getElementById('select-file-btn');
    const dropzone = document.getElementById('dropzone');
    const previewContainer = document.getElementById('preview-container');
    const previewImage = document.getElementById('preview-image');
    const resultContent = document.getElementById('result-content');
    const langToggleBtn = document.getElementById('output-lang-toggle');
    const langText = document.getElementById('lang-text');
    const statusBar = document.getElementById('status-bar');
    const statusText = document.getElementById('status-text');
    const copyBtn = document.getElementById('copy-btn');
    const themeToggleBtn = document.getElementById('theme-toggle');
    const themeToggleDarkIcon = document.getElementById('theme-toggle-dark-icon');
    const themeToggleLightIcon = document.getElementById('theme-toggle-light-icon');

    // 状态管理
    let translationCache = { 'zh': '', 'en': '' };
    let currentDisplayLang = ''; 

    // 1. 主题切换 (白天太阳，黑夜月亮)
    function updateThemeIcons() {
        if (document.documentElement.classList.contains('dark')) {
            themeToggleDarkIcon.classList.remove('hidden');
            themeToggleLightIcon.classList.add('hidden');
        } else {
            themeToggleLightIcon.classList.remove('hidden');
            themeToggleDarkIcon.classList.add('hidden');
        }
    }
    updateThemeIcons();
    themeToggleBtn.addEventListener('click', () => {
        document.documentElement.classList.toggle('dark');
        updateThemeIcons();
    });

    // 2. 智能语种判定辅助函数
    function detectLanguage(text) {
        const englishPattern = /[a-zA-Z]/g;
        const englishCount = (text.match(englishPattern) || []).length;
        // 如果英文字符占比超过 40%，判定为英文
        return (englishCount / text.length) > 0.4 ? 'en' : 'zh';
    }

    // 3. 处理文件上传 (修复首发语种存入逻辑)
    async function handleFile(file) {
        if (!file || !file.type.startsWith('image/')) return;

        translationCache = { 'zh': '', 'en': '' };
        previewContainer.classList.add('hidden');
        
        const reader = new FileReader();
        reader.onload = (e) => {
            previewImage.src = e.target.result;
            previewContainer.classList.remove('hidden');
        };
        reader.readAsDataURL(file);

        resultContent.innerHTML = '<div class="text-blue-500 italic text-center py-20 flex flex-col items-center gap-3"><div class="animate-spin rounded-full h-8 w-8 border-4 border-blue-600 border-t-transparent"></div>正在识别病例文字...</div>';
        statusBar.classList.remove('hidden');
        statusText.innerText = "正在请求 OCR 服务...";

        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await fetch('/ocr', { method: 'POST', body: formData });
            const data = await response.json();

            if (data.success) {
                // 【核心改进】：判定首发语言并存入对应槽位
                const detected = detectLanguage(data.text);
                translationCache[detected] = data.text;
                currentDisplayLang = detected;
                
                updateDisplay(data.text);
                statusText.innerText = `识别完成 (检测为${detected === 'zh' ? '中文' : '英文'})。`;
            } else {
                resultContent.innerHTML = `<div class="text-red-500 p-4">识别失败: ${data.error}</div>`;
            }
        } catch (err) {
            resultContent.innerHTML = '<div class="text-red-500 p-4">网络异常</div>';
        }
    }

    // 4. 双向极速切换
    langToggleBtn.addEventListener('click', async () => {
        // 获取当前显示的文本 (以防万一)
        const currentText = resultContent.innerText.trim();
        if (!currentText || currentText.includes("等待识别")) return;

        // 如果还没识别出任何语言，直接跳过
        if (!currentDisplayLang) return;

        // 确定目标
        const targetLang = (currentDisplayLang === 'zh') ? 'en' : 'zh';

        // 检查缓存
        if (translationCache[targetLang]) {
            updateDisplay(translationCache[targetLang]);
            currentDisplayLang = targetLang;
            statusText.innerText = `已秒切至${targetLang === 'zh' ? '中文' : '英文'}`;
            return;
        }

        // 缓存缺失，请求翻译
        statusText.innerText = `正在向腾讯云请求翻译至${targetLang === 'zh' ? '中文' : '英文'}...`;
        
        try {
            const response = await fetch('/translate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    text: currentText, 
                    target: targetLang 
                })
            });
            const data = await response.json();
            
            if (data.success) {
                translationCache[targetLang] = data.text; // 补全缓存
                updateDisplay(data.text);
                currentDisplayLang = targetLang;
                statusText.innerText = "翻译完成并已缓存。";
            } else {
                alert("翻译失败: " + data.error);
            }
        } catch (err) {
            alert("接口异常");
        }
    });

    function updateDisplay(text) {
        resultContent.innerHTML = `<pre class="whitespace-pre-wrap font-sans text-gray-800 dark:text-gray-200 leading-relaxed">${text}</pre>`;
    }

    // 基础绑定
    selectFileBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => handleFile(e.target.files[0]));
    dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('bg-blue-50/50'); });
    dropzone.addEventListener('dragleave', () => { dropzone.classList.remove('bg-blue-50/50'); });
    dropzone.addEventListener('drop', (e) => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); });
    copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(resultContent.innerText).then(() => {
            const old = copyBtn.innerText;
            copyBtn.innerText = "✅ 已复制";
            setTimeout(() => copyBtn.innerText = old, 1500);
        });
    });
});
