document.addEventListener('DOMContentLoaded', () => {
    // 界面元素绑定
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

    // 缓存与状态 (修正点：使用 let 允许重置)
    let currentFileId = '';
    let translationCache = {}; 

    // 初始化主题图标
    function initThemeIcon() {
        if (document.documentElement.classList.contains('dark')) {
            themeToggleLightIcon.classList.remove('hidden');
        } else {
            themeToggleDarkIcon.classList.remove('hidden');
        }
    }
    initThemeIcon();

    // 1. 主题切换
    themeToggleBtn.addEventListener('click', () => {
        document.documentElement.classList.toggle('dark');
        themeToggleDarkIcon.classList.toggle('hidden');
        themeToggleLightIcon.classList.toggle('hidden');
    });

    // 2. 处理文件上传
    async function handleFile(file) {
        if (!file || !file.type.startsWith('image/')) return;

        // 重置状态
        translationCache = {}; 
        currentFileId = `${file.name}_${file.size}_${file.lastModified}`;
        langText.innerText = "切换至英文";
        
        // 预览图片
        const reader = new FileReader();
        reader.onload = (e) => {
            previewImage.src = e.target.result;
            previewContainer.classList.remove('hidden');
        };
        reader.readAsDataURL(file);

        // UI 反馈
        resultContent.innerHTML = '<div class="text-blue-500 italic text-center py-20 flex flex-col items-center gap-3"><div class="animate-spin rounded-full h-8 w-8 border-4 border-blue-600 border-t-transparent"></div>正在识别病例文字...</div>';
        statusBar.classList.remove('hidden');
        statusText.innerText = "正在请求 OCR 服务...";

        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await fetch('/ocr', { method: 'POST', body: formData });
            const data = await response.json();

            if (data.success) {
                translationCache[currentFileId + "_zh"] = data.text;
                updateDisplay(data.text);
                statusText.innerText = "识别成功，可点击按钮进行翻译。";
            } else {
                resultContent.innerHTML = `<div class="text-red-500 p-4 bg-red-50 dark:bg-red-950 rounded-lg">错误: ${data.error}</div>`;
                statusText.innerText = "识别失败。";
            }
        } catch (err) {
            resultContent.innerHTML = '<div class="text-red-500 p-4 bg-red-50 dark:bg-red-950 rounded-lg">网络连接失败，请检查 Vercel 部署状态。</div>';
            statusText.innerText = "连接异常。";
        }
    }

    // 3. 翻译逻辑 (即时从 DOM 获取文字)
    langToggleBtn.addEventListener('click', async () => {
        const textToProcess = resultContent.innerText.trim();
        if (!textToProcess || textToProcess.includes("等待识别") || textToProcess.includes("正在重新识图")) {
            alert("请先等待图片识别完成");
            return;
        }

        if (langText.innerText === "切换至英文") {
            const cacheKey = currentFileId + "_en";
            if (translationCache[cacheKey]) {
                updateDisplay(translationCache[cacheKey]);
                langText.innerText = "切换至中文";
            } else {
                statusText.innerText = "正在调用腾讯云翻译...";
                try {
                    const response = await fetch('/translate', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ text: textToProcess, target: 'en' })
                    });
                    const data = await response.json();
                    if (data.success) {
                        translationCache[cacheKey] = data.text;
                        updateDisplay(data.text);
                        langText.innerText = "切换至中文";
                        statusText.innerText = "翻译完成。";
                    } else {
                        alert("翻译失败: " + data.error);
                    }
                } catch (err) {
                    alert("翻译接口异常");
                }
            }
        } else {
            updateDisplay(translationCache[currentFileId + "_zh"] || textToProcess);
            langText.innerText = "切换至英文";
        }
    });

    function updateDisplay(text) {
        resultContent.innerHTML = `<pre class="whitespace-pre-wrap font-sans text-gray-800 dark:text-gray-200 leading-relaxed">${text}</pre>`;
    }

    // 4. 其他交互
    copyBtn.addEventListener('click', () => {
        const text = resultContent.innerText;
        navigator.clipboard.writeText(text).then(() => {
            const old = copyBtn.innerText;
            copyBtn.innerText = "✅ 已复制";
            setTimeout(() => copyBtn.innerText = old, 1500);
        });
    });

    selectFileBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => handleFile(e.target.files[0]));
    dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('bg-blue-50'); });
    dropzone.addEventListener('dragleave', () => { dropzone.classList.remove('bg-blue-50'); });
    dropzone.addEventListener('drop', (e) => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); });
});
