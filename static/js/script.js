document.addEventListener('DOMContentLoaded', () => {
    // 界面元素
    const fileInput = document.getElementById('file-input');
    const selectFileBtn = document.getElementById('select-file-btn');
    const dropzone = document.getElementById('dropzone');
    const previewContainer = document.getElementById('preview-container');
    const previewImage = document.getElementById('preview-image');
    const resultContent = document.getElementById('result-content');
    const langToggleBtn = document.getElementById('output-lang-toggle');
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

    // 2. 辅助：语言判定
    function detectLanguage(text) {
        const englishPattern = /[a-zA-Z]/g;
        const englishCount = (text.match(englishPattern) || []).length;
        // 英文字符占比超过 40% 判定为英文
        return (englishCount / text.length) > 0.4 ? 'en' : 'zh';
    }

    // 3. 核心：处理图片文件（统一入口）
    async function handleFile(file) {
        if (!file || !file.type.startsWith('image/')) return;

        // 重置状态
        translationCache = { 'zh': '', 'en': '' };
        currentDisplayLang = '';
        
        // 预览
        const reader = new FileReader();
        reader.onload = (e) => {
            previewImage.src = e.target.result;
            previewContainer.classList.remove('hidden');
        };
        reader.readAsDataURL(file);

        // UI反馈
        resultContent.innerHTML = '<div class="text-blue-500 italic text-center py-20 flex flex-col items-center gap-3"><div class="animate-spin rounded-full h-8 w-8 border-4 border-blue-600 border-t-transparent"></div>正在识别病例文字...</div>';
        statusBar.classList.remove('hidden');
        statusText.innerText = "正在请求 OCR 服务...";

        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await fetch('/ocr', { method: 'POST', body: formData });
            const data = await response.json();

            if (data.success) {
                const detected = detectLanguage(data.text);
                translationCache[detected] = data.text;
                currentDisplayLang = detected;
                
                updateDisplay(data.text);
                statusText.innerText = `识别完成（检测为${detected === 'zh' ? '中文' : '英文'}）。`;
            } else {
                resultContent.innerHTML = `<div class="text-red-500 p-4">识别失败: ${data.error}</div>`;
            }
        } catch (err) {
            resultContent.innerHTML = '<div class="text-red-500 p-4">网络异常</div>';
        }
    }

    // 4. 新增：剪贴板监听
    document.addEventListener('paste', (event) => {
        const items = (event.clipboardData || event.originalEvent.clipboardData).items;
        for (let index in items) {
            const item = items[index];
            if (item.kind === 'file' && item.type.startsWith('image/')) {
                const blob = item.getAsFile();
                handleFile(blob);
            }
        }
    });

    // 5. 切换语言逻辑
    langToggleBtn.addEventListener('click', async () => {
        if (!currentDisplayLang) return;

        const targetLang = (currentDisplayLang === 'zh') ? 'en' : 'zh';

        // 命中缓存直接切换
        if (translationCache[targetLang]) {
            updateDisplay(translationCache[targetLang]);
            currentDisplayLang = targetLang;
            statusText.innerText = `已切换至${targetLang === 'zh' ? '中文' : '英文'}`;
            return;
        }

        // 无缓存则请求翻译
        statusText.innerText = `正在翻译至${targetLang === 'zh' ? '中文' : '英文'}...`;
        try {
            const response = await fetch('/translate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    text: translationCache[currentDisplayLang], 
                    target: targetLang 
                })
            });
            const data = await response.json();
            
            if (data.success) {
                translationCache[targetLang] = data.text;
                updateDisplay(data.text);
                currentDisplayLang = targetLang;
                statusText.innerText = "翻译完成并已存入缓存。";
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

    // 事件绑定
    selectFileBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => handleFile(e.target.files[0]));
    dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('bg-blue-50/50'); });
    dropzone.addEventListener('dragleave', () => { dropzone.classList.remove('bg-blue-50/50'); });
    dropzone.addEventListener('drop', (e) => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); });
    copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(resultContent.innerText).then(() => {
            const oldText = copyBtn.innerText;
            copyBtn.innerText = "✅ 已复制";
            setTimeout(() => copyBtn.innerText = oldText, 1500);
        });
    });
});
