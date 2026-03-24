document.addEventListener('DOMContentLoaded', () => {
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
    const resultCard = document.getElementById('result-card'); // 新增卡片引用

    let translationCache = { 'zh': '', 'en': '' };
    let currentDisplayLang = ''; 

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

    function detectLanguage(text) {
        const englishPattern = /[a-zA-Z]/g;
        const englishCount = (text.match(englishPattern) || []).length;
        return (englishCount / text.length) > 0.4 ? 'en' : 'zh';
    }

    async function handleFile(file) {
        if (!file || !file.type.startsWith('image/')) return;

        translationCache = { 'zh': '', 'en': '' };
        currentDisplayLang = '';
        
        const reader = new FileReader();
        reader.onload = (e) => {
            previewImage.src = e.target.result;
            previewContainer.classList.remove('hidden');
        };
        reader.readAsDataURL(file);

        resultContent.innerHTML = '<div class="flex flex-col items-center gap-3 py-10"><div class="animate-spin rounded-full h-8 w-8 border-4 border-blue-600 border-t-transparent"></div>正在识别...</div>';
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
                statusText.innerText = `识别完成（${detected === 'zh' ? '中文' : '英文'}）。`;
            } else {
                resultContent.innerHTML = `<div class="text-red-500 p-4">识别失败: ${data.error}</div>`;
            }
        } catch (err) {
            resultContent.innerHTML = '<div class="text-red-500 p-4">网络异常</div>';
        }
    }

    document.addEventListener('paste', (event) => {
        const items = (event.clipboardData || event.originalEvent.clipboardData).items;
        for (let index in items) {
            const item = items[index];
            if (item.kind === 'file' && item.type.startsWith('image/')) {
                handleFile(item.getAsFile());
            }
        }
    });

    langToggleBtn.addEventListener('click', async () => {
        if (!currentDisplayLang) return;
        const targetLang = (currentDisplayLang === 'zh') ? 'en' : 'zh';

        if (translationCache[targetLang]) {
            updateDisplay(translationCache[targetLang]);
            currentDisplayLang = targetLang;
            statusText.innerText = `已显示${targetLang === 'zh' ? '中文' : '英文'}`;
            return;
        }

        statusText.innerText = `正在翻译至${targetLang === 'zh' ? '中文' : '英文'}...`;
        try {
            const response = await fetch('/translate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: translationCache[currentDisplayLang], target: targetLang })
            });
            const data = await response.json();
            if (data.success) {
                translationCache[targetLang] = data.text;
                updateDisplay(data.text);
                currentDisplayLang = targetLang;
                statusText.innerText = "翻译完成。";
            }
        } catch (err) {
            alert("翻译接口异常");
        }
    });

    function updateDisplay(text) {
        // 1. 解除父容器固定高度限制，允许长内容撑开
        resultCard.classList.remove('h-[500px]');
        resultCard.classList.add('min-h-[500px]');
        
        // 2. 移除居中布局，确保文字从顶部开始显示
        resultContent.classList.remove('items-center', 'justify-center');
        resultContent.classList.add('items-start', 'justify-start');
        
        // 3. 填充内容
        resultContent.innerHTML = `<pre class="whitespace-pre-wrap font-sans text-gray-800 dark:text-gray-200 w-full text-left leading-relaxed">${text}</pre>`;
    }

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
