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
    const resultCard = document.getElementById('result-card');

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

        // 优化加载动画反馈
        resultContent.innerHTML = `
            <div class="flex flex-col items-center justify-center h-full w-full gap-4 py-10">
                <div class="relative">
                    <div class="animate-spin rounded-full h-12 w-12 border-4 border-blue-600/20 border-t-blue-600"></div>
                    <div class="absolute inset-0 flex items-center justify-center">
                        <div class="h-2 w-2 bg-blue-600 rounded-full animate-pulse"></div>
                    </div>
                </div>
                <div class="text-center">
                    <p class="text-blue-600 dark:text-blue-400 font-medium animate-pulse">AI 正在深度解析中...</p>
                    <p class="text-xs text-gray-400 mt-1">预计需要 3-5 秒</p>
                </div>
            </div>`;
        
        statusBar.classList.remove('hidden');
        statusText.innerText = "正在调用 OCR 服务...";

        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await fetch('/ocr', { method: 'POST', body: formData });
            const data = await response.json();
            if (data.success) {
                const detected = (data.text.match(/[a-zA-Z]/g) || []).length / data.text.length > 0.4 ? 'en' : 'zh';
                translationCache[detected] = data.text;
                currentDisplayLang = detected;
                updateDisplay(data.text);
                statusText.innerText = `识别完成（${detected === 'zh' ? '中文' : '英文'}）`;
            } else {
                resultContent.innerHTML = `<div class="text-red-500 p-4 italic">识别出错: ${data.error}</div>`;
            }
        } catch (err) {
            resultContent.innerHTML = '<div class="text-red-500 p-4 italic">网络连接失败</div>';
        }
    }

    function updateDisplay(text) {
        // 解除初始高度锁定
        resultCard.classList.replace('h-[500px]', 'min-h-[500px]');
        resultContent.classList.remove('items-center', 'justify-center');
        resultContent.classList.add('items-start', 'justify-start');
        resultContent.innerHTML = `<pre class="whitespace-pre-wrap font-sans text-gray-800 dark:text-gray-200 w-full text-left leading-relaxed text-sm lg:text-base p-2">${text}</pre>`;
    }

    // 全框点击绑定
    dropzone.addEventListener('click', () => fileInput.click());
    selectFileBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        fileInput.click();
    });

    fileInput.addEventListener('change', (e) => handleFile(e.target.files[0]));
    
    dropzone.addEventListener('dragover', (e) => { 
        e.preventDefault(); 
        dropzone.classList.add('border-blue-500', 'bg-blue-50/30', 'dark:bg-blue-900/20'); 
    });
    dropzone.addEventListener('dragleave', () => { 
        dropzone.classList.remove('border-blue-500', 'bg-blue-50/30', 'dark:bg-blue-900/20'); 
    });
    dropzone.addEventListener('drop', (e) => { 
        e.preventDefault(); 
        dropzone.classList.remove('border-blue-500', 'bg-blue-50/30', 'dark:bg-blue-900/20');
        handleFile(e.dataTransfer.files[0]); 
    });

    document.addEventListener('paste', (event) => {
        const items = (event.clipboardData || event.originalEvent.clipboardData).items;
        for (let item of items) {
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
            statusText.innerText = `显示语种：${targetLang === 'zh' ? '中文' : '英文'}`;
            return;
        }
        statusText.innerText = "翻译引擎启动中...";
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
                statusText.innerText = "翻译已同步";
            }
        } catch (err) { statusText.innerText = "翻译失败"; }
    });

    copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(resultContent.innerText).then(() => {
            const originalText = copyBtn.innerText;
            copyBtn.innerText = "✅ 已复制";
            setTimeout(() => copyBtn.innerText = originalText, 1500);
        });
    });
});
