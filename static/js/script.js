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
    let currentFileId = '';
    let translationCache = {}; 

    // 1. 主题初始化与反转逻辑
    function updateThemeIcons() {
        if (document.documentElement.classList.contains('dark')) {
            // 黑夜模式：显示月亮
            themeToggleDarkIcon.classList.remove('hidden');
            themeToggleLightIcon.classList.add('hidden');
        } else {
            // 白天模式：显示太阳
            themeToggleLightIcon.classList.remove('hidden');
            themeToggleDarkIcon.classList.add('hidden');
        }
    }
    updateThemeIcons();

    themeToggleBtn.addEventListener('click', () => {
        document.documentElement.classList.toggle('dark');
        updateThemeIcons();
    });

    // 2. 处理文件上传
    async function handleFile(file) {
        if (!file || !file.type.startsWith('image/')) return;

        translationCache = {}; 
        currentFileId = `${file.name}_${file.size}_${file.lastModified}`;
        langText.innerText = "切换语言";
        
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
                translationCache["original"] = data.text;
                updateDisplay(data.text);
                statusText.innerText = "识别成功。";
            } else {
                resultContent.innerHTML = `<div class="text-red-500 p-4">错误: ${data.error}</div>`;
            }
        } catch (err) {
            resultContent.innerHTML = '<div class="text-red-500 p-4">网络异常</div>';
        }
    }

    // 3. 智能翻译逻辑 (支持双向)
    langToggleBtn.addEventListener('click', async () => {
        const textToProcess = resultContent.innerText.trim();
        if (!textToProcess || textToProcess.includes("等待识别")) return;

        // 简单的语言判定：英文字符占比超过30%则认为当前是英文，需要译成中文
        const englishPattern = /[a-zA-Z]/g;
        const englishCount = (textToProcess.match(englishPattern) || []).length;
        const isCurrentlyEnglish = (englishCount / textToProcess.length) > 0.3;
        
        const targetLang = isCurrentlyEnglish ? 'zh' : 'en';
        const cacheKey = `cache_${targetLang}`;

        if (translationCache[cacheKey]) {
            updateDisplay(translationCache[cacheKey]);
            statusText.innerText = `已切换至${isCurrentlyEnglish ? '中文' : '英文'}`;
        } else {
            statusText.innerText = `正在翻译至${isCurrentlyEnglish ? '中文' : '英文'}...`;
            try {
                const response = await fetch('/translate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text: textToProcess, target: targetLang })
                });
                const data = await response.json();
                if (data.success) {
                    translationCache[cacheKey] = data.text;
                    updateDisplay(data.text);
                    statusText.innerText = "翻译完成。";
                } else {
                    alert("翻译失败: " + data.error);
                }
            } catch (err) {
                alert("翻译接口异常");
            }
        }
    });

    function updateDisplay(text) {
        resultContent.innerHTML = `<pre class="whitespace-pre-wrap font-sans text-gray-800 dark:text-gray-200 leading-relaxed">${text}</pre>`;
    }

    // 交互绑定
    selectFileBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => handleFile(e.target.files[0]));
    dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('bg-blue-50'); });
    dropzone.addEventListener('dragleave', () => { dropzone.classList.remove('bg-blue-50'); });
    dropzone.addEventListener('drop', (e) => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); });
    copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(resultContent.innerText).then(() => {
            const old = copyBtn.innerText;
            copyBtn.innerText = "✅ 已复制";
            setTimeout(() => copyBtn.innerText = old, 1500);
        });
    });
});
